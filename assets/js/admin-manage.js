import { supabase, requireProfile, signOut } from "./supabase.js";

document.querySelector("#logout").addEventListener("click", signOut);
const session = await requireProfile();

if (session && session.profile.role !== "admin") {
  location.replace("./student.html");
} else if (session) {
  document.querySelector("#user-label").textContent = session.profile.full_name || session.user.email;

  async function loadCourses() {
    const target = document.querySelector("#courses");
    target.replaceChildren();
    const { data, error } = await supabase.from("courses")
      .select("id,code,title,is_active")
      .order("code");
    if (error) { target.textContent = error.message; return; }
    if (!data?.length) { target.textContent = "No courses have been created yet."; return; }

    const { data: assignments, error: assignmentError } = await supabase
      .from("course_departments").select("course_id,departments(name,code)");
    if (assignmentError) { target.textContent = assignmentError.message; return; }
    const departmentsByCourse = new Map();
    (assignments || []).forEach(item => {
      if (!departmentsByCourse.has(item.course_id)) departmentsByCourse.set(item.course_id, []);
      if (item.departments) departmentsByCourse.get(item.course_id).push(item.departments);
    });

    data.forEach(course => {
      const row = document.createElement("div"); row.className = "course-row";
      const info = document.createElement("span");
      const names = (departmentsByCourse.get(course.id) || []).map(d => d.code || d.name).join(", ");
      info.textContent = `${course.code} — ${course.title} · ${names || "No department"} · ${course.is_active ? "Active" : "Inactive"}`;
      const actions = document.createElement("div");
      actions.className = "resource-actions";
      info.className = "course-row-info";

      const editTitle = document.createElement("button");
      editTitle.className = "btn secondary";
      editTitle.textContent = "Edit title";
      editTitle.addEventListener("click", async () => {
        const nextTitle = prompt(`Edit title for ${course.code}:`, course.title);
        if (nextTitle === null) return;
        const title = nextTitle.trim();
        if (!title) { alert("The course title cannot be empty."); return; }
        if (title === course.title) return;

        editTitle.disabled = true;
        const { error: updateError } = await supabase.from("courses")
          .update({ title }).eq("id", course.id);
        if (updateError) {
          alert("Could not update the course title: " + updateError.message);
          editTitle.disabled = false;
          return;
        }
        await loadCourses();
        await loadResources();
      });

      const button = document.createElement("button");
      button.className = "btn secondary";
      button.textContent = course.is_active ? "Deactivate" : "Activate";
      button.addEventListener("click", async () => {
        if (!confirm(`${course.is_active ? "Deactivate" : "Activate"} ${course.code}?`)) return;
        button.disabled = true;
        const { error: updateError } = await supabase.from("courses")
          .update({ is_active: !course.is_active }).eq("id", course.id);
        if (updateError) alert(updateError.message);
        await loadCourses();
        await loadResources();
      });
      const removeCourse = document.createElement("button");
      removeCourse.className = "btn danger";
      removeCourse.textContent = "Delete";
      removeCourse.addEventListener("click", async () => {
        if (!confirm(`Permanently delete ${course.code} — ${course.title}? This also deletes its course-linked records and uploaded files. This cannot be undone.`)) return;
        removeCourse.disabled = true;
        removeCourse.textContent = "Deleting…";

        let filePaths = [];
        try {
          const { data: courseResources, error: lookupError } = await supabase
            .from("course_resources").select("file_path").eq("course_id", course.id);
          if (lookupError) throw new Error("Could not check the course resources: " + lookupError.message);
          filePaths = [...new Set((courseResources || []).map(item => item.file_path).filter(Boolean))];

          // Delete the database row first. Its foreign keys cascade to resource metadata.
          // If this fails, leave every stored file untouched so existing records stay valid.
          const { data: deletedCourse, error: deleteError } = await supabase
            .from("courses").delete().eq("id", course.id).select("id").maybeSingle();
          if (deleteError) throw new Error("Course was not deleted: " + deleteError.message);
          if (!deletedCourse) throw new Error("No course record was deleted. The page may be out of date; refresh and try again.");
        } catch (error) {
          alert(error?.message || "The course could not be deleted. Please try again.");
          removeCourse.disabled = false;
          removeCourse.textContent = "Delete";
          return;
        }

        // The database deletion succeeded. Handle Storage failures separately so we
        // never tell the admin the course still exists when only file cleanup failed.
        let storageError = null;
        try {
          for (let index = 0; index < filePaths.length; index += 1000) {
            const result = await supabase.storage.from("course-resources").remove(filePaths.slice(index, index + 1000));
            if (result.error) { storageError = result.error; break; }
          }
        } catch (error) {
          storageError = error;
        }

        try {
          await loadCourses();
          await loadResources();
        } catch (refreshError) {
          console.error("Course was deleted, but the management lists could not refresh:", refreshError);
        }

        if (storageError) {
          alert("The course and its resource records were deleted, but some stored files could not be removed. They are now orphaned in the private bucket and need cleanup: " + (storageError.message || String(storageError)));
        }
      });
      actions.append(editTitle, button, removeCourse);
      row.append(info, actions);
      target.append(row);
    });
  }

  async function loadResources() {
    const target = document.querySelector("#resources");
    target.replaceChildren();
    const { data, error } = await supabase.from("course_resources")
      .select("id,course_id,title,description,resource_type,assessment_type,academic_year,semester,file_name,file_path,mime_type,is_active,created_at,courses(code,title)")
      .order("created_at", { ascending: false });
    if (error) { target.textContent = error.message; return; }
    if (!data?.length) { target.textContent = "No resources have been uploaded yet."; return; }

    data.forEach(resource => {
      const card = document.createElement("article");
      card.className = "resource-card admin-resource-card";
      const heading = document.createElement("div");
      heading.className = "resource-card-heading";
      const courseLabel = document.createElement("p");
      courseLabel.className = "course-code";
      courseLabel.textContent = resource.courses?.code
        ? `${resource.courses.code} · ${resource.courses.title || ""}`
        : "Course resource";
      const title = document.createElement("h3");
      title.textContent = resource.title;
      heading.append(courseLabel, title);
      card.append(heading);
      if (resource.description) {
        const description = document.createElement("p");
        description.className = "muted resource-description";
        description.textContent = resource.description;
        card.append(description);
      }
      const type = resource.resource_type === "note" ? "Course note"
        : resource.assessment_type === "test" ? "Test question" : "Examination question";
      const meta = document.createElement("p");
      meta.className = "resource-meta";
      meta.textContent = [type, resource.academic_year,
        resource.semester ? `Semester ${resource.semester}` : null, resource.file_name]
        .filter(Boolean).join(" · ");
      card.append(meta);
      const status = document.createElement("p");
      status.className = resource.is_active ? "resource-status is-published" : "resource-status is-hidden";
      status.textContent = resource.is_active ? "Visible to students" : "Hidden from students";
      card.append(status);
      const actions = document.createElement("div");
      actions.className = "resource-actions";
      const toggle = document.createElement("button");
      toggle.className = "btn secondary";
      toggle.textContent = resource.is_active ? "Hide" : "Publish";
      toggle.addEventListener("click", async () => {
        toggle.disabled = true;
        const { error: updateError } = await supabase.from("course_resources")
          .update({ is_active: !resource.is_active }).eq("id", resource.id);
        if (updateError) alert(updateError.message);
        await loadResources();
      });
      const edit = document.createElement("button");
      edit.className = "btn secondary";
      edit.textContent = "Edit";
      edit.addEventListener("click", async () => {
        const nextTitle = prompt("Resource title:", resource.title);
        if (nextTitle === null) return;
        if (!nextTitle.trim()) { alert("The title cannot be empty."); return; }
        const nextDescription = prompt("Resource description:", resource.description || "");
        if (nextDescription === null) return;
        const { error: editError } = await supabase.from("course_resources")
          .update({ title: nextTitle.trim(), description: nextDescription.trim() || null })
          .eq("id", resource.id);
        if (editError) alert(editError.message); else await loadResources();
      });
      const remove = document.createElement("button");
      remove.className = "btn danger";
      remove.textContent = "Delete";
      remove.addEventListener("click", async () => {
        if (!confirm('Permanently delete "' + resource.title + '" and its uploaded file?')) return;
        remove.disabled = true;
        remove.textContent = "Deleting…";
        try {
          const { data: deletedResource, error: deleteError } = await supabase
            .from("course_resources").delete().eq("id", resource.id).select("id").maybeSingle();
          if (deleteError) throw new Error("Resource was not deleted: " + deleteError.message);
          if (!deletedResource) throw new Error("No resource record was deleted. Refresh the page and try again.");
        } catch (error) {
          alert(error?.message || "The resource could not be deleted. Please try again.");
          remove.disabled = false;
          remove.textContent = "Delete";
          return;
        }
        let storageError = null;
        try {
          const result = await supabase.storage.from("course-resources").remove([resource.file_path]);
          storageError = result.error;
        } catch (error) { storageError = error; }
        try { await loadResources(); }
        catch (refreshError) { console.error("Resource was deleted, but the management list could not refresh:", refreshError); }
        if (storageError) alert("The resource record was deleted, but its stored file could not be removed. The file is now orphaned in the private bucket and needs cleanup: " + (storageError.message || String(storageError)));
      });

      const extension = resource.file_name.split(".").pop().toLowerCase();
      if (resource.resource_type === "past_question" && ["pdf", "jpg", "jpeg", "png", "webp"].includes(extension) && resource.is_active) {
        const extract = document.createElement("button");
        extract.className = "btn secondary";
        extract.textContent = "Extract questions";
        extract.addEventListener("click", () => processQuestionResource(resource, extract));
        actions.append(extract);
      }
      actions.append(toggle, edit, remove);
      card.append(actions);
      target.append(card);
    });
  }


  async function questionBankRequest(method = "GET", body) {
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (!authSession?.access_token) throw new Error("Your session has expired. Sign in again.");
    const response = await fetch("/api/question-bank", {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authSession.access_token}` },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const raw = await response.text();
    let result;
    try { result = raw ? JSON.parse(raw) : {}; }
    catch { throw new Error(`The question-bank service returned an invalid response (HTTP ${response.status}).`); }
    if (!response.ok) throw new Error(result.error || `Question-bank request failed (HTTP ${response.status}).`);
    return result;
  }

  async function processQuestionResource(resource, button) {
    const status = document.querySelector("#question-bank-status");
    button.disabled = true;
    try {
      status.textContent = "Downloading the source document…";
      const { data: blob, error } = await supabase.storage.from("course-resources").download(resource.file_path);
      if (error || !blob) throw new Error(error?.message || "Could not download the source document.");
      const file = new File([blob], resource.file_name, { type: resource.mime_type || blob.type });
      const { extractResourceText } = await import("./question-ocr.js");
      const extractedText = await extractResourceText(file, (stage, progress) => {
        const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
        status.textContent = percent ? `OCR: ${stage} (${percent}%)` : `OCR: ${stage}…`;
      });
      if (extractedText.replace(/\s/g, "").length < 100) {
        throw new Error("Very little readable text was found. Try a clearer scan or a higher-resolution image.");
      }
      status.textContent = "Structuring questions with AI…";
      const result = await questionBankRequest("POST", {
        courseId: resource.course_id,
        resourceId: resource.id,
        extractedText
      });
      status.textContent = `Processed ${result.extracted} questions. ${result.staged} new questions were added to the review queue; ${result.duplicatesSkipped} duplicates were skipped.`;
      await loadPendingQuestions();
    } catch (error) {
      status.textContent = error?.message || "Could not process this question document.";
    } finally {
      button.disabled = false;
    }
  }

  async function loadPendingQuestions() {
    const root = document.querySelector("#pending-questions");
    const status = document.querySelector("#question-bank-status");
    root.replaceChildren();
    try {
      const { questions = [] } = await questionBankRequest("GET");
      if (!questions.length) {
        root.textContent = "No questions are waiting for review.";
        return;
      }
      questions.forEach(item => renderPendingQuestion(root, item));
    } catch (error) {
      root.textContent = error?.message || "Could not load pending questions.";
      if (status) status.textContent = "Question review could not be loaded.";
    }
  }

  function renderPendingQuestion(root, item) {
    const card = document.createElement("article");
    card.className = "resource-card question-review-card";
    const course = document.createElement("p");
    course.className = "course-code";
    course.textContent = item.courses?.code
      ? `${item.courses.code} · ${item.course_resources?.title || "Past-question source"}`
      : "Past-question source";
    const heading = document.createElement("h3");
    heading.textContent = item.question_type === "mcq" ? "Multiple-choice question" : "Theory question";
    const page = document.createElement("p");
    page.className = "resource-meta";
    page.textContent = [item.course_resources?.file_name, item.source_page ? `Page ${item.source_page}` : null, "Pending review"].filter(Boolean).join(" · ");
    const question = document.createElement("textarea");
    question.rows = 3;
    question.maxLength = 1200;
    question.value = item.question || "";
    const questionLabel = document.createElement("label");
    questionLabel.textContent = "Question";
    questionLabel.append(question);
    card.append(course, heading, page, questionLabel);

    let optionInputs = [];
    let correctAnswer;
    let explanation;
    let markingGuide;
    let modelAnswer;
    if (item.question_type === "mcq") {
      const optionsWrap = document.createElement("div");
      optionsWrap.className = "question-review-options";
      ["A", "B", "C", "D"].forEach((letter, index) => {
        const input = document.createElement("input");
        input.value = item.options?.[index] || "";
        input.maxLength = 500;
        input.setAttribute("aria-label", `Option ${letter}`);
        const label = document.createElement("label");
        label.textContent = `Option ${letter}`;
        label.append(input);
        optionsWrap.append(label);
        optionInputs.push(input);
      });
      correctAnswer = document.createElement("select");
      correctAnswer.add(new Option("Choose verified answer", ""));
      ["A", "B", "C", "D"].forEach((letter, index) => correctAnswer.add(new Option(`Option ${letter}`, String(index))));
      if (Number.isInteger(item.correct_index)) correctAnswer.value = String(item.correct_index);
      const answerLabel = document.createElement("label");
      answerLabel.textContent = "Correct answer (verify against the source)";
      answerLabel.append(correctAnswer);
      explanation = document.createElement("textarea");
      explanation.rows = 2;
      explanation.value = item.explanation || "";
      const explanationLabel = document.createElement("label");
      explanationLabel.textContent = "Explanation";
      explanationLabel.append(explanation);
      card.append(optionsWrap, answerLabel, explanationLabel);
    } else {
      markingGuide = document.createElement("textarea");
      markingGuide.rows = 4;
      markingGuide.value = item.marking_guide || "";
      const guideLabel = document.createElement("label");
      guideLabel.textContent = "Marking guide (required to publish)";
      guideLabel.append(markingGuide);
      modelAnswer = document.createElement("textarea");
      modelAnswer.rows = 4;
      modelAnswer.value = item.model_answer || "";
      const answerLabel = document.createElement("label");
      answerLabel.textContent = "Model answer";
      answerLabel.append(modelAnswer);
      card.append(guideLabel, answerLabel);
    }

    const actions = document.createElement("div");
    actions.className = "resource-actions";
    const publish = document.createElement("button");
    publish.className = "btn primary";
    publish.textContent = "Approve & publish";
    publish.addEventListener("click", () => saveQuestionReview(item, {
      status: "active",
      question: question.value,
      ...(item.question_type === "mcq" ? {
        options: optionInputs.map(input => input.value),
        correctIndex: correctAnswer.value === "" ? null : Number(correctAnswer.value),
        explanation: explanation.value
      } : {
        markingGuide: markingGuide.value,
        modelAnswer: modelAnswer.value
      })
    }, publish, card));
    const retire = document.createElement("button");
    retire.className = "btn danger";
    retire.textContent = "Discard";
    retire.addEventListener("click", () => saveQuestionReview(item, { status: "retired" }, retire, card));
    actions.append(publish, retire);
    card.append(actions);
    root.append(card);
  }

  async function saveQuestionReview(item, payload, button, card) {
    const status = document.querySelector("#question-bank-status");
    button.disabled = true;
    try {
      await questionBankRequest("PATCH", { id: item.id, ...payload });
      status.textContent = payload.status === "active" ? "Question published to the course bank." : "Question discarded.";
      await loadPendingQuestions();
    } catch (error) {
      status.textContent = error?.message || "Could not save the review.";
      button.disabled = false;
    }
  }

  document.querySelector("#refresh-question-bank")?.addEventListener("click", loadPendingQuestions);

  await loadCourses();
  await loadResources();
  await loadPendingQuestions();
}