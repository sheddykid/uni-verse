import { supabase, requireProfile, signOut } from "./supabase.js";

document.querySelector("#logout").addEventListener("click", signOut);
const session = await requireProfile();

if (session) {
  const { profile } = session;
  document.querySelector("#welcome").textContent = `Welcome, ${profile.full_name || "student"}`;
  document.querySelector("#user-label").textContent = profile.matric_number || session.user.email;

  const target = document.querySelector("#courses");
  const { data: courses, error } = await supabase.from("courses")
    .select("id,code,title,description,department_id")
    .eq("is_active", true).eq("department_id", profile.department_id).order("code");

  target.replaceChildren();
  if (error) {
    target.textContent = "Could not load courses: " + error.message;
  } else if (!courses?.length) {
    target.textContent = "No active courses have been added for your department yet.";
  } else {
    const { data: resources, error: resourceError } = await supabase.from("course_resources")
      .select("id,course_id,title,description,resource_type,assessment_type,academic_year,semester,file_name,file_path,file_size")
      .eq("is_active", true).in("course_id", courses.map(course => course.id))
      .order("created_at", { ascending: false });

    const resourcesByCourse = new Map();
    (resources || []).forEach(resource => {
      if (!resourcesByCourse.has(resource.course_id)) resourcesByCourse.set(resource.course_id, []);
      resourcesByCourse.get(resource.course_id).push(resource);
    });

    courses.forEach(course => {
      const card = document.createElement("article"); card.className = "course-card";
      const code = document.createElement("p"); code.className = "course-code"; code.textContent = course.code;
      const title = document.createElement("h3"); title.textContent = course.title;
      const desc = document.createElement("p"); desc.className = "muted";
      desc.textContent = course.description || "Study materials for this course.";
      card.append(code, title, desc);

      if (resourceError) {
        const errorText = document.createElement("p"); errorText.className = "resource-empty";
        errorText.textContent = "Could not load this course's resources.";
        card.append(errorText);
      } else {
        const courseResources = resourcesByCourse.get(course.id) || [];
        const notes = courseResources.filter(item => item.resource_type === "note");
        const questions = courseResources.filter(item => item.resource_type === "past_question");
        card.append(makeResourceSection("Notes", notes));
        card.append(makeResourceSection("Past questions", questions));
      }
      target.append(card);
    });
  }
}

function makeResourceSection(label, items) {
  const section = document.createElement("section"); section.className = "course-resources";
  const heading = document.createElement("h4"); heading.className = "resource-heading"; heading.textContent = label;
  section.append(heading);
  if (!items.length) {
    const empty = document.createElement("p"); empty.className = "resource-empty";
    empty.textContent = "No resources uploaded yet.";
    section.append(empty);
    return section;
  }

  const list = document.createElement("div"); list.className = "resource-list";
  items.forEach(resource => {
    const row = document.createElement("div"); row.className = "student-resource";
    const info = document.createElement("div");
    const title = document.createElement("strong"); title.textContent = resource.title;
    const meta = document.createElement("p"); meta.className = "resource-meta";
    const kind = resource.assessment_type ? `${resource.assessment_type === "test" ? "Test" : "Exam"}` : "Study note";
    const term = [resource.academic_year, resource.semester ? `Semester ${resource.semester}` : null].filter(Boolean).join(" · ");
    meta.textContent = [kind, term, resource.file_name.split(".").pop().toUpperCase()].filter(Boolean).join(" · ");
    info.append(title, meta);
    const button = document.createElement("button"); button.className = "btn secondary";
    button.type = "button"; button.textContent = "Download";
    button.addEventListener("click", async () => {
      button.disabled = true; button.textContent = "Preparing…";
      const { data, error } = await supabase.storage.from("course-resources").download(resource.file_path);
      if (error) {
        alert("Could not download this file: " + error.message);
      } else {
        const url = URL.createObjectURL(data);
        const link = document.createElement("a");
        link.href = url; link.download = resource.file_name;
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
      button.disabled = false; button.textContent = "Download";
    });
    row.append(info, button); list.append(row);
  });
  section.append(list);
  return section;
}