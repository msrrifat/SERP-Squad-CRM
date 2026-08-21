import React, { useMemo, useState } from "react";
import { Calendar, CheckCircle2, ChevronDown, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { AssignPicker, Ava, Card, ProjectMark, askDelete, inputCls } from "../../ui/primitives.jsx";
import { fmtDay } from "../../lib/format.jsx";

/* =====================================================================
   MEETING NOTES — private, per member.

   Every store is keyed by the MEMBER'S id and read back through that key
   only, so one person's agenda for a client call is never another's
   business. (This is UI-level privacy, same as DMs: the workspace itself is
   shared infrastructure.)

   A meeting is an agenda: each note is a topic with a check mark, ticked
   when it was actually discussed. Done topics turn green; nothing is struck
   through.

   "With" is two things, because meetings are with two kinds of people:
   team members are PICKED (one or many, from the same picker used for task
   assignees, with profile photos), and anyone outside the team — the
   client, a vendor — is free text. Both print on the meeting card.

   Two mounts, one engine:
   · Project management → Meeting notes (team only — the client portal never
     receives the prop that enables the tab).
   · Personal dashboard → Meetings & Notes: every project as a section, plus
     "General Meeting Notes" for meetings that belong to no project.

   EVERY component here is declared at module level. The first version
   defined the section component INSIDE MeetingsOverview, which made it a
   brand-new component type on each render — React remounted the whole
   subtree on every keystroke, the entry animation replayed each time (the
   "shaking"), and the focused input was destroyed mid-word.
   ===================================================================== */

const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const blankMeeting = () => ({
  id: uid("mt"), date: new Date().toISOString().slice(0, 10), withWhom: "", withMembers: [],
  items: [], createdAt: Date.now(), updatedAt: Date.now(),
});
const discussed = (m) => (m.items || []).filter((i) => i.done).length;

/* ---------------- one meeting, editable ---------------- */
export function MeetingEditor({ meeting, onPatch, onDelete, accent, people = [] }) {
  const [draft, setDraft] = useState("");
  const patch = (p) => onPatch({ ...p, updatedAt: Date.now() });
  const setItem = (id, p) => patch({ items: meeting.items.map((i) => (i.id === id ? { ...i, ...p } : i)) });
  const addItem = () => {
    const text = draft.trim(); if (!text) return;
    patch({ items: [...meeting.items, { id: uid("mi"), text, done: false }] });
    setDraft("");
  };
  const withMembers = meeting.withMembers || [];
  const total = meeting.items.length;
  const done = discussed(meeting);
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2.5 border-b border-gray-100 pb-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Meeting date</div>
            <input type="date" value={meeting.date || ""} onChange={(e) => patch({ date: e.target.value })}
              className={"ll-mono " + inputCls + " w-40"} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">With — team members (pick one or many)</div>
            <div className="flex min-h-[36px] flex-wrap items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2 py-1.5">
              {withMembers.map((n) => (
                <span key={n} className="flex items-center gap-1.5 rounded-full border border-gray-100 bg-gray-50 py-0.5 pl-0.5 pr-1.5">
                  <Ava name={n} size={18} />
                  <span className="text-[11.5px] font-medium text-gray-700">{n}</span>
                  <button onClick={() => patch({ withMembers: withMembers.filter((x) => x !== n) })}
                    title={`Remove ${n}`} className="rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-500"><X size={11} /></button>
                </span>
              ))}
              {people.length > 0 && (
                <AssignPicker people={people} current={withMembers}
                  onAdd={(n) => patch({ withMembers: [...withMembers, n] })}
                  onRemove={(n) => patch({ withMembers: withMembers.filter((x) => x !== n) })} />
              )}
              {withMembers.length === 0 && people.length === 0 && (
                <span className="text-[11px] text-gray-300">No team members to pick</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 pb-1">
            {total > 0 && (
              <span className="ll-mono rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={done === total ? { background: "#DCFCE7", color: "#166534" } : { background: "#F1F5F9", color: "#475569" }}>
                {done}/{total} discussed
              </span>
            )}
            <button onClick={async () => { if (await askDelete(`the meeting notes for ${fmtDay(meeting.date)}`)) onDelete(); }}
              title="Delete this meeting" className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500"><Trash2 size={14} /></button>
          </div>
        </div>
        <div>
          <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Others / notes — client, vendor, anyone outside the team</div>
          <input value={meeting.withWhom || ""} onChange={(e) => patch({ withWhom: e.target.value })}
            placeholder="e.g. Rob (Anta Plumbing), quarterly review call"
            className={inputCls} />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto py-3">
        {meeting.items.length === 0 && (
          <div className="py-6 text-center text-[12px] text-gray-300">No topics yet — add what you need to cover below.</div>
        )}
        {meeting.items.map((it) => (
          <div key={it.id} className="group flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-gray-50">
            <button onClick={() => setItem(it.id, { done: !it.done })}
              title={it.done ? "Mark as not discussed" : "Mark as discussed"}
              className="mt-0.5 shrink-0"
              style={{ width: 17, height: 17, display: "inline-flex", alignItems: "center", justifyContent: "center",
                borderRadius: 5, border: `2px solid ${it.done ? "#15803D" : "#94A3B8"}`,
                background: it.done ? "#15803D" : "transparent", color: "#fff" }}>
              {it.done && <CheckCircle2 size={11} strokeWidth={3.5} />}
            </button>
            {/* discussed topics turn green — deliberately NO strikethrough */}
            <input value={it.text} onChange={(e) => setItem(it.id, { text: e.target.value })}
              className="min-w-0 flex-1 border-0 bg-transparent text-[13px] font-medium outline-none"
              style={{ color: it.done ? "#15803D" : "#1F2937" }} />
            <button onClick={() => patch({ items: meeting.items.filter((x) => x.id !== it.id) })}
              className="mt-0.5 rounded p-0.5 text-transparent hover:bg-red-50 hover:text-red-500 group-hover:text-gray-300"><X size={13} /></button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
          placeholder="Add a topic to discuss… (Enter to add)"
          className={inputCls + " flex-1"} />
        <button onClick={addItem} disabled={!draft.trim()}
          className="flex items-center gap-1 rounded-xl px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
          style={{ background: accent }}><Plus size={13} /> Add</button>
      </div>
    </div>
  );
}

/* ---------------- two-pane: history left, editor right ---------------- */
export function MeetingNotesPane({ notes, onChange, accent, people = [], emptyHint = "Notes here are visible only to you." }) {
  const sorted = useMemo(() => [...(notes || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.createdAt - a.createdAt), [notes]);
  const [selId, setSelId] = useState(sorted[0]?.id || null);
  const sel = sorted.find((m) => m.id === selId) || sorted[0] || null;

  const create = () => { const m = blankMeeting(); onChange([m, ...(notes || [])]); setSelId(m.id); };
  const patchSel = (p) => onChange((notes || []).map((m) => (m.id === sel.id ? { ...m, ...p } : m)));
  const removeSel = () => { onChange((notes || []).filter((m) => m.id !== sel.id)); setSelId(null); };

  return (
    <div className="grid gap-4 lg:grid-cols-[270px_minmax(0,1fr)]" style={{ minHeight: 420 }}>
      <div className="space-y-2">
        <button onClick={create}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-semibold text-white"
          style={{ background: accent }}><Plus size={13} /> New meeting</button>
        <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: 520 }}>
          {sorted.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-[11.5px] leading-relaxed text-gray-400">
              No meeting notes yet.<br />{emptyHint}
            </div>
          )}
          {sorted.map((m) => {
            const active = sel?.id === m.id;
            const d = discussed(m), t = (m.items || []).length;
            const members = m.withMembers || [];
            return (
              <button key={m.id} onClick={() => setSelId(m.id)}
                className="block w-full rounded-xl border px-3 py-2.5 text-left"
                style={active ? { borderColor: accent, background: accent + "0D" } : { borderColor: "#F3F4F6", background: "var(--chip-bg, #fff)" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="ll-mono text-[11px] font-bold" style={{ color: active ? accent : "#374151" }}>{fmtDay(m.date)}</span>
                  {t > 0 && <span className="ll-mono text-[9.5px] font-bold" style={{ color: d === t ? "#15803D" : "#9CA3AF" }}>{d}/{t}</span>}
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  {members.length > 0 && (
                    <span className="flex shrink-0 -space-x-1">{members.slice(0, 3).map((n) => <Ava key={n} name={n} size={15} />)}</span>
                  )}
                  <span className="truncate text-[11.5px] text-gray-500">
                    {[members.join(", "), m.withWhom].filter(Boolean).join(" · ") || "—"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <Card className="p-4">
        {sel
          ? <MeetingEditor meeting={sel} onPatch={patchSel} onDelete={removeSel} accent={accent} people={people} />
          : (
            <div className="flex h-full flex-col items-center justify-center py-14 text-center">
              <Calendar size={22} className="mb-2 text-gray-300" />
              <div className="text-[13px] font-semibold text-gray-500">Plan your next meeting</div>
              <div className="mt-1 max-w-xs text-[11.5px] leading-relaxed text-gray-400">
                Add the topics you need to cover, then tick each one off as it's discussed. {emptyHint}
              </div>
            </div>
          )}
      </Card>
    </div>
  );
}

/* ---------------- PM tab: this project's meetings for this member ---------------- */
export function MeetingNotesTab({ project, user, accent, onUpdate, people = [] }) {
  const notes = (project.meetingNotes || {})[user.id] || [];
  const setNotes = (next) =>
    onUpdate((p) => ({ meetingNotes: { ...(p.meetingNotes || {}), [user.id]: next } }));
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[11.5px] text-gray-400">
        <Ava name={user.name} size={18} /> Private to <b className="text-gray-600">{user.name}</b> — other members and clients can't see these notes.
      </div>
      <MeetingNotesPane notes={notes} onChange={setNotes} accent={accent} people={people} />
    </div>
  );
}

/* ---------------- overview section — MODULE-LEVEL on purpose ----------------
   Declared inside MeetingsOverview, this becomes a different component type on
   every parent render: React remounts the subtree per keystroke, the entry
   animation replays (visible shaking) and the focused input is destroyed. */
function OverviewSection({ k, title, sub, notes, onChangeNotes, tone, accent, people, isOpen, onToggle, mark }) {
  const n = notes.length;
  return (
    <Card className="overflow-hidden">
      <button onClick={() => onToggle(k)} className="flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-gray-50">
        {isOpen ? <ChevronDown size={14} className="text-gray-300" /> : <ChevronRight size={14} className="text-gray-300" />}
        {mark || <span className="flex h-7 w-7 items-center justify-center rounded-lg text-white" style={{ background: tone || accent }}><Calendar size={13} /></span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-gray-800">{title}</span>
          {sub && <span className="block truncate text-[10.5px] text-gray-400">{sub}</span>}
        </span>
        <span className="ll-mono shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
          {n} meeting{n === 1 ? "" : "s"}
        </span>
      </button>
      {isOpen && (
        <div className="border-t border-gray-100 p-4">
          <MeetingNotesPane notes={notes} onChange={onChangeNotes} accent={tone || accent} people={people} />
        </div>
      )}
    </Card>
  );
}

/* ---------------- personal dashboard: everything in one place ---------------- */
export function MeetingsOverview({ clients, user, company, accent, onUpdateAnyProject, onChangeCompany, people = [] }) {
  const projects = useMemo(
    () => (clients || []).flatMap((c) => (c.projects || []).map((p) => ({ client: c, project: p }))),
    [clients]);
  const general = (company.meetingNotes || {})[user.id] || [];
  const [open, setOpen] = useState(() => new Set(["general"]));
  const toggle = (k) => setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const setGeneral = (next) =>
    onChangeCompany({ meetingNotes: { ...(company.meetingNotes || {}), [user.id]: next } });
  const setProject = (cp, next) =>
    onUpdateAnyProject(cp.client.id, cp.project.id, (p) => ({ meetingNotes: { ...(p.meetingNotes || {}), [user.id]: next } }));

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-5">
      <div className="text-[12px] text-gray-400">
        Every meeting agenda in one place, grouped by project. Notes are <b className="text-gray-600">visible only to you</b>.
      </div>
      <OverviewSection k="general" title="General Meeting Notes"
        sub="Meetings that don't belong to a specific project — internal planning, prospects, suppliers"
        notes={general} onChangeNotes={setGeneral} tone="#1F2A44" accent={accent} people={people}
        isOpen={open.has("general")} onToggle={toggle} />
      {projects.map((cp) => (
        <OverviewSection key={cp.project.id} k={cp.project.id}
          title={cp.project.name} sub={cp.client.name}
          tone={cp.project.accent || accent} accent={accent} people={people}
          /* the project's own logo, exactly as the sidebar and headers draw it */
          mark={<ProjectMark project={cp.project} size="md" />}
          notes={(cp.project.meetingNotes || {})[user.id] || []}
          onChangeNotes={(next) => setProject(cp, next)}
          isOpen={open.has(cp.project.id)} onToggle={toggle} />
      ))}
      {projects.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-[12.5px] text-gray-400">
          No projects visible to your account yet — General Meeting Notes above still works.
        </div>
      )}
    </div>
  );
}
