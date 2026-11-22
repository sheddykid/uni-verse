import { supabase, requireProfile, signOut, showMessage } from "./supabase.js";

const session = await requireProfile();

if (session && session.profile.role !== "admin") {
  location.replace("./student.html");
} else if (session) {
  const userLabel = document.querySelector("#user-label");
  if (userLabel) userLabel.textContent = session.profile.full_name || session.user.email;

  const departmentOptions = document.querySelector("#department-options");
  const courseForm = document.querySelector("#course-form");
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

  if (departmentOptions) {
    const { data: departments, error: deptError } = await supabase
      .from("departments").select("id,name,code").eq("is_active", true).order("name");
    if (deptError) {
      departmentOptions.textContent = "Could not load departments. Refresh the page and try again.";
    } else {
      const faculties = [
        ["College of Engineering", ["Civil Engineering", "Electrical and Information Engineering", "Mechanical Engineering", "Petroleum Engineering", "Chemical Engineering", "Mechatronics Engineering"], "departments / programmes"],
        ["College of Science and Technology", ["Architecture", "Building Technology", "Estate Management", "Biological Sciences", "Biochemistry", "Chemistry", "Computer and Information Sciences", "Mathematics", "Physics", "Quantity Surveying"], "departments / programmes"],
        ["College of Management and Social Sciences", ["Accounting", "Banking and Finance", "Business Management", "Economics", "Mass Communication", "Sociology"]],
        ["College of Leadership and Development Studies", ["Political Science and International Relations", "Psychology", "Languages and General Studies", "Leadership Studies"]],
        ["College of Health Sciences", ["Anatomy", "Medical Laboratory Science", "Medicine and Surgery", "Nursing Science", "Physiology"], "programmes"],
        ["College of Law", ["Law"], "programme"]
      ];
      departmentOptions.replaceChildren();
      const byName = new Map((departments || []).map(item => [item.name, item]));
      faculties.forEach(([facultyName, names, unitLabel = "departments"]) => {
        const available = names.map(name => byName.get(name)).filter(Boolean);
        const group = document.createElement("details");
        group.className = "faculty-picker-group";
        const summary = document.createElement("summary");
        const facultyCheck = document.createElement("input");
        facultyCheck.type = "checkbox";
        facultyCheck.className = "faculty-select-all";
        facultyCheck.setAttribute("aria-label", "Select all departments in " + facultyName);
        const label = document.createElement("span");
        label.textContent = facultyName;
        const count = document.createElement("small");
        count.textContent = available.length + " " + unitLabel;
        summary.append(facultyCheck, label, count);
        group.append(summary);
        const list = document.createElement("div");
        list.className = "faculty-department-list";
        const departmentChecks = [];
        available.forEach(department => {
          const row = document.createElement("label");
          row.className = "department-option";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.name = "departments";
          checkbox.value = department.id;
          checkbox.dataset.faculty = facultyName;
          const name = document.createElement("span");
          name.textContent = department.name;
          row.append(checkbox, name);
          list.append(row);
          departmentChecks.push(checkbox);
          checkbox.addEventListener("change", () => {
            facultyCheck.checked = departmentChecks.length > 0 && departmentChecks.every(item => item.checked);
            facultyCheck.indeterminate = departmentChecks.some(item => item.checked) && !facultyCheck.checked;
          });
        });
        facultyCheck.addEventListener("click", event => event.stopPropagation());
        facultyCheck.addEventListener("change", () => {
          departmentChecks.forEach(checkbox => { checkbox.checked = facultyCheck.checked; });
          facultyCheck.indeterminate = false;
        });
        group.append(list);
        departmentOptions.append(group);
      });
      const ungrouped = (departments || []).filter(d => !faculties.some(([, names]) => names.includes(d.name)));
      if (ungrouped.length) {
        const group = document.createElement("details");
        group.className = "faculty-picker-group";
        const summary = document.createElement("summary");
        const label = document.createElement("span");
        label.textContent = "Other departments";
        summary.append(label);
        group.append(summary);
        const list = document.createElement("div");
        list.className = "faculty-department-list";
        ungrouped.forEach(d => {
          const row = document.createElement("label");
          row.className = "department-option";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox"; checkbox.name = "departments"; checkbox.value = d.id;
          const name = document.createElement("span"); name.textContent = d.name;
          row.append(checkbox, name); list.append(row);
        });
        group.append(list); departmentOptions.append(group);
      }
    }
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

  if (resourceForm) {
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
  
    }

  if (courseForm) {
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
      } catch (error) {
        showMessage(message, error?.message || "The course could not be saved. Check your connection and try again.");
      } finally {
        button.disabled = false;
      }
    });
  
    }

  if (resourceForm) {
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
  const MAX_VIDEO_SIZE = 5 * 1024 * 1024 * 1024;
  const VIDEO_TYPES = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" };

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

  async function videoApi(action, payload = {}) {
    const { data: { session: authSession }, error } = await supabase.auth.getSession();
    if (error || !authSession?.access_token) throw new Error("Your session expired. Sign in again.");
    const response = await fetch("/api/course-videos", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authSession.access_token },
      body: JSON.stringify({ action, ...payload })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Cloud video storage request failed.");
    return result;
  }

  function videoUploadFingerprint(file, courseId) {
    return [courseId, file.name, file.size, file.lastModified].join("|");
  }

  function uploadVideoPart(url, blob, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded); };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const etag = xhr.getResponseHeader("ETag");
          if (!etag) reject(new Error("R2 did not return an ETag. Check the bucket CORS ExposeHeaders setting."));
          else resolve(etag);
        } else reject(new Error("Video part upload failed (HTTP " + xhr.status + ")."));
      };
      xhr.onerror = () => reject(new Error("Network error while uploading a video part."));
      xhr.onabort = () => reject(new Error("Video part upload was interrupted."));
      xhr.send(blob);
    });
  }

  async function uploadVideoR2(file, courseId, contentType) {
    const fingerprint = videoUploadFingerprint(file, courseId);
    const storageKey = "uniVerseR2Multipart:" + fingerprint;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(storageKey) || "null"); } catch {}
    let upload = saved && saved.key && saved.uploadId ? saved : null;

    if (upload) {
      try {
        const listed = await videoApi("list-parts", { courseId, key: upload.key, uploadId: upload.uploadId });
        upload.parts = Object.fromEntries((listed.parts || []).map(part => [part.partNumber, part.etag]));
      } catch {
        upload = null;
        localStorage.removeItem(storageKey);
      }
    }
    if (!upload) {
      const created = await videoApi("initiate", { courseId, fileName: file.name, contentType, size: file.size });
      upload = { key: created.key, uploadId: created.uploadId, partSize: created.partSize, parts: {} };
      localStorage.setItem(storageKey, JSON.stringify(upload));
    }

    const partSize = Number(upload.partSize) || 32 * 1024 * 1024;
    const partCount = Math.ceil(file.size / partSize);
    const completed = new Map(Object.entries(upload.parts || {}).map(([number, etag]) => [Number(number), etag]));
    const uploadedBytes = new Map();
    for (const number of completed.keys()) uploadedBytes.set(number, Math.min(partSize, file.size - (number - 1) * partSize));
    let nextPart = 1;
    let failure = null;

    const updateProgress = () => {
      const bytes = [...uploadedBytes.values()].reduce((sum, value) => sum + value, 0);
      const percent = Math.min(100, Math.round(bytes / file.size * 100));
      progressPercent.textContent = percent + "%";
      progressBar.style.width = percent + "%";
      progressStatus.textContent = "Uploading video · " + (bytes / 1048576).toFixed(1) +
        " / " + (file.size / 1048576).toFixed(1) + " MB";
    };

    async function worker() {
      while (!failure) {
        const partNumber = nextPart++;
        if (partNumber > partCount) return;
        if (completed.has(partNumber)) continue;
        const start = (partNumber - 1) * partSize;
        const blob = file.slice(start, Math.min(file.size, start + partSize));
        let lastError;
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            const signed = await videoApi("sign-part", { courseId, key: upload.key, uploadId: upload.uploadId, partNumber });
            const etag = await uploadVideoPart(signed.url, blob, loaded => {
              uploadedBytes.set(partNumber, Math.min(blob.size, loaded));
              updateProgress();
            });
            completed.set(partNumber, etag);
            uploadedBytes.set(partNumber, blob.size);
            upload.parts = Object.fromEntries(completed.entries());
            localStorage.setItem(storageKey, JSON.stringify(upload));
            updateProgress();
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          }
        }
        if (lastError) { failure = lastError; throw lastError; }
      }
    }

    try {
      const outcomes = await Promise.allSettled([worker(), worker(), worker()]);
      const failedWorker = outcomes.find(result => result.status === "rejected");
      if (failedWorker) throw failedWorker.reason;
      progressStatus.textContent = "Finalizing video upload…";
      const parts = [...completed.entries()].map(([partNumber, etag]) => ({ partNumber, etag }));
      await videoApi("complete", { courseId, key: upload.key, uploadId: upload.uploadId, parts });
      localStorage.removeItem(storageKey);
      progressPercent.textContent = "100%";
      progressBar.style.width = "100%";
      return upload.key;
    } catch (error) {
      localStorage.setItem(storageKey, JSON.stringify(upload));
      throw new Error((error?.message || "The video upload failed.") + " Reselect the same file to resume completed parts.");
    }
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
      showMessage(videoMessage, "Videos must be larger than 0 bytes and no more than 5 GiB.");
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
    progressStatus.textContent = "Preparing secure R2 multipart upload…";

    let uploadCompleted = false;
    let storedVideoPath = "";
    try {
      storedVideoPath = await uploadVideoR2(file, courseId, mimeType);
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
          await videoApi("delete-object", { courseId, key: storedVideoPath });
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
      progressStatus.textContent = uploadCompleted ? "Upload finished, but publishing failed." : "Upload interrupted. Reselect the same file to resume its completed parts.";
    } finally {
      videoButton.disabled = false;
      videoButton.textContent = "Upload video";
    }
  });

  await loadVideoCourses();

  const youtubeForm = document.querySelector("#youtube-video-form");
  if (youtubeForm) {
    const youtubeCourse = document.querySelector("#youtube-video-course");
    const youtubeMessage = document.querySelector("#youtube-video-message");
    const youtubeSubmit = document.querySelector("#youtube-video-submit");
    const youtubeUrlInput = document.querySelector("#youtube-video-url");

    async function loadYoutubeCourses() {
      const previous = youtubeCourse.value;
      const { data, error } = await supabase.from("courses")
        .select("id,code,title,is_active").eq("is_active", true).order("code");
      if (error) {
        youtubeCourse.innerHTML = '<option value="">Could not load courses</option>';
        showMessage(youtubeMessage, "Could not load courses: " + error.message);
        return;
      }
      youtubeCourse.innerHTML = '<option value="">Select course</option>';
      (data || []).forEach(course => {
        const option = document.createElement("option");
        option.value = course.id;
        option.textContent = course.code + " — " + course.title;
        youtubeCourse.append(option);
      });
      if ((data || []).some(course => course.id === previous)) youtubeCourse.value = previous;
    }

    function getYouTubeId(value) {
      let url;
      try { url = new URL(value.trim()); } catch { return null; }
      if (url.protocol !== "https:") return null;
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      let id = null;
      if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0];
      else if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
        const parts = url.pathname.split("/").filter(Boolean);
        if (url.pathname === "/watch") id = url.searchParams.get("v");
        else if (["embed", "shorts", "live"].includes(parts[0])) id = parts[1];
      }
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }

    youtubeUrlInput.addEventListener("input", () => {
      youtubeUrlInput.setCustomValidity(
        getYouTubeId(youtubeUrlInput.value) ? "" : "Enter a valid YouTube video URL."
      );
    });

    youtubeForm.addEventListener("submit", async event => {
      event.preventDefault();
      const courseId = youtubeCourse.value;
      const title = document.querySelector("#youtube-video-title").value.trim();
      const youtubeUrl = youtubeUrlInput.value.trim();
      const youtubeId = getYouTubeId(youtubeUrl);
      if (!courseId || !title || !youtubeId) {
        showMessage(youtubeMessage, "Select a course, enter a title and provide a valid YouTube video URL.");
        return;
      }
      youtubeSubmit.disabled = true;
      youtubeSubmit.textContent = "Adding…";
      try {
        const { error } = await supabase.from("course_video_links").insert({
          course_id: courseId,
          title,
          youtube_url: "https://www.youtube.com/watch?v=" + youtubeId,
          topic: document.querySelector("#youtube-video-topic").value.trim() || null,
          description: document.querySelector("#youtube-video-description").value.trim() || null
        });
        if (error) throw error;
        showMessage(youtubeMessage, "YouTube video added and published.", true);
        youtubeForm.reset();
      } catch (error) {
        showMessage(youtubeMessage, error?.message || "The YouTube video could not be added.");
      } finally {
        youtubeSubmit.disabled = false;
        youtubeSubmit.textContent = "Add YouTube video";
      }
    });
    await loadYoutubeCourses();
  }
}
