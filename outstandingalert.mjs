import { ref, get } from "firebase/database";
import { db } from "./firebase.mjs";
import { escapeHtml, minutesSinceClockTime } from "./utils.mjs";

const ALERT_STORAGE_KEY = "cypher-overdue-alerted";

const popup = document.createElement("div");
popup.className = "alert-popup";
popup.innerHTML = `
  <div class="alert-popup-backdrop" data-alert-close></div>
  <div class="alert-popup-card" role="dialog" aria-modal="true" aria-labelledby="alertPopupTitle">
    <div class="alert-popup-head">
      <div>
        <span class="alert-popup-eyebrow">&#x26A0;&#xFE0E;WARNING!!!</span>
        <h3 id="alertPopupTitle">Outstanding Box Alert</h3>
      </div>
      <button class="alert-popup-close" type="button" aria-label="Close alert" data-alert-close>x</button>
    </div>
    <p class="alert-popup-copy">
      One or more boxes have been out for longer than 60 minutes.
    </p>
    <div class="alert-popup-list" id="alertPopupList"></div>
  </div>
`;

document.body.appendChild(popup);

const popupList = document.getElementById("alertPopupList");

function getAlertedKeys() {
  try {
    const stored = JSON.parse(localStorage.getItem(ALERT_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(stored) ? stored : []);
  } catch {
    return new Set();
  }
}

function saveAlertedKeys(keys) {
  localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify([...keys]));
}

function closePopup() {
  popup.classList.remove("alert-popup-visible");
}

popup.addEventListener("click", (event) => {
  if (event.target.closest("[data-alert-close]")) {
    closePopup();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closePopup();
  }
});

async function checkOutstandingAlerts() {
  const snapshot = await get(ref(db, "boxes"));
  if (!snapshot.exists()) {
    closePopup();
    saveAlertedKeys(new Set());
    return;
  }

  const boxes = snapshot.val();
  const now = new Date();
  const overdueBoxes = [];

  Object.keys(boxes).forEach((boxID) => {
    const box = boxes[boxID];
    if (!box.boxtimeout) return;
    if ((box.boxoffice || "").toLowerCase() === "in safe") return;

    const minutesElapsed = minutesSinceClockTime(box.boxtimeout, now);
    if (minutesElapsed === null || minutesElapsed < 60) return;

    overdueBoxes.push({
      alertKey: `${boxID}|${box.boxoffice || "Unknown"}|${box.boxtimeout}`,
      boxnum: box.boxnum || boxID,
      office: box.boxoffice || "Unknown",
      minutesElapsed,
    });
  });

  overdueBoxes.sort((a, b) => b.minutesElapsed - a.minutesElapsed);
  const currentOverdueKeys = new Set(overdueBoxes.map((box) => box.alertKey));
  const alertedKeys = getAlertedKeys();
  const activeAlertedKeys = new Set(
    [...alertedKeys].filter((key) => currentOverdueKeys.has(key))
  );

  if (!overdueBoxes.length) {
    closePopup();
    saveAlertedKeys(new Set());
    return;
  }

  const newlyAlertedBoxes = overdueBoxes.filter(
    (box) => !activeAlertedKeys.has(box.alertKey)
  );

  if (!newlyAlertedBoxes.length) {
    saveAlertedKeys(activeAlertedKeys);
    closePopup();
    return;
  }

  popupList.innerHTML = newlyAlertedBoxes
    .map(
      (box) => `
        <article class="alert-popup-item">
          <div class="alert-popup-item-head">BOX ${escapeHtml(box.boxnum)}</div>
          <div class="alert-popup-item-row">
            <span>Office</span>
            <strong>${escapeHtml(box.office)}</strong>
          </div>
          <div class="alert-popup-item-row">
            <span>Time in Office</span>
            <strong>${box.minutesElapsed} minutes</strong>
          </div>
        </article>
      `
    )
    .join("");

  newlyAlertedBoxes.forEach((box) => activeAlertedKeys.add(box.alertKey));
  saveAlertedKeys(activeAlertedKeys);
  popup.classList.add("alert-popup-visible");
}

checkOutstandingAlerts().catch((error) => {
  console.error("Outstanding alert check failed:", error);
});

window.setInterval(() => {
  checkOutstandingAlerts().catch((error) => {
    console.error("Outstanding alert refresh failed:", error);
  });
}, 60000);
