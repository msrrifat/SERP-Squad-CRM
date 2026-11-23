import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Store, Bell, Sparkles, Image as ImageIcon, ArrowRight, BookOpen, ChevronRight, Bot, Check, ClipboardList, Clock, Copy, ExternalLink, Download, Eye, FolderInput, Gauge, GraduationCap, BarChart3, FileText, Globe, KeyRound, Library, ListTodo, Lock, MapPin, MessageSquare, Mic, Monitor, Pause, PencilLine, Pin, Play, Plus, RefreshCw, Search, Send, Settings2, Share2, ShieldCheck, Square, ThumbsDown, ThumbsUp, Trash2, Upload } from "lucide-react";
import { Card, Labeled, LogoUpload, Modal, askConfirm, inputCls } from "../../ui/primitives.jsx";
import { relTime } from "../../lib/format.jsx";
import { renderMd } from "./guide.jsx";
import { docxToText } from "../../lib/docxread.js";

/* ================= AI agent (local worker) =================
   The control panel for the Java agent in /agent that runs on an office PC.
   Everything here talks to /api/agentops/* (server/agentops.js), which only
   answers Admin/owner sessions. The device does the work; this screen decides
   what it may do: per project, per task type, a working limit (off / limited /
   open) and a token limit, plus approvals, playbooks and device control. */
const tok = () => { try { return localStorage.getItem("ss_token") || ""; } catch { return ""; } };
/* Inside the agent's own application these screens talk to the agent's local
   server, which forwards to the CRM with the device's token; the page proves
   itself with the header that application hands in. */
let EXTRA_HEADERS = {};
/* set only inside the agent's own application: what that computer can do for the page (open a folder picker) */
let LOCAL_APP = null;
let SECOND_CHECK = true;      // whether a plan is read by a second check before the agent acts on it alone (company setting)
const auth = () => ({ "X-SS-Token": tok(), ...EXTRA_HEADERS });
async function api(path, body) {
  const r = await fetch("/api/agentops/" + path, body === undefined
    ? { headers: auth() }
    : { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(body) });
  let j = {};
  try { j = await r.json(); } catch { /* non-JSON error page */ }
  if (!r.ok) throw new Error(j.detail || j.error || `Request failed (${r.status})`);
  return j;
}
const fmtTok = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n || 0));
const usd = (n) => "$" + (n >= 100 ? n.toFixed(0) : (n || 0).toFixed(2));
const usd4 = (n) => "$" + (!n ? "0.00" : n >= 0.1 ? n.toFixed(2) : n.toFixed(4));       // small amounts keep their cents and fractions
const STATUS = {
  queued: ["Waiting", "#6B7280", "#F3F4F6"], approved: ["Approved, waiting", "#1D4ED8", "#DBEAFE"], running: ["Running", "#0E7C66", "#D1FAE5"],
  needs_approval: ["Needs approval", "#B45309", "#FEF3C7"], done: ["Done", "#15803D", "#DCFCE7"], failed: ["Failed", "#B91C1C", "#FEE2E2"],
  stopped: ["Stopped", "#B45309", "#FEF3C7"], cancelled: ["Cancelled", "#6B7280", "#F3F4F6"],
};
const SEV = { high: ["#B91C1C", "#FEE2E2"], medium: ["#B45309", "#FEF3C7"], low: ["#1D4ED8", "#DBEAFE"], info: ["#6B7280", "#F3F4F6"] };
const NEEDS = { web: "Web research", google: "Google browser", browser: "Browser" };
/* Project logos, as the CRM holds them. The project list carries only a
   fingerprint per project; the images are fetched once (and again when a
   fingerprint changes) and handed down through this context. */
const LogoCtx = React.createContext({});
function ProjectLogo({ project, size = 36, dot = null }) {
  const src = React.useContext(LogoCtx)[project.id]?.src || "";
  const initials = project.id === "_agency" ? "A" : (project.name || "P").replace(/[^A-Za-z0-9 ]/g, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "P";
  const box = { width: size, height: size, borderRadius: Math.round(size * 0.28) };
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {src
        ? <img src={src} alt={`${project.name} logo`} className="border border-gray-200 bg-white object-contain" style={box} />
        : <span aria-hidden="true" className="flex items-center justify-center font-bold text-white" style={{ ...box, background: project.accent || "#64748B", fontSize: Math.max(9, Math.round(size * 0.38)) }}>{initials}</span>}
      {dot != null && <span className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-white" style={{ width: Math.max(9, Math.round(size * 0.3)), height: Math.max(9, Math.round(size * 0.3)), background: dot ? "#16A34A" : "#D1D5DB" }} title={dot ? "Agent switched on" : "Agent not switched on"} />}
    </span>
  );
}
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

/* `app` is set only inside the agent's own application: { headers, view, onView, onCounts }.
   The application's sidebar chooses the view, so the tab row is hidden, and
   device management stays in the CRM. */
export function AgentOpsSection({ company, app = null }) {
  EXTRA_HEADERS = app?.headers || {};
  LOCAL_APP = app?.local || null;
  const accent = company?.accent || "#1F2A44";
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [ownView, setOwnView] = useState("limits");
  const view = app?.view || ownView;
  /* a project page with unsaved changes registers a question here; leaving the Projects tab asks it first */
  const leaveGuard = useRef(null);
  const setView = async (v) => {
    if (v !== view && view === "limits" && leaveGuard.current && !(await leaveGuard.current())) return;
    if (app?.onView) app.onView(v); else setOwnView(v);
  };
  const [busy, setBusy] = useState(false);
  const [openTask, setOpenTask] = useState(null);
  const [chatPid, setChatPid] = useState("");
  const [inProject, setInProject] = useState(false);
  const [logos, setLogos] = useState({});       // project id -> { rev, src }

  /* A refresh that started before a save and lands after it would put the old
     values back on the screen, so its answer is dropped. What a failed action
     said stays until it is closed or the next action starts (the refresh used
     to wipe it within seconds), and it floats above any open dialog. */
  const gen = useRef(0), inflight = useRef(new Map());
  const [actErr, setActErr] = useState("");
  const load = useCallback(async () => {
    const g0 = gen.current;
    try { const o = await api("overview"); if (g0 === gen.current) setData(o); setErr(""); } catch (e) { setErr(String(e.message || e)); }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 10000);
    return () => clearInterval(t);
  }, [load]);
  /* every write returns the fresh overview, so the screen never shows stale limits */
  const act = useCallback((path, body) => {
    /* the same request sent twice in a row (a double click) is one request */
    const key = path + "\n" + JSON.stringify(body ?? null), same = inflight.current.get(key);
    if (same) return same;
    const run = (async () => {
      gen.current += 1; setBusy(true); setActErr("");
      try { const o = await api(path, body); if (o.catalog) setData(o); return o; }
      catch (e) { setActErr(String(e.message || e)); return null; }
      finally { gen.current += 1; inflight.current.delete(key); setBusy(inflight.current.size > 0); }
    })();
    inflight.current.set(key, run);
    return run;
  }, []);

  /* fetch the logos that are new or changed since the last look; a project without one shows its initials */
  const wantLogos = data ? data.projects.filter((p) => p.logoRev && logos[p.id]?.rev !== p.logoRev).map((p) => p.id + ":" + p.logoRev).join(",") : "";
  useEffect(() => {
    if (!wantLogos) return undefined;
    let off = false;
    const ids = wantLogos.split(",").map((x) => { const i = x.lastIndexOf(":"); return [x.slice(0, i), x.slice(i + 1)]; });
    api("logos", { ids: ids.map((x) => x[0]) }).then((o) => { if (!off) setLogos((cur) => { const next = { ...cur }; for (const [id, rev] of ids) next[id] = { rev, src: /^data:image\//.test(o.logos?.[id] || "") ? o.logos[id] : "" }; return next; }); }).catch(() => { /* initials are shown instead */ });
    return () => { off = true; };
  }, [wantLogos]);

  const toApprove = data ? data.tasks.filter((t) => t.status === "needs_approval").length : 0;
  useEffect(() => { if (app?.onCounts) app.onCounts({ approvals: toApprove }); }, [toApprove]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) {
    return <Card className="p-6 text-[13px] text-gray-500">{err ? <span className="text-red-700">{app ? err : /forbidden|Admin/i.test(err) ? "The AI agent panel is for the owner and Admins." : err}</span> : "Loading the AI agent panel…"}</Card>;
  }
  const g = data.global;
  SECOND_CHECK = g.secondCheck !== false;
  const needsApproval = data.tasks.filter((t) => t.status === "needs_approval").length;
  const attention = data.attention || [], waitingOnYou = attention.filter((x) => x.level === "act").length;
  const VIEWS = app ? [] : [["limits", "Projects & limits", Gauge], ["tasks", `Tasks${needsApproval ? ` (${needsApproval} to approve)` : ""}`, ListTodo], ["chat", "Chat", MessageSquare], ["alerts", `Alerts${waitingOnYou ? ` (${waitingOnYou})` : ""}`, Bell], ["devices", "Devices & updates", Monitor], ["knowledge", `Knowledge${data.knowledge?.docs ? ` (${data.knowledge.docs})` : ""}`, Library], ["api", "API setup", KeyRound], ["playbooks", "Playbooks", BookOpen]];
  const monthCost = data.projects.reduce((s, p) => s + (p.usage.costUsd || 0), 0);

  return (
    <LogoCtx.Provider value={logos}>
    <div className="space-y-4">
      {err && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-800"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{err}</div>}
      {actErr && <div role="alert" className="fixed right-4 top-4 z-[3000] flex max-w-[420px] items-start gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2.5 text-[12.5px] text-red-900 shadow-lg"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><span className="min-w-0 flex-1 break-words"><b>That did not work.</b> {actErr}</span><button onClick={() => setActErr("")} aria-label="Close this message" className="shrink-0 rounded px-1 text-[14px] leading-none text-red-700 hover:bg-red-100">×</button></div>}

      {/* company-wide controls (not shown on a project's own page, which is about that one project) */}
      <Card className={"p-4" + (view === "limits" && inProject ? " hidden" : "")}>
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
            {data.seoData?.monthCalls > 0 && <div>DataForSEO {usd4(data.seoData.monthUsd || 0)} in {data.seoData.monthCalls} request{data.seoData.monthCalls === 1 ? "" : "s"}</div>}
          </div>
        </div>
      </Card>

      {!data.credentials.claude.set && !data.projects.some((p) => p.ownKey.set) && !data.devices.some((d) => d.localKey) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
          <KeyRound size={14} className="shrink-0" /> No Claude API key is set for the agent yet, so no task can start.
          <button className="font-semibold underline" onClick={() => setView("api")}>Open API setup</button>
        </div>
      )}

      {waitingOnYou > 0 && view !== "alerts" && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-900">
          <Bell size={14} className="shrink-0" />
          <span className="min-w-0 flex-1"><b>{waitingOnYou === 1 ? "One thing is waiting for you." : `${waitingOnYou} things are waiting for you.`}</b> {attention.find((x) => x.level === "act")?.title}{waitingOnYou > 1 ? ", and more." : ""}</span>
          <button className="font-semibold underline" onClick={() => setView("alerts")}>Show {waitingOnYou === 1 ? "it" : "them"}</button>
        </div>
      )}

      <div className={app ? "hidden" : "flex flex-wrap gap-1.5"}>
        {VIEWS.map(([k, label, Icon]) => (
          <button key={k} onClick={() => setView(k)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold"
            style={view === k ? { background: accent, color: "#fff", borderColor: accent } : { background: "#fff", color: "#374151", borderColor: "#E5E7EB" }}><Icon size={13} />{label}</button>
        ))}
      </div>

      {view === "limits" && <LimitsView leaveGuard={leaveGuard} reload={load} data={data} accent={accent} act={act} busy={busy} tick={app?.tick || 0} sticky={+app?.sticky || 0} onPage={setInProject} setData={setData} onOpenTask={setOpenTask} onChat={(id) => { setChatPid(id); setView("chat"); }} />}
      {view === "chat" && <ChatView data={data} accent={accent} pid={chatPid} setPid={setChatPid} goTasks={() => setView("tasks")} />}
      {view === "tasks" && <TasksView data={data} accent={accent} act={act} busy={busy} onOpen={setOpenTask} />}
      {view === "devices" && !app && <DevicesView data={data} accent={accent} act={act} busy={busy} reload={load} setErr={setErr} />}
      {view === "alerts" && <AlertsView data={data} accent={accent} act={act} busy={busy} onOpenTask={setOpenTask} goProject={() => setView("limits")} />}
      {view === "knowledge" && <KnowledgeView data={data} accent={accent} goTasks={() => setView("tasks")} />}
      {view === "api" && <ApiSetupView data={data} accent={accent} act={act} busy={busy} />}
      {view === "playbooks" && <PlaybooksView data={data} accent={accent} act={act} setData={setData} />}
      {openTask && <TaskModal id={openTask} accent={accent} act={act} onClose={() => setOpenTask(null)} />}
    </div>
    </LogoCtx.Provider>
  );
}

/* ---------------- alerts and schedule: what needs a person, how they are told, and when the agent works ---------------- */
const ALERT_KINDS_UI = [["approval", "A proposal is waiting for approval"], ["failed", "A task failed, was stopped, or was cut off while making a change"], ["limit", "A token or spend limit is nearly used (80%) or reached"], ["signin", "A person has to sign in again in a Chrome ID"], ["offline", "Work is waiting and no agent computer is running, or tasks are held"], ["site", "A client's website stopped answering"]];
const DAYS_UI = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"]];
const ZONES = ["UTC", "Europe/London", "Europe/Dublin", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Athens", "America/St_Johns", "America/Halifax", "America/Toronto", "America/New_York", "America/Chicago", "America/Winnipeg", "America/Denver", "America/Edmonton", "America/Phoenix", "America/Los_Angeles", "America/Vancouver", "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Dhaka", "Asia/Singapore", "Asia/Manila", "Asia/Tokyo", "Australia/Perth", "Australia/Sydney", "Pacific/Auckland"];
function AlertsView({ data, accent, act, busy, onOpenTask, goProject }) {
  const items = data.attention || [], a = data.alerts || {}, sch = data.schedule || {}, wh = sch.workHours || { on: false, from: 8, to: 18, days: [1, 2, 3, 4, 5] };
  const [to, setTo] = useState(a.to || "");
  useEffect(() => { setTo(a.to || ""); }, [a.to]);
  const [test, setTest] = useState(null);
  const zones = ZONES.includes(sch.timeZone) || !sch.timeZone ? ZONES : [sch.timeZone, ...ZONES];
  const setAlerts = (patch) => act("config", { global: { alerts: patch } });
  const setHours = (patch) => act("config", { global: { workHours: { ...wh, ...patch } } });
  const sendTest = async () => { setTest({ running: true }); const o = await act("alerts", { action: "test" }); setTest(o?.alertTest || { ok: false, detail: "The test could not be sent." }); };
  const hours = Array.from({ length: 25 }, (_, h) => h);
  const hh = (h) => String(h % 24).padStart(2, "0") + ":00";
  const act1 = items.filter((x) => x.level === "act"), warn = items.filter((x) => x.level !== "act");
  const Row = ({ x }) => (
    <div className="flex items-start gap-3 border-t border-gray-100 py-2.5 first:border-t-0">
      <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: x.level === "act" ? "#DC2626" : "#D97706" }} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-gray-900">{x.title}</div>
        {x.detail && <div className="mt-0.5 break-words text-[12px] leading-5 text-gray-600">{x.detail}</div>}
        <div className="mt-0.5 text-[11px] text-gray-400">{relTime(x.at)}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {x.taskId && <Btn ghost onClick={() => onOpenTask(x.taskId)}>Open</Btn>}
        {!x.taskId && x.projectId && <Btn ghost onClick={goProject}>Projects</Btn>}
        {x.kind !== "approval" && <Btn ghost disabled={busy} title="Take this off the list. It comes back only if it happens again." onClick={() => act("alerts", { action: "ack", key: x.key })}>Dismiss</Btn>}
      </div>
    </div>
  );
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[13.5px] font-semibold text-gray-900"><Bell size={15} style={{ color: accent }} /> Needs a person</div>
          {warn.length + act1.filter((x) => x.kind !== "approval").length > 1 && <Btn ghost disabled={busy} onClick={() => act("alerts", { action: "ack", keys: items.filter((x) => x.kind !== "approval").map((x) => x.key) })}>Dismiss all that can be dismissed</Btn>}
        </div>
        <div className="mt-1 text-[11.5px] leading-5 text-gray-500">Worked out from what is true right now: a proposal you decide, a limit you raise or a sign-in you fix drops off this list by itself. A proposal cannot be dismissed, only approved or rejected.</div>
        {!items.length && <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2.5 text-[12.5px] text-emerald-800">Nothing is waiting for you.</div>}
        {act1.length > 0 && <div className="mt-3"><div className="text-[9.5px] font-semibold uppercase tracking-wider text-red-700">Waiting for you ({act1.length})</div>{act1.map((x) => <Row key={x.key} x={x} />)}</div>}
        {warn.length > 0 && <div className="mt-3"><div className="text-[9.5px] font-semibold uppercase tracking-wider text-amber-700">Worth knowing ({warn.length})</div>{warn.map((x) => <Row key={x.key} x={x} />)}</div>}
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[13.5px] font-semibold text-gray-900"><MessageSquare size={15} style={{ color: accent }} /> Email alerts</div>
          <label className="flex items-center gap-2 text-[12.5px] font-medium text-gray-700"><Switch on={!!a.email} label="Send email alerts" onChange={(v) => setAlerts({ email: v })} /> {a.email ? "On" : "Off"}</label>
        </div>
        <div className="mt-1 text-[11.5px] leading-5 text-gray-500">One email for everything new, at most every ten minutes, so twenty proposals are one message. Nothing is mailed twice. It is sent from the email account saved in the CRM under Company Settings, API settings, Email SMTP.</div>
        {!a.mailReady && <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">No email account is set up in the CRM yet, so no alert can be sent. Add it under Company Settings, API settings, Email SMTP. The list above works without it.</div>}
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Labeled label="Send to (leave empty for the owner and the Admins)">
            <input className={inputCls} aria-label="Email addresses for alerts, separated by commas" placeholder={a.admins ? `The owner and Admins (${a.admins} address${a.admins === 1 ? "" : "es"})` : "name@agency.com, second@agency.com"} value={to} onChange={(e) => setTo(e.target.value)} onBlur={() => { if (to.trim() !== (a.to || "")) setAlerts({ to }); }} />
          </Labeled>
          <div className="flex items-end gap-2">
            <Btn ghost disabled={busy || test?.running || !a.mailReady} onClick={sendTest}><RefreshCw size={13} /> {test?.running ? "Sending…" : "Send a test email"}</Btn>
            <span className="pb-1.5 text-[11.5px] text-gray-500">{a.recipients ? `Goes to ${a.recipients} address${a.recipients === 1 ? "" : "es"}.` : "No address yet."}</span>
          </div>
        </div>
        {test && !test.running && <div className="mt-2 rounded-lg px-3 py-2 text-[12px]" role="status" style={test.ok ? { background: "#ECFDF5", color: "#047857" } : { background: "#FEF2F2", color: "#B91C1C" }}>{test.detail}</div>}
        <div className="mt-3 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Email me when</div>
        <div className="mt-1.5 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {ALERT_KINDS_UI.map(([k, label]) => <label key={k} className="flex items-center gap-2 text-[12.5px] text-gray-700"><Switch on={a[k] !== false} label={label} onChange={(v) => setAlerts({ [k]: v })} /> {label}</label>)}
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold text-gray-900"><Clock size={15} style={{ color: accent }} /> Time zone and working hours</div>
        <div className="mt-1 text-[11.5px] leading-5 text-gray-500">Days, weeks and months (daily limits, "1 per day", the monthly token limit) turn over at midnight in this time zone. It is {sch.localTime || "–"} there now.</div>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Labeled label="Agency time zone">
            <select className={inputCls} aria-label="Agency time zone" value={sch.timeZone || "UTC"} onChange={(e) => act("config", { global: { timeZone: e.target.value } })}>{zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}</select>
          </Labeled>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-[12.5px] font-medium text-gray-700"><Switch on={!!wh.on} label="Limit when the agent starts work by itself" onChange={(v) => setHours({ on: v })} /> Only start work by itself between</label>
            <div className={"mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-gray-700" + (wh.on ? "" : " opacity-50")}>
              <select className={selCls} aria-label="Working hours from" disabled={!wh.on} value={wh.from} onChange={(e) => setHours({ from: +e.target.value })}>{hours.slice(0, 24).map((h) => <option key={h} value={h}>{hh(h)}</option>)}</select>
              and
              <select className={selCls} aria-label="Working hours to" disabled={!wh.on} value={wh.to} onChange={(e) => setHours({ to: +e.target.value })}>{hours.slice(1).map((h) => <option key={h} value={h}>{h === 24 ? "24:00" : hh(h)}</option>)}</select>
              on
              {DAYS_UI.map(([d, label]) => { const on = wh.days.includes(d); return <button key={d} type="button" disabled={!wh.on} aria-pressed={on} onClick={() => { const days = on ? wh.days.filter((x) => x !== d) : [...wh.days, d]; if (days.length) setHours({ days }); }} className="rounded-md border px-2 py-1 text-[11.5px] font-semibold" style={on ? { background: accent, color: "#fff", borderColor: accent } : { background: "#fff", color: "#6B7280", borderColor: "#E5E7EB" }}>{label}</button>; })}
            </div>
            <div className="mt-2 text-[11.5px] leading-5 text-gray-500">This holds for scheduled tasks, the agent's own follow-ups and work started by a trigger. A task you add by hand, and a change you approved, run at any time. A window that ends before it starts (22:00 to 06:00) runs overnight.{sch.offNow ? " Right now it is outside these hours." : ""}</div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold text-gray-900"><Sparkles size={15} style={{ color: accent }} /> Work that starts because something happened</div>
        <div className="mt-1 text-[12px] leading-5 text-gray-600">Besides the calendar, three things can start a task. The first two are switched on per project, on the project's page under <b>Projects &amp; limits</b>. All of them stay inside that project's working limits and token limits.</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] leading-5 text-gray-600">
          <li><b>A keyword fell.</b> After a rank scan, a keyword that was in the top 20 and fell by the number of positions you set queues a rank-drop diagnosis that names it. Projects on demo data are skipped.</li>
          <li><b>The website stopped answering.</b> The CRM asks for the home page every 15 minutes (no Claude call, no tokens). Two failures in a row raise an alert and queue a site health check.</li>
          <li><b>A new review.</b> The Business Profile guard reads the newest reviews in the signed-in Chrome window and suggests one review-reply task for the reviews that have no reply. Set the guard to run every day and replies are drafted within a day of a review.</li>
        </ul>
        <div className="mt-2 text-[11.5px] text-gray-500">Switched on now: keyword drops for {data.projects.filter((p) => p.setting?.triggers?.rankDrop).length} of {data.projects.filter((p) => p.id !== "_agency").length} projects, the website check for {data.projects.filter((p) => p.setting?.triggers?.siteDown).length}.</div>
      </Card>
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
/* ---------------- putting a project on the agent's list: import it from the CRM, or add it by hand ---------------- */
const ACCENT_CHOICES = ["#0E7C66", "#2563EB", "#B45309", "#DC2626", "#7C3AED", "#0891B2", "#BE123C", "#4D7C0F", "#1F2937"];
function ManualProjectForm({ accent, initial, busy, saveLabel, onSave, onCancel, error }) {
  const [f, setF] = useState(() => ({ name: initial?.name || "", client: initial?.client || "", website: initial?.website || "", accent: initial?.accent || ACCENT_CHOICES[0], logo: initial?.logo ?? null }));
  const set = (patch) => setF((cur) => ({ ...cur, ...patch }));
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="Project name"><input className={inputCls} placeholder="Oakfield Veterinary Clinic" value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus /></Labeled>
        <Labeled label="Client or company (optional)"><input className={inputCls} placeholder="Oakfield Vets Ltd" value={f.client} onChange={(e) => set({ client: e.target.value })} /></Labeled>
      </div>
      <Labeled label="Website (optional)"><input className={inputCls} placeholder="https://example.com" value={f.website} onChange={(e) => set({ website: e.target.value })} /></Labeled>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="Logo (optional)"><LogoUpload value={f.logo} onChange={(logo) => set({ logo })} label="Upload a logo" /></Labeled>
        <Labeled label="Colour, used where there is no logo">
          <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Project colour">
            {ACCENT_CHOICES.map((c) => <button key={c} type="button" role="radio" aria-checked={f.accent === c} aria-label={`Colour ${c}`} onClick={() => set({ accent: c })} className="h-7 w-7 rounded-lg border-2" style={{ background: c, borderColor: f.accent === c ? "#111827" : "transparent", boxShadow: f.accent === c ? "0 0 0 2px #fff inset" : "none" }} />)}
          </div>
        </Labeled>
      </div>
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-800" role="alert">{error}</div>}
      <div className="flex flex-wrap items-center gap-2">
        <Btn accent={accent} disabled={busy || f.name.trim().length < 2} onClick={() => onSave({ name: f.name.trim(), client: f.client.trim(), website: f.website.trim(), accent: f.accent, ...(f.logo !== (initial?.logo ?? null) ? { logo: f.logo || "" } : {}) })}><Check size={13} /> {saveLabel}</Btn>
        <Btn ghost onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}
function AddProjectModal({ accent, onClose, onAdded, setData }) {
  const [mode, setMode] = useState("import");
  const [list, setList] = useState(null);         // CRM projects that are not on the agent's list yet
  const [picked, setPicked] = useState({});
  const [find, setFind] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { api("roster", { action: "list" }).then((o) => setList(o.candidates)).catch((e) => { setErr(String(e.message || e)); setList([]); }); }, []);
  const send = async (body) => {
    setBusy(true); setErr("");
    try { const o = await api("roster", body); setData(o); return o; }
    catch (e) { setErr(String(e.message || e)); return null; }
    finally { setBusy(false); }
  };
  const q = find.trim().toLowerCase();
  const shown = (list || []).filter((c) => !q || c.name.toLowerCase().includes(q) || (c.client || "").toLowerCase().includes(q));
  const ids = Object.keys(picked).filter((id) => picked[id]);
  const doImport = async (all) => { const o = await send(all ? { action: "import", all: true } : { action: "import", ids }); if (o) onAdded(o.imported || []); };
  const TABS = [["import", "Import from the CRM", FolderInput], ["manual", "Add by hand", PencilLine]];
  return (
    <Modal title="Add a project" sub="Put a project on the agent's list. The agent only works on projects that are on it." onClose={onClose} wide>
      <div className="mb-4 grid grid-cols-2 gap-2">
        {TABS.map(([k, label, Icon]) => (
          <button key={k} type="button" aria-pressed={mode === k} onClick={() => { setMode(k); setErr(""); }} className="flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-semibold"
            style={mode === k ? { background: accent, borderColor: accent, color: "#fff" } : { background: "#fff", borderColor: "#E5E7EB", color: "#111827" }}><Icon size={15} /> {label}</button>
        ))}
      </div>
      {mode === "import" && (
        <div className="space-y-3">
          <div className="text-[12px] leading-relaxed text-gray-600">The project stays in the CRM and the agent reads its rankings, Search Console data, logo and Brand Voice from there. Nothing in the CRM is changed. A project already on the agent's list is not shown.</div>
          {list === null && <div className="text-[12.5px] text-gray-500">Loading the CRM's projects…</div>}
          {list && !list.length && !err && <div className="rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center text-[12.5px] text-gray-500">Every project in the CRM is already on the agent's list. Create the project in the CRM first, or add it by hand here.</div>}
          {list && list.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {list.length > 6 && <input className={inputCls + " min-w-[180px] flex-1"} placeholder="Find a project or client" value={find} onChange={(e) => setFind(e.target.value)} aria-label="Find a CRM project" />}
                <Btn ghost onClick={() => setPicked(Object.fromEntries(shown.map((c) => [c.id, !shown.every((x) => picked[x.id])])))}>{shown.length && shown.every((x) => picked[x.id]) ? "Clear the selection" : "Select all shown"}</Btn>
              </div>
              <div className="max-h-[320px] space-y-1.5 overflow-auto pr-1">
                {shown.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2" style={picked[c.id] ? { borderColor: accent, background: accent + "0D" } : { borderColor: "#E5E7EB" }}>
                    <input type="checkbox" checked={!!picked[c.id]} onChange={(e) => setPicked({ ...picked, [c.id]: e.target.checked })} />
                    <ProjectLogo project={c} size={32} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold text-gray-900">{c.name}</span><span className="block truncate text-[11.5px] text-gray-500">{[c.client, c.website].filter(Boolean).join(" · ") || "No client name"}</span></span>
                  </label>
                ))}
                {!shown.length && <div className="px-1 py-4 text-center text-[12.5px] text-gray-400">No CRM project matches "{find}".</div>}
              </div>
            </>
          )}
          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-800" role="alert">{err}</div>}
          <div className="flex flex-wrap items-center gap-2">
            <Btn accent={accent} disabled={busy || !ids.length} onClick={() => doImport(false)}><FolderInput size={13} /> {ids.length ? `Import ${ids.length} project${ids.length === 1 ? "" : "s"}` : "Import"}</Btn>
            {list && list.length > 1 && <Btn ghost disabled={busy} onClick={() => doImport(true)}>Import all {list.length}</Btn>}
            <Btn ghost onClick={onClose}>Cancel</Btn>
          </div>
        </div>
      )}
      {mode === "manual" && (
        <div className="space-y-3">
          <div className="text-[12px] leading-relaxed text-gray-600">For a business that is not in the CRM. The agent can research, audit, write and work in the browser for it, with its own work setup, brand voice, chat and limits. It has no rank tracking, Search Console data or reports, because those live in the CRM.</div>
          <ManualProjectForm accent={accent} busy={busy} error={err} saveLabel="Add the project" onCancel={onClose} onSave={async (f) => { const o = await send({ action: "add", ...f }); if (o) onAdded([o.created]); }} />
        </div>
      )}
    </Modal>
  );
}
/* Back and Forward, as in a browser: they walk the pages visited inside the Projects screen */
function PageNav({ canBack, canForward, onBack, onForward }) {
  const cls = "flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:cursor-default disabled:opacity-35 disabled:hover:bg-white";
  return (
    <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Page history">
      <button type="button" className={cls} disabled={!canBack} onClick={onBack} title="Back" aria-label="Back"><ArrowLeft size={16} /></button>
      <button type="button" className={cls} disabled={!canForward} onClick={onForward} title="Forward" aria-label="Forward"><ArrowRight size={16} /></button>
    </div>
  );
}
function LimitsView({ data, accent, act, busy, onChat, reload, tick = 0, sticky = 0, onPage, setData, onOpenTask, leaveGuard }) {
  /* Projects are pages. The list of projects is one page, a project's
     dashboard is another, and so is each tab of its work setup. `trail` is the
     history that Back and Forward walk; choosing something new drops whatever
     lay ahead, as a browser does. */
  const [trail, setTrail] = useState({ list: [{ pid: "", tab: "settings" }], at: 0 });
  const here = trail.list[trail.at], pid = here.pid;
  const project = pid ? data.projects.find((p) => p.id === pid) || null : null;
  const setupTab = here.tab;
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [detail, setDetail] = useState(null);
  const [find, setFind] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);     // { error } while a hand-made project's details are being changed
  const [copying, setCopying] = useState(null);     // { fromId, parts, error, done } while settings are being copied from another project
  const topRef = useRef(null), firstPage = useRef(true), seenTick = useRef(tick);
  const logoSrc = React.useContext(LogoCtx)[pid]?.src || "";
  const pc = useProjectChat(project && project.id !== "_agency" ? project.id : "");
  const fromServer = (p) => ({ enabled: p.setting.enabled, tokensPerMonth: p.setting.tokensPerMonth, tokensPerDay: p.setting.tokensPerDay, seoUsdPerMonth: p.setting.seoUsdPerMonth ?? 5, triggers: { rankDrop: false, rankDropBy: 5, siteDown: false, ...(p.setting.triggers || {}) }, channels: p.setting.channels, rules: p.setting.rules, tasks: Object.fromEntries(Object.entries(p.tasks).map(([k, t]) => [k, { mode: t.mode, max: t.max, per: t.per, auto: t.auto, everyDays: t.everyDays, approval: t.approval, model: t.model }])) });
  /* keep the form in step with the server unless there are unsaved edits */
  const sig = project ? JSON.stringify(fromServer(project)) : "";
  useEffect(() => { if (project && !dirty) setDraft(fromServer(project)); }, [sig, pid, dirty]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setDetail(null); if (pid) api("project", { projectId: pid }).then(setDetail).catch(() => {}); }, [pid]);
  const inside = !!project;
  useEffect(() => { onPage?.(inside); return () => onPage?.(false); }, [inside]);   // eslint-disable-line react-hooks/exhaustive-deps
  /* a new page starts at its top, like a page that was just opened */
  useEffect(() => { if (firstPage.current) { firstPage.current = false; return; } topRef.current?.scrollIntoView({ block: "start" }); }, [pid]);

  /* leaving a project with unsaved changes asks first; moving between the tabs of one project keeps them */
  const mayLeave = async (nextPid) => nextPid === pid || !dirty || (await askConfirm({ title: "Leave without saving?", message: `${project ? project.name : "This project"} has unsaved changes. They will be lost.`, confirmLabel: "Leave without saving", danger: true }));
  const arrive = (nextPid) => { if (nextPid !== pid) { setDirty(false); setDraft(null); } };
  useEffect(() => { if (!leaveGuard) return undefined; leaveGuard.current = () => mayLeave("\u0000another tab"); return () => { leaveGuard.current = null; }; });
  const go = async (next) => {
    if (next.pid === pid && next.tab === setupTab) return;
    if (!(await mayLeave(next.pid))) return;
    arrive(next.pid);
    setTrail((t) => { const list = [...t.list.slice(0, t.at + 1), next].slice(-60); return { list, at: list.length - 1 }; });
  };
  const step = async (by) => {
    const next = trail.list[trail.at + by];
    if (!next || !(await mayLeave(next.pid))) return;
    arrive(next.pid);
    setTrail((t) => ({ ...t, at: Math.min(t.list.length - 1, Math.max(0, t.at + by)) }));
  };
  const nav = <PageNav canBack={trail.at > 0} canForward={trail.at < trail.list.length - 1} onBack={() => step(-1)} onForward={() => step(1)} />;
  /* in the agent's application, pressing Projects in the sidebar again goes back to the list of projects */
  useEffect(() => { if (tick === seenTick.current) return; seenTick.current = tick; if (pid) go({ pid: "", tab: "settings" }); }, [tick]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- the list of projects ---- */
  if (!project) {
    const q = find.trim().toLowerCase();
    const shown = data.projects.filter((p) => !q || p.name.toLowerCase().includes(q) || (p.client || "").toLowerCase().includes(q));
    const on = data.projects.filter((p) => p.id !== "_agency" && p.setting.enabled).length;
    return (
      <div className="space-y-4" ref={topRef} style={{ scrollMarginTop: 16 }}>
        <div className="flex flex-wrap items-center gap-3">
          {nav}
          <div className="min-w-[200px] flex-1"><div className="text-[15px] font-semibold text-gray-900">Projects</div><div className="text-[11.5px] text-gray-500">Choose a project to open its dashboard. The agent is switched on for {on} of {data.projects.length - 1}.</div></div>
          {data.projects.length > 8 && <input className={inputCls + " max-w-[240px]"} placeholder="Find a project or client" value={find} onChange={(e) => setFind(e.target.value)} aria-label="Find a project" />}
          <Btn accent={accent} onClick={() => setAdding(true)}><Plus size={14} /> Add project</Btn>
        </div>
        {data.projects.length <= 1 && (
          <Card className="px-5 py-8 text-center">
            <div className="text-[14px] font-semibold text-gray-900">No project is on the agent's list yet</div>
            <div className="mx-auto mt-1 max-w-[520px] text-[12.5px] leading-relaxed text-gray-500">The agent only works on the projects you put here. Import the ones you want from the CRM, or add a business by hand if it is not in the CRM.</div>
            <div className="mt-4 flex justify-center"><Btn accent={accent} onClick={() => setAdding(true)}><Plus size={14} /> Add your first project</Btn></div>
          </Card>
        )}
        {adding && <AddProjectModal accent={accent} setData={setData} onClose={() => setAdding(false)} onAdded={(ids) => { setAdding(false); if (ids.length === 1) go({ pid: ids[0], tab: "settings" }); }} />}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => {
            const agency = p.id === "_agency", cap = p.setting.tokensPerMonth, pct = cap > 0 ? Math.min(100, Math.round((p.usage.month / cap) * 100)) : 0;
            const toApprove = data.tasks.filter((t) => t.projectId === p.id && t.status === "needs_approval").length;
            const running = data.tasks.find((t) => t.projectId === p.id && t.status === "running");
            return (
              <button key={p.id} type="button" onClick={() => go({ pid: p.id, tab: "settings" })} className="group rounded-2xl border border-gray-200 bg-white p-4 text-left transition-shadow hover:border-gray-300 hover:shadow-md">
                <div className="flex items-start gap-2.5">
                  <ProjectLogo project={p} size={40} dot={p.setting.enabled} />
                  <span className="min-w-0 flex-1 self-center"><span className="block truncate text-[14px] font-semibold text-gray-900">{p.name}</span><span className="block truncate text-[11.5px] text-gray-500">{agency ? "Agency-level tasks, such as prospect audits" : p.client || "No client name"}</span></span>
                  <ChevronRight size={18} className="mt-0.5 shrink-0 text-gray-300 group-hover:text-gray-500" />
                </div>
                <div className="mt-3 text-[12px] text-gray-700">{p.setting.enabled ? <><b>{fmtTok(p.usage.month)}</b>{cap ? ` of ${fmtTok(cap)}` : ""} tokens this month</> : <span className="text-gray-400">The agent is not switched on for this project</span>}</div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">{cap > 0 && p.setting.enabled && <div className="h-full rounded-full" style={{ width: pct + "%", background: pct >= 100 ? "#DC2626" : pct >= 80 ? "#D97706" : accent }} />}</div>
                <div className="mt-3 flex min-h-[22px] flex-wrap items-center gap-1.5">
                  {running && <Chip fg="#15803D" bg="#DCFCE7">Working now</Chip>}
                  {toApprove > 0 && <Chip fg="#B45309" bg="#FEF3C7">{toApprove} to approve</Chip>}
                  {p.waiting > 0 && <Chip fg="#1D4ED8" bg="#DBEAFE">{p.waiting} waiting</Chip>}
                  {!agency && p.learning?.lessons > 0 && <Chip>{p.learning.lessons} lesson{p.learning.lessons === 1 ? "" : "s"}</Chip>}
                  {!agency && p.brand?.source === "agent" && <Chip>Brand voice set</Chip>}
                  {p.manual && <Chip fg="#6D28D9" bg="#EDE9FE">Not in the CRM</Chip>}
                  {!running && !toApprove && !p.waiting && !(p.learning?.lessons > 0) && p.brand?.source !== "agent" && !p.manual && <span className="text-[11px] text-gray-400">{p.setting.enabled ? "Nothing waiting" : "Open to set it up"}</span>}
                </div>
              </button>
            );
          })}
          {!shown.length && <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-[12.5px] text-gray-400 sm:col-span-2 xl:col-span-3">No project matches "{find}".</div>}
        </div>
      </div>
    );
  }
  if (!draft) return <div ref={topRef} />;

  const set = (patch) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); };
  const setTask = (key, patch) => { setDraft((d) => ({ ...d, tasks: { ...d.tasks, [key]: { ...d.tasks[key], ...patch } } })); setDirty(true); };
  const setSetupTab = (tab) => go({ pid, tab });
  const save = async () => { const o = await act("config", { projectId: project.id, ...draft, seoUsdPerMonth: +draft.seoUsdPerMonth || 0 }); if (o) setDirty(false); };
  const recommended = () => {
    const tasks = { ...draft.tasks };
    for (const c of data.catalog) if (tasks[c.key]) tasks[c.key] = { ...tasks[c.key], mode: c.defaults.mode, max: c.defaults.max, per: c.defaults.per, everyDays: c.defaults.everyDays, auto: !!(c.defaults.auto || c.defaults.recAuto) && c.defaults.mode !== "off" };
    set({ tasks });
  };
  const u = project.usage, cap = draft.tokensPerMonth;
  const pct = cap > 0 ? Math.min(100, Math.round((u.month / cap) * 100)) : 0;

  const others = data.projects.filter((p) => p.id !== project.id);
  const removeProject = async () => {
    if (!(await askConfirm({ title: `Take ${project.name} off the agent's list?`, message: "The agent stops working on it and its waiting tasks are cancelled. Its settings, chat, brand voice and lessons are kept, and come back if you add the project again." + (project.manual ? " Because it was added by hand, it can only be added again by typing it in." : " Nothing changes in the CRM."), confirmLabel: "Take it off the list", danger: true }))) return;
    const o = await act("roster", { action: "remove", id: project.id });
    if (o) { setDirty(false); setTrail({ list: [{ pid: "", tab: "settings" }], at: 0 }); }
  };
  return (
    <div ref={topRef} style={{ scrollMarginTop: 16 }}>
      {/* in the agent's application the bar stays in view while the page scrolls; `sticky` is the scrolling area's top padding, so the bar sits flush with its edge and nothing shows above it */}
      <div className={"mb-4 flex flex-wrap items-center gap-3 border border-gray-200 bg-white px-3 py-2.5 shadow-sm " + (sticky ? "sticky z-20 rounded-b-2xl border-t-0" : "rounded-2xl")} style={sticky ? { top: -sticky } : undefined}>
        {nav}
        <div role="navigation" className="flex min-w-[200px] flex-1 items-center gap-1.5 text-[13px]" aria-label="Where you are">
          <button type="button" className="shrink-0 rounded-md px-1.5 py-1 font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900" onClick={() => go({ pid: "", tab: "settings" })}>Projects</button>
          <ChevronRight size={14} className="shrink-0 text-gray-300" />
          <ProjectLogo project={project} size={26} dot={draft.enabled} />
          <span className="ml-1 min-w-0 truncate font-semibold text-gray-900">{project.name}</span>
          {dirty && <Chip fg="#B45309" bg="#FEF3C7">Unsaved changes</Chip>}
        </div>
        {others.length > 0 && (
          <select aria-label="Open another project" className={inputCls + " max-w-[220px]"} value="" onChange={(e) => { if (e.target.value) go({ pid: e.target.value, tab: "settings" }); }}>
            <option value="">Open another project…</option>{others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      <div className="space-y-4">
        {project.id !== "_agency" && (
          <div className="grid items-start gap-4 xl:grid-cols-[348px_minmax(0,1fr)]">
            <PhoneChat c={pc} project={project} accent={accent} />
            <div className="space-y-4">
              <DirectionsCard c={pc} project={project} accent={accent} />
              <Card className="p-4 text-[12px] leading-5 text-gray-600">
                <div className="mb-1 text-[13.5px] font-semibold text-gray-900">How the agent remembers this project</div>
                <div><b>The chat</b>: every message is kept ({pc.chat ? pc.chat.total : 0} so far). The agent sees the recent ones and looks up older ones when it needs them.</div>
                <div><b>Directions</b>: standing instructions it follows in every task and answer.</div>
                <div><b>Notes and the change journal</b>: facts it saved and changes that were made (below).</div>
              </Card>
            </div>
          </div>
        )}
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <ProjectLogo project={project} size={48} />
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold text-gray-900">{project.name}</div>
                <div className="text-[11.5px] text-gray-500">{project.client || "Agency-level tasks"}{project.demo ? " · demo data (the agent says so in its reports)" : ""}</div>
              </div>
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
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Labeled label="Live SEO data: spend limit per month, in $ (0 = none)">
              <input className={inputCls} inputMode="decimal" aria-label="DataForSEO spend limit per month in dollars" value={draft.seoUsdPerMonth} onChange={(e) => set({ seoUsdPerMonth: e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 8) })} />
            </Labeled>
            <div className="sm:col-span-2">
              <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-gray-400">DataForSEO this month</div>
              <div className="text-[13px] text-gray-800"><b>{usd4(u.seo?.usd || 0)}</b> of {usd(+draft.seoUsdPerMonth || 0)} in {u.seo?.calls || 0} request{(u.seo?.calls || 0) === 1 ? "" : "s"}</div>
              <div className="mt-1 text-[11px] text-gray-400">{data.seoData?.enabled ? "Live search results, keyword volumes, competitor and backlink data, billed by DataForSEO per request. At the limit the agent carries on without it until next month." : "Switched off for the company, so the agent makes no paid request. It is switched on under API setup."}</div>
            </div>
          </div>
          {project.id !== "_agency" && draft.triggers && (
            <div className="mt-4 rounded-lg border border-gray-200 p-3">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Start work by itself when something happens</div>
              <div className="mt-2 space-y-2 text-[12.5px] text-gray-700">
                <label className="flex flex-wrap items-center gap-2">
                  <Switch on={!!draft.triggers.rankDrop} label="Queue a rank-drop diagnosis when a keyword falls" onChange={(v) => set({ triggers: { ...draft.triggers, rankDrop: v } })} />
                  a tracked keyword that was in the top 20 falls by
                  <input className={numCls + " w-14"} inputMode="numeric" aria-label="Positions a keyword has to fall" value={draft.triggers.rankDropBy} onChange={(e) => set({ triggers: { ...draft.triggers, rankDropBy: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) } })} />
                  positions or more in a scan: queue a rank-drop diagnosis that names it
                </label>
                <label className="flex flex-wrap items-center gap-2">
                  <Switch on={!!draft.triggers.siteDown} label="Check that the website answers" onChange={(v) => set({ triggers: { ...draft.triggers, siteDown: v } })} />
                  the website stops answering (the CRM asks for the home page every 15 minutes, no tokens): raise an alert and queue a site health check
                </label>
              </div>
              <div className="mt-2 text-[11px] leading-5 text-gray-400">{project.demo && draft.triggers.rankDrop ? "This project is on demo data, so the keyword trigger does nothing until it tracks real rankings. " : ""}Both stay inside the working limits of Rank-drop diagnosis and Site health check below, and wait while those are switched off. The website is the address under Work setup, Settings.</div>
            </div>
          )}
          {project.id !== "_agency" && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-[11.5px] text-gray-600">
              <span className="min-w-[200px] flex-1">{project.manual ? <>Added by hand: this project is not in the CRM, so it has no rank tracking, Search Console data or reports.{project.website ? ` Website: ${project.website}` : ""}</> : "Imported from the CRM: its name, logo, rankings and data come from the project there."}</span>
              {project.manual && <Btn ghost onClick={() => setEditing({ error: "" })}><PencilLine size={13} /> Edit details</Btn>}
              <Btn ghost danger disabled={busy} onClick={removeProject} title="Takes the project off the agent's list. Its settings, chat, brand voice and lessons are kept and come back if you add it again."><Trash2 size={13} /> Take off the agent's list</Btn>
            </div>
          )}
          {copying && (
            <Modal title={`Copy settings to ${project.name}`} sub="Set this project up the way another one is set up. Only how the agent works is copied, never what belongs to the client." onClose={() => setCopying(null)}>
              {copying.done ? (
                <>
                  <div className="rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800" role="status">Copied: {copying.done.join("; ")}.</div>
                  <div className="mt-2 text-[12px] leading-5 text-gray-600">Still to do for {project.name}: its website address, Business Profile, social profiles and their Chrome IDs (Settings and Business Profile tabs), its brand voice, and its resources. The agent stays switched {draft?.enabled ? "on" : "off"} for this project as it was.</div>
                  <div className="mt-3"><Btn accent={accent} onClick={() => setCopying(null)}>Done</Btn></div>
                </>
              ) : (
                <>
                  <Labeled label="Copy from">
                    <select className={inputCls} value={copying.fromId} onChange={(e) => setCopying({ ...copying, fromId: e.target.value, error: "" })}><option value="">Choose a project…</option>{data.projects.filter((x) => x.id !== project.id && x.id !== "_agency").map((x) => <option key={x.id} value={x.id}>{x.name}{x.client ? ` (${x.client})` : ""}</option>)}</select>
                  </Labeled>
                  <div className="mt-3 text-[9px] font-semibold uppercase tracking-wider text-gray-400">What to copy</div>
                  <div className="mt-1 space-y-1.5">
                    {[["limits", "Working limits and schedules of every task type", "Which task types are on, how often, whether they start by themselves, and how each asks for approval."], ["rules", "On-page, off-page and social rules with their notes", "Not the protected pages and not the name outreach is signed with: those stay this project's own."], ["profileRules", "Business Profile rules", "What may be changed on the profile, with the note beside each rule."], ["websiteNotes", "Website notes", "The list of notes about the website. Check them afterwards: some may be about the other site only."], ["smm", "SMM management software", "The tool, its address and Chrome ID. Not the client's workspace name."], ["budget", "Token and spend limits, and the triggers", "Monthly and daily token limits, the DataForSEO spend limit, what starts work by itself."], ["directions", "Directions for the agent", "The standing directions you gave for the other project. Off by default: they are often about that one client."]].map(([k, label, hint]) => (
                      <label key={k} className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 px-2.5 py-2">
                        <input type="checkbox" className="mt-0.5" checked={copying.parts.includes(k)} onChange={(e) => setCopying({ ...copying, parts: e.target.checked ? [...copying.parts, k] : copying.parts.filter((x) => x !== k) })} />
                        <span><span className="block text-[12.5px] font-medium text-gray-900">{label}</span><span className="block text-[11.5px] text-gray-500">{hint}</span></span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-[11.5px] leading-5 text-gray-600"><b>Never copied:</b> the website address, Business Profiles, social profile links, Search Console and Analytics, the Chrome IDs chosen for them, brand voice, resources and photos, the code repository, what the agent knows about the client, its lessons and its reports. What this project has now in the parts you tick is replaced.</div>
                  {copying.error && <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-800" role="alert">{copying.error}</div>}
                  <div className="mt-3 flex gap-2"><Btn accent={accent} disabled={busy || !copying.fromId || !copying.parts.length} onClick={async () => { try { const o = await api("project/copy", { fromId: copying.fromId, toId: project.id, parts: copying.parts }); setDirty(false); setData(o); setCopying({ ...copying, done: o.copied || [] }); } catch (e) { setCopying({ ...copying, error: String(e.message || e) }); } }}><Copy size={13} /> Copy to {project.name}</Btn><Btn ghost onClick={() => setCopying(null)}>Cancel</Btn></div>
                </>
              )}
            </Modal>
          )}
          {editing && (
            <Modal title={`Edit ${project.name}`} sub="Details of a project that was added by hand." onClose={() => setEditing(null)} wide>
              <ManualProjectForm accent={accent} busy={busy} error={editing.error} saveLabel="Save details" initial={{ name: project.name, client: project.client, website: project.website, accent: project.accent, logo: logoSrc || null }} onCancel={() => setEditing(null)}
                onSave={async (f) => { try { setData(await api("roster", { action: "update", id: project.id, ...f })); setEditing(null); } catch (e) { setEditing({ error: String(e.message || e) }); } }} />
            </Modal>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Btn accent={accent} onClick={save} disabled={!dirty || busy}><Check size={13} /> Save changes</Btn>
            {dirty && <Btn ghost onClick={() => setDirty(false)}>Discard</Btn>}
            {project.id !== "_agency" && <Btn ghost onClick={recommended} title="Sets every task type to its recommended limit and schedule. Nothing is saved until you press Save.">Use the recommended schedule</Btn>}
            {project.id !== "_agency" && <Btn ghost disabled={dirty || busy} title={dirty ? "Save or discard your changes first." : "Sets this project up the way another one is set up."} onClick={() => setCopying({ fromId: "", parts: ["limits", "rules", "profileRules", "websiteNotes", "smm", "budget"], error: "", done: null })}><Copy size={13} /> Copy settings from another project</Btn>}
            {project.id !== "_agency" && <Btn ghost onClick={() => onChat(project.id)}><MessageSquare size={13} /> Open the chat full width</Btn>}
            {dirty && <span className="text-[11.5px] text-amber-700">Unsaved changes</span>}
          </div>
        </Card>

        <WorkSetup data={data} project={project} draft={draft} set={set} setTask={setTask} accent={accent} tab={project.id === "_agency" ? "settings" : setupTab} setTab={setSetupTab} dirty={dirty} busy={busy} reload={reload} onOpenTask={onOpenTask}
          onCheck={(key) => act("check", { projectId: project.id, ...(key ? { key } : {}) })} />
        <div className={"flex flex-wrap items-center gap-2" + (["brand", "experience", "report"].includes(setupTab) && !dirty && project.id !== "_agency" ? " hidden" : "")}>
          <Btn accent={accent} onClick={save} disabled={!dirty || busy}><Check size={13} /> Save changes</Btn>
          {dirty && <Btn ghost onClick={() => setDirty(false)}>Discard</Btn>}
          {dirty && <span className="text-[11.5px] text-amber-700">Unsaved changes in the work setup</span>}
        </div>

        {project.id !== "_agency" && <ProjectMemory key={project.id} project={project} detail={detail} setDetail={setDetail} accent={accent} />}
      </div>
    </div>
  );
}

/* ---------------- work setup: channels, Chrome IDs, and the tasks and rules of each area ---------------- */
const NEEDS_LABEL = { web: "Web research", google: "Google browser", browser: "Browser" };
function TaskRow({ c, t, used, accent, models, agency, onChange, chan }) {
  return (
    <div className="border-t border-gray-100 px-4 py-3 first:border-t-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-gray-900">{c.label}
          {!c.channel && c.needs.filter((n) => n === "web").map((n) => <Chip key={n} fg="#4B5563" bg="#F3F4F6">{NEEDS_LABEL[n]}</Chip>)}
          {chan && <Chip fg={chan.ok ? "#15803D" : "#B45309"} bg={chan.ok ? "#DCFCE7" : "#FEF3C7"}>{chan.text}</Chip>}
          {c.write && <Chip fg="#B91C1C" bg="#FEE2E2">Changes live data</Chip>}
        </div>
        <div className="text-[11.5px] text-gray-500">{c.desc}</div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex rounded-lg border border-gray-200 p-0.5" role="group" aria-label={`Working limit for ${c.label}`}>
          {["off", "limited", "open"].map((m) => (
            <button key={m} type="button" onClick={() => onChange({ mode: m })} className="rounded-md px-2.5 py-1 text-[12px] font-semibold capitalize"
              style={t.mode === m ? { background: m === "off" ? "#6B7280" : m === "open" ? "#16A34A" : accent, color: "#fff" } : { color: "#4B5563" }}>{m}</button>
          ))}
        </div>
        {t.mode === "limited" && (
          <span className="flex items-center gap-1 text-[12px] text-gray-600">
            <input aria-label="Maximum runs" className={numCls + " w-14"} inputMode="numeric" value={t.max} onChange={(e) => { const d = e.target.value.replace(/[^0-9]/g, "").slice(0, 3); onChange({ max: d === "" ? "" : Math.max(1, +d) }); }} onBlur={() => { if (t.max === "") onChange({ max: 1 }); }} /> per
            <select aria-label="Period" className={selCls} value={t.per} onChange={(e) => onChange({ per: e.target.value })}><option value="day">day</option><option value="week">week</option><option value="month">month</option></select>
            <span className="text-[11px] text-gray-400">{used} used</span>
          </span>
        )}
        {t.mode !== "off" && !agency && (
          <label className="flex items-center gap-1.5 text-[12px] text-gray-600" title="The agent queues this task by itself on this schedule.">
            <input type="checkbox" checked={!!t.auto} onChange={(e) => onChange({ auto: e.target.checked })} /> starts by itself
            {t.auto && <>, every <input aria-label="Days between runs" className={numCls + " w-12"} inputMode="numeric" value={t.everyDays} onChange={(e) => { const d = e.target.value.replace(/[^0-9]/g, "").slice(0, 2); onChange({ everyDays: d === "" ? "" : Math.max(1, +d) }); }} onBlur={() => { if (t.everyDays === "") onChange({ everyDays: 1 }); }} /> d</>}
          </label>
        )}
        {t.mode !== "off" && c.write && (
          <select aria-label="Approval" className={selCls} value={t.approval} onChange={(e) => onChange({ approval: e.target.value })}
            title={SECOND_CHECK ? "Ask first: the agent prepares the change and waits for your approval. Act after a second check: an independent check reads the exact plan; if it passes the agent carries it out, if not the plan comes to you." : "Ask first: the agent prepares the change and waits for your approval. The second check is switched off (API setup), so acting alone means with no check at all."}>
            <option value="ask">Ask before changing</option>
            <option value="auto">{SECOND_CHECK ? "Act after a second check" : "Act without asking"}</option>
            {c.key === "gbp_review_reply" && <option value="auto_positive">{SECOND_CHECK ? "4 and 5 star reviews after a second check, ask for the rest" : "4 and 5 star reviews without asking, ask for the rest"}</option>}
          </select>
        )}
        {t.mode !== "off" && (
          <select aria-label="Model" className={selCls} value={t.model || ""} onChange={(e) => onChange({ model: e.target.value })}>
            <option value="">Default model</option>{models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}
/* which signed-in Chrome on the agent's computer a channel uses */
function ChromeSelect({ value, onChange, profiles, label }) {
  const known = profiles.some((p) => p.id === value);
  return (
    <select aria-label={label || "Chrome ID"} className={inputCls} value={value || ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">No Chrome ID chosen</option>
      {profiles.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.name}{p.device ? ` (${p.device})` : ""}</option>)}
      {value && !known && <option value={value}>{value} (not on any device now)</option>}
    </select>
  );
}
const Tile = ({ icon: Icon, title, sub, accent, right, children }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-3.5">
    <div className="flex items-start gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: accent + "14", color: accent }}><Icon size={16} /></span>
      <div className="min-w-0 flex-1"><div className="text-[13px] font-semibold text-gray-900">{title}</div>{sub && <div className="text-[11.5px] text-gray-500">{sub}</div>}</div>
      {right}
    </div>
    {children && <div className="mt-3">{children}</div>}
  </div>
);
/* one rule per kind of change on a Google Business Profile (the same list the server keeps) */
const GBP_PARTS = [["name", "Business name", "The name shown on Google. A change can trigger Google's re-verification."], ["address", "Address and service area", "Street address, or the areas served."], ["phone", "Phone number", "Primary and additional numbers."],
  ["website", "Website address and booking links", "The website link, appointment and menu links."], ["hours", "Business hours", "The regular opening hours."], ["specialHours", "Special hours (holidays)", "Hours for holidays and one-off days."],
  ["categories", "Categories", "Primary and additional categories."], ["description", "Business description", "The 750-character \"From the business\" text."], ["services", "Services and their descriptions", "Adding services, and writing or changing their descriptions."],
  ["products", "Products", "Adding products with name, description and photo."], ["photos", "Photos and videos", "Adding pictures to the profile (taken from the project's Resources)."], ["posts", "Posts", "Publishing updates, offers and events."],
  ["reviews", "Review replies", "Answering customer reviews."], ["qa", "Questions and answers", "Answering questions asked on the profile."], ["attributes", "Attributes", "Payment methods, accessibility, amenities and the like."]];
const GBP_START = { name: "never", address: "never", phone: "never", categories: "never", website: "ask", hours: "ask", specialHours: "ask" };
const GBP_MODES = [["never", "Not allowed", "#B91C1C", "#FEE2E2"], ["ask", "Only with my approval", "#92400E", "#FEF3C7"], ["allowed", "Allowed", "#15803D", "#DCFCE7"]];
const Ready = ({ ok, yes = "Ready", no = "Not set up" }) => <Chip fg={ok ? "#15803D" : "#B45309"} bg={ok ? "#DCFCE7" : "#FEF3C7"}>{ok ? yes : no}</Chip>;
const txtCls = inputCls + " min-h-[64px] resize-y";
const numOnly = (v) => +String(v).replace(/[^0-9]/g, "") || 0;
function WorkSetup({ data, project, draft, set, setTask, accent, tab, setTab, dirty, busy, reload, onCheck, onOpenTask }) {
  const [brandNow, setBrandNow] = useState(null);   // counts after a change in the Brand voice tab, until the next refresh brings them
  const agency = project.id === "_agency";
  const profiles = data.devices.flatMap((d) => (d.profiles || []).map((p) => ({ ...p, device: d.name })));
  const ch = draft.channels, rules = draft.rules;
  const setCh = (patch) => set({ channels: { ...ch, ...patch } });
  const setOne = (key, patch) => setCh({ [key]: { ...ch[key], ...patch } });
  const setRow = (key, i, patch) => setCh({ [key]: ch[key].map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  const delRow = (key, i) => setCh({ [key]: ch[key].filter((_, k) => k !== i) });
  const setRule = (area, patch) => set({ rules: { ...rules, [area]: { ...rules[area], ...patch } } });
  const smm = ch.smm || {};
  const setSmm = (patch) => setCh({ smm: { on: false, name: "", url: "", browser: "", workspace: "", notes: "", ...smm, ...patch } });
  const onProfile = (c) => c.channel === "gbp";
  const tasksOf = (area) => data.catalog.filter((c) => (area === "gbp" ? onProfile(c) : c.area === area && !onProfile(c)) && draft.tasks[c.key]);
  const gr = { parts: {}, reviewReplies: "all", postsPerWeek: 1, notes: "", ...(rules.gbp || {}) };
  const partOf = (k) => ({ mode: GBP_START[k] || "allowed", note: "", ...(gr.parts[k] || {}) });
  const setPart = (k, patch) => setRule("gbp", { ...gr, parts: { ...gr.parts, [k]: { ...partOf(k), ...patch } } });
  const partCount = (m) => GBP_PARTS.filter(([k]) => partOf(k).mode === m).length;
  const onCount = (area) => tasksOf(area).filter((c) => draft.tasks[c.key].mode !== "off").length;
  const chanState = (c) => {
    if (!c.channel) return null;
    const pick = c.channel === "gbp" ? { has: ch.gbp.length > 0, id: ch.gbp.find((x) => x.browser)?.browser, name: "Business Profile" }
      : c.channel === "social" ? { has: ch.social.length > 0, id: ch.social.find((x) => x.browser)?.browser, name: "social profile" }
      : c.channel === "website" ? { has: !!ch.website.url, id: ch.website.browser, name: "website" }
      : { has: true, id: ch[c.channel].browser, name: c.channel === "gsc" ? "Search Console" : "Analytics" };
    if (!pick.has) return { ok: false, text: `Add the ${pick.name} first` };
    if (!pick.id) return { ok: false, text: "Needs a Chrome ID" };
    return profiles.some((p) => p.id === pick.id) ? { ok: true, text: `Works in ${pick.id}` } : { ok: false, text: `${pick.id} is not on a device` };
  };
  /* a plain function, not a component: a component declared here would be re-created on every keystroke and lose input focus */
  const taskList = (area, title, hint) => (
    <Card className="overflow-hidden">
      <div className="border-b border-gray-100 px-4 py-3">
        <div className="text-[13.5px] font-semibold text-gray-900">{title}</div>
        <div className="text-[11.5px] text-gray-500">{hint || <><b>Off</b>: never. <b>Limited</b>: at most the number you set. <b>Open</b>: no limit, and the agent may start it when it judges it is needed. Every task still stops at the token limit.</>}</div>
      </div>
      {tasksOf(area).map((c) => <TaskRow key={c.key} c={c} t={draft.tasks[c.key]} used={project.tasks[c.key]?.used || 0} accent={accent} models={data.models} agency={agency} chan={chanState(c)} onChange={(patch) => setTask(c.key, patch)} />)}
    </Card>
  );
  /* while a sign-in check is running on the device, look for its answer every few seconds */
  const checks = project.setting.checks || {};
  const checking = Object.values(checks).some((c) => c.state === "checking");
  useEffect(() => { if (!checking || !reload) return undefined; const t = setInterval(reload, 3000); return () => clearInterval(t); }, [checking, reload]);
  if (agency) return taskList("agency", "Agency tasks");
  const api = project.api || {};
  const CHECK_TEXT = { ok: ["#15803D", "#DCFCE7", "Signed in"], signin: ["#B45309", "#FEF3C7", "A person has to sign in"], error: ["#B91C1C", "#FEE2E2", "Could not be opened"], checking: ["#1D4ED8", "#DBEAFE", "Checking now"], noanswer: ["#6B7280", "#F3F4F6", "No answer from the device"], nodevice: ["#B45309", "#FEF3C7", "No device has this Chrome ID"] };
  /* a plain function for the same reason as taskList: the line under a channel that says whether its Chrome ID is really signed in */
  const checkLine = (key, chromeId, canCheck = true) => {
    const c = key ? checks[key] : null, [fg, bg, label] = CHECK_TEXT[c?.state] || [];
    const why = !chromeId ? "Choose a Chrome ID first." : !key ? "Save the changes first." : dirty ? "Save the changes first." : !canCheck ? "This platform cannot be checked automatically." : "";
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-white/60 text-[11.5px] text-gray-600">
        <Btn ghost disabled={!!why || busy || c?.state === "checking"} onClick={() => onCheck(key)} title={why || "Opens this Chrome ID on the agent's computer and looks whether it is signed in. Nothing is clicked or typed, and no tokens are used."}><ShieldCheck size={13} /> Check sign-in</Btn>
        {c?.state ? <Chip fg={fg} bg={bg}>{label}</Chip> : <span className="text-gray-400">{why || "Not checked yet"}</span>}
        {c?.state && c.state !== "checking" && <span className="text-gray-500">{c.state === "signin" ? "Open the agent application, Settings, Chrome IDs, and press Sign in. " : c.state === "error" || c.state === "nodevice" ? c.detail + " " : c.state === "noanswer" ? "Is the agent application running? " : ""}{c.at ? `Checked ${relTime(c.at)}` : ""}{c.device ? ` on ${c.device}` : ""}.</span>}
        {c?.state === "checking" && <span className="text-gray-500">Chrome is opening on the agent's computer.</span>}
      </div>
    );
  };
  const channelCount = (ch.website.url ? 1 : 0) + ch.gbp.length + (ch.gsc.property || api.searchConsole ? 1 : 0) + (ch.ga4.property || api.analytics ? 1 : 0);
  const TABS = [["settings", "Settings", Settings2, `${channelCount} channel${channelCount === 1 ? "" : "s"} · ${profiles.length} Chrome ID${profiles.length === 1 ? "" : "s"}`], ["brand", "Brand voice", Mic, brandCaption(brandNow?.pid === project.id ? brandNow : project.brand)],
    ["resources", "Resources", FolderInput, `${project.resources || 0} photo and media source${project.resources === 1 ? "" : "s"}${project.repo ? " · code repository" : ""}`],
    ["gbp", "Business Profile", Store, `${ch.gbp.length} profile${ch.gbp.length === 1 ? "" : "s"} · ${partCount("never")} kind${partCount("never") === 1 ? "" : "s"} of change not allowed`], ["onpage", "Onpage SEO", FileText, `${onCount("onpage")} of ${tasksOf("onpage").length} tasks on`],
    ["offpage", "Offpage SEO", MapPin, `${onCount("offpage")} of ${tasksOf("offpage").length} tasks on`], ["social", "Social Media", Share2, `${ch.social.length} profile${ch.social.length === 1 ? "" : "s"} · ${onCount("social")} of ${tasksOf("social").length} tasks on`],
    ["visibility", "AI search", Sparkles, project.visibility ? `named in ${project.visibility.share}% of ${project.visibility.asked} answers` : "not checked yet"],
    ["experience", "Experience", GraduationCap, `${project.learning?.lessons || 0} lesson${project.learning?.lessons === 1 ? "" : "s"} · ${project.learning?.done || 0} task${project.learning?.done === 1 ? "" : "s"} done`],
    ["report", "Report", ClipboardList, `${project.workItems || 0} thing${project.workItems === 1 ? "" : "s"} done`]];
  const gbpOk = ch.gbp.some((x) => x.browser && profiles.some((p) => p.id === x.browser));
  const online = data.devices.filter((d) => d.online);
  const gbpSigned = ch.gbp.some((g) => g.id && checks["gbp:" + g.id]?.state === "ok");
  const gbpTaskOn = tasksOf("gbp").some((c) => draft.tasks[c.key].mode !== "off");
  const LIVE = [
    [data.credentials.claude.set || project.ownKey?.set || data.devices.some((d) => d.localKey), "A Claude API key is set", "Add one under API setup."],
    [online.length > 0, online.length ? `${online[0].name} is online` : "The agent's computer is online", "Start the agent application on its computer."],
    [draft.enabled, "The agent is switched on for this project", "Switch on \"Agent works on this project\" above and save."],
    [gbpOk, "The Business Profile has a Chrome ID that a device has", "Add the profile below and choose its Chrome ID."],
    [gbpSigned, "That Chrome ID is signed in (checked)", "Press Check sign-in under the Business Profile."],
    [gbpTaskOn, "A Business Profile task is switched on", "Switch one on in the task list on this tab, for example the optimization audit."],
  ];
  const liveDone = LIVE.filter((r) => r[0]).length;
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-[13.5px] font-semibold text-gray-900">Work setup</div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          {TABS.map(([k, label, Icon, sub]) => (
            <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} className="flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition-colors"
              style={tab === k ? { background: accent, borderColor: accent, color: "#fff" } : { background: "#fff", borderColor: "#E5E7EB", color: "#111827" }}>
              <Icon size={18} className="shrink-0" />
              <span className="min-w-0"><span className="block text-[13px] font-semibold">{label}</span><span className="block truncate text-[11px]" style={{ opacity: tab === k ? 0.8 : 0.55 }}>{sub}</span></span>
            </button>
          ))}
        </div>
      </div>

      {tab === "settings" && (
        <>
          <Card className="p-4">
            <div className="text-[13.5px] font-semibold text-gray-900">Working channels</div>
            <div className="mb-3 text-[11.5px] text-gray-500">Where the agent works for {project.name}, and which signed-in Chrome on its computer it uses for each. A Chrome ID is a separate Chrome profile you signed in to once; the agent never signs in itself and can only open that channel's own sites in it.</div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className={ch.website.cms === "github" || project.repo ? "lg:col-span-2" : ""}>
              <Tile icon={Globe} accent={accent} title="Website" sub="The site the agent audits and writes for." right={<Ready ok={!!ch.website.url} />}>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Labeled label="Website address"><input className={inputCls} placeholder="https://example.com" value={ch.website.url} onChange={(e) => setOne("website", { url: e.target.value })} /></Labeled>
                  <Labeled label="Built with"><select className={inputCls} value={ch.website.cms} onChange={(e) => setOne("website", { cms: e.target.value })}>{[["", "Not sure"], ["wordpress", "WordPress"], ["webflow", "Webflow"], ["shopify", "Shopify"], ["wix", "Wix"], ["squarespace", "Squarespace"], ["github", "GitHub repository (custom code)"], ["custom", "Custom built"], ["other", "Other"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Labeled>
                  {ch.website.cms !== "github" && <Labeled label="Editor sign-in address (optional)"><input className={inputCls} placeholder="https://example.com/wp-admin" value={ch.website.adminUrl} onChange={(e) => setOne("website", { adminUrl: e.target.value })} /></Labeled>}
                  {ch.website.cms !== "github" && <Labeled label="Chrome ID signed in to the editor"><ChromeSelect profiles={profiles} value={ch.website.browser} onChange={(v) => setOne("website", { browser: v })} /></Labeled>}
                </div>
                {ch.website.cms === "github" && <div className="mt-2 text-[11.5px] leading-5 text-gray-500">A site built from code has no editor to sign in to. The agent changes it through its repository, set up below{dirty ? <>. Press <b>Save changes</b> to keep "GitHub repository" as what the site is built with</> : ""}.</div>}
                {(ch.website.cms === "github" || project.repo) && !agency && <RepoSetup key={"repo" + project.id} project={project} accent={accent} reload={reload} />}
                <div className="mt-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2"><div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Notes for the agent about this website ({(ch.website.notes || []).length})</div><div className="text-[11px] text-gray-400">One fact per note. As many as you need.</div></div>
                  {(ch.website.notes || []).map((n, i) => (
                    <div key={i} className="mt-1.5 flex items-start gap-2">
                      <textarea rows={1} className={inputCls + " min-h-[34px] resize-y leading-5"} aria-label={`Website note ${i + 1}`} maxLength={400} placeholder="For example: blog posts live under /news/" value={n} onChange={(e) => setOne("website", { notes: ch.website.notes.map((x, k) => (k === i ? e.target.value : x)) })} />
                      <Btn ghost danger onClick={() => setOne("website", { notes: ch.website.notes.filter((_, k) => k !== i) })} title="Remove this note"><Trash2 size={13} /></Btn>
                    </div>
                  ))}
                  <div className="mt-2"><Btn ghost disabled={(ch.website.notes || []).length >= 60} onClick={() => setOne("website", { notes: [...(ch.website.notes || []), ""] })}><Plus size={13} /> Add a note</Btn></div>
                </div>
                {ch.website.cms !== "github" && checkLine("website", ch.website.browser)}
              </Tile>
              </div>

              <Tile icon={Store} accent={accent} title="Google Business Profiles" sub="The profiles, their rules and their tasks have a tab of their own." right={<Ready ok={gbpOk} yes={`${ch.gbp.length} ready`} no={ch.gbp.length ? "Needs a Chrome ID" : "Not set up"} />}>
                <Btn ghost onClick={() => setTab("gbp")}><Store size={13} /> Open the Business Profile tab</Btn>
              </Tile>

              <Tile icon={Search} accent={accent} title="Google Search Console" sub={api.searchConsole ? `Data is read through the connected Google account: ${api.gscSite}` : "Not connected for data yet (Project settings, Data sources)."} right={<Ready ok={!!api.searchConsole} yes="Data connected" no="No data connection" />}>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Labeled label="Property"><input className={inputCls} placeholder="sc-domain:example.com" value={ch.gsc.property} onChange={(e) => setOne("gsc", { property: e.target.value })} /></Labeled>
                  <Labeled label="Chrome ID for browser tasks"><ChromeSelect profiles={profiles} value={ch.gsc.browser} onChange={(v) => setOne("gsc", { browser: v })} /></Labeled>
                </div>
                <div className="mt-1.5 text-[11px] text-gray-400">The Chrome ID is only needed to inspect URLs and request indexing in the browser.</div>
                {ch.gsc.browser && checkLine("gsc", ch.gsc.browser)}
              </Tile>

              <Tile icon={BarChart3} accent={accent} title="Google Analytics" sub={api.analytics ? `Data is read through the connected Google account: ${api.ga4Property}` : "Not connected for data yet (Project settings, Data sources)."} right={<Ready ok={!!api.analytics} yes="Data connected" no="No data connection" />}>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Labeled label="Property name or ID"><input className={inputCls} placeholder="GA4 · 123456789" value={ch.ga4.property} onChange={(e) => setOne("ga4", { property: e.target.value })} /></Labeled>
                  <Labeled label="Chrome ID signed in to it"><ChromeSelect profiles={profiles} value={ch.ga4.browser} onChange={(v) => setOne("ga4", { browser: v })} /></Labeled>
                </div>
                {ch.ga4.browser && checkLine("ga4", ch.ga4.browser)}
              </Tile>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-[13.5px] font-semibold text-gray-900"><Monitor size={15} style={{ color: accent }} /> Chrome IDs on the agent's computer</div>
            <div className="mb-2 text-[11.5px] text-gray-500">Create and sign in to them in the agent application, under Settings. One Chrome ID per Google account or social login keeps each client's work in its own signed-in session.</div>
            {!profiles.length && <div className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">No Chrome ID exists yet. Open the agent application on its computer, go to Settings, add a Chrome ID and sign in to the Google account there.</div>}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {profiles.map((p) => { const uses = [ch.website.browser === p.id && "Website", ch.gbp.some((x) => x.browser === p.id) && "Business Profile", ch.gsc.browser === p.id && "Search Console", ch.ga4.browser === p.id && "Analytics", ch.social.some((x) => x.browser === p.id) && "Social"].filter(Boolean);
                return <div key={p.id + p.device} className="rounded-lg border border-gray-200 px-3 py-2"><div className="flex items-center justify-between gap-2"><code className="rounded bg-gray-100 px-1.5 py-0.5 text-[12px] font-semibold text-gray-800">{p.id}</code><span className="text-[11px] text-gray-400">{p.device}</span></div><div className="mt-1 truncate text-[12.5px] text-gray-800">{p.name}</div><div className="text-[11px] text-gray-500">{uses.length ? "Used here for: " + uses.join(", ") : "Not used by this project"}</div></div>; })}
            </div>
          </Card>
          {taskList("general", "Monitoring and reporting")}
        </>
      )}

      {tab === "onpage" && (
        <>
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><div className="text-[13.5px] font-semibold text-gray-900">On-page rules and limits</div><div className="text-[11.5px] text-gray-500">These hold for every on-page task on {project.name}. The agent is told them at the start of each one.</div></div>
              <div className="flex flex-wrap gap-1.5"><Ready ok={!!ch.website.url} yes="Website set" no="Website not set" /><Ready ok={!!api.searchConsole} yes="Search Console data" no="No Search Console data" /></div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Labeled label="Changes on the live website"><select className={inputCls} value={rules.onpage.siteChanges} onChange={(e) => setRule("onpage", { siteChanges: e.target.value })}><option value="never">Never. Drafts and recommendations only</option><option value="approval">Only as a task I approve</option></select></Labeled>
              <Labeled label="Pages worked on per week, at most"><input className={inputCls} inputMode="numeric" value={rules.onpage.maxPagesPerWeek} onChange={(e) => setRule("onpage", { maxPagesPerWeek: numOnly(e.target.value) })} /></Labeled>
              <Labeled label="Content language"><input className={inputCls} placeholder="British English" value={rules.onpage.language} onChange={(e) => setRule("onpage", { language: e.target.value })} /></Labeled>
              <Labeled label="Shortest page or post, in words (0 = no rule)"><input className={inputCls} inputMode="numeric" value={rules.onpage.wordsMin} onChange={(e) => setRule("onpage", { wordsMin: numOnly(e.target.value) })} /></Labeled>
              <Labeled label="Longest page or post, in words (0 = no rule)"><input className={inputCls} inputMode="numeric" value={rules.onpage.wordsMax} onChange={(e) => setRule("onpage", { wordsMax: numOnly(e.target.value) })} /></Labeled>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Labeled label="Protected pages, one address per line (never changed, never rewritten)"><textarea className={txtCls} placeholder={"/contact/\n/pricing/"} value={rules.onpage.protectedUrls} onChange={(e) => setRule("onpage", { protectedUrls: e.target.value })} /></Labeled>
              <Labeled label="Other on-page notes for the agent"><textarea className={txtCls} placeholder="For example: every service page ends with the 24 hour call-out number." value={rules.onpage.notes} onChange={(e) => setRule("onpage", { notes: e.target.value })} /></Labeled>
            </div>
          </Card>
          {taskList("onpage", "On-page tasks")}
        </>
      )}

      {tab === "gbp" && (
        <>
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-[200px] flex-1"><div className="text-[13.5px] font-semibold text-gray-900">Ready for live work on the Business Profile?</div>
                <div className="text-[11.5px] text-gray-500">Live work means the agent opens Chrome on its computer, goes to the real profile and works there. Every step below has to be green first.</div></div>
              <Chip fg={liveDone === LIVE.length ? "#15803D" : "#B45309"} bg={liveDone === LIVE.length ? "#DCFCE7" : "#FEF3C7"}>{liveDone === LIVE.length ? "Ready" : `${liveDone} of ${LIVE.length} done`}</Chip>
            </div>
            <ol className="mt-3 grid gap-x-6 gap-y-1.5 md:grid-cols-2">
              {LIVE.map(([ok, label, fix], i) => (
                <li key={i} className="flex items-start gap-2 text-[12.5px]">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white" style={{ background: ok ? "#16A34A" : "#D1D5DB" }}>{ok ? <Check size={11} /> : <span className="text-[9px] font-bold">{i + 1}</span>}</span>
                  <span className={ok ? "text-gray-700" : "text-gray-900"}>{label}{!ok && <span className="block text-[11.5px] text-gray-500">{fix}</span>}</span>
                </li>
              ))}
            </ol>
          </Card>
          <Card className="p-4">
            <div className="text-[13.5px] font-semibold text-gray-900">Business Profiles of {project.name}</div>
            <div className="mb-3 text-[11.5px] text-gray-500">Every location of this client on Google, and the signed-in Chrome on the agent's computer that manages it.</div>
              <Tile icon={MapPin} accent={accent} title="Profiles" sub="Add one per location." right={<Ready ok={gbpOk} no={ch.gbp.length ? "Needs a Chrome ID" : "Not set up"} />}>
                {ch.gbp.map((g, i) => (
                  <div key={g.id || i} className="mb-2 rounded-lg border border-gray-100 bg-gray-50 p-2.5">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Labeled label="Business name on Google"><input className={inputCls} placeholder="Northgate Plumbing, Leeds" value={g.name} onChange={(e) => setRow("gbp", i, { name: e.target.value })} /></Labeled>
                      <Labeled label="Chrome ID that manages it"><ChromeSelect profiles={profiles} value={g.browser} onChange={(v) => setRow("gbp", i, { browser: v })} /></Labeled>
                    </div>
                    <div className="mt-2 flex items-end gap-2">
                      <div className="min-w-0 flex-1"><Labeled label="Profile link (Maps or Business Profile manager)"><input className={inputCls} placeholder="https://www.google.com/maps/place/…" value={g.link} onChange={(e) => setRow("gbp", i, { link: e.target.value })} /></Labeled></div>
                      <Btn ghost danger onClick={() => delRow("gbp", i)} title="Remove this profile"><Trash2 size={13} /></Btn>
                    </div>
                    {checkLine(g.id ? "gbp:" + g.id : "", g.browser)}
                  </div>
                ))}
                <Btn ghost onClick={() => setCh({ gbp: [...ch.gbp, { id: "", name: "", link: "", browser: ch.gbp[0]?.browser || "", note: "" }] })}><Plus size={13} /> Add a Business Profile</Btn>
              </Tile>
          </Card>
          <Card className="p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-[13.5px] font-semibold text-gray-900">What the agent may change on the profile</div>
              <div className="flex flex-wrap gap-1.5">{GBP_MODES.map(([m, label, fg, bg]) => <Chip key={m} fg={fg} bg={bg}>{partCount(m)} {label.toLowerCase()}</Chip>)}</div>
            </div>
            <div className="mt-0.5 text-[11.5px] leading-5 text-gray-500">One rule for each kind of change. <b>Not allowed</b>: the agent never proposes or makes it, whatever a task says, and a task whose whole purpose is not allowed does not start. <b>Only with my approval</b>: you see the exact change and approve it every time, even where the task type is set to act by itself. <b>Allowed</b>: the task type's own setting below decides whether it asks first (by default it does). The note beside a rule tells the agent how that part may be changed. These rules are given to the agent with every Business Profile task and to the second check that reads its plan.</div>
            <div className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200">
              {GBP_PARTS.map(([k, label, hint]) => { const x = partOf(k); return (
                <div key={k} className="grid items-center gap-2 px-3 py-2.5 lg:grid-cols-[1.1fr_auto_1.3fr]">
                  <div className="min-w-0"><div className="text-[13px] font-medium text-gray-900">{label}</div><div className="text-[11.5px] text-gray-500">{hint}</div></div>
                  <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`${label}: what the agent may do`}>
                    {GBP_MODES.map(([m, text, fg, bg]) => <button key={m} type="button" role="radio" aria-checked={x.mode === m} onClick={() => setPart(k, { mode: m })} className="whitespace-nowrap rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold" style={x.mode === m ? { background: bg, borderColor: fg, color: fg } : { borderColor: "#E5E7EB", color: "#6B7280", background: "#fff" }}>{text}</button>)}
                  </div>
                  <input className={inputCls + " !py-1.5 text-[12px]"} aria-label={`Note for the agent about ${label}`} maxLength={300} disabled={x.mode === "never"} placeholder={x.mode === "never" ? "Not allowed, so no note is needed" : k === "services" ? "For example: only services listed on the website; descriptions under 300 characters, no prices" : k === "photos" ? "For example: at most three a week, finished jobs only" : k === "hours" ? "For example: never change Sunday; it stays closed" : "How this may be changed (optional)"} value={x.note} onChange={(e) => setPart(k, { note: e.target.value })} />
                </div>
              ); })}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Labeled label="Which reviews get a reply"><select className={inputCls} disabled={partOf("reviews").mode === "never"} value={gr.reviewReplies} onChange={(e) => setRule("gbp", { ...gr, reviewReplies: e.target.value })}><option value="all">Every new review</option><option value="positive">Four and five stars only (lower ratings are flagged for a person)</option></select></Labeled>
              <Labeled label="Posts per week, at most"><input className={inputCls} inputMode="numeric" disabled={partOf("posts").mode === "never"} value={gr.postsPerWeek} onChange={(e) => setRule("gbp", { ...gr, postsPerWeek: numOnly(e.target.value) })} /></Labeled>
              <div className="md:col-span-2"><Labeled label="Other notes about this Business Profile for the agent"><textarea className={txtCls} placeholder="For example: always mention the Gas Safe registration in posts. The profile is a service-area business: never show the street address." value={gr.notes} onChange={(e) => setRule("gbp", { ...gr, notes: e.target.value })} /></Labeled></div>
            </div>
            <div className="mt-2 text-[11px] text-gray-400">Press Save changes to keep the rules. They apply from the agent's next task.</div>
          </Card>
          {taskList("gbp", "Business Profile tasks")}
        </>
      )}

      {tab === "offpage" && (
        <>
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><div className="text-[13.5px] font-semibold text-gray-900">Off-page rules and limits</div><div className="text-[11.5px] text-gray-500">Citations, links and outreach for {project.name}. The Google Business Profile has its own tab.</div></div>
              <div className="flex flex-wrap gap-1.5"><Btn ghost onClick={() => setTab("gbp")}><Store size={13} /> Business Profile tab</Btn></div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Labeled label="Outreach prospects per month, at most"><input className={inputCls} inputMode="numeric" value={rules.offpage.outreachPerMonth} onChange={(e) => setRule("offpage", { outreachPerMonth: numOnly(e.target.value) })} /></Labeled>
              <Labeled label="Outreach emails are signed as"><input className={inputCls} placeholder="Name, role, business" value={rules.offpage.senderName} onChange={(e) => setRule("offpage", { senderName: e.target.value })} /></Labeled>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Labeled label="Sites never to contact or seek links from, one per line"><textarea className={txtCls} placeholder={"competitor.co.uk\nold-agency-directory.com"} value={rules.offpage.excludedDomains} onChange={(e) => setRule("offpage", { excludedDomains: e.target.value })} /></Labeled>
              <Labeled label="Other off-page notes for the agent"><textarea className={txtCls} placeholder="For example: always mention the Gas Safe registration in profile posts." value={rules.offpage.notes} onChange={(e) => setRule("offpage", { notes: e.target.value })} /></Labeled>
            </div>
            <div className="mt-2 text-[11px] text-gray-400">The agent drafts outreach; a person sends it.</div>
          </Card>
          {taskList("offpage", "Off-page tasks")}
        </>
      )}

      {tab === "social" && (
        <>
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-[220px] flex-1">
                <div className="text-[13.5px] font-semibold text-gray-900">SMM management software</div>
                <div className="mt-0.5 text-[11.5px] leading-5 text-gray-500">If your agency manages and schedules social posts from one tool (Buffer, Hootsuite, Metricool, Publer and the like), set it up here. With it switched on, the agent publishes and schedules this client's approved posts in that tool instead of on each platform, in the workspace you name. It cannot connect or disconnect accounts, change the plan or touch another client's workspace.</div>
              </div>
              <label className="flex items-center gap-2 text-[12.5px] font-medium text-gray-700"><Switch on={!!smm.on} label="Publish through the SMM management software" onChange={(v) => setSmm({ on: v })} /> {smm.on ? "On" : "Off"}</label>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <Labeled label="Name of the tool"><input className={inputCls} maxLength={60} placeholder="Metricool" value={smm.name || ""} onChange={(e) => setSmm({ name: e.target.value })} /></Labeled>
              <Labeled label="Its address"><input className={inputCls} maxLength={200} placeholder="https://app.metricool.com/" value={smm.url || ""} onChange={(e) => setSmm({ url: e.target.value })} /></Labeled>
              <Labeled label="Chrome ID signed in to it"><ChromeSelect profiles={profiles} value={smm.browser || ""} onChange={(v) => setSmm({ browser: v })} /></Labeled>
              <Labeled label="This client in the tool (workspace, brand or profile group)"><input className={inputCls} maxLength={120} placeholder={project.name} value={smm.workspace || ""} onChange={(e) => setSmm({ workspace: e.target.value })} /></Labeled>
              <div className="md:col-span-2"><Labeled label="Notes for the agent about the tool"><textarea className={txtCls} placeholder={"For example: schedule posts for 9:30 in the morning. Use the queue, never \"Publish now\". Instagram posts always need a picture."} value={smm.notes || ""} onChange={(e) => setSmm({ notes: e.target.value })} /></Labeled></div>
            </div>
            {smm.on && !smm.url && <div className="mt-2 text-[12px] text-amber-800">Give the tool's address (https) before switching it on. Google, Microsoft, Apple, Facebook and payment sites cannot be set up as a tool.</div>}
            {dirty && (smm.url || smm.on) && <div className="mt-2 text-[11.5px] text-gray-500">Press <b>Save changes</b> to keep the tool's settings.</div>}
            {!agency && <SignInRelay name={smm.name} url={smm.url} profileId={smm.browser} accent={accent} />}
            {smm.on && checkLine("smm", smm.browser)}
          </Card>
          <Card className="p-4">
            <div className="text-[13.5px] font-semibold text-gray-900">Social profiles</div>
            <div className="mb-3 text-[11.5px] text-gray-500">The profiles of {project.name}. A Chrome ID is needed only if the agent is to publish approved posts in the browser.</div>
            {ch.social.map((x, i) => (
              <div key={x.id || i} className="mb-2 grid items-end gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2.5 md:grid-cols-[150px_minmax(0,1fr)_minmax(0,220px)_auto]">
                <Labeled label="Platform"><select className={inputCls} value={x.platform} onChange={(e) => setRow("social", i, { platform: e.target.value })}>{(data.platforms || []).map((pf) => <option key={pf.key} value={pf.key}>{pf.label}</option>)}</select></Labeled>
                <Labeled label="Profile link"><input className={inputCls} placeholder="https://www.facebook.com/yourpage" value={x.link} onChange={(e) => setRow("social", i, { link: e.target.value })} /></Labeled>
                <Labeled label="Chrome ID signed in to it"><ChromeSelect profiles={profiles} value={x.browser} onChange={(v) => setRow("social", i, { browser: v })} /></Labeled>
                <Btn ghost danger onClick={() => delRow("social", i)} title="Remove this profile"><Trash2 size={13} /></Btn>
                {x.browser && <div className="md:col-span-4">{checkLine(x.id ? "social:" + x.id : "", x.browser, !!(data.platforms || []).find((pf) => pf.key === x.platform)?.checkable)}</div>}
              </div>
            ))}
            {!ch.social.length && <div className="mb-2 text-[12px] text-gray-400">No social profile added yet.</div>}
            <Btn ghost onClick={() => setCh({ social: [...ch.social, { id: "", platform: (data.platforms || [])[ch.social.length % 7]?.key || "facebook", link: "https://", browser: ch.social[0]?.browser || "", note: "" }] })}><Plus size={13} /> Add a social profile</Btn>
          </Card>
          <Card className="p-4">
            <div className="text-[13.5px] font-semibold text-gray-900">Social rules and limits</div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Labeled label="Posts per week, per platform"><input className={inputCls} inputMode="numeric" value={rules.social.postsPerWeek} onChange={(e) => setRule("social", { postsPerWeek: numOnly(e.target.value) })} /></Labeled>
              <Labeled label="Hashtags"><select className={inputCls} value={rules.social.hashtags} onChange={(e) => setRule("social", { hashtags: e.target.value })}><option value="none">None</option><option value="few">Two or three at most</option><option value="many">As many as the platform uses</option></select></Labeled>
              <Labeled label="Tone"><input className={inputCls} placeholder="Friendly, local, no hard selling" value={rules.social.tone} onChange={(e) => setRule("social", { tone: e.target.value })} /></Labeled>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Labeled label="Topics never to post about, one per line"><textarea className={txtCls} placeholder={"Prices\nCompetitors by name"} value={rules.social.avoidTopics} onChange={(e) => setRule("social", { avoidTopics: e.target.value })} /></Labeled>
              <Labeled label="Other social notes for the agent"><textarea className={txtCls} placeholder="For example: use photos from real jobs only, never stock images." value={rules.social.notes} onChange={(e) => setRule("social", { notes: e.target.value })} /></Labeled>
            </div>
          </Card>
          {taskList("social", "Social media tasks", "Drafts and plans are safe to leave on. Publishing in the browser is off until you switch it on, always asks first, and is untested against the real platforms.")}
        </>
      )}

      {tab === "brand" && <BrandVoice key={project.id} project={project} accent={accent} onSummary={(b) => setBrandNow({ pid: project.id, ...b })} />}
      {tab === "resources" && <Resources key={project.id} project={project} accent={accent} reload={reload} onSettings={() => setTab("settings")} />}
      {tab === "visibility" && <AiVisibility key={project.id} project={project} accent={accent} reload={reload} onOpenTask={onOpenTask} />}
      {tab === "experience" && <ProjectStatus key={"st" + project.id} project={project} accent={accent} />}
      {tab === "experience" && <Experience key={project.id} project={project} data={data} accent={accent} />}
      {tab === "report" && <Reports key={project.id} project={project} accent={accent} onOpenTask={onOpenTask} reload={reload} />}
    </div>
  );
}

/* ---------------- experience: what the agent has learned on a project ---------------- */
const LESSON_FROM = { task: ["From its own work", "#1D4ED8", "#DBEAFE"], review: ["Experience review", "#1D4ED8", "#DBEAFE"], chat: ["From the chat", "#6D28D9", "#EDE9FE"], approval: ["From an approval", "#B45309", "#FEF3C7"], feedback: ["From feedback", "#B45309", "#FEF3C7"], manager: ["Taught by a person", "#15803D", "#DCFCE7"] };
const practice = (n) => (n >= 10 ? ["Experienced", "#15803D", "#DCFCE7"] : n >= 3 ? ["Practised", "#1D4ED8", "#DBEAFE"] : n >= 1 ? ["Starting", "#B45309", "#FEF3C7"] : ["Not run yet", "#6B7280", "#F3F4F6"]);
function LessonRow({ l, busy, onPin, onRemove }) {
  const [label, fg, bg] = LESSON_FROM[l.source] || ["Learned", "#6B7280", "#F3F4F6"];
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
      <div className="min-w-[220px] flex-1">
        <div className="text-[12.5px] leading-relaxed text-gray-900">{l.text}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
          <Chip>{l.typeLabel || "All tasks"}</Chip><Chip fg={fg} bg={bg}>{label}</Chip>{l.pinned && <Chip fg="#111827" bg="#E5E7EB">Pinned</Chip>}
          <span>{relTime(l.updatedAt)}{l.by && l.source !== "task" ? ` · ${l.by}` : ""}{l.uses ? ` · given to ${l.uses} task${l.uses === 1 ? "" : "s"}` : ""}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {onPin && <Btn ghost disabled={busy} onClick={onPin} title={l.pinned ? "Unpin. The agent may then tidy this lesson away in an experience review." : "Pin: always given first, and the agent can never remove it."}><Pin size={13} /> {l.pinned ? "Unpin" : "Pin"}</Btn>}
        <Btn ghost danger disabled={busy} onClick={onRemove} title="Remove this lesson"><Trash2 size={13} /></Btn>
      </div>
    </div>
  );
}
function Experience({ project, data, accent }) {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [text, setText] = useState(""); const [type, setType] = useState(""); const [everywhere, setEverywhere] = useState(false);
  const run = async (body) => {
    setBusy(true); setMsg("");
    try { const o = await api("lesson", { projectId: project.id, ...body }); setSt(o); return o; }
    catch (e) { setMsg(String(e.message || e)); return null; }
    finally { setBusy(false); }
  };
  useEffect(() => { run({ action: "list" }); }, [project.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!st) return <Card className="p-4 text-[13px] text-gray-500">{msg || "Loading what the agent has learned…"}</Card>;
  const rows = data.catalog.filter((c) => !c.agencyOnly && st.stats.byType[c.key]).map((c) => ({ c, r: st.stats.byType[c.key] })).filter((x) => x.r.done || x.r.proposals).sort((a, b) => b.r.done - a.r.done);
  const sum = (k) => Object.values(st.stats.byType).reduce((n, r) => n + (r[k] || 0), 0);
  const proposals = sum("proposals"), asProposed = sum("asProposed"), good = sum("good"), bad = sum("bad");
  const add = async () => { const o = await run({ action: "add", text, type, everywhere }); if (o) { setText(""); setEverywhere(false); } };
  const stat = (label, value, sub) => <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5"><div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">{label}</div><div className="text-[20px] font-semibold text-gray-900">{value}</div><div className="text-[11px] text-gray-500">{sub}</div></div>;
  return (
    <>
      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: accent + "14", color: accent }}><GraduationCap size={17} /></span>
          <div className="min-w-[220px] flex-1">
            <div className="text-[13.5px] font-semibold text-gray-900">What the agent has learned on {project.name}</div>
            <div className="mt-0.5 text-[11.5px] leading-relaxed text-gray-500">The agent writes a lesson when a task teaches it something about this client, and one is written for it every time a person corrects it: an edited proposal, a rejection, feedback on a result. Every later task and chat answer starts with the lessons that apply. The AI model itself does not change; this list is what makes the agent better at this project over time, and you can read, pin, remove or add to it.</div>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {stat("Tasks finished", st.stats.done, "on this project")}
          {stat("Lessons", st.lessons.length, `of ${st.keep} kept at most`)}
          {stat("Approved as proposed", proposals ? `${asProposed} of ${proposals}` : "None yet", "proposals a person did not have to change")}
          {stat("Feedback", good + bad ? `${good} good · ${bad} to improve` : "None yet", "given on finished tasks")}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3"><div className="text-[13.5px] font-semibold text-gray-900">Practice by kind of task</div><div className="text-[11.5px] text-gray-500">How often the agent has done each kind of work here, and how its proposals were received. The label only counts finished runs: Starting (1 or 2), Practised (3 to 9), Experienced (10 or more).</div></div>
        {!rows.length && <div className="px-4 py-4 text-[12px] text-gray-400">No task has finished on this project yet.</div>}
        {rows.map(({ c, r }) => { const [pl, pfg, pbg] = practice(r.done); return (
          <div key={c.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-gray-50 px-4 py-2 text-[12.5px] last:border-0">
            <span className="min-w-[200px] flex-1 font-medium text-gray-900">{c.label}</span>
            <Chip fg={pfg} bg={pbg}>{pl}</Chip>
            <span className="w-24 text-gray-600">{r.done} finished</span>
            <span className="w-56 text-gray-600">{r.proposals ? `${r.asProposed} approved as proposed, ${r.edited} edited, ${r.rejected} rejected` : "no proposals"}</span>
            <span className="w-28 text-gray-500">{r.lastAt ? `last ${relTime(r.lastAt)}` : ""}</span>
          </div>); })}
      </Card>

      <Card className="space-y-3 p-4">
        <div><div className="text-[13.5px] font-semibold text-gray-900">Lessons for this project</div><div className="text-[11.5px] text-gray-500">Pinned lessons are given first and the agent can never remove them. The others it may merge or tidy away in an experience review.</div></div>
        <div className="space-y-2">
          {st.lessons.map((l) => <LessonRow key={l.id} l={l} busy={busy} onPin={() => run({ action: "pin", id: l.id, pinned: !l.pinned })} onRemove={() => run({ action: "remove", id: l.id })} />)}
          {!st.lessons.length && <div className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-center text-[12px] text-gray-400">Nothing learned yet. Lessons appear as tasks finish and as you approve, edit, reject or rate the agent's work.</div>}
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 text-[12.5px] font-semibold text-gray-900">Teach the agent something yourself</div>
          <textarea className={inputCls + " resize-y"} rows={2} placeholder="For example: this client's posts get the most calls when they show a finished job, so lead with the result, not the offer." value={text} onChange={(e) => setText(e.target.value)} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select aria-label="Kind of task" className={inputCls + " max-w-[260px]"} value={type} onChange={(e) => { setType(e.target.value); if (!e.target.value) setEverywhere(false); }}>
              <option value="">Applies to all tasks</option>{data.catalog.filter((c) => !c.agencyOnly).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-[12px] text-gray-600" title="Use this only for how a kind of task is done in general. Do not name a client."><input type="checkbox" checked={everywhere} disabled={!type} onChange={(e) => setEverywhere(e.target.checked)} /> for every project, not just this one</label>
            <Btn accent={accent} disabled={busy || text.trim().length < 12} onClick={add}><Plus size={13} /> Add lesson</Btn>
            {msg && <span className="text-[11.5px] text-red-700">{msg}</span>}
          </div>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <div><div className="text-[13.5px] font-semibold text-gray-900">Learned for every project</div><div className="text-[11.5px] text-gray-500">How a kind of task is done in general, whichever client it is for: how a page or a tool really behaves, what works. Given to every project's tasks of that kind.</div></div>
        <div className="space-y-2">
          {st.skills.map((l) => <LessonRow key={l.id} l={l} busy={busy} onRemove={() => run({ action: "remove", id: l.id, everywhere: true })} />)}
          {!st.skills.length && <div className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-center text-[12px] text-gray-400">Nothing yet.</div>}
        </div>
      </Card>
    </>
  );
}

/* ---------------- report: everything that was done for a project, by period and by kind of work ---------------- */
const WORK_KIND_LABEL = { task: "Task", keywords: "Keywords", competitors: "Competitors", serp: "Search results", rankings: "Rankings", audit: "Audit", plan: "Plan", page_change: "Page changed", content: "Content", meta: "Titles and descriptions", technical: "Technical fix", internal_links: "Internal links",
  change: "Change made", link_won: "Link won", link_built: "Link built", citation: "Citation", outreach: "Outreach", gbp_post: "Business Profile post", review_reply: "Review reply", gbp_edit: "Business Profile edit", post_published: "Post published", post_drafted: "Post drafted", calendar: "Content calendar", engagement: "Engagement", other: "Other" };
const WORK_SECTION_LABEL = { research: "Research and planning", onpage: "On-page SEO", offpage: "Off-page SEO", social: "Social media" };
const dayText = (ms) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const dayInput = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const shortUrl = (u) => { try { const x = new URL(u); return (x.host.replace(/^www\./, "") + x.pathname + x.search).replace(/\/$/, ""); } catch { return u; } };
/* a link inside the agent's own text opens in a new window, so a click never navigates the CRM (or the agent's application window) away */
const openLinkOutside = (e) => {
  const a = e.target?.closest?.("a[href]");
  if (!a) return;
  e.preventDefault();
  if (/^https?:\/\//i.test(a.getAttribute("href") || "")) window.open(a.href, "_blank", "noopener,noreferrer");
};
const LiveLink = ({ url, children }) => <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 break-all font-medium text-blue-700 hover:underline">{children || shortUrl(url)} <ExternalLink size={11} className="shrink-0" /></a>;
function WorkRow({ it, onOpenTask, onRemove, showLink = true, showKind = true }) {
  return (
    <div className="group flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-gray-50 px-1 py-2 last:border-0">
      <span className="w-[86px] shrink-0 pt-0.5 text-[11.5px] text-gray-500">{dayText(it.at)}</span>
      <div className="min-w-[200px] flex-1">
        <div className="text-[12.5px] leading-relaxed text-gray-900">{showKind && it.kind !== "task" && <span className="mr-1.5"><Chip>{WORK_KIND_LABEL[it.kind] || it.kind}</Chip></span>}{it.title}</div>
        {it.detail && <div className="text-[12px] leading-relaxed text-gray-600">{it.detail}</div>}
        {(showLink && it.url) || it.target ? <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11.5px] text-gray-500">{showLink && it.url && <LiveLink url={it.url} />}{it.target && <span>{it.url ? "points to " : "on "}{/^https?:/.test(it.target) ? <LiveLink url={it.target} /> : it.target}</span>}</div> : null}
      </div>
      <span className="shrink-0 text-[11px] text-gray-400">{it.source === "manual" ? `added by ${it.by}` : it.source === "journal" ? `logged by ${it.by}` : it.by && it.by !== "AI agent" ? it.by : "AI agent"}</span>
      <div className="flex shrink-0 items-center gap-1">
        {it.taskId && onOpenTask && <Btn ghost onClick={() => onOpenTask(it.taskId)} title="Open the task with its full report"><FileText size={12} /> Full report</Btn>}
        <button type="button" className="rounded-md p-1 text-gray-300 hover:bg-red-50 hover:text-red-600" title="Remove this entry from the report" aria-label={`Remove "${it.title}" from the report`} onClick={onRemove}><Trash2 size={13} /></button>
      </div>
    </div>
  );
}
function WorkReport({ project, accent, onOpenTask }) {
  const [mode, setMode] = useState("all");                                  // all | month | custom
  const [month, setMonth] = useState(() => dayInput(Date.now()).slice(0, 7));
  const [from, setFrom] = useState(() => dayInput(Date.now() - 29 * 864e5));
  const [to, setTo] = useState(() => dayInput(Date.now()));
  const [rp, setRp] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [adding, setAdding] = useState(null);
  const [copied, setCopied] = useState(false);
  /* the period as two moments in this computer's own time: the first instant of the first day, the last of the last day */
  const range = useMemo(() => {
    if (mode === "month") { const [y, m] = month.split("-").map(Number); return { from: new Date(y, m - 1, 1).getTime(), to: new Date(y, m, 1).getTime() - 1 }; }
    if (mode === "custom") { const a = from ? new Date(from + "T00:00:00").getTime() : 0, b = to ? new Date(to + "T23:59:59.999").getTime() : 0; return a && b && b < a ? { from: b - 86399999, to: a + 86399999 } : { from: a, to: b }; }
    return { from: 0, to: 0 };
  }, [mode, month, from, to]);
  const run = async (path, body) => {
    setBusy(true); setMsg("");
    try { const o = await api(path, { projectId: project.id, from: range.from, to: range.to, ...body }); setRp(o); return o; }
    catch (e) { setMsg(String(e.message || e)); return null; }
    finally { setBusy(false); }
  };
  useEffect(() => { run("report", {}); }, [project.id, range.from, range.to]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!rp) return <Card className="p-4 text-[13px] text-gray-500">{msg || "Loading the report…"}</Card>;

  const months = []; { const first = new Date(rp.firstAt || Date.now()); const d = new Date(); d.setDate(1); for (let i = 0; i < 60; i++) { months.push({ key: dayInput(d.getTime()).slice(0, 7), label: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }) }); if (d.getFullYear() === first.getFullYear() && d.getMonth() === first.getMonth()) break; d.setMonth(d.getMonth() - 1); } }
  const items = rp.items, of = (sec) => items.filter((x) => x.section === sec);
  const remove = async (it) => { if (await askConfirm({ title: "Remove this entry?", message: `"${it.title}" will be taken out of the report. The work itself is not undone.`, confirmLabel: "Yes, remove it", danger: true })) run("work", { action: "remove", id: it.id }); };
  const row = (it, opts = {}) => <WorkRow key={it.id} it={it} onOpenTask={onOpenTask} onRemove={() => remove(it)} {...opts} />;
  const none = (text) => <div className="px-1 py-3 text-[12px] text-gray-400">{text}</div>;
  const sub = (title, hint) => <div className="mb-1 mt-3 first:mt-0"><div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">{title}</div>{hint && <div className="text-[11px] text-gray-400">{hint}</div>}</div>;

  /* research and planning: the agent's research runs, grouped by what they looked into, then single findings */
  const research = of("research"), groups = [];
  for (const it of research.filter((x) => x.kind === "task")) { const key = it.typeLabel || "Other research and tasks"; let g = groups.find((x) => x.key === key); if (!g) groups.push((g = { key, list: [] })); g.list.push(it); }
  const notes = research.filter((x) => x.kind !== "task");
  /* on-page: by page */
  const onpage = of("onpage"), pages = [];
  for (const it of onpage) { const key = it.url || (/^https?:|^\//.test(it.target) ? it.target : ""); if (!key) continue; let g = pages.find((x) => x.key === key); if (!g) pages.push((g = { key, list: [] })); g.list.push(it); }
  const noPage = onpage.filter((x) => !(x.url || /^https?:|^\//.test(x.target)));
  /* off-page: links first, then the Business Profile, then everything else */
  const offpage = of("offpage"), LINKS = ["link_won", "link_built", "citation"], GBP = ["gbp_post", "review_reply", "gbp_edit"], GBP_TYPES = ["gbp_post", "gbp_review_reply", "gbp_update", "gbp_audit", "profile_guard"];
  const links = offpage.filter((x) => LINKS.includes(x.kind)), gbp = offpage.filter((x) => GBP.includes(x.kind) || (!LINKS.includes(x.kind) && GBP_TYPES.includes(x.type))), offRest = offpage.filter((x) => !links.includes(x) && !gbp.includes(x));
  const social = of("social"), posts = social.filter((x) => ["post_published", "post_drafted"].includes(x.kind)), socRest = social.filter((x) => !posts.includes(x));
  const platformLabel = (k) => (rp.platforms || []).find((p) => p.key === k)?.label || "";
  const period = mode === "all" ? (rp.firstAt ? `From the start (${dayText(rp.firstAt)}) to today` : "From the start to today") : `${dayText(range.from)} to ${dayText(Math.min(range.to, Date.now()))}`;

  const asText = () => {
    const L = [`Work report: ${project.name}`, period, ""];
    const add = (title, list, f) => { if (!list.length) return; L.push(title); for (const it of list) L.push("- " + f(it)); L.push(""); };
    const base = (it) => `${dayText(it.at)}: ${it.title}${it.detail ? ". " + it.detail : ""}`;
    L.push("RESEARCH AND PLANNING", ""); for (const g of groups) add(`${g.key} (${g.list.length})`, g.list, base); add("Research findings", notes, (it) => `${base(it)}${it.url ? " " + it.url : ""}`);
    L.push("ON-PAGE SEO", ""); for (const g of pages) add(g.key, g.list, base); add("Other on-page work", noPage, base);
    L.push("OFF-PAGE SEO", ""); add("Links won and built", links, (it) => `${dayText(it.at)}: ${WORK_KIND_LABEL[it.kind]}: ${it.url || it.title}${it.target ? " (points to " + it.target + ")" : ""}${it.url ? ". " + it.title : ""}`); add("Google Business Profile", gbp, base); add("Other off-page work and research", offRest, base);
    L.push("SOCIAL MEDIA", ""); add("Posts", posts, (it) => `${base(it)}${it.url ? " " + it.url : ""}`); add("Other social media work", socRest, base);
    return L.join("\n");
  };
  /* the same report as a file for a spreadsheet, and as a clean page to print or to save as a PDF: what was done, when and where, with no names and no costs */
  const fileName = (ext) => `work-report-${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${dayInput(Date.now())}.${ext}`;
  const save = (text, type, name) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  const csv = () => {
    const cell = (v) => { const t = String(v == null ? "" : v).replace(/\r?\n/g, " "); return /[",;]/.test(t) || /^[=+\-@]/.test(t) ? '"' + (/^[=+\-@]/.test(t) ? "'" : "") + t.replace(/"/g, '""') + '"' : t; };      // a cell that starts like a formula is written as text
    const rows = [["Date", "Area", "Kind", "What was done", "Detail", "Address", "Points to"], ...[...items].sort((a, b) => a.at - b.at).map((it) => [dayInput(it.at), WORK_SECTION_LABEL[it.section] || it.section, it.kind === "task" ? it.typeLabel || "Task" : WORK_KIND_LABEL[it.kind] || it.kind, it.title, it.detail || "", it.url || "", it.target || ""])];
    save("\ufeff" + rows.map((r) => r.map(cell).join(",")).join("\r\n"), "text/csv;charset=utf-8", fileName("csv"));
  };
  const print = () => {
    const e = (t) => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const out = [];
    let part = [];
    const block = (title, list, f) => { if (list.length) part.push(`<h3>${e(title)} <span>${list.length}</span></h3><ul>${list.map((it) => `<li>${f(it)}</li>`).join("")}</ul>`); };
    const close = (title) => { if (part.length) out.push(`<h2>${e(title)}</h2>` + part.join("")); part = []; };      // a part of the work with nothing in this period is left out
    const base = (it) => `<b>${e(dayText(it.at))}</b> ${e(it.title)}${it.detail ? `<div>${e(it.detail)}</div>` : ""}`, withUrl = (it) => base(it) + (it.url ? `<div class="u">${e(it.url)}</div>` : "");
    for (const g of groups) block(g.key, g.list, base); block("Research findings", notes, withUrl); close("Research and planning");
    for (const g of pages) block(g.key, g.list, base); block("Other on-page work", noPage, base); close("On-page SEO");
    block("Links won and built", links, (it) => `<b>${e(dayText(it.at))}</b> ${e(WORK_KIND_LABEL[it.kind])}: ${e(it.title)}${it.url ? `<div class="u">${e(it.url)}</div>` : ""}${it.target ? `<div>Points to ${e(it.target)}</div>` : ""}`); block("Google Business Profile", gbp, base); block("Other off-page work and research", offRest, base); close("Off-page SEO");
    block("Posts", posts, withUrl); block("Other social media work", socRest, base); close("Social media");
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Work report: ${e(project.name)}</title><style>body{font:13px/1.5 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#111827;max-width:760px;margin:32px auto;padding:0 24px}h1{font-size:22px;margin:0}p.p{color:#6B7280;margin:4px 0 20px}h2{font-size:15px;margin:26px 0 6px;padding-bottom:5px;border-bottom:2px solid ${e(accent)};color:${e(accent)}}h3{font-size:12.5px;margin:14px 0 4px}h3 span{color:#9CA3AF;font-weight:400}ul{margin:0;padding-left:18px}li{margin:3px 0;break-inside:avoid}li div{color:#4B5563}li div.u{color:#1D4ED8;word-break:break-all;font-size:12px}@media print{body{margin:0 auto}}</style></head><body><h1>Work report: ${e(project.name)}</h1><p class="p">${e(period)} · ${items.length} thing${items.length === 1 ? "" : "s"} done</p>${out.join("")}<script>addEventListener("load",function(){setTimeout(function(){print()},250)})<\/script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
    else save(html, "text/html;charset=utf-8", fileName("html"));      // a window that could not be opened: the same page as a file to open and print
  };
  const copy = async () => { try { await navigator.clipboard.writeText(asText()); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setMsg("The report could not be copied. Select the text on the page instead."); } };
  const tile = (label, value, hint) => <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5"><div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">{label}</div><div className="text-[20px] font-semibold text-gray-900">{value}</div><div className="text-[11px] text-gray-500">{hint}</div></div>;
  const section = (key, Icon, count, children) => (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: accent + "14", color: accent }}><Icon size={16} /></span><div className="text-[14px] font-semibold text-gray-900">{WORK_SECTION_LABEL[key]}</div><Chip>{count} in this period</Chip></div>
      {children}
    </Card>
  );
  return (
    <>
      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: accent + "14", color: accent }}><ClipboardList size={17} /></span>
          <div className="min-w-[220px] flex-1">
            <div className="text-[13.5px] font-semibold text-gray-900">Work done for {project.name}</div>
            <div className="mt-0.5 text-[11.5px] leading-relaxed text-gray-500">Everything that was done for this project: each task the agent finished, each change that was logged, what the agent recorded while working, and work you add yourself. {rp.total.toLocaleString()} in all{rp.firstAt ? `, since ${dayText(rp.firstAt)}` : ""}.</div>
          </div>
          <div className="flex flex-wrap items-center gap-2"><Btn ghost onClick={copy} disabled={!items.length}><Copy size={13} /> {copied ? "Copied" : "Copy as text"}</Btn><Btn ghost onClick={csv} disabled={!items.length} title="A spreadsheet file with one line for each thing done in this period."><Download size={13} /> Spreadsheet (CSV)</Btn><Btn ghost onClick={print} disabled={!items.length} title="Opens the report as a clean page to print, or to save as a PDF from the print window."><FileText size={13} /> Print or save as PDF</Btn><Btn accent={accent} onClick={() => setAdding({ section: "offpage", kind: "link_built", title: "", detail: "", url: "", target: "", platform: "", date: dayInput(Date.now()) })}><Plus size={13} /> Add work done</Btn></div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 p-0.5" role="group" aria-label="Period">
            {[["all", "All time"], ["month", "By month"], ["custom", "Custom dates"]].map(([k, label]) => <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)} className="rounded-md px-3 py-1 text-[12.5px] font-semibold" style={mode === k ? { background: accent, color: "#fff" } : { color: "#4B5563" }}>{label}</button>)}
          </div>
          {mode === "month" && <select aria-label="Month" className={inputCls + " max-w-[200px]"} value={month} onChange={(e) => setMonth(e.target.value)}>{months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select>}
          {mode === "custom" && <span className="flex flex-wrap items-center gap-2 text-[12.5px] text-gray-600">from <input type="date" aria-label="From date" className={inputCls + " w-auto"} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /> to <input type="date" aria-label="To date" className={inputCls + " w-auto"} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></span>}
          <span className="text-[12px] text-gray-500">{period} · {items.length.toLocaleString()} thing{items.length === 1 ? "" : "s"} done{busy ? " · loading…" : ""}</span>
        </div>
        {rp.more > 0 && <div className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-[11.5px] text-amber-900">This period holds more than can be shown at once. The newest {rp.shown.toLocaleString()} are shown; choose a shorter period to see the rest.</div>}
        {msg && <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-800" role="alert">{msg}</div>}
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {tile("Research and planning", research.length, "research runs and findings")}
          {tile("Pages worked on", pages.length, `${onpage.length} on-page item${onpage.length === 1 ? "" : "s"}`)}
          {tile("Links", links.length, "won, built or corrected")}
          {tile("Business Profile", gbp.length, "posts, replies, edits, checks")}
          {tile("Social media", social.length, `${posts.length} post${posts.length === 1 ? "" : "s"}`)}
        </div>
      </Card>

      {section("research", Search, research.length, <>
        {!research.length && none("No research or planning in this period.")}
        {groups.map((g) => (
          <details key={g.key} className="border-b border-gray-100 last:border-0" open={groups.length <= 3 || g.list.length <= 3}>
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 py-2 text-[13px] font-semibold text-gray-900">{g.key} <Chip>{g.list.length}</Chip><span className="text-[11.5px] font-normal text-gray-500">last on {dayText(g.list[0].at)}</span></summary>
            <div className="pb-2 pl-1">{g.list.map((it) => row(it, { showKind: false }))}</div>
          </details>
        ))}
        {notes.length > 0 && <>{sub("Research findings", "Single findings the agent or a person recorded: keywords, competitors, search results.")}{notes.map((it) => row(it))}</>}
      </>)}

      {section("onpage", FileText, onpage.length, <>
        {!onpage.length && none("No on-page work in this period.")}
        {pages.map((g) => (
          <div key={g.key} className="mb-2 rounded-xl border border-gray-200">
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2 text-[12.5px]">{/^https?:/.test(g.key) ? <LiveLink url={g.key} /> : <span className="font-medium text-gray-900">{g.key}</span>}<Chip>{g.list.length} thing{g.list.length === 1 ? "" : "s"} done</Chip></div>
            <div className="px-2">{g.list.map((it) => row(it, { showLink: false }))}</div>
          </div>
        ))}
        {noPage.length > 0 && <>{sub("Other on-page work", "Audits and work that covers the whole site or names no single page.")}{noPage.map((it) => row(it))}</>}
      </>)}

      {section("offpage", MapPin, offpage.length, <>
        {!offpage.length && none("No off-page work in this period.")}
        {links.length > 0 && <>{sub("Links won and built", "The live page that links, and the page it points to.")}{links.map((it) => row(it))}</>}
        {gbp.length > 0 && <>{sub("Google Business Profile")}{gbp.map((it) => row(it))}</>}
        {offRest.length > 0 && <>{sub("Other off-page work and research", "Link prospecting, citation checks, map-grid plans and other tasks.")}{offRest.map((it) => row(it))}</>}
      </>)}

      {section("social", Share2, social.length, <>
        {!social.length && none("No social media work in this period.")}
        {posts.length > 0 && <>{sub("Posts")}{posts.map((it) => <WorkRow key={it.id} it={{ ...it, title: (platformLabel(it.platform) ? platformLabel(it.platform) + ": " : "") + it.title }} onOpenTask={onOpenTask} onRemove={() => remove(it)} />)}</>}
        {socRest.length > 0 && <>{sub("Other social media work", "Profile checks, content calendars and other tasks.")}{socRest.map((it) => row(it))}</>}
      </>)}

      {adding && (
        <Modal title="Add work done" sub={`Work done for ${project.name} outside the agent, so the report is complete.`} onClose={() => setAdding(null)} wide>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Labeled label="Part of the work"><select className={inputCls} value={adding.section} onChange={(e) => setAdding({ ...adding, section: e.target.value, kind: rp.kinds[e.target.value].filter((k) => k !== "task" && k !== "change")[0] })}>{Object.keys(WORK_SECTION_LABEL).map((k) => <option key={k} value={k}>{WORK_SECTION_LABEL[k]}</option>)}</select></Labeled>
              <Labeled label="What kind"><select className={inputCls} value={adding.kind} onChange={(e) => setAdding({ ...adding, kind: e.target.value })}>{rp.kinds[adding.section].filter((k) => k !== "task" && k !== "change").map((k) => <option key={k} value={k}>{WORK_KIND_LABEL[k] || k}</option>)}</select></Labeled>
              <Labeled label="Date"><input type="date" className={inputCls} value={adding.date} max={dayInput(Date.now())} onChange={(e) => setAdding({ ...adding, date: e.target.value })} /></Labeled>
            </div>
            <Labeled label="What was done"><input className={inputCls} placeholder={adding.section === "offpage" ? "Guest article published on the Leeds Chamber of Commerce site" : "Rewrote the boiler repair page around emergency call-outs"} value={adding.title} onChange={(e) => setAdding({ ...adding, title: e.target.value })} autoFocus /></Labeled>
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled label={adding.section === "offpage" ? "Live link (the page that links)" : adding.section === "social" ? "Link to the post" : "Live page link"}><input className={inputCls} placeholder="https://" value={adding.url} onChange={(e) => setAdding({ ...adding, url: e.target.value })} /></Labeled>
              {adding.section === "social"
                ? <Labeled label="Platform"><select className={inputCls} value={adding.platform} onChange={(e) => setAdding({ ...adding, platform: e.target.value })}><option value="">Not one platform</option>{(rp.platforms || []).map((pf) => <option key={pf.key} value={pf.key}>{pf.label}</option>)}</select></Labeled>
                : <Labeled label={adding.section === "offpage" ? "Page on the site it points to (optional)" : "Page or part of the site (optional)"}><input className={inputCls} placeholder="/boiler-repair/" value={adding.target} onChange={(e) => setAdding({ ...adding, target: e.target.value })} /></Labeled>}
            </div>
            <Labeled label="Short description (optional)"><textarea className={inputCls + " resize-y"} rows={2} value={adding.detail} onChange={(e) => setAdding({ ...adding, detail: e.target.value })} /></Labeled>
            {msg && <div className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-800" role="alert">{msg}</div>}
            <div className="flex flex-wrap items-center gap-2">
              <Btn accent={accent} disabled={busy || adding.title.trim().length < 4} onClick={async () => { const at = adding.date === dayInput(Date.now()) ? Date.now() : new Date(adding.date + "T12:00:00").getTime(); const o = await run("work", { action: "add", section: adding.section, kind: adding.kind, title: adding.title, detail: adding.detail, url: adding.url.trim(), target: adding.target, platform: adding.platform, at }); if (o) setAdding(null); }}><Check size={13} /> Add to the report</Btn>
              <Btn ghost onClick={() => { setAdding(null); setMsg(""); }}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ---------------- brand voice: who the client is and how the agent writes for them ---------------- */
const brandCaption = (b) => (!b || b.source === "none" ? "Not set up yet" : b.source === "crm" ? "From the CRM for now" : `${b.fields} detail${b.fields === 1 ? "" : "s"} · ${b.docs} document${b.docs === 1 ? "" : "s"}`);
const BIZ_ROWS = [["name", "Business name, as on Google", "Northgate Plumbing & Heating Ltd"], ["category", "Primary category", "Plumber"], ["phone", "Phone", "0113 496 0000"], ["email", "Email", "hello@example.com"],
  ["address", "Address", "Street, town, postcode"], ["hours", "Opening hours", "Mon to Fri 8am to 6pm, emergencies 24 hours"], ["serviceAreas", "Service areas", "Leeds, Horsforth, Pudsey"], ["services", "Services", "boiler repair, bathroom fitting, drain cleaning"]];
const filledCount = (p) => (p ? Object.entries(p).filter(([k, v]) => k !== "biz" && v).length + Object.values(p.biz || {}).filter(Boolean).length : 0);
/* one brand document; its own component so typing a note does not redraw the list */
function BrandDocRow({ d, canEdit, busy, onNote, onView, onRemove }) {
  const [note, setNote] = useState(d.note);
  useEffect(() => { setNote(d.note); }, [d.note]);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
      <FileText size={16} className="shrink-0 text-gray-400" />
      <div className="min-w-[160px] flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-gray-900"><span className="break-all">{d.name}</span>
          <Chip fg={d.inline ? "#15803D" : "#1D4ED8"} bg={d.inline ? "#DCFCE7" : "#DBEAFE"}>{d.inline ? "Given in full" : "Opened when needed"}</Chip></div>
        <div className="text-[11px] text-gray-500">{d.words.toLocaleString()} words{d.addedAt ? ` · added ${relTime(d.addedAt)}` : ""}{d.by ? ` by ${d.by}` : ""}</div>
      </div>
      {canEdit && <input aria-label={`What ${d.name} is for`} className={inputCls + " min-w-[200px] flex-[2]"} placeholder="What it is and when to use it (helps the agent pick the right one)" value={note}
        onChange={(e) => setNote(e.target.value)} onBlur={() => { if (note.trim() !== d.note) onNote(note.trim()); }} />}
      <div className="flex items-center gap-1.5">
        <Btn ghost onClick={onView} title="Read the text the agent sees"><Eye size={13} /> View</Btn>
        {canEdit && <Btn ghost danger disabled={busy} onClick={onRemove} title="Remove this document"><Trash2 size={13} /></Btn>}
      </div>
    </div>
  );
}
function BrandVoice({ project, accent, onSummary }) {
  const [st, setSt] = useState(null);         // what the server holds
  const [form, setForm] = useState(null);     // the profile being edited
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);       // { ok, text }
  const [paste, setPaste] = useState(null);   // { name, note, text } while the paste form is open
  const [view, setView] = useState(null);     // a document being read
  const [told, setTold] = useState(false);
  const dirtyRef = useRef(false); dirtyRef.current = dirty;
  const take = (o, keepForm) => {
    setSt(o);
    if (!keepForm) { setForm(o.profile); setDirty(false); }
    onSummary?.({ source: o.source, fields: filledCount(o.profile), docs: o.docs.length });
  };
  const run = async (body, keepForm) => {
    setBusy(true); setMsg(null);
    try { const o = await api("brand", { projectId: project.id, ...body }); take(o, keepForm); return o; }
    catch (e) { setMsg({ ok: false, text: String(e.message || e) }); return null; }
    finally { setBusy(false); }
  };
  useEffect(() => { run({ action: "get" }); }, [project.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!st || !form) return <Card className="p-4 text-[13px] text-gray-500">{msg ? msg.text : "Loading the brand voice…"}</Card>;

  const setF = (patch) => { setForm((f) => ({ ...f, ...patch })); setDirty(true); };
  const setBiz = (patch) => { setForm((f) => ({ ...f, biz: { ...f.biz, ...patch } })); setDirty(true); };
  const save = async () => { const o = await run({ action: "save", profile: form }); if (o) setMsg({ ok: true, text: "Brand voice saved. The agent uses it from its next task and chat answer." }); };
  const copyCrm = async () => {
    const o = await run({ action: "copyFromCrm" }, dirtyRef.current && st.source === "agent");
    if (o) setMsg({ ok: true, text: o.copied.fields || o.copied.docs ? `Copied ${o.copied.fields} detail${o.copied.fields === 1 ? "" : "s"} and ${o.copied.docs} document${o.copied.docs === 1 ? "" : "s"} from the CRM's Brand Voice.` : "Nothing new to copy: everything in the CRM's Brand Voice is already here." });
  };
  const addDoc = async (name, text, note) => {
    const o = await run({ action: "addDoc", name, text, note }, dirtyRef.current);
    if (o) setMsg({ ok: true, docs: true, text: o.replaced ? `"${name}" was replaced with the new text.` : `"${name}" was added.` });
    else setMsg((m) => (m ? { ...m, docs: true } : m));
    return !!o;
  };
  const addFiles = async (list) => {
    for (const f of [...list]) {
      try {
        if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") throw new Error(`${f.name}: PDF files cannot be read here. Copy the text out of the PDF and use Paste text, or save it as Word or plain text.`);
        if (/\.doc$/i.test(f.name)) throw new Error(`${f.name}: old Word files (.doc) cannot be read. Save it as .docx and upload that.`);
        if (f.size > 8e6) throw new Error(`${f.name} is larger than 8 MB.`);
        const isDocx = /\.docx$/i.test(f.name);
        if (!isDocx && !/\.(txt|md|markdown)$/i.test(f.name) && !f.type.startsWith("text/")) throw new Error(`${f.name}: upload a .docx, .txt or .md file, or use Paste text.`);
        const text = isDocx ? await docxToText(await f.arrayBuffer()) : await f.text();
        if (!(await addDoc(f.name, text, ""))) break;
      } catch (e) { setMsg({ ok: false, docs: true, text: String(e.message || e) }); break; }
    }
  };
  const openDoc = async (d) => {
    setView({ name: d.name, text: "", loading: true });
    try { const o = await api("brand", { projectId: project.id, action: "doc", id: d.id }); setView({ name: o.name, text: o.text, truncated: o.truncated, words: o.words }); }
    catch (e) { setView({ name: d.name, text: String(e.message || e) }); }
  };
  const removeDoc = async (d) => { if (await askConfirm({ title: "Remove this document?", message: `"${d.name}" will be removed from the brand documents. The agent will no longer see it.`, confirmLabel: "Yes, remove it", danger: true })) run({ action: "removeDoc", id: d.id }, dirtyRef.current); };
  const own = st.source === "agent", fromCrm = st.source === "crm";
  const field = (key, label, ph) => <Labeled label={label}><input className={inputCls} placeholder={ph} value={form[key]} onChange={(e) => setF({ [key]: e.target.value })} /></Labeled>;
  const area = (key, label, ph, rows = 3) => <Labeled label={label}><textarea className={inputCls + " resize-y"} rows={rows} placeholder={ph} value={form[key]} onChange={(e) => setF({ [key]: e.target.value })} /></Labeled>;
  const saveBar = (
    <div className="flex flex-wrap items-center gap-2">
      <Btn accent={accent} onClick={save} disabled={busy || (!dirty && !fromCrm)}><Check size={13} /> {fromCrm && !dirty ? "Keep this as the agent's brand voice" : "Save brand voice"}</Btn>
      {dirty && <Btn ghost onClick={() => { setForm(st.profile); setDirty(false); }}>Discard</Btn>}
      {dirty && <span className="text-[11.5px] text-amber-700">Unsaved changes in the brand voice</span>}
      {msg && !msg.docs && <span className={"text-[11.5px] " + (msg.ok ? "text-green-700" : "text-red-700")} role="status">{msg.text}</span>}
    </div>
  );
  return (
    <>
      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: accent + "14", color: accent }}><Mic size={17} /></span>
          <div className="min-w-[220px] flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-gray-900">Brand voice for {project.name}
              <Chip fg={own ? "#15803D" : fromCrm ? "#1D4ED8" : "#B45309"} bg={own ? "#DCFCE7" : fromCrm ? "#DBEAFE" : "#FEF3C7"}>{own ? "Set for the agent" : fromCrm ? "Using the CRM's Brand Voice" : "Not set up yet"}</Chip></div>
            <div className="mt-0.5 text-[11.5px] leading-relaxed text-gray-500">
              {own && <>Every task and every chat answer for this project is given this, so the agent writes like {project.name} and uses the real business facts.{st.updatedAt ? ` Last saved ${relTime(st.updatedAt)}${st.updatedBy ? ` by ${st.updatedBy}` : ""}.` : ""}</>}
              {fromCrm && <>The agent is working from the Brand Voice already filled in for this project in the CRM (Optimization, Brand Voice). Save a change or add a document here and the agent gets its own copy, documents included. After that, edits made in the CRM no longer reach the agent unless you copy them over.</>}
              {st.source === "none" && <>Nothing is set yet, here or in the CRM. Fill in what you know and upload the brand's documents: every task and every chat answer for this project is given it, so the agent writes like {project.name} instead of sounding generic.</>}
            </div>
          </div>
          {own && st.crm && <Btn ghost disabled={busy} onClick={copyCrm} title="Fills the empty fields and adds the documents that are not here yet. Nothing you wrote here is overwritten."><Copy size={13} /> Copy what is missing from the CRM's Brand Voice</Btn>}
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <div><div className="text-[13.5px] font-semibold text-gray-900">The brand</div><div className="text-[11.5px] text-gray-500">Who {project.name} is and who it talks to.</div></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("brandName", "Brand name", project.name)}
          {field("tagline", "Tagline or positioning", "Honest, same-day local plumbing")}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {area("brandInfo", "Who we are: story, what makes us different, proof", "Family firm since 1998. Gas Safe registered. Fixed prices agreed before work starts. 4.9 stars from 600 reviews.")}
          {area("audience", "Who we talk to", "Homeowners and landlords in north Leeds. They want it fixed today, by someone they can trust in the house.")}
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <div><div className="text-[13.5px] font-semibold text-gray-900">Business facts</div><div className="text-[11.5px] text-gray-500">The agent uses these exactly as written and is told never to invent a name, an address, a phone number, a price or opening hours.</div></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {BIZ_ROWS.map(([k, label, ph]) => <Labeled key={k} label={label}><input className={inputCls} placeholder={ph} value={form.biz[k]} onChange={(e) => setBiz({ [k]: e.target.value })} /></Labeled>)}
        </div>
        <Labeled label="Business description"><textarea className={inputCls + " resize-y"} rows={3} placeholder="What the business does, for whom, and what it is best at. The kind of text a Business Profile description holds." value={form.biz.description} onChange={(e) => setBiz({ description: e.target.value })} /></Labeled>
      </Card>

      <Card className="space-y-3 p-4">
        <div><div className="text-[13.5px] font-semibold text-gray-900">Voice and tone</div><div className="text-[11.5px] text-gray-500">How everything written for this client should sound: pages, posts, review replies, emails and report text.</div></div>
        {field("toneWords", "Tone, in a few words", "warm, plain-spoken, confident, never salesy")}
        <div className="grid gap-3 lg:grid-cols-2">
          {area("doList", "Always do, one per line", "Use plain English\nLead with what the customer gets\nSay \"we\" and \"you\"\nBack a claim with a fact", 4)}
          {area("dontList", "Never do, one per line", "No hype or superlatives\nNo claims we cannot prove\nNo exclamation marks\nDo not mention competitors", 4)}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {field("avoidWords", "Words and phrases to avoid", "cheap, world-class, cutting-edge, solutions")}
          {field("preferWords", "Preferred terms and spelling", "call-out (not callout), boiler service, British spelling")}
        </div>
        {field("cta", "Usual call to action", "Call 0113 496 0000 for a fixed price today")}
        {area("sample", "A sample of the brand's own writing", "Paste a paragraph or two that sounds exactly right: from the website, a post or an email. The agent matches the style and does not copy it.", 4)}
      </Card>

      {saveBar}

      <Card className="space-y-3 p-4">
        <div>
          <div className="text-[13.5px] font-semibold text-gray-900">Brand documents</div>
          <div className="text-[11.5px] leading-relaxed text-gray-500">Style guides, tone of voice documents, service and price lists, an approved "about us", past posts that worked. The agent learns the brand from them. Short documents (about {Math.round(st.limits.inlineChars / 6 / 100) * 100} words in total) are given in full with every writing task; longer ones the agent opens when the task needs them. Up to {st.limits.docs} documents per project.</div>
        </div>
        <div className="space-y-2">
          {st.docs.map((d) => <BrandDocRow key={d.id} d={d} canEdit={own} busy={busy} onView={() => openDoc(d)} onRemove={() => removeDoc(d)} onNote={(note) => run({ action: "updateDoc", id: d.id, note }, dirtyRef.current)} />)}
          {!st.docs.length && <div className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-center text-[12px] text-gray-400">No brand documents yet.</div>}
        </div>
        {fromCrm && st.docs.length > 0 && <div className="text-[11.5px] text-gray-500">These documents come from the CRM's Brand Voice. They can be given a note or removed here once the agent has its own copy.</div>}
        <div className="flex flex-wrap items-center gap-2">
          <label className={"inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white " + (busy ? "pointer-events-none opacity-50" : "")} style={{ background: accent }}>
            <Upload size={13} /> Upload documents
            <input type="file" accept=".docx,.txt,.md,.markdown,text/plain,text/markdown" multiple className="hidden" onChange={(e) => { const files = e.target.files; addFiles(files); e.target.value = ""; }} />
          </label>
          <Btn ghost disabled={busy} onClick={() => setPaste(paste ? null : { name: "", note: "", text: "" })}><Plus size={13} /> Paste text</Btn>
          <span className="text-[11.5px] text-gray-500">Word (.docx), text (.txt) or Markdown (.md). For a PDF, copy its text and paste it.</span>
        </div>
        {msg && msg.docs && <div className={"rounded-lg px-3 py-2 text-[12px] " + (msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800")} role="status">{msg.text}</div>}
        {paste && (
          <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Labeled label="Document name"><input className={inputCls} placeholder="Tone of voice guide" value={paste.name} onChange={(e) => setPaste({ ...paste, name: e.target.value })} /></Labeled>
              <Labeled label="What it is and when to use it (optional)"><input className={inputCls} placeholder="Use for every page and post" value={paste.note} onChange={(e) => setPaste({ ...paste, note: e.target.value })} /></Labeled>
            </div>
            <Labeled label="Text"><textarea className={inputCls + " resize-y"} rows={8} placeholder="Paste the document's text here." value={paste.text} onChange={(e) => setPaste({ ...paste, text: e.target.value })} /></Labeled>
            <div className="flex flex-wrap items-center gap-2">
              <Btn accent={accent} disabled={busy || !paste.name.trim() || paste.text.trim().length < 20} onClick={async () => { if (await addDoc(paste.name.trim(), paste.text, paste.note.trim())) setPaste(null); }}><Check size={13} /> Add document</Btn>
              <Btn ghost onClick={() => setPaste(null)}>Cancel</Btn>
              <span className="text-[11px] text-gray-400">{(paste.text.match(/\S+/g) || []).length.toLocaleString()} words</span>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[200px] flex-1"><div className="text-[13.5px] font-semibold text-gray-900">What the agent is told</div><div className="text-[11.5px] text-gray-500">The exact brand section a writing task receives, built from what is saved above.</div></div>
          <Btn ghost onClick={() => setTold(!told)} disabled={!st.preview}><Eye size={13} /> {told ? "Hide" : "Show"}</Btn>
        </div>
        {!st.preview && <div className="mt-2 text-[12px] text-gray-400">Nothing yet: the agent is told nothing about this brand.</div>}
        {told && st.preview && <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-[11.5px] leading-relaxed text-gray-700">{st.preview}</pre>}
      </Card>

      {view && (
        <Modal title={view.name} sub={view.loading ? "Loading…" : `${view.words != null ? view.words.toLocaleString() + " words. " : ""}This is the text the agent reads.`} onClose={() => setView(null)} wide>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-[12px] leading-relaxed text-gray-800">{view.text}</pre>
          {view.truncated && <div className="mt-2 text-[11.5px] text-gray-500">Only the first part is shown here. The agent can read all of it.</div>}
        </Modal>
      )}
    </>
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
const ACTIVE_UI = ["queued", "approved", "needs_approval", "running"];
function TasksView({ data, accent, act, busy, onOpen }) {
  const [filter, setFilter] = useState("all");
  const [find, setFind] = useState(""); const [onlyProject, setOnlyProject] = useState("");
  const [form, setForm] = useState({ projectId: data.projects[0]?.id || "", type: "custom", title: "", instructions: "", priority: "normal", due: "" });
  const types = data.catalog.filter((c) => !!c.agencyOnly === (form.projectId === "_agency"));
  useEffect(() => { if (!types.some((c) => c.key === form.type)) setForm((f) => ({ ...f, type: types[0]?.key || "" })); }, [form.projectId]);   // eslint-disable-line react-hooks/exhaustive-deps
  const cat = data.catalog.find((c) => c.key === form.type);
  const pname = (id) => data.projects.find((p) => p.id === id)?.name || "Removed project";
  const label = (k) => data.catalog.find((c) => c.key === k)?.label || k;
  const FILTERS = [["all", "All"], ["waiting", "Waiting"], ["needs_approval", "Needs approval"], ["running", "Running"], ["done", "Done"], ["problem", "Failed or stopped"]];
  const match = (t) => filter === "all" || (filter === "waiting" ? ["queued", "approved"].includes(t.status) : filter === "problem" ? ["failed", "stopped"].includes(t.status) : t.status === filter);
  const words = find.trim().toLowerCase();
  const narrowed = data.tasks.filter((t) => (!onlyProject || t.projectId === onlyProject) && (!words || `${t.title} ${label(t.type)} ${pname(t.projectId)} ${t.summary || ""}`.toLowerCase().includes(words)));
  const rows = narrowed.filter(match);
  const add = async () => { const o = await act("task/create", { projectId: form.projectId, type: form.type, title: form.title, instructions: form.instructions, priority: form.priority, dueAt: form.due ? new Date(form.due + "T23:59:59").getTime() : 0 }); if (o) setForm((f) => ({ ...f, title: "", instructions: "", priority: "normal", due: "" })); };

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
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[12.5px] text-gray-700">Priority
            <select className={selCls} aria-label="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="high">High: before other waiting tasks</option><option value="normal">Normal</option><option value="low">Low: after the others</option></select>
          </label>
          <label className="flex items-center gap-2 text-[12.5px] text-gray-700">Due (optional)
            <input type="date" className={selCls} aria-label="Due date" value={form.due} min={dayInput(Date.now())} onChange={(e) => setForm({ ...form, due: e.target.value })} />
          </label>
          <Btn accent={accent} onClick={add} disabled={busy || !form.projectId || !form.type}><Plus size={13} /> Add task</Btn><span className="text-[11.5px] text-gray-500">It starts when a device is free and the project's limits allow it. A task past its due date shows under Alerts.</span>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-100 px-4 py-3">
          {FILTERS.map(([k, l]) => { const n = k === "all" ? narrowed.length : narrowed.filter((t) => (k === "waiting" ? ["queued", "approved"].includes(t.status) : k === "problem" ? ["failed", "stopped"].includes(t.status) : t.status === k)).length;
            return <button key={k} onClick={() => setFilter(k)} className="rounded-full border px-2.5 py-1 text-[11.5px] font-semibold" style={filter === k ? { background: accent, color: "#fff", borderColor: accent } : { color: "#4B5563", borderColor: "#E5E7EB" }}>{l} {n}</button>; })}
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <select className={selCls} aria-label="Show tasks of one project" value={onlyProject} onChange={(e) => setOnlyProject(e.target.value)}><option value="">All projects</option>{data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <input className={selCls + " w-44"} type="search" aria-label="Find a task" placeholder="Find a task…" value={find} onChange={(e) => setFind(e.target.value)} />
          </span>
        </div>
        {!rows.length && <div className="px-4 py-8 text-center text-[12.5px] text-gray-400">No tasks here yet.</div>}
        {rows.map((t) => { const [sl, fg, bg] = STATUS[t.status] || [t.status, "#6B7280", "#F3F4F6"];
          return (
            <button key={t.id} onClick={() => onOpen(t.id)} className="grid w-full items-center gap-x-3 gap-y-1 border-t border-gray-100 px-4 py-2.5 text-left hover:bg-gray-50 md:grid-cols-[130px_minmax(0,1fr)_auto]">
              <span><Chip fg={fg} bg={bg}>{sl}</Chip></span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-gray-900">{t.title}{t.priority === "high" && ACTIVE_UI.includes(t.status) && <span className="ml-2 align-middle"><Chip fg="#B91C1C" bg="#FEE2E2">High priority</Chip></span>}{t.priority === "low" && ACTIVE_UI.includes(t.status) && <span className="ml-2 align-middle"><Chip>Low priority</Chip></span>}{t.dueAt > 0 && ACTIVE_UI.includes(t.status) && <span className="ml-2 align-middle"><Chip fg={t.dueAt < Date.now() ? "#B91C1C" : "#374151"} bg={t.dueAt < Date.now() ? "#FEE2E2" : "#F3F4F6"}>Due {dayText(t.dueAt)}</Chip></span>}</span>
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
  const [fbNote, setFbNote] = useState(""); const [fbMsg, setFbMsg] = useState("");
  const [edit, setEdit] = useState(null);
  const rate = async (rating) => {
    setFbMsg("");
    try { const o = await api("task/feedback", { id, rating, note: fbNote }); setT(o.task); setFbNote(""); setFbMsg(o.task.feedback.lessonId ? "Saved, and added to what the agent has learned." : "Saved."); }
    catch (e) { setFbMsg(String(e.message || e)); }
  };
  const load = useCallback(() => api("task/get", { id }).then((o) => { setT(o.task); setDetails((d) => d || o.task.proposal?.details || ""); }).catch((e) => setErr(String(e.message || e))), [id]);
  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, [load]);
  const doAct = async (action, extra = {}) => { const o = await act("task/action", { id, action, ...extra }); if (o) { await load(); if (action === "cancel" || action === "reject") onClose(); } };
  if (!t) return <Modal title="Task" onClose={onClose} wide><div className="text-[13px] text-gray-500">{err || "Loading…"}</div></Modal>;
  const [sl, fg, bg] = STATUS[t.status] || [t.status, "#6B7280", "#F3F4F6"];
  /* a click beside the dialog closes it: not without asking when a proposal was edited or a change is half typed */
  const unsaved = (t.status === "needs_approval" && (details.trim() !== String(t.proposal?.details || "").trim() || note.trim() !== "")) || !!edit;
  const close = async () => { if (unsaved && !(await askConfirm({ title: "Close without saving?", message: "What you typed in this task is not saved yet and will be lost.", confirmLabel: "Close anyway" }))) return; onClose(); };
  return (
    <Modal title={t.title} sub={`${t.projectName} · ${t.type.replace(/_/g, " ")}`} onClose={close} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-600">
          <Chip fg={fg} bg={bg}>{sl}</Chip>
          {t.usage.total > 0 && <span>{fmtTok(t.usage.total)} tokens in {t.usage.calls} Claude call{t.usage.calls === 1 ? "" : "s"} · about {usd(t.usage.costUsd)}</span>}
          {t.seoCalls > 0 && <span>{t.seoCalls} DataForSEO request{t.seoCalls === 1 ? "" : "s"} · {usd4(t.seoUsd || 0)}</span>}
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
            <CheckNote check={t.proposal?.check} />
            <div className="mt-2 text-[11px] text-amber-800">Nothing has been changed yet. Edit the text below if needed; the agent carries out exactly what you approve.</div>
            <textarea className={inputCls + " mt-2 h-40 font-mono text-[12px]"} value={details} onChange={(e) => setDetails(e.target.value)} />
            <input className={inputCls + " mt-2"} placeholder="Note to the agent (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="mt-2 flex gap-2"><Btn accent="#15803D" onClick={() => doAct("approve", { details, note })}><Check size={13} /> Approve</Btn><Btn ghost danger onClick={() => doAct("reject", { note })}>Reject</Btn></div>
          </div>
        )}
        {t.result?.check && !t.approval && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-emerald-900"><ShieldCheck size={15} /> Carried out without a person's approval, after the second check passed this plan</div>
            <div className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-white/70 p-2 font-mono text-[12px] text-gray-800">{t.result.plan}</div>
          </div>
        )}
        {(t.evidence || []).length > 0 && <Proof task={t} />}
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
        {t.result?.report && <div><div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Report</div><div className="rounded-xl border border-gray-200 p-3" onClick={openLinkOutside}>{renderMd(t.result.report)}</div></div>}

        {["done", "stopped"].includes(t.status) && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div className="text-[12.5px] font-semibold text-gray-900">Was this good work?</div>
            <div className="text-[11.5px] text-gray-500">Your verdict becomes a lesson for the next task of this kind on this project.</div>
            {t.feedback && <div className="mt-1.5 text-[12px] text-gray-700">{t.feedback.by} rated it <b>{t.feedback.rating === "good" ? "good" : "needs work"}</b> {relTime(t.feedback.at)}{t.feedback.note ? `: ${t.feedback.note}` : ""}</div>}
            <input className={inputCls + " mt-2"} placeholder="What was good, or what should be different next time" value={fbNote} onChange={(e) => setFbNote(e.target.value)} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Btn ghost onClick={() => rate("good")}><ThumbsUp size={13} /> Good</Btn>
              <Btn ghost onClick={() => rate("bad")}><ThumbsDown size={13} /> Needs work</Btn>
              {fbMsg && <span className="text-[11.5px] text-gray-600" role="status">{fbMsg}</span>}
            </div>
          </div>
        )}

        {(t.events || []).length > 0 && (
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold text-gray-600">What the agent did ({t.events.length} steps)</summary>
            <ol className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg bg-gray-50 p-2.5 font-mono text-[11px] text-gray-600">{t.events.map((e, i) => <li key={i}><span className="text-gray-400">{new Date(e.at).toLocaleTimeString()}</span> {e.text}</li>)}</ol>
          </details>
        )}
        {edit && (
          <div className="rounded-xl border border-gray-200 p-3">
            <div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Change this task before it starts</div>
            <input className={inputCls + " mt-2"} aria-label="Title" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            <textarea className={inputCls + " mt-2 h-24"} aria-label="Instructions" placeholder="Instructions" value={edit.instructions} onChange={(e) => setEdit({ ...edit, instructions: e.target.value })} />
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[12.5px] text-gray-700">
              <label className="flex items-center gap-2">Priority <select className={selCls} value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value })}><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></label>
              <label className="flex items-center gap-2">Due <input type="date" className={selCls} value={edit.due} onChange={(e) => setEdit({ ...edit, due: e.target.value })} /></label>
              <Btn accent={accent} onClick={async () => { await doAct("edit", { title: edit.title, instructions: edit.instructions, priority: edit.priority, dueAt: edit.due ? new Date(edit.due + "T23:59:59").getTime() : 0 }); setEdit(null); }}><Check size={13} /> Save</Btn>
              <Btn ghost onClick={() => setEdit(null)}>Close</Btn>
            </div>
          </div>
        )}
        <div className="flex gap-2 border-t border-gray-100 pt-3">
          {!edit && ["queued", "failed", "stopped", "cancelled"].includes(t.status) && <Btn ghost onClick={() => setEdit({ title: t.title, instructions: t.instructions || "", priority: t.priority || "normal", due: t.dueAt ? dayInput(t.dueAt) : "" })}><PencilLine size={13} /> Change</Btn>}
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
/* One held request per open conversation: the server answers the moment the
   conversation or its directions change, so the screen is live without asking
   every second. Returns the state and the actions. */
function useProjectChat(chatId) {
  const [chat, setChat] = useState(null); const [err, setErr] = useState(""); const [sending, setSending] = useState(false);
  useEffect(() => {
    setChat(null); setErr("");
    if (!chatId) return undefined;
    let stop = false, v = -1;
    const ctrl = new AbortController();
    const nap = (ms) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      while (!stop) {
        if (document.visibilityState !== "visible") { await nap(1500); continue; }
        try {
          const r = await fetch("/api/agentops/chat/get", { method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ projectId: chatId, wait: v >= 0, v }) });
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
  }, [chatId]);
  const call = useCallback(async (path, body) => { try { const o = await api(path, { projectId: chatId, ...body }); setChat(o); setErr(""); return o; } catch (e) { setErr(String(e.message || e)); return null; } }, [chatId]);
  const pending = !!chat?.pending;
  const send = useCallback(async (text) => { const msg = String(text || "").trim(); if (!msg || sending || pending) return false; setSending(true); const o = await call("chat/send", { text: msg }); setSending(false); return !!o; }, [call, sending, pending]);
  return { chat, err, pending, sending, send, call, canSend: !!chat && !chat.blocked && !pending && !sending };
}
const agentLine = (a) => (!a ? null : a.listening.length ? { tone: "#15803D", text: `${a.listening.join(", ")} is listening and answers within seconds.`, short: "Agent online, answers in seconds" }
  : a.outdated.length ? { tone: "#B45309", text: `${a.outdated.join(", ")} is online but runs an agent version without chat. Publish a newer version under Devices & updates.`, short: "Agent needs an update to chat" }
  : { tone: "#6B7280", text: "No device is online. Your message is answered as soon as the agent is running.", short: "Agent offline, your message will wait" });

function ChatMessages({ c, project, accent, compact }) {
  const { chat, pending, canSend, send, call } = c;
  const boxRef = useRef(null);
  const last = chat?.messages[chat.messages.length - 1];
  useEffect(() => { const el = boxRef.current; if (el) el.scrollTop = el.scrollHeight; }, [chat?.messages.length, last?.activity, pending, project.id]);
  const a = chat?.agent;
  return (
    <div ref={boxRef} className={`flex-1 space-y-2.5 overflow-y-auto bg-gray-50 ${compact ? "px-3 py-3" : "px-4 py-4"}`} style={compact ? undefined : { height: "max(300px, calc(100vh - 480px))" }}>
      {!chat && <div className="py-10 text-center text-[12.5px] text-gray-400">Loading the conversation…</div>}
      {chat && chat.total > chat.messages.length && <div className="text-center text-[10.5px] text-gray-400">Showing the latest {chat.messages.length} of {chat.total} messages. All of them are kept.</div>}
      {chat && !chat.messages.length && (
        <div className="mx-auto max-w-md py-6 text-center">
          {!compact && <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: accent + "1A", color: accent }}><Bot size={20} /></div>}
          <div className="mt-2 text-[13px] font-semibold text-gray-900">Talk to the agent about {project.name}</div>
          <div className="mt-1 text-[11.5px] text-gray-500">Ask how the project is doing, tell it what to do, or tell it how you want the work done. Everything you say here is kept as its memory and directions.</div>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">{STARTERS.slice(0, compact ? 2 : 4).map((q) => <button key={q} disabled={!canSend} onClick={() => send(q)} className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[11.5px] text-gray-700 hover:border-gray-300 disabled:opacity-40">{q}</button>)}</div>
        </div>
      )}
      {chat?.messages.map((m) => m.system ? (
        <div key={m.id} className={`text-center text-[11px] ${m.error ? "text-red-700" : "text-gray-400"}`}>{m.text}</div>
      ) : m.role === "user" ? (
        <div key={m.id} className="flex justify-end">
          <div className={compact ? "max-w-[86%]" : "max-w-[78%]"}>
            <div className="whitespace-pre-wrap rounded-2xl rounded-br-md px-3.5 py-2 text-[13px] leading-5 text-white" style={{ background: accent }}>{m.text}</div>
            <div className="mt-0.5 text-right text-[10px] text-gray-400">{m.by || "You"} · {relTime(m.at)}{m.status === "cancelled" ? " · stopped" : ""}</div>
          </div>
        </div>
      ) : (
        <div key={m.id} className="flex justify-start gap-2">
          {!compact && <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: accent + "1A", color: accent }}><Bot size={15} /></span>}
          <div className={`min-w-0 ${compact ? "max-w-[90%]" : "max-w-[84%]"}`}>
            <div className={`rounded-2xl rounded-bl-md border px-3.5 py-1.5 ${m.error ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"}`} onClick={openLinkOutside}>{renderMd(m.text)}</div>
            <div className="mt-0.5 text-[10px] text-gray-400">{m.device || "Agent"} · {relTime(m.at)}{m.tokens ? ` · ${fmtTok(m.tokens)} tokens · ${usd(m.costUsd)}` : ""}</div>
          </div>
        </div>
      ))}
      {pending && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-gray-200 bg-white px-3.5 py-2 text-[12.5px] text-gray-600">
            <span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400" style={{ animationDelay: i * 0.2 + "s" }} />)}</span>
            {last?.status === "queued" ? (a?.listening.length ? "Sending to the agent…" : "Waiting for the agent to come online…") : (last?.activity || "Thinking") + "…"}
          </div>
          <button onClick={() => call("chat/stop", {})} className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-gray-500 hover:text-red-700"><Square size={11} /> Stop</button>
        </div>
      )}
    </div>
  );
}
function ChatComposer({ c, project, accent, compact, goTasks }) {
  const { chat, err, canSend, send } = c;
  const [text, setText] = useState("");
  useEffect(() => { setText(""); }, [project.id]);
  const go = async () => { if (await send(text)) setText(""); };
  return (
    <div className={`border-t border-gray-100 bg-white ${compact ? "px-2.5 pb-3 pt-2" : "p-3"}`}>
      {chat?.blocked && <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-900"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{chat.blocked}</div>}
      {err && <div className="mb-2 text-[11.5px] text-red-700">{err}</div>}
      <div className="flex items-end gap-2">
        <textarea aria-label={`Message about ${project.name}`} rows={compact ? 1 : 2} className={compact ? "h-[38px] min-w-0 flex-1 resize-none rounded-full border border-gray-200 bg-gray-50 px-3.5 py-2 text-[13px]" : inputCls + " min-h-[44px] flex-1 resize-none"} placeholder={compact ? "Message the agent…" : `Ask about ${project.name}, or tell the agent what to do…`} value={text} disabled={!!chat?.blocked}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); go(); } }} />
        {compact
          ? <button aria-label="Send" disabled={!canSend || !text.trim()} onClick={go} className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40" style={{ background: accent }}><Send size={15} /></button>
          : <Btn accent={accent} disabled={!canSend || !text.trim()} onClick={go}><Send size={13} /> Send</Btn>}
      </div>
      {!compact && <div className="mt-1.5 text-[11px] text-gray-400">Enter sends, Shift+Enter starts a new line. Work you ask for is queued as a task; see <button className="underline" onClick={goTasks}>Tasks</button> for reports and approvals.</div>}
    </div>
  );
}
/* the chat as a phone screen: always visible at the top of a project */
function PhoneChat({ c, project, accent }) {
  const line = agentLine(c.chat?.agent);
  return (
    <div className="relative mx-auto h-[632px] w-[348px] shrink-0 rounded-[42px] bg-[#0B1020] p-[11px] shadow-xl" style={{ boxShadow: "0 14px 34px rgba(15,23,42,.28), inset 0 0 0 2px #2A3350" }}>
      <div className="absolute left-1/2 top-5 z-10 h-[22px] w-[92px] -translate-x-1/2 rounded-full bg-[#0B1020]" />
      <div className="flex h-full flex-col overflow-hidden rounded-[32px] bg-gray-50">
        <div className="flex items-center gap-2.5 border-b border-gray-100 bg-white px-3.5 pb-2.5 pt-10">
          <ProjectLogo project={project} size={32} />
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-semibold leading-tight text-gray-900">{project.name}</div>
            <div className="truncate text-[11px]" style={{ color: line?.tone || "#9CA3AF" }}>{line?.short || "Loading…"}</div>
          </div>
        </div>
        <ChatMessages c={c} project={project} accent={accent} compact />
        <ChatComposer c={c} project={project} accent={accent} compact />
      </div>
    </div>
  );
}
/* standing instructions for a project: saved from the chat or typed here */
function DirectionsCard({ c, project, accent }) {
  const [text, setText] = useState("");
  const list = c.chat?.directions || [];
  const add = async () => { const o = await c.call("direction", { action: "add", text }); if (o) setText(""); };
  return (
    <Card className="p-4">
      <div className="text-[13.5px] font-semibold text-gray-900">Directions for the agent</div>
      <div className="text-[11.5px] text-gray-500">How you want this project handled. Tell the agent in the chat and it keeps it here, or type one below. Every task and every answer for {project.name} follows them.</div>
      <div className="mt-2">
        {list.map((d, i) => (
          <div key={d.id} className="flex items-start gap-2 border-t border-gray-100 py-1.5 text-[12.5px] first:border-t-0">
            <span className="w-4 shrink-0 font-semibold text-gray-400">{i + 1}</span>
            <span className="min-w-0 flex-1 text-gray-800">{d.text}<span className="text-gray-400"> · {d.source === "chat" ? "from the chat" : `added by ${d.by}`} {relTime(d.at)}</span></span>
            <button aria-label="Remove direction" title="Remove" onClick={() => c.call("direction", { action: "remove", id: d.id })} className="shrink-0 text-gray-400 hover:text-red-700"><Trash2 size={13} /></button>
          </div>
        ))}
        {c.chat && !list.length && <div className="py-1.5 text-[12px] text-gray-400">None yet. For example: "Focus on emergency keywords first" or "Never mention prices".</div>}
      </div>
      <div className="mt-2 flex gap-2">
        <input className={inputCls + " min-w-0 flex-1"} placeholder="Add a direction" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) add(); }} />
        <Btn accent={accent} disabled={!text.trim()} onClick={add}><Plus size={13} /> Add</Btn>
      </div>
    </Card>
  );
}
function ChatView({ data, accent, pid, setPid, goTasks }) {
  const projects = data.projects.filter((p) => p.id !== "_agency");
  const project = projects.find((p) => p.id === pid) || projects[0] || null;
  const id = project?.id || "";
  const c = useProjectChat(id);
  if (!project) return <Card className="p-6 text-[13px] text-gray-500">Add a project first; each project gets its own conversation with the agent.</Card>;
  const avail = agentLine(c.chat?.agent);
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
      <div className="space-y-4">
        <Card className="flex flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold text-gray-900">{project.name}</div>
              {avail && <div className="flex items-center gap-1.5 text-[11.5px]" style={{ color: avail.tone }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: avail.tone }} />{avail.text}</div>}
            </div>
            <div className="flex items-center gap-3 text-[11.5px] text-gray-500">
              <span title="Chat counts against this project's token limit.">{fmtTok(project.usage.month)}{project.setting.tokensPerMonth ? ` of ${fmtTok(project.setting.tokensPerMonth)}` : ""} tokens this month</span>
              {c.chat?.messages.length > 0 && <button className="font-semibold text-gray-500 underline hover:text-gray-800" onClick={async () => { if (await askConfirm({ title: "Delete this conversation?", message: `Every message for ${project.name} is deleted and the agent starts the conversation fresh.`, note: "Directions, saved notes and task reports are kept.", confirmLabel: "Yes, delete the messages", danger: true })) c.call("chat/clear", {}); }}>Delete messages</button>}
            </div>
          </div>
          <ChatMessages c={c} project={project} accent={accent} />
          <ChatComposer c={c} project={project} accent={accent} goTasks={goTasks} />
        </Card>
        <DirectionsCard c={c} project={project} accent={accent} />
      </div>
    </div>
  );
}

/* ---------------- devices and agent updates ---------------- */
function DevicesView({ data, accent, act, busy, reload, setErr }) {
  const [name, setName] = useState(""); const [fresh, setFresh] = useState(null); const [copied, setCopied] = useState(false);
  const [version, setVersion] = useState(""); const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const [mayManage, setMayManage] = useState(true);
  const add = async () => { const o = await act("device/create", { name, canManage: mayManage }); if (o?.token) { setFresh({ name, token: o.token }); setName(""); reload(); } };
  const publish = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !/^\d+\.\d+\.\d+$/.test(version)) { setErr("Choose the .jar file and enter its version, for example 0.2.0."); return; }
    setUploading(true);
    try {
      const r = await fetch(`/api/agentops/release/upload?version=${encodeURIComponent(version)}`, { method: "POST", headers: { ...auth(), "Content-Type": "application/octet-stream" }, body: file });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.detail || j.error || `Upload failed (${r.status})`);
      setVersion(""); if (fileRef.current) fileRef.current.value = ""; setErr(""); reload();
    } catch (e) { setErr(String(e.message || e)); } finally { setUploading(false); }
  };
  const download = async () => {
    try {
      const r = await fetch("/api/agentops/release/download", { headers: auth() });
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
              <Btn ghost onClick={() => act("device/update", { id: d.id, canManage: !d.canManage })} disabled={busy} title="When on, limits, tasks, approvals, directions, playbooks and API keys can be changed in the agent's application on this computer. Devices and program versions are always managed here.">{d.canManage ? "Manages settings: on" : "Manages settings: off"}</Btn>
              <Btn ghost onClick={() => act("device/update", { id: d.id, paused: !d.paused })} disabled={busy}>{d.paused ? <><Play size={13} /> Resume</> : <><Pause size={13} /> Pause</>}</Btn>
              <Btn ghost danger onClick={async () => { if (await askConfirm({ title: "Remove this device?", message: `"${d.name}" will stop being able to connect.`, note: "Its token stops working at once. Register it again to bring it back.", confirmLabel: "Yes, remove", danger: true })) act("device/update", { id: d.id, revoke: true }); }}><Trash2 size={13} /></Btn>
            </div>
          ); })}
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 bg-gray-50 px-4 py-3">
          <input className={inputCls + " max-w-xs"} placeholder="Device name, for example Office PC" value={name} onChange={(e) => setName(e.target.value)} />
          <Btn accent={accent} onClick={add} disabled={!name.trim() || busy}><Plus size={13} /> Register device</Btn>
          <label className="flex items-center gap-1.5 text-[12px] text-gray-600" title="Limits, tasks, approvals, directions, playbooks and API keys can then be changed in the agent's application on that computer."><input type="checkbox" checked={mayManage} onChange={(e) => setMayManage(e.target.checked)} /> Settings can be managed from that computer</label>
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
        <div className="text-[11.5px] text-gray-500">{data.release ? `Published: version ${data.release.version} (${(data.release.size / 1048576).toFixed(1)} MB, ${relTime(data.release.at)} by ${data.release.by})${data.release.notes ? `: ${data.release.notes}` : ""}. Devices download it, verify it and restart by themselves, between tasks; "Sync for update" in the application's Settings does it at once.` : "No version is published yet. Copy serpsquad-agent.jar to the computer by hand the first time."}</div>
        <div className="mt-1 text-[11.5px] text-gray-500">A new version arrives here by itself whenever the agent's code changes on GitHub and the CRM is deployed. Uploading a file below is only for a version that was built by hand.</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {data.release && <Btn ghost onClick={download}><Download size={13} /> Download serpsquad-agent.jar</Btn>}
          <input ref={fileRef} type="file" accept=".jar" className="text-[12px]" aria-label="Agent jar file" />
          <input className={numCls + " w-24"} placeholder="0.2.0" aria-label="Version" value={version} onChange={(e) => setVersion(e.target.value.trim())} />
          <Btn accent={accent} onClick={publish} disabled={uploading}><Upload size={13} /> {uploading ? "Uploading…" : "Publish version"}</Btn>
        </div>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-[12px] leading-5 text-gray-600">
          <li>On the computer, install Java 21 or newer and put <code>serpsquad-agent.jar</code> in its own folder.</li>
          <li>Register the device above and copy its token.</li>
          <li>In that folder run <code>java -jar serpsquad-agent.jar</code> once. The agent opens as its own application window. Paste the token there and press Connect.</li>
          <li>The Claude API key comes from <b>API setup</b> here. A computer can also be given its own key under Settings in the application.</li>
          <li>From then on start it from the <b>SERP Squad Agent</b> shortcut on the Desktop or in the Start menu. Closing the window does not stop it; the icon near the clock reopens the window, pauses or quits. For Google profile tasks press "Open Chrome to sign in" under Settings and sign in yourself.</li>
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
/* ---------------- live SEO data: DataForSEO, reached through its MCP server ---------------- */
/* ---------------- the agent's own DataForSEO login, and what is left on it ---------------- */
function DfsLogin({ data, accent, act, busy }) {
  const s = data.seoData || {}, own = s.own || { set: false }, bal = s.balance || {};
  const [login, setLogin] = useState(""); const [password, setPassword] = useState(""); const [open, setOpen] = useState(false);
  const save = async () => { const o = await act("credentials", { kind: "dataforseo", action: "set", login, password }); if (o) { setLogin(""); setPassword(""); setOpen(false); } };
  return (
    <div className="mt-3 rounded-xl border border-gray-200 p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-[200px] flex-1">
          <div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">DataForSEO account balance</div>
          <div className="mt-0.5 text-[13px] text-gray-800">{!s.login ? "No login set" : bal.known ? <><b className="text-[18px] text-gray-900">{usd(bal.balance)}</b> left{bal.total ? <span className="text-gray-500"> of {usd(bal.total)} paid in</span> : null}<span className="text-gray-400"> · checked {relTime(bal.at)}</span></> : bal.detail ? <span className="text-red-700">{bal.detail}</span> : "Checking…"}</div>
        </div>
        <Btn ghost disabled={busy || !s.login} onClick={() => act("credentials", { kind: "dataforseo", action: "balance" })} title="Asks DataForSEO for the balance now. This request is free."><RefreshCw size={13} /> Check now</Btn>
      </div>
      <div className="mt-3 border-t border-gray-100 pt-3">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-gray-700">
          <span className="min-w-[200px] flex-1">{own.set ? <>The agent works with its own DataForSEO login <code className="rounded bg-gray-100 px-1">{own.hint}</code>{own.by ? ` (saved by ${own.by} ${relTime(own.updatedAt)})` : ""}.</> : s.login ? "The agent uses the DataForSEO login saved in Company Settings, API settings. You can give it its own here." : "Give the agent a DataForSEO login here, or save one in Company Settings, API settings."}</span>
          <Btn ghost onClick={() => setOpen(!open)}>{own.set ? "Replace" : "Set a login for the agent"}</Btn>
          {own.set && <Btn ghost danger disabled={busy} onClick={async () => { if (await askConfirm({ title: "Remove the agent's DataForSEO login?", message: "The agent goes back to the login saved in Company Settings, API settings, if there is one.", confirmLabel: "Remove" })) act("credentials", { kind: "dataforseo", action: "remove" }); }}>Remove</Btn>}
        </div>
        {open && (
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input className={inputCls} aria-label="DataForSEO API login" autoComplete="off" placeholder="API login (an email address)" value={login} onChange={(e) => setLogin(e.target.value)} />
            <input className={inputCls} type="password" aria-label="DataForSEO API password" autoComplete="new-password" placeholder="API password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Btn accent={accent} disabled={busy || login.trim().length < 3 || password.length < 6} onClick={save}><Check size={13} /> Check and save</Btn>
            <div className="text-[11.5px] leading-5 text-gray-500 sm:col-span-3">Both are on your DataForSEO dashboard under API Access (the API password is not your sign-in password). The login is checked with DataForSEO before it is saved, stored encrypted on the server beside the agent's Claude keys, never shown again, and never sent to the agent's computer or to Claude.</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- what the agent knows about a project (it starts every task and chat from this) ---------------- */
/* ---------- a tool's sign-in: typed here once, kept only on the agent's computer ---------- */
function siteOfUrl(u) {
  try { const h = new URL(u).hostname.toLowerCase(), parts = h.split("."); const three = parts.length > 2 && parts[parts.length - 1].length === 2 && ["co", "com", "org", "net", "ac", "gov", "edu"].includes(parts[parts.length - 2]); return parts.slice(three ? -3 : -2).join("."); } catch { return ""; }
}
function SignInRelay({ name, url, profileId, accent }) {
  const [v, setV] = useState(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [note, setNote] = useState("");
  const [open, setOpen] = useState(false); const [loginUrl, setLoginUrl] = useState(""); const [user, setUser] = useState(""); const [password, setPassword] = useState(""); const [waiting, setWaiting] = useState(0);
  const run = useCallback(async (body, quiet) => {
    if (!quiet) { setBusy(true); setErr(""); }
    try { const o = await api("signin", body); setV(o); return o; } catch (e) { if (!quiet) setErr(String(e.message || e)); return null; } finally { if (!quiet) setBusy(false); }
  }, []);
  useEffect(() => { run({ action: "list" }, true); }, [run]);
  useEffect(() => {
    if (!waiting) return undefined;
    const t = setInterval(async () => { const o = await run({ action: "list" }, true); if (Date.now() > waiting || (o && !o.waiting.length)) setWaiting(0); }, 3000);
    return () => clearInterval(t);
  }, [waiting, run]);
  const site = siteOfUrl(url);
  if (!site || !profileId) return <div className="mt-2 text-[11.5px] text-gray-400">Give the tool's address and choose its Chrome ID first; then its sign-in can be handed to the agent's computer here.</div>;
  const holders = (v?.devices || []).filter((d) => (d.signins || []).some((x) => x.site === site));
  const targets = (v?.devices || []).filter((d) => (d.profiles || []).includes(profileId));
  const pending = (v?.waiting || []).some((x) => x.site === site);
  const last = targets.map((d) => d.last).find((l) => l && l.site === site && !l.ok && !l.removed);
  const send = async () => { const o = await run({ action: "add", name: name || site, loginUrl: loginUrl.trim() || url, user, password, profileId }); setPassword(""); if (o) { setUser(""); setOpen(false); setWaiting(Date.now() + 90000); setNote("Handed over. The agent's computer keeps it; the CRM does not."); } };
  const remove = async (d) => { if (!(await askConfirm({ title: "Delete the saved sign-in?", message: `${d.name} deletes its saved sign-in for ${site}. The agent can then only use the tool while the Chrome ID is still signed in.`, confirmLabel: "Delete it", danger: true }))) return; const o = await run({ action: "remove", deviceId: d.id, site }); if (o) setWaiting(Date.now() + 60000); };
  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[12.5px] font-semibold text-gray-900">Sign-in for {name || site}</div>
        {holders.length ? <Chip fg="#15803D" bg="#DCFCE7">Saved on {holders.map((d) => d.name).join(", ")}</Chip> : pending ? <Chip fg="#92400E" bg="#FEF3C7">Being handed over…</Chip> : <Chip>No sign-in saved</Chip>}
      </div>
      <div className="mt-0.5 text-[11.5px] leading-5 text-gray-500">The user name and password are passed once to the computer that has this Chrome ID, which keeps them encrypted and types them into the tool's own sign-in page when the tool has signed it out. The CRM does not store them, they are not shown again, and they are never given to Claude. A tool that asks for a code or a captcha still needs a person.</div>
      {err && <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-800" role="alert">{err}</div>}
      {note && <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800" role="status">{note}</div>}
      {last && <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">The computer could not keep the sign-in {relTime(last.at)}: {last.detail || "no reason given"}</div>}
      {!targets.length && v && <div className="mt-2 text-[12px] text-amber-800">No computer reports Chrome ID {profileId} right now. Start the agent's application on its computer.</div>}
      {open ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="sm:col-span-2"><Labeled label="The tool's sign-in page"><input className={inputCls} value={loginUrl} maxLength={200} placeholder={url} onChange={(e) => setLoginUrl(e.target.value)} /></Labeled></div>
          <Labeled label="User name or email"><input className={inputCls} autoComplete="off" spellCheck={false} value={user} maxLength={200} onChange={(e) => setUser(e.target.value)} /></Labeled>
          <Labeled label="Password"><input className={inputCls} type="password" autoComplete="new-password" spellCheck={false} value={password} maxLength={300} onChange={(e) => setPassword(e.target.value)} /></Labeled>
          <div className="flex flex-wrap gap-2 sm:col-span-2"><Btn accent={accent} disabled={busy || !user.trim() || password.length < 4 || !targets.length} onClick={send}><KeyRound size={13} /> Hand it to {targets.map((d) => d.name).join(", ") || "the agent's computer"}</Btn><Btn ghost onClick={() => { setOpen(false); setPassword(""); }}>Cancel</Btn></div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2"><Btn ghost disabled={busy || !!waiting} onClick={() => { setOpen(true); setNote(""); }}><KeyRound size={13} /> {holders.length ? "Replace the sign-in" : "Enter the sign-in"}</Btn>{holders.map((d) => <Btn key={d.id} ghost danger disabled={busy || !!waiting} onClick={() => remove(d)}>Delete it from {d.name}</Btn>)}</div>
      )}
    </div>
  );
}

/* ---------- a website built from code: its repository, and how the agent gets in ---------- */
function RepoSetup({ project, accent, reload }) {
  const [v, setV] = useState(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [note, setNote] = useState("");
  const [repo, setRepo] = useState(null); const [copied, setCopied] = useState(false); const [waiting, setWaiting] = useState(0); const [token, setToken] = useState("");
  const run = useCallback(async (path, body, quiet) => {
    if (!quiet) { setBusy(true); setErr(""); }
    try { const o = await api(path, { projectId: project.id, ...body }); setV(o); return o; } catch (e) { if (!quiet) setErr(String(e.message || e)); return null; } finally { if (!quiet) setBusy(false); }
  }, [project.id]);
  useEffect(() => { run("repo", { action: "get" }); }, [run]);
  /* a key, a token or a test is handled by the agent's computer: look again until its answer is in */
  useEffect(() => {
    if (!waiting) return undefined;
    const t = setInterval(async () => { const o = await run("repo", { action: "get" }, true); if (Date.now() > waiting || (o && !o.repo?.asking)) { setWaiting(0); if (reload) reload(); } }, 3000);
    return () => clearInterval(t);
  }, [waiting, run, reload]);
  useEffect(() => { if (v && repo === null) setRepo(v.repo ? { url: v.repo.url, branch: v.repo.branch, mode: v.repo.mode, method: v.repo.method || "key", deviceId: v.repo.deviceId } : { url: "", branch: "main", mode: "branch", method: "key", deviceId: v.devices.length === 1 ? v.devices[0].id : "" }); }, [v, repo]);
  if (!v || !repo) return <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-[12px] text-gray-500">{err ? <span className="text-red-700">{err}</span> : "Loading the repository…"}</div>;
  const r = v.repo, devices = v.devices;
  const changed = !r || repo.url !== r.url || repo.branch !== r.branch || repo.mode !== r.mode || repo.deviceId !== r.deviceId || repo.method !== (r.method || "key");
  const save = async () => { const o = await run("repo", { action: "save", ...repo }); if (o) { setRepo(null); setNote("Repository saved."); if (reload) reload(); } };
  const ask = async (action, extra) => { const o = await run("repo", { action, ...extra }); if (o) setWaiting(Date.now() + 90000); return o; };
  const sendToken = async () => { const o = await ask("token", { token: token.trim() }); if (o) { setToken(""); setNote(`Handed to ${o.repo.deviceName}. It keeps the token; the CRM does not.`); } };
  const remove = async () => { if (!(await askConfirm({ title: "Remove the repository?", message: "The agent stops reading and changing this code. Also delete its key from the repository's deploy keys, or revoke its token in GitHub.", confirmLabel: "Remove", danger: true }))) return; const o = await run("repo", { action: "remove" }); if (o) { setRepo(null); if (reload) reload(); } };
  const host = r ? (r.url.match(/@([^:]+):/)?.[1] || "") : "", byToken = r?.method === "token", ready = r && (byToken ? !!r.tokenAt : !!r.publicKey);
  const mono = "mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 font-mono text-[11.5px] leading-5 outline-none focus:border-gray-400";
  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[12.5px] font-semibold text-gray-900">The repository, and how the agent gets in</div>
        {r ? <Chip fg={r.test?.ok ? "#15803D" : "#92400E"} bg={r.test?.ok ? "#DCFCE7" : "#FEF3C7"}>{r.test?.ok ? "Access works" : ready ? "Set up, not tested yet" : byToken ? "No token yet" : "No key yet"}</Chip> : <Chip>Not set up</Chip>}
      </div>
      <div className="mt-0.5 text-[11.5px] leading-5 text-gray-500">The agent reads the code for its audits and, in the task type <b>Change the website's code (repository)</b>, prepares exact file changes (a new post, a page edit, titles, structured data) for your approval and delivers them as a commit. It never runs the code and does not touch workflow, deployment, dependency or key files.</div>
      {err && <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-800" role="alert">{err}</div>}
      {note && <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800" role="status">{note}</div>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Labeled label="Repository address"><input className={inputCls} value={repo.url} maxLength={220} placeholder="https://github.com/owner/website" onChange={(e) => setRepo({ ...repo, url: e.target.value })} /></Labeled>
        <Labeled label="Branch the website is built from"><input className={inputCls} value={repo.branch} maxLength={80} placeholder="main" onChange={(e) => setRepo({ ...repo, branch: e.target.value })} /></Labeled>
        <Labeled label="How the agent gets in">
          <select className={inputCls} value={repo.method} onChange={(e) => setRepo({ ...repo, method: e.target.value })}><option value="key">Access key made on the agent's computer</option><option value="token">Access token from GitHub (it can open pull requests)</option></select>
        </Labeled>
        <Labeled label="How an approved change is delivered">
          <select className={inputCls} value={repo.mode} onChange={(e) => setRepo({ ...repo, mode: e.target.value })}><option value="branch">{repo.method === "token" ? "As a pull request for a person to review and merge (recommended)" : "To a branch of its own, for a person to review and merge (recommended)"}</option><option value="direct">Straight to the branch (the site rebuilds from it)</option></select>
        </Labeled>
        <Labeled label="Computer that works on the code">
          <select className={inputCls} value={repo.deviceId} onChange={(e) => setRepo({ ...repo, deviceId: e.target.value })}><option value="">Choose…</option>{devices.map((d) => <option key={d.id} value={d.id}>{d.name}{d.online ? "" : " (offline)"}</option>)}</select>
        </Labeled>
        <div className="flex flex-wrap items-end gap-2"><Btn accent={accent} disabled={busy || !changed || !repo.url.trim() || !repo.deviceId} onClick={save}>{r ? "Save changes" : "Save repository"}</Btn>{r && <Btn ghost danger disabled={busy} onClick={remove}>Remove</Btn>}</div>
      </div>
      <div className="mt-2 text-[11.5px] leading-5 text-gray-500">{repo.method === "token" ? <><b>Access token:</b> you create a token in GitHub that is limited to this one repository and paste it once. Easiest to set up, works on networks that block the key method, and the agent opens the pull request itself. GitHub only.</> : <><b>Access key:</b> the agent's computer makes a key pair and you add its public half to the repository. Nothing secret is typed anywhere and the key opens this one repository only. The agent delivers a branch and gives you the link to review it. Works with GitHub, GitLab and Bitbucket.</>}</div>
      {r && (
        <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
          {byToken ? (
            <div>
              <div className="text-[12.5px] font-semibold text-gray-900">1. The access token</div>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[12px] leading-5 text-gray-600">
                <li>In GitHub open your profile picture, Settings, Developer settings, Personal access tokens, <b>Fine-grained tokens</b>, Generate new token.</li>
                <li>Repository access: <b>Only select repositories</b>, and choose this repository.</li>
                <li>Permissions, Repository permissions: <b>Contents: Read and write</b> and <b>Pull requests: Read and write</b>. Nothing else.</li>
                <li>Generate the token, copy it (it starts with <span className="font-mono">github_pat_</span>) and paste it here.</li>
              </ol>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input className={inputCls + " max-w-[360px] font-mono text-[12px]"} type="password" autoComplete="off" spellCheck={false} aria-label="GitHub access token" placeholder="github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} />
                <Btn accent={accent} disabled={busy || !!waiting || !!r.asking || token.trim().length < 30} onClick={sendToken}><KeyRound size={13} /> Hand it to {r.deviceName}</Btn>
                {r.tokenAt && <Btn ghost danger disabled={busy || !!waiting} onClick={() => ask("token-remove")}>Remove the token</Btn>}
              </div>
              <div className="mt-1 text-[11.5px] leading-5 text-gray-500">{r.asking === "token" ? `Waiting for ${r.deviceName} to take it (within a minute when it is online and not in the middle of a task)…` : r.tokenAt ? <span style={{ color: "#15803D" }}><Check size={12} className="mr-1 inline" />{r.deviceName} holds the token since {relTime(r.tokenAt)}.</span> : "No token on that computer yet."} The token is kept encrypted on that computer only. The CRM passes it on once and does not store it, it is not shown again, and it is never given to Claude.</div>
            </div>
          ) : (
            <div>
              <div className="text-[12.5px] font-semibold text-gray-900">1. The access key</div>
              <div className="mt-0.5 text-[11.5px] leading-5 text-gray-500">{r.deviceName} makes a key pair for this project. The private half never leaves that computer: it is not sent to the CRM, shown anywhere or given to Claude. The public half appears here for you to add to the repository.</div>
              {r.publicKey ? (
                <>
                  <textarea readOnly rows={2} className={mono} value={r.publicKey} aria-label="Public key" onFocus={(e) => e.target.select()} />
                  <div className="mt-1.5 flex flex-wrap items-center gap-2"><Btn ghost onClick={() => { navigator.clipboard?.writeText(r.publicKey); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy the public key</>}</Btn><span className="text-[11.5px] text-gray-500">Made {relTime(r.keyAt)}.</span></div>
                  <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-[12px] leading-5 text-gray-600">
                    {host === "github.com" ? <><li>On GitHub open the repository, then Settings, Deploy keys, Add deploy key.</li><li>Paste the public key, give it a title such as "SERP Squad agent", and tick <b>Allow write access</b>.</li></>
                      : host === "gitlab.com" ? <><li>On GitLab open the project, then Settings, Repository, Deploy keys.</li><li>Paste the public key and tick <b>Grant write permissions to this key</b>.</li></>
                      : <><li>On Bitbucket open the repository, then Repository settings, Access keys, Add key, and paste the public key.</li><li>Bitbucket access keys can only read. To let the agent deliver changes, add the key to a user account that may write to this repository instead.</li></>}
                    <li>Come back here and press Test access.</li>
                  </ol>
                </>
              ) : <div className="mt-2"><Btn accent={accent} disabled={busy || !!waiting || !!r.asking} onClick={() => ask("key")}><KeyRound size={13} /> Create the access key on {r.deviceName}</Btn>{r.asking === "key" && <span className="ml-2 text-[12px] text-gray-500">Asking {r.deviceName}…</span>}</div>}
            </div>
          )}
          <div>
            <div className="text-[12.5px] font-semibold text-gray-900">2. Test access</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2"><Btn ghost disabled={busy || !!waiting || !!r.asking || !ready} onClick={() => ask("test")}><RefreshCw size={13} /> Test access</Btn>
              {r.asking === "test" ? <span className="text-[12px] text-gray-500">Asking {r.deviceName}… (the first test also downloads the code)</span>
                : r.test ? <span className="text-[12px]" style={{ color: r.test.ok ? "#15803D" : "#B91C1C" }}>{relTime(r.test.at)}: {r.test.detail || (r.test.ok ? "It works." : "It does not work.")}</span> : <span className="text-[12px] text-gray-400">Not tested yet.</span>}</div>
          </div>
          <div>
            <div className="text-[12.5px] font-semibold text-gray-900">3. Let the agent change the code</div>
            <div className="mt-0.5 text-[12px] leading-5 text-gray-600">{v.taskType?.mode === "off" ? <>The task type <b>Change the website's code (repository)</b> is switched off for this project. Switch it on under Onpage SEO. Reading the code for audits works without it.</> : <>The task type <b>Change the website's code (repository)</b> is on. Give the agent a task of that type (Tasks, New task) or ask for it in the chat: it prepares the exact change, you approve it, and it delivers the commit {r.mode === "direct" ? "straight to " + r.branch : byToken ? "as a pull request" : "to a branch for review"}.</>}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Resources: where the agent finds media for a project ---------- */
function Resources({ project, accent, reload, onSettings }) {
  const [v, setV] = useState(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [note, setNote] = useState("");
  const blank = { kind: "folder", location: "", deviceId: "", label: "", useFor: "", notFor: "" };
  const [form, setForm] = useState(blank); const [edit, setEdit] = useState(null); const [waiting, setWaiting] = useState(0);
  const run = useCallback(async (path, body, quiet) => {
    if (!quiet) { setBusy(true); setErr(""); }
    try { const o = await api(path, { projectId: project.id, ...body }); setV(o); return o; } catch (e) { if (!quiet) setErr(String(e.message || e)); return null; } finally { if (!quiet) setBusy(false); }
  }, [project.id]);
  useEffect(() => { run("resources", { action: "get" }); }, [run]);
  /* a check, a new key or a test is done by the agent's computer: look again until its answer is in */
  useEffect(() => {
    if (!waiting) return undefined;
    const t = setInterval(async () => { const o = await run("resources", { action: "get" }, true); if (Date.now() > waiting || (o && !o.sources.some((x) => x.ask))) setWaiting(0); }, 3000);
    return () => clearInterval(t);
  }, [waiting, run]);
  if (!v) return <Card className="p-4 text-[12.5px] text-gray-500">{err ? <span className="text-red-700">{err}</span> : "Loading the project's resources…"}</Card>;
  const devices = v.devices, oneDevice = devices.length === 1 ? devices[0].id : "";
  const f = { ...form, deviceId: form.deviceId || oneDevice };
  const choose = async () => { setErr(""); try { const r = await LOCAL_APP.chooseFolder(); if (r?.path) setForm((x) => ({ ...x, location: r.path })); } catch (e) { setErr(String(e.message || e)); } };
  const add = async () => { const o = await run("resources", { action: "add", ...f }); if (o) { setForm(blank); setNote("Added. The agent sees it from its next task."); if (reload) reload(); } };
  const saveEdit = async () => { const o = await run("resources", { action: "update", id: edit.id, label: edit.label, useFor: edit.useFor, notFor: edit.notFor }); if (o) { setEdit(null); setNote("Saved."); } };
  const remove = async (x) => { if (!(await askConfirm({ title: "Remove this source?", message: `"${x.label}" is taken off the list. The files themselves are not touched.`, confirmLabel: "Remove", danger: true }))) return; const o = await run("resources", { action: "remove", id: x.id }); if (o && reload) reload(); };
  const check = async (x) => { const o = await run("resources", { action: "check", id: x.id }); if (o) setWaiting(Date.now() + 45000); };
  const area = "mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12.5px] leading-5 outline-none focus:border-gray-400";
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-[13.5px] font-semibold text-gray-900">Photos, video and other media for {project.name}</div>
          <Chip>{v.sources.length} of {v.max}</Chip>
        </div>
        <div className="mt-0.5 text-[11.5px] leading-5 text-gray-500">Nothing is uploaded here. Point the agent at the folders that hold this client's photos and media: a folder on the agent's computer, or a Google Drive folder shared with "Anyone with the link". It uses them for blog posts, page work, Business Profile photos and the pictures in link-building content. For each one, say what it is for and what it must not be used for: the agent is given those notes with every task and looks at a picture before it chooses it. The files stay where they are; only the place and your notes are kept in the CRM.</div>
        {err && <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-800" role="alert">{err}</div>}
        {note && <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800" role="status">{note}</div>}
        <div className="mt-3 space-y-3">
          {!v.sources.length && <div className="rounded-lg bg-gray-50 px-3 py-3 text-[12.5px] text-gray-500">No media source yet. Add the first one below.</div>}
          {v.sources.map((x, i) => (
            <div key={x.id} className="rounded-xl border border-gray-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-gray-900">{i + 1}. {x.label} <Chip>{x.kind === "drive" ? "Google Drive folder" : "Folder on " + (x.deviceName || "the agent's computer")}</Chip></div>
                  <div className="mt-0.5 break-all font-mono text-[11.5px] text-gray-500">{x.location}</div>
                </div>
                <div className="flex items-center gap-2"><Btn ghost disabled={busy || !!waiting} onClick={() => check(x)} title="Asks the agent's computer to open it and count what is there."><RefreshCw size={13} /> Check</Btn><Btn ghost disabled={busy} onClick={() => setEdit({ id: x.id, label: x.label, useFor: x.useFor, notFor: x.notFor })}><PencilLine size={13} /> Edit notes</Btn><Btn ghost danger disabled={busy} onClick={() => remove(x)}>Remove</Btn></div>
              </div>
              {x.ask ? <div className="mt-2 text-[12px] text-gray-500">Asking the agent's computer… (it answers at its next check-in, within a minute when it is online and not in the middle of a task)</div>
                : x.check ? <div className="mt-2 text-[12px]" style={{ color: x.check.ok ? "#15803D" : "#B91C1C" }}>{x.check.ok ? <><Check size={12} className="mr-1 inline" />{x.check.device} opened it {relTime(x.check.at)}: {x.check.detail}</> : <>{x.check.device} could not open it {relTime(x.check.at)}: {x.check.detail}</>}</div> : null}
              {edit?.id === x.id ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <Labeled label="Name"><input className={inputCls} value={edit.label} maxLength={80} onChange={(e) => setEdit({ ...edit, label: e.target.value })} /></Labeled><div />
                  <Labeled label="Use these for"><textarea rows={3} className={area} value={edit.useFor} maxLength={600} onChange={(e) => setEdit({ ...edit, useFor: e.target.value })} /></Labeled>
                  <Labeled label="Do not use these for"><textarea rows={3} className={area} value={edit.notFor} maxLength={600} onChange={(e) => setEdit({ ...edit, notFor: e.target.value })} /></Labeled>
                  <div className="flex gap-2 md:col-span-2"><Btn accent={accent} disabled={busy} onClick={saveEdit}>Save notes</Btn><Btn ghost onClick={() => setEdit(null)}>Cancel</Btn></div>
                </div>
              ) : (
                <div className="mt-2 grid gap-3 text-[12.5px] leading-5 md:grid-cols-2">
                  <div><div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Use for</div><div className="whitespace-pre-wrap text-gray-700">{x.useFor || <span className="text-gray-400">Nothing noted: the agent may use these wherever a picture of this client fits.</span>}</div></div>
                  <div><div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Do not use for</div><div className="whitespace-pre-wrap text-gray-700">{x.notFor || <span className="text-gray-400">Nothing noted.</span>}</div></div>
                </div>
              )}
            </div>
          ))}
        </div>
        {v.sources.length < v.max && (
          <div className="mt-4 rounded-xl border border-dashed border-gray-300 p-3">
            <div className="text-[12.5px] font-semibold text-gray-900">Add a source</div>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Kind of source">
              {[["folder", "A folder on the agent's computer"], ["drive", "A Google Drive link"]].map(([k, label]) => <button key={k} type="button" role="radio" aria-checked={f.kind === k} onClick={() => setForm({ ...form, kind: k, location: "" })} className="rounded-lg border px-3 py-1.5 text-[12.5px] font-medium" style={f.kind === k ? { background: accent, borderColor: accent, color: "#fff" } : { borderColor: "#E5E7EB", color: "#374151" }}>{label}</button>)}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {f.kind === "folder" ? (
                <>
                  <Labeled label="Folder (its full path on that computer)">
                    <div className="flex gap-2"><input className={inputCls} value={f.location} maxLength={380} placeholder="C:\Clients\Northgate\Photos" onChange={(e) => setForm({ ...form, location: e.target.value })} />{LOCAL_APP?.chooseFolder && <Btn ghost onClick={choose}><span className="flex items-center gap-1.5 whitespace-nowrap"><FolderInput size={13} /> Choose folder…</span></Btn>}</div>
                  </Labeled>
                  <Labeled label="On which computer">
                    <select className={inputCls} value={f.deviceId} onChange={(e) => setForm({ ...form, deviceId: e.target.value })}><option value="">Choose…</option>{devices.map((d) => <option key={d.id} value={d.id}>{d.name}{d.online ? "" : " (offline)"}</option>)}</select>
                  </Labeled>
                </>
              ) : (
                <Labeled label="Link to the Google Drive folder"><input className={inputCls} value={f.location} maxLength={300} placeholder="https://drive.google.com/drive/folders/…" onChange={(e) => setForm({ ...form, location: e.target.value })} /></Labeled>
              )}
              <Labeled label="Name (optional)"><input className={inputCls} value={f.label} maxLength={80} placeholder="Finished jobs 2026" onChange={(e) => setForm({ ...form, label: e.target.value })} /></Labeled>
              {f.kind === "folder" && <div />}
              <Labeled label="Use these for"><textarea rows={3} className={area} value={f.useFor} maxLength={600} placeholder="Blog posts and Business Profile photos about boiler work. Before-and-after pairs belong together." onChange={(e) => setForm({ ...form, useFor: e.target.value })} /></Labeled>
              <Labeled label="Do not use these for"><textarea rows={3} className={area} value={f.notFor} maxLength={600} placeholder="Nothing showing a customer's face or a house number. Not for directory listings." onChange={(e) => setForm({ ...form, notFor: e.target.value })} /></Labeled>
            </div>
            {f.kind === "drive" && <div className="mt-2 text-[11.5px] leading-5 text-gray-500">In Google Drive, share the folder with <b>Anyone with the link</b> (Viewer). The agent's computer reads it without signing in, so a private folder cannot be read. Google Docs, Sheets and Slides in it are skipped; files over 80 MB are too large to fetch this way.</div>}
            {f.kind === "folder" && !LOCAL_APP?.chooseFolder && <div className="mt-2 text-[11.5px] leading-5 text-gray-500">A web page cannot look into another computer's folders, so the path is typed here. In the agent's own application on that computer, this same screen has a <b>Choose folder</b> button.</div>}
            <div className="mt-3"><Btn accent={accent} disabled={busy || !f.location.trim() || (f.kind === "folder" && !f.deviceId)} onClick={add}><Plus size={13} /> Add source</Btn></div>
          </div>
        )}
      </Card>

      {(project.photos || 0) > 0 && <Photos key={"ph" + project.id} project={project} accent={accent} reload={reload} />}

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-[220px] flex-1">
            <div className="text-[13.5px] font-semibold text-gray-900">Website code (a repository)</div>
            <div className="mt-0.5 text-[11.5px] leading-5 text-gray-500">{v.repo ? <>Set up: <span className="font-mono">{v.repo.url}</span>, branch {v.repo.branch}. </> : "Not set up. "}A website that is built from code in a repository is set up under <b>Settings</b>, in the Website box: choose <b>GitHub repository</b> under "Built with".</div>
          </div>
          {onSettings && <Btn ghost onClick={onSettings}><Settings2 size={13} /> Open Settings</Btn>}
        </div>
      </Card>
    </div>
  );
}

function ProjectStatus({ project, accent }) {
  const [v, setV] = useState(null); const [err, setErr] = useState(""); const [edit, setEdit] = useState(null); const [busy, setBusy] = useState(false);
  const run = useCallback(async (body) => {
    setBusy(true); setErr("");
    try { const o = await api("status", { projectId: project.id, ...body }); setV(o); return o; } catch (e) { setErr(String(e.message || e)); return null; } finally { setBusy(false); }
  }, [project.id]);
  useEffect(() => { run({ action: "get" }); }, [run]);
  if (!v) return <Card className="p-4 text-[12.5px] text-gray-500">{err ? <span className="text-red-700">{err}</span> : "Loading what the agent knows…"}</Card>;
  const filled = v.sections.filter((x) => x.text).length;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[13.5px] font-semibold text-gray-900">What the agent knows about this project</div>
        <Chip>{filled} of {v.sections.length} sections filled</Chip>
      </div>
      <div className="mt-0.5 text-[11.5px] leading-5 text-gray-500">The agent does not look at a project afresh each time. It keeps what its work found out in these short sections, starts every task and every chat from them, and rewrites one when it learns something new. Correct anything that is wrong: the agent takes your version as the truth. The pages it fetched and its working files stay on its own computer.</div>
      {err && <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-800" role="alert">{err}</div>}
      <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-[12px] leading-5 text-gray-700"><b>Rankings now</b> (always from the rank tracker, never from memory): {v.rankings}</div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {v.sections.map((x) => (
          <div key={x.key} className="rounded-xl border border-gray-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12.5px] font-semibold text-gray-900">{x.label}</div>
              <span className="text-[11px] text-gray-400">{x.updatedAt ? `${x.by || "Agent"} · ${relTime(x.updatedAt)}` : "nothing yet"}</span>
            </div>
            {edit?.key === x.key ? (
              <>
                <textarea className={inputCls + " mt-2 h-40 text-[12.5px]"} aria-label={x.label} maxLength={v.max} value={edit.text} onChange={(e) => setEdit({ key: x.key, text: e.target.value })} />
                <div className="mt-2 flex items-center gap-2"><Btn accent={accent} disabled={busy} onClick={async () => { if (await run({ action: "set", section: x.key, text: edit.text })) setEdit(null); }}><Check size={13} /> Save</Btn><Btn ghost onClick={() => setEdit(null)}>Close</Btn><span className="text-[11px] text-gray-400">{edit.text.length} of {v.max}</span></div>
              </>
            ) : (
              <>
                <div className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap text-[12.5px] leading-5 text-gray-700">{x.text || <span className="text-gray-400">The agent fills this in as it works. You can also write it yourself.</span>}</div>
                <button type="button" className="mt-1.5 text-[11.5px] font-semibold text-blue-700 hover:underline" onClick={() => setEdit({ key: x.key, text: x.text })}>{x.text ? "Correct this" : "Write this"}</button>
              </>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ---------------- reports: the work that was done, and how the rankings moved ---------------- */
/* ---------- working documents: the folder where the agent saves what people open ---------- */
function WorkDocs({ project, accent }) {
  const [v, setV] = useState(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [note, setNote] = useState("");
  const [form, setForm] = useState(null); const [waiting, setWaiting] = useState(0);
  const run = useCallback(async (body, quiet) => {
    if (!quiet) { setBusy(true); setErr(""); }
    try { const o = await api("output", { projectId: project.id, ...body }); setV(o); return o; } catch (e) { if (!quiet) setErr(String(e.message || e)); return null; } finally { if (!quiet) setBusy(false); }
  }, [project.id]);
  useEffect(() => { run({ action: "get" }, true); }, [run]);
  useEffect(() => {
    if (!waiting) return undefined;
    const t = setInterval(async () => { const o = await run({ action: "get" }, true); if (Date.now() > waiting || (o && !o.output?.asking)) setWaiting(0); }, 3000);
    return () => clearInterval(t);
  }, [waiting, run]);
  useEffect(() => { if (v && form === null) setForm(v.output ? { folder: v.output.folder, deviceId: v.output.deviceId, driveUrl: v.output.driveUrl, note: v.output.note } : { folder: "", deviceId: v.devices.length === 1 ? v.devices[0].id : "", driveUrl: "", note: "" }); }, [v, form]);
  if (!v || !form) return <Card className="p-4 text-[12.5px] text-gray-500">{err ? <span className="text-red-700">{err}</span> : "Loading the working documents…"}</Card>;
  const o = v.output, changed = !o || form.folder !== o.folder || form.deviceId !== o.deviceId || (form.driveUrl || "") !== (o.driveUrl || "") || (form.note || "") !== (o.note || "");
  const choose = async () => { setErr(""); try { const r = await LOCAL_APP.chooseFolder(); if (r?.path) setForm((x) => ({ ...x, folder: r.path })); } catch (e) { setErr(String(e.message || e)); } };
  const save = async () => { const r = await run({ action: "save", ...form }); if (r) { setForm(null); setNote("Saved. The agent keeps its working documents there from its next task."); } };
  const remove = async () => { if (!(await askConfirm({ title: "Stop keeping working documents?", message: "The agent no longer saves Excel and Word files for this project. The files already in the folder are not touched.", confirmLabel: "Stop", danger: true }))) return; const r = await run({ action: "remove" }); if (r) setForm(null); };
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[13.5px] font-semibold text-gray-900">Working documents</div>
        {o ? <Chip fg={o.check?.ok === false ? "#B91C1C" : "#15803D"} bg={o.check?.ok === false ? "#FEE2E2" : "#DCFCE7"}>{o.check?.ok === false ? "Folder cannot be written" : "Folder set"}</Chip> : <Chip>Not set</Chip>}
      </div>
      <div className="mt-0.5 text-[11.5px] leading-5 text-gray-500">A folder where the agent saves what people open and work with: keyword research and prospect lists as Excel sheets, content plans and audits as Word documents. It adds to an existing sheet instead of starting a second one, and names the file in its report. <b>To have them in Google Drive:</b> choose a folder inside Google Drive for desktop on the agent's computer. The files then appear in your Drive by themselves and open there as Google Sheets and Docs. Paste that folder's Drive link below so the team can open it from here.</div>
      {err && <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-800" role="alert">{err}</div>}
      {note && <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800" role="status">{note}</div>}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Labeled label="Folder on the agent's computer (its full path)">
          <div className="flex gap-2"><input className={inputCls} value={form.folder} maxLength={380} placeholder="G:\My Drive\Clients\Northgate\Agent work" onChange={(e) => setForm({ ...form, folder: e.target.value })} />{LOCAL_APP?.chooseFolder && <Btn ghost onClick={choose}><span className="flex items-center gap-1.5 whitespace-nowrap"><FolderInput size={13} /> Choose folder…</span></Btn>}</div>
        </Labeled>
        <Labeled label="On which computer">
          <select className={inputCls} value={form.deviceId} onChange={(e) => setForm({ ...form, deviceId: e.target.value })}><option value="">Choose…</option>{v.devices.map((d) => <option key={d.id} value={d.id}>{d.name}{d.online ? "" : " (offline)"}</option>)}</select>
        </Labeled>
        <Labeled label="Google Drive link of that folder (optional)"><input className={inputCls} value={form.driveUrl} maxLength={300} placeholder="https://drive.google.com/drive/folders/…" onChange={(e) => setForm({ ...form, driveUrl: e.target.value })} /></Labeled>
        <Labeled label="What to keep there (optional note for the agent)"><input className={inputCls} value={form.note} maxLength={600} placeholder="Keyword research in one sheet per month. Plans as documents. English only." onChange={(e) => setForm({ ...form, note: e.target.value })} /></Labeled>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Btn accent={accent} disabled={busy || !changed || !form.folder.trim() || !form.deviceId} onClick={save}>{o ? "Save changes" : "Save folder"}</Btn>
        {o && <Btn ghost disabled={busy || !!waiting || o.asking} onClick={async () => { const r = await run({ action: "check" }); if (r) setWaiting(Date.now() + 45000); }}><RefreshCw size={13} /> Check the folder</Btn>}
        {o?.driveUrl && <a className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[12.5px] font-semibold text-gray-700 hover:bg-gray-50" href={o.driveUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open the folder in Google Drive</a>}
        {o && <Btn ghost danger disabled={busy} onClick={remove}>Remove</Btn>}
        {o?.asking ? <span className="text-[12px] text-gray-500">Asking {o.deviceName}…</span> : o?.check ? <span className="text-[12px]" style={{ color: o.check.ok ? "#15803D" : "#B91C1C" }}>{o.check.device} {relTime(o.check.at)}: {o.check.detail}</span> : null}
      </div>
      <div className="mt-2 text-[11px] leading-5 text-gray-400">The agent does not sign in to Google Drive itself: its Google sign-ins are barred from opening Drive, so that they can never be used to read your files. Google Drive for desktop does the syncing. Without it the files simply stay in the folder on that computer.</div>
    </Card>
  );
}

function Reports({ project, accent, onOpenTask, reload }) {
  const [sub, setSub] = useState("work");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Reports">
        {[["work", "Working report", ClipboardList], ["ranking", "Ranking report", BarChart3]].map(([k, label, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={sub === k} onClick={() => setSub(k)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold"
            style={sub === k ? { background: accent, color: "#fff", borderColor: accent } : { background: "#fff", color: "#374151", borderColor: "#E5E7EB" }}><Icon size={13} />{label}</button>
        ))}
      </div>
      {sub === "work" && <WorkDocs key={"wd" + project.id} project={project} accent={accent} />}
      {sub === "work" ? <WorkReport project={project} accent={accent} onOpenTask={onOpenTask} /> : <RankingReport project={project} accent={accent} onOpenTask={onOpenTask} reload={reload} />}
    </div>
  );
}
function RankingReport({ project, accent, onOpenTask, reload }) {
  const [r, setR] = useState(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [note, setNote] = useState("");
  const run = useCallback(async (action) => {
    setBusy(true); setErr("");
    try { const o = await api("ranking", { projectId: project.id, action }); setR(o); return o; } catch (e) { setErr(String(e.message || e)); return null; } finally { setBusy(false); }
  }, [project.id]);
  useEffect(() => { run("get"); }, [run]);
  if (!r) return <Card className="p-4 text-[12.5px] text-gray-500">{err ? <span className="text-red-700">{err}</span> : "Working out this week's report…"}</Card>;
  const w = r.week, k = w.rank, g = w.gsc || {}, off = r.taskType?.mode === "off";
  const day = (t) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const delta = (a, b, lowerIsBetter) => { if (a == null || b == null || a === b) return null; const good = lowerIsBetter ? a < b : a > b, d = Math.abs(a - b); return <span className="ml-1.5 text-[11.5px] font-semibold" style={{ color: good ? "#15803D" : "#B91C1C" }}>{a > b ? "▲" : "▼"} {Number.isInteger(d) ? d : d.toFixed(1)}</span>; };
  const tile = (label, now, before, lower) => <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5"><div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">{label}</div><div className="text-[20px] font-semibold text-gray-900">{now == null ? "–" : now}{delta(now, before, lower)}</div><div className="text-[11px] text-gray-500">a week ago: {before == null ? "–" : before}</div></div>;
  const moves = (title, list, good, empty) => (
    <div>
      <div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">{title}</div>
      {!list.length ? <div className="py-2 text-[12px] text-gray-400">{empty}</div> : list.map((x, i) => (
        <div key={i} className="flex items-center gap-2 border-t border-gray-100 py-1.5 text-[12.5px] first:border-t-0">
          <span className="min-w-0 flex-1 truncate text-gray-800" title={x.url}>{x.keyword}{x.city ? <span className="text-gray-400"> · {x.city}</span> : null}</span>
          <span className="whitespace-nowrap text-gray-500">{x.from} → <b className="text-gray-900">{x.to}</b></span>
          <span className="w-10 text-right text-[11.5px] font-semibold" style={{ color: good ? "#15803D" : "#B91C1C" }}>{good ? "+" : "−"}{x.by}</span>
        </div>
      ))}
    </div>
  );
  const gscRows = (title, list, good) => (
    <div>
      <div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">{title}</div>
      {!list?.length ? <div className="py-2 text-[12px] text-gray-400">None.</div> : list.slice(0, 6).map((x, i) => (
        <div key={i} className="flex items-center gap-2 border-t border-gray-100 py-1.5 text-[12.5px] first:border-t-0"><span className="min-w-0 flex-1 truncate text-gray-800" title={x.name}>{x.name}</span><span className="whitespace-nowrap text-gray-500">{x.before} → <b className="text-gray-900">{x.clicks}</b> clicks</span><span className="w-10 text-right text-[11.5px] font-semibold" style={{ color: good ? "#15803D" : "#B91C1C" }}>{good ? "+" : "−"}{Math.abs(x.clicks - x.before)}</span></div>
      ))}
    </div>
  );
  const review = async () => {
    setBusy(true); setErr(""); setNote("");
    try { await api("task/create", { projectId: project.id, type: "ranking_review", title: `Weekly ranking review: ${project.name}` }); setNote("Queued. The agent reads this report, says what moved and why, and queues the work that should follow. Its review appears here when it has finished."); if (reload) reload(); }
    catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };
  const top = Math.max(1, ...k.trend.map((x) => x.top10 || 0));
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-[220px] flex-1">
            <div className="text-[13.5px] font-semibold text-gray-900">Ranking report · week of {day(w.week + "T12:00:00")}</div>
            <div className="mt-0.5 text-[11.5px] leading-5 text-gray-500">What moved in the last seven days, from the rank tracker's scans (DataForSEO) and, where it is connected, Search Console. Worked out {relTime(w.at)}; it costs no tokens. The agent reviews it once a week and queues the work that should follow.</div>
          </div>
          <div className="flex items-center gap-2"><Btn ghost disabled={busy} onClick={() => run("refresh")}><RefreshCw size={13} /> Work it out again</Btn><Btn accent={accent} disabled={busy || off || w.demoData} title={off ? "Weekly ranking review is switched off for this project. Switch it on above, under the task types." : w.demoData ? "This project is on demo data." : ""} onClick={review}>Review it now</Btn></div>
        </div>
        {w.demoData && <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">This project is on demo data, so these rankings are made up. They are shown so you can see the report; no work is planned from them.</div>}
        {off && !w.demoData && <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">The task type <b>Weekly ranking review</b> is switched off for this project. Switch it on (and set it to start by itself every 7 days) for the agent to act on this report each week.</div>}
        {note && <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800" role="status">{note}</div>}
        {err && <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-800" role="alert">{err}</div>}
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          {tile("In the top 3", k.now.top3, k.before.top3)}{tile("In the top 10", k.now.top10, k.before.top10)}{tile("In the top 20", k.now.top20, k.before.top20)}{tile("Average position", k.now.avg, k.before.avg, true)}
        </div>
        <div className="mt-2 text-[12px] text-gray-600">{k.now.tracked} keywords tracked: <b style={{ color: "#15803D" }}>{k.upCount} went up</b>, <b style={{ color: "#B91C1C" }}>{k.downCount} went down</b>, {k.sameCount} did not move{k.now.notRanked ? `, ${k.now.notRanked} outside the top 100` : ""}.</div>
        <div className="mt-3">
          <div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Keywords in the top 10, last eight weeks</div>
          <div className="mt-1.5 flex h-20 items-end gap-2" role="img" aria-label={k.trend.map((x) => `${day(x.at)}: ${x.top10}`).join(", ")}>
            {k.trend.map((x, i) => <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${day(x.at)}: ${x.top10} in the top 10, ${x.top3} in the top 3`}><span className="text-[10px] font-semibold text-gray-700">{x.top10}</span><span className="w-full max-w-[40px] rounded-t" style={{ height: Math.max(3, Math.round(((x.top10 || 0) / top) * 48)) + "px", background: i === k.trend.length - 1 ? accent : accent + "55" }} /><span className="text-[9.5px] text-gray-400">{day(x.at)}</span></div>)}
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="grid gap-5 lg:grid-cols-2">
          {moves(`Went up (${k.upCount})`, k.up, true, "No keyword went up this week.")}
          {moves(`Went down (${k.downCount})`, k.down, false, "No keyword went down this week.")}
          {moves(`Entered the top 10 (${k.entered.length})`, k.entered, true, "None this week.")}
          {moves(`Left the top 10 (${k.left.length})`, k.left, false, "None this week.")}
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-[13.5px] font-semibold text-gray-900">Search Console</div>
        {!g.connected ? <div className="mt-1 text-[12.5px] text-gray-500">Search Console is not connected for this project in the CRM, so clicks and impressions are not in this report.</div>
          : g.error ? <div className="mt-1 text-[12.5px] text-red-700">{g.error}</div> : (
            <>
              <div className="mt-0.5 text-[11.5px] text-gray-500">{g.range.from} to {g.range.to}, against {g.range.beforeFrom} to {g.range.beforeTo}. Search Console is about three days behind.</div>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">{tile("Clicks", g.now.clicks, g.before.clicks)}{tile("Impressions", g.now.impressions, g.before.impressions)}{tile("Click rate, %", g.now.ctr, g.before.ctr)}{tile("Average position", g.now.position, g.before.position, true)}</div>
              <div className="mt-4 grid gap-5 lg:grid-cols-2">{gscRows("Queries that gained clicks", g.queries.up, true)}{gscRows("Queries that lost clicks", g.queries.down, false)}{gscRows("Pages that gained clicks", g.pages.up, true)}{gscRows("Pages that lost clicks", g.pages.down, false)}</div>
            </>
          )}
        <div className="mt-3 border-t border-gray-100 pt-3 text-[12px] text-gray-500"><b className="text-gray-700">Google Business Profile.</b> {r.gbp}</div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-[13.5px] font-semibold text-gray-900">The agent's review of this week</div>{w.review?.taskId && <Btn ghost onClick={() => onOpenTask(w.review.taskId)}>Open the task and its report</Btn>}</div>
        {!w.review ? <div className="mt-1 text-[12.5px] text-gray-500">Not reviewed yet. {off ? "" : "It is reviewed when the weekly task runs, or press Review it now."}</div> : (
          <>
            <div className="mt-1 whitespace-pre-wrap text-[12.5px] leading-5 text-gray-700">{w.review.summary}</div>
            {w.review.actions.length > 0 && <div className="mt-3"><div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Work decided on ({w.review.actions.length})</div>
              {w.review.actions.map((x, i) => <div key={i} className="border-t border-gray-100 py-2 text-[12.5px] first:border-t-0"><div className="font-medium text-gray-900">{x.about}</div>{x.finding && <div className="text-gray-600">{x.finding}</div>}<div className="text-gray-800"><b>Action:</b> {x.action}</div>{x.task && <div className="text-[11.5px] text-gray-500">Task queued: {x.task}</div>}</div>)}</div>}
          </>
        )}
        {r.history.length > 1 && (
          <div className="mt-4 overflow-x-auto"><div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Earlier weeks</div>
            <table className="mt-1 w-full min-w-[520px] text-left text-[12.5px]"><thead><tr className="border-b border-gray-200 text-[10px] uppercase tracking-wider text-gray-400"><th className="py-1.5 pr-3 font-semibold">Week of</th><th className="py-1.5 pr-3 font-semibold">Top 3</th><th className="py-1.5 pr-3 font-semibold">Top 10</th><th className="py-1.5 pr-3 font-semibold">Top 20</th><th className="py-1.5 pr-3 font-semibold">Up / down</th><th className="py-1.5 pr-3 font-semibold">Clicks</th><th className="py-1.5 font-semibold">Reviewed</th></tr></thead>
              <tbody>{[...r.history].reverse().map((h) => <tr key={h.week} className="border-b border-gray-100"><td className="py-1.5 pr-3 text-gray-800">{day(h.week + "T12:00:00")}</td><td className="py-1.5 pr-3">{h.top3 ?? "–"}</td><td className="py-1.5 pr-3">{h.top10 ?? "–"}</td><td className="py-1.5 pr-3">{h.top20 ?? "–"}</td><td className="py-1.5 pr-3">{h.up} / {h.down}</td><td className="py-1.5 pr-3">{h.clicks ?? "–"}</td><td className="py-1.5">{h.reviewed ? `Yes, ${h.actions} action${h.actions === 1 ? "" : "s"}` : "No"}</td></tr>)}</tbody></table></div>
        )}
      </Card>
    </div>
  );
}
/* ---------------- AI search visibility: the share of AI answers that name the business, over time ---------------- */
function Bars({ items, accent, max = 100, unit = "%" }) {
  if (!items.length) return null;
  return (
    <div className="flex h-24 items-end gap-1.5" role="img" aria-label={items.map((x) => `${x.label}: ${x.value}${unit}`).join(", ")}>
      {items.map((x, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={x.title || `${x.label}: ${x.value}${unit}`}>
          <span className="text-[10px] font-semibold text-gray-700">{x.value}{unit}</span>
          <span className="w-full max-w-[34px] rounded-t" style={{ height: Math.max(3, Math.round((x.value / (max || 1)) * 64)) + "px", background: i === items.length - 1 ? accent : accent + "55" }} />
          <span className="w-full truncate text-center text-[9.5px] text-gray-400">{x.label}</span>
        </div>
      ))}
    </div>
  );
}
function AiVisibility({ project, accent, reload, onOpenTask }) {
  const [v, setV] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const run = useCallback(async (body) => {
    setBusy(true); setErr("");
    try { const o = await api("visibility", { projectId: project.id, ...body }); setV(o); return o; }
    catch (e) { setErr(String(e.message || e)); return null; }
    finally { setBusy(false); }
  }, [project.id]);
  useEffect(() => { run({ action: "get" }).then((o) => { if (o) setText(o.prompts.map((x) => x.text).join("\n")); }); }, [run]);
  const day = (t) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const saved = (v?.prompts || []).map((x) => x.text).join("\n"), changed = text.trim() !== saved.trim();
  const checkNow = async () => {
    setBusy(true); setErr(""); setNote("");
    try { const o = await api("task/create", { projectId: project.id, type: "ai_visibility", title: `AI search visibility check: ${project.name}` }); setNote(o ? "Queued. It starts when the agent's computer is free and this project's limits allow it; the numbers appear here when it has finished." : ""); if (reload) reload(); }
    catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };
  if (!v) return <Card className="p-4 text-[12.5px] text-gray-500">{err ? <span className="text-red-700">{err}</span> : "Loading…"}</Card>;
  const L = v.latest, off = v.taskType?.mode === "off";
  const trackerLast = v.tracker[v.tracker.length - 1];
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-[220px] flex-1">
            <div className="text-[13.5px] font-semibold text-gray-900">AI search visibility</div>
            <div className="mt-0.5 text-[11.5px] leading-5 text-gray-500">How often this business is named when people ask AI assistants and Google's AI answers about its services. The agent asks the same questions at every check, so the share can be followed over time. Only answers the agent really read are counted; an engine it could not ask has no number.</div>
          </div>
          <Btn accent={accent} disabled={busy || off} title={off ? "AI search visibility is switched off for this project. Switch it on under Onpage SEO." : ""} onClick={checkNow}><RefreshCw size={13} /> Check now</Btn>
        </div>
        {off && <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">The task type <b>AI search visibility</b> is switched off for this project, so no check runs. Switch it on under Onpage SEO; set it to start by itself every 14 days to keep the trend going.</div>}
        {note && <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800" role="status">{note}</div>}
        {err && <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-800" role="alert">{err}</div>}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-gray-200 p-3">
            <div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Named in AI answers (the agent's checks)</div>
            {L ? (
              <>
                <div className="mt-1 flex items-baseline gap-2"><span className="text-[26px] font-semibold text-gray-900">{L.share}%</span><span className="text-[12px] text-gray-500">{L.named} of {L.asked} answers on {day(L.at)} · website linked in {L.linked}</span></div>
                <div className="mt-3"><Bars accent={accent} items={v.runs.slice(-10).map((r) => ({ label: day(r.at), value: r.share, title: `${day(r.at)}: named in ${r.named} of ${r.asked} answers` }))} /></div>
                <div className="mt-2 flex flex-wrap gap-1.5">{Object.entries(L.byEngine).map(([e, x]) => <Chip key={e} fg="#374151" bg="#F3F4F6">{e}: {x.named} of {x.asked}</Chip>)}</div>
              </>
            ) : <div className="mt-2 text-[12.5px] text-gray-500">No check yet. Press <b>Check now</b>, or switch the task type on to start by itself.</div>}
          </div>
          <div className="rounded-xl border border-gray-200 p-3">
            <div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Cited in Google's AI Overview (the rank tracker)</div>
            {v.demoData ? <div className="mt-2 text-[12.5px] text-gray-500">This project is on demo data, so the tracker's numbers are not shown here.</div>
              : trackerLast ? (
                <>
                  <div className="mt-1 flex items-baseline gap-2"><span className="text-[26px] font-semibold text-gray-900">{trackerLast.cited}</span><span className="text-[12px] text-gray-500">of {trackerLast.scanned} tracked keywords scanned on {day(trackerLast.day)}</span></div>
                  <div className="mt-3"><Bars accent={accent} unit="" max={Math.max(1, ...v.tracker.map((d) => d.cited))} items={v.tracker.map((d) => ({ label: day(d.day), value: d.cited, title: `${day(d.day)}: cited for ${d.cited} of ${d.scanned} keywords` }))} /></div>
                  <div className="mt-2 text-[11px] text-gray-400">From the rank scans the CRM already runs: no tokens and no extra cost.</div>
                </>
              ) : <div className="mt-2 text-[12.5px] text-gray-500">No rank scan with AI Overview data yet.</div>}
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-[13.5px] font-semibold text-gray-900">The questions asked at every check</div>
        <div className="mt-0.5 text-[11.5px] leading-5 text-gray-500">One per line, the way a customer would ask: "who is the best emergency plumber in Leeds", "how much does a boiler service cost in Leeds". Up to {v.maxPrompts}. Keep the list stable: changing it breaks the comparison with earlier checks. With an empty list the agent writes its own at the first check and keeps them.</div>
        <textarea className={inputCls + " mt-2 h-36 text-[12.5px]"} aria-label="Questions for the AI search visibility check, one per line" value={text} onChange={(e) => setText(e.target.value)} placeholder={"who is the best emergency plumber in Leeds\nhow much does a boiler service cost in Leeds"} />
        <div className="mt-2 flex items-center gap-2"><Btn accent={accent} disabled={busy || !changed} onClick={async () => { const o = await run({ action: "prompts", prompts: text.split("\n") }); if (o) setText(o.prompts.map((x) => x.text).join("\n")); }}><Check size={13} /> Save questions</Btn><span className="text-[11.5px] text-gray-500">{(v.prompts || []).length} saved{changed ? " · unsaved changes" : ""}</span></div>
      </Card>

      {L && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[13.5px] font-semibold text-gray-900">The latest check, answer by answer</div>
            {L.taskId && <Btn ghost onClick={() => onOpenTask(L.taskId)}>Open the task and its report</Btn>}
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[12.5px]">
              <thead><tr className="border-b border-gray-200 text-[10px] uppercase tracking-wider text-gray-400"><th className="py-1.5 pr-3 font-semibold">Question</th><th className="py-1.5 pr-3 font-semibold">Engine</th><th className="py-1.5 pr-3 font-semibold">This business</th><th className="py-1.5 font-semibold">Who else was named</th></tr></thead>
              <tbody>
                {L.results.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 align-top">
                    <td className="py-1.5 pr-3 text-gray-800">{r.question}{r.note && <div className="text-[11.5px] text-gray-500">{r.note}</div>}</td>
                    <td className="whitespace-nowrap py-1.5 pr-3 text-gray-600">{r.engine}</td>
                    <td className="whitespace-nowrap py-1.5 pr-3">{r.named ? <Chip fg="#15803D" bg="#DCFCE7">{r.linked ? "Named and linked" : "Named"}</Chip> : <Chip fg="#B91C1C" bg="#FEE2E2">Not named</Chip>}</td>
                    <td className="py-1.5 text-gray-600">{(r.others || []).join(", ") || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(L.others.length > 0 || L.sources.length > 0) && (
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {L.others.length > 0 && <div><div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Named most often instead</div><div className="mt-1.5 space-y-1">{L.others.map((x) => <div key={x.name} className="flex items-center gap-2 text-[12.5px] text-gray-700"><span className="h-1.5 rounded-full" style={{ width: Math.max(8, Math.round((x.n / L.asked) * 160)) + "px", background: accent + "88" }} /><span className="min-w-0 flex-1 truncate">{x.name}</span><span className="text-gray-400">{x.n} of {L.asked}</span></div>)}</div></div>}
              {L.sources.length > 0 && <div><div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Sites the answers cite</div><div className="mt-1.5 space-y-1">{L.sources.map((x) => <div key={x.host} className="flex items-center justify-between gap-2 text-[12.5px] text-gray-700"><span className="min-w-0 truncate">{x.host}</span><span className="text-gray-400">{x.n}</span></div>)}</div></div>}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
/* ---------------- photos uploaded to the CRM before pictures came from folders and Drive links (Resources) ---------------- */
function Photos({ project, accent, reload }) {
  const [state, setState] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [big, setBig] = useState(null);
  const run = useCallback(async (body, doing = "") => {
    setBusy(doing || "working"); setErr("");
    try { const o = await api("media", { projectId: project.id, ...body }); if (o.photos) setState(o); return o; }
    catch (e) { setErr(String(e.message || e)); return null; }
    finally { setBusy(""); }
  }, [project.id]);
  useEffect(() => { run({ action: "list" }); }, [run]);
  const photos = state?.photos || [];
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-[220px] flex-1">
          <div className="text-[13.5px] font-semibold text-gray-900">Photos uploaded to the CRM earlier</div>
          <div className="mt-0.5 text-[11.5px] leading-5 text-gray-500">Photos are no longer uploaded: the agent takes them from the folders and Google Drive links above. These were uploaded before that and the agent may still use them, with the note under each telling it what the photo shows. Remove the ones you no longer want used; when the last one is removed this list disappears.</div>
        </div>
      </div>
      {busy && busy !== "working" && <div className="mt-2 text-[12px] text-gray-500">{busy}</div>}
      {err && <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-800" role="alert">{err}</div>}
      {photos.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((x) => (
            <div key={x.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <button type="button" className="block aspect-[4/3] w-full bg-gray-100" title="Show this photo larger" onClick={async () => { const o = await run({ action: "get", id: x.id }); if (o?.dataUrl) setBig({ ...x, dataUrl: o.dataUrl }); }}>
                {x.thumb ? <img src={x.thumb} alt={x.note || x.name} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-gray-400"><ImageIcon size={22} /></span>}
              </button>
              <div className="space-y-1.5 p-2">
                <div className="truncate text-[12px] font-semibold text-gray-900" title={x.name}>{x.name}</div>
                <input className={inputCls + " !py-1 text-[12px]"} aria-label={`What ${x.name} shows`} placeholder="What it shows (for the agent)" defaultValue={x.note} onBlur={(e) => { if (e.target.value.trim() !== (x.note || "")) run({ action: "edit", id: x.id, note: e.target.value }); }} />
                <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500">
                  <span>{x.timesUsed ? `Used ${x.timesUsed}×, last ${relTime(x.lastUsed.at)}` : "Not used yet"}</span>
                  <button type="button" className="text-red-700 hover:underline" disabled={!!busy} onClick={async () => { if (await askConfirm({ title: "Remove this photo?", message: `"${x.name}" is removed from the photos the agent may publish. Posts that already used it are not changed.`, confirmLabel: "Remove" })) { await run({ action: "remove", id: x.id }); if (reload) reload(); } }}>Remove</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {state && <div className="mt-3 text-[11px] text-gray-400">{photos.length} photo{photos.length === 1 ? "" : "s"} uploaded earlier.</div>}
      {big && <Modal title={big.name} onClose={() => setBig(null)}><img src={big.dataUrl} alt={big.note || big.name} className="mx-auto max-h-[70vh] rounded-lg" />{big.note && <div className="mt-2 text-[12.5px] text-gray-600">{big.note}</div>}</Modal>}
    </Card>
  );
}
/* the picture a task left of the page it changed */
function Proof({ task }) {
  const [shown, setShown] = useState({});
  const [err, setErr] = useState("");
  const open = async (e) => {
    if (shown[e.id]) { setShown((c) => ({ ...c, [e.id]: null })); return; }
    try { const o = await api("evidence", { taskId: task.id, id: e.id }); setShown((c) => ({ ...c, [e.id]: o.dataUrl })); setErr(""); } catch (x) { setErr(String(x.message || x)); }
  };
  return (
    <div>
      <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Proof</div>
      {task.evidence.map((e) => (
        <div key={e.id} className="mb-2">
          <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50" onClick={() => open(e)}><ImageIcon size={13} /> {shown[e.id] ? "Hide" : "Show"}: {e.label} <span className="font-normal text-gray-400">· {relTime(e.at)}</span></button>
          {shown[e.id] && <img src={shown[e.id]} alt={e.label} className="mt-2 max-w-full rounded-lg border border-gray-200" />}
        </div>
      ))}
      {err && <div className="text-[12px] text-red-700">{err}</div>}
      <div className="text-[11px] text-gray-400">A picture of the page as the agent left it, taken on its computer. Kept for 120 days.</div>
    </div>
  );
}
/* what the agent used this month, by kind of task, by model and by project */
function UsageCard({ data, accent }) {
  const u = data.usageSummary;
  if (!u) return null;
  const c = u.claude, types = u.types || [], top = Math.max(1, ...types.map((x) => x.total));
  const monthName = new Date(u.month + "-15T00:00:00Z").toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
  const Row = ({ name, total, calls, cost, share }) => (
    <div className="flex items-center gap-3 border-t border-gray-100 py-1.5 text-[12.5px] first:border-t-0">
      <span className="min-w-0 flex-1 truncate text-gray-800">{name}</span>
      <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-gray-100 xl:block"><span className="block h-full rounded-full" style={{ width: Math.round(share * 100) + "%", background: accent }} /></span>
      <span className="w-20 text-right text-gray-600">{fmtTok(total)}</span>
      <span className="w-16 text-right text-gray-500">{calls == null ? "" : `${calls} call${calls === 1 ? "" : "s"}`}</span>
      <span className="w-16 text-right font-medium text-gray-800">{cost == null ? "–" : usd(cost)}</span>
    </div>
  );
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold text-gray-900"><BarChart3 size={15} style={{ color: accent }} /> What the agent used in {monthName}</div>
        <div className="text-[12px] text-gray-500"><b className="text-gray-900">{fmtTok(c.month)}</b> tokens in {c.calls} call{c.calls === 1 ? "" : "s"} · about <b className="text-gray-900">{usd(c.costUsd)}</b>{u.seo?.calls ? <> · DataForSEO {usd4(u.seo.usd)}</> : null}</div>
      </div>
      <div className="mt-1 text-[11.5px] leading-5 text-gray-500">Token counts are the ones Claude returns with every call; the cost is an estimate from list prices. The cost per kind of task is kept from the version that added this card, so earlier calls of this month show in the tokens only.</div>
      {!c.month ? <div className="mt-3 text-[12.5px] text-gray-500">Nothing used yet this month.</div> : (
        <div className="mt-3 grid gap-5 lg:grid-cols-2">
          <div>
            <div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">By kind of task</div>
            <div className="mt-1">{types.map((x) => <Row key={x.type} name={x.label} total={x.total} calls={x.calls} cost={x.costUsd || null} share={x.total / top} />)}</div>
          </div>
          <div>
            <div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">By model</div>
            <div className="mt-1">{c.models.length ? c.models.map((m) => <Row key={m.id} name={m.label} total={m.total} calls={m.calls} cost={m.costUsd} share={m.total / Math.max(1, c.month)} />) : <div className="py-1.5 text-[12px] text-gray-400">No call recorded by model yet.</div>}</div>
            <div className="mt-4 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">By project (highest cost first)</div>
            <div className="mt-1">{u.projects.map((x) => <Row key={x.id} name={x.name} total={x.tokens} calls={null} cost={x.costUsd} share={x.tokens / Math.max(1, c.month)} />)}</div>
          </div>
        </div>
      )}
    </Card>
  );
}
/* what the independent second check said about a plan */
function CheckNote({ check }) {
  if (!check) return null;
  const tone = check.verdict === "pass" ? ["#ECFDF5", "#047857"] : check.verdict === "fail" ? ["#FEF2F2", "#B91C1C"] : ["#FFFBEB", "#92400E"];
  return (
    <div className="mt-2 rounded-lg px-3 py-2 text-[12px]" style={{ background: tone[0], color: tone[1] }}>
      <div className="font-semibold">{check.verdict === "pass" ? "Second check: no problems found in this plan." : check.verdict === "fail" ? `Second check: ${check.issues?.length || "a"} problem${(check.issues?.length || 0) === 1 ? "" : "s"} found in this plan.` : "The second check could not be completed, so nothing was checked."}</div>
      {(check.issues || []).length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-4">{check.issues.map((x, i) => <li key={i}>{x.where ? <><span className="font-medium">{x.where}</span>: </> : null}{x.problem}</li>)}</ul>}
      {check.verdict === "unchecked" && check.note && <div className="mt-0.5">{check.note}</div>}
      <div className="mt-1 opacity-70">It reads the plan against the brand facts, the directions and the limits of this kind of task. It does not see the live page. The decision is yours.</div>
    </div>
  );
}
/* SEO tools the agent may use, signed in: a common setting, with the sign-in itself kept on the agent's computer */
function SeoToolsCard({ data, accent, act, busy }) {
  const saved = data.global.seoTools || [];
  const [rows, setRows] = useState(null);
  const list = rows || saved;
  const profiles = data.devices.flatMap((d) => (d.profiles || []).map((p) => ({ ...p, device: d.name })));
  const set = (i, k, val) => setRows(list.map((x, j) => (j === i ? { ...x, [k]: val } : x)));
  const dirty = rows && JSON.stringify(rows.map(({ name, url, profileId, useFor }) => [name, url, profileId, useFor])) !== JSON.stringify(saved.map(({ name, url, profileId, useFor }) => [name, url, profileId, useFor || ""]));
  const complete = list.every((x) => (x.name || "").trim() && /^https:\/\/\S+\.\S+/.test((x.url || "").trim()) && x.profileId);
  const save = async () => { const o = await act("config", { global: { seoTools: list.map((x) => ({ id: x.id, name: x.name, url: x.url.trim(), profileId: x.profileId, useFor: x.useFor || "" })) } }); if (o) setRows(null); };
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold text-gray-900"><KeyRound size={15} style={{ color: accent }} /> SEO tools the agent may use, signed in</div>
        <Chip>{saved.length} set up</Chip>
      </div>
      <div className="mt-1 text-[11.5px] leading-5 text-gray-500">Paid tools your agency has an account with (a backlink index, a keyword tool, a site crawler). Each is opened in a Chrome ID that is signed in to it, on the agent's computer, and the agent may read reports and search there for any project. It cannot change the account, spend exports or open billing pages. Once a tool is saved, its sign-in can be entered under it: it is passed once to the agent's computer, which keeps it encrypted and types it into the tool's sign-in page itself when the tool has signed out. The CRM does not store it and it is never given to Claude. (It can also be saved directly in the agent's own application, under Settings, Saved sign-ins.) A tool that asks for a code or a captcha still needs a person.</div>
      <div className="mt-3 space-y-2">
        {list.map((x, i) => (
          <div key={x.id || "new" + i} className="grid gap-2 rounded-xl border border-gray-200 p-2.5 md:grid-cols-[1fr_1.4fr_1fr_auto]">
            <input className={inputCls} aria-label="Tool name" placeholder="Name, for example Ahrefs" maxLength={60} value={x.name || ""} onChange={(e) => set(i, "name", e.target.value)} />
            <input className={inputCls} aria-label="Address of the tool" placeholder="https://app.example.com/" maxLength={200} value={x.url || ""} onChange={(e) => set(i, "url", e.target.value)} />
            <select className={inputCls} aria-label="Chrome ID signed in to it" value={x.profileId || ""} onChange={(e) => set(i, "profileId", e.target.value)}><option value="">Chrome ID…</option>{profiles.map((p) => <option key={p.device + p.id} value={p.id}>{p.id} · {p.name} ({p.device})</option>)}</select>
            <Btn ghost danger onClick={() => setRows(list.filter((_, j) => j !== i))}>Remove</Btn>
            {x.id && x.url && x.profileId && <div className="md:col-span-4"><SignInRelay name={x.name} url={x.url} profileId={x.profileId} accent={accent} /></div>}
            <input className={inputCls + " md:col-span-4"} aria-label="What the agent should use it for" placeholder="What the agent should use it for, for example: referring domains and lost links of the client and its competitors" maxLength={500} value={x.useFor || ""} onChange={(e) => set(i, "useFor", e.target.value)} />
          </div>
        ))}
        {!list.length && <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-[12.5px] text-gray-500">No tool set up. The agent works from the CRM, DataForSEO and the open web.</div>}
      </div>
      {!profiles.length && <div className="mt-2 text-[12px] text-amber-800">No computer has a Chrome ID yet. Create one in the agent's application (Settings, Chrome IDs) and sign in to the tool there first.</div>}
      <div className="mt-3 flex flex-wrap gap-2">{list.length < 10 && <Btn ghost onClick={() => setRows([...list, { name: "", url: "", profileId: profiles.length === 1 ? profiles[0].id : "", useFor: "" }])}><Plus size={13} /> Add a tool</Btn>}{dirty && <Btn accent={accent} disabled={busy || !complete} title={complete ? "" : "Each tool needs a name, an https address and a Chrome ID."} onClick={save}>Save the list</Btn>}{dirty && <Btn ghost onClick={() => setRows(null)}>Cancel</Btn>}</div>
    </Card>
  );
}

function SecondCheckCard({ data, accent, act, busy }) {
  const g = data.global, on = g.secondCheck !== false;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold text-gray-900"><ShieldCheck size={15} style={{ color: accent }} /> Second check before a change</div>
        <label className="flex items-center gap-2 text-[12.5px] font-medium text-gray-700"><Switch on={on} label="Second check before a change" onChange={(v) => act("config", { global: { secondCheck: v } })} /> {on ? "On" : "Off"}</label>
      </div>
      <div className="mt-1 text-[11.5px] leading-5 text-gray-500">Before a post, a review reply, a profile edit or a website change goes ahead, a separate Claude call reads the agent's exact plan against the client's business facts, the brand voice, your directions and the limits of that kind of task. Where a task type is set to <b>Ask before changing</b>, what it finds is shown with the proposal. Where it is set to <b>Act after a second check</b>, the agent only carries the plan out when the check passes; otherwise the plan comes to you. It costs one short call per plan and counts against the project's tokens.</div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[12.5px] text-gray-700">
        <label className="flex items-center gap-2">Model for the check
          <select className={selCls} aria-label="Model for the second check" disabled={busy || !on} value={g.checkModel || "claude-sonnet-5-5"} onChange={(e) => act("config", { global: { checkModel: e.target.value } })}>{data.models.map((m) => <option key={m.id} value={m.id} title={m.note}>{m.label}</option>)}</select>
        </label>
        {!on && <span className="text-[11.5px] text-amber-700">Off: a task type set to act alone does so with no check at all.</span>}
      </div>
    </Card>
  );
}
function SeoDataCard({ data, accent, act, busy }) {
  const s = data.seoData || {};
  const [test, setTest] = useState(null);
  const [cap, setCap] = useState(String(s.usdPerMonth ?? 25));
  useEffect(() => { setCap(String(s.usdPerMonth ?? 25)); }, [s.usdPerMonth]);
  const runTest = async () => {
    setTest({ running: true });
    const o = await act("seodata", { action: "test" });
    setTest(o ? { connected: !!o.connected, detail: o.detail || "" } : { connected: false, detail: "The test could not be run." });
  };
  const limit = +s.usdPerMonth || 0, pct = limit > 0 ? Math.min(100, Math.round(((s.monthUsd || 0) / limit) * 100)) : 0;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold text-gray-900"><Search size={15} style={{ color: accent }} /> Live SEO data (DataForSEO)</div>
        <label className="flex items-center gap-2 text-[12.5px] font-medium text-gray-700"><Switch on={!!s.enabled} label="Agent may use live SEO data" onChange={(v) => act("config", { global: { seoData: v } })} /> {s.enabled ? "On" : "Off"}</label>
      </div>
      <div className="mt-1 text-[11.5px] leading-5 text-gray-500">Connects the agent to DataForSEO through its MCP server, so a task can read live search results for a query and place, keyword search volume, difficulty and suggestions, a competitor's ranking keywords, backlinks and referring domains, on-page checks and business listings. The agent asks for it only when the data the CRM already holds cannot answer the task.</div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-gray-700">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium" style={s.login ? { background: "#ECFDF5", color: "#047857" } : { background: "#FEF3C7", color: "#92400E" }}>{s.login ? <Check size={12} /> : <AlertTriangle size={12} />}{s.login ? "DataForSEO login found" : "No DataForSEO login yet"}</span>
        <span className="min-w-[220px] flex-1 text-[11.5px] text-gray-500">{s.login ? "It is the login saved in the CRM under Company Settings, API settings. The CRM signs in with it; it is never sent to the agent's computer or to Claude." : "Add it in the CRM under Company Settings, API settings (DataForSEO). Nothing else has to be installed."}</span>
        <Btn ghost disabled={busy || test?.running} onClick={runTest}><RefreshCw size={13} /> {test?.running ? "Testing…" : "Test connection"}</Btn>
      </div>
      {test && !test.running && <div className="mt-2 rounded-lg px-3 py-2 text-[12px]" role="status" style={test.connected ? { background: "#ECFDF5", color: "#047857" } : { background: "#FEF2F2", color: "#B91C1C" }}>{test.detail}</div>}
      <DfsLogin data={data} accent={accent} act={act} busy={busy} />
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Labeled label="Company spend limit per month, in $ (0 = none)">
          <input className={inputCls} inputMode="decimal" aria-label="Company DataForSEO spend limit per month in dollars" value={cap} onChange={(e) => setCap(e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 8))} onBlur={() => { if ((+cap || 0) !== limit) act("config", { global: { seoUsdPerMonth: +cap || 0 } }); }} />
        </Labeled>
        <div className="sm:col-span-2">
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-gray-400">Spent this month, all projects</div>
          <div className="text-[13px] text-gray-800"><b>{usd4(s.monthUsd || 0)}</b> of {usd(limit)} in {s.monthCalls || 0} request{(s.monthCalls || 0) === 1 ? "" : "s"}</div>
          {limit > 0 && <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full" style={{ width: pct + "%", background: pct >= 100 ? "#DC2626" : pct >= 80 ? "#D97706" : accent }} /></div>}
        </div>
      </div>
      <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-[11.5px] leading-5 text-gray-600">
        <b>Every request is billed by DataForSEO to your account</b>, usually a fraction of a cent to a few cents; reading its documentation and this test are free. Three limits keep the spend in hand: this company limit, each project's own monthly limit on its project page (5 dollars unless you change it), and at most {s.requestsPerTask || 20} requests in one task. The cost of each request is read from DataForSEO's answer and counted here.
      </div>
    </Card>
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
          {data.credentials.locked ? <b className="text-red-700">The keys saved earlier cannot be read on this server (its key file is missing). Enter them again. </b> : null}
          {data.credentials.storage === "encrypted" ? "The key is stored encrypted on the server; the key that unlocks it is kept outside the data folder, so a copy or backup of the data reveals nothing." : "The key is stored on the server in a file only the server can read."} It is never shown again here and is not part of the workspace data. A device receives it only together with a task it is handed, over an encrypted connection, and does not write it to disk.
        </div>
      </Card>

      <UsageCard data={data} accent={accent} />
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[13.5px] font-semibold text-gray-900"><Eye size={15} style={{ color: accent }} /> Looking over the CRM</div>
          <label className="flex items-center gap-2 text-[12.5px] font-medium text-gray-700"><Switch on={data.global.crmRead !== false} label="The agent may look over the CRM" onChange={(v) => act("config", { global: { crmRead: v } })} /> {data.global.crmRead !== false ? "On" : "Off"}</label>
        </div>
        <div className="mt-1 text-[11.5px] leading-5 text-gray-500">With this on the agent can read the CRM itself, not only the rankings: a task on a client project sees all of that project (its records, pages, posts, reports, ads), and the chat and the agency-level task <b>CRM oversight review</b> see every client and project, so you can ask it for an overview of anything. It can change nothing through this. Passwords, API keys, sign-in and mail settings are never returned, and what it reads about one client is not to be used for another.</div>
      </Card>
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[13.5px] font-semibold text-gray-900"><RefreshCw size={15} style={{ color: accent }} /> Carrying on after a power cut or a restart</div>
          <label className="flex items-center gap-2 text-[12.5px] font-medium text-gray-700"><Switch on={data.global.resume !== false} label="Carry on with a run after the computer restarted" onChange={(v) => act("config", { global: { resume: v } })} /> {data.global.resume !== false ? "On" : "Off"}</label>
        </div>
        <div className="mt-1 text-[11.5px] leading-5 text-gray-500">The agent's computer saves where a running task stands after every step. If the power goes or the computer restarts, the agent picks the same run up where it stopped when it is back, with the same token budget, instead of starting over: up to three times per run and within 24 hours, and only if nobody ran, cancelled or reassigned the task in the meantime. If it stopped in the middle of making an approved change, it is told which step was in progress and has to check what is already live before doing anything again. With this off, a run that was cut off goes back to the queue (or, for an approved change, waits for a person). Set the agent's application to start with the computer (its Settings), and the computer itself to switch on again when power returns.</div>
      </Card>
      <SeoToolsCard data={data} accent={accent} act={act} busy={busy} />
      <SecondCheckCard data={data} accent={accent} act={act} busy={busy} />
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[13.5px] font-semibold text-gray-900"><Eye size={15} style={{ color: accent }} /> Looking at pages as pictures</div>
          <label className="flex items-center gap-2 text-[12.5px] font-medium text-gray-700"><Switch on={data.global.vision !== false} label="The agent may look at pages as pictures" onChange={(v) => act("config", { global: { vision: v } })} /> {data.global.vision !== false ? "On" : "Off"}</label>
        </div>
        <div className="mt-1 text-[11.5px] leading-5 text-gray-500">The agent reads a page as text. With this on it can also ask for a picture of the page when the text is not enough: a visual editor, a photo, a layout. A picture costs more tokens than a reading, so it is told to use it sparingly. No picture is ever taken of a page that asks for a sign-in, has a field for a password, a code or a key, or shows something that looks like one. The same rule holds for the screenshot the agent keeps as proof when a task that changed something ends.</div>
      </Card>
      <SeoDataCard data={data} accent={accent} act={act} busy={busy} />

      <Card className="p-4">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold text-gray-900"><Lock size={15} style={{ color: accent }} /> How passwords and keys are kept safe</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[12.5px] leading-relaxed text-gray-700">
          <li><b>The agent never has a password.</b> A person signs in to each Chrome ID on the agent's computer. The sign-in stays in that Chrome profile on that computer; it is not sent to the CRM or to Claude.</li>
          <li><b>It cannot type or read one.</b> The agent's browser refuses to type on a sign-in page or into a password, code or key field, and never reads what such a field contains.</li>
          <li><b>A signed-in Chrome ID opens only its channel's sites.</b> Business Profile, Search Console and Analytics each have their own short list. Mail, files, saved passwords, payments and account or security settings cannot be opened.</li>
          <li><b>Anything that looks like a password or a key is hidden</b> before it is stored or passed on: in chat messages, directions, notes, lessons, task reports and brand documents, and in page text before it reaches Claude.</li>
          <li><b>Keys are never shown again.</b> This screen shows only the last four characters. Device tokens are stored as a hash and shown once.</li>
          <li><b>The agent's computer</b> keeps its token, its own key and its Chrome IDs in a folder only that computer's user can open, and talks to the CRM and to Claude over https only.</li>
        </ul>
        <div className="mt-2 text-[11.5px] text-gray-500">If you paste a password into the chat by mistake it is hidden before it is saved, but change that password anyway.</div>
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
/* ---------------- agency knowledge: documents the agent studies and applies to every project ---------------- */
const STUDY = { studied: ["Key points ready", "#15803D", "#DCFCE7"], studying: ["The agent is studying it now", "#1D4ED8", "#DBEAFE"], waiting: ["Waiting to be studied", "#B45309", "#FEF3C7"], failed: ["Study did not finish", "#B91C1C", "#FEE2E2"], none: ["Not studied yet", "#6B7280", "#F3F4F6"] };
function KnowledgeRow({ d, scopes, busy, accent, onUpdate, onStudy, onView, onRemove }) {
  const [note, setNote] = useState(d.note);
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState(d.digest);
  useEffect(() => { setNote(d.note); }, [d.note]);
  useEffect(() => { setPoints(d.digest); }, [d.digest]);
  const [label, fg, bg] = STUDY[d.study.state] || STUDY.none;
  const active = d.study.state === "studying" || d.study.state === "waiting";
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <FileText size={16} className="shrink-0 text-gray-400" />
        <div className="min-w-[180px] flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-gray-900"><span className="break-all">{d.name}</span><Chip fg={fg} bg={bg}>{label}</Chip></div>
          <div className="text-[11px] text-gray-500">{d.words.toLocaleString()} words · added {relTime(d.addedAt)}{d.by ? ` by ${d.by}` : ""}{d.digestAt ? ` · key points written ${relTime(d.digestAt)}${d.digestBy ? ` by ${d.digestBy}` : ""}` : ""}</div>
        </div>
        <select aria-label={`Area of work for ${d.name}`} className={inputCls + " max-w-[200px]"} value={d.scope} disabled={busy} onChange={(e) => onUpdate({ scope: e.target.value })} title="Which tasks are given this document. All work means every task on every project.">
          {scopes.map((x) => <option key={x.key} value={x.key}>{x.key === "all" ? "For all work" : `Only ${x.label}`}</option>)}
        </select>
        <div className="flex items-center gap-1.5">
          <Btn ghost disabled={busy || active} onClick={onStudy} title="The agent reads the whole document and writes down its key points. Uses tokens."><GraduationCap size={13} /> {d.digest ? "Study again" : "Study"}</Btn>
          <Btn ghost onClick={onView} title="Read the text the agent sees"><Eye size={13} /> View</Btn>
          <Btn ghost danger disabled={busy} onClick={onRemove} title="Remove this document"><Trash2 size={13} /></Btn>
        </div>
      </div>
      {(d.study.state === "waiting" || d.study.state === "failed") && d.study.detail && <div className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-[11.5px] text-amber-900">{d.study.state === "waiting" ? "Waiting: " : ""}{d.study.detail}</div>}
      <input aria-label={`What ${d.name} is for`} className={inputCls + " mt-2"} placeholder="What it is and when to use it (helps the agent know when to open it)" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => { if (note.trim() !== d.note) onUpdate({ note: note.trim() }); }} />
      <div className="mt-2">
        <button type="button" className="text-[12px] font-semibold" style={{ color: accent }} onClick={() => setOpen(!open)}>{open ? "Hide the key points" : d.digest ? "Show the key points every task is given" : "Write the key points yourself"}</button>
        {!open && d.digest && <div className="mt-1 line-clamp-2 whitespace-pre-line text-[12px] text-gray-600">{d.digest}</div>}
        {open && (
          <div className="mt-2">
            <textarea className={inputCls + " resize-y font-mono text-[12px]"} rows={7} placeholder={"One key point per line, written as an instruction.\nFor example: Put the service and the town in the first 50 characters of a title."} value={points} onChange={(e) => setPoints(e.target.value)} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Btn accent={accent} disabled={busy || points.trim() === d.digest.trim()} onClick={() => onUpdate({ digest: points })}><Check size={13} /> Save key points</Btn>
              <span className="text-[11px] text-gray-400">{points.length.toLocaleString()} of 1,500 characters. These are what every task is given; the full document is opened when needed.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
function KnowledgeView({ data, accent, goTasks }) {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [scope, setScope] = useState("all");
  const [study, setStudy] = useState(true);
  const [paste, setPaste] = useState(null);
  const [view, setView] = useState(null);
  const [told, setTold] = useState(false);
  const run = async (body, quiet) => {
    if (!quiet) { setBusy(true); setMsg(null); }
    try { const o = await api("knowledge", body); setSt(o); return o; }
    catch (e) { if (!quiet) setMsg({ ok: false, text: String(e.message || e) }); return null; }
    finally { if (!quiet) setBusy(false); }
  };
  useEffect(() => { run({ action: "list" }); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  /* while the agent is studying, look for its key points every few seconds */
  const active = !!st && st.docs.some((d) => d.study.state === "studying" || d.study.state === "waiting");
  useEffect(() => { if (!active) return undefined; const t = setInterval(() => run({ action: "list" }, true), 4000); return () => clearInterval(t); }, [active]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!st) return <Card className="p-4 text-[13px] text-gray-500">{msg ? msg.text : "Loading the knowledge…"}</Card>;

  const add = async (name, text, note) => {
    const o = await run({ action: "add", name, text, note, scope, study });
    if (o) setMsg({ ok: true, text: `"${name}" was ${o.replaced ? "replaced" : "added"}.${study ? " The agent will study it now and write down its key points." : " It is not studied yet: press Study, or write its key points yourself."}` });
    return !!o;
  };
  const addFiles = async (list) => {
    for (const f of [...list]) {
      try {
        if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") throw new Error(`${f.name}: PDF files cannot be read here. Copy the text out of the PDF and use Paste text, or save it as Word or plain text.`);
        if (/\.doc$/i.test(f.name)) throw new Error(`${f.name}: old Word files (.doc) cannot be read. Save it as .docx and upload that.`);
        if (f.size > 8e6) throw new Error(`${f.name} is larger than 8 MB.`);
        const isDocx = /\.docx$/i.test(f.name);
        if (!isDocx && !/\.(txt|md|markdown)$/i.test(f.name) && !f.type.startsWith("text/")) throw new Error(`${f.name}: upload a .docx, .txt or .md file, or use Paste text.`);
        if (!(await add(f.name, isDocx ? await docxToText(await f.arrayBuffer()) : await f.text(), ""))) break;
      } catch (e) { setMsg({ ok: false, text: String(e.message || e) }); break; }
    }
  };
  const openDoc = async (d) => {
    setView({ name: d.name, text: "", loading: true });
    try { const o = await api("knowledge", { action: "doc", id: d.id }); setView({ name: o.name, text: o.text, truncated: o.truncated, words: o.words }); }
    catch (e) { setView({ name: d.name, text: String(e.message || e) }); }
  };
  const remove = async (d) => { if (await askConfirm({ title: "Remove this document?", message: `"${d.name}" and its key points will be removed. The agent will no longer know it, on any project.`, confirmLabel: "Yes, remove it", danger: true })) run({ action: "remove", id: d.id }); };
  const studied = st.docs.filter((d) => d.digest).length;
  const agencyOff = !data.global.enabled || data.global.paused;
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: accent + "14", color: accent }}><Library size={17} /></span>
          <div className="min-w-[220px] flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-gray-900">Knowledge for every project <Chip>{st.docs.length} document{st.docs.length === 1 ? "" : "s"} · {studied} studied</Chip></div>
            <div className="mt-0.5 text-[11.5px] leading-relaxed text-gray-500">Upload your agency's own material here: how you work, your standards, checklists, guides and training documents. The agent studies each document and writes down its key points. Every task and chat answer, on every project, is then given those key points and can open the full document. Where a project's Brand voice or a direction says something else, the project's own instruction wins.</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
          <label className={"inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white " + (busy ? "pointer-events-none opacity-50" : "")} style={{ background: accent }}>
            <Upload size={13} /> Upload documents
            <input type="file" accept=".docx,.txt,.md,.markdown,text/plain,text/markdown" multiple className="hidden" onChange={(e) => { const files = e.target.files; addFiles(files); e.target.value = ""; }} />
          </label>
          <Btn ghost disabled={busy} onClick={() => setPaste(paste ? null : { name: "", note: "", text: "" })}><Plus size={13} /> Paste text</Btn>
          <select aria-label="Area of work for new documents" className={inputCls + " max-w-[210px]"} value={scope} onChange={(e) => setScope(e.target.value)} title="Which tasks are given the documents you add now">
            {st.scopes.map((x) => <option key={x.key} value={x.key}>{x.key === "all" ? "For all work" : `Only ${x.label}`}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-[12px] text-gray-700" title="The agent reads the whole document once and writes down its key points. This uses tokens."><input type="checkbox" checked={study} onChange={(e) => setStudy(e.target.checked)} /> the agent studies it right away</label>
          <span className="w-full text-[11.5px] text-gray-500">Word (.docx), text (.txt) or Markdown (.md), up to {st.limits.docs} documents. For a PDF, copy its text and paste it.</span>
        </div>
        {msg && <div className={"mt-2 rounded-lg px-3 py-2 text-[12px] " + (msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800")} role="status">{msg.text}</div>}
        {active && agencyOff && <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">The agent is switched off or paused for the company, so documents wait to be studied until it is on again.</div>}
        {paste && (
          <div className="mt-3 space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Labeled label="Document name"><input className={inputCls} placeholder="How we do local SEO" value={paste.name} onChange={(e) => setPaste({ ...paste, name: e.target.value })} /></Labeled>
              <Labeled label="What it is and when to use it (optional)"><input className={inputCls} placeholder="Our method for every client" value={paste.note} onChange={(e) => setPaste({ ...paste, note: e.target.value })} /></Labeled>
            </div>
            <Labeled label="Text"><textarea className={inputCls + " resize-y"} rows={8} placeholder="Paste the document's text here." value={paste.text} onChange={(e) => setPaste({ ...paste, text: e.target.value })} /></Labeled>
            <div className="flex flex-wrap items-center gap-2">
              <Btn accent={accent} disabled={busy || !paste.name.trim() || paste.text.trim().length < 20} onClick={async () => { if (await add(paste.name.trim(), paste.text, paste.note.trim())) setPaste(null); }}><Check size={13} /> Add document</Btn>
              <Btn ghost onClick={() => setPaste(null)}>Cancel</Btn>
              <span className="text-[11px] text-gray-400">{(paste.text.match(/\S+/g) || []).length.toLocaleString()} words</span>
            </div>
          </div>
        )}
      </Card>

      <div className="space-y-2">
        {st.docs.map((d) => <KnowledgeRow key={d.id} d={d} scopes={st.scopes} busy={busy} accent={accent} onUpdate={(patch) => run({ action: "update", id: d.id, ...patch })} onStudy={() => run({ action: "study", id: d.id })} onView={() => openDoc(d)} onRemove={() => remove(d)} />)}
        {!st.docs.length && <Card className="px-4 py-8 text-center text-[12.5px] text-gray-400">No knowledge documents yet. Upload the first one above.</Card>}
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[200px] flex-1"><div className="text-[13.5px] font-semibold text-gray-900">What every task is told</div><div className="text-[11.5px] text-gray-500">The knowledge section a task on any project receives. Documents limited to one area of work are added for tasks of that area. A document with key points costs a few hundred tokens per task; one without is only named, and opened when needed.</div></div>
          {goTasks && <Btn ghost onClick={goTasks}><ListTodo size={13} /> See the study tasks</Btn>}
          <Btn ghost onClick={() => setTold(!told)} disabled={!st.preview}><Eye size={13} /> {told ? "Hide" : "Show"}</Btn>
        </div>
        {!st.preview && <div className="mt-2 text-[12px] text-gray-400">Nothing yet.</div>}
        {told && st.preview && <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-[11.5px] leading-relaxed text-gray-700">{st.preview}</pre>}
      </Card>

      {view && (
        <Modal title={view.name} sub={view.loading ? "Loading…" : `${view.words != null ? view.words.toLocaleString() + " words. " : ""}This is the text the agent reads.`} onClose={() => setView(null)} wide>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-[12px] leading-relaxed text-gray-800">{view.text}</pre>
          {view.truncated && <div className="mt-2 text-[11.5px] text-gray-500">Only the first part is shown here. The agent can read all of it.</div>}
        </Modal>
      )}
    </div>
  );
}

/* ---------- your own guides: text the manager writes and keeps up to date, added to the playbooks it applies to ---------- */
const GUIDE_AREAS = [["onpage", "Onpage SEO"], ["offpage", "Offpage SEO"], ["social", "Social Media"], ["general", "Monitoring and reporting"], ["agency", "Agency-level tasks"]];
function GuidesCard({ data, accent, setData }) {
  const guides = data.guides || [];
  const [open, setOpen] = useState(null);      // the guide in the editor: { id?, title, text, scope, area, types }
  const [was, setWas] = useState(null); const [versions, setVersions] = useState([]); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [note, setNote] = useState("");
  const run = async (body) => {
    setBusy(true); setErr("");
    try { const o = await api("guide", body); if (o.guides) setData((d) => ({ ...d, guides: o.guides })); return o; } catch (e) { setErr(String(e.message || e)); return null; } finally { setBusy(false); }
  };
  const start = () => { const g = { title: "", text: "", scope: "all", area: "onpage", types: [] }; setOpen(g); setWas(g); setVersions([]); setErr(""); };
  const edit = async (id) => {
    const o = await run({ action: "get", id });
    if (!o) return;
    const g = { id, title: o.guide.title, text: o.guide.text, scope: o.guide.scope, area: o.guide.area || "onpage", types: o.guide.types || [] };
    setOpen(g); setWas(g); setVersions([]);
    api("guide", { action: "history", id }).then((h) => setVersions(h.versions || [])).catch(() => { /* the editor works without the list */ });
  };
  const dirty = open && JSON.stringify(open) !== JSON.stringify(was);
  const close = async () => { if (dirty && !(await askConfirm({ title: "Close without saving?", message: "Your changes to this guide will be lost.", confirmLabel: "Close without saving", danger: true }))) return; setOpen(null); setErr(""); };
  const save = async () => { const o = await run({ action: open.id ? "save" : "add", ...open }); if (o) { setOpen(null); setNote(open.id ? "Saved. Every device picks the new text up at its next sync, within a minute when it is online." : "Added. The agent follows it from its next task."); } };
  const toggle = async (g) => { await run({ action: "toggle", id: g.id, on: !g.on }); };
  const remove = async (g) => { if (await askConfirm({ title: "Remove this guide?", message: `"${g.title}" and its earlier versions are deleted. The agent stops following it at its next sync.`, confirmLabel: "Remove", danger: true })) await run({ action: "remove", id: g.id }); };
  const restore = async (v) => { if (await askConfirm({ title: "Put this version back?", message: `The guide goes back to its text of ${new Date(v.updatedAt).toLocaleString()}. The text it has now is kept as an earlier version.`, confirmLabel: "Yes, put it back" })) { const o = await run({ action: "restore", id: open.id, n: v.n }); if (o) { setOpen(null); setNote("The earlier version is back in use."); } } };
  const groups = useMemo(() => { const m = new Map(); for (const c of data.catalog) { if (!m.has(c.group)) m.set(c.group, []); m.get(c.group).push(c); } return [...m.entries()]; }, [data.catalog]);
  const flip = (k) => setOpen((g) => ({ ...g, types: g.types.includes(k) ? g.types.filter((x) => x !== k) : [...g.types, k] }));
  const ready = open && open.title.trim().length >= 3 && open.text.trim().length >= 20 && open.text.length <= 12000 && (open.scope !== "types" || open.types.length > 0);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div className="min-w-[240px] flex-1">
          <div className="text-[13.5px] font-semibold text-gray-900">Your own guides</div>
          <div className="text-[11.5px] leading-5 text-gray-500">Write how your agency wants a kind of work done, and keep it up to date. Each guide applies to every task, to one area of work, or to the kinds of task you choose, and the agent reads it as part of its instructions for exactly those tasks. Where a guide and a built-in playbook differ, your guide wins. A project's own brand voice and directions still come first for that project.</div>
        </div>
        <Btn accent={accent} onClick={start} disabled={guides.length >= 40}><Plus size={13} /> New guide</Btn>
      </div>
      {err && !open && <div className="border-b border-gray-100 bg-red-50 px-4 py-2 text-[12px] text-red-800" role="alert">{err}</div>}
      {note && <div className="border-b border-gray-100 bg-emerald-50 px-4 py-2 text-[12px] text-emerald-800" role="status">{note}</div>}
      {!guides.length && <div className="px-4 py-4 text-[12.5px] text-gray-500">No guide yet. Examples of what belongs here: how you want review replies worded, your checklist for a location page, the order of a monthly report, link sources you never use.</div>}
      {guides.map((g) => (
        <div key={g.id} className="flex flex-wrap items-center gap-3 border-t border-gray-100 px-4 py-2.5 first:border-t-0">
          <button type="button" onClick={() => edit(g.id)} className="min-w-0 flex-1 text-left">
            <span className="block truncate text-[13px] font-medium text-gray-900" style={{ opacity: g.on ? 1 : 0.5 }}>{g.title}</span>
            <span className="block truncate text-[11.5px] text-gray-500">{g.where} · {g.chars.toLocaleString()} characters · updated {relTime(g.updatedAt)}{g.by ? ` by ${g.by}` : ""}{g.versions ? ` · ${g.versions} earlier version${g.versions === 1 ? "" : "s"}` : ""}</span>
          </button>
          <label className="flex items-center gap-2 text-[12px] text-gray-600"><Switch on={g.on} label={`Use the guide ${g.title}`} onChange={() => toggle(g)} /> {g.on ? "In use" : "Off"}</label>
          <Btn ghost disabled={busy} onClick={() => edit(g.id)}><PencilLine size={13} /> Edit</Btn>
          <Btn ghost danger disabled={busy} onClick={() => remove(g)}>Remove</Btn>
        </div>
      ))}
      {open && (
        <Modal title={open.id ? "Edit guide" : "New guide"} sub="Plain text or Markdown. Write it as you would brief a senior colleague: what to do, what never to do, and an example where it helps." onClose={close} wide>
          <div className="grid gap-3 md:grid-cols-2">
            <Labeled label="Title"><input className={inputCls} value={open.title} maxLength={100} placeholder="How we reply to reviews" onChange={(e) => setOpen({ ...open, title: e.target.value })} /></Labeled>
            <Labeled label="Where it applies">
              <select className={inputCls} value={open.scope} onChange={(e) => setOpen({ ...open, scope: e.target.value })}>
                <option value="all">Every task and the chat</option><option value="area">One area of work</option><option value="types">The kinds of task I choose</option>
              </select>
            </Labeled>
          </div>
          {open.scope === "area" && (
            <div className="mt-3"><Labeled label="Area of work"><select className={inputCls} value={open.area} onChange={(e) => setOpen({ ...open, area: e.target.value })}>{GUIDE_AREAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Labeled>
              <div className="mt-1 text-[11.5px] text-gray-500">Applies to: {data.catalog.filter((c) => c.area === open.area).map((c) => c.label).join(", ") || "no task type"}.</div></div>
          )}
          {open.scope === "types" && (
            <div className="mt-3 max-h-44 overflow-auto rounded-lg border border-gray-200 p-2.5">
              {groups.map(([group, list]) => (
                <div key={group} className="mb-2 last:mb-0">
                  <div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">{group}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">{list.map((c) => <button key={c.key} type="button" aria-pressed={open.types.includes(c.key)} onClick={() => flip(c.key)} className="rounded-full border px-2.5 py-1 text-[11.5px] font-medium" style={open.types.includes(c.key) ? { background: accent, borderColor: accent, color: "#fff" } : { borderColor: "#E5E7EB", color: "#374151" }}>{c.label}</button>)}</div>
                </div>
              ))}
            </div>
          )}
          <textarea className={inputCls + " mt-3 h-[42vh] font-mono text-[12px] leading-5"} value={open.text} aria-label="The guide's text" placeholder={"Write the guide here.\n\nFor example:\n- Thank the reviewer by first name.\n- Never mention prices or offer anything in return.\n- Three sentences at most."} onChange={(e) => setOpen({ ...open, text: e.target.value })} />
          {err && <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-800" role="alert">{err}</div>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Btn accent={accent} onClick={save} disabled={busy || !ready || !dirty}><Check size={13} /> {open.id ? "Save and sync to devices" : "Add guide"}</Btn>
            <Btn ghost onClick={close}>Cancel</Btn>
            <span className="text-[11.5px]" style={{ color: open.text.length > 12000 ? "#B91C1C" : "#9CA3AF" }}>{open.text.length.toLocaleString()} of 12,000 characters</span>
            <span className="text-[11.5px] text-gray-400">Anything that looks like a password or a key is removed when you save.</span>
          </div>
          {versions.length > 0 && (
            <details className="mt-3 rounded-lg border border-gray-200 px-3 py-2 text-[12px] text-gray-700">
              <summary className="cursor-pointer font-semibold">Earlier versions ({versions.length})</summary>
              <div className="mt-1 text-[11.5px] text-gray-500">Every changed version is kept, the last ten.</div>
              {versions.map((v) => (
                <div key={v.n} className="mt-2 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2">
                  <span className="min-w-0 flex-1">{new Date(v.updatedAt).toLocaleString()}{v.by ? ` · ${v.by}` : ""} · {v.chars.toLocaleString()} characters</span>
                  <Btn ghost onClick={() => setOpen({ ...open, text: v.text })} title="Shows this version in the box above without saving it.">Look at it</Btn>
                  <Btn ghost onClick={() => restore(v)}>Put it back</Btn>
                </div>
              ))}
            </details>
          )}
        </Modal>
      )}
    </Card>
  );
}

function PlaybooksView({ data, accent, act, setData }) {
  const [open, setOpen] = useState(null); const [text, setText] = useState(""); const [meta, setMeta] = useState(null); const [msg, setMsg] = useState("");
  const [versions, setVersions] = useState([]);
  const edit = async (key) => { try { const o = await api("playbook", { key, get: true }); setMeta(o); setText(o.text); setOpen(key); setMsg(""); setVersions([]); api("playbook", { key, history: true }).then((h) => setVersions(h.versions || [])).catch(() => { /* the editor works without the list */ }); } catch (e) { setMsg(String(e.message || e)); } };
  const restore = async (v) => { if (await askConfirm({ title: "Put this version back?", message: `The playbook goes back to the version of ${new Date(v.updatedAt).toLocaleString()} and is synced to every device. The text it has now is kept as an earlier version.`, confirmLabel: "Yes, put it back" })) { const o = await act("playbook", { key: open, restore: v.n }); if (o) setOpen(null); } };
  const save = async () => { const o = await act("playbook", { key: open, text }); if (o) setOpen(null); };
  const reset = async () => { if (await askConfirm({ title: "Reset this playbook?", message: "Your edits are replaced by the built-in text.", confirmLabel: "Yes, reset" })) { const o = await act("playbook", { key: open, reset: true }); if (o) setOpen(null); } };
  const label = useMemo(() => Object.fromEntries(data.playbooks.map((p) => [p.key, p.label])), [data.playbooks]);
  return (
    <div className="space-y-4">
    <GuidesCard data={data} accent={accent} setData={setData} />
    <Card className="overflow-hidden">
      <div className="border-b border-gray-100 px-4 py-3">
        <div className="text-[13.5px] font-semibold text-gray-900">Built-in playbooks</div>
        <div className="text-[11.5px] text-gray-500">The instructions the agent follows for each task type. Edit them here and every device picks up the change on its next sync (revision {data.playbooksRev}). Your own guides above are added to these where they apply; they are not shown in the text here.</div>
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
          {versions.length > 0 && (
            <details className="mt-3 rounded-lg border border-gray-200 px-3 py-2 text-[12px] text-gray-700">
              <summary className="cursor-pointer font-semibold">Earlier versions ({versions.length})</summary>
              <div className="mt-1 text-[11.5px] text-gray-500">Every edited version is kept, the last ten. If a change made the agent worse, put the earlier text back.</div>
              {versions.map((v) => (
                <div key={v.n} className="mt-2 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2">
                  <span className="min-w-0 flex-1">{new Date(v.updatedAt).toLocaleString()}{v.by ? ` · ${v.by}` : ""} · {v.chars.toLocaleString()} characters</span>
                  <Btn ghost onClick={() => setText(v.text)} title="Shows this version in the box above without saving it.">Look at it</Btn>
                  <Btn ghost onClick={() => restore(v)}>Put it back</Btn>
                </div>
              ))}
            </details>
          )}
        </Modal>
      )}
    </Card>
    </div>
  );
}
