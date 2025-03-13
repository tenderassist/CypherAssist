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
//Boxes in database----------------------------------------------------------------------------------------------
const boxesRef = ref(db, "boxes");

// Function to display boxes in real time
function displayBoxes() {
  const boxListElement = document.getElementById("boxlist");

  onValue(boxesRef, (snapshot) => {
    if (snapshot.exists()) {
      const boxes = snapshot.val();
      const boxNumbers = Object.keys(boxes).sort((a, b) => a - b); // Sort numerically

      boxListElement.innerHTML = `Active Boxes: ${boxNumbers.join(", ")}`;
    } else {
      boxListElement.innerHTML = "No boxes available.";
    }
  });
}

// Call function to start real-time updates
displayBoxes();
//----------------------------------------------------------------------------------------------
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") document.getElementById("adddelbtn").click();
});

document.getElementById("adddelbtn").addEventListener("click", function () {
  const action = document.getElementById("adddelbox").value;
  const adddelboxnum = document.getElementById("adddelboxnum").value.trim();

  //Check if field blank
  if (adddelboxnum === "") {
    alert("No number entered.");
    return;
  }

  const boxID = adddelboxnum.toString();
  const boxRef = ref(db, `boxes/${boxID}`);

  //Adding Box to database
  if (action === "add") {
    set(boxRef, {
      boxnum: boxID,
      boxoffice: "",
      boxtimeout: "",
      boxtimein: "",
      boxtempout: "",
      boxtempin: "",
      boxhistory: "",
    })
      .then(() => {
        document.getElementById("adddelboxnum").value = "";
        document.getElementById(
          "feedback"
        ).innerText = `Successfully ADDED Box/Special ${boxID}!`;
        console.log(`Box/Special ${boxID} added successfully!`);
      })
      .catch((error) => {
        console.error("Error saving data: ", error);
      });
  }

  //Deleting Box from database
  if (action === "delete") {
    get(boxRef)
      .then((snapshot) => {
        if (snapshot.exists()) {
          remove(boxRef)
            .then(() => {
              document.getElementById("adddelboxnum").value = "";
              document.getElementById(
                "feedback"
              ).innerText = `Successfully DELETED Box/Special ${boxID}!`;
              console.log(`Box ${boxID} deleted successfully!`);
            })
            .catch((error) => {
              console.error("Error deleting data:", error);
            });
        } else {
          alert(`Box ${boxID} not found in database!`);
          console.log(`Box ${boxID} does not exist in the database!`);
        }
      })
      .catch((error) => {
        console.error("Error checking data:", error);
      });
  }
});
