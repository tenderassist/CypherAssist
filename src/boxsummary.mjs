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
const searchButton = document.getElementById("searchboxbtn");
const searchInput = document.getElementById("searchboxnum");
const feedbackDiv = document.getElementById("feedback");

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") document.getElementById("searchboxbtn").click();
});

searchButton.addEventListener("click", async function () {
  const boxID = searchInput.value.trim();

  if (boxID === "") {
    feedbackDiv.innerHTML = "Please enter a valid box number.";
    feedbackDiv.classList.add("error");
    return;
  }

  const boxRef = ref(db, `boxes/${boxID}`);

  try {
    const snapshot = await get(boxRef);

    if (!snapshot.exists()) {
      feedbackDiv.innerHTML = "Box/Special not found in the database.";
      feedbackDiv.classList.add("error");
      return;
    }

    const boxData = snapshot.val();
    let boxHistory = [];

    try {
      boxHistory = boxData.boxhistory ? JSON.parse(boxData.boxhistory) : [];
    } catch (error) {
      console.warn("Error parsing box summary:", error);
      boxHistory = [];
    }

    if (boxHistory.length === 0) {
      feedbackDiv.innerHTML = `Box/Special ${boxID} has no recorded summary.`;
      return;
    }

    //Grouping offices by time
    let groupedHistory = {};
    boxHistory.forEach((record) => {
      if (!groupedHistory[record.time]) {
        groupedHistory[record.time] = [];
      }
      groupedHistory[record.time].push(record.office);
    });

    let output = `<strong><u>Box/Special ${boxID} Summary:</u></strong><br>`;
    Object.keys(groupedHistory).forEach((time) => {
      output += `
        <strong>Time Checked In:</strong> ${time} <br>
        <strong>Office:</strong> ${groupedHistory[time].join(", ")} <br><br>
      `;
    });

    feedbackDiv.innerHTML = output;
  } catch (error) {
    console.error("Error fetching history:", error);
    feedbackDiv.innerHTML = "Error retrieving data. Please try again.";
    feedbackDiv.classList.add("error");
  }
});
