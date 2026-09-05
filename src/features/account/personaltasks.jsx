import React, { useMemo, useState } from "react";
import { CheckCircle2, Circle, ListChecks, Plus, Trash2, CalendarDays, CalendarCheck, CalendarClock, StickyNote } from "lucide-react";
import { askDelete, Card, inputCls } from "../../ui/primitives.jsx";
import { todayISO, uid } from "../../lib/format.jsx";

/* =====================================================================
   PERSONAL TASKS — the signed-in person's own to-do list.

   Not project work and not assigned to anyone: a private list per team
   member, stored under company.personalTasks[memberId]. Each task carries
   a creation date, a due date, a completion date and a free-form note.
   The note lives in a panel on the right so a long one never squeezes
   the list.
   ===================================================================== */

const fmtDate = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" }) : "—");
const isOverdue = (t) => !t.completedAt && t.dueDate && t.dueDate < todayISO();

export function PersonalTasksView({ tasks = [], onChange, accent, userName }) {
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState("open");   // open | done | all
  const [selId, setSelId] = useState(null);

  const list = useMemo(() => {
    const rows = tasks.filter((t) => (filter === "all" ? true : filter === "done" ? !!t.completedAt : !t.completedAt));
    /* open tasks: overdue first, then by due date, undated last; done tasks:
       most recently completed first */
    return rows.slice().sort((a, b) => {
      if (filter === "done") return (b.completedAt || "").localeCompare(a.completedAt || "");
      const da = a.dueDate || "9999-99-99", db = b.dueDate || "9999-99-99";
      return da.localeCompare(db) || (a.createdAt || "").localeCompare(b.createdAt || "");
    });
  }, [tasks, filter]);
  const sel = tasks.find((t) => t.id === selId) || null;

  const patch = (id, p) => onChange(tasks.map((t) => (t.id === id ? { ...t, ...p, updatedAt: Date.now() } : t)));
  const add = () => {
    const title = draft.trim();
    if (!title) return;
    const t = { id: uid(), title, createdAt: todayISO(), dueDate: null, completedAt: null, note: "", updatedAt: Date.now() };
    onChange([t, ...tasks]);
    setDraft(""); setSelId(t.id);
  };
  const toggle = (t) => patch(t.id, { completedAt: t.completedAt ? null : todayISO() });
  const remove = async (t) => {
    if (!(await askDelete(`the task "${t.title}"`))) return;
    onChange(tasks.filter((x) => x.id !== t.id));
    if (selId === t.id) setSelId(null);
  };

  const counts = { open: tasks.filter((t) => !t.completedAt).length, done: tasks.filter((t) => !!t.completedAt).length };
  const overdue = tasks.filter(isOverdue).length;

  return (
    <div className="ll-fade flex" style={{ minHeight: "calc(100vh - 57px)" }}>
      {/* ---- list ---- */}
      <div className="min-w-0 flex-1 space-y-4 p-5">
        <div>
          <div className="ll-display flex items-center gap-2 text-[18px] font-bold"><ListChecks size={17} style={{ color: accent }} /> Personal tasks</div>
          <div className="text-[12px] text-gray-400">Your own to-do list, <b>{userName}</b> — nobody else sees it. Click a task to set its dates and write a note on the right.</div>
        </div>

        <div className="flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="Add a task and press Enter…" className={inputCls + " flex-1"} />
          <button onClick={add} disabled={!draft.trim()}
            className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
            <Plus size={14} /> Add
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {[["open", `Open (${counts.open})`], ["done", `Completed (${counts.done})`], ["all", "All"]].map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={"rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold " + (filter === k ? "" : "border-gray-200 text-gray-500 hover:border-gray-300")}
              style={filter === k ? { borderColor: accent, background: accent + "14", color: accent } : {}}>{label}</button>
          ))}
          {overdue > 0 && <span className="ml-auto rounded-full bg-red-50 px-2 py-0.5 text-[10.5px] font-bold text-red-700">{overdue} overdue</span>}
        </div>

        <Card className="overflow-hidden">
          {list.length === 0 && (
            <div className="p-10 text-center text-[12.5px] text-gray-400">
              {tasks.length === 0 ? "No personal tasks yet — add your first one above." : filter === "done" ? "Nothing completed yet." : "All caught up — nothing open."}
            </div>
          )}
          {list.map((t) => {
            const active = t.id === selId;
            const late = isOverdue(t);
            return (
              <div key={t.id} onClick={() => setSelId(t.id)}
                className={"flex cursor-pointer items-start gap-3 border-b border-gray-50 px-4 py-3 hover:bg-gray-50 " + (active ? "bg-gray-50" : "")}
                style={active ? { boxShadow: `inset 3px 0 0 ${accent}` } : {}}>
                <button onClick={(e) => { e.stopPropagation(); toggle(t); }} title={t.completedAt ? "Mark as not done" : "Mark as done"}
                  className="mt-0.5 shrink-0" style={{ color: t.completedAt ? "#16A34A" : "#9CA3AF" }}>
                  {t.completedAt ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={"text-[13px] font-semibold " + (t.completedAt ? "text-gray-400 line-through" : "text-gray-800")}>{t.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-400">
                    <span className="inline-flex items-center gap-1"><CalendarDays size={11} /> Created {fmtDate(t.createdAt)}</span>
                    <span className={"inline-flex items-center gap-1 " + (late ? "font-semibold text-red-600" : "")}><CalendarClock size={11} /> Due {fmtDate(t.dueDate)}{late ? " · overdue" : ""}</span>
                    {t.completedAt && <span className="inline-flex items-center gap-1 text-green-700"><CalendarCheck size={11} /> Completed {fmtDate(t.completedAt)}</span>}
                    {t.note && <span className="inline-flex items-center gap-1"><StickyNote size={11} /> note</span>}
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); remove(t); }} title="Delete task"
                  className="shrink-0 rounded-md p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"><Trash2 size={13} /></button>
              </div>
            );
          })}
        </Card>
      </div>

      {/* ---- detail panel: dates + note ---- */}
      <div className="hidden w-[360px] shrink-0 border-l border-gray-200 bg-white p-5 lg:block">
        {!sel ? (
          <div className="pt-10 text-center text-[12.5px] text-gray-400">Select a task to edit its dates and note.</div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">Task</div>
              <input value={sel.title} onChange={(e) => patch(sel.id, { title: e.target.value })} className={inputCls + " font-semibold"} />
            </div>
            <div className="grid grid-cols-1 gap-3">
              <label className="block">
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">Creation date</div>
                <input type="date" value={sel.createdAt || ""} onChange={(e) => patch(sel.id, { createdAt: e.target.value || todayISO() })} className={inputCls} />
              </label>
              <label className="block">
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">Due date</div>
                <input type="date" value={sel.dueDate || ""} onChange={(e) => patch(sel.id, { dueDate: e.target.value || null })} className={inputCls} />
              </label>
              <label className="block">
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">Complete date</div>
                <div className="flex gap-2">
                  <input type="date" value={sel.completedAt || ""} onChange={(e) => patch(sel.id, { completedAt: e.target.value || null })} className={inputCls + " flex-1"} />
                  <button onClick={() => toggle(sel)}
                    className="shrink-0 rounded-xl border px-3 text-[11.5px] font-semibold"
                    style={sel.completedAt ? { borderColor: "#E5E7EB", color: "#6B7280" } : { borderColor: accent, color: accent }}>
                    {sel.completedAt ? "Reopen" : "Done today"}
                  </button>
                </div>
              </label>
            </div>
            <div>
              <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">Note</div>
              <textarea value={sel.note || ""} onChange={(e) => patch(sel.id, { note: e.target.value })} rows={12}
                placeholder="Anything you want to remember about this task…" className={inputCls + " resize-y leading-relaxed"} />
            </div>
            <button onClick={() => remove(sel)} className="flex items-center gap-1.5 text-[11.5px] font-semibold text-red-500 hover:underline"><Trash2 size={12} /> Delete this task</button>
          </div>
        )}
      </div>
    </div>
  );
}
