import { supabase, requireProfile } from "./supabase.js";

const session = await requireProfile();
if (session && session.profile.role !== "admin") {
  location.replace("./student.html");
} else if (session) {
  const userLabel = document.querySelector("#user-label");
  if (userLabel) userLabel.textContent = session.profile.full_name || session.user.email;

  async function r2VideoRequest(action, payload = {}) {
    const { data: { session: authSession }, error } = await supabase.auth.getSession();
    if (error || !authSession?.access_token) throw new Error("Your session expired. Sign in again.");
    const response = await fetch("/api/course-videos", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authSession.access_token },
      body: JSON.stringify({ action, ...payload })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Cloud video storage cleanup failed.");
    return result;
  }

  async function cleanupVideoFiles(courseId, paths) {
    const r2Paths = paths.filter(path => path.startsWith("r2/"));
    const legacyPaths = paths.filter(path => !path.startsWith("r2/"));
    for (let index = 0; index < r2Paths.length; index += 1000) {
      await r2VideoRequest("delete-objects", { courseId, keys: r2Paths.slice(index, index + 1000) });
    }
    for (let index = 0; index < legacyPaths.length; index += 1000) {
      const result = await supabase.storage.from("course-videos").remove(legacyPaths.slice(index, index + 1000));
      if (result.error) throw result.error;
    }
  }

  function button(label, variant, handler) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "btn " + variant;
    el.textContent = label;
    el.addEventListener("click", handler);
    return el;
  }

  const editorDialog = document.createElement("dialog");
  editorDialog.className = "admin-editor-dialog";
  editorDialog.setAttribute("aria-labelledby", "admin-editor-title");
  editorDialog.innerHTML = '<form method="dialog" class="admin-editor-shell"><div class="admin-editor-heading"><div><p class="eyebrow">ADMINISTRATION</p><h2 id="admin-editor-title">Edit</h2></div><button type="button" class="admin-editor-close" aria-label="Close">×</button></div><div class="admin-editor-fields"></div><p class="admin-editor-message message" role="status"></p><div class="admin-editor-actions"><button type="button" class="btn secondary admin-editor-cancel">Cancel</button><button type="submit" class="btn primary admin-editor-save">Save changes</button></div></form>';
  document.body.append(editorDialog);
  const editorFields = editorDialog.querySelector(".admin-editor-fields");
  const editorMessage = editorDialog.querySelector(".admin-editor-message");
  const editorSave = editorDialog.querySelector(".admin-editor-save");
  editorDialog.querySelector(".admin-editor-close").addEventListener("click", () => editorDialog.close());
  editorDialog.querySelector(".admin-editor-cancel").addEventListener("click", () => editorDialog.close());
  editorDialog.addEventListener("click", event => { if (event.target === editorDialog) editorDialog.close(); });

  function editorField(labelText, control, className = "") {
    const label = document.createElement("label");
    label.className = "admin-editor-field " + className;
    const caption = document.createElement("span");
    caption.textContent = labelText;
    label.append(caption, control);
    return label;
  }

  function editorInput(value = "", type = "text") {
    const input = document.createElement("input");
    input.type = type;
    input.value = value ?? "";
    return input;
  }

  async function openCourseEditor(course) {
    editorDialog.querySelector("#admin-editor-title").textContent = "Edit course";
    editorFields.replaceChildren();
    editorMessage.textContent = "";
    const [deptResult, assignmentResult] = await Promise.all([
      supabase.from("departments").select("id,name,code,is_active").order("name"),
      supabase.from("course_departments").select("department_id").eq("course_id", course.id)
    ]);
    if (deptResult.error || assignmentResult.error) {
      alert((deptResult.error || assignmentResult.error).message);
      return;
    }
    const code = editorInput(course.code);
    code.required = true;
    code.maxLength = 40;
    const title = editorInput(course.title);
    title.required = true;
    title.maxLength = 160;
    const description = document.createElement("textarea");
    description.rows = 3;
    description.value = course.description || "";
    const departmentBox = document.createElement("div");
    departmentBox.className = "admin-editor-departments";
    const selected = new Set((assignmentResult.data || []).map(item => item.department_id));
    (deptResult.data || []).forEach(department => {
      const label = document.createElement("label");
      label.className = "department-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = department.id;
      checkbox.checked = selected.has(department.id);
      checkbox.disabled = !department.is_active && !checkbox.checked;
      const name = document.createElement("span");
      name.textContent = (department.code ? department.code + " — " : "") + department.name + (!department.is_active ? " (inactive)" : "");
      label.append(checkbox, name);
      departmentBox.append(label);
    });
    editorFields.append(
      editorField("Course code", code),
      editorField("Course title", title),
      editorField("Description", description),
      editorField("Departments offering this course", departmentBox, "admin-editor-wide")
    );
    editorSave.disabled = false;
    editorDialog.showModal();
    editorDialog.querySelector("form").onsubmit = async event => {
      event.preventDefault();
      const departmentIds = [...departmentBox.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
      if (!code.value.trim() || !title.value.trim() || !departmentIds.length) {
        editorMessage.textContent = "Enter a course code and title, and select at least one department.";
        return;
      }
      editorSave.disabled = true;
      editorSave.textContent = "Saving…";
      try {
        const update = await supabase.from("courses").update({
          code: code.value.trim(), title: title.value.trim(), description: description.value.trim() || null
        }).eq("id", course.id);
        if (update.error) throw update.error;
        const removed = await supabase.from("course_departments").delete().eq("course_id", course.id);
        if (removed.error) throw removed.error;
        const assigned = await supabase.from("course_departments").insert(
          departmentIds.map(department_id => ({ course_id: course.id, department_id }))
        );
        if (assigned.error) {
          const restore = await supabase.from("course_departments").insert(
            [...selected].map(department_id => ({ course_id: course.id, department_id }))
          );
          throw new Error(assigned.error.message + (restore.error ? " Previous department assignments could not be restored: " + restore.error.message : " Previous department assignments were restored."));
        }
        editorDialog.close();
        await Promise.all([loadCourses(), loadResources("note"), loadResources("past_question")]);
      } catch (error) {
        editorMessage.textContent = error.message || "Course changes could not be saved.";
      } finally {
        editorSave.disabled = false;
        editorSave.textContent = "Save changes";
      }
    };
  }

  async function openResourceEditor(resource, kind) {
    editorDialog.querySelector("#admin-editor-title").textContent = kind === "note" ? "Edit note" : "Edit past question";
    editorFields.replaceChildren();
    editorMessage.textContent = "";
    const [coursesResult, departmentsResult] = await Promise.all([
      supabase.from("courses").select("id,code,title,description,is_active").order("code"),
      Promise.resolve({ data: [] })
    ]);
    if (coursesResult.error) { alert(coursesResult.error.message); return; }
    const course = document.createElement("select");
    course.required = true;
    (coursesResult.data || []).forEach(item => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.code + " — " + item.title + (!item.is_active ? " (inactive)" : "");
      option.selected = item.id === resource.course_id;
      course.append(option);
    });
    const title = editorInput(resource.title);
    title.required = true;
    title.maxLength = 160;
    const description = document.createElement("textarea");
    description.rows = 3;
    description.value = resource.description || "";
    editorFields.append(editorField("Course", course), editorField("Resource title", title), editorField("Description", description));
    if (kind === "past_question") {
      const assessment = document.createElement("select");
      [["test","Test questions"],["exam","Exam questions"]].forEach(([value,label]) => {
        const option = document.createElement("option");
        option.value = value; option.textContent = label; option.selected = resource.assessment_type === value; assessment.append(option);
      });
      const year = editorInput(resource.academic_year || "");
      year.maxLength = 20;
      const semester = document.createElement("select");
      [["","Not specified"],["1","First semester"],["2","Second semester"]].forEach(([value,label]) => {
        const option = document.createElement("option");
        option.value = value; option.textContent = label; option.selected = String(resource.semester || "") === value; semester.append(option);
      });
      editorFields.append(editorField("Assessment type", assessment), editorField("Academic year", year), editorField("Semester", semester));
      resource._editorAssessment = assessment;
      resource._editorYear = year;
      resource._editorSemester = semester;
    }
    editorSave.disabled = false;
    editorDialog.showModal();
    editorDialog.querySelector("form").onsubmit = async event => {
      event.preventDefault();
      if (!course.value || !title.value.trim()) { editorMessage.textContent = "Select a course and enter a title."; return; }
      const payload = { course_id: course.value, title: title.value.trim(), description: description.value.trim() || null };
      if (kind === "past_question") {
        payload.assessment_type = resource._editorAssessment.value;
        payload.academic_year = resource._editorYear.value.trim() || null;
        payload.semester = resource._editorSemester.value ? Number(resource._editorSemester.value) : null;
      }
      editorSave.disabled = true;
      editorSave.textContent = "Saving…";
      try {
        const { error } = await supabase.from("course_resources").update(payload).eq("id", resource.id);
        if (error) throw error;
        editorDialog.close();
        await Promise.all([loadResources("note"), loadResources("past_question")]);
      } catch (error) {
        editorMessage.textContent = error.message || "Resource changes could not be saved.";
      } finally {
        editorSave.disabled = false;
        editorSave.textContent = "Save changes";
      }
    };
  }

  function renderTable(targetId, searchId, headers, rows, emptyText) {
    const target = document.querySelector("#" + targetId);
    const search = document.querySelector("#" + searchId);
    target.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "muted admin-table-empty";
      empty.textContent = emptyText;
      target.append(empty);
      if (search) search.value = "";
      return;
    }
    const table = document.createElement("table");
    table.className = "admin-data-table";
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headers.forEach(label => {
      const th = document.createElement("th"); th.scope = "col"; th.textContent = label; headerRow.append(th);
    });
    thead.append(headerRow);
    const tbody = document.createElement("tbody");
    rows.forEach(row => tbody.append(row));
    table.append(thead, tbody);
    target.append(table);
    if (search) {
      const filter = () => {
        const term = search.value.trim().toLowerCase();
        tbody.querySelectorAll("tr").forEach(row => {
          row.hidden = !!term && !row.dataset.search.includes(term);
        });
      };
      search.oninput = filter;
      filter();
    }
  }

  function makeRow(values, actions, searchText) {
    const tr = document.createElement("tr");
    tr.dataset.search = searchText.toLowerCase();
    values.forEach(value => {
      const td = document.createElement("td");
      if (value instanceof Node) td.append(value);
      else td.textContent = value == null ? "—" : String(value);
      tr.append(td);
    });
    const actionCell = document.createElement("td");
    actionCell.className = "admin-table-actions";
    actions.forEach(action => actionCell.append(action));
    tr.append(actionCell);
    return tr;
  }

  function shortDepartmentName(name) {
    const known = {
      "Civil Engineering":"Civil Eng.", "Electrical and Information Engineering":"EIE",
      "Mechanical Engineering":"Mech. Eng.", "Petroleum Engineering":"Pet. Eng.",
      "Chemical Engineering":"Chem. Eng.", "Mechatronics Engineering":"Mechatronics",
      "Computer and Information Sciences":"CIS", "Political Science and International Relations":"PSIR",
      "Mass Communication":"Mass Comm.", "Medical Laboratory Science":"MLS",
      "Banking and Finance":"Banking & Finance", "Business Management":"Business Mgmt.",
      "Languages and General Studies":"LGS", "Estate Management":"Estate Mgmt.",
      "Building Technology":"Building Tech."
    };
    return known[name] || name;
  }

  async function loadCourses() {
    const target = document.querySelector("#courses");
    const { data, error } = await supabase.from("courses")
      .select("id,code,title,is_active").order("code");
    if (error) { target.textContent = "Could not load courses: " + error.message; return; }
    const { data: assignments, error: assignmentError } = await supabase
      .from("course_departments").select("course_id,departments(name,code)");
    if (assignmentError) { target.textContent = assignmentError.message; return; }
    const byCourse = new Map();
    (assignments || []).forEach(item => {
      if (!byCourse.has(item.course_id)) byCourse.set(item.course_id, []);
      if (item.departments) byCourse.get(item.course_id).push(item.departments);
    });
    const rows = (data || []).map(course => {
      const names = (byCourse.get(course.id) || []).map(d => d.code || shortDepartmentName(d.name)).join(", ");
      const status = course.is_active ? "Active" : "Inactive";
      const actions = [
        button("Edit", "secondary", () => openCourseEditor(course)),
        button(course.is_active ? "Deactivate" : "Activate", "secondary", async event => {
          const { error } = await supabase.from("courses").update({ is_active: !course.is_active }).eq("id", course.id);
          if (error) alert(error.message);
          await loadCourses();
        }),
        button("Delete", "danger", async event => {
          if (!confirm("Permanently delete " + course.code + " — " + course.title + " and its linked resources? This cannot be undone.")) return;
          event.currentTarget.disabled = true;
          try {
            const [resources, videos] = await Promise.all([
              supabase.from("course_resources").select("file_path").eq("course_id", course.id),
              supabase.from("course_videos").select("video_path").eq("course_id", course.id)
            ]);
            if (resources.error) throw resources.error;
            if (videos.error) throw videos.error;
            const filePaths = [...new Set((resources.data || []).map(x => x.file_path).filter(Boolean))];
            const videoPaths = [...new Set((videos.data || []).map(x => x.video_path).filter(Boolean))];
            const { data: deleted, error } = await supabase.from("courses").delete().eq("id", course.id).select("id").maybeSingle();
            if (error || !deleted) throw error || new Error("No course record was deleted.");
            let cleanup = [];
            for (let i=0;i<filePaths.length;i+=1000) {
              const result=await supabase.storage.from("course-resources").remove(filePaths.slice(i,i+1000));
              if(result.error) cleanup.push(result.error.message);
            }
            try { await cleanupVideoFiles(course.id, videoPaths); } catch(e) { cleanup.push(e.message); }
            await Promise.all([loadCourses(),loadResources("note"),loadResources("past_question"),loadUploadedVideos(),loadYoutubeVideos()]);
            if(cleanup.length) alert("Course deleted, but some stored files need cleanup: "+cleanup.join(" · "));
          } catch (e) {
            alert(e.message || "The course could not be deleted.");
            event.currentTarget.disabled = false;
          }
        })
      ];
      return makeRow([course.code,course.title,names || "No department",status],actions,[course.code,course.title,names,status].join(" "));
    });
    renderTable("courses","course-search",["Code","Course title","Departments","Status","Actions"],rows,"No courses have been created yet.");
  }

  async function loadResources(kind) {
    const isNotes = kind === "note";
    const targetId = isNotes ? "notes-table" : "questions-table";
    const searchId = isNotes ? "notes-search" : "questions-search";
    const { data, error } = await supabase.from("course_resources")
      .select("id,course_id,title,description,resource_type,assessment_type,academic_year,semester,file_name,file_path,file_size,is_active,created_at,courses(code,title)")
      .eq("resource_type",kind).order("created_at",{ascending:false});
    if(error){document.querySelector("#"+targetId).textContent=error.message;return;}
    const rows=(data||[]).map(resource=>{
      const course=resource.courses?.code ? resource.courses.code+" — "+(resource.courses.title||"") : "Course";
      const type=isNotes ? "Note" : resource.assessment_type==="test" ? "Test" : "Examination";
      const details=[type,resource.academic_year,resource.semester ? "Semester "+resource.semester : null,resource.file_name,
        Number(resource.file_size) > 0 ? (Number(resource.file_size) >= 1048576
          ? (Number(resource.file_size)/1048576).toFixed(1)+" MB"
          : Math.max(1,Math.round(Number(resource.file_size)/1024))+" KB") : null].filter(Boolean).join(" · ");
      const status=resource.is_active ? "Active" : "Inactive";
      const actions=[
        button(resource.is_active?"Deactivate":"Activate","secondary",async()=>{
          const {error}=await supabase.from("course_resources").update({is_active:!resource.is_active}).eq("id",resource.id);
          if(error)alert(error.message); await loadResources(kind);
        }),
        button("Edit","secondary",()=>openResourceEditor(resource,kind)),
        button("Delete","danger",async()=>{
          if(!confirm('Delete "'+resource.title+'" and its uploaded file?'))return;
          const {data:deleted,error}=await supabase.from("course_resources").delete().eq("id",resource.id).select("id").maybeSingle();
          if(error||!deleted){alert(error?.message||"Resource was not deleted.");return;}
          const cleanup=await supabase.storage.from("course-resources").remove([resource.file_path]);
          await loadResources(kind);
          if(cleanup.error)alert("Record deleted, but file cleanup failed: "+cleanup.error.message);
        })
      ];
      return makeRow([resource.title,course,details,status],actions,[resource.title,course,details,status].join(" "));
    });
    renderTable(targetId,searchId,["Title","Course","Details","Status","Actions"],rows,isNotes?"No notes have been uploaded yet.":"No past questions have been uploaded yet.");
  }

  async function loadUploadedVideos() {
    const {data,error}=await supabase.from("course_videos")
      .select("id,course_id,title,description,topic,video_path,file_name,file_size,is_active,created_at,courses(code,title)")
      .order("created_at",{ascending:false});
    const target=document.querySelector("#uploaded-videos-table");
    if(error){target.textContent=error.message;return;}
    const rows=(data||[]).map(video=>{
      const course=video.courses?.code ? video.courses.code+" — "+(video.courses.title||"") : "Course";
      const sizeLabel = Number(video.file_size) > 0
        ? (Number(video.file_size) >= 1048576
          ? (Number(video.file_size)/1048576).toFixed(1)+" MB"
          : Math.max(1,Math.round(Number(video.file_size)/1024))+" KB")
        : null;
      const details=[video.topic,video.file_name,sizeLabel].filter(Boolean).join(" · ");
      const status=video.is_active?"Active":"Inactive";
      const actions=[
        button(video.is_active?"Deactivate":"Activate","secondary",async()=>{
          const {error}=await supabase.from("course_videos").update({is_active:!video.is_active}).eq("id",video.id);
          if(error)alert(error.message); await loadUploadedVideos();
        }),
        button("Edit","secondary",async()=>{
          const title=prompt("Video title:",video.title);if(title===null||!title.trim())return;
          const topic=prompt("Topic:",video.topic||"");if(topic===null)return;
          const description=prompt("Description:",video.description||"");if(description===null)return;
          const {error}=await supabase.from("course_videos").update({title:title.trim(),topic:topic.trim()||null,description:description.trim()||null}).eq("id",video.id);
          if(error)alert(error.message);else await loadUploadedVideos();
        }),
        button("Delete","danger",async()=>{
          if(!confirm('Delete "'+video.title+'" and its uploaded video file?'))return;
          const {data:deleted,error}=await supabase.from("course_videos").delete().eq("id",video.id).select("id").maybeSingle();
          if(error||!deleted){alert(error?.message||"Video record was not deleted.");return;}
          let cleanupError=null;try{await cleanupVideoFiles(video.course_id,[video.video_path]);}catch(e){cleanupError=e;}
          await loadUploadedVideos();if(cleanupError)alert("Record deleted, but storage cleanup failed: "+cleanupError.message);
        })
      ];
      return makeRow([video.title,course,details,status],actions,[video.title,course,details,status].join(" "));
    });
    renderTable("uploaded-videos-table","uploaded-videos-search",["Title","Course","File","Status","Actions"],rows,"No uploaded videos yet.");
  }

  async function loadYoutubeVideos() {
    const {data,error}=await supabase.from("course_video_links")
      .select("id,course_id,title,description,topic,youtube_url,is_active,created_at,courses(code,title)")
      .order("created_at",{ascending:false});
    const target=document.querySelector("#youtube-videos-table");
    if(error){target.textContent=error.message;return;}
    const rows=(data||[]).map(video=>{
      const course=video.courses?.code ? video.courses.code+" — "+(video.courses.title||"") : "Course";
      const details=[video.topic,video.youtube_url].filter(Boolean).join(" · ");
      const status=video.is_active?"Active":"Inactive";
      const actions=[
        button(video.is_active?"Hide":"Show","secondary",async()=>{
          const {error}=await supabase.from("course_video_links").update({is_active:!video.is_active}).eq("id",video.id);
          if(error)alert(error.message);await loadYoutubeVideos();
        }),
        button("Edit","secondary",async()=>{
          const title=prompt("YouTube video title:",video.title);if(title===null||!title.trim())return;
          const topic=prompt("Topic:",video.topic||"");if(topic===null)return;
          const description=prompt("Description:",video.description||"");if(description===null)return;
          const url=prompt("YouTube URL:",video.youtube_url);if(url===null)return;
          let parsed;try{parsed=new URL(url.trim());}catch{}
          const host=parsed?.hostname?.toLowerCase().replace(/^www\./,"");
          const parts=parsed?.pathname?.split("/").filter(Boolean)||[];
          const id=host==="youtu.be"?parts[0]:["youtube.com","m.youtube.com","youtube-nocookie.com"].includes(host)?(parsed.pathname==="/watch"?parsed.searchParams.get("v"):["embed","shorts","live"].includes(parts[0])?parts[1]:null):null;
          if(parsed?.protocol!=="https:"||!id||!/^[A-Za-z0-9_-]{11}$/.test(id)){alert("Enter a valid YouTube video URL.");return;}
          const {error}=await supabase.from("course_video_links").update({title:title.trim(),topic:topic.trim()||null,description:description.trim()||null,youtube_url:"https://www.youtube.com/watch?v="+id}).eq("id",video.id);
          if(error)alert(error.message);else await loadYoutubeVideos();
        }),
        button("Delete","danger",async()=>{
          if(!confirm('Delete YouTube video "'+video.title+'"?'))return;
          const {data:deleted,error}=await supabase.from("course_video_links").delete().eq("id",video.id).select("id").maybeSingle();
          if(error||!deleted){alert(error?.message||"Video was not deleted.");return;}await loadYoutubeVideos();
        })
      ];
      return makeRow([video.title,course,details,status],actions,[video.title,course,details,status].join(" "));
    });
    renderTable("youtube-videos-table","youtube-videos-search",["Title","Course","Topic / URL","Status","Actions"],rows,"No YouTube videos yet.");
  }

  await Promise.all([loadCourses(),loadResources("note"),loadResources("past_question"),loadUploadedVideos(),loadYoutubeVideos()]);
}