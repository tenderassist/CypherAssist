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

const user = await requireAuth();
const boxesCollectionPath = getBoxesCollectionPath(user);
const officesCollectionPath = getOfficesCollectionPath(user);

initQuickSearch(db, user);

const tempinInput = document.getElementById("tempin");
const boxesContainer = document.getElementById("boxesContainer");
const addBoxButton = document.getElementById("addBoxfield");
const submitButton = document.getElementById("boxinbtn");
const feedbackElement = document.getElementById("feedback");
const SCAN_KEY_INTERVAL_MS = 50;
const MIN_SCAN_LENGTH = 3;

let scanBuffer = "";
let lastScanKeyTime = 0;
let scannerInProgress = false;
let rapidKeyCount = 0;
let editableScanTarget = null;
let editableScanStartValue = "";
let editableScanSelectionStart = null;
let editableScanSelectionEnd = null;

const boxFields = initDynamicBoxFields(boxesContainer, addBoxButton);

bindEnterToButton(submitButton);

async function checkInBoxes(boxIDs, tempin = tempinInput.value.trim()) {
  if (!boxIDs.length) {
    setFeedback(feedbackElement, "Please enter at least one box.", {
      error: true,
    });
    return false;
  }

  try {
    const boxSnapshots = await Promise.all(
      boxIDs.map((boxID) => get(ref(db, `${boxesCollectionPath}/${boxID}`)))
    );

    const validBoxes = [];
    const missingBoxes = [];
    const previousOffices = new Set();
    const updates = {};
    const currentTime = getCurrentTimeString();

    boxSnapshots.forEach((snapshot, index) => {
      const boxID = boxIDs[index];

      if (!snapshot.exists()) {
        missingBoxes.push(boxID);
        return;
      }

      const boxData = snapshot.val();
      validBoxes.push(boxID);

      if (
        boxData.boxoffice &&
        String(boxData.boxoffice).toLowerCase() !== "in safe"
      ) {
        previousOffices.add(String(boxData.boxoffice));
      }

      updates[`${boxesCollectionPath}/${boxID}/boxtempin`] = tempin;
      updates[`${boxesCollectionPath}/${boxID}/boxtimein`] = currentTime;
      updates[`${boxesCollectionPath}/${boxID}/boxoffice`] = "In Safe";
    });

    if (!validBoxes.length) {
      setFeedback(
        feedbackElement,
        getMissingBoxesMessage(missingBoxes, boxIDs.length),
        { error: true }
      );
      return false;
    }

    const previousOfficeIds = [...previousOffices];
    const previousOfficeSnapshots = await Promise.all(
      previousOfficeIds.map((officeID) =>
        get(ref(db, `${officesCollectionPath}/${officeID}`))
      )
    );

    previousOfficeSnapshots.forEach((snapshot, index) => {
      if (!snapshot.exists()) return;

      const officeID = previousOfficeIds[index];
      const officeData = snapshot.val();
      const officeCurrent = parseJsonArray(officeData.officecurrent).filter(
        (boxID) => !validBoxes.includes(boxID)
      );

      updates[`${officesCollectionPath}/${officeID}/officecurrent`] = JSON.stringify(
        officeCurrent
      );
    });

    await update(ref(db), updates);

    const checkedInBoxes = sortNumericStrings(validBoxes).join(", ");
    const missingMessage = getMissingBoxesMessage(missingBoxes, boxIDs.length);

    setFeedback(
      feedbackElement,
      `Successfully checked in ${checkedInBoxes}!${missingMessage}`,
      { success: true }
    );

    boxFields.clear();
    return true;
  } catch (error) {
    console.error("Error checking boxes in:", error);
    setFeedback(feedbackElement, "Could not check in boxes. Please try again.", {
      error: true,
    });
    return false;
  }
}

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
  scanBuffer = "";
  lastScanKeyTime = 0;
  rapidKeyCount = 0;
  editableScanTarget = null;
  editableScanStartValue = "";
  editableScanSelectionStart = null;
  editableScanSelectionEnd = null;
}

async function handleScannedBox(rawValue) {
  const scannedBoxId = normalizeScannedValue(rawValue);

  if (!scannedBoxId) {
    setFeedback(feedbackElement, "Scanned barcode did not contain a valid box number.", {
      error: true,
    });
    return;
  }

  await checkInBoxes([scannedBoxId]);
}

submitButton.addEventListener("click", async () => {
  await checkInBoxes(boxFields.getValues());
});

document.addEventListener(
  "keydown",
  async (event) => {
    if (event.defaultPrevented || scannerInProgress) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const currentTime = Date.now();
    const isRapidInput =
      currentTime - lastScanKeyTime <= SCAN_KEY_INTERVAL_MS;
    const editableTarget = getEditableScanTarget(event.target);

    if (event.key === "Enter" || event.key === "NumpadEnter") {
      if (scanBuffer.length >= MIN_SCAN_LENGTH) {
        event.preventDefault();
        event.stopPropagation();

        const bufferedValue = scanBuffer;
        restoreEditableScanTarget();
        resetScanState();
        scannerInProgress = true;

        try {
          await handleScannedBox(bufferedValue);
        } finally {
          scannerInProgress = false;
        }
      } else {
        resetScanState();
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

    if (editableTarget && rapidKeyCount >= MIN_SCAN_LENGTH) {
      event.preventDefault();
      event.stopPropagation();
      restoreEditableScanTarget();
    }
  },
  true
);
