import { supabase, requireProfile, signOut } from "./supabase.js";
const $ = selector => document.querySelector(selector);
$("#logout").addEventListener("click", signOut);
const session = await requireProfile();
if (session) {
  const { profile, user } = session;
  $("#user-label").textContent = profile.full_name || user.email;
  const courseSelect = $("#course-select"), notesList = $("#notes-list"), generateButton = $("#generate");
  let currentNotes = [], deck = [], index = 0, flipped = false;
  const known = new Set(), ratings = new Map();
  const courseQuery = supabase.from("courses").select("id,code,title,course_departments!inner(department_id)").eq("is_active", true);
  if (profile.role !== "admin") courseQuery.eq("course_departments.department_id", profile.department_id);
  const { data: courses, error } = await courseQuery.order("code");
  courseSelect.replaceChildren(new Option(error ? "Could not load courses" : "Select a course", ""));
  if (!error) (courses || []).forEach(course => courseSelect.add(new Option(`${course.code} — ${course.title}`, course.id)));
  if (error) setStatus("Could not load courses. Refresh the page and try again.");
  courseSelect.addEventListener("change", loadNotes);
  generateButton.addEventListener("click", generateDeck);
  $("#flashcard").addEventListener("click", () => { flipped = !flipped; renderCard(); });
  $("#previous").addEventListener("click", () => move(-1));
  $("#next").addEventListener("click", () => move(1));
  $("#restart").addEventListener("click", () => { index = 0; flipped = false; known.clear(); ratings.clear(); renderCard(); });
  $("#mark-known").addEventListener("click", () => rate(true));
  $("#mark-learning").addEventListener("click", () => rate(false));

  async function loadNotes() {
    currentNotes = []; generateButton.disabled = true; notesList.replaceChildren();
    $("#note-count").textContent = "Loading…";
    if (!courseSelect.value) { notesList.textContent = "Choose a course to see its notes."; $("#note-count").textContent = "Select a course first"; return; }
    const { data, error } = await supabase.from("course_resources").select("id,title,file_name,file_size,mime_type,created_at")
      .eq("course_id", courseSelect.value).eq("resource_type", "note").eq("is_active", true).order("created_at", { ascending: false });
    if (error) { notesList.textContent = "Could not load course notes."; $("#note-count").textContent = "Unavailable"; return; }
    currentNotes = (data || []).filter(item => /\.(pdf|docx|pptx)$/i.test(item.file_name || ""));
    $("#note-count").textContent = `${currentNotes.length} available`;
    if (!currentNotes.length) { notesList.textContent = "No supported course notes are available for this course yet."; return; }
    currentNotes.forEach(note => {
      const label = document.createElement("label"); label.className = "note-choice";
      const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.value = note.id; checkbox.addEventListener("change", updateSelection);
      const details = document.createElement("span"), title = document.createElement("strong"), meta = document.createElement("small");
      title.textContent = note.title; meta.textContent = `${note.file_name.split(".").pop().toUpperCase()} · ${formatSize(note.file_size)}`;
      details.append(title, meta); label.append(checkbox, details); notesList.append(label);
    });
    updateSelection();
  }
  function updateSelection() {
    const selected = notesList.querySelectorAll('input[type="checkbox"]:checked');
    if (selected.length > 5) { selected[selected.length - 1].checked = false; setStatus("Select no more than five note files at a time."); }
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
    $("#deck-section").hidden = true;
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession?.access_token) throw new Error("Your session has expired. Sign in again.");
      const response = await fetch("/api/flashcards", { method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authSession.access_token}` },
        body: JSON.stringify({ courseId: courseSelect.value, resourceIds, count: Number($("#card-count").value) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not generate flashcards.");
      deck = result.flashcards || []; index = 0; flipped = false; known.clear(); ratings.clear();
      if (!deck.length) throw new Error("No flashcards were generated from these notes.");
      $("#deck-title").textContent = `${result.course.code} — ${result.course.title}`;
      $("#deck-sources").textContent = `Generated from: ${(result.sources || []).join(", ")}`;
      $("#deck-section").hidden = false; $("#deck-finish").textContent = ""; renderCard();
      setStatus(`Generated ${deck.length} flashcards.`, true);
    } catch (error) { setStatus(error.message || "Flashcard generation failed."); }
    finally { generateButton.disabled = notesList.querySelectorAll('input[type="checkbox"]:checked').length === 0; generateButton.textContent = "Generate flashcards"; }
  }
  function renderCard() {
    if (!deck.length) return;
    const card = deck[index];
    $("#card-side").textContent = flipped ? "ANSWER" : "QUESTION";
    $("#card-text").textContent = flipped ? card.back : card.front;
    $("#card-hint").textContent = flipped ? "Tap to see question" : "Tap to reveal answer";
    $("#progress-label").textContent = `Card ${index + 1} of ${deck.length}`;
    $("#known-label").textContent = `${known.size} known`;
    $("#progress-fill").style.width = `${((index + 1) / deck.length) * 100}%`;
    $("#previous").disabled = index === 0; $("#next").textContent = index === deck.length - 1 ? "Finish" : "Next";
    $("#mark-known").classList.toggle("selected", ratings.get(index) === true);
    $("#mark-learning").classList.toggle("selected", ratings.get(index) === false);
    $("#deck-finish").textContent = known.size === deck.length ? "All cards marked as known." : "";
  }
  function move(direction) {
    if (direction > 0 && index === deck.length - 1) { $("#deck-finish").textContent = `Deck complete: ${known.size} of ${deck.length} marked as known.`; return; }
    index = Math.max(0, Math.min(deck.length - 1, index + direction)); flipped = false; renderCard();
  }
  function rate(isKnown) { ratings.set(index, isKnown); if (isKnown) known.add(index); else known.delete(index); if (index < deck.length - 1) move(1); else renderCard(); }
  function setStatus(message, success = false) { $("#status").textContent = message; $("#status").classList.toggle("success", success); }
  function formatSize(bytes) { if (!bytes) return "Size unknown"; return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
}
