import {
  ref,
  onValue,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { db } from "./firebase.mjs";
import { initQuickSearch } from "./quicksearch.mjs";
import { escapeHtml, parseJsonArray } from "./utils.mjs";

initQuickSearch(db);

const dashboardState = {
  boxes: {},
  offices: {},
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

function renderInsightList(container, items, emptyText, itemLabel) {
  if (!container) return;

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
              <span>${item.count} ${escapeHtml(itemLabel)}</span>
            </div>
            <strong class="insight-count">${item.count}</strong>
          </div>
          <div class="insight-bar">
            <span style="width: ${width}%"></span>
          </div>
        </article>
      `;
    })
    .join("");
}

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

  totalBoxesElement.textContent = totalBoxes;
  inSafeCountElement.textContent = inSafeCount;
  checkedOutCountElement.textContent = checkedOutCount;
  activeOfficesCountElement.textContent = officeEntries.length;
  safePercentageElement.textContent = `${safePercentage}%`;
  legendSafeCountElement.textContent = inSafeCount;
  legendOutCountElement.textContent = checkedOutCount;
  legendTotalCountElement.textContent = totalBoxes;
  statusGaugeElement.style.setProperty("--gauge-safe", `${safePercentage}%`);

  const topBoxes = boxEntries
    .map(([boxId, boxData]) => ({
      label: `Box ${boxData.boxnum || boxId}`,
      count: parseJsonArray(boxData.boxhistory).length,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topOffices = officeEntries
    .map(([officeId, officeData]) => ({
      label: `Office ${officeData.officenum || officeId}`,
      count: parseJsonArray(officeData.officehistory).length,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  renderInsightList(
    topBoxesListElement,
    topBoxes,
    "No box booking history available yet.",
    "bookings"
  );
  renderInsightList(
    topOfficesListElement,
    topOffices,
    "No office activity available yet.",
    "boxes"
  );
}

onValue(ref(db, "boxes"), (snapshot) => {
  dashboardState.boxes = snapshot.exists() ? snapshot.val() : {};
  renderDashboard();
});

onValue(ref(db, "offices"), (snapshot) => {
  dashboardState.offices = snapshot.exists() ? snapshot.val() : {};
  renderDashboard();
});

renderDashboard();
