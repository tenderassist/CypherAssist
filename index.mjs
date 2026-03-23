import {
  ref,
  onValue,
} from "firebase/database";
import { db } from "./firebase.mjs";
import { initQuickSearch } from "./quicksearch.mjs";
import {
  getBoxesCollectionPath,
  getOfficesCollectionPath,
  requireAuth,
} from "./auth.mjs";
import { escapeHtml, minutesSinceClockTime, parseJsonArray } from "./utils.mjs";

const user = await requireAuth();
const boxesCollectionPath = getBoxesCollectionPath(user);
const officesCollectionPath = getOfficesCollectionPath(user);

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
};

const totalBoxesElement = document.getElementById("totalBoxes");
const inSafeCountElement = document.getElementById("inSafeCount");
const checkedOutCountElement = document.getElementById("checkedOutCount");
const activeOfficesCountElement = document.getElementById("activeOfficesCount");
const safePercentageElement = document.getElementById("safePercentage");
const statusGaugeElement = document.getElementById("statusGauge");
const legendSafeCountElement = document.getElementById("legendSafeCount");
const legendOutCountElement = document.getElementById("legendOutCount");
const legendTotalCountElement = document.getElementById("legendTotalCount");
const topBoxesListElement = document.getElementById("topBoxesList");
const topOfficesListElement = document.getElementById("topOfficesList");
const favouriteBoxesListElement = document.getElementById("favouriteBoxesList");
const naughtyOfficesListElement = document.getElementById("naughtyOfficesList");
const insightCardElements = document.querySelectorAll(".interactive-insight-card[data-insight-key]");

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

function setInsightPopupOpenState(isOpen) {
  document.body.classList.toggle("popup-open", isOpen);
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
  setInsightPopupOpenState(false);

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
  setInsightPopupOpenState(true);
}

insightPopup.addEventListener("click", (event) => {
  if (event.target.closest("[data-dashboard-popup-close]")) {
    closeInsightPopup();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && insightPopup.classList.contains("alert-popup-visible")) {
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

function renderDashboard() {
  const boxEntries = Object.entries(dashboardState.boxes || {});
  const officeEntries = Object.entries(dashboardState.offices || {}).filter(
    ([officeKey]) => officeKey !== "officecurrent"
  );

  const totalBoxes = boxEntries.length;
  const inSafeCount = boxEntries.filter(([, boxData]) => {
    return (boxData.boxoffice || "In Safe").toLowerCase() === "in safe";
  }).length;
  const checkedOutCount = Math.max(0, totalBoxes - inSafeCount);
  const safePercentage =
    totalBoxes === 0 ? 0 : Math.round((inSafeCount / totalBoxes) * 100);
  const totalOfficesCount = officeEntries.length;

  totalBoxesElement.textContent = totalBoxes;
  inSafeCountElement.textContent = inSafeCount;
  checkedOutCountElement.textContent = checkedOutCount;
  activeOfficesCountElement.textContent = totalOfficesCount;
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

  if (activeInsightKey) {
    renderInsightPopup();
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

renderDashboard();
