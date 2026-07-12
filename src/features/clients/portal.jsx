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
import { AvaMaskCtx, BrandMark, Card, DarkToggle, FONT_CSS, Labeled, inputCls } from "../../ui/primitives.jsx";
import { DEFAULT_RANGE, useMonthGrid } from "../../lib/months.jsx";
import { GbpView, NAV, OverviewView, RankTrackingView, WebsitePerformanceView } from "../performance/views.jsx";
import { ProjectManagementView } from "../pm/board.jsx";
import { AdsPerformanceView } from "../ads/dashboard.jsx";
import { ROLE_CLIENT_LABEL } from "../../data/seed.js";
import { MessageThread, capMsgs, toggleReaction } from "../chat/thread.jsx";

/* white-label client's own DataForSEO credentials — powers rank tracking,
   geo-grid scans and index checks for THEIR projects (the agency's account is
   disabled for this client). Same honesty rules: no credentials → no data. */
function ClientApiSettings({ client, brand, accent, onUpdateClient }) {
  const dfs = client.dfs || {};
  const [draft, setDraft] = useState({ login: dfs.login || "", password: dfs.password || "" });
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [note, setNote] = useState(null);
  const connected = !!(dfs.login && dfs.password);
  const save = () => {
    onUpdateClient?.((c) => ({ dfs: { ...(c.dfs || {}), useOwn: true, login: draft.login.trim(), password: draft.password.trim() } }));
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  };
  const test = async () => {
    setTesting(true); setNote(null);
    try {
      const r = await fetch("/api/serp-top", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ keyword: "coffee shop", locationName: "United States", top: 1, dfs: { login: draft.login.trim(), password: draft.password.trim(), connected: true } }),
      });
      const d = await r.json().catch(() => ({}));
      setNote(r.ok ? { ok: true, text: "Credentials verified — a live SERP call succeeded. Your projects now run on your own DataForSEO account." }
        : { ok: false, text: d.detail || d.error || `Verification failed (HTTP ${r.status}) — check the API login (your DataForSEO email) and API password.` });
    } catch { setNote({ ok: false, text: "Could not reach the verification service — try again shortly." }); }
    setTesting(false);
  };
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card className="p-5">
        <div className="ll-display text-[15px] font-semibold">Your DataForSEO API</div>
        <p className="mt-1 text-[12px] leading-relaxed text-gray-500">
          Your projects run on <b>your own</b> DataForSEO account — rank tracking, map-grid scans and index checks
          bill to your API balance directly. Create an account at <b>app.dataforseo.com</b>; the dashboard's
          API Access page shows your API login (email) and API password.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Labeled label="API login (email)"><input value={draft.login} onChange={(e) => setDraft({ ...draft, login: e.target.value })} placeholder="you@company.com" className={"ll-mono " + inputCls} /></Labeled>
          <Labeled label="API password"><input type="password" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} placeholder="••••••••" className={"ll-mono " + inputCls} /></Labeled>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={save} disabled={!draft.login.trim() || !draft.password.trim()}
            className="rounded-xl px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
            {saved ? "Saved ✓" : "Save credentials"}
          </button>
          <button onClick={test} disabled={testing || !draft.login.trim() || !draft.password.trim()}
            className="rounded-xl border px-4 py-2 text-[13px] font-semibold disabled:opacity-40" style={{ borderColor: accent, color: accent }}>
            {testing ? "Testing…" : "Test with a live call"}
          </button>
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={connected ? { background: "#DCFCE7", color: "#166534" } : { background: "#FEF3C7", color: "#92400E" }}>
            {connected ? "● Connected" : "○ Not connected"}
          </span>
        </div>
        {note && <div className={"mt-2 rounded-lg border px-3 py-2 text-[11.5px] leading-relaxed " + (note.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800")}>{note.text}</div>}
        <p className="mt-2 text-[10px] text-gray-400">Until valid credentials are saved, dashboards that depend on live scans show "not configured" — nothing is ever fabricated or billed elsewhere.</p>
      </Card>
    </div>
  );
}

/* the client's side of the private owner ↔ client line */
function MessagesPane({ client, brand, accent, maskName, onSend, onReact, onRead }) {
  const ch = client.ownerChat || { msgs: [], reads: {} };
  useEffect(() => {
    const last = (ch.msgs || [])[(ch.msgs || []).length - 1];
    if (last && ((ch.reads || {})[client.contact] || 0) < last.ts) onRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(ch.msgs || []).length]);
  return (
    <Card className="flex flex-col overflow-hidden p-0" style={{ minHeight: 480 }}>
      <div className="border-b border-gray-100 px-5 py-3.5">
        <div className="ll-display text-[15px] font-semibold">Messages</div>
        <div className="text-[11px] text-gray-400">Your private line with the {brand.name} team.</div>
      </div>
      <MessageThread msgs={ch.msgs || []} me={client.contact} accent={accent} maskName={maskName}
        onSend={onSend} onReact={onReact} />
    </Card>
  );
}
import { AgentLauncher, AgentPanel } from "../agent/AgentPanel.jsx";
import { genSiteData, hydrate } from "../../data/gen.js";

export function LoginScreen({ company, clients, dark, onLogin, onTeamLogin, onBack }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState("creds");     // creds | code — 2FA for new devices
  const [pendingAuth, setPendingAuth] = useState(null);
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const demo = clients.find((c) => c.login?.enabled && c.login.password);
  const demoTeam = (company.team || []).find((m) => !m.isOwner && m.password);
  const devKey = (eml) => "ss_trusted_" + eml;
  const finish = (auth) => (auth.kind === "team" ? onTeamLogin(auth.id) : onLogin(auth.id));
  /* new device / new browser / cleared storage → server-side email verification */
  const start2fa = async (auth) => {
    setBusy(true); setError("");
    try {
      const tok = localStorage.getItem(devKey(auth.email)) || "";
      const chk = await fetch("/api/auth/device-check", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ email: auth.email, deviceToken: tok }),
      }).then((r) => r.json());
      if (chk.trusted) { finish(auth); return; }
      const r2 = await fetch("/api/auth/2fa/start", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ email: auth.email, smtp: company.apis?.smtp?.values }),
      });
      const d2 = await r2.json().catch(() => ({}));
      if (!r2.ok) { setError(d2.detail || "Could not send the verification code."); return; }
      setPendingAuth(auth); setStep("code"); setCode("");
      setNotice(d2.demo
        ? { kind: "demo", text: `New device detected. Email service isn't configured — DEMO code (local testing only): ${d2.devCode}` }
        : { kind: "info", text: `New device or browser detected — we emailed a 6-digit code to ${auth.email}. It expires in 10 minutes.` });
    } catch {
      /* fail CLOSED: without the security server nobody signs in */
      setError("Security server unreachable — start the API server (npm run api). New-device verification is required to sign in.");
    } finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/auth/2fa/verify", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ email: pendingAuth.email, code: code.trim(), ua: navigator.userAgent }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.detail || "Wrong code."); return; }
      localStorage.setItem(devKey(pendingAuth.email), d.deviceToken); // this browser is now a trusted device
      finish(pendingAuth);
    } catch { setError("Security server unreachable — try again."); }
    finally { setBusy(false); }
  };
  const submit = () => {
    const eml = email.trim().toLowerCase();
    // team members and clients share this door; blank passwords never match either way
    const m = (company.team || []).find((m) => m.password && m.email.trim().toLowerCase() === eml && m.password === password);
    if (m) { start2fa({ kind: "team", id: m.id, email: eml }); return; }
    const c = clients.find((c) =>
      c.login?.enabled &&
      c.login.password &&
      c.login.email.trim().toLowerCase() === eml &&
      c.login.password === password
    );
    if (c) { start2fa({ kind: "client", id: c.id, email: eml }); } else { setError("Email or password doesn't match an active client or team account."); }
  };
  return (
    <div className={`ll-root ${dark ? "ll-dark" : ""} flex min-h-screen items-center justify-center bg-[#F5F6F8] p-4`}>
      <style>{FONT_CSS}</style>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <BrandMark name={company.name} logo={company.logo} accent={company.accent} size="lg" />
          <div className="ll-display text-xl font-bold tracking-tight">{company.name}</div>
          <div className="text-[12.5px] text-gray-400">Sign in — clients see their projects, team members get their workspace</div>
        </div>
        {step === "code" ? (
        <Card className="space-y-3 p-5">
          <div className="text-[13.5px] font-bold text-gray-800">Verify it's you</div>
          {notice && (
            <div className={"rounded-lg px-3 py-2 text-[12px] " + (notice.kind === "demo" ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-700")}>{notice.text}</div>
          )}
          <Labeled label="6-digit verification code">
            <input value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && code.length === 6 && verify()}
              inputMode="numeric" autoFocus placeholder="••••••"
              className={inputCls + " ll-mono text-center text-[20px] tracking-[0.4em]"} />
          </Labeled>
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-600">{error}</div>}
          <button onClick={verify} disabled={busy || code.length !== 6}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-50"
            style={{ background: company.accent }}>
            {busy ? "Verifying…" : "Verify & sign in"}
          </button>
          <div className="flex items-center justify-between text-[11.5px]">
            <button onClick={() => start2fa(pendingAuth)} disabled={busy} className="font-semibold" style={{ color: company.accent }}>Resend code</button>
            <button onClick={() => { setStep("creds"); setError(""); setNotice(null); }} className="text-gray-400 hover:text-gray-600">← Back</button>
          </div>
          <div className="text-[10px] leading-relaxed text-gray-400">This device will be remembered for 90 days. Clearing your browser data or using a new browser asks for a fresh code.</div>
        </Card>
        ) : (
        <Card className="space-y-3 p-5">
          <Labeled label="Email">
            <input value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="you@company.com" className={inputCls} />
          </Labeled>
          <Labeled label="Password">
            <input value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && submit()} type="password" placeholder="••••••••" className={inputCls} />
          </Labeled>
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-600">{error}</div>}
          <button onClick={submit} disabled={busy} className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-50"
            style={{ background: company.accent }}>
            <LogIn size={15} /> {busy ? "Checking device…" : "Sign in"}
          </button>
        </Card>
        )}
        {step === "creds" && demo && (
          <div className="mt-3 rounded-xl border border-dashed border-gray-300 p-3 text-center text-[11.5px] text-gray-400">
            Demo client account: <span className="ll-mono">{demo.login.email}</span> / <span className="ll-mono">{demo.login.password}</span>
          </div>
        )}
        {step === "creds" && demoTeam && (
          <div className="mt-2 rounded-xl border border-dashed border-gray-300 p-3 text-center text-[11.5px] text-gray-400">
            Demo team account ({demoTeam.role}): <span className="ll-mono">{demoTeam.email}</span> / <span className="ll-mono">{demoTeam.password}</span>
          </div>
        )}
        <button onClick={onBack} className="mt-4 w-full text-center text-[12px] text-gray-400 hover:text-gray-600">← Back to agency dashboard</button>
      </div>
    </div>
  );
}

export function ClientPortal({ client, company, dark, setDark, onLogout, onUpdateProject, onUpdateClient }) {
  const allowed = client.projects.filter((p) => client.login.projectIds.includes(p.id));
  const [pid, setPid] = useState(allowed[0]?.id);
  const [view, setView] = useState("overview");
  const [cmp, setCmp] = useState(3);
  const [range, setRange] = useState(DEFAULT_RANGE);
  const project = allowed.find((p) => p.id === pid) || allowed[0];

  const tracking = useMemo(() => (project ? project.tracking.map(hydrate) : []), [project?.tracking]);
  const trackedKeywords = useMemo(() => (project ? [...new Set(project.tracking.map((t) => t.keyword))] : []), [project?.tracking]);
  const monthKey = useMonthGrid();
  const locSig = (p) => (p?.locations || []).map((l) => l.id + l.name + Object.values(l.integrations || {}).join("")).join("|");
  const data = useMemo(
    () => (project && project.demoMode !== false ? genSiteData(project, trackedKeywords, client.companyName) : null),
    [project?.id, project?.name, trackedKeywords.join("|"), client.companyName, monthKey, locSig(project)] // name seeds the generator; monthKey handles rollover; locSig re-derives on location-group edits
  );
  const accent = project?.accent || "#1F2A44";

  const wl = client.whiteLabel;
  const brand = wl?.enabled
    ? { name: wl.name || client.companyName || client.name, logo: wl.logo, website: wl.website, accent }
    : { name: company.name, logo: company.logo, website: "", accent: company.accent };

  const lg = client.login;
  const canChat = !!lg.canChat;      // PM options are opt-in for clients now
  const canPm = !!lg.canManageTasks || !!lg.canComment || canChat;
  const unreadChat = (project?.chatMsgs || []).filter((m) => m.author !== client.contact && m.ts > ((project?.chatReads || {})[client.contact] || 0)).length;
  const nav = [...NAV.filter((n) => {
    if (n.key === "settings") return false;
    if (n.key === "ranks") return lg.canViewRanks;
    if (n.key === "geogrid") return false; // agency-side tool (scans cost SERP credits)
    if (n.key === "adsperf") return !!lg.canViewAds && (project?.ads?.campaigns || []).some((c) => c.status !== "draft");
    if (n.key === "gbp") return (project?.integrations.gbp || project?.integrations.bing || project?.integrations.apple) && lg.canViewGbp !== false;
    if (n.key === "web") return (project?.integrations.ga || project?.integrations.gsc) && lg.canViewWeb !== false;
    return true;
  }), ...(canPm ? [{ key: "pm", label: "Project Management", icon: ListTodo }] : []),
  { key: "messages", label: "Messages", icon: MessageSquare },
  ...(client.dfs?.useOwn ? [{ key: "apisettings", label: "Settings", icon: Settings }] : [])];
  /* private owner ↔ client line (the owner answers from the dashboard chat) */
  const ownerChat = client.ownerChat || { msgs: [], reads: {} };
  const msgUnread = (ownerChat.msgs || []).filter((m) => m.author !== client.contact && m.ts > ((ownerChat.reads || {})[client.contact] || 0)).length;
  const sendOwnerMsg = (text, replyTo = null) => {
    const now = Date.now();
    onUpdateClient?.((c) => ({ ownerChat: { msgs: capMsgs([...((c.ownerChat || {}).msgs || []), { id: "km" + now, ts: now, author: client.contact, text, replyTo }]), reads: { ...((c.ownerChat || {}).reads || {}), [client.contact]: now } } }));
  };
  const reactOwnerMsg = (msgId, emoji) => onUpdateClient?.((c) => ({ ownerChat: { msgs: [], reads: {}, ...(c.ownerChat || {}), msgs: ((c.ownerChat || {}).msgs || []).map((m) => (m.id === msgId ? toggleReaction(m, emoji, client.contact) : m)) } }));
  /* privacy wall: clients never see the agency's team roster — they can only be
     shown themselves. Team members render by ROLE ("SEO Manager", "Content
     Developer"…) with the agency/white-label brand tile instead of a photo. */
  const pmPeople = useMemo(() => [{ name: client.contact, type: "client" }], [client.contact]);
  const roleLabelOf = (n) => {
    const m = (company.team || []).find((t) => t.name === n);
    return ROLE_CLIENT_LABEL[m?.role] || "SEO Manager";
  };
  const maskName = (n) => (n === client.contact ? n : roleLabelOf(n));
  const avaMask = useMemo(() => ({
    match: (n) => n !== client.contact,
    logo: brand.logo, brandName: brand.name, accent: brand.accent || accent,
  }), [client.contact, brand.logo, brand.name, brand.accent, accent]);

  /* client-side AI agent: info-only, scoped strictly to their shared projects */
  const [agentOpen, setAgentOpen] = useState(false);
  const agentCtx = useMemo(() => ({
    allowed: allowed.map((pr) => ({ client, project: pr })),
    deniedNames: client.projects.filter((pr) => !allowed.includes(pr)).map((pr) => pr.name),
    activeProjectId: project?.id, isClient: true,
    userName: client.contact, canPlan: false, canReports: false, assignableNames: [],
  }), [allowed, client, project?.id]);

  return (
    <div className={`ll-root ${dark ? "ll-dark" : ""} min-h-screen bg-[#F5F6F8]`} style={{ "--accent": accent }}>
      <style>{FONT_CSS}</style>
      <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 px-5 py-3.5 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BrandMark name={brand.name} logo={brand.logo} accent={brand.accent} size="lg" />
            <div>
              <div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">{brand.name}</div>
              <div className="ll-display text-[17px] font-semibold leading-tight">{project?.name}</div>
            </div>
          </div>
          <div className="no-print flex flex-wrap items-center gap-2">
            {allowed.length > 1 && (
              <select value={pid} onChange={(e) => { setPid(e.target.value); setView("overview"); }}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] font-medium">
                {allowed.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            {client.login.canDownload && (
              <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] font-medium text-gray-600 hover:border-gray-300">
                <Printer size={14} /> Report
              </button>
            )}
            <DarkToggle dark={dark} setDark={setDark} />
            <button onClick={onLogout} className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] font-medium text-gray-600 hover:border-gray-300">
              <LogOut size={14} /> Log out
            </button>
          </div>
        </div>
        <div className="no-print mt-3 flex flex-wrap gap-1">
          {nav.map((n) => (
            <button key={n.key} onClick={() => setView(n.key)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium"
              style={view === n.key ? { background: accent + "14", color: accent } : { color: "var(--chip-fg, #6B7280)" }}>
              <n.icon size={14} /> {n.label}
              {n.key === "pm" && unreadChat > 0 && (
                <span className="ll-mono rounded-full px-1.5 text-[10px] font-bold text-white" style={{ background: accent }}>{unreadChat}</span>
              )}
              {n.key === "messages" && msgUnread > 0 && (
                <span className="ll-mono rounded-full px-1.5 text-[10px] font-bold text-white" style={{ background: accent }}>{msgUnread}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl p-5">
        {!project && (
          <Card className="p-10 text-center text-[13px] text-gray-400">
            No projects have been shared with your account yet — please contact your SEO team.
          </Card>
        )}
        {project && !data && (
          <Card className="p-10 text-center text-[13px] leading-relaxed text-gray-400">
            Your dashboards are being connected — data appears here as soon as your SEO team finishes
            linking the analytics sources. Nothing is shown until it's real.
          </Card>
        )}
        {project && data && (
          <>
            {view === "overview" && <OverviewView project={project} data={data} tracking={tracking} cmp={cmp} accent={accent} clientView />}
            {view === "ranks" && lg.canViewRanks && <RankTrackingView project={project} tracking={tracking} dfsConnected accent={accent} onAdd={() => {}} onDelete={() => {}} readOnly />}
            {view === "gbp" && (project.integrations.gbp || project.integrations.bing || project.integrations.apple) && lg.canViewGbp !== false && <GbpView project={project} data={data} range={range} setRange={setRange} accent={accent} />}
            {view === "web" && lg.canViewWeb !== false && <WebsitePerformanceView project={project} data={data} range={range} setRange={setRange} accent={accent} />}
            {view === "adsperf" && !!lg.canViewAds && <AdsPerformanceView project={project} accent={accent} />}
            {view === "apisettings" && client.dfs?.useOwn && (
              <ClientApiSettings client={client} brand={brand} accent={accent} onUpdateClient={onUpdateClient} />
            )}
            {view === "messages" && (
              <AvaMaskCtx.Provider value={avaMask}>
                <MessagesPane client={client} brand={brand} accent={accent} maskName={maskName}
                  onSend={sendOwnerMsg} onReact={reactOwnerMsg}
                  onRead={() => onUpdateClient?.((c) => ({ ownerChat: { msgs: [], ...(c.ownerChat || {}), reads: { ...((c.ownerChat || {}).reads || {}), [client.contact]: Date.now() } } }))} />
              </AvaMaskCtx.Provider>
            )}
            {view === "pm" && canPm && (
              <AvaMaskCtx.Provider value={avaMask}>
              <ProjectManagementView project={project} people={pmPeople} maskName={maskName}
                perms={{ admin: false, create: false, manage: false, complete: !!lg.canManageTasks, comment: !!lg.canComment }}
                currentUser={client.contact} accent={accent} canChat={canChat}
                onUpdate={(patch) => onUpdateProject(project.id, patch)} log={null} />
              </AvaMaskCtx.Provider>
            )}
          </>
        )}
        <div className="mt-8 flex items-center justify-between border-t border-gray-200 pt-4 text-[11px] text-gray-400">
          <span>{brand.name} · report for {project?.name}</span>
          <span>{brand.website || ""}</span>
        </div>
        {lg.canUseAgent && allowed.length > 0 && (
          <>
            {!agentOpen && <AgentLauncher accent={accent} onClick={() => setAgentOpen(true)} />}
            {agentOpen && <AgentPanel ctx={agentCtx} accent={accent} aiProvider={null} onAction={() => {}} onClose={() => setAgentOpen(false)} />}
          </>
        )}
      </div>
    </div>
  );
}

