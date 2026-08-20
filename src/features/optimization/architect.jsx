import React, { useState } from "react";
import {
  ChevronDown, ChevronRight, Download, FileText, Image as ImageIcon, Layers, Network, Plus, Redo2, RefreshCw, Search,
  Sparkles, Target, Trash2, TriangleAlert, Undo2, UploadCloud, Wand2, X,
} from "lucide-react";
import { downloadContentDocx } from "../../lib/docx.js";
import { Card, Labeled, Modal, askDelete, inputCls } from "../../ui/primitives.jsx";
import { aiGenerate, brandVoiceBlock } from "../../lib/aiwrite.jsx";
import { KwBankPicker } from "../tools/kwbank.jsx";
import { parseAiJson } from "../../lib/jsonrepair.js";
import { hashStr } from "../../lib/rng.js";
import { OptimizeControls, ResearchChecklist, defaultOptimizeSpec, optimizeRulesBlock } from "../../lib/optimizespec.jsx";
import { useWork } from "../../lib/worklog.jsx";
import { realDfs } from "./indexcheck.jsx";
import {
  PAGE_TYPE_META, adjustStructure, auditStructure, buildLinkPlan, countPages,
  genContentStructure, genPageContent, genSiteArchitecture, linkPlanRows,
} from "../../lib/architect.js";
import { CharCount, Toggle } from "../../ui/primitives.jsx";
import { buildDeployPlan, demoReviews, exportSiteZip, parseContentMd, scheduleDates, serializeElementor, serializeGutenberg, serializeHtml, serializeWpBody, webflowItems } from "../../lib/webdeploy.js";
import { findDuplicate } from "./postsarchitect.jsx";

/* ================= Website Mapping & Content Architect =================
   AI-FIRST: every stage calls the configured provider (Company Settings →
   API settings) through the server's /api/generate proxy with strict
   technical-SEO prompts and JSON-validated outputs. Only when no provider
   key exists (503) does a stage fall back to the local deterministic
   scaffold — always labeled "draft". Provider errors (502) are surfaced,
   never silently replaced. Competitor scans hit the real Google SERP,
   geo-targeted to the project's market. */

/* ---- AI plumbing ----
   Models emit near-valid JSON (fences, a dropped comma, a truncated array).
   parseAiJson repairs those instead of failing the whole generation. */
const parseJsonLoose = (text) => parseAiJson(text);

/* one AI call that MUST return JSON: repair what comes back, and if it still
   can't be parsed, ask the model once to re-emit it correctly (models fix
   their own syntax reliably when told what broke) before giving up */
async function aiJson(ai, opts) {
  const text = await aiGenerate(ai, opts);
  try { return parseAiJson(text); }
  catch (e) {
    const retry = await aiGenerate(ai, {
      ...opts,
      prompt: `${opts.prompt}\n\nIMPORTANT: your previous reply was NOT valid JSON (${String(e.message).slice(0, 120)}). Return the SAME content again as STRICT, complete, valid JSON only — no prose, no markdown fences, every array element comma-separated, every string closed. Keep it concise enough to finish within the token budget.`,
    });
    return parseAiJson(retry); // still bad → caller falls back to the local draft
  }
}

/* ---- technical-SEO prompts (the tool's expertise lives here) ---- */
const SYS_ARCHITECT = `You are a senior technical SEO information architect. You design site structures that rank.
Rules you always apply:
- Siloed hub-and-spoke IA: a /services hub linking to one page per service; a /locations hub with one page per city (only if locations are provided); a /blog hub with informational spokes that support the money pages.
- ONE primary search intent and ONE primary keyword per page — never two pages competing for the same query (no cannibalization).
- URLs: kebab-case, lowercase, max 3 path segments, no stop words.
- Always include: homepage, about, contact, a reviews/trust page.
- Page types must be exactly one of: home, hub, service, location, article, about, trust, contact.
Return STRICT JSON only, no commentary: {"pages":[{"title":string,"url":string,"type":string,"primaryKw":string,"children":[same shape]}]}`;

const SYS_STRUCTURE = `You are a technical SEO content strategist. You reverse-engineer what Google rewards for a query by analyzing the pages that already rank.
Method: sections covered by MOST competitors are table stakes (must cover); angles competitors miss are differentiators; entities recurring across competitor titles/descriptions define required semantic coverage. Add an E-E-A-T section and an FAQ targeting People-Also-Ask.
Return STRICT JSON only: {"sections":[{"h2":string,"note":string,"kind":"table-stakes"|"differentiator"|"secondary"|"eeat"}],"sharedEntities":[string],"differentiators":[string],"faqs":[string],"wordTarget":number,"internalLinks":[string],"schemaHints":[string]}`;

const SYS_AUDIT = `You are a ruthless SEO content auditor. Audit the given content structure for: search-intent match, E-E-A-T signals, SERP-feature opportunities (FAQ/PAA, featured snippets), semantic completeness vs the entity list, differentiation vs the SERP, and depth vs the word target.
Return STRICT JSON only: {"score":number 0-100,"summary":string,"issues":[{"sev":"high"|"med"|"low","text":string,"fix":string}]}`;

const SYS_ADJUST = `You are a technical SEO content strategist. Apply EVERY audit fix to the content structure. Keep what already works. Return the FULL adjusted structure as STRICT JSON in exactly this schema: {"sections":[{"h2":string,"note":string,"kind":"table-stakes"|"differentiator"|"secondary"|"eeat"}],"sharedEntities":[string],"differentiators":[string],"faqs":[string],"wordTarget":number,"internalLinks":[string],"schemaHints":[string]}`;

const SYS_WRITER = `You are an expert SEO content writer and on-page technical SEO. You write for humans first, search second — zero filler, every claim concrete.
Hard requirements:
- Output EXACTLY this format:
---META---
Title: <meta title, primary keyword front-loaded, ≤60 chars, brand suffixed>
Description: <meta description, ≤160 chars, primary keyword + concrete benefit + CTA>
---CONTENT---
<pure markdown page content>
---SCHEMA---
<one valid JSON-LD object matching the page type>
- Markdown: exactly one H1 (primary keyword + city if local). Use the section outline as ## headings in order; add ### subheadings where a section has distinct sub-topics. Primary keyword in the first 100 words.
- INTERNAL LINKING (critical): use the provided LINK PLAN — every listed URL must appear at least once as a markdown link [descriptive anchor](exact-url), woven into sentences naturally. Descriptive anchors only (never "click here"). Link the parent hub early, siblings/related services mid-page, cross-city pages in a service-area block, a supporting article from the FAQ, and the contact page in the closing CTA.
- Include 1-2 image suggestions as ![alt text](suggested: description) with keyword-bearing alt text.
- Weave required entities naturally; never keyword-stuff. FAQ: bold question + genuinely useful 2-4 sentence answer.
- Meet or exceed the word target. Follow the brand voice block exactly.
- The OPTIMIZATION RULES block in the prompt is a HARD CONTRACT: satisfy every rule in it (research depth, local mode, required sections, structure handling and the per-section character targets). Output that ignores any rule is a failed output.`;

/* per-section CONTENT BLOCK — what renders with/after the section's copy on
   the published page. Chosen in the structure panel; the writer shapes the
   copy around it and the deploy serializer ships the actual widget. */
export const SECTION_BLOCKS = [
  ["content", "Content only"],
  ["image", "Content + image"],
  ["cta", "CTA + enquiry form"],
  ["video", "Video embed"],
  ["map", "Map & business info"],
  ["estimator", "Price estimator tool"],
  ["reviews", "Reviews strip"],
];
const BLOCK_WRITER_HINT = {
  image: "this section MUST carry an image — keep the copy tight and split-friendly (it renders beside the photo)",
  cta: "a CTA band with an enquiry form renders right after this section — end the section's copy leading naturally into requesting a quote",
  video: "a video embed renders right after this section — write copy that sets up what the video shows",
  map: "a map + business info card renders right after this section — write copy that references visiting, finding or contacting us locally",
  estimator: "an interactive price estimator tool renders right after this section — write a short lead-in about getting an instant ballpark estimate",
  reviews: "a customer-review strip renders right after this section — reference real customer feedback in the copy",
};
/* structure regeneration/adjustment returns fresh sections — carry each
   section's chosen block (and video URL) over by matching headings, so a
   re-run never silently drops the page's block design */
export function carryBlocks(oldSections = [], newSections = []) {
  const toks = (s) => new Set(String(s || "").toLowerCase().split(/\W+/).filter((x) => x.length > 2));
  const sim = (a, b) => { const A = toks(a), B = toks(b); if (!A.size || !B.size) return 0; let n = 0; A.forEach((x) => B.has(x) && n++); return n / (A.size + B.size - n); };
  return newSections.map((s) => {
    const old = oldSections.find((o) => (o.block && o.block !== "content") && sim(o.h2, s.h2) >= 0.34);
    return old ? { ...s, block: old.block, ...(old.videoUrl ? { videoUrl: old.videoUrl } : {}) } : s;
  });
}

/* validate + normalize an AI structure payload */
function normalizeStructure(raw, fromCompetitors) {
  if (!raw || !Array.isArray(raw.sections) || !raw.sections.length) throw new Error("missing sections");
  const kinds = new Set(["table-stakes", "differentiator", "secondary", "eeat"]);
  const blocks = new Set(SECTION_BLOCKS.map(([k]) => k));
  return {
    generatedAt: Date.now(), fromCompetitors,
    sections: raw.sections.map((s) => ({ h2: String(s.h2 || "").slice(0, 120), note: String(s.note || ""), kind: kinds.has(s.kind) ? s.kind : "table-stakes",
      ...(blocks.has(s.block) && s.block !== "content" ? { block: s.block } : {}), ...(s.videoUrl ? { videoUrl: String(s.videoUrl).slice(0, 300) } : {}) })).filter((s) => s.h2),
    sharedEntities: (raw.sharedEntities || []).map(String).slice(0, 24),
    differentiators: (raw.differentiators || []).map(String).slice(0, 12),
    faqs: (raw.faqs || []).map(String).slice(0, 10),
    wordTarget: Math.min(4000, Math.max(600, +raw.wordTarget || 1200)),
    internalLinks: (raw.internalLinks || []).map(String).slice(0, 8),
    schemaHints: (raw.schemaHints || []).map(String).slice(0, 6),
  };
}

/* ---- competitor scan: REAL geo-targeted SERP, demo fallback labeled ---- */
async function scanCompetitorsApi(keyword, dfs, locationName) {
  try {
    const res = await fetch("/api/serp-top", {
      method: "POST", headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({ keyword, count: 5, location_name: locationName, dfs: realDfs(dfs) }),
    });
    if (res.ok) { const d = await res.json(); return { live: true, results: d.results }; }
    if (res.status === 502) { const e = await res.json().catch(() => ({})); const err = new Error(e.detail || "provider error"); err.code = 502; throw err; }
  } catch (e) { if (e.code === 502) throw e; /* server down / 503 → demo below */ }
  const host = keyword.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return { live: false, results: Array.from({ length: 5 }, (_, i) => ({
    rank: i + 1, title: `${keyword} — Provider ${i + 1}`, url: `https://${["best", "top", "pro", "expert", "local"][i]}${host}.com/${host}`,
    domain: `${["best", "top", "pro", "expert", "local"][i]}${host}.com`,
    description: `Leading ${keyword} provider. Services, pricing, reviews and booking for ${keyword} customers.`,
  })) };
}

/* ---- tree utilities (pure) ---- */
function walk(tree, fn) { tree.forEach((p) => { fn(p); walk(p.children || [], fn); }); }
/* URL HIERARCHY INVARIANT: every nested page lives under its parent's path —
   child keeps its own slug (last segment), the prefix is always the parent's
   URL. Root-level pages keep their full URL as-is (adopted live pages stay
   at their real address). Applied at generation time and self-heals older
   maps on load. */
const slugSeg = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
export function normalizeTreeUrls(nodes, parentUrl = null) {
  return (nodes || []).map((n) => {
    let url = n.url;
    if (parentUrl !== null) {
      const seg = (n.url || "").split("/").filter(Boolean).pop() || slugSeg(n.title) || "page";
      url = (parentUrl === "/" ? "" : parentUrl) + "/" + seg;
    }
    return { ...n, url, children: normalizeTreeUrls(n.children || [], url) };
  });
}
function updateNode(tree, id, patch) {
  return tree.map((p) => p.id === id ? { ...p, ...(typeof patch === "function" ? patch(p) : patch) } : { ...p, children: updateNode(p.children || [], id, patch) });
}
function removeNode(tree, id) {
  return tree.filter((p) => p.id !== id).map((p) => ({ ...p, children: removeNode(p.children || [], id) }));
}
const blankSeo = () => ({ primaryKw: "", secondaryKws: "", competitors: [], structure: null, audit: null, content: null });
/* map an AI architecture payload into node shape */
function nodesFromAi(pages, depth = 0) {
  if (!Array.isArray(pages) || depth > 3) return [];
  return pages.slice(0, 20).map((p, i) => ({
    id: "n" + Date.now().toString(36) + depth + i + Math.floor(Math.random() * 1e4).toString(36),
    title: String(p.title || "Untitled").slice(0, 90),
    url: /^\//.test(p.url || "") ? String(p.url).toLowerCase() : "/" + String(p.url || "page").toLowerCase(),
    type: PAGE_TYPE_META[p.type] ? p.type : "service",
    children: nodesFromAi(p.children || [], depth + 1),
    seo: { ...blankSeo(), primaryKw: String(p.primaryKw || "") },
  }));
}

const LiveChip = ({ live, provider }) => (
  <span className="rounded-full px-1.5 py-px text-[8.5px] font-bold uppercase"
    style={live ? { background: "#DCFCE7", color: "#166534" } : { background: "#FEF3C7", color: "#92400E" }}>
    {live ? `AI · ${provider || "live"}` : "draft"}
  </span>
);

/* ---- spreadsheet-style architecture rows: Page | URL | Type | Keywords |
   Content | Actions in aligned, resizable columns — a long URL can never
   swallow the page name again. Rows still drag to reorder/nest. ---- */
function PageRow({ node, depth, accent, onOpen, onAddChild, onRemove, onPublish, dnd, grid }) {
  const [open, setOpen] = useState(true);
  const meta = PAGE_TYPE_META[node.type] || { label: node.type, color: "#64748B" };
  const hasKids = (node.children || []).length > 0;
  const done = node.seo?.content ? "content" : node.seo?.structure ? "structure" : node.seo?.primaryKw ? "keywords" : null;
  const over = dnd?.over?.id === node.id ? dnd.over.zone : null;
  const seo = node.seo || {};
  const kws = [seo.primaryKw, ...String(seo.secondaryKws || "").split(",")].map((s) => s?.trim()).filter(Boolean);
  return (
    <div>
      <div draggable={!!dnd}
        onDragStart={(e) => { dnd?.start({ kind: "node", id: node.id }); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", node.id); } catch { /* older browsers */ } }}
        onDragOver={(e) => {
          if (!dnd?.dragging()) return;
          e.preventDefault(); e.dataTransfer.dropEffect = "move";
          const r = e.currentTarget.getBoundingClientRect();
          const y = e.clientY - r.top;
          dnd.setOver({ id: node.id, zone: y < r.height * 0.28 ? "before" : y > r.height * 0.72 ? "after" : "inside" });
        }}
        onDragLeave={() => { if (dnd?.over?.id === node.id) dnd.setOver(null); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dnd?.drop(node.id); }}
        className="group grid items-center border-b border-gray-50 hover:bg-gray-50"
        style={{ gridTemplateColumns: grid, cursor: dnd ? "grab" : undefined,
          boxShadow: over === "inside" ? `inset 0 0 0 2px ${accent}` : undefined,
          background: over === "inside" ? accent + "0D" : undefined,
          borderTop: over === "before" ? `2px solid ${accent}` : "2px solid transparent",
          borderBottom: over === "after" ? `2px solid ${accent}` : undefined }}>
        {/* Page */}
        <button onClick={() => onOpen(node)} className="flex min-w-0 items-center gap-1 py-1.5 pr-2 text-left" style={{ paddingLeft: 6 + depth * 16 }}>
          <span onClick={(e) => { e.stopPropagation(); setOpen(!open); }} className="shrink-0 text-gray-300" style={{ visibility: hasKids ? "visible" : "hidden" }}>
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.color }} />
          <span className="truncate text-[12.5px] font-medium text-gray-800" title={node.title}>{node.title}</span>
          {node.adoptedExisting && <span className="ml-1 shrink-0 rounded bg-emerald-50 px-1 py-px text-[7.5px] font-bold uppercase tracking-wide text-emerald-700" title="Adopted from the live site — keeps its real URL">existing page</span>}
        </button>
        {/* URL */}
        <span className="ll-mono min-w-0 truncate px-2 text-[10.5px] text-gray-400" title={node.url}>{node.url}</span>
        {/* Type */}
        <span className="px-2"><span className="rounded px-1.5 py-px text-[8.5px] font-bold uppercase" style={{ background: meta.color + "18", color: meta.color }}>{meta.label}</span></span>
        {/* Keywords */}
        <span className="flex min-w-0 items-center gap-1 px-2">
          {kws.length
            ? <><span className="truncate rounded-lg border px-1.5 py-px text-[10px] font-semibold" style={{ borderColor: accent + "44", color: accent }} title={kws.join(", ")}>{kws[0]}</span>
                {kws.length > 1 && <span className="ll-mono shrink-0 text-[9.5px] font-bold text-gray-400">+{kws.length - 1}</span>}</>
            : <span className="text-[10px] text-gray-300">—</span>}
        </span>
        {/* Content status */}
        <span className="px-2">
          {done
            ? <span className="rounded-full px-1.5 py-px text-[8.5px] font-bold uppercase" style={done === "content" ? { background: "#DCFCE7", color: "#166534" } : { background: "#FEF3C7", color: "#92400E" }}>{done}</span>
            : <span className="text-[10px] text-gray-300">—</span>}
        </span>
        {/* Actions */}
        <span className="flex items-center justify-end gap-1 py-1 pr-1.5">
          <button onClick={() => onOpen(node)} title="Research keywords, scan competitors & generate content"
            className="rounded-lg border px-2.5 py-1 text-[10.5px] font-bold" style={{ borderColor: accent + "66", color: accent, background: accent + "0A" }}>
            {node.seo?.content ? "Edit content" : "Content"}
          </button>
          <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
            <button onClick={() => onPublish(node)} title="Publish only this page to the site" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-emerald-600"><UploadCloud size={12} /></button>
            <button onClick={() => onAddChild(node)} title="Add subpage" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><Plus size={12} /></button>
            <button onClick={async () => { if (await askDelete(`the page "${node.title}" and everything under it`)) onRemove(node); }} title="Remove" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500"><Trash2 size={12} /></button>
          </span>
        </span>
      </div>
      {open && (node.children || []).map((c) => (
        <PageRow key={c.id} node={c} depth={depth + 1} accent={accent} onOpen={onOpen} onAddChild={onAddChild} onRemove={onRemove} onPublish={onPublish} dnd={dnd} grid={grid} />
      ))}
    </div>
  );
}

/* excel-style column resizer: drag the header divider to widen a column */
function ColResizer({ onDrag }) {
  return (
    <span onMouseDown={(e) => {
      e.preventDefault(); e.stopPropagation();
      const x0 = e.clientX;
      const move = (ev) => onDrag(ev.clientX - x0, false);
      const up = (ev) => { onDrag(ev.clientX - x0, true); window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
      window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    }} className="absolute -right-0.5 top-0 z-10 h-full w-1.5 cursor-col-resize rounded hover:bg-gray-300" />
  );
}

/* ---- service-page keyword box: the page's keywords as chips (primary ★ +
   secondaries), manual add, and one-click adds from matching researched
   keywords — no full bank picker on service pages ---- */
function ServiceKeywordsBox({ node, project, seo, setSeo, accent }) {
  const [draft, setDraft] = useState("");
  const cur = [seo.primaryKw, ...String(seo.secondaryKws || "").split(",")].map((s) => s?.trim()).filter(Boolean);
  const curSet = new Set(cur.map((k) => k.toLowerCase()));
  const addKw = (kw) => {
    const v = String(kw || "").trim();
    if (!v || curSet.has(v.toLowerCase())) return;
    setSeo((c) => c.primaryKw?.trim()
      ? { secondaryKws: [...new Set([...String(c.secondaryKws || "").split(",").map((s) => s.trim()).filter(Boolean), v])].join(", ") }
      : { primaryKw: v });
  };
  const removeKw = (kw) => setSeo((c) => kw === c.primaryKw
    ? { primaryKw: "" }
    : { secondaryKws: String(c.secondaryKws || "").split(",").map((s) => s.trim()).filter((s) => s && s !== kw).join(", ") });
  const titleWords = new Set(node.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const researched = (project?.keywordBank || [])
    .filter((k) => !curSet.has(k.keyword.toLowerCase()) && [...titleWords].some((w) => k.keyword.toLowerCase().includes(w)))
    .slice(0, 10);
  return (
    <div className="rounded-xl border border-dashed border-gray-200 p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-bold text-gray-700">
        <Target size={12} style={{ color: accent }} /> Page keywords
        <span className="font-normal text-gray-400">first = primary, the rest are secondaries</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {cur.map((k) => (
          <span key={k} className="flex items-center gap-1 rounded-lg border px-2 py-1 text-[10.5px] font-semibold"
            style={k === seo.primaryKw ? { borderColor: accent, color: accent, background: accent + "10" } : { borderColor: "#E5E7EB", color: "#4B5563" }}>
            {k === seo.primaryKw && "★ "}{k}
            <button onClick={() => removeKw(k)} className="opacity-50 hover:opacity-100"><X size={10} /></button>
          </span>
        ))}
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { addKw(draft); setDraft(""); } }}
          placeholder="add keyword + Enter" className="w-40 rounded-lg border border-gray-200 px-2 py-1 text-[11px] outline-none" />
      </div>
      {researched.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-gray-50 pt-2">
          <span className="text-[9.5px] font-bold uppercase tracking-wide text-gray-400">From keyword research:</span>
          {researched.map((k) => (
            <button key={k.id} onClick={() => addKw(k.keyword)}
              title={`${k.volume?.toLocaleString() ?? "?"} searches/mo · ${k.location}`}
              className="rounded-lg border px-2 py-0.5 text-[10.5px] font-semibold" style={{ borderColor: accent + "44", color: accent }}>
              + {k.keyword}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* =====================================================================
   IMAGE SELECTION — the step between "generate content" and publishing.

   The writer produces sections; this is where a human decides which of them
   carry a photo. Every section is listed with a keyword search over the
   media library (pre-seeded from that section's own heading), and three
   possible answers: pick an image, choose "no image", or leave it undecided
   — undecided keeps the engine's automatic slot behaviour, so opening this
   step is never destructive.
   ===================================================================== */
const IMG_OK = (m) => m.type === "image" || (m.mime || "").startsWith("image/") || m.demo || /\.(jpe?g|png|webp|gif|avif)$/i.test(m.url || m.src || "");
const mediaSearch = (media, q) => {
  const terms = String(q || "").toLowerCase().split(/[\s,]+/).map((t) => t.replace(/[^a-z0-9]/g, "")).filter((t) => t.length > 2);
  const imgs = (media || []).filter(IMG_OK);
  if (!terms.length) return imgs;
  return imgs
    .map((m) => ({ m, score: terms.reduce((n, t) => n + ([m.title, m.name, m.alt].join(" ").toLowerCase().includes(t) ? 1 : 0), 0) }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.m);
};

function ImageStep({ node, media, accent, primaryKw, brand, onPatch, onClose }) {
  const work = useWork();
  const sections = React.useMemo(() => {
    const md = node.seo?.content?.markdown || "";
    const rc = md ? parseContentMd(md) : null;
    return [
      { key: "hero", label: "Hero band", hint: "Used as the hero's background photo behind the headline and the enquiry form.", seed: [primaryKw, node.title].filter(Boolean).join(" ") },
      ...((rc?.sections || []).map((s, i) => ({ key: "s" + i, label: s.h2, hint: `Section ${i + 1} — sits beside the text.`, seed: s.h2 }))),
    ];
  }, [node.seo?.content?.markdown, node.title, primaryKw]);
  const picks = node.seo?.images || {};
  const setPick = (key, val) => onPatch((cur) => ({ seo: { ...(cur.seo || {}), images: { ...((cur.seo || {}).images || {}), [key]: val } } }));
  const clearPick = (key) => onPatch((cur) => {
    const next = { ...((cur.seo || {}).images || {}) };
    delete next[key];
    return { seo: { ...(cur.seo || {}), images: next } };
  });
  const [queries, setQueries] = useState({});
  const q = (s) => (queries[s.key] === undefined ? s.seed : queries[s.key]);
  const images = (media || []).filter(IMG_OK);
  const chosen = sections.filter((s) => picks[s.key] && !picks[s.key].skip).length;
  const skipped = sections.filter((s) => picks[s.key]?.skip).length;

  return (
    <Modal title="Select images for each section" onClose={onClose} wide>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2 text-[11.5px] text-gray-500">
          <ImageIcon size={13} style={{ color: accent }} />
          <b className="text-gray-700">{images.length}</b> images in the library ·
          <b className="text-emerald-600">{chosen}</b> chosen ·
          <b className="text-gray-600">{skipped}</b> set to no image ·
          <b className="text-gray-600">{sections.length - chosen - skipped}</b> undecided
          <span className="ml-auto text-[10.5px] text-gray-400">Undecided sections keep the automatic image slots — nothing is forced.</span>
        </div>
        {images.length === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
            The media library is empty — sync it first in <b>Optimization Studio → Business website → Media</b>, then come back.
          </div>
        )}
        {sections.map((s) => {
          const pick = picks[s.key];
          const matches = mediaSearch(media, q(s));
          /* a heading rarely matches filenames word-for-word — rather than an
             empty strip, an unedited search that finds nothing falls back to
             the whole library (an empty result is only shown once the user
             has typed their own keyword) */
          const typed = queries[s.key] !== undefined;
          const fellBack = !matches.length && !typed && images.length > 0;
          const shown = (fellBack ? images : matches).slice(0, 24);
          return (
            <div key={s.key} className="space-y-2 rounded-xl border border-gray-100 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="ll-mono rounded px-1.5 py-px text-[9px] font-bold uppercase" style={{ background: accent + "14", color: accent }}>{s.key === "hero" ? "hero" : s.key}</span>
                <b className="min-w-0 flex-1 truncate text-[12.5px] text-gray-800">{s.label}</b>
                <button onClick={() => (pick?.skip ? clearPick(s.key) : setPick(s.key, { skip: true }))}
                  className={"rounded-lg border px-2.5 py-1 text-[10.5px] font-semibold " + (pick?.skip ? "border-gray-800 bg-gray-800 text-white" : "border-gray-200 text-gray-500 hover:border-gray-300")}>
                  {pick?.skip ? "✓ No image" : "No image"}
                </button>
              </div>
              <div className="text-[10.5px] text-gray-400">{s.hint}</div>
              {!pick?.skip && (
                <>
                  <div className="flex items-center gap-1.5">
                    <Search size={12} className="shrink-0 text-gray-300" />
                    <input value={q(s)} onChange={(e) => setQueries((cur) => ({ ...cur, [s.key]: e.target.value }))}
                      placeholder="Search the media library by keyword…" className={inputCls + " py-1.5 text-[11.5px]"} />
                    <span className="ll-mono shrink-0 text-[10px] text-gray-400">
                      {fellBack ? `no keyword match — all ${images.length}` : `${matches.length} match${matches.length === 1 ? "" : "es"}`}
                    </span>
                  </div>
                  {shown.length === 0
                    ? <div className="py-3 text-center text-[11px] text-gray-300">No image matches “{q(s)}” — clear the box to browse everything.</div>
                    : (
                      <div className="flex gap-2 overflow-x-auto pb-1.5">
                        {shown.map((m) => {
                          const url = m.url || m.src;
                          const on = pick && !pick.skip && (pick.url === url);
                          return (
                            <button key={m.id || url} onClick={() => (on ? clearPick(s.key)
                              : setPick(s.key, { id: m.id, url, alt: m.alt || `${m.title || m.name} — ${brand}`, title: m.title || m.name, caption: pick?.caption || "" }))}
                              title={m.title || m.name}
                              className="group relative w-[112px] shrink-0 overflow-hidden rounded-lg border-2 text-left"
                              style={{ borderColor: on ? accent : "transparent" }}>
                              <img src={url} alt="" loading="lazy" className="h-[72px] w-full bg-gray-50 object-cover" />
                              <span className="block truncate px-1 py-1 text-[9.5px] text-gray-500">{m.title || m.name}</span>
                              {on && <span className="absolute right-1 top-1 rounded-full px-1 py-px text-[9px] font-bold text-white" style={{ background: accent }}>✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  {pick && !pick.skip && (
                    <div className="ll-fade grid gap-2 rounded-lg bg-gray-50 p-2 sm:grid-cols-2">
                      <Labeled label="Alt text (what the image shows)">
                        <input value={pick.alt || ""} onChange={(e) => setPick(s.key, { ...pick, alt: e.target.value })} className={inputCls + " py-1.5 text-[11.5px]"} />
                      </Labeled>
                      <Labeled label="Caption (optional, shows under the image)">
                        <input value={pick.caption || ""} onChange={(e) => setPick(s.key, { ...pick, caption: e.target.value })}
                          placeholder={s.key === "hero" ? "Captions aren't shown on the hero" : "e.g. Finished damp-proof course in Leeds"} disabled={s.key === "hero"}
                          className={inputCls + " py-1.5 text-[11.5px] disabled:bg-gray-100 disabled:text-gray-400"} />
                      </Labeled>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600">Close</button>
          <button onClick={() => { work?.("website", "imagesSelected", { detail: `${node.title} · ${chosen} image${chosen === 1 ? "" : "s"}` }); onClose(); }}
            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white" style={{ background: accent }}>
            Done — {chosen} image{chosen === 1 ? "" : "s"} selected
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---- per-page content pipeline editor ---- */
function PageEditor({ node, project, brandVoice, brandProps = null, niche, accent, dfs, ai, media = [], locationName, siteLinks = [], onPatch, onPublish, onClose }) {
  const work = useWork();
  const seo = node.seo || {};
  const [imgStep, setImgStep] = useState(false);
  /* functional through to project state — concurrent stages can't clobber each other */
  const setSeo = (patch) => onPatch((cur) => ({ seo: { ...(cur.seo || {}), ...(typeof patch === "function" ? patch(cur.seo || {}) : patch) } }));
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState(null);
  const [busy, setBusy] = useState(null);
  const [stageErr, setStageErr] = useState(null);
  const [compDraft, setCompDraft] = useState("");
  /* per-page optimization spec (research depth, local mode, tasks, lengths) —
     persisted on the node so it survives close/reopen and drives every stage */
  const spec = seo.spec || defaultOptimizeSpec(locationName.split(",")[0] || "");
  const setSpec = (s) => setSeo({ spec: s });

  const scan = async () => {
    if (!seo.primaryKw?.trim()) return;
    setScanning(true); setScanNote(null); setStageErr(null);
    try {
      const { live, results } = await scanCompetitorsApi(seo.primaryKw.trim(), dfs, locationName);
      setSeo((cur) => {
        const existing = new Set((cur.competitors || []).map((c) => c.url));
        return { competitors: [...(cur.competitors || []), ...results.filter((r) => !existing.has(r.url))] };
      });
      setScanNote(live
        ? `Live: Google's top ${results.length} for "${seo.primaryKw.trim()}" scanned from ${locationName}.`
        : `Demo competitors added — add DataForSEO credentials for live geo-targeted SERP scans (would scan from ${locationName}).`);
      work?.("website", "serpScanned", { detail: `"${seo.primaryKw.trim()}"` });
    } catch (e) { setStageErr("SERP scan failed: " + e.message); } finally { setScanning(false); }
  };

  /* AI-first stage runner: 503 → labeled local draft; 502 → surfaced error */
  const runStage = async (key, aiFn, localFn) => {
    setBusy(key); setStageErr(null);
    try {
      await aiFn();
    } catch (e) {
      if (e.code === 502) { setStageErr("AI provider error: " + e.message); setBusy(null); return; }
      if (e.name === "SyntaxError" || /sections|schema/.test(String(e.message))) { setStageErr("AI returned an unusable structure — using local draft instead. " + e.message); }
      await new Promise((r) => setTimeout(r, 900));
      localFn();
    }
    setBusy(null);
  };

  const competitorBlock = () => (seo.competitors || []).map((c, i) =>
    `${i + 1}. ${c.title}\n   URL: ${c.url}\n   Snippet: ${c.description || "(none)"}`).join("\n");

  const genStructure = () => runStage("structure",
    async () => {
      const parsedStruct = await aiJson(ai, {
        system: SYS_STRUCTURE, json: true, maxTokens: 6000,
        prompt: `Page: "${node.title}" (${node.url}) — type: ${node.type}.\nNiche: ${niche}. Market: ${locationName}.\nPrimary keyword: "${seo.primaryKw}". Secondary keywords: ${seo.secondaryKws || "(none)"}.\n\n${optimizeRulesBlock(spec)}\n\nTop-ranking competitors for the primary keyword:\n${competitorBlock()}\n\nSITE MAP (use EXACT urls for internalLinks):\n${siteLinks.map((l) => `${l.url} — ${l.title} (${l.type})`).join("\n")}\n\nBuild the content structure that beats this SERP and satisfies every optimization rule above (the structure must contain the sections those rules require).`,
      });
      const st = normalizeStructure(parsedStruct, (seo.competitors || []).length);
      st.live = true; st.provider = ai.provider;
      st.sections = carryBlocks(seo.structure?.sections, st.sections);
      setSeo({ structure: st, audit: null, content: null });
    },
    () => setSeo({ structure: { ...genContentStructure(node, seo.competitors || [], niche, siteLinks), live: false }, audit: null, content: null }));

  const audit = () => runStage("audit",
    async () => {
      const a = await aiJson(ai, {
        system: SYS_AUDIT, json: true, maxTokens: 4000,
        prompt: `Primary keyword: "${seo.primaryKw}" (page type: ${node.type}, market: ${locationName}).\nContent structure to audit:\n${JSON.stringify(seo.structure, null, 1)}`,
      });
      if (!Array.isArray(a.issues)) throw new Error("schema: issues missing");
      setSeo({ audit: { auditedAt: Date.now(), live: true, provider: ai.provider, score: Math.max(0, Math.min(100, +a.score || 0)), summary: String(a.summary || ""), issues: a.issues.map((i) => ({ sev: ["high", "med", "low"].includes(i.sev) ? i.sev : "med", text: String(i.text || ""), fix: String(i.fix || "") })) } });
    },
    () => setSeo({ audit: { ...auditStructure(seo.structure, node), live: false } }));

  const adjust = () => runStage("adjust",
    async () => {
      const parsedAdjust = await aiJson(ai, {
        system: SYS_ADJUST, json: true, maxTokens: 6000,
        prompt: `Structure:\n${JSON.stringify(seo.structure, null, 1)}\n\nAudit issues to fix:\n${JSON.stringify(seo.audit.issues, null, 1)}`,
      });
      const st = normalizeStructure(parsedAdjust, seo.structure?.fromCompetitors || 0);
      st.live = true; st.provider = ai.provider; st.adjustedAt = Date.now();
      st.sections = carryBlocks(seo.structure?.sections, st.sections);
      setSeo({ structure: st, audit: null });
    },
    () => setSeo({ structure: { ...adjustStructure(seo.structure, seo.audit, node), live: seo.structure?.live || false }, audit: null }));

  const generate = () => runStage("content",
    async () => {
      const plan = linkPlanRows(buildLinkPlan(node.url, siteLinks, node.type));
      /* sections with a chosen content block: the writer shapes copy around
         the widget the deploy serializer will place there */
      const blockLines = seo.structure.sections
        .filter((s) => s.block && s.block !== "content" && BLOCK_WRITER_HINT[s.block])
        .map((s) => `- "${s.h2}": ${BLOCK_WRITER_HINT[s.block]}`).join("\n");
      const text = await aiGenerate(ai, {
        system: SYS_WRITER, maxTokens: 8000,
        prompt: `BRAND VOICE & BUSINESS FACTS (must follow):\n${brandVoiceBlock(brandVoice, project.name, brandProps)}\n\n${optimizeRulesBlock(spec)}\n\nPAGE: "${node.title}" — ${project.website}${node.url} (type: ${node.type}). Market: ${locationName}. Niche: ${niche}.\nPrimary keyword: "${seo.primaryKw}". Secondary: ${seo.secondaryKws || "(none)"}.\nWord target: ${seo.structure.wordTarget}+ words.\nRequired entities: ${(seo.structure.sharedEntities || []).join(", ") || "(none)"}.\nDifferentiator angles: ${(seo.structure.differentiators || []).join(", ") || "(none)"}.\n\nLINK PLAN (every URL must appear as an internal link with a descriptive anchor):\n${plan.map((l) => `${l.url} — "${l.title}" (${l.why})`).join("\n") || "(no other pages yet)"}\n\nSECTION OUTLINE (use as ## in this order):\n${seo.structure.sections.map((s) => `## ${s.h2} — ${s.note}`).join("\n")}${blockLines ? `\n\nSECTION CONTENT BLOCKS (a widget renders with these sections on the published page — shape each section's copy accordingly):\n${blockLines}` : ""}\n\nFAQs to answer:\n${(seo.structure.faqs || []).join("\n")}\n\nWrite the complete page now in the required ---META---/---CONTENT---/---SCHEMA--- format.`,
      });
      /* parse the structured output; tolerate providers that skip markers */
      const metaM = text.match(/---META---([\s\S]*?)---CONTENT---/);
      const schemaM = text.match(/---SCHEMA---([\s\S]*)$/);
      const contentM = text.match(/---CONTENT---([\s\S]*?)(?:---SCHEMA---|$)/);
      const md = (contentM ? contentM[1] : text).trim();
      if (!/^#\s/m.test(md)) throw new Error("schema: no H1 in output");
      const metaTitle = (metaM?.[1].match(/Title:\s*(.+)/) || [])[1]?.trim() || "";
      const metaDesc = (metaM?.[1].match(/Description:\s*(.+)/) || [])[1]?.trim() || "";
      const schema = (schemaM?.[1] || "").trim();
      const wc = md.split(/\s+/).length;
      const linksUsed = [...new Set([...md.matchAll(/\]\((\/[^)\s]*)\)/g)].map((m2) => m2[1]))];
      setSeo({ content: { generatedAt: Date.now(), live: true, provider: ai.provider, markdown: md, metaTitle, metaDesc, schema, internalLinksUsed: linksUsed, wordCount: wc, targetMet: wc >= (seo.structure.wordTarget || 900) * 0.85 } });
      work?.("website", "contentWritten", { detail: node.title });
    },
    () => { setSeo({ content: { ...genPageContent(node, seo.structure, brandVoice, project.name, niche, siteLinks), live: false } }); work?.("website", "contentWritten", { detail: node.title }); });

  const imgCount = Object.values(seo.images || {}).filter((p) => p && !p.skip && p.url).length;

  const Btn = ({ on, disabled, icon: Icon, label, busyKey, primary }) => (
    <button onClick={on} disabled={disabled || busy}
      className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold disabled:opacity-40"
      style={primary ? { background: accent, color: "#fff" } : { border: "1px solid " + accent + "55", color: accent, background: accent + "0D" }}>
      {busy === busyKey ? <RefreshCw size={13} className="animate-spin" /> : <Icon size={13} />} {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-3" onClick={onClose}>
      <div className="flex h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
          <FileText size={15} style={{ color: accent }} />
          <div className="min-w-0 flex-1">
            <div className="ll-display truncate text-[14px] font-semibold">{node.title}</div>
            <div className="ll-mono text-[10.5px] text-gray-400">{project.website}{node.url} · market: {locationName}{ai?.key ? ` · AI: ${ai.provider}` : " · no AI provider (drafts)"} · <span className="text-emerald-600">✓ scans &amp; drafts auto-save</span></div>
          </div>
          <button onClick={onClose} title="Everything here is already saved to the site map — close and continue anytime"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[11.5px] font-semibold text-gray-600 hover:border-gray-300">
            Save &amp; close
          </button>
          {onPublish && (
            <button onClick={onPublish} title="Publish only this page to the connected site"
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold text-white" style={{ background: accent }}>
              <UploadCloud size={12} /> Publish this page
            </button>
          )}
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X size={16} /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <Card className="space-y-3 p-4">
            <div className="ll-display flex items-center gap-2 text-[13.5px] font-semibold"><Target size={14} style={{ color: accent }} /> Target keywords</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled label="Page title"><input value={node.title} onChange={(e) => onPatch({ title: e.target.value })} className={inputCls} /></Labeled>
              <Labeled label="Suggested URL (editable)"><input value={node.url} onChange={(e) => onPatch({ url: e.target.value.startsWith("/") ? e.target.value : "/" + e.target.value })} className={"ll-mono " + inputCls} /></Labeled>
              <Labeled label="Primary keyword (one intent per page)"><input value={seo.primaryKw || ""} onChange={(e) => setSeo({ primaryKw: e.target.value })} className={inputCls} /></Labeled>
              <Labeled label="Secondary keywords (comma-separated)"><input value={seo.secondaryKws || ""} onChange={(e) => setSeo({ secondaryKws: e.target.value })} placeholder="long-tail, related terms" className={inputCls} /></Labeled>
            </div>
            {/* researched keywords: service pages get a focused keyword box
               (assigned keywords + manual add + matching research); other
               page types keep the full bank picker */}
            {node.type === "service"
              ? <ServiceKeywordsBox node={node} project={project} seo={seo} setSeo={setSeo} accent={accent} />
              : <KwBankPicker project={project} accent={accent}
                  used={[seo.primaryKw, ...String(seo.secondaryKws || "").split(",")].map((s) => s?.trim()).filter(Boolean)}
                  onPick={(k) => setSeo((cur) => cur.primaryKw?.trim()
                    ? { secondaryKws: [...new Set([...String(cur.secondaryKws || "").split(",").map((s) => s.trim()).filter(Boolean), k.keyword])].join(", ") }
                    : { primaryKw: k.keyword })} />}
            {/* research depth the writer must apply for THIS page */}
            <ResearchChecklist spec={spec} onChange={setSpec} accent={accent} />
          </Card>

          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <div className="ll-display flex items-center gap-2 text-[13.5px] font-semibold"><Search size={14} style={{ color: accent }} /> Ranked competitors</div>
              <button onClick={scan} disabled={scanning || !seo.primaryKw?.trim()}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
                {scanning ? <><RefreshCw size={11} className="animate-spin" /> Scanning Google…</> : <><Search size={11} /> Scan competitors <span className="ll-mono ml-1 text-[8.5px] opacity-80" title="1 DataForSEO organic live-advanced request">≈$0.003</span></>}
              </button>
            </div>
            <div className="text-[11px] text-gray-400">Scans Google's top 5 organic results for the primary keyword — geo-targeted to <b>{locationName}</b> so you're analyzing the SERP your customers actually see.</div>
            <div className="space-y-1.5">
              {(seo.competitors || []).map((c, i) => (
                <div key={c.url + i} className="flex items-center gap-2 rounded-lg border border-gray-100 px-2.5 py-1.5">
                  <span className="ll-mono w-5 shrink-0 text-center text-[10px] text-gray-400">{c.rank || i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-gray-700">{c.title}</span>
                    <span className="ll-mono block truncate text-[10px] text-gray-400">{c.url}</span>
                  </span>
                  <button onClick={() => setSeo((cur) => ({ competitors: cur.competitors.filter((_, j) => j !== i) }))} className="shrink-0 text-gray-300 hover:text-red-500"><X size={13} /></button>
                </div>
              ))}
              {(seo.competitors || []).length === 0 && <div className="py-2 text-center text-[11px] text-gray-300">No competitors yet — scan, or add a URL manually.</div>}
            </div>
            <div className="flex gap-1.5">
              <input value={compDraft} onChange={(e) => setCompDraft(e.target.value)} placeholder="Add competitor URL manually (https://…)" className={"ll-mono flex-1 " + inputCls}
                onKeyDown={(e) => { if (e.key === "Enter") addManual(); }} />
              <button onClick={addManual} className="rounded-lg border border-gray-200 px-3 text-[12px] font-semibold text-gray-600">Add</button>
            </div>
            {scanNote && <div className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500">{scanNote}</div>}
          </Card>

          {/* ---- local optimization + optimization rules: the STRICT contract
               the structure generator and writer must follow for this page ---- */}
          <Card className="space-y-3 p-4">
            <div className="ll-display flex items-center gap-2 text-[13.5px] font-semibold"><Sparkles size={14} style={{ color: accent }} /> Local optimization &amp; content rules</div>
            <div className="text-[11px] text-gray-400">
              These rules are enforced on every generation for this page — the writer treats them as a hard contract, not a suggestion.
            </div>
            <OptimizeControls spec={spec} onChange={setSpec} accent={accent} />
          </Card>

          <Card className="space-y-3 p-4">
            <div className="ll-display flex items-center gap-2 text-[13.5px] font-semibold"><Layers size={14} style={{ color: accent }} /> Content structure pipeline</div>
            <div className="flex flex-wrap gap-2">
              <Btn on={genStructure} disabled={!(seo.competitors || []).length} icon={Sparkles} label="Generate content structure" busyKey="structure" primary />
              {seo.structure && <Btn on={audit} icon={TriangleAlert} label="Content audit & suggestions" busyKey="audit" />}
              {seo.audit && <Btn on={adjust} icon={Wand2} label="Adjust to suggestions" busyKey="adjust" />}
              {seo.structure && <Btn on={generate} icon={FileText} label="Generate content" busyKey="content" primary />}
              {/* the step between writing and publishing: which sections carry a photo */}
              {seo.content && <Btn on={() => setImgStep(true)} icon={ImageIcon} label={imgCount ? `Section images (${imgCount} chosen)` : "Select section images"} busyKey="images" primary={!imgCount} />}
            </div>
            {stageErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-700">{stageErr}</div>}

            {seo.structure && (
              <div className="ll-fade space-y-2 rounded-xl border border-gray-100 p-3">
                <div className="flex items-center gap-2 text-[11px] text-gray-500">
                  <b className="text-gray-700">Structure</b> <LiveChip live={seo.structure.live} provider={seo.structure.provider} />
                  · from {seo.structure.fromCompetitors} competitors · target {seo.structure.wordTarget} words
                </div>
                <div className="space-y-1">
                  {seo.structure.sections.map((s, i) => {
                    const patchSec = (patch) => setSeo((cur) => ({ structure: { ...cur.structure, sections: cur.structure.sections.map((x, j) => (j === i ? { ...x, ...patch } : x)) } }));
                    return (
                    <div key={i} className="flex items-start gap-2 text-[12px]">
                      <span className="ll-mono mt-0.5 w-6 shrink-0 text-right text-gray-300">H2</span>
                      <span className="min-w-0 flex-1"><b className="text-gray-800">{s.h2}</b>
                        <span className="ml-1.5 rounded px-1 py-px text-[8.5px] font-bold uppercase"
                          style={{ background: s.kind === "differentiator" ? "#FEF3C7" : s.kind === "eeat" ? "#F3E8FF" : "#EEF2FF", color: s.kind === "differentiator" ? "#92400E" : s.kind === "eeat" ? "#6B21A8" : "#3730A3" }}>{s.kind}</span>
                        <div className="text-[10.5px] text-gray-400">{s.note}</div>
                        {s.block === "video" && (
                          <input value={s.videoUrl || ""} onChange={(e) => patchSec({ videoUrl: e.target.value })}
                            placeholder="Video URL (YouTube / Vimeo / MP4)" className={"ll-mono mt-1 w-full max-w-sm " + inputCls} />
                        )}
                      </span>
                      {/* the section's published CONTENT BLOCK — what ships with this copy */}
                      <select value={s.block || "content"} onChange={(e) => patchSec({ block: e.target.value })}
                        title="Content block published with this section — CTA form, image, video, map, estimator…"
                        className="shrink-0 rounded-lg border border-gray-200 bg-white px-1.5 py-1 text-[10.5px] font-medium text-gray-600">
                        {SECTION_BLOCKS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                      </select>
                    </div>
                  ); })}
                </div>
                {(seo.structure.sharedEntities || []).length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 border-t border-gray-50 pt-2 text-[10px]">
                    <span className="font-semibold uppercase tracking-wider text-gray-400">Must-cover entities</span>
                    {seo.structure.sharedEntities.slice(0, 14).map((e) => <span key={e} className="rounded bg-emerald-50 px-1.5 py-px text-emerald-700">{e}</span>)}
                  </div>
                )}
                {(seo.structure.differentiators || []).length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-[10px]">
                    <span className="font-semibold uppercase tracking-wider text-gray-400">Differentiators</span>
                    {seo.structure.differentiators.slice(0, 10).map((e) => <span key={e} className="rounded bg-amber-50 px-1.5 py-px text-amber-700">{e}</span>)}
                  </div>
                )}
              </div>
            )}

            {seo.audit && (
              <div className="ll-fade space-y-1.5 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="ll-display rounded-lg px-2 py-0.5 text-[13px] font-bold text-white" style={{ background: seo.audit.score >= 75 ? "#16A34A" : seo.audit.score >= 50 ? "#D97706" : "#DC2626" }}>{seo.audit.score}</span>
                  <b className="text-gray-800">Content audit</b> <LiveChip live={seo.audit.live} provider={seo.audit.provider} />
                  <span className="text-[11px] text-gray-500">{seo.audit.summary}</span>
                </div>
                {seo.audit.issues.map((iss, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[11px] text-gray-600">
                    <span className="mt-0.5 rounded px-1 py-px text-[8px] font-bold uppercase" style={{ background: iss.sev === "high" ? "#FEE2E2" : iss.sev === "med" ? "#FEF3C7" : "#F1F5F9", color: iss.sev === "high" ? "#991B1B" : iss.sev === "med" ? "#92400E" : "#64748B" }}>{iss.sev}</span>
                    {iss.text}
                  </div>
                ))}
              </div>
            )}

            {seo.content && (
              <div className="ll-fade space-y-2.5 rounded-xl border border-gray-100 p-3">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                  <b className="text-gray-700">Generated content</b> <LiveChip live={seo.content.live} provider={seo.content.provider} />
                  · {seo.content.wordCount} words
                  <span className="rounded-full px-1.5 py-px text-[8.5px] font-bold uppercase" style={seo.content.targetMet ? { background: "#DCFCE7", color: "#166534" } : { background: "#FEF3C7", color: "#92400E" }}>{seo.content.targetMet ? "target met" : "below target"}</span>
                  {(seo.content.internalLinksUsed || []).length > 0 && (
                    <span className="rounded-full bg-blue-50 px-1.5 py-px text-[8.5px] font-bold uppercase text-blue-700" title={(seo.content.internalLinksUsed || []).join("\n")}>
                      {seo.content.internalLinksUsed.length} internal links
                    </span>
                  )}
                  <button onClick={() => downloadContentDocx({ title: node.title, markdown: seo.content.markdown, metaTitle: seo.content.metaTitle, metaDesc: seo.content.metaDesc, site: project.website, pageUrl: node.url, filename: node.url.split("/").filter(Boolean).pop() || "page" })}
                    title="Download as a Word document — real Word headings, hyperlinks and lists"
                    className="ml-auto flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[10.5px] font-semibold text-gray-600 hover:border-gray-300">
                    <Download size={11} /> Word (.docx)
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Labeled label={<span className="flex items-center justify-between">Meta title <CharCount value={seo.content.metaTitle || ""} max={60} /></span>}>
                    <input value={seo.content.metaTitle || ""} onChange={(e) => setSeo((cur) => ({ content: { ...cur.content, metaTitle: e.target.value } }))} className={inputCls} />
                  </Labeled>
                  <Labeled label={<span className="flex items-center justify-between">Meta description <CharCount value={seo.content.metaDesc || ""} max={160} /></span>}>
                    <input value={seo.content.metaDesc || ""} onChange={(e) => setSeo((cur) => ({ content: { ...cur.content, metaDesc: e.target.value } }))} className={inputCls} />
                  </Labeled>
                </div>
                <textarea value={seo.content.markdown} onChange={(e) => setSeo((cur) => ({ content: { ...cur.content, markdown: e.target.value, wordCount: e.target.value.split(/\s+/).length } }))}
                  rows={16} className={"ll-mono " + inputCls + " resize-y text-[11.5px] leading-relaxed"} />
                {seo.content.schema && (
                  <Labeled label="JSON-LD schema (paste into the page head)">
                    <textarea value={seo.content.schema} onChange={(e) => setSeo((cur) => ({ content: { ...cur.content, schema: e.target.value } }))}
                      rows={5} className={"ll-mono " + inputCls + " resize-y text-[10.5px] leading-snug"} />
                  </Labeled>
                )}
                {/* what the image step decided — visible without reopening it */}
                <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-50 pt-2 text-[10.5px]">
                  <span className="font-semibold uppercase tracking-wider text-gray-400">Section images</span>
                  {Object.keys(seo.images || {}).length === 0
                    ? <span className="text-gray-400">not chosen yet — the engine places automatic slots</span>
                    : Object.entries(seo.images).map(([k, p]) => (
                        <span key={k} className={"rounded px-1.5 py-px " + (p?.skip ? "bg-gray-100 text-gray-500" : "bg-emerald-50 text-emerald-700")}>
                          {k === "hero" ? "hero" : k} {p?.skip ? "· none" : "✓"}
                        </span>
                      ))}
                  <button onClick={() => setImgStep(true)} className="ml-auto font-bold" style={{ color: accent }}>Edit images</button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
      {imgStep && (
        <ImageStep node={node} media={media} accent={accent} primaryKw={seo.primaryKw || node.title}
          brand={project.name.split(" — ")[0]} onPatch={onPatch} onClose={() => setImgStep(false)} />
      )}
    </div>
  );

  function addManual() {
    const v = compDraft.trim();
    if (!v) return;
    try { new URL(/^https?:\/\//.test(v) ? v : "https://" + v); } catch { setStageErr("Not a valid URL: " + v); return; }
    const url = /^https?:\/\//.test(v) ? v : "https://" + v;
    setSeo((cur) => ({ competitors: [...(cur.competitors || []), { url, title: new URL(url).hostname, domain: new URL(url).hostname, description: "" }] }));
    setCompDraft("");
  }
}

/* ================= the tab ================= */
export function WebsiteMappingTab({ opt, setOpt, accent, log, project, dfs, aiConfig = null }) {
  const work = useWork();
  const w = opt.website || {};
  const arch = w.architecture || null;
  /* functional writes — a scan finishing during a generation can't clobber the tree */
  const setTree = (fnOrTree) => setOpt("website", (cur) => ({
    architecture: { ...(cur?.architecture || {}), tree: typeof fnOrTree === "function" ? fnOrTree(cur?.architecture?.tree || []) : fnOrTree },
  }));
  /* ---- undo / redo over the architecture tree --------------------------
     Every structural change snapshots the tree it replaced; per-node field
     edits (typing in the page editor) coalesce into one snapshot per burst
     so undo steps stay meaningful. Snapshots are taken OUTSIDE the state
     updaters — StrictMode double-invokes those, and a history that pushes
     from inside them records every step twice. */
  const hist = React.useRef({ past: [], future: [], lastTag: null, lastAt: 0 });
  const [, histBump] = useState(0);
  const snapshot = (t, tag) => {
    const h = hist.current, now = Date.now();
    if (tag && h.lastTag === tag && now - h.lastAt < 2500) { h.lastAt = now; return; }
    h.past.push(t);
    if (h.past.length > 60) h.past.shift();
    h.future = []; h.lastTag = tag || null; h.lastAt = now;
  };
  const [niche, setNiche] = useState(arch?.niche || "");
  const [services, setServices] = useState(arch?.services || "");
  const [locations, setLocations] = useState(arch?.locations || "");
  const [busy, setBusy] = useState(false);
  const [genErr, setGenErr] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [deploying, setDeploying] = useState(false);
  const brandVoice = opt.brandVoice || {};

  /* geo target for SERP scans: the project's tracked market, else US */
  const c0 = project.tracking?.[0]?.city;
  const locationName = c0 ? `${c0.city},${c0.region},${c0.country}` : "United States";

  const generate = async () => {
    if (!niche.trim()) return;
    setBusy(true); setGenErr(null);
    let tree = null, live = false;
    try {
      const parsed = await aiJson(aiConfig, {
        system: SYS_ARCHITECT, json: true, maxTokens: 7000,
        prompt: `Business: ${project.name} (${project.website}). Niche: ${niche}.\nServices: ${services || "(infer sensible ones from the niche)"}.\nLocations: ${locations || "(none — skip location pages)"}.\nBrand positioning: ${brandVoice.tagline || "(none)"}.\nDesign the complete site architecture.`,
      });
      const nodes = nodesFromAi(parsed.pages);
      if (!nodes.length) throw new Error("empty architecture");
      tree = nodes; live = true;
    } catch (e) {
      if (e.code === 502) { setGenErr("AI provider error: " + e.message); setBusy(false); return; }
      await new Promise((r) => setTimeout(r, 1100));
      tree = genSiteArchitecture(niche, services, project.name, locations);
    }
    /* enforce the URL hierarchy: children always slug under their parent */
    tree = normalizeTreeUrls(tree);
    /* a regenerate replaces the whole map — the map it replaced is undoable */
    const prevTree = arch?.tree || [];
    if (prevTree.length) { snapshot(prevTree); histBump((x) => x + 1); }
    setOpt("website", (cur) => ({ architecture: { ...(cur?.architecture || {}), tree, niche, services, locations, live, generatedAt: Date.now() } }));
    work?.("website", "archGenerated", { detail: `${countPages(tree)} pages` });
    log?.(`Generated website architecture (${countPages(tree)} pages${live ? ", AI" : ", draft"})`, project.name);
    setBusy(false);
  };

  const tree = arch?.tree || [];
  /* structural edits go through here so the state they replace is undoable;
     the URL-hierarchy self-heal below deliberately bypasses it */
  const setTreeTracked = (updater, tag) => { snapshot(tree, tag); setTree(updater); histBump((x) => x + 1); };
  const undoTree = () => {
    const h = hist.current;
    if (!h.past.length) return;
    const prev = h.past.pop();
    h.future.push(tree); h.lastTag = null;
    setTree(prev); histBump((x) => x + 1);
  };
  const redoTree = () => {
    const h = hist.current;
    if (!h.future.length) return;
    const next = h.future.pop();
    h.past.push(tree); h.lastTag = null;
    setTree(next); histBump((x) => x + 1);
  };
  /* self-heal older maps: enforce the parent/child URL hierarchy on load so
     pre-existing trees (children generated on foreign paths) fix themselves */
  React.useEffect(() => {
    if (!tree.length) return;
    const norm = normalizeTreeUrls(tree);
    if (JSON.stringify(norm) !== JSON.stringify(tree)) setTree(norm);
  }, [arch?.generatedAt]); // eslint-disable-line
  /* changing a page's URL re-parents every descendant: each child keeps its
     own slug but follows the new parent path (recursively) */
  const rebaseChildren = (children, parentUrl) => (children || []).map((c) => {
    const u = (parentUrl === "/" ? "" : parentUrl) + "/" + (c.url.split("/").filter(Boolean).pop() || "page");
    return { ...c, url: u, children: rebaseChildren(c.children, u) };
  });
  const patchNode = (id, patch) => setTreeTracked((t) => updateNode(t, id, (p) => {
    const np = typeof patch === "function" ? patch(p) : patch;
    if (np.url !== undefined && np.url !== p.url) return { ...np, children: rebaseChildren(np.children ?? p.children, np.url) };
    return np;
  }), "patch:" + id);
  const openNode = (() => { let found = null; walk(tree, (p) => { if (p.id === openId) found = p; }); return found; })();

  const addChild = (parent) => setTreeTracked((t) => updateNode(t, parent.id, (p) => ({
    children: [...(p.children || []), { id: "n" + Date.now(), title: "New subpage", url: (p.url === "/" ? "" : p.url) + "/new-page", type: "service", children: [], seo: blankSeo() }],
  })));
  const addTop = () => setTreeTracked((t) => [...t, { id: "n" + Date.now(), title: "New page", url: "/new-page", type: "service", children: [], seo: blankSeo() }]);

  /* ---------- drag & drop: reorder, re-parent, and pull in live pages ------
     Drop on a row's middle = nest under it (URL becomes parent-url/slug,
     children rebase too); top/bottom edge = insert before/after as sibling.
     Live pages dragged in keep their real URL at root level. ---------- */
  const slugify = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const slugOf = (n) => n.url.split("/").filter(Boolean).pop() || slugify(n.title) || "page";
  const rebase = (n, parentUrl) => {
    /* parentUrl "" = root: researched pages flatten to /slug, adopted live
       pages keep the URL they actually exist at */
    const u = parentUrl ? parentUrl + "/" + slugOf(n) : (n.adoptedExisting ? n.url : "/" + slugOf(n));
    return { ...n, url: u, children: (n.children || []).map((c) => rebase(c, u)) };
  };
  const containsId = (n, id) => n.id === id || (n.children || []).some((c) => containsId(c, id));
  const insertAt = (list, parentUrl, dragged, targetId, zone) => list.flatMap((p) => {
    const self = { ...p, children: insertAt(p.children || [], p.url === "/" ? "" : p.url, dragged, targetId, zone) };
    if (p.id !== targetId) return [self];
    if (zone === "inside") return [{ ...self, children: [...self.children, rebase(dragged, p.url === "/" ? "" : p.url)] }];
    return zone === "before" ? [rebase(dragged, parentUrl), self] : [self, rebase(dragged, parentUrl)];
  });
  const dragPayload = React.useRef(null);
  const dragOverRef = React.useRef(null);
  const [dragOver, _setDragOver] = useState(null);
  const dnd = {
    over: dragOver,
    setOver: (v) => { dragOverRef.current = v; _setDragOver(v); },
    start: (p) => { dragPayload.current = p; },
    dragging: () => !!dragPayload.current,
    drop: (targetId) => {
      const p = dragPayload.current; dragPayload.current = null;
      const zone = targetId == null ? "root" : (dragOverRef.current?.id === targetId ? dragOverRef.current.zone : "inside");
      dnd.setOver(null);
      if (!p) return;
      setTreeTracked((t) => {
        let dragged = null;
        if (p.kind === "node") {
          walk(t, (n) => { if (n.id === p.id) dragged = n; });
          if (!dragged || dragged.id === targetId || (targetId && containsId(dragged, targetId))) return t; // never drop into own subtree
          const without = removeNode(t, p.id);
          return zone === "root" ? [...without, rebase(dragged, "")] : insertAt(without, "", dragged, targetId, zone);
        }
        /* live page from the site — adopt into the map */
        let exists = false; walk(t, (n) => { if (n.url === p.url) exists = true; });
        if (exists) return t;
        dragged = { id: "n" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
          title: p.name || p.url, url: p.url, type: /blog|article|news/.test(p.url) ? "article" : "service",
          adoptedExisting: true, children: [], seo: blankSeo() };
        return zone === "root" ? [...t, dragged] : insertAt(t, "", dragged, targetId, zone);
      });
    },
  };
  const treeUrls = (() => { const s = new Set(); walk(tree, (n) => s.add(n.url)); return s; })();

  /* resizable spreadsheet columns (px) — the last Actions column flexes */
  const [colW, setColW] = useState({ page: 250, url: 220, type: 96, kw: 180, status: 92 });
  const colBase = React.useRef(null);
  const resizeCol = (key) => (dx, final) => {
    if (colBase.current == null) colBase.current = colW[key];
    const wpx = Math.max(70, colBase.current + dx);
    setColW((c) => ({ ...c, [key]: wpx }));
    if (final) colBase.current = null;
  };
  const gridT = `${colW.page}px ${colW.url}px ${colW.type}px ${colW.kw}px ${colW.status}px minmax(170px,1fr)`;

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <div className="ll-display flex items-center gap-2 text-[15px] font-semibold"><Network size={15} style={{ color: accent }} /> Website Mapping & Content Structure
          {arch && <LiveChip live={arch.live} provider={aiConfig?.provider} />}
        </div>
        <div className="text-[11.5px] text-gray-400">
          Generate a technical-SEO site architecture — siloed hubs, service & location pages, blog spokes with internal linking baked in.
          {aiConfig?.key ? <> Generation runs live via <b>{aiConfig.provider}</b>.</> : <> No AI provider connected — structures are labeled drafts until a key is added in API settings.</>}
          {" "}SERP research is geo-targeted to <b>{locationName}</b>.
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <Labeled label="Niche"><input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="e.g. cosmetic & family dentistry" className={inputCls} /></Labeled>
          <Labeled label="Services (comma / newline)"><input value={services} onChange={(e) => setServices(e.target.value)} placeholder="teeth whitening, implants, veneers" className={inputCls} /></Labeled>
          <Labeled label="Locations (optional, for local silo)"><input value={locations} onChange={(e) => setLocations(e.target.value)} placeholder="Manhattan, Brooklyn" className={inputCls} /></Labeled>
        </div>
        <button onClick={generate} disabled={busy || !niche.trim()}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
          {busy ? <><RefreshCw size={13} className="animate-spin" /> Architecting…</> : <><Sparkles size={13} /> {tree.length ? "Regenerate structure" : "Generate website structure"}</>}
        </button>
        {genErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-700">{genErr}</div>}
      </Card>

      {tree.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="ll-display text-[13.5px] font-semibold">Site architecture <span className="text-[11px] font-normal text-gray-400">{countPages(tree)} pages · click a page to research & write · drag rows to reorder, drop on a page to nest under it (URLs re-parent automatically)</span></div>
            <div className="flex shrink-0 items-center gap-1">
              <button onClick={undoTree} disabled={!hist.current.past.length} title="Undo the last change to the map"
                className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:text-gray-700 disabled:opacity-30"><Undo2 size={13} /></button>
              <button onClick={redoTree} disabled={!hist.current.future.length} title="Redo"
                className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:text-gray-700 disabled:opacity-30"><Redo2 size={13} /></button>
              <button onClick={addTop} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-600"><Plus size={11} /> Add page</button>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="min-w-0 flex-1 overflow-x-auto">
              {/* spreadsheet header — drag a divider to resize its column */}
              <div className="grid items-center rounded-t-lg border-b border-gray-200 bg-gray-50" style={{ gridTemplateColumns: gridT, minWidth: 720 }}>
                {[["page", "Page"], ["url", "URL"], ["type", "Type"], ["kw", "Keywords"], ["status", "Content"]].map(([k, l]) => (
                  <div key={k} className="relative select-none px-2 py-1.5 text-[9.5px] font-bold uppercase tracking-wide text-gray-400">
                    {l}<ColResizer onDrag={resizeCol(k)} />
                  </div>
                ))}
                <div className="px-2 py-1.5 text-right text-[9.5px] font-bold uppercase tracking-wide text-gray-400">Actions</div>
              </div>
              <div style={{ minWidth: 720 }}>
              {tree.map((p) => (
                <PageRow key={p.id} node={p} depth={0} accent={accent} onOpen={(n) => setOpenId(n.id)} onAddChild={addChild}
                  onRemove={(n) => { if (openId === n.id) setOpenId(null); setTreeTracked((t) => removeNode(t, n.id)); }}
                  onPublish={(n) => setDeploying({ only: n })} dnd={dnd} grid={gridT} />
              ))}
              </div>
              {/* root drop zone: drop here = top-level page */}
              <div onDragOver={(e) => { if (dnd.dragging()) { e.preventDefault(); dnd.setOver({ id: "__root__", zone: "root" }); } }}
                onDragLeave={() => { if (dnd.over?.id === "__root__") dnd.setOver(null); }}
                onDrop={(e) => { e.preventDefault(); dnd.drop(null); }}
                className="mt-1 rounded-lg border border-dashed px-2 py-1.5 text-center text-[10px] text-gray-300"
                style={dnd.over?.id === "__root__" ? { borderColor: accent, color: accent, background: accent + "0A" } : { borderColor: "#E5E7EB" }}>
                drop here for a top-level page
              </div>
            </div>
            {/* ---- the LIVE site's pages: drag any into the map to combine
                 existing + researched pages into the final architecture ---- */}
            {(w.pages || []).length > 0 && (
              <div className="hidden w-64 shrink-0 border-l border-gray-100 pl-3 lg:block">
                <div className="text-[11.5px] font-bold text-gray-700">Live pages on the site</div>
                <div className="mb-2 mt-0.5 text-[10px] leading-relaxed text-gray-400">Drag an existing page into the architecture to keep it in the final map — it moves out of this list, gets an "existing page" tag, and keeps its real URL unless you nest it under a parent. Removing it from the map brings it back here.</div>
                <div className="max-h-[440px] space-y-1 overflow-y-auto pr-1">
                  {(w.pages || []).filter((p) => !treeUrls.has(p.url)).map((p) => (
                    <div key={p.id} draggable
                      onDragStart={(e) => { dnd.start({ kind: "live", url: p.url, name: p.name }); e.dataTransfer.effectAllowed = "copy"; try { e.dataTransfer.setData("text/plain", p.url); } catch { /* older browsers */ } }}
                      className="cursor-grab rounded-lg border px-2 py-1.5 hover:border-gray-300"
                      style={{ borderColor: "#E5E7EB" }}>
                      <div className="flex items-center gap-1.5">
                        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-gray-700">{p.name || p.url}</span>
                        {p.demo && <span className="shrink-0 rounded bg-amber-50 px-1 py-px text-[7.5px] font-bold uppercase text-amber-700">demo</span>}
                      </div>
                      <div className="ll-mono truncate text-[9.5px] text-gray-400">{p.url}</div>
                    </div>
                  ))}
                  {(w.pages || []).every((p) => treeUrls.has(p.url)) && (
                    <div className="rounded-lg border border-dashed border-gray-200 px-2 py-3 text-center text-[10px] leading-relaxed text-gray-400">
                      Every live page is in the map — each carries the <b>existing page</b> tag in the architecture.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {/* ---- duplicate cross-check: suggested map vs the LIVE site ---- */}
          {(() => {
            const livePages = (w.pages || []).filter((p) => !p.demo);
            const liveBlogs = (w.blogs || []).filter((b) => !b.demo);
            if (!livePages.length && !liveBlogs.length) return null;
            const dups = [];
            walk(tree, (n) => {
              if (n.adoptedExisting || n.dupResolved) return;
              /* pages match existing PAGES; only blog-article nodes match posts */
              const d = n.type === "article"
                ? findDuplicate({ title: n.title, slug: n.url.split("/").filter(Boolean).pop() || "", url: n.url }, [], liveBlogs)
                : findDuplicate({ title: n.title, slug: n.url.split("/").filter(Boolean).pop() || "", url: n.url }, livePages, []);
              if (d && d.url !== n.url) dups.push({ node: n, dup: d });
              else if (d && d.url === n.url) dups.push({ node: n, dup: d, same: true });
            });
            if (!dups.length) return null;
            return (
              <div className="mt-3 space-y-1.5 rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                <div className="text-[12px] font-bold text-amber-800">Already on the live site ({dups.length})</div>
                <div className="text-[10.5px] text-gray-500">Deploying a same-slug page updates the existing one. For different-URL matches: remove the suggestion, or adopt the existing page's URL so nothing is duplicated.</div>
                {dups.map(({ node, dup, same }) => (
                  <div key={node.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-[11px]">
                    <span className="min-w-0 flex-1 truncate font-medium text-gray-700">{node.title} <span className="ll-mono text-gray-400">{node.url}</span></span>
                    <span className="ll-mono truncate text-[10px] text-amber-700" title={dup.title}>existing {dup.kind}: {dup.url}</span>
                    {same ? <span className="rounded bg-emerald-50 px-1.5 py-px text-[8.5px] font-bold uppercase text-emerald-700">will update in place</span> : (
                      <span className="flex shrink-0 gap-1">
                        <button onClick={() => setTreeTracked((t) => removeNode(t, node.id))} className="rounded border border-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-600 hover:text-red-600">Remove</button>
                        <button onClick={() => patchNode(node.id, { url: dup.url, adoptedExisting: true })} className="rounded px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: accent }}>Use existing URL</button>
                        <button onClick={() => patchNode(node.id, { dupResolved: true })} className="rounded px-2 py-0.5 text-[10px] font-semibold text-gray-400 hover:text-gray-600">Keep both</button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
          {/* ---- the money button: turn the whole researched map into a live site ---- */}
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
            <button onClick={() => setDeploying({})}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13.5px] font-bold text-white" style={{ background: accent }}>
              <Network size={15} /> Create full website from this map
            </button>
            <span className="text-[10.5px] leading-relaxed text-gray-400">
              Builds every page with the full technical-SEO spec — meta, headings, schema, smart internal links,
              reviews, NAP + map block, pricing — and deploys via the WordPress REST API (HTML, Elementor or Block Editor).
              Need just one new page on the existing site? Use the <UploadCloud size={10} className="inline" /> button on any row to publish that page alone — nothing else is touched.
            </span>
          </div>
        </Card>
      )}

      {openNode && (() => {
        /* the finalized site plan, flattened — powers structure-aware internal linking */
        const siteLinks = [];
        walk(tree, (p) => siteLinks.push({ title: p.title, url: p.url, type: p.type, primaryKw: p.seo?.primaryKw || "" }));
        return (
          <PageEditor node={openNode} project={project} brandVoice={brandVoice} brandProps={opt.branding?.properties || null} niche={arch?.niche || niche || project.name}
            accent={accent} dfs={dfs} ai={aiConfig} media={w.media || []} locationName={locationName} siteLinks={siteLinks}
            onPatch={(patch) => patchNode(openNode.id, patch)} onPublish={() => setDeploying({ only: openNode })} onClose={() => setOpenId(null)} />
        );
      })()}

      {/* rendered last so it stacks above an open PageEditor when publishing from inside it */}
      {deploying && (
        <DeployModal tree={tree} arch={arch} project={project} opt={opt} setOpt={setOpt} accent={accent}
          brandVoice={brandVoice} log={log} only={deploying.only || null} onClose={() => setDeploying(false)} />
      )}
    </div>
  );
}


/* =====================================================================
   DEPLOY MODAL — "Create full website from this map"
   Builder choice (HTML / Elementor / Block Editor) → preflight → deploy.
   LIVE when WordPress + Application Password are connected (real REST
   calls via /api/wp/*); otherwise a clearly-labeled demo simulation that
   still produces every page locally so the output can be inspected.
   ===================================================================== */
const B_HTML = { key: "html", label: "HTML page building", desc: "Pushes the designed content body only — your site's own header, footer and menu stay exactly as they are. Fastest option, ideal for Core Web Vitals.", badge: "Fastest" };
const B_ELEMENTOR = { key: "elementor", label: "Elementor page building", desc: "Content body as Elementor sections (one per design band), editable in Elementor — the site's header, footer and menu are untouched. Needs Elementor + the companion plugin.", badge: "Editable in Elementor" };
const B_GUTENBERG = { key: "gutenberg", label: "WordPress Block Editor", desc: "Content body as Gutenberg blocks (one editable block per design band), on the default page template — the site's header, footer and menu stay.", badge: "Native WP" };
const B_WEBFLOW = { key: "webflowcms", label: "Webflow CMS (Collections)", desc: "The standard Webflow pattern — pages pushed as CMS Collection items (Services / Locations / Blog Posts) that drive your Collection templates, then the site is published. Fully editable in the Designer.", badge: "Native Webflow" };
const B_EXPORT = { key: "export", label: "Static HTML export (ZIP)", desc: "Downloads every page as /path/index.html plus sitemap.xml and robots.txt. Upload the extracted folder to any host; no builder or CMS needed.", badge: "Any host" };
const B_CUSTOM_PUSH = { key: "custompush", label: "Publish directly to the site", desc: "Pushes fully system-designed static pages & blog posts straight onto the custom-coded site through the drop-in publisher endpoint (serp-squad-publish.php in the web root). Scheduled posts auto-publish on their dates; /blog/ gets a generated index.", badge: "Live publish" };
/* the builder set follows the connected platform (Elementor & Block Editor are
   WordPress-native; Webflow uses its CMS; custom-coded sites publish through
   the drop-in endpoint or export as a ZIP) */
const buildersFor = (platform) =>
  platform === "wordpress" ? [B_HTML, B_ELEMENTOR, B_GUTENBERG]
  : platform === "webflow" ? [B_WEBFLOW, B_EXPORT]
  : [B_CUSTOM_PUSH, B_EXPORT];

function DeployModal({ tree, arch, project, opt, setOpt, accent, brandVoice, log, only = null, onClose }) {
  const work = useWork();
  const w = opt.website || {};
  const BUILDERS = buildersFor(w.platform);
  const [builder, setBuilder] = useState(BUILDERS[0].key);
  /* single-page mode never wipes the site; a lone article defaults to publishing today */
  const [cleanup, setCleanup] = useState(!only);
  const [wfSiteId, setWfSiteId] = useState(w.webflowSiteId || "");
  const [schedStart, setSchedStart] = useState(new Date(Date.now() + (only ? 0 : 864e5)).toISOString().slice(0, 10));
  const [schedEvery, setSchedEvery] = useState(3);
  const [progress, setProgress] = useState(null); // [{url, status, note}]
  const [done, setDone] = useState(false);
  /* hero enquiry form — on by default, needs a notification address */
  const [leadForm, setLeadForm] = useState(true);
  const [formNote, setFormNote] = useState(null);

  /* credentials may be a raw string (legacy) or the connector's {value,…} object */
  const credStr = typeof w.credential === "string" ? w.credential : (w.credential?.value || "");
  const siteKey = w.siteKey || "";
  const canLive = builder === "export" ? false
    : w.platform === "wordpress" ? /:/.test(credStr)
    : w.platform === "webflow" ? credStr.length > 10 && !!wfSiteId.trim()
    : builder === "custompush" ? !!siteKey
    : false;
  const [mode, setMode] = useState("demo");
  const live = builder !== "export" && mode === "live" && canLive;
  const reviewSource = opt.branding?.props?.gbpReview || "";
  const gbp = opt.gbp || {};
  const media = w.media || [];
  const props = opt.branding?.props || {};
  const sameAs = [
    ...Object.values(props).filter((v) => typeof v === "string" && /^https?:\/\//.test(v)),
    ...((opt.social?.accounts || []).filter((a) => a.connected && a.url).map((a) => a.url)),
  ];
  /* ---- the hero lead form: where enquiries land ----
     The deployed page never carries the address — it carries a key that this
     app registers against the recipient, so leads can't be redirected by
     editing the published HTML and the address can change without a redeploy. */
  const leadTo = String(brandVoice?.biz?.email || gbp.email || "").trim();
  const formKey = "f" + hashStr(String(project.website || project.id)).toString(36);
  const formApi = (/localhost|127\.0\.0\.1/.test(window.location.hostname) ? window.location.origin : "https://app.serpsquad.com") + "/api/form/submit";
  const ctx = {
    sameAs,
    leadForm: { enabled: leadForm && !!leadTo, to: leadTo, key: formKey, endpoint: formApi },
    /* Brand Voice → Brand colors drive the deployed pages' design palette */
    brandColors: brandVoice?.colors || null,
    tree, brand: project.name.split(" — ")[0], niche: arch?.niche || project.name,
    services: (arch?.services || "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean),
    gbp, brandVoice, website: project.website, accent,
    media, reviews: demoReviews(project.name.split(" — ")[0], ""), reviewSource,
  };
  /* the plan is always composed from the FULL tree so internal links, parent
     slugs and silo context stay correct — then scoped to one node when
     publishing a single page onto the existing site */
  const fullPlan = buildDeployPlan(tree, ctx);
  const plan = only ? fullPlan.filter((x) => x.node.id === only.id) : fullPlan;
  const articles = plan.filter((x) => x.node.type === "article");
  const withContent = plan.filter((x) => x.node.seo?.content).length;
  const dates = scheduleDates(articles.length, schedStart, Math.max(1, +schedEvery || 3));

  const payloadFor = (item, idx) => {
    const { node, page, chrome } = item;
    const isPost = node.type === "article";
    const artIdx = articles.findIndex((a) => a.node.id === node.id);
    const base = {
      kind: isPost ? "post" : "page",
      slug: node.url.split("/").filter(Boolean).pop() || "home",
      parentSlug: page.parentUrl ? page.parentUrl.split("/").filter(Boolean).pop() : null,
      title: page.h1, metaTitle: page.metaTitle, metaDesc: page.metaDesc,
      ...(isPost && artIdx >= 0 && dates[artIdx].getTime() > Date.now()
        ? { status: "future", date: dates[artIdx].toISOString() } : { status: "publish" }),
    };
    /* WordPress builds neutralize the theme: Elementor pages go on the blank
       Canvas template (bypasses theme layout entirely); HTML/Gutenberg carry a
       scoped reset that overrides theme widths, fonts and sizes. */
    /* WordPress builds push the CONTENT BODY ONLY on the default page
       template — the site's own header, footer and menu stay untouched;
       the design system styles just the content bands */
    if (builder === "html") return { ...base, content: serializeWpBody(page, chrome, ctx, { withChrome: false }) };
    if (builder === "elementor") { const e = serializeElementor(page, chrome, ctx); return { ...base, content: e.fallbackHtml, elementorData: e.elementorData }; }
    return { ...base, content: serializeGutenberg(page, chrome, ctx) };
  };

  /* tell the API server where this site's enquiries go — done before any page
     ships so the very first submission has somewhere to land */
  const registerForm = async () => {
    if (!ctx.leadForm.enabled) return;
    try {
      const r = await fetch("/api/form/register", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ key: formKey, to: leadTo, site: project.website, brand: project.name.split(" — ")[0] }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setFormNote(`⚠ Enquiry form not connected — ${d.detail || "HTTP " + r.status}. Pages still publish; leads won't be emailed until this is fixed.`); return; }
      setFormNote(d.smtp
        ? `✓ Enquiry form connected — submissions email ${leadTo}.`
        : `⚠ Enquiry form connected to ${leadTo}, but no SMTP is configured (Company Settings → API settings → Email SMTP). Leads are stored on the server until it is.`);
    } catch (e) { setFormNote(`⚠ Enquiry form not connected — API server unreachable (${e?.message || e}).`); }
  };

  const deploy = async () => {
    const rows = plan.map((x) => ({ url: x.node.url, status: "pending", note: "" }));
    setProgress([...rows]);
    const mark = (i, status, note = "") => { rows[i] = { ...rows[i], status, note }; setProgress([...rows]); };
    const auth = { site: project.website, credential: credStr };
    await registerForm();

    /* CUSTOM-CODED: static export — a real ZIP download, no builder */
    if (builder === "export") {
      const blob = exportSiteZip(plan, ctx, { pagesOnly: !!only });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = project.website.replace(/\W+/g, "-") + (only ? "-page" + only.url.replace(/\W+/g, "-") : "-site-export") + ".zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      rows.forEach((_, i) => mark(i, "done", "exported"));
      mirrorLocal(false);
      work?.("website", only ? "pagePublished" : "siteDeployed", { detail: only ? `${only.url} · ZIP` : `${plan.length} pages · ZIP export` });
      log?.(only ? `Exported single page ZIP (${only.url})` : `Exported static site ZIP (${plan.length} pages + sitemap + robots)`, project.website);
      setDone(true);
      return;
    }

    /* WEBFLOW: push CMS collection items, then publish */
    if (builder === "webflowcms") {
      if (live) {
        try {
          const items = webflowItems(plan, ctx);
          const r = await fetch("/api/webflow/deploy", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(180000),
            body: JSON.stringify({ token: credStr, siteId: wfSiteId.trim(), items }) });
          const d = await r.json().catch(() => ({}));
          if (r.ok) {
            (d.results || []).forEach((res2) => { const i = plan.findIndex((x) => (x.node.url.split("/").filter(Boolean).pop() || "home") === res2.slug); if (i >= 0) mark(i, "done", res2.collection); });
            await fetch("/api/webflow/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: credStr, siteId: wfSiteId.trim() }) }).catch(() => {});
            rows.forEach((r2, i) => { if (r2.status !== "done") mark(i, "done", "pushed"); });
          } else rows.forEach((_, i) => mark(i, "error", d.detail || `HTTP ${r.status}`));
        } catch (e) { rows.forEach((_, i) => mark(i, "error", String(e?.message || e))); }
      } else {
        for (let i = 0; i < rows.length; i++) { mark(i, "creating"); await new Promise((res2) => setTimeout(res2, 100)); mark(i, "done", "demo"); }
      }
      mirrorLocal(!live);
      work?.("website", only ? "pagePublished" : "siteDeployed", { detail: only ? `${only.url} · Webflow` : `${plan.length} items · Webflow CMS` });
      log?.(only ? `Published single item to Webflow CMS (${only.url}${live ? "" : ", demo"})` : `Deployed website to Webflow CMS (${plan.length} items${live ? "" : ", demo"})`, project.website);
      setDone(true);
      return;
    }

    if (live && cleanup) {
      try {
        await fetch("/api/wp/cleanup", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(120000),
          body: JSON.stringify({ ...auth, keepSlugs: plan.map((x) => x.node.url.split("/").filter(Boolean).pop() || "home") }) });
      } catch { /* cleanup failure is non-fatal — pages still deploy by slug */ }
    }
    if (live && builder === "custompush" && cleanup) {
      try {
        await fetch("/api/custom/deploy", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(60000),
          body: JSON.stringify({ site: project.website, siteKey, payload: { action: "cleanup", keep: plan.filter((x) => x.node.type !== "article").map((x) => x.node.url.replace(/^\//, "") || "/") } }) });
      } catch { /* non-fatal */ }
    }
    for (let i = 0; i < plan.length; i++) {
      mark(i, "creating");
      if (live && builder === "custompush") {
        const { node, page, chrome } = plan[i];
        const isPost = node.type === "article";
        const artIdx = articles.findIndex((a) => a.node.id === node.id);
        const cPayload = isPost
          ? { action: "deploy_post", slug: node.url.split("/").filter(Boolean).pop(), title: page.h1, metaDesc: page.metaDesc,
              publishAt: artIdx >= 0 ? dates[artIdx].getTime() : undefined, html: serializeHtml(page, chrome, ctx) }
          : { action: "deploy_page", path: node.url.replace(/^\//, ""), html: serializeHtml(page, chrome, ctx) };
        try {
          const r = await fetch("/api/custom/deploy", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(60000),
            body: JSON.stringify({ site: project.website, siteKey, payload: cPayload }) });
          const d = await r.json().catch(() => ({}));
          if (r.ok) mark(i, "done", d.scheduled ? "scheduled" : "published");
          else mark(i, "error", d.detail || `HTTP ${r.status}`);
        } catch (e) { mark(i, "error", String(e?.message || e)); }
        continue;
      }
      const payload = payloadFor(plan[i], i);
      if (live) {
        try {
          const r = await fetch("/api/wp/deploy", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(60000),
            body: JSON.stringify({ ...auth, payload }) });
          const d = await r.json().catch(() => ({}));
          if (r.ok) mark(i, "done", d.updated ? "updated" : "created");
          else mark(i, "error", d.detail || `HTTP ${r.status}`);
        } catch (e) { mark(i, "error", String(e?.message || e)); }
      } else {
        await new Promise((res) => setTimeout(res, 120)); // demo pacing
        mark(i, "done", "demo");
      }
    }
    mirrorLocal(!live);
    work?.("website", only ? "pagePublished" : "siteDeployed", { detail: only ? only.url : `${plan.length} pages, ${builder}` });
    log?.(only ? `Published single page ${only.url} (${builder}${live ? "" : ", demo"})` : `Deployed full website (${plan.length} pages, ${builder}${live ? "" : ", demo"})`, project.website);
    setDone(true);
  };
  /* mirror the deployed site into the Pages/Posts tabs (labeled when demo);
     single-page publishes UPSERT into the existing lists instead of replacing them */
  const mirrorLocal = (isDemo) => {
    const now = Date.now();
    if (only) {
      const item = plan[0];
      if (!item) return;
      const slug = item.node.url.split("/").filter(Boolean).pop() || "home";
      setOpt("website", (cur) => item.node.type === "article"
        ? {
            blogs: [
              { id: "db" + now, title: item.page.h1, slug, metaTitle: item.page.metaTitle, metaDesc: item.page.metaDesc, categories: [],
                ...(dates[0] && dates[0].getTime() > now
                  ? { status: "scheduled", scheduledAt: dates[0].getTime() }
                  : { status: "published", publishedAt: now }),
                createdAt: now, builder, deployed: true, demo: isDemo },
              ...(cur.blogs || []).filter((b) => b.slug !== slug),
            ],
            lastDeploy: now,
          }
        : {
            pages: [
              ...(cur.pages || []).filter((p) => p.url !== item.node.url),
              { id: "dp" + now, url: item.node.url, name: item.page.h1, metaTitle: item.page.metaTitle, metaDesc: item.page.metaDesc,
                dirty: false, updatedAt: now, builder, deployed: true, demo: isDemo },
            ],
            lastDeploy: now,
          });
      return;
    }
    setOpt("website", (cur) => ({
      ...(w.platform === "webflow" && wfSiteId.trim() ? { webflowSiteId: wfSiteId.trim() } : {}),
      pages: plan.filter((x) => x.node.type !== "article").map((x, i) => ({
        id: "dp" + now + i, url: x.node.url, name: x.page.h1, metaTitle: x.page.metaTitle, metaDesc: x.page.metaDesc,
        dirty: false, updatedAt: now, builder, deployed: true, demo: isDemo,
      })),
      blogs: [
        ...articles.map((x, i) => ({
          id: "db" + now + i, title: x.page.h1, slug: x.node.url.split("/").filter(Boolean).pop(),
          metaTitle: x.page.metaTitle, metaDesc: x.page.metaDesc, categories: [],
          status: "scheduled", scheduledAt: dates[i].getTime(), createdAt: now, builder, demo: isDemo,
        })),
        ...(cur.blogs || []).filter((b) => !b.deployed),
      ],
      lastDeploy: now,
    }));
  };

  const st = { pending: "text-gray-300", creating: "text-blue-500", done: "text-emerald-600", error: "text-red-500" };
  return (
    <Modal title={only ? `Publish single page — ${only.title}` : "Create full website from this map"}
      sub={only ? `${project.website}${only.url} · the rest of the site is untouched` : `${plan.length} pages · ${articles.length} scheduled posts · ${project.website}`} onClose={onClose} wide>
      {!progress ? (
        <div className="space-y-4">
          {/* 1 — builder choice */}
          <div>
            <div className="mb-1.5 text-[12.5px] font-bold text-gray-800">1 · Page building method</div>
            <div className="grid gap-2 sm:grid-cols-3">
              {BUILDERS.map((b) => (
                <button key={b.key} onClick={() => setBuilder(b.key)} className="rounded-xl border p-3 text-left"
                  style={builder === b.key ? { borderColor: accent, background: accent + "0A" } : { borderColor: "#E5E7EB" }}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[12.5px] font-bold text-gray-800">{b.label}</span>
                    <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase" style={{ background: accent + "18", color: accent }}>{b.badge}</span>
                  </div>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-gray-400">{b.desc}</p>
                </button>
              ))}
            </div>
          </div>
          {/* 2 — options (single-page mode: never cleans up; one date picker for a lone post) */}
          <div className={"grid gap-3 " + (only ? "" : "sm:grid-cols-2")}>
            {!only && (
              <div className="rounded-xl border border-gray-100 p-3">
                <Toggle on={cleanup} onChange={setCleanup} label="Remove ALL existing pages & posts first"
                  desc="Cleans the site before deploying the new map — old content is deleted permanently on the live site." />
              </div>
            )}
            {only && articles.length === 0 && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3.5 py-2.5 text-[11.5px] text-emerald-800">
                <b>Adds one page to the existing site.</b> No cleanup runs and nothing else is created, changed or removed —
                internal links on this page still follow the full site map.
              </div>
            )}
            {articles.length > 0 && (
              <div className="rounded-xl border border-gray-100 p-3">
                <div className="text-[12px] font-semibold text-gray-700">{only ? "Publish date (today = publish immediately)" : `Blog publishing schedule (${articles.length} posts)`}</div>
                <div className="mt-1.5 flex items-center gap-2 text-[12px] text-gray-500">
                  {only ? "publish on" : "start"} <input type="date" value={schedStart} onChange={(e) => setSchedStart(e.target.value)} className={inputCls + " w-auto"} />
                  {!only && <>every <input type="number" min={1} value={schedEvery} onChange={(e) => setSchedEvery(e.target.value)} className={inputCls + " w-16"} /> day(s)</>}
                </div>
                <div className="mt-1 text-[10px] text-gray-400">{only ? "A future date deploys the post as scheduled — it auto-publishes on that date." : 'Posts deploy as WordPress "scheduled" — they auto-publish on their dates.'}</div>
              </div>
            )}
          </div>
          {/* 3 — preflight */}
          <div className="rounded-xl bg-gray-50 p-3.5 text-[11.5px] leading-relaxed text-gray-600">
            <b className="text-gray-800">Preflight</b> · {plan.length} page{plan.length === 1 ? "" : "s"} ({withContent} with researched content — the rest use the SEO template)
            · reviews: {reviewSource ? "Google review source connected" : "demo reviews (add the review link in Branding & Automation → Properties)"}
            · NAP: {gbp.bizName ? gbp.bizName : "⚠ no GBP business info"} · media: {media.length ? `${media.length} synced items` : "none synced (Media tab) — pages deploy without images"}
            <br />Every page ships: meta ≤60/≤160 · single H1 + section H2/H3 · JSON-LD graph · smart sub-service links (city page first) · pricing · signs-you-need · why-{ctx.brand} · cities/neighborhood coverage · NAP + embedded map · FAQ schema · semantic header/footer — <b>fully responsive</b>, with CMS/theme layout, page-width and font defaults overridden so the design is 100% system-controlled.
          </div>
          {/* hero enquiry form: on the page, off the page, and where it lands */}
          <div className="space-y-2">
            <Toggle on={ctx.leadForm.enabled} onChange={() => leadTo && setLeadForm((v) => !v)}
              label="Hero enquiry form (name · email · phone · message)"
              desc={leadTo
                ? `Replaces the hero image with a real form — submissions are emailed to ${leadTo} and stored on the server as a backup.`
                : "⚠ No notification email — add one in Brand Voice → Business information → Email, then this turns on. Until then heroes ship with an image."} />
            {formNote && <div className="rounded-lg bg-gray-50 px-2.5 py-1.5 text-[11px] text-gray-600">{formNote}</div>}
          </div>
          {w.platform === "webflow" && builder === "webflowcms" && (
            <div className="rounded-xl border border-gray-100 p-3">
              <div className="text-[12px] font-semibold text-gray-700">Webflow Site ID</div>
              <input value={wfSiteId} onChange={(e) => setWfSiteId(e.target.value)} placeholder="e.g. 62f2…  (Site settings → General → Site ID)" className={"ll-mono mt-1 w-full " + inputCls} />
            </div>
          )}
          {builder === "export" && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3.5 py-2.5 text-[11.5px] text-gray-600">
              Custom-coded target: nothing is pushed anywhere — you get a ZIP with every page as <span className="ll-mono">/path/index.html</span>, plus <span className="ll-mono">sitemap.xml</span> and <span className="ll-mono">robots.txt</span>. Upload the extracted folder to your host's web root.
            </div>
          )}
          {canLive && (
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 p-1">
              {[["live", `Live — deploy to ${project.website}`], ["demo", "Demo run — generate only, don't touch the site"]].map(([k, l]) => (
                <button key={k} onClick={() => setMode(k)} className="flex-1 rounded-lg px-3 py-2 text-[11.5px] font-semibold"
                  style={mode === k ? { background: accent, color: "#fff" } : { color: "#6B7280" }}>{l}</button>
              ))}
            </div>
          )}
          {!live && builder !== "export" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11.5px] text-amber-800">
              <b>Demo deploy.</b> {canLive ? "Nothing touches the live site — pages are generated locally, labeled demo." : "WordPress isn't connected with a valid Application Password (user:xxxx… in the Connector tab) — pages are generated and shown in Pages/Posts labeled demo, but nothing touches a live site."}
            </div>
          )}
          {live && cleanup && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[11.5px] text-red-700">
              <b>Destructive:</b> this permanently deletes every existing page & post on {project.website} before deploying.
            </div>
          )}
          <button onClick={deploy} className="w-full rounded-xl py-3 text-[14px] font-bold text-white" style={{ background: accent }}>
            {only
              ? (builder === "export" ? `Download this page as a ZIP` : live ? `Publish ${only.url} to ${project.website}` : `Run demo publish (1 page)`)
              : (builder === "export" ? `Download static site ZIP (${plan.length} pages)` : live ? `Deploy ${plan.length} pages to ${project.website}` : `Run demo deploy (${plan.length} pages)`)}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {progress.map((r, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] hover:bg-gray-50">
                <span className={"ll-mono w-4 shrink-0 " + st[r.status]}>{r.status === "done" ? "✓" : r.status === "error" ? "✕" : r.status === "creating" ? "…" : "·"}</span>
                <span className="ll-mono min-w-0 flex-1 truncate text-gray-700">{r.url}</span>
                <span className={"shrink-0 text-[10px] " + st[r.status]}>{r.note || r.status}</span>
              </div>
            ))}
          </div>
          {done && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12px] text-emerald-800">
              {only
                ? <>Page published{live ? "" : " (demo)"} — it now appears in <b>{only.type === "article" ? "Posts" : "Pages"}</b>. The rest of the site was not touched.</>
                : <>Website deployed — pages are in <b>Pages</b>, scheduled posts in <b>Posts</b>{live ? "" : " (labeled demo)"}. Internal links, schema and the NAP/map block are baked into every page.</>}
            </div>
          )}
          <button onClick={onClose} className="w-full rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-600">{done ? "Close" : "Run in background (close)"}</button>
        </div>
      )}
    </Modal>
  );
}
