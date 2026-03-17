import {
  ref,
  get,
} from "firebase/database";
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

const searchButton = document.getElementById("searchboxbtn");
const searchInput = document.getElementById("searchboxnum");
const feedbackDiv = document.getElementById("feedback");

function buildHistoryId(...parts) {
  return parts
    .map((part) => String(part).replace(/[^a-zA-Z0-9]/g, "-"))
    .join("-");
}

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
      setFeedback(feedbackDiv, "Box/Special not found in the database.", {
        error: true,
      });
      return;
    }

    const boxData = snapshot.val();
    const currentOffice = boxData.boxoffice || "In Safe";
    const boxHistory = parseJsonArray(boxData.boxhistory).filter(
      (record) => record && record.office && record.time
    );

    if (!boxHistory.length) {
      setFeedback(feedbackDiv, `Box/Special ${boxID} has no recorded history.`);
      return;
    }

    const groupedHistory = {};
    const latestHistoryIdByOffice = {};

    boxHistory.forEach((record) => {
      if (!groupedHistory[record.time]) {
        groupedHistory[record.time] = [];
      }

      groupedHistory[record.time].push(record.office);
      latestHistoryIdByOffice[record.office] = buildHistoryId(
        "history",
        boxID,
        record.time,
        record.office
      );
    });

    const uniqueOffices = sortNumericStrings([
      ...new Set(boxHistory.map((record) => record.office)),
    ]);

    const seenOfficesMarkup = uniqueOffices.length
      ? uniqueOffices
          .map(
            (office) => `
              <button
                type="button"
                class="status-chip status-chip-button"
                data-history-target="${escapeHtml(
                  latestHistoryIdByOffice[office] || ""
                )}"
              >
                ${escapeHtml(office)}
              </button>
            `
          )
          .join("")
      : `<div class="status-empty">No offices recorded yet.</div>`;

    const historyItems = Object.keys(groupedHistory)
      .map((time) => {
        const officeMarkup = groupedHistory[time]
          .map((office) => {
            const chipId = buildHistoryId("history", boxID, time, office);

            return `
              <span
                class="status-chip summary-history-chip"
                id="${escapeHtml(
                  latestHistoryIdByOffice[office] === chipId ? chipId : ""
                )}"
              >
                ${escapeHtml(office)}
              </span>
            `;
          })
          .join("");

        return `
          <article class="summary-history-item">
            <div class="summary-history-row">
              <span class="summary-history-label">Time Checked In</span>
              <strong class="summary-history-value">${escapeHtml(time)}</strong>
            </div>
            <div class="summary-history-row">
              <span class="summary-history-label">Office</span>
              <div class="summary-history-pills">${officeMarkup}</div>
            </div>
          </article>
        `;
      })
      .join("");

    setFeedback(
      feedbackDiv,
      `
        <div class="summary-result-card">
          <div class="summary-result-head">
            <span class="summary-result-eyebrow">Summary</span>
            <h3>Box/Special ${escapeHtml(boxID)}</h3>
          </div>
          <div class="summary-seen-boxes">
            <div class="summary-section-head">
              <span class="summary-section-title">Current Office</span>
            </div>
            <div class="status-chips">
              <span class="status-chip">${escapeHtml(currentOffice)}</span>
            </div>
          </div>
          <div class="summary-seen-boxes">
            <div class="summary-section-head">
              <span class="summary-section-title">Offices Seen</span>
              <span class="status-total">
                <span class="status-total-label">Total:</span>
                <span class="status-count">${uniqueOffices.length}</span>
              </span>
            </div>
            <div class="status-chips">${seenOfficesMarkup}</div>
          </div>
          <div class="summary-history-list">${historyItems}</div>
        </div>
      `,
      { html: true }
    );
  } catch (error) {
    console.error("Error fetching history:", error);
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
