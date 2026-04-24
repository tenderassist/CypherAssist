import {
  ref,
  onValue,
} from "firebase/database";
import { db } from "./firebase.mjs";
import { initQuickSearch } from "./quicksearch.mjs";
import {
  getBoxesCollectionPath,
  getOfficesCollectionPath,
  getWeeklyStatsCollectionPath,
  requireAuth,
} from "./auth.mjs";
import {
  escapeHtml,
  minutesSinceClockTime,
  parseJsonArray,
  renderStatusCollection,
  sortNumericStrings,
} from "./utils.mjs";
import {
  buildWeekView,
  buildWeeklyBoxSummaries,
  createWeekContext,
  downloadWeeklyStatsWorkbook,
} from "./weeklystats.mjs";

const user = await requireAuth();
const boxesCollectionPath = getBoxesCollectionPath(user);
const officesCollectionPath = getOfficesCollectionPath(user);
const weeklyStatsCollectionPath = getWeeklyStatsCollectionPath(user);
let activeWeekContext = createWeekContext();
let activeWeekReferenceDate = getWeekReferenceDate(activeWeekContext);
let weeklyStatsUnsubscribe = null;
let weeklyWeekRefreshTimerId = null;

initQuickSearch(db, user);

const dashboardState = {
  boxes: {},
  offices: {},
  insights: {
    topBoxes: [],
    topOffices: [],
    favouriteBoxes: [],
    naughtyOffices: [],
  },
  statusLists: {
    totalItems: [],
    bookedOut: [],
    inSafe: [],
    totalOffices: [],
    activeOffices: [],
    inactiveOffices: [],
  },
  weekly: hydrateWeeklyState(null),
};

function getWeekReferenceDate(weekContext) {
  const [weekYear, weekMonth, weekDay] = String(
    weekContext?.weekStartDateKey || ""
  )
    .split("-")
    .map(Number);

  return new Date(weekYear, weekMonth - 1, weekDay);
}

function getMillisecondsUntilNextMidnight(referenceDate = new Date()) {
  const nextMidnight = new Date(referenceDate);
  nextMidnight.setHours(24, 0, 0, 0);
  return Math.max(1000, nextMidnight.getTime() - referenceDate.getTime() + 1000);
}

const totalBoxesElement = document.getElementById("totalBoxes");
const inSafeCountElement = document.getElementById("inSafeCount");
const checkedOutCountElement = document.getElementById("checkedOutCount");
const totalOfficesCountElement = document.getElementById("totalOfficesCount");
const activeOfficesCountElement = document.getElementById("activeOfficesCount");
const inactiveOfficesCountElement = document.getElementById("inactiveOfficesCount");
const safePercentageElement = document.getElementById("safePercentage");
const statusGaugeElement = document.getElementById("statusGauge");
const legendSafeCountElement = document.getElementById("legendSafeCount");
const legendOutCountElement = document.getElementById("legendOutCount");
const legendTotalCountElement = document.getElementById("legendTotalCount");
const topBoxesListElement = document.getElementById("topBoxesList");
const topOfficesListElement = document.getElementById("topOfficesList");
const favouriteBoxesListElement = document.getElementById("favouriteBoxesList");
const naughtyOfficesListElement = document.getElementById("naughtyOfficesList");
const weeklySummaryTitleElement = document.getElementById("weeklySummaryTitle");
const weeklySummaryMetaElement = document.getElementById("weeklySummaryMeta");
const weeklyStatsGraphElement = document.getElementById("weeklyStatsGraph");
const weeklyExportButton = document.getElementById("weeklyExportButton");
const insightCardElements = document.querySelectorAll(".interactive-insight-card[data-insight-key]");
const statusCardElements = document.querySelectorAll(".interactive-metric-card[data-status-key]");

const INSIGHT_DEFINITIONS = {
  topBoxes: {
    title: "Top 20: Most Booked Out Items",
    description: "Items with the highest booking activity.",
    emptyText: "No item booking history available yet.",
    itemLabel: "bookings",
    container: topBoxesListElement,
  },
  topOffices: {
    title: "Top 20: Busiest Offices",
    description: "Offices that have received the most items.",
    emptyText: "No office activity available yet.",
    itemLabel: "items",
    container: topOfficesListElement,
  },
  favouriteBoxes: {
    title: "Top 20: Favourite Items",
    description: "Items that have spent the longest total time in offices.",
    emptyText: "No item office-duration data available yet.",
    itemLabel: "total",
    container: favouriteBoxesListElement,
    renderOptions: {
      detailFormatter: (item) => `${formatDuration(item.count)} total`,
      countFormatter: (item) => formatDuration(item.count),
    },
  },
  naughtyOffices: {
    title: "Top 20: Naughty List",
    description: "Offices with the most overdue item holds of 120 minutes or more.",
    emptyText: "No offices have kept items for 120 minutes or longer yet.",
    itemLabel: "instances",
    container: naughtyOfficesListElement,
    renderOptions: {
      detailFormatter: (item) =>
        `${item.count} ${item.count === 1 ? "instance" : "instances"} over 120 min`,
    },
  },
};

const STATUS_DEFINITIONS = {
  totalItems: {
    title: "All Items",
    description: "All item numbers currently in the system.",
    emptyText: "No items found.",
    collectionTitle: "Box Numbers",
  },
  bookedOut: {
    title: "Booked Out Items",
    description: "All item numbers that are currently booked out to offices.",
    emptyText: "No items are currently booked out.",
    collectionTitle: "Box Numbers",
  },
  inSafe: {
    title: "Items In Safe",
    description: "All item numbers that are currently in the safe.",
    emptyText: "No items are currently in the safe.",
    collectionTitle: "Box Numbers",
  },
  totalOffices: {
    title: "All Offices",
    description: "All office numbers currently in the system.",
    emptyText: "No offices found.",
    collectionTitle: "Office Numbers",
  },
  activeOffices: {
    title: "Active Offices",
    description: "All office numbers that currently have at least one item assigned.",
    emptyText: "No active offices found.",
    collectionTitle: "Office Numbers",
  },
  inactiveOffices: {
    title: "Inactive Offices",
    description: "All office numbers that currently have no items assigned.",
    emptyText: "No inactive offices found.",
    collectionTitle: "Office Numbers",
  },
};

const insightPopup = document.createElement("div");
insightPopup.className = "alert-popup dashboard-popup";
insightPopup.innerHTML = `
  <div class="alert-popup-backdrop" data-dashboard-popup-close></div>
  <div
    class="alert-popup-card dashboard-popup-card"
    role="dialog"
    aria-modal="true"
    aria-labelledby="dashboardPopupTitle"
  >
    <div class="alert-popup-head">
      <div>
        <span class="alert-popup-eyebrow">Insights</span>
        <h3 id="dashboardPopupTitle"></h3>
      </div>
      <button
        class="alert-popup-close"
        type="button"
        aria-label="Close dashboard list"
        data-dashboard-popup-close
      >
        x
      </button>
    </div>
    <p class="alert-popup-copy" id="dashboardPopupCopy"></p>
    <div class="dashboard-popup-list insight-list" id="dashboardPopupList"></div>
  </div>
`;

document.body.appendChild(insightPopup);

const insightPopupTitleElement = document.getElementById("dashboardPopupTitle");
const insightPopupCopyElement = document.getElementById("dashboardPopupCopy");
const insightPopupListElement = document.getElementById("dashboardPopupList");

let activeInsightKey = null;
let lastInsightTrigger = null;
let activeStatusKey = null;
let lastStatusTrigger = null;
let activeWeeklyDayKey = null;
let activeWeeklyLeaderboardType = "";
let activeWeeklyItemFilter = "";
let lastWeeklyTrigger = null;
let lastWeeklyLeaderboardTrigger = null;
let activeWeeklyHistoryEntry = null;
let activeWeeklyHistoryChip = null;
let weeklyHistoryHighlightTimeoutId = null;

function syncPopupOpenState() {
  document.body.classList.toggle(
    "popup-open",
    Boolean(
      activeInsightKey ||
        activeStatusKey ||
        activeWeeklyDayKey ||
        activeWeeklyLeaderboardType
    )
  );
}

function hydrateWeeklyState(weekData) {
  const weekView = buildWeekView(weekData, activeWeekReferenceDate);

  return {
    ...weekView,
    boxSummaries: buildWeeklyBoxSummaries(weekView),
  };
}

function bindWeeklyStatsListener() {
  if (typeof weeklyStatsUnsubscribe === "function") {
    weeklyStatsUnsubscribe();
  }

  weeklyStatsUnsubscribe = onValue(
    ref(db, `${weeklyStatsCollectionPath}/${activeWeekContext.weekKey}`),
    (snapshot) => {
      dashboardState.weekly = hydrateWeeklyState(
        snapshot.exists() ? snapshot.val() : null
      );
      renderDashboard();
    }
  );
}

function scheduleWeeklyWeekRefresh() {
  if (weeklyWeekRefreshTimerId) {
    window.clearTimeout(weeklyWeekRefreshTimerId);
  }

  weeklyWeekRefreshTimerId = window.setTimeout(() => {
    const nextWeekContext = createWeekContext();

    if (nextWeekContext.weekKey !== activeWeekContext.weekKey) {
      activeWeekContext = nextWeekContext;
      activeWeekReferenceDate = getWeekReferenceDate(nextWeekContext);
      dashboardState.weekly = hydrateWeeklyState(null);
      if (
        activeWeeklyDayKey &&
        !dashboardState.weekly.days.some((day) => day.dateKey === activeWeeklyDayKey)
      ) {
        closeWeeklyPopup();
      }
      bindWeeklyStatsListener();
    }

    renderDashboard();
    scheduleWeeklyWeekRefresh();
  }, getMillisecondsUntilNextMidnight());
}

function getOfficeLabel(officeId) {
  const officeData = dashboardState.offices?.[officeId];
  return `Office ${officeData?.officenum || officeId}`;
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

function getDurationBetween(startTime, endTime) {
  if (!endTime) {
    return minutesSinceClockTime(startTime);
  }

  const startMinutesAgo = minutesSinceClockTime(startTime);
  const endMinutesAgo = minutesSinceClockTime(endTime);

  if (startMinutesAgo == null || endMinutesAgo == null) {
    return null;
  }

  return startMinutesAgo >= endMinutesAgo
    ? startMinutesAgo - endMinutesAgo
    : startMinutesAgo + (24 * 60 - endMinutesAgo);
}

function isOfficeActive(officeData) {
  const currentBoxes = parseJsonArray(officeData?.officecurrent).filter(Boolean);
  return currentBoxes.length > 0;
}

function renderInsightList(
  container,
  items,
  emptyText,
  itemLabel,
  options = {}
) {
  if (!container) return;

  const {
    detailFormatter = (item) => `${item.count} ${itemLabel}`,
    countFormatter = (item) => String(item.count),
  } = options;

  if (!items.length) {
    container.innerHTML = `<div class="insight-empty">${escapeHtml(
      emptyText
    )}</div>`;
    return;
  }

  const maxCount = Math.max(...items.map((item) => item.count), 1);

  container.innerHTML = items
    .map((item, index) => {
      const width = Math.max(18, (item.count / maxCount) * 100);

      return `
        <article class="insight-item">
          <div class="insight-item-top">
            <span class="insight-rank">#${index + 1}</span>
            <div class="insight-copy">
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml(detailFormatter(item))}</span>
            </div>
            <strong class="insight-count">${escapeHtml(countFormatter(item))}</strong>
          </div>
          <div class="insight-bar">
            <span style="width: ${width}%"></span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderInsightPopup() {
  if (!activeInsightKey) return;

  const insightDefinition = INSIGHT_DEFINITIONS[activeInsightKey];
  if (!insightDefinition) return;

  insightPopupTitleElement.textContent = insightDefinition.title;
  insightPopupCopyElement.textContent = insightDefinition.description;

  renderInsightList(
    insightPopupListElement,
    dashboardState.insights[activeInsightKey] || [],
    insightDefinition.emptyText,
    insightDefinition.itemLabel,
    insightDefinition.renderOptions
  );

  insightPopupListElement.scrollTop = 0;
}

function closeInsightPopup() {
  activeInsightKey = null;
  insightPopup.classList.remove("alert-popup-visible");
  syncPopupOpenState();

  if (lastInsightTrigger) {
    lastInsightTrigger.focus();
  }
}

function openInsightPopup(insightKey, triggerElement) {
  if (!INSIGHT_DEFINITIONS[insightKey]) return;

  activeInsightKey = insightKey;
  lastInsightTrigger = triggerElement || null;
  renderInsightPopup();
  insightPopup.classList.add("alert-popup-visible");
  syncPopupOpenState();
}

const statusPopup = document.createElement("div");
statusPopup.className = "alert-popup dashboard-popup";
statusPopup.innerHTML = `
  <div class="alert-popup-backdrop" data-status-popup-close></div>
  <div
    class="alert-popup-card dashboard-popup-card"
    role="dialog"
    aria-modal="true"
    aria-labelledby="statusPopupTitle"
  >
    <div class="alert-popup-head">
      <div>
        <h3 id="statusPopupTitle"></h3>
      </div>
      <button
        class="alert-popup-close"
        type="button"
        aria-label="Close status list"
        data-status-popup-close
      >
        x
      </button>
    </div>
    <p class="alert-popup-copy" id="statusPopupCopy"></p>
    <div class="dashboard-popup-list status-popup-list" id="statusPopupList"></div>
  </div>
`;

document.body.appendChild(statusPopup);

const statusPopupTitleElement = document.getElementById("statusPopupTitle");
const statusPopupCopyElement = document.getElementById("statusPopupCopy");
const statusPopupListElement = document.getElementById("statusPopupList");

const weeklyPopup = document.createElement("div");
weeklyPopup.className = "alert-popup dashboard-popup weekly-popup";
weeklyPopup.innerHTML = `
  <div class="alert-popup-backdrop" data-weekly-popup-close></div>
  <div
    class="alert-popup-card dashboard-popup-card weekly-popup-card"
    role="dialog"
    aria-modal="true"
    aria-labelledby="weeklyPopupTitle"
  >
    <div class="alert-popup-head">
      <div>
        <span class="alert-popup-eyebrow">Weekly Summary</span>
        <h3 id="weeklyPopupTitle"></h3>
      </div>
      <button
        class="alert-popup-close"
        type="button"
        aria-label="Close weekly summary"
        data-weekly-popup-close
      >
        x
      </button>
    </div>
    <p class="alert-popup-copy" id="weeklyPopupCopy"></p>
    <div class="weekly-popup-meta" id="weeklyPopupMeta"></div>
    <div class="weekly-popup-body" id="weeklyPopupBody"></div>
  </div>
`;

document.body.appendChild(weeklyPopup);

const weeklyPopupTitleElement = document.getElementById("weeklyPopupTitle");
const weeklyPopupCopyElement = document.getElementById("weeklyPopupCopy");
const weeklyPopupMetaElement = document.getElementById("weeklyPopupMeta");
const weeklyPopupBodyElement = document.getElementById("weeklyPopupBody");

const weeklyLeaderboardPopup = document.createElement("div");
weeklyLeaderboardPopup.className = "alert-popup dashboard-popup weekly-popup";
weeklyLeaderboardPopup.innerHTML = `
  <div class="alert-popup-backdrop" data-weekly-leaderboard-close></div>
  <div
    class="alert-popup-card dashboard-popup-card weekly-popup-card"
    role="dialog"
    aria-modal="true"
    aria-labelledby="weeklyLeaderboardTitle"
  >
    <div class="alert-popup-head">
      <div>
        <span class="alert-popup-eyebrow">Weekly Summary</span>
        <h3 id="weeklyLeaderboardTitle"></h3>
      </div>
      <button
        class="alert-popup-close"
        type="button"
        aria-label="Close weekly item leaderboard"
        data-weekly-leaderboard-close
      >
        x
      </button>
    </div>
    <p class="alert-popup-copy" id="weeklyLeaderboardCopy"></p>
    <div class="weekly-popup-meta" id="weeklyLeaderboardMeta"></div>
    <div class="weekly-popup-body" id="weeklyLeaderboardBody"></div>
  </div>
`;

document.body.appendChild(weeklyLeaderboardPopup);

const weeklyLeaderboardTitleElement = document.getElementById(
  "weeklyLeaderboardTitle"
);
const weeklyLeaderboardCopyElement = document.getElementById(
  "weeklyLeaderboardCopy"
);
const weeklyLeaderboardMetaElement = document.getElementById(
  "weeklyLeaderboardMeta"
);
const weeklyLeaderboardBodyElement = document.getElementById(
  "weeklyLeaderboardBody"
);

function renderStatusPopup() {
  if (!activeStatusKey) return;

  const statusDefinition = STATUS_DEFINITIONS[activeStatusKey];
  if (!statusDefinition) return;

  statusPopupTitleElement.textContent = statusDefinition.title;
  statusPopupCopyElement.textContent = statusDefinition.description;

  renderStatusCollection(statusPopupListElement, {
    title: statusDefinition.collectionTitle,
    items: dashboardState.statusLists[activeStatusKey] || [],
    emptyText: statusDefinition.emptyText,
  });

  statusPopupListElement.scrollTop = 0;
}

function closeStatusPopup() {
  activeStatusKey = null;
  statusPopup.classList.remove("alert-popup-visible");
  syncPopupOpenState();

  if (lastStatusTrigger) {
    lastStatusTrigger.focus();
  }
}

function openStatusPopup(statusKey, triggerElement) {
  if (!STATUS_DEFINITIONS[statusKey]) return;

  activeStatusKey = statusKey;
  lastStatusTrigger = triggerElement || null;
  renderStatusPopup();
  statusPopup.classList.add("alert-popup-visible");
  syncPopupOpenState();
}

function getWeeklyDay(dayKey) {
  return dashboardState.weekly.days.find((day) => day.dateKey === dayKey) || null;
}

function getWeeklyBoxSummariesForDay(dayKey) {
  return dashboardState.weekly.boxSummaries.filter((summary) =>
    summary.activeDateKeys.includes(dayKey)
  );
}

function getFilteredWeeklyBoxSummariesForDay(dayKey) {
  const itemFilter = String(activeWeeklyItemFilter || "").trim();
  const matchingSummaries = getWeeklyBoxSummariesForDay(dayKey);

  if (!itemFilter) {
    return matchingSummaries;
  }

  return matchingSummaries.filter(
    (summary) => String(summary.boxId || "").trim() === itemFilter
  );
}

function getTopWeeklyBookedOutItems(limit = 20) {
  return [...(dashboardState.weekly?.boxSummaries || [])]
    .sort((left, right) => {
      if (right.totalTimesBookedOut !== left.totalTimesBookedOut) {
        return right.totalTimesBookedOut - left.totalTimesBookedOut;
      }

      if (right.totalTimeSeenMinutes !== left.totalTimeSeenMinutes) {
        return right.totalTimeSeenMinutes - left.totalTimeSeenMinutes;
      }

      return String(left.boxId).localeCompare(String(right.boxId), undefined, {
        numeric: true,
      });
    })
    .slice(0, limit);
}

function getTopWeeklyPopularItems(limit = 20) {
  return [...(dashboardState.weekly?.boxSummaries || [])]
    .sort((left, right) => {
      if (right.totalTimeSeenMinutes !== left.totalTimeSeenMinutes) {
        return right.totalTimeSeenMinutes - left.totalTimeSeenMinutes;
      }

      if (right.totalTimesBookedOut !== left.totalTimesBookedOut) {
        return right.totalTimesBookedOut - left.totalTimesBookedOut;
      }

      return String(left.boxId).localeCompare(String(right.boxId), undefined, {
        numeric: true,
      });
    })
    .slice(0, limit);
}

function clearWeeklyHistoryHighlightState() {
  if (weeklyHistoryHighlightTimeoutId) {
    window.clearTimeout(weeklyHistoryHighlightTimeoutId);
    weeklyHistoryHighlightTimeoutId = null;
  }

  activeWeeklyHistoryEntry?.classList.add("summary-history-item-hidden");
  activeWeeklyHistoryEntry?.classList.remove("summary-history-item-active");
  activeWeeklyHistoryEntry?.classList.remove("summary-history-item-flash");
  activeWeeklyHistoryChip?.classList.remove("summary-history-chip-selected");
  activeWeeklyHistoryChip?.classList.remove("summary-history-chip-active");

  activeWeeklyHistoryEntry = null;
  activeWeeklyHistoryChip = null;
}

function renderWeeklySummary() {
  if (!weeklySummaryMetaElement || !weeklyStatsGraphElement) return;

  const weeklySummary = dashboardState.weekly;

  if (weeklySummaryTitleElement) {
    weeklySummaryTitleElement.textContent = `Weekly Summary: ${weeklySummary.weekLabel}`;
  }

  const peakActiveOffices = weeklySummary.days.reduce((highestCount, day) => {
    const activeOfficeCount = new Set(
      day.journeys
        .map((journey) => String(journey.office || "").trim())
        .filter(Boolean)
    ).size;

    return Math.max(highestCount, activeOfficeCount);
  }, 0);
  const mostPopularItem = [...weeklySummary.boxSummaries]
    .sort((left, right) => {
      if (right.totalTimeSeenMinutes !== left.totalTimeSeenMinutes) {
        return right.totalTimeSeenMinutes - left.totalTimeSeenMinutes;
      }

      return String(left.boxId).localeCompare(String(right.boxId), undefined, {
        numeric: true,
      });
    })[0];
  const mostBookedOutItem = [...weeklySummary.boxSummaries]
    .sort((left, right) => {
      if (right.totalTimesBookedOut !== left.totalTimesBookedOut) {
        return right.totalTimesBookedOut - left.totalTimesBookedOut;
      }

      return String(left.boxId).localeCompare(String(right.boxId), undefined, {
        numeric: true,
      });
    })[0];
  const today = new Date();
  const todayDateKey = `${today.getFullYear()}-${String(
    today.getMonth() + 1
  ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const maxBookedOutItemCount = Math.max(
    ...weeklySummary.days.map((day) => day.bookedOutBoxCount),
    1
  );

  weeklySummaryMetaElement.innerHTML = `
    <span class="status-chip">Peak Active Offices: ${peakActiveOffices}</span>
    <button
      type="button"
      class="status-chip status-chip-button"
      data-weekly-summary-action="most-popular"
    >Most popular item: ${escapeHtml(
      mostPopularItem
        ? `Item ${mostPopularItem.boxId} (${mostPopularItem.totalTimeSeenLabel})`
        : "None yet"
    )}</button>
    <button
      type="button"
      class="status-chip status-chip-button"
      data-weekly-summary-action="most-booked-out"
    >Most booked out item: ${escapeHtml(
      mostBookedOutItem
        ? `Item ${mostBookedOutItem.boxId} (${mostBookedOutItem.totalTimesBookedOut})`
        : "None yet"
    )}</button>
  `;

  weeklyStatsGraphElement.innerHTML = `
    <div class="weekly-bar-chart-shell">
      <div class="weekly-bar-chart-head">
        <div>
          <strong class="weekly-bar-chart-title">Weekly activity at a glance</strong>
        </div>
        <span class="weekly-bar-chart-note">Click a bar to open the item summaries for that day.</span>
      </div>
      <div class="weekly-bar-chart">
        ${weeklySummary.days
          .map((day) => {
            const height =
              day.bookedOutBoxCount > 0
                ? Math.max(10, (day.bookedOutBoxCount / maxBookedOutItemCount) * 100)
                : 0;
            const isPeakDay =
              day.bookedOutBoxCount > 0 && day.bookedOutBoxCount === maxBookedOutItemCount;
            const isToday = day.dateKey === todayDateKey;

            return `
              <button
                type="button"
                class="weekly-bar-button${
                  day.bookedOutBoxCount ? "" : " weekly-bar-button-idle"
                }${isPeakDay ? " weekly-bar-button-peak" : ""}${
                  isToday ? " weekly-bar-button-today" : ""
                }"
                data-weekly-day-key="${escapeHtml(day.dateKey)}"
                aria-label="${escapeHtml(
                  `${day.dayLabel}: ${day.bookedOutBoxCount} ${
                    day.bookedOutBoxCount === 1 ? "item" : "items"
                  } booked out`
                )}"
              >
                ${
                  isToday
                    ? '<span class="weekly-bar-chip">Today</span>'
                    : '<span class="weekly-bar-chip weekly-bar-chip-hidden" aria-hidden="true"></span>'
                }
                <span class="weekly-bar-track" aria-hidden="true">
                  <span class="weekly-bar-grid"></span>
                  <span class="weekly-bar-fill" style="height: ${height}%"></span>
                </span>
                <span class="weekly-bar-day">${escapeHtml(day.dayName)}</span>
                <span class="weekly-bar-date">${escapeHtml(day.displayDate)}</span>
                <span class="weekly-bar-meta">${day.checkoutCount} ${
                  day.checkoutCount === 1 ? "booking" : "bookings"
                }</span>
              </button>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderWeeklyHistoryEntry(entry) {
  const isCurrentlyInOffice = entry.returnedLabel === "Still in office";
  const durationLabel = isCurrentlyInOffice
    ? String(entry.durationLabel || "").replace(/\s+so far$/i, "")
    : entry.durationLabel;

  return `
    <article class="summary-history-item summary-history-item-hidden" id="${escapeHtml(
      entry.detailId
    )}">
      <div class="summary-history-row summary-history-row-split">
        <div>
          <span class="summary-history-label">Office</span>
          <strong class="summary-history-value">${escapeHtml(
            entry.officeLabel
          )}</strong>
        </div>
        <div>
          <span class="summary-history-label">Duration In Office</span>
          <strong class="summary-history-value">${escapeHtml(
            `${durationLabel}${isCurrentlyInOffice ? " (Currently in office)" : ""}`
          )}</strong>
        </div>
      </div>
      <div class="summary-history-row summary-history-row-split">
        <div>
          <span class="summary-history-label">Day</span>
          <strong class="summary-history-value">${escapeHtml(
            entry.dayLabel
          )}</strong>
        </div>
        <div>
          <span class="summary-history-label">Times Seen</span>
          <strong class="summary-history-value">${escapeHtml(
            String(entry.officeSeenCount || 0)
          )}</strong>
        </div>
      </div>
      <div class="summary-history-row summary-history-row-split">
        <div>
          <span class="summary-history-label">Booked Out At</span>
          <strong class="summary-history-value">${escapeHtml(
            entry.checkedOutLabel
          )}</strong>
        </div>
        <div>
          <span class="summary-history-label">Booked Out By</span>
          <strong class="summary-history-value">${escapeHtml(
            entry.checkedOutBy || "Not recorded"
          )}</strong>
        </div>
      </div>
      <div class="summary-history-row summary-history-row-split">
        <div>
          <span class="summary-history-label">Retrieved</span>
          <strong class="summary-history-value">${escapeHtml(
            entry.returnedLabel
          )}</strong>
        </div>
        <div>
          <span class="summary-history-label">Booked In By</span>
          <strong class="summary-history-value">${escapeHtml(
            entry.returnedLabel === "Still in office"
              ? "Not yet returned"
              : entry.returnedBy || "Not recorded"
          )}</strong>
        </div>
      </div>
    </article>
  `;
}

function renderWeeklyItemSummaryCard(summary, selectedDay) {
  const selectedDayEntries = summary.historyEntries.filter(
    (entry) => entry.dateKey === selectedDay.dateKey
  );
  const dayOfficeSeenCounts = selectedDayEntries.reduce((counts, entry) => {
    const officeKey = String(entry.office || "").trim();
    if (!officeKey) {
      return counts;
    }

    counts[officeKey] = (counts[officeKey] || 0) + 1;
    return counts;
  }, {});
  const selectedDayDurationMinutes = selectedDayEntries.reduce(
    (total, entry) =>
      total +
      (Number.isFinite(Number(entry.durationMinutes)) &&
      Number(entry.durationMinutes) >= 0
        ? Number(entry.durationMinutes)
        : 0),
    0
  );
  const officesMarkup = selectedDayEntries.length
    ? selectedDayEntries
        .map(
          (entry) => {
            const isCurrentlyInOffice = entry.returnedLabel === "Still in office";
            const officeDurationLabel = isCurrentlyInOffice
              ? `${String(entry.durationLabel || "").replace(/\s+so far$/i, "")} (Currently in office)`
              : entry.durationLabel;

            return `
            <button
              type="button"
              class="weekly-office-pill"
              data-weekly-history-target="${escapeHtml(entry.detailId)}"
              title="${escapeHtml(
                `${entry.officeLabel} booked out at ${entry.checkedOutLabel}`
              )}"
            >
              <span class="weekly-office-pill-name">${escapeHtml(
                entry.officeLabel
              )}</span>
              <span class="weekly-office-pill-time">${escapeHtml(
                officeDurationLabel
              )}</span>
            </button>
          `;
          }
        )
        .join("")
    : `<span class="weekly-box-day-empty">No office visits</span>`;
  const historyMarkup = selectedDayEntries.length
    ? `
        <div class="summary-history-list">
          ${selectedDayEntries
            .map((entry) =>
              renderWeeklyHistoryEntry({
                ...entry,
                officeSeenCount: dayOfficeSeenCounts[String(entry.office || "").trim()] || 0,
              })
            )
            .join("")}
        </div>
      `
    : "";

  return `
    <article class="summary-result-card weekly-box-summary-card">
      <div class="summary-result-head">
        <span class="summary-result-eyebrow">Item Summary</span>
        <h3>Item ${escapeHtml(summary.boxId)}</h3>
      </div>
      <div class="summary-seen-boxes">
        <div class="summary-section-head">
          <span class="summary-section-title">Totals</span>
        </div>
        <div class="status-chips">
          <span class="status-chip">Total Times Booked Out: ${
            selectedDayEntries.length
          }</span>
          <span class="status-chip">Total Duration in Offices: ${escapeHtml(
            formatDuration(selectedDayDurationMinutes)
          )}</span>
        </div>
      </div>
      <div class="summary-seen-boxes">
        <div class="summary-section-head">
          <span class="summary-section-title">Offices Seen ${escapeHtml(
            selectedDay.dayName
          )}</span>
        </div>
        <div class="weekly-office-pill-list">${officesMarkup}</div>
      </div>
      ${historyMarkup}
    </article>
  `;
}

function renderWeeklyPopup() {
  if (!activeWeeklyDayKey) return;

  const selectedDay = getWeeklyDay(activeWeeklyDayKey);
  if (!selectedDay) return;

  clearWeeklyHistoryHighlightState();

  const boxSummaries = getFilteredWeeklyBoxSummariesForDay(activeWeeklyDayKey);
  const itemFilter = escapeHtml(String(activeWeeklyItemFilter || "").trim());

  weeklyPopupTitleElement.textContent = selectedDay.dayLabel;
  weeklyPopupCopyElement.textContent =
    "Each item card shows the item totals and the offices it visited on this day. Click an office to open the detailed visit entry.";
  weeklyPopupMetaElement.innerHTML = `
    <span class="status-chip">Total book outs: ${selectedDay.bookedOutBoxCount}</span>
    <label class="weekly-popup-search-field" aria-label="Filter items for this day">
      <input
        type="search"
        class="input weekly-popup-search-input"
        id="weeklyPopupSearchInput"
        data-weekly-item-filter
        placeholder="Filter by item number"
        inputmode="numeric"
        autocomplete="off"
        value="${itemFilter}"
      />
    </label>
  `;

  weeklyPopupBodyElement.innerHTML = boxSummaries.length
    ? `<div class="weekly-box-summary-grid">${boxSummaries
        .map((summary) => renderWeeklyItemSummaryCard(summary, selectedDay))
        .join("")}</div>`
    : `<div class="weekly-popup-empty">${
        itemFilter
          ? `No items match "${itemFilter}" for this day.`
          : "No items were booked out on this day."
      }</div>`;

  weeklyPopupBodyElement.scrollTop = 0;
}

function renderWeeklyLeaderboardPopup() {
  if (!activeWeeklyLeaderboardType) return;

  const isMostPopular = activeWeeklyLeaderboardType === "most-popular";
  const rankedItems = isMostPopular
    ? getTopWeeklyPopularItems(20)
    : getTopWeeklyBookedOutItems(20);
  const leaderboardItems = rankedItems.map((summary) => ({
    label: `Item ${summary.boxId}`,
    count: isMostPopular
      ? summary.totalTimeSeenMinutes
      : summary.totalTimesBookedOut,
  }));

  clearWeeklyHistoryHighlightState();

  weeklyLeaderboardTitleElement.textContent = isMostPopular
    ? "Top 20 Most Popular Items"
    : "Top 20 Most Booked Out Items";
  weeklyLeaderboardCopyElement.textContent =
    isMostPopular
      ? "This weekly view ranks items by total time spent out during the week."
      : "This weekly view ranks the busiest items by total bookings across the week.";
  weeklyLeaderboardMetaElement.innerHTML = `
    <span class="status-chip">Week: ${escapeHtml(
      dashboardState.weekly.weekLabel
    )}</span>
  `;

  renderInsightList(
    weeklyLeaderboardBodyElement,
    leaderboardItems,
    "No weekly item activity has been recorded yet.",
    isMostPopular ? "total" : "bookings",
    isMostPopular
      ? {
          detailFormatter: (item) => `${formatDuration(item.count)} total`,
          countFormatter: (item) => formatDuration(item.count),
        }
      : undefined
  );

  weeklyLeaderboardBodyElement.scrollTop = 0;
}

function closeWeeklyPopup() {
  clearWeeklyHistoryHighlightState();
  activeWeeklyDayKey = null;
  activeWeeklyItemFilter = "";
  weeklyPopup.classList.remove("alert-popup-visible");
  syncPopupOpenState();

  if (lastWeeklyTrigger) {
    lastWeeklyTrigger.focus();
  }
}

function closeWeeklyLeaderboardPopup() {
  clearWeeklyHistoryHighlightState();
  activeWeeklyLeaderboardType = "";
  weeklyLeaderboardPopup.classList.remove("alert-popup-visible");
  syncPopupOpenState();

  if (lastWeeklyLeaderboardTrigger) {
    lastWeeklyLeaderboardTrigger.focus();
  }
}

function openWeeklyPopup(dayKey, triggerElement) {
  if (!getWeeklyDay(dayKey)) return;

  activeWeeklyDayKey = dayKey;
  activeWeeklyItemFilter = "";
  lastWeeklyTrigger = triggerElement || null;
  renderWeeklyPopup();
  weeklyPopup.classList.add("alert-popup-visible");
  syncPopupOpenState();
}

function openWeeklyLeaderboardPopup(type, triggerElement) {
  activeWeeklyLeaderboardType = type;
  lastWeeklyLeaderboardTrigger = triggerElement || null;
  renderWeeklyLeaderboardPopup();
  weeklyLeaderboardPopup.classList.add("alert-popup-visible");
  syncPopupOpenState();
}

insightPopup.addEventListener("click", (event) => {
  if (event.target.closest("[data-dashboard-popup-close]")) {
    closeInsightPopup();
  }
});

statusPopup.addEventListener("click", (event) => {
  if (event.target.closest("[data-status-popup-close]")) {
    closeStatusPopup();
  }
});

weeklyPopup.addEventListener("click", (event) => {
  if (event.target.closest("[data-weekly-popup-close]")) {
    closeWeeklyPopup();
  }
});

weeklyLeaderboardPopup.addEventListener("click", (event) => {
  if (event.target.closest("[data-weekly-leaderboard-close]")) {
    closeWeeklyLeaderboardPopup();
  }
});

weeklyPopup.addEventListener("input", (event) => {
  const filterInput = event.target.closest("[data-weekly-item-filter]");
  if (!(filterInput instanceof HTMLInputElement)) return;

  activeWeeklyItemFilter = filterInput.value.trim();
  renderWeeklyPopup();

  const refreshedFilterInput = document.getElementById("weeklyPopupSearchInput");
  if (refreshedFilterInput instanceof HTMLInputElement) {
    refreshedFilterInput.focus();
    const selectionEnd = refreshedFilterInput.value.length;
    refreshedFilterInput.setSelectionRange(selectionEnd, selectionEnd);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;

  if (weeklyLeaderboardPopup.classList.contains("alert-popup-visible")) {
    closeWeeklyLeaderboardPopup();
    return;
  }

  if (weeklyPopup.classList.contains("alert-popup-visible")) {
    closeWeeklyPopup();
    return;
  }

  if (statusPopup.classList.contains("alert-popup-visible")) {
    closeStatusPopup();
    return;
  }

  if (insightPopup.classList.contains("alert-popup-visible")) {
    closeInsightPopup();
  }
});

insightCardElements.forEach((card) => {
  card.addEventListener("click", () => {
    openInsightPopup(card.dataset.insightKey, card);
  });

  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    openInsightPopup(card.dataset.insightKey, card);
  });
});

statusCardElements.forEach((card) => {
  card.addEventListener("click", () => {
    openStatusPopup(card.dataset.statusKey, card);
  });

  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    openStatusPopup(card.dataset.statusKey, card);
  });
});

weeklyStatsGraphElement?.addEventListener("click", (event) => {
  const dayButton = event.target.closest("[data-weekly-day-key]");
  if (!dayButton) return;

  openWeeklyPopup(dayButton.dataset.weeklyDayKey, dayButton);
});

weeklySummaryMetaElement?.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-weekly-summary-action]");
  if (!actionButton) return;

  if (
    actionButton.dataset.weeklySummaryAction === "most-booked-out" ||
    actionButton.dataset.weeklySummaryAction === "most-popular"
  ) {
    openWeeklyLeaderboardPopup(
      actionButton.dataset.weeklySummaryAction,
      actionButton
    );
  }
});

function handleWeeklyHistoryChipClick(event) {
  const chip = event.target.closest("[data-weekly-history-target]");
  if (!chip) return;

  const targetId = chip.getAttribute("data-weekly-history-target");
  if (!targetId) return;

  const target = document.getElementById(targetId);
  if (!target) return;
  const historyEntry = target.closest(".summary-history-item") || target;

  if (activeWeeklyHistoryEntry && activeWeeklyHistoryEntry !== historyEntry) {
    activeWeeklyHistoryEntry.classList.add("summary-history-item-hidden");
    activeWeeklyHistoryEntry.classList.remove("summary-history-item-active");
    activeWeeklyHistoryEntry.classList.remove("summary-history-item-flash");
  }

  if (activeWeeklyHistoryChip && activeWeeklyHistoryChip !== chip) {
    activeWeeklyHistoryChip.classList.remove("summary-history-chip-selected");
    activeWeeklyHistoryChip.classList.remove("summary-history-chip-active");
  }

  if (historyEntry) {
    historyEntry.classList.remove("summary-history-item-hidden");
    historyEntry.classList.add("summary-history-item-active");
    historyEntry.classList.remove("summary-history-item-flash");
    activeWeeklyHistoryEntry = historyEntry;
  }

  chip.classList.add("summary-history-chip-selected");
  chip.classList.remove("summary-history-chip-active");
  activeWeeklyHistoryChip = chip;

  historyEntry.scrollIntoView({ behavior: "smooth", block: "nearest" });
  historyEntry?.offsetWidth;
  historyEntry?.classList.add("summary-history-item-flash");
  chip.classList.add("summary-history-chip-active");

  if (weeklyHistoryHighlightTimeoutId) {
    window.clearTimeout(weeklyHistoryHighlightTimeoutId);
  }

  weeklyHistoryHighlightTimeoutId = window.setTimeout(() => {
    chip.classList.remove("summary-history-chip-active");
    historyEntry?.classList.remove("summary-history-item-flash");
    weeklyHistoryHighlightTimeoutId = null;
  }, 1600);
}

weeklyPopupBodyElement?.addEventListener("click", handleWeeklyHistoryChipClick);
weeklyLeaderboardBodyElement?.addEventListener(
  "click",
  handleWeeklyHistoryChipClick
);

weeklyExportButton?.addEventListener("click", () => {
  downloadWeeklyStatsWorkbook(dashboardState.weekly);
});

function renderDashboard() {
  const boxEntries = Object.entries(dashboardState.boxes || {});
  const officeEntries = Object.entries(dashboardState.offices || {}).filter(
    ([officeKey]) => officeKey !== "officecurrent"
  );

  const totalItemNumbers = sortNumericStrings(
    boxEntries.map(([boxId, boxData]) => String(boxData.boxnum || boxId))
  );
  const totalBoxes = boxEntries.length;
  const inSafeBoxes = sortNumericStrings(
    boxEntries
      .filter(([, boxData]) => {
        return (boxData.boxoffice || "In Safe").toLowerCase() === "in safe";
      })
      .map(([boxId, boxData]) => String(boxData.boxnum || boxId))
  );
  const bookedOutBoxes = sortNumericStrings(
    boxEntries
      .filter(([, boxData]) => {
        return (boxData.boxoffice || "In Safe").toLowerCase() !== "in safe";
      })
      .map(([boxId, boxData]) => String(boxData.boxnum || boxId))
  );
  const inSafeCount = inSafeBoxes.length;
  const checkedOutCount = bookedOutBoxes.length;
  const safePercentage =
    totalBoxes === 0 ? 0 : Math.round((inSafeCount / totalBoxes) * 100);
  const totalOfficeNumbers = sortNumericStrings(
    officeEntries.map(([officeId, officeData]) => String(officeData.officenum || officeId))
  );
  const totalOfficesCount = officeEntries.length;
  const activeOfficeNumbers = sortNumericStrings(
    officeEntries
      .filter(([, officeData]) => isOfficeActive(officeData))
      .map(([officeId, officeData]) => String(officeData.officenum || officeId))
  );
  const inactiveOfficeNumbers = sortNumericStrings(
    officeEntries
      .filter(([, officeData]) => !isOfficeActive(officeData))
      .map(([officeId, officeData]) => String(officeData.officenum || officeId))
  );
  const activeOfficesCount = activeOfficeNumbers.length;
  const inactiveOfficesCount = inactiveOfficeNumbers.length;

  dashboardState.statusLists = {
    totalItems: totalItemNumbers,
    bookedOut: bookedOutBoxes,
    inSafe: inSafeBoxes,
    totalOffices: totalOfficeNumbers,
    activeOffices: activeOfficeNumbers,
    inactiveOffices: inactiveOfficeNumbers,
  };

  totalBoxesElement.textContent = totalBoxes;
  inSafeCountElement.textContent = inSafeCount;
  checkedOutCountElement.textContent = checkedOutCount;
  totalOfficesCountElement.textContent = totalOfficesCount;
  activeOfficesCountElement.textContent = activeOfficesCount;
  inactiveOfficesCountElement.textContent = inactiveOfficesCount;
  safePercentageElement.textContent = `${safePercentage}%`;
  legendSafeCountElement.textContent = inSafeCount;
  legendOutCountElement.textContent = checkedOutCount;
  legendTotalCountElement.textContent = totalBoxes;
  statusGaugeElement.style.setProperty("--gauge-safe", `${safePercentage}%`);

  const topBoxes = boxEntries
    .map(([boxId, boxData]) => ({
      label: `Item ${boxData.boxnum || boxId}`,
      count: parseJsonArray(boxData.boxhistory).length,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const topOffices = officeEntries
    .map(([officeId, officeData]) => ({
      label: getOfficeLabel(officeId),
      count: parseJsonArray(officeData.officehistory).length,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const favouriteBoxesTotals = new Map();
  const naughtyOfficeCounts = new Map();

  boxEntries.forEach(([boxId, boxData]) => {
    const boxHistory = parseJsonArray(boxData.boxhistory).filter(
      (record) => record && record.office && record.time
    );

    let totalMinutes = 0;

    boxHistory.forEach((record, index) => {
      const nextEntry = boxHistory[index + 1];
      let duration = null;

      if (nextEntry?.time) {
        duration = getDurationBetween(record.time, nextEntry.time);
      } else if (
        String(boxData.boxoffice || "").toLowerCase() === "in safe" &&
        boxData.boxtimein
      ) {
        duration = getDurationBetween(record.time, boxData.boxtimein);
      } else if (String(boxData.boxoffice) === String(record.office)) {
        duration = getDurationBetween(record.time);
      }

      if (!Number.isFinite(duration) || duration == null || duration < 0) {
        return;
      }

      totalMinutes += duration;

      if (duration >= 120) {
        const officeKey = String(record.office);
        naughtyOfficeCounts.set(officeKey, (naughtyOfficeCounts.get(officeKey) || 0) + 1);
      }
    });

    if (totalMinutes > 0) {
      favouriteBoxesTotals.set(boxData.boxnum || boxId, totalMinutes);
    }
  });

  const favouriteBoxes = [...favouriteBoxesTotals.entries()]
    .map(([boxLabel, count]) => ({
      label: `Item ${boxLabel}`,
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const naughtyOffices = [...naughtyOfficeCounts.entries()]
    .map(([officeId, count]) => ({
      label: getOfficeLabel(officeId),
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  dashboardState.insights = {
    topBoxes,
    topOffices,
    favouriteBoxes,
    naughtyOffices,
  };

  Object.entries(INSIGHT_DEFINITIONS).forEach(([insightKey, insightDefinition]) => {
    renderInsightList(
      insightDefinition.container,
      (dashboardState.insights[insightKey] || []).slice(0, 5),
      insightDefinition.emptyText,
      insightDefinition.itemLabel,
      insightDefinition.renderOptions
    );
  });

  renderWeeklySummary();

  if (activeInsightKey) {
    renderInsightPopup();
  }

  if (activeStatusKey) {
    renderStatusPopup();
  }

  if (activeWeeklyDayKey) {
    renderWeeklyPopup();
  }

  if (activeWeeklyLeaderboardType) {
    renderWeeklyLeaderboardPopup();
  }
}

onValue(ref(db, boxesCollectionPath), (snapshot) => {
  dashboardState.boxes = snapshot.exists() ? snapshot.val() : {};
  renderDashboard();
});

onValue(ref(db, officesCollectionPath), (snapshot) => {
  dashboardState.offices = snapshot.exists() ? snapshot.val() : {};
  renderDashboard();
});

bindWeeklyStatsListener();
scheduleWeeklyWeekRefresh();
renderDashboard();
