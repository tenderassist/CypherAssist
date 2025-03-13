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
  onValue,
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
//Live Office List----------------------------------------------------------------------------------------------
const officesRef = ref(db, "offices");

// Function to display boxes in real time
function displayOffices() {
  const officeListElement = document.getElementById("officelist");

  onValue(officesRef, (snapshot) => {
    if (snapshot.exists()) {
      const offices = snapshot.val();
      const officeNumbers = Object.keys(offices).sort((a, b) => a - b); // Sort numerically

      officeListElement.innerHTML = `Active Offices: ${officeNumbers.join(
        ", "
      )}`;
    } else {
      officeListElement.innerHTML = "No offices available.";
    }
  });
}

// Call function to start real-time updates
displayOffices();
//----------------------------------------------------------------------------------------------
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") document.getElementById("adddeloffbtn").click();
});

document.getElementById("adddeloffbtn").addEventListener("click", function () {
  const action = document.getElementById("adddeloffice").value;
  const adddeloffnum = document.getElementById("adddeloffnum").value.trim();

  // Validation check
  if (adddeloffnum === "") {
    alert("No number entered.");
    return;
  }

  const offID = adddeloffnum.toString();
  const officeRef = ref(db, `offices/${offID}`);

  //Add to the database
  if (action === "add") {
    set(officeRef, {
      officenum: offID,
      officecurrent: "",
      officehistory: "",
    })
      .then(() => {
        document.getElementById("adddeloffnum").value = "";
        document.getElementById(
          "feedback"
        ).innerText = `Successfully ADDED office ${offID}!`;
        console.log("Data saved successfully!");
      })
      .catch((error) => {
        console.error("Error saving data: ", error);
      });
  }

  //Delete from database
  if (action === "delete") {
    get(officeRef)
      .then((snapshot) => {
        if (snapshot.exists()) {
          remove(officeRef)
            .then(() => {
              document.getElementById("adddeloffnum").value = "";
              document.getElementById(
                "feedback"
              ).innerText = `Successfully DELETED Office ${offID}!`;
              console.log(`Office ${offID} deleted successfully!`);
            })
            .catch((error) => {
              console.error("Error deleting data:", error);
            });
        } else {
          alert(`Office ${offID} not found in database!`);
          console.log(`Office ${offID} does not exist in the database!`);
        }
      })
      .catch((error) => {
        console.error("Error checking data:", error);
      });
  }
});
