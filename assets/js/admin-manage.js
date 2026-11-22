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
        button("Edit title", "secondary", async () => {
          const next = prompt("Course title:", course.title);
          if (next === null || !next.trim()) return;
          const { error } = await supabase.from("courses").update({ title: next.trim() }).eq("id", course.id);
          if (error) alert(error.message); else await loadCourses();
        }),
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
        isNotes && Number(resource.file_size) > 0 ? (Number(resource.file_size) >= 1048576
          ? (Number(resource.file_size)/1048576).toFixed(1)+" MB"
          : Math.max(1,Math.round(Number(resource.file_size)/1024))+" KB") : null].filter(Boolean).join(" · ");
      const status=resource.is_active ? "Active" : "Inactive";
      const actions=[
        button(resource.is_active?"Deactivate":"Activate","secondary",async()=>{
          const {error}=await supabase.from("course_resources").update({is_active:!resource.is_active}).eq("id",resource.id);
          if(error)alert(error.message); await loadResources(kind);
        }),
        button("Edit","secondary",async()=>{
          const title=prompt("Resource title:",resource.title); if(title===null||!title.trim())return;
          const description=prompt("Description:",resource.description||""); if(description===null)return;
          const {error}=await supabase.from("course_resources").update({title:title.trim(),description:description.trim()||null}).eq("id",resource.id);
          if(error)alert(error.message); else await loadResources(kind);
        }),
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
      const details=[video.topic,video.file_name].filter(Boolean).join(" · ");
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