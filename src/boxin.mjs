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
//VARIABLES-------------------------------------------------------------------------------------
const tempinInput = document.getElementById("tempin");
const addBoxButton = document.getElementById("addBoxfield"); //for add boxes button
const boxesContainer = document.getElementById("boxesContainer"); //for add boxes button
const submitButton = document.getElementById("boxinbtn");
let boxCount = 0; //for add boxes button

//ADD BOX BUTTON--------------------------------------------------------------------------------
addBoxButton.addEventListener("click", function () {
  if (boxCount >= 6) {
    return; // Stop adding if the limit is reached
  }

  boxCount++; // Increase count when adding a box

  // Create new input field for a box
  const div = document.createElement("div");
  div.classList.add("box-input");
  div.innerHTML = `
    <br/>
    <input type="text" class="boxNumber" placeholder="e.g. '24'">
    <button class="removeBox">X</button>
    <br/>
  `;

  boxesContainer.appendChild(div);

  // Disable button if 6 boxes are added
  if (boxCount >= 6) {
    addBoxButton.disabled = true;
  }

  // Remove box input when X is clicked
  div.querySelector(".removeBox").addEventListener("click", function () {
    div.remove();
    boxCount--; // Decrease count when a box is removed

    // Re-enable button if a box is removed
    if (boxCount < 6) {
      addBoxButton.disabled = false;
    }
  });
});
//UPDATING DATABASE------------------------------------------------------------------------------
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") document.getElementById("boxinbtn").click();
});

submitButton.addEventListener("click", async function () {
  const tempin = tempinInput.value.trim();
  const boxInputs = document.querySelectorAll(".boxNumber");

  if (boxInputs.length === 0) {
    alert("Please enter at least one box.");
    return;
  }

  //Current time
  const now = new Date();
  const currentTime =
    now.getHours().toString().padStart(2, "0") +
    ":" +
    now.getMinutes().toString().padStart(2, "0");

  //Geting all the box IDs
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

  //Filtering out non-existent boxes
  const validBoxes = boxSnapshots
    .map((snapshot, index) => (snapshot.exists() ? boxIDs[index] : null))
    .filter((boxID) => boxID !== null);

  if (validBoxes.length === 0) {
    alert("No valid boxes found in the database.");
    return;
  }

  //Fetching previous office data
  const previousOfficeNumbers = [
    ...new Set(
      boxSnapshots
        .map((snapshot) =>
          snapshot.exists() ? snapshot.val().boxoffice : null
        )
        .filter((office) => office !== null) // Filter out null values
    ),
  ];
  const previousOfficeRefs = previousOfficeNumbers.map((officeNum) =>
    ref(db, `offices/${officeNum}`)
  );
  const previousOfficeSnapshots = await Promise.all(
    previousOfficeRefs.map(get)
  );

  let updates = {};

  //Updating box records
  validBoxes.forEach((boxID) => {
    updates[`boxes/${boxID}/boxtempin`] = tempin;
    updates[`boxes/${boxID}/boxtimein`] = currentTime;
    updates[`boxes/${boxID}/boxoffice`] = "In Safe";
  });

  //Remove box from `officecurrent` from previous office
  previousOfficeSnapshots.forEach((snapshot, index) => {
    if (!snapshot.exists()) return;

    const prevOfficeNumber = previousOfficeNumbers[index];
    const officeData = snapshot.val();
    let officeCurrent = [];

    try {
      officeCurrent = officeData.officecurrent
        ? JSON.parse(officeData.officecurrent)
        : [];
    } catch {
      officeCurrent = [];
    }

    //Removing checked in boxes from `officecurrent`
    officeCurrent = officeCurrent.filter(
      (boxID) => !validBoxes.includes(boxID)
    );

    updates[`offices/${prevOfficeNumber}/officecurrent`] =
      JSON.stringify(officeCurrent);
  });

  //Applying all updates
  await update(ref(db), updates);

  document.getElementById(
    "feedback"
  ).innerText = `Successfully checked in ${validBoxes.length} Boxes/Specials!`;

  boxesContainer.innerHTML = "";
  boxCount = 0;

  //Remove from outstanding
  //const outstandingRef = ref(db, `outstanding/${boxID}`);
  //await remove(outstandingRef);
});
