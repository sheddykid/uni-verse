import { supabase, requireProfile, signOut } from "./supabase.js";

const $ = selector => document.querySelector(selector);
$("#logout")?.addEventListener("click", signOut);

const session = await requireProfile();
if (session) {
  const { profile, user } = session;
  $("#user-label").textContent = profile.full_name || user.email;
  const summaryId = new URLSearchParams(location.search).get("id");
  const empty = $("#summary-empty");
  const resultSection = $("#summary-result");

  if (!summaryId) {
    showEmpty("This summary link is incomplete. Open it from Summary history.");
  } else {
    const { data: record, error } = await supabase.from("note_summary_history")
      .select("id,course_code,course_title,source_title,pdf_path,summary_data,created_at")
      .eq("id", summaryId).eq("user_id", user.id).eq("status", "ready").single();

    if (error || !record) {
      showEmpty("This saved summary could not be found. It may have been removed or may not belong to your account.");
    } else if (!record.summary_data?.summary) {
      showEmpty("This older summary has a saved PDF but no on-page copy. Open Summary history to download it.");
      $("#summary-empty").querySelector("p").insertAdjacentHTML("afterend",
        '<p><a class="btn secondary" href="./summary-history.html">Open summary history</a></p>');
    } else {
      const result = record.summary_data;
      result.historyPdfPath = record.pdf_path;
      renderSummary(result, record);
    }
  }

  function showEmpty(message) {
    empty.hidden = false;
    empty.querySelector("p").textContent = message;
  }

  function renderSummary(result, record) {
    const summary = result.summary;
    $("#summary-title").textContent = summary.title || record.source_title || "Study summary";
    $("#summary-meta").textContent = record.course_code + " — " + record.course_title +
      " · " + record.source_title + " · " + (result.provider || "AI") +
      " · Saved " + new Date(record.created_at).toLocaleString();
    $("#summary-overview").textContent = summary.overview || "";
    fillList($("#summary-key-points"), summary.keyPoints);
    fillList($("#summary-checklist"), summary.revisionChecklist);

    const sections = $("#summary-sections");
    sections.replaceChildren();
    (summary.sections || []).forEach(item => {
      const article = document.createElement("article");
      article.className = "summary-topic";
      const heading = document.createElement("h4");
      heading.textContent = item.heading;
      const description = document.createElement("p");
      description.textContent = item.summary;
      article.append(heading, description);
      if (item.details?.length) {
        const list = document.createElement("ul");
        fillList(list, item.details);
        article.append(list);
      }
      sections.append(article);
    });

    const terms = $("#summary-terms");
    terms.replaceChildren();
    (summary.keyTerms || []).forEach(item => {
      const term = document.createElement("dt");
      const definition = document.createElement("dd");
      term.textContent = item.term;
      definition.textContent = item.definition;
      terms.append(term, definition);
    });
    $("#summary-terms-block").hidden = !summary.keyTerms?.length;

    const formulas = $("#summary-formulas");
    formulas.replaceChildren();
    (summary.formulas || []).forEach(item => {
      const article = document.createElement("article");
      article.className = "summary-formula";
      const heading = document.createElement("h4");
      heading.textContent = item.name;
      const expression = document.createElement("code");
      expression.textContent = item.expression;
      const explanation = document.createElement("p");
      explanation.textContent = item.explanation;
      article.append(heading, expression, explanation);
      formulas.append(article);
    });
    $("#summary-formulas-block").hidden = !summary.formulas?.length;
    resultSection.hidden = false;

    $("#copy-summary").addEventListener("click", async () => {
      const button = $("#copy-summary");
      try {
        await navigator.clipboard.writeText(toPlainText(result, record));
        button.textContent = "Copied";
        setTimeout(() => { button.textContent = "Copy text"; }, 1600);
      } catch {
        button.textContent = "Copy unavailable";
      }
    });

    $("#download-summary-pdf").addEventListener("click", async () => {
      const button = $("#download-summary-pdf");
      if (!record.pdf_path) { button.textContent = "PDF unavailable"; return; }
      button.disabled = true;
      button.textContent = "Preparing…";
      const { data, error } = await supabase.storage.from("summary-pdfs")
        .createSignedUrl(record.pdf_path, 60, { download: (summary.title || "study-summary") + ".pdf" });
      if (error || !data?.signedUrl) {
        button.textContent = "Download unavailable";
      } else {
        const link = document.createElement("a");
        link.href = data.signedUrl;
        link.download = (summary.title || "study-summary") + ".pdf";
        document.body.append(link); link.click(); link.remove();
        button.textContent = "Download PDF";
      }
      button.disabled = false;
    });

    $("#print-summary").addEventListener("click", () => window.print());
  }
}

function fillList(root, items) {
  root.replaceChildren();
  (items || []).forEach(value => {
    const item = document.createElement("li");
    item.textContent = value;
    root.append(item);
  });
}

function toPlainText(result, record) {
  const s = result.summary;
  return [
    s.title,
    record.course_code + " — " + record.course_title,
    "Source note: " + record.source_title,
    "",
    "OVERVIEW",
    s.overview,
    "",
    "KEY POINTS",
    ...(s.keyPoints || []).map(value => "• " + value),
    "",
    "TOPIC BREAKDOWN",
    ...(s.sections || []).flatMap(section => [section.heading, section.summary, ...(section.details || []).map(value => "• " + value)]),
    "",
    "KEY TERMS",
    ...(s.keyTerms || []).map(item => item.term + ": " + item.definition),
    "",
    "FORMULAS AND EQUATIONS",
    ...(s.formulas || []).flatMap(item => [item.name + ": " + item.expression, item.explanation]),
    "",
    "REVISION CHECKLIST",
    ...(s.revisionChecklist || []).map(value => "□ " + value)
  ].join("\n");
}
