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
  requireAuth,
} from "./auth.mjs";

const user = await requireAuth();
const boxesCollectionPath = getBoxesCollectionPath(user);

initQuickSearch(db, user);

const searchButton = document.getElementById("searchboxbtn");
const searchInput = document.getElementById("searchboxnum");
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

function getCheckedOutName(record, boxData, nextEntry) {
  if (record?.name) return String(record.name);

  const isLatestRecordedCheckout =
    !nextEntry && String(boxData.boxtimeout || "") === String(record.time || "");

  return isLatestRecordedCheckout ? String(boxData.boxtempout || "") : "";
}

function getRetrievedName(record, boxData, nextEntry) {
  if (nextEntry?.name) return String(nextEntry.name);

  const wasRetrievedIntoSafe =
    String(boxData.boxoffice).toLowerCase() === "in safe" &&
    String(boxData.boxtimein || "") === String(record.retrievedTime || "");

  if (wasRetrievedIntoSafe) {
    return String(boxData.boxtempin || "");
  }

  const isLatestRecordedMove =
    nextEntry && String(boxData.boxtimeout || "") === String(nextEntry.time || "");

  return isLatestRecordedMove ? String(boxData.boxtempout || "") : "";
}

bindEnterToButton(searchButton);

searchButton.addEventListener("click", async () => {
  const boxID = searchInput.value.trim();

  if (!boxID) {
    setFeedback(feedbackDiv, "Please enter a valid box or special number.", {
      error: true,
    });
    return;
  }

  try {
    const snapshot = await get(ref(db, `${boxesCollectionPath}/${boxID}`));

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

    const latestHistoryIdByOffice = {};

    const uniqueOffices = sortNumericStrings([
      ...new Set(boxHistory.map((record) => record.office)),
    ]);

    const enrichedHistory = boxHistory.map((record, index) => {
      const chipId = buildHistoryId("history", boxID, record.time, record.office, index);
      latestHistoryIdByOffice[record.office] = chipId;

      const nextEntry = boxHistory[index + 1];
      let retrievedTime = "";
      let checkedOutBy = "";
      let retrievedBy = "";
      let duration = "";

      if (nextEntry?.time) {
        retrievedTime = String(nextEntry.time);
        duration = formatDuration(
          getClockDifference(String(record.time), String(nextEntry.time))
        );
      } else if (
        String(boxData.boxoffice).toLowerCase() === "in safe" &&
        boxData.boxtimein
      ) {
        retrievedTime = String(boxData.boxtimein);
        duration = formatDuration(
          getClockDifference(String(record.time), String(boxData.boxtimein))
        );
      } else if (String(boxData.boxoffice) === String(record.office)) {
        retrievedTime = "Still in office";
        duration = "In progress";
      } else {
        retrievedTime = "Unavailable";
        duration = "Unavailable";
      }

      checkedOutBy = getCheckedOutName(record, boxData, nextEntry);
      retrievedBy = getRetrievedName(
        { ...record, retrievedTime },
        boxData,
        nextEntry
      );

      return {
        ...record,
        chipId,
        checkedOutBy,
        retrievedTime,
        retrievedBy,
        duration,
      };
    });

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

    const historyItems = enrichedHistory
      .map((record) => {
        return `
          <article class="summary-history-item">
            <div class="summary-history-row">
              <span class="summary-history-label">Office</span>
              <div class="summary-history-pills">
                <span
                  class="status-chip summary-history-chip"
                  id="${escapeHtml(record.chipId)}"
                >
                  ${escapeHtml(record.office)}
                </span>
              </div>
            </div>
            <div class="summary-history-row summary-history-row-split">
              <div>
                <span class="summary-history-label">Checked Out At</span>
                <strong class="summary-history-value">${escapeHtml(record.time)}</strong>
              </div>
              <div>
                <span class="summary-history-label">Checked Out By</span>
                <strong class="summary-history-value">${escapeHtml(
                  record.checkedOutBy || "Not recorded"
                )}</strong>
              </div>
            </div>
            <div class="summary-history-row summary-history-row-split">
              <div>
                <span class="summary-history-label">Retrieved</span>
                <strong class="summary-history-value">${escapeHtml(
                  record.retrievedTime
                )}</strong>
              </div>
              <div>
                <span class="summary-history-label">Checked In By</span>
                <strong class="summary-history-value">${escapeHtml(
                  record.retrievedTime === "Still in office"
                    ? "Not yet returned"
                    : record.retrievedBy || "Not recorded"
                )}</strong>
              </div>
            </div>
            <div class="summary-history-row">
              <span class="summary-history-label">Duration In Office</span>
              <strong class="summary-history-value">${escapeHtml(
                record.duration
              )}</strong>
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
