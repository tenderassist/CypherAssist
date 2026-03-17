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
  getCurrentTimeString,
  parseJsonArray,
  setFeedback,
  sortNumericStrings,
} from "./utils.mjs";

initQuickSearch(db);

const tempinInput = document.getElementById("tempin");
const boxesContainer = document.getElementById("boxesContainer");
const addBoxButton = document.getElementById("addBoxfield");
const submitButton = document.getElementById("boxinbtn");
const feedbackElement = document.getElementById("feedback");

const boxFields = initDynamicBoxFields(boxesContainer, addBoxButton);

bindEnterToButton(submitButton);

submitButton.addEventListener("click", async () => {
  const tempin = tempinInput.value.trim();
  const boxIDs = boxFields.getValues();

  if (!boxIDs.length) {
    setFeedback(feedbackElement, "Please enter at least one box.", {
      error: true,
    });
    return;
  }

  try {
    const boxSnapshots = await Promise.all(
      boxIDs.map((boxID) => get(ref(db, `boxes/${boxID}`)))
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

      updates[`boxes/${boxID}/boxtempin`] = tempin;
      updates[`boxes/${boxID}/boxtimein`] = currentTime;
      updates[`boxes/${boxID}/boxoffice`] = "In Safe";
    });

    if (!validBoxes.length) {
      setFeedback(
        feedbackElement,
        "None of the entered boxes were found in the database.",
        { error: true }
      );
      return;
    }

    const previousOfficeIds = [...previousOffices];
    const previousOfficeSnapshots = await Promise.all(
      previousOfficeIds.map((officeID) => get(ref(db, `offices/${officeID}`)))
    );

    previousOfficeSnapshots.forEach((snapshot, index) => {
      if (!snapshot.exists()) return;

      const officeID = previousOfficeIds[index];
      const officeData = snapshot.val();
      const officeCurrent = parseJsonArray(officeData.officecurrent).filter(
        (boxID) => !validBoxes.includes(boxID)
      );

      updates[`offices/${officeID}/officecurrent`] = JSON.stringify(
        officeCurrent
      );
    });

    await update(ref(db), updates);

    const checkedInBoxes = sortNumericStrings(validBoxes).join(", ");
    const missingMessage = missingBoxes.length
      ? ` Skipped: ${sortNumericStrings(missingBoxes).join(", ")}.`
      : "";

    setFeedback(
      feedbackElement,
      `Successfully checked in ${checkedInBoxes}!${missingMessage}`
    );

    boxFields.clear();
  } catch (error) {
    console.error("Error checking boxes in:", error);
    setFeedback(feedbackElement, "Could not check in boxes. Please try again.", {
      error: true,
    });
  }
});
