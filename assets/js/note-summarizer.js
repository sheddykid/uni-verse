import { supabase, requireProfile, signOut } from "./supabase.js";

const $ = selector => document.querySelector(selector);
$("#logout")?.addEventListener("click", signOut);

if (location.hostname.endsWith("github.io")) {
  $("#github-pages-notice").hidden = false;
  $(".summary-builder").hidden = true;
} else {
  const session = await requireProfile();
  if (session) {
    const { profile, user } = session;
    if (user.id === "1693d72a-6941-4ace-a9ef-022a073ae96f") {
      const cleanupKey = "uni-verse-legacy-summary-cleanup-e70d83c7";
      if (localStorage.getItem(cleanupKey) !== "done") {
        const { error: cleanupError } = await supabase.storage.from("summary-pdfs").remove([
          "1693d72a-6941-4ace-a9ef-022a073ae96f/df1e2eee-b4b1-4cb2-b5c5-e286122fa3bf/e70d83c7-c3d9-4ad5-aeb5-edda2c8baf43.pdf"
        ]);
        if (!cleanupError) localStorage.setItem(cleanupKey, "done");
        else console.warn("[UNI-VERSE] Could not remove the old placeholder summary PDF:", cleanupError.message);
      }
    }
    $("#user-label").textContent = profile.full_name || user.email;
    const courseSelect = $("#course-select");
    const notesList = $("#notes-list");
    let availableNotes = [];


    const courseQuery = supabase.from("courses")
      .select("id,code,title,course_departments!inner(department_id)")
      .eq("is_active", true);
    if (profile.role !== "admin") courseQuery.eq("course_departments.department_id", profile.department_id);
    const { data: courses, error } = await courseQuery.order("code");
    courseSelect.replaceChildren(new Option(error ? "Could not load courses" : "Select a course", ""));
    if (!error) (courses || []).forEach(course => courseSelect.add(new Option(`${course.code} — ${course.title}`, course.id)));
    if (error) setStatus("Could not load courses. Refresh the page and try again.");

    courseSelect.addEventListener("change", loadNotes);

    async function loadNotes() {
      notesList.replaceChildren();
      $("#note-count").textContent = "Loading…";
      if (!courseSelect.value) {
        notesList.textContent = "Choose a course to see its notes.";
        $("#note-count").textContent = "Select a course first";
        return;
      }
      const { data, error } = await supabase.from("course_resources")
        .select("id,title,file_name,file_path,mime_type,file_size,created_at")
        .eq("course_id", courseSelect.value).eq("resource_type", "note").eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) {
        notesList.textContent = "Could not load course notes.";
        $("#note-count").textContent = "Unavailable";
        return;
      }
      const supported = (data || []).filter(note => /\.(pdf|docx|pptx)$/i.test(note.file_name || ""));
      const { data: history } = await supabase.from("note_summary_history").select("id,resource_id,status,created_at").eq("user_id", user.id);
      const staleBefore = Date.now() - 10 * 60 * 1000;
      const staleIds = (history || []).filter(item => item.status === "generating" && new Date(item.created_at).getTime() < staleBefore).map(item => item.id);
      if (staleIds.length) await supabase.from("note_summary_history").delete().in("id", staleIds).eq("user_id", user.id);
      const summarizedIds = new Set((history || []).filter(item => item.status === "ready" || !staleIds.includes(item.id)).map(item => item.resource_id));
      availableNotes = supported;
      $("#note-count").textContent = `${supported.length} available`;
      if (!supported.length) {
        notesList.textContent = "No supported course notes are available for this course yet.";
        return;
      }
      supported.forEach(note => {
        const label = document.createElement("label");
        label.className = "note-choice";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = note.id;
        checkbox.disabled = summarizedIds.has(note.id);
        checkbox.addEventListener("change", updateSelection);
        const details = document.createElement("span");
        const title = document.createElement("strong");
        const meta = document.createElement("small");
        title.textContent = note.title;
        meta.textContent = `${note.file_name.split(".").pop().toUpperCase()} · ${formatSize(note.file_size)}${summarizedIds.has(note.id) ? " · Already summarized · See Summary history" : ""}`;
        details.append(title, meta);
        label.append(checkbox, details);
        notesList.append(label);
      });
      updateSelection();
    }

    function updateSelection() {
      const checked = [...notesList.querySelectorAll('input[type="checkbox"]:checked')];
      if (checked.length > 1) {
        checked[checked.length - 1].checked = false;
        setStatus("Select one note file at a time.");
      } else {
        setStatus("");
      }
      const count = notesList.querySelectorAll('input[type="checkbox"]:checked').length;
    }

    function setStatus(message, success = false) {
      $("#status").textContent = message;
      $("#status").classList.toggle("success", success);
    }

    function formatSize(bytes) {
      if (bytes === null || bytes === undefined || Number.isNaN(Number(bytes))) return "Size unknown";
      if (Number(bytes) === 0) return "0 KB";
      return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
  }
}
