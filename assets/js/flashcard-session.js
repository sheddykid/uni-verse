import { requireProfile, signOut } from "./supabase.js";
const $ = selector => document.querySelector(selector);
$("#logout")?.addEventListener("click", signOut);
const session = await requireProfile();
if (session && session.profile.role !== "admin" && session.profile.is_verified !== true) {
  sessionStorage.removeItem("universeActiveFlashcards");
  $("#session-status").textContent = "Verify your student account before accessing AI flashcards.";
  $("#deck-section").hidden = true;
} else if (session) {
  const { profile, user } = session;
  $("#user-label").textContent = profile.full_name || user.email;
  const stored = sessionStorage.getItem("universeActiveFlashcards");
  let active = null;
  try { active = stored ? JSON.parse(stored) : null; } catch { active = null; }
  const result = active?.result;
  const deck = Array.isArray(result?.flashcards) ? result.flashcards : [];
  if (!deck.length) {
    $("#session-status").textContent = "No active flashcard set was found. Generate a set first.";
  } else {
    let index = 0, flipped = false;
    const ratings = new Map();
    $("#deck-title").textContent = `${result.course.code} — ${result.course.title}`;
    $("#deck-sources").textContent = `Generated from: ${(result.sources || []).join(", ")}`;
    $("#session-status").textContent = `Studying ${deck.length} cards${result.reusedCount ? ` (${result.reusedCount} reused from the saved note bank)` : ""}. Tap a card to reveal its answer.`;
    $("#deck-section").hidden = false;
    $("#flashcard").addEventListener("click", () => { flipped = !flipped; render(); });
    $("#previous").addEventListener("click", () => { index = Math.max(0, index - 1); flipped = false; render(); });
    $("#next").addEventListener("click", () => {
      if (index === deck.length - 1) return finish();
      index++; flipped = false; render();
    });
    $("#mark-known").addEventListener("click", () => rate(true));
    $("#mark-learning").addEventListener("click", () => rate(false));
    $("#restart").addEventListener("click", () => { index = 0; flipped = false; ratings.clear(); render(); });
    $("#finish").addEventListener("click", finish);
    function rate(known) {
      ratings.set(index, known);
      if (index < deck.length - 1) { index++; flipped = false; }
      render();
    }
    function render() {
      const card = deck[index];
      $("#card-side").textContent = flipped ? "ANSWER" : "QUESTION";
      $("#card-text").textContent = flipped ? card.back : card.front;
      $("#card-hint").textContent = flipped ? "Tap to see question" : "Tap to reveal answer";
      $("#progress-label").textContent = `Card ${index + 1} of ${deck.length}`;
      $("#known-label").textContent = `${[...ratings.values()].filter(Boolean).length} known`;
      $("#progress-fill").style.width = `${((index + 1) / deck.length) * 100}%`;
      $("#previous").disabled = index === 0;
      $("#next").textContent = index === deck.length - 1 ? "Finish" : "Next";
      $("#mark-known").classList.toggle("selected", ratings.get(index) === true);
      $("#mark-learning").classList.toggle("selected", ratings.get(index) === false);
      $("#deck-finish").textContent = index === deck.length - 1 ? "You have reached the last card. Finish to return to the generator." : "";
    }
    function finish() {
      sessionStorage.removeItem("universeActiveFlashcards");
      location.href = "./flashcards.html";
    }
    render();
  }
}