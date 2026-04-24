import {
  ref,
  update,
  get,
} from "firebase/database";
import { db } from "./firebase.mjs";
import { initQuickSearch } from "./quicksearch.mjs";
import { initDynamicBoxFields } from "./boxfields.mjs";
import {
  bindEnterToButton,
  getMissingBoxesMessage,
  getCurrentTimeString,
  parseJsonArray,
  setFeedback,
  sortNumericStrings,
} from "./utils.mjs";
import {
  getBoxesCollectionPath,
  getOfficesCollectionPath,
  requireAuth,
} from "./auth.mjs";
import {
  createDayContext,
  recordWeeklyCheckoutActivity,
} from "./weeklystats.mjs";

const user = await requireAuth();
const boxesCollectionPath = getBoxesCollectionPath(user);
const officesCollectionPath = getOfficesCollectionPath(user);

initQuickSearch(db, user);

const tempoutInput = document.getElementById("tempout");
const officeOutInput = document.getElementById("outoffnum");
const boxesContainer = document.getElementById("boxesContainer");
const addBoxButton = document.getElementById("addBoxfield");
const submitButton = document.getElementById("boxoutbtn");
const feedbackElement = document.getElementById("feedback");
const scanModeToggleButton = document.getElementById("scanModeToggle");
const checkoutWarningPopup = document.getElementById("checkoutWarningPopup");
const checkoutWarningTitle = document.getElementById("checkoutWarningTitle");
const checkoutWarningCopy = document.getElementById("checkoutWarningCopy");
const confirmCheckoutWarningButton = document.getElementById(
  "confirmCheckoutWarningBtn"
);
const SCAN_KEY_INTERVAL_MS = 50;
const SCAN_IDLE_TIMEOUT_MS = 120;
const MIN_SCAN_LENGTH = 3;
const MIN_UNFOCUSED_SCAN_LENGTH = 1;
const OFFICE_WARNING_THRESHOLD = 5;

let scanBuffer = "";
let lastScanKeyTime = 0;
let scannerInProgress = false;
let scanModeEnabled = false;
let rapidKeyCount = 0;
let scanFinalizeTimeoutId = null;
let editableScanTarget = null;
let editableScanStartValue = "";
let editableScanSelectionStart = null;
let editableScanSelectionEnd = null;
let pendingCheckoutRequest = null;
let lastFocusedElement = null;
let isSubmittingCheckout = false;

const boxFields = initDynamicBoxFields(boxesContainer, addBoxButton);

renderScanModeToggle();
bindEnterToButton(submitButton);

scanModeToggleButton?.addEventListener("click", () => {
  scanModeEnabled = !scanModeEnabled;
  if (scanModeEnabled) {
    blurActiveEditableElement();
  }
  resetScanState();
  renderScanModeToggle();
});

function setCheckoutWarningPopupOpenState(isOpen) {
  checkoutWarningPopup?.classList.toggle("alert-popup-visible", isOpen);
  document.body.classList.toggle("popup-open", isOpen);
}

function closeCheckoutWarningPopup() {
  if (isSubmittingCheckout) {
    return;
  }

  pendingCheckoutRequest = null;
  setCheckoutWarningPopupOpenState(false);

  if (lastFocusedElement instanceof HTMLElement) {
    lastFocusedElement.focus();
  }
}

function openCheckoutWarningPopup({ officeNumber, currentCount, request }) {
  lastFocusedElement = document.activeElement;
  pendingCheckoutRequest = request;

  if (checkoutWarningTitle) {
    checkoutWarningTitle.textContent = `Office ${officeNumber} already has ${currentCount} item${currentCount === 1 ? "" : "s"}`;
  }

  if (checkoutWarningCopy) {
    checkoutWarningCopy.textContent = `Office ${officeNumber} already has ${currentCount} item${currentCount === 1 ? "" : "s"} in its possession. Do you want to continue booking more items out?`;
  }

  setCheckoutWarningPopupOpenState(true);
}

function getCheckoutRequest() {
  return {
    tempout: tempoutInput.value.trim(),
    officeNumber: officeOutInput.value.trim(),
    boxIDs: boxFields.getValues(),
  };
}

async function performCheckout({ tempout, officeNumber, boxIDs, officeSnapshot }) {
  if (isSubmittingCheckout) {
    return;
  }

  isSubmittingCheckout = true;
  submitButton.disabled = true;
  if (confirmCheckoutWarningButton) {
    confirmCheckoutWarningButton.disabled = true;
    confirmCheckoutWarningButton.textContent = "Booking...";
  }

  try {
    const occurredAt = new Date();
    const currentTime = getCurrentTimeString(occurredAt);
    const dayContext = createDayContext(occurredAt);
    const newOfficeSnapshot =
      officeSnapshot ||
      (await get(ref(db, `${officesCollectionPath}/${officeNumber}`)));

    if (!newOfficeSnapshot.exists()) {
      setFeedback(
        feedbackElement,
        `Office ${officeNumber} does not exist in the database.`,
        { error: true }
      );
      return;
    }

    const officeCurrent = parseJsonArray(
      newOfficeSnapshot.val().officecurrent
    );
    const officeHistory = parseJsonArray(
      newOfficeSnapshot.val().officehistory
    );

    const boxSnapshots = await Promise.all(
      boxIDs.map((boxID) => get(ref(db, `${boxesCollectionPath}/${boxID}`)))
    );

    const validBoxes = [];
    const validBoxEntries = [];
    const missingBoxes = [];
    const previousOffices = new Set();
    const updates = {};

    boxSnapshots.forEach((snapshot, index) => {
      const boxID = boxIDs[index];

      if (!snapshot.exists()) {
        missingBoxes.push(boxID);
        return;
      }

      const boxData = snapshot.val();
      validBoxEntries.push({ boxId: boxID, boxData });
      const history = parseJsonArray(boxData.boxhistory);
      history.push({
        office: officeNumber,
        time: currentTime,
        name: tempout,
        date: dayContext.dateKey,
        dayLabel: dayContext.dayLabel,
        timestamp: dayContext.isoStamp,
      });

      validBoxes.push(boxID);

      if (
        boxData.boxoffice &&
        String(boxData.boxoffice).toLowerCase() !== "in safe" &&
        String(boxData.boxoffice) !== officeNumber
      ) {
        previousOffices.add(String(boxData.boxoffice));
      }

      updates[`${boxesCollectionPath}/${boxID}/boxhistory`] = JSON.stringify(history);
      updates[`${boxesCollectionPath}/${boxID}/boxoffice`] = officeNumber;
      updates[`${boxesCollectionPath}/${boxID}/boxtempout`] = tempout;
      updates[`${boxesCollectionPath}/${boxID}/boxtimeout`] = currentTime;
      updates[`${boxesCollectionPath}/${boxID}/boxtimeoutAt`] = dayContext.isoStamp;
      updates[`${boxesCollectionPath}/${boxID}/boxtimeoutDate`] = dayContext.dateKey;
      updates[`${boxesCollectionPath}/${boxID}/boxtimeoutDayLabel`] = dayContext.dayLabel;
    });

    if (!validBoxes.length) {
      setFeedback(
        feedbackElement,
        getMissingBoxesMessage(missingBoxes, boxIDs.length),
        { error: true }
      );
      return;
    }

    const officeRefs = [
      ...[...previousOffices].map((officeID) =>
        get(ref(db, `${officesCollectionPath}/${officeID}`))
      ),
    ];
    const previousOfficeSnapshots = await Promise.all(officeRefs);

    validBoxes.forEach((boxID) => {
      if (!officeCurrent.includes(boxID)) {
        officeCurrent.push(boxID);
      }

      officeHistory.push({
        box: boxID,
        time: currentTime,
        date: dayContext.dateKey,
        dayLabel: dayContext.dayLabel,
        timestamp: dayContext.isoStamp,
      });
    });

    updates[`${officesCollectionPath}/${officeNumber}/officecurrent`] = JSON.stringify(
      officeCurrent
    );
    updates[`${officesCollectionPath}/${officeNumber}/officehistory`] = JSON.stringify(
      officeHistory
    );
    updates[`${officesCollectionPath}/${officeNumber}/officenum`] = officeNumber;

    const previousOfficeIds = [...previousOffices];
    previousOfficeSnapshots.forEach((snapshot, index) => {
      if (!snapshot.exists()) return;

      const officeID = previousOfficeIds[index];
      const officeData = snapshot.val();
      const filteredCurrent = parseJsonArray(officeData.officecurrent).filter(
        (boxID) => !validBoxes.includes(boxID)
      );

      updates[`${officesCollectionPath}/${officeID}/officecurrent`] = JSON.stringify(
        filteredCurrent
      );
    });

    await update(ref(db), updates);

    try {
      await recordWeeklyCheckoutActivity({
        user,
        boxIds: validBoxes,
        boxEntries: validBoxEntries,
        officeNumber,
        checkedOutBy: tempout,
        occurredAt,
      });
    } catch (weeklyStatsError) {
      console.error("Weekly checkout tracking failed.", weeklyStatsError);
    }

    const checkedOutBoxes = sortNumericStrings(validBoxes).join(", ");
    const missingMessage = getMissingBoxesMessage(missingBoxes, boxIDs.length);

    setFeedback(
      feedbackElement,
      `Successfully booked out item${validBoxes.length === 1 ? "" : "s"} ${checkedOutBoxes} to Office ${officeNumber}!${missingMessage}`,
      { success: true }
    );

    officeOutInput.value = "";
    boxFields.clear();
  } catch (error) {
    setFeedback(
      feedbackElement,
      "Could not check out items. Please try again.",
      { error: true }
    );
  } finally {
    isSubmittingCheckout = false;
    submitButton.disabled = false;
    if (confirmCheckoutWarningButton) {
      confirmCheckoutWarningButton.disabled = false;
      confirmCheckoutWarningButton.textContent = "Continue";
    }
  }
}

async function startCheckout() {
  if (isSubmittingCheckout) {
    return;
  }

  const request = getCheckoutRequest();
  const { officeNumber, boxIDs } = request;

  if (!officeNumber) {
    setFeedback(feedbackElement, "Please enter the office number first.", {
      error: true,
    });
    return;
  }

  if (!boxIDs.length) {
    setFeedback(feedbackElement, "Please enter at least one item.", {
      error: true,
    });
    return;
  }

  try {
    const officeSnapshot = await get(ref(db, `${officesCollectionPath}/${officeNumber}`));

    if (!officeSnapshot.exists()) {
      setFeedback(
        feedbackElement,
        `Office ${officeNumber} does not exist in the database.`,
        { error: true }
      );
      return;
    }

    const officeCurrent = parseJsonArray(officeSnapshot.val().officecurrent);
    if (officeCurrent.length >= OFFICE_WARNING_THRESHOLD) {
      openCheckoutWarningPopup({
        officeNumber,
        currentCount: officeCurrent.length,
        request,
      });
      return;
    }

    await performCheckout({ ...request, officeSnapshot });
  } catch (error) {
    setFeedback(
      feedbackElement,
      "Could not check out items. Please try again.",
      { error: true }
    );
  }
}

submitButton.addEventListener("click", startCheckout);

confirmCheckoutWarningButton?.addEventListener("click", async () => {
  if (!pendingCheckoutRequest) {
    closeCheckoutWarningPopup();
    return;
  }

  const request = pendingCheckoutRequest;
  setCheckoutWarningPopupOpenState(false);
  pendingCheckoutRequest = null;
  await performCheckout(request);
});

checkoutWarningPopup?.addEventListener("click", (event) => {
  if (event.target.closest("[data-checkout-warning-close]")) {
    closeCheckoutWarningPopup();
  }
});

document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    checkoutWarningPopup?.classList.contains("alert-popup-visible")
  ) {
    closeCheckoutWarningPopup();
  }

  if (
    (event.key === "Enter" || event.key === "NumpadEnter") &&
    checkoutWarningPopup?.classList.contains("alert-popup-visible") &&
    !event.defaultPrevented
  ) {
    event.preventDefault();
    confirmCheckoutWarningButton?.click();
  }
});

function normalizeScannedValue(value) {
  const trimmedValue = String(value || "").trim();
  if (!trimmedValue) return "";

  const numericSegments = trimmedValue.match(/\d+/g);
  if (numericSegments?.length) {
    return numericSegments.sort((a, b) => b.length - a.length)[0];
  }

  return trimmedValue.replace(/[^a-zA-Z0-9._-]/g, "");
}

function getEditableScanTarget(target) {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return target;
  }

  return null;
}

function rememberEditableScanTarget(target) {
  if (!target || editableScanTarget === target) return;

  editableScanTarget = target;
  editableScanStartValue = target.value;
  editableScanSelectionStart = target.selectionStart;
  editableScanSelectionEnd = target.selectionEnd;
}

function restoreEditableScanTarget() {
  if (!editableScanTarget || !editableScanTarget.isConnected) return;

  editableScanTarget.value = editableScanStartValue;
  if (
    typeof editableScanSelectionStart === "number" &&
    typeof editableScanSelectionEnd === "number"
  ) {
    editableScanTarget.setSelectionRange(
      editableScanSelectionStart,
      editableScanSelectionEnd
    );
  }
}

function resetScanState() {
  clearScanFinalizeTimeout();
  scanBuffer = "";
  lastScanKeyTime = 0;
  rapidKeyCount = 0;
  editableScanTarget = null;
  editableScanStartValue = "";
  editableScanSelectionStart = null;
  editableScanSelectionEnd = null;
}

function blurActiveEditableElement() {
  const activeElement = document.activeElement;
  if (
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLSelectElement
  ) {
    activeElement.blur();
  }
}

function clearScanFinalizeTimeout() {
  if (scanFinalizeTimeoutId === null) return;

  window.clearTimeout(scanFinalizeTimeoutId);
  scanFinalizeTimeoutId = null;
}

function canFinalizeBufferedScan(allowSingleCharacter = false) {
  if (scanBuffer.length >= MIN_SCAN_LENGTH) {
    return true;
  }

  if (allowSingleCharacter) {
    return scanBuffer.length >= MIN_UNFOCUSED_SCAN_LENGTH;
  }

  return !editableScanTarget && scanBuffer.length >= MIN_UNFOCUSED_SCAN_LENGTH;
}

function finalizeBufferedScan(allowSingleCharacter = false) {
  if (scannerInProgress || !canFinalizeBufferedScan(allowSingleCharacter)) {
    resetScanState();
    return;
  }

  const bufferedValue = scanBuffer;
  restoreEditableScanTarget();
  resetScanState();
  scannerInProgress = true;

  try {
    handleScannedBox(bufferedValue);
  } finally {
    scannerInProgress = false;
  }
}

function scheduleBufferedScanFinalization() {
  clearScanFinalizeTimeout();

  if (!canFinalizeBufferedScan()) {
    return;
  }

  scanFinalizeTimeoutId = window.setTimeout(() => {
    scanFinalizeTimeoutId = null;
    finalizeBufferedScan();
  }, SCAN_IDLE_TIMEOUT_MS);
}

function hasPendingScanSequence() {
  if (!scanBuffer.length) {
    return false;
  }

  if (scanFinalizeTimeoutId !== null) {
    return true;
  }

  return Date.now() - lastScanKeyTime <= SCAN_KEY_INTERVAL_MS;
}

function renderScanModeToggle() {
  if (!scanModeToggleButton) return;

  scanModeToggleButton.textContent = scanModeEnabled ? "SCAN: ON" : "SCAN: OFF";
  scanModeToggleButton.setAttribute("aria-pressed", String(scanModeEnabled));
  scanModeToggleButton.classList.toggle("is-active", scanModeEnabled);
}

function handleScannedBox(rawValue) {
  const scannedBoxId = normalizeScannedValue(rawValue);

  if (!scannedBoxId) {
    setFeedback(feedbackElement, "Scanned barcode did not contain a valid item number.", {
      error: true,
    });
    return;
  }

  boxFields.addValue(scannedBoxId, { focus: false });
}

document.addEventListener(
  "keydown",
  (event) => {
    if (!scanModeEnabled) return;
    if (event.defaultPrevented || scannerInProgress) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const currentTime = Date.now();
    const isRapidInput =
      currentTime - lastScanKeyTime <= SCAN_KEY_INTERVAL_MS;
    const editableTarget = getEditableScanTarget(event.target);

    if (event.key === "Enter" || event.key === "NumpadEnter") {
      if (hasPendingScanSequence()) {
        event.preventDefault();
        event.stopPropagation();
        finalizeBufferedScan(true);
      }

      return;
    }

    if (event.key.length !== 1) {
      return;
    }

    if (!isRapidInput) {
      resetScanState();
    }

    if (editableTarget) {
      rememberEditableScanTarget(editableTarget);
    }

    rapidKeyCount = isRapidInput ? rapidKeyCount + 1 : 1;
    scanBuffer += event.key;
    lastScanKeyTime = currentTime;
    scheduleBufferedScanFinalization();

    if (editableTarget && rapidKeyCount >= MIN_SCAN_LENGTH) {
      event.preventDefault();
      event.stopPropagation();
      restoreEditableScanTarget();
    }
  },
  true
);
