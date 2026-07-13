/* Keyword bank picker — surfaces the project's researched keywords (added
   from the Keyword Finder tool, stored volume-sorted high → low) inside the
   Optimization Studio editors: Website Mapping & Content page editor, live
   Pages and Posts. Tiny on purpose so studio bundles stay light. */
import React, { useState } from "react";
import { ChevronDown, ChevronRight, KeyRound } from "lucide-react";

const fmtV = (n) => (n == null ? "—" : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n));

export function KwBankPicker({ project, accent = "#0E7C66", onPick, used = [], label = "Add from keyword bank" }) {
  const bank = project?.keywordBank || [];
  const [open, setOpen] = useState(false);
  if (!bank.length) return null;
  const usedSet = new Set(used.map((k) => String(k).toLowerCase().trim()));
  return (
    <div className="rounded-xl border border-dashed border-gray-200 p-2.5">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-1.5 text-left">
        {open ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />}
        <KeyRound size={12} style={{ color: accent }} />
        <span className="text-[11.5px] font-bold text-gray-700">{label}</span>
        <span className="text-[10px] text-gray-400">({bank.length} researched · sorted by volume)</span>
      </button>
      {open && (
        <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
          {bank.map((k) => {
            const isUsed = usedSet.has(k.keyword.toLowerCase());
            return (
              <button key={k.id} type="button" disabled={isUsed} onClick={() => onPick(k)}
                title={`${k.volume?.toLocaleString() ?? "?"} searches/mo · KD ${k.kd ?? "?"} · ${k.location}${k.demo ? " · demo data" : ""}`}
                className="flex items-center gap-1 rounded-lg border px-2 py-1 text-[10.5px] font-semibold disabled:opacity-35"
                style={isUsed ? { borderColor: "#E5E7EB", color: "#9CA3AF" } : { borderColor: accent + "55", color: accent, background: accent + "0A" }}>
                {k.keyword}
                <span className="ll-mono rounded bg-white/70 px-1 text-[9px] font-bold text-gray-500">{fmtV(k.volume)}</span>
                {k.demo && <span className="rounded bg-amber-100 px-1 text-[7.5px] font-bold uppercase text-amber-700">demo</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
