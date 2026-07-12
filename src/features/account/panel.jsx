import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, ArrowLeft, Camera, CheckCircle2, ClipboardList, Hash, KeyRound,
  MessageSquare, Moon, Shield, Sun, Trash2, User, Users,
} from "lucide-react";
import { Ava, Card, Toggle, inputCls } from "../../ui/primitives.jsx";
import { relTime, todayISO } from "../../lib/format.jsx";
import { MessageThread } from "../chat/thread.jsx";

/* =====================================================================
   Account settings — opened from the avatar in the top-right corner
   ===================================================================== */
export function AccountSettingsView({ member, clients, onUpdateMember, accent, dark, setDark }) {
  const [draft, setDraft] = useState({ name: member.name, title: member.title || "", email: member.email || "", phone: member.phone || "" });
  const [pw, setPw] = useState({ a: "", b: "" });
  const [saved, setSaved] = useState(null); // "profile" | "password"
  const fileRef = useRef(null);
  useEffect(() => { setDraft({ name: member.name, title: member.title || "", email: member.email || "", phone: member.phone || "" }); }, [member.id]);

  const pickPhoto = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => onUpdateMember({ avatar: rd.result });
    rd.readAsDataURL(f);
    e.target.value = "";
  };
  const saveProfile = () => {
    const name = draft.name.trim(); if (!name) return;
    onUpdateMember({ name, title: draft.title.trim(), email: draft.email.trim(), phone: draft.phone.trim() });
    setSaved("profile"); setTimeout(() => setSaved(null), 2500);
  };
  const savePw = () => {
    if (!pw.a || pw.a !== pw.b) return;
    onUpdateMember({ password: pw.a });
    setPw({ a: "", b: "" }); setSaved("password"); setTimeout(() => setSaved(null), 2500);
  };
  const projCount = clients.reduce((n, c) => n + c.projects.length, 0);

  return (
    <div className="ll-fade mx-auto max-w-3xl space-y-4 p-5">
      <div>
        <div className="ll-display flex items-center gap-2 text-[18px] font-bold"><User size={17} style={{ color: accent }} /> Account settings</div>
        <div className="text-[12px] text-gray-400">Your personal profile — how you appear to teammates and clients across tasks, comments and chat.</div>
      </div>

      <Card className="p-5">
        <div className="mb-4 text-[13px] font-bold text-gray-800">Profile</div>
        <div className="flex flex-wrap items-start gap-5">
          <div className="flex flex-col items-center gap-2">
            <Ava name={member.name} img={member.avatar} size={76} />
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
            <div className="flex gap-1">
              <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 hover:border-gray-300">
                <Camera size={11} /> {member.avatar ? "Change" : "Upload"}
              </button>
              {member.avatar && (
                <button onClick={() => onUpdateMember({ avatar: null })} title="Remove photo" className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:text-red-500">
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          </div>
          <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
            {[["name", "Full name"], ["title", "Job title"], ["email", "Email"], ["phone", "Phone"]].map(([k, label]) => (
              <label key={k} className="block">
                <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
                <input value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} className={inputCls} />
              </label>
            ))}
            <div className="sm:col-span-2 flex items-center gap-2">
              <button onClick={saveProfile} disabled={!draft.name.trim()} className="rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>Save profile</button>
              {saved === "profile" && <span className="flex items-center gap-1 text-[12px] font-semibold text-emerald-600"><CheckCircle2 size={13} /> Saved</span>}
              <span className="text-[10.5px] text-gray-400">Renaming updates your name on existing tasks, comments and chat automatically.</span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-1 flex items-center gap-1.5 text-[13px] font-bold text-gray-800"><KeyRound size={13} style={{ color: accent }} /> Sign-in &amp; security</div>
        <div className="mb-3 text-[11px] text-gray-400">You sign in at <span className="ll-mono">#login</span> with <b>{member.email || "your email"}</b>{member.isOwner ? " — the owner account also opens the workspace directly." : "."}</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <input type="password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} placeholder="New password" className={inputCls} />
          <input type="password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} placeholder="Repeat new password" className={inputCls} />
          <button onClick={savePw} disabled={!pw.a || pw.a !== pw.b} className="rounded-lg border px-4 py-2 text-[12.5px] font-semibold disabled:opacity-40" style={{ borderColor: accent, color: accent }}>
            Change password
          </button>
        </div>
        {pw.a && pw.b && pw.a !== pw.b && <div className="mt-1.5 text-[11px] text-red-500">Passwords don't match yet.</div>}
        {saved === "password" && <div className="mt-1.5 flex items-center gap-1 text-[12px] font-semibold text-emerald-600"><CheckCircle2 size={13} /> Password updated</div>}
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center gap-1.5 text-[13px] font-bold text-gray-800">{dark ? <Moon size={13} style={{ color: accent }} /> : <Sun size={13} style={{ color: accent }} />} Preferences</div>
        <Toggle on={dark} onChange={setDark} label="Dark mode" desc="Applies to your whole workspace on this device." />
      </Card>

      <Card className="p-5">
        <div className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-gray-800"><Shield size={13} style={{ color: accent }} /> Role &amp; access</div>
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-600">
          <span className="rounded-full px-2.5 py-1 text-[11px] font-bold text-white" style={{ background: accent }}>{member.role}</span>
          <span>{member.projects === "all" ? "All projects" : `${projCount} assigned project${projCount === 1 ? "" : "s"}`}</span>
          <span className="text-gray-300">·</span>
          <span className="text-[11px] text-gray-400">Roles and project access are managed by an admin in Company settings → Team.</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {clients.flatMap((c) => c.projects.map((p) => (
            <span key={p.id} className="rounded-full border border-gray-200 px-2 py-0.5 text-[10.5px] font-medium text-gray-500">{p.name}</span>
          )))}
        </div>
      </Card>
    </div>
  );
}

/* =====================================================================
   Assignments — one box per project inside each column; the box header
   is the project name, each row is task (left) + record name (right)
   ===================================================================== */
const COLS = [
  ["ongoing", "Ongoing", "#2563EB", "Due dates ahead — actively scheduled work"],
  ["todo", "To Do", "#6B7280", "No due date yet — waiting to be scheduled"],
  ["late", "Late", "#DC2626", "Past the due date and not completed"],
  ["done", "Completed", "#16A34A", "Finished tasks"],
];
const colOfTask = (t, today) => (t.completedAt ? "done" : t.dueDate && t.dueDate < today ? "late" : t.dueDate ? "ongoing" : "todo");
const fmtDue = (d) => new Date(d + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric" });

/* collect a person's tasks across clients → [{ t, cl, r, p, c }] */
const tasksFor = (clients, userName) => {
  const out = [];
  clients.forEach((c) => c.projects.forEach((p) => (p.records || []).forEach((r) => (r.checklists || []).forEach((cl) =>
    (cl.tasks || []).forEach((t) => { if ((t.assignees || []).includes(userName)) out.push({ t, cl, r, p, c }); })
  ))));
  return out;
};

/* one project box: header = project, rows = task + record */
function ProjectBox({ group, colKey, accent, onOpenTask }) {
  const { p, c, rows } = group;
  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center gap-1.5 px-3 py-2" style={{ background: (p.accent || accent) + "10" }}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.accent || accent }} />
        <span className="truncate text-[11.5px] font-bold" style={{ color: p.accent || accent }}>{p.name}</span>
        <span className="ll-mono ml-auto shrink-0 text-[9px] text-gray-400">{c.name}</span>
      </div>
      <div className="divide-y divide-gray-50">
        {rows.map(({ t, r }, i) => (
          <button key={t.id} onClick={() => onOpenTask?.(c.id, p.id, r.id)} disabled={!onOpenTask}
            className="block w-full px-3 py-2 text-left hover:bg-gray-50 disabled:cursor-default">
            <div className="flex items-start gap-1.5">
              <span className="ll-mono mt-px shrink-0 text-[10px] font-bold" style={{ color: p.accent || accent }}>{i + 1}.</span>
              <span className={"min-w-0 flex-1 text-[12px] font-semibold leading-snug text-gray-800 " + (t.completedAt ? "line-through opacity-60" : "")}>{t.title}</span>
            </div>
            <div className="mt-1 flex items-end justify-between gap-2 pl-4">
              <span className="ll-mono shrink-0 text-[9px] font-semibold" style={{ color: colKey === "late" ? "#DC2626" : colKey === "done" ? "#16A34A" : "#6B7280" }}>
                {t.dueDate ? (colKey === "done" ? "done " : "due ") + fmtDue(t.completedAt ? new Date(t.completedAt).toISOString().slice(0, 10) : t.dueDate) : ""}
              </span>
              <span className="min-w-0 truncate text-right text-[10px] text-gray-400">{r.name}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* group one column's tasks into per-project boxes */
const groupByProject = (cards) => {
  const g = {};
  cards.forEach((x) => { (g[x.p.id] = g[x.p.id] || { p: x.p, c: x.c, rows: [] }).rows.push(x); });
  return Object.values(g);
};

export function AssignmentBoard({ clients, userName, accent, onOpenTask }) {
  const today = todayISO();
  const tasks = useMemo(() => tasksFor(clients, userName), [clients, userName]);
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {COLS.map(([key, label, color, hint]) => {
        const groups = groupByProject(tasks.filter((x) => colOfTask(x.t, today) === key));
        const count = groups.reduce((n, g) => n + g.rows.length, 0);
        return (
          <div key={key} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-2.5">
            <div className="flex items-center gap-1.5 px-1.5 pb-2 pt-1" title={hint}>
              <span className="h-2 w-2 rounded-full" style={{ background: color }} />
              <span className="text-[12px] font-bold text-gray-700">{label}</span>
              <span className="ll-mono ml-auto rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-gray-500">{count}</span>
            </div>
            <div className="space-y-2">
              {groups.length === 0 && <div className="rounded-xl border border-dashed border-gray-200 py-6 text-center text-[11px] text-gray-300">Nothing here</div>}
              {groups.map((g) => <ProjectBox key={g.p.id} group={g} colKey={key} accent={accent} onOpenTask={onOpenTask} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AssignmentsView({ clients, userName, accent, onOpenTask }) {
  return (
    <div className="ll-fade space-y-4 p-5">
      <div>
        <div className="ll-display flex items-center gap-2 text-[18px] font-bold"><ClipboardList size={17} style={{ color: accent }} /> My assignments</div>
        <div className="text-[12px] text-gray-400">Every task assigned to <b>{userName}</b>, grouped into one box per project — click a task to jump to its record.</div>
      </div>
      <AssignmentBoard clients={clients} userName={userName} accent={accent} onOpenTask={onOpenTask} />
    </div>
  );
}

/* =====================================================================
   Chat — Slack-style: conversation list on the left of the main window,
   selected thread fills the rest. DMs on top, project channels below.
   ===================================================================== */
const dmKeyOf = (a, b) => [a, b].sort().join("|");

export function ChatHome({ me, team, dms, dmReads, channels, groups, accent, canManageGroups,
  onSendDm, onReactDm, onMarkDmRead, onSendProject, onReactProject, onMarkProjectRead,
  onCreateGroup, onUpdateGroup, onDeleteGroup, onSendGroup, onReactGroup, onMarkGroupRead,
  clientChats = null, onSendClient, onReactClient, onMarkClientRead, maskName = (n) => n }) {
  const others = team.filter((m) => m.name !== me);
  const [sel, setSel] = useState(others.length ? { type: "dm", name: others[0].name } : (channels[0] ? { type: "proj", projectId: channels[0].project.id } : null));
  const [newGroup, setNewGroup] = useState(null); // { name, members: Set }
  const [manage, setManage] = useState(false);    // group manage popover
  const dmMsgs = (other) => (dms || {})[dmKeyOf(me, other)] || [];
  const dmUnread = (other) => dmMsgs(other).filter((m) => m.author !== me && m.ts > (((dmReads || {})[dmKeyOf(me, other)] || {})[me] || 0)).length;
  const projMsgs = (ch) => ch.project.chatMsgs || [];
  const projUnread = (ch) => projMsgs(ch).filter((m) => m.author !== me && m.ts > ((ch.project.chatReads || {})[me] || 0)).length;
  const myGroups = (groups || []).filter((g) => g.members.includes(me));
  const grpUnread = (g) => (g.msgs || []).filter((m) => m.author !== me && m.ts > ((g.reads || {})[me] || 0)).length;
  const clUnread = (cc) => (cc.chat.msgs || []).filter((m) => m.author !== me && m.ts > ((cc.chat.reads || {})[me] || 0)).length;
  const [fwd, setFwd] = useState(null); // message being forwarded to a group

  const selDm = sel?.type === "dm" ? sel.name : null;
  const selCh = sel?.type === "proj" ? channels.find((c2) => c2.project.id === sel.projectId) : null;
  const selGrp = sel?.type === "group" ? myGroups.find((g) => g.id === sel.groupId) : null;
  const selCl = sel?.type === "client" ? (clientChats || []).find((cc) => cc.clientId === sel.clientId) : null;
  useEffect(() => {
    if (selDm && dmUnread(selDm) > 0) onMarkDmRead(selDm);
    if (selCh && projUnread(selCh) > 0) onMarkProjectRead(selCh.clientId, selCh.project.id);
    if (selGrp && grpUnread(selGrp) > 0) onMarkGroupRead(selGrp.id);
    if (selCl && clUnread(selCl) > 0) onMarkClientRead(selCl.clientId);
  }); // cheap guards — always converges

  const preview = (msgs) => { const last = msgs[msgs.length - 1]; return last ? `${last.author === me ? "You" : maskName(last.author).split(" ")[0]}: ${last.text}` : "No messages yet"; };
  const selMember = selDm ? team.find((m) => m.name === selDm) : null;
  /* who can be @mentioned in the open thread */
  const channelMembers = (ch) => team.filter((m) => m.projects === "all" || (Array.isArray(m.projects) && m.projects.includes(ch.project.id))).map((m) => m.name);
  const createGroup = () => {
    const name = newGroup.name.trim();
    if (!name || newGroup.members.size === 0) return;
    onCreateGroup(name, [...newGroup.members]);
    setNewGroup(null);
  };
  const canManageThis = selGrp && (canManageGroups || selGrp.createdBy === me);

  const SectionLabel = ({ children }) => <div className="px-4 pb-1 pt-3 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">{children}</div>;

  return (
    <div className="flex" style={{ height: "calc(100vh - 57px)" }}>
      {/* conversation list */}
      <div className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-white">
        <SectionLabel>Direct messages</SectionLabel>
        {others.length === 0 && <div className="px-4 py-2 text-[11.5px] text-gray-300">No teammates yet — invite people in Company settings → Team.</div>}
        {others.map((m) => {
          const active = selDm === m.name;
          return (
            <button key={m.id} onClick={() => setSel({ type: "dm", name: m.name })}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-gray-50" style={active ? { background: accent + "10" } : {}}>
              <Ava name={m.name} img={m.avatar} size={30} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className={"truncate text-[12.5px] font-semibold " + (active ? "" : "text-gray-800")} style={active ? { color: accent } : {}}>{m.name}</span>
                  <span className="text-[9.5px] text-gray-400">{m.role}</span>
                </span>
                <span className="block truncate text-[10.5px] text-gray-400">{preview(dmMsgs(m.name))}</span>
              </span>
              {dmUnread(m.name) > 0 && <span className="ll-mono shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold text-white" style={{ background: accent }}>{dmUnread(m.name)}</span>}
            </button>
          );
        })}

        {clientChats && clientChats.length > 0 && (
          <>
            <div className="mt-2 border-t border-gray-100"><SectionLabel>Clients — owner only</SectionLabel></div>
            {clientChats.map((cc) => {
              const active = selCl?.clientId === cc.clientId;
              const last = (cc.chat.msgs || [])[cc.chat.msgs?.length - 1];
              return (
                <button key={cc.clientId} onClick={() => setSel({ type: "client", clientId: cc.clientId })}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-gray-50" style={active ? { background: accent + "10" } : {}}>
                  <Ava name={cc.contact || cc.name} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className={"truncate text-[12.5px] font-semibold " + (active ? "" : "text-gray-800")} style={active ? { color: accent } : {}}>{cc.contact || cc.name}</span>
                      <span className="rounded bg-gray-100 px-1 py-px text-[8px] font-bold uppercase text-gray-400">client</span>
                    </span>
                    <span className="block truncate text-[10.5px] text-gray-400">{last ? `${last.author === me ? "You" : last.author.split(" ")[0]}: ${last.text}` : cc.name}</span>
                  </span>
                  {clUnread(cc) > 0 && <span className="ll-mono shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold text-white" style={{ background: accent }}>{clUnread(cc)}</span>}
                </button>
              );
            })}
          </>
        )}

        <div className="mt-2 flex items-center border-t border-gray-100 pr-2">
          <SectionLabel>Groups</SectionLabel>
          <button onClick={() => setNewGroup(newGroup ? null : { name: "", members: new Set() })} title="New group"
            className="ml-auto mt-2 rounded-lg border border-gray-200 px-1.5 py-0.5 text-[11px] font-bold text-gray-500 hover:border-gray-300">+</button>
        </div>
        {newGroup && (
          <div className="mx-3 mb-1 rounded-xl border border-gray-200 p-2.5">
            <input autoFocus value={newGroup.name} onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
              placeholder="Group name…" className={inputCls + " mb-1.5 text-[12px]"} />
            <div className="max-h-32 space-y-0.5 overflow-y-auto">
              {others.map((m) => (
                <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-[11.5px] text-gray-700 hover:bg-gray-50">
                  <input type="checkbox" checked={newGroup.members.has(m.name)}
                    onChange={(e) => { const ms = new Set(newGroup.members); e.target.checked ? ms.add(m.name) : ms.delete(m.name); setNewGroup({ ...newGroup, members: ms }); }} />
                  <Ava name={m.name} img={m.avatar} size={18} /> {m.name}
                </label>
              ))}
            </div>
            <div className="mt-1.5 flex justify-end gap-1.5">
              <button onClick={() => setNewGroup(null)} className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-gray-400">Cancel</button>
              <button onClick={createGroup} disabled={!newGroup.name.trim() || newGroup.members.size === 0}
                className="rounded-lg px-3 py-1 text-[11px] font-bold text-white disabled:opacity-40" style={{ background: accent }}>Create</button>
            </div>
          </div>
        )}
        {myGroups.length === 0 && !newGroup && <div className="px-4 py-1 text-[11px] text-gray-300">No groups yet — hit + to start one.</div>}
        {myGroups.map((g) => {
          const active = selGrp?.id === g.id;
          return (
            <button key={g.id} onClick={() => { setSel({ type: "group", groupId: g.id }); setManage(false); }}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-gray-50" style={active ? { background: accent + "10" } : {}}>
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-white" style={{ background: accent }}><Users size={13} /></span>
              <span className="min-w-0 flex-1">
                <span className={"block truncate text-[12.5px] font-semibold " + (active ? "" : "text-gray-800")} style={active ? { color: accent } : {}}>{g.name}</span>
                <span className="block truncate text-[10.5px] text-gray-400">{g.members.length} members · {preview(g.msgs || [])}</span>
              </span>
              {grpUnread(g) > 0 && <span className="ll-mono shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold text-white" style={{ background: accent }}>{grpUnread(g)}</span>}
            </button>
          );
        })}

        <div className="mt-2 border-t border-gray-100">
          <SectionLabel>Project channels</SectionLabel>
        </div>
        {channels.length === 0 && <div className="px-4 py-2 text-[11.5px] text-gray-300">No project chats you can access yet.</div>}
        {channels.map((ch) => {
          const active = selCh?.project.id === ch.project.id;
          return (
            <button key={ch.project.id} onClick={() => setSel({ type: "proj", projectId: ch.project.id })}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-gray-50" style={active ? { background: (ch.project.accent || accent) + "10" } : {}}>
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-white" style={{ background: ch.project.accent || accent }}><Hash size={13} /></span>
              <span className="min-w-0 flex-1">
                <span className={"block truncate text-[12.5px] font-semibold " + (active ? "" : "text-gray-800")} style={active ? { color: ch.project.accent || accent } : {}}>{ch.project.name}</span>
                <span className="block truncate text-[10.5px] text-gray-400">{preview(projMsgs(ch))}</span>
              </span>
              {projUnread(ch) > 0 && <span className="ll-mono shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold text-white" style={{ background: ch.project.accent || accent }}>{projUnread(ch)}</span>}
            </button>
          );
        })}
        <div className="mt-auto px-4 py-2 text-[9px] text-gray-300">Each conversation keeps its last 1,000 messages — older ones are cleaned up automatically.</div>
      </div>

      {/* thread pane */}
      <div className="flex min-w-0 flex-1 flex-col bg-[#FAFBFC]">
        {!sel && <div className="flex flex-1 items-center justify-center text-[13px] text-gray-300">Pick a conversation on the left.</div>}
        {selDm && (
          <>
            <div className="flex items-center gap-2.5 border-b border-gray-200 bg-white px-4 py-2.5">
              <Ava name={selDm} img={selMember?.avatar} size={30} />
              <div>
                <div className="text-[13px] font-bold text-gray-800">{selDm}</div>
                <div className="text-[10px] text-gray-400">{selMember?.title || selMember?.role} · Private — only the two of you can see this</div>
              </div>
            </div>
            <MessageThread msgs={dmMsgs(selDm)} me={me} accent={accent} mentionables={[me, selDm]}
              onSend={(text, replyTo) => onSendDm(selDm, text, replyTo)}
              onReact={(msgId, emoji) => onReactDm(selDm, msgId, emoji)} />
          </>
        )}
        {selGrp && (
          <>
            <div className="relative flex items-center gap-2.5 border-b border-gray-200 bg-white px-4 py-2.5">
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-white" style={{ background: accent }}><Users size={13} /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold text-gray-800">{selGrp.name}</div>
                <div className="truncate text-[10px] text-gray-400">{selGrp.members.join(", ")}</div>
              </div>
              <span className="flex -space-x-1.5">{selGrp.members.slice(0, 5).map((n) => <Ava key={n} name={n} img={team.find((m) => m.name === n)?.avatar} size={22} />)}</span>
              {canManageThis && (
                <button onClick={() => setManage((v) => !v)} className="rounded-lg border border-gray-200 px-2 py-1 text-[10.5px] font-semibold text-gray-500 hover:border-gray-300">Manage</button>
              )}
              {manage && canManageThis && (
                <div className="absolute right-3 top-full z-30 mt-1 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
                  <input value={selGrp.name} onChange={(e) => onUpdateGroup(selGrp.id, { name: e.target.value })} className={inputCls + " mb-2 text-[12px]"} />
                  <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Members</div>
                  <div className="max-h-36 space-y-0.5 overflow-y-auto">
                    {team.map((m) => (
                      <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-[11.5px] text-gray-700 hover:bg-gray-50">
                        <input type="checkbox" checked={selGrp.members.includes(m.name)} disabled={m.name === me}
                          onChange={(e) => onUpdateGroup(selGrp.id, { members: e.target.checked ? [...selGrp.members, m.name] : selGrp.members.filter((x) => x !== m.name) })} />
                        <Ava name={m.name} img={m.avatar} size={18} /> {m.name}{m.name === me ? " (you)" : ""}
                      </label>
                    ))}
                  </div>
                  <button onClick={() => { if (confirm(`Delete group "${selGrp.name}"?`)) { onDeleteGroup(selGrp.id); setSel(null); setManage(false); } }}
                    className="mt-2 w-full rounded-lg border border-red-200 py-1.5 text-[11px] font-semibold text-red-500 hover:bg-red-50">Delete group</button>
                </div>
              )}
            </div>
            <MessageThread msgs={selGrp.msgs || []} me={me} accent={accent} mentionables={selGrp.members}
              onSend={(text, replyTo) => onSendGroup(selGrp.id, text, replyTo)}
              onReact={(msgId, emoji) => onReactGroup(selGrp.id, msgId, emoji)} />
          </>
        )}
        {selCl && (
          <>
            <div className="flex items-center gap-2.5 border-b border-gray-200 bg-white px-4 py-2.5">
              <Ava name={selCl.contact || selCl.name} size={30} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold text-gray-800">{selCl.contact || selCl.name}</div>
                <div className="truncate text-[10px] text-gray-400">{selCl.name} · Private owner ↔ client line · hover a client message to forward it to a group</div>
              </div>
            </div>
            <MessageThread msgs={selCl.chat.msgs || []} me={me} accent={accent} mentionables={[me, selCl.contact]}
              onSend={(text, replyTo) => onSendClient(selCl.clientId, text, replyTo)}
              onReact={(msgId, emoji) => onReactClient(selCl.clientId, msgId, emoji)}
              onForward={myGroups.length ? (m) => setFwd(m) : null} />
            {fwd && (
              <div className="border-t border-gray-200 bg-amber-50 px-4 py-2.5">
                <div className="mb-1.5 text-[11px] font-semibold text-amber-800">Forward to a group <span className="font-normal text-amber-700">— “{fwd.text.slice(0, 60)}{fwd.text.length > 60 ? "…" : ""}”</span></div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {myGroups.map((g) => (
                    <button key={g.id} onClick={() => { onSendGroup(g.id, `↪ Forwarded from client:\n“${fwd.text}”`); setFwd(null); }}
                      className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100">
                      <Users size={10} className="mr-1 inline" />{g.name}
                    </button>
                  ))}
                  <button onClick={() => setFwd(null)} className="ml-auto text-[11px] font-medium text-amber-600">Cancel</button>
                </div>
                <div className="mt-1 text-[9px] text-amber-700">The client's name is never included — the group sees it as “Forwarded from client”.</div>
              </div>
            )}
          </>
        )}
        {selCh && (
          <>
            <div className="flex items-center gap-2.5 border-b border-gray-200 bg-white px-4 py-2.5">
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-white" style={{ background: selCh.project.accent || accent }}><Hash size={13} /></span>
              <div>
                <div className="text-[13px] font-bold text-gray-800">{selCh.project.name}</div>
                <div className="text-[10px] text-gray-400">{selCh.clientName} · synced with Project Management → Chat</div>
              </div>
            </div>
            <MessageThread msgs={projMsgs(selCh)} me={me} accent={selCh.project.accent || accent} maskName={maskName}
              mentionables={channelMembers(selCh)}
              onSend={(text, replyTo) => onSendProject(selCh.clientId, selCh.project.id, text, replyTo)}
              onReact={(msgId, emoji) => onReactProject(selCh.clientId, selCh.project.id, msgId, emoji)} />
          </>
        )}
      </div>
    </div>
  );
}

/* =====================================================================
   Team (admins & owner only) — every member; per member: Assignments
   (completed within a timeline + assigned-to-do) and Activity (browsing
   trail, private-message oversight, project chat messages)
   ===================================================================== */
const RANGES = [["1d", "Today", 1], ["7d", "This week", 7], ["31d", "This month", 31], ["92d", "Last 3 months", 92]];

export function TeamView({ team, clients, activity, dms, accent, onOpenTask }) {
  const [openId, setOpenId] = useState(null);
  const [tab, setTab] = useState("assignments");
  const [mode, setMode] = useState("done");   // done | todo
  const [range, setRange] = useState("7d");
  const member = team.find((m) => m.id === openId);
  const today = todayISO();

  /* ------- member list ------- */
  if (!member) {
    return (
      <div className="ll-fade space-y-4 p-5">
        <div>
          <div className="ll-display flex items-center gap-2 text-[18px] font-bold"><Users size={17} style={{ color: accent }} /> Team</div>
          <div className="text-[12px] text-gray-400">Everyone in the workspace — open a member to review their assignments and activity.</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {team.map((m) => {
            const tasks = tasksFor(clients, m.name);
            const open = tasks.filter((x) => !x.t.completedAt).length;
            const late = tasks.filter((x) => colOfTask(x.t, today) === "late").length;
            const done7 = tasks.filter((x) => x.t.completedAt && Date.now() - x.t.completedAt < 7 * 864e5).length;
            return (
              <button key={m.id} onClick={() => { setOpenId(m.id); setTab("assignments"); setMode("done"); }}
                className="rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm hover:border-gray-300">
                <div className="flex items-center gap-3">
                  <Ava name={m.name} img={m.avatar} size={40} />
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-bold text-gray-800">{m.name}{m.isOwner ? " · owner" : ""}</div>
                    <div className="truncate text-[11px] text-gray-400">{m.title || m.role}</div>
                  </div>
                </div>
                <div className="mt-3 flex gap-1.5 text-[10px] font-semibold">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">{open} open</span>
                  {late > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-600">{late} late</span>}
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">{done7} done this week</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /* ------- member detail ------- */
  const name = member.name;
  const tasks = tasksFor(clients, name);
  const rangeDays = RANGES.find(([k]) => k === range)?.[2] || 7;
  const doneTasks = tasks.filter((x) => x.t.completedAt && Date.now() - x.t.completedAt < rangeDays * 864e5);
  const todoTasks = tasks.filter((x) => !x.t.completedAt);
  const memberActivity = (activity || []).filter((a) => a.member === name);
  const dmThreads = Object.entries(dms || {}).filter(([k]) => k.split("|").includes(name)).map(([k, msgs]) => ({ partner: k.split("|").find((x) => x !== name) || name, msgs }));
  const chatMessages = clients.flatMap((c) => c.projects.flatMap((p) => (p.chatMsgs || []).filter((m) => m.author === name).map((m) => ({ ...m, projectName: p.name }))));

  const boxes = (list, colKeyFn) => {
    const groups = groupByProject(list);
    return groups.length === 0
      ? <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-[12px] text-gray-300">Nothing in this window.</div>
      : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{groups.map((g) => <ProjectBox key={g.p.id} group={g} colKey={colKeyFn} accent={accent} onOpenTask={onOpenTask} />)}</div>;
  };

  return (
    <div className="ll-fade space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => setOpenId(null)} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px] font-medium text-gray-500 hover:border-gray-300"><ArrowLeft size={12} /> Team</button>
        <Ava name={name} img={member.avatar} size={40} />
        <div className="min-w-0 flex-1">
          <div className="ll-display text-[16px] font-bold">{name}</div>
          <div className="text-[11px] text-gray-400">{member.title || member.role} · {member.email}</div>
        </div>
        <div className="flex gap-1">
          {[["assignments", "Assignments", ClipboardList], ["activity", "Activity", Activity]].map(([k, l, Icon]) => (
            <button key={k} onClick={() => setTab(k)} className="flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold"
              style={tab === k ? { background: accent + "10", borderColor: accent, color: accent } : { borderColor: "#E5E7EB", color: "#4B5563", background: "#fff" }}>
              <Icon size={13} /> {l}
            </button>
          ))}
        </div>
      </div>

      {tab === "assignments" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {[["done", "Completed"], ["todo", "Assigned / to do"]].map(([k, l]) => (
              <button key={k} onClick={() => setMode(k)} className="rounded-full border px-3.5 py-1.5 text-[12px] font-semibold"
                style={mode === k ? { background: accent, borderColor: accent, color: "#fff" } : { borderColor: "#E5E7EB", color: "#4B5563", background: "#fff" }}>
                {l} ({k === "done" ? doneTasks.length : todoTasks.length})
              </button>
            ))}
            {mode === "done" && (
              <select value={range} onChange={(e) => setRange(e.target.value)} className={inputCls + " ml-auto w-auto"}>
                {RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            )}
          </div>
          {mode === "done" ? boxes(doneTasks, "done") : boxes(todoTasks, "todo")}
        </>
      )}

      {tab === "activity" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="p-4">
            <div className="mb-2 text-[12.5px] font-bold text-gray-800">Workspace activity</div>
            {memberActivity.length === 0 && <div className="py-8 text-center text-[11.5px] text-gray-300">No recorded activity yet.</div>}
            <div className="max-h-96 space-y-1 overflow-y-auto">
              {memberActivity.map((a) => (
                <div key={a.id} className="flex items-baseline gap-2 rounded-lg px-2 py-1.5 text-[12px] hover:bg-gray-50">
                  <span className="min-w-0 flex-1 text-gray-600"><b className="text-gray-800">{a.action}</b>{a.target ? <> — {a.target}</> : null}</span>
                  <span className="ll-mono shrink-0 text-[9.5px] text-gray-400">{relTime(a.ts)}</span>
                </div>
              ))}
            </div>
          </Card>
          <div className="space-y-4">
            <Card className="p-4">
              <div className="mb-2 text-[12.5px] font-bold text-gray-800">Private messages <span className="ml-1 text-[9.5px] font-semibold uppercase tracking-wide text-amber-600">admin oversight</span></div>
              {dmThreads.length === 0 && <div className="py-6 text-center text-[11.5px] text-gray-300">No private conversations.</div>}
              <div className="max-h-72 space-y-3 overflow-y-auto">
                {dmThreads.map(({ partner, msgs }) => (
                  <div key={partner}>
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-gray-700"><Ava name={partner} size={16} /> with {partner}</div>
                    {msgs.slice(-6).map((m) => (
                      <div key={m.id} className="ml-5 flex items-baseline gap-2 text-[11.5px] text-gray-600">
                        <span className="min-w-0 flex-1"><b className="text-gray-800">{m.author === name ? name : m.author}:</b> {m.text}</span>
                        <span className="ll-mono shrink-0 text-[9px] text-gray-400">{relTime(m.ts)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-4">
              <div className="mb-2 text-[12.5px] font-bold text-gray-800">Project chat messages</div>
              {chatMessages.length === 0 && <div className="py-6 text-center text-[11.5px] text-gray-300">No project chat messages.</div>}
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {chatMessages.slice(-20).map((m) => (
                  <div key={m.id} className="flex items-baseline gap-2 rounded-lg px-2 py-1 text-[11.5px] hover:bg-gray-50">
                    <span className="min-w-0 flex-1 text-gray-600"><b style={{ color: accent }}>#{m.projectName}</b> — {m.text}</span>
                    <span className="ll-mono shrink-0 text-[9px] text-gray-400">{relTime(m.ts)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
