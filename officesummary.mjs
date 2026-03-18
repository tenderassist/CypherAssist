import {
  ref,
  get,
} from "firebase/database";
import { db } from "./firebase.mjs";
import { initQuickSearch } from "./quicksearch.mjs";
import {
  bindEnterToButton,
  escapeHtml,
  minutesSinceClockTime,
  parseJsonArray,
  setFeedback,
  sortNumericStrings,
} from "./utils.mjs";
import {
  getBoxesCollectionPath,
  getOfficesCollectionPath,
  requireAuth,
} from "./auth.mjs";

const user = await requireAuth();
const boxesCollectionPath = getBoxesCollectionPath(user);
const officesCollectionPath = getOfficesCollectionPath(user);

initQuickSearch(db, user);

const searchButton = document.getElementById("searchoffbtn");
const searchInput = document.getElementById("searchoffnum");
const feedbackDiv = document.getElementById("feedback");
let activeHistoryEntry = null;
let activeHistoryChip = null;
let historyHighlightTimeoutId = null;

function buildHistoryId(...parts) {
  return parts
    .map((part) => String(part).replace(/[^a-zA-Z0-9]/g, "-"))
    .join("-");
}

function formatDuration(totalMinutes) {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) {
    return "Unavailable";
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours) {
    return `${minutes} min`;
  }

  if (!minutes) {
    return `${hours} hr`;
  }

  return `${hours} hr ${minutes} min`;
}

function getClockDifference(startTime, endTime) {
  const startMinutesAgo = minutesSinceClockTime(startTime);
  const endMinutesAgo = minutesSinceClockTime(endTime);

  if (startMinutesAgo == null || endMinutesAgo == null) {
    return null;
  }

  return startMinutesAgo >= endMinutesAgo
    ? startMinutesAgo - endMinutesAgo
    : startMinutesAgo + (24 * 60 - endMinutesAgo);
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
    const snapshot = await get(ref(db, `${officesCollectionPath}/${officeID}`));

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
    const latestHistoryIdByBox = {};
    const boxesByCheckoutTime = {};
    const timesSeenByBox = {};

    officeHistory.forEach((record) => {
      if (!boxesByCheckoutTime[record.time]) {
        boxesByCheckoutTime[record.time] = [];
      }

      boxesByCheckoutTime[record.time].push(record.box);
      timesSeenByBox[record.box] = (timesSeenByBox[record.box] || 0) + 1;
    });

    const uniqueBoxes = sortNumericStrings([
      ...new Set(officeHistory.map((record) => record.box)),
    ]);

    const boxSnapshots = await Promise.all(
      uniqueBoxes.map((box) => get(ref(db, `${boxesCollectionPath}/${box}`)))
    );
    const boxDataById = {};

    boxSnapshots.forEach((boxSnapshot, index) => {
      if (!boxSnapshot.exists()) return;
      boxDataById[uniqueBoxes[index]] = boxSnapshot.val();
    });

    const enrichedHistory = officeHistory.map((record, index) => {
      const chipId = buildHistoryId("history", officeID, record.time, record.box, index);
      latestHistoryIdByBox[record.box] = chipId;

      const boxData = boxDataById[record.box];
      const boxHistory = parseJsonArray(boxData?.boxhistory).filter(
        (entry) => entry && entry.office && entry.time
      );
      const matchingIndex = boxHistory.findIndex(
        (entry) =>
          String(entry.office) === String(officeID) &&
          String(entry.time) === String(record.time)
      );

      let retrievedTime = "";
      let duration = "";

      if (matchingIndex !== -1) {
        const nextEntry = boxHistory[matchingIndex + 1];

        if (nextEntry?.time) {
          retrievedTime = String(nextEntry.time);
          duration = formatDuration(
            getClockDifference(String(record.time), String(nextEntry.time))
          );
        } else if (
          boxData?.boxoffice &&
          String(boxData.boxoffice).toLowerCase() === "in safe" &&
          boxData.boxtimein
        ) {
          retrievedTime = String(boxData.boxtimein);
          duration = formatDuration(
            getClockDifference(String(record.time), String(boxData.boxtimein))
          );
        } else if (String(boxData?.boxoffice) === String(officeID)) {
          retrievedTime = "Still in office";
          duration = "In progress";
        } else {
          retrievedTime = "Unavailable";
          duration = "Unavailable";
        }
      } else {
        retrievedTime = "Unavailable";
        duration = "Unavailable";
      }

      const checkedOutWithBoxes = sortNumericStrings(
        (boxesByCheckoutTime[record.time] || []).filter(
          (box) => String(box) !== String(record.box)
        )
      );

      return {
        ...record,
        chipId,
        retrievedTime,
        duration,
        checkedOutWithBoxes,
        timesSeen: timesSeenByBox[record.box] || 0,
      };
    });

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

    const historyItems = enrichedHistory
      .map((record) => {
        return `
          <article class="summary-history-item">
            <div class="summary-history-row summary-history-row-split">
              <div>
                <span class="summary-history-label">Box</span>
                <div class="summary-history-pills">
                  <span
                    class="status-chip summary-history-chip"
                    id="${escapeHtml(record.chipId)}"
                  >
                    ${escapeHtml(record.box)}
                  </span>
                </div>
              </div>
              <div>
                <span class="summary-history-label">Times Seen</span>
                <strong class="summary-history-value">${escapeHtml(
                  record.timesSeen
                )}</strong>
              </div>
            </div>
            <div class="summary-history-row summary-history-row-split">
              <div>
                <span class="summary-history-label">Checked Out At</span>
                <strong class="summary-history-value">${escapeHtml(record.time)}</strong>
              </div>
              <div>
                <span class="summary-history-label">Retrieved</span>
                <strong class="summary-history-value">${escapeHtml(
                  record.retrievedTime
                )}</strong>
              </div>
            </div>
            <div class="summary-history-row summary-history-row-split">
              <div>
                <span class="summary-history-label">Duration In Office</span>
                <strong class="summary-history-value">${escapeHtml(
                  record.duration
                )}</strong>
              </div>
              <div>
                <span class="summary-history-label">Checked Out With</span>
                <div class="summary-history-pills">
                  ${
                    record.checkedOutWithBoxes.length
                      ? record.checkedOutWithBoxes
                          .map(
                            (box) =>
                              `<span class="status-chip">${escapeHtml(box)}</span>`
                          )
                          .join("")
                      : `<span class="summary-history-helper">None</span>`
                  }
                </div>
              </div>
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
  const historyEntry = target.closest(".summary-history-item");

  if (activeHistoryEntry && activeHistoryEntry !== historyEntry) {
    activeHistoryEntry.classList.remove("summary-history-item-active");
    activeHistoryEntry.classList.remove("summary-history-item-flash");
  }

  if (activeHistoryChip && activeHistoryChip !== target) {
    activeHistoryChip.classList.remove("summary-history-chip-selected");
    activeHistoryChip.classList.remove("summary-history-chip-active");
  }

  if (historyEntry) {
    historyEntry.classList.add("summary-history-item-active");
    historyEntry.classList.remove("summary-history-item-flash");
    activeHistoryEntry = historyEntry;
  }

  target.classList.add("summary-history-chip-selected");
  target.classList.remove("summary-history-chip-active");
  activeHistoryChip = target;

  target.scrollIntoView({ behavior: "smooth", block: "center" });
  historyEntry?.offsetWidth;
  historyEntry?.classList.add("summary-history-item-flash");
  target.classList.add("summary-history-chip-active");

  if (historyHighlightTimeoutId) {
    window.clearTimeout(historyHighlightTimeoutId);
  }

  historyHighlightTimeoutId = window.setTimeout(() => {
    target.classList.remove("summary-history-chip-active");
    historyEntry?.classList.remove("summary-history-item-flash");
    historyHighlightTimeoutId = null;
  }, 1600);
});
