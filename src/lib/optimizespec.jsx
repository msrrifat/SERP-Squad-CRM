/* =====================================================================
   OPTIMIZATION SPEC — the shared rule engine for every content generator
   (Website Mapping page writer + the Re-optimize wizard for crawled sites).

   One spec object describes exactly HOW a page must be written:
   - keyword research depth (entities, semantic terms, authority verbs,
     synonyms, FAQs)
   - local optimization (target city + FORCED local mode: neighborhoods,
     landmarks, service-area language woven through the copy)
   - the optimization tasks to perform (meta, internal links, related
     services section, structure handling mode) and per-section length
     targets (hero ≈200 chars, H2 ≈500, H3 ≈280 — all customizable)

   optimizeRulesBlock() turns the spec into a STRICT prompt contract the
   AI writer must follow; the UI components render the same spec so both
   generators share one source of truth.
   ===================================================================== */
import React from "react";
import { Labeled, Toggle, inputCls } from "../ui/primitives.jsx";

export const defaultOptimizeSpec = (city = "") => ({
  research: { entities: true, semantic: true, verbs: true, synonyms: true, faqs: true },
  local: { city, forced: false },
  tasks: { meta: true, internalLinks: true, relatedServices: true, ctas: true, trust: true, aeo: false },
  structureMode: "flexible", // exact | flexible | extend | new
  lengths: { hero: 200, h2: 500, h3: 280 },
});

export const STRUCTURE_MODES = [
  ["exact", "Exact content structure & word limits", "Keep every existing section in order and match its length precisely."],
  ["flexible", "Same structure, flexible paragraph lengths", "Keep the section structure but rebalance paragraph lengths for better design consistency."],
  ["extend", "Add new sections, keep old structure", "Existing sections stay as they are; add new high-value sections around them."],
  ["new", "Create a new content structure", "Design the best-possible structure from the research — the old structure is reference only."],
];

/* the STRICT contract — generators append this to every writing prompt */
export function optimizeRulesBlock(spec, { hasExisting = false } = {}) {
  const s = spec || defaultOptimizeSpec();
  const r = s.research || {}, t = s.tasks || {}, L = s.lengths || {};
  const lines = [];
  lines.push("OPTIMIZATION RULES — this is a STRICT CONTRACT. Every rule below is mandatory; an output violating ANY rule is a failed output.");

  /* keyword research behaviors */
  const research = [];
  if (r.entities) research.push("identify and naturally weave in the ENTITIES a top-ranking page on this topic must cover (tools, materials, standards, brands, regulations)");
  if (r.semantic) research.push("cover SEMANTICALLY RELATED terms and co-occurring phrases (LSI-style breadth), never keyword-stuffed");
  if (r.verbs) research.push("use precise, authoritative RELATED VERBS of the trade (e.g. assess, spec, install, certify, remediate) instead of generic verbs");
  if (r.synonyms) research.push("rotate KEYWORD SYNONYMS and close variants across headings and body so no phrase is repeated mechanically");
  if (r.faqs) research.push("research the real QUESTIONS people ask about this topic and answer them in a FAQ section (questions as bold text or H3s, concise genuinely-useful answers)");
  if (research.length) lines.push("KEYWORD RESEARCH DEPTH — while writing you MUST: " + research.join("; ") + ".");

  /* local optimization */
  if (s.local?.city) {
    lines.push(`LOCAL TARGET — the page targets ${s.local.city}. The city MUST appear in: the H1 or first heading, the meta title, the first 100 words, and at least one H2.`);
    if (s.local.forced) lines.push(`FORCED LOCAL OPTIMIZATION (maximum local relevance) — additionally you MUST: name real neighborhoods/districts/suburbs of ${s.local.city} where relevant; reference local context (landmarks, housing stock, weather/climate factors, local regulations or permit norms) where it genuinely affects the service; include "near me"-style phrasing at least once naturally; write at least one FAQ that is city-specific; mention the service area around ${s.local.city}. Never invent fake addresses or reviews — local FLAVOR, not fabricated facts.`);
  }

  /* task list */
  if (t.meta) lines.push("META — produce an optimized meta title (≤60 chars, primary keyword front-loaded, brand suffixed) and meta description (≤160 chars, benefit + CTA).");
  if (t.internalLinks) lines.push("INTERNAL LINKS — every URL in the LINK PLAN must appear exactly once as a markdown link with a descriptive anchor, woven into sentences (never 'click here', never a bare list of links).");
  if (t.relatedServices) lines.push('RELATED SERVICES — include an "Other related services we provide" (or naturally-titled equivalent) section near the end that briefly describes sibling services and internal-links each one.');
  if (t.ctas) lines.push("CTAS — place a short conversion nudge (1-2 sentences with a contact/booking link) after the intro and before the final section; the closing section is a clear call to action.");
  if (t.trust) lines.push("TRUST SIGNALS — weave in the brand's real proof points from the brand block (guarantees, credentials, review presence). Never invent numbers, awards or reviews.");
  if (t.aeo) lines.push("AI-SEARCH READY (AEO) — open every major section with a direct 1-2 sentence answer to the section's implicit question before elaborating, so answer engines can quote it.");

  /* structure handling */
  const mode = s.structureMode || "flexible";
  if (hasExisting) {
    if (mode === "exact") lines.push("STRUCTURE — keep the EXACT existing section structure, order and heading intent, and match each section's current length within ±10%. Improve the writing, not the skeleton.");
    if (mode === "flexible") lines.push("STRUCTURE — keep the existing sections and their order, but you MAY rebalance paragraph lengths for readability and design consistency (respect the per-section length targets below).");
    if (mode === "extend") lines.push("STRUCTURE — keep every existing section (same order, same topics) AND add the missing high-value sections the research reveals (mark nothing as removed).");
    if (mode === "new") lines.push("STRUCTURE — design the best-possible new structure from the research; treat the existing content only as source material for facts and phrasing worth keeping.");
  }

  /* length contract */
  lines.push(`SECTION LENGTH TARGETS (±15%) — intro/hero paragraph under the H1: ≈${L.hero || 200} characters; each H2 section body: ≈${L.h2 || 500} characters; each H3 sub-block body: ≈${L.h3 || 280} characters. Consistent section rhythm is part of the design — respect it.`);
  lines.push("QUALITY BAR — concrete and specific over generic, active voice, no filler sentences, no AI-sounding openers ('In today's world…'), keyword use natural (primary keyword in first 100 words; never stuffed).");
  return lines.join("\n");
}

/* ---------- shared UI ---------- */
const Check = ({ on, onChange, label, hint }) => (
  <label className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 hover:bg-gray-50">
    <input type="checkbox" checked={!!on} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-current" />
    <span className="min-w-0">
      <span className="block text-[11.5px] font-semibold text-gray-700">{label}</span>
      {hint && <span className="block text-[10px] leading-snug text-gray-400">{hint}</span>}
    </span>
  </label>
);

/* keyword research depth — embeds inside the host's keywords card */
export function ResearchChecklist({ spec, onChange, accent }) {
  const r = spec?.research || {};
  const set = (k) => (v) => onChange({ ...spec, research: { ...r, [k]: v } });
  return (
    <div className="rounded-xl border border-gray-100 p-2.5" style={{ borderColor: accent + "33" }}>
      <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-gray-400">Research while writing</div>
      <div className="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-3">
        <Check on={r.entities} onChange={set("entities")} label="Entities" hint="tools, materials, standards a top page must cover" />
        <Check on={r.semantic} onChange={set("semantic")} label="Semantic terms" hint="related co-occurring phrases" />
        <Check on={r.verbs} onChange={set("verbs")} label="Authority verbs" hint="precise trade verbs, not generic ones" />
        <Check on={r.synonyms} onChange={set("synonyms")} label="Keyword synonyms" hint="natural variants across headings" />
        <Check on={r.faqs} onChange={set("faqs")} label="FAQs" hint="real questions people ask, answered" />
      </div>
    </div>
  );
}

/* local optimization + optimization tasks + length targets */
export function OptimizeControls({ spec, onChange, accent }) {
  const s = spec || defaultOptimizeSpec();
  const t = s.tasks || {}, L = s.lengths || {};
  const setTask = (k) => (v) => onChange({ ...s, tasks: { ...t, [k]: v } });
  const setLen = (k) => (v) => onChange({ ...s, lengths: { ...L, [k]: Math.max(60, Math.min(2000, +v || 0)) } });
  return (
    <div className="space-y-3">
      {/* local optimization */}
      <div className="rounded-xl border border-gray-100 p-3">
        <div className="mb-1.5 text-[11.5px] font-bold text-gray-700">Local optimization</div>
        <div className="flex flex-wrap items-center gap-3">
          <input value={s.local?.city || ""} onChange={(e) => onChange({ ...s, local: { ...s.local, city: e.target.value } })}
            placeholder="Target city (e.g. York)" className={inputCls + " w-52"} />
          <Toggle on={!!s.local?.forced} onChange={(v) => onChange({ ...s, local: { ...s.local, forced: v } })}
            label="Forced local optimization"
            desc="Pushes the writer to use real neighborhoods, landmarks, local context and near-me phrasing — maximum city relevance." />
        </div>
      </div>
      {/* tasks */}
      <div className="rounded-xl border border-gray-100 p-3">
        <div className="mb-1.5 text-[11.5px] font-bold text-gray-700">Optimization tasks</div>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Check on={t.meta} onChange={setTask("meta")} label="Create meta title & description" />
          <Check on={t.internalLinks} onChange={setTask("internalLinks")} label="Internal-link to related pages" />
          <Check on={t.relatedServices} onChange={setTask("relatedServices")} label={'"Other related services" section + links'} />
          <Check on={t.ctas} onChange={setTask("ctas")} label="CTA nudges between sections" />
          <Check on={t.trust} onChange={setTask("trust")} label="Weave real trust signals" hint="from Brand Voice facts — never invented" />
          <Check on={t.aeo} onChange={setTask("aeo")} label="AI-search ready (AEO)" hint="direct answers open every section" />
        </div>
      </div>
      {/* structure mode */}
      <div className="rounded-xl border border-gray-100 p-3">
        <div className="mb-1.5 text-[11.5px] font-bold text-gray-700">Content structure handling</div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {STRUCTURE_MODES.map(([key, label, hint]) => (
            <label key={key} className="flex cursor-pointer items-start gap-2 rounded-lg border p-2 hover:bg-gray-50"
              style={s.structureMode === key ? { borderColor: accent, background: accent + "0A" } : { borderColor: "#F3F4F6" }}>
              <input type="radio" name="structmode" checked={s.structureMode === key} onChange={() => onChange({ ...s, structureMode: key })} className="mt-0.5" />
              <span>
                <span className="block text-[11.5px] font-semibold text-gray-700">{label}</span>
                <span className="block text-[10px] leading-snug text-gray-400">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      {/* length targets */}
      <div className="rounded-xl border border-gray-100 p-3">
        <div className="mb-1.5 text-[11.5px] font-bold text-gray-700">Section length targets <span className="font-normal text-gray-400">(characters, ±15%)</span></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Labeled label="Hero paragraph (under H1)"><input type="number" value={L.hero ?? 200} onChange={(e) => setLen("hero")(e.target.value)} className={"ll-mono " + inputCls} /></Labeled>
          <Labeled label="Each H2 section body"><input type="number" value={L.h2 ?? 500} onChange={(e) => setLen("h2")(e.target.value)} className={"ll-mono " + inputCls} /></Labeled>
          <Labeled label="Each H3 sub-block"><input type="number" value={L.h3 ?? 280} onChange={(e) => setLen("h3")(e.target.value)} className={"ll-mono " + inputCls} /></Labeled>
        </div>
      </div>
    </div>
  );
}
