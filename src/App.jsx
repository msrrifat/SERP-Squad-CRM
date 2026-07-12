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
  Calendar, Sun, Moon, Shield, History, UserPlus, Wallet, Receipt, ListTodo, MessageSquare, User, ClipboardList, Megaphone,
  Rocket, Share2, Lock, Send, ImagePlus, List, ListOrdered, Quote, Facebook, Instagram, Linkedin, Twitter, Youtube, Music2, Pin,
} from "lucide-react";
import { AddClientModal, AddProjectModal, ClientSettingsModal, ProjectSettingsModal } from "./features/clients/modals.jsx";
import { Ava, BrandMark, DarkToggle, FONT_CSS, Modal, ProjectMark } from "./ui/primitives.jsx";
import { DEFAULT_RANGE, useMonthGrid } from "./lib/months.jsx";
import { GbpView, NAV, NoDataPanel, OverviewView, RankTrackingView, WebsitePerformanceView } from "./features/performance/views.jsx";
import { ROLE_AUTO_SECTIONS, ROLE_PRESETS, SEED_CLIENTS, SEED_COMPANY } from "./data/seed.js";
import { genSiteData, hydrate } from "./data/gen.js";
import { todayISO } from "./lib/format.jsx";
import { capMsgs, toggleReaction } from "./features/chat/thread.jsx";

/* Heavy screens are code-split: each loads on first use, keeping the initial
   bundle (dashboard) small. React.lazy + the named-export shim below. */
const lazyOf = (loader, name) => React.lazy(() => loader().then((m) => ({ default: m[name] })));
const ClientPortal = lazyOf(() => import("./features/clients/portal.jsx"), "ClientPortal");
const LoginScreen = lazyOf(() => import("./features/clients/portal.jsx"), "LoginScreen");
const CompanyPage = lazyOf(() => import("./features/company/settings.jsx"), "CompanyPage");
const ReportBuilder = lazyOf(() => import("./features/reports/ReportBuilder.jsx"), "ReportBuilder");
import { ReportsHome } from "./features/reports/ReportsHome.jsx";
const OptimizationView = lazyOf(() => import("./features/optimization/studio.jsx"), "OptimizationView");
const AccountSettingsView = lazyOf(() => import("./features/account/panel.jsx"), "AccountSettingsView");
const AssignmentsView = lazyOf(() => import("./features/account/panel.jsx"), "AssignmentsView");
const ChatHome = lazyOf(() => import("./features/account/panel.jsx"), "ChatHome");
const TeamView = lazyOf(() => import("./features/account/panel.jsx"), "TeamView");
const AdsView = lazyOf(() => import("./features/ads/dashboard.jsx"), "AdsView");
const AdsPerformanceView = lazyOf(() => import("./features/ads/dashboard.jsx"), "AdsPerformanceView");
const ProjectManagementView = lazyOf(() => import("./features/pm/board.jsx"), "ProjectManagementView");
const GeoGridView = lazyOf(() => import("./features/performance/geogrid.jsx"), "GeoGridView");
const SharedReportView = lazyOf(() => import("./features/performance/geogrid.jsx"), "SharedReportView");
const AgentPanel = lazyOf(() => import("./features/agent/AgentPanel.jsx"), "AgentPanel");
const AgentLauncher = lazyOf(() => import("./features/agent/AgentPanel.jsx"), "AgentLauncher");

const ScreenLoader = () => (
  <div className="flex min-h-[40vh] w-full items-center justify-center text-[13px] text-gray-400">Loading…</div>
);
const Lazy = ({ children }) => <React.Suspense fallback={<ScreenLoader />}>{children}</React.Suspense>;

export default function App() {
  const [company, setCompany] = useState(SEED_COMPANY);
  const [clients, setClients] = useState(SEED_CLIENTS);
  const [activeClientId, setActiveClientId] = useState(SEED_CLIENTS[0].id);
  const [activeProjectId, setActiveProjectId] = useState(SEED_CLIENTS[0].projects[0].id);
  const [expanded, setExpanded] = useState(() => new Set(SEED_CLIENTS.map((c) => c.id)));
  const [view, setView] = useState("overview");
  const [cmp, setCmp] = useState(3);
  const [clientView, setClientView] = useState(false);
  const [modal, setModal] = useState(null); // {type:"addClient"|"addProject"|"clientSettings"|"companySettings", clientId?}
  const [screen, setScreen] = useState("app");      // "app" | "login"
  const [accountView, setAccountView] = useState(null); // null | "settings" | "assignments" | "chat" | "team" — personal screens in the main area
  const [pmJump, setPmJump] = useState(null);            // { recordId, k } — deep link from My assignments
  const [session, setSession] = useState(null);     // { clientId } when a client is signed in
  const [teamSession, setTeamSession] = useState(null); // { memberId } when a team member (not the owner) is signed in
  useEffect(() => { setAccountView(null); setPmJump(null); }, [teamSession?.memberId]); // personal screens never leak across user switches
  const [showReport, setShowReport] = useState(null); // null | "performance" | "work"
  const [range, setRange] = useState(DEFAULT_RANGE);
  const [dark, setDark] = useState(false);
  const [section, setSection] = useState("performance"); // "performance" | "management"
  const [agentOpen, setAgentOpen] = useState(false);
  const [reportAi, setReportAi] = useState(null);   // { summary, run } — written by the agent
  const reportRun = useRef(0);

  /* the sign-in screen has no dashboard button (it lives on the agency's website
     in production) — it's reachable via yourapp.com/#login for clients & team */
  const [shareView, setShareView] = useState(null); // public read-only geo-grid report id
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === "#login") { setScreen("login"); history.replaceState(null, "", window.location.pathname); }
      if (window.location.hash.startsWith("#share=")) setShareView(window.location.hash.slice(7));
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const logActivity = (action, target = "") =>
    setCompany((c) => {
      const m = teamSession ? (c.team || []).find((x) => x.id === teamSession.memberId) : (c.team || []).find((x) => x.isOwner);
      return {
        ...c,
        activity: [{ id: "a" + Date.now() + Math.random().toString(36).slice(2, 6), ts: Date.now(), member: m?.name || "You (Owner)", action, target }, ...(c.activity || [])].slice(0, 100),
      };
    });

  /* the signed-in dashboard user: the workspace owner by default, or the team
     member from teamSession — their team record drives every permission gate */
  const owner = (company.team || []).find((m) => m.isOwner) || (company.team || [])[0];
  const currentUser = (teamSession && (company.team || []).find((m) => m.id === teamSession.memberId)) || owner;
  const perms = currentUser?.perms || ROLE_PRESETS[currentUser?.role] || {};
  const isAdmin = !teamSession || currentUser?.role === "Admin";
  const canClients = isAdmin || !!perms.manageClients;   // add/edit clients & projects, client settings
  const canKeywords = isAdmin || !!perms.manageKeywords; // add/delete/rerun tracked keywords
  const canReports = isAdmin || !!perms.createReports;   // open the report builder
  const pmPerms = {
    admin: isAdmin,
    create: !!perms.manageTasks,
    manage: !!perms.manageTasks,
    complete: !!perms.manageTasks,
    comment: true,
  };

  /* a signed-in member only sees projects they're assigned to AND have at least
     one granted section on (Project settings → Team); admins see everything */
  const visibleClients = useMemo(() => {
    if (isAdmin) return clients;
    const assignedAll = currentUser?.projects === "all";
    const ids = new Set(Array.isArray(currentUser?.projects) ? currentUser.projects : []);
    const autoKeys = ROLE_AUTO_SECTIONS[currentUser?.role] || [];
    return clients.map((c) => ({
      ...c,
      /* privacy: non-admins see the client alias (if set), never the real name */
      name: c.alias?.trim() ? c.alias.trim() : c.name,
      projects: c.projects.filter((p) => {
        if (!(assignedAll || ids.has(p.id))) return false;
        /* at least one EFFECTIVE section (role autos can be revoked per project) */
        const manual = (p.teamAccess || {})[currentUser?.id] || {};
        const eff = Object.fromEntries(autoKeys.map((k) => [k, true]));
        Object.entries(manual).forEach(([k, v]) => { eff[k] = !!v; });
        return Object.values(eff).some(Boolean);
      }),
    })).filter((c) => c.projects.length > 0);
  }, [clients, isAdmin, currentUser]);

  const activeClient = visibleClients.find((c) => c.id === activeClientId) || visibleClients[0];
  const project = activeClient?.projects.find((p) => p.id === activeProjectId) || activeClient?.projects[0];
  /* per-section access for the active project: null = unrestricted (owner/admin).
     THREE-STATE model per key: explicit true (enabled), explicit false
     (disabled — even revokes a role-auto section), or unset (inherits the
     role's automatic sections). Managed in Project settings → Team. */
  const roleAuto = ROLE_AUTO_SECTIONS[currentUser?.role] || [];
  const effAccessFor = (p) => {
    const manual = (p?.teamAccess || {})[currentUser?.id] || {};
    const eff = Object.fromEntries((roleAuto === "all" ? [] : roleAuto).map((k) => [k, true]));
    Object.entries(manual).forEach(([k, v]) => { eff[k] = !!v; });
    return eff;
  };
  const access = isAdmin || roleAuto === "all" ? null : effAccessFor(project);
  const hasAccess = (k) => !access || !!access[k];
  const tracking = useMemo(() => (project ? project.tracking.map(hydrate) : []), [project?.tracking]);
  const trackedKeywords = useMemo(() => (project ? [...new Set(project.tracking.map((t) => t.keyword))] : []), [project?.tracking]);
  const monthKey = useMonthGrid();
  const locSig = (p) => (p?.locations || []).map((l) => l.id + l.name + Object.values(l.integrations || {}).join("")).join("|");
  const data = useMemo(
    /* demoMode === false → NO fabricated data: dashboards render the credential
       warnings panel until real sources sync (per-project toggle in settings) */
    () => (project && project.demoMode !== false ? genSiteData(project, trackedKeywords, activeClient.companyName) : null),
    // name is part of the generator seed; monthKey regenerates after a month rollover;
    // the locations signature re-derives per-location profile data on any group edit
    [project?.id, project?.name, project?.demoMode, trackedKeywords.join("|"), activeClient?.companyName, monthKey, locSig(project)]
  );
  const accent = project?.accent || "#1F2A44";
  /* AI agent scope: admins/owner see every project; members need the per-client
     "AI Agent" grant AND assignment. The agent brain only ever receives this list. */
  const agentScope = useMemo(() => {
    const allowed = [];
    clients.forEach((c) => c.projects.forEach((pr) => {
      const assigned = currentUser?.projects === "all" || (Array.isArray(currentUser?.projects) && currentUser.projects.includes(pr.id));
      const ok = isAdmin || (assigned && !!(pr.teamAccess || {})[currentUser?.id]?.agent);
      if (ok) allowed.push({ client: c, project: pr });
    }));
    const deniedNames = clients.flatMap((c) => c.projects.map((pr) => pr.name)).filter((n) => !allowed.some((a) => a.project.name === n));
    return { allowed, deniedNames };
  }, [clients, isAdmin, currentUser]);
  const agentEnabled = agentScope.allowed.length > 0;
  const agentCtx = {
    ...agentScope,
    activeProjectId, isClient: false,
    userName: currentUser?.name,
    canPlan: pmPerms.manage, canReports,
    assignableNames: (company.team || []).filter((m) => m.projects === "all" || (Array.isArray(m.projects) && m.projects.includes(activeProjectId))).map((m) => m.name),
  };
  const runAgentAction = (action) => {
    const projName = clients.find((c) => c.id === action.clientId)?.projects.find((pr) => pr.id === action.projectId)?.name || "";
    const patchProj = (fn) => setClients((cs) => cs.map((c) => c.id !== action.clientId ? c : {
      ...c, projects: c.projects.map((pr) => (pr.id === action.projectId ? { ...pr, ...fn(pr) } : pr)),
    }));
    const aiAct = (text) => ({ id: "pa" + Date.now() + Math.random().toString(36).slice(2, 5), ts: Date.now(), author: "AI Agent", text });
    const mutTask = (pr, tf, actText) => ({
      records: pr.records.map((r) => r.id !== action.recordId ? r : {
        ...r, updatedAt: Date.now(),
        activity: [aiAct(actText), ...(r.activity || [])],
        checklists: r.checklists.map((cl) => cl.id !== action.checklistId ? cl : { ...cl, tasks: cl.tasks.map((t) => (t.id === action.taskId ? tf(t) : t)) }),
      }),
    });

    if (action.type === "plan") {
      patchProj((pr) => ({ records: [action.record, ...(pr.records || [])] }));
      logActivity("AI agent created a monthly plan", projName);
    }
    if (action.type === "taskComplete") { patchProj((pr) => mutTask(pr, (t) => ({ ...t, completedAt: Date.now() }), "completed a task via AI agent")); logActivity("AI agent completed a task", projName); }
    if (action.type === "taskReopen") { patchProj((pr) => mutTask(pr, (t) => ({ ...t, completedAt: null }), "reopened a task via AI agent")); logActivity("AI agent reopened a task", projName); }
    if (action.type === "taskAssign") { patchProj((pr) => mutTask(pr, (t) => ({ ...t, assignees: [...new Set([...(t.assignees || []), action.assignee])] }), `assigned ${action.assignee} via AI agent`)); logActivity(`AI agent assigned a task to ${action.assignee}`, projName); }
    if (action.type === "taskDue") { patchProj((pr) => mutTask(pr, (t) => ({ ...t, dueDate: action.dueDate }), `set a due date (${action.dueDate}) via AI agent`)); logActivity("AI agent set a task due date", projName); }
    if (action.type === "taskAdd") {
      patchProj((pr) => ({ records: pr.records.map((r) => r.id !== action.recordId ? r : {
        ...r, updatedAt: Date.now(),
        activity: [aiAct(`added task "${action.title}"`), ...(r.activity || [])],
        checklists: r.checklists.map((cl) => cl.id !== action.checklistId ? cl : { ...cl, tasks: [...cl.tasks, { id: "t" + Date.now(), title: action.title, createdAt: Date.now(), dueDate: null, completedAt: null, assignees: [] }] }),
      }) }));
      logActivity(`AI agent added a task`, projName);
    }
    if (action.type === "recordComment") {
      patchProj((pr) => ({ records: pr.records.map((r) => r.id !== action.recordId ? r : {
        ...r, updatedAt: Date.now(),
        comments: [{ id: "c" + Date.now(), ts: Date.now(), author: "AI Agent", text: action.text }, ...(r.comments || [])],
        activity: [aiAct("commented"), ...(r.activity || [])],
      }) }));
      logActivity("AI agent commented on a record", projName);
    }
    if (action.type === "report") {
      setActiveClientId(action.clientId); setActiveProjectId(action.projectId);
      if (action.cmp) setCmp(action.cmp);
      reportRun.current += 1;
      setReportAi(action.aiSummary ? { summary: action.aiSummary, run: reportRun.current } : null);
      setAgentOpen(false); setShowReport({ template: action.template || "performance" });
      logActivity(`AI agent opened the ${action.template || "performance"} report builder`, projName);
    }
  };

  /* AI provider selection: company.activeAi (set in API settings) decides which
     connected provider performs EVERY AI operation — agent, ad copy & pitch,
     website architect, keyword suggestions. Falls back to the first connected
     provider when none is explicitly activated (or the active one disconnects). */
  const AI_NAMES = { claude: "Claude", openai: "OpenAI", gemini: "Gemini", deepseek: "DeepSeek" };
  const activeAiId = useMemo(() => {
    const ok = (id) => company.apis?.[id]?.connected && company.apis[id].values?.apiKey;
    if (company.activeAi && ok(company.activeAi)) return company.activeAi;
    return Object.keys(AI_NAMES).find(ok) || null;
  }, [company.apis, company.activeAi]);
  const aiProviders = useMemo(() => {
    const list = Object.keys(AI_NAMES).filter((id) => company.apis?.[id]?.connected);
    /* the active provider always leads — consumers use aiProviders[0] */
    const ordered = activeAiId ? [activeAiId, ...list.filter((id) => id !== activeAiId)] : list;
    return ordered.map((id) => AI_NAMES[id]);
  }, [company.apis, activeAiId]);
  /* first connected AI provider WITH its key/model — powers real /api/generate calls */
  const aiConfig = useMemo(() => {
    if (!activeAiId) return null;
    const a = company.apis[activeAiId];
    return { provider: activeAiId, key: a.values.apiKey, model: a.values.model || undefined };
  }, [company.apis, activeAiId]);
  /* privacy wall: non-admin team members work with team names only — the client
     as a person is invisible to them (no assigning, and their appearances in
     records render as "Client"); admins/owner see everyone */
  const isOwnerUser = !teamSession || !!currentUser?.isOwner;
  const people = useMemo(() => {
    const team = (company.team || [])
      .filter((m) => m.projects === "all" || (Array.isArray(m.projects) && m.projects.includes(activeProjectId)))
      .map((m) => ({ name: m.name, type: "team" }));
    if (!isOwnerUser) return team; // only the owner may see (and assign) the client as a person
    const cl = activeClient?.contact ? [{ name: activeClient.contact, type: "client" }] : [];
    return [...team, ...cl];
  }, [company.team, activeProjectId, activeClient?.contact, isOwnerUser]);
  const teamNames = useMemo(() => new Set((company.team || []).map((m) => m.name)), [company.team]);
  /* identity wall: every team member (admins included) sees the client only as
     "Client" — the owner alone sees the real client identity */
  const pmMaskName = isOwnerUser ? undefined : (n) => (teamNames.has(n) ? n : "Client");
  const overdueTasks = (project?.records || []).reduce((n, r) => n + (r.completedAt ? 0 : (r.checklists || []).flatMap((c) => c.tasks).filter((t) => !t.completedAt && t.dueDate && t.dueDate < todayISO()).length), 0);
  /* unread project-chat messages for the signed-in viewer (same identity string
     the PM view receives, so send/read markers always line up) */
  const meName = currentUser?.name || "You (Owner)";
  const unreadChat = (project?.chatMsgs || []).filter((m) => m.author !== meName && m.ts > ((project?.chatReads || {})[meName] || 0)).length;

  /* ---- personal area: DMs, chat channels, my assignments ---- */
  const dmKey = (a, b) => [a, b].sort().join("|");
  const dmUnread = (other) => {
    const k = dmKey(meName, other);
    return ((company.dms || {})[k] || []).filter((m) => m.author !== meName && m.ts > (((company.dmReads || {})[k] || {})[meName] || 0)).length;
  };
  const dmUnreadTotal = (company.team || []).filter((m) => m.name !== meName).reduce((n, m) => n + dmUnread(m.name), 0);
  /* project channels the signed-in member may chat in (mirrors the PM gate) */
  const chatChannels = useMemo(() =>
    visibleClients.flatMap((c) => c.projects
      .filter((p) => isAdmin || !!(p.teamAccess || {})[currentUser?.id]?.chat)
      .map((p) => ({ clientId: c.id, clientName: c.name, project: p }))),
    [visibleClients, isAdmin, currentUser]);
  const channelUnreadTotal = chatChannels.reduce((n, ch) =>
    n + (ch.project.chatMsgs || []).filter((m) => m.author !== meName && m.ts > ((ch.project.chatReads || {})[meName] || 0)).length, 0);
  // groups are defined below; the badge total is assembled after them
  const lateAssigned = visibleClients.reduce((n, c) => n + c.projects.reduce((n2, p) => n2 + (p.records || []).reduce((n3, r) =>
    n3 + (r.checklists || []).flatMap((cl) => cl.tasks).filter((t) => (t.assignees || []).includes(meName) && !t.completedAt && t.dueDate && t.dueDate < todayISO()).length, 0), 0), 0);

  const sendDm = (other, text, replyTo = null) => setCompany((c) => {
    const k = dmKey(meName, other), now = Date.now();
    return { ...c,
      dms: { ...(c.dms || {}), [k]: capMsgs([...((c.dms || {})[k] || []), { id: "dm" + now + Math.random().toString(36).slice(2, 5), ts: now, author: meName, text, replyTo }]) },
      dmReads: { ...(c.dmReads || {}), [k]: { ...((c.dmReads || {})[k] || {}), [meName]: now } },
    };
  });
  const reactDm = (other, msgId, emoji) => setCompany((c) => {
    const k = dmKey(meName, other);
    return { ...c, dms: { ...(c.dms || {}), [k]: ((c.dms || {})[k] || []).map((m) => (m.id === msgId ? toggleReaction(m, emoji, meName) : m)) } };
  });
  const markDmRead = (other) => setCompany((c) => {
    const k = dmKey(meName, other);
    return { ...c, dmReads: { ...(c.dmReads || {}), [k]: { ...((c.dmReads || {})[k] || {}), [meName]: Date.now() } } };
  });
  const patchAnyProject = (cid, pid, fn) => setClients((cs) => cs.map((c) => c.id !== cid ? c : {
    ...c, projects: c.projects.map((p) => (p.id === pid ? { ...p, ...fn(p) } : p)),
  }));
  const sendProjectChat = (cid, pid, text, replyTo = null) => {
    const now = Date.now();
    patchAnyProject(cid, pid, (p) => ({
      chatMsgs: capMsgs([...(p.chatMsgs || []), { id: "cm" + now + Math.random().toString(36).slice(2, 5), ts: now, author: meName, text, replyTo }]),
      chatReads: { ...(p.chatReads || {}), [meName]: now },
    }));
  };
  const reactProjectChat = (cid, pid, msgId, emoji) =>
    patchAnyProject(cid, pid, (p) => ({ chatMsgs: (p.chatMsgs || []).map((m) => (m.id === msgId ? toggleReaction(m, emoji, meName) : m)) }));
  const markProjectChatRead = (cid, pid) => patchAnyProject(cid, pid, (p) => ({ chatReads: { ...(p.chatReads || {}), [meName]: Date.now() } }));
  /* ---- owner ↔ client private line (only the owner ever sees these) ---- */
  const patchClientChat = (cid, fn) => setClients((cs) => cs.map((c) => (c.id !== cid ? c : { ...c, ownerChat: { msgs: [], reads: {}, ...(c.ownerChat || {}), ...fn(c.ownerChat || { msgs: [], reads: {} }) } })));
  const sendClientMsg = (cid, text, replyTo = null) => {
    const now = Date.now();
    patchClientChat(cid, (ch) => ({
      msgs: capMsgs([...(ch.msgs || []), { id: "km" + now + Math.random().toString(36).slice(2, 5), ts: now, author: meName, text, replyTo }]),
      reads: { ...(ch.reads || {}), [meName]: now },
    }));
  };
  const reactClientMsg = (cid, msgId, emoji) => patchClientChat(cid, (ch) => ({ msgs: (ch.msgs || []).map((m) => (m.id === msgId ? toggleReaction(m, emoji, meName) : m)) }));
  const markClientRead = (cid) => patchClientChat(cid, (ch) => ({ reads: { ...(ch.reads || {}), [meName]: Date.now() } }));
  const clientChats = isOwnerUser ? clients.map((c) => ({ clientId: c.id, name: c.name, contact: c.contact, chat: c.ownerChat || { msgs: [], reads: {} } })) : null;
  const clientUnreadTotal = (clientChats || []).reduce((n, cc) => n + (cc.chat.msgs || []).filter((m) => m.author !== meName && m.ts > ((cc.chat.reads || {})[meName] || 0)).length, 0);
  /* ---- group chats: ad-hoc rooms of selected teammates ---- */
  const patchGroup = (gid, fn) => setCompany((c) => ({ ...c, chatGroups: (c.chatGroups || []).map((g) => (g.id === gid ? { ...g, ...(typeof fn === "function" ? fn(g) : fn) } : g)) }));
  const createGroup = (name, members) => setCompany((c) => ({
    ...c,
    chatGroups: [...(c.chatGroups || []), { id: "grp" + Date.now(), name, members: [...new Set([meName, ...members])], createdBy: meName, createdAt: Date.now(), msgs: [], reads: { [meName]: Date.now() } }],
  }));
  const updateGroup = (gid, patch) => patchGroup(gid, (g) => ({ ...patch, ...(patch.members ? { members: [...new Set(patch.members)] } : {}) }));
  const deleteGroup = (gid) => setCompany((c) => ({ ...c, chatGroups: (c.chatGroups || []).filter((g) => g.id !== gid) }));
  const sendGroupMsg = (gid, text, replyTo = null) => {
    const now = Date.now();
    patchGroup(gid, (g) => ({
      msgs: capMsgs([...(g.msgs || []), { id: "gm" + now + Math.random().toString(36).slice(2, 5), ts: now, author: meName, text, replyTo }]),
      reads: { ...(g.reads || {}), [meName]: now },
    }));
  };
  const reactGroupMsg = (gid, msgId, emoji) => patchGroup(gid, (g) => ({ msgs: (g.msgs || []).map((m) => (m.id === msgId ? toggleReaction(m, emoji, meName) : m)) }));
  const markGroupRead = (gid) => patchGroup(gid, (g) => ({ reads: { ...(g.reads || {}), [meName]: Date.now() } }));
  const groupUnreadTotal = (company.chatGroups || []).filter((g) => g.members.includes(meName))
    .reduce((n, g) => n + (g.msgs || []).filter((m) => m.author !== meName && m.ts > ((g.reads || {})[meName] || 0)).length, 0);
  const chatTotalUnread = dmUnreadTotal + channelUnreadTotal + groupUnreadTotal + clientUnreadTotal;
  /* profile edits; a rename follows the name across tasks, comments, chat and DMs
     (names are the identity key everywhere in this prototype) */
  const updateMember = (patch) => {
    const oldN = currentUser?.name, newN = patch.name;
    setCompany((c) => {
      let next = { ...c, team: (c.team || []).map((m) => (m.id === currentUser?.id ? { ...m, ...patch } : m)) };
      if (newN && oldN && newN !== oldN) {
        const reKey = (k) => k.split("|").map((x) => (x === oldN ? newN : x)).sort().join("|");
        next.dms = Object.fromEntries(Object.entries(c.dms || {}).map(([k, msgs]) => [reKey(k), msgs.map((m) => (m.author === oldN ? { ...m, author: newN } : m))]));
        next.dmReads = Object.fromEntries(Object.entries(c.dmReads || {}).map(([k, reads]) => [reKey(k),
          Object.fromEntries(Object.entries(reads).map(([u, ts]) => [u === oldN ? newN : u, ts]))]));
      }
      return next;
    });
    if (newN && oldN && newN !== oldN) {
      const ren = (n) => (n === oldN ? newN : n);
      setClients((cs) => cs.map((c) => ({ ...c, projects: c.projects.map((p) => ({
        ...p,
        records: (p.records || []).map((r) => ({
          ...r,
          assignees: (r.assignees || []).map(ren),
          comments: (r.comments || []).map((x) => ({ ...x, author: ren(x.author) })),
          activity: (r.activity || []).map((x) => ({ ...x, author: ren(x.author) })),
          checklists: (r.checklists || []).map((cl) => ({ ...cl, tasks: cl.tasks.map((t) => ({ ...t, assignees: (t.assignees || []).map(ren) })) })),
        })),
        chatMsgs: (p.chatMsgs || []).map((m) => ({ ...m, author: ren(m.author) })),
        chatReads: Object.fromEntries(Object.entries(p.chatReads || {}).map(([u, ts]) => [ren(u), ts])),
      })) })));
    }
  };
  const openAssignedTask = (cid, pid, recordId) => {
    selectProject(cid, pid);
    setSection("management");
    setAccountView(null);
    setPmJump({ recordId, k: Date.now() });
  };

  /* customizable sidebar background: text/borders/hover adapt to its luminance */
  const sbBg = company.sidebarColor || null;
  const sbDark = useMemo(() => {
    if (!sbBg) return false;
    const h = sbBg.replace("#", "");
    const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.55;
  }, [sbBg]);
  const sbText = company.sidebarText || null;
  const hexA = (hex, a) => {
    const v = hex.replace("#", ""); const h = v.length === 3 ? v.split("").map((c) => c + c).join("") : v;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return `rgba(${r},${g},${b},${a})`;
  };
  const sbAuto = sbDark
    ? { fg: "#F9FAFB", soft: "rgba(255,255,255,.8)", muted: "rgba(255,255,255,.55)", border: "rgba(255,255,255,.14)", hover: "rgba(255,255,255,.09)" }
    : { fg: "#1F2937", soft: "#4B5563", muted: "#9CA3AF", border: "#F3F4F6", hover: "#F9FAFB" };
  /* custom text color: primary text takes it verbatim; secondary/muted/borders derive as alpha steps */
  const sbVars = sbText
    ? { ...sbAuto, fg: sbText, soft: hexA(sbText, 0.82), muted: hexA(sbText, 0.58), border: hexA(sbText, 0.16) }
    : sbAuto;
  const sbCss = (sbBg || sbText) ? `
    aside.ll-sb { ${sbBg ? `background: ${sbBg} !important;` : ""} border-color: ${sbVars.border} !important; color: ${sbVars.fg}; }
    .ll-sb .text-gray-800, .ll-sb .text-gray-700, .ll-sb .text-gray-600 { color: ${sbVars.fg} !important; }
    .ll-sb .text-gray-500, .ll-sb .text-gray-400, .ll-sb .text-gray-300 { color: ${sbVars.muted} !important; }
    .ll-sb [class*="hover:text-gray"]:hover { color: ${sbVars.fg} !important; }
    .ll-sb [class*="hover:bg-gray"]:hover { background: ${sbVars.hover} !important; }
    .ll-sb .bg-gray-50 { background: ${sbVars.hover} !important; }
    .ll-sb .border-gray-100, .ll-sb .border-gray-200, .ll-sb .border-gray-300 { border-color: ${sbVars.border} !important; }
    .ll-sb [class*="hover:border-gray"]:hover { border-color: ${sbVars.muted} !important; }
  ` : "";
  const sbCustom = !!(sbBg || sbText); // inline sidebar colors switch with the custom theme

  /* white-label brand resolution: client view + reports show the
     client's brand when white label is on; otherwise SERP Squad */
  const wl = activeClient?.whiteLabel;
  const brand = clientView && wl?.enabled
    ? { name: wl.name || activeClient.companyName || activeClient.name, logo: wl.logo, website: wl.website, accent }
    : { name: company.name, logo: company.logo, website: "", accent: company.accent };

  const updateCompany = (patch) => setCompany((c) => ({ ...c, ...patch }));
  const updateClient = (cid, patch) => setClients((cs) => cs.map((c) => (c.id === cid ? { ...c, ...patch } : c)));
  // patch may be an object OR a function of the CURRENT project — use the functional
  // form from async callbacks (timeouts) so they never write a stale snapshot back
  const updateProject = (patch) =>
    setClients((cs) => cs.map((c) => c.id !== activeClientId ? c : {
      ...c, projects: c.projects.map((p) => (p.id === activeProjectId ? { ...p, ...(typeof patch === "function" ? patch(p) : patch) } : p)),
    }));
  const addTracking = (entries) => { updateProject({ tracking: [...project.tracking, ...entries] }); logActivity(`Added ${entries.length} keyword${entries.length > 1 ? "s" : ""}`, project?.name); };
  const deleteTracking = (id) => { updateProject({ tracking: project.tracking.filter((t) => t.id !== id) }); logActivity("Removed a tracked keyword", project?.name); };
  const applyRerun = (updates) => {
    updateProject({ tracking: project.tracking.map((t) => {
      const u = updates.find((x) => x.id === t.id);
      return u ? { ...t, extraPositions: [...(t.extraPositions || []), u.newPos] } : t;
    }) });
    logActivity(`Re-checked ${updates.length} keyword${updates.length > 1 ? "s" : ""}`, project?.name);
  };
  const toggleExpand = (cid) => setExpanded((s) => { const n = new Set(s); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });
  const selectProject = (cid, pid) => {
    setActiveClientId(cid); setActiveProjectId(pid); setView("overview"); setSection("performance"); setAccountView(null);
    const cl = clients.find((c) => c.id === cid); const pr = cl?.projects.find((p) => p.id === pid);
    if (pr) logActivity("Viewed project", `${pr.name} (${cl.name})`);
  };

  /* public shared report link (#share=<id>) — read-only, no session needed */
  if (shareView) return <Lazy><SharedReportView shareId={shareView} /></Lazy>;

  /* client portal session takes over the whole screen */
  if (session) {
    const sc = clients.find((c) => c.id === session.clientId);
    if (sc) return <Lazy><ClientPortal client={sc} company={company} dark={dark} setDark={setDark}
      onUpdateClient={(patch) => setClients((cs) => cs.map((c) => (c.id !== sc.id ? c : { ...c, ...(typeof patch === "function" ? patch(c) : patch) })))}
      onUpdateProject={(pid, patch) => setClients((cs) => cs.map((c) => c.id !== sc.id ? c : { ...c, projects: c.projects.map((p) => (p.id === pid ? { ...p, ...(typeof patch === "function" ? patch(p) : patch) } : p)) }))}
      onLogout={() => { setSession(null); setScreen("app"); }} /></Lazy>;
  }
  if (screen === "company") {
    return <Lazy><CompanyPage company={company} onChange={updateCompany} clients={clients} onBack={() => setScreen("app")} dark={dark} setDark={setDark} /></Lazy>;
  }
  if (screen === "login") {
    return <Lazy><LoginScreen company={company} clients={clients} dark={dark}
      onLogin={(clientId) => { setSession({ clientId }); setScreen("app"); }}
      onTeamLogin={(memberId) => {
        setTeamSession({ memberId }); setScreen("app");
        setSection("performance"); setView("overview");
        const m = (company.team || []).find((x) => x.id === memberId);
        if (m && m.projects !== "all") {
          // land the member on their first assigned project
          for (const c of clients) {
            const p = c.projects.find((pp) => (m.projects || []).includes(pp.id));
            if (p) { setActiveClientId(c.id); setActiveProjectId(p.id); break; }
          }
        }
      }}
      onBack={() => setScreen("app")} /></Lazy>;
  }
  if (showReport && project && data) {
    const rwl = activeClient?.whiteLabel;
    const agencyBrand = { name: company.name, logo: company.logo, accent: company.accent };
    const wlBrand = rwl?.enabled
      ? { name: rwl.name || activeClient.companyName || activeClient.name, logo: rwl.logo, accent: project.accent }
      : null;
    const clientInfo = { companyName: activeClient?.companyName || activeClient?.name, address: activeClient?.address };
    const clientProjects = (activeClient?.projects || []).map((p) => {
      const tr = p.tracking.map(hydrate);
      const kws = [...new Set(p.tracking.map((t) => t.keyword))];
      return { project: p, tracking: tr, data: genSiteData(p, kws, activeClient.companyName) };
    });
    const saveReport = (rep) => setCompany((c) => {
      const list = c.savedReports || [];
      const existing = showReport.savedId;
      const entry = { id: existing || "rep" + Date.now(), name: rep.name, projectId: project.id, clientId: activeClient.id, blocks: rep.blocks, accent: rep.accent, cmp: rep.cmp, range: rep.range, savedAt: Date.now() };
      return { ...c, savedReports: existing ? list.map((r) => (r.id === existing ? entry : r)) : [entry, ...list] };
    });
    const saveTemplate = (tpl) => setCompany((c) => ({ ...c, reportTemplates: [{ id: "tpl" + Date.now(), name: tpl.name, blocks: tpl.blocks, createdAt: Date.now() }, ...(c.reportTemplates || [])] }));
    return (
      <>
        <Lazy><ReportBuilder key={"rb" + (reportAi?.run || 0) + (showReport.savedId || showReport.key || "new")} project={project} data={data} tracking={tracking} clientProjects={clientProjects} records={project.records || []} template={showReport.template || "performance"} initialBlocks={showReport.initialBlocks || null} initialTitle={showReport.initialTitle || null} initialRange={showReport.initialRange || null} agencyBrand={agencyBrand} wlBrand={wlBrand} clientInfo={clientInfo} defaultCmp={cmp} dark={dark} setDark={setDark} aiSummary={reportAi?.summary || null} onSave={saveReport} onSaveTemplate={saveTemplate} onClose={() => { setShowReport(null); setReportAi(null); }} /></Lazy>
        {agentEnabled && (
          <React.Suspense fallback={null}>
            {!agentOpen && <AgentLauncher accent={accent} onClick={() => setAgentOpen(true)} />}
            {agentOpen && <AgentPanel ctx={agentCtx} accent={accent} aiProvider={aiProviders[0] || null} onAction={runAgentAction} onClose={() => setAgentOpen(false)} />}
          </React.Suspense>
        )}
      </>
    );
  }

  const visibleNav = NAV.filter((n) => {
    /* the ads-performance view rides on the Ads & Paid Marketing grant */
    if (n.key === "adsperf") return (!access || !!access.adsperf) && (project?.ads?.campaigns || []).length > 0;
    if (n.key !== "overview" && !hasAccess(n.key)) return false;
    if (n.key === "gbp") return project?.integrations.gbp || project?.integrations.bing || project?.integrations.apple;
    if (n.key === "web") return project?.integrations.ga || project?.integrations.gsc;
    return true;
  });
  const visibleSections = [
    ["performance", "Performance Studio", BarChart3],
    ["adsmgr", "Ads & Paid Marketing", Megaphone],
    ["management", "Project Management", ListTodo],
    ["optimization", "Optimization Studio", Zap],
    ...(canReports ? [["reports", "Report builder", FileTextIcon]] : []),
  ].filter(([key]) => {
    if (!access) return true;
    if (key === "adsmgr") return !!access.ads;
    if (key === "management") return !!(access.records || access.wiki || access.chat);
    if (key === "optimization") return ["ogbp", "obing", "oapple", "webConnection", "webPages", "webPosts", "olistings", "social", "oindex"].some((k) => access[k]);
    return true; // performance always shows at least the Overview
  });
  /* never render a section/view the current user has no grant for on this project */
  const activeSection = visibleSections.some(([k]) => k === section) ? section : "performance";
  const activeView = visibleNav.some((n) => n.key === view) ? view : "overview";

  return (
    <div className={`ll-root ${dark ? "ll-dark" : ""} flex min-h-screen items-stretch bg-[#F5F6F8]`} style={{ "--accent": accent }}>
      <style>{FONT_CSS}</style>
      {sbCss && <style>{sbCss}</style>}

      {/* Sidebar */}
      {!clientView && (
        <aside className="ll-sb no-print sticky top-0 z-30 hidden h-screen w-64 shrink-0 flex-col self-start border-r border-gray-200 bg-white md:flex">
          <div className="flex items-center justify-between px-4 py-5">
            <div className="flex items-center gap-2">
              <BrandMark name={company.name} logo={company.logo} accent={company.accent} />
              <span className="ll-display text-[16px] font-bold tracking-tight">{company.name}</span>
            </div>
            {isAdmin && (
              <button onClick={() => { setScreen("company"); logActivity("Opened company settings"); }} title="Company settings"
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <Settings size={16} />
              </button>
            )}
          </div>
          {/* personal dashboard: the signed-in person's own screens */}
          <div className="px-4 pb-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Personal Dashboard</div>
          <div className="space-y-0.5 px-2.5 pb-3">
            {[
              ["assignments", "Assignments", ClipboardList, lateAssigned > 0 ? { n: lateAssigned, bg: "#FEE2E2", fg: "#991B1B" } : null],
              ["chat", "Chat", MessageSquare, chatTotalUnread > 0 ? { n: chatTotalUnread, bg: "#DBEAFE", fg: "#1D4ED8" } : null],
              ...(isAdmin ? [["team", "Team", Users, null]] : []),
            ].map(([key, label, Icon, badge]) => {
              const active = accountView === key;
              return (
                <button key={key}
                  onClick={() => setAccountView((v) => (v === key ? null : key))}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[12.5px] font-medium"
                  style={active ? { background: accent + (sbDark ? "40" : "12"), color: sbDark ? "#fff" : (sbText || accent) } : { color: sbCustom ? sbVars.soft : "#4B5563" }}>
                  <Icon size={14} className={active ? "" : "text-gray-400"} /> {label}
                  {badge && <span className="ll-mono ml-auto rounded-full px-1.5 py-0.5 text-[9.5px] font-bold" style={{ background: badge.bg, color: badge.fg }}>{badge.n}</span>}
                </button>
              );
            })}
          </div>
          <div className="mx-4 mb-2 border-t border-gray-100" />
          <div className="px-4 pb-2 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Client projects</div>
          <div className="flex-1 overflow-y-auto px-2.5">
            {visibleClients.map((c) => {
              const open = expanded.has(c.id);
              return (
                <div key={c.id} className="mb-0.5">
                  <div className="group flex items-center gap-1 rounded-xl px-1.5 py-1.5 hover:bg-gray-50">
                    <button onClick={() => toggleExpand(c.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                      {open ? <ChevronDown size={13} className="shrink-0 text-gray-400" /> : <ChevronRight size={13} className="shrink-0 text-gray-400" />}
                      {open ? <FolderOpen size={15} className="shrink-0 text-amber-500" /> : <Folder size={15} className="shrink-0 text-amber-500" />}
                      <span className="truncate text-[13px] font-semibold text-gray-800">{c.name}</span>
                      {c.whiteLabel?.enabled && <span className="ml-1 shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-600">WL</span>}
                    </button>
                    {canClients && (
                      <button onClick={() => setModal({ type: "clientSettings", clientId: c.id })} title="Client settings"
                        className="rounded-md p-1 text-gray-300 opacity-0 hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100">
                        <Settings size={13} />
                      </button>
                    )}
                  </div>
                  {open && (
                    <div className="ml-5 border-l border-gray-100 pl-2">
                      {c.projects.length === 0 && <div className="px-2 py-1.5 text-[11.5px] text-gray-300">No projects yet</div>}
                      {c.projects.map((p) => (
                        <div key={p.id} className="group flex items-center gap-0.5 rounded-lg hover:bg-gray-50"
                          style={p.id === project?.id ? { background: p.accent + (sbDark ? "40" : "12") } : {}}>
                          <button onClick={() => selectProject(c.id, p.id)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left">
                            <ProjectMark project={p} />
                            <span className="block min-w-0 truncate text-[12.5px] font-medium"
                              style={{ color: p.id === project?.id ? (sbDark ? "#fff" : (sbText || p.accent)) : (sbCustom ? sbVars.soft : "#374151") }}>{p.name}</span>
                          </button>
                          {canClients && (
                            <button onClick={() => setModal({ type: "projectSettings", clientId: c.id, projectId: p.id })} title="Project settings"
                              className="mr-1 rounded-md p-1 text-gray-300 opacity-0 hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100">
                              <Settings size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {canClients && (
            <div className="grid grid-cols-2 gap-2 p-3">
              <button onClick={() => setModal({ type: "addClient" })}
                className="flex items-center justify-center gap-1 rounded-xl border border-dashed border-gray-300 py-2 text-[12px] font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700">
                <Plus size={13} /> Add client
              </button>
              <button onClick={() => setModal({ type: "addProject" })}
                className="flex items-center justify-center gap-1 rounded-xl border border-dashed border-gray-300 py-2 text-[12px] font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700">
                <Plus size={13} /> Add project
              </button>
            </div>
          )}
          {teamSession && (
            <div className="flex items-center justify-between gap-2 border-t border-gray-100 p-3">
              <div className="min-w-0">
                <div className="truncate text-[12px] font-semibold text-gray-700">{currentUser?.name}</div>
                <div className="text-[10.5px] text-gray-400">{currentUser?.role} · {visibleClients.reduce((n, c) => n + c.projects.length, 0)} project(s)</div>
              </div>
              <button onClick={() => setTeamSession(null)} title="Sign out"
                className="shrink-0 rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:border-gray-300 hover:text-gray-600">
                <LogOut size={13} />
              </button>
            </div>
          )}
        </aside>
      )}

      {/* Main */}
      <main className="print-full min-w-0 flex-1">
        {accountView && !clientView ? (
          <>
            <div className="no-print sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white/90 px-5 py-2.5 backdrop-blur">
              <div className="ll-display text-[14px] font-semibold text-gray-700">
                {{ settings: "Account settings", assignments: "My assignments", chat: "Chat", team: "Team" }[accountView]}
              </div>
              <div className="flex items-center gap-2">
                <DarkToggle dark={dark} setDark={setDark} />
                <button onClick={() => setAccountView("settings")} title="Account settings" className="rounded-full ring-2 ring-transparent hover:ring-gray-300">
                  <Ava name={meName} img={currentUser?.avatar} size={32} />
                </button>
              </div>
            </div>
            <Lazy>
              {accountView === "settings" && (
                <AccountSettingsView member={currentUser} clients={visibleClients} onUpdateMember={updateMember} accent={accent} dark={dark} setDark={setDark} />
              )}
              {accountView === "assignments" && (
                <AssignmentsView clients={visibleClients} userName={meName} accent={accent} onOpenTask={openAssignedTask} />
              )}
              {accountView === "chat" && (
                <ChatHome me={meName} team={company.team || []} dms={company.dms || {}} dmReads={company.dmReads || {}}
                  channels={chatChannels} groups={company.chatGroups || []} canManageGroups={isAdmin}
                  accent={accent} maskName={pmMaskName || ((n) => n)}
                  onSendDm={sendDm} onReactDm={reactDm} onMarkDmRead={markDmRead}
                  onSendProject={sendProjectChat} onReactProject={reactProjectChat} onMarkProjectRead={markProjectChatRead}
                  onCreateGroup={createGroup} onUpdateGroup={updateGroup} onDeleteGroup={deleteGroup}
                  onSendGroup={sendGroupMsg} onReactGroup={reactGroupMsg} onMarkGroupRead={markGroupRead}
                  clientChats={clientChats} onSendClient={sendClientMsg} onReactClient={reactClientMsg} onMarkClientRead={markClientRead} />
              )}
              {accountView === "team" && isAdmin && (
                <TeamView team={company.team || []} clients={clients} activity={company.activity || []} dms={company.dms || {}}
                  accent={accent} onOpenTask={openAssignedTask} />
              )}
            </Lazy>
          </>
        ) : (
        <>
        <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 px-5 py-3.5 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {clientView
                ? <BrandMark name={brand.name} logo={brand.logo} accent={brand.accent} size="lg" />
                : (project && <ProjectMark project={project} size="md" />)}
              <div>
                {clientView && <div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">{brand.name}</div>}
                <div className="ll-display text-[17px] font-semibold leading-tight">{project?.name}</div>
                <div className="flex items-center gap-2 text-[11.5px] text-gray-400">
                  <Globe size={11} /> {project?.website}
                  {!clientView && <><span>·</span><Folder size={11} /> {activeClient?.name}</>}
                </div>
              </div>
            </div>
            <div className="no-print flex flex-wrap items-center gap-2">
              <button onClick={() => setClientView((v) => !v)}
                className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-medium"
                style={clientView ? { background: accent, borderColor: accent, color: "#fff" } : { borderColor: "#E5E7EB", color: "var(--chip-fg, #4B5563)", background: "var(--chip-bg, #fff)" }}>
                <Users size={14} /> Client view
              </button>
              <DarkToggle dark={dark} setDark={setDark} />
              {!clientView && (
                <button onClick={() => setAccountView("settings")} title="Account settings" className="rounded-full ring-2 ring-transparent hover:ring-gray-300">
                  <Ava name={meName} img={currentUser?.avatar} size={34} />
                </button>
              )}
            </div>
          </div>
          <div className="no-print mt-3 flex flex-wrap gap-1.5">
            {visibleSections.map(([key, label, Icon]) => (
              <button key={key} onClick={() => { setSection(key); setAccountView(null); }}
                className="flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-semibold"
                style={activeSection === key ? { background: accent, borderColor: accent, color: "#fff" } : { borderColor: "#E5E7EB", color: "var(--chip-fg, #4B5563)", background: "var(--chip-bg, #fff)" }}>
                <Icon size={14} /> {label}
                {key === "management" && overdueTasks > 0 && (
                  <span className="ll-mono rounded-full px-1.5 text-[10px] font-bold"
                    style={activeSection === key ? { background: "rgba(255,255,255,.25)", color: "#fff" } : { background: "#FEE2E2", color: "#991B1B" }}>
                    {overdueTasks}
                  </span>
                )}
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
            {visibleNav.map((n) => (
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
          {project && activeSection === "optimization" && (
            <Lazy><OptimizationView project={project} accent={accent} onUpdate={updateProject} log={logActivity} access={access} aiProviders={aiProviders} aiConfig={aiConfig} dfs={company.dfs} /></Lazy>
          )}
          {project && activeSection === "adsmgr" && (
            <Lazy><AdsView project={project} accent={accent} onUpdate={updateProject} log={logActivity} company={company} aiConfig={aiConfig} /></Lazy>
          )}
          {project && activeSection === "management" && (
            <Lazy><ProjectManagementView project={project} people={people}
              perms={pmPerms} maskName={pmMaskName} canChat={!access || !!access.chat}
              initialOpenId={pmJump?.recordId} jumpKey={pmJump?.k || 0}
              templates={company.recordTemplates || []}
              onSaveTemplate={(tpl) => setCompany((c) => ({ ...c, recordTemplates: [tpl, ...(c.recordTemplates || [])] }))}
              onDeleteTemplate={(tid) => setCompany((c) => ({ ...c, recordTemplates: (c.recordTemplates || []).filter((t) => t.id !== tid) }))}
              currentUser={currentUser?.name || "You (Owner)"} accent={accent} onUpdate={updateProject} log={logActivity} /></Lazy>
          )}
          {project && activeSection === "reports" && (
            <ReportsHome accent={accent} project={project}
              savedReports={(company.savedReports || []).filter((r) => r.projectId === project.id)}
              templates={company.reportTemplates || []}
              onNew={() => setShowReport({ template: "performance", key: Date.now() })}
              onOpen={(r) => setShowReport({ template: "performance", initialBlocks: r.blocks, initialTitle: r.name, initialRange: r.range || null, savedId: r.id })}
              onFromTemplate={(t) => setShowReport({ template: "performance", initialBlocks: t.blocks, initialTitle: `${project.name} — ${t.name}`, key: Date.now() })}
              onDeleteReport={(id) => setCompany((c) => ({ ...c, savedReports: (c.savedReports || []).filter((r) => r.id !== id) }))}
              onDeleteTemplate={(id) => setCompany((c) => ({ ...c, reportTemplates: (c.reportTemplates || []).filter((t) => t.id !== id) }))} />
          )}
          {project && !data && activeSection === "performance" && <NoDataPanel project={project} accent={accent} />}
          {project && data && activeSection === "performance" && (
            <>
              {activeView === "overview" && <OverviewView project={project} data={data} tracking={tracking} cmp={cmp} accent={accent} clientView={clientView} />}
              {activeView === "ranks" && <RankTrackingView project={project} tracking={tracking} dfsConnected={company.dfs.connected} accent={accent} onAdd={addTracking} onDelete={deleteTracking} onRerun={applyRerun} readOnly={!canKeywords} dfs={company.dfs} />}
              {activeView === "gbp" && (project.integrations.gbp || project.integrations.bing || project.integrations.apple) && <GbpView project={project} data={data} range={range} setRange={setRange} accent={accent} />}
              {activeView === "geogrid" && (
                <Lazy><GeoGridView project={project} accent={accent} onUpdate={updateProject}
                  dfs={company.dfs} placesKey={company.apis?.googlePlaces?.values?.apiKey} trackedKeywords={trackedKeywords} /></Lazy>
              )}
              {activeView === "web" && <WebsitePerformanceView project={project} data={data} range={range} setRange={setRange} accent={accent} />}
              {activeView === "adsperf" && <Lazy><AdsPerformanceView project={project} accent={accent} /></Lazy>}
            </>
          )}
        </div>
        </>
        )}
      </main>


      {agentEnabled && !clientView && (
        <React.Suspense fallback={null}>
          {!agentOpen && <AgentLauncher accent={accent} onClick={() => setAgentOpen(true)} />}
          {agentOpen && <AgentPanel ctx={agentCtx} accent={accent} aiProvider={aiProviders[0] || null} onAction={runAgentAction} onClose={() => setAgentOpen(false)} />}
        </React.Suspense>
      )}
      {modal?.type === "clientSettings" && (() => {
        const mc = clients.find((c) => c.id === modal.clientId);
        if (!mc) return null;
        const patchProjects = (pid, patch) => setClients((cs) => cs.map((c) => c.id !== mc.id ? c : {
          ...c, projects: c.projects.map((p) => (pid === null || p.id === pid ? { ...p, ...(typeof patch === "function" ? patch(p) : patch) } : p)),
        }));
        return (
          <ClientSettingsModal client={mc} company={company} accent={mc.projects[0]?.accent || company.accent} dfsConnected={company.dfs.connected}
            onChange={(patch) => updateClient(mc.id, patch)}
            onUpdateProject={(pid, patch) => patchProjects(pid, patch)}
            onUpdateAllProjects={(patch) => patchProjects(null, patch)}
            onClose={() => setModal(null)} />
        );
      })()}
      {modal?.type === "projectSettings" && (() => {
        const mc = clients.find((c) => c.id === modal.clientId);
        const mp = mc?.projects.find((p) => p.id === modal.projectId);
        if (!mc || !mp) return null;
        return (
          <ProjectSettingsModal client={mc} project={mp} company={company} accent={mp.accent || company.accent} dfsConnected={company.dfs.connected}
            onUpdate={(patch) => setClients((cs) => cs.map((c) => c.id !== mc.id ? c : {
              ...c, projects: c.projects.map((p) => (p.id === mp.id ? { ...p, ...(typeof patch === "function" ? patch(p) : patch) } : p)),
            }))}
            onClose={() => setModal(null)} />
        );
      })()}
      {modal?.type === "addClient" && (
        <AddClientModal onClose={() => setModal(null)}
          onAdd={(c) => { setClients((cs) => [...cs, c]); setExpanded((s) => new Set(s).add(c.id)); setModal({ type: "addProject", clientId: c.id }); }} />
      )}
      {modal?.type === "addProject" && (
        <AddProjectModal clients={clients} defaultClientId={modal.clientId || activeClientId} onClose={() => setModal(null)}
          onAdd={(cid, p) => {
            setClients((cs) => cs.map((c) => (c.id === cid ? { ...c, projects: [...c.projects, p] } : c)));
            setExpanded((s) => new Set(s).add(cid));
            setActiveClientId(cid); setActiveProjectId(p.id); setView("ranks"); setModal(null);
          }} />
      )}
    </div>
  );
}

