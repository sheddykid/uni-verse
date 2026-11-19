import { supabase, requireProfile, signOut } from "./supabase.js";
const $ = selector => document.querySelector(selector);
$("#logout").addEventListener("click", signOut);

if (location.hostname.endsWith("github.io")) {
  $("#github-pages-notice").hidden = false;
  $(".quiz-builder").hidden = true;
} else {
  const session = await requireProfile();
  if (session) {
    const { profile, user } = session;
    $("#user-label").textContent = profile.full_name || user.email;
    const courseSelect = $("#course-select"), notesList = $("#notes-list"), generateButton = $("#generate");
    let notes = [], activeResourceIds = [], questions = [], course = null, quizMode = "mcq";
    const courseQuery = supabase.from("courses").select("id,code,title,course_departments!inner(department_id)").eq("is_active", true);
    if (profile.role !== "admin") courseQuery.eq("course_departments.department_id", profile.department_id);
    const { data: courses, error: courseError } = await courseQuery.order("code");
    courseSelect.replaceChildren(new Option(courseError ? "Could not load courses" : "Select a course", ""));
    if (!courseError) (courses || []).forEach(item => courseSelect.add(new Option(`${item.code} — ${item.title}`, item.id)));
    if (courseError) setStatus("Could not load your courses. Refresh and try again.");
    courseSelect.addEventListener("change", loadNotes);
    generateButton.addEventListener("click", generateQuiz);
    $("#quiz-mode").addEventListener("change", () => {
      const max = $("#quiz-mode").value === "theory" ? 10 : 20;
      $("#question-count").querySelectorAll("option").forEach(option => { option.disabled = Number(option.value) > max; });
      if (Number($("#question-count").value) > max) $("#question-count").value = String(max);
    });
    $("#new-quiz").addEventListener("click", () => { $("#quiz-section").hidden = true; $("#status").textContent = ""; });
    $("#submit-mcq").addEventListener("click", submitMcq);
    await Promise.resolve();
    async function loadNotes() {
      notes = []; generateButton.disabled = true; notesList.replaceChildren();
      $("#note-count").textContent = "Loading…";
      if (!courseSelect.value) { notesList.textContent = "Choose a course to see its notes."; $("#note-count").textContent = "Select a course first"; return; }
      const { data, error } = await supabase.from("course_resources")
        .select("id,title,file_name,file_size,mime_type,created_at").eq("course_id",courseSelect.value)
        .eq("resource_type","note").eq("is_active",true).order("created_at",{ascending:false});
      if (error) { notesList.textContent = "Could not load course notes."; $("#note-count").textContent = "Unavailable"; return; }
      notes = (data || []).filter(item => /\.(pdf|docx|pptx)$/i.test(item.file_name || ""));
      $("#note-count").textContent = `${notes.length} available`;
      if (!notes.length) { notesList.textContent = "No supported course notes are available for this course yet."; return; }
      notes.forEach(note => {
        const label = document.createElement("label"); label.className = "note-choice";
        const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.value = note.id; checkbox.addEventListener("change", updateSelection);
        const details = document.createElement("span"), title = document.createElement("strong"), meta = document.createElement("small");
        title.textContent = note.title; meta.textContent = `${note.file_name.split(".").pop().toUpperCase()} · ${formatSize(note.file_size)}`;
        details.append(title,meta); label.append(checkbox,details); notesList.append(label);
      });
      updateSelection();
    }
    function updateSelection() {
      const selected = [...notesList.querySelectorAll('input[type="checkbox"]:checked')];
      if (selected.length > 5) { selected[selected.length-1].checked = false; setStatus("Select no more than five note files."); }
      else setStatus("");
      const count = notesList.querySelectorAll('input[type="checkbox"]:checked').length;
      generateButton.disabled = count === 0;
      generateButton.textContent = count ? `Generate from ${count} note file${count===1?"":"s"}` : "Generate quiz";
    }
    async function apiRequest(payload) {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession?.access_token) throw new Error("Your session has expired. Sign in again.");
      const response = await fetch("/api/quizzes", { method:"POST",
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${authSession.access_token}`},
        body:JSON.stringify(payload) });
      const raw = await response.text(); let result;
      try { result = raw ? JSON.parse(raw) : {}; } catch { throw new Error(`The quiz server returned an invalid response (HTTP ${response.status}).`); }
      if (!response.ok) throw new Error(result.error || `Quiz request failed (HTTP ${response.status}).`);
      return result;
    }
    async function generateQuiz() {
      activeResourceIds = [...notesList.querySelectorAll('input[type="checkbox"]:checked')].map(input=>input.value);
      if (!activeResourceIds.length) return;
      quizMode = $("#quiz-mode").value;
      const count = Number($("#question-count").value);
      generateButton.disabled = true; generateButton.textContent = "Generating…";
      setStatus("Reading the selected notes and preparing your questions. This may take a little while.");
      $("#quiz-section").hidden = true;
      try {
        const result = await apiRequest({mode:quizMode,courseId:courseSelect.value,resourceIds:activeResourceIds,count});
        questions = result.questions || []; course = result.course;
        if (!questions.length) throw new Error("No questions were generated from these notes.");
        $("#quiz-title").textContent = `${course.code} — ${course.title}`;
        $("#quiz-sources").textContent = `Generated from: ${(result.sources||[]).join(", ")}`;
        $("#mcq-panel").hidden = quizMode !== "mcq"; $("#theory-panel").hidden = quizMode !== "theory";
        $("#mcq-results").hidden = true;
        if (quizMode === "mcq") renderMcq(); else renderTheory();
        $("#quiz-section").hidden = false; setStatus(`Generated ${questions.length} ${quizMode==="mcq"?"multiple-choice":"theory"} questions.`,true);
      } catch(error) { setStatus(error.message || "Could not generate the quiz."); }
      finally {
        generateButton.disabled = notesList.querySelectorAll('input[type="checkbox"]:checked').length===0;
        generateButton.textContent = "Generate quiz";
      }
    }
    function renderMcq() {
      const root = $("#mcq-questions"); root.replaceChildren();
      questions.forEach((item,index) => {
        const card = document.createElement("article"); card.className = "mcq-card";
        const heading = document.createElement("p"); heading.className = "quiz-question-number"; heading.textContent = `QUESTION ${index+1} OF ${questions.length}`;
        const question = document.createElement("h3"); question.textContent = item.question; card.append(heading,question);
        const choices = document.createElement("div"); choices.className = "mcq-options";
        item.options.forEach((option,optionIndex) => {
          const label = document.createElement("label"); label.className = "mcq-option";
          const radio = document.createElement("input"); radio.type = "radio"; radio.name = `question-${index}`; radio.value = String(optionIndex);
          const text = document.createElement("span"); text.textContent = option;
          label.append(radio,text); choices.append(label);
        });
        card.append(choices); root.append(card);
      });
    }
    function submitMcq() {
      const answers = questions.map((_,index) => {
        const selected = document.querySelector(`input[name="question-${index}"]:checked`);
        return selected ? Number(selected.value) : -1;
      });
      if (answers.some(value=>value<0)) { setStatus("Answer every question before submitting."); return; }
      const score = answers.reduce((sum,value,index)=>sum+(value===questions[index].correctIndex?1:0),0);
      const results = $("#mcq-results"); results.replaceChildren();
      const summary = document.createElement("div"); summary.className = "score-summary";
      const scoreTitle = document.createElement("h2"); scoreTitle.textContent = `Your score: ${score} / ${questions.length}`;
      const scoreText = document.createElement("p"); scoreText.className = "muted"; scoreText.textContent = `${Math.round(score/questions.length*100)}% · Review the explanations below.`;
      summary.append(scoreTitle,scoreText); results.append(summary);
      questions.forEach((item,index) => {
        const correct = answers[index]===item.correctIndex, review = document.createElement("article"); review.className = `answer-review ${correct?"answer-correct":"answer-incorrect"}`;
        const title = document.createElement("h3"); title.textContent = `${index+1}. ${item.question}`;
        const chosen = document.createElement("p"); chosen.textContent = `Your answer: ${answers[index]>=0?item.options[answers[index]]:"No answer"}`;
        const right = document.createElement("p"); right.textContent = `Correct answer: ${item.options[item.correctIndex]}`;
        const explanation = document.createElement("p"); explanation.className = "muted"; explanation.textContent = item.explanation;
        review.append(title,chosen,right,explanation); results.append(review);
      });
      results.hidden = false; $("#submit-mcq").disabled = true;
      results.scrollIntoView({behavior:"smooth",block:"start"});
    }
    function renderTheory() {
      const root = $("#theory-questions"); root.replaceChildren();
      questions.forEach((item,index) => {
        const card = document.createElement("article"); card.className = "theory-card";
        const number = document.createElement("p"); number.className = "quiz-question-number"; number.textContent = `THEORY QUESTION ${index+1}`;
        const question = document.createElement("h3"); question.textContent = item.question;
        const label = document.createElement("label"); label.textContent = "Your answer";
        const area = document.createElement("textarea"); area.rows = 6; area.maxLength = 6000; area.placeholder = "Write your answer here…";
        const grade = document.createElement("button"); grade.type = "button"; grade.className = "btn primary"; grade.textContent = "Submit for feedback";
        const feedback = document.createElement("div"); feedback.className = "theory-feedback"; feedback.hidden = true;
        grade.addEventListener("click",()=>gradeTheory(item,area,grade,feedback));
        label.append(area); card.append(number,question,label,grade,feedback); root.append(card);
      });
    }
    async function gradeTheory(item,area,button,feedback) {
      if (area.value.trim().length<5) { setStatus("Write a little more before submitting your answer."); area.focus(); return; }
      button.disabled = true; button.textContent = "Assessing…"; feedback.hidden = true;
      try {
        const result = await apiRequest({mode:"grade",courseId:course.id,resourceIds:activeResourceIds,question:item.question,markingGuide:item.markingGuide,answer:area.value});
        renderTheoryFeedback(feedback,result.assessment);
      } catch(error) { feedback.textContent = error.message || "Could not assess this answer."; feedback.hidden = false; }
      finally { button.disabled = false; button.textContent = "Assess again"; }
    }
    function renderTheoryFeedback(root,data) {
      root.replaceChildren(); root.hidden = false;
      const score = document.createElement("h4"); score.textContent = `AI practice score: ${data.score}/10`;
      const feedback = document.createElement("p"); feedback.textContent = data.feedback;
      root.append(score,feedback);
      if (data.strengths?.length) appendList(root,"What you covered well",data.strengths);
      if (data.improvements?.length) appendList(root,"What to improve",data.improvements);
      const answerTitle = document.createElement("h4"); answerTitle.textContent = "Suggested answer";
      const answer = document.createElement("p"); answer.textContent = data.modelAnswer;
      root.append(answerTitle,answer);
    }
    function appendList(root,titleText,items) {
      const title = document.createElement("h4"); title.textContent = titleText;
      const list = document.createElement("ul"); items.forEach(value=>{const li=document.createElement("li");li.textContent=value;list.append(li);});
      root.append(title,list);
    }
    function setStatus(message,success=false) { $("#status").textContent=message; $("#status").classList.toggle("success",success); }
    function formatSize(bytes) { if(!bytes)return "Size unknown"; return bytes<1048576?`${Math.round(bytes/1024)} KB`:`${(bytes/1048576).toFixed(1)} MB`; }
  }
}