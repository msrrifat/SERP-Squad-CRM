/* =====================================================================
   RE-OPTIMIZE WIZARD — for pages/posts crawled from a sitemap (site not
   connected, so no live editing) and reusable anywhere a URL needs a
   rewrite. A sequential stepper: each step unlocks when the previous one
   is done, and every step's state is saved on the page entry so work can
   be resumed later.

   1 Scrape      — pull the live content (meta, H1, structure, body)
   2 Keywords    — primary + secondary + research depth checklist
   3 Local       — target city + forced local optimization
   4 Rules       — optimization tasks, structure mode, section lengths
   5 Competitors — scan/add rivals; their structures feed the writer
   6 Generate    — write the optimized content under the STRICT contract
   7 Download    — PDF (print) or .doc (Word-openable HTML)

   Nothing is faked: without an AI provider the generate step reports 503
   honestly instead of producing a fabricated "optimized" page.
   ===================================================================== */
import React, { useState } from "react";
import {
  CheckCircle2, Download, FileText, Globe, RefreshCw, Search, Sparkles, Target, X,
} from "lucide-react";
import { Card, Labeled, inputCls } from "../../ui/primitives.jsx";
import { aiGenerate, brandVoiceBlock } from "../../lib/aiwrite.jsx";
import { OptimizeControls, ResearchChecklist, defaultOptimizeSpec, optimizeRulesBlock } from "../../lib/optimizespec.jsx";
import { realDfs } from "./indexcheck.jsx";
import { useWork } from "../../lib/worklog.jsx";
import { seoGuideBlock } from "../../lib/seoknowledge.js";

const SYS_REOPT = `You are a senior SEO content strategist and writer who rewrites existing pages to outrank the current SERP.
You write for humans first: concrete, specific, zero filler, no AI-sounding openers.
Output EXACTLY this format and nothing else:
---META---
Title: <meta title, primary keyword front-loaded, ≤60 chars>
Description: <meta description, ≤160 chars, benefit + CTA>
---CONTENT---
<pure markdown: one H1, then ## sections (### where a section has sub-blocks)>
---NOTES---
<3-6 bullet lines: what you changed and why, each starting with "- ">` + "\n\n" + seoGuideBlock("writing", "titles", "links");

/* Word-openable .doc (HTML with the Word MIME header) — no dependencies */
const downloadDoc = (filename, title, markdown, meta) => {
  const html = markdown
    .split(/\n{2,}/)
    .map((b) => {
      const t = b.trim();
      if (/^### /.test(t)) return `<h3>${t.slice(4)}</h3>`;
      if (/^## /.test(t)) return `<h2>${t.slice(3)}</h2>`;
      if (/^# /.test(t)) return `<h1>${t.slice(2)}</h1>`;
      if (/^[-*] /m.test(t)) return `<ul>${t.split("\n").map((l) => `<li>${l.replace(/^[-*]\s*/, "")}</li>`).join("")}</ul>`;
      if (/^\d+[.)] /m.test(t)) return `<ol>${t.split("\n").map((l) => `<li>${l.replace(/^\d+[.)]\s*/, "")}</li>`).join("")}</ol>`;
      return `<p>${t.replace(/\n/g, " ")}</p>`;
    })
    .join("\n")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Calibri,Arial,sans-serif;line-height:1.6;color:#1a1a1a}h1{font-size:24pt}h2{font-size:16pt;margin-top:18pt}h3{font-size:13pt}p,li{font-size:11pt}.meta{background:#f2f4f7;padding:10pt;margin-bottom:14pt;font-size:10pt}</style></head>
<body><div class="meta"><b>Meta title:</b> ${meta.metaTitle || ""}<br><b>Meta description:</b> ${meta.metaDesc || ""}<br><b>URL:</b> ${meta.url || ""}</div>
${html}</body></html>`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([doc], { type: "application/msword" }));
  a.download = filename + ".doc";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
/* PDF via the browser's own print-to-PDF on a clean printable document */
const downloadPdf = (title, markdown, meta) => {
  const win = window.open("", "_blank");
  if (!win) return;
  const body = markdown
    .split(/\n{2,}/)
    .map((b) => {
      const t = b.trim();
      if (/^### /.test(t)) return `<h3>${t.slice(4)}</h3>`;
      if (/^## /.test(t)) return `<h2>${t.slice(3)}</h2>`;
      if (/^# /.test(t)) return `<h1>${t.slice(2)}</h1>`;
      if (/^[-*] /m.test(t)) return `<ul>${t.split("\n").map((l) => `<li>${l.replace(/^[-*]\s*/, "")}</li>`).join("")}</ul>`;
      return `<p>${t.replace(/\n/g, " ")}</p>`;
    })
    .join("\n")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>@page{margin:18mm}body{font:12pt/1.65 -apple-system,Segoe UI,Roboto,sans-serif;color:#15202b;max-width:190mm}h1{font-size:22pt;margin:0 0 10pt}h2{font-size:15pt;margin:16pt 0 6pt}h3{font-size:12.5pt;margin:12pt 0 4pt}p,li{font-size:11pt}.meta{background:#f2f4f7;padding:8pt 10pt;border-radius:6pt;font-size:9.5pt;margin-bottom:12pt}</style>
</head><body><div class="meta"><b>Meta title:</b> ${meta.metaTitle || ""}<br><b>Meta description:</b> ${meta.metaDesc || ""}<br><b>URL:</b> ${meta.url || ""}</div>${body}</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 350);
};

const StepShell = ({ n, title, done, open, locked, onToggle, children, accent }) => (
  <div className="rounded-xl border" style={{ borderColor: done ? accent + "55" : "#E5E7EB", opacity: locked ? 0.55 : 1 }}>
    <button onClick={() => !locked && onToggle()} disabled={locked}
      className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ background: done ? "#16A34A" : locked ? "#CBD5E1" : accent }}>{done ? "✓" : n}</span>
      <span className="min-w-0 flex-1 text-[12px] font-bold text-gray-800">{title}</span>
      {locked && <span className="shrink-0 text-[9.5px] font-semibold uppercase text-gray-400">finish step {n - 1}</span>}
    </button>
    {open && !locked && <div className="space-y-3 border-t border-gray-100 px-3 py-3">{children}</div>}
  </div>
);

export function ReoptimizePanel({ item, kind = "page", project, opt, setOpt, accent, ai, dfs, onPatch, onClose }) {
  const work = useWork();
  const ro = item.reopt || {};
  const [step, setStep] = useState(ro.content ? 6 : ro.scrape ? 2 : 1);
  const [spec, setSpec] = useState(ro.spec || defaultOptimizeSpec(project.tracking?.[0]?.city?.city || ""));
  const [kw, setKw] = useState(ro.kw || { primary: "", secondary: "" });
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const brandVoice = opt.brandVoice || {};
  const w = opt.website || {};
  const absUrl = item.absUrl || (project.website.startsWith("http") ? project.website : "https://" + project.website) + (item.url || "/" + (item.slug || ""));

  /* every step writes through to the page entry, so work resumes later */
  const saveRo = (patch) => onPatch({ reopt: { ...ro, ...patch, savedAt: Date.now() } });

  /* 1 — scrape the live content */
  const scrape = async () => {
    setBusy("scrape"); setErr(null);
    try {
      const r = await fetch("/api/crawl/page", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(45000), body: JSON.stringify({ url: absUrl }) });
      const d = await r.json();
      if (!r.ok) { setErr(d.detail || d.error); setBusy(null); return; }
      saveRo({ scrape: { at: Date.now(), metaTitle: d.metaTitle, metaDesc: d.metaDesc, h1: d.h1, markdown: d.markdown, headings: d.headings, words: d.words } });
      work?.("website", "pageScraped", { detail: item.url });
      setStep(2);
    } catch (e) { setErr("API server unreachable — " + (e?.message || e)); }
    setBusy(null);
  };

  /* 5 — competitor scan for the primary keyword */
  const scanComp = async () => {
    if (!kw.primary.trim()) return;
    setBusy("comp"); setErr(null);
    const c0 = project.tracking?.[0]?.city;
    const locationName = spec.local?.city || (c0 ? `${c0.city},${c0.region},${c0.country}` : "United States");
    try {
      const r = await fetch("/api/serp-top", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(45000),
        body: JSON.stringify({ keyword: kw.primary.trim(), count: 5, location_name: locationName, dfs: realDfs(dfs) }) });
      const d = await r.json();
      if (!r.ok) { setErr(d.detail || d.error); setBusy(null); return; }
      /* pull each rival's heading structure so the writer can beat it */
      const rivals = [];
      for (const c of (d.results || []).slice(0, 5)) {
        try {
          const pr = await fetch("/api/crawl/page", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000), body: JSON.stringify({ url: c.url }) });
          const pd = await pr.json();
          rivals.push({ url: c.url, title: c.title, headings: pr.ok ? (pd.headings || []).slice(0, 20) : [], words: pr.ok ? pd.words : null });
        } catch { rivals.push({ url: c.url, title: c.title, headings: [], words: null }); }
      }
      saveRo({ competitors: rivals });
      setStep(6);
    } catch (e) { setErr("Competitor scan failed — " + (e?.message || e)); }
    setBusy(null);
  };

  /* 6 — generate under the strict contract */
  const generate = async () => {
    setBusy("gen"); setErr(null);
    const sc = ro.scrape || {};
    const comp = ro.competitors || [];
    const sitePages = [
      ...(w.pages || []).map((p) => ({ url: p.url, title: p.name || p.metaTitle || p.url })),
      ...(w.blogs || []).map((b) => ({ url: "/" + (b.slug || ""), title: b.title })),
    ].filter((p) => p.url !== item.url).slice(0, 40);
    try {
      const text = await aiGenerate(ai, {
        system: SYS_REOPT, maxTokens: 8000,
        prompt: `BRAND VOICE (follow exactly):\n${brandVoiceBlock(brandVoice, project.name.split(" — ")[0], opt.branding?.properties || null)}\n\n`
          + `${optimizeRulesBlock({ ...spec, local: spec.local }, { hasExisting: !!sc.markdown })}\n\n`
          + `PAGE: ${absUrl} (${kind})\nPrimary keyword(s): ${kw.primary || "(none given — infer from the content)"}\nSecondary keywords: ${kw.secondary || "(none)"}\n\n`
          + (sc.markdown ? `EXISTING CONTENT (${sc.words} words) — the current page, scraped live:\n${sc.markdown.slice(0, 14000)}\n\n` : "")
          + (comp.length ? `COMPETITOR STRUCTURES (the pages currently ranking — cover what they cover, then go further):\n${comp.map((c, i) => `${i + 1}. ${c.title} — ${c.url}${c.words ? ` (${c.words} words)` : ""}\n${(c.headings || []).join("\n")}`).join("\n\n").slice(0, 8000)}\n\n` : "")
          + (sitePages.length ? `LINK PLAN — internal links available on this site (use descriptive anchors, each URL at most once):\n${sitePages.map((p) => `${p.url} — ${p.title}`).join("\n")}\n\n` : "")
          + `Write the fully optimized page now in the required ---META---/---CONTENT---/---NOTES--- format.`,
      });
      const metaM = text.match(/---META---([\s\S]*?)---CONTENT---/);
      const contentM = text.match(/---CONTENT---([\s\S]*?)(?:---NOTES---|$)/);
      const notesM = text.match(/---NOTES---([\s\S]*)$/);
      const md = (contentM ? contentM[1] : text).trim();
      if (!/^#\s/m.test(md)) throw new Error("the model returned no H1 — try Generate again");
      saveRo({
        spec, kw,
        content: {
          at: Date.now(), provider: ai?.provider, markdown: md,
          metaTitle: (metaM?.[1].match(/Title:\s*(.+)/) || [])[1]?.trim() || "",
          metaDesc: (metaM?.[1].match(/Description:\s*(.+)/) || [])[1]?.trim() || "",
          notes: (notesM?.[1] || "").split("\n").map((l) => l.replace(/^-\s*/, "").trim()).filter(Boolean).slice(0, 8),
          words: md.split(/\s+/).length,
        },
      });
      work?.("website", "contentReoptimized", { detail: item.url });
      setStep(7);
    } catch (e) {
      setErr(e.code === 503 ? "No AI provider connected — add a key in Company Settings → API settings. Nothing is generated without one." : String(e?.message || e));
    }
    setBusy(null);
  };

  const sc = ro.scrape, gen = ro.content;
  const title = item.name || item.title || item.url;
  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-2">
        <Sparkles size={14} className="mt-0.5 shrink-0" style={{ color: accent }} />
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-bold text-gray-800">Re-optimize content</div>
          <div className="ll-mono truncate text-[10px] text-gray-400">{item.url}</div>
        </div>
        {onClose && <button onClick={onClose} className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100"><X size={14} /></button>}
      </div>
      {!ai?.key && <div className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10.5px] text-amber-700">No AI provider connected — steps 1-5 work, generation needs a key in API settings.</div>}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[10.5px] text-red-700">{err}</div>}

      <StepShell n={1} title="Scrape the live content" accent={accent} done={!!sc} open={step === 1} onToggle={() => setStep(step === 1 ? 0 : 1)}>
        <div className="text-[10.5px] leading-relaxed text-gray-500">Pulls the page as it is right now — meta, H1, heading structure and body copy — so the rewrite improves the real thing.</div>
        <button onClick={scrape} disabled={busy === "scrape"} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold text-white disabled:opacity-50" style={{ background: accent }}>
          {busy === "scrape" ? <><RefreshCw size={11} className="animate-spin" /> Scraping…</> : <><Globe size={11} /> {sc ? "Re-scrape" : "Scrape page"}</>}
        </button>
        {sc && (
          <div className="space-y-1 rounded-lg bg-gray-50 p-2 text-[10.5px] text-gray-600">
            <div><b>{sc.words}</b> words · <b>{(sc.headings || []).length}</b> headings</div>
            <div className="truncate"><b>Title:</b> {sc.metaTitle || "(none)"}</div>
            <div className="line-clamp-2"><b>Meta:</b> {sc.metaDesc || "(none)"}</div>
          </div>
        )}
      </StepShell>

      <StepShell n={2} title="Keywords & research depth" accent={accent} done={!!kw.primary.trim()} locked={!sc} open={step === 2} onToggle={() => setStep(step === 2 ? 0 : 2)}>
        <Labeled label="Primary keyword(s) — the page's main intent">
          <input value={kw.primary} onChange={(e) => setKw({ ...kw, primary: e.target.value })} placeholder="property renovation york" className={inputCls} />
        </Labeled>
        <Labeled label="Secondary keywords (comma-separated)">
          <textarea value={kw.secondary} onChange={(e) => setKw({ ...kw, secondary: e.target.value })} rows={2} placeholder="home refurbishment, house remodeling cost" className={inputCls + " resize-y"} />
        </Labeled>
        <ResearchChecklist spec={spec} onChange={setSpec} accent={accent} />
        <button onClick={() => { saveRo({ kw, spec }); setStep(3); }} disabled={!kw.primary.trim()}
          className="rounded-lg px-3 py-1.5 text-[11.5px] font-bold text-white disabled:opacity-40" style={{ background: accent }}>Save &amp; continue</button>
      </StepShell>

      <StepShell n={3} title="Local optimization" accent={accent} done={!!ro.localDone} locked={!kw.primary.trim()} open={step === 3} onToggle={() => setStep(step === 3 ? 0 : 3)}>
        <div className="rounded-xl border border-gray-100 p-2.5">
          <Labeled label="Target city"><input value={spec.local?.city || ""} onChange={(e) => setSpec({ ...spec, local: { ...spec.local, city: e.target.value } })} placeholder="York" className={inputCls} /></Labeled>
          <label className="mt-2 flex cursor-pointer items-start gap-2">
            <input type="checkbox" checked={!!spec.local?.forced} onChange={(e) => setSpec({ ...spec, local: { ...spec.local, forced: e.target.checked } })} className="mt-0.5" />
            <span>
              <span className="block text-[11.5px] font-semibold text-gray-700">Forced local optimization</span>
              <span className="block text-[10px] leading-snug text-gray-400">Pushes the writer to use real neighborhoods, landmarks, local context, near-me phrasing and a city-specific FAQ — maximum relevance for {spec.local?.city || "the city"}.</span>
            </span>
          </label>
        </div>
        <button onClick={() => { saveRo({ spec, localDone: true }); setStep(4); }} className="rounded-lg px-3 py-1.5 text-[11.5px] font-bold text-white" style={{ background: accent }}>Save &amp; continue</button>
      </StepShell>

      <StepShell n={4} title="Optimization rules & lengths" accent={accent} done={!!ro.rulesDone} locked={!ro.localDone} open={step === 4} onToggle={() => setStep(step === 4 ? 0 : 4)}>
        <OptimizeControls spec={spec} onChange={setSpec} accent={accent} />
        <button onClick={() => { saveRo({ spec, rulesDone: true }); setStep(5); }} className="rounded-lg px-3 py-1.5 text-[11.5px] font-bold text-white" style={{ background: accent }}>Save &amp; continue</button>
      </StepShell>

      <StepShell n={5} title="Competitors to beat" accent={accent} done={!!(ro.competitors || []).length} locked={!ro.rulesDone} open={step === 5} onToggle={() => setStep(step === 5 ? 0 : 5)}>
        <div className="text-[10.5px] leading-relaxed text-gray-500">Scans the live SERP for "{kw.primary || "the primary keyword"}" and reads each ranking page's heading structure, so the rewrite covers everything they cover and more.</div>
        <button onClick={scanComp} disabled={busy === "comp" || !kw.primary.trim()} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold text-white disabled:opacity-50" style={{ background: accent }}>
          {busy === "comp" ? <><RefreshCw size={11} className="animate-spin" /> Scanning &amp; reading…</> : <><Search size={11} /> Scan top 5 competitors</>}
        </button>
        {(ro.competitors || []).map((c, i) => (
          <div key={i} className="rounded-lg border border-gray-100 px-2 py-1.5">
            <div className="truncate text-[10.5px] font-semibold text-gray-700">{c.title}</div>
            <div className="ll-mono truncate text-[9.5px] text-gray-400">{c.url} · {c.headings.length} headings{c.words ? ` · ${c.words} words` : ""}</div>
          </div>
        ))}
        {(ro.competitors || []).length > 0 && <button onClick={() => setStep(6)} className="rounded-lg px-3 py-1.5 text-[11.5px] font-bold text-white" style={{ background: accent }}>Continue</button>}
      </StepShell>

      <StepShell n={6} title="Generate optimized content" accent={accent} done={!!gen} locked={!(ro.competitors || []).length} open={step === 6} onToggle={() => setStep(step === 6 ? 0 : 6)}>
        <button onClick={generate} disabled={busy === "gen" || !ai?.key} className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12px] font-bold text-white disabled:opacity-40" style={{ background: accent }}>
          {busy === "gen" ? <><RefreshCw size={12} className="animate-spin" /> Writing…</> : <><FileText size={12} /> {gen ? "Regenerate" : "Generate content"}</>}
        </button>
        {gen && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-gray-500">
              <CheckCircle2 size={11} className="text-emerald-600" /> {gen.words} words · AI: {gen.provider || "live"}
            </div>
            <Labeled label="Meta title"><input value={gen.metaTitle} onChange={(e) => saveRo({ content: { ...gen, metaTitle: e.target.value } })} className={inputCls} /></Labeled>
            <Labeled label="Meta description"><input value={gen.metaDesc} onChange={(e) => saveRo({ content: { ...gen, metaDesc: e.target.value } })} className={inputCls} /></Labeled>
            {(gen.notes || []).length > 0 && (
              <div className="rounded-lg bg-emerald-50 p-2 text-[10.5px] text-emerald-800">
                <b>What changed</b>
                <ul className="mt-0.5 list-disc pl-4">{gen.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
              </div>
            )}
            <textarea value={gen.markdown} onChange={(e) => saveRo({ content: { ...gen, markdown: e.target.value, words: e.target.value.split(/\s+/).length } })}
              rows={14} className={"ll-mono " + inputCls + " resize-y text-[10.5px] leading-relaxed"} />
          </div>
        )}
      </StepShell>

      <StepShell n={7} title="Download" accent={accent} done={false} locked={!gen} open={step === 7} onToggle={() => setStep(step === 7 ? 0 : 7)}>
        <div className="text-[10.5px] text-gray-500">The content stays saved on this {kind} — reopen any time to edit or regenerate.</div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => downloadPdf(title, gen.markdown, { ...gen, url: absUrl })}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold text-white" style={{ background: accent }}>
            <Download size={11} /> PDF
          </button>
          <button onClick={() => downloadDoc(String(title).replace(/\W+/g, "-").slice(0, 40) || "content", title, gen.markdown, { ...gen, url: absUrl })}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11.5px] font-bold" style={{ borderColor: accent, color: accent }}>
            <Download size={11} /> Word (.doc)
          </button>
        </div>
      </StepShell>
    </div>
  );
}
