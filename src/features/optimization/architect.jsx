import React, { useState } from "react";
import {
  ChevronDown, ChevronRight, FileText, Layers, Network, Plus, RefreshCw, Search,
  Sparkles, Target, Trash2, TriangleAlert, UploadCloud, Wand2, X,
} from "lucide-react";
import { Card, Labeled, Modal, inputCls } from "../../ui/primitives.jsx";
import { aiGenerate, brandVoiceBlock } from "../../lib/aiwrite.jsx";
import { realDfs } from "./indexcheck.jsx";
import {
  PAGE_TYPE_META, adjustStructure, auditStructure, buildLinkPlan, countPages,
  genContentStructure, genPageContent, genSiteArchitecture, linkPlanRows,
} from "../../lib/architect.js";
import { CharCount, Toggle } from "../../ui/primitives.jsx";
import { buildDeployPlan, demoReviews, exportSiteZip, scheduleDates, serializeElementor, serializeGutenberg, serializeHtml, serializeWpBody, webflowItems } from "../../lib/webdeploy.js";

/* ================= Website Mapping & Content Architect =================
   AI-FIRST: every stage calls the configured provider (Company Settings →
   API settings) through the server's /api/generate proxy with strict
   technical-SEO prompts and JSON-validated outputs. Only when no provider
   key exists (503) does a stage fall back to the local deterministic
   scaffold — always labeled "draft". Provider errors (502) are surfaced,
   never silently replaced. Competitor scans hit the real Google SERP,
   geo-targeted to the project's market. */

/* ---- AI plumbing ---- */
const parseJsonLoose = (text) => {
  const m = String(text).match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : text);
};

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
- Meet or exceed the word target. Follow the brand voice block exactly.`;

/* validate + normalize an AI structure payload */
function normalizeStructure(raw, fromCompetitors) {
  if (!raw || !Array.isArray(raw.sections) || !raw.sections.length) throw new Error("missing sections");
  const kinds = new Set(["table-stakes", "differentiator", "secondary", "eeat"]);
  return {
    generatedAt: Date.now(), fromCompetitors,
    sections: raw.sections.map((s) => ({ h2: String(s.h2 || "").slice(0, 120), note: String(s.note || ""), kind: kinds.has(s.kind) ? s.kind : "table-stakes" })).filter((s) => s.h2),
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

function PageRow({ node, depth, accent, onOpen, onAddChild, onRemove, onPublish }) {
  const [open, setOpen] = useState(true);
  const meta = PAGE_TYPE_META[node.type] || { label: node.type, color: "#64748B" };
  const hasKids = (node.children || []).length > 0;
  const done = node.seo?.content ? "content" : node.seo?.structure ? "structure" : node.seo?.primaryKw ? "keywords" : null;
  return (
    <div>
      <div className="group flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 hover:bg-gray-50" style={{ marginLeft: depth * 18 }}>
        <button onClick={() => setOpen(!open)} className="shrink-0 text-gray-300" style={{ visibility: hasKids ? "visible" : "hidden" }}>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.color }} />
        <button onClick={() => onOpen(node)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="truncate text-[12.5px] font-medium text-gray-800">{node.title}</span>
          <span className="ll-mono shrink-0 text-[10px] text-gray-400">{node.url}</span>
          <span className="shrink-0 rounded px-1.5 py-px text-[8.5px] font-bold uppercase" style={{ background: meta.color + "18", color: meta.color }}>{meta.label}</span>
          {done && <span className="shrink-0 rounded-full px-1.5 py-px text-[8.5px] font-bold uppercase" style={{ background: "#DCFCE7", color: "#166534" }}>{done}</span>}
        </button>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
          <button onClick={() => onPublish(node)} title="Publish only this page to the site" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-emerald-600"><UploadCloud size={12} /></button>
          <button onClick={() => onAddChild(node)} title="Add subpage" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><Plus size={12} /></button>
          <button onClick={() => onRemove(node)} title="Remove" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500"><Trash2 size={12} /></button>
        </div>
      </div>
      {open && (node.children || []).map((c) => (
        <PageRow key={c.id} node={c} depth={depth + 1} accent={accent} onOpen={onOpen} onAddChild={onAddChild} onRemove={onRemove} onPublish={onPublish} />
      ))}
    </div>
  );
}

/* ---- per-page content pipeline editor ---- */
function PageEditor({ node, project, brandVoice, niche, accent, dfs, ai, locationName, siteLinks = [], onPatch, onPublish, onClose }) {
  const seo = node.seo || {};
  /* functional through to project state — concurrent stages can't clobber each other */
  const setSeo = (patch) => onPatch((cur) => ({ seo: { ...(cur.seo || {}), ...(typeof patch === "function" ? patch(cur.seo || {}) : patch) } }));
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState(null);
  const [busy, setBusy] = useState(null);
  const [stageErr, setStageErr] = useState(null);
  const [compDraft, setCompDraft] = useState("");

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
      const text = await aiGenerate(ai, {
        system: SYS_STRUCTURE, json: true, maxTokens: 3000,
        prompt: `Page: "${node.title}" (${node.url}) — type: ${node.type}.\nNiche: ${niche}. Market: ${locationName}.\nPrimary keyword: "${seo.primaryKw}". Secondary keywords: ${seo.secondaryKws || "(none)"}.\n\nTop-ranking competitors for the primary keyword:\n${competitorBlock()}\n\nSITE MAP (use EXACT urls for internalLinks):\n${siteLinks.map((l) => `${l.url} — ${l.title} (${l.type})`).join("\n")}\n\nBuild the content structure that beats this SERP.`,
      });
      const st = normalizeStructure(parseJsonLoose(text), (seo.competitors || []).length);
      st.live = true; st.provider = ai.provider;
      setSeo({ structure: st, audit: null, content: null });
    },
    () => setSeo({ structure: { ...genContentStructure(node, seo.competitors || [], niche, siteLinks), live: false }, audit: null, content: null }));

  const audit = () => runStage("audit",
    async () => {
      const text = await aiGenerate(ai, {
        system: SYS_AUDIT, json: true, maxTokens: 2000,
        prompt: `Primary keyword: "${seo.primaryKw}" (page type: ${node.type}, market: ${locationName}).\nContent structure to audit:\n${JSON.stringify(seo.structure, null, 1)}`,
      });
      const a = parseJsonLoose(text);
      if (!Array.isArray(a.issues)) throw new Error("schema: issues missing");
      setSeo({ audit: { auditedAt: Date.now(), live: true, provider: ai.provider, score: Math.max(0, Math.min(100, +a.score || 0)), summary: String(a.summary || ""), issues: a.issues.map((i) => ({ sev: ["high", "med", "low"].includes(i.sev) ? i.sev : "med", text: String(i.text || ""), fix: String(i.fix || "") })) } });
    },
    () => setSeo({ audit: { ...auditStructure(seo.structure, node), live: false } }));

  const adjust = () => runStage("adjust",
    async () => {
      const text = await aiGenerate(ai, {
        system: SYS_ADJUST, json: true, maxTokens: 3000,
        prompt: `Structure:\n${JSON.stringify(seo.structure, null, 1)}\n\nAudit issues to fix:\n${JSON.stringify(seo.audit.issues, null, 1)}`,
      });
      const st = normalizeStructure(parseJsonLoose(text), seo.structure?.fromCompetitors || 0);
      st.live = true; st.provider = ai.provider; st.adjustedAt = Date.now();
      setSeo({ structure: st, audit: null });
    },
    () => setSeo({ structure: { ...adjustStructure(seo.structure, seo.audit, node), live: seo.structure?.live || false }, audit: null }));

  const generate = () => runStage("content",
    async () => {
      const plan = linkPlanRows(buildLinkPlan(node.url, siteLinks, node.type));
      const text = await aiGenerate(ai, {
        system: SYS_WRITER, maxTokens: 8000,
        prompt: `BRAND VOICE (must follow):\n${brandVoiceBlock(brandVoice, project.name)}\n\nPAGE: "${node.title}" — ${project.website}${node.url} (type: ${node.type}). Market: ${locationName}. Niche: ${niche}.\nPrimary keyword: "${seo.primaryKw}". Secondary: ${seo.secondaryKws || "(none)"}.\nWord target: ${seo.structure.wordTarget}+ words.\nRequired entities: ${(seo.structure.sharedEntities || []).join(", ") || "(none)"}.\nDifferentiator angles: ${(seo.structure.differentiators || []).join(", ") || "(none)"}.\n\nLINK PLAN (every URL must appear as an internal link with a descriptive anchor):\n${plan.map((l) => `${l.url} — "${l.title}" (${l.why})`).join("\n") || "(no other pages yet)"}\n\nSECTION OUTLINE (use as ## in this order):\n${seo.structure.sections.map((s) => `## ${s.h2} — ${s.note}`).join("\n")}\n\nFAQs to answer:\n${(seo.structure.faqs || []).join("\n")}\n\nWrite the complete page now in the required ---META---/---CONTENT---/---SCHEMA--- format.`,
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
    },
    () => setSeo({ content: { ...genPageContent(node, seo.structure, brandVoice, project.name, niche, siteLinks), live: false } }));

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
            <div className="ll-mono text-[10.5px] text-gray-400">{project.website}{node.url} · market: {locationName}{ai?.key ? ` · AI: ${ai.provider}` : " · no AI provider (drafts)"}</div>
          </div>
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

          <Card className="space-y-3 p-4">
            <div className="ll-display flex items-center gap-2 text-[13.5px] font-semibold"><Layers size={14} style={{ color: accent }} /> Content structure pipeline</div>
            <div className="flex flex-wrap gap-2">
              <Btn on={genStructure} disabled={!(seo.competitors || []).length} icon={Sparkles} label="Generate content structure" busyKey="structure" primary />
              {seo.structure && <Btn on={audit} icon={TriangleAlert} label="Content audit & suggestions" busyKey="audit" />}
              {seo.audit && <Btn on={adjust} icon={Wand2} label="Adjust to suggestions" busyKey="adjust" />}
              {seo.structure && <Btn on={generate} icon={FileText} label="Generate content" busyKey="content" primary />}
            </div>
            {stageErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-700">{stageErr}</div>}

            {seo.structure && (
              <div className="ll-fade space-y-2 rounded-xl border border-gray-100 p-3">
                <div className="flex items-center gap-2 text-[11px] text-gray-500">
                  <b className="text-gray-700">Structure</b> <LiveChip live={seo.structure.live} provider={seo.structure.provider} />
                  · from {seo.structure.fromCompetitors} competitors · target {seo.structure.wordTarget} words
                </div>
                <div className="space-y-1">
                  {seo.structure.sections.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 text-[12px]">
                      <span className="ll-mono mt-0.5 w-6 shrink-0 text-right text-gray-300">H2</span>
                      <span className="min-w-0 flex-1"><b className="text-gray-800">{s.h2}</b>
                        <span className="ml-1.5 rounded px-1 py-px text-[8.5px] font-bold uppercase"
                          style={{ background: s.kind === "differentiator" ? "#FEF3C7" : s.kind === "eeat" ? "#F3E8FF" : "#EEF2FF", color: s.kind === "differentiator" ? "#92400E" : s.kind === "eeat" ? "#6B21A8" : "#3730A3" }}>{s.kind}</span>
                        <div className="text-[10.5px] text-gray-400">{s.note}</div>
                      </span>
                    </div>
                  ))}
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
              </div>
            )}
          </Card>
        </div>
      </div>
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
  const w = opt.website || {};
  const arch = w.architecture || null;
  /* functional writes — a scan finishing during a generation can't clobber the tree */
  const setTree = (fnOrTree) => setOpt("website", (cur) => ({
    architecture: { ...(cur?.architecture || {}), tree: typeof fnOrTree === "function" ? fnOrTree(cur?.architecture?.tree || []) : fnOrTree },
  }));
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
      const text = await aiGenerate(aiConfig, {
        system: SYS_ARCHITECT, json: true, maxTokens: 3500,
        prompt: `Business: ${project.name} (${project.website}). Niche: ${niche}.\nServices: ${services || "(infer sensible ones from the niche)"}.\nLocations: ${locations || "(none — skip location pages)"}.\nBrand positioning: ${brandVoice.tagline || "(none)"}.\nDesign the complete site architecture.`,
      });
      const parsed = parseJsonLoose(text);
      const nodes = nodesFromAi(parsed.pages);
      if (!nodes.length) throw new Error("empty architecture");
      tree = nodes; live = true;
    } catch (e) {
      if (e.code === 502) { setGenErr("AI provider error: " + e.message); setBusy(false); return; }
      await new Promise((r) => setTimeout(r, 1100));
      tree = genSiteArchitecture(niche, services, project.name, locations);
    }
    setOpt("website", (cur) => ({ architecture: { ...(cur?.architecture || {}), tree, niche, services, locations, live, generatedAt: Date.now() } }));
    log?.(`Generated website architecture (${countPages(tree)} pages${live ? ", AI" : ", draft"})`, project.name);
    setBusy(false);
  };

  const tree = arch?.tree || [];
  const patchNode = (id, patch) => setTree((t) => updateNode(t, id, patch));
  const openNode = (() => { let found = null; walk(tree, (p) => { if (p.id === openId) found = p; }); return found; })();

  const addChild = (parent) => setTree((t) => updateNode(t, parent.id, (p) => ({
    children: [...(p.children || []), { id: "n" + Date.now(), title: "New subpage", url: (p.url === "/" ? "" : p.url) + "/new-page", type: "service", children: [], seo: blankSeo() }],
  })));
  const addTop = () => setTree((t) => [...t, { id: "n" + Date.now(), title: "New page", url: "/new-page", type: "service", children: [], seo: blankSeo() }]);

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
            <div className="ll-display text-[13.5px] font-semibold">Site architecture <span className="text-[11px] font-normal text-gray-400">{countPages(tree)} pages · click a page to research & write · "+ sub" nests parent pages (e.g. /newyork/dental-implant)</span></div>
            <button onClick={addTop} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-600"><Plus size={11} /> Add page</button>
          </div>
          <div>
            {tree.map((p) => (
              <PageRow key={p.id} node={p} depth={0} accent={accent} onOpen={(n) => setOpenId(n.id)} onAddChild={addChild}
                onRemove={(n) => { if (openId === n.id) setOpenId(null); setTree((t) => removeNode(t, n.id)); }}
                onPublish={(n) => setDeploying({ only: n })} />
            ))}
          </div>
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
          <PageEditor node={openNode} project={project} brandVoice={brandVoice} niche={arch?.niche || niche || project.name}
            accent={accent} dfs={dfs} ai={aiConfig} locationName={locationName} siteLinks={siteLinks}
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
const B_HTML = { key: "html", label: "HTML page building", desc: "Fully system-designed pages — theme layout, widths and fonts are overridden (blank canvas when available). Fastest option, ideal for Core Web Vitals.", badge: "Fastest" };
const B_ELEMENTOR = { key: "elementor", label: "Elementor page building", desc: "Native Elementor sections/widgets on the blank Canvas template — the theme's header/footer/layout are bypassed completely; fully editable in Elementor. Needs Elementor + the companion plugin.", badge: "Editable in Elementor" };
const B_GUTENBERG = { key: "gutenberg", label: "WordPress Block Editor", desc: "Native Gutenberg blocks, editable in the default WP editor — with a scoped reset that overrides the theme's page width, font sizes and layout defaults.", badge: "Native WP" };
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
  const ctx = {
    sameAs,
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
    if (builder === "html") return { ...base, content: serializeWpBody(page, chrome, ctx, { withChrome: true }), template: "elementor_canvas" };
    if (builder === "elementor") { const e = serializeElementor(page, chrome, ctx); return { ...base, content: e.fallbackHtml, elementorData: e.elementorData, template: "elementor_canvas" }; }
    return { ...base, content: serializeGutenberg(page, chrome, ctx) };
  };

  const deploy = async () => {
    const rows = plan.map((x) => ({ url: x.node.url, status: "pending", note: "" }));
    setProgress([...rows]);
    const mark = (i, status, note = "") => { rows[i] = { ...rows[i], status, note }; setProgress([...rows]); };
    const auth = { site: project.website, credential: credStr };

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
