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

bindEnterToButton(resetButton);

resetButton.addEventListener("click", async () => {
  if (
    !confirm("Are you sure you want to reset all data? This cannot be undone.")
  ) {
    return;
  }

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
  } catch (error) {
    console.error("Error resetting data:", error);
    setFeedback(feedbackElement, "Error resetting data. Please try again.", {
      error: true,
    });
  }
});
