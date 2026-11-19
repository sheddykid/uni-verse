import { supabase, requireProfile, signOut, showMessage } from "./supabase.js";

document.querySelector("#logout").addEventListener("click", signOut);
const session = await requireProfile();

if (session && session.profile.role !== "admin") {
  location.replace("./student.html");
} else if (session) {
  document.querySelector("#user-label").textContent = session.profile.full_name || session.user.email;

  const departmentSelect = document.querySelector("#department");
  const resourceCourse = document.querySelector("#resource-course");
  const resourceType = document.querySelector("#resource-type");
  const questionFields = document.querySelector("#question-fields");
  const assessmentType = document.querySelector("#assessment-type");
  const resourceForm = document.querySelector("#resource-form");
  const uploadButton = document.querySelector("#upload-button");
  const fileInput = document.querySelector("#resource-file");

  const MIME_TYPES = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp"
  };
  const DOCUMENT_ACCEPT = ".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation";
  const QUESTION_ACCEPT = DOCUMENT_ACCEPT + ",.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
  const MAX_FILE_SIZE = 50 * 1024 * 1024;

  const { data: departments, error: deptError } = await supabase
    .from("departments").select("id,name,code").eq("is_active", true).order("name");
  if (deptError) departmentSelect.innerHTML = '<option value="">Could not load departments</option>';
  else {
    departmentSelect.replaceChildren();
    departments.forEach(d => {
      const option = document.createElement("option");
      option.value = d.id; option.textContent = `${d.name} (${d.code})`;
      departmentSelect.append(option);
    });
  }

  async function loadCourses() {
    const previousCourseId = resourceCourse.value;
    const { data, error } = await supabase
      .from("courses")
      .select("id,code,title,is_active")
      .eq("is_active", true)
      .order("code");
    if (error) {
      resourceCourse.innerHTML = '<option value="">Could not load courses</option>';
      return [];
    }
    resourceCourse.innerHTML = '<option value="">Select course</option>';
    (data || []).forEach(course => {
      const option = document.createElement("option");
      option.value = course.id;
      option.textContent = `${course.code} — ${course.title}`;
      resourceCourse.append(option);
    });
    if ((data || []).some(course => course.id === previousCourseId)) {
      resourceCourse.value = previousCourseId;
    }
    return data || [];
  }

  const refreshCoursesButton = document.querySelector("#refresh-courses");
  refreshCoursesButton.addEventListener("click", async () => {
    refreshCoursesButton.disabled = true;
    refreshCoursesButton.textContent = "Refreshing…";
    try {
      await loadCourses();
    } finally {
      refreshCoursesButton.disabled = false;
      refreshCoursesButton.textContent = "↻ Refresh";
    }
  });

  function updateFileAccept() {
    fileInput.accept = resourceType.value === "past_question" ? QUESTION_ACCEPT : DOCUMENT_ACCEPT;
  }
  resourceType.addEventListener("change", () => {
    const isQuestion = resourceType.value === "past_question";
    questionFields.hidden = !isQuestion;
    assessmentType.required = isQuestion;
    if (!isQuestion) assessmentType.value = "";
    updateFileAccept();
  });
  updateFileAccept();

  document.querySelector("#course-form").addEventListener("submit", async event => {
    event.preventDefault();
    const message = document.querySelector("#message");
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    const selectedDepartmentIds = [...departmentSelect.selectedOptions]
      .map(option => option.value).filter(Boolean);
    if (!selectedDepartmentIds.length) {
      showMessage(message, "Select at least one department.");
      button.disabled = false;
      return;
    }
    const payload = {
      department_id: selectedDepartmentIds[0],
      code: document.querySelector("#code").value.trim().toUpperCase(),
      title: document.querySelector("#title").value.trim(),
      description: document.querySelector("#description").value.trim() || null
    };
    const { data: course, error } = await supabase.from("courses").insert(payload).select("id").single();
    if (error) {
      showMessage(message, error.message);
    } else {
      const { error: assignmentError } = await supabase.from("course_departments").insert(
        selectedDepartmentIds.map(department_id => ({ course_id: course.id, department_id }))
      );
      if (assignmentError) {
        await supabase.from("courses").delete().eq("id", course.id);
        showMessage(message, "Course was not saved: " + assignmentError.message);
      } else {
        showMessage(message, "Course added to " + selectedDepartmentIds.length + " department(s).", true);
        event.currentTarget.reset();
        await loadCourses();
      }
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

    if (!file || !courseId || !selectedCourse?.value) {
      showMessage(message, "Select a course and a file.");
      return;
    }
    if (!mimeType) {
      showMessage(message, resourceKind === "past_question"
        ? "Accepted: PDF, DOCX, PPTX, JPG, PNG and WEBP."
        : "Only PDF, DOCX and PPTX files are accepted.");
      return;
    }
    if (mimeType.startsWith("image/") && resourceKind !== "past_question") {
      showMessage(message, "Image uploads are only available for past questions and tests/exams.");
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
    const filePath = `${courseId}/${crypto.randomUUID()}-${safeName}`;
    try {
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
        updateFileAccept();
        questionFields.hidden = true;
        assessmentType.required = false;
      }
      }
    } catch (error) {
      showMessage(message, error?.message || "The upload failed. Check your connection and try again.");
    } finally {
      uploadButton.disabled = false;
      uploadButton.textContent = "Upload resource";
    }
  });

  await loadCourses();
}