const STORAGE_KEY = "cypher-theme";
const root = document.documentElement;
const themeToggle = document.getElementById("themeToggle");

function normalizeTheme(value) {
  return value === "dark" ? "dark" : "light";
}

function readSavedTheme() {
  try {
    return normalizeTheme(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "light";
  }
}

function saveTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, normalizeTheme(theme));
  } catch {
    // Ignore storage persistence failures and still apply the theme in-memory.
  }
}

function applyTheme(theme) {
  const normalizedTheme = normalizeTheme(theme);
  root.setAttribute("data-theme", normalizedTheme);

  if (!themeToggle) return;

  themeToggle.setAttribute(
    "aria-label",
    normalizedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"
  );
  themeToggle.classList.toggle("theme-toggle-dark", normalizedTheme === "dark");
}

const savedTheme = readSavedTheme();
applyTheme(savedTheme);

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const nextTheme =
      root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    saveTheme(nextTheme);
    applyTheme(nextTheme);
  });
}
