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
  PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { Ava, AvaMaskCtx, BrandMark, Card, DarkToggle, FONT_CSS, Labeled, LogoUpload, ProjectMark, SaveBar, Toggle, inputCls, useDraft } from "../../ui/primitives.jsx";
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
  );
}

/* The client's own Company settings — the portal counterpart of the agency's
   client settings. Everything here writes the SAME fields the agency edits
   (companyName, logo, whiteLabel, dfs.useOwn), so both sides always show one
   truth: a client flipping "own DataForSEO account" here lights up "Client
   supplies their own DataForSEO API" in the agency's Client settings, and the
   agency credentials disconnect for this client's projects at that moment. */
function ClientCompanySettings({ client, brand, accent, onUpdateClient }) {
  const { draft, set, dirty, reset } = useDraft(client, ["companyName", "companyWebsite", "email", "phone", "address", "logo", "whiteLabel"]);
  const wlOn = !!client.whiteLabel?.enabled;
  const dwl = draft.whiteLabel || {};
  const setWl = (patch) => set({ whiteLabel: { ...(draft.whiteLabel || {}), ...patch } });
  const useOwn = !!client.dfs?.useOwn;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card className="p-5">
        <div className="mb-2 flex items-center gap-2"><Building2 size={15} className="text-gray-400" /><span className="ll-display text-[15px] font-semibold">Company settings</span></div>
        <p className="mb-3 text-[11.5px] text-gray-400">Keep your business details current — your SEO team sees the same information.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Company name"><input value={draft.companyName || ""} onChange={(e) => set({ companyName: e.target.value })} className={inputCls} /></Labeled>
          <Labeled label="Company website"><input value={draft.companyWebsite || ""} onChange={(e) => set({ companyWebsite: e.target.value })} className={inputCls} /></Labeled>
          <Labeled label="Email"><input value={draft.email || ""} onChange={(e) => set({ email: e.target.value })} className={inputCls} /></Labeled>
          <Labeled label="Phone"><input value={draft.phone || ""} onChange={(e) => set({ phone: e.target.value })} className={inputCls} /></Labeled>
        </div>
        <div className="mt-3">
          <Labeled label="Business address"><input value={draft.address || ""} onChange={(e) => set({ address: e.target.value })} className={inputCls} /></Labeled>
        </div>
        <div className="mt-3">
          <Labeled label="Company logo">
            <LogoUpload value={draft.logo || null} onChange={(logo) => set({ logo })} label="Upload company logo" />
          </Labeled>
          <p className="mt-1 text-[10.5px] text-gray-400">Used wherever your company is presented — including invoices.</p>
        </div>
        {wlOn && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <div className="ll-display mb-1 text-[13.5px] font-semibold">Dashboard branding</div>
            <p className="mb-3 text-[11.5px] text-gray-400">This branding appears across your dashboard and on downloaded reports.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled label="Brand name"><input value={dwl.name || ""} onChange={(e) => setWl({ name: e.target.value })} placeholder={client.companyName || client.name} className={inputCls} /></Labeled>
              <Labeled label="Brand website"><input value={dwl.website || ""} onChange={(e) => setWl({ website: e.target.value })} placeholder={client.companyWebsite} className={inputCls} /></Labeled>
            </div>
            <div className="mt-3">
              <Labeled label="Brand logo">
                <LogoUpload value={dwl.logo || null} onChange={(logo) => setWl({ logo })} label="Upload brand logo" />
              </Labeled>
            </div>
          </div>
        )}
        <SaveBar dirty={dirty} onSave={() => onUpdateClient(draft)} onReset={reset} accent={accent} saveLabel="Save company settings" />
      </Card>

      <Card className="p-5">
        <div className="ll-display text-[15px] font-semibold">DataForSEO API</div>
        <div className="mt-2 rounded-xl border border-gray-100 p-3">
          <Toggle on={useOwn}
            onChange={(v) => onUpdateClient((c) => ({ dfs: { login: "", password: "", ...(c.dfs || {}), useOwn: v } }))}
            label="Use our own DataForSEO account"
            desc={useOwn
              ? "Rank tracking, map-grid scans and index checks for your projects run — and bill — on your own DataForSEO account. Turn this off to run on your SEO team's account again."
              : 'Your projects currently run on your SEO team\'s DataForSEO account. Turn this on to use your own account instead — your SEO team\'s API disconnects for your projects the moment you do, and scans show "not configured" until your credentials below are verified.'} />
        </div>
      </Card>
      {useOwn && <ClientApiSettings client={client} brand={brand} accent={accent} onUpdateClient={onUpdateClient} />}
    </div>
  );
}

/* ---- the client's chat hub -------------------------------------------
   DIRECT MESSAGES: the owner's private line (always there) plus one 3-way
   thread per team member the agency assigned in Client settings — each
   shown by DESIGNATION only ("Web Developer"), never a name, email or
   photo. PROJECT CHANNELS: the channels the team added the client to,
   listed with the project logo. All masking comes from maskName/AvaMask. */
function ClientChatPane({ client, company, brand, accent, maskName, roleLabelOf, channels,
  onSendOwner, onReactOwner, onReadOwner, onSendTrio, onReactTrio, onReadTrio, onSendChannel, onReactChannel, onReadChannel }) {
  const me = client.contact;
  const ownerChat = client.ownerChat || { msgs: [], reads: {} };
  /* duplicate designations stay distinct: "Web Developer", "Web Developer 2" */
  const seen = {};
  const trios = (client.chatMembers || []).map((mid) => {
    const m = (company.team || []).find((x) => x.id === mid);
    if (!m || m.isOwner) return null;
    const base = roleLabelOf(m.name);
    seen[base] = (seen[base] || 0) + 1;
    return { mid, label: seen[base] > 1 ? `${base} ${seen[base]}` : base, chat: (client.memberChats || {})[mid] || { msgs: [], reads: {} } };
  }).filter(Boolean);
  const unread = (ch) => (ch.msgs || []).filter((m) => m.author !== me && m.ts > ((ch.reads || {})[me] || 0)).length;
  const chUnread = (p) => (p.chatMsgs || []).filter((m) => m.author !== me && m.ts > ((p.chatReads || {})[me] || 0)).length;
  const [sel, setSel] = useState({ type: "owner" });
  const selTrio = sel.type === "trio" ? trios.find((t) => t.mid === sel.mid) : null;
  const selChan = sel.type === "chan" ? channels.find((p) => p.id === sel.pid) : null;
  useEffect(() => {
    if (sel.type === "owner" && unread(ownerChat) > 0) onReadOwner();
    if (selTrio && unread(selTrio.chat) > 0) onReadTrio(selTrio.mid);
    if (selChan && chUnread(selChan) > 0) onReadChannel(selChan.id);
  }); // cheap guards — always converges
  const preview = (msgs) => { const last = (msgs || [])[(msgs || []).length - 1]; return last ? `${last.author === me ? "You" : maskName(last.author)}: ${last.text}` : "No messages yet"; };
  const row = (key, active, onClick, icon, label, sub, n) => (
    <button key={key} onClick={onClick} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-gray-50" style={active ? { background: accent + "10" } : {}}>
      {icon}
      <span className="min-w-0 flex-1">
        <span className={"block truncate text-[12.5px] font-semibold " + (active ? "" : "text-gray-800")} style={active ? { color: accent } : {}}>{label}</span>
        <span className="block truncate text-[10.5px] text-gray-400">{sub}</span>
      </span>
      {n > 0 && <span className="ll-mono shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold text-white" style={{ background: accent }}>{n}</span>}
    </button>
  );
  const sectionLabel = (t) => <div className="px-3.5 pb-1 pt-3 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">{t}</div>;
  const brandTile = <BrandMark name={brand.name} logo={brand.logo} accent={brand.accent || accent} />;
  return (
    <Card className="flex overflow-hidden p-0" style={{ height: "min(72vh, 640px)" }}>
      <div className="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-gray-100 bg-white">
        {sectionLabel("Direct messages")}
        {row("owner", sel.type === "owner", () => setSel({ type: "owner" }), brandTile, "Owner", `${brand.name} — private line`, unread(ownerChat))}
        {trios.map((t) => row(t.mid, selTrio?.mid === t.mid, () => setSel({ type: "trio", mid: t.mid }),
          <Ava name={t.label} size={28} />, t.label, "3-way with the owner", unread(t.chat)))}
        <div className="mt-1 border-t border-gray-100">{sectionLabel("Project channels")}</div>
        {channels.length === 0 && <div className="px-3.5 py-1.5 text-[10.5px] leading-relaxed text-gray-300">Your team hasn't added you to a project channel yet.</div>}
        {channels.map((p) => row(p.id, selChan?.id === p.id, () => setSel({ type: "chan", pid: p.id }),
          <ProjectMark project={p} />, p.name, preview(p.chatMsgs), chUnread(p)))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col bg-[#FAFBFC]">
        {sel.type === "owner" && (<>
          <div className="flex items-center gap-2.5 border-b border-gray-100 bg-white px-4 py-2.5">{brandTile}
            <div><div className="text-[13px] font-bold text-gray-800">Owner</div><div className="text-[10px] text-gray-400">Your private line with the {brand.name} owner.</div></div></div>
          <MessageThread msgs={ownerChat.msgs || []} me={me} accent={accent} maskName={maskName} onSend={onSendOwner} onReact={onReactOwner} />
        </>)}
        {selTrio && (<>
          <div className="flex items-center gap-2.5 border-b border-gray-100 bg-white px-4 py-2.5"><Ava name={selTrio.label} size={28} />
            <div><div className="text-[13px] font-bold text-gray-800">{selTrio.label}</div><div className="text-[10px] text-gray-400">3-way chat — you, the owner and your {selTrio.label.toLowerCase()}.</div></div></div>
          <MessageThread msgs={selTrio.chat.msgs || []} me={me} accent={accent} maskName={maskName}
            onSend={(text, replyTo) => onSendTrio(selTrio.mid, text, replyTo)} onReact={(msgId, emoji) => onReactTrio(selTrio.mid, msgId, emoji)} />
        </>)}
        {selChan && (<>
          <div className="flex items-center gap-2.5 border-b border-gray-100 bg-white px-4 py-2.5"><ProjectMark project={selChan} size="md" />
            <div><div className="text-[13px] font-bold text-gray-800">{selChan.name}</div><div className="text-[10px] text-gray-400">Project channel — the whole project team sees these messages.</div></div></div>
          <MessageThread msgs={selChan.chatMsgs || []} me={me} accent={selChan.accent || accent} maskName={maskName}
            onSend={(text, replyTo) => onSendChannel(selChan.id, text, replyTo)} onReact={(msgId, emoji) => onReactChannel(selChan.id, msgId, emoji)} />
        </>)}
      </div>
    </Card>
  );
}
import { AgentLauncher, AgentPanel } from "../agent/AgentPanel.jsx";
import { emptySiteData, genSiteData, hydrate } from "../../data/gen.js";

/* heavy Performance views are code-split exactly like the team dashboard */
const GeoGridViewLazy = React.lazy(() => import("../performance/geogrid.jsx").then((m) => ({ default: m.GeoGridView })));
const GoogleLiveDataLazy = React.lazy(() => import("../performance/googlelive.jsx").then((m) => ({ default: m.GoogleLiveData })));
const viewLoader = <div className="p-10 text-center text-[12.5px] text-gray-400">Loading…</div>;

export function LoginScreen({ company, dark, onAuthed }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState("creds");     // creds | code — 2FA for new devices
  const [pendEmail, setPendEmail] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  /* password is verified SERVER-SIDE (/api/app/login) against the persisted
     workspace; a session token is minted only after auth (+2FA on new devices) */
  const submit = async () => {
    setBusy(true); setError(""); setNotice(null);
    try {
      const r = await fetch("/api/app/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(25000),
        body: JSON.stringify({ login: email.trim(), password, deviceToken: localStorage.getItem("ss_dev_token") || "", smtp: company.apis?.smtp?.values }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { setError(d.detail || "Email/username or password doesn't match an active account."); return; }
      if (d.token) { onAuthed(d.token, d.identity); return; }         // trusted device — straight in
      if (r.ok && d.needs2fa) {
        setPendEmail(d.email); setStep("code"); setCode("");
        setNotice(d.demo
          ? { kind: "demo", text: `New device detected. Email service isn't configured — DEMO code (local testing only): ${d.devCode}` }
          : { kind: "info", text: `New device or browser detected — we emailed a 6-digit code to ${d.email}. It expires in 10 minutes.` });
        return;
      }
      setError(d.detail || "Sign-in failed.");
    } catch {
      setError("Sign-in server unreachable — start the API server (npm run api). Sign-in is required.");
    } finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/app/2fa", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ email: pendEmail, code: code.trim(), ua: navigator.userAgent }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.detail || "Wrong code."); return; }
      if (d.deviceToken) localStorage.setItem("ss_dev_token", d.deviceToken); // this browser is now trusted
      onAuthed(d.token, d.identity);
    } catch { setError("Verification server unreachable — try again."); }
    finally { setBusy(false); }
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
            <button onClick={submit} disabled={busy} className="font-semibold" style={{ color: company.accent }}>Resend code</button>
            <button onClick={() => { setStep("creds"); setError(""); setNotice(null); }} className="text-gray-400 hover:text-gray-600">← Back</button>
          </div>
          <div className="text-[10px] leading-relaxed text-gray-400">This device will be remembered for 90 days. Clearing your browser data or using a new browser asks for a fresh code.</div>
        </Card>
        ) : (
        <Card className="space-y-3 p-5">
          <Labeled label="Email or username">
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
        <div className="mt-3 text-center text-[10.5px] text-gray-400">Data is stored on your server — you stay signed in on this device for 30 days.</div>
      </div>
    </div>
  );
}

export function ClientPortal({ client, company, dark, setDark, onLogout, onUpdateProject, onUpdateClient, saveWarn = null, appOutdated = false }) {
  /* the sidebar tucks away for a full-width view — remembered per device,
     same key the team dashboard uses */
  const [sbHidden, setSbHidden] = useState(() => localStorage.getItem("ss_sb_hidden") === "1");
  const toggleSb = (v) => { setSbHidden(v); try { localStorage.setItem("ss_sb_hidden", v ? "1" : "0"); } catch { /* private mode */ } };
  const allowed = client.projects.filter((p) => client.login.projectIds.includes(p.id));
  const [pid, setPid] = useState(allowed[0]?.id);
  /* SAME SHELL AS THE TEAM DASHBOARD: a section ("performance" | "management")
     with Performance views underneath it, plus personal screens (Messages,
     Settings) that take over the main area — the exact model App.jsx uses for
     team members, so a client sees the product, not a separate portal. */
  const [section, setSection] = useState("performance");
  const [view, setView] = useState("overview");
  const [accountView, setAccountView] = useState(null); // null | "messages" | "apisettings"
  const [cmp, setCmp] = useState(3);
  const [range, setRange] = useState(DEFAULT_RANGE);
  const project = allowed.find((p) => p.id === pid) || allowed[0];

  const tracking = useMemo(() => (project ? project.tracking.map((t) => hydrate(t, project.demoMode !== false)) : []), [project?.tracking, project?.demoMode]);
  const trackedKeywords = useMemo(() => (project ? [...new Set(project.tracking.map((t) => t.keyword))] : []), [project?.tracking]);
  const monthKey = useMonthGrid();
  const locSig = (p) => (p?.locations || []).map((l) => l.id + l.name + Object.values(l.integrations || {}).join("")).join("|");
  const data = useMemo(
    () => (project && project.demoMode !== false ? genSiteData(project, trackedKeywords, client.companyName) : null),
    [project?.id, project?.name, trackedKeywords.join("|"), client.companyName, monthKey, locSig(project)] // name seeds the generator; monthKey handles rollover; locSig re-derives on location-group edits
  );
  /* REAL projects (demoMode === false) render like the team dashboard: the
     Overview keeps its designed layout with all-zero series + live Google data
     inside, and the web view shows the live GSC/GA4 dashboards once the team
     has connected Google — never a "come back later" card over real work */
  const liveData = useMemo(
    () => (project && project.demoMode === false ? emptySiteData(project) : null),
    [project?.id, project?.demoMode, monthKey, locSig(project)] // eslint-disable-line
  );
  const googleConnected = !!(project?.google?.connectionId && (project.google.gscSite || project.google.ga4Property));
  const accent = project?.accent || "#1F2A44";

  const wl = client.whiteLabel;
  const brand = wl?.enabled
    ? { name: wl.name || client.companyName || client.name, logo: wl.logo, website: wl.website, accent }
    : { name: company.name, logo: company.logo, website: "", accent: company.accent };

  const lg = client.login;
  /* a client is in a project channel when the team ADDED them there (channel
     member list → Add client) — the legacy account-wide canChat flag keeps
     working for clients set up before per-channel membership existed */
  const inChannel = (p) => !!lg.canChat || !!p?.clientInChannel;
  const chatChannels = allowed.filter(inChannel);
  const canChat = inChannel(project);
  const canPm = !!lg.canManageTasks || !!lg.canComment || canChat;
  const unreadChat = (project?.chatMsgs || []).filter((m) => m.author !== client.contact && m.ts > ((project?.chatReads || {})[client.contact] || 0)).length;
  /* the same per-view gates as before, expressed like the team dashboard's
     visibleNav: Overview needs at least one granted data view (CLIENT_DEFAULT_ON
     flags default to true when unset — `!== false` — matching the settings UI) */
  const gbpShown = !!(project?.integrations.gbp || project?.integrations.bing || project?.integrations.apple) && lg.canViewGbp !== false;
  const webShown = (!!(project?.integrations.ga || project?.integrations.gsc) || googleConnected) && lg.canViewWeb !== false;
  const ranksShown = lg.canViewRanks !== false;
  /* read-only map reports — the scans themselves stay agency-side */
  const geogridShown = lg.canViewGeogrid !== false;
  const nav = NAV.filter((n) => {
    if (n.key === "settings") return false;
    if (n.key === "ranks") return ranksShown;
    if (n.key === "geogrid") return geogridShown;
    if (n.key === "adsperf") return !!lg.canViewAds && (project?.ads?.campaigns || []).some((c) => c.status !== "draft");
    if (n.key === "gbp") return gbpShown;
    if (n.key === "web") return webShown;
    if (n.key === "overview") return gbpShown || webShown || ranksShown || geogridShown;
    return true;
  });
  const visibleSections = [
    ...(nav.length > 0 ? [["performance", "Performance Studio", BarChart3]] : []),
    ...(canPm ? [["management", "Project Management", ListTodo]] : []),
  ];
  const activeSection = visibleSections.some(([k]) => k === section) ? section : (visibleSections[0]?.[0] || "none");
  const activeView = nav.some((n) => n.key === view) ? view : (nav[0]?.key || "overview");
  /* private owner ↔ client line (the owner answers from the dashboard chat) */
  const ownerChat = client.ownerChat || { msgs: [], reads: {} };
  const msgUnread = (ownerChat.msgs || []).filter((m) => m.author !== client.contact && m.ts > ((ownerChat.reads || {})[client.contact] || 0)).length;
  const sendOwnerMsg = (text, replyTo = null) => {
    const now = Date.now();
    onUpdateClient?.((c) => ({ ownerChat: { msgs: capMsgs([...((c.ownerChat || {}).msgs || []), { id: "km" + now, ts: now, author: client.contact, text, replyTo }]), reads: { ...((c.ownerChat || {}).reads || {}), [client.contact]: now } } }));
  };
  const reactOwnerMsg = (msgId, emoji) => onUpdateClient?.((c) => ({ ownerChat: { msgs: [], reads: {}, ...(c.ownerChat || {}), msgs: ((c.ownerChat || {}).msgs || []).map((m) => (m.id === msgId ? toggleReaction(m, emoji, client.contact) : m)) } }));
  /* 3-way member threads — one per team member the agency assigned */
  const patchTrioC = (mid, fn) => onUpdateClient?.((c) => ({ memberChats: { ...(c.memberChats || {}), [mid]: { msgs: [], reads: {}, ...((c.memberChats || {})[mid] || {}), ...fn((c.memberChats || {})[mid] || { msgs: [], reads: {} }) } } }));
  const sendTrioMsg = (mid, text, replyTo = null) => { const now = Date.now(); patchTrioC(mid, (ch) => ({ msgs: capMsgs([...(ch.msgs || []), { id: "tm" + now, ts: now, author: client.contact, text, replyTo }]), reads: { ...(ch.reads || {}), [client.contact]: now } })); };
  const reactTrioMsg = (mid, msgId, emoji) => patchTrioC(mid, (ch) => ({ msgs: (ch.msgs || []).map((m) => (m.id === msgId ? toggleReaction(m, emoji, client.contact) : m)) }));
  const readTrio = (mid) => patchTrioC(mid, (ch) => ({ reads: { ...(ch.reads || {}), [client.contact]: Date.now() } }));
  /* project-channel chat from the portal — same thread the team sees */
  const sendChanMsg = (pid, text, replyTo = null) => { const now = Date.now(); onUpdateProject(pid, (p) => ({ chatMsgs: capMsgs([...(p.chatMsgs || []), { id: "cm" + now, ts: now, author: client.contact, text, replyTo }]), chatReads: { ...(p.chatReads || {}), [client.contact]: now } })); };
  const reactChanMsg = (pid, msgId, emoji) => onUpdateProject(pid, (p) => ({ chatMsgs: (p.chatMsgs || []).map((m) => (m.id === msgId ? toggleReaction(m, emoji, client.contact) : m)) }));
  const readChan = (pid) => onUpdateProject(pid, (p) => ({ chatReads: { ...(p.chatReads || {}), [client.contact]: Date.now() } }));
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

  /* personal screens — the client's equivalent of the team sidebar's
     "Personal Dashboard" block (Messages replaces team Chat; Company settings
     is where the client edits their own details, branding and API account) */
  /* chat badge: owner line + 3-way member threads + project channels */
  const trioUnread = (client.chatMembers || []).reduce((n, mid) => {
    const ch = (client.memberChats || {})[mid] || {};
    return n + (ch.msgs || []).filter((m) => m.author !== client.contact && m.ts > ((ch.reads || {})[client.contact] || 0)).length;
  }, 0);
  const chanUnreadTotal = chatChannels.reduce((n, p) => n + (p.chatMsgs || []).filter((m) => m.author !== client.contact && m.ts > ((p.chatReads || {})[client.contact] || 0)).length, 0);
  const chatBadge = msgUnread + trioUnread + chanUnreadTotal;
  const personal = [
    ["messages", "Chat", MessageSquare, chatBadge > 0 ? { n: chatBadge, bg: "#DBEAFE", fg: "#1D4ED8" } : null],
    ["company", "Company settings", Settings, null],
  ];
  const selectProject = (id) => { setPid(id); setSection("performance"); setView("overview"); setAccountView(null); };

  return (
    <div className={`ll-root ${dark ? "ll-dark" : ""} flex min-h-screen items-stretch bg-[#F5F6F8]`} style={{ "--accent": accent }}>
      <style>{FONT_CSS}</style>

      {/* Sidebar — the same shell team members see: brand on top, personal
          screens, a flat project list, and the signed-in identity at the foot */}
      {!sbHidden && (
      <aside className="ll-sb no-print sticky top-0 z-30 hidden h-screen w-64 shrink-0 flex-col self-start border-r border-gray-200 bg-white md:flex">
        <div className="flex items-center justify-between px-4 py-5">
          <div className="flex min-w-0 items-center gap-2">
            <BrandMark name={brand.name} logo={brand.logo} accent={brand.accent} />
            <span className="ll-display truncate text-[16px] font-bold tracking-tight">{brand.name}</span>
          </div>
          <button onClick={() => toggleSb(true)} title="Hide sidebar"
            className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <PanelLeftClose size={16} />
          </button>
        </div>
        <div className="px-4 pb-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Personal Dashboard</div>
        <div className="space-y-0.5 px-2.5 pb-3">
          {personal.map(([key, label, Icon, badge]) => {
            const active = accountView === key;
            return (
              <button key={key} onClick={() => setAccountView((v) => (v === key ? null : key))}
                className={"flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[12.5px] font-medium" + (active ? "" : " text-gray-600")}
                style={active ? { background: accent + "12", color: accent } : {}}>
                <Icon size={14} className={active ? "" : "text-gray-400"} /> {label}
                {badge && <span className="ll-mono ml-auto rounded-full px-1.5 py-0.5 text-[9.5px] font-bold" style={{ background: badge.bg, color: badge.fg }}>{badge.n}</span>}
              </button>
            );
          })}
        </div>
        <div className="mx-4 mb-2 border-t border-gray-100" />
        <div className="px-4 pb-2 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Projects</div>
        <div className="flex-1 overflow-y-auto px-2.5">
          {allowed.map((p) => (
            <div key={p.id} className="group mb-0.5 flex items-center gap-0.5 rounded-lg hover:bg-gray-50"
              style={p.id === project?.id && !accountView ? { background: p.accent + "12" } : {}}>
              <button onClick={() => selectProject(p.id)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left">
                <ProjectMark project={p} />
                <span className={"block min-w-0 truncate text-[12.5px] font-medium" + (p.id === project?.id && !accountView ? "" : " text-gray-700")}
                  style={p.id === project?.id && !accountView ? { color: p.accent } : {}}>{p.name}</span>
              </button>
            </div>
          ))}
          {allowed.length === 0 && (
            <div className="px-2 py-1.5 text-[11.5px] text-gray-300">No projects have been shared with your account yet.</div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-gray-100 p-3">
          <div className="flex min-w-0 items-center gap-2">
            <Ava name={client.contact} size={28} />
            <div className="min-w-0">
              <div className="truncate text-[12px] font-semibold text-gray-700">{client.contact}</div>
              <div className="text-[10.5px] text-gray-400">Client · {allowed.length} project(s)</div>
            </div>
          </div>
          <button onClick={onLogout} title="Log out"
            className="shrink-0 rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:border-gray-300 hover:text-gray-600">
            <LogOut size={13} />
          </button>
        </div>
      </aside>
      )}
      {/* the way back in when the sidebar is tucked away */}
      {sbHidden && (
        <button onClick={() => toggleSb(false)} title="Show sidebar"
          className="no-print fixed bottom-4 left-4 z-40 hidden rounded-full border border-gray-200 bg-white p-2.5 text-gray-500 shadow-lg hover:text-gray-700 md:block">
          <PanelLeftOpen size={17} />
        </button>
      )}

      {/* Main */}
      <main className="print-full min-w-0 flex-1">
        {accountView ? (
          <>
            <div className="no-print sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white/90 px-5 py-2.5 backdrop-blur">
              <div className="ll-display text-[14px] font-semibold text-gray-700">
                {{ messages: "Chat", company: "Company settings" }[accountView]}
              </div>
              <div className="flex items-center gap-2">
                <DarkToggle dark={dark} setDark={setDark} />
                <button onClick={onLogout} className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] font-medium text-gray-600 hover:border-gray-300 md:hidden">
                  <LogOut size={14} /> Log out
                </button>
                <button onClick={() => setAccountView("company")} title="Company settings" className="rounded-full ring-2 ring-transparent hover:ring-gray-300">
                  <Ava name={client.contact} size={32} />
                </button>
              </div>
            </div>
            <div className="mx-auto max-w-6xl p-5">
              {accountView === "messages" && (
                <AvaMaskCtx.Provider value={avaMask}>
                  <ClientChatPane client={client} company={company} brand={brand} accent={accent} maskName={maskName}
                    roleLabelOf={roleLabelOf} channels={chatChannels}
                    onSendOwner={sendOwnerMsg} onReactOwner={reactOwnerMsg}
                    onReadOwner={() => onUpdateClient?.((c) => ({ ownerChat: { msgs: [], ...(c.ownerChat || {}), reads: { ...((c.ownerChat || {}).reads || {}), [client.contact]: Date.now() } } }))}
                    onSendTrio={sendTrioMsg} onReactTrio={reactTrioMsg} onReadTrio={readTrio}
                    onSendChannel={sendChanMsg} onReactChannel={reactChanMsg} onReadChannel={readChan} />
                </AvaMaskCtx.Provider>
              )}
              {accountView === "company" && (
                <ClientCompanySettings client={client} brand={brand} accent={accent} onUpdateClient={onUpdateClient} />
              )}
            </div>
          </>
        ) : (
        <>
        <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 px-5 py-3.5 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {project && <ProjectMark project={project} size="md" />}
              <div>
                <div className="ll-display text-[17px] font-semibold leading-tight">{project?.name}</div>
                <div className="flex items-center gap-2 text-[11.5px] text-gray-400">
                  <Globe size={11} /> {project?.website}
                </div>
              </div>
            </div>
            <div className="no-print flex flex-wrap items-center gap-2">
              {/* the sidebar is hidden on small screens — keep switching possible there */}
              {allowed.length > 1 && (
                <select value={project?.id || ""} onChange={(e) => selectProject(e.target.value)}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] font-medium md:hidden">
                  {allowed.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              {lg.canDownload && (
                <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] font-medium text-gray-600 hover:border-gray-300">
                  <Printer size={14} /> Report
                </button>
              )}
              <DarkToggle dark={dark} setDark={setDark} />
              <button onClick={onLogout} className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] font-medium text-gray-600 hover:border-gray-300 md:hidden">
                <LogOut size={14} /> Log out
              </button>
              <button onClick={() => setAccountView("company")} title="Company settings" className="rounded-full ring-2 ring-transparent hover:ring-gray-300">
                <Ava name={client.contact} size={34} />
              </button>
            </div>
          </div>
          <div className="no-print mt-3 flex flex-wrap gap-1.5">
            {visibleSections.map(([key, label, Icon]) => (
              <button key={key} onClick={() => { setSection(key); setAccountView(null); }}
                className="flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-semibold"
                style={activeSection === key ? { background: accent, borderColor: accent, color: "#fff" } : { borderColor: "#E5E7EB", color: "var(--chip-fg, #4B5563)", background: "var(--chip-bg, #fff)" }}>
                <Icon size={14} /> {label}
                {key === "management" && unreadChat > 0 && (
                  <span className="ll-mono flex items-center gap-1 rounded-full px-1.5 text-[10px] font-bold" title={`${unreadChat} unread chat message${unreadChat === 1 ? "" : "s"}`}
                    style={activeSection === key ? { background: "rgba(255,255,255,.25)", color: "#fff" } : { background: "#DBEAFE", color: "#1D4ED8" }}>
                    <MessageSquare size={9} /> {unreadChat}
                  </span>
                )}
              </button>
            ))}
          </div>
          {activeSection === "performance" && (
          <div className="no-print mt-2 flex flex-wrap gap-1">
            {nav.map((n) => (
              <button key={n.key} onClick={() => setView(n.key)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium"
                style={activeView === n.key ? { background: accent + "14", color: accent } : { color: "var(--chip-fg, #6B7280)" }}>
                <n.icon size={14} /> {n.label}
              </button>
            ))}
          </div>
          )}
        </div>

        <div className="mx-auto max-w-6xl p-5">
          {!project && (
            <Card className="p-10 text-center text-[13px] text-gray-400">
              No projects have been shared with your account yet — please contact your SEO team.
            </Card>
          )}
          {project && visibleSections.length === 0 && (
            <Card className="p-10 text-center text-[13px] leading-relaxed text-gray-400">
              No sections are enabled for your account yet — please contact your SEO team.
            </Card>
          )}
          {project && activeSection === "performance" && (
            <>
              {/* the Overview always renders its designed layout — demo numbers on
                  demo projects, all-zero series + live Google data on real ones */}
              {activeView === "overview" && (data
                ? <OverviewView project={project} data={data} tracking={tracking} cmp={cmp} accent={accent} clientView />
                : <OverviewView project={project} data={liveData} tracking={tracking} cmp={cmp} accent={accent} clientView liveMode />)}
              {/* rank trackers pull their OWN real data — they render with or without `data` */}
              {activeView === "ranks" && ranksShown && <RankTrackingView project={project} tracking={tracking} dfsConnected accent={accent} onAdd={() => {}} onDelete={() => {}} readOnly />}
              {activeView === "geogrid" && geogridShown && (
                <React.Suspense fallback={viewLoader}>
                  <GeoGridViewLazy project={project} accent={accent} onUpdate={() => {}} dfs={{}} readOnly />
                </React.Suspense>
              )}
              {activeView === "gbp" && gbpShown && (data
                ? <GbpView project={project} data={data} range={range} setRange={setRange} accent={accent} />
                : <Card className="p-10 text-center text-[13px] leading-relaxed text-gray-400">
                    Your Business Profile dashboards are being connected — data appears here as soon as your
                    SEO team finishes linking the profile sources. Nothing is shown until it's real.
                  </Card>)}
              {activeView === "web" && webShown && (data
                ? <WebsitePerformanceView project={project} data={data} range={range} setRange={setRange} accent={accent} />
                : googleConnected
                  ? <React.Suspense fallback={viewLoader}><GoogleLiveDataLazy project={project} accent={accent} /></React.Suspense>
                  : <Card className="p-10 text-center text-[13px] leading-relaxed text-gray-400">
                      Your website analytics are being connected — data appears here as soon as your SEO team
                      finishes linking Google Search Console and Analytics. Nothing is shown until it's real.
                    </Card>)}
              {activeView === "adsperf" && !!lg.canViewAds && <AdsPerformanceView project={project} accent={accent} />}
            </>
          )}
          {project && activeSection === "management" && canPm && (
            <AvaMaskCtx.Provider value={avaMask}>
            <ProjectManagementView project={project} people={pmPeople} maskName={maskName}
              perms={{ admin: false, create: false, manage: false, complete: !!lg.canManageTasks, comment: !!lg.canComment }}
              currentUser={client.contact} accent={accent} canChat={canChat}
              onUpdate={(patch) => onUpdateProject(project.id, patch)} log={null} />
            </AvaMaskCtx.Provider>
          )}
          <div className="mt-8 flex items-center justify-between border-t border-gray-200 pt-4 text-[11px] text-gray-400">
            <span>{brand.name} · report for {project?.name}</span>
            <span>{brand.website || ""}</span>
          </div>
        </div>
        </>
        )}
      </main>

      {saveWarn && (
        <div className="no-print fixed bottom-4 left-1/2 z-50 max-w-xl -translate-x-1/2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] font-semibold text-red-700 shadow-lg">
          {saveWarn}
        </div>
      )}
      {/* a portal tab left open across a deploy keeps running the OLD app —
          including whatever that deploy fixed or added (this is exactly how
          "the new dashboard isn't showing" happens). Team tabs already get
          this banner; a client's tab deserves the same way out. */}
      {appOutdated && (
        <div className="no-print fixed bottom-16 left-1/2 z-50 w-[min(92vw,24rem)] -translate-x-1/2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lg">
          <div className="text-[12.5px] font-semibold text-gray-800">Your dashboard has been updated</div>
          <div className="mt-0.5 text-[11.5px] leading-relaxed text-gray-500">Reload to see the latest features and data views.</div>
          <button onClick={() => window.location.reload()} className="mt-2 rounded-lg px-3.5 py-1.5 text-[12px] font-semibold text-white" style={{ background: accent }}>
            Reload now
          </button>
        </div>
      )}
      {lg.canUseAgent && allowed.length > 0 && (
        <>
          {!agentOpen && <AgentLauncher accent={accent} onClick={() => setAgentOpen(true)} />}
          {agentOpen && <AgentPanel ctx={agentCtx} accent={accent} aiProvider={null} onAction={() => {}} onClose={() => setAgentOpen(false)} />}
        </>
      )}
    </div>
  );
}

