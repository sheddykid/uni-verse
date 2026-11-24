/* Runs synchronously in the document head before the main stylesheet. */
(() => {
  const root = document.documentElement;
  try {
    root.dataset.theme = localStorage.getItem("uni-verse-theme") === "dark" ? "dark" : "light";
  } catch {
    root.dataset.theme = "light";
  }
})();
