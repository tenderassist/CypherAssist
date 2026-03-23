import {
  ref,
  set,
  remove,
  get,
  onValue,
} from "firebase/database";
import { db } from "./firebase.mjs";
import { initQuickSearch } from "./quicksearch.mjs";
import { initCustomSelect } from "./customselect.mjs";
import {
  bindEnterToButton,
  renderStatusCollection,
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

const officesRef = ref(db, officesCollectionPath);
const officeListElement = document.getElementById("officelist");
const actionSelect = document.getElementById("adddeloffice");
const numberInput = document.getElementById("adddeloffnum");
const feedbackElement = document.getElementById("feedback");
const submitButton = document.getElementById("adddeloffbtn");
const boxesRef = ref(db, boxesCollectionPath);

initCustomSelect(actionSelect);

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

  const officeRef = ref(db, `${officesCollectionPath}/${officeID}`);

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
      setFeedback(feedbackElement, `Successfully ADDED Office ${officeID}!`, {
        success: true,
      });
      return;
    }

    if (!snapshot.exists()) {
      setFeedback(feedbackElement, `Office ${officeID} was not found.`, {
        error: true,
      });
      return;
    }

    const boxesSnapshot = await get(boxesRef);
    const activeBoxes = boxesSnapshot.exists()
      ? Object.entries(boxesSnapshot.val()).filter(([, boxData]) => {
          return String(boxData?.boxoffice) === officeID;
        })
      : [];

    if (activeBoxes.length) {
      const activeBoxList = sortNumericStrings(activeBoxes.map(([boxID]) => boxID)).join(", ");
      setFeedback(
        feedbackElement,
        `Office ${officeID} still has active items assigned: ${activeBoxList}. Check them in or move them before deleting the office.`,
        { error: true }
      );
      return;
    }

    await remove(officeRef);
    numberInput.value = "";
    setFeedback(feedbackElement, `Successfully DELETED Office ${officeID}!`, {
      success: true,
    });
  } catch (error) {
    setFeedback(
      feedbackElement,
      "Could not update offices. Please try again.",
      { error: true }
    );
  }
});
