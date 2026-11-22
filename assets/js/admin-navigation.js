import { supabase, requireProfile } from "./supabase.js";

const session = await requireProfile();
if (session && session.profile.role !== "admin") {
  location.replace("./student.html");
} else if (session) {
  document.body.classList.add("admin-page");
  const topbar = document.querySelector(".topbar");
  const mount = document.createElement("div");
  mount.id = "admin-navigation";
  mount.innerHTML = `
    <button class="student-menu-trigger admin-menu-trigger" type="button" aria-label="Open administrator menu" aria-expanded="false" aria-controls="admin-drawer">☰</button>
    <div class="student-drawer-backdrop" hidden></div>
    <aside class="student-drawer" id="admin-drawer" aria-label="Administrator navigation" aria-hidden="true">
      <div class="student-drawer-head">
        <div class="student-profile-mark">U</div>
        <div class="student-profile-copy"><strong>${session.profile.full_name || "Administrator"}</strong><span>Administration</span></div>
        <button class="student-drawer-close" type="button" aria-label="Close menu">×</button>
      </div>
      <nav class="student-drawer-links" aria-label="Admin pages">
        <a class="student-drawer-link" href="./admin.html">＋ <span>Add course</span></a>
        <a class="student-drawer-link" href="./admin-resources.html">▤ <span>Upload notes &amp; questions</span></a>
        <a class="student-drawer-link" href="./admin-videos.html">▶ <span>Upload videos &amp; YouTube</span></a>
        <a class="student-drawer-link" href="./admin-manage.html">▥ <span>Manage courses &amp; resources</span></a>
        <a class="student-drawer-link" href="./student.html">◉ <span>Student view</span></a>
      </nav>
      <button class="student-drawer-signout" type="button">Sign out</button>
    </aside>`;
  topbar.prepend(mount);
  const $ = selector => mount.querySelector(selector);
  const trigger = $(".student-menu-trigger"), drawer = $(".student-drawer"), backdrop = $(".student-drawer-backdrop");
  function setDrawer(open) {
    drawer.classList.toggle("is-open", open);
    drawer.setAttribute("aria-hidden", String(!open));
    trigger.setAttribute("aria-expanded", String(open));
    backdrop.hidden = !open;
    document.body.classList.toggle("student-drawer-open", open);
  }
  trigger.addEventListener("click", () => setDrawer(true));
  $(".student-drawer-close").addEventListener("click", () => setDrawer(false));
  backdrop.addEventListener("click", () => setDrawer(false));
  $(".student-drawer-links").addEventListener("click", event => { if (event.target.closest("a")) setDrawer(false); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") setDrawer(false); });
  $(".student-drawer-signout").addEventListener("click", async () => {
    await supabase.auth.signOut();
    location.replace("./index.html");
  });
}