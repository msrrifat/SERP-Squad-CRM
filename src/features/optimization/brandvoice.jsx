import React, { useRef, useState } from "react";
import { Building2, FileText, Link2, Mic, Palette, Trash2, Upload, Wand2, X } from "lucide-react";
import { Card, Labeled, inputCls, askDelete } from "../../ui/primitives.jsx";
import { fmtTs2 } from "../../lib/format.jsx";
import { useWork } from "../../lib/worklog.jsx";

/* ================= Brand Voice =================
   The single source of truth every writing tool in the app pulls from:
   the campaign content engine, the page re-optimizer, and the content
   architect's "generate content" step all read opt.brandVoice so output
   sounds like the brand, not generic AI. Guideline files (style guides,
   prompt snippets) are stored as text and prepended to the generation prompt. */
export function BrandVoiceTab({ opt, setOpt, accent, project }) {
  const bv = opt.brandVoice || {};
  const work = useWork();
  /* guideline edits are continuous typing — log ONE work entry per visit
     that actually changed something, not one per keystroke */
  const editLogged = useRef(false);
  const set = (patch) => {
    if (!editLogged.current) { editLogged.current = true; work?.("brandvoice", "bvUpdated"); }
    setOpt("brandVoice", patch);
  };
  const [err, setErr] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  /* re-render to flip ✓ Saved back after the confirmation window */
  React.useEffect(() => { if (!savedAt) return; const t = setTimeout(() => setSavedAt(null), 2600); return () => clearTimeout(t); }, [savedAt]);

  const addFiles = (fileList) => {
    setErr(null);
    [...fileList].forEach((f) => {
      if (f.size > 400_000) { setErr(`${f.name} is over 400KB — paste the key parts as a guideline instead.`); return; }
      if (!/\.(txt|md|markdown)$/i.test(f.name) && !f.type.startsWith("text")) { setErr(`${f.name}: only .txt / .md text files (style guides, prompts).`); return; }
      work?.("brandvoice", "bvFileAdded", { detail: f.name });
      const rd = new FileReader();
      rd.onload = () => set((cur) => ({ files: [...(cur.files || []), { id: "bf" + Date.now() + Math.random().toString(36).slice(2, 5), name: f.name, text: String(rd.result).slice(0, 200_000), addedAt: Date.now() }] }));
      rd.readAsText(f);
    });
  };

  return (
    <div className="space-y-4">
      <Card className="flex items-start gap-2.5 p-4">
        <Mic size={15} className="mt-0.5 shrink-0" style={{ color: accent }} />
        <div className="text-[11.5px] leading-relaxed text-gray-500">
          <b className="text-gray-700">One voice, everywhere.</b> Everything here is fed into every AI writing step — campaign content,
          page re-optimization and the content architect — so drafts match <b>{project.name}</b>'s tone, terminology and rules instead of sounding generic.
        </div>
      </Card>

      {/* ---- Business information (GBP-style facts every writer cites) ---- */}
      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div className="ll-display flex items-center gap-2 text-[15px] font-semibold"><Building2 size={15} style={{ color: accent }} /> Business information</div>
          {(opt.gbp?.bizName || opt.gbp?.address) && (
            <button onClick={() => set((cur) => ({ biz: {
                name: opt.gbp.bizName || "", category: opt.gbp.category || "", address: opt.gbp.address || "",
                phone: opt.gbp.phone || "", hours: opt.gbp.hours || "", description: opt.gbp.description || "",
                ...(cur.biz || {}),
              } }))}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:border-gray-300">
              <Wand2 size={11} /> Prefill empty fields from GBP
            </button>
          )}
        </div>
        <div className="text-[11.5px] text-gray-400">
          The same facts a Google Business Profile holds. Every content generator (pages, posts, campaigns) reads these,
          so the writing cites real business details — name, services, areas, hours — instead of inventing them.
        </div>
        {(() => { const biz = bv.biz || {}; const sb = (k) => (e) => set((cur) => ({ biz: { ...(cur.biz || {}), [k]: e.target.value } }));
          return (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Labeled label="Business name"><input value={biz.name || ""} onChange={sb("name")} placeholder={project.name} className={inputCls} /></Labeled>
                <Labeled label="Primary category"><input value={biz.category || ""} onChange={sb("category")} placeholder="e.g. Plumber, Dental clinic" className={inputCls} /></Labeled>
                <Labeled label="Phone"><input value={biz.phone || ""} onChange={sb("phone")} placeholder="+1 …" className={"ll-mono " + inputCls} /></Labeled>
                <Labeled label="Email"><input value={biz.email || ""} onChange={sb("email")} placeholder="hello@…" className={"ll-mono " + inputCls} /></Labeled>
                <Labeled label="Address"><input value={biz.address || ""} onChange={sb("address")} placeholder="Street, City, State ZIP" className={inputCls} /></Labeled>
                <Labeled label="Opening hours"><input value={biz.hours || ""} onChange={sb("hours")} placeholder="Mon–Fri 8am–6pm, Sat 9am–1pm" className={inputCls} /></Labeled>
                <Labeled label="Service areas (comma-separated)"><input value={biz.serviceAreas || ""} onChange={sb("serviceAreas")} placeholder="Dallas, Plano, Frisco" className={inputCls} /></Labeled>
                <Labeled label="Services (comma-separated)"><input value={biz.services || ""} onChange={sb("services")} placeholder="drain cleaning, water heater repair" className={inputCls} /></Labeled>
              </div>
              <Labeled label="Business description (what a GBP 'from the business' section would say)">
                <textarea value={biz.description || ""} onChange={sb("description")} rows={3} className={inputCls + " resize-y"}
                  placeholder="Who you serve, what you do best, years in business, guarantees…" />
              </Labeled>
            </>
          ); })()}
      </Card>

      {/* ---- Other information: the SAME properties as Branding & Automation →
             Properties — edited here, saved there (one source of truth) ---- */}
      <Card className="space-y-3 p-5">
        <div className="ll-display flex items-center gap-2 text-[15px] font-semibold"><Link2 size={15} style={{ color: accent }} /> Other information — brand properties</div>
        <div className="text-[11.5px] text-gray-400">
          Your official links (website, Google Business Profile, socials). Shared with <b>Branding & Automation → Properties</b> —
          editing here updates there and vice versa. Writers use these for branded citations and links.
        </div>
        {(() => {
          const props = opt.branding?.properties || {};
          const setProp = (k) => (e) => setOpt("branding", (cur) => ({ properties: { ...(cur?.properties || {}), [k]: e.target.value } }));
          const setSocial = (k) => (e) => setOpt("branding", (cur) => ({ properties: { ...(cur?.properties || {}), socials: { ...((cur?.properties || {}).socials || {}), [k]: e.target.value } } }));
          const MAIN = [["website", "Official website"], ["gbpShare", "Google Business Profile — share link"], ["gbpReview", "Google review link"], ["bing", "Bing Places"], ["apple", "Apple Maps"]];
          const SOC = [["facebook", "Facebook"], ["instagram", "Instagram"], ["linkedin", "LinkedIn"], ["youtube", "YouTube"], ["x", "X / Twitter"], ["tiktok", "TikTok"]];
          return (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {MAIN.map(([k, label]) => (
                <Labeled key={k} label={label}>
                  <input value={props[k] || ""} onChange={setProp(k)} placeholder={k === "website" ? "https://" + project.website : "https://…"} className={"ll-mono " + inputCls} />
                </Labeled>
              ))}
              {SOC.map(([k, label]) => (
                <Labeled key={k} label={label}>
                  <input value={(props.socials || {})[k] || ""} onChange={setSocial(k)} placeholder="https://…" className={"ll-mono " + inputCls} />
                </Labeled>
              ))}
            </div>
          );
        })()}
      </Card>

      {/* ---- Brand colors: the palette the page-deploy design system reads —
           every published page's backgrounds, text, links, buttons and CTA
           bands follow these. Blank = project accent + clean defaults. ---- */}
      <Card className="space-y-3 p-5">
        <div className="ll-display flex items-center gap-2 text-[15px] font-semibold"><Palette size={15} style={{ color: accent }} /> Brand colors</div>
        <div className="text-[11.5px] text-gray-400">
          When pages are deployed, the design engine scans these colors (with the brand tone) and builds every section with them —
          page background, text, headings, links, buttons, shadows and the hero/CTA bands. Leave a field blank to use the project accent and clean defaults.
        </div>
        {(() => {
          const colors = bv.colors || {};
          const setColor = (k) => (v) => set((cur) => ({ colors: { ...(cur.colors || {}), [k]: v } }));
          const FIELDS = [
            ["primary", "Primary brand color", accent],
            ["secondary", "Secondary color (badges, checks, steps)", accent],
            ["pageBg", "Page background", "#ffffff"],
            ["sectionTint", "Alternate section background", "#f5f8fa"],
            ["heading", "Heading color", "#141b24"],
            ["text", "Body text color", "#46525f"],
            ["link", "Link / anchor text color", accent],
            ["button", "Button color", accent],
            ["buttonText", "Button text color", "#ffffff"],
            ["ctaBg", "CTA & hero band color", accent],
            ["cardShadow", "Text block / card shadow color", "#0f1e32"],
          ];
          const val = (k, fb) => colors[k] || fb;
          return (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {FIELDS.map(([k, label, fb]) => (
                  <Labeled key={k} label={label}>
                    <div className="flex items-center gap-1.5">
                      <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(colors[k] || "") ? colors[k] : fb}
                        onChange={(e) => setColor(k)(e.target.value)}
                        className="h-8 w-10 shrink-0 cursor-pointer rounded-lg border border-gray-200 bg-white p-0.5" />
                      <input value={colors[k] || ""} placeholder={fb}
                        onChange={(e) => setColor(k)(e.target.value)} className={"ll-mono min-w-0 flex-1 " + inputCls} />
                      {colors[k] && <button onClick={() => setColor(k)("")} title="Reset to default" className="shrink-0 text-gray-300 hover:text-red-500"><X size={12} /></button>}
                    </div>
                  </Labeled>
                ))}
              </div>
              {/* live mini-preview of the deployed look */}
              <div className="overflow-hidden rounded-xl border border-gray-100">
                <div className="px-4 py-3" style={{ background: `linear-gradient(130deg, ${val("ctaBg", accent)}dd, ${val("ctaBg", accent)})` }}>
                  <div className="text-[13px] font-bold text-white">Hero &amp; CTA band</div>
                  <span className="mt-1 inline-block rounded-lg px-3 py-1 text-[10.5px] font-bold" style={{ background: val("buttonText", "#ffffff"), color: val("ctaBg", accent) }}>Light button</span>
                </div>
                <div className="px-4 py-3" style={{ background: val("pageBg", "#ffffff") }}>
                  <div className="text-[12.5px] font-bold" style={{ color: val("heading", "#141b24") }}>Section heading</div>
                  <div className="text-[11px]" style={{ color: val("text", "#46525f") }}>Body text with a <span style={{ color: val("link", accent), textDecoration: "underline" }}>link anchor</span> inside.</div>
                  <span className="mt-1.5 inline-block rounded-lg px-3 py-1 text-[10.5px] font-bold" style={{ background: val("button", accent), color: val("buttonText", "#ffffff") }}>Button</span>
                </div>
                <div className="px-4 py-2.5" style={{ background: val("sectionTint", "#f5f8fa") }}>
                  <span className="inline-block rounded-lg border border-gray-100 bg-white px-2.5 py-1 text-[10.5px]" style={{ boxShadow: `0 4px 14px ${val("cardShadow", "#0f1e32")}22`, color: val("text", "#46525f") }}>
                    Card on alternate band <span style={{ color: val("secondary", accent) }}>✓</span>
                  </span>
                </div>
              </div>
            </>
          );
        })()}
      </Card>

      <Card className="space-y-3 p-5">
        <div className="ll-display text-[15px] font-semibold">Brand information</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Brand / business name"><input value={bv.brandName || project.name} onChange={(e) => set({ brandName: e.target.value })} className={inputCls} /></Labeled>
          <Labeled label="Tagline / positioning"><input value={bv.tagline || ""} onChange={(e) => set({ tagline: e.target.value })} placeholder="e.g. Transparent, same-week local service" className={inputCls} /></Labeled>
        </div>
        <Labeled label="Who we are — mission, differentiators, proof points">
          <textarea value={bv.brandInfo || ""} onChange={(e) => set({ brandInfo: e.target.value })} rows={3} className={inputCls + " resize-y"}
            placeholder="What makes this brand different, the audience it serves, awards/credentials, guarantees…" />
        </Labeled>
      </Card>

      <Card className="space-y-3 p-5">
        <div className="ll-display text-[15px] font-semibold">Voice & tone</div>
        <Labeled label="Tone words (comma-separated)">
          <input value={bv.toneWords || ""} onChange={(e) => set({ toneWords: e.target.value })} placeholder="warm, confident, jargon-free, reassuring" className={inputCls} />
        </Labeled>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Always do">
            <textarea value={bv.doList || ""} onChange={(e) => set({ doList: e.target.value })} rows={4} className={inputCls + " resize-y"}
              placeholder={"Use plain English\nLead with benefits\nWrite in second person (you)\nBack claims with proof"} />
          </Labeled>
          <Labeled label="Never do">
            <textarea value={bv.dontList || ""} onChange={(e) => set({ dontList: e.target.value })} rows={4} className={inputCls + " resize-y"}
              placeholder={"No hype or superlatives\nNo unverified claims\nDon't say 'cheap'\nAvoid passive voice"} />
          </Labeled>
        </div>
        <Labeled label="Words / phrases to avoid (comma-separated)">
          <input value={bv.avoidWords || ""} onChange={(e) => set({ avoidWords: e.target.value })} placeholder="cheap, revolutionary, world-class, cutting-edge" className={inputCls} />
        </Labeled>
      </Card>

      <Card className="space-y-3 p-5">
        <div className="ll-display text-[15px] font-semibold">Guideline & prompt files</div>
        <div className="text-[11.5px] text-gray-400">Upload style guides or prompt snippets (.txt / .md). Their text is prepended to every generation prompt, so the writing tools must follow them.</div>
        <div className="space-y-1.5">
          {(bv.files || []).map((f) => (
            <div key={f.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2">
              <FileText size={14} className="shrink-0 text-gray-400" />
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-gray-700">{f.name}</span>
              <span className="ll-mono shrink-0 text-[10px] text-gray-400">{f.text.split(/\s+/).length} words · {fmtTs2(f.addedAt)}</span>
              <button onClick={() => askDelete(`the file "${f.name || "this file"}"`) && set({ files: (bv.files || []).filter((x) => x.id !== f.id) })} className="text-gray-300 hover:text-red-500"><Trash2 size={12} /></button>
            </div>
          ))}
          {(bv.files || []).length === 0 && <div className="py-2 text-center text-[11.5px] text-gray-300">No guideline files yet.</div>}
        </div>
        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 py-2.5 text-[12px] font-medium text-gray-400 hover:border-gray-400 hover:text-gray-600">
          <Upload size={13} /> Upload style guide / prompt (.txt, .md)
          <input type="file" accept=".txt,.md,.markdown,text/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </label>
        {err && <div className="flex items-center gap-1.5 text-[11px] text-red-500"><X size={12} /> {err}</div>}
      </Card>

      {/* explicit save — the data already persists on every change, this
         confirms it and stamps the work log */}
      <Card className="flex items-center justify-between gap-3 p-4">
        <span className="text-[11.5px] text-gray-400">
          Changes save automatically as you type — this button confirms everything is stored on the server.
        </span>
        <button onClick={() => { work?.("brandvoice", "bvSaved"); setSavedAt(Date.now()); }}
          className="shrink-0 rounded-lg px-5 py-2 text-[12.5px] font-semibold text-white" style={{ background: savedAt && Date.now() - savedAt < 2500 ? "#16A34A" : accent }}>
          {savedAt && Date.now() - savedAt < 2500 ? "✓ Saved" : "Save brand voice"}
        </button>
      </Card>
    </div>
  );
}
