import { supabase, requireProfile, signOut } from "./supabase.js";
const $ = selector => document.querySelector(selector);
$("#logout")?.addEventListener("click", signOut);

const session = await requireProfile();
if (session) {
  const { profile, user } = session;
  $("#user-label").textContent = profile.full_name || user.email;
  const stored = sessionStorage.getItem("universeActiveQuiz");
  if (!stored) {
    $("#session-status").textContent = "No active quiz was found. Generate a quiz first.";
  } else {
    let active;
    try { active = JSON.parse(stored); } catch { active = null; }
    if (!active?.result?.questions?.length || !["mcq", "theory"].includes(active.quizMode)) {
      $("#session-status").textContent = "This practice session is invalid. Generate a new quiz.";
    } else {
      const { result, quizMode, resourceIds } = active;
      const questions = result.questions;
      const course = result.course;
      const quizSessionId = result.quizSessionId || null;
      $("#quiz-title").textContent = `${course.code} — ${course.title}`;
      $("#quiz-sources").textContent = `Generated from: ${(result.sources || []).join(", ")}`;
      $("#mcq-panel").hidden = quizMode !== "mcq";
      $("#theory-panel").hidden = quizMode !== "theory";
      $("#session-status").textContent = `Prepared ${questions.length} ${quizMode === "mcq" ? "multiple-choice" : "theory"} questions${quizMode === "mcq" && result.reusedCount ? ` (${result.reusedCount} reused from the course question bank)` : ""}.`;
      if (quizMode === "mcq") renderMcq();
      else renderTheory();

      async function apiRequest(payload) {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        if (!authSession?.access_token) throw new Error("Your session has expired. Sign in again.");
        const response = await fetch("/api/quizzes", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${authSession.access_token}` },
          body: JSON.stringify(payload)
        });
        const raw = await response.text();
        let data;
        try { data = raw ? JSON.parse(raw) : {}; }
        catch { throw new Error(`The quiz server returned an invalid response (HTTP ${response.status}).`); }
        if (!response.ok) throw new Error(data.error || `Quiz request failed (HTTP ${response.status}).`);
        return data;
      }

      function renderMcq() {
        const root = $("#mcq-questions"); root.replaceChildren();
        questions.forEach((item, index) => {
          const card = document.createElement("article"); card.className = "mcq-card";
          const heading = document.createElement("p"); heading.className = "quiz-question-number"; heading.textContent = `QUESTION ${index + 1} OF ${questions.length}`;
          const question = document.createElement("h3"); question.textContent = item.question; card.append(heading, question);
          const choices = document.createElement("div"); choices.className = "mcq-options";
          item.options.forEach((option, optionIndex) => {
            const label = document.createElement("label"); label.className = "mcq-option";
            const radio = document.createElement("input"); radio.type = "radio"; radio.name = `question-${index}`; radio.value = String(optionIndex);
            const text = document.createElement("span"); text.textContent = option;
            label.append(radio, text); choices.append(label);
          });
          card.append(choices); root.append(card);
        });
      }

      $("#submit-mcq").addEventListener("click", async () => {
        const answers = questions.map((_, index) => {
          const selected = document.querySelector(`input[name="question-${index}"]:checked`);
          return selected ? Number(selected.value) : -1;
        });
        if (answers.some(value => value < 0)) { setStatus("Answer every question before submitting."); return; }
        if (!quizSessionId) { setStatus("This quiz session is invalid. Generate a new quiz."); return; }
        const button = $("#submit-mcq");
        button.disabled = true; button.textContent = "Marking…";
        try {
          const marked = await apiRequest({ mode: "mcq_submit", courseId: course.id, resourceIds, quizSessionId, answers });
          const results = $("#mcq-results"); results.replaceChildren();
          const summary = document.createElement("div"); summary.className = "score-summary";
          const scoreTitle = document.createElement("h2"); scoreTitle.textContent = `Your score: ${marked.score} / ${marked.total}`;
          const scoreText = document.createElement("p"); scoreText.className = "muted"; scoreText.textContent = `${marked.percentage}% · Review the explanations below.`;
          summary.append(scoreTitle, scoreText); results.append(summary);
          (marked.review || []).forEach((item, index) => {
            const correct = item.selectedIndex === item.correctIndex, review = document.createElement("article");
            review.className = `answer-review ${correct ? "answer-correct" : "answer-incorrect"}`;
            const title = document.createElement("h3"); title.textContent = `${index + 1}. ${item.question}`;
            const chosen = document.createElement("p"); chosen.textContent = `Your answer: ${item.options[item.selectedIndex]}`;
            const right = document.createElement("p"); right.textContent = `Correct answer: ${item.options[item.correctIndex]}`;
            const explanation = document.createElement("p"); explanation.className = "muted"; explanation.textContent = item.explanation;
            review.append(title, chosen, right, explanation); results.append(review);
          });
          results.hidden = false; button.textContent = "Submitted";
          sessionStorage.removeItem("universeActiveQuiz");
          results.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (error) {
          setStatus(error.message || "Could not mark this quiz.");
          button.disabled = false; button.textContent = "Submit answers";
        }
      });

      function renderTheory() {
        const root = $("#theory-questions"); root.replaceChildren();
        questions.forEach((item, index) => {
          const card = document.createElement("article"); card.className = "theory-card";
          const number = document.createElement("p"); number.className = "quiz-question-number"; number.textContent = `THEORY QUESTION ${index + 1}`;
          const question = document.createElement("h3"); question.textContent = item.question;
          const label = document.createElement("label"); label.textContent = "Your answer";
          const area = document.createElement("textarea"); area.rows = 6; area.maxLength = 6000; area.placeholder = "Write your answer here…";
          const grade = document.createElement("button"); grade.type = "button"; grade.className = "btn primary"; grade.textContent = "Submit for feedback";
          const feedback = document.createElement("div"); feedback.className = "theory-feedback"; feedback.hidden = true;
          grade.addEventListener("click", () => gradeTheory(item, area, grade, feedback));
          label.append(area); card.append(number, question, label, grade, feedback); root.append(card);
        });
      }

      async function gradeTheory(item, area, button, feedback) {
        if (area.value.trim().length < 5) { setStatus("Write a little more before submitting your answer."); area.focus(); return; }
        button.disabled = true; button.textContent = "Assessing…"; feedback.hidden = true;
        try {
          const graded = await apiRequest({ mode: "grade", courseId: course.id, resourceIds, question: item.question, markingGuide: item.markingGuide, answer: area.value });
          renderTheoryFeedback(feedback, graded.assessment);
        } catch (error) { feedback.textContent = error.message || "Could not assess this answer."; feedback.hidden = false; }
        finally { button.disabled = false; button.textContent = "Assess again"; }
      }

      function renderTheoryFeedback(root, data) {
        root.replaceChildren(); root.hidden = false;
        const score = document.createElement("h4"); score.textContent = `AI practice score: ${data.score}/10`;
        const feedback = document.createElement("p"); feedback.textContent = data.feedback;
        root.append(score, feedback);
        if (data.strengths?.length) appendList(root, "What you covered well", data.strengths);
        if (data.improvements?.length) appendList(root, "What to improve", data.improvements);
        const answerTitle = document.createElement("h4"); answerTitle.textContent = "Suggested answer";
        const answer = document.createElement("p"); answer.textContent = data.modelAnswer;
        root.append(answerTitle, answer);
      }
      function appendList(root, titleText, items) {
        const title = document.createElement("h4"); title.textContent = titleText;
        const list = document.createElement("ul");
        items.forEach(value => { const li = document.createElement("li"); li.textContent = value; list.append(li); });
        root.append(title, list);
      }
      function setStatus(message) { $("#session-status").textContent = message; }
    }
  }
}