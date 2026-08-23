/* ================= SERP Squad AI — SEO research lane =================
   On command, the agent crawls LIVE sources through the API server —
   the project's website (sitemap crawl), its Google Business Profile
   (Places API), the real geo-targeted SERP (DataForSEO) and competitor
   pages — then answers through the configured AI provider, grounded in
   BOTH the gathered data and the "Google SEO PRO Guides" corpus
   (server/knowledge/seo-guide.json, queried per question).

   Honest by design, like every integration in this CRM:
   - every data source that fails is REPORTED as unavailable, never faked;
   - with no AI provider configured, the lane still crawls and returns the
     findings + the matching Google guidelines, clearly labeled;
   - the model is instructed to only reason from the data given.
   ================================================================== */
import { aiGenerate } from "../../lib/aiwrite.jsx";
import { seoGuideBlock } from "../../lib/seoknowledge.js";

const jpost = async (path, body, timeoutMs = 180000) => {
  const r = await fetch(path, {
    method: "POST", headers: { "Content-Type": "application/json", "X-SS-Token": localStorage.getItem("ss_token") || "" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || j.error || `HTTP ${r.status}`);
  return j;
};

/* ---- intent detection (called by agent.js BEFORE its generic intents) ---- */
export function detectResearch(q) {
  const quoted = (q.match(/["“']([^"“”']{3,80})["“”']/) || [])[1] || null;
  if (/(gbp|business profile|google profile|maps listing|listing)\b.*(audit|check|status|analy|review|health)|(audit|check|analyze|review)\b.*(gbp|business profile|listing)/.test(q))
    return { kind: "gbp" };
  if (/competitor|content gap|gap analysis|outrank|beat the serp|vs the serp/.test(q))
    return { kind: "competitors", keyword: quoted };
  if (/\bserp\b|who ranks|top (10|ten|results)|search results for/.test(q))
    return { kind: "serp", keyword: quoted };
  if (/(audit|crawl|analyze|check|review|health)\b.*(site|website|web ?pages|on-?page|technical)|(site|website)\b.*(audit|health|check|status)|technical seo/.test(q))
    return { kind: "site" };
  if (/\b(seo|schema|structured data|canonical|robots\.?txt|sitemap|meta (title|description)|title tag|snippet|e-?e-?a-?t|core web vitals|lcp|inp|cls|index(ing|ed)?|crawl(ing|ed)?|backlink|anchor text|redirect|hreflang|ai overview|ai mode|local seo|keyword stuffing|duplicate content|page experience|rich result)\b/.test(q))
    return { kind: "question" };
  return null;
}

/* trim any object for prompt inclusion */
const clip = (obj, max) => {
  const s = JSON.stringify(obj, null, 1);
  return s.length > max ? s.slice(0, max) + "\n…(truncated)" : s;
};

const marketOf = (s) => {
  const c = s.tracking?.[0]?.city;
  return c ? [c.city, c.region, "United States"].filter(Boolean).join(",") : "United States";
};
const siteUrl = (s) => {
  const w = (s.project.website || "").trim();
  return w ? (/^https?:\/\//.test(w) ? w : "https://" + w) : null;
};
const ownDomain = (s) => { try { return new URL(siteUrl(s)).hostname.replace(/^www\./, ""); } catch { return null; } };

/* ---------- gatherers (each reports its own failure honestly) ---------- */
async function gatherSite(s, onStep) {
  const url = siteUrl(s);
  if (!url) return { error: "The project has no website URL configured (Project settings)." };
  onStep(`Crawling ${url} (sitemap + every page)…`);
  try {
    /* the auditor wants a sitemap URL — walk the standard locations */
    const base = url.replace(/\/$/, "");
    let a = null, lastErr = null;
    for (const cand of [base + "/sitemap.xml", base + "/sitemap_index.xml", base + "/wp-sitemap.xml"]) {
      try { a = await jpost("/api/audit/website", { sitemapUrl: cand }, 300000); break; }
      catch (e) { lastErr = e; }
    }
    if (!a) throw lastErr || new Error("no sitemap found");
    const pages = a.pages || [];
    const flag = (f) => pages.filter(f).map((p) => p.path).slice(0, 15);
    return {
      host: a.host, totalInSitemap: a.totalInSitemap, crawled: a.crawled,
      issues: {
        httpErrors: pages.filter((p) => !p.status || p.status >= 400).map((p) => `${p.path} (${p.status || p.error})`).slice(0, 15),
        missingTitle: flag((p) => !p.title), missingMetaDesc: flag((p) => !p.metaDesc),
        duplicateTitles: dupBy(pages, "title"), duplicateDescs: dupBy(pages, "metaDesc"),
        noH1: flag((p) => p.h1 === "" || p.h1 === undefined && p.status < 400 && !p.error),
        thin: pages.filter((p) => p.words != null && p.words < 150).map((p) => `${p.path} (${p.words} words)`).slice(0, 15),
        orphans: pages.filter((p) => p.internalIn === 0 && p.path !== "/").map((p) => p.path).slice(0, 15),
        slow: pages.filter((p) => p.ms > 3000).map((p) => `${p.path} (${(p.ms / 1000).toFixed(1)}s)`).slice(0, 10),
        noindex: flag((p) => p.noindex), missingCanonical: flag((p) => p.status === 200 && !p.canonical),
      },
      sample: pages.slice(0, 25).map((p) => ({ path: p.path, status: p.status, title: p.title, metaDesc: (p.metaDesc || "").slice(0, 90), h1: p.h1, words: p.words, internalIn: p.internalIn, internalOut: p.internalOutCount })),
    };
  } catch (e) {
    onStep("Full crawl unavailable — reading the homepage directly…");
    try {
      const pg = await jpost("/api/crawl/page", { url });
      return { singlePage: { url, metaTitle: pg.metaTitle, metaDesc: pg.metaDesc, h1: pg.h1, words: pg.words, headings: pg.headings }, note: `Sitemap crawl failed (${e.message}); only the homepage was read.` };
    } catch (e2) { return { error: `Site crawl failed: ${e.message} / ${e2.message}` }; }
  }
}
const dupBy = (pages, key) => {
  const seen = {};
  pages.forEach((p) => { const v = (p[key] || "").trim(); if (v) (seen[v] ||= []).push(p.path); });
  return Object.entries(seen).filter(([, v]) => v.length > 1).slice(0, 8).map(([v, paths]) => ({ [key]: v.slice(0, 80), pages: paths.slice(0, 6) }));
};

async function gatherGbp(s, ctx, onStep) {
  if (!ctx.placesKey) return { error: "No Google Places API key configured (Company Settings → API settings) — the live GBP audit needs it." };
  const city = s.tracking?.[0]?.city?.city || "";
  const q = `${s.client.companyName || s.client.name} ${city}`.trim();
  onStep(`Auditing the Google Business Profile for "${q}"…`);
  try {
    const r = await jpost("/api/audit/profile", { query: q, placesKey: ctx.placesKey });
    if (!r.found) return { error: r.detail || `No Google listing found for "${q}".` };
    return r.place;
  } catch (e) { return { error: `GBP audit failed: ${e.message}` }; }
}

async function gatherSerp(s, ctx, keyword, onStep, count = 10) {
  const dfs = ctx.dfsFor ? ctx.dfsFor(s.client.id) : null;
  if (!dfs?.login || !dfs?.password) return { error: "DataForSEO isn't connected (Company Settings → API settings) — live SERP reads need it." };
  const kws = keyword ? [keyword] : [...new Set(s.tracking.map((t) => t.keyword))].slice(0, 3);
  if (!kws.length) return { error: "No keyword given and none tracked yet — add keywords in Website Rank Tracking or quote one in your message." };
  const location = marketOf(s);
  const out = [];
  for (const kw of kws) {
    onStep(`Reading the live Google SERP for "${kw}" (${location.split(",")[0]})…`);
    try {
      const r = await jpost("/api/serp-top", { keyword: kw, location_name: location, count, dfs: { login: dfs.login, password: dfs.password } });
      out.push({ keyword: kw, location: r.locationName, results: r.results });
    } catch (e) { out.push({ keyword: kw, error: e.message }); }
  }
  return { serps: out, ownDomain: ownDomain(s) };
}

async function gatherCompetitorPages(serpData, own, onStep) {
  const urls = [...new Set((serpData.serps || []).flatMap((x) => (x.results || [])
    .filter((r) => r.domain && r.domain !== own).slice(0, 3).map((r) => r.url)))].slice(0, 6);
  if (!urls.length) return null;
  onStep(`Reading ${urls.length} competitor pages (titles, structure)…`);
  try { const r = await jpost("/api/crawl/meta", { urls }); return r.results || r.pages || r; }
  catch (e) { return { error: `Competitor pages unreadable: ${e.message}` }; }
}

async function guideSections(q, limit = 5) {
  try { const r = await jpost("/api/seo-guide", { q, limit }); return r.sections || []; }
  catch { return []; }
}

/* ---------------- the lane ---------------- */
const PERSONA = `You are SERP Squad AI — a senior SEO consultant for a local-SEO agency. You audit and advise EXACTLY per Google Search Central's official guidance (supplied below) — never folklore, never invented ranking factors.
Hard rules:
- Reason ONLY from the LIVE DATA provided. Never invent numbers, rankings, page names or review counts. If a source failed, say what's missing and what connecting it would add.
- Cite which Google guideline motivates each finding (short paraphrase, e.g. "Google: every page needs a unique, descriptive title").
- Prioritize: content quality/people-first issues and titles/snippets first, then architecture/links, local presence, page experience, structured data.
- Format: markdown with short sections, findings as bullets with severity (🔴 critical / 🟠 important / 🟡 nice-to-have), and finish with a prioritized action plan (numbered, most impactful first).
- Be concrete: name the exact pages/keywords/fields from the data. No filler, no generic advice the data doesn't support.`;

export async function runSeoResearch(research, s, ctx, onStep) {
  const { kind } = research;
  const input = research.input || "";
  const data = {};
  const topicByKind = { site: ["audit", "technical", "titles", "architecture"], gbp: ["audit", "local"], serp: ["audit", "posts"], competitors: ["audit", "writing", "posts"], question: [] };

  if (kind === "site") data.siteCrawl = await gatherSite(s, onStep);
  if (kind === "gbp") data.businessProfile = await gatherGbp(s, ctx, onStep);
  if (kind === "serp" || kind === "competitors") {
    data.serp = await gatherSerp(s, ctx, research.keyword, onStep);
    if (kind === "competitors" && !data.serp.error) {
      data.competitorPages = await gatherCompetitorPages(data.serp, ownDomain(s), onStep);
      onStep("Reading this site's own pages for the gap comparison…");
      data.ownSite = await gatherSite(s, () => {});
      /* rank context the dashboards already track */
      data.trackedRankings = s.tracking.slice(0, 20).map((t) => ({ keyword: t.keyword, city: t.city.city, position: t.stats.cur, change30d: t.stats.d30 ?? null }));
    }
  }
  onStep("Matching Google's official guidelines…");
  const sections = await guideSections(input + " " + kind, kind === "question" ? 7 : 5);
  const guideText = sections.map((x) => `[${x.chapter} → ${x.heading}]\n${x.text}`).join("\n\n");

  const dataText = Object.keys(data).length ? clip(data, 24000) : "(no crawl needed for this question)";
  const prompt = [
    `PROJECT: ${s.project.name} (${s.client.name}) — website ${siteUrl(s) || "not set"} — market ${marketOf(s)}.`,
    `REQUEST: ${input}`,
    `LIVE DATA GATHERED (only source of facts):\n${dataText}`,
    guideText ? `GOOGLE SEO PRO GUIDES — sections matching this request (authoritative, quote from these):\n${guideText}` : "",
    `Answer the request now.`,
  ].filter(Boolean).join("\n\n");

  /* findings → an assigned, permission-gated Project-management record.
     Members named in the request get every task; otherwise round-robin. */
  let action = null;
  if (!ctx.isClient && ctx.canPlan && kind !== "question") {
    const roster = ctx.assignableFor ? ctx.assignableFor(s.project.id) : (ctx.assignableNames || []);
    const named = parseAssignees(input, roster);
    const record = buildFixRecord(kind, data, s, named.length ? named : roster);
    if (record) {
      const n = record.checklists.reduce((x, c) => x + c.tasks.length, 0);
      action = { type: "plan", label: `Create ${n} fix task${n === 1 ? "" : "s"} in Project Management${named.length ? ` (assigned to ${named.join(", ")})` : ""}`,
        projectId: s.project.id, clientId: s.client.id, record };
    }
  }

  if (ctx.aiConfig?.key) {
    onStep("Writing the analysis…");
    try {
      const text = await aiGenerate(ctx.aiConfig, { system: PERSONA + "\n\n" + seoGuideBlock(...topicByKind[kind]), prompt });
      return { text, action, data, kind };
    } catch (e) {
      return { text: `The AI provider failed (${e.message}). Here is the raw data I gathered so nothing is lost:\n\n${fallbackReport(kind, data, sections)}`, action, data, kind };
    }
  }
  /* no provider: still useful — the findings and the guideline text, honestly labeled */
  return { text: `No AI provider is connected (Company Settings → API settings), so here are the LIVE findings and the matching Google guidelines without AI analysis:\n\n${fallbackReport(kind, data, sections)}`, action, data, kind };
}

/* ---------- findings → Project-management tasks ------------------------
   Deterministic: every task comes straight from a finding in the gathered
   data (never invented), grouped into checklists by discipline, assigned
   round-robin across the chosen members, due in two weeks. The caller
   wires it into the existing "plan" action, so creating it goes through
   the exact same permission-gated pipeline as the monthly plan. */
const few = (arr, n = 3) => arr.slice(0, n).join(", ") + (arr.length > n ? ` +${arr.length - n} more` : "");

export function buildFixRecord(kind, data, s, assignees) {
  const groups = [];
  const g = (name) => { const grp = { name, tasks: [] }; groups.push(grp); return (title) => grp.tasks.push(title); };
  const iss = data.siteCrawl?.issues;
  if (iss) {
    const t1 = g("Titles & snippets (Google: unique, descriptive on every page)");
    if (iss.missingTitle?.length) t1(`Write unique <title> tags for ${iss.missingTitle.length} pages: ${few(iss.missingTitle)}`);
    if (iss.missingMetaDesc?.length) t1(`Write unique meta descriptions for ${iss.missingMetaDesc.length} pages: ${few(iss.missingMetaDesc)}`);
    if (iss.duplicateTitles?.length) t1(`Differentiate ${iss.duplicateTitles.length} duplicate title groups (e.g. "${iss.duplicateTitles[0]?.title || ""}")`);
    if (iss.duplicateDescs?.length) t1(`Differentiate ${iss.duplicateDescs.length} duplicate meta-description groups`);
    if (iss.noH1?.length) t1(`Add one clear, dominant H1 to: ${few(iss.noH1)}`);
    const t2 = g("Content quality (Google: helpful, people-first)");
    if (iss.thin?.length) t2(`Expand, merge or noindex ${iss.thin.length} thin pages: ${few(iss.thin.map((x) => x.split(" (")[0]))}`);
    const t3 = g("Architecture & internal links");
    if (iss.orphans?.length) t3(`Add contextual internal links to ${iss.orphans.length} orphan pages: ${few(iss.orphans)}`);
    if (iss.missingCanonical?.length) t3(`Add rel="canonical" to: ${few(iss.missingCanonical)}`);
    const t4 = g("Technical & page experience");
    if (iss.httpErrors?.length) t4(`Fix or remove ${iss.httpErrors.length} broken sitemap URLs: ${few(iss.httpErrors)}`);
    if (iss.slow?.length) t4(`Improve load time on: ${few(iss.slow)}`);
    if (iss.noindex?.length) t4(`Review noindex flags on: ${few(iss.noindex)} (intended?)`);
  }
  const gp = data.businessProfile;
  if (gp && !gp.error) {
    const t = g("Google Business Profile");
    if (!gp.description || gp.description.length < 200) t("Expand the GBP business description toward the 750-char limit with services + areas");
    if ((gp.photosVisible ?? 0) < 5 && !gp.photosCapped) t(`Upload fresh photos to the profile (only ${gp.photosVisible ?? 0} visible)`);
    if ((gp.reviews ?? 0) < 20) t(`Run an honest review-generation push (currently ${gp.reviews ?? 0} reviews)`);
    if (gp.rating && gp.rating < 4.5) t(`Respond to recent reviews and address complaints (rating ${gp.rating})`);
    if (!gp.hours?.length) t("Add complete opening hours to the Business Profile");
    if (!gp.website) t("Add the website link to the Business Profile");
  }
  const own = data.serp?.ownDomain;
  for (const sp of data.serp?.serps || []) {
    if (sp.error || !sp.results) continue;
    const mine = sp.results.find((r) => r.domain === own);
    const t = g("Rankings & content gaps");
    if (!mine) t(`Create/strengthen the page targeting "${sp.keyword}" — not in the top ${sp.results.length} (${sp.location})`);
    else if (mine.rank > 3) t(`Re-optimize the page ranking #${mine.rank} for "${sp.keyword}" toward the top 3`);
  }
  const flat = groups.filter((x) => x.tasks.length);
  if (!flat.length) return null;
  const now = new Date();
  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14).toISOString().slice(0, 10);
  const people = (assignees || []).filter(Boolean);
  let ti = 0;
  const mk = (title) => ({ id: "t" + Date.now() + ti++, title, createdAt: Date.now(), dueDate: due, completedAt: null,
    assignees: people.length ? [people[ti % people.length]] : [] });
  const checklists = flat.map((x, i) => ({ id: "cl" + Date.now() + i, name: x.name, tasks: x.tasks.map(mk) }));
  return {
    id: "r" + Date.now(),
    name: `SEO Fixes — ${{ site: "Website audit", gbp: "Business Profile audit", serp: "SERP check", competitors: "Competitor gap analysis" }[kind] || "Audit"} ${now.toLocaleDateString("en", { month: "short", day: "numeric" })}`,
    createdAt: Date.now(), updatedAt: Date.now(), dueDate: due, completedAt: null,
    assignees: [...new Set(checklists.flatMap((c) => c.tasks.flatMap((t) => t.assignees)))],
    checklists, comments: [],
    activity: [{ id: "pa" + Date.now(), ts: Date.now(), author: "AI Agent", text: "created these tasks from live audit findings" }],
  };
}

/* which team members did the user name? empty = distribute across everyone */
export const parseAssignees = (input, names) => {
  const q = String(input).toLowerCase();
  return (names || []).filter((n) => q.includes(n.toLowerCase()) || q.includes(n.split(" ")[0].toLowerCase()));
};

function fallbackReport(kind, data, sections) {
  const lines = [];
  const push = (label, obj) => { if (!obj) return; lines.push(`**${label}**`); lines.push(obj.error ? `⚠ ${obj.error}` : "```\n" + clip(obj, 5000) + "\n```"); };
  push("Site crawl", data.siteCrawl); push("Business Profile", data.businessProfile);
  push("Live SERP", data.serp); push("Competitor pages", data.competitorPages); push("Own site", data.ownSite);
  if (sections.length) {
    lines.push("**Matching Google guidelines:**");
    sections.slice(0, 4).forEach((x) => lines.push(`• _${x.chapter} → ${x.heading}_: ${x.text.slice(0, 300)}…`));
  }
  return lines.join("\n") || "Nothing could be gathered — check the API connections in Company Settings.";
}
