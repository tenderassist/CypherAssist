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
const searchButton = document.getElementById("searchoffbtn");
const searchInput = document.getElementById("searchoffnum");
const feedbackDiv = document.getElementById("feedback");

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") document.getElementById("searchoffbtn").click();
});

searchButton.addEventListener("click", async function () {
  const officeID = searchInput.value.trim();

  if (officeID === "") {
    feedbackDiv.innerHTML = "Please enter a valid office number.";
    feedbackDiv.classList.add("error");
    return;
  }

  const officeRef = ref(db, `offices/${officeID}`);

  try {
    const snapshot = await get(officeRef);

    if (!snapshot.exists()) {
      feedbackDiv.innerHTML = "Office not found in the database.";
      feedbackDiv.classList.add("error");
      return;
    }

    const officeData = snapshot.val();
    let officeHistory = [];

    try {
      officeHistory = officeData.officehistory
        ? JSON.parse(officeData.officehistory)
        : [];
    } catch (error) {
      console.warn("Error parsing office summary:", error);
      officeHistory = [];
    }

    if (officeHistory.length === 0) {
      feedbackDiv.innerHTML = `Office ${officeID} has no recorded history.`;
      return;
    }

    //Grouping boxes by time
    let groupedHistory = {};
    officeHistory.forEach((record) => {
      if (!groupedHistory[record.time]) {
        groupedHistory[record.time] = [];
      }
      groupedHistory[record.time].push(record.box);
    });

    //This gets the current boxes
    const currentBoxesRef = ref(db, `boxes`);
    const currentSnapshot = await get(currentBoxesRef);
    const currentBoxes = [];

    currentSnapshot.forEach((boxSnapshot) => {
      const boxData = boxSnapshot.val();
      if (boxData.boxoffice === officeID) {
        currentBoxes.push(boxSnapshot.key);
      }
    });

    let output = `<strong><u>Office ${officeID} Summary:</u></strong> (${currentBoxes.join(
      ", "
    )})<br>`;
    Object.keys(groupedHistory).forEach((time) => {
      output += `
        <strong>Boxes:</strong> ${groupedHistory[time].join(", ")} <br>
        <strong>Time:</strong> ${time} <br><br>
      `;
    });

    feedbackDiv.innerHTML = output;
  } catch (error) {
    console.error("Error fetching office history:", error);
    feedbackDiv.innerHTML = "Error retrieving data. Please try again.";
    feedbackDiv.classList.add("error");
  }
});
