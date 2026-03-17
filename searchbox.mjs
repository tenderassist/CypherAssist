import {
  ref,
  get,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { db } from "./firebase.mjs";
import { initQuickSearch } from "./quicksearch.mjs";
import {
  bindEnterToButton,
  escapeHtml,
  minutesSinceClockTime,
  setFeedback,
} from "./utils.mjs";

initQuickSearch(db);

const searchButton = document.getElementById("searchbtn");
const searchInput = document.getElementById("searchnum");
const feedbackDiv = document.getElementById("feedback");

bindEnterToButton(searchButton);

searchButton.addEventListener("click", async () => {
  const boxID = searchInput.value.trim();

  if (!boxID) {
    setFeedback(feedbackDiv, "Please enter a valid box number.", {
      error: true,
    });
    return;
  }

  try {
    const snapshot = await get(ref(db, `boxes/${boxID}`));

    if (!snapshot.exists()) {
      setFeedback(feedbackDiv, `Box ${boxID} not found in the database.`, {
        error: true,
      });
      return;
    }

    const boxData = snapshot.val();
    const boxNumber = boxData.boxnum || boxID;
    const boxOffice = boxData.boxoffice || "In Safe";
    const lastBookedOut = boxData.boxtimeout || "No record";
    const lastBookedIn = boxData.boxtimein || "No record";
    const isInSafe = String(boxOffice).toLowerCase() === "in safe";
    const minutesSinceLastOut = minutesSinceClockTime(boxData.boxtimeout);

    let timeSinceLastOut = "N/A";
    if (isInSafe) {
      timeSinceLastOut = "Currently in safe";
    } else if (minutesSinceLastOut !== null) {
      timeSinceLastOut = `${minutesSinceLastOut} minutes`;
    }

    setFeedback(
      feedbackDiv,
      `
        <div class="search-result-card">
          <div class="search-result-head">
            <span class="search-result-eyebrow">Search Result</span>
            <h3>Box ${escapeHtml(boxNumber)}</h3>
          </div>
          <div class="search-result-grid">
            <div class="search-result-row">
              <span class="search-result-label">Current Office</span>
              <strong class="search-result-value">${escapeHtml(boxOffice)}</strong>
            </div>
            <div class="search-result-row">
              <span class="search-result-label">Time Since Last Check Out</span>
              <strong class="search-result-value">${escapeHtml(
                timeSinceLastOut
              )}</strong>
            </div>
            <div class="search-result-row">
              <span class="search-result-label">Last Booked Out</span>
              <strong class="search-result-value">${escapeHtml(
                lastBookedOut
              )}</strong>
            </div>
            <div class="search-result-row">
              <span class="search-result-label">Last Booked In</span>
              <strong class="search-result-value">${escapeHtml(
                lastBookedIn
              )}</strong>
            </div>
          </div>
        </div>
      `,
      { html: true }
    );
  } catch (error) {
    console.error("Error fetching box data:", error);
    setFeedback(feedbackDiv, "Error retrieving data. Please try again.", {
      error: true,
    });
  }
});
