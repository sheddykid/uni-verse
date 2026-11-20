import { requireProfile, signOut } from "./supabase.js";

const $ = selector => document.querySelector(selector);
$("#logout").addEventListener("click", signOut);

const session = await requireProfile();
if (session) {
  const { profile, user } = session;
  $("#user-label").textContent = profile.full_name || user.email;
  let result = null;
  try {
    result = JSON.parse(sessionStorage.getItem("universeActiveSummary") || "null");
  } catch {
    result = null;
  }

  if (!result?.summary || !result?.course) {
    $("#summary-empty").hidden = false;
  } else {
    const summary = result.summary;
    $("#summary-title").textContent = summary.title || "Study summary";
    $("#summary-meta").textContent = `${result.course.code} — ${result.course.title} · ${(result.sources || []).join(", ")} · ${result.provider} AI${result.sampled ? " · long notes sampled to fit the AI context limit" : ""}`;
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
    $("#summary-result").hidden = false;

    $("#copy-summary").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(toPlainText(result));
        $("#copy-summary").textContent = "Copied";
        setTimeout(() => { $("#copy-summary").textContent = "Copy text"; }, 1600);
      } catch {
        $("#copy-summary").textContent = "Copy unavailable";
      }
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

function toPlainText(result) {
  const s = result.summary;
  return [
    s.title,
    `${result.course.code} — ${result.course.title}`,
    `Source notes: ${(result.sources || []).join(", ")}`,
    "",
    "OVERVIEW",
    s.overview,
    "",
    "KEY POINTS",
    ...(s.keyPoints || []).map(value => `• ${value}`),
    "",
    "TOPIC BREAKDOWN",
    ...(s.sections || []).flatMap(section => [section.heading, section.summary, ...(section.details || []).map(value => `• ${value}`)]),
    "",
    "KEY TERMS",
    ...(s.keyTerms || []).map(item => `${item.term}: ${item.definition}`),
    "",
    "FORMULAS AND EQUATIONS",
    ...(s.formulas || []).flatMap(item => [`${item.name}: ${item.expression}`, item.explanation]),
    "",
    "REVISION CHECKLIST",
    ...(s.revisionChecklist || []).map(value => `□ ${value}`)
  ].join("\n");
}
