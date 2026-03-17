import {
  ref,
  update,
  get,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { db } from "./firebase.mjs";
import { initQuickSearch } from "./quicksearch.mjs";
import { bindEnterToButton, setFeedback } from "./utils.mjs";

initQuickSearch(db);

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
      get(ref(db, "boxes")),
      get(ref(db, "offices")),
    ]);

    const updates = {};

    if (boxesSnapshot.exists()) {
      const boxes = boxesSnapshot.val();

      Object.keys(boxes).forEach((boxID) => {
        updates[`boxes/${boxID}/boxhistory`] = "[]";
        updates[`boxes/${boxID}/boxoffice`] = "In Safe";
        updates[`boxes/${boxID}/boxtimeout`] = "";
        updates[`boxes/${boxID}/boxtimein`] = "";
        updates[`boxes/${boxID}/boxtempout`] = "";
        updates[`boxes/${boxID}/boxtempin`] = "";
      });
    }

    if (officesSnapshot.exists()) {
      const offices = officesSnapshot.val();

      Object.keys(offices).forEach((officeID) => {
        if (officeID === "officecurrent") return;
        updates[`offices/${officeID}/officehistory`] = "[]";
        updates[`offices/${officeID}/officecurrent`] = "[]";
      });
    }

    await update(ref(db), updates);
    setFeedback(feedbackElement, "All data has been reset successfully!");
  } catch (error) {
    console.error("Error resetting data:", error);
    setFeedback(feedbackElement, "Error resetting data. Please try again.", {
      error: true,
    });
  }
});
