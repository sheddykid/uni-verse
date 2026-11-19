import { supabase, requireProfile, signOut } from "./supabase.js";

document.querySelector("#logout").addEventListener("click", signOut);
const session = await requireProfile();

if (session) {
  if (session.profile.role !== "admin") location.replace("./student.html");
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
      actions.append(editTitle, button);
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
        const { error: deleteError } = await supabase.from("course_resources").delete().eq("id", resource.id);
        if (deleteError) { alert(deleteError.message); return; }
        const { error: storageError } = await supabase.storage.from("course-resources").remove([resource.file_path]);
        if (storageError) alert("The resource record was deleted, but its stored file could not be removed: " + storageError.message);
        await loadResources();
      });

      actions.append(toggle, edit, remove); row.append(info, actions); target.append(row);
    });
  }

  await loadCourses();
  await loadResources();
}