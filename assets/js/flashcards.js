import { supabase, requireProfile, signOut } from "./supabase.js";
const $ = selector => document.querySelector(selector);
$("#logout")?.addEventListener("click", signOut);
if (location.hostname.endsWith("github.io")) {
  $("#github-pages-notice").hidden = false;
  $(".flashcard-panel").hidden = true;
} else {
const session = await requireProfile();
if (session) {
  const { profile, user } = session;
  $("#user-label").textContent = profile.full_name || user.email;
  const courseSelect = $("#course-select"), notesList = $("#notes-list"), generateButton = $("#generate");
  let currentNotes = [];
  const courseQuery = supabase.from("courses").select("id,code,title,course_departments!inner(department_id)").eq("is_active", true);
  if (profile.role !== "admin") courseQuery.eq("course_departments.department_id", profile.department_id);
  const { data: courses, error } = await courseQuery.order("code");
  courseSelect.replaceChildren(new Option(error ? "Could not load courses" : "Select a course", ""));
  if (!error) (courses || []).forEach(course => courseSelect.add(new Option(`${course.code} — ${course.title}`, course.id)));
  if (error) setStatus("Could not load courses. Refresh the page and try again.");
  courseSelect.addEventListener("change", loadNotes);
  generateButton.addEventListener("click", generateDeck);

  async function loadNotes() {
    currentNotes = []; generateButton.disabled = true; notesList.replaceChildren();
    $("#note-count").textContent = "Loading…";
    if (!courseSelect.value) { notesList.textContent = "Choose a course to see its notes."; $("#note-count").textContent = "Select a course first"; return; }
    const { data, error } = await supabase.from("course_resources").select("id,title,file_name,mime_type,created_at")
      .eq("course_id", courseSelect.value).eq("resource_type", "note").eq("is_active", true).order("created_at", { ascending: false });
    if (error) { notesList.textContent = "Could not load course notes."; $("#note-count").textContent = "Unavailable"; return; }
    currentNotes = (data || []).filter(item => /\.(pdf|docx|pptx)$/i.test(item.file_name || ""));
    $("#note-count").textContent = `${currentNotes.length} available`;
    if (!currentNotes.length) { notesList.textContent = "No supported course notes are available for this course yet."; return; }
    currentNotes.forEach(note => {
      const label = document.createElement("label"); label.className = "note-choice";
      const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.value = note.id; checkbox.addEventListener("change", updateSelection);
      const details = document.createElement("span"), title = document.createElement("strong"), meta = document.createElement("small");
      title.textContent = note.title; meta.textContent = `${note.file_name.split(".").pop().toUpperCase()}`;
      details.append(title, meta); label.append(checkbox, details); notesList.append(label);
    });
    updateSelection();
  }
  function updateSelection() {
    const selected = notesList.querySelectorAll('input[type="checkbox"]:checked');
    if (selected.length > 2) { selected[selected.length - 1].checked = false; setStatus("Select no more than two note files at a time."); }
    else setStatus("");
    const amount = notesList.querySelectorAll('input[type="checkbox"]:checked').length;
    generateButton.disabled = amount === 0;
    generateButton.textContent = amount ? `Generate from ${amount} note${amount === 1 ? "" : "s"}` : "Generate flashcards";
  }
  async function generateDeck() {
    const resourceIds = [...notesList.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
    if (!resourceIds.length) return;
    generateButton.disabled = true; generateButton.textContent = "Generating…";
    setStatus("Reading your notes and generating flashcards. This may take a little while.");
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession?.access_token) throw new Error("Your session has expired. Sign in again.");
      const response = await fetch("/api/flashcards", { method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authSession.access_token}` },
        body: JSON.stringify({ courseId: courseSelect.value, resourceIds, count: Number($("#card-count").value) }) });
      const responseText = await response.text();
      let result;
      try { result = responseText ? JSON.parse(responseText) : {}; }
      catch { throw new Error(`The flashcard server returned an invalid response (HTTP ${response.status}). Please try again. If it continues, contact the UNI-VERSE administrator.`); }
      if (!response.ok) throw new Error(result.error || `Could not generate flashcards (HTTP ${response.status}).`);
      const deck = result.flashcards || [];
      if (!deck.length) throw new Error("No flashcards were generated from these notes.");
      sessionStorage.setItem("universeActiveFlashcards", JSON.stringify({ result }));
      setStatus(`Prepared ${deck.length} flashcards${result.reusedCount ? ` (${result.reusedCount} reused from the saved note bank)` : ""}. Opening your study page…`, true);
      location.href = "./flashcard-session.html";
    } catch (error) { setStatus(error.message || "Flashcard generation failed."); }
    finally { generateButton.disabled = notesList.querySelectorAll('input[type="checkbox"]:checked').length === 0; generateButton.textContent = "Generate flashcards"; }
  }
  function setStatus(message, success = false) { $("#status").textContent = message; $("#status").classList.toggle("success", success); }
  function formatSize(bytes) { if (!bytes) return "Size unknown"; return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
}

}
