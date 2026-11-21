import { supabase, requireProfile, signOut, showMessage } from "./supabase.js";

document.querySelector("#logout").addEventListener("click", signOut);
const session = await requireProfile();

if (session && session.profile.role !== "admin") {
  location.replace("./student.html");
} else if (session) {
  document.querySelector("#user-label").textContent = session.profile.full_name || session.user.email;

  const departmentOptions = document.querySelector("#department-options");
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
  if (deptError) {
    departmentOptions.textContent = "Could not load departments. Refresh the page and try again.";
  } else {
    departmentOptions.replaceChildren();
    departments.forEach(d => {
      const label = document.createElement("label");
      label.className = "department-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "departments";
      checkbox.value = d.id;
      const name = document.createElement("span");
      name.textContent = `${d.name} (${d.code})`;
      label.append(checkbox, name);
      departmentOptions.append(label);
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

  const courseForm = document.querySelector("#course-form");
  courseForm.addEventListener("submit", async event => {
    event.preventDefault();
    const form = courseForm;
    const message = document.querySelector("#message");
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;

    try {
      const selectedDepartmentIds = [...departmentOptions.querySelectorAll('input[name="departments"]:checked')]
        .map(checkbox => checkbox.value);
      if (!selectedDepartmentIds.length) {
        showMessage(message, "Select at least one department.");
        return;
      }

      const code = document.querySelector("#code").value.trim().toUpperCase();
      const title = document.querySelector("#title").value.trim();
      if (!code || !title) {
        showMessage(message, "Enter both a course code and course title.");
        return;
      }

      const payload = {
        department_id: selectedDepartmentIds[0],
        code,
        title,
        description: document.querySelector("#description").value.trim() || null
      };
      const { data: course, error } = await supabase.from("courses").insert(payload).select("id").single();
      if (error) {
        showMessage(message, error.message);
        return;
      }

      const { error: assignmentError } = await supabase.from("course_departments").insert(
        selectedDepartmentIds.map(department_id => ({ course_id: course.id, department_id }))
      );
      if (assignmentError) {
        // Check the compensating delete instead of silently ignoring a failed rollback.
        let rolledBackCourse = null;
        let rollbackError = null;
        try {
          const rollback = await supabase.from("courses")
            .delete().eq("id", course.id).select("id").maybeSingle();
          rolledBackCourse = rollback.data;
          rollbackError = rollback.error;
        } catch (error) {
          rollbackError = error;
        }
        if (rollbackError || !rolledBackCourse) {
          showMessage(message, "Department assignment failed, and the new course could not be confirmed as rolled back. Course ID: " + course.id + ". Assignment error: " + assignmentError.message + (rollbackError ? " Rollback error: " + (rollbackError.message || String(rollbackError)) : ""));
        } else {
          showMessage(message, "Course was not saved: " + assignmentError.message);
        }
        return;
      }

      showMessage(message, "Course added to " + selectedDepartmentIds.length + " department(s).", true);
      form.reset();
      await loadCourses();
    } catch (error) {
      showMessage(message, error?.message || "The course could not be saved. Check your connection and try again.");
    } finally {
      button.disabled = false;
    }
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
        let cleanupError = null;
        try {
          const cleanup = await supabase.storage.from("course-resources").remove([filePath]);
          cleanupError = cleanup.error;
        } catch (error) {
          cleanupError = error;
        }
        showMessage(message, cleanupError
          ? insertError.message + " Storage cleanup also failed; orphaned file path: " + filePath + ". Cleanup error: " + (cleanupError.message || String(cleanupError))
          : insertError.message);
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

if (session && session.profile.role === "admin" && document.querySelector("#video-form")) {
  const videoForm = document.querySelector("#video-form");
  const videoCourse = document.querySelector("#video-course");
  const videoFile = document.querySelector("#video-file");
  const videoButton = document.querySelector("#video-upload-button");
  const videoMessage = document.querySelector("#video-message");
  const progressPanel = document.querySelector("#video-upload-progress");
  const progressStatus = document.querySelector("#video-upload-status");
  const progressPercent = document.querySelector("#video-upload-percent");
  const progressBar = document.querySelector("#video-upload-bar");
  const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
  const VIDEO_TYPES = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" };
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_8egrnqtwHtrfzvtPcldiQw_y1Wqhh9w";

  async function loadVideoCourses() {
    const previous = videoCourse.value;
    const { data, error } = await supabase.from("courses")
      .select("id,code,title,is_active").eq("is_active", true).order("code");
    if (error) {
      videoCourse.innerHTML = '<option value="">Could not load courses</option>';
      showMessage(videoMessage, "Could not load courses: " + error.message);
      return;
    }
    videoCourse.innerHTML = '<option value="">Select course</option>';
    (data || []).forEach(course => {
      const option = document.createElement("option");
      option.value = course.id;
      option.textContent = course.code + " — " + course.title;
      videoCourse.append(option);
    });
    if ((data || []).some(course => course.id === previous)) videoCourse.value = previous;
  }

  document.querySelector("#refresh-video-courses").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try { await loadVideoCourses(); }
    finally { button.disabled = false; }
  });

  function uploadVideoTus(file, path, contentType, accessToken, courseId) {
    return import("https://esm.sh/tus-js-client@4.3.1").then(({ Upload }) => new Promise(async (resolve, reject) => {
      let effectivePath = path;
      const upload = new Upload(file, {
        endpoint: "https://xcybjuwearndoljqkzmy.storage.supabase.co/storage/v1/upload/resumable",
        headers: {
          authorization: "Bearer " + accessToken,
          apikey: SUPABASE_PUBLISHABLE_KEY
        },
        metadata: { bucketName: "course-videos", objectName: path, contentType, cacheControl: "3600" },
        chunkSize: 6 * 1024 * 1024,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        onError(error) { reject(error); },
        onProgress(bytesUploaded, bytesTotal) {
          const percent = bytesTotal ? Math.min(100, Math.round(bytesUploaded / bytesTotal * 100)) : 0;
          progressPercent.textContent = percent + "%";
          progressBar.style.width = percent + "%";
          progressStatus.textContent = "Uploading video · " + (bytesUploaded / 1048576).toFixed(1) + " / " + (bytesTotal / 1048576).toFixed(1) + " MB";
        },
        onSuccess() {
          progressPercent.textContent = "100%";
          progressBar.style.width = "100%";
          progressStatus.textContent = "Upload complete. Saving video details…";
          resolve(effectivePath);
        }
      });
      try {
        const previous = await upload.findPreviousUploads();
        const matching = previous.find(item => item.metadata?.objectName?.startsWith(courseId + "/"));
        if (matching) {
          upload.resumeFromPreviousUpload(matching);
          effectivePath = matching.metadata.objectName;
        }
        upload.start();
      } catch (error) { reject(error); }
    }));
  }

  videoForm.addEventListener("submit", async event => {
    event.preventDefault();
    const file = videoFile.files[0];
    const courseId = videoCourse.value;
    const extension = file?.name.split(".").pop().toLowerCase();
    const mimeType = VIDEO_TYPES[extension];
    if (!courseId || !file) {
      showMessage(videoMessage, "Select a course and a video file.");
      return;
    }
    if (!mimeType || (file.type && file.type !== mimeType)) {
      showMessage(videoMessage, "Choose an MP4, WEBM or MOV video.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_VIDEO_SIZE) {
      showMessage(videoMessage, "Videos must be larger than 0 bytes and no more than 50 MB.");
      return;
    }
    const title = document.querySelector("#video-title").value.trim();
    if (!title) {
      showMessage(videoMessage, "Enter a video title.");
      return;
    }

    videoButton.disabled = true;
    videoButton.textContent = "Uploading…";
    videoMessage.textContent = "";
    videoMessage.classList.remove("success");
    progressPanel.hidden = false;
    progressPercent.textContent = "0%";
    progressBar.style.width = "0%";
    progressStatus.textContent = "Preparing resumable upload…";

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const videoPath = courseId + "/" + crypto.randomUUID() + "-" + safeName;
    let uploadCompleted = false;
    try {
      const { data: { session: authSession }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !authSession?.access_token) throw new Error("Your session expired. Sign in again and retry.");

      const storedVideoPath = await uploadVideoTus(file, videoPath, mimeType, authSession.access_token, courseId);
      uploadCompleted = true;

      const { error: insertError } = await supabase.from("course_videos").insert({
        course_id: courseId,
        title,
        description: document.querySelector("#video-description").value.trim() || null,
        topic: document.querySelector("#video-topic").value.trim() || null,
        video_path: storedVideoPath,
        file_name: file.name,
        mime_type: mimeType,
        file_size: file.size
      });
      if (insertError) {
        let cleanupError = null;
        try {
          const cleanup = await supabase.storage.from("course-videos").remove([storedVideoPath]);
          cleanupError = cleanup.error;
        } catch (error) { cleanupError = error; }
        throw new Error("The video uploaded, but its details could not be saved: " + insertError.message +
          (cleanupError ? " Storage cleanup also failed; orphaned path: " + storedVideoPath + ". " + cleanupError.message : ""));
      }

      showMessage(videoMessage, "Video uploaded and published successfully.", true);
      videoForm.reset();
      progressStatus.textContent = "Video published.";
      progressPercent.textContent = "100%";
      progressBar.style.width = "100%";
    } catch (error) {
      console.error("Video upload failed:", error);
      showMessage(videoMessage, error?.message || "The video could not be uploaded. Check your connection and try again.");
      progressStatus.textContent = uploadCompleted ? "Upload finished, but publishing failed." : "Upload did not complete. Retry the same file to resume if the upload is still available.";
    } finally {
      videoButton.disabled = false;
      videoButton.textContent = "Upload video";
    }
  });

  await loadVideoCourses();
}
