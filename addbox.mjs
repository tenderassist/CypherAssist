import {
  ref,
  set,
  remove,
  get,
  onValue,
} from "firebase/database";
import { db } from "./firebase.mjs";
import { initQuickSearch } from "./quicksearch.mjs";
import {
  bindEnterToButton,
  renderStatusCollection,
  setFeedback,
  sortNumericStrings,
} from "./utils.mjs";

initQuickSearch(db);

const boxesRef = ref(db, "boxes");
const boxListElement = document.getElementById("boxlist");
const actionSelect = document.getElementById("adddelbox");
const numberInput = document.getElementById("adddelboxnum");
const feedbackElement = document.getElementById("feedback");
const submitButton = document.getElementById("adddelbtn");

onValue(boxesRef, (snapshot) => {
  const boxes = snapshot.exists() ? snapshot.val() : {};
  const boxNumbers = sortNumericStrings(Object.keys(boxes));

  renderStatusCollection(boxListElement, {
    title: "Active Boxes",
    items: boxNumbers,
    emptyText: "No boxes available.",
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
    setFeedback(feedbackElement, "Please enter a box or special number.", {
      error: true,
    });
    return;
  }

  const boxRef = ref(db, `boxes/${boxID}`);

  try {
    const snapshot = await get(boxRef);

    if (action === "add") {
      if (snapshot.exists()) {
        setFeedback(
          feedbackElement,
          `Box/Special ${boxID} already exists in the database.`,
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
        `Successfully ADDED Box/Special ${boxID}!`
      );
      return;
    }

    if (!snapshot.exists()) {
      setFeedback(feedbackElement, `Box/Special ${boxID} was not found.`, {
        error: true,
      });
      return;
    }

    await remove(boxRef);
    numberInput.value = "";
    setFeedback(feedbackElement, `Successfully DELETED Box/Special ${boxID}!`);
  } catch (error) {
    console.error("Error updating boxes:", error);
    setFeedback(feedbackElement, "Could not update boxes. Please try again.", {
      error: true,
    });
  }
});
