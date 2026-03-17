import {
  ref,
  update,
  get,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
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

const tempoutInput = document.getElementById("tempout");
const officeOutInput = document.getElementById("outoffnum");
const boxesContainer = document.getElementById("boxesContainer");
const addBoxButton = document.getElementById("addBoxfield");
const submitButton = document.getElementById("boxoutbtn");
const feedbackElement = document.getElementById("feedback");

const boxFields = initDynamicBoxFields(boxesContainer, addBoxButton);

bindEnterToButton(submitButton);

submitButton.addEventListener("click", async () => {
  const tempout = tempoutInput.value.trim();
  const officeNumber = officeOutInput.value.trim();
  const boxIDs = boxFields.getValues();

  if (!officeNumber) {
    setFeedback(feedbackElement, "Please enter the office number first.", {
      error: true,
    });
    return;
  }

  if (!boxIDs.length) {
    setFeedback(feedbackElement, "Please enter at least one box.", {
      error: true,
    });
    return;
  }

  try {
    const currentTime = getCurrentTimeString();
    const boxSnapshots = await Promise.all(
      boxIDs.map((boxID) => get(ref(db, `boxes/${boxID}`)))
    );

    const validBoxes = [];
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
      const history = parseJsonArray(boxData.boxhistory);
      history.push({ office: officeNumber, time: currentTime });

      validBoxes.push(boxID);

      if (
        boxData.boxoffice &&
        String(boxData.boxoffice).toLowerCase() !== "in safe" &&
        String(boxData.boxoffice) !== officeNumber
      ) {
        previousOffices.add(String(boxData.boxoffice));
      }

      updates[`boxes/${boxID}/boxhistory`] = JSON.stringify(history);
      updates[`boxes/${boxID}/boxoffice`] = officeNumber;
      updates[`boxes/${boxID}/boxtempout`] = tempout;
      updates[`boxes/${boxID}/boxtimeout`] = currentTime;
    });

    if (!validBoxes.length) {
      setFeedback(
        feedbackElement,
        "None of the entered boxes were found in the database.",
        { error: true }
      );
      return;
    }

    const officeRefs = [
      get(ref(db, `offices/${officeNumber}`)),
      ...[...previousOffices].map((officeID) => get(ref(db, `offices/${officeID}`))),
    ];
    const [newOfficeSnapshot, ...previousOfficeSnapshots] = await Promise.all(
      officeRefs
    );

    const officeCurrent = parseJsonArray(
      newOfficeSnapshot.exists() ? newOfficeSnapshot.val().officecurrent : "[]"
    );
    const officeHistory = parseJsonArray(
      newOfficeSnapshot.exists() ? newOfficeSnapshot.val().officehistory : "[]"
    );

    validBoxes.forEach((boxID) => {
      if (!officeCurrent.includes(boxID)) {
        officeCurrent.push(boxID);
      }

      officeHistory.push({ box: boxID, time: currentTime });
    });

    updates[`offices/${officeNumber}/officecurrent`] = JSON.stringify(
      officeCurrent
    );
    updates[`offices/${officeNumber}/officehistory`] = JSON.stringify(
      officeHistory
    );
    updates[`offices/${officeNumber}/officenum`] = officeNumber;

    const previousOfficeIds = [...previousOffices];
    previousOfficeSnapshots.forEach((snapshot, index) => {
      if (!snapshot.exists()) return;

      const officeID = previousOfficeIds[index];
      const officeData = snapshot.val();
      const filteredCurrent = parseJsonArray(officeData.officecurrent).filter(
        (boxID) => !validBoxes.includes(boxID)
      );

      updates[`offices/${officeID}/officecurrent`] = JSON.stringify(
        filteredCurrent
      );
    });

    await update(ref(db), updates);

    const checkedOutBoxes = sortNumericStrings(validBoxes).join(", ");
    const missingMessage = missingBoxes.length
      ? ` Skipped: ${sortNumericStrings(missingBoxes).join(", ")}.`
      : "";

    setFeedback(
      feedbackElement,
      `Successfully checked out ${checkedOutBoxes} to Office ${officeNumber}!${missingMessage}`
    );

    officeOutInput.value = "";
    boxFields.clear();
  } catch (error) {
    console.error("Error checking boxes out:", error);
    setFeedback(
      feedbackElement,
      "Could not check out boxes. Please try again.",
      { error: true }
    );
  }
});
