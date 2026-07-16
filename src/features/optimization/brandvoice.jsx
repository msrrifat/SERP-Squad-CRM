import React, { useRef, useState } from "react";
import { FileText, Mic, Plus, Trash2, Upload, X } from "lucide-react";
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
    </div>
  );
}
