/* ================= SEO opportunity engine =================
   Everything the "Opportunity" system needs, in one module:

   - genPageQueries(projectId, url, trackedKeywords, brandName)
       deterministic per-page Search Console data (PROD: GSC Search Analytics
       API, query dimension filtered by page). Same seed everywhere, so the
       Performance Studio table and the live editor sidebar always agree.
   - pageTextParts(page) / keywordUsage(parts, kw) / relevancy(parts, q, url)
       LIVE content analysis — recomputed from the actual blocks as you edit,
       so relevancy % and usage counts react to every keystroke.
   - genKeywordSuggestions(page, queries, brand)
       placement suggestions for selected keywords (PROD: prompt an AI provider
       from Company Settings → API settings with page content + target terms).
   ============================================================ */
import { hashStr, mulberry32 } from "./rng.js";

const STOP = new Set(["a", "an", "the", "and", "or", "of", "in", "on", "for", "to", "with", "near", "me", "at", "is", "how", "what", "best", "top"]);
const tokens = (s) => (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t && !STOP.has(t));

/* ---- query intent, inferred the way a search marketer would read it ---- */
export function queryIntent(q) {
  const s = q.toLowerCase();
  if (/\b(near me|open now|directions|hours|in [a-z]+)\b/.test(s)) return "local";
  if (/\b(buy|price|cost|book|appointment|deal|coupon|cheap|affordable|emergency|same.day)\b/.test(s)) return "transactional";
  if (/\b(how|what|why|guide|tips|ideas|vs|difference|should i)\b/.test(s)) return "informational";
  if (/\b(reviews?|best|top|compare)\b/.test(s)) return "commercial";
  return "commercial";
}
export const INTENT_STYLE = {
  local: { bg: "#DCFCE7", fg: "#166534" },
  transactional: { bg: "#FEF3C7", fg: "#92400E" },
  commercial: { bg: "#DBEAFE", fg: "#1E40AF" },
  informational: { bg: "#F3E8FF", fg: "#6B21A8" },
};

/* what kind of page is this? (drives intent-alignment) */
export function pageIntent(url, parts) {
  const u = (url || "").toLowerCase();
  if (/blog|guide|tips|news|article/.test(u)) return "informational";
  if (/contact|book|appointment|quote|pricing|order/.test(u)) return "transactional";
  if (/about|team|story/.test(u)) return "commercial";
  if (u === "/" || /service|product|shop|treatment/.test(u)) return "commercial";
  const txt = (parts?.body || "").toLowerCase();
  if (/book|call us|appointment|order now/.test(txt)) return "transactional";
  return "commercial";
}
/* local intent is satisfied by any page that shows NAP-ish signals */
const INTENT_COMPAT = {
  local: ["transactional", "commercial"],
  transactional: ["transactional"],
  commercial: ["commercial", "transactional"],
  informational: ["informational"],
};

/* ---- deterministic per-page GSC queries ---- */
const MODIFIERS = {
  transactional: ["cost", "price", "book", "same day", "emergency"],
  local: ["near me", "open now"],
  commercial: ["best", "reviews", "top rated"],
  informational: ["how much is", "what is", "is it worth it"],
};
/* realistic CTR curve by position (Advanced Web Ranking-style) */
const ctrAt = (pos) =>
  pos <= 1 ? 0.28 : pos <= 2 ? 0.15 : pos <= 3 ? 0.1 : pos <= 5 ? 0.06 : pos <= 10 ? 0.028 : pos <= 20 ? 0.011 : 0.004;
/* striking distance: positions 6-25 are where content optimization pays off */
const strikeFactor = (pos) => (pos <= 3 ? 0.05 : pos <= 5 ? 0.35 : pos <= 12 ? 1 : pos <= 25 ? 0.85 : pos <= 35 ? 0.45 : 0.2);

export function genPageQueries(projectId, url, trackedKeywords = [], brandName = "") {
  const r = mulberry32(hashStr(projectId + "|gscq|" + url));
  const rng = (lo, hi) => lo + r() * (hi - lo);
  const slugWords = tokens(url.replace(/^\/(blog\/)?/, "").replace(/[-/]/g, " ")).join(" ");
  const brand = (brandName || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

  const pool = [];
  const seen = new Set();
  const add = (q) => { q = q.trim().replace(/\s+/g, " "); if (q && !seen.has(q)) { seen.add(q); pool.push(q); } };
  trackedKeywords.forEach((kw) => {
    add(kw);
    const mods = (MODIFIERS[queryIntent(kw)] || []).filter((m) => !kw.toLowerCase().includes(m));
    if (mods.length) add(`${kw} ${mods[Math.floor(r() * mods.length)]}`);
  });
  if (slugWords) { add(slugWords); add(`${slugWords} ${["near me", "cost", "best"][Math.floor(r() * 3)]}`); }
  if (brand) { add(brand); add(`${brand} reviews`); }
  ["services", "prices", "opening hours"].forEach((g) => brand && add(`${brand} ${g}`));

  const count = Math.min(pool.length, 6 + Math.floor(r() * 4));
  const queries = pool.slice(0, count).map((q, i) => {
    const position = +(2 + r() * 40).toFixed(1);
    const impressions = Math.max(15, Math.round(rng(120, 2600) * Math.pow(0.72, i)));
    const clicks = Math.max(0, Math.round(impressions * ctrAt(position) * rng(0.75, 1.25)));
    const score = Math.round(impressions * strikeFactor(position) / 10);
    return { query: q, intent: queryIntent(q), position, impressions, clicks, score };
  }).sort((a, b) => b.score - a.score);

  const top = queries[0]?.score || 0;
  const level = top >= 90 ? "high" : top >= 35 ? "medium" : "low";
  return { queries, level, top };
}
/* ---- REAL Search Console rows → the same opportunity shape genPageQueries
   produces, so badges/panels work identically on live data ---- */
export function oppFromRows(rows = []) {
  const queries = rows
    .map((r) => ({
      query: r.query, intent: queryIntent(r.query),
      position: +(+r.position || 0).toFixed(1),
      impressions: r.impressions || 0, clicks: r.clicks || 0,
      score: Math.round(((r.impressions || 0) * strikeFactor(+r.position || 100)) / 10),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 14);
  const top = queries[0]?.score || 0;
  return { queries, level: top >= 90 ? "high" : top >= 35 ? "medium" : "low", top };
}

export const OPP_STYLE = {
  high: { bg: "#DCFCE7", fg: "#166534", label: "High" },
  medium: { bg: "#FEF3C7", fg: "#92400E", label: "Medium" },
  low: { bg: "#F1F5F9", fg: "#64748B", label: "Low" },
};

/* ---- live content analysis ---- */
export function pageTextParts(page) {
  const blocks = page.content || [];
  return {
    title: page.metaTitle || "",
    meta: page.metaDesc || "",
    h1: blocks.filter((b) => b.kind === "heading" && b.level === 1).map((b) => b.text).join(" "),
    h2: blocks.filter((b) => b.kind === "heading" && b.level !== 1).map((b) => b.text).join(" "),
    body: blocks.filter((b) => b.kind === "text").map((b) => b.text).join(" "),
    alts: blocks.filter((b) => b.kind === "image").map((b) => b.alt || "").join(" "),
  };
}
export function keywordUsage(parts, kw) {
  const hay = [parts.title, parts.meta, parts.h1, parts.h2, parts.body, parts.alts].join(" ").toLowerCase();
  const needle = kw.toLowerCase().trim();
  if (!needle) return 0;
  let n = 0, i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
  return n;
}
/* 0-100: token coverage weighted by placement, capped when intent misaligns */
export function relevancy(parts, query, url) {
  const qt = [...new Set(tokens(query))];
  if (!qt.length) return 0;
  const fields = [
    [parts.title, 3], [parts.h1, 2.5], [parts.meta, 2], [parts.h2, 1.5], [parts.body, 1], [parts.alts, 0.75],
  ].map(([txt, w]) => [new Set(tokens(txt)), w]);
  const maxW = fields.reduce((s, [, w]) => s + w, 0);
  let got = 0;
  qt.forEach((t) => {
    let tw = 0;
    fields.forEach(([set, w]) => { if (set.has(t)) tw += w; });
    got += Math.min(1, tw / 4.5); // a token found in title+h1 ≈ fully covered
  });
  let pct = Math.round((got / qt.length) * 100);
  const qi = queryIntent(query), pi = pageIntent(url, parts);
  if (!(INTENT_COMPAT[qi] || []).includes(pi)) pct = Math.min(pct, 55);
  if (keywordUsage(parts, query) > 0) pct = Math.max(pct, 62); // exact phrase present = at least decent
  return Math.min(100, pct);
}

/* ---- anchor-text technique engine ----
   Encodes the linking rules a technical SEO would apply:
   - partial-match / descriptive anchors carry topical relevance without the
     over-optimization risk of exact-match (Penguin-style devaluation);
   - exact-match is reserved for the single strongest, most relevant target;
   - generic anchors ("click here", "read more") waste the link signal;
   - anchors must read naturally inside a sentence, never bolted on. */
export function craftAnchor(kw, targetTitle, seed) {
  const r = mulberry32(hashStr("anchor|" + kw + "|" + seed));
  const partials = [
    `professional ${kw}`, `${kw} options`, `our ${kw} services`, `${kw} explained`, `affordable ${kw}`,
  ];
  const anchor = partials[Math.floor(r() * partials.length)];
  return {
    anchor,
    note: "Partial-match anchor — passes topical relevance without exact-match over-optimization risk. Keep exact-match anchors for only the 1–2 strongest links sitewide, and never use generic anchors like \u201cclick here\u201d.",
  };
}

/* ---- AI placement suggestions (PROD: real provider call) ----
   Returns [{ id, kw, where, targetKind, targetId, before, after, note?, anchor?, href?, sentence? }]
   — everything the editor needs to preview, edit and apply. */
export function genKeywordSuggestions(page, selectedQueries, brandName = "", sitePages = [], currentUrl = "") {
  const parts = pageTextParts(page);
  const blocks = page.content || [];
  const out = [];
  const push = (kw, where, targetKind, targetId, before, after, extra = {}) =>
    out.push({ id: `sg${hashStr(kw + where + (targetId || ""))}`, kw, where, targetKind, targetId, before, after, ...extra });
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  selectedQueries.forEach(({ query: kw, intent }) => {
    const used = keywordUsage(parts, kw);
    // 1. meta title — the single highest-leverage placement
    if (!parts.title.toLowerCase().includes(kw.toLowerCase())) {
      const t = `${cap(kw)} | ${brandName}`.slice(0, 60);
      push(kw, "Meta title", "metaTitle", null, parts.title, t);
    }
    // 2. meta description — CTR lever for the impressions already earned
    if (!parts.meta.toLowerCase().includes(kw.toLowerCase())) {
      const d = intent === "transactional"
        ? `Looking for ${kw}? ${brandName} offers same-week availability — transparent pricing, book online in 60 seconds.`
        : `${cap(kw)} — see how ${brandName} can help. Trusted by local customers, rated 4.8/5.`;
      push(kw, "Meta description", "metaDesc", null, parts.meta, d.slice(0, 160));
    }
    // 3. H1/H2 — work the phrase into an existing heading naturally
    const h = blocks.find((b) => b.kind === "heading" && !b.text.toLowerCase().includes(kw.toLowerCase()));
    if (h) push(kw, `${h.level === 1 ? "H1" : "H2"} heading`, "block", h.id, h.text, h.level === 1 ? `${h.text} — ${cap(kw)}` : `${cap(kw)}: ${h.text}`);
    // 4. first body paragraph — early keyword mention, naturally phrased
    const t0 = blocks.find((b) => b.kind === "text" && !b.text.toLowerCase().includes(kw.toLowerCase()));
    if (t0 && used < 2) {
      const sentence = intent === "informational"
        ? ` Wondering about ${kw}? Here's what our specialists recommend.`
        : ` If you're searching for ${kw}, you're in the right place.`;
      push(kw, "Body paragraph", "block", t0.id, t0.text, t0.text + sentence);
    }
    // 5. empty image alts — accessibility + image search in one move
    const img = blocks.find((b) => b.kind === "image" && !(b.alt || "").trim());
    if (img) push(kw, "Image alt text", "alt", img.id, img.alt || "", `${cap(kw)} — ${brandName}`);
    // 6. internal link to the most related page, with a properly crafted anchor
    const kwT = new Set(tokens(kw));
    const scoredPages = sitePages
      .filter((sp) => sp.url && sp.url !== currentUrl)
      .map((sp) => {
        const pt = new Set([...tokens(sp.url.replace(/[-/]/g, " ")), ...tokens(sp.title || "")]);
        let ov = 0; kwT.forEach((t) => { if (pt.has(t)) ov++; });
        return { ...sp, ov };
      }).sort((a, b) => b.ov - a.ov);
    const target = scoredPages[0];
    const lastText = [...blocks].reverse().find((b) => b.kind === "text");
    if (target && target.ov > 0 && lastText && !(lastText.links || []).some((l) => l.href === target.url)) {
      const { anchor, note } = craftAnchor(kw, target.title, currentUrl + target.url);
      const sentence = `Learn more about ${anchor} on our ${target.title || target.url} page.`;
      push(kw, "Internal link", "link", lastText.id, "", sentence, { anchor, href: target.url, sentence, note });
    }
  });
  return out;
}

/* ---- suggestion regeneration ----
   Each "Regenerate suggestion" click first cycles through the other target
   keywords for that section, then through alternative phrasings (round > 0).
   Deterministic: same click count always yields the same text. */
export function regenSuggestion(sg, round, brandName = "") {
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const kw = sg.kw, base = sg.before || "";
  const pickv = (arr) => arr[round % arr.length];
  if (sg.targetKind === "metaTitle") {
    return { after: pickv([
      `${cap(kw)} | ${brandName}`,
      `${brandName} — ${cap(kw)} Specialists`,
      `${cap(kw)} You Can Trust | ${brandName}`,
    ]).slice(0, 60) };
  }
  if (sg.targetKind === "metaDesc") {
    return { after: pickv([
      `Looking for ${kw}? ${brandName} offers same-week availability — transparent pricing, book online in 60 seconds.`,
      `${cap(kw)} by a team rated 4.8/5. See prices, real results and same-week openings at ${brandName}.`,
      `Compare your options for ${kw} — honest advice, upfront pricing and easy online booking with ${brandName}.`,
    ]).slice(0, 160) };
  }
  if (sg.targetKind === "alt") {
    return { after: pickv([`${cap(kw)} — ${brandName}`, `${cap(kw)} at ${brandName}`, `${brandName}: ${kw} in progress`]) };
  }
  if (sg.targetKind === "link") {
    const { anchor } = craftAnchor(kw, "", sg.href + "|v" + round);
    const sentence = pickv([
      `Learn more about ${anchor} on our dedicated page.`,
      `See our full guide to ${anchor} for details and pricing.`,
      `Curious? Explore ${anchor} to see what's included.`,
    ]).replace("${anchor}", anchor);
    return { anchor, sentence, after: sentence };
  }
  // text blocks: headings get re-phrased around the original; paragraphs get a different closing sentence
  if (/heading/i.test(sg.where)) {
    return { after: pickv([`${base} — ${cap(kw)}`, `${cap(kw)}: ${base}`, `${base} for ${cap(kw)}`]) };
  }
  return { after: base + pickv([
    ` If you're searching for ${kw}, you're in the right place.`,
    ` Ask us about ${kw} — we'll walk you through options and costs.`,
    ` Many patients find us while looking for ${kw}; here's why they stay.`,
  ]) };
}
