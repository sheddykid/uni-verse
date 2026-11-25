const STORAGE_KEY = "uni-verse-theme";
const root = document.documentElement;
const themeLockedToLight = root.dataset.themeLock === "light";

function currentTheme() {
  return themeLockedToLight ? "light" : root.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(theme) {
  const next = themeLockedToLight ? "light" : theme === "dark" ? "dark" : "light";
  root.dataset.theme = next;
  if (!themeLockedToLight) {
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  }
  document.querySelectorAll("[data-theme-toggle]").forEach(button => {
    const dark = next === "dark";
    button.textContent = dark ? "☀ Switch to light mode" : "☾ Switch to dark mode";
    button.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    button.setAttribute("aria-pressed", String(dark));
  });
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = next === "dark" ? "#0b1120" : "#f5f7fb";
}

if (themeLockedToLight) {
  root.dataset.theme = "light";
} else {
  try {
    root.dataset.theme = localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    root.dataset.theme = "light";
  }
}

window.mountThemeMenuItem = function (drawer) {
  if (!drawer || drawer.querySelector("[data-theme-toggle]")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "student-drawer-theme";
  button.dataset.themeToggle = "";
  button.addEventListener("click", () => applyTheme(currentTheme() === "dark" ? "light" : "dark"));
  const signout = drawer.querySelector(".student-drawer-signout");
  if (signout) drawer.insertBefore(button, signout);
  else drawer.append(button);
  applyTheme(currentTheme());
};
