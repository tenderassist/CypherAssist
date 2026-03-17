import {
  ref,
  set,
  remove,
  get,
  onValue,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { db } from "./firebase.mjs";
import { initQuickSearch } from "./quicksearch.mjs";
import {
  bindEnterToButton,
  renderStatusCollection,
  setFeedback,
  sortNumericStrings,
} from "./utils.mjs";

initQuickSearch(db);

const officesRef = ref(db, "offices");
const officeListElement = document.getElementById("officelist");
const actionSelect = document.getElementById("adddeloffice");
const numberInput = document.getElementById("adddeloffnum");
const feedbackElement = document.getElementById("feedback");
const submitButton = document.getElementById("adddeloffbtn");

onValue(officesRef, (snapshot) => {
  const offices = snapshot.exists() ? snapshot.val() : {};
  const officeNumbers = sortNumericStrings(
    Object.keys(offices).filter((officeKey) => officeKey !== "officecurrent")
  );

  renderStatusCollection(officeListElement, {
    title: "Active Offices",
    items: officeNumbers,
    emptyText: "No offices available.",
  });
});

bindEnterToButton(submitButton);

submitButton.addEventListener("click", async () => {
  const action = actionSelect.value;
  const officeID = numberInput.value.trim();

  if (action !== "add" && action !== "delete") {
    setFeedback(feedbackElement, "Please select an action first.", {
      error: true,
    });
    return;
  }

  if (!officeID) {
    setFeedback(feedbackElement, "Please enter an office number.", {
      error: true,
    });
    return;
  }

  const officeRef = ref(db, `offices/${officeID}`);

  try {
    const snapshot = await get(officeRef);

    if (action === "add") {
      if (snapshot.exists()) {
        setFeedback(
          feedbackElement,
          `Office ${officeID} already exists in the database.`,
          { error: true }
        );
        return;
      }

      await set(officeRef, {
        officenum: officeID,
        officecurrent: "[]",
        officehistory: "[]",
      });

      numberInput.value = "";
      setFeedback(feedbackElement, `Successfully ADDED Office ${officeID}!`);
      return;
    }

    if (!snapshot.exists()) {
      setFeedback(feedbackElement, `Office ${officeID} was not found.`, {
        error: true,
      });
      return;
    }

    await remove(officeRef);
    numberInput.value = "";
    setFeedback(feedbackElement, `Successfully DELETED Office ${officeID}!`);
  } catch (error) {
    console.error("Error updating offices:", error);
    setFeedback(
      feedbackElement,
      "Could not update offices. Please try again.",
      { error: true }
    );
  }
});
