import {
  ref,
  update,
  get,
} from "firebase/database";
import { db } from "./firebase.mjs";
import { initQuickSearch } from "./quicksearch.mjs";
import { bindEnterToButton, setFeedback } from "./utils.mjs";
import {
  getBoxesCollectionPath,
  getOfficesCollectionPath,
  requireAuth,
} from "./auth.mjs";

const user = await requireAuth();
const boxesCollectionPath = getBoxesCollectionPath(user);
const officesCollectionPath = getOfficesCollectionPath(user);

initQuickSearch(db, user);

const resetButton = document.getElementById("resetbtn");
const feedbackElement = document.getElementById("feedback");
const resetConfirmPopup = document.getElementById("resetConfirmPopup");
const confirmResetButton = document.getElementById("confirmResetBtn");

let lastFocusedElement = null;
let isResetting = false;

bindEnterToButton(resetButton);

function setResetPopupOpenState(isOpen) {
  resetConfirmPopup.classList.toggle("alert-popup-visible", isOpen);
  document.body.classList.toggle("popup-open", isOpen);
}

function closeResetPopup() {
  if (isResetting) {
    return;
  }

  setResetPopupOpenState(false);

  if (lastFocusedElement instanceof HTMLElement) {
    lastFocusedElement.focus();
  }
}

function openResetPopup() {
  if (isResetting) {
    return;
  }

  lastFocusedElement = document.activeElement;
  setResetPopupOpenState(true);
  confirmResetButton.focus();
}

async function performReset() {
  if (isResetting) {
    return;
  }

  let shouldClosePopup = false;

  isResetting = true;
  resetButton.disabled = true;
  confirmResetButton.disabled = true;
  confirmResetButton.textContent = "Resetting...";

  try {
    const [boxesSnapshot, officesSnapshot] = await Promise.all([
      get(ref(db, boxesCollectionPath)),
      get(ref(db, officesCollectionPath)),
    ]);

    const updates = {};

    if (boxesSnapshot.exists()) {
      const boxes = boxesSnapshot.val();

      Object.keys(boxes).forEach((boxID) => {
        updates[`${boxesCollectionPath}/${boxID}/boxhistory`] = "[]";
        updates[`${boxesCollectionPath}/${boxID}/boxoffice`] = "In Safe";
        updates[`${boxesCollectionPath}/${boxID}/boxtimeout`] = "";
        updates[`${boxesCollectionPath}/${boxID}/boxtimein`] = "";
        updates[`${boxesCollectionPath}/${boxID}/boxtempout`] = "";
        updates[`${boxesCollectionPath}/${boxID}/boxtempin`] = "";
      });
    }

    if (officesSnapshot.exists()) {
      const offices = officesSnapshot.val();

      Object.keys(offices).forEach((officeID) => {
        if (officeID === "officecurrent") return;
        updates[`${officesCollectionPath}/${officeID}/officehistory`] = "[]";
        updates[`${officesCollectionPath}/${officeID}/officecurrent`] = "[]";
      });
    }

    await update(ref(db), updates);
    setFeedback(feedbackElement, "All data has been reset successfully!", {
      success: true,
    });
    shouldClosePopup = true;
  } catch (error) {
    setFeedback(feedbackElement, "Error resetting data. Please try again.", {
      error: true,
    });
  } finally {
    isResetting = false;
    resetButton.disabled = false;
    confirmResetButton.disabled = false;
    confirmResetButton.textContent = "Yes, reset everything";

    if (shouldClosePopup) {
      closeResetPopup();
    }
  }
}

resetButton.addEventListener("click", openResetPopup);
confirmResetButton.addEventListener("click", performReset);

resetConfirmPopup.addEventListener("click", (event) => {
  if (event.target.closest("[data-reset-close]")) {
    closeResetPopup();
  }
});

document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    resetConfirmPopup.classList.contains("alert-popup-visible")
  ) {
    closeResetPopup();
  }
});
