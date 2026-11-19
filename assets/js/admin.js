import { supabase, requireProfile, signOut, showMessage } from "./supabase.js";
document.querySelector("#logout").addEventListener("click", signOut);
const session = await requireProfile();
if (session) {
  if (session.profile.role !== "admin") location.replace("./student.html");
  document.querySelector("#user-label").textContent = session.profile.full_name || session.user.email;
  const departmentSelect = document.querySelector("#department");
  const { data: departments, error: deptError } = await supabase.from("departments").select("id,name,code").eq("is_active", true).order("name");
  if (deptError) departmentSelect.innerHTML = '<option value="">Could not load departments</option>';
  else departmentSelect.innerHTML = '<option value="">Select department</option>' + departments.map(d => `<option value="${d.id}">${d.name} (${d.code})</option>`).join("");
  async function loadCourses() {
    const { data, error } = await supabase.from("courses").select("id,code,title,departments(name)").order("code");
    const target = document.querySelector("#courses"); target.innerHTML = "";
    if (error) { target.textContent = error.message; return; }
    if (!data?.length) { target.innerHTML = '<p class="muted">No courses have been created yet.</p>'; return; }
    data.forEach(course => {
      const row = document.createElement("div"); row.className = "course-row";
      const info = document.createElement("span"); info.textContent = `${course.code} — ${course.title} · ${course.departments?.name || "Department"}`;
      const button = document.createElement("button"); button.textContent = "Deactivate";
      button.addEventListener("click", async () => {
        if (!confirm(`Deactivate ${course.code}?`)) return;
        const { error: updateError } = await supabase.from("courses").update({ is_active: false }).eq("id", course.id);
        if (updateError) alert(updateError.message); else loadCourses();
      });
      row.append(info, button); target.append(row);
    });
  }
  document.querySelector("#course-form").addEventListener("submit", async event => {
    event.preventDefault();
    const message = document.querySelector("#message");
    const button = event.currentTarget.querySelector("button"); button.disabled = true;
    const payload = {
      department_id: departmentSelect.value,
      code: document.querySelector("#code").value.trim().toUpperCase(),
      title: document.querySelector("#title").value.trim(),
      description: document.querySelector("#description").value.trim() || null
    };
    const { error } = await supabase.from("courses").insert(payload);
    if (error) showMessage(message, error.message);
    else { showMessage(message, "Course added.", true); event.currentTarget.reset(); await loadCourses(); }
    button.disabled = false;
  });
  await loadCourses();
}