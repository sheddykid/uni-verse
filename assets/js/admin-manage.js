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
        if (!confirm(`Permanently delete ${course.code} — ${course.title}? This also deletes all its resource records and uploaded files. This cannot be undone.`)) return;
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
      .select("id,title,description,resource_type,assessment_type,academic_year,semester,file_name,file_path,is_active,created_at,courses(code,title)")
      .order("created_at", { ascending: false });
    if (error) { target.textContent = error.message; return; }
    if (!data?.length) { target.textContent = "No resources have been uploaded yet."; return; }

    data.forEach(resource => {
      const row = document.createElement("div"); row.className = "resource-item";
      const info = document.createElement("div");
      const heading = document.createElement("strong"); heading.textContent = resource.title;
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
        toggle.disabled = true;
        const { error: updateError } = await supabase.from("course_resources")
          .update({ is_active: !resource.is_active }).eq("id", resource.id);
        if (updateError) alert(updateError.message);
        await loadResources();
      });

      const edit = document.createElement("button"); edit.className = "btn secondary"; edit.textContent = "Edit";
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

      const remove = document.createElement("button"); remove.className = "btn danger"; remove.textContent = "Delete";
      remove.addEventListener("click", async () => {
        if (!confirm('Permanently delete "' + resource.title + '" and its uploaded file?')) return;
        remove.disabled = true;
        remove.textContent = "Deleting…";

        try {
          // Remove metadata first. A database failure must not leave a valid record
          // pointing to a file that has already been permanently deleted.
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
        } catch (error) {
          storageError = error;
        }

        try {
          await loadResources();
        } catch (refreshError) {
          console.error("Resource was deleted, but the management list could not refresh:", refreshError);
        }

        if (storageError) {
          alert("The resource record was deleted, but its stored file could not be removed. The file is now orphaned in the private bucket and needs cleanup: " + (storageError.message || String(storageError)));
        }
      });

      actions.append(toggle, edit, remove); row.append(info, actions); target.append(row);
    });
  }

  await loadCourses();
  await loadResources();
}