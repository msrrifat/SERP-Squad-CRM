import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  MapPin, Phone, Globe, Star, Search, Users, Eye, Settings, Plus, X,
  Building2, LayoutDashboard, Target, Palette, Link2, CheckCircle2,
  Printer, ArrowUpRight, ArrowDownRight, Minus, Navigation, Upload,
  MousePointerClick, BarChart3, Smartphone, Monitor, RefreshCw, Clock,
  Trash2, ChevronDown, ChevronRight, Folder, FolderOpen, Zap, KeyRound,
  LogIn, LogOut, ChevronUp, Copy, Settings2, Type, AlignLeft, Table2,
  PieChart as PieIcon, Activity, FileText as FileTextIcon, ArrowLeft, ClipboardPaste,
  Calendar, Sun, Moon, Shield, History, UserPlus, Wallet, Receipt, ListTodo, MessageSquare,
  Rocket, Share2, Lock, Send, ImagePlus, List, ListOrdered, Quote, Facebook, Instagram, Linkedin, Twitter, Youtube, Music2, Pin,
} from "lucide-react";
import { AssignPicker, Ava, Card, NEG, POS, inputCls } from "../../ui/primitives.jsx";
import { fmtDay, fmtTs2, relTime, todayISO } from "../../lib/format.jsx";
import { inlineFmt } from "../../lib/text.jsx";
import { MessageThread, capMsgs, toggleReaction } from "../chat/thread.jsx";

export const taskState = (t) => (t.completedAt ? "done" : t.dueDate && t.dueDate < todayISO() ? "overdue" : "open");
export const TASK_COLORS = { done: "#15803D", overdue: "#DC2626", open: "#1F2937" };
export const flatTasks = (r) => (r.checklists || []).flatMap((c) => c.tasks);
export const recordState = (r) => {
  if (r.completedAt) return "done";
  if (flatTasks(r).some((t) => taskState(t) === "overdue") || (r.dueDate && r.dueDate < todayISO())) return "overdue";
  return "open";
};

export function RecordWindow({ record, people, perms, currentUser, accent, onPatch, onDelete, onClose, maskName = (n) => n, onSaveTemplate = null, alreadyTemplate = false }) {
  const [tab, setTab] = useState("comments");
  const [newChecklist, setNewChecklist] = useState("");
  const [newTask, setNewTask] = useState({});
  const [comment, setComment] = useState("");

  const act = (text) => ({ id: "pa" + Date.now() + Math.random().toString(36).slice(2, 5), ts: Date.now(), author: currentUser, text });
  const patch = (p, actText) => onPatch({ ...p, updatedAt: Date.now(), activity: actText ? [act(actText), ...record.activity] : record.activity });

  const setChecklists = (cls, actText) => patch({ checklists: cls }, actText);
  const addChecklist = () => {
    const nm = newChecklist.trim(); if (!nm) return;
    setChecklists([...record.checklists, { id: "cl" + Date.now(), name: nm, tasks: [] }], `added checklist "${nm}"`);
    setNewChecklist("");
  };
  const addTask = (clId) => {
    const title = (newTask[clId] || "").trim(); if (!title) return;
    setChecklists(record.checklists.map((c) => c.id !== clId ? c : {
      ...c, tasks: [...c.tasks, { id: "t" + Date.now(), title, createdAt: Date.now(), dueDate: null, completedAt: null, assignees: [] }],
    }), `added task "${title}"`);
    setNewTask({ ...newTask, [clId]: "" });
  };
  const mutTask = (clId, tId, fn, actText) =>
    setChecklists(record.checklists.map((c) => c.id !== clId ? c : { ...c, tasks: c.tasks.map((t) => (t.id === tId ? fn(t) : t)) }), actText);
  const delTask = (clId, tId, title) =>
    setChecklists(record.checklists.map((c) => c.id !== clId ? c : { ...c, tasks: c.tasks.filter((t) => t.id !== tId) }), `deleted task "${title}"`);
  const addComment = () => {
    const txt = comment.trim(); if (!txt) return;
    patch({ comments: [{ id: "c" + Date.now(), ts: Date.now(), author: currentUser, text: txt }, ...record.comments] }, "commented");
    setComment("");
  };

  const isAssignee = record.assignees.includes(currentUser);
  const mayComment = perms.comment && (perms.admin || isAssignee);
  const done = flatTasks(record).filter((t) => t.completedAt).length;
  const total = flatTasks(record).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-3" onClick={onClose}>
      <div className="flex h-[88vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>

        {/* ============ LEFT 70% — record + checklists + tasks ============ */}
        <div className="flex w-[70%] flex-col border-r border-gray-100">
          <div className="border-b border-gray-100 px-6 pb-4 pt-5">
            <div className="flex items-start justify-between gap-3">
              <input value={record.name} disabled={!perms.manage}
                onChange={(e) => patch({ name: e.target.value })}
                className="ll-display w-full border-0 bg-transparent text-[20px] font-bold tracking-tight outline-none" />
              <div className="flex shrink-0 items-center gap-1.5">
                {onSaveTemplate && perms.manage && (
                  <button disabled={alreadyTemplate}
                    title={alreadyTemplate
                      ? "Already saved as a record template — manage it in the Record Templates tab"
                      : "Save this record's checklists & tasks as a reusable template — available in every project's Record Templates tab"}
                    onClick={() => {
                      const nm = prompt("Save as record template — template name:", record.name);
                      if (nm?.trim()) onSaveTemplate({
                        id: "tpl" + Date.now(), name: nm.trim(), savedAt: Date.now(),
                        checklists: record.checklists.map((c) => ({ name: c.name, tasks: c.tasks.map((t) => ({ title: t.title })) })),
                      });
                    }}
                    className={"flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11.5px] font-semibold " +
                      (alreadyTemplate ? "cursor-not-allowed opacity-40 blur-[0.3px]" : "text-gray-600 hover:border-gray-300 hover:text-gray-800")}>
                    <Copy size={12} /> {alreadyTemplate ? "Saved as template" : "Save as template"}
                  </button>
                )}
                {perms.admin && (
                  <button onClick={() => { onDelete(); onClose(); }} title="Delete record"
                    className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500"><Trash2 size={15} /></button>
                )}
                <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X size={17} /></button>
              </div>
            </div>
            {/* fixed fields */}
            <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-5">
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Created at</div>
                <div className="ll-mono mt-0.5 text-[12px] text-gray-600">{fmtTs2(record.createdAt)}</div>
              </div>
              <div className="col-span-2 lg:col-span-1">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Assignees</div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {record.assignees.map((a) => (
                    <Ava key={a} name={maskName(a)} size={22}
                      onRemove={perms.manage ? () => patch({ assignees: record.assignees.filter((x) => x !== a) }, `removed assignee ${a}`) : undefined} />
                  ))}
                  {perms.manage && <AssignPicker people={people} current={record.assignees}
                    onAdd={(n) => patch({ assignees: [...record.assignees, n] }, `added assignee ${n}`)} />}
                </div>
              </div>
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Updated at</div>
                <div className="ll-mono mt-0.5 text-[12px] text-gray-600">{relTime(record.updatedAt)}</div>
              </div>
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Due date</div>
                <input type="date" value={record.dueDate || ""} disabled={!perms.manage}
                  onChange={(e) => patch({ dueDate: e.target.value || null }, `set due date to ${fmtDay(e.target.value)}`)}
                  className="ll-mono mt-0.5 rounded border border-gray-200 px-1.5 py-0.5 text-[11px]" />
              </div>
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Completed at</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="ll-mono text-[12px]" style={{ color: record.completedAt ? POS : "#6B7280" }}>{fmtTs2(record.completedAt)}</span>
                  {perms.manage && (
                    <button onClick={() => patch({ completedAt: record.completedAt ? null : Date.now() }, record.completedAt ? "reopened this record" : "marked this record complete")}
                      className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                      style={record.completedAt ? { background: "#F1F5F9", color: "#475569" } : { background: "#DCFCE7", color: "#166534" }}>
                      {record.completedAt ? "Reopen" : "Complete"}
                    </button>
                  )}
                </div>
              </div>
            </div>
            {total > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full transition-all" style={{ width: `${(done / total) * 100}%`, background: accent }} />
                </div>
                <span className="ll-mono text-[11px] text-gray-400">{done}/{total} tasks</span>
              </div>
            )}
          </div>

          {/* checklists + tasks */}
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
            {record.checklists.map((cl) => {
              const clDone = cl.tasks.filter((t) => t.completedAt).length;
              return (
                <div key={cl.id}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="ll-display text-[14px] font-semibold text-gray-800">{cl.name}</div>
                    <span className="ll-mono text-[10.5px] text-gray-400">{clDone}/{cl.tasks.length}</span>
                  </div>
                  <div className="space-y-0.5">
                    {cl.tasks.map((t) => {
                      const st = taskState(t);
                      return (
                        <div key={t.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                          {/* LEFT of task: delete + complete checkbox */}
                          <div className="flex shrink-0 items-center gap-1">
                            {perms.manage ? (
                              <button onClick={() => delTask(cl.id, t.id, t.title)} title="Delete task"
                                className="rounded p-0.5 text-gray-200 hover:bg-red-50 hover:text-red-500 group-hover:text-gray-300"><Trash2 size={13} /></button>
                            ) : <span className="w-[18px]" />}
                            <button
                              disabled={!perms.manage && !(perms.complete && t.assignees.includes(currentUser))}
                              onClick={() => mutTask(cl.id, t.id, (x) => ({ ...x, completedAt: x.completedAt ? null : Date.now() }),
                                t.completedAt ? `reopened task "${t.title}"` : `completed task "${t.title}"`)}
                              title={t.completedAt ? "Mark incomplete" : "Mark complete"}
                              className="disabled:cursor-not-allowed disabled:opacity-40"
                              style={{ width: 17, height: 17, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 5,
                                border: `2px solid ${t.completedAt ? POS : st === "overdue" ? NEG : "#94A3B8"}`,
                                background: t.completedAt ? POS : "transparent", color: "#fff" }}>
                              {t.completedAt && <CheckCircle2 size={11} strokeWidth={3.5} />}
                            </button>
                          </div>
                          {/* title */}
                          <div className="min-w-0 flex-1 text-[13px] font-medium"
                            style={{ color: TASK_COLORS[st], textDecoration: st === "done" ? "line-through" : "none", opacity: st === "done" ? 0.75 : 1 }}>
                            {t.title}
                          </div>
                          {/* RIGHT of task: dates + assignees */}
                          <div className="flex shrink-0 items-end gap-2.5 text-gray-400">
                            <span className="flex flex-col items-start">
                              <span className="text-[8px] font-semibold uppercase tracking-wider text-gray-300">Created</span>
                              <span className="ll-mono text-[10px] leading-tight">{fmtTs2(t.createdAt)}</span>
                            </span>
                            <span className="flex flex-col items-start">
                              <span className="text-[8px] font-semibold uppercase tracking-wider" style={{ color: st === "overdue" ? NEG : "#D1D5DB" }}>Due</span>
                              <input type="date" value={t.dueDate || ""} disabled={!perms.manage}
                                onChange={(e) => mutTask(cl.id, t.id, (x) => ({ ...x, dueDate: e.target.value || null }), `set task due date to ${fmtDay(e.target.value)}`)}
                                className="ll-mono w-[86px] rounded border border-gray-100 bg-transparent px-1 leading-tight"
                                style={{ fontSize: 10, height: 16, color: st === "overdue" ? NEG : "#6B7280" }} />
                            </span>
                            <span className="flex flex-col items-start">
                              <span className="text-[8px] font-semibold uppercase tracking-wider" style={{ color: t.completedAt ? POS : "#D1D5DB" }}>Done</span>
                              <span className="ll-mono text-[10px] leading-tight" style={{ color: t.completedAt ? POS : "#C3CAD6" }}>{t.completedAt ? fmtTs2(t.completedAt) : "\u2014"}</span>
                            </span>
                            <div className="flex -space-x-1.5">
                              {t.assignees.map((a) => (
                                <Ava key={a} name={maskName(a)} size={19}
                                  onRemove={perms.manage ? () => mutTask(cl.id, t.id, (x) => ({ ...x, assignees: x.assignees.filter((n) => n !== a) }), `removed ${a} from "${t.title}"`) : undefined} />
                              ))}
                            </div>
                            {perms.manage && <AssignPicker people={people} current={t.assignees}
                              onAdd={(n) => mutTask(cl.id, t.id, (x) => ({ ...x, assignees: [...x.assignees, n] }), `assigned ${n} to "${t.title}"`)} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {perms.manage && (
                    <div className="mt-1 flex items-center gap-1.5 pl-2">
                      <input value={newTask[cl.id] || ""} onChange={(e) => setNewTask({ ...newTask, [cl.id]: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && addTask(cl.id)}
                        placeholder="Add task…" className="flex-1 rounded-lg border border-dashed border-gray-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-gray-300" />
                      <button onClick={() => addTask(cl.id)} className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-white" style={{ background: accent }}>
                        <Plus size={13} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {perms.manage && (
              <div className="flex items-center gap-1.5">
                <input value={newChecklist} onChange={(e) => setNewChecklist(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addChecklist()}
                  placeholder="Create checklist…" className="flex-1 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-[13px] outline-none focus:border-gray-400" />
                <button onClick={addChecklist} className="flex items-center gap-1 rounded-xl px-3 py-2 text-[12.5px] font-semibold text-white" style={{ background: accent }}>
                  <ListTodo size={14} /> Create Checklist
                </button>
              </div>
            )}
            {record.checklists.length === 0 && !perms.manage && (
              <div className="py-8 text-center text-[13px] text-gray-300">No checklists yet.</div>
            )}
          </div>
        </div>

        {/* ============ RIGHT 30% — comments & activity ============ */}
        <div className="flex w-[30%] flex-col bg-gray-50/60">
          <div className="flex border-b border-gray-100">
            {[["comments", "Comments", MessageSquare], ["activity", "Activity", History]].map(([key, label, Icon]) => (
              <button key={key} onClick={() => setTab(key)}
                className="flex flex-1 items-center justify-center gap-1.5 border-b-2 py-3 text-[12.5px] font-semibold"
                style={tab === key ? { borderColor: accent, color: accent } : { borderColor: "transparent", color: "#9CA3AF" }}>
                <Icon size={14} /> {label}
                {key === "comments" && record.comments.length > 0 && <span className="ll-mono text-[10px]">({record.comments.length})</span>}
              </button>
            ))}
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {tab === "comments" && record.comments.map((c) => (
              <div key={c.id} className="rounded-xl border border-gray-100 bg-white p-3">
                <div className="mb-1 flex items-center gap-2">
                  <Ava name={maskName(c.author)} size={20} />
                  <span className="text-[12px] font-semibold text-gray-800">{maskName(c.author)}</span>
                  <span className="ll-mono ml-auto text-[10px] text-gray-400">{relTime(c.ts)}</span>
                </div>
                <p className="text-[12.5px] leading-relaxed text-gray-600">{c.text}</p>
              </div>
            ))}
            {tab === "comments" && record.comments.length === 0 && (
              <div className="py-6 text-center text-[12px] text-gray-300">No comments yet.</div>
            )}
            {tab === "activity" && record.activity.map((a) => (
              <div key={a.id} className="flex items-start gap-2">
                <Ava name={maskName(a.author)} size={20} />
                <div className="min-w-0 flex-1 text-[12px] leading-snug">
                  <span className="font-semibold text-gray-800">{maskName(a.author)}</span>{" "}
                  <span className="text-gray-500">{a.text}</span>
                  <div className="ll-mono text-[10px] text-gray-400">{relTime(a.ts)}</div>
                </div>
              </div>
            ))}
          </div>
          {tab === "comments" && (
            <div className="border-t border-gray-100 p-3">
              {mayComment ? (
                <div className="flex items-end gap-1.5">
                  <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addComment(); } }}
                    placeholder="Write a comment…" className="flex-1 resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] outline-none focus:border-gray-300" />
                  <button onClick={addComment} disabled={!comment.trim()}
                    className="rounded-xl px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>Send</button>
                </div>
              ) : (
                <div className="rounded-xl bg-gray-100 px-3 py-2 text-center text-[11px] text-gray-400">
                  Only assignees of this record can comment.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- record list + create ---- */
export function WikiView({ project, onUpdate, canEdit, accent, log }) {
  const wiki = project.wiki || { text: "", updatedAt: null };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(wiki.text);
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="ll-display text-[15px] font-semibold">Project Wiki</div>
          <div className="text-[11px] text-gray-400">Everything the team should know about this project{wiki.updatedAt ? ` \u00b7 updated ${relTime(wiki.updatedAt)}` : ""}. **bold**, *italic* and links render automatically.</div>
        </div>
        {canEdit && (editing ? (
          <div className="flex gap-1.5">
            <button onClick={() => setEditing(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-gray-500">Cancel</button>
            <button onClick={() => { onUpdate({ wiki: { text: draft, updatedAt: Date.now() } }); setEditing(false); log?.("Updated project wiki", project.name); }}
              className="rounded-lg px-3.5 py-1.5 text-[12px] font-semibold text-white" style={{ background: accent }}>Save wiki</button>
          </div>
        ) : (
          <button onClick={() => { setDraft(wiki.text); setEditing(true); }}
            className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[12px] font-semibold" style={{ borderColor: accent, color: accent }}>
            <Settings2 size={12} /> Edit wiki
          </button>
        ))}
      </div>
      {editing ? (
        <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={14}
          placeholder={"# What is this project?\nGoals, target keywords, brand voice, login notes, do's & don'ts\u2026"}
          className={inputCls + " ll-mono resize-y text-[12.5px] leading-relaxed"} />
      ) : wiki.text ? (
        <div className="space-y-2.5 text-[13px] leading-relaxed text-gray-700">
          {wiki.text.split(/\n{2,}/).map((para, i) => <p key={i}>{inlineFmt(para, "w" + i)}</p>)}
        </div>
      ) : (
        <div className="py-10 text-center text-[12.5px] text-gray-300">No wiki yet {canEdit ? "\u2014 click Edit wiki to describe this project for your team." : "."}</div>
      )}
    </Card>
  );
}

/* per-project chat: everyone assigned to the project (agency team + client)
   shares one thread; names follow the same masking wall as records */
export const chatUnreadCount = (project, user) =>
  (project?.chatMsgs || []).filter((m) => m.author !== user && m.ts > ((project?.chatReads || {})[user] || 0)).length;

export function ChatView({ project, currentUser, canWrite = true, accent, onUpdate, maskName = (n) => n, mentionables = [] }) {
  const msgs = project.chatMsgs || [];
  /* opening the thread (or receiving messages while it's open) marks it read */
  useEffect(() => {
    const last = msgs[msgs.length - 1];
    if (last && ((project.chatReads || {})[currentUser] || 0) < last.ts)
      onUpdate((pr) => ({ chatReads: { ...(pr.chatReads || {}), [currentUser]: Date.now() } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs.length]);
  const send = (text, replyTo) => {
    const now = Date.now();
    onUpdate((pr) => ({
      chatMsgs: capMsgs([...(pr.chatMsgs || []), { id: "cm" + now + Math.random().toString(36).slice(2, 5), ts: now, author: currentUser, text, replyTo: replyTo || null }]),
      chatReads: { ...(pr.chatReads || {}), [currentUser]: now },
    }));
  };
  const react = (msgId, emoji) =>
    onUpdate((pr) => ({ chatMsgs: (pr.chatMsgs || []).map((m) => (m.id === msgId ? toggleReaction(m, emoji, currentUser) : m)) }));
  return (
    <Card className="flex flex-col overflow-hidden p-0" style={{ minHeight: 460 }}>
      <div className="border-b border-gray-100 px-5 py-3.5">
        <div className="ll-display flex items-center gap-2 text-[15px] font-semibold"><MessageSquare size={15} style={{ color: accent }} /> Project chat</div>
        <div className="text-[11px] text-gray-400">Everyone assigned to {project.name} — agency team and client — shares this thread. Hover a message to react, right-click to reply.</div>
      </div>
      <MessageThread msgs={msgs} me={currentUser} accent={accent} canWrite={canWrite} onSend={send} onReact={react} maskName={maskName} mentionables={mentionables} />
    </Card>
  );
}

export function ProjectManagementView({ project, people, perms, currentUser, accent, onUpdate, log, maskName = (n) => n, canChat = true, initialOpenId = null, jumpKey = 0,
  templates = null, onSaveTemplate = null, onDeleteTemplate = null }) {
  const records = project.records || [];
  /* board lists (kanban columns) — every record belongs to one; the same
     columns are mirrored across the All/Open/Overdue/Completed filters */
  const lists = project.lists && project.lists.length ? project.lists : [{ id: "list-default", name: "Records" }];
  const listIdOf = (r) => (lists.some((l) => l.id === r.listId) ? r.listId : lists[0].id);
  const setLists = (ls) => onUpdate({ lists: ls });
  const [newListName, setNewListName] = useState("");
  const [cardDraft, setCardDraft] = useState({});   // listId -> draft name for the inline "+ Add record"
  const [dragOver, setDragOver] = useState(null);
  const [listMenu, setListMenu] = useState(null);
  const [pmTab, setPmTab] = useState("records");
  const [openId, setOpenId] = useState(null);
  /* deep link from My assignments: land on the records tab with the record open */
  useEffect(() => {
    if (initialOpenId) { setPmTab("records"); setOpenId(initialOpenId); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpKey]);
  const [filter, setFilter] = useState("All");
  const [newName, setNewName] = useState("");

  const setRecords = (recs) => onUpdate({ records: recs });
  const patchRecord = (id, patch2) => setRecords(records.map((r) => (r.id === id ? { ...r, ...patch2, updatedAt: Date.now() } : r)));
  const createRecord = (listId, name) => {
    const nm = (name ?? newName).trim(); if (!nm) return;
    const rec = {
      id: "r" + Date.now(), name: nm, listId: listId || lists[0].id,
      createdAt: Date.now(), updatedAt: Date.now(), dueDate: null, completedAt: null,
      assignees: [currentUser], checklists: [], comments: [],
      activity: [{ id: "pa" + Date.now(), ts: Date.now(), author: currentUser, text: "created this record" }],
    };
    setRecords([rec, ...records]);
    log?.("Created record", `${nm} (${project.name})`);
    setNewName(""); setOpenId(rec.id);
  };
  const addList = () => {
    const nm = newListName.trim(); if (!nm) return;
    setLists([...lists, { id: "list" + Date.now(), name: nm }]);
    setNewListName("");
    log?.("Created list", `${nm} (${project.name})`);
  };
  /* import a company-wide record template into this project (fresh ids, clean state) */
  const importTemplate = (tpl, listId) => {
    const now = Date.now();
    const rec = {
      id: "r" + now, name: tpl.name, listId: listId || lists[0].id,
      createdAt: now, updatedAt: now, dueDate: null, completedAt: null,
      assignees: [], comments: [],
      checklists: (tpl.checklists || []).map((cl, i) => ({
        id: "cl" + now + i, name: cl.name,
        tasks: (cl.tasks || []).map((t, j) => ({ id: "t" + now + i + "_" + j, title: t.title, createdAt: now, dueDate: null, completedAt: null, assignees: [] })),
      })),
      activity: [{ id: "pa" + now, ts: now, author: currentUser, text: `imported from record template "${tpl.name}"` }],
    };
    setRecords([rec, ...records]);
    log?.("Imported record template", `${tpl.name} → ${project.name}`);
    setOpenId(rec.id);
  };

  const FILTERS = ["All", "Open", "Overdue", "Completed"];
  const stateOf = { done: "Completed", overdue: "Overdue", open: "Open" };
  const rows = records.filter((r) => filter === "All" || stateOf[recordState(r)] === filter);
  const openRecord = records.find((r) => r.id === openId);

  const STATE_CHIP = {
    done: { bg: "#DCFCE7", fg: "#166534", label: "Completed" },
    overdue: { bg: "#FEE2E2", fg: "#991B1B", label: "Overdue" },
    open: { bg: "#F1F5F9", fg: "#475569", label: "In progress" },
  };

  return (
    <div className="ll-fade space-y-4">
      {/* PM top bar */}
      <div className="flex gap-1.5">
        {[["records", "Records", ListTodo], ...(templates ? [["templates", "Record Templates", Copy]] : []), ["wiki", "Wiki", FileTextIcon], ...(canChat ? [["chat", "Chat", MessageSquare]] : [])].map(([key, label, Icon]) => (
          <button key={key} onClick={() => setPmTab(key)}
            className="flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold"
            style={pmTab === key ? { background: accent + "10", borderColor: accent, color: accent } : { background: "var(--chip-bg, #fff)", borderColor: "#E5E7EB", color: "var(--chip-fg, #4B5563)" }}>
            <Icon size={13} /> {label}
            {key === "chat" && pmTab !== "chat" && chatUnreadCount(project, currentUser) > 0 && (
              <span className="ll-mono rounded-full px-1.5 text-[10px] font-bold" style={{ background: accent, color: "#fff" }}>{chatUnreadCount(project, currentUser)}</span>
            )}
          </button>
        ))}
      </div>
      {pmTab === "wiki" && <WikiView project={project} onUpdate={onUpdate} canEdit={perms.manage} accent={accent} log={log} />}
      {pmTab === "chat" && canChat && <ChatView project={project} currentUser={currentUser} canWrite={perms.comment !== false} accent={accent} onUpdate={onUpdate} maskName={maskName} mentionables={people.map((p2) => p2.name)} />}
      {pmTab === "records" && (<>
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const n = f === "All" ? records.length : records.filter((r) => stateOf[recordState(r)] === f).length;
          return (
            <button key={f} onClick={() => setFilter(f)}
              className="rounded-full border px-3 py-1.5 text-[12.5px] font-medium"
              style={filter === f ? { background: accent, borderColor: accent, color: "#fff" } : { borderColor: "#E5E7EB", color: "var(--chip-fg, #4B5563)", background: "var(--chip-bg, #fff)" }}>
              {f} <span className="ll-mono opacity-70">({n})</span>
            </button>
          );
        })}
        <span className="ml-auto text-[10.5px] text-gray-400">Drag cards between lists · every list appears in all four views</span>
      </div>

      {/* board: one column per list, cards filtered by the active view */}
      <div className="flex items-start gap-3 overflow-x-auto pb-2">
        {lists.map((list) => {
          const cards = rows.filter((r) => listIdOf(r) === list.id);
          const allCount = records.filter((r) => listIdOf(r) === list.id).length;
          return (
            <div key={list.id}
              onDragOver={(e) => { if (perms.manage) { e.preventDefault(); setDragOver(list.id); } }}
              onDragLeave={() => setDragOver((d) => (d === list.id ? null : d))}
              onDrop={(e) => {
                e.preventDefault(); setDragOver(null);
                const id = e.dataTransfer.getData("text/plain");
                const rec = records.find((r) => r.id === id);
                if (rec && listIdOf(rec) !== list.id) { patchRecord(id, { listId: list.id }); log?.("Moved record", `${rec.name} → ${list.name}`); }
              }}
              className="w-72 shrink-0 rounded-2xl border p-2"
              style={dragOver === list.id ? { borderColor: accent, background: accent + "0A" } : { borderColor: "#F3F4F6", background: "var(--chip-bg, #F8FAFC)" }}>
              <div className="relative mb-1.5 flex items-center gap-1.5 px-1.5 pt-1">
                <span className="ll-mono rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-gray-500">{allCount}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-gray-800">{list.name}</span>
                {perms.create && (
                  <button title="Add record to this list" onClick={() => setCardDraft({ ...cardDraft, [list.id]: cardDraft[list.id] ?? "" })}
                    className="rounded-md p-1 text-gray-400 hover:bg-white hover:text-gray-600"><Plus size={13} /></button>
                )}
                {perms.manage && (
                  <button onClick={() => setListMenu(listMenu === list.id ? null : list.id)} className="rounded-md p-1 text-gray-400 hover:bg-white hover:text-gray-600">⋯</button>
                )}
                {listMenu === list.id && (
                  <div className="absolute right-0 top-7 z-20 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl">
                    <button onClick={() => { const nm = prompt("Rename list", list.name); if (nm?.trim()) setLists(lists.map((l) => (l.id === list.id ? { ...l, name: nm.trim() } : l))); setListMenu(null); }}
                      className="block w-full px-3 py-1.5 text-left text-[12px] text-gray-700 hover:bg-gray-50">Rename list</button>
                    <button disabled={lists.length === 1}
                      onClick={() => {
                        if (!confirm(`Delete list "${list.name}"? Its records move to "${lists[0].id === list.id ? lists[1]?.name : lists[0].name}".`)) return;
                        const fallback = (lists[0].id === list.id ? lists[1] : lists[0]).id;
                        setRecords(records.map((r) => (listIdOf(r) === list.id ? { ...r, listId: fallback } : r)));
                        setLists(lists.filter((l) => l.id !== list.id));
                        setListMenu(null);
                      }}
                      className="block w-full px-3 py-1.5 text-left text-[12px] text-red-500 hover:bg-red-50 disabled:opacity-40">Delete list</button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {cards.map((r) => {
                  const st = recordState(r);
                  const chip = STATE_CHIP[st];
                  const done = flatTasks(r).filter((t) => t.completedAt).length;
                  const total = flatTasks(r).length;
                  const overdueN = flatTasks(r).filter((t) => taskState(t) === "overdue").length;
                  return (
                    <div key={r.id} draggable={perms.manage}
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", r.id)}
                      onClick={() => setOpenId(r.id)}
                      className="cursor-pointer rounded-xl border border-gray-100 bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
                      <div className="mb-1.5 flex items-start gap-2">
                        {perms.complete && (
                          <button title={r.completedAt ? "Reopen record" : "Mark as complete"}
                            onClick={(e) => { e.stopPropagation(); patchRecord(r.id, { completedAt: r.completedAt ? null : Date.now() }); log?.(r.completedAt ? "Reopened record" : "Completed record", r.name); }}
                            className="mt-0.5 shrink-0" style={{ color: r.completedAt ? POS : "#CBD5E1" }}>
                            <CheckCircle2 size={16} strokeWidth={r.completedAt ? 2.5 : 2} fill={r.completedAt ? "#DCFCE7" : "none"} />
                          </button>
                        )}
                        <span className={"min-w-0 flex-1 text-[13px] font-semibold leading-snug " + (r.completedAt ? "text-gray-400 line-through" : "text-gray-800")}>{r.name}</span>
                        {r.auto && <span title="Created & filled automatically from Optimization Studio work" className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-violet-700">Auto</span>}
                        <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide" style={{ background: chip.bg, color: chip.fg }}>{chip.label}</span>
                      </div>
                      <div className="flex items-center gap-2 pl-6 text-[10.5px] text-gray-400">
                        {r.dueDate && <span className="ll-mono flex items-center gap-1" style={{ color: st === "overdue" ? NEG : undefined }}><Calendar size={10} /> {fmtDay(r.dueDate)}</span>}
                        {total > 0 && <span className="ll-mono flex items-center gap-0.5"><ListTodo size={10} /> {done}/{total}</span>}
                        {overdueN > 0 && !r.completedAt && <span className="ll-mono font-bold" style={{ color: NEG }}>{overdueN} overdue</span>}
                        <span className="ml-auto flex -space-x-1">{r.assignees.slice(0, 3).map((a) => <Ava key={a} name={maskName(a)} size={16} />)}</span>
                      </div>
                    </div>
                  );
                })}
                {cards.length === 0 && <div className="rounded-xl border border-dashed border-gray-200 py-5 text-center text-[10.5px] text-gray-300">{filter === "All" ? "No records — add one below" : `No ${filter.toLowerCase()} records here`}</div>}
              </div>

              {perms.create && (cardDraft[list.id] !== undefined ? (
                <div className="mt-2 space-y-1">
                  <input autoFocus value={cardDraft[list.id]} onChange={(e) => setCardDraft({ ...cardDraft, [list.id]: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && cardDraft[list.id].trim()) { createRecord(list.id, cardDraft[list.id]); setCardDraft(({ [list.id]: _, ...rest }) => rest); }
                      if (e.key === "Escape") setCardDraft(({ [list.id]: _, ...rest }) => rest);
                    }}
                    placeholder="Record name… (Enter to add)" className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12px]" />
                </div>
              ) : (
                <button onClick={() => setCardDraft({ ...cardDraft, [list.id]: "" })}
                  className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-gray-200 py-1.5 text-[11.5px] font-medium text-gray-400 hover:border-gray-300 hover:text-gray-600">
                  <Plus size={12} /> Add record
                </button>
              ))}
            </div>
          );
        })}

        {perms.manage && (
          <div className="w-64 shrink-0 rounded-2xl border border-dashed border-gray-200 p-2">
            <input value={newListName} onChange={(e) => setNewListName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addList()}
              placeholder="+ Add list…" className="w-full rounded-lg border-0 bg-transparent px-2 py-1.5 text-[12.5px] font-semibold outline-none" />
            {newListName.trim() && (
              <button onClick={addList} className="mt-1 w-full rounded-lg py-1.5 text-[11.5px] font-bold text-white" style={{ background: accent }}>Create list</button>
            )}
          </div>
        )}
      </div>
      </>)}

      {pmTab === "templates" && templates && (
        <div className="space-y-3">
          <div className="rounded-lg bg-gray-50 p-3 text-[11.5px] leading-relaxed text-gray-500">
            Record templates are shared across <b>every project</b> — save any record as a template from inside the
            record window, then import it here (fresh checklists, no assignees or dates).
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((tpl) => {
              const nTasks = (tpl.checklists || []).reduce((n, c) => n + (c.tasks || []).length, 0);
              return (
                <Card key={tpl.id} className="p-4">
                  <div className="ll-display text-[13.5px] font-semibold text-gray-800">{tpl.name}</div>
                  <div className="mt-0.5 text-[10.5px] text-gray-400">{(tpl.checklists || []).length} checklist(s) · {nTasks} task(s) · from {tpl.fromProject || "—"} · {relTime(tpl.savedAt)}</div>
                  <div className="mt-2.5 flex items-center gap-1.5">
                    {perms.create && (
                      <select defaultValue={lists[0].id} id={"tplsel-" + tpl.id} className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[11px] font-medium text-gray-600">
                        {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    )}
                    {perms.create && (
                      <button onClick={() => importTemplate(tpl, document.getElementById("tplsel-" + tpl.id)?.value)}
                        className="shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-bold text-white" style={{ background: accent }}>Import</button>
                    )}
                    {perms.admin && onDeleteTemplate && (
                      <button onClick={() => confirm(`Delete template "${tpl.name}" for all projects?`) && onDeleteTemplate(tpl.id)}
                        title="Delete template" className="shrink-0 rounded-lg border border-gray-200 p-1.5 text-gray-300 hover:text-red-500"><Trash2 size={12} /></button>
                    )}
                  </div>
                </Card>
              );
            })}
            {templates.length === 0 && (
              <Card className="col-span-full p-10 text-center text-[12.5px] text-gray-400">
                No record templates yet — open any record and hit <b>Save as template</b> to make its structure reusable everywhere.
              </Card>
            )}
          </div>
        </div>
      )}
      {openRecord && (
        <RecordWindow record={openRecord} people={people} perms={perms} currentUser={currentUser} accent={accent} maskName={maskName}
          alreadyTemplate={!!openRecord.templateId && (templates || []).some((t) => t.id === openRecord.templateId)}
          onSaveTemplate={onSaveTemplate ? (tpl) => {
            onSaveTemplate({ ...tpl, fromProject: project.name });
            // remember the link so the button disables (and re-enables if the template is deleted)
            setRecords(records.map((r) => (r.id === openRecord.id ? { ...r, templateId: tpl.id } : r)));
            log?.("Saved record template", tpl.name);
          } : null}
          onPatch={(patch) => setRecords(records.map((r) => (r.id === openRecord.id ? { ...r, ...patch } : r)))}
          onDelete={() => { setRecords(records.filter((r) => r.id !== openRecord.id)); log?.("Deleted record", openRecord.name); }}
          onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}


/* ================================================================
   PROJECT OPTIMIZATION — connect & publish to GBP, Website, Social
   (modeled on Search Atlas / OTTO techniques)
   ----------------------------------------------------------------
   PRODUCTION INTEGRATION MAP:
   • GBP — Google OAuth (scope: business.manage) → Business
     Information API `locations.patch` with updateMask for phone /
     website / hours / description / serviceItems; `localPosts.create`
     for updates, offers (with coupon/redeem), events; `media.create`
     for photos. Business NAME + CATEGORIES intentionally locked in
     this UI (frequent edits trigger re-verification / suspensions).
   • Website — WordPress: native plugin or Application Passwords →
     REST API (`/wp/v2/pages`, `/wp/v2/posts`, `/wp/v2/media`) with
     two-way sync. Webflow: OAuth → Data API v2 (pages + CMS items,
     then publish site). Custom-coded: the OTTO-pixel technique — a
     small JS snippet in <head> fetches your saved edits from your
     API and applies meta/heads/alt client-side at render time; a
     Cloudflare Worker variant applies them at the edge (server-side)
     so crawlers always see the optimized HTML.
   • Social — Meta Graph API (FB Page + IG Business publish),
     LinkedIn Community Mgmt API, X API v2, YouTube Data API,
     TikTok Content Posting API, Pinterest API. All via OAuth; store
     refresh tokens server-side, never in the browser.
   • Scheduling — one cron worker scans `publishAt <= now` across
     gbp.posts / website.blogs / social.posts and dispatches.
   ================================================================ */
