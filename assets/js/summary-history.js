import { supabase, requireProfile, signOut } from "./supabase.js";
const $ = selector => document.querySelector(selector);
$("#logout")?.addEventListener("click", signOut);
const session = await requireProfile();
if (session) {
  $("#user-label").textContent = session.profile.full_name || session.user.email;
  $("#refresh-history").addEventListener("click", loadHistory);
  await loadHistory();
}
async function loadHistory() {
  const list = $("#summary-history-list");
  const button = $("#refresh-history");
  button.disabled = true; list.replaceChildren();
  $("#history-status").textContent = "Loading saved PDFs…";
  const { data, error } = await supabase.from("note_summary_history")
    .select("id,course_code,course_title,source_title,pdf_path,created_at")
    .eq("user_id", session.user.id).eq("status", "ready")
    .order("created_at", { ascending: false });
  if (error) {
    $("#history-status").textContent = "Could not load summary history. Refresh and try again.";
    list.textContent = "Summary history is unavailable.";
    button.disabled = false; return;
  }
  if (!data?.length) {
    $("#history-status").textContent = "";
    list.textContent = "No completed summaries yet. Generate a summary from one of your course notes.";
    button.disabled = false; return;
  }
  $("#history-status").textContent = data.length + " saved PDF" + (data.length === 1 ? "" : "s");
  data.forEach(item => {
    const card = document.createElement("article"); card.className = "summary-history-card";
    const copy = document.createElement("div");
    const course = document.createElement("p"); course.className = "eyebrow";
    course.textContent = item.course_code + " — " + item.course_title;
    const title = document.createElement("h3"); title.textContent = item.source_title;
    const date = document.createElement("p"); date.className = "muted";
    date.textContent = new Date(item.created_at).toLocaleString();
    copy.append(course, title, date);
    const actions = document.createElement("div"); actions.className = "summary-result-actions";
    const view = document.createElement("a"); view.className = "btn primary";
    view.href = "./summary-session.html?id=" + encodeURIComponent(item.id);
    view.textContent = "View summary";
    const download = document.createElement("button"); download.className = "btn secondary";
    download.type = "button"; download.textContent = "Download PDF";
    download.addEventListener("click", async () => {
      download.disabled = true; download.textContent = "Preparing…";
      const { data: signed, error: signedError } = await supabase.storage.from("summary-pdfs")
        .createSignedUrl(item.pdf_path, 60, { download: item.source_title + "-summary.pdf" });
      if (signedError || !signed?.signedUrl) {
        download.textContent = "Try again"; download.disabled = false; return;
      }
      const link = document.createElement("a"); link.href = signed.signedUrl;
      link.download = item.source_title + "-summary.pdf";
      document.body.append(link); link.click(); link.remove();
      download.textContent = "Download PDF"; download.disabled = false;
    });
    actions.append(view, download);
    card.append(copy, actions); list.append(card);
  });
  button.disabled = false;
}
