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
import { LABELS, MONTH_DATES, isoDate, rangeIdx } from "../lib/months.jsx";
import { hashStr } from "../lib/rng.js";

export const ACCENTS = [
  { name: "Harbor", hex: "#0E7C66" },
  { name: "Cobalt", hex: "#2456E6" },
  { name: "Plum", hex: "#7C3AED" },
  { name: "Ember", hex: "#EA580C" },
  { name: "Rose", hex: "#E11D48" },
  { name: "Ink", hex: "#1F2A44" },
];
export const POS = "#15803D", NEG = "#DC2626";

export const FONT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');
.ll-root { font-family: 'Inter', system-ui, sans-serif; color: #18202F; }
.ll-display { font-family: 'Bricolage Grotesque', 'Inter', sans-serif; }
.ll-mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
.ll-root ::-webkit-scrollbar { width: 8px; height: 8px; }
.ll-root ::-webkit-scrollbar-thumb { background: #D7DBE3; border-radius: 8px; }
@media print { .no-print { display: none !important; } .print-full { margin-left: 0 !important; } }
.ll-fade { animation: llfade .35s ease; }
@keyframes llfade { from { opacity: 0; transform: translateY(4px);} to { opacity: 1; transform: none;} }
@media (prefers-reduced-motion: reduce) { .ll-fade { animation: none; } }
.line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.animate-spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@media screen {
  .ll-dark { background-color: #0F141E !important; color: #E2E8F0; --chip-bg: #1B2334; --chip-fg: #C3CCDC; }
  .ll-dark [class*="bg-white"] { background-color: #151C2A !important; }
  .ll-dark [class*="bg-gray-50"], .ll-dark [class*="bg-gray-100"] { background-color: #1B2334 !important; }
  .ll-dark [class*="border-gray-"] { border-color: #293349 !important; }
  .ll-dark [class*="text-gray-9"], .ll-dark [class*="text-gray-8"], .ll-dark [class*="text-gray-7"] { color: #E2E8F0 !important; }
  .ll-dark [class*="text-gray-6"], .ll-dark [class*="text-gray-5"] { color: #9AA5B8 !important; }
  .ll-dark [class*="text-gray-4"] { color: #76829A !important; }
  .ll-dark [class*="text-gray-3"] { color: #4D5870 !important; }
  .ll-dark input, .ll-dark select, .ll-dark textarea { background-color: #1B2334; color: #E2E8F0; border-color: #293349; }
  .ll-dark option { background: #1B2334; color: #E2E8F0; }
  .ll-dark [class*="hover:bg-gray-50"]:hover, .ll-dark [class*="hover:bg-gray-100"]:hover { background-color: #222C40 !important; }
  .ll-dark [class*="bg-gray-900"] { background-color: rgba(0,0,0,.65) !important; }
  .ll-dark ::-webkit-scrollbar-thumb { background: #39455E; }
}
`;

export function Delta({ pct, invert = false, suffix = "%" }) {
  const good = invert ? pct < 0 : pct > 0;
  const flat = Math.abs(pct) < 0.05;
  const color = flat ? "#6B7280" : good ? POS : NEG;
  const Icon = flat ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold ll-mono" style={{ color }}>
      <Icon size={13} strokeWidth={2.5} />
      {Math.abs(pct).toFixed(suffix === "%" ? 1 : 0)}{suffix}
    </span>
  );
}
export function PosChange({ value }) {
  if (value == null) return <span className="text-gray-300">—</span>;
  if (value === 0) return <span className="ll-mono text-xs font-semibold text-gray-400">0</span>;
  const up = value > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="ll-mono inline-flex items-center gap-0.5 text-xs font-semibold" style={{ color: up ? POS : NEG }}>
      <Icon size={13} strokeWidth={2.5} />{Math.abs(value)}
    </span>
  );
}
export function Spark({ values, invert = false, color = "#0E7C66", w = 88, h = 26 }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (w - 4) + 2;
    const t = (v - min) / span;
    const y = invert ? 3 + t * (h - 6) : h - 3 - t * (h - 6);
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} className="block">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function RankChip({ pos, muted = false }) {
  if (pos == null) return <span className="text-gray-300">—</span>;
  const tone = muted
    ? { bg: "#F1F5F9", fg: "#64748B" }
    : pos <= 3 ? { bg: "#DCFCE7", fg: "#166534" } : pos <= 10 ? { bg: "#FEF9C3", fg: "#854D0E" } : { bg: "#F1F5F9", fg: "#475569" };
  return (
    <span className="ll-mono inline-flex min-w-10 items-center justify-center rounded-md px-2 py-0.5 text-sm font-semibold" style={{ background: tone.bg, color: tone.fg }}>
      #{pos}
    </span>
  );
}
export function Card({ children, className = "", style }) {
  return <div className={`rounded-2xl border border-gray-200 bg-white ${className}`} style={style}>{children}</div>;
}
export function SourceTag({ label }) {
  return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-500">{label}</span>;
}
export function StatCard({ icon: Icon, label, value, pct, invert, source, spark, accent, sub, deltaSuffix = "%" }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: accent + "1A", color: accent }}>
            <Icon size={16} />
          </span>
          <div className="text-[13px] font-medium text-gray-600">{label}</div>
        </div>
        <SourceTag label={source} />
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="ll-display text-[30px] font-semibold leading-none tracking-tight">{value}</div>
          <div className="mt-1.5 flex items-center gap-1.5">
            {pct != null && <Delta pct={pct} invert={invert} suffix={deltaSuffix} />}
            {sub && <span className="text-[11px] text-gray-400">{sub}</span>}
          </div>
        </div>
        {spark && <Spark values={spark} invert={invert} color={accent} />}
      </div>
    </Card>
  );
}
export function Toggle({ on, onChange, label, desc }) {
  return (
    <button onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-left hover:border-gray-300">
      <div>
        <div className="text-[13px] font-medium text-gray-800">{label}</div>
        {desc && <div className="text-[11px] text-gray-400">{desc}</div>}
      </div>
      <span className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors" style={{ background: on ? "#16A34A" : "#FCA5A5" }}>
        <span className="absolute h-4 w-4 rounded-full bg-white shadow transition-transform" style={{ transform: on ? "translateX(18px)" : "translateX(2px)" }} />
      </span>
    </button>
  );
}
export function BrandMark({ name, logo, accent, size = "md" }) {
  const dim = size === "xl" ? "h-16 w-16" : size === "lg" ? "h-10 w-10" : "h-8 w-8";
  const txt = size === "xl" ? "text-[20px]" : "text-[13px]";
  if (logo) return <img src={logo} alt={name} className={`${dim} shrink-0 rounded-xl border border-gray-200 object-cover`} />;
  return (
    <span className={`ll-display flex ${dim} shrink-0 items-center justify-center rounded-xl ${txt} font-bold text-white`} style={{ background: accent || "#1F2A44" }}>
      {name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
    </span>
  );
}
export function ProjectMark({ project, size = "sm" }) {
  const dim = size === "md" ? "h-8 w-8 text-[12px]" : "h-6 w-6 text-[10px]";
  if (project.logo) return <img src={project.logo} alt={project.name} className={`${dim.split(" ").slice(0,2).join(" ")} shrink-0 rounded-md border border-gray-200 object-cover`} />;
  return (
    <span className={`ll-display flex ${dim} shrink-0 items-center justify-center rounded-md font-bold text-white`} style={{ background: project.accent }}>
      {project.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 1).toUpperCase() || "P"}
    </span>
  );
}
export function LogoUpload({ value, onChange, label = "Upload logo" }) {
  const ref = useRef(null);
  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(f);
  };
  return (
    <div className="flex items-center gap-3">
      {value
        ? <img src={value} alt="logo" className="h-12 w-12 rounded-lg border border-gray-200 object-cover" />
        : <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-300"><Upload size={16} /></span>}
      <div className="flex flex-col gap-1">
        <button onClick={() => ref.current?.click()}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[12.5px] font-medium text-gray-600 hover:border-gray-300">
          <Upload size={13} /> {label}
        </button>
        {value && <button onClick={() => onChange(null)} className="text-left text-[11.5px] text-gray-400 hover:text-red-500">Remove</button>}
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={onFile} />
      </div>
    </div>
  );
}
export function DateRangeBar({ range, setRange, accent }) {
  const today = new Date();
  const [a, b] = rangeIdx(range);
  const span = b - a + 1;
  const presets = [
    // data is month-granular — "months: 1" selects the current calendar month
    // to date, so label it honestly instead of claiming "last 30 days"
    { label: "This month", months: 1 },
    { label: "Last 3 months", months: 3 },
    { label: "Last 6 months", months: 6 },
    { label: "Last 12 months", months: 12 },
  ];
  const apply = (m) => {
    const start = new Date(today.getFullYear(), today.getMonth() - m + 1, 1);
    setRange({ start: isoDate(start < MONTH_DATES[0] ? MONTH_DATES[0] : start), end: isoDate(today) });
  };
  return (
    <Card className="flex flex-wrap items-center gap-2 px-4 py-3 no-print">
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500"><Calendar size={14} style={{ color: accent }} /> Date range</span>
      {presets.map((p) => {
        const active = span === p.months && b === 12;
        return (
          <button key={p.label} onClick={() => apply(p.months)}
            className="rounded-full border px-3 py-1 text-[12px] font-medium"
            style={active ? { background: accent, borderColor: accent, color: "#fff" } : { borderColor: "#E5E7EB", color: "var(--chip-fg, #4B5563)", background: "var(--chip-bg, #fff)" }}>
            {p.label}
          </button>
        );
      })}
      <span className="mx-1 hidden h-5 w-px bg-gray-200 sm:block" />
      <input type="date" value={range.start} min={isoDate(MONTH_DATES[0])} max={range.end}
        onChange={(e) => e.target.value && setRange({ ...range, start: e.target.value })}
        className="ll-mono rounded-lg border border-gray-200 px-2 py-1.5 text-[12px]" />
      <span className="text-gray-300">→</span>
      <input type="date" value={range.end} min={range.start} max={isoDate(today)}
        onChange={(e) => e.target.value && setRange({ ...range, end: e.target.value })}
        className="ll-mono rounded-lg border border-gray-200 px-2 py-1.5 text-[12px]" />
      <span className="ml-auto text-[11px] text-gray-400">
        {LABELS[a]} – {LABELS[b]} · compared with the previous {span} month{span > 1 ? "s" : ""}
      </span>
    </Card>
  );
}
export function DarkToggle({ dark, setDark }) {
  return (
    <button onClick={() => setDark((d) => !d)} title="Toggle bright / dark mode"
      className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] font-medium text-gray-600 hover:border-gray-300">
      {dark ? <Sun size={14} /> : <Moon size={14} />} {dark ? "Bright" : "Dark"}
    </button>
  );
}
export const tooltipStyle = {
  borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 12,
  boxShadow: "0 8px 24px rgba(16,24,38,.08)", fontFamily: "Inter, sans-serif",
};
export const inputCls = "w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px]";

/* draft-then-save for settings forms: edits stay local until Save is clicked.
   `keys` are the entity fields this form owns; the draft resyncs when the
   committed values change externally (e.g. right after a save). */
export function useDraft(source, keys) {
  const pick = (o) => Object.fromEntries(keys.map((k) => [k, o?.[k]]));
  const committed = pick(source);
  const [draft, setDraft] = useState(committed);
  const sig = JSON.stringify(committed);
  useEffect(() => { setDraft(pick(source)); }, [sig]); // eslint-disable-line
  const set = (patch) => setDraft((d) => ({ ...d, ...(typeof patch === "function" ? patch(d) : patch) }));
  const dirty = JSON.stringify(draft) !== sig;
  return { draft, set, dirty, reset: () => setDraft(pick(source)) };
}

/* sticky action row for settings cards — Save (enabled only when dirty) + Reset */
export function SaveBar({ dirty, onSave, onReset, accent = "#0E7C66", savedLabel = "Saved", saveLabel = "Save changes" }) {
  const [flash, setFlash] = useState(false);
  const save = () => { onSave(); setFlash(true); setTimeout(() => setFlash(false), 1800); };
  return (
    <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-3">
      <button onClick={save} disabled={!dirty}
        className="rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
        style={{ background: flash ? "#16A34A" : accent }}>
        {flash ? "✓ " + savedLabel : saveLabel}
      </button>
      {dirty && <button onClick={onReset} className="rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-medium text-gray-500 hover:border-gray-300">Discard</button>}
      {dirty && <span className="text-[11px] font-medium text-amber-600">Unsaved changes</span>}
    </div>
  );
}

export function Labeled({ label, children }) {
  return (
    <div>
      <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      {children}
    </div>
  );
}

export function Seg({ options, value, onChange, icons, accent }) {
  return (
    <div className="flex rounded-lg border border-gray-200 p-0.5">
      {options.map((o, i) => {
        const Icon = icons?.[i];
        return (
          <button key={o} onClick={() => onChange(o)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium"
            style={value === o ? { background: accent, color: "#fff" } : { color: "var(--chip-fg, #4B5563)" }}>
            {Icon && <Icon size={13} />}{o}
          </button>
        );
      })}
    </div>
  );
}
export function SectionHeader({ icon: Icon, title, sub, accent }) {
  return (
    <div className="flex items-center gap-2.5 pt-1">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: accent + "1A", color: accent }}><Icon size={15} /></span>
      <div>
        <div className="ll-display text-[15px] font-semibold leading-tight">{title}</div>
        {sub && <div className="text-[11px] text-gray-400">{sub}</div>}
      </div>
    </div>
  );
}

export function Modal({ title, sub, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4" onClick={onClose}>
      <div className={`max-h-[92vh] w-full ${wide ? "max-w-2xl" : "max-w-md"} overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="ll-display text-lg font-semibold">{title}</div>
            {sub && <div className="text-[12px] text-gray-400">{sub}</div>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* "How do I get this?" — step-by-step popover next to any credential/connector */
export function GuideTip({ title = "How to get this", steps = [], docs = null, accent = "#1F2A44" }) {
  const [open, setOpen] = React.useState(false);
  return (
    <span className="relative inline-block">
      <button onClick={() => setOpen((v) => !v)} title={title}
        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold"
        style={open ? { background: accent, borderColor: accent, color: "#fff" } : { borderColor: accent + "66", color: accent }}>
        ? Guide
      </button>
      {open && (
        <span className="absolute left-0 top-full z-40 mt-1 block w-80 rounded-xl border border-gray-200 bg-white p-3.5 text-left shadow-xl">
          <span className="mb-1.5 flex items-center justify-between">
            <span className="text-[12px] font-bold text-gray-800">{title}</span>
            <button onClick={() => setOpen(false)} className="text-gray-300 hover:text-gray-600">✕</button>
          </span>
          <ol className="list-decimal space-y-1 pl-4 text-[11px] leading-relaxed text-gray-600">
            {steps.map((st, i) => <li key={i}>{st}</li>)}
          </ol>
          {docs && (
            <a href={/^https?:/.test(docs) ? docs : "https://" + docs} target="_blank" rel="noopener noreferrer"
              className="mt-2 inline-block text-[11px] font-semibold underline" style={{ color: accent }}>
              Open official docs →
            </a>
          )}
        </span>
      )}
    </span>
  );
}

export function RoleBadge({ role }) {
  const tone = role === "Admin" ? { bg: "#FEE2E2", fg: "#991B1B" }
    : role === "Manager" ? { bg: "#DBEAFE", fg: "#1E40AF" }
    : role === "Paid Ads Manager" ? { bg: "#FEF3C7", fg: "#92400E" }
    : role === "Web Developer" ? { bg: "#E0E7FF", fg: "#3730A3" }
    : role === "Content Developer" ? { bg: "#DCFCE7", fg: "#166534" }
    : { bg: "#F1F5F9", fg: "#475569" };
  return <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ background: tone.bg, color: tone.fg }}>{role}</span>;
}

/* ================= API settings (Company Settings → API settings) =================
   Central registry of EVERY external credential the tool uses. When a new feature
   needs an API key / OAuth app, add one entry to API_REGISTRY below — it appears in
   Company Settings → API settings automatically (grouped card, status pill,
   save & validate, disconnect). Values are stored in company.apis[id] as
   { values, connected }. DataForSEO is special-cased (useDfs) to company.dfs so
   existing rank-tracking wiring keeps working untouched. */
/* identity wall: when a provider is mounted (client portal), team avatars render
   as the agency/white-label BRAND tile instead of personal initials/photos */
export const AvaMaskCtx = React.createContext(null);
export function Ava({ name, size = 22, onRemove, img = null }) {
  const mask = React.useContext(AvaMaskCtx);
  if (mask && mask.match(name)) {
    return (
      <span title={name} onClick={onRemove}
        className="ll-display inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white"
        style={{ width: size, height: size, fontSize: size * 0.38, background: mask.accent || "#1F2A44" }}>
        {mask.logo ? <img src={mask.logo} alt={name} className="h-full w-full object-cover" /> : (mask.brandName || "A").split(" ").map((w) => w[0]).slice(0, 2).join("")}
      </span>
    );
  }
  const bg = ACCENTS[hashStr(name) % ACCENTS.length].hex;
  return (
    <span title={name + (onRemove ? " — click to remove" : "")} onClick={onRemove}
      className={`ll-display inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white ${onRemove ? "cursor-pointer hover:opacity-70" : ""}`}
      style={{ width: size, height: size, fontSize: size * 0.42, background: bg }}>
      {img ? <img src={img} alt={name} className="h-full w-full object-cover" /> : name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
    </span>
  );
}
export function AssignPicker({ people, current, onAdd }) {
  const avail = people.filter((p) => !current.includes(p.name));
  if (!avail.length) return null;
  return (
    <select value="" onChange={(e) => e.target.value && onAdd(e.target.value)}
      className="cursor-pointer rounded-md border border-dashed border-gray-300 bg-transparent px-1.5 py-0.5 text-[11px] text-gray-400 hover:border-gray-400">
      <option value="">+ Assign</option>
      {avail.map((p) => <option key={p.name} value={p.name}>{p.name}{p.type === "client" ? " (client)" : ""}</option>)}
    </select>
  );
}

/* ---- the record window: 70% work area / 30% comments+activity ---- */
export const MetaChip = ({ label, value, max }) => {
  if (!value) return null;
  const n = value.length; const over = n > max;
  return <span className="ll-mono rounded bg-gray-50 px-1 py-px text-[9px]" style={{ color: over ? "#DC2626" : "#16A34A" }}>{label} {n}/{max}</span>;
};
export const CharCount = ({ value, max }) => {
  const n = (value || "").length;
  return <span className="ll-mono text-[10px]" style={{ color: n > max ? NEG : n > max * 0.9 ? "#D97706" : "#9CA3AF" }}>{n}/{max}</span>;
};
export function ConnBadge({ on }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
      style={on ? { background: "#DCFCE7", color: "#166534" } : { background: "#F1F5F9", color: "#64748B" }}>
      {on ? "● Connected" : "○ Not connected"}
    </span>
  );
}
export function OAuthButton({ label, onDone, accent, connected, onDisconnect }) {
  const [busy, setBusy] = useState(false);
  if (connected) return (
    <button onClick={onDisconnect} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11.5px] font-medium text-gray-400 hover:border-red-200 hover:text-red-500">Disconnect</button>
  );
  return (
    <button disabled={busy}
      onClick={() => { setBusy(true); setTimeout(() => { setBusy(false); onDone(); }, 900); /* PROD: window.open(oauthUrl) → callback stores tokens server-side */ }}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-60" style={{ background: accent }}>
      {busy ? <><RefreshCw size={12} className="animate-spin" /> Authorizing…</> : <>{label}</>}
    </button>
  );
}

