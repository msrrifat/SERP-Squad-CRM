import React, { useMemo, useState, useEffect } from "react";
import {
  BookOpen, FileText, ImagePlus, ListTree, MessageCircleQuestion,
  Plus, RefreshCw, Replace, Sparkles, Trash2, UploadCloud, X,
} from "lucide-react";
import { Card, Labeled, Modal, Toggle, askDelete, inputCls, CharCount } from "../../ui/primitives.jsx";
import { aiGenerate, brandVoiceBlock } from "../../lib/aiwrite.jsx";
import { parseAiJson } from "../../lib/jsonrepair.js";
import { useWork } from "../../lib/worklog.jsx";
import { hashStr, mulberry32 } from "../../lib/rng.js";
import { escHtml } from "../../lib/text.jsx";

/* ================= Posts Architect =================
   Blog architecture for TOPICAL AUTHORITY + LOCAL PROXIMITY, in two
   categories that become real WordPress categories:
   - Blog:   generalized guides (pillar/cluster coverage per service)
   - Answer: one post per real question people ask about each service —
     mined from GSC queries when Google is connected, plus AI intelligence
     emulating Reddit / Quora / People-Also-Ask / AnswerThePublic sourcing.
   Content generation reads the LIVE Pages list for internal links, keeps a
   site-wide anchor-text memory so link anchors stay varied (branded, exact,
   partial, secondary, naked URL, generic), auto-inserts captioned images
   matched from the synced media library, and cross-checks every suggestion
   against existing pages/posts so old sites never get duplicates. */

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 70);
const cap = (s) => String(s).replace(/\b\w/g, (c) => c.toUpperCase());
const parseJsonLoose = (text) => parseAiJson(text);   /* repairs near-valid model JSON */

/* ---------- markdown → editor blocks (Posts tab full editor) ----------
   Markdown links stay inline in text blocks — the editor renders them as
   highlighted anchor text. */
export function mdToBlocks(md) {
  const blocks = []; let i = 0;
  const bid = () => "mb" + Date.now().toString(36) + i++;
  let list = null;
  const flushList = () => { if (list) { blocks.push(list); list = null; } };
  String(md || "").split("\n").forEach((l) => {
    const h = l.match(/^(#{1,4})\s+(.*)/);
    const img = l.match(/^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/);
    const li = l.match(/^\s*[-*]\s+(.*)/);
    if (h) { flushList(); if (h[1].length > 1) blocks.push({ id: bid(), kind: "heading", level: Math.min(5, h[1].length), text: h[2] }); return; } // H1 = the post title, not a block
    if (img) { flushList(); blocks.push({ id: bid(), kind: "image", src: img[2], alt: img[1], title: img[1], dataUrl: null }); return; }
    if (li) { if (!list) list = { id: bid(), kind: "list", style: "bullet", items: [] }; list.items.push(li[1]); return; }
    if (/^\*[^*]+\*\s*$/.test(l)) { flushList(); blocks.push({ id: bid(), kind: "text", text: l, links: [] }); return; } // image caption line
    if (l.trim()) { flushList(); blocks.push({ id: bid(), kind: "text", text: l, links: [] }); }
  });
  flushList();
  return blocks.slice(0, 80);
}

/* ---------- markdown → WordPress HTML (figure/figcaption for images) ----------
   A caption line in *italics* directly under an image becomes its figcaption. */
export function mdToWpHtml(md) {
  const lines = String(md || "").split("\n");
  const out = [];
  let list = null; // "ul" | "ol"
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const inline = (t) => escHtml(t)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, a, h) => `<a href="${h}">${a}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const img = l.match(/^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/);
    if (img) {
      /* caption: next non-empty line if it's an italic one-liner */
      let capText = "";
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      const capM = (lines[j] || "").match(/^\*([^*]+)\*\s*$/);
      if (capM) { capText = capM[1].trim(); i = j; }
      out.push(`<figure class="wp-block-image"><img src="${escHtml(img[2])}" alt="${escHtml(img[1])}" loading="lazy" style="max-width:100%;height:auto;border-radius:8px" />${capText ? `<figcaption style="font-size:.85em;color:#6b7280;margin-top:.4em">${escHtml(capText)}</figcaption>` : ""}</figure>`);
      continue;
    }
    const h = l.match(/^(#{1,4})\s+(.*)/);
    if (h) { closeList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    const li = l.match(/^\s*[-*]\s+(.*)/);
    if (li) { if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(li[1])}</li>`); continue; }
    const oli = l.match(/^\s*\d+[.)]\s+(.*)/);
    if (oli) { if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(oli[1])}</li>`); continue; }
    if (!l.trim()) { closeList(); continue; }
    closeList(); out.push(`<p>${inline(l)}</p>`);
  }
  closeList();
  return out.join("\n");
}

/* ---------- one post → WordPress (live) + Posts-tab mirror ----------
   Shared by the bulk publish modal and the per-row Publish now / Schedule
   buttons. A date of today (or none) publishes immediately; a future date
   deploys as WordPress "scheduled" and auto-publishes that day. */
async function pushArchitectedPost(p, whenISO, { live, credStr, project, setOpt }) {
  const when = new Date((whenISO || new Date().toISOString().slice(0, 10)) + "T09:00:00");
  const scheduled = when.getTime() > Date.now();
  if (live) {
    const r = await fetch("/api/wp/deploy", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(60000),
      body: JSON.stringify({ site: project.website, credential: credStr, payload: {
        kind: "post", slug: p.slug, title: p.title, metaTitle: p.content.metaTitle, metaDesc: p.content.metaDesc,
        content: mdToWpHtml(p.content.markdown.replace(/^#\s.*\n/, "")),
        /* the chosen site category wins; the tool's own Blog/Answer split is
           only the fallback for sites with no matching categories */
        categories: [p.wpCategory || (p.category === "answer" ? "Answer" : "Blog")],
        ...(scheduled ? { status: "future", date: when.toISOString() } : { status: "publish" }),
      } }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
  } else await new Promise((r) => setTimeout(r, 250));
  /* mirror into the Posts tab list (labeled demo when not live) */
  setOpt("website", (cur) => ({
    blogs: [
      { id: "pb" + Date.now(), title: p.title, slug: p.slug, metaTitle: p.content.metaTitle, metaDesc: p.content.metaDesc,
        content: mdToBlocks(p.content.markdown), categories: [p.wpCategory || (p.category === "answer" ? "Answer" : "Blog")],
        ...(scheduled ? { status: "scheduled", scheduledAt: when.getTime() } : { status: "published", publishedAt: Date.now() }),
        createdAt: Date.now(), demo: !live },
      ...(cur.blogs || []).filter((b) => b.slug !== p.slug),
    ],
  }));
  return { scheduled, when: when.getTime() };
}

/* ---------- anchor-text intelligence ----------
   Site-wide memory of which anchors + anchor TYPES were already used per
   target URL (opt.website.linkMemory). Each new post gets the LEAST-used
   type per target, so the profile stays naturally varied. */
export const ANCHOR_TYPES = ["exact", "partial", "branded", "secondary", "naked", "generic"];
const TYPE_HINT = {
  exact: (t) => `EXACT MATCH — the anchor is the target keyword itself ("${t.kw}")`,
  partial: (t) => `PARTIAL MATCH — a natural phrase containing part of "${t.kw}"`,
  branded: (t, brand) => `BRANDED — the anchor includes the brand name "${brand}"`,
  secondary: (t) => `SECONDARY KEYWORD — a closely-related variation of "${t.kw}", not the exact keyword`,
  naked: (t) => `NAKED URL — the visible anchor is the URL itself (${t.url})`,
  generic: () => `GENERIC — e.g. "learn more", "read this guide", "see details"`,
};
export function classifyAnchor(anchor, url, kw, brand) {
  const a = anchor.toLowerCase().trim(), k = (kw || "").toLowerCase(), b = (brand || "").toLowerCase();
  if (a === url.toLowerCase() || /^https?:\/\//.test(a)) return "naked";
  if (b && a.includes(b)) return "branded";
  if (k && a === k) return "exact";
  if (k && (a.includes(k) || k.split(" ").filter((w) => a.includes(w)).length >= Math.max(2, k.split(" ").length - 1))) return "partial";
  if (/learn more|read|this guide|see |details|here|full/.test(a)) return "generic";
  return "secondary";
}
export function assignAnchorTypes(targets, linkMemory = {}, brand) {
  return targets.map((t) => {
    const mem = linkMemory[t.url] || {};
    const counts = Object.fromEntries(ANCHOR_TYPES.map((ty) => [ty, mem[ty] || 0]));
    /* naked/generic are seasoning, not staples — cap their share */
    const total = ANCHOR_TYPES.reduce((n, ty) => n + counts[ty], 0);
    const order = [...ANCHOR_TYPES].sort((x, y) => counts[x] - counts[y]);
    let type = order.find((ty) => (ty !== "naked" && ty !== "generic") || counts[ty] < Math.max(1, total * 0.15)) || order[0];
    return { ...t, anchorType: type, usedAnchors: mem.anchors || [] };
  });
}
export function recordAnchors(setOpt, md, targets, brand) {
  const found = [...String(md).matchAll(/\[([^\]]+)\]\((\/[^)\s]*)\)/g)].map((m) => ({ anchor: m[1], url: m[2] }));
  if (!found.length) return;
  setOpt("website", (cur) => {
    const mem = JSON.parse(JSON.stringify(cur?.linkMemory || {}));
    found.forEach(({ anchor, url }) => {
      const t = targets.find((x) => x.url === url);
      const type = classifyAnchor(anchor, url, t?.kw || "", brand);
      mem[url] = mem[url] || {};
      mem[url][type] = (mem[url][type] || 0) + 1;
      mem[url].anchors = [...new Set([...(mem[url].anchors || []), anchor])].slice(-20);
    });
    return { linkMemory: mem };
  });
}

/* ---------- duplicate detection vs the live site ---------- */
const tokens = (s) => new Set(String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2));
const jaccard = (a, b) => { const A = tokens(a), B = tokens(b); if (!A.size || !B.size) return 0; let n = 0; A.forEach((w) => B.has(w) && n++); return n / (A.size + B.size - n); };
export function findDuplicate(item, pages = [], blogs = []) {
  const slug = item.slug || item.url?.split("/").filter(Boolean).pop() || "";
  for (const b of blogs) {
    if (b.slug && slug && (b.slug === slug || b.slug.includes(slug) || slug.includes(b.slug))) return { kind: "post", title: b.title, url: "/blog/" + b.slug, id: b.id };
    if (jaccard(item.title, b.title) >= 0.55) return { kind: "post", title: b.title, url: "/blog/" + (b.slug || ""), id: b.id };
  }
  for (const p of pages) {
    const pslug = (p.url || "").split("/").filter(Boolean).pop() || "";
    if (slug && pslug && pslug === slug) return { kind: "page", title: p.name || p.metaTitle || p.url, url: p.url, id: p.id };
    if (jaccard(item.title, p.name || p.metaTitle) >= 0.6) return { kind: "page", title: p.name || p.metaTitle || p.url, url: p.url, id: p.id };
  }
  return null;
}

/* ---------- AI prompts ---------- */
/* ---------- EDITABLE AI PROMPTS ----------
   Every prompt the architect sends is documented and editable in the "AI
   prompt docs" panel (top-right). Overrides live per project at
   opt.website.postsPrompts; anything unset falls back to these defaults.
   Templates use {{variables}} listed in the panel. */
export const DEFAULT_POSTS_PROMPTS = {
  system: `You are a senior SEO strategist who builds TOPICAL AUTHORITY maps for business blogs.
You design post architectures in exactly TWO categories:
- "blog": generalized guides that build pillar/cluster topical authority per service and product (cost guides, comparisons, processes, mistakes, checklists, seasonal and LOCAL-PROXIMITY angles that weave the service locations into topics where search behavior is local).
- "answer": one post per REAL question people ask — questions from Search Console, Reddit, Quora, People-Also-Ask and competitor FAQ pages. Titles are the question, verbatim style.
Rules:
- Spread coverage across EVERY service, product category and service location provided. No two posts targeting the same query (no cannibalization).
- Real scraped questions and competitor gaps provided in the research digest take priority over invented topics.
- Slugs: kebab-case, short, no stop words. Each post names the ONE service page it supports.
Return STRICT JSON only: {"posts":[{"category":"blog"|"answer","title":string,"slug":string,"primaryKw":string,"service":string,"serviceUrl":string,"note":string}]}`,
  batch: `Business: {{brand}} ({{website}}). Niche: {{niche}}. Primary market: {{market}}.
Service locations to localize for: {{locations}}
Services (use the EXACT serviceUrl given):
{{services}}
Products by category (comparison and pros/cons angles are seeded separately — do NOT repeat plain "X vs Y" or "X pros and cons" topics):
{{products}}

RESEARCH DIGEST (real scraped material — prefer it over invention):
{{research}}

This is batch {{batch}} of a larger architecture. Generate EXACTLY {{blogCount}} "blog" posts and {{faqCount}} "answer" posts that are NEW — the following titles already exist and must not be duplicated or closely paraphrased:
{{existing}}

Cover the topical-authority gaps first: subtopics, locations and products with the least coverage so far.`,
};
export const fillPrompt = (tpl, vars) => String(tpl || "").replace(/{{(\w+)}}/g, (_, k) => String(vars[k] ?? ""));

const SYS_POSTS_ARCHITECT = `You are a senior SEO strategist who builds TOPICAL AUTHORITY maps for business blogs.
You design post architectures in exactly TWO categories:
- "blog": generalized guides that build pillar/cluster topical authority per service (cost guides, comparisons, processes, mistakes, checklists, seasonal and LOCAL-PROXIMITY angles that weave the market's city/region into topics where search behavior is local).
- "answer": one post per REAL question people ask about each specific service — the questions asked on Reddit threads, Quora, People-Also-Ask boxes, AnswerThePublic and Google autocomplete. Titles are the question, verbatim style ("How much does X cost in CITY?", "Can you X without Y?").
Rules:
- Cover EVERY provided service with both categories. No two posts targeting the same query (no cannibalization).
- When real Search Console queries are provided, prioritize turning genuine question-style queries into "answer" posts.
- Slugs: kebab-case, short, no stop words. Each post names the ONE service page it supports.
Return STRICT JSON only: {"posts":[{"category":"blog"|"answer","title":string,"slug":string,"primaryKw":string,"service":string,"serviceUrl":string,"note":string}]}`;

const SYS_POST_WRITER = `You are an expert SEO blog writer and technical on-page SEO. Write for humans first — concrete, useful, zero filler.
Output EXACTLY this format:
---META---
Title: <meta title ≤60 chars, keyword front-loaded>
Description: <meta description ≤160 chars>
---CONTENT---
<pure markdown post>
Rules:
- One H1 (the post title). Logical ## sections; answer posts open with a direct 2-3 sentence answer to the question (featured-snippet ready) before elaborating.
- INTERNAL LINKING (critical): the LINK PLAN lists every URL to include EXACTLY ONCE as [anchor](url), each with an assigned ANCHOR TYPE you must follow precisely. Never reuse any listed previously-used anchor. Weave links into sentences naturally.
- Cite business facts from the brand block exactly; never invent details, prices you weren't given, or reviews.
- FAQ section at the end for answer posts (2-3 related questions).
- Meet the word target. Follow the brand voice block exactly.`;

/* ---------- deterministic fallback (no AI key → labeled draft) ---------- */
function draftArchitecture(services, market, niche) {
  const posts = [];
  services.forEach((sv) => {
    const s = sv.name.toLowerCase();
    const r = mulberry32(hashStr(s + market));
    const city = (market.split(",")[0] || "").trim();
    [[`${cap(s)} Cost Guide${city ? ` in ${city}` : ""}: What You'll Actually Pay`, `${s} cost ${city}`.trim()],
     [`How to Choose a ${cap(s)} Provider: ${5 + Math.floor(r() * 3)} Things to Check`, `best ${s} provider`],
    ].forEach(([title, kw]) => posts.push({ category: "blog", title, slug: slugify(title), primaryKw: kw, service: sv.name, serviceUrl: sv.url, note: "pillar/cluster guide" }));
    [[`How much does ${s} cost${city ? ` in ${city}` : ""}?`, `how much does ${s} cost`],
     [`How long does ${s} take?`, `how long does ${s} take`],
     [`Can I do ${s} myself or should I hire a pro?`, `${s} diy vs professional`],
    ].forEach(([title, kw]) => posts.push({ category: "answer", title, slug: slugify(title), primaryKw: kw, service: sv.name, serviceUrl: sv.url, note: "PAA/Reddit-style question" }));
  });
  return posts;
}

/* ---------- media matching: title+alt scored against post terms ---------- */
export function matchMedia(media = [], post, sections = [], count = 2) {
  const terms = tokens(`${post.title} ${post.primaryKw} ${post.service} ${sections.join(" ")}`);
  return media
    .filter((m) => (m.type ? m.type === "image" : true) && m.url)
    .map((m) => { const mt = tokens(`${m.name || m.title || ""} ${m.alt || ""}`); let score = 0; mt.forEach((w) => terms.has(w) && score++); return { ...m, score }; })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}
export function insertImages(md, images, brand) {
  if (!images.length) return md;
  const lines = md.split("\n");
  /* place after the 2nd and 4th H2 (or append) with a caption line under each */
  let h2Seen = 0, placed = 0;
  const out = [];
  for (const l of lines) {
    out.push(l);
    if (/^##\s/.test(l)) {
      h2Seen++;
      if ((h2Seen === 2 || h2Seen === 4) && placed < images.length) {
        const im = images[placed++];
        const alt = im.alt || im.name || im.title || brand;
        out.push("", `![${alt}](${im.url})`, `*${cap(alt)}${brand ? ` — ${brand}` : ""}*`, "");
      }
    }
  }
  while (placed < images.length) { const im = images[placed++]; const alt = im.alt || im.name || brand; out.push("", `![${alt}](${im.url})`, `*${cap(alt)}${brand ? ` — ${brand}` : ""}*`); }
  return out.join("\n");
}

/* ---------- GSC question mining ---------- */
/* QUESTIONS ONLY. The old filter had an escape hatch — any query sharing a
   word with a service name passed, so "furnace repair toronto" counted as a
   question and the box filled with plain keywords. A query now qualifies only
   by question language: it STARTS with an interrogative/auxiliary, or
   CONTAINS a strong question word as a whole word, or ends with "?". Nothing
   passes because of what it is about — only because of how it is asked. */
const GSC_Q_START = /^(how|what|why|when|where|who|whose|whom|which|can|could|should|would|will|shall|do|does|did|is|are|was|were|has|have|had|am|may|might|must)\b/i;
const GSC_Q_CONTAIN = /\b(how|what|why|when|where|which|who|should|can|vs|versus)\b/i;
export const isGscQuestion = (q) => GSC_Q_START.test(String(q).trim()) || GSC_Q_CONTAIN.test(q) || String(q).trim().endsWith("?");
async function fetchGscQuestions(google, services) {
  if (!google?.connectionId || !google?.gscSite) return null;
  try {
    const r = await fetch("/api/google/gsc/query", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(45000),
      body: JSON.stringify({ connectionId: google.connectionId, siteUrl: google.gscSite, days: 180 }) });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.queries || d.rows || []).map((row) => row.query || row.keys?.[0]).filter(Boolean)
      .filter(isGscQuestion)
      .slice(0, 80);
  } catch { return null; }
}

const CatChip = ({ cat }) => (
  <span className="rounded-full px-1.5 py-px text-[8.5px] font-bold uppercase"
    style={cat === "answer" ? { background: "#EDE9FE", color: "#5B21B6" } : { background: "#DBEAFE", color: "#1D4ED8" }}>
    {cat === "answer" ? "Answer" : "Blog"}
  </span>
);
const LiveChip = ({ live, provider }) => (
  <span className="rounded-full px-1.5 py-px text-[8.5px] font-bold uppercase"
    style={live ? { background: "#DCFCE7", color: "#166534" } : { background: "#FEF3C7", color: "#92400E" }}>
    {live ? `AI · ${provider || "live"}` : "draft"}
  </span>
);

/* ================= the tab ================= */

/* a numbered research step with a Run button and a visible results box — the
   scraped material is SHOWN before anything is generated from it */
function ScrapeBox({ n, title, accent, busy, onRun, runLabel, ready, notReady, items = [], errors = [], empty }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{n} · {title}</span>
        <button onClick={onRun} disabled={busy || !ready}
          title={!ready ? notReady : ""}
          className="rounded-lg px-3 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
          {busy ? <RefreshCw size={12} className="animate-spin" /> : runLabel}
        </button>
      </div>
      {!ready && <div className="text-[10.5px] text-amber-600">{notReady}</div>}
      {(errors || []).length > 0 && <div className="mb-1 text-[10.5px] text-amber-600">{errors.join(" · ")}</div>}
      {items.length > 0 ? (
        <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-gray-100 p-2">
          <div className="ll-mono px-1 pb-1 text-[9.5px] text-gray-400">{items.length} scraped</div>
          {items.slice(0, 150).map((it, i) => (
            <div key={i} className="flex items-center gap-2 px-1 text-[11px]">
              {it.tag && <span className="shrink-0 rounded bg-gray-100 px-1 text-[8.5px] font-bold uppercase text-gray-500">{it.tag}</span>}
              {it.url
                ? <a href={it.url} target="_blank" rel="noopener noreferrer" className="truncate text-gray-700 hover:underline">{it.text}</a>
                : <span className="truncate text-gray-700">{it.text}</span>}
            </div>
          ))}
        </div>
      ) : ready && <div className="text-[10.5px] text-gray-400">{empty}</div>}
    </div>
  );
}

/* every prompt the architect sends — readable, editable, saved per project */
function PromptDocsModal({ prompts, onSave, onClose, accent }) {
  const [draft, setDraft] = useState({ system: prompts.system, batch: prompts.batch });
  const FIELDS = [
    ["system", "System prompt — the strategist's standing rules (categories, cannibalization, JSON contract)"],
    ["batch", "Batch prompt — sent once per generation round, filled with the variables below"],
  ];
  return (
    <Modal title="AI prompt documentation" onClose={onClose} width={760}>
      <div className="space-y-4">
        <div className="rounded-lg bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-500">
          The architect runs in rounds; each round sends the <b>system prompt</b> plus the <b>batch prompt</b> with these
          variables filled in: <span className="ll-mono">{"{{brand}} {{website}} {{niche}} {{market}} {{locations}} {{services}} {{products}} {{research}} {{batch}} {{blogCount}} {{faqCount}} {{existing}}"}</span>.
          Product comparisons and pros &amp; cons are seeded deterministically before any AI call, and real scraped questions become
          FAQ posts verbatim — the prompts only fill what remains.
        </div>
        {FIELDS.map(([k, label]) => (
          <div key={k}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</span>
              <button onClick={() => setDraft((d) => ({ ...d, [k]: DEFAULT_POSTS_PROMPTS[k] }))}
                className="text-[10.5px] font-medium text-gray-400 hover:text-gray-600">Reset to default</button>
            </div>
            <textarea rows={k === "system" ? 10 : 12} value={draft[k]} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
              className={"ll-mono " + inputCls + " resize-y text-[11px] leading-relaxed"} />
          </div>
        ))}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-3.5 py-2 text-[12px] font-medium text-gray-500">Cancel</button>
          <button onClick={() => { onSave(draft); onClose(); }}
            className="rounded-lg px-4 py-2 text-[12px] font-semibold text-white" style={{ background: accent }}>Save prompts</button>
        </div>
      </div>
    </Modal>
  );
}

export function PostsArchitectTab({ opt, setOpt, accent, log, project, aiConfig = null, dfs = null }) {
  const work = useWork();
  const w = opt.website || {};
  const plan = w.postsPlan || null;
  const posts = plan?.posts || [];
  const brand = project.name.split(" — ")[0];
  const brandVoice = opt.brandVoice || {};
  const brandProps = opt.branding?.properties || null;
  const c0 = project.tracking?.[0]?.city;
  const market = c0 ? `${c0.city},${c0.region},${c0.country}` : "United States";
  const media = w.media || [];
  const livePages = w.pages || [];
  const liveBlogs = w.blogs || [];
  const google = project.google || {};
  /* research inputs & scraped material — persisted with the project (declared
     BEFORE anything derives from it: a dependency on a const declared further
     down is evaluated during render and throws in its dead zone) */
  const research = w.postsResearch || {};
  const setR = (patch) => setOpt("website", (cur) => ({ postsResearch: { ...(cur?.postsResearch || {}), ...patch } }));

  /* services: live service pages first (the real site), then the architecture map */
  const services = useMemo(() => {
    const out = [];
    livePages.forEach((p) => { if (/^\/services\//.test(p.url || "") || p.url?.split("/").filter(Boolean).length === 1 && /clean|repair|install|service|removal|remodel/.test(p.url)) out.push({ name: p.name || p.url.split("/").pop().replace(/-/g, " "), url: p.url }); });
    const walk = (nodes) => (nodes || []).forEach((n) => { if (n.type === "service") out.push({ name: n.title, url: n.url }); walk(n.children); });
    walk(w.architecture?.tree);
    const seen = new Set();
    return out.filter((s) => { const k = s.url; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12);
  }, [livePages, w.architecture]);
  /* services persist with the project and accept commas or new lines */
  const svcDraft = research.services || "";
  const setSvcDraft = (v) => setR({ services: v });
  const svcList = svcDraft.trim()
    ? svcDraft.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).map((name) => ({ name, url: services.find((s) => s.name.toLowerCase() === name.toLowerCase())?.url || "/services/" + slugify(name) }))
    : services;

  const [busy, setBusy] = useState(false);
  const [genErr, setGenErr] = useState(null);
  const [gscNote, setGscNote] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState(null);          // batched-architect status line
  const [scraping, setScraping] = useState(null);          // "gsc" | "community" | "competitors"
  const [promptDocs, setPromptDocs] = useState(false);     // AI prompt documentation panel

  const prompts = { ...DEFAULT_POSTS_PROMPTS, ...(w.postsPrompts || {}) };
  const splitList = (t) => String(t || "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  const locations = splitList(research.locations);
  const prodCats = research.products || [];               // [{ id, category, items }]
  const allProducts = prodCats.flatMap((c) => splitList(c.items).map((name) => ({ name, category: c.category })));
  /* EMPTY count fields mean AUTO: a suitable size computed from the research
     itself — how many services, product categories, locations, scraped
     questions and competitor themes there actually are — instead of a fixed
     default. A typed number is a CONTRACT: the plan delivers exactly that. */
  const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const blogsTarget = String(research.counts?.blogs ?? "").trim() === "" ? null : clampN(+research.counts.blogs || 1, 1, 100);
  const faqsTarget = String(research.counts?.faqs ?? "").trim() === "" ? null : clampN(+research.counts.faqs || 1, 1, 120);

  /* ---- the three scrape steps: each fills a visible box, never silently ---- */
  const scrapeTopics = () => [...svcList.map((x) => x.name), ...allProducts.map((x) => x.name)].slice(0, 8);
  const scrapeGsc = async () => {
    setScraping("gsc"); setGenErr(null);
    const qs = await fetchGscQuestions(google, svcList.length ? svcList : [{ name: project.name }]);
    if (qs === null) setGenErr("Search Console isn't connected for this project — connect it in Project settings → Data sources.");
    else setR({ gscQs: qs });
    setScraping(null);
  };
  const scrapeCommunity = async () => {
    setScraping("community"); setGenErr(null);
    try {
      const r = await fetch("/api/posts/community", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(120000),
        body: JSON.stringify({ topics: scrapeTopics(), dfs: dfs?.login && dfs?.password && !String(dfs.login).includes("demo@serpsquad") ? { login: dfs.login, password: dfs.password } : undefined }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || d.error || `HTTP ${r.status}`);
      setR({ community: d.faqs, communityErrors: d.errors || [] });
    } catch (e) { setGenErr("Community scrape failed: " + String(e?.message || e)); }
    setScraping(null);
  };
  const scrapeCompetitors = async () => {
    setScraping("competitors"); setGenErr(null);
    try {
      const domains = splitList(research.competitors).slice(0, 5);
      if (!domains.length) throw new Error("add up to 5 competitor domains first");
      const r = await fetch("/api/posts/competitors", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(120000),
        body: JSON.stringify({ domains }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || d.error || `HTTP ${r.status}`);
      setR({ compTopics: d.topics, compErrors: d.errors || {}, compPerDomain: d.perDomain || {} });
    } catch (e) { setGenErr("Competitor scrape failed: " + String(e?.message || e)); }
    setScraping(null);
  };

  /* ---- WordPress categories, for the per-post dropdown + the pusher ---- */
  const [wpCats, setWpCats] = useState(null);

  const patchPost = (id, patch) => setOpt("website", (cur) => ({
    postsPlan: { ...(cur?.postsPlan || {}), posts: (cur?.postsPlan?.posts || []).map((p) => p.id === id ? { ...p, ...(typeof patch === "function" ? patch(p) : patch) } : p) },
  }));

  /* per-row instant publish / schedule (same engine as the bulk modal) */
  const credStr = typeof w.credential === "string" ? w.credential : (w.credential?.value || "");
  const canLive = w.platform === "wordpress" && /:/.test(credStr);
  useEffect(() => {
    if (!canLive) { setWpCats(null); return; }
    let alive = true;
    fetch("/api/wp/categories", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(45000),
      body: JSON.stringify({ site: project.website, credential: credStr }) })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => { if (alive) setWpCats(ok ? j.categories : null); })
      .catch(() => { if (alive) setWpCats(null); });
    return () => { alive = false; };
  }, [canLive, project.website, credStr]);
  const [rowBusy, setRowBusy] = useState(null);   // post id being pushed
  const [rowErr, setRowErr] = useState(null);     // { id, msg }
  const [schedFor, setSchedFor] = useState(null); // { id, date } — open date picker
  const publishRow = async (p, whenISO) => {
    setRowBusy(p.id); setRowErr(null);
    try {
      const res = await pushArchitectedPost(p, whenISO, { live: canLive, credStr, project, setOpt });
      patchPost(p.id, res.scheduled ? { status: "scheduled", scheduledAt: res.when } : { status: "published", publishedAt: Date.now() });
      work?.("website", "postsPublished", { detail: `${p.title}${res.scheduled ? " (scheduled)" : ""}` });
      log?.(`${res.scheduled ? "Scheduled" : "Published"} post "${p.title}"${canLive ? "" : " (demo)"}`, project.website);
    } catch (e) { setRowErr({ id: p.id, msg: String(e?.message || e) }); }
    setRowBusy(null); setSchedFor(null);
  };

  /* shared shape guard for AI-returned posts */
  const normalizePosts = (raw) => (Array.isArray(raw) ? raw : []).map((p) => ({
    category: p.category === "answer" ? "answer" : "blog",
    title: String(p.title || "").slice(0, 140), slug: slugify(p.slug || p.title),
    primaryKw: String(p.primaryKw || "").slice(0, 80), service: String(p.service || ""),
    serviceUrl: svcList.find((s) => s.url === p.serviceUrl)?.url || svcList.find((s) => s.name.toLowerCase() === String(p.service).toLowerCase())?.url || svcList[0]?.url || "",
    note: String(p.note || ""),
  })).filter((p) => p.title);

  /* ---------- BATCHED ARCHITECT — many small AI calls, no ceiling ----------
     One giant call was the token-limit failure: every service, question and
     instruction stuffed into a single 6000-token request, which overflowed as
     soon as the inputs grew. The architecture is now built in ROUNDS of ~12
     posts per category, each round seeing only a digest of the research and a
     compressed list of what already exists, until the requested counts are
     met. More keywords now means more rounds, never an error. */
  const digestResearch = () => {
    const parts = [];
    if (research.gscQs?.length) parts.push("REAL Search Console queries (turn genuine questions into answers):\n" + research.gscQs.slice(0, 20).map((q) => "- " + q).join("\n"));
    if (research.community?.length) parts.push("Questions scraped from Reddit/Quora:\n" + research.community.slice(0, 20).map((f) => `- ${f.q} (${f.source})`).join("\n"));
    if (research.compTopics?.length) {
      const common = research.compTopics.filter((t) => t.common).slice(0, 15);
      const gaps = research.compTopics.filter((t) => !t.common).slice(0, 10);
      if (common.length) parts.push("Topics MULTIPLE competitors cover (the market's proven themes):\n" + common.map((t) => "- " + t.title).join("\n"));
      if (gaps.length) parts.push("Topics only ONE competitor covers (gaps to take):\n" + gaps.map((t) => `- ${t.title} (${t.domain})`).join("\n"));
    }
    return parts.join("\n\n") || "(no scraped research — invent from the services, products and locations)";
  };
  const svcFor = (text) => {
    const tk = tokens(text);
    let best = svcList[0], score = -1;
    svcList.forEach((sv) => { let n = 0; tokens(sv.name).forEach((x) => tk.has(x) && n++); if (n > score) { score = n; best = sv; } });
    return best || { name: "", url: "" };
  };
  /* the MUST-HAVE product topics, generated deterministically so they exist
     regardless of what the model does: comparisons among products of the SAME
     category, and pros & cons for every product */
  const productSeeds = () => {
    const seeds = [];
    for (const cat of prodCats) {
      const items = splitList(cat.items);
      const svc = svcFor(cat.category + " " + items.join(" "));
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length && seeds.length < 200; j++) {
          seeds.push({ category: "blog", title: `${items[i]} vs ${items[j]}: which ${cat.category.toLowerCase()} is right for you?`,
            slug: slugify(`${items[i]} vs ${items[j]}`), primaryKw: `${items[i]} vs ${items[j]}`,
            service: svc.name, serviceUrl: svc.url, note: `product comparison · ${cat.category}` });
        }
      }
      if (items.length >= 3) seeds.push({ category: "blog", title: `Best ${cat.category.toLowerCase()} compared: ${items.slice(0, 4).join(", ")}${items.length > 4 ? " and more" : ""}`,
        slug: slugify(`best ${cat.category}`), primaryKw: `best ${cat.category.toLowerCase()}`, service: svc.name, serviceUrl: svc.url, note: `category roundup · ${cat.category}` });
      for (const it of items) seeds.push({ category: "blog", title: `${it} review: pros and cons`,
        slug: slugify(`${it} pros and cons`), primaryKw: `${it} pros and cons`, service: svc.name, serviceUrl: svc.url, note: `pros & cons · ${cat.category}` });
    }
    return seeds;
  };
  /* real scraped questions become answer posts VERBATIM first — a question a
     human actually asked beats anything invented */
  const questionSeeds = (cap) => {
    const pool = [...(research.gscQs || []).map((q) => ({ q, note: "Search Console query" })),
                  ...(research.community || []).map((f) => ({ q: f.q, note: `asked on ${f.source}` }))];
    const seen = new Set(); const out = [];
    for (const { q, note } of pool) {
      const k = q.toLowerCase().trim(); if (seen.has(k)) continue; seen.add(k);
      const svc = svcFor(q);
      out.push({ category: "answer", title: q.length > 8 ? q[0].toUpperCase() + q.slice(1) : q, slug: slugify(q),
        primaryKw: q.toLowerCase().slice(0, 80), service: svc.name, serviceUrl: svc.url, note });
      if (out.length >= cap) break;
    }
    return out;
  };

  const architect = async () => {
    if (!svcList.length && !allProducts.length) { setGenErr("Add services (or products) first — the architecture needs something to cover."); return; }
    setBusy(true); setGenErr(null); setGscNote(null);
    const existingTitles = [...liveBlogs.map((b) => b.title)];
    const isNew = (title, list) => !list.some((t) => jaccard(t, title) >= 0.6);
    let planned = [];
    const exactSeen = new Set(existingTitles.map((t) => t.toLowerCase().trim()));
    const add = (p, seed = false) => {
      if (!p.title) return false;
      const k = p.title.toLowerCase().trim();
      if (exactSeen.has(k)) return false;
      if (!seed && !isNew(p.title, [...existingTitles, ...planned.map((x) => x.title)])) return false;
      exactSeen.add(k); planned.push(p); return true;
    };
    const nBlogs = () => planned.filter((p) => p.category === "blog").length;
    const nFaqs = () => planned.filter((p) => p.category === "answer").length;

    const seeds = productSeeds();
    const qPool = (research.gscQs || []).length + (research.community || []).length;
    const commonThemes = (research.compTopics || []).filter((t) => t.common).length;
    const gapThemes = (research.compTopics || []).filter((t) => !t.common).length;
    /* AUTO sizing: the plan grows with the research it is built from */
    const targetBlogs = blogsTarget ?? clampN(seeds.length + svcList.length * 2 + prodCats.length + locations.length + Math.round(commonThemes / 2) + Math.round(gapThemes / 4), 10, 45);
    const targetFaqs = faqsTarget ?? clampN(Math.round(qPool * 0.7) + svcList.length * 3, 12, 70);

    seeds.forEach((p) => nBlogs() < targetBlogs && add(p, true));
    questionSeeds(Math.min(targetFaqs, Math.ceil(targetFaqs * 0.6))).forEach((p) => nFaqs() < targetFaqs && add(p, true));

    let live = false, round = 0, dry = 0, lastRejected = [];
    try {
      /* STRICT loop: runs until BOTH targets are met. A round whose output is
         entirely duplicates does not end the run — the next round is told
         which titles were rejected and ordered onto different angles; only
         two consecutive dry rounds give up. */
      while ((nBlogs() < targetBlogs || nFaqs() < targetFaqs) && round < 16 && dry < 2) {
        round++;
        const needB = Math.min(12, targetBlogs - nBlogs());
        const needF = Math.min(12, targetFaqs - nFaqs());
        setProgress(`Batch ${round} — ${nBlogs()}/${targetBlogs} blogs · ${nFaqs()}/${targetFaqs} FAQs`);
        const existing = [...existingTitles, ...planned.map((p) => p.title)];
        const shown = existing.slice(0, 90);
        const text = await aiGenerate(aiConfig, {
          system: prompts.system, json: true, maxTokens: 4000,
          prompt: fillPrompt(prompts.batch, {
            brand, website: project.website, niche: w.architecture?.niche || project.name, market,
            locations: locations.join(", ") || market,
            services: svcList.map((sv) => `- ${sv.name} → ${sv.url}`).join("\n") || "(none — cover the products)",
            products: prodCats.map((c) => `- ${c.category}: ${c.items}`).join("\n") || "(none)",
            research: digestResearch(), batch: round,
            blogCount: Math.max(0, needB), faqCount: Math.max(0, needF),
            existing: shown.map((t) => "- " + t).join("\n") + (existing.length > shown.length ? `\n…and ${existing.length - shown.length} more` : "")
              + (lastRejected.length ? `\n\nREJECTED last round as too similar to existing topics — do NOT resubmit these angles, find genuinely different subtopics, audiences, seasons, locations or formats:\n${lastRejected.slice(0, 12).map((t) => "- " + t).join("\n")}` : ""),
          }),
        });
        const fresh = normalizePosts(parseJsonLoose(text).posts);
        let added = 0; lastRejected = [];
        fresh.forEach((p) => {
          if (p.category === "blog" && nBlogs() >= targetBlogs) return;
          if (p.category === "answer" && nFaqs() >= targetFaqs) return;
          if (add(p)) added++; else lastRejected.push(p.title);
        });
        live = true;
        dry = added === 0 ? dry + 1 : 0;
      }
    } catch (e) {
      if (e.code === 503 && !planned.length) { setGenErr("Connect an AI provider (Company Settings → API settings) — the seeds need AI to grow into a full plan."); setBusy(false); setProgress(null); return; }
      if (!planned.length) { setGenErr("AI provider error: " + (e?.message || e)); setBusy(false); setProgress(null); return; }
      setGenErr(`AI stopped after ${planned.length} topics (${e?.message || e}) — the plan below is what was completed.`);
    }
    /* a typed number is exact: trim any overshoot, and say so if the model
       could not reach it rather than pretending the count was met */
    const finalBlogs = planned.filter((p) => p.category === "blog").slice(0, targetBlogs);
    const finalFaqs = planned.filter((p) => p.category === "answer").slice(0, targetFaqs);
    planned = [...finalBlogs, ...finalFaqs];
    if (live && (finalBlogs.length < targetBlogs || finalFaqs.length < targetFaqs)) {
      setGenErr(`Delivered ${finalBlogs.length}/${targetBlogs} blogs and ${finalFaqs.length}/${targetFaqs} FAQs — after ${round} batches the model kept returning near-duplicates. Add research (products, competitors, locations) or run again to top up.`);
    }
    const withDup = planned.map((p, i) => ({
      id: "pa" + Date.now().toString(36) + i, ...p, status: "planned", content: null,
      dup: findDuplicate(p, [], liveBlogs),
    }));
    setOpt("website", (cur) => ({ postsPlan: { generatedAt: Date.now(), live, provider: aiConfig?.provider, posts: withDup } }));
    const dups = withDup.filter((p) => p.dup).length;
    work?.("website", "postsArchitected", { detail: `${withDup.length} posts in ${round} AI batch${round === 1 ? "" : "es"}${dups ? `, ${dups} possible duplicates` : ""}` });
    log?.(`Architected ${finalBlogs.length} blogs + ${finalFaqs.length} FAQs${live ? ` (AI · ${round} batches)` : " (seeds only)"}${dups ? ` — ${dups} duplicate warnings` : ""}`, project.name);
    setBusy(false); setProgress(null);
  };

  /* ---- extend the plan: more guides / more questions, one category at a
     time — the AI sees every existing title so nothing repeats ---- */
  const [moreBusy, setMoreBusy] = useState(null); // "blog" | "answer"
  const architectMore = async (cat) => {
    if ((!svcList.length && !allProducts.length) || busy || moreBusy) return;
    setMoreBusy(cat); setGenErr(null);
    const TARGET = 20;                    // "generate more" means at least twenty
    const baseTitles = [...posts.filter((p) => p.status !== "removed").map((p) => p.title), ...liveBlogs.map((b) => b.title)];
    const fresh = [];
    const isNew = (title) => ![...baseTitles, ...fresh.map((f) => f.title)].some((t) => jaccard(t, title) >= 0.6);
    let round = 0, dry = 0, lastRejected = [];
    try {
      while (fresh.length < TARGET && round < 6 && dry < 2) {
        round++;
        const need = Math.min(12, TARGET - fresh.length);
        const existing = [...baseTitles, ...fresh.map((f) => f.title)];
        const shown = existing.slice(0, 90);
        const text = await aiGenerate(aiConfig, {
          system: prompts.system, json: true, maxTokens: 4000,
          prompt: fillPrompt(prompts.batch, {
            brand, website: project.website, niche: w.architecture?.niche || project.name, market,
            locations: locations.join(", ") || market,
            services: svcList.map((sv) => `- ${sv.name} → ${sv.url}`).join("\n") || "(none — cover the products)",
            products: prodCats.map((c) => `- ${c.category}: ${c.items}`).join("\n") || "(none)",
            research: digestResearch(), batch: round,
            blogCount: cat === "blog" ? need : 0, faqCount: cat === "answer" ? need : 0,
            existing: shown.map((t) => "- " + t).join("\n") + (existing.length > shown.length ? `\n…and ${existing.length - shown.length} more` : "")
              + (lastRejected.length ? `\n\nREJECTED last round as too similar — find genuinely different subtopics, audiences, seasons, locations or formats:\n${lastRejected.slice(0, 12).map((t) => "- " + t).join("\n")}` : ""),
          }),
        });
        const got = normalizePosts(parseJsonLoose(text).posts).map((p) => ({ ...p, category: cat }));
        let added = 0; lastRejected = [];
        got.forEach((p) => {
          if (fresh.length >= TARGET) return;
          if (p.title && isNew(p.title)) { fresh.push(p); added++; } else lastRejected.push(p.title);
        });
        dry = added === 0 ? dry + 1 : 0;
      }
      if (!fresh.length) throw new Error("no new topics survived the duplicate check — try again or add research");
      const withDup = fresh.map((p, i) => ({
        id: "pa" + Date.now().toString(36) + "m" + i, ...p, status: "planned", content: null,
        dup: findDuplicate(p, [], liveBlogs),
      }));
      setOpt("website", (cur) => ({ postsPlan: { ...(cur?.postsPlan || {}), posts: [...(cur?.postsPlan?.posts || []), ...withDup] } }));
      if (withDup.length < TARGET) setGenErr(`Added ${withDup.length} of ${TARGET} — after ${round} batches the model kept near-duplicating. Add research or click again to continue.`);
      work?.("website", "postsArchitected", { detail: `+${withDup.length} more ${cat} posts` });
      log?.(`Generated ${withDup.length} more ${cat === "blog" ? "blog topics" : "questions"} (${round} batches)`, project.name);
    } catch (e) {
      setGenErr(e.code === 503 ? "Connect an AI provider (API settings) to generate more topics." : "Generate more failed: " + (e?.message || e));
    }
    setMoreBusy(null);
  };

  /* ---- manual topics: type your own blog topic / question, pick the
     service it supports, and it joins the plan like any architected post ---- */
  const [manualDraft, setManualDraft] = useState({});
  const addManual = (cat) => {
    const d = manualDraft[cat] || {};
    /* every non-empty LINE is its own topic — paste ten lines, get ten posts */
    const titles = String(d.title || "").split("\n").map((t) => t.trim()).filter(Boolean);
    if (!titles.length) return;
    const svc = svcList.find((s) => s.url === d.svc) || svcList[0] || { name: "", url: "" };
    const stamp = Date.now().toString(36);
    const newPosts = titles.map((title, i) => ({
      id: "pa" + stamp + "x" + i, category: cat, title: title.slice(0, 140), slug: slugify(title),
      primaryKw: title.toLowerCase().replace(/[?!.]/g, "").slice(0, 80), service: svc.name, serviceUrl: svc.url,
      note: "added manually", status: "planned", content: null,
      dup: findDuplicate({ title, slug: slugify(title) }, [], liveBlogs),
    }));
    setOpt("website", (cur) => ({ postsPlan: { ...(cur?.postsPlan || {}), posts: [...(cur?.postsPlan?.posts || []), ...newPosts] } }));
    setManualDraft((cur) => ({ ...cur, [cat]: { ...d, title: "" } }));
    log?.(`Added ${newPosts.length} manual ${cat} topic${newPosts.length > 1 ? "s" : ""}`, project.name);
  };

  const openPost = posts.find((p) => p.id === openId);
  const activePosts = posts.filter((p) => p.status !== "removed" && !p.useExisting);
  const dupPosts = posts.filter((p) => p.dup && p.status !== "removed" && !p.useExisting && !p.dupResolved);
  const written = activePosts.filter((p) => p.content).length;

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <div className="ll-display flex items-center justify-between gap-2 text-[15px] font-semibold">
          <span className="flex items-center gap-2"><ListTree size={15} style={{ color: accent }} /> Blogs &amp; FAQs
            {plan && <LiveChip live={plan.live} provider={plan.provider} />}</span>
          {/* every prompt this tool sends, readable and editable */}
          <button onClick={() => setPromptDocs(true)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[11.5px] font-semibold text-gray-600 hover:border-gray-300">
            <BookOpen size={13} /> AI prompt docs
          </button>
        </div>
        <div className="text-[11.5px] leading-relaxed text-gray-400">
          Research first, architecture second: feed in services, products, locations and scraped real-world questions, then the
          architect builds the requested number of <b>blogs</b> and <b>FAQs</b> in batches — topical authority across every
          service, product category and location, with product comparisons and pros &amp; cons guaranteed by construction.
        </div>

        {/* 1 · services */}
        <Labeled label="1 · Services — one per line or comma-separated (auto-detected from the site when left empty)">
          <textarea rows={2} value={svcDraft} onChange={(e) => setSvcDraft(e.target.value)}
            placeholder={"furnace repair\nair conditioner installation, duct cleaning"} className={inputCls + " resize-y"} />
        </Labeled>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400">Covering:</span>
          {svcList.map((s) => <span key={s.url} className="ll-mono rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600" title={s.url}>{s.name}</span>)}
          {svcList.length === 0 && <span className="text-[11px] text-amber-600">none yet — type services above or run Website Mapping</span>}
        </div>

        {/* 2 · products, grouped in categories */}
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">2 · Products the business works with, grouped by category</div>
          <div className="mb-1.5 text-[10.5px] text-gray-400">Products in the SAME category get comparison posts against each other, and every product gets a pros &amp; cons post — guaranteed, before the AI adds anything.</div>
          <div className="space-y-2">
            {/* a GRID with sized columns, not flex + width utilities: inputCls
                carries w-full, and a w-44 added beside it is a class conflict
                Tailwind resolves by stylesheet order — the category field won
                the whole row and crushed the products box. Grid columns size
                the fields regardless of what the inputs themselves claim, and
                the row stacks on narrow windows. */}
            {prodCats.map((c) => (
              <div key={c.id} className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[minmax(140px,200px)_1fr_28px]">
                <input value={c.category} onChange={(e) => setR({ products: prodCats.map((x) => x.id === c.id ? { ...x, category: e.target.value } : x) })}
                  placeholder="Category — e.g. Heating" className={inputCls} />
                <textarea rows={2} value={c.items} onChange={(e) => setR({ products: prodCats.map((x) => x.id === c.id ? { ...x, items: e.target.value } : x) })}
                  placeholder={"Paste products — commas or new lines:\nCarrier, Trane\nLennox"} className={inputCls + " resize-y"} />
                <button onClick={() => setR({ products: prodCats.filter((x) => x.id !== c.id) })} title="Remove this category"
                  className="mt-1.5 justify-self-center rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"><X size={13} /></button>
              </div>
            ))}
            <button onClick={() => setR({ products: [...prodCats, { id: "pc" + Date.now().toString(36), category: "", items: "" }] })}
              className="rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-[11.5px] font-medium text-gray-400 hover:border-gray-400 hover:text-gray-600">
              + Add product category
            </button>
          </div>
        </div>

        {/* 3 · GSC questions */}
        <ScrapeBox n="3" title="Questions from Google Search Console" accent={accent}
          busy={scraping === "gsc"} onRun={scrapeGsc} runLabel="Scrape GSC queries"
          ready={!!(google.connectionId && google.gscSite)} notReady="Connect Search Console in Project settings → Data sources first."
          items={(research.gscQs || []).map((q) => ({ text: q }))}
          empty="Only question-style queries pass the filter (how / what / why / when / where / which / who / can / should / is / are / do / vs …) — plain keywords are left out." />

        {/* 4 · locations */}
        <Labeled label="4 · Service locations — the content localizes to these (one per line or commas)">
          <textarea rows={2} value={research.locations || ""} onChange={(e) => setR({ locations: e.target.value })}
            placeholder={"Mississauga\nBrampton, Oakville"} className={inputCls + " resize-y"} />
        </Labeled>

        {/* 5 · Reddit / Quora */}
        <ScrapeBox n="5" title="FAQs from Reddit & Quora" accent={accent}
          busy={scraping === "community"} onRun={scrapeCommunity} runLabel="Scrape Reddit & Quora"
          ready={svcList.length > 0 || allProducts.length > 0} notReady="Add services or products first — they drive the search."
          items={(research.community || []).map((f) => ({ text: f.q, tag: f.source, url: f.url }))}
          errors={research.communityErrors}
          empty="Real questions people asked about these services, products and brands." />

        {/* 6 · competitors */}
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">6 · Competitor blogs &amp; FAQs</div>
          <div className="flex gap-2">
            <textarea rows={1} value={research.competitors || ""} onChange={(e) => setR({ competitors: e.target.value })}
              placeholder="competitor1.com, competitor2.com (up to 5)" className={inputCls + " flex-1 resize-y"} />
            <button onClick={scrapeCompetitors} disabled={scraping === "competitors"}
              className="shrink-0 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-50" style={{ background: accent }}>
              {scraping === "competitors" ? <RefreshCw size={12} className="animate-spin" /> : "Scrape competitors"}
            </button>
          </div>
          {research.compTopics && (
            <div className="mt-2 max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-gray-100 p-2">
              <div className="ll-mono px-1 pb-1 text-[9.5px] text-gray-400">
                {research.compTopics.length} topics · {research.compTopics.filter((t) => t.common).length} common (2+ competitors) ·
                {" "}{Object.entries(research.compPerDomain || {}).map(([d, n]) => `${d}: ${n}`).join(" · ")}
                {Object.entries(research.compErrors || {}).map(([d, e]) => <span key={d} className="text-amber-600"> · {d}: {e}</span>)}
              </div>
              {research.compTopics.slice(0, 120).map((t, i) => (
                <div key={i} className="flex items-center gap-2 px-1 text-[11px]">
                  <span className={"shrink-0 rounded px-1 text-[8.5px] font-bold uppercase " + (t.common ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500")}>{t.common ? "common" : "gap"}</span>
                  <span className="truncate text-gray-700">{t.title}</span>
                  <span className="ll-mono shrink-0 text-[9px] text-gray-300">{t.domain}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 7 · counts, 8 · architect */}
        <div className="flex flex-wrap items-end gap-3 border-t border-gray-100 pt-3">
          <div className="w-28"><Labeled label="7 · Blogs to generate"><input value={research.counts?.blogs ?? ""} placeholder="Auto" onChange={(e) => setR({ counts: { ...(research.counts || {}), blogs: e.target.value.replace(/\D/g, "") } })} className={"ll-mono " + inputCls} /></Labeled></div>
          <div className="w-28"><Labeled label="FAQs to generate"><input value={research.counts?.faqs ?? ""} placeholder="Auto" onChange={(e) => setR({ counts: { ...(research.counts || {}), faqs: e.target.value.replace(/\D/g, "") } })} className={"ll-mono " + inputCls} /></Labeled></div>
          <button onClick={architect} disabled={busy}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
            {busy ? <><RefreshCw size={13} className="animate-spin" /> {progress || "Architecting…"}</> : <><Sparkles size={13} /> Architect Blogs &amp; FAQs</>}
          </button>
          <span className="text-[10.5px] text-gray-400">A typed number is delivered exactly. Left on Auto, the plan sizes itself from the research above — services, products, locations, scraped questions and competitor themes.</span>
        </div>
        {gscNote && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">{gscNote}</div>}
        {genErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-700">{genErr}</div>}
      </Card>

      {posts.length > 0 && (
        <div className={"grid gap-4 " + (dupPosts.length ? "lg:grid-cols-[1fr_300px]" : "")}>
          <div className="space-y-4">
            {["blog", "answer"].map((cat) => {
              const list = activePosts.filter((p) => p.category === cat);
              if (!list.length) return null;
              return (
                <Card key={cat} className="p-4">
                  <div className="ll-display mb-2 flex items-center gap-2 text-[13.5px] font-semibold">
                    {cat === "blog" ? <BookOpen size={14} style={{ color: accent }} /> : <MessageCircleQuestion size={14} style={{ color: accent }} />}
                    {cat === "blog" ? "Blog — guides & topical authority" : "Answer — real questions per service"}
                    <span className="text-[11px] font-normal text-gray-400">{list.length} posts · category "{cat === "blog" ? "Blog" : "Answer"}" on WordPress</span>
                  </div>
                  <div className="space-y-1">
                    {list.map((p) => (
                      <div key={p.id}>
                        <div className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                          <CatChip cat={p.category} />
                          <button onClick={() => setOpenId(p.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                            <span className="truncate text-[12.5px] font-medium text-gray-800">{p.title}</span>
                            {/* slug only — the site prepends the category in its permalinks */}
                            <span className="ll-mono hidden shrink-0 text-[9.5px] text-gray-400 sm:inline">/{p.slug}</span>
                            {p.dup && !p.dupResolved && <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-px text-[8.5px] font-bold uppercase text-amber-700">possible duplicate</span>}
                            {/* status: published / scheduled · date / written */}
                            {p.status === "published"
                              ? <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-px text-[8.5px] font-bold uppercase text-emerald-700">published</span>
                              : p.status === "scheduled"
                              ? <span className="ll-mono shrink-0 rounded-full bg-blue-50 px-1.5 py-px text-[8.5px] font-bold uppercase text-blue-700">scheduled · {new Date(p.scheduledAt).toISOString().slice(0, 10)}</span>
                              : p.content && <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-px text-[8.5px] font-bold uppercase text-emerald-700">written</span>}
                          </button>
                          {/* the site's REAL category for this post — scraped from the
                              connected WordPress; disabled (with the default) until a site
                              is connected. The pusher publishes into exactly this category. */}
                          <select value={p.wpCategory || ""} disabled={!wpCats}
                            title={wpCats ? "WordPress category the pusher will publish into" : "Connect WordPress in the Connector tab to load the site's categories"}
                            onChange={(e) => patchPost(p.id, { wpCategory: e.target.value || null })}
                            className="ll-mono w-28 shrink-0 rounded-lg border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] text-gray-600 disabled:opacity-40">
                            <option value="">{p.category === "answer" ? "Answer" : "Blog"} (default)</option>
                            {(wpCats || []).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                          </select>
                          {/* right-side actions once the content is written */}
                          {p.content && p.status !== "published" && (
                            schedFor?.id === p.id ? (
                              <span className="flex shrink-0 items-center gap-1">
                                <input type="date" value={schedFor.date} min={new Date().toISOString().slice(0, 10)}
                                  onChange={(e) => setSchedFor({ id: p.id, date: e.target.value })}
                                  className={"ll-mono " + inputCls + " w-auto py-0.5 text-[10.5px]"} />
                                <button onClick={() => publishRow(p, schedFor.date)} disabled={rowBusy === p.id}
                                  className="rounded-lg px-2 py-1 text-[10.5px] font-bold text-white disabled:opacity-50" style={{ background: accent }}>
                                  {rowBusy === p.id ? <RefreshCw size={11} className="animate-spin" /> : "Set"}
                                </button>
                                <button onClick={() => setSchedFor(null)} className="rounded p-1 text-gray-300 hover:text-gray-500"><X size={12} /></button>
                              </span>
                            ) : (
                              <span className="flex shrink-0 items-center gap-1">
                                <button onClick={() => publishRow(p, null)} disabled={!!rowBusy} title={canLive ? "Publish to WordPress right now" : "WordPress not connected — demo publish into the Posts tab"}
                                  className="rounded-lg px-2.5 py-1 text-[10.5px] font-bold text-white disabled:opacity-50" style={{ background: accent }}>
                                  {rowBusy === p.id ? <RefreshCw size={11} className="animate-spin" /> : p.status === "scheduled" ? "Publish now" : "Publish"}
                                </button>
                                <button onClick={() => setSchedFor({ id: p.id, date: new Date(Date.now() + 864e5).toISOString().slice(0, 10) })}
                                  disabled={!!rowBusy}
                                  className="rounded-lg border px-2.5 py-1 text-[10.5px] font-bold disabled:opacity-50" style={{ borderColor: accent + "66", color: accent }}>
                                  {p.status === "scheduled" ? "Reschedule" : "Schedule"}
                                </button>
                              </span>
                            )
                          )}
                          <button onClick={async () => { if (await askDelete(`the post "${p.title || "this post"}"`)) patchPost(p.id, { status: "removed" }); }} className="shrink-0 rounded p-1 text-gray-300 opacity-0 hover:text-red-500 group-hover:opacity-100"><Trash2 size={12} /></button>
                        </div>
                        {rowErr?.id === p.id && <div className="pl-9 text-[10px] text-red-600">{rowErr.msg}</div>}
                      </div>
                    ))}
                  </div>
                  {/* add your own topic + extend with fresh AI topics */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {/* multi-line on purpose: paste ten lines, get ten topics.
                        Enter makes a new line; the Add button (or Cmd/Ctrl+Enter)
                        commits every line as its own post. */}
                    <textarea rows={1} value={manualDraft[cat]?.title || ""}
                      onChange={(e) => setManualDraft((cur) => ({ ...cur, [cat]: { ...(cur[cat] || {}), title: e.target.value } }))}
                      onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addManual(cat); } }}
                      placeholder={cat === "blog" ? "Add blog topics — one per line, paste many at once…" : "Add questions — one per line, paste many at once…"}
                      className={"min-w-[200px] flex-1 resize-y " + inputCls} />
                    <select value={manualDraft[cat]?.svc || svcList[0]?.url || ""}
                      onChange={(e) => setManualDraft((cur) => ({ ...cur, [cat]: { ...(cur[cat] || {}), svc: e.target.value } }))}
                      title="Service page this post supports" className="ll-mono max-w-[160px] rounded-lg border border-gray-200 px-2 py-2 text-[10.5px] text-gray-600">
                      {svcList.map((s) => <option key={s.url} value={s.url}>{s.name}</option>)}
                    </select>
                    <button onClick={() => addManual(cat)} disabled={!(manualDraft[cat]?.title || "").trim()}
                      className="rounded-lg px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40" style={{ background: accent }}>
                      <Plus size={11} className="mr-0.5 inline" /> Add{(() => { const n = String(manualDraft[cat]?.title || "").split("\n").filter((t) => t.trim()).length; return n > 1 ? ` ${n} topics` : ""; })()}
                    </button>
                    <button onClick={() => architectMore(cat)} disabled={busy || !!moreBusy}
                      className="flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-[11px] font-bold disabled:opacity-40"
                      style={{ borderColor: accent + "66", color: accent }}>
                      {moreBusy === cat ? <><RefreshCw size={11} className="animate-spin" /> Generating more…</>
                        : <><Sparkles size={11} /> {cat === "blog" ? "Generate 20 more blogs" : "Generate 20 more questions"}</>}
                    </button>
                  </div>
                </Card>
              );
            })}
            <Card className="flex flex-wrap items-center gap-3 p-4">
              <button onClick={() => setPublishing(true)} disabled={!written}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-40" style={{ background: accent }}>
                <UploadCloud size={14} /> Publish written posts ({written})
              </button>
              <span className="text-[10.5px] leading-relaxed text-gray-400">
                Posts go to WordPress <b>Posts</b> under their category (Blog / Answer) on a schedule.
                Click any post above to generate its content first — {written}/{activePosts.length} written so far.
              </span>
            </Card>
          </div>

          {/* ---- duplicate cross-check panel (right side) ---- */}
          {dupPosts.length > 0 && (
            <Card className="h-fit space-y-2 p-4">
              <div className="ll-display flex items-center gap-2 text-[13px] font-semibold text-amber-700"><Replace size={13} /> Already on the site?</div>
              <div className="text-[10.5px] leading-relaxed text-gray-400">These suggestions look like existing pages/posts. Remove the suggestion, or keep the existing one (internal links will point at it instead).</div>
              {dupPosts.map((p) => (
                <div key={p.id} className="space-y-1.5 rounded-xl border border-amber-100 bg-amber-50/50 p-2.5">
                  <div className="text-[11.5px] font-semibold text-gray-800">{p.title}</div>
                  <div className="flex items-center gap-1.5 text-[10.5px] text-gray-500">
                    <span className="rounded bg-white px-1.5 py-px text-[8.5px] font-bold uppercase text-gray-500">existing {p.dup.kind}</span>
                    <span className="ll-mono truncate">{p.dup.url}</span>
                  </div>
                  <div className="truncate text-[10.5px] text-gray-500">"{p.dup.title}"</div>
                  <div className="flex gap-1.5">
                    <button onClick={() => patchPost(p.id, { status: "removed" })}
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-gray-600 hover:text-red-600">Remove suggestion</button>
                    <button onClick={() => patchPost(p.id, { useExisting: p.dup.url, dupResolved: true })}
                      className="flex-1 rounded-lg px-2 py-1 text-[10.5px] font-semibold text-white" style={{ background: accent }}>Keep existing</button>
                  </div>
                  <button onClick={() => patchPost(p.id, { dupResolved: true })} className="w-full text-center text-[9.5px] font-semibold text-gray-400 hover:text-gray-600">Not a duplicate — keep both</button>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {promptDocs && (
        <PromptDocsModal prompts={prompts} accent={accent} onClose={() => setPromptDocs(false)}
          onSave={(next) => { setOpt("website", () => ({ postsPrompts: next })); log?.("Updated Blogs & FAQs AI prompts", project.name); }} />
      )}
      {openPost && (
        <PostWriter post={openPost} opt={opt} setOpt={setOpt} accent={accent} project={project} ai={aiConfig}
          brand={brand} brandVoice={brandVoice} brandProps={brandProps} market={market} media={media}
          livePages={livePages} liveBlogs={liveBlogs} allPosts={activePosts}
          onPatch={(patch) => patchPost(openPost.id, patch)} onClose={() => setOpenId(null)} />
      )}
      {publishing && (
        <PublishPostsModal posts={activePosts.filter((p) => p.content && p.status !== "published" && p.status !== "scheduled")} opt={opt} setOpt={setOpt}
          accent={accent} project={project} log={log} onDone={(rows) => {
            rows.forEach((r) => patchPost(r.id, r.scheduled
              ? { status: "scheduled", scheduledAt: r.when }
              : { status: "published", publishedAt: Date.now() }));
          }} onClose={() => setPublishing(false)} />
      )}
    </div>
  );
}

/* ================= per-post writer ================= */
function PostWriter({ post, opt, setOpt, accent, project, ai, brand, brandVoice, brandProps, market, media, livePages, liveBlogs, allPosts, onPatch, onClose }) {
  const work = useWork();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [autoImages, setAutoImages] = useState(media.length > 0);
  const w = opt.website || {};

  /* link targets from the LIVE site: the money page first, then variety */
  const buildTargets = () => {
    const targets = [];
    const push = (url, title, kw) => { if (url && !targets.some((t) => t.url === url)) targets.push({ url, title, kw: kw || title }); };
    push(post.serviceUrl, post.service || "service page", post.service ? `${post.service.toLowerCase()} ${market.split(",")[0]}`.trim() : "");
    /* a sibling service (topical breadth) */
    const sib = livePages.find((p) => /^\/services\//.test(p.url || "") && p.url !== post.serviceUrl);
    if (sib) push(sib.url, sib.name || sib.url, (sib.name || "").toLowerCase());
    /* related posts from the plan: blog↔answer cross-link on the same service
       first (the cluster's strongest signal), then a same-category sibling */
    const postUrl = (x) => "/" + (x.category === "answer" ? "answers" : "blog") + "/" + x.slug;
    const rels = allPosts.filter((x) => x.id !== post.id && (x.content || x.status === "published"));
    const crossCat = rels.find((x) => x.service === post.service && x.category !== post.category);
    if (crossCat) push(postUrl(crossCat), crossCat.title, crossCat.primaryKw);
    const sameCat = rels.find((x) => x.service === post.service && x.category === post.category);
    if (sameCat) push(postUrl(sameCat), sameCat.title, sameCat.primaryKw);
    if (!crossCat && !sameCat) { const lb = liveBlogs.find((b) => jaccard2(b.title, post.title) > 0.15); if (lb) push("/blog/" + (lb.slug || ""), lb.title, ""); }
    const contact = livePages.find((p) => /contact/.test(p.url || ""));
    if (contact) push(contact.url, "contact page", `contact ${brand.toLowerCase()}`);
    const home = livePages.find((p) => p.url === "/");
    if (home) push("/", brand, brand.toLowerCase());
    return targets.slice(0, 6);
  };
  function jaccard2(a, b) { const A = tokens2(a), B = tokens2(b); if (!A.size || !B.size) return 0; let n = 0; A.forEach((x) => B.has(x) && n++); return n / (A.size + B.size - n); }
  function tokens2(s) { return new Set(String(s || "").toLowerCase().split(/\W+/).filter((x) => x.length > 2)); }

  const generate = async () => {
    setBusy(true); setErr(null);
    const targets = assignAnchorTypes(buildTargets(), w.linkMemory || {}, brand);
    const linkPlanText = targets.map((t) =>
      `- ${t.url} — "${t.title}" — anchor type: ${TYPE_HINT[t.anchorType](t, brand)}${t.usedAnchors.length ? ` — previously used anchors you must NOT repeat: ${t.usedAnchors.map((a) => `"${a}"`).join(", ")}` : ""}`).join("\n");
    try {
      const text = await aiGenerate(ai, {
        system: SYS_POST_WRITER, maxTokens: 6000,
        prompt: `BRAND VOICE & BUSINESS FACTS (must follow):\n${brandVoiceBlock(brandVoice, brand, brandProps)}\n\nPOST: "${post.title}" (category: ${post.category === "answer" ? "Answer — a real question people ask" : "Blog — a guide"}).\nPrimary keyword: "${post.primaryKw}". Supports service page: ${post.serviceUrl}. Market: ${market}.\nWord target: ${post.category === "answer" ? 900 : 1400}+ words.\n\nLINK PLAN (every URL exactly once, anchor types are assignments, not suggestions):\n${linkPlanText || "(no internal targets yet)"}\n\nWrite the complete post now in the required ---META---/---CONTENT--- format.`,
      });
      const metaM = text.match(/---META---([\s\S]*?)---CONTENT---/);
      const contentM = text.match(/---CONTENT---([\s\S]*)$/);
      let md = (contentM ? contentM[1] : text).trim();
      if (!/^#\s/m.test(md)) md = `# ${post.title}\n\n` + md;
      if (autoImages) {
        const secs = [...md.matchAll(/^##\s+(.*)$/gm)].map((m) => m[1]);
        md = insertImages(md, matchMedia(media, post, secs, 2), brand);
      }
      const metaTitle = (metaM?.[1].match(/Title:\s*(.+)/) || [])[1]?.trim() || post.title.slice(0, 60);
      const metaDesc = (metaM?.[1].match(/Description:\s*(.+)/) || [])[1]?.trim() || "";
      recordAnchors(setOpt, md, targets, brand);
      onPatch({ status: "written", content: { generatedAt: Date.now(), live: true, provider: ai?.provider, markdown: md, metaTitle, metaDesc, wordCount: md.split(/\s+/).length } });
      work?.("website", "postWritten", { detail: post.title });
    } catch (e) {
      if (e.code === 502) { setErr("AI provider error: " + e.message); setBusy(false); return; }
      /* labeled draft fallback */
      await new Promise((r) => setTimeout(r, 800));
      const targets2 = targets;
      let md = `# ${post.title}\n\n${post.category === "answer" ? `**Short answer:** it depends on your situation — here's exactly how to think about ${post.primaryKw}.` : `Everything you need to know about ${post.primaryKw}, from ${brand}.`}\n\n`;
      md += `## ${cap(post.primaryKw)}: The Essentials\n\nOur team at ${brand} handles ${post.service || "this"} every week${targets2[0] ? ` — see our ${anchorFor(targets2[0], brand)} for the full service` : ""}.\n\n`;
      md += `## What It Means for You\n\n- Clear, honest guidance\n- Transparent pricing\n- Local expertise in ${market.split(",")[0]}\n\n`;
      md += `## Next Steps\n\n${targets2.filter((t, i) => i > 0).map((t) => anchorFor(t, brand)).join(" · ")}\n\n`;
      if (autoImages) md = insertImages(md, matchMedia(media, post, [], 2), brand);
      recordAnchors(setOpt, md, targets2, brand);
      onPatch({ status: "written", content: { generatedAt: Date.now(), live: false, markdown: md, metaTitle: post.title.slice(0, 60), metaDesc: `${cap(post.primaryKw)} explained by ${brand}.`, wordCount: md.split(/\s+/).length } });
      work?.("website", "postWritten", { detail: post.title });
    }
    setBusy(false);
  };
  const anchorFor = (t, brand2) => {
    const a = t.anchorType === "exact" ? t.kw : t.anchorType === "branded" ? `${brand2} ${t.title}`.trim()
      : t.anchorType === "naked" ? project.website + t.url : t.anchorType === "generic" ? "learn more" : t.title.toLowerCase();
    return `[${a}](${t.url})`;
  };

  const c = post.content;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-3" onClick={onClose}>
      <div className="flex h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
          <FileText size={15} style={{ color: accent }} />
          <div className="min-w-0 flex-1">
            <div className="ll-display flex items-center gap-2 truncate text-[14px] font-semibold">{post.title} <CatChip cat={post.category} /></div>
            <div className="ll-mono text-[10.5px] text-gray-400">/{post.category === "answer" ? "answers" : "blog"}/{post.slug} · supports {post.serviceUrl} · kw "{post.primaryKw}" · <span className="text-emerald-600">✓ auto-saves</span></div>
          </div>
          <button onClick={onClose} title="Content is already saved to the plan — close and continue anytime"
            className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-[11.5px] font-semibold text-gray-600 hover:border-gray-300">Save &amp; close</button>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X size={16} /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {post.dup && !post.dupResolved && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11.5px] text-amber-800">
              <b>Possible duplicate:</b> existing {post.dup.kind} <span className="ll-mono">{post.dup.url}</span> ("{post.dup.title}"). Resolve it in the panel on the main list before publishing.
            </div>
          )}
          <Card className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled label="Post title"><input value={post.title} onChange={(e) => onPatch({ title: e.target.value })} className={inputCls} /></Labeled>
              <Labeled label="Primary keyword"><input value={post.primaryKw} onChange={(e) => onPatch({ primaryKw: e.target.value })} className={inputCls} /></Labeled>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Toggle on={autoImages} onChange={setAutoImages} label={`Auto-insert images from Media (${media.length} synced)`}
                desc="Matches library images by title + alt text to this post's topic; every image gets a caption underneath." />
            </div>
            <button onClick={generate} disabled={busy}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
              {busy ? <><RefreshCw size={13} className="animate-spin" /> Writing…</> : <><Sparkles size={13} /> {c ? "Regenerate content" : "Generate content"}</>}
            </button>
            <div className="text-[10.5px] leading-relaxed text-gray-400">
              The writer links to the live service page and related content with <b>assigned anchor types</b> (exact, partial, branded,
              secondary, naked, generic) balanced against every anchor already used across the site — no repeated anchors, no over-optimization.
            </div>
            {err && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-700">{err}</div>}
          </Card>
          {c && (
            <Card className="space-y-2.5 p-4">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                <b className="text-gray-700">Content</b> <LiveChip live={c.live} provider={c.provider} /> · {c.wordCount} words
                {(c.markdown.match(/\]\(\//g) || []).length > 0 && <span className="rounded-full bg-blue-50 px-1.5 py-px text-[8.5px] font-bold uppercase text-blue-700">{(c.markdown.match(/\]\(\//g) || []).length} internal links</span>}
                {(c.markdown.match(/^!\[/gm) || []).length > 0 && <span className="rounded-full bg-purple-50 px-1.5 py-px text-[8.5px] font-bold uppercase text-purple-700"><ImagePlus size={9} className="mr-0.5 inline" />{(c.markdown.match(/^!\[/gm) || []).length} captioned images</span>}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Labeled label={<span className="flex items-center justify-between">Meta title <CharCount value={c.metaTitle || ""} max={60} /></span>}>
                  <input value={c.metaTitle || ""} onChange={(e) => onPatch((cur) => ({ content: { ...cur.content, metaTitle: e.target.value } }))} className={inputCls} />
                </Labeled>
                <Labeled label={<span className="flex items-center justify-between">Meta description <CharCount value={c.metaDesc || ""} max={160} /></span>}>
                  <input value={c.metaDesc || ""} onChange={(e) => onPatch((cur) => ({ content: { ...cur.content, metaDesc: e.target.value } }))} className={inputCls} />
                </Labeled>
              </div>
              <textarea value={c.markdown} onChange={(e) => onPatch((cur) => ({ content: { ...cur.content, markdown: e.target.value, wordCount: e.target.value.split(/\s+/).length } }))}
                rows={16} className={"ll-mono " + inputCls + " resize-y text-[11.5px] leading-relaxed"} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= publish modal (schedule → WP posts w/ categories) ================= */
function PublishPostsModal({ posts, opt, setOpt, accent, project, log, onDone, onClose }) {
  const work = useWork();
  const w = opt.website || {};
  const credStr = typeof w.credential === "string" ? w.credential : (w.credential?.value || "");
  const canLive = w.platform === "wordpress" && /:/.test(credStr);
  const [mode, setMode] = useState(canLive ? "live" : "demo");
  const live = mode === "live" && canLive;
  const [start, setStart] = useState(new Date(Date.now() + 864e5).toISOString().slice(0, 10));
  const [every, setEvery] = useState(3);
  /* per-post dates: seeded by the drip cadence, then editable ROW BY ROW —
     a date of today (or past) publishes immediately, future = WP scheduled */
  const seedDates = (startISO, everyDays) => posts.map((_, i) =>
    new Date(new Date((startISO || new Date().toISOString().slice(0, 10)) + "T09:00:00").getTime() + i * Math.max(1, +everyDays || 3) * 864e5).toISOString().slice(0, 10));
  const [dates, setDates] = useState(() => seedDates(start, every));
  const reseed = (s, ev) => setDates(seedDates(s, ev));
  const [progress, setProgress] = useState(null);
  const [done, setDone] = useState(false);

  const publish = async () => {
    const rows = posts.map((p) => ({ title: p.title, status: "pending", note: "" }));
    setProgress([...rows]);
    const mark = (i, status, note = "") => { rows[i] = { ...rows[i], status, note }; setProgress([...rows]); };
    const doneIds = [];
    for (let i = 0; i < posts.length; i++) {
      const p = posts[i];
      mark(i, "creating");
      try {
        const res = await pushArchitectedPost(p, dates[i] || start, { live, credStr, project, setOpt });
        mark(i, "done", res.scheduled ? "scheduled " + new Date(res.when).toISOString().slice(0, 10) : (live ? "published" : "demo"));
        doneIds.push({ id: p.id, scheduled: res.scheduled, when: res.when });
      } catch (e) { mark(i, "error", String(e?.message || e)); continue; }
    }
    onDone?.(doneIds, live);
    work?.("website", "postsPublished", { detail: `${doneIds.length}/${posts.length}${live ? "" : " (demo)"}` });
    log?.(`Published ${doneIds.length} architected posts to WordPress${live ? "" : " (demo)"}`, project.website);
    setDone(true);
  };

  const st = { pending: "text-gray-300", creating: "text-blue-500", done: "text-emerald-600", error: "text-red-500" };
  return (
    <Modal title={`Publish ${posts.length} posts`} sub={`${project.website} · WordPress Posts with Blog/Answer categories`} onClose={onClose}>
      {!progress ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-100 p-3">
            <div className="text-[12px] font-semibold text-gray-700">Publishing schedule</div>
            <div className="mt-1.5 flex items-center gap-2 text-[12px] text-gray-500">
              seed: start <input type="date" value={start} onChange={(e) => { setStart(e.target.value); reseed(e.target.value, every); }} className={inputCls + " w-auto"} />
              every <input type="number" min={1} value={every} onChange={(e) => { setEvery(e.target.value); reseed(start, e.target.value); }} className={inputCls + " w-16"} /> day(s)
            </div>
            {/* per-post dates — each article pushes ON ITS OWN DATE */}
            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
              {posts.map((p, i) => (
                <div key={p.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-2 py-1 text-[11.5px]">
                  <span className="min-w-0 flex-1 truncate text-gray-700">{p.title}</span>
                  <input type="date" value={dates[i] || start} onChange={(e) => setDates((d) => d.map((x, j) => (j === i ? e.target.value : x)))}
                    className={"ll-mono " + inputCls + " w-auto py-1 text-[11px]"} />
                </div>
              ))}
            </div>
            <div className="mt-1 text-[10px] text-gray-400">Adjust any post's date individually. Today or earlier publishes immediately; future dates deploy as WordPress "scheduled" and auto-publish that day. Drip-feeding reads naturally to Google.</div>
          </div>
          {canLive && (
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 p-1">
              {[["live", `Live — publish to ${project.website}`], ["demo", "Demo run — don't touch the site"]].map(([k, l]) => (
                <button key={k} onClick={() => setMode(k)} className="flex-1 rounded-lg px-3 py-2 text-[11.5px] font-semibold"
                  style={mode === k ? { background: accent, color: "#fff" } : { color: "#6B7280" }}>{l}</button>
              ))}
            </div>
          )}
          {!live && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11.5px] text-amber-800"><b>Demo publish.</b> {canLive ? "Nothing touches the live site." : "WordPress isn't connected (Connector tab) — posts land in the Posts tab labeled demo."}</div>}
          <button onClick={publish} className="w-full rounded-xl py-3 text-[14px] font-bold text-white" style={{ background: accent }}>
            {live ? `Publish ${posts.length} posts to ${project.website}` : `Run demo publish (${posts.length} posts)`}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {progress.map((r, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] hover:bg-gray-50">
                <span className={"ll-mono w-4 shrink-0 " + st[r.status]}>{r.status === "done" ? "✓" : r.status === "error" ? "✕" : r.status === "creating" ? "…" : "·"}</span>
                <span className="min-w-0 flex-1 truncate text-gray-700">{r.title}</span>
                <span className={"shrink-0 text-[10px] " + st[r.status]}>{r.note || r.status}</span>
              </div>
            ))}
          </div>
          {done && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12px] text-emerald-800">Posts are live in the <b>Posts</b> tab{live ? " and on WordPress under their categories" : " (demo)"}.</div>}
          <button onClick={onClose} className="w-full rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-600">{done ? "Close" : "Run in background (close)"}</button>
        </div>
      )}
    </Modal>
  );
}
