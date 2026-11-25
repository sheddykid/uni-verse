import { supabase, requireProfile } from "./supabase.js";

const links = [
  ["./student.html", "⌂", "Learning hub"],
  ["./notes.html", "▤", "Course notes"],
  ["./past-questions.html", "✎", "Past questions"],
  ["./quizzes.html", "✓", "Quizzes"],
  ["./timetable.html", "▦", "Academic timetable"],
  ["./quiz-analytics.html", "▥", "Quiz performance"],
  ["./quiz-history.html", "◷", "Quiz history"],
  ["./flashcards.html", "▣", "Flashcards"],
  ["./note-summarizer.html", "≡", "AI note summarizer"],
  ["./summary-history.html", "▣", "Summary history"],
];

const session = await requireProfile();
if (session) {
  const mount = document.createElement("div");
  mount.id = "student-navigation";
  mount.innerHTML = `
    <button class="student-menu-trigger" type="button" aria-label="Open student menu" aria-expanded="false" aria-controls="student-drawer"><span aria-hidden="true">☰</span></button>
    <div class="student-drawer-backdrop" hidden></div>
    <aside class="student-drawer" id="student-drawer" aria-label="Student navigation" aria-hidden="true">
      <div class="student-drawer-head">
        <div class="student-profile-mark" aria-hidden="true">U</div>
        <div class="student-profile-copy"><strong class="student-profile-name"></strong><span class="student-profile-matric"></span></div>
        <button class="student-drawer-close" type="button" aria-label="Close menu">×</button>
      </div>
      <nav class="student-drawer-links" aria-label="Student pages"></nav>
      <button class="student-drawer-signout" type="button">Sign out</button>
    </aside>
    <div class="contact-widget">
      <button class="contact-widget-drag" type="button" aria-label="Move contact button" title="Drag to move">⠿</button>
      <button class="contact-widget-open" type="button" aria-label="Contact Admin" title="Contact Admin"><span aria-hidden="true">✉</span></button>
      <button class="contact-widget-tuck" type="button" aria-label="Hide contact button at screen edge" title="Hide at screen edge">›</button>
    </div>
    <button class="contact-widget-restore" type="button" aria-label="Show Contact Admin" hidden>‹</button>
    <dialog class="verification-prompt-dialog" aria-labelledby="verification-prompt-title">
      <div class="verification-prompt-content">
        <p class="eyebrow">STUDENT VERIFICATION</p>
        <h2 id="verification-prompt-title">Verify your student account</h2>
        <p class="muted">Upload a clear image of your university ID card to unlock video tutorials and AI learning materials. You can cancel now and continue using the available course resources.</p>
        <div class="verification-prompt-actions">
          <button class="btn secondary verification-prompt-cancel" type="button">Cancel</button>
          <a class="btn primary" href="./verification.html">Verify account</a>
        </div>
      </div>
    </dialog>
    <dialog class="contact-dialog">
      <div class="contact-dialog-head"><div><p class="eyebrow">STUDENT SUPPORT</p><h2>Contact Admin</h2></div><button class="contact-dialog-close" type="button" aria-label="Close">×</button></div>
      <p class="muted">Send a complaint or message directly to the UNI-VERSE administrator.</p>
      <form class="contact-form">
        <label>Your email address<input name="email" type="email" maxlength="254" autocomplete="email" required></label>
        <label>Your complaint<textarea name="message" rows="6" minlength="10" maxlength="5000" placeholder="Describe your complaint or issue…" required></textarea></label>
        <button class="btn primary" type="submit">Send message</button>
        <p class="message contact-status" role="status" aria-live="polite"></p>
      </form>
    </dialog>`;
  document.body.append(mount);
  document.querySelector(".topbar")?.prepend(mount.querySelector(".student-menu-trigger"));

  const $ = selector => mount.querySelector(selector);
  // The trigger is moved from the mount into the top bar above, so query it from the document.
  const trigger = document.querySelector(".topbar .student-menu-trigger");
  const drawer = $(".student-drawer");
  window.mountThemeMenuItem?.(drawer);
  const backdrop = $(".student-drawer-backdrop");
  const profile = session.profile;
  $(".student-profile-name").textContent = profile.full_name || "Student";
  const matricLabel = $(".student-profile-matric");
  matricLabel.textContent = profile.matric_number || session.user.email || "Matric number unavailable";
  if (profile.is_verified) {
    const verifiedTick = document.createElement("span");
    verifiedTick.className = "student-verified-tick";
    verifiedTick.textContent = "✓";
    verifiedTick.setAttribute("role", "img");
    verifiedTick.setAttribute("aria-label", "Verified student");
    verifiedTick.title = "Verified student";
    matricLabel.append(" ", verifiedTick);
  }

  const currentPageCookie = document.cookie.split("; ").find(part => part.startsWith("uv_current="))?.slice("uv_current=".length) || "";
  let current = "student.html";
  try {
    const decoded = decodeURIComponent(currentPageCookie);
    if (decoded) current = decoded.split("/").pop();
  } catch {}
  if (profile.role === "student" && profile.is_verified !== true && current !== "verification.html") {
    const promptDialog = $(".verification-prompt-dialog");
    const promptKey = "universe-verification-prompt:" + session.user.id;
    const loginStamp = session.user.last_sign_in_at || session.user.created_at || "first-login";
    try {
      if (sessionStorage.getItem(promptKey) !== loginStamp) {
        sessionStorage.setItem(promptKey, loginStamp);
        promptDialog.showModal();
      }
    } catch {
      promptDialog.showModal();
    }
    $(".verification-prompt-cancel").addEventListener("click", () => promptDialog.close());
    promptDialog.addEventListener("click", event => {
      if (event.target === promptDialog) promptDialog.close();
    });
  }
  const nav = $(".student-drawer-links");
  links.forEach(([href, icon, label]) => {
    const link = document.createElement("a");
    link.href = href;
    link.className = "student-drawer-link";
    if (href.endsWith(current)) link.setAttribute("aria-current", "page");
    const glyph = document.createElement("span");
    glyph.className = "student-drawer-link-icon";
    glyph.setAttribute("aria-hidden", "true");
    glyph.textContent = icon;
    const text = document.createElement("span");
    text.textContent = label;
    link.append(glyph, text);
    nav.append(link);
  });

  const videoGroup = document.createElement("details");
  videoGroup.className = "student-nav-dropdown";
  videoGroup.open = current === "videos.html" || current === "youtube-videos.html";
  const videoSummary = document.createElement("summary");
  videoSummary.textContent = "Video tutorials";
  const videoLinks = document.createElement("div");
  videoLinks.className = "student-nav-sublinks";
  [
    ["./videos.html", "Uploaded videos"],
    ["./youtube-videos.html", "YouTube videos"]
  ].forEach(([href, label]) => {
    const link = document.createElement("a");
    link.href = href;
    link.className = "student-drawer-link student-drawer-sublink";
    if (href.endsWith(current)) link.setAttribute("aria-current", "page");
    link.textContent = label;
    videoLinks.append(link);
  });
  videoGroup.append(videoSummary, videoLinks);
  if (profile.role === "admin") {
    const adminViewLink = document.createElement("a");
    adminViewLink.href = "./admin.html";
    adminViewLink.className = "student-drawer-link";
    adminViewLink.textContent = "▥  Admin view";
    nav.append(adminViewLink);
  }
  if (profile.role === "student" && profile.is_verified !== true) {
    const verifyLink = document.createElement("a");
    verifyLink.href = "./verification.html";
    verifyLink.className = "student-drawer-link";
    verifyLink.textContent = "✓  Verify account";
    if (current === "verification.html") verifyLink.setAttribute("aria-current", "page");
    nav.append(verifyLink);
  }
  nav.append(videoGroup);

  function setDrawer(open) {
    drawer.classList.toggle("is-open", open);
    drawer.setAttribute("aria-hidden", String(!open));
    trigger.setAttribute("aria-expanded", String(open));
    backdrop.hidden = !open;
    document.body.classList.toggle("student-drawer-open", open);
    if (open) $(".student-drawer-close").focus();
    else trigger.focus();
  }
  trigger.addEventListener("click", () => setDrawer(true));
  $(".student-drawer-close").addEventListener("click", () => setDrawer(false));
  backdrop.addEventListener("click", () => setDrawer(false));
  nav.addEventListener("click", event => {
    if (event.target.closest("a")) setDrawer(false);
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && drawer.classList.contains("is-open")) setDrawer(false);
  });
  $(".student-drawer-signout").addEventListener("click", async () => {
    try { sessionStorage.removeItem("universe-verification-prompt:" + session.user.id); } catch {}
    await supabase.auth.signOut();
    location.replace("./index.html");
  });

  const widget = $(".contact-widget");
  const drag = $(".contact-widget-drag");
  const restore = $(".contact-widget-restore");
  const dialog = $(".contact-dialog");
  const form = $(".contact-form");
  const status = $(".contact-status");

  // Show the support shortcut briefly once per authenticated tab/session.
  const contactIntroKey = "universe-contact-intro-shown";
  let showContactIntro = false;
  try {
    showContactIntro = sessionStorage.getItem(contactIntroKey) !== session.user.id;
    if (showContactIntro) sessionStorage.setItem(contactIntroKey, session.user.id);
  } catch {
    showContactIntro = true;
  }
  if (showContactIntro) {
    widget.hidden = false;
    window.setTimeout(() => {
      if (!dialog.open) {
        widget.hidden = true;
        restore.hidden = false;
      }
    }, 3000);
  } else {
    widget.hidden = true;
    restore.hidden = false;
  }
  const emailInput = form.elements.email;
  emailInput.value = session.user.email || "";
  $(".contact-widget-open").addEventListener("click", () => {
    if (!dialog.open) dialog.showModal();
    emailInput.focus();
  });
  $(".contact-dialog-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });

  $(".contact-widget-tuck").addEventListener("click", () => {
    widget.hidden = true;
    restore.hidden = false;
  });
  restore.addEventListener("click", () => {
    widget.hidden = false;
    restore.hidden = true;
  });

  try {
    const saved = JSON.parse(localStorage.getItem("universe-contact-position") || "null");
    if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
      widget.style.left = Math.max(8, Math.min(innerWidth - 190, saved.left)) + "px";
      widget.style.top = Math.max(8, Math.min(innerHeight - 70, saved.top)) + "px";
      widget.style.right = "auto";
      widget.style.bottom = "auto";
    }
  } catch {}

  let dragState = null;
  drag.addEventListener("pointerdown", event => {
    const rect = widget.getBoundingClientRect();
    dragState = { pointerId: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    drag.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  function moveWidget(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const left = Math.max(8, Math.min(innerWidth - widget.offsetWidth - 8, event.clientX - dragState.dx));
    const top = Math.max(8, Math.min(innerHeight - widget.offsetHeight - 8, event.clientY - dragState.dy));
    widget.style.left = left + "px";
    widget.style.top = top + "px";
    widget.style.right = "auto";
    widget.style.bottom = "auto";
  }
  function endDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    dragState = null;
    const rect = widget.getBoundingClientRect();
    try { localStorage.setItem("universe-contact-position", JSON.stringify({ left: rect.left, top: rect.top })); } catch {}
  }
  drag.addEventListener("pointermove", moveWidget);
  drag.addEventListener("pointerup", endDrag);
  drag.addEventListener("pointercancel", endDrag);

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    const email = emailInput.value.trim();
    const message = form.elements.message.value.trim();
    if (!email || !message) return;
    submit.disabled = true;
    submit.textContent = "Sending…";
    status.textContent = "";
    status.classList.remove("success");
    const { error } = await supabase.functions.invoke("contact-admin", { body: { email, message } });
    if (error) {
      status.textContent = error.message?.includes("Failed to send")
        ? "The message could not be sent. Please try again later."
        : "Message service is not ready yet. Please try again later.";
    } else {
      status.textContent = "Your message has been sent to the administrator.";
      status.classList.add("success");
      form.elements.message.value = "";
      setTimeout(() => dialog.close(), 1800);
    }
    submit.disabled = false;
    submit.textContent = "Send message";
  });
}
