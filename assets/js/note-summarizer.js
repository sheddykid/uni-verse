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
      const { data: history } = await supabase.from("note_summary_history").select("resource_id").eq("user_id", user.id);
      const summarizedIds = new Set((history || []).map(item => item.resource_id));
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
        meta.textContent = summarizedIds.has(note.id) ? "Already summarized · See Summary history" : note.file_name.split(".").pop().toUpperCase() + " · " + formatSize(note.file_size);
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
      generateButton.disabled = count === 0;
      generateButton.textContent = count ? `Summarize ${count} note file${count === 1 ? "" : "s"}` : "Generate summary";
    }

    async function generateSummary() {
      const resourceIds = [...notesList.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
      if (resourceIds.length !== 1) return;
      const resource = availableNotes.find(note => note.id === resourceIds[0]);
      const course = (courses || []).find(item => item.id === courseSelect.value);
      if (!resource || !course) return;
      generateButton.disabled = true;
      generateButton.textContent = "Summarizing…";
      setSummaryProgress("Reserving this note…", true);
      setStatus("Your summary is being prepared. This can take a little while.");
      let historyId = null, pdfPath = null;
      try {
        const { data: reservation, error: reservationError } = await supabase.from("note_summary_history").insert({
          user_id: user.id, resource_id: resource.id, course_id: course.id,
          course_code: course.code, course_title: course.title, source_title: resource.title, status: "generating"
        }).select("id").single();
        if (reservationError) {
          if (reservationError.code === "23505") throw new Error("You have already summarized this note. Download it from Summary history.");
          throw reservationError;
        }
        historyId = reservation.id;
        const { data: { session: authSession } } = await supabase.auth.getSession();
        if (!authSession?.access_token) throw new Error("Your session has expired. Sign in again.");
        const ocrTextByResource = {};
        if (String(resource.file_name || "").toLowerCase().endsWith(".pdf")) {
          const { extractResourceText } = await import("./question-ocr.js");
          setSummaryProgress("Preparing " + resource.title + " for OCR…", true);
          const { data: blob, error: downloadError } = await supabase.storage.from("course-resources").download(resource.file_path);
          if (downloadError || !blob) throw new Error(downloadError?.message || ("Could not download " + resource.title + "."));
          const file = new File([blob], resource.file_name, { type: resource.mime_type || blob.type });
          ocrTextByResource[resource.id] = await extractResourceText(file, (stage, progress) => {
            const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
            setSummaryProgress("Reading " + resource.title + ": " + stage, false, percent);
          }, { maxPdfPages: 150, maxOcrPages: 30, maxCharacters: 100000 });
        }
        setSummaryProgress("Generating your study summary…", true);
        const response = await fetch("/api/note-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + authSession.access_token },
          body: JSON.stringify({ courseId: course.id, resourceIds, ocrTextByResource })
        });
        const raw = await response.text();
        let result;
        try { result = raw ? JSON.parse(raw) : {}; }
        catch { throw new Error("The summary server returned an invalid response (HTTP " + response.status + ")."); }
        if (!response.ok) throw new Error(result.error || ("Summary request failed (HTTP " + response.status + ")."));
        if (!result.summary) throw new Error("The AI did not return a summary. Please try again.");
        setSummaryProgress("Preparing your downloadable PDF…", true);
        const { jsPDF } = await import("https://cdn.jsdelivr.net/npm/jspdf@3.0.1/dist/jspdf.es.min.js");
        const pdf = buildSummaryPdf(jsPDF, result);
        pdfPath = user.id + "/" + resource.id + "/" + historyId + ".pdf";
        const { error: uploadError } = await supabase.storage.from("summary-pdfs").upload(pdfPath, pdf.output("blob"), { contentType: "application/pdf", upsert: false });
        if (uploadError) throw uploadError;
        const { error: updateError } = await supabase.from("note_summary_history").update({ pdf_path: pdfPath, status: "ready" }).eq("id", historyId).eq("user_id", user.id);
        if (updateError) throw updateError;
        result.historyPdfPath = pdfPath;
        sessionStorage.setItem("universeActiveSummary", JSON.stringify(result));
        setSummaryProgress("Summary PDF is ready. Opening it now…", false, 100);
        setStatus("Your study summary PDF is ready.", true);
        location.href = "./summary-session.html";
      } catch (error) {
        if (pdfPath) await supabase.storage.from("summary-pdfs").remove([pdfPath]);
        if (historyId) await supabase.from("note_summary_history").delete().eq("id", historyId).eq("user_id", user.id);
        setStatus(error.message || "Could not generate the summary.");
        await loadNotes();
      } finally {
        generateButton.disabled = notesList.querySelectorAll('input[type="checkbox"]:checked').length === 0;
        generateButton.textContent = "Generate summary";
        $("#summary-generation-progress").hidden = true;
      }
    }

    function buildSummaryPdf(JsPDF, result) {
      const doc = new JsPDF({ unit: "mm", format: "a4" });
      const left = 18, width = 174; let y = 20;
      const ensure = height => { if (y + height > 280) { doc.addPage(); y = 20; } };
      const heading = value => { ensure(12); doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(String(value || ""), left, y); y += 8; };
      const paragraph = value => {
        doc.setFont("helvetica", "normal"); doc.setFontSize(10);
        const lines = doc.splitTextToSize(String(value || ""), width);
        ensure(lines.length * 5 + 3); doc.text(lines, left, y); y += lines.length * 5 + 4;
      };
      doc.setFont("helvetica", "bold"); doc.setFontSize(19);
      const titleLines = doc.splitTextToSize(result.summary.title || "Study Summary", width);
      doc.text(titleLines, left, y); y += titleLines.length * 8 + 3;
      paragraph(result.course.code + " — " + result.course.title);
      paragraph("Source note: " + (result.sources || []).join(", "));
      heading("Overview"); paragraph(result.summary.overview);
      heading("Key points"); (result.summary.keyPoints || []).forEach((item, i) => paragraph((i + 1) + ". " + item));
      heading("Topic breakdown");
      (result.summary.sections || []).forEach(section => {
        paragraph(section.heading); paragraph(section.summary);
        (section.details || []).forEach(item => paragraph("- " + item));
      });
      if (result.summary.keyTerms?.length) { heading("Key terms"); result.summary.keyTerms.forEach(item => paragraph(item.term + ": " + item.definition)); }
      if (result.summary.formulas?.length) { heading("Formulas and equations"); result.summary.formulas.forEach(item => paragraph(item.name + ": " + item.expression + ". " + item.explanation)); }
      heading("Revision checklist"); (result.summary.revisionChecklist || []).forEach((item, i) => paragraph((i + 1) + ". " + item));
      doc.setFontSize(8); doc.setTextColor(110);
      doc.text("UNI-VERSE · AI-generated revision aid. Check the original note for full context.", left, 288);
      return doc;
    }

    function setSummaryProgress(message, indeterminate = true, percent = 0) {
      const container = $("#summary-generation-progress"), track = $("#summary-generation-track");
      container.hidden = false;
      $("#summary-generation-stage").textContent = message;
      track.classList.toggle("is-indeterminate", indeterminate);
      track.setAttribute("aria-valuetext", indeterminate ? message : percent + "% complete");
      if (!indeterminate) track.setAttribute("aria-valuenow", String(percent));
      else track.removeAttribute("aria-valuenow");
      $("#summary-generation-fill").style.width = indeterminate ? "38%" : percent + "%";
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
