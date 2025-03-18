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

//SEARCH BAR------------------------------------------------------------------------------------
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
//VARIABLES-------------------------------------------------------------------------------------
const tempoutInput = document.getElementById("tempout");
const officeOutInput = document.getElementById("outoffnum");
const addBoxButton = document.getElementById("addBoxfield"); //for add boxes button
const boxesContainer = document.getElementById("boxesContainer"); //for add boxes button
const submitButton = document.getElementById("boxoutbtn");
let boxCount = 0; //for add boxes button

//ADD BOX BUTTON--------------------------------------------------------------------------------
addBoxButton.addEventListener("click", function () {
  boxCount++;

  //Create new input for a box
  const div = document.createElement("div");
  div.classList.add("box-input");
  div.innerHTML = `
  <br/>
    <input type="text" class="boxNumber" placeholder="e.g. '24'">
    <button class="removeBox">X  </button>
    <br/>
  `;

  boxesContainer.appendChild(div);

  // Remove box input when X is clicked
  div.querySelector(".removeBox").addEventListener("click", function () {
    div.remove();
  });
});
//UPDATING DATABASE------------------------------------------------------------------------------
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") document.getElementById("boxoutbtn").click();
});

submitButton.addEventListener("click", async function () {
  const tempout = tempoutInput.value.trim();
  const officeNumber = officeOutInput.value.trim();
  const boxInputs = document.querySelectorAll(".boxNumber");

  if (officeNumber === "" || boxInputs.length === 0) {
    alert("Please enter the office number and at least one Box.");
    return;
  }

  //Getting the current time
  const now = new Date();
  const currentTime =
    now.getHours().toString().padStart(2, "0") +
    ":" +
    now.getMinutes().toString().padStart(2, "0");

  //Getting all boxes IDs
  const boxIDs = Array.from(boxInputs)
    .map((input) => input.value.trim())
    .filter((boxID) => boxID !== "");

  if (boxIDs.length === 0) {
    alert("No valid boxes entered.");
    return;
  }

  //Fetching all boxes in one request
  const boxRefs = boxIDs.map((boxID) => ref(db, `boxes/${boxID}`));
  const boxSnapshots = await Promise.all(boxRefs.map(get));

  //Filter out non-existent boxes
  const validBoxes = boxSnapshots
    .map((snapshot, index) => (snapshot.exists() ? boxIDs[index] : null))
    .filter((boxID) => boxID !== null);

  if (validBoxes.length === 0) {
    alert("No valid boxes found in the database.");
    return;
  }

  //Checking number of boxes in the office
  const newOfficeRef = ref(db, `offices/${officeNumber}`);
  const newOfficeSnapshot = await get(newOfficeRef);

  const officeRef = ref(db, `offices/${officeNumber}/officecurrent`);
  const officeSnapshot = await get(officeRef);

  let currentBoxes = [];
  if (officeSnapshot.exists()) {
    try {
      currentBoxes = JSON.parse(officeSnapshot.val()) || [];
    } catch {
      currentBoxes = [];
    }
  }

  // Show warning if office already has 4 or more boxes
  const numofboxes = currentBoxes.length;
  if (numofboxes >= 4) {
    const isConfirmed = confirm(
      `WARNING: Office ${officeNumber} already has ${numofboxes} boxes/specials. Do you want to proceed?`
    );
    if (!isConfirmed) {
      return; // Stop the function if the user clicks "Cancel"
    }
  }

  //Variable for bulk update
  let updates = {};

  //Update box records
  validBoxes.forEach((boxID) => {
    const snapshot = boxSnapshots.find(
      (snap) => snap.exists() && snap.key === boxID
    );
    if (!snapshot) return;

    const boxData = snapshot.val();
    let history = [];

    try {
      history = boxData.boxhistory ? JSON.parse(boxData.boxhistory) : [];
    } catch {
      history = [];
    }

    //Updating history in office
    history.push({ office: officeNumber, time: currentTime });

    //Updateing box data
    updates[`boxes/${boxID}`] = {
      boxhistory: JSON.stringify(history),
      boxoffice: officeNumber,
      boxtempout: tempout,
      boxtimeout: currentTime,
    };
  });

  //Updateing office data
  let officeCurrent = [];
  let officeHistory = [];

  if (newOfficeSnapshot.exists()) {
    const officeData = newOfficeSnapshot.val();
    officeCurrent = officeData.officecurrent
      ? JSON.parse(officeData.officecurrent)
      : [];
    officeHistory = officeData.officehistory
      ? JSON.parse(officeData.officehistory)
      : [];
  }

  //Adding valid boxes to new office
  validBoxes.forEach((boxID) => {
    if (!officeCurrent.includes(boxID)) {
      officeCurrent.push(boxID);
    }
    officeHistory.push({ box: boxID, time: currentTime });
  });

  updates[`offices/${officeNumber}/officecurrent`] =
    JSON.stringify(officeCurrent);
  updates[`offices/${officeNumber}/officehistory`] =
    JSON.stringify(officeHistory);
  updates[`offices/${officeNumber}/officenum`] = officeNumber;

  //Applying all updates AHHAAHAHHA
  await update(ref(db), updates);

  document.getElementById(
    "feedback"
  ).innerText = `Successfully checked out ${validBoxes.length} Boxes/Specials to Office ${officeNumber}!`;

  officeOutInput.value = "";
  boxesContainer.innerHTML = "";
  boxCount = 0;
});
