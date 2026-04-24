import {
  ref,
  update,
} from "firebase/database";
import { db } from "./firebase.mjs";
import { initQuickSearch } from "./quicksearch.mjs";
import { bindEnterToButton, setFeedback } from "./utils.mjs";
import {
  getActiveWeeklyMovementsPath,
  getWeeklyStatsCollectionPath,
  requireAuth,
} from "./auth.mjs";

const user = await requireAuth();
const weeklyStatsCollectionPath = getWeeklyStatsCollectionPath(user);
const activeWeeklyMovementsPath = getActiveWeeklyMovementsPath(user);

initQuickSearch(db, user);

const resetButton = document.getElementById("resetbtn");
const feedbackElement = document.getElementById("feedback");
const resetConfirmPopup = document.getElementById("resetConfirmPopup");
const resetConfirmCard = resetConfirmPopup?.querySelector(".reset-confirm-card");
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
  resetConfirmCard?.focus();
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
    const updates = {};
    updates[weeklyStatsCollectionPath] = null;
    updates[activeWeeklyMovementsPath] = null;

    await update(ref(db), updates);
    setFeedback(feedbackElement, "Weekly data has been reset successfully!", {
      success: true,
    });
    shouldClosePopup = true;
  } catch (error) {
    setFeedback(feedbackElement, "Error resetting weekly data. Please try again.", {
      error: true,
    });
  } finally {
    isResetting = false;
    resetButton.disabled = false;
    confirmResetButton.disabled = false;
    confirmResetButton.textContent = "Reset Weekly Data";

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
