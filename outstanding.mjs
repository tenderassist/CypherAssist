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

const checkButton = document.getElementById("checkoutstandingbtn");
const feedbackDiv = document.getElementById("feedback");

bindEnterToButton(checkButton);

checkButton.addEventListener("click", async () => {
  setFeedback(
    feedbackDiv,
    `
      <div class="outstanding-state">
        Checking outstanding boxes...
      </div>
    `,
    { html: true }
  );

  try {
    const snapshot = await get(ref(db, "boxes"));

    if (!snapshot.exists()) {
      setFeedback(
        feedbackDiv,
        `
          <div class="outstanding-state">
            No outstanding boxes.
          </div>
        `,
        { html: true }
      );
      return;
    }

    const boxes = snapshot.val();
    const now = new Date();
    const outstandingBoxes = [];

    Object.keys(boxes).forEach((boxID) => {
      const box = boxes[boxID];
      if (!box.boxtimeout) return;
      if ((box.boxoffice || "").toLowerCase() === "in safe") return;

      const minutesElapsed = minutesSinceClockTime(box.boxtimeout, now);
      if (minutesElapsed === null || minutesElapsed < 60) return;

      outstandingBoxes.push({
        boxnum: box.boxnum || boxID,
        office: box.boxoffice || "Unknown",
        boxtimeout: box.boxtimeout,
        minutesElapsed,
      });
    });

    if (!outstandingBoxes.length) {
      setFeedback(
        feedbackDiv,
        `
          <div class="outstanding-state">
            No boxes have been out for more than 60 minutes.
          </div>
        `,
        { html: true }
      );
      return;
    }

    outstandingBoxes.sort((a, b) => b.minutesElapsed - a.minutesElapsed);

    const items = outstandingBoxes
      .map(
        (box) => `
          <article class="outstanding-item">
            <div class="outstanding-item-head">
              <span class="outstanding-badge">BOX/SPECIAL ${escapeHtml(
                box.boxnum
              )}</span>
            </div>
            <div class="outstanding-grid">
              <div class="outstanding-row">
                <span class="outstanding-label">Office</span>
                <strong class="outstanding-value">${escapeHtml(
                  box.office
                )}</strong>
              </div>
              <div class="outstanding-row">
                <span class="outstanding-label">Checked Out</span>
                <strong class="outstanding-value">${escapeHtml(
                  box.boxtimeout
                )}</strong>
              </div>
              <div class="outstanding-row outstanding-row-wide">
                <span class="outstanding-label">Time Out</span>
                <strong class="outstanding-value">${box.minutesElapsed} minutes ago</strong>
              </div>
            </div>
          </article>
        `
      )
      .join("");

    setFeedback(
      feedbackDiv,
      `
        <div class="summary-result-card outstanding-result-card">
          <div class="summary-result-head">
            <span class="summary-result-eyebrow">Outstanding</span>
            <h3>Boxes Out Longer Than 60 Minutes</h3>
          </div>
          <div class="summary-seen-boxes">
            <div class="summary-section-head">
              <span class="summary-section-title">Total Boxes</span>
              <span class="status-total">
                <span class="status-total-label">Total:</span>
                <span class="status-count">${outstandingBoxes.length}</span>
              </span>
            </div>
          </div>
          <div class="outstanding-list">${items}</div>
        </div>
      `,
      { html: true }
    );
  } catch (error) {
    console.error("Error fetching outstanding boxes:", error);
    setFeedback(feedbackDiv, "Error retrieving data. Please try again.", {
      error: true,
    });
  }
});
