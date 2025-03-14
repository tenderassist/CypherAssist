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
const checkButton = document.getElementById("checkoutstandingbtn");
const feedbackDiv = document.getElementById("feedback");

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter")
    document.getElementById("checkoutstandingbtn").click();
});

checkButton.addEventListener("click", async function () {
  feedbackDiv.innerHTML = "Checking outstanding boxes...";

  const boxesRef = ref(db, "boxes");

  try {
    const snapshot = await get(boxesRef);

    if (!snapshot.exists()) {
      feedbackDiv.innerHTML = "No outstanding boxes.";
      return;
    }

    const boxes = snapshot.val();
    const now = new Date();
    let outstandingBoxes = [];

    Object.keys(boxes).forEach((boxID) => {
      const box = boxes[boxID];
      if (!box.boxtimeout) return; // Skip if no checkout time

      const [outHours, outMinutes] = box.boxtimeout.split(":").map(Number);
      const lastOutDate = new Date();
      lastOutDate.setHours(outHours, outMinutes, 0, 0);

      const timeDifferenceMs = now - lastOutDate;
      const timeDifferenceMinutes = Math.floor(timeDifferenceMs / 60000);

      if (timeDifferenceMinutes >= 60) {
        outstandingBoxes.push({
          boxnum: box.boxnum || boxID,
          office: box.boxoffice || "Unknown",
          boxtimeout: box.boxtimeout,
          minutesElapsed: timeDifferenceMinutes,
        });
      }
    });

    if (outstandingBoxes.length === 0) {
      feedbackDiv.innerHTML =
        "No boxes have been out for more than 60 minutes.";
      return;
    }

    let output = "";
    outstandingBoxes.forEach((box) => {
      output += `
      <strong>🚨<u>BOX/SPECIAL:</strong> ${box.boxnum} </u><br>
         <strong>Office:</strong> ${box.office} <br>
         <strong>Checked Out:</strong> ${box.boxtimeout} <br>
         <strong>Time Out:</strong> ${box.minutesElapsed} minutes ago <br><br>
      `;
    });

    feedbackDiv.innerHTML = output;
  } catch (error) {
    console.error("Error fetching outstanding boxes:", error);
    feedbackDiv.innerHTML = "Error retrieving data. Please try again.";
  }
});
