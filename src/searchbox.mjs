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
//SEARCH FUNCTION----------------------------------------------------------------------------------------------
const searchButton = document.getElementById("searchbtn");
const searchInput = document.getElementById("searchnum");
const feedbackDiv = document.getElementById("feedback");

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") document.getElementById("searchbtn").click();
});

searchButton.addEventListener("click", function () {
  const boxID = searchInput.value.trim();

  if (boxID === "") {
    feedbackDiv.innerHTML = "Please enter a valid box number.";
    feedbackDiv.classList.add("error");
    return;
  }

  const boxRef = ref(db, `boxes/${boxID}`);

  get(boxRef)
    .then((snapshot) => {
      if (snapshot.exists()) {
        const boxData = snapshot.val();

        const boxNumber = boxData.boxnum || "N/A";
        const boxOffice = boxData.boxoffice || "In Safe";
        const lastBookedOut = boxData.boxtimeout || "No record";
        const lastBookedIn = boxData.boxtimein || "No record";
        let timeSinceLastOut = "N/A";

        //Time its been out
        if (boxData.boxtimeout && boxData.boxtimein) {
          const [outHours, outMinutes] = boxData.boxtimeout
            .split(":")
            .map(Number);
          const [inHours, inMinutes] = boxData.boxtimein.split(":").map(Number);

          const lastOutDate = new Date();
          lastOutDate.setHours(outHours, outMinutes, 0, 0);

          const lastInDate = new Date();
          lastInDate.setHours(inHours, inMinutes, 0, 0);

          const now = new Date();

          //Make time 0 if it hasnt been checked out
          if (lastInDate > lastOutDate) {
            timeSinceLastOut = "0 minutes ago";
          } else {
            const timeDifferenceMs = now - lastOutDate;
            const timeDifferenceMinutes = Math.floor(timeDifferenceMs / 60000); // Convert ms to minutes

            timeSinceLastOut = `${timeDifferenceMinutes} minutes ago`;
          }
        } else if (boxData.boxtimeout) {
          const [outHours, outMinutes] = boxData.boxtimeout
            .split(":")
            .map(Number);
          const lastOutDate = new Date();
          lastOutDate.setHours(outHours, outMinutes, 0, 0);

          const now = new Date();
          const timeDifferenceMs = now - lastOutDate;
          const timeDifferenceMinutes = Math.floor(timeDifferenceMs / 60000); // Convert ms to minutes

          timeSinceLastOut = `${timeDifferenceMinutes} minutes ago`;
        }

        feedbackDiv.innerHTML = `
          <strong><u>Box Number:</strong> ${searchInput.value} </u><br>
          <strong>Current Office:</strong> ${boxOffice} <br>
          <strong>Time Since Last Check Out:</strong> ${timeSinceLastOut} <br>
          <strong>Last Booked Out:</strong> ${lastBookedOut} <br>
          <strong>Last Booked In:</strong> ${lastBookedIn}
        `;
        feedbackDiv.classList.remove("error");
      } else {
        feedbackDiv.innerHTML = `Box ${searchInput.value} not found in the database.`;
        feedbackDiv.classList.add("error");
      }
    })
    .catch((error) => {
      console.error("Error fetching box data:", error);
      feedbackDiv.innerHTML = "Error retrieving data. Please try again.";
      feedbackDiv.classList.add("error");
    });
});
