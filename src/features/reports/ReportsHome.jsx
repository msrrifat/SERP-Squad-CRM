import React from "react";
import { Copy, FileText as FileTextIcon, LayoutTemplate, Plus, Trash2 } from "lucide-react";
import { Card } from "../../ui/primitives.jsx";
import { fmtTs2 } from "../../lib/format.jsx";

/* ================= Report builder home =================
   Landing for the Report builder section: start a new report, reuse a saved
   template, or reopen a previously built report. Templates are project-agnostic
   (block structure only); saved reports belong to the project. */
export function ReportsHome({ accent, project, savedReports = [], templates = [], onNew, onOpen, onFromTemplate, onDeleteReport, onDeleteTemplate }) {
  return (
    <div className="ll-fade mx-auto max-w-5xl space-y-6">
      <div>
        <div className="ll-display text-[20px] font-bold">Report builder</div>
        <div className="text-[12.5px] text-gray-400">Performance, geo-grid and work reports for <b className="text-gray-600">{project.name}</b> — build fresh, reuse a template, or reopen a saved report.</div>
      </div>

      {/* new report */}
      <button onClick={onNew}
        className="group flex w-full items-center gap-4 rounded-2xl border-2 border-dashed p-5 text-left transition-colors"
        style={{ borderColor: accent + "55" }}>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: accent }}><Plus size={22} /></span>
        <span>
          <span className="ll-display block text-[15px] font-semibold" style={{ color: accent }}>New report</span>
          <span className="block text-[12px] text-gray-400">Start from a blank performance layout — add GBP, Bing, Apple, geo-grid, rankings and work sections from the sidebar.</span>
        </span>
      </button>

      {/* templates */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400"><LayoutTemplate size={12} /> Templates</div>
        {templates.length === 0 ? (
          <Card className="p-5 text-center text-[12px] text-gray-400">No templates yet — build a report, then use <b>Save as template</b> to reuse its structure across clients and months.</Card>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <Card key={t.id} className="group flex flex-col p-4">
                <div className="flex items-start gap-2">
                  <LayoutTemplate size={16} style={{ color: accent }} className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-gray-800">{t.name}</div>
                    <div className="text-[10.5px] text-gray-400">{t.blocks.length} sections · saved {fmtTs2(t.createdAt)}</div>
                  </div>
                  <button onClick={() => onDeleteTemplate(t.id)} className="text-gray-300 opacity-0 hover:text-red-500 group-hover:opacity-100"><Trash2 size={13} /></button>
                </div>
                <button onClick={() => onFromTemplate(t)}
                  className="mt-3 flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-semibold text-white" style={{ background: accent }}>
                  <Copy size={12} /> Use template
                </button>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* saved reports */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400"><FileTextIcon size={12} /> Saved reports for this project</div>
        {savedReports.length === 0 ? (
          <Card className="p-5 text-center text-[12px] text-gray-400">No saved reports yet — build one and hit <b>Save report</b>. Reopen it any month; changing the date range pulls the latest data automatically.</Card>
        ) : (
          <div className="space-y-2">
            {savedReports.map((r) => (
              <Card key={r.id} className="group flex items-center gap-3 p-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: accent + "14", color: accent }}><FileTextIcon size={15} /></span>
                <button onClick={() => onOpen(r)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-[13.5px] font-semibold text-gray-800">{r.name}</div>
                  <div className="text-[10.5px] text-gray-400">{r.blocks.length} sections · saved {fmtTs2(r.savedAt)}</div>
                </button>
                <button onClick={() => onOpen(r)} className="rounded-lg border px-3 py-1.5 text-[11.5px] font-semibold" style={{ borderColor: accent + "55", color: accent }}>Open</button>
                <button onClick={() => onDeleteReport(r.id)} className="text-gray-300 opacity-0 hover:text-red-500 group-hover:opacity-100"><Trash2 size={14} /></button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
