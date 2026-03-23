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
  requireAuth,
} from "./auth.mjs";

const user = await requireAuth();
const boxesCollectionPath = getBoxesCollectionPath(user);

initQuickSearch(db, user);

const boxesRef = ref(db, boxesCollectionPath);
const boxListElement = document.getElementById("boxlist");
const actionSelect = document.getElementById("adddelbox");
const numberInput = document.getElementById("adddelboxnum");
const feedbackElement = document.getElementById("feedback");
const submitButton = document.getElementById("adddelbtn");

initCustomSelect(actionSelect);

onValue(boxesRef, (snapshot) => {
  const boxes = snapshot.exists() ? snapshot.val() : {};
  const boxNumbers = sortNumericStrings(Object.keys(boxes));

  renderStatusCollection(boxListElement, {
    title: "Active Items",
    items: boxNumbers,
    emptyText: "No items available.",
  });
});

bindEnterToButton(submitButton);

submitButton.addEventListener("click", async () => {
  const action = actionSelect.value;
  const boxID = numberInput.value.trim();

  if (action !== "add" && action !== "delete") {
    setFeedback(feedbackElement, "Please select an action first.", {
      error: true,
    });
    return;
  }

  if (!boxID) {
    setFeedback(feedbackElement, "Please enter an item number.", {
      error: true,
    });
    return;
  }

  const boxRef = ref(db, `${boxesCollectionPath}/${boxID}`);

  try {
    const snapshot = await get(boxRef);

    if (action === "add") {
      if (snapshot.exists()) {
        setFeedback(
          feedbackElement,
          `Item ${boxID} already exists in the database.`,
          { error: true }
        );
        return;
      }

      await set(boxRef, {
        boxnum: boxID,
        boxoffice: "In Safe",
        boxtimeout: "",
        boxtimein: "",
        boxtempout: "",
        boxtempin: "",
        boxhistory: "[]",
      });

      numberInput.value = "";
      setFeedback(
        feedbackElement,
        `Successfully ADDED Item ${boxID}!`,
        { success: true }
      );
      return;
    }

    if (!snapshot.exists()) {
      setFeedback(feedbackElement, `Item ${boxID} was not found.`, {
        error: true,
      });
      return;
    }

    const boxData = snapshot.val();
    if (String(boxData?.boxoffice || "In Safe").toLowerCase() !== "in safe") {
      setFeedback(
        feedbackElement,
        `Item ${boxID} is still booked out to Office ${boxData.boxoffice}. Check it in before deleting it.`,
        { error: true }
      );
      return;
    }

    await remove(boxRef);
    numberInput.value = "";
    setFeedback(feedbackElement, `Successfully DELETED Item ${boxID}!`, {
      success: true,
    });
  } catch (error) {
    setFeedback(feedbackElement, "Could not update items. Please try again.", {
      error: true,
    });
  }
});
