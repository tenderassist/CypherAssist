function parseJsonArray(value) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Could not parse stored JSON array:", error);
    return [];
  }
}

function setFeedback(element, content, options = {}) {
  if (!element) return;

  const { error = false, html = false } = options;

  if (html) {
    element.innerHTML = content;
  } else {
    element.textContent = content;
  }

  element.classList.toggle("error", error);
}

function bindEnterToButton(button) {
  if (!button) return;

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.defaultPrevented) return;

    const activeElement = document.activeElement;
    if (
      activeElement &&
      (activeElement.id === "quicksearch" ||
        activeElement.tagName === "BUTTON" ||
        activeElement.closest("a") ||
        activeElement.closest("[data-ignore-enter]"))
    ) {
      return;
    }

    button.click();
  });
}

function getCurrentTimeString(date = new Date()) {
  return `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

function minutesSinceClockTime(value, now = new Date()) {
  if (!value || typeof value !== "string" || !value.includes(":")) return null;

  const [hours, minutes] = value.split(":").map(Number);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  const then = new Date(now);
  then.setHours(hours, minutes, 0, 0);

  let difference = now.getTime() - then.getTime();
  if (difference < 0) {
    difference += 24 * 60 * 60 * 1000;
  }

  return Math.floor(difference / 60000);
}

function sortNumericStrings(values) {
  return [...values].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true })
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderStatusCollection(container, options) {
  if (!container) return;

  const { title, items = [], emptyText } = options;

  if (!items.length) {
    container.innerHTML = `
      <div class="status-header">
        <span class="status-title">${escapeHtml(title)}</span>
      </div>
      <div class="status-empty">${escapeHtml(emptyText)}</div>
    `;
    return;
  }

  const chips = items
    .map((item) => `<span class="status-chip">${escapeHtml(item)}</span>`)
    .join("");

  container.innerHTML = `
    <div class="status-header">
      <span class="status-title">${escapeHtml(title)}</span>
      <span class="status-total">
        <span class="status-total-label">Total:</span>
        <span class="status-count">${items.length}</span>
      </span>
    </div>
    <div class="status-chips">${chips}</div>
  `;
}

export {
  bindEnterToButton,
  escapeHtml,
  getCurrentTimeString,
  minutesSinceClockTime,
  parseJsonArray,
  renderStatusCollection,
  setFeedback,
  sortNumericStrings,
};
