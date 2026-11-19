import { supabase, requireProfile, signOut, showMessage } from "./supabase.js";

document.querySelector("#logout").addEventListener("click", signOut);
const session = await requireProfile();

if (session) {
  if (session.profile.role !== "admin") location.replace("./student.html");
  document.querySelector("#user-label").textContent = session.profile.full_name || session.user.email;

  const departmentSelect = document.querySelector("#department");
  const resourceCourse = document.querySelector("#resource-course");
  const resourceType = document.querySelector("#resource-type");
  const questionFields = document.querySelector("#question-fields");
  const assessmentType = document.querySelector("#assessment-type");
  const resourceForm = document.querySelector("#resource-form");
  const uploadButton = document.querySelector("#upload-button");

  const MIME_TYPES = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  };
  const MAX_FILE_SIZE = 50 * 1024 * 1024;

  const { data: departments, error: deptError } = await supabase
    .from("departments").select("id,name,code").eq("is_active", true).order("name");
  if (deptError) departmentSelect.innerHTML = '<option value="">Could not load departments</option>';
  else {
    departmentSelect.innerHTML = '<option value="">Select department</option>';
    departments.forEach(d => {
      const option = document.createElement("option");
      option.value = d.id; option.textContent = `${d.name} (${d.code})`;
      departmentSelect.append(option);
    });
  }

  async function loadCourses() {
    const { data, error } = await supabase
      .from("courses")
      .select("id,code,title,is_active,department_id,departments(name)")
      .order("code");
    const target = document.querySelector("#courses");
    target.replaceChildren();
    if (error) { target.textContent = error.message; return []; }
    if (!data?.length) {
      target.textContent = "No courses have been created yet.";
      resourceCourse.innerHTML = '<option value="">No courses available</option>';
      return [];
    }

    resourceCourse.innerHTML = '<option value="">Select course</option>';
    data.filter(course => course.is_active).forEach(course => {
      const option = document.createElement("option");
      option.value = course.id;
      option.textContent = `${course.code} — ${course.title}`;
      option.dataset.departmentId = course.department_id;
      resourceCourse.append(option);
    });

    data.forEach(course => {
      const row = document.createElement("div"); row.className = "course-row";
      const info = document.createElement("span");
      info.textContent = `${course.code} — ${course.title} · ${course.departments?.name || "Department"} · ${course.is_active ? "Active" : "Inactive"}`;
      const button = document.createElement("button");
      button.textContent = course.is_active ? "Deactivate" : "Activate";
      button.addEventListener("click", async () => {
        if (!confirm(`${course.is_active ? "Deactivate" : "Activate"} ${course.code}?`)) return;
        const { error: updateError } = await supabase.from("courses")
          .update({ is_active: !course.is_active }).eq("id", course.id);
        if (updateError) alert(updateError.message);
        else { await loadCourses(); await loadResources(); }
      });
      row.append(info, button); target.append(row);
    });
    return data;
  }

  async function loadResources() {
    const target = document.querySelector("#resources");
    target.replaceChildren();
    const { data, error } = await supabase.from("course_resources")
      .select("id,title,resource_type,assessment_type,academic_year,semester,file_name,file_size,is_active,created_at,courses(code,title,departments(name))")
      .order("created_at", { ascending: false });
    if (error) { target.textContent = error.message; return; }
    if (!data?.length) { target.textContent = "No resources have been uploaded yet."; return; }

    data.forEach(resource => {
      const row = document.createElement("div"); row.className = "resource-item";
      const info = document.createElement("div");
      const heading = document.createElement("strong");
      heading.textContent = resource.title;
      const detail = document.createElement("p"); detail.className = "resource-meta";
      const type = resource.resource_type === "note" ? "Note" : `${resource.assessment_type === "test" ? "Test" : "Exam"} question`;
      const term = [resource.academic_year, resource.semester ? `Semester ${resource.semester}` : null].filter(Boolean).join(" · ");
      detail.textContent = `${resource.courses?.code || "Course"} — ${resource.courses?.title || ""} · ${type}${term ? " · " + term : ""} · ${resource.file_name}`;
      const status = document.createElement("p"); status.className = "resource-meta";
      status.textContent = resource.is_active ? "Visible to students" : "Hidden from students";
      info.append(heading, detail, status);

      const actions = document.createElement("div"); actions.className = "resource-actions";
      const toggle = document.createElement("button"); toggle.className = "btn secondary";
      toggle.textContent = resource.is_active ? "Hide" : "Publish";
      toggle.addEventListener("click", async () => {
        const { error: updateError } = await supabase.from("course_resources")
          .update({ is_active: !resource.is_active }).eq("id", resource.id);
        if (updateError) alert(updateError.message); else loadResources();
      });
      actions.append(toggle); row.append(info, actions); target.append(row);
    });
  }

  resourceType.addEventListener("change", () => {
    const isQuestion = resourceType.value === "past_question";
    questionFields.hidden = !isQuestion;
    assessmentType.required = isQuestion;
    if (!isQuestion) assessmentType.value = "";
  });

  document.querySelector("#course-form").addEventListener("submit", async event => {
    event.preventDefault();
    const message = document.querySelector("#message");
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    const payload = {
      department_id: departmentSelect.value,
      code: document.querySelector("#code").value.trim().toUpperCase(),
      title: document.querySelector("#title").value.trim(),
      description: document.querySelector("#description").value.trim() || null
    };
    const { error } = await supabase.from("courses").insert(payload);
    if (error) showMessage(message, error.message);
    else {
      showMessage(message, "Course added.", true);
      event.currentTarget.reset();
      await loadCourses();
    }
    button.disabled = false;
  });

  resourceForm.addEventListener("submit", async event => {
    event.preventDefault();
    const message = document.querySelector("#resource-message");
    const file = document.querySelector("#resource-file").files[0];
    const courseId = resourceCourse.value;
    const selectedCourse = resourceCourse.selectedOptions[0];
    const resourceKind = resourceType.value;
    const extension = file?.name.split(".").pop().toLowerCase();
    const mimeType = MIME_TYPES[extension];

    if (!file || !courseId || !selectedCourse?.dataset.departmentId) {
      showMessage(message, "Select a course and a file.");
      return;
    }
    if (!mimeType) {
      showMessage(message, "Only PDF, DOCX and PPTX files are accepted.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      showMessage(message, "The file exceeds the 50 MB limit.");
      return;
    }
    if (resourceKind === "past_question" && !assessmentType.value) {
      showMessage(message, "Choose whether this is a test or examination question.");
      return;
    }

    uploadButton.disabled = true;
    uploadButton.textContent = "Uploading…";
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${selectedCourse.dataset.departmentId}/${courseId}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("course-resources")
      .upload(filePath, file, { contentType: mimeType, cacheControl: "3600", upsert: false });

    if (uploadError) {
      showMessage(message, uploadError.message);
    } else {
      const payload = {
        course_id: courseId,
        resource_type: resourceKind,
        title: document.querySelector("#resource-title").value.trim(),
        description: document.querySelector("#resource-description").value.trim() || null,
        assessment_type: resourceKind === "past_question" ? assessmentType.value : null,
        academic_year: resourceKind === "past_question" ? document.querySelector("#academic-year").value.trim() || null : null,
        semester: resourceKind === "past_question" && document.querySelector("#semester").value
          ? Number(document.querySelector("#semester").value) : null,
        file_name: file.name,
        file_path: filePath,
        mime_type: mimeType,
        file_size: file.size
      };
      const { error: insertError } = await supabase.from("course_resources").insert(payload);
      if (insertError) {
        await supabase.storage.from("course-resources").remove([filePath]);
        showMessage(message, insertError.message);
      } else {
        showMessage(message, "Resource uploaded and published.", true);
        resourceForm.reset();
        questionFields.hidden = true;
        assessmentType.required = false;
        await loadResources();
      }
    }
    uploadButton.disabled = false;
    uploadButton.textContent = "Upload resource";
  });

  await loadCourses();
  await loadResources();
}