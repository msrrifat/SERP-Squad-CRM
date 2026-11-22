import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BookOpen, Bot, Check, Clock, Copy, Download, Gauge, KeyRound, ListTodo, MessageSquare, Monitor, Pause, Play, Plus, RefreshCw, Send, ShieldCheck, Square, Trash2, Upload } from "lucide-react";
import { Card, Labeled, Modal, askConfirm, inputCls } from "../../ui/primitives.jsx";
import { relTime } from "../../lib/format.jsx";
import { renderMd } from "./guide.jsx";

/* ================= AI agent (local worker) =================
   The control panel for the Java agent in /agent that runs on an office PC.
   Everything here talks to /api/agentops/* (server/agentops.js), which only
   answers Admin/owner sessions. The device does the work; this screen decides
   what it may do: per project, per task type, a working limit (off / limited /
   open) and a token limit, plus approvals, playbooks and device control. */
const tok = () => localStorage.getItem("ss_token") || "";
async function api(path, body) {
  const r = await fetch("/api/agentops/" + path, body === undefined
    ? { headers: { "X-SS-Token": tok() } }
    : { method: "POST", headers: { "Content-Type": "application/json", "X-SS-Token": tok() }, body: JSON.stringify(body) });
  let j = {};
  try { j = await r.json(); } catch { /* non-JSON error page */ }
  if (!r.ok) throw new Error(j.detail || j.error || `Request failed (${r.status})`);
  return j;
}
const fmtTok = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n || 0));
const usd = (n) => "$" + (n >= 100 ? n.toFixed(0) : (n || 0).toFixed(2));
const STATUS = {
  queued: ["Waiting", "#6B7280", "#F3F4F6"], approved: ["Approved, waiting", "#1D4ED8", "#DBEAFE"], running: ["Running", "#0E7C66", "#D1FAE5"],
  needs_approval: ["Needs approval", "#B45309", "#FEF3C7"], done: ["Done", "#15803D", "#DCFCE7"], failed: ["Failed", "#B91C1C", "#FEE2E2"],
  stopped: ["Stopped", "#B45309", "#FEF3C7"], cancelled: ["Cancelled", "#6B7280", "#F3F4F6"],
};
const SEV = { high: ["#B91C1C", "#FEE2E2"], medium: ["#B45309", "#FEF3C7"], low: ["#1D4ED8", "#DBEAFE"], info: ["#6B7280", "#F3F4F6"] };
const NEEDS = { web: "Web research", google: "Google browser", browser: "Browser" };
const Chip = ({ children, fg = "#6B7280", bg = "#F3F4F6" }) => <span className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ color: fg, background: bg }}>{children}</span>;
const Btn = ({ children, onClick, accent, ghost, danger, disabled, title, type = "button" }) => (
  <button type={type} title={title} onClick={onClick} disabled={disabled}
    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-40 ${ghost ? "border border-gray-200 bg-white text-gray-700 hover:border-gray-300" : "text-white"}`}
    style={ghost ? (danger ? { color: "#B91C1C" } : {}) : { background: danger ? "#B91C1C" : accent }}>{children}</button>
);
const Switch = ({ on, onChange, label }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors" style={{ background: on ? "#16A34A" : "#D1D5DB" }}>
    <span className="absolute h-4 w-4 rounded-full bg-white shadow transition-transform" style={{ transform: on ? "translateX(18px)" : "translateX(2px)" }} />
  </button>
);
const numCls = "w-20 rounded-lg border border-gray-200 px-2 py-1 text-[12.5px]";
const selCls = "rounded-lg border border-gray-200 bg-white px-2 py-1 text-[12.5px]";

export function AgentOpsSection({ company }) {
  const accent = company?.accent || "#1F2A44";
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [view, setView] = useState("limits");
  const [busy, setBusy] = useState(false);
  const [openTask, setOpenTask] = useState(null);
  const [chatPid, setChatPid] = useState("");

  const load = useCallback(async () => {
    try { setData(await api("overview")); setErr(""); } catch (e) { setErr(String(e.message || e)); }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 10000);
    return () => clearInterval(t);
  }, [load]);
  /* every write returns the fresh overview, so the screen never shows stale limits */
  const act = useCallback(async (path, body) => {
    setBusy(true);
    try { const o = await api(path, body); if (o.catalog) setData(o); setErr(""); return o; }
    catch (e) { setErr(String(e.message || e)); return null; }
    finally { setBusy(false); }
  }, []);

  if (!data) {
    return <Card className="p-6 text-[13px] text-gray-500">{err ? <span className="text-red-700">{/forbidden|Admin/i.test(err) ? "The AI agent panel is for the owner and Admins." : err}</span> : "Loading the AI agent panel…"}</Card>;
  }
  const g = data.global;
  const needsApproval = data.tasks.filter((t) => t.status === "needs_approval").length;
  const VIEWS = [["limits", "Projects & limits", Gauge], ["tasks", `Tasks${needsApproval ? ` (${needsApproval} to approve)` : ""}`, ListTodo], ["chat", "Chat", MessageSquare], ["devices", "Devices & updates", Monitor], ["api", "API setup", KeyRound], ["playbooks", "Playbooks", BookOpen]];
  const monthCost = data.projects.reduce((s, p) => s + (p.usage.costUsd || 0), 0);

  return (
    <div className="space-y-4">
      {err && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-800"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{err}</div>}

      {/* company-wide controls */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: accent + "1A", color: accent }}><Bot size={18} /></span>
            <div>
              <div className="text-[13.5px] font-semibold text-gray-900">Local AI agent</div>
              <div className="text-[11.5px] text-gray-500">{!g.enabled ? "Switched off" : g.paused ? "Paused" : data.devices.some((d) => d.online) ? "Working" : "No device online"}</div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12.5px] text-gray-700"><Switch on={g.enabled} label="Agent on" onChange={(v) => act("config", { global: { enabled: v } })} /> On</label>
          <Btn ghost onClick={() => act("config", { global: { paused: !g.paused } })}>{g.paused ? <><Play size={13} /> Resume all</> : <><Pause size={13} /> Pause all</>}</Btn>
          <label className="flex items-center gap-2 text-[12.5px] text-gray-700">Model
            <select className={selCls} value={g.model} onChange={(e) => act("config", { global: { model: e.target.value } })}>
              {data.models.map((m) => <option key={m.id} value={m.id} title={m.note}>{m.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[12.5px] text-gray-700">Effort
            <select className={selCls} value={g.effort} onChange={(e) => act("config", { global: { effort: e.target.value } })}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </label>
          <CapInput label="Company token limit per month" value={g.tokensPerMonth} onSave={(v) => act("config", { global: { tokensPerMonth: v } })} />
          <div className="ml-auto text-right text-[11.5px] text-gray-500">
            <div><span className="text-[14px] font-semibold text-gray-900">{fmtTok(data.companyMonthTokens)}</span> tokens this month</div>
            <div>about {usd(monthCost)} (estimate)</div>
          </div>
        </div>
      </Card>

      {!data.credentials.claude.set && !data.projects.some((p) => p.ownKey.set) && !data.devices.some((d) => d.localKey) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
          <KeyRound size={14} className="shrink-0" /> No Claude API key is set for the agent yet, so no task can start.
          <button className="font-semibold underline" onClick={() => setView("api")}>Open API setup</button>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {VIEWS.map(([k, label, Icon]) => (
          <button key={k} onClick={() => setView(k)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold"
            style={view === k ? { background: accent, color: "#fff", borderColor: accent } : { background: "#fff", color: "#374151", borderColor: "#E5E7EB" }}><Icon size={13} />{label}</button>
        ))}
      </div>

      {view === "limits" && <LimitsView data={data} accent={accent} act={act} busy={busy} onChat={(id) => { setChatPid(id); setView("chat"); }} />}
      {view === "chat" && <ChatView data={data} accent={accent} pid={chatPid} setPid={setChatPid} goTasks={() => setView("tasks")} />}
      {view === "tasks" && <TasksView data={data} accent={accent} act={act} busy={busy} onOpen={setOpenTask} />}
      {view === "devices" && <DevicesView data={data} accent={accent} act={act} busy={busy} reload={load} setErr={setErr} />}
      {view === "api" && <ApiSetupView data={data} accent={accent} act={act} busy={busy} />}
      {view === "playbooks" && <PlaybooksView data={data} accent={accent} act={act} />}
      {openTask && <TaskModal id={openTask} accent={accent} act={act} onClose={() => setOpenTask(null)} />}
    </div>
  );
}

/* a number that is saved when you leave the field (0 = no limit) */
function CapInput({ label, value, onSave }) {
  const [v, setV] = useState(String(value || 0));
  useEffect(() => { setV(String(value || 0)); }, [value]);
  return (
    <label className="flex items-center gap-2 text-[12.5px] text-gray-700">{label}
      <input className={numCls + " w-28"} inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/[^0-9]/g, ""))} onBlur={() => { if (+v !== +value) onSave(+v || 0); }} />
      <span className="text-[11px] text-gray-400">{+v ? fmtTok(+v) : "no limit"}</span>
    </label>
  );
}

/* ---------------- projects: working limits and token limits ---------------- */
function LimitsView({ data, accent, act, busy, onChat }) {
  const [pid, setPid] = useState(() => data.projects[0]?.id || "");
  const project = data.projects.find((p) => p.id === pid) || data.projects[0];
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [detail, setDetail] = useState(null);
  const fromServer = (p) => ({ enabled: p.setting.enabled, tokensPerMonth: p.setting.tokensPerMonth, tokensPerDay: p.setting.tokensPerDay, tasks: Object.fromEntries(Object.entries(p.tasks).map(([k, t]) => [k, { mode: t.mode, max: t.max, per: t.per, auto: t.auto, everyDays: t.everyDays, approval: t.approval, model: t.model }])) });
  /* keep the form in step with the server unless there are unsaved edits */
  const sig = project ? JSON.stringify(fromServer(project)) : "";
  useEffect(() => { if (project && !dirty) setDraft(fromServer(project)); }, [sig, pid, dirty]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setDetail(null); if (pid) api("project", { projectId: pid }).then(setDetail).catch(() => {}); }, [pid]);
  if (!project || !draft) return null;

  const set = (patch) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); };
  const setTask = (key, patch) => { setDraft((d) => ({ ...d, tasks: { ...d.tasks, [key]: { ...d.tasks[key], ...patch } } })); setDirty(true); };
  const pick = (id) => { setDirty(false); setDraft(null); setPid(id); };
  const save = async () => { const o = await act("config", { projectId: project.id, ...draft }); if (o) setDirty(false); };
  const recommended = () => {
    const tasks = { ...draft.tasks };
    for (const c of data.catalog) if (tasks[c.key]) tasks[c.key] = { ...tasks[c.key], mode: c.defaults.mode, max: c.defaults.max, per: c.defaults.per, everyDays: c.defaults.everyDays, auto: !!(c.defaults.auto || c.defaults.recAuto) && c.defaults.mode !== "off" };
    set({ tasks });
  };
  const groups = [...new Set(data.catalog.filter((c) => draft.tasks[c.key]).map((c) => c.group))];
  const u = project.usage, cap = draft.tokensPerMonth;
  const pct = cap > 0 ? Math.min(100, Math.round((u.month / cap) * 100)) : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[230px_1fr]">
      <Card className="h-max p-2">
        <div className="px-2 pb-1 pt-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Projects</div>
        {data.projects.map((p) => (
          <button key={p.id} onClick={() => pick(p.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-gray-50" style={p.id === project.id ? { background: accent + "12" } : {}}>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.setting.enabled ? "#16A34A" : "#D1D5DB" }} title={p.setting.enabled ? "Agent enabled" : "Agent not enabled"} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium text-gray-800">{p.name}</span>
              <span className="block truncate text-[10.5px] text-gray-400">{p.setting.enabled ? `${fmtTok(p.usage.month)}${p.setting.tokensPerMonth ? " of " + fmtTok(p.setting.tokensPerMonth) : ""} tokens` : "not enabled"}{p.waiting ? ` · ${p.waiting} waiting` : ""}</span>
            </span>
          </button>
        ))}
      </Card>

      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[15px] font-semibold text-gray-900">{project.name}</div>
              <div className="text-[11.5px] text-gray-500">{project.client || "Agency-level tasks"}{project.demo ? " · demo data (the agent says so in its reports)" : ""}</div>
            </div>
            <label className="flex items-center gap-2 text-[12.5px] font-medium text-gray-700"><Switch on={draft.enabled} label="Agent enabled for this project" onChange={(v) => set({ enabled: v })} /> Agent works on this project</label>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Labeled label="API token limit per month (0 = no limit)">
              <input className={inputCls} inputMode="numeric" value={draft.tokensPerMonth} onChange={(e) => set({ tokensPerMonth: +e.target.value.replace(/[^0-9]/g, "") || 0 })} />
            </Labeled>
            <Labeled label="API token limit per day (0 = no limit)">
              <input className={inputCls} inputMode="numeric" value={draft.tokensPerDay} onChange={(e) => set({ tokensPerDay: +e.target.value.replace(/[^0-9]/g, "") || 0 })} />
            </Labeled>
            <div>
              <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-gray-400">Used this month</div>
              <div className="text-[13px] text-gray-800"><b>{fmtTok(u.month)}</b>{cap ? ` of ${fmtTok(cap)}` : ""} tokens · about {usd(u.costUsd)}</div>
              {cap > 0 && <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full" style={{ width: pct + "%", background: pct >= 100 ? "#DC2626" : pct >= 80 ? "#D97706" : accent }} /></div>}
              <div className="mt-1 text-[11px] text-gray-400">Today {fmtTok(u.day)}. When a limit is reached the agent stops this project until the period ends.</div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Btn accent={accent} onClick={save} disabled={!dirty || busy}><Check size={13} /> Save changes</Btn>
            {dirty && <Btn ghost onClick={() => setDirty(false)}>Discard</Btn>}
            {project.id !== "_agency" && <Btn ghost onClick={recommended} title="Sets every task type to its recommended limit and schedule. Nothing is saved until you press Save.">Use the recommended schedule</Btn>}
            {project.id !== "_agency" && <Btn ghost onClick={() => onChat(project.id)}><MessageSquare size={13} /> Chat about this project</Btn>}
            {dirty && <span className="text-[11.5px] text-amber-700">Unsaved changes</span>}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3">
            <div className="text-[13.5px] font-semibold text-gray-900">Working limits per task</div>
            <div className="text-[11.5px] text-gray-500"><b>Off</b>: never. <b>Limited</b>: at most the number you set. <b>Open</b>: no limit, and the agent may start it whenever it judges it is needed. Every task still stops at the token limit.</div>
          </div>
          {groups.map((grp) => (
            <div key={grp}>
              <div className="bg-gray-50 px-4 py-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-gray-500">{grp}</div>
              {data.catalog.filter((c) => c.group === grp && draft.tasks[c.key]).map((c) => {
                const t = draft.tasks[c.key], used = project.tasks[c.key]?.used || 0;
                return (
                  <div key={c.key} className="border-t border-gray-100 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-gray-900">{c.label}
                        {c.needs.map((n) => <Chip key={n} fg={n === "google" ? "#B45309" : "#4B5563"} bg={n === "google" ? "#FEF3C7" : "#F3F4F6"}>{NEEDS[n] || n}</Chip>)}
                        {c.write && <Chip fg="#B91C1C" bg="#FEE2E2">Changes live data</Chip>}
                      </div>
                      <div className="text-[11.5px] text-gray-500">{c.desc}</div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                      <div className="flex rounded-lg border border-gray-200 p-0.5" role="group" aria-label={`Working limit for ${c.label}`}>
                        {["off", "limited", "open"].map((m) => (
                          <button key={m} type="button" onClick={() => setTask(c.key, { mode: m })} className="rounded-md px-2.5 py-1 text-[12px] font-semibold capitalize"
                            style={t.mode === m ? { background: m === "off" ? "#6B7280" : m === "open" ? "#16A34A" : accent, color: "#fff" } : { color: "#4B5563" }}>{m}</button>
                        ))}
                      </div>
                      {t.mode === "limited" && (
                        <span className="flex items-center gap-1 text-[12px] text-gray-600">
                          <input aria-label="Maximum runs" className={numCls + " w-14"} inputMode="numeric" value={t.max} onChange={(e) => setTask(c.key, { max: Math.max(1, +e.target.value.replace(/[^0-9]/g, "") || 1) })} /> per
                          <select aria-label="Period" className={selCls} value={t.per} onChange={(e) => setTask(c.key, { per: e.target.value })}><option value="day">day</option><option value="week">week</option><option value="month">month</option></select>
                          <span className="text-[11px] text-gray-400">{used} used</span>
                        </span>
                      )}
                      {t.mode !== "off" && project.id !== "_agency" && (
                        <label className="flex items-center gap-1.5 text-[12px] text-gray-600" title="The agent queues this task by itself on this schedule.">
                          <input type="checkbox" checked={!!t.auto} onChange={(e) => setTask(c.key, { auto: e.target.checked })} /> starts by itself
                          {t.auto && <>every <input aria-label="Days between runs" className={numCls + " w-12"} inputMode="numeric" value={t.everyDays} onChange={(e) => setTask(c.key, { everyDays: Math.max(1, +e.target.value.replace(/[^0-9]/g, "") || 1) })} /> d</>}
                        </label>
                      )}
                      {t.mode !== "off" && c.write && (
                        <select aria-label="Approval" className={selCls} value={t.approval} onChange={(e) => setTask(c.key, { approval: e.target.value })} title="Ask first: the agent prepares the change and waits for your approval.">
                          <option value="ask">Ask before changing</option><option value="auto">Act without asking</option>
                        </select>
                      )}
                      {t.mode !== "off" && (
                        <select aria-label="Model" className={selCls} value={t.model || ""} onChange={(e) => setTask(c.key, { model: e.target.value })}>
                          <option value="">Default model</option>{data.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </Card>

        {project.id !== "_agency" && <ProjectMemory key={project.id} project={project} detail={detail} setDetail={setDetail} accent={accent} />}
      </div>
    </div>
  );
}

/* what the agent remembers about a project, and the journal of changes it measures later */
function ProjectMemory({ project, detail, setDetail, accent }) {
  const [what, setWhat] = useState(""); const [where, setWhere] = useState(""); const [msg, setMsg] = useState("");
  const add = async () => {
    try { const o = await api("change", { projectId: project.id, what, where }); setDetail((d) => ({ ...(d || {}), changes: o.changes })); setWhat(""); setWhere(""); setMsg(""); }
    catch (e) { setMsg(String(e.message || e)); }
  };
  return (
    <Card className="p-4">
      <div className="text-[13.5px] font-semibold text-gray-900">Project memory</div>
      <div className="text-[11.5px] text-gray-500">The agent reads these before every task. Log each change you make, and the Change review task measures what it did to rankings two and four weeks later.</div>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Change journal</div>
          <div className="flex flex-wrap gap-2">
            <input className={inputCls + " min-w-0 flex-1"} placeholder="What was changed" value={what} onChange={(e) => setWhat(e.target.value)} />
            <input className={inputCls + " min-w-0 flex-1"} placeholder="Page or profile (optional)" value={where} onChange={(e) => setWhere(e.target.value)} />
            <Btn accent={accent} onClick={add} disabled={!what.trim()}><Plus size={13} /> Log</Btn>
          </div>
          {msg && <div className="mt-1 text-[11.5px] text-red-700">{msg}</div>}
          <ul className="mt-2 space-y-1.5">
            {(detail?.changes || []).slice(0, 12).map((c) => <li key={c.id} className="text-[12px] text-gray-700"><span className="text-gray-400">{c.at}</span> · {c.what}{c.where ? <span className="text-gray-500"> ({c.where})</span> : null} <span className="text-gray-400">by {c.by}</span></li>)}
            {detail && !(detail.changes || []).length && <li className="text-[12px] text-gray-400">No changes logged yet.</li>}
          </ul>
        </div>
        <div>
          <div className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Notes the agent saved</div>
          <ul className="space-y-1.5">
            {(detail?.notes || []).slice(0, 12).map((n, i) => <li key={i} className="text-[12px] text-gray-700"><span className="text-gray-400">{n.at}</span> · {n.note}</li>)}
            {detail && !(detail.notes || []).length && <li className="text-[12px] text-gray-400">Nothing saved yet.</li>}
          </ul>
        </div>
      </div>
    </Card>
  );
}

/* ---------------- tasks ---------------- */
function TasksView({ data, accent, act, busy, onOpen }) {
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({ projectId: data.projects[0]?.id || "", type: "custom", title: "", instructions: "" });
  const types = data.catalog.filter((c) => !!c.agencyOnly === (form.projectId === "_agency"));
  useEffect(() => { if (!types.some((c) => c.key === form.type)) setForm((f) => ({ ...f, type: types[0]?.key || "" })); }, [form.projectId]);   // eslint-disable-line react-hooks/exhaustive-deps
  const cat = data.catalog.find((c) => c.key === form.type);
  const pname = (id) => data.projects.find((p) => p.id === id)?.name || "Removed project";
  const label = (k) => data.catalog.find((c) => c.key === k)?.label || k;
  const FILTERS = [["all", "All"], ["waiting", "Waiting"], ["needs_approval", "Needs approval"], ["running", "Running"], ["done", "Done"], ["problem", "Failed or stopped"]];
  const match = (t) => filter === "all" || (filter === "waiting" ? ["queued", "approved"].includes(t.status) : filter === "problem" ? ["failed", "stopped"].includes(t.status) : t.status === filter);
  const rows = data.tasks.filter(match);
  const add = async () => { const o = await act("task/create", form); if (o) setForm((f) => ({ ...f, title: "", instructions: "" })); };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="text-[13.5px] font-semibold text-gray-900">Give the agent a task</div>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_1.4fr]">
          <Labeled label="Project"><select className={inputCls} value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>{data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Labeled>
          <Labeled label="Task type"><select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{types.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></Labeled>
          <Labeled label="Title (optional)"><input className={inputCls} value={form.title} placeholder={cat?.label} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Labeled>
        </div>
        <div className="mt-3"><Labeled label="Instructions (the keyword, page or goal this is about)"><textarea className={inputCls + " h-20"} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder={cat?.desc} /></Labeled></div>
        <div className="mt-3 flex items-center gap-3"><Btn accent={accent} onClick={add} disabled={busy || !form.projectId || !form.type}><Plus size={13} /> Add task</Btn><span className="text-[11.5px] text-gray-500">It starts when a device is free and the project's limits allow it.</span></div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-100 px-4 py-3">
          {FILTERS.map(([k, l]) => { const n = k === "all" ? data.tasks.length : data.tasks.filter((t) => (k === "waiting" ? ["queued", "approved"].includes(t.status) : k === "problem" ? ["failed", "stopped"].includes(t.status) : t.status === k)).length;
            return <button key={k} onClick={() => setFilter(k)} className="rounded-full border px-2.5 py-1 text-[11.5px] font-semibold" style={filter === k ? { background: accent, color: "#fff", borderColor: accent } : { color: "#4B5563", borderColor: "#E5E7EB" }}>{l} {n}</button>; })}
        </div>
        {!rows.length && <div className="px-4 py-8 text-center text-[12.5px] text-gray-400">No tasks here yet.</div>}
        {rows.map((t) => { const [sl, fg, bg] = STATUS[t.status] || [t.status, "#6B7280", "#F3F4F6"];
          return (
            <button key={t.id} onClick={() => onOpen(t.id)} className="grid w-full items-center gap-x-3 gap-y-1 border-t border-gray-100 px-4 py-2.5 text-left hover:bg-gray-50 md:grid-cols-[130px_minmax(0,1fr)_auto]">
              <span><Chip fg={fg} bg={bg}>{sl}</Chip></span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-gray-900">{t.title}</span>
                <span className="block truncate text-[11.5px] text-gray-500">{pname(t.projectId)} · {label(t.type)} · {t.source === "auto" ? "started by schedule" : t.source === "agent" ? "suggested by the agent" : `added by ${t.createdBy || "the team"}`} · {relTime(t.createdAt)}</span>
                {(t.blockedReason || t.summary) && <span className={`block truncate text-[11.5px] ${t.blockedReason ? "text-amber-700" : "text-gray-600"}`}>{t.blockedReason ? "Held: " + t.blockedReason : t.summary}</span>}
              </span>
              <span className="whitespace-nowrap text-right text-[11.5px] text-gray-500">{t.usage.total ? <>{fmtTok(t.usage.total)} tokens · {usd(t.usage.costUsd)}</> : "not started"}{t.findings ? <> · {t.findings} finding{t.findings > 1 ? "s" : ""}</> : null}</span>
            </button>
          ); })}
      </Card>
    </div>
  );
}

function TaskModal({ id, accent, act, onClose }) {
  const [t, setT] = useState(null); const [err, setErr] = useState(""); const [details, setDetails] = useState(""); const [note, setNote] = useState("");
  const load = useCallback(() => api("task/get", { id }).then((o) => { setT(o.task); setDetails((d) => d || o.task.proposal?.details || ""); }).catch((e) => setErr(String(e.message || e))), [id]);
  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, [load]);
  const doAct = async (action, extra = {}) => { const o = await act("task/action", { id, action, ...extra }); if (o) { await load(); if (action === "cancel" || action === "reject") onClose(); } };
  if (!t) return <Modal title="Task" onClose={onClose} wide><div className="text-[13px] text-gray-500">{err || "Loading…"}</div></Modal>;
  const [sl, fg, bg] = STATUS[t.status] || [t.status, "#6B7280", "#F3F4F6"];
  return (
    <Modal title={t.title} sub={`${t.projectName} · ${t.type.replace(/_/g, " ")}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-600">
          <Chip fg={fg} bg={bg}>{sl}</Chip>
          {t.usage.total > 0 && <span>{fmtTok(t.usage.total)} tokens in {t.usage.calls} Claude call{t.usage.calls === 1 ? "" : "s"} · about {usd(t.usage.costUsd)}</span>}
          {t.startedAt && <span className="inline-flex items-center gap-1"><Clock size={12} /> started {relTime(t.startedAt)}</span>}
        </div>
        {t.blockedReason && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">Held: {t.blockedReason}</div>}
        {t.error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-800">{t.error}</div>}
        {t.instructions && <div><div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Instructions</div><div className="whitespace-pre-wrap text-[12.5px] text-gray-700">{t.instructions}</div></div>}
        {t.reason && <div className="text-[12.5px] text-gray-600"><b>Why the agent suggested it:</b> {t.reason}</div>}

        {t.status === "needs_approval" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-amber-900"><ShieldCheck size={15} /> The agent is asking for approval</div>
            <div className="mt-1 text-[12.5px] text-amber-900">{t.proposal?.summary}</div>
            <div className="mt-2 text-[11px] text-amber-800">Nothing has been changed yet. Edit the text below if needed; the agent carries out exactly what you approve.</div>
            <textarea className={inputCls + " mt-2 h-40 font-mono text-[12px]"} value={details} onChange={(e) => setDetails(e.target.value)} />
            <input className={inputCls + " mt-2"} placeholder="Note to the agent (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="mt-2 flex gap-2"><Btn accent="#15803D" onClick={() => doAct("approve", { details, note })}><Check size={13} /> Approve</Btn><Btn ghost danger onClick={() => doAct("reject", { note })}>Reject</Btn></div>
          </div>
        )}
        {t.approval && <div className="text-[12px] text-gray-600">{t.approval.decision === "approved" ? "Approved" : "Rejected"} by {t.approval.by} {relTime(t.approval.at)}{t.approval.note ? `: ${t.approval.note}` : ""}</div>}

        {(t.result?.findings || []).length > 0 && (
          <div>
            <div className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Findings</div>
            <div className="space-y-2">{t.result.findings.map((f, i) => { const [c1, c2] = SEV[f.severity] || SEV.info; return (
              <div key={i} className="rounded-lg border border-gray-200 p-2.5">
                <div className="flex items-start gap-2"><Chip fg={c1} bg={c2}>{f.severity}</Chip><div className="text-[12.5px] font-semibold text-gray-900">{f.title}</div></div>
                {f.detail && <div className="mt-1 text-[12px] text-gray-600">{f.detail}</div>}
                {f.action && <div className="mt-1 text-[12px] text-gray-800"><b>Do:</b> {f.action}</div>}
              </div>); })}</div>
          </div>
        )}
        {t.result?.report && <div><div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Report</div><div className="rounded-xl border border-gray-200 p-3">{renderMd(t.result.report)}</div></div>}

        {(t.events || []).length > 0 && (
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold text-gray-600">What the agent did ({t.events.length} steps)</summary>
            <ol className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg bg-gray-50 p-2.5 font-mono text-[11px] text-gray-600">{t.events.map((e, i) => <li key={i}><span className="text-gray-400">{new Date(e.at).toLocaleTimeString()}</span> {e.text}</li>)}</ol>
          </details>
        )}
        <div className="flex gap-2 border-t border-gray-100 pt-3">
          {["queued", "approved", "running"].includes(t.status) && <Btn ghost danger onClick={async () => { if (await askConfirm({ title: "Cancel this task?", message: `"${t.title}" will be cancelled.`, confirmLabel: "Yes, cancel it", danger: true })) doAct("cancel"); }}>Cancel task</Btn>}
          {["failed", "stopped", "cancelled"].includes(t.status) && <Btn accent={accent} onClick={() => doAct("retry")}><RefreshCw size={13} /> Run again</Btn>}
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- live chat: one conversation per project ----------------
   The message goes to the server, a device that is listening picks it up at
   once and answers with Claude using that project's data. While it works the
   bubble shows what it is doing. Chat tokens count against the project's
   token limit. */
const STARTERS = ["How are the rankings doing this week?", "What changed since last month, and why?", "What is the agent working on for this project?", "What should we do next to get more calls?"];
function ChatView({ data, accent, pid, setPid, goTasks }) {
  const projects = data.projects.filter((p) => p.id !== "_agency");
  const project = projects.find((p) => p.id === pid) || projects[0] || null;
  const id = project?.id || "";
  const [chat, setChat] = useState(null); const [text, setText] = useState(""); const [err, setErr] = useState(""); const [sending, setSending] = useState(false);
  const boxRef = useRef(null);
  /* One held request per open conversation: the server answers the moment the
     conversation changes (a new message, a progress note, a stop), so the
     screen is live without asking every second. */
  useEffect(() => {
    setChat(null); setErr("");
    if (!id) return undefined;
    let stop = false, v = -1;
    const ctrl = new AbortController();
    const nap = (ms) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      while (!stop) {
        if (document.visibilityState !== "visible") { await nap(1500); continue; }
        try {
          const r = await fetch("/api/agentops/chat/get", { method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json", "X-SS-Token": tok() }, body: JSON.stringify({ projectId: id, wait: v >= 0, v }) });
          const o = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(o.detail || `Request failed (${r.status})`);
          if (stop) return;
          v = o.v; setChat(o); setErr("");
        } catch (e) {
          if (stop) return;
          setErr(String(e.message || e)); v = -1;
          await nap(4000);
        }
      }
    })();
    return () => { stop = true; ctrl.abort(); };
  }, [id]);
  const pending = !!chat?.pending;
  const last = chat?.messages[chat.messages.length - 1];
  useEffect(() => { const el = boxRef.current; if (el) el.scrollTop = el.scrollHeight; }, [chat?.messages.length, last?.activity, pending, id]);
  const call = async (path, body) => { try { const o = await api(path, body); setChat(o); setErr(""); return o; } catch (e) { setErr(String(e.message || e)); return null; } };
  const send = async (t) => { const msg = (t ?? text).trim(); if (!msg || sending || pending) return; setSending(true); const o = await call("chat/send", { projectId: id, text: msg }); if (o) setText(""); setSending(false); };
  if (!project) return <Card className="p-6 text-[13px] text-gray-500">Add a project first; each project gets its own conversation with the agent.</Card>;
  const a = chat?.agent;
  const avail = !a ? null : a.listening.length ? { tone: "#15803D", text: `${a.listening.join(", ")} is listening and answers within seconds.` }
    : a.outdated.length ? { tone: "#B45309", text: `${a.outdated.join(", ")} is online but runs an agent version without chat. Publish version 0.3.0 or newer under Devices & updates.` }
    : { tone: "#6B7280", text: "No device is online. Your message is answered as soon as the agent is running." };
  const canSend = !!chat && !chat.blocked && !pending && !sending;
  return (
    <div className="grid gap-4 lg:grid-cols-[230px_1fr]">
      <Card className="h-max p-2">
        <div className="px-2 pb-1 pt-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Conversations</div>
        {projects.map((p) => (
          <button key={p.id} onClick={() => setPid(p.id)} className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-gray-50" style={p.id === id ? { background: accent + "12" } : {}}>
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: p.chat.pending ? "#D97706" : p.chat.last ? accent : "#E5E7EB" }} title={p.chat.pending ? "The agent is answering" : ""} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium text-gray-800">{p.name}</span>
              <span className="block truncate text-[10.5px] text-gray-400">{p.chat.pending ? "Answering…" : p.chat.last ? (p.chat.last.role === "user" ? "You: " : "") + p.chat.last.text.replace(/[*_`#>|]/g, "").replace(/\s+/g, " ") : "No messages yet"}</span>
            </span>
          </button>
        ))}
      </Card>

      <Card className="flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-gray-900">{project.name}</div>
            {avail && <div className="flex items-center gap-1.5 text-[11.5px]" style={{ color: avail.tone }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: avail.tone }} />{avail.text}</div>}
          </div>
          <div className="flex items-center gap-3 text-[11.5px] text-gray-500">
            <span title="Chat counts against this project's token limit.">{fmtTok(project.usage.month)}{project.setting.tokensPerMonth ? ` of ${fmtTok(project.setting.tokensPerMonth)}` : ""} tokens this month</span>
            {chat?.messages.length > 0 && <button className="font-semibold text-gray-500 underline hover:text-gray-800" onClick={async () => { if (await askConfirm({ title: "Clear this conversation?", message: `The messages for ${project.name} are deleted and the agent starts fresh.`, note: "Notes the agent saved and its task reports are kept.", confirmLabel: "Yes, clear", danger: true })) call("chat/clear", { projectId: id }); }}>Clear</button>}
          </div>
        </div>

        <div ref={boxRef} className="space-y-3 overflow-y-auto bg-gray-50 px-4 py-4" style={{ height: "max(300px, calc(100vh - 480px))" }}>
          {!chat && <div className="py-10 text-center text-[12.5px] text-gray-400">Loading the conversation…</div>}
          {chat && !chat.messages.length && (
            <div className="mx-auto max-w-md py-8 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: accent + "1A", color: accent }}><Bot size={20} /></div>
              <div className="mt-2 text-[13.5px] font-semibold text-gray-900">Talk to the agent about {project.name}</div>
              <div className="mt-1 text-[12px] text-gray-500">It reads this project's rankings, Search Console, map grid, its own notes and past reports before it answers, and it can queue tasks for you.</div>
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">{STARTERS.map((q) => <button key={q} disabled={!canSend} onClick={() => send(q)} className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[12px] text-gray-700 hover:border-gray-300 disabled:opacity-40">{q}</button>)}</div>
            </div>
          )}
          {chat?.messages.map((m) => m.system ? (
            <div key={m.id} className={`text-center text-[11.5px] ${m.error ? "text-red-700" : "text-gray-400"}`}>{m.text}</div>
          ) : m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[78%]">
                <div className="whitespace-pre-wrap rounded-2xl rounded-br-md px-3.5 py-2 text-[13px] leading-5 text-white" style={{ background: accent }}>{m.text}</div>
                <div className="mt-0.5 text-right text-[10.5px] text-gray-400">{m.by || "You"} · {relTime(m.at)}{m.status === "cancelled" ? " · stopped" : ""}</div>
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex justify-start gap-2">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: accent + "1A", color: accent }}><Bot size={15} /></span>
              <div className="min-w-0 max-w-[84%]">
                <div className={`rounded-2xl rounded-bl-md border px-3.5 py-1.5 ${m.error ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"}`}>{renderMd(m.text)}</div>
                <div className="mt-0.5 text-[10.5px] text-gray-400">{m.device || "Agent"} · {relTime(m.at)}{m.tokens ? ` · ${fmtTok(m.tokens)} tokens · ${usd(m.costUsd)}` : ""}</div>
              </div>
            </div>
          ))}
          {pending && (
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: accent + "1A", color: accent }}><Bot size={15} /></span>
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-gray-200 bg-white px-3.5 py-2 text-[12.5px] text-gray-600">
                <span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400" style={{ animationDelay: i * 0.2 + "s" }} />)}</span>
                {last?.status === "queued" ? (a?.listening.length ? "Sending to the agent…" : "Waiting for the agent to come online…") : (last?.activity || "Thinking") + "…"}
              </div>
              <button onClick={() => call("chat/stop", { projectId: id })} className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-gray-500 hover:text-red-700"><Square size={11} /> Stop</button>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 p-3">
          {chat?.blocked && <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{chat.blocked}</div>}
          {err && <div className="mb-2 text-[12px] text-red-700">{err}</div>}
          <div className="flex items-end gap-2">
            <textarea aria-label={`Message about ${project.name}`} rows={2} className={inputCls + " min-h-[44px] flex-1 resize-none"} placeholder={`Ask about ${project.name}, or tell the agent what to do…`} value={text} disabled={!!chat?.blocked}
              onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
            <Btn accent={accent} disabled={!canSend || !text.trim()} onClick={() => send()}><Send size={13} /> Send</Btn>
          </div>
          <div className="mt-1.5 text-[11px] text-gray-400">Enter sends, Shift+Enter starts a new line. Work you ask for is queued as a task; see <button className="underline" onClick={goTasks}>Tasks</button> for reports and approvals.</div>
        </div>
      </Card>
    </div>
  );
}

/* ---------------- devices and agent updates ---------------- */
function DevicesView({ data, accent, act, busy, reload, setErr }) {
  const [name, setName] = useState(""); const [fresh, setFresh] = useState(null); const [copied, setCopied] = useState(false);
  const [version, setVersion] = useState(""); const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const add = async () => { const o = await act("device/create", { name }); if (o?.token) { setFresh({ name, token: o.token }); setName(""); reload(); } };
  const publish = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !/^\d+\.\d+\.\d+$/.test(version)) { setErr("Choose the .jar file and enter its version, for example 0.2.0."); return; }
    setUploading(true);
    try {
      const r = await fetch(`/api/agentops/release/upload?version=${encodeURIComponent(version)}`, { method: "POST", headers: { "X-SS-Token": tok(), "Content-Type": "application/octet-stream" }, body: file });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.detail || j.error || `Upload failed (${r.status})`);
      setVersion(""); if (fileRef.current) fileRef.current.value = ""; setErr(""); reload();
    } catch (e) { setErr(String(e.message || e)); } finally { setUploading(false); }
  };
  const download = async () => {
    try {
      const r = await fetch("/api/agentops/release/download", { headers: { "X-SS-Token": tok() } });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Download failed.");
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a"); a.href = url; a.download = "serpsquad-agent.jar"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { setErr(String(e.message || e)); }
  };
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3">
          <div className="text-[13.5px] font-semibold text-gray-900">Devices</div>
          <div className="text-[11.5px] text-gray-500">A device is a computer running the agent. It only makes outbound requests to this CRM and checks in every minute.</div>
        </div>
        {!data.devices.length && <div className="px-4 py-6 text-center text-[12.5px] text-gray-400">No device registered yet.</div>}
        {data.devices.map((d) => { const stale = d.playbooksRev != null && d.playbooksRev !== data.playbooksRev; const behind = data.release && d.version && d.version !== data.release.version;
          return (
            <div key={d.id} className="flex flex-wrap items-center gap-3 border-t border-gray-100 px-4 py-3">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.online ? (d.paused ? "#D97706" : "#16A34A") : "#D1D5DB" }} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-gray-900">{d.name} <span className="font-normal text-gray-500">{d.online ? (d.paused ? "· paused" : "· online") : d.lastSeen ? `· last seen ${relTime(d.lastSeen)}` : "· never connected"}</span></div>
                <div className="truncate text-[11.5px] text-gray-500">{[d.host, d.os, d.version && "version " + d.version].filter(Boolean).join(" · ") || "Waiting for the first check-in"}</div>
                <div className="truncate text-[11.5px] text-gray-600">{d.currentTask ? "Working on: " + d.currentTask : d.state || ""}{stale ? " · playbooks not synced yet" : ""}{behind ? (d.updateSkipped === data.release.version ? ` · version ${data.release.version} failed its self-test here and was not installed` : ` · update to ${data.release.version} pending`) : ""}{d.googleProfile === false ? " · no Google browser profile" : ""}{d.localKey ? " · uses its own Claude key" : ""}</div>
              </div>
              <Btn ghost onClick={() => act("device/update", { id: d.id, syncNow: true })} disabled={busy} title="The device syncs playbooks and settings on its next check-in, within a minute."><RefreshCw size={13} /> {d.syncRequested ? "Sync requested" : "Sync now"}</Btn>
              <Btn ghost onClick={() => act("device/update", { id: d.id, paused: !d.paused })} disabled={busy}>{d.paused ? <><Play size={13} /> Resume</> : <><Pause size={13} /> Pause</>}</Btn>
              <Btn ghost danger onClick={async () => { if (await askConfirm({ title: "Remove this device?", message: `"${d.name}" will stop being able to connect.`, note: "Its token stops working at once. Register it again to bring it back.", confirmLabel: "Yes, remove", danger: true })) act("device/update", { id: d.id, revoke: true }); }}><Trash2 size={13} /></Btn>
            </div>
          ); })}
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 bg-gray-50 px-4 py-3">
          <input className={inputCls + " max-w-xs"} placeholder="Device name, for example Office PC" value={name} onChange={(e) => setName(e.target.value)} />
          <Btn accent={accent} onClick={add} disabled={!name.trim() || busy}><Plus size={13} /> Register device</Btn>
        </div>
      </Card>

      {fresh && (
        <Card className="border-amber-300 p-4">
          <div className="text-[13.5px] font-semibold text-gray-900">Device token for "{fresh.name}"</div>
          <div className="text-[12px] text-amber-800">Shown once. Paste it into the agent's setup on that computer. Anyone holding it can read project data through the agent endpoints, so treat it like a password.</div>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-gray-900 px-3 py-2 text-[12px] text-gray-100">{fresh.token}</code>
            <Btn ghost onClick={() => { navigator.clipboard?.writeText(fresh.token); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}</Btn>
            <Btn ghost onClick={() => setFresh(null)}>Done</Btn>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="text-[13.5px] font-semibold text-gray-900">Agent program</div>
        <div className="text-[11.5px] text-gray-500">{data.release ? `Published: version ${data.release.version} (${(data.release.size / 1048576).toFixed(1)} MB, ${relTime(data.release.at)} by ${data.release.by}). Devices download it, verify it and restart by themselves.` : "No version is published yet. Copy serpsquad-agent.jar to the computer by hand the first time; publish it here so devices can update themselves afterwards."}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {data.release && <Btn ghost onClick={download}><Download size={13} /> Download serpsquad-agent.jar</Btn>}
          <input ref={fileRef} type="file" accept=".jar" className="text-[12px]" aria-label="Agent jar file" />
          <input className={numCls + " w-24"} placeholder="0.2.0" aria-label="Version" value={version} onChange={(e) => setVersion(e.target.value.trim())} />
          <Btn accent={accent} onClick={publish} disabled={uploading}><Upload size={13} /> {uploading ? "Uploading…" : "Publish version"}</Btn>
        </div>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-[12px] leading-5 text-gray-600">
          <li>On the computer, install Java 21 or newer and put <code>serpsquad-agent.jar</code> in its own folder.</li>
          <li>Register the device above and copy its token.</li>
          <li>In that folder run <code>java -jar serpsquad-agent.jar</code>. The agent's own dashboard opens in the browser at <code>http://127.0.0.1:7717</code>. Paste the token there and press Connect.</li>
          <li>The Claude API key comes from <b>API setup</b> here. A computer can also be given its own key in its dashboard.</li>
          <li>From then on start it with <code>run.bat</code> (Windows) or <code>./run.sh</code>. For Google profile tasks press "Open Chrome to sign in" in the agent's dashboard and sign in yourself.</li>
        </ol>
      </Card>

      <Card className="p-4">
        <div className="text-[13.5px] font-semibold text-gray-900">Recent activity</div>
        <ul className="mt-2 space-y-1">{data.activity.slice(0, 25).map((a, i) => <li key={i} className="text-[12px] text-gray-700"><span className="text-gray-400">{relTime(a.at)}</span> · {a.text}</li>)}{!data.activity.length && <li className="text-[12px] text-gray-400">Nothing yet.</li>}</ul>
      </Card>
    </div>
  );
}

/* ---------------- API setup: the agent's own credentials ----------------
   Kept apart from Company Settings → API settings on purpose: these keys are
   stored in a server-side file that is never sent back to a browser, and they
   reach a device only together with the task it is handed. */
function KeyForm({ accent, state, label, onSave, onTest, onRemove, busy }) {
  const [key, setKey] = useState(""); const [msg, setMsg] = useState(null);
  const run = async (fn, okText) => { setMsg({ text: "Working…", tone: "q" }); const o = await fn(); if (!o) { setMsg(null); return; } setMsg({ text: o.detail || okText, tone: o.valid === false ? "no" : o.valid === null ? "q" : "ok" }); return o; };
  return (
    <div>
      <div className="text-[12.5px] text-gray-700">{state.set ? <>Saved, ends in <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[12px]">{state.last4}</code>{state.by ? <span className="text-gray-500"> · by {state.by} {state.updatedAt ? relTime(state.updatedAt) : ""}</span> : null}</> : <span className="text-gray-500">No key saved.</span>}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input type="password" autoComplete="off" spellCheck={false} aria-label={label} className={inputCls + " min-w-0 max-w-md flex-1"} placeholder={state.set ? "Paste a new key to replace it" : "sk-ant-…"} value={key} onChange={(e) => setKey(e.target.value)} />
        <Btn accent={accent} disabled={busy || key.trim().length < 20} onClick={async () => { const o = await run(() => onSave(key.trim()), "Key saved."); if (o) setKey(""); }}><Check size={13} /> Save key</Btn>
        <Btn ghost disabled={busy || (!state.set && key.trim().length < 20)} onClick={() => run(() => onTest(key.trim()))} title="Asks Claude whether it accepts the key. This costs nothing.">Test</Btn>
        {state.set && <Btn ghost danger disabled={busy} onClick={async () => { if (await askConfirm({ title: "Remove this key?", message: "The agent stops using it at once.", confirmLabel: "Yes, remove", danger: true })) run(onRemove, "Key removed."); }}>Remove</Btn>}
      </div>
      {msg && <div className={`mt-1.5 text-[12px] ${msg.tone === "ok" ? "text-green-700" : msg.tone === "no" ? "text-red-700" : "text-amber-700"}`}>{msg.text}</div>}
    </div>
  );
}
function ApiSetupView({ data, accent, act, busy }) {
  const real = data.projects.filter((p) => p.id !== "_agency");
  const [pid, setPid] = useState("");
  const withKey = data.projects.filter((p) => p.ownKey.set);
  const picked = data.projects.find((p) => p.id === pid);
  const cred = (extra) => act("credentials", extra);
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold text-gray-900"><KeyRound size={15} style={{ color: accent }} /> Claude API key for the agent</div>
        <div className="mb-3 text-[11.5px] text-gray-500">The agent's own key, separate from the AI key in API settings, so its usage shows on its own line in the Claude Console. Create one at console.anthropic.com, Settings, API keys.</div>
        <KeyForm accent={accent} busy={busy} label="Company Claude API key" state={data.credentials.claude}
          onSave={(key) => cred({ action: "set", key })} onTest={(key) => cred({ action: "test", key })} onRemove={() => cred({ action: "remove" })} />
        <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-[11.5px] leading-5 text-gray-600">
          The key is stored on the server in a file only the server can read. It is never shown again here and is not part of the workspace data. A device receives it only together with a task it is handed.
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-[13.5px] font-semibold text-gray-900">Which key a task uses</div>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[12.5px] text-gray-700">
          <li>The project's own key, when one is set below.</li>
          <li>The key saved on the device itself, when it has one (set in the agent's dashboard on that computer).</li>
          <li>The company key above.</li>
        </ol>
        <div className="mt-3 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Devices</div>
        {!data.devices.length && <div className="mt-1 text-[12px] text-gray-400">No device registered yet.</div>}
        {data.devices.map((d) => <div key={d.id} className="mt-1 text-[12.5px] text-gray-700"><b>{d.name}</b>: {d.localKey ? "has its own key, used unless a project has one" : d.localKey === false ? (data.credentials.claude.set ? "no key of its own, uses the company key" : "no key of its own") : "not reported yet"}</div>)}
      </Card>

      <Card className="p-4">
        <div className="text-[13.5px] font-semibold text-gray-900">Own key per project (optional)</div>
        <div className="mb-3 text-[11.5px] text-gray-500">Give a project its own Claude key when its usage should be billed or tracked separately. Its token limits still apply.</div>
        {withKey.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 py-2 text-[12.5px] first:border-t-0">
            <span><b>{p.name}</b> <span className="text-gray-500">key ends in {p.ownKey.last4} · by {p.ownKey.by} {p.ownKey.updatedAt ? relTime(p.ownKey.updatedAt) : ""}</span></span>
            <Btn ghost onClick={() => setPid(p.id)}>Change</Btn>
          </div>
        ))}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select aria-label="Project" className={selCls + " py-1.5"} value={pid} onChange={(e) => setPid(e.target.value)}>
            <option value="">Choose a project…</option>{real.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {picked && <div className="mt-3"><KeyForm key={picked.id} accent={accent} busy={busy} label={`Claude API key for ${picked.name}`} state={picked.ownKey}
          onSave={(key) => cred({ action: "set", key, projectId: picked.id })} onTest={(key) => cred({ action: "test", key, projectId: picked.id })} onRemove={() => cred({ action: "remove", projectId: picked.id })} /></div>}
      </Card>
    </div>
  );
}

/* ---------------- playbooks ---------------- */
function PlaybooksView({ data, accent, act }) {
  const [open, setOpen] = useState(null); const [text, setText] = useState(""); const [meta, setMeta] = useState(null); const [msg, setMsg] = useState("");
  const edit = async (key) => { try { const o = await api("playbook", { key, get: true }); setMeta(o); setText(o.text); setOpen(key); setMsg(""); } catch (e) { setMsg(String(e.message || e)); } };
  const save = async () => { const o = await act("playbook", { key: open, text }); if (o) setOpen(null); };
  const reset = async () => { if (await askConfirm({ title: "Reset this playbook?", message: "Your edits are replaced by the built-in text.", confirmLabel: "Yes, reset" })) { const o = await act("playbook", { key: open, reset: true }); if (o) setOpen(null); } };
  const label = useMemo(() => Object.fromEntries(data.playbooks.map((p) => [p.key, p.label])), [data.playbooks]);
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-gray-100 px-4 py-3">
        <div className="text-[13.5px] font-semibold text-gray-900">Playbooks</div>
        <div className="text-[11.5px] text-gray-500">The instructions the agent follows for each task type. Edit them here and every device picks up the change on its next sync (revision {data.playbooksRev}).</div>
        {msg && <div className="mt-1 text-[11.5px] text-red-700">{msg}</div>}
      </div>
      {data.playbooks.map((p) => (
        <button key={p.key} onClick={() => edit(p.key)} className="flex w-full items-center justify-between gap-3 border-t border-gray-100 px-4 py-2.5 text-left hover:bg-gray-50">
          <span className="text-[13px] font-medium text-gray-900">{p.label}</span>
          <span className="text-[11.5px] text-gray-500">{p.edited ? `Edited ${relTime(p.updatedAt)}` : "Built-in text"}</span>
        </button>
      ))}
      {open && (
        <Modal title={label[open] || open} sub="Plain text or Markdown. Write it as you would brief a senior colleague." onClose={() => setOpen(null)} wide>
          <textarea className={inputCls + " h-[55vh] font-mono text-[12px] leading-5"} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="mt-3 flex items-center gap-2">
            <Btn accent={accent} onClick={save} disabled={text === meta?.text}><Check size={13} /> Save and sync to devices</Btn>
            {meta?.edited && <Btn ghost onClick={reset}>Reset to built-in</Btn>}
            <span className="text-[11.5px] text-gray-400">{text.length.toLocaleString()} characters</span>
          </div>
        </Modal>
      )}
    </Card>
  );
}
