import { supabase, requireProfile, signOut } from "./supabase.js";

const $ = selector => document.querySelector(selector);
$("#logout").addEventListener("click", signOut);

if (location.hostname.endsWith("github.io")) {
  $("#github-pages-notice").hidden = false;
  $(".summary-builder").hidden = true;
} else {
  const session = await requireProfile();
  if (session) {
    const { profile, user } = session;
    $("#user-label").textContent = profile.full_name || user.email;
    const courseSelect = $("#course-select");
    const notesList = $("#notes-list");
    const generateButton = $("#generate");
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
    generateButton.addEventListener("click", generateSummary);

    async function loadNotes() {
      generateButton.disabled = true;
      notesList.replaceChildren();
      $("#note-count").textContent = "Loading…";
      if (!courseSelect.value) {
        notesList.textContent = "Choose a course to see its notes.";
        $("#note-count").textContent = "Select a course first";
        return;
      }
      const { data, error } = await supabase.from("course_resources")
        .select("id,title,file_name,file_path,file_size,mime_type,created_at")
        .eq("course_id", courseSelect.value).eq("resource_type", "note").eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) {
        notesList.textContent = "Could not load course notes.";
        $("#note-count").textContent = "Unavailable";
        return;
      }
      const supported = (data || []).filter(note => /\.(pdf|docx|pptx)$/i.test(note.file_name || ""));
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
        checkbox.addEventListener("change", updateSelection);
        const details = document.createElement("span");
        const title = document.createElement("strong");
        const meta = document.createElement("small");
        title.textContent = note.title;
        meta.textContent = `${note.file_name.split(".").pop().toUpperCase()} · ${formatSize(note.file_size)}`;
        details.append(title, meta);
        label.append(checkbox, details);
        notesList.append(label);
      });
      updateSelection();
    }

    function updateSelection() {
      const checked = [...notesList.querySelectorAll('input[type="checkbox"]:checked')];
      if (checked.length > 2) {
        checked[checked.length - 1].checked = false;
        setStatus("Select no more than two note files at a time.");
      } else {
        setStatus("");
      }
      const count = notesList.querySelectorAll('input[type="checkbox"]:checked').length;
      generateButton.disabled = count === 0;
      generateButton.textContent = count ? `Summarize ${count} note file${count === 1 ? "" : "s"}` : "Generate summary";
    }

    async function generateSummary() {
      const resourceIds = [...notesList.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
      if (!resourceIds.length) return;
      generateButton.disabled = true;
      generateButton.textContent = "Summarizing…";
      setStatus("Reading your selected notes and preparing the summary. This may take a little while.");
      try {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        if (!authSession?.access_token) throw new Error("Your session has expired. Sign in again.");
        const ocrTextByResource = {};
        const selectedNotes = availableNotes.filter(note => resourceIds.includes(note.id));
        const pdfNotes = selectedNotes.filter(note => String(note.file_name || "").toLowerCase().endsWith(".pdf"));
        if (pdfNotes.length) {
          const { extractResourceText } = await import("./question-ocr.js");
          for (const note of pdfNotes) {
            setStatus(`Preparing ${note.title} for summarization. Scanned pages will be read with OCR.`);
            const { data: blob, error: downloadError } = await supabase.storage.from("course-resources").download(note.file_path);
            if (downloadError || !blob) throw new Error(downloadError?.message || `Could not download ${note.title}.`);
            const file = new File([blob], note.file_name, { type: note.mime_type || blob.type });
            ocrTextByResource[note.id] = await extractResourceText(file, (stage, progress) => {
              const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
              setStatus(percent ? `Reading ${note.title}: ${stage} (${percent}%)` : `Reading ${note.title}: ${stage}…`);
            }, { maxPdfPages: 150, maxOcrPages: 30, maxCharacters: 100000 });
          }
        }
        setStatus("Sending the extracted course material to the summarizer…");
        const response = await fetch("/api/note-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${authSession.access_token}` },
          body: JSON.stringify({
            courseId: courseSelect.value,
            resourceIds,
            detail: $("#summary-detail").value,
            ocrTextByResource
          })
        });
        const raw = await response.text();
        let result;
        try { result = raw ? JSON.parse(raw) : {}; }
        catch { throw new Error(`The summary server returned an invalid response (HTTP ${response.status}).`); }
        if (!response.ok) throw new Error(result.error || `Summary request failed (HTTP ${response.status}).`);
        if (!result.summary) throw new Error("The AI did not return a summary. Please try again.");
        sessionStorage.setItem("universeActiveSummary", JSON.stringify(result));
        setStatus("Your study summary is ready. Opening your summary page…", true);
        location.href = "./summary-session.html";
      } catch (error) {
        setStatus(error.message || "Could not generate the summary.");
      } finally {
        generateButton.disabled = notesList.querySelectorAll('input[type="checkbox"]:checked').length === 0;
        generateButton.textContent = "Generate summary";
      }
    }

    function setStatus(message, success = false) {
      $("#status").textContent = message;
      $("#status").classList.toggle("success", success);
    }

    function formatSize(bytes) {
      if (!bytes) return "Size unknown";
      return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
  }
}
