/* =====================================================================
   PUBLIC MARKETING PAGES — app.serpsquad.com/ (homepage), /privacy, /terms.
   The homepage is the front door Google's OAuth verification reviewers see,
   so it plainly describes what the app does; the login moved to /login.
   All animation is deterministic (fixed frame sequences, no Math.random)
   and pure CSS/interval — no new dependencies.
   ===================================================================== */
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight, BarChart3, Bot, CheckCircle2, FileSearch, Globe2, LayoutDashboard,
  LineChart, ListChecks, Lock, MapPin, Megaphone, Phone, Rocket, Search, Sparkles, Target, TrendingUp,
} from "lucide-react";
import { FONT_CSS } from "../../ui/primitives.jsx";

const ACCENT = "#2563EB";

/* ---------- tiny deterministic animation helpers ---------- */
const useTick = (ms, frames) => {
  const [i, setI] = useState(0);
  useEffect(() => { const iv = setInterval(() => setI((c) => (c + 1) % frames), ms); return () => clearInterval(iv); }, [ms, frames]);
  return i;
};
/* count from `from` to `to` once on mount, easing out */
const useCountUp = (to, ms = 1600, from = 0) => {
  const [v, setV] = useState(from);
  useEffect(() => {
    const t0 = performance.now();
    let raf;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(from + (to - from) * (1 - (1 - p) ** 3));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms, from]);
  return v;
};
/* reveal-on-scroll: adds .mkt-in when the block enters the viewport */
const Reveal = ({ children, delay = 0, className = "" }) => {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.classList.add("mkt-in"); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={"mkt-reveal " + className} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
};

/* ---------- hero visuals ---------- */
/* the REAL geo-grid look: radial scan pins over actual map tiles (same CARTO
   basemap the tracker itself renders), healing red → green in a ripple */
const lon2x = (lon, z) => ((lon + 180) / 360) * 256 * 2 ** z;
const lat2y = (lat, z) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 256 * 2 ** z; };
const HERO_W = 560, HERO_H = 380, HERO_Z = 12, HERO_LAT = 32.7767, HERO_LNG = -96.797; // Dallas
function MapGridHero() {
  const t = useTick(700, 14); // 0..8 ripple, then hold, then reset
  const stage = t <= 8 ? t : 8;
  const cx = lon2x(HERO_LNG, HERO_Z), cy = lat2y(HERO_LAT, HERO_Z);
  const x0 = cx - HERO_W / 2, y0 = cy - HERO_H / 2;
  const tiles = [];
  for (let ty = Math.floor(y0 / 256); ty * 256 < y0 + HERO_H; ty++)
    for (let tx = Math.floor(x0 / 256); tx * 256 < x0 + HERO_W; tx++)
      tiles.push({ tx, ty, left: tx * 256 - x0, top: ty * 256 - y0 });
  /* radial scan grid exactly like a real report: center pin + rings of 6/12/18 */
  const pins = [{ ring: 0, a: 0 }];
  [[1, 6], [2, 12], [3, 18]].forEach(([k, n]) => { for (let i = 0; i < n; i++) pins.push({ ring: k, a: (2 * Math.PI * i) / n }); });
  const STEP = 58;
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
      {/* browser chrome — this is a product screenshot, and it reads like one */}
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
        <span className="flex gap-1"><i className="h-2.5 w-2.5 rounded-full bg-red-300" /><i className="h-2.5 w-2.5 rounded-full bg-amber-300" /><i className="h-2.5 w-2.5 rounded-full bg-emerald-300" /></span>
        <span className="ll-mono flex-1 truncate rounded-md bg-white px-2 py-0.5 text-[9.5px] text-gray-400 ring-1 ring-gray-200">app.serpsquad.com/project/dallas-plumbing/performance/geogrid</span>
      </div>
      <div className="flex items-center justify-between px-3.5 py-2">
        <span className="text-[11px] font-bold text-gray-700"><MapPin size={11} className="mr-1 inline text-blue-600" />GBP Rank Tracking · "emergency plumber dallas"</span>
        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9.5px] font-bold text-emerald-600"><i className="mkt-blink h-1.5 w-1.5 rounded-full bg-emerald-500" />LIVE SCAN</span>
      </div>
      <div className="relative overflow-hidden" style={{ height: HERO_H }}>
        {tiles.map((tl, i) => (
          <img key={i} alt="" draggable={false} src={`https://${"abcd"[(tl.tx + tl.ty) % 4]}.basemaps.cartocdn.com/rastertiles/voyager/${HERO_Z}/${tl.tx}/${tl.ty}.png`}
            className="pointer-events-none absolute select-none" style={{ left: tl.left, top: tl.top, width: 256, height: 256 }} />
        ))}
        {pins.map((p, i) => {
          const x = HERO_W / 2 + p.ring * STEP * Math.sin(p.a);
          const y = HERO_H / 2 - p.ring * STEP * Math.cos(p.a);
          const healed = stage >= p.ring * 2;
          const rank = healed ? (p.ring <= 1 ? 1 + p.ring : p.ring === 2 ? 3 : 4 + (i % 3)) : Math.min(19, 9 + p.ring * 3);
          const good = rank <= 3;
          return (
            <div key={i} className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[10px] font-bold text-white transition-all duration-500"
              style={{ left: x, top: y, width: p.ring === 0 ? 34 : 30, height: p.ring === 0 ? 34 : 30,
                background: healed ? (good ? "#16A34A" : "#F59E0B") : "#EF4444",
                boxShadow: "0 2px 6px rgba(0,0,0,.3)", outline: p.ring === 0 ? "2.5px solid #111827" : "none", outlineOffset: 2 }}>
              {rank}
            </div>
          );
        })}
        <span className="absolute bottom-0 right-0 rounded-tl bg-white/85 px-1.5 py-0.5 text-[8px] text-gray-500">© OpenStreetMap © CARTO</span>
      </div>
      <div className="ll-mono flex items-center gap-4 border-t border-gray-100 px-3.5 py-2 text-[9.5px] font-bold text-gray-500">
        <span>ARP <b className="text-gray-800">#2.4</b></span>
        <span>SoLV <b className="text-emerald-600">74%</b></span>
        <span>37 scan points</span>
        <span className="ml-auto font-semibold text-gray-400">updated today</span>
      </div>
    </div>
  );
}
/* realistic rank-tracker snapshot: keyword rows whose positions climb in
   steps with change badges and sparklines — exactly what the tracker shows */
const TRACK_ROWS = [
  { kw: "emergency plumber dallas", pos: [14, 9, 6, 3], map: 2, vol: "2.4K" },
  { kw: "water heater repair dallas", pos: [22, 15, 9, 5], map: 3, vol: "1.9K" },
  { kw: "plumber near me", pos: [31, 24, 17, 8], map: 4, vol: "12K" },
  { kw: "slab leak detection dallas", pos: [11, 8, 5, 2], map: 1, vol: "880" },
  { kw: "drain cleaning service", pos: [18, 12, 7, 4], map: 3, vol: "3.6K" },
];
const posColor = (p) => (p <= 3 ? "#16A34A" : p <= 10 ? "#F59E0B" : "#EF4444");
function Sparkline({ vals, upTo }) {
  const shown = vals.slice(0, upTo + 1);
  const pts = shown.map((v, i) => `${4 + i * 17},${22 - (32 - v) * 0.55}`).join(" L");
  return (
    <svg viewBox="0 0 60 24" className="h-5 w-14">
      <path d={"M" + pts} fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={4 + (shown.length - 1) * 17} cy={22 - (32 - shown[shown.length - 1]) * 0.55} r="2.5" fill="#2563EB" />
    </svg>
  );
}
function RankTrackerCard() {
  const t = useTick(1600, 6); // steps 0..3 then hold, then loop
  const step = Math.min(3, t);
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
        <span className="text-[12px] font-bold text-gray-700"><Target size={13} className="mr-1.5 inline text-blue-600" />Website Rank Tracking · Dallas, TX</span>
        <span className="ll-mono rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-bold text-blue-600">re-checked today</span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr className="ll-mono border-b border-gray-100 text-[8.5px] font-bold uppercase tracking-wide text-gray-400">
            <th className="py-1.5 pl-4">Keyword</th><th className="px-1 text-center">Google</th>
            <th className="px-1 text-center">Δ 90d</th><th className="hidden px-1 text-center sm:table-cell">3-Pack</th>
            <th className="hidden px-1 text-center sm:table-cell">Vol</th><th className="pr-4 text-right">Trend</th>
          </tr>
        </thead>
        <tbody>
          {TRACK_ROWS.map((r) => {
            const cur = r.pos[step], delta = r.pos[0] - cur;
            return (
              <tr key={r.kw} className="border-b border-gray-50 text-[11px]">
                <td className="max-w-[150px] truncate py-2 pl-4 font-semibold text-gray-700">{r.kw}</td>
                <td className="px-1 text-center"><span className="inline-flex h-6 w-8 items-center justify-center rounded-md text-[10.5px] font-bold text-white transition-colors duration-500" style={{ background: posColor(cur) }}>{cur}</span></td>
                <td className="px-1 text-center text-[10px] font-bold" style={{ color: delta > 0 ? "#16A34A" : "#9CA3AF" }}>{delta > 0 ? `▲${delta}` : "—"}</td>
                <td className="ll-mono hidden px-1 text-center text-[10px] font-bold text-gray-600 sm:table-cell">{step >= 2 ? `#${r.map}` : "—"}</td>
                <td className="ll-mono hidden px-1 text-center text-[10px] text-gray-400 sm:table-cell">{r.vol}</td>
                <td className="py-2 pr-4"><span className="float-right"><Sparkline vals={r.pos} upTo={step} /></span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="ll-mono flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[9px] font-bold text-gray-400">
        Tracking: <span className="text-gray-600">Google</span>·<span className="text-gray-600">Bing</span>·<span className="text-gray-600">Maps 3-Pack</span>·<span className="text-gray-600">AI search</span>
        <span className="ml-auto font-semibold">real SERP data, never estimates</span>
      </div>
    </div>
  );
}

/* rank ticker: climbs #27 → #3 then loops */
const RANK_FRAMES = [27, 22, 18, 14, 11, 8, 6, 4, 3, 3, 3, 27];
function RankCard() {
  const i = useTick(900, RANK_FRAMES.length);
  const rank = RANK_FRAMES[i];
  const up = i > 0 && RANK_FRAMES[i] < RANK_FRAMES[i - 1];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lg">
      <Search size={18} className="text-blue-600" />
      <div className="min-w-0">
        <div className="text-[10px] font-semibold text-gray-400">"emergency plumber dallas"</div>
        <div className="flex items-baseline gap-1.5">
          <span className="ll-display text-[22px] font-bold text-gray-900">#{rank}</span>
          {up && <span className="flex items-center text-[10.5px] font-bold text-emerald-600"><TrendingUp size={11} className="mr-0.5" />climbing</span>}
        </div>
      </div>
    </div>
  );
}
/* leads counter: grows month over month */
const LEAD_FRAMES = [12, 19, 27, 38, 52, 71, 94, 118, 118, 12];
function LeadsCard() {
  const i = useTick(1100, LEAD_FRAMES.length);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lg">
      <Phone size={18} className="text-emerald-600" />
      <div>
        <div className="text-[10px] font-semibold text-gray-400">Calls + leads this month</div>
        <div className="flex items-baseline gap-1.5">
          <span className="ll-display text-[22px] font-bold text-gray-900">{LEAD_FRAMES[i]}</span>
          <span className="text-[10.5px] font-bold text-emerald-600">+{Math.round((LEAD_FRAMES[i] / LEAD_FRAMES[0] - 1) * 100)}%</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- animated leads chart (pure CSS draw-in, restarted via key) ---------- */
function LeadsBarChart() {
  const cycle = useTick(9000, 2);
  const bars = [22, 30, 27, 41, 55, 63, 78, 92, 104, 121, 135, 152];
  return (
    <svg viewBox="0 0 400 160" className="w-full" key={cycle}>
      {bars.map((h, i) => (
        <rect key={i} x={8 + i * 33} width="22" y={155 - h * 0.9} height={h * 0.9} rx="4" fill={i >= bars.length - 3 ? "#16A34A" : "#86EFAC"}
          className="mkt-grow" style={{ animationDelay: `${i * 90}ms`, transformOrigin: `${19 + i * 33}px 155px` }} />
      ))}
      <text x="392" y="14" fontSize="10" fontWeight="700" fill="#16A34A" textAnchor="end">+590% leads</text>
    </svg>
  );
}

/* ---------- shared page chrome ---------- */
const MktCss = () => (
  <style>{FONT_CSS + `
  .mkt-reveal{opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .7s ease}
  .mkt-in{opacity:1;transform:none}
  .mkt-draw{stroke-dasharray:1;stroke-dashoffset:1;animation:mktdraw 2.6s ease-out forwards}
  @keyframes mktdraw{to{stroke-dashoffset:0}}
  .mkt-grow{transform:scaleY(0);animation:mktgrow .7s cubic-bezier(.2,.8,.3,1) forwards}
  @keyframes mktgrow{to{transform:scaleY(1)}}
  .mkt-blink{animation:mktblink 1.4s ease-in-out infinite}
  @keyframes mktblink{0%,100%{opacity:1}50%{opacity:.25}}
  .mkt-float{animation:mktfloat 5s ease-in-out infinite}
  @keyframes mktfloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
  html{scroll-behavior:smooth}
`}</style>
);
const TopNav = ({ cta = true }) => (
  <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/85 backdrop-blur">
    <div className="mx-auto flex max-w-6xl items-center gap-5 px-5 py-3">
      <a href="/" className="ll-display flex items-center gap-2 text-[16px] font-bold text-gray-900">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-900 text-[13px] font-bold text-white">SS</span>
        SERP Squad Studio
      </a>
      <nav className="ml-4 hidden gap-5 text-[12.5px] font-semibold text-gray-500 md:flex">
        <a href="/#features" className="hover:text-gray-900">Features</a>
        <a href="/#results" className="hover:text-gray-900">Results</a>
        <a href="/#how" className="hover:text-gray-900">How it works</a>
        <a href="/privacy" className="hover:text-gray-900">Privacy</a>
      </nav>
      {cta && (
        <a href="/login" className="ml-auto flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-bold text-white shadow-sm transition hover:opacity-90" style={{ background: ACCENT }}>
          <Lock size={12} /> Sign in
        </a>
      )}
    </div>
  </header>
);
const Footer = () => (
  <footer className="border-t border-gray-100 bg-gray-50">
    <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-8 text-[11.5px] text-gray-400">
      <span className="ll-display font-bold text-gray-600">SERP Squad Studio</span>
      <span>© {new Date().getFullYear()} SERP Squad · SEO done &amp; monitored in one place.</span>
      <span className="ml-auto flex gap-5">
        <a href="/privacy" className="font-semibold hover:text-gray-700">Privacy policy</a>
        <a href="/terms" className="font-semibold hover:text-gray-700">Terms of service</a>
        <a href="mailto:serpsquad@gmail.com" className="font-semibold hover:text-gray-700">Support</a>
      </span>
    </div>
  </footer>
);

/* ================= HOMEPAGE ================= */
const FEATURES = [
  { icon: MapPin, title: "GBP geo-grid rank tracking", desc: "Coordinate-targeted Google Maps scans across a city grid — see exactly where you rank on every block, watch it turn green as work lands." },
  { icon: LineChart, title: "Keyword rank tracking", desc: "Google & Bing positions per city and device, local 3-Pack included, re-checked on schedule with real SERP data — never estimates." },
  { icon: Bot, title: "AI website architect & writer", desc: "AI plans your site architecture from live SERPs, structures every page and writes conversion-ready content in your brand voice." },
  { icon: ListChecks, title: "Listings & citation scanner", desc: "Real directory-by-directory scans verify your business name, address and phone everywhere it matters — with fix lists." },
  { icon: FileSearch, title: "Google index checker", desc: "Every page and post checked against Google's actual index, auto-rechecked as content ships." },
  { icon: LayoutDashboard, title: "Client portal & reports", desc: "White-label dashboards and one-click performance reports your clients actually read — rankings, leads, work done." },
  { icon: Megaphone, title: "Campaign automation", desc: "Branded Web 2.0 properties, GBP posts and content campaigns run on autopilot with AI drafting and scheduling." },
  { icon: BarChart3, title: "Live Google data", desc: "Search Console and GA4 plug straight into each project's dashboard — impressions, clicks and traffic beside your rank grids." },
];
export function MarketingHome() {
  useEffect(() => { document.title = "SERP Squad Studio | Get Your SEO Done & Monitored in One Place"; }, []);
  const kw = useCountUp(12400), scans = useCountUp(9300000), lift = useCountUp(18), leads = useCountUp(3.2, 1600, 1);
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <MktCss /><TopNav />

      {/* hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_70%_10%,#DBEAFE_0%,transparent_60%)]" />
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 md:grid-cols-2 md:py-24">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-bold text-blue-700">
              <Sparkles size={11} /> AI-powered · for businesses of any size
            </span>
            <h1 className="ll-display mt-4 text-[34px] font-bold leading-[1.12] sm:text-[44px]">
              Get your SEO done<br />&amp; monitored in one place.<br />
              <span style={{ color: ACCENT }}>SERP · Maps · AI search.</span>
            </h1>
            <p className="mt-4 max-w-md text-[14.5px] leading-relaxed text-gray-500">
              SERP Squad Studio is the AI-powered platform that plans, writes and fixes your SEO,
              then tracks every ranking it moves — across Google's organic results, the local map
              grid and AI-powered search. Local shop or national brand, visibility turns into
              calls, leads and customers.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="/login" className="flex items-center gap-2 rounded-xl px-6 py-3 text-[13.5px] font-bold text-white shadow-lg transition hover:opacity-90" style={{ background: ACCENT }}>
                Sign in to your workspace <ArrowRight size={15} />
              </a>
              <a href="#features" className="flex items-center gap-2 rounded-xl border border-gray-200 px-6 py-3 text-[13.5px] font-bold text-gray-600 transition hover:border-gray-300">
                See what's inside
              </a>
            </div>
            <div className="mt-5 flex items-center gap-4 text-[11px] font-semibold text-gray-400">
              <span className="flex items-center gap-1"><CheckCircle2 size={12} className="text-emerald-500" /> Real SERP data</span>
              <span className="flex items-center gap-1"><CheckCircle2 size={12} className="text-emerald-500" /> White-label ready</span>
              <span className="flex items-center gap-1"><CheckCircle2 size={12} className="text-emerald-500" /> Client portal</span>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-xl">
            <MapGridHero />
            <div className="mkt-float absolute -left-6 -top-5 hidden sm:block"><RankCard /></div>
            <div className="mkt-float absolute -bottom-6 -right-4 hidden sm:block" style={{ animationDelay: "1.2s" }}><LeadsCard /></div>
            <div className="mt-4 flex flex-col gap-3 sm:hidden"><RankCard /><LeadsCard /></div>
          </div>
        </div>
      </section>

      {/* stat band */}
      <section className="border-y border-gray-100 bg-gray-50/70">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-10 text-center md:grid-cols-4">
          {[
            [Math.round(kw).toLocaleString() + "+", "keywords tracked"],
            [(scans / 1e6).toFixed(1) + "M+", "map points scanned"],
            ["+" + Math.round(lift), "avg. positions gained"],
            [leads.toFixed(1) + "×", "more leads in 6 months"],
          ].map(([v, l]) => (
            <div key={l}>
              <div className="ll-display text-[26px] font-bold" style={{ color: ACCENT }}>{v}</div>
              <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* results — animated charts */}
      <section id="results" className="mx-auto max-w-6xl px-5 py-16">
        <Reveal className="text-center">
          <h2 className="ll-display text-[26px] font-bold sm:text-[30px]">Rankings that climb. Leads that compound.</h2>
          <p className="mx-auto mt-2 max-w-xl text-[13px] text-gray-500">
            Track every keyword across the SERP, the map grid and AI answers — get found where
            customers search, and the phone rings. This is what a running engagement looks like.
          </p>
        </Reveal>
        <div className="mt-10 grid items-start gap-6 md:grid-cols-2">
          <Reveal><RankTrackerCard /></Reveal>
          <Reveal delay={120} className="rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-[13px] font-bold text-gray-700"><Phone size={15} className="text-emerald-600" /> Monthly calls &amp; leads</div>
            <LeadsBarChart />
            <div className="mt-2 text-[11px] text-gray-400">Visibility converts: SERP and map-pack wins turn into calls, forms and booked jobs.</div>
          </Reveal>
        </div>
      </section>

      {/* features */}
      <section id="features" className="border-t border-gray-100 bg-gray-50/50">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <Reveal className="text-center">
            <h2 className="ll-display text-[26px] font-bold sm:text-[30px]">Everything an SEO team runs — in one workspace</h2>
            <p className="mx-auto mt-2 max-w-xl text-[13px] text-gray-500">
              Built by a local-SEO agency, for running real client work: tracking, content, listings, reporting and automation together.
            </p>
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 4) * 90} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                <f.icon size={20} style={{ color: ACCENT }} />
                <div className="mt-3 text-[13.5px] font-bold text-gray-800">{f.title}</div>
                <div className="mt-1.5 text-[11.5px] leading-relaxed text-gray-500">{f.desc}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="mx-auto max-w-6xl px-5 py-16">
        <Reveal className="text-center">
          <h2 className="ll-display text-[26px] font-bold sm:text-[30px]">How it works</h2>
        </Reveal>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            [Globe2, "1 · Connect & baseline", "Plug in your business profile, website, Search Console and Analytics. SERP Squad Studio maps your rankings across the SERP, the local grid and AI answers, and finds every gap holding you back."],
            [Bot, "2 · AI does the heavy lifting", "The AI plans your site, writes local content in your voice, fixes listings, schedules posts and re-checks Google's index as work ships."],
            [Rocket, "3 · Watch the grid turn green", "Rankings climb, the map fills with top-3 dots, and calls, leads and booked jobs follow — all reported to you (or your clients) automatically."],
          ].map(([Icon, t, d], i) => (
            <Reveal key={t} delay={i * 120} className="rounded-2xl border border-gray-200 p-6 text-center shadow-sm">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50"><Icon size={22} style={{ color: ACCENT }} /></span>
              <div className="mt-4 text-[14px] font-bold text-gray-800">{t}</div>
              <div className="mt-2 text-[12px] leading-relaxed text-gray-500">{d}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-5 pb-20">
        <Reveal className="overflow-hidden rounded-3xl px-8 py-12 text-center text-white shadow-xl" >
          <div className="rounded-3xl" style={{ background: "linear-gradient(120deg,#111827,#1D4ED8)", margin: "-3rem -2rem", padding: "3rem 2rem" }}>
            <h2 className="ll-display text-[26px] font-bold sm:text-[30px]">Ready to own your market?</h2>
            <p className="mx-auto mt-2 max-w-md text-[13px] text-blue-100">
              Sign in to your SERP Squad Studio workspace — or talk to us about bringing your business on board.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <a href="/login" className="rounded-xl bg-white px-6 py-3 text-[13.5px] font-bold text-gray-900 transition hover:opacity-90">Sign in</a>
              <a href="mailto:serpsquad@gmail.com" className="rounded-xl border border-white/30 px-6 py-3 text-[13.5px] font-bold text-white transition hover:bg-white/10">Contact us</a>
            </div>
          </div>
        </Reveal>
      </section>
      <Footer />
    </div>
  );
}

/* ================= POLICY PAGES ================= */
const Prose = ({ children }) => <div className="space-y-4 text-[13px] leading-relaxed text-gray-600 [&_h2]:ll-display [&_h2]:mt-8 [&_h2]:text-[18px] [&_h2]:font-bold [&_h2]:text-gray-900 [&_h3]:text-[14px] [&_h3]:font-bold [&_h3]:text-gray-800 [&_li]:ml-5 [&_li]:list-disc">{children}</div>;
const PolicyShell = ({ title, updated, children }) => {
  useEffect(() => { document.title = `${title} | SERP Squad Studio`; window.scrollTo(0, 0); }, [title]);
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <MktCss /><TopNav />
      <main className="mx-auto max-w-3xl px-5 py-14">
        <h1 className="ll-display text-[30px] font-bold">{title}</h1>
        <p className="mt-1 text-[11.5px] font-semibold text-gray-400">Last updated: {updated}</p>
        <div className="mt-8">{children}</div>
      </main>
      <Footer />
    </div>
  );
};

export function PrivacyPage() {
  return (
    <PolicyShell title="Privacy Policy" updated="July 26, 2026">
      <Prose>
        <p>
          <b>SERP Squad Studio</b> is an SEO management platform for agencies and local businesses at
          <b> app.serpsquad.com</b> (the "Service"), operated by SERP Squad ("we", "us"). This policy explains what information the Service handles,
          how it is used, and the choices you have. Questions: <a className="font-semibold text-blue-600" href="mailto:serpsquad@gmail.com">serpsquad@gmail.com</a>.
        </p>

        <h2>Information we collect</h2>
        <ul>
          <li><b>Account information</b> — name, email address, username and a password (stored hashed) for team members and client-portal users.</li>
          <li><b>Workspace data</b> — the business and SEO data you add to manage projects: business names and addresses, keywords, rankings, content, tasks, reports and files.</li>
          <li><b>Usage &amp; security data</b> — session tokens, device/browser identifiers used for new-device verification, and server logs (IP address, timestamps) kept for security.</li>
        </ul>

        <h2>Google user data</h2>
        <p>
          If you choose to connect a Google account, the Service accesses these Google APIs with <b>read-only</b> scopes:
        </p>
        <ul>
          <li><b>Google Search Console</b> (<code>webmasters.readonly</code>) — search performance (queries, clicks, impressions, positions) of the sites you select.</li>
          <li><b>Google Analytics 4</b> (<code>analytics.readonly</code>) — traffic metrics of the properties you select.</li>
          <li><b>Basic profile</b> (<code>openid</code>, <code>email</code>) — your email address, only to label the connection in the app.</li>
        </ul>
        <p>
          <b>How it is used:</b> this data is displayed inside the dashboards and reports of the specific project you connect it to,
          and for nothing else. <b>Storage:</b> the OAuth refresh token is stored on our server and never exposed to browsers;
          report data is fetched on demand. <b>Sharing:</b> we do not sell, rent or transfer Google user data to third parties;
          it is never used for advertising; no human reads it except as needed for support you request, security, or legal compliance.
          <b> AI/ML:</b> Google user data is not used to train or improve any machine-learning or AI models.
        </p>
        <p>
          SERP Squad Studio's use and transfer of information received from Google APIs adheres to the
          <a className="font-semibold text-blue-600" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer"> Google API Services User Data Policy</a>,
          including the <b>Limited Use</b> requirements.
        </p>
        <p>
          <b>Revoking access:</b> disconnect Google inside the app (which deletes the stored token) or revoke the app at
          <a className="font-semibold text-blue-600" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer"> myaccount.google.com/permissions</a>.
        </p>

        <h2>Cookies &amp; local storage</h2>
        <p>
          The Service uses browser local storage for your session token and interface preferences.
          We do not use advertising or cross-site tracking cookies.
        </p>

        <h2>How we protect data</h2>
        <ul>
          <li>All traffic is encrypted in transit (HTTPS/TLS).</li>
          <li>Passwords and verification codes are stored hashed; session and device tokens are stored hashed server-side.</li>
          <li>New devices require email verification codes; per-IP rate limits protect sign-in endpoints.</li>
          <li>API credentials you add (e.g. data providers) are used server-side only.</li>
        </ul>

        <h2>Data retention &amp; deletion</h2>
        <p>
          Workspace data is retained while your account is active. You can delete projects, clients, connections and files
          in the app at any time; deleting a Google connection deletes its stored token immediately. To request full
          account deletion, email <a className="font-semibold text-blue-600" href="mailto:serpsquad@gmail.com">serpsquad@gmail.com</a> and
          we will remove your data within 30 days.
        </p>

        <h2>Children</h2>
        <p>The Service is for businesses and is not directed to children under 16.</p>

        <h2>Changes</h2>
        <p>We will post any changes to this policy on this page and update the date above.</p>
      </Prose>
    </PolicyShell>
  );
}

export function TermsPage() {
  return (
    <PolicyShell title="Terms of Service" updated="July 26, 2026">
      <Prose>
        <p>
          These terms govern use of SERP Squad Studio at app.serpsquad.com (the "Service"), operated by SERP Squad.
          By signing in or using the Service you agree to these terms.
        </p>
        <h2>Accounts</h2>
        <ul>
          <li>Accounts are provisioned by SERP Squad for its team and clients. Keep your credentials confidential; you are responsible for activity under your account.</li>
          <li>You must have the right to manage any business, website or marketing account you connect to the Service.</li>
        </ul>
        <h2>Acceptable use</h2>
        <ul>
          <li>Use the Service only for lawful SEO and marketing management of businesses you are authorized to represent.</li>
          <li>Do not attempt to breach, overload, reverse engineer or misuse the Service or its data providers.</li>
        </ul>
        <h2>Your data</h2>
        <p>
          You retain ownership of the business data you add. You grant us the limited rights needed to operate the Service
          (storing, processing and displaying that data to you and the teammates/clients you authorize). Handling of
          personal and Google-connected data is described in the <a className="font-semibold text-blue-600" href="/privacy">Privacy Policy</a>.
        </p>
        <h2>Third-party services</h2>
        <p>
          The Service integrates third-party APIs (e.g. Google, search-data providers, publishing platforms) at your direction.
          Their availability and terms are outside our control; fees charged by third-party providers are your responsibility
          where you supply your own credentials.
        </p>
        <h2>Disclaimer &amp; liability</h2>
        <p>
          The Service is provided "as is" without warranties of any kind. Search rankings and lead outcomes depend on factors
          outside any tool's control; historical results shown in marketing materials are illustrative. To the maximum extent
          permitted by law, SERP Squad's total liability for any claim related to the Service is limited to the amounts paid
          for the Service in the three months before the claim.
        </p>
        <h2>Termination</h2>
        <p>We may suspend or end access for breach of these terms; you may stop using the Service at any time and request data deletion.</p>
        <h2>Contact</h2>
        <p>Questions about these terms: <a className="font-semibold text-blue-600" href="mailto:serpsquad@gmail.com">serpsquad@gmail.com</a>.</p>
      </Prose>
    </PolicyShell>
  );
}
