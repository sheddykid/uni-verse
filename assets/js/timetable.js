import { supabase, requireProfile } from "./supabase.js";
const $ = s => document.querySelector(s);
const session = await requireProfile();
if (!session) throw new Error("Sign-in required.");
$("#user-label").textContent = session.profile.full_name || session.user.email;
const userId = session.user.id;
let events = [], courses = [], cursor = new Date(), view = "month", selectedDate = new Date(); selectedDate.setHours(0,0,0,0);
const notified = new Set();
const eventForm = $("#event-form");
const typeLabels = {lecture:"Lecture",test:"Test",exam:"Examination",study:"Study session"};
const pad = n => String(n).padStart(2,"0");
const dateKey = d => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const localInput = value => { const d = new Date(value); return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+"T"+pad(d.getHours())+":"+pad(d.getMinutes()); };
const dateTimeLabel = value => new Date(value).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});
function setStatus(message, success=false){$("#timetable-status").textContent=message;$("#timetable-status").classList.toggle("success",success);}
async function loadData(){
 const {data,error}=await supabase.from("student_timetable_events").select("id,user_id,course_id,title,event_type,location,notes,starts_at,ends_at,reminder_minutes").eq("user_id",userId).order("starts_at");
 if(error){setStatus("Could not load your timetable. "+error.message);return;}
 events=data||[]; renderCalendar(); checkReminders();
}
async function loadCourses(){
 let q=supabase.from("courses").select("id,code,title").eq("is_active",true).order("code");
 if(session.profile.role!=="admin" && session.profile.department_id){
  const {data,error}=await supabase.from("courses").select("id,code,title,course_departments!inner(department_id)").eq("is_active",true).eq("course_departments.department_id",session.profile.department_id).order("code");
  if(!error) courses=data||[];
 } else { const {data,error}=await q; if(!error) courses=data||[]; }
 const select=$("#event-course"); courses.forEach(c=>select.add(new Option(c.code+" — "+c.title,c.id)));
}
function renderCalendar(){
 const heading=$("#calendar-heading"), grid=$("#calendar-grid");
 grid.replaceChildren();
 const monthStart=new Date(cursor.getFullYear(),cursor.getMonth(),1);
 if(view==="month"){
  heading.textContent=cursor.toLocaleDateString(undefined,{month:"long",year:"numeric"});
  ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(x=>{const el=document.createElement("div");el.className="calendar-weekday";el.textContent=x;grid.append(el);});
  const offset=monthStart.getDay(), start=new Date(monthStart);start.setDate(1-offset);
  for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const dayEvents=events.filter(e=>dateKey(new Date(e.starts_at))===dateKey(d));const cell=document.createElement("button");cell.type="button";cell.className="calendar-day"+(d.getMonth()!==cursor.getMonth()?" is-outside":"")+(dateKey(d)===dateKey(selectedDate)?" is-selected":"")+(dateKey(d)===dateKey(new Date())?" is-today":"");cell.setAttribute("aria-label",d.toDateString()+", "+dayEvents.length+" events");const num=document.createElement("span");num.className="calendar-day-number";num.textContent=d.getDate();cell.append(num);if(dayEvents.length){const dots=document.createElement("span");dots.className="calendar-day-count";dots.textContent=dayEvents.length+" event"+(dayEvents.length===1?"":"s");cell.append(dots);}cell.addEventListener("click",()=>{selectedDate=d;renderCalendar();renderSelectedDay();});grid.append(cell);}
 } else {
  const day=new Date(cursor);day.setDate(day.getDate()-day.getDay());heading.textContent="Week of "+day.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"});
  grid.className="calendar-grid week-calendar";
  for(let i=0;i<7;i++){const d=new Date(day);d.setDate(day.getDate()+i);const card=document.createElement("button");card.type="button";card.className="week-day"+(dateKey(d)===dateKey(selectedDate)?" is-selected":"")+(dateKey(d)===dateKey(new Date())?" is-today":"");const top=document.createElement("strong");top.textContent=d.toLocaleDateString(undefined,{weekday:"short",day:"numeric"});card.append(top);const list=document.createElement("span");list.className="week-day-events";const matches=events.filter(e=>dateKey(new Date(e.starts_at))===dateKey(d));list.textContent=matches.length?matches.length+" event"+(matches.length===1?"":"s"):"No events";card.append(list);card.addEventListener("click",()=>{selectedDate=d;renderCalendar();renderSelectedDay();});grid.append(card);}
 }
 renderSelectedDay();
}
function renderSelectedDay(){
 const root=$("#selected-day-events");root.replaceChildren();$("#selected-day-heading").textContent=selectedDate.toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long"});
 const matches=events.filter(e=>dateKey(new Date(e.starts_at))===dateKey(selectedDate)).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
 if(!matches.length){const p=document.createElement("p");p.className="muted";p.textContent="No events scheduled for this day.";root.append(p);return;}
 matches.forEach(event=>{const card=document.createElement("article");card.className="timetable-event";const type=document.createElement("span");type.className="event-type-tag "+event.event_type;type.textContent=typeLabels[event.event_type]||"Event";const title=document.createElement("h3");title.textContent=event.title;const time=document.createElement("p");time.className="resource-meta";time.textContent=dateTimeLabel(event.starts_at)+" – "+dateTimeLabel(event.ends_at);const course=courses.find(c=>c.id===event.course_id);const detail=document.createElement("p");detail.className="resource-meta";detail.textContent=[course?course.code+" — "+course.title:"",event.location,event.notes].filter(Boolean).join(" · ");const actions=document.createElement("div");actions.className="timetable-event-actions";const edit=document.createElement("button");edit.className="btn secondary";edit.type="button";edit.textContent="Edit";edit.addEventListener("click",()=>editEvent(event));const del=document.createElement("button");del.className="btn danger";del.type="button";del.textContent="Delete";del.addEventListener("click",()=>deleteEvent(event));actions.append(edit,del);card.append(type,title,time);if(detail.textContent)card.append(detail);card.append(actions);root.append(card);});
}
function editEvent(e){$("#event-id").value=e.id;$("#event-title").value=e.title;$("#event-type").value=e.event_type;$("#event-course").value=e.course_id||"";$("#event-start").value=localInput(e.starts_at);$("#event-end").value=localInput(e.ends_at);$("#event-location").value=e.location||"";$("#event-notes").value=e.notes||"";$("#event-reminder").value=String(e.reminder_minutes);$("#event-form-heading").textContent="Edit event";$("#event-submit").textContent="Update event";eventForm.scrollIntoView({behavior:"smooth",block:"start"});}
function resetForm(){eventForm.reset();$("#event-id").value="";$("#event-reminder").value="15";$("#event-form-heading").textContent="Add an event";$("#event-submit").textContent="Save event";}
async function deleteEvent(e){if(!confirm("Delete “"+e.title+"” from your timetable?"))return;const {error}=await supabase.from("student_timetable_events").delete().eq("id",e.id).eq("user_id",userId);if(error){setStatus("Could not delete event. "+error.message);return;}events=events.filter(x=>x.id!==e.id);renderCalendar();setStatus("Event deleted.",true);}
eventForm.addEventListener("submit",async ev=>{ev.preventDefault();const start=new Date($("#event-start").value),end=new Date($("#event-end").value);if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start){setStatus("The end time must be after the start time.");return;}const payload={user_id:userId,title:$("#event-title").value.trim(),event_type:$("#event-type").value,course_id:$("#event-course").value||null,starts_at:start.toISOString(),ends_at:end.toISOString(),location:$("#event-location").value.trim(),notes:$("#event-notes").value.trim(),reminder_minutes:Number($("#event-reminder").value)};const id=$("#event-id").value;const {data,error}=id?await supabase.from("student_timetable_events").update(payload).eq("id",id).eq("user_id",userId).select().single():await supabase.from("student_timetable_events").insert(payload).select().single();if(error){setStatus("Could not save event. "+error.message);return;}if(id)events=events.map(x=>x.id===id?data:x);else events.push(data);selectedDate=new Date(data.starts_at);selectedDate.setHours(0,0,0,0);cursor=new Date(selectedDate);resetForm();renderCalendar();setStatus("Event saved to your timetable.",true);});
$("#event-form-reset").addEventListener("click",resetForm);
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>{view=b.dataset.view;document.querySelectorAll("[data-view]").forEach(x=>x.classList.toggle("is-active",x===b));renderCalendar();}));
$("#calendar-prev").addEventListener("click",()=>{if(view==="month")cursor.setMonth(cursor.getMonth()-1);else cursor.setDate(cursor.getDate()-7);renderCalendar();});
$("#calendar-next").addEventListener("click",()=>{if(view==="month")cursor.setMonth(cursor.getMonth()+1);else cursor.setDate(cursor.getDate()+7);renderCalendar();});
$("#calendar-today").addEventListener("click",()=>{cursor=new Date();selectedDate=new Date();selectedDate.setHours(0,0,0,0);renderCalendar();});
async function enableReminders(){if(!("Notification" in window)){setStatus("This browser does not support notifications.");return;}const permission=await Notification.requestPermission();setStatus(permission==="granted"?"Browser reminders enabled. Keep this page open to receive them.":"Notifications were not enabled.");}
const reminderNote=document.querySelector(".timetable-reminder-note");const enable=document.createElement("button");enable.type="button";enable.className="btn secondary reminder-enable";enable.textContent="Enable browser reminders";enable.addEventListener("click",enableReminders);reminderNote.before(enable);
function checkReminders(){if(!("Notification" in window)||Notification.permission!=="granted")return;const now=Date.now();events.forEach(e=>{const at=new Date(e.starts_at).getTime()-Number(e.reminder_minutes)*60000;if(e.reminder_minutes>0&&at<=now&&at>now-60000&&!notified.has(e.id)){notified.add(e.id);new Notification("Upcoming: "+e.title,{body:"Starts at "+dateTimeLabel(e.starts_at)+(e.location?" · "+e.location:"")});}});}
await loadCourses();await loadData();window.setInterval(checkReminders,30000);