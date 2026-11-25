/* Runs synchronously in the document head before the main stylesheet. */
(() => {
  const root = document.documentElement;
  if (root.dataset.themeLock === "light") {
    root.dataset.theme = "light";
    return;
  }
  try {
    root.dataset.theme = localStorage.getItem("uni-verse-theme") === "dark" ? "dark" : "light";
  } catch {
    root.dataset.theme = "light";
  }
})();
