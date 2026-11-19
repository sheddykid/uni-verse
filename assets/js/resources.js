import { supabase, requireProfile, signOut } from "./supabase.js";

const $ = selector => document.querySelector(selector);
const pageType = location.pathname.endsWith("past-questions.html") ? "past_question" : "note";
const results = $("#resource-results");
const courseFilter = $("#course-filter");
const assessmentFilter = $("#assessment-filter");

$("#logout").addEventListener("click", signOut);
const session = await requireProfile();
if (!session) throw new Error("Authentication required.");

const { profile } = session;
$("#user-label").textContent = profile.role === "admin"
  ? "Admin preview"
  : (profile.matric_number || session.user.email);

let courses = [];
let resources = [];

async function loadPage() {
  let coursesQuery = supabase.from("courses")
    .select("id,code,title,course_departments!inner(department_id)")
    .eq("is_active", true);
  if (profile.role !== "admin") {
    coursesQuery = coursesQuery.eq("course_departments.department_id", profile.department_id);
  }
  const { data: courseData, error: courseError } = await coursesQuery.order("code");
  if (courseError) {
    results.textContent = "Could not load your courses. Please refresh the page.";
    $("#result-count").textContent = "Unavailable";
    return;
  }
  courses = courseData || [];
  courseFilter.replaceChildren();
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All courses";
  courseFilter.append(allOption);
  courses.forEach(course => {
    const option = document.createElement("option");
    option.value = course.id;
    option.textContent = `${course.code} — ${course.title}`;
    courseFilter.append(option);
  });

  if (!courses.length) {
    results.textContent = "No active courses have been assigned to your department yet.";
    $("#result-count").textContent = "0 resources";
    return;
  }

  const { data: resourceData, error: resourceError } = await supabase.from("course_resources")
    .select("id,course_id,title,description,resource_type,assessment_type,academic_year,semester,file_name,file_path,file_size,mime_type,created_at")
    .eq("is_active", true)
    .eq("resource_type", pageType)
    .in("course_id", courses.map(course => course.id))
    .order("created_at", { ascending: false });

  if (resourceError) {
    results.textContent = "Could not load resources. Please try again.";
    $("#result-count").textContent = "Unavailable";
    return;
  }
  resources = resourceData || [];
  renderResources();
}

function renderResources() {
  const selectedCourse = courseFilter.value;
  const selectedAssessment = assessmentFilter?.value || "all";
  const visible = resources.filter(resource =>
    (!selectedCourse || resource.course_id === selectedCourse) &&
    (pageType !== "past_question" || selectedAssessment === "all" || resource.assessment_type === selectedAssessment)
  );
  results.replaceChildren();
  $("#result-count").textContent = `${visible.length} ${visible.length === 1 ? "resource" : "resources"}`;
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "muted resource-empty-state";
    empty.textContent = pageType === "note"
      ? "No notes have been uploaded for this selection yet."
      : "No past questions match this selection yet.";
    results.append(empty);
    return;
  }

  const courseMap = new Map(courses.map(course => [course.id, course]));
  visible.forEach(resource => {
    const course = courseMap.get(resource.course_id);
    const card = document.createElement("article");
    card.className = "resource-card";
    const heading = document.createElement("div");
    heading.className = "resource-card-heading";
    const courseLabel = document.createElement("p");
    courseLabel.className = "course-code";
    courseLabel.textContent = course ? `${course.code} · ${course.title}` : "Course resource";
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
    const typeLabel = pageType === "note" ? "Course note"
      : resource.assessment_type === "test" ? "Test"
      : resource.assessment_type === "exam" ? "Examination" : "Past question";
    const term = [typeLabel, resource.academic_year, resource.semester ? `Semester ${resource.semester}` : null, (resource.file_name || "").split(".").pop()?.toUpperCase()].filter(Boolean).join(" · ");
    const meta = document.createElement("p");
    meta.className = "resource-meta";
    meta.textContent = term;
    card.append(meta);
    const actions = document.createElement("div");
    actions.className = "resource-actions";
    if (resource.mime_type?.startsWith("image/")) {
      const previewButton = document.createElement("button");
      previewButton.className = "btn secondary";
      previewButton.type = "button";
      previewButton.textContent = "Preview image";
      previewButton.addEventListener("click", () => togglePreview(resource, card, previewButton));
      actions.append(previewButton);
    }
    const downloadButton = document.createElement("button");
    downloadButton.className = "btn primary";
    downloadButton.type = "button";
    downloadButton.textContent = "Download";
    downloadButton.addEventListener("click", () => downloadResource(resource, downloadButton));
    actions.append(downloadButton);
    card.append(actions);
    results.append(card);
  });
}

async function togglePreview(resource, card, button) {
  let preview = card.querySelector("img.resource-image-preview");
  if (preview) {
    preview.hidden = !preview.hidden;
    button.textContent = preview.hidden ? "Preview image" : "Hide preview";
    return;
  }
  button.disabled = true;
  button.textContent = "Loading…";
  const { data, error } = await supabase.storage.from("course-resources").download(resource.file_path);
  if (error) {
    alert("Could not preview this image: " + error.message);
    button.textContent = "Preview image";
  } else {
    preview = document.createElement("img");
    preview.className = "resource-image-preview";
    preview.alt = resource.title;
    preview.src = URL.createObjectURL(data);
    card.insertBefore(preview, card.querySelector(".resource-actions"));
    button.textContent = "Hide preview";
  }
  button.disabled = false;
}

async function downloadResource(resource, button) {
  button.disabled = true;
  button.textContent = "Preparing…";
  const { data, error } = await supabase.storage.from("course-resources").download(resource.file_path);
  if (error) {
    alert("Could not download this file: " + error.message);
  } else {
    const url = URL.createObjectURL(data);
    const link = document.createElement("a");
    link.href = url;
    link.download = resource.file_name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  button.disabled = false;
  button.textContent = "Download";
}

courseFilter.addEventListener("change", renderResources);
assessmentFilter?.addEventListener("change", renderResources);
await loadPage();