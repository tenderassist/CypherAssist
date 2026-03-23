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
const itemSummaryState = {
  itemID: "",
  currentOffice: "",
  uniqueOffices: [],
  enrichedHistory: [],
  selectedOffices: null,
};
let activeHistoryEntry = null;
let activeHistoryChip = null;
let historyHighlightTimeoutId = null;
let lastFilterTrigger = null;

const filterPopup = document.createElement("div");
filterPopup.className = "alert-popup item-filter-popup";
filterPopup.innerHTML = `
  <div class="alert-popup-backdrop" data-item-filter-close></div>
  <div
    class="alert-popup-card office-filter-card"
    role="dialog"
    aria-modal="true"
    aria-labelledby="itemFilterTitle"
    aria-describedby="itemFilterCopy"
    data-ignore-enter
  >
    <div class="alert-popup-head">
      <div>
        <span class="alert-popup-eyebrow">Filter</span>
        <h3 id="itemFilterTitle">Filter Office Logs</h3>
      </div>
      <button
        class="alert-popup-close"
        type="button"
        aria-label="Close office filter"
        data-item-filter-close
      >
        x
      </button>
    </div>
    <p class="alert-popup-copy" id="itemFilterCopy">
      Select the offices you want to include in the item log view.
    </p>
    <div class="office-filter-summary" id="itemFilterSummary"></div>
    <div class="alert-popup-list office-filter-list" id="itemFilterList"></div>
    <div class="office-filter-actions">
      <button
        type="button"
        class="office-filter-action office-filter-reset"
        id="itemFilterResetBtn"
      >
        Reset
      </button>
      <button
        type="button"
        class="office-filter-action office-filter-apply"
        id="itemFilterApplyBtn"
      >
        Apply Filter
      </button>
    </div>
  </div>
`;

document.body.appendChild(filterPopup);

const filterListElement = document.getElementById("itemFilterList");
const filterSummaryElement = document.getElementById("itemFilterSummary");
const filterResetButton = document.getElementById("itemFilterResetBtn");
const filterApplyButton = document.getElementById("itemFilterApplyBtn");

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

function clearHistoryHighlightState() {
  if (historyHighlightTimeoutId) {
    window.clearTimeout(historyHighlightTimeoutId);
    historyHighlightTimeoutId = null;
  }

  activeHistoryEntry = null;
  activeHistoryChip = null;
}

function setFilterPopupOpenState(isOpen) {
  filterPopup.classList.toggle("alert-popup-visible", isOpen);
  document.body.classList.toggle("popup-open", isOpen);
}

function getActiveFilterSelection() {
  return new Set(itemSummaryState.selectedOffices ?? []);
}

function renderFilterPopup() {
  const selectableOffices = itemSummaryState.uniqueOffices;
  const activeSelection = getActiveFilterSelection();
  const selectedCount = [...activeSelection].filter((office) =>
    selectableOffices.includes(office)
  ).length;

  if (!selectableOffices.length) {
    filterSummaryElement.textContent = "No offices are available to filter yet.";
    filterListElement.innerHTML = `<div class="status-empty">Search for an item with recorded office activity first.</div>`;
    filterApplyButton.disabled = true;
    filterResetButton.disabled = true;
    return;
  }

  filterSummaryElement.textContent =
    selectedCount === 0 || selectedCount === selectableOffices.length
      ? `Showing all ${selectableOffices.length} offices.`
      : `Showing ${selectedCount} of ${selectableOffices.length} offices.`;

  filterListElement.innerHTML = selectableOffices
    .map(
      (office) => `
        <label class="office-filter-option">
          <input
            type="checkbox"
            value="${escapeHtml(office)}"
            ${activeSelection.has(office) ? "checked" : ""}
          />
          <span class="office-filter-option-title">${escapeHtml(office)}</span>
        </label>
      `
    )
    .join("");

  filterApplyButton.disabled = false;
  filterResetButton.disabled = false;
}

function openFilterPopup(triggerElement) {
  lastFilterTrigger = triggerElement || document.activeElement;
  renderFilterPopup();
  setFilterPopupOpenState(true);
  filterListElement.querySelector("input")?.focus();
}

function closeFilterPopup() {
  setFilterPopupOpenState(false);

  if (lastFilterTrigger instanceof HTMLElement && lastFilterTrigger.isConnected) {
    lastFilterTrigger.focus();
    return;
  }

  feedbackDiv.querySelector("[data-open-item-filter]")?.focus();
}

function getSelectedOfficesFromPopup() {
  return [...filterListElement.querySelectorAll('input[type="checkbox"]:checked')]
    .map((input) => input.value)
    .filter(Boolean);
}

function getVisibleOffices() {
  if (!itemSummaryState.selectedOffices) {
    return itemSummaryState.uniqueOffices;
  }

  const selectedSet = new Set(itemSummaryState.selectedOffices);
  return itemSummaryState.uniqueOffices.filter((office) => selectedSet.has(office));
}

function getVisibleHistory() {
  if (!itemSummaryState.selectedOffices) {
    return itemSummaryState.enrichedHistory;
  }

  const selectedSet = new Set(itemSummaryState.selectedOffices);
  return itemSummaryState.enrichedHistory.filter((record) =>
    selectedSet.has(record.office)
  );
}

function renderItemSummary() {
  clearHistoryHighlightState();

  const {
    itemID,
    currentOffice,
    uniqueOffices,
    selectedOffices,
  } = itemSummaryState;

  const visibleOffices = getVisibleOffices();
  const visibleHistory = getVisibleHistory();
  const latestVisibleHistoryIdByOffice = {};
  const isFilterActive = Array.isArray(selectedOffices);

  visibleHistory.forEach((record) => {
    latestVisibleHistoryIdByOffice[record.office] = record.chipId;
  });

  const seenOfficesMarkup = visibleOffices.length
    ? visibleOffices
        .map(
          (office) => `
            <button
              type="button"
              class="status-chip status-chip-button"
              data-history-target="${escapeHtml(
                latestVisibleHistoryIdByOffice[office] || ""
              )}"
            >
              ${escapeHtml(office)}
            </button>
          `
        )
        .join("")
    : `<div class="status-empty">${
        isFilterActive
          ? "No offices match the current filter."
          : "No offices recorded yet."
      }</div>`;

  const historyItems = visibleHistory
    .map((record) => {
      return `
        <article class="summary-history-item">
          <div class="summary-history-row summary-history-row-split">
            <div>
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
            <div>
              <span class="summary-history-label">Duration In Office</span>
              <strong class="summary-history-value">${escapeHtml(
                record.duration
              )}</strong>
            </div>
          </div>
          <div class="summary-history-row summary-history-row-split">
            <div>
              <span class="summary-history-label">Booked Out At</span>
              <strong class="summary-history-value">${escapeHtml(record.time)}</strong>
            </div>
            <div>
              <span class="summary-history-label">Booked Out By</span>
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
              <span class="summary-history-label">Booked in By</span>
              <strong class="summary-history-value">${escapeHtml(
                record.retrievedTime === "Still in office"
                  ? "Not yet returned"
                  : record.retrievedBy || "Not recorded"
              )}</strong>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  const historyMarkup = visibleHistory.length
    ? `<div class="summary-history-list">${historyItems}</div>`
    : `<div class="status-empty">${
        isFilterActive
          ? "No office logs match the selected filter."
          : "No recorded history yet."
      }</div>`;

  setFeedback(
    feedbackDiv,
    `
      <div class="summary-result-card">
        <div class="summary-result-head">
          <span class="summary-result-eyebrow">Summary</span>
          <h3>Item ${escapeHtml(itemID)}</h3>
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
              <span class="status-total-label">${isFilterActive ? "Showing:" : "Total:"}</span>
              <span class="status-count">${
                isFilterActive
                  ? `${visibleOffices.length} / ${uniqueOffices.length}`
                  : uniqueOffices.length
              }</span>
            </span>
          </div>
          <div class="status-chips">${seenOfficesMarkup}</div>
        </div>
        <div class="summary-filter-bar">
          <button
            type="button"
            class="summary-filter-button"
            data-open-item-filter
            ${uniqueOffices.length ? "" : "disabled"}
          >
            <span>Filter</span>
            <span class="summary-filter-icon" aria-hidden="true">&#9881;&#xFE0E;</span>
          </button>
        </div>
        ${historyMarkup}
      </div>
    `,
    { html: true }
  );
}

bindEnterToButton(searchButton);

searchButton.addEventListener("click", async () => {
  const boxID = searchInput.value.trim();

  if (!boxID) {
    setFeedback(feedbackDiv, "Please enter a valid item number.", {
      error: true,
    });
    return;
  }

  try {
    setFilterPopupOpenState(false);

    const snapshot = await get(ref(db, `${boxesCollectionPath}/${boxID}`));

    if (!snapshot.exists()) {
      setFeedback(feedbackDiv, `Item ${boxID} not found in the database.`, {
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
      setFeedback(feedbackDiv, `Item ${boxID} has no recorded history.`, {
        error: true,
      });
      return;
    }

    const uniqueOffices = sortNumericStrings([
      ...new Set(boxHistory.map((record) => record.office)),
    ]);

    const enrichedHistory = boxHistory.map((record, index) => {
      const chipId = buildHistoryId("history", boxID, record.time, record.office, index);

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

    itemSummaryState.itemID = boxID;
    itemSummaryState.currentOffice = currentOffice;
    itemSummaryState.uniqueOffices = uniqueOffices;
    itemSummaryState.enrichedHistory = enrichedHistory;
    itemSummaryState.selectedOffices = null;
    renderItemSummary();
  } catch (error) {
    setFeedback(feedbackDiv, "Error retrieving data. Please try again.", {
      error: true,
    });
  }
});

feedbackDiv.addEventListener("click", (event) => {
  const filterButton = event.target.closest("[data-open-item-filter]");
  if (filterButton) {
    if (!itemSummaryState.uniqueOffices.length) return;
    openFilterPopup(filterButton);
    return;
  }

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

filterPopup.addEventListener("click", (event) => {
  if (event.target.closest("[data-item-filter-close]")) {
    closeFilterPopup();
  }
});

filterListElement.addEventListener("change", () => {
  const selectedOffices = getSelectedOfficesFromPopup();
  const totalOffices = itemSummaryState.uniqueOffices.length;

  filterSummaryElement.textContent =
    selectedOffices.length === 0 || selectedOffices.length === totalOffices
      ? `Showing all ${totalOffices} offices.`
      : `Showing ${selectedOffices.length} of ${totalOffices} offices.`;
});

filterResetButton.addEventListener("click", () => {
  itemSummaryState.selectedOffices = null;
  renderItemSummary();
  closeFilterPopup();
});

filterApplyButton.addEventListener("click", () => {
  const selectedOffices = getSelectedOfficesFromPopup();

  itemSummaryState.selectedOffices =
    selectedOffices.length === 0 ||
    selectedOffices.length === itemSummaryState.uniqueOffices.length
      ? null
      : sortNumericStrings(selectedOffices);

  renderItemSummary();
  closeFilterPopup();
});

document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    filterPopup.classList.contains("alert-popup-visible")
  ) {
    closeFilterPopup();
  }
});
