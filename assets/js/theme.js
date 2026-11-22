const STORAGE_KEY = "uni-verse-theme";
const root = document.documentElement;
const stored = localStorage.getItem(STORAGE_KEY);
const initial = stored === "dark" ? "dark" : "light";
root.dataset.theme = initial;

function applyTheme(theme) {
  const next = theme === "dark" ? "dark" : "light";
  root.dataset.theme = next;
  localStorage.setItem(STORAGE_KEY, next);
  document.querySelectorAll(".theme-switcher button").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.themeChoice === next));
  });
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = next === "dark" ? "#0b1120" : "#101827";
}

function mountThemeSwitcher() {
  if (document.querySelector(".theme-switcher")) return;
  const switcher = document.createElement("div");
  switcher.className = "theme-switcher";
  switcher.setAttribute("role", "group");
  switcher.setAttribute("aria-label", "Appearance");
  switcher.innerHTML = `
    <span aria-hidden="true">Theme</span>
    <button type="button" data-theme-choice="light" aria-label="Use light mode">☀ Light</button>
    <button type="button" data-theme-choice="dark" aria-label="Use dark mode">☾ Dark</button>
  `;
  switcher.addEventListener("click", event => {
    const button = event.target.closest("button[data-theme-choice]");
    if (button) applyTheme(button.dataset.themeChoice);
  });
  document.body.append(switcher);
  applyTheme(root.dataset.theme);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountThemeSwitcher, { once: true });
} else {
  mountThemeSwitcher();
}
