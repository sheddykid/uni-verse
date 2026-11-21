import { supabase, requireProfile, signOut } from "./supabase.js";
const $ = selector => document.querySelector(selector);
$("#logout").addEventListener("click", signOut);
const session = await requireProfile();
if (session) {
  $("#user-label").textContent = session.profile.full_name || session.user.email;
  $("#refresh-quiz-history").addEventListener("click", loadQuizHistory);
  await loadQuizHistory();
}
async function loadQuizHistory() {
  const root = $("#quiz-history"), status = $("#quiz-history-status");
  if (!root) return;
  root.replaceChildren();
  status.textContent = "Loading your previous attempts…";
  const { data, error } = await supabase.from("quiz_attempts")
    .select("id,course_code,course_title,source_title,mode,score,total,percentage,review,completed_at")
    .order("completed_at", { ascending: false }).limit(50);
  if (error) {
    status.textContent = "Could not load quiz history. Refresh and try again.";
    return;
  }
  status.textContent = data.length ? data.length + " recent attempt" + (data.length === 1 ? "" : "s") : "";
  if (!data.length) {
    const empty = document.createElement("p"); empty.className = "muted";
    empty.textContent = "No completed quiz attempts yet. Your scores will appear here after you submit a quiz or theory answer.";
    root.append(empty); return;
  }
  data.forEach(attempt => {
    const card = document.createElement("article"); card.className = "quiz-history-card";
    const head = document.createElement("div"); head.className = "quiz-history-head";
    const courseName = document.createElement("strong");
    courseName.textContent = attempt.course_code + " — " + attempt.course_title;
    const score = document.createElement("span"); score.className = "quiz-history-score";
    score.textContent = attempt.score + "/" + (attempt.mode === "mcq" ? attempt.total : 10) + " · " + attempt.percentage + "%";
    head.append(courseName, score);
    const meta = document.createElement("p"); meta.className = "resource-meta";
    meta.textContent = (attempt.mode === "mcq" ? "Multiple-choice quiz" : "Theory assessment") + " · " + attempt.source_title + " · " + new Date(attempt.completed_at).toLocaleString();
    card.append(head, meta);
    const details = document.createElement("details"); details.className = "quiz-history-details";
    const summary = document.createElement("summary"); summary.textContent = "Review this attempt";
    details.append(summary);
    (attempt.review || []).forEach((item,index) => {
      const review = document.createElement("div"); review.className = "quiz-history-review";
      const question = document.createElement("strong"); question.textContent = (index+1) + ". " + (item.question || "Theory response");
      review.append(question);
      if (attempt.mode === "mcq" && Array.isArray(item.options)) {
        const chosen = document.createElement("p");
        chosen.textContent = "Your answer: " + (item.options[item.selectedIndex] || "—");
        const correct = document.createElement("p");
        correct.textContent = "Correct answer: " + (item.options[item.correctIndex] || "—");
        const explanation = document.createElement("p"); explanation.className = "muted"; explanation.textContent = item.explanation || "";
        review.append(chosen,correct,explanation);
      } else if (item.assessment) {
        const answer = document.createElement("p"); answer.textContent = "Your answer: " + (item.answer || "");
        const feedback = document.createElement("p"); feedback.textContent = item.assessment.feedback || "";
        const model = document.createElement("p"); model.textContent = "Suggested answer: " + (item.assessment.modelAnswer || "");
        review.append(answer,feedback,model);
      }
      details.append(review);
    });
    card.append(details); root.append(card);
  });
}
