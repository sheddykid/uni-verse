import { supabase, requireProfile, signOut } from "./supabase.js";
document.querySelector("#logout").addEventListener("click", signOut);
const session = await requireProfile();
if (session) {
  const { profile } = session;
  document.querySelector("#welcome").textContent = `Welcome, ${profile.full_name || "student"}`;
  document.querySelector("#user-label").textContent = profile.matric_number || session.user.email;
  const { data: courses, error } = await supabase.from("courses").select("id,code,title,description,department_id").eq("is_active", true).eq("department_id", profile.department_id).order("code");
  const target = document.querySelector("#courses");
  target.innerHTML = "";
  if (error) target.textContent = "Could not load courses: " + error.message;
  else if (!courses?.length) target.innerHTML = '<p class="muted">No active courses have been added for your department yet.</p>';
  else courses.forEach(course => {
    const card = document.createElement("article"); card.className = "course-card";
    const code = document.createElement("p"); code.className = "course-code"; code.textContent = course.code;
    const title = document.createElement("h3"); title.textContent = course.title;
    const desc = document.createElement("p"); desc.className = "muted"; desc.textContent = course.description || "Course resources will appear here.";
    card.append(code, title, desc); target.append(card);
  });
}