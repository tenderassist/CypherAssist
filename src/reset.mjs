import "./styles.css";

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import {
  getDatabase,
  ref,
  push,
  set,
  once,
  on,
  update,
  remove,
  get,
} from "firebase/database";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBz3oFrTOiEjWTaF8gXc3XmnBi0Pq4Ydl0",
  authDomain: "cypher-78cee.firebaseapp.com",
  databaseURL:
    "https://cypher-78cee-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cypher-78cee",
  storageBucket: "cypher-78cee.appspot.com",
  messagingSenderId: "501364339895",
  appId: "1:501364339895:web:cb26fb5fd8f2efd529c932",
  measurementId: "G-4GY43CMYZS",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getDatabase(app);

//----------------------------------------------------------------------------------------------
//THIS SPACE IS FOR THE SEARCH BAR
const quicksearchInput = document.getElementById("quicksearch");
const resultDiv = document.getElementById("quicksearchResult");

quicksearchInput.addEventListener("input", function () {
  const quickboxID = quicksearchInput.value.trim();

  if (quickboxID === "") {
    resultDiv.innerText = "";
    resultDiv.classList.remove("active", "error"); // Hide result when input is empty
    return;
  }

  const quickboxRef = ref(db, `boxes/${quickboxID}`);

  get(quickboxRef)
    .then((snapshot) => {
      if (snapshot.exists()) {
        const quickboxData = snapshot.val();
        const quickoffice = quickboxData.boxoffice || "No office assigned";

        resultDiv.innerText = `${quickboxID} is in Office: ${quickoffice}`;
        resultDiv.classList.add("active");
        resultDiv.classList.remove("error"); // Remove error style
      } else {
        resultDiv.innerText = "Box not found in database.";
        resultDiv.classList.add("active", "error"); // Add error style
      }
    })
    .catch((error) => {
      console.error("Error fetching data:", error);
      resultDiv.innerText = "Error retrieving data.";
      resultDiv.classList.add("active", "error");
    });
});
//----------------------------------------------------------------------------------------------
const resetButton = document.getElementById("resetbtn");

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") document.getElementById("resetbtn").click();
});

resetButton.addEventListener("click", async function () {
  if (
    !confirm("Are you sure you want to reset all data? This cannot be undone.")
  ) {
    return;
  }

  try {
    // Fetch all boxes
    const boxesRef = ref(db, "boxes");
    const boxesSnapshot = await get(boxesRef);
    let boxUpdates = {};

    if (boxesSnapshot.exists()) {
      const boxes = boxesSnapshot.val();
      Object.keys(boxes).forEach((boxID) => {
        boxUpdates[`boxes/${boxID}/boxhistory`] = "[]"; // Clear history
        boxUpdates[`boxes/${boxID}/boxoffice`] = ""; // Remove current office
        boxUpdates[`boxes/${boxID}/boxtimeout`] = ""; // Clear time out
        boxUpdates[`boxes/${boxID}/boxtimein`] = ""; // Clear time in
        boxUpdates[`boxes/${boxID}/boxtempout`] = ""; // Clear temp out
        boxUpdates[`boxes/${boxID}/boxtempin`] = ""; // Clear temp in
      });
    }

    // Fetch all offices
    const officesRef = ref(db, "offices");
    const officesSnapshot = await get(officesRef);
    let officeUpdates = {};

    if (officesSnapshot.exists()) {
      const offices = officesSnapshot.val();
      Object.keys(offices).forEach((officeID) => {
        officeUpdates[`offices/${officeID}/officehistory`] = "[]"; // Clear office history
        officeUpdates[`offices/${officeID}/officecurrent`] = "[]"; // Remove boxes currently in office
      });
    }

    // Apply all updates in a single batch
    await update(ref(db), { ...boxUpdates, ...officeUpdates });

    document.getElementById(
      "feedback"
    ).innerText = `All data has been reset successfully!`;
  } catch (error) {
    console.error("Error resetting data:", error);
    document.getElementById(
      "feedback"
    ).innerText = `Error resetting data. Please try again.`;
  }
});
