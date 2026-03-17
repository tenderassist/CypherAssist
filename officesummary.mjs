import {
  ref,
  get,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { db } from "./firebase.mjs";
import { initQuickSearch } from "./quicksearch.mjs";
import {
  bindEnterToButton,
  escapeHtml,
  parseJsonArray,
  setFeedback,
  sortNumericStrings,
} from "./utils.mjs";

initQuickSearch(db);

const searchButton = document.getElementById("searchoffbtn");
const searchInput = document.getElementById("searchoffnum");
const feedbackDiv = document.getElementById("feedback");

function buildHistoryId(...parts) {
  return parts
    .map((part) => String(part).replace(/[^a-zA-Z0-9]/g, "-"))
    .join("-");
}

bindEnterToButton(searchButton);

searchButton.addEventListener("click", async () => {
  const officeID = searchInput.value.trim();

  if (!officeID) {
    setFeedback(feedbackDiv, "Please enter a valid office number.", {
      error: true,
    });
    return;
  }

  try {
    const snapshot = await get(ref(db, `offices/${officeID}`));

    if (!snapshot.exists()) {
      setFeedback(feedbackDiv, "Office not found in the database.", {
        error: true,
      });
      return;
    }

    const officeData = snapshot.val();
    const currentBoxes = sortNumericStrings(
      parseJsonArray(officeData.officecurrent).filter(Boolean)
    );
    const officeHistory = parseJsonArray(officeData.officehistory).filter(
      (record) => record && record.box && record.time
    );

    const groupedHistory = {};
    const latestHistoryIdByBox = {};

    officeHistory.forEach((record) => {
      if (!groupedHistory[record.time]) {
        groupedHistory[record.time] = [];
      }

      groupedHistory[record.time].push(record.box);
      latestHistoryIdByBox[record.box] = buildHistoryId(
        "history",
        officeID,
        record.time,
        record.box
      );
    });

    const uniqueBoxes = sortNumericStrings([
      ...new Set(officeHistory.map((record) => record.box)),
    ]);

    const currentBoxesMarkup = currentBoxes.length
      ? currentBoxes
          .map((box) => `<span class="status-chip">${escapeHtml(box)}</span>`)
          .join("")
      : `<div class="status-empty">No boxes currently assigned.</div>`;

    const seenBoxesMarkup = uniqueBoxes.length
      ? uniqueBoxes
          .map(
            (box) => `
              <button
                type="button"
                class="status-chip status-chip-button"
                data-history-target="${escapeHtml(
                  latestHistoryIdByBox[box] || ""
                )}"
              >
                ${escapeHtml(box)}
              </button>
            `
          )
          .join("")
      : `<div class="status-empty">No boxes recorded yet.</div>`;

    const historyItems = Object.keys(groupedHistory)
      .map((time) => {
        const boxMarkup = groupedHistory[time]
          .map((box) => {
            const chipId = buildHistoryId("history", officeID, time, box);

            return `
              <span
                class="status-chip summary-history-chip"
                id="${escapeHtml(
                  latestHistoryIdByBox[box] === chipId ? chipId : ""
                )}"
              >
                ${escapeHtml(box)}
              </span>
            `;
          })
          .join("");

        return `
          <article class="summary-history-item">
            <div class="summary-history-row">
              <span class="summary-history-label">Boxes</span>
              <div class="summary-history-pills">${boxMarkup}</div>
            </div>
            <div class="summary-history-row">
              <span class="summary-history-label">Time</span>
              <strong class="summary-history-value">${escapeHtml(time)}</strong>
            </div>
          </article>
        `;
      })
      .join("");

    const historyMarkup = officeHistory.length
      ? `<div class="summary-history-list">${historyItems}</div>`
      : `<div class="status-empty">No recorded history yet.</div>`;

    setFeedback(
      feedbackDiv,
      `
        <div class="summary-result-card">
          <div class="summary-result-head">
            <span class="summary-result-eyebrow">Summary</span>
            <h3>Office ${escapeHtml(officeID)}</h3>
          </div>
          <div class="summary-seen-boxes">
            <div class="summary-section-head">
              <span class="summary-section-title">Current Boxes</span>
              <span class="status-total">
                <span class="status-total-label">Total:</span>
                <span class="status-count">${currentBoxes.length}</span>
              </span>
            </div>
            <div class="status-chips">${currentBoxesMarkup}</div>
          </div>
          <div class="summary-seen-boxes">
            <div class="summary-section-head">
              <span class="summary-section-title">Boxes Seen</span>
              <span class="status-total">
                <span class="status-total-label">Total:</span>
                <span class="status-count">${uniqueBoxes.length}</span>
              </span>
            </div>
            <div class="status-chips">${seenBoxesMarkup}</div>
          </div>
          ${historyMarkup}
        </div>
      `,
      { html: true }
    );
  } catch (error) {
    console.error("Error fetching office history:", error);
    setFeedback(feedbackDiv, "Error retrieving data. Please try again.", {
      error: true,
    });
  }
});

feedbackDiv.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-history-target]");
  if (!chip) return;

  const targetId = chip.getAttribute("data-history-target");
  if (!targetId) return;

  const target = document.getElementById(targetId);
  if (!target) return;

  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.add("summary-history-chip-active");
  window.setTimeout(() => {
    target.classList.remove("summary-history-chip-active");
  }, 1600);
});
