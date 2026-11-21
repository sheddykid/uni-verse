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
        let videoPaths = [];
        try {
          const { data: courseResources, error: lookupError } = await supabase
            .from("course_resources").select("file_path").eq("course_id", course.id);
          if (lookupError) throw new Error("Could not check the course resources: " + lookupError.message);
          filePaths = [...new Set((courseResources || []).map(item => item.file_path).filter(Boolean))];
          const { data: courseVideos, error: videoLookupError } = await supabase
            .from("course_videos").select("video_path").eq("course_id", course.id);
          if (videoLookupError) throw new Error("Could not check the course videos: " + videoLookupError.message);
          videoPaths = [...new Set((courseVideos || []).map(item => item.video_path).filter(Boolean))];

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
        let videoStorageError = null;
        try {
          for (let index = 0; index < filePaths.length; index += 1000) {
            const result = await supabase.storage.from("course-resources").remove(filePaths.slice(index, index + 1000));
            if (result.error) { storageError = result.error; break; }
          }
        } catch (error) { storageError = error; }
        try {
          for (let index = 0; index < videoPaths.length; index += 1000) {
            const result = await supabase.storage.from("course-videos").remove(videoPaths.slice(index, index + 1000));
            if (result.error) { videoStorageError = result.error; break; }
          }
        } catch (error) { videoStorageError = error; }

        try {
          await loadCourses();
          await loadResources();
        } catch (refreshError) {
          console.error("Course was deleted, but the management lists could not refresh:", refreshError);
        }

        if (storageError || videoStorageError) {
          const details = [
            storageError ? "Course-resource files: " + (storageError.message || String(storageError)) : null,
            videoStorageError ? "Course-video files: " + (videoStorageError.message || String(videoStorageError)) : null
          ].filter(Boolean).join(" · ");
          alert("The course and its linked records were deleted, but some private Storage files could not be removed and need cleanup. " + details);
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

      actions.append(toggle, edit, remove);
      card.append(actions);
      target.append(card);
    });
  }


  async function loadVideos() {
    const target = document.querySelector("#videos");
    if (!target) return;
    target.replaceChildren();
    const { data, error } = await supabase.from("course_videos")
      .select("id,course_id,title,description,topic,video_path,file_name,mime_type,file_size,is_active,created_at,courses(code,title)")
      .order("created_at", { ascending: false });
    if (error) { target.textContent = "Could not load videos: " + error.message; return; }
    if (!data?.length) { target.textContent = "No course videos have been uploaded yet."; return; }

    data.forEach(video => {
      const card = document.createElement("article");
      card.className = "resource-card admin-resource-card";
      const heading = document.createElement("div");
      heading.className = "resource-card-heading";
      const courseLabel = document.createElement("p");
      courseLabel.className = "course-code";
      courseLabel.textContent = video.courses?.code
        ? video.courses.code + " · " + (video.courses.title || "")
        : "Course video";
      const title = document.createElement("h3");
      title.textContent = video.title;
      heading.append(courseLabel, title);
      card.append(heading);

      if (video.topic) {
        const topic = document.createElement("p");
        topic.className = "video-card-topic";
        topic.textContent = video.topic;
        card.append(topic);
      }
      if (video.description) {
        const description = document.createElement("p");
        description.className = "muted resource-description";
        description.textContent = video.description;
        card.append(description);
      }
      const meta = document.createElement("p");
      meta.className = "resource-meta";
      meta.textContent = video.file_name + " · " + (video.file_size / 1048576).toFixed(1) + " MB";
      card.append(meta);
      const status = document.createElement("p");
      status.className = video.is_active ? "resource-status is-published" : "resource-status is-hidden";
      status.textContent = video.is_active ? "Visible to eligible students" : "Hidden from students";
      card.append(status);

      const actions = document.createElement("div");
      actions.className = "resource-actions";
      const toggle = document.createElement("button");
      toggle.className = "btn secondary";
      toggle.textContent = video.is_active ? "Hide" : "Publish";
      toggle.addEventListener("click", async () => {
        toggle.disabled = true;
        const { error: updateError } = await supabase.from("course_videos")
          .update({ is_active: !video.is_active }).eq("id", video.id);
        if (updateError) alert("Could not update video visibility: " + updateError.message);
        await loadVideos();
      });

      const edit = document.createElement("button");
      edit.className = "btn secondary";
      edit.textContent = "Edit details";
      edit.addEventListener("click", async () => {
        const nextTitle = prompt("Video title:", video.title);
        if (nextTitle === null) return;
        if (!nextTitle.trim()) { alert("The video title cannot be empty."); return; }
        const nextTopic = prompt("Topic (optional):", video.topic || "");
        if (nextTopic === null) return;
        const nextDescription = prompt("Description (optional):", video.description || "");
        if (nextDescription === null) return;
        edit.disabled = true;
        const { error: editError } = await supabase.from("course_videos").update({
          title: nextTitle.trim(),
          topic: nextTopic.trim() || null,
          description: nextDescription.trim() || null
        }).eq("id", video.id);
        if (editError) alert("Could not update video details: " + editError.message);
        await loadVideos();
      });

      const remove = document.createElement("button");
      remove.className = "btn danger";
      remove.textContent = "Delete";
      remove.addEventListener("click", async () => {
        if (!confirm('Permanently delete "' + video.title + '" and its uploaded video file?')) return;
        remove.disabled = true;
        remove.textContent = "Deleting…";
        try {
          const { data: deleted, error: deleteError } = await supabase.from("course_videos")
            .delete().eq("id", video.id).select("id").maybeSingle();
          if (deleteError) throw new Error("Video record was not deleted: " + deleteError.message);
          if (!deleted) throw new Error("No video record was deleted. Refresh the page and try again.");
        } catch (error) {
          alert(error?.message || "The video could not be deleted.");
          remove.disabled = false;
          remove.textContent = "Delete";
          return;
        }
        let cleanupError = null;
        try {
          const cleanup = await supabase.storage.from("course-videos").remove([video.video_path]);
          cleanupError = cleanup.error;
        } catch (error) { cleanupError = error; }
        await loadVideos();
        if (cleanupError) alert("The video record was deleted, but its private Storage file could not be removed and is now orphaned: " + (cleanupError.message || String(cleanupError)));
      });

      actions.append(toggle, edit, remove);
      card.append(actions);
      target.append(card);
    });
  }


  await loadCourses();
  await loadResources();
  await loadVideos();
}