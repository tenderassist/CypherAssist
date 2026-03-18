const STORAGE_KEY = "cypher-theme";
const root = document.documentElement;
const themeToggle = document.getElementById("themeToggle");

function applyTheme(theme) {
  root.setAttribute("data-theme", theme);

  if (!themeToggle) return;

  themeToggle.setAttribute(
    "aria-label",
    theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
  );
  themeToggle.classList.toggle("theme-toggle-dark", theme === "dark");
}

const savedTheme = localStorage.getItem(STORAGE_KEY) || "light";
applyTheme(savedTheme);

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const nextTheme =
      root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    localStorage.setItem(STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  });
}
