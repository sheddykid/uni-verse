import { supabase, requireProfile } from "./supabase.js";
const $=s=>document.querySelector(s);
(async()=>{\nconst session=await requireProfile();
if(!session) throw new Error("Sign-in required.");
$("#user-label").textContent=session.profile.full_name||session.user.email;
const status=$("#analytics-status");
const {data,error}=await supabase.from("quiz_attempts").select("id,course_code,course_title,source_title,mode,score,total,percentage,review,completed_at").order("completed_at",{ascending:false}).limit(200);
if(error){status.textContent="Could not load your quiz analytics. Refresh and try again.";throw error;}
const attempts=data||[];
if(!attempts.length){status.textContent="No completed quiz attempts yet. Complete a quiz or theory assessment and your performance analytics will appear here.";return;}
status.textContent="";$("#analytics-content").hidden=false;
const average=Math.round(attempts.reduce((s,a)=>s+Number(a.percentage||0),0)/attempts.length);
const best=Math.max(...attempts.map(a=>Number(a.percentage||0)));
const recent=attempts.slice(0,5),previous=attempts.slice(5,10);
const recentAvg=recent.reduce((s,a)=>s+Number(a.percentage||0),0)/recent.length;
const previousAvg=previous.length?previous.reduce((s,a)=>s+Number(a.percentage||0),0)/previous.length:null;
const delta=previousAvg===null?null:Math.round(recentAvg-previousAvg);
const stats=[["Completed attempts",attempts.length],["Average score",average+"%"],["Best score",best+"%"],["Recent trend",delta===null?"—":(delta>0?"+":"")+delta+" pts"]];
stats.forEach(([label,value])=>{const card=document.createElement("article");card.className="analytics-stat-card";const v=document.createElement("strong");v.textContent=value;const l=document.createElement("span");l.textContent=label;card.append(v,l);$("#analytics-stats").append(card);});
const trend=[...attempts].slice(0,12).reverse();const trendRoot=$("#analytics-trend");
if(trend.length<2){const p=document.createElement("p");p.className="muted";p.textContent="Complete more quizzes to see your score trend.";trendRoot.append(p);}else{const max=100;trend.forEach((a,i)=>{const item=document.createElement("div");item.className="analytics-trend-item";const bar=document.createElement("div");bar.className="analytics-trend-bar";bar.style.height=Math.max(6,Number(a.percentage||0))+"%";bar.title=a.course_code+" · "+a.percentage+"%";const label=document.createElement("span");label.textContent=new Date(a.completed_at).toLocaleDateString(undefined,{day:"numeric",month:"short"});const score=document.createElement("strong");score.textContent=a.percentage+"%";item.append(score,bar,label);trendRoot.append(item);});}
const courseMap=new Map();
attempts.forEach(a=>{const key=a.course_code+" — "+a.course_title;const c=courseMap.get(key)||{name:key,count:0,total:0,best:0};c.count++;c.total+=Number(a.percentage||0);c.best=Math.max(c.best,Number(a.percentage||0));courseMap.set(key,c);});
[...courseMap.values()].sort((a,b)=>(a.total/a.count)-(b.total/b.count)).forEach(c=>{const row=document.createElement("article");row.className="analytics-course-row";const head=document.createElement("div");head.className="analytics-course-head";const name=document.createElement("strong");name.textContent=c.name;const score=document.createElement("span");score.textContent=Math.round(c.total/c.count)+"% average";head.append(name,score);const track=document.createElement("div");track.className="analytics-course-track";const fill=document.createElement("span");fill.style.width=Math.max(0,Math.min(100,c.total/c.count))+"%";track.append(fill);const meta=document.createElement("p");meta.className="resource-meta";meta.textContent=c.count+" attempt"+(c.count===1?"":"s")+" · Best "+c.best+"%";row.append(head,track,meta);$("#analytics-courses").append(row);});
const missed=new Map();
attempts.filter(a=>a.mode==="mcq").forEach(a=>(a.review||[]).forEach(item=>{if(Number.isInteger(item.selectedIndex)&&Number.isInteger(item.correctIndex)&&item.selectedIndex!==item.correctIndex){const key=String(item.question||"").trim();if(!key)return;const entry=missed.get(key)||{question:key,count:0,course:a.course_code};entry.count++;missed.set(key,entry);}}));
[...missed.values()].sort((a,b)=>b.count-a.count).slice(0,8).forEach(item=>{const row=document.createElement("article");row.className="analytics-missed-card";const question=document.createElement("strong");question.textContent=item.question;const meta=document.createElement("p");meta.className="resource-meta";meta.textContent=item.course+" · Missed "+item.count+" time"+(item.count===1?"":"s");row.append(question,meta);$("#analytics-missed").append(row);});
if(!missed.size){const p=document.createElement("p");p.className="muted";p.textContent="No missed multiple-choice questions recorded yet. Keep completing quizzes to build this section.";$("#analytics-missed").append(p);}
\n})();\n