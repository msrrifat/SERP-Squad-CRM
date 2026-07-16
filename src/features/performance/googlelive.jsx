/* =====================================================================
   LIVE ANALYTICS (GOOGLE) — real GA4 + Search Console for this project.
   Uses the agency's Google OAuth app (Company Settings → API settings):
   click Connect → real Google consent popup → the server stores a refresh
   token and this view pulls LIVE data. Pick a Search Console site + a GA4
   property; everything shown here is real (or an honest error). ---- */
import React, { useEffect, useState } from "react";
import { LineChart, Line, PieChart, Pie, Cell, Legend, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, BarChart3, CheckCircle2, Eye, Link2, MousePointerClick, RefreshCw, Search, Target, Users } from "lucide-react";
import { Card, Delta, Labeled, RankChip, SectionHeader, Spark, StatCard, inputCls, tooltipStyle } from "../../ui/primitives.jsx";
import { fmt, pctDelta } from "../../lib/format.jsx";
import { emptySiteData } from "../../data/gen.js";
import { MONTH_DATES } from "../../lib/months.jsx";

const pct1 = (n) => (n == null ? "—" : (n * 100).toFixed(1) + "%");
/* period-over-period delta from a daily series: second half vs first half */
export const halfDelta = (series) => {
  if (!series || series.length < 4) return null;
  const h = Math.floor(series.length / 2);
  const a = series.slice(0, h).reduce((s, v) => s + v, 0);
  const b = series.slice(h).reduce((s, v) => s + v, 0);
  return pctDelta(b, a);
};
/* GA4 dates come as "20260716", GSC as "2026-07-16" */
export const dayLabel = (d) => (String(d).length === 8 ? String(d).slice(4, 6) + "/" + String(d).slice(6, 8) : String(d || "").slice(5));

/* Self-fetching live GA4 + Search Console for the project's FIXED site/property.
   Shared by GoogleLiveData (full dashboard sections) and OverviewView (KPI
   cards), so both always show the same numbers. */
export function useGoogleLive(project, days = 28) {
  const conn = project?.google || {};
  const [gsc, setGsc] = useState(null);   // { busy } | { err } | data
  const [ga4, setGa4] = useState(null);

  const loadGsc = async (site, d) => {
    setGsc({ busy: true });
    try {
      const r = await fetch("/api/google/gsc/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connectionId: conn.connectionId, siteUrl: site, days: d }) });
      const j = await r.json(); setGsc(r.ok ? j : { err: j.detail || j.error });
    } catch (e) { setGsc({ err: String(e?.message || e) }); }
  };
  const loadGa4 = async (propertyId, d) => {
    setGa4({ busy: true });
    try {
      const r = await fetch("/api/google/ga4/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connectionId: conn.connectionId, propertyId, days: d }) });
      const j = await r.json(); setGa4(r.ok ? j : { err: j.detail || j.error });
    } catch (e) { setGa4({ err: String(e?.message || e) }); }
  };
  useEffect(() => { if (conn.connectionId && conn.gscSite) loadGsc(conn.gscSite, days); else setGsc(null); }, [conn.connectionId, conn.gscSite, days]); // eslint-disable-line
  useEffect(() => { if (conn.connectionId && conn.ga4Property) loadGa4(conn.ga4Property, days); else setGa4(null); }, [conn.connectionId, conn.ga4Property, days]); // eslint-disable-line

  const hasGa = !!(conn.connectionId && conn.ga4Property);
  const hasGsc = !!(conn.connectionId && conn.gscSite);
  const refresh = () => { if (hasGa) loadGa4(conn.ga4Property, days); if (hasGsc) loadGsc(conn.gscSite, days); };
  return { ga4, gsc, hasGa, hasGsc, connected: hasGa || hasGsc, refresh };
}

/* Live report data: real GA4 (12 months) + Search Console (16 months capped
   at our grid) mapped into the genSiteData month-grid shape, so the Report
   builder works identically for demo and REAL projects. Unconnected sources
   stay all-zero — nothing is fabricated. */
export function useLiveSiteData(project, enabled = true) {
  const [out, setOut] = useState(null);
  const conn = project?.google || {};
  useEffect(() => {
    if (!enabled || !project) return;
    let alive = true;
    (async () => {
      const base = emptySiteData(project);
      const gaTime = (d) => Date.parse(`${String(d).slice(0, 4)}-${String(d).slice(4, 6)}-${String(d).slice(6, 8)}`);
      const monthIdx = (t) => { let i = -1; for (let j = 0; j < 13; j++) if (t >= MONTH_DATES[j].getTime()) i = j; return i; };
      const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => null);
      try {
        const [ga, gsc] = await Promise.all([
          conn.connectionId && conn.ga4Property ? post("/api/google/ga4/report", { connectionId: conn.connectionId, propertyId: conn.ga4Property, days: 365 }) : null,
          conn.connectionId && conn.gscSite ? post("/api/google/gsc/query", { connectionId: conn.connectionId, siteUrl: conn.gscSite, days: 480 }) : null,
        ]);
        if (ga?.live) {
          (ga.byDate || []).forEach((r) => {
            const i = monthIdx(gaTime(r.date));
            if (i >= 0) { base.months[i].ga.users += r.users; base.months[i].ga.sessions += r.sessions; base.months[i].ga.conversions += r.conversions; }
          });
          base.channels = ga.channels || [];
          base.sources = (ga.sources || []).map((s) => { const ser = Array(13).fill(0); ser[12] = s.value; return { name: s.name, series: ser }; });
          base.events = (ga.events || []).map((e) => { const ser = Array(13).fill(0); ser[12] = e.value; return { name: e.name, series: ser }; });
          base.topPages = ga.topPages || [];
          base.engRate = ga.totals?.engRate || 0;
        }
        if (gsc?.live) {
          (gsc.byDate || []).forEach((r) => {
            const i = monthIdx(Date.parse(r.date));
            if (i >= 0) { base.months[i].gsc.clicks += r.clicks; base.months[i].gsc.impressions += r.impressions; }
          });
          base.months[12].gsc.position = gsc.totals?.position || 0;
          base.topQueries = (gsc.queries || []).map((q) => ({ query: q.query, clicks: q.clicks, impressions: q.impressions, position: q.position }));
        }
      } catch { /* sources stay zero — never fabricated */ }
      if (alive) setOut(base);
    })();
    return () => { alive = false; };
  }, [enabled, conn.connectionId, conn.ga4Property, conn.gscSite, project?.id]); // eslint-disable-line
  return out;
}

/* Reusable Google connector — the real OAuth flow + Search Console site & GA4
   property pickers. Used in the Live Analytics view AND in Project settings →
   Data sources, so both connect the same way and stay in sync. Selecting a
   site/property flips the project's gsc/ga integration flags automatically. */
export function GoogleSourcesConnector({ project, company, accent, onUpdate, compact = false }) {
  const oauth = company.apis?.googleOauth?.values || {};
  const oauthReady = !!(oauth.clientId && oauth.clientSecret && oauth.redirectUri);
  const conn = project.google || {}; // { connectionId, email, gscSite, ga4Property }
  const setConn = (patch) => onUpdate((p) => {
    const google = { ...(p.google || {}), ...patch };
    /* keep the project integration flags true only while a real source is picked */
    return { google, integrations: { ...p.integrations, gsc: !!google.gscSite, ga: !!google.ga4Property } };
  });
  const [connecting, setConnecting] = useState(false);
  const [err, setErr] = useState(null);
  const [sites, setSites] = useState(null);
  const [props, setProps] = useState(null);

  const connect = async () => {
    setConnecting(true); setErr(null);
    try {
      const r = await fetch("/api/oauth/google/start", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: oauth.clientId, clientSecret: oauth.clientSecret, redirectUri: oauth.redirectUri }) });
      const d = await r.json();
      if (!r.ok) { setErr(d.detail || d.error); setConnecting(false); return; }
      const popup = window.open(d.authUrl, "ss_google_oauth", "width=520,height=640");
      const onMsg = (e) => {
        if (!e.data || !e.data.googleOAuth) return;
        window.removeEventListener("message", onMsg);
        setConnecting(false);
        if (e.data.googleOAuth === "ok" && e.data.connectionId) {
          setConn({ connectionId: e.data.connectionId, email: e.data.email || "", gscSite: "", ga4Property: "" });
          setSites(null); setProps(null);
        } else setErr("Google connection was cancelled or failed.");
      };
      window.addEventListener("message", onMsg);
      const iv = setInterval(() => { if (popup?.closed) { clearInterval(iv); setConnecting(false); window.removeEventListener("message", onMsg); } }, 800);
    } catch (e) { setErr("API server unreachable — the OAuth flow runs there. " + (e?.message || "")); setConnecting(false); }
  };
  const disconnect = () => { setConn({ connectionId: null, email: "", gscSite: "", ga4Property: "" }); setSites(null); setProps(null); };

  useEffect(() => {
    if (!conn.connectionId) return;
    let alive = true;
    (async () => {
      try {
        const [rs, rp] = await Promise.all([
          fetch("/api/google/gsc/sites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connectionId: conn.connectionId }) }).then((r) => r.json()),
          fetch("/api/google/ga4/properties", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connectionId: conn.connectionId }) }).then((r) => r.json()),
        ]);
        if (!alive) return;
        setSites(rs.sites || (rs.error ? { err: rs.detail || rs.error } : []));
        setProps(rp.properties || (rp.error ? { err: rp.detail || rp.error } : []));
        if (rs.error === "not_connected" || rp.error === "not_connected") setErr("This Google connection expired — reconnect.");
      } catch { if (alive) setErr("Couldn't reach the API server to load Google accounts."); }
    })();
    return () => { alive = false; };
  }, [conn.connectionId]);

  if (!oauthReady) return (
    <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/60 p-3 text-[11.5px] leading-relaxed text-amber-800">
      Add your <b>Google OAuth app</b> (Client ID, Secret &amp; redirect URI) in <b>Company Settings → API settings</b> first — then connect a Google account here to pull live GA4 &amp; Search Console for this project.
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {conn.connectionId
          ? <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"><CheckCircle2 size={12} /> {conn.email || "Connected"}</span>
          : <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-500">Not connected</span>}
        <span className="ml-auto flex gap-2">
          {conn.connectionId
            ? <button onClick={disconnect} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11.5px] font-semibold text-gray-500 hover:text-red-500">Disconnect</button>
            : <button onClick={connect} disabled={connecting} className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50" style={{ background: accent }}>
                {connecting ? <><RefreshCw size={13} className="animate-spin" /> Waiting for Google…</> : <><Link2 size={13} /> Connect Google</>}
              </button>}
        </span>
      </div>
      {err && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">{err}</div>}
      {conn.connectionId && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Google Search Console site">
            {sites?.err ? <div className="text-[11px] text-amber-700">{sites.err}</div>
            : <select value={conn.gscSite || ""} onChange={(e) => setConn({ gscSite: e.target.value })} className={inputCls + " bg-white"}>
                <option value="">{sites ? (sites.length ? "Select a site…" : "No sites on this account") : "Loading…"}</option>
                {Array.isArray(sites) && sites.map((s) => <option key={s.url} value={s.url}>{s.url}</option>)}
              </select>}
          </Labeled>
          <Labeled label="Google Analytics 4 property">
            {props?.err ? <div className="text-[11px] text-amber-700">{props.err}</div>
            : <select value={conn.ga4Property || ""} onChange={(e) => setConn({ ga4Property: e.target.value })} className={inputCls + " bg-white"}>
                <option value="">{props ? (props.length ? "Select a property…" : "No GA4 properties") : "Loading…"}</option>
                {Array.isArray(props) && props.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.account}</option>)}
              </select>}
          </Labeled>
        </div>
      )}
      {compact && conn.connectionId && (conn.gscSite || conn.ga4Property) && (
        <div className="text-[10.5px] text-gray-400">Live data appears in <b>Performance Studio → Live Analytics (Google)</b>.</div>
      )}
    </div>
  );
}

/* Live GA4 + Search Console data cards for the FIXED site/property already
   selected in Data sources. Self-fetching; renders nothing until connected.
   Dropped straight into Overview + Website Performance dashboards. */
export function GoogleLiveData({ project, accent }) {
  /* timeline: live pulls honor the selected window (GSC data lags ~2 days
     and caps at 90; GA4 follows the same options for comparable windows) */
  const [days, setDays] = useState(28);
  const { ga4, gsc, hasGa, hasGsc, connected, refresh } = useGoogleLive(project, days);

  /* Top search queries sorting — click a column to sort, click again to flip */
  const [qSort, setQSort] = useState({ key: "clicks", dir: "desc" });
  const qSortBy = (key, defDir) => setQSort((s) => ({ key, dir: s.key === key ? (s.dir === "asc" ? "desc" : "asc") : defDir }));
  const QTh = ({ k, defDir = "desc", children, className = "px-3 py-3" }) => (
    <th className={className + " cursor-pointer select-none font-semibold hover:text-gray-600"} onClick={() => qSortBy(k, defDir)}>
      <span className="inline-flex items-center gap-0.5">{children}{qSort.key === k && <span className="text-[9px]" style={{ color: accent }}>{qSort.dir === "asc" ? "▲" : "▼"}</span>}</span>
    </th>
  );
  const sortedQueries = [...(gsc?.queries || [])].sort((a, b) => {
    const va = qSort.key === "query" ? a.query : a[qSort.key], vb = qSort.key === "query" ? b.query : b[qSort.key];
    return (va < vb ? -1 : va > vb ? 1 : 0) * (qSort.dir === "asc" ? 1 : -1);
  });

  if (!connected) return null;
  const busy = ga4?.busy || gsc?.busy;

  const gaDaily = (ga4?.byDate || []).map((r) => ({ label: dayLabel(r.date), Users: r.users, Sessions: r.sessions }));
  const gscDaily = (gsc?.byDate || []).map((r) => ({ label: dayLabel(r.date), Clicks: r.clicks, Impressions: r.impressions }));
  const channels = ga4?.channels || [];
  const sources = ga4?.sources || [];
  const events = ga4?.events || [];
  const topPages = ga4?.topPages || [];
  const maxSource = Math.max(...sources.map((x) => x.value), 1);
  const PIE_COLORS = [accent, "#64748B", "#A5B4C4", "#CBD5E1", "#E2E8F0"];
  const AI_SRC = /chatgpt|perplexity|gemini|copilot|claude/i;

  return (
    <div className="space-y-5">
      {/* header — with the timeline selector so different windows can be compared */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="ll-display text-[15px] font-semibold text-gray-800">Google — live data</div>
        <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600">Live</span>
        {busy && <RefreshCw size={13} className="animate-spin text-gray-300" />}
        <span className="ml-auto flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 no-print">
          <span className="px-1.5 text-[10.5px] font-medium text-gray-400">Last</span>
          {[7, 28, 90, 180, 365].map((d) => (
            <button key={d} onClick={() => setDays(d)} className="ll-mono rounded-lg px-2 py-0.5 text-[11.5px] font-semibold"
              style={days === d ? { background: accent, color: "#fff" } : { color: "var(--chip-fg, #6B7280)" }}>
              {d}d
            </button>
          ))}
        </span>
        <button onClick={refresh} className="no-print flex items-center gap-1 text-[11px] font-semibold" style={{ color: accent }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {(ga4?.err || gsc?.err) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
          {ga4?.err && <div>Analytics: {ga4.err}</div>}
          {gsc?.err && <div>Search Console: {gsc.err}</div>}
        </div>
      )}
      {busy && !ga4?.live && !gsc?.live && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-4"><div className="h-20 animate-pulse rounded-lg bg-gray-100" /></Card>)}
        </div>
      )}

      {/* ---- GA4: same layout as the designed Website Performance dashboard ---- */}
      {ga4?.live && (<>
        <SectionHeader icon={BarChart3} title="Website traffic & conversions" sub={`Google Analytics 4 · last ${days} days`} accent={accent} />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={Users} label="Users" source="GA4" accent={accent} value={fmt(ga4.totals.users)} pct={halfDelta((ga4.byDate || []).map((r) => r.users))} spark={(ga4.byDate || []).map((r) => r.users)} />
          <StatCard icon={Eye} label="Sessions" source="GA4" accent={accent} value={fmt(ga4.totals.sessions)} pct={halfDelta((ga4.byDate || []).map((r) => r.sessions))} spark={(ga4.byDate || []).map((r) => r.sessions)} />
          <StatCard icon={MousePointerClick} label="Engagement rate" source="GA4" accent={accent} value={((ga4.totals.engRate || 0) * 100).toFixed(0) + "%"} pct={null} sub="range average" />
          <StatCard icon={BarChart3} label="Conversions" source="GA4" accent={accent} value={fmt(ga4.totals.conversions)} pct={halfDelta((ga4.byDate || []).map((r) => r.conversions))} spark={(ga4.byDate || []).map((r) => r.conversions)} />
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="p-5 lg:col-span-3">
            <div className="ll-display mb-4 text-[15px] font-semibold">Traffic <span className="text-xs font-normal text-gray-400">daily</span></div>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={gaDaily} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="Users" stroke={accent} strokeWidth={2.2} dot={false} />
                <Line type="monotone" dataKey="Sessions" stroke="#94A3B8" strokeWidth={2} dot={false} strokeDasharray="5 4" />
              </LineChart>
            </ResponsiveContainer>
          </Card>
          {channels.length > 0 && (
            <Card className="p-5 lg:col-span-2">
              <div className="ll-display mb-2 text-[15px] font-semibold">Traffic channels <span className="text-xs font-normal text-gray-400">sessions</span></div>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie data={channels} dataKey="value" nameKey="name" innerRadius={48} outerRadius={74} paddingAngle={2}>
                    {channels.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1.5">
                {channels.map((c, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[12px] text-gray-600">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    {c.name} <span className="ll-mono ml-auto text-gray-400">{fmt(c.value)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {sources.length > 0 && (
            <Card className="p-5">
              <div className="ll-display mb-1 text-[15px] font-semibold">Traffic sources <span className="text-xs font-normal text-gray-400">{`sessions · last ${days} days`}</span></div>
              <div className="mb-3 text-[11px] text-gray-400">Where visitors came from — search engines (organic &amp; paid), social, direct and AI assistants</div>
              <div className="space-y-2.5">
                {sources.map((x, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 truncate text-[12.5px] font-medium text-gray-700">{x.name}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <span className="block h-full rounded-full" style={{ width: `${(x.value / maxSource) * 100}%`, background: AI_SRC.test(x.name) ? "#7C3AED" : accent }} />
                    </span>
                    <span className="ll-mono w-12 text-right text-[12px] font-semibold">{fmt(x.value)}</span>
                    <span className="w-14 text-right">{x.prev > 0 ? <Delta pct={pctDelta(x.value, x.prev)} /> : <span className="text-[11px] text-gray-300">new</span>}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {events.length > 0 && (
            <Card className="overflow-hidden">
              <div className="border-b border-gray-100 px-5 py-4">
                <div className="ll-display text-[15px] font-semibold">Event counts</div>
                <div className="text-[11px] text-gray-400">{`GA4 events · last ${days} days`}</div>
              </div>
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
                    <th className="px-5 py-2.5 font-semibold">Event name</th>
                    <th className="px-3 py-2.5 font-semibold">Count</th>
                    <th className="px-3 py-2.5 font-semibold">vs prev. half</th>
                    <th className="px-5 py-2.5 font-semibold">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/60">
                      <td className="ll-mono px-5 py-2.5 text-gray-700">{e.name}</td>
                      <td className="ll-mono px-3 py-2.5 font-semibold">{fmt(e.value)}</td>
                      <td className="px-3 py-2.5">{halfDelta(e.series) != null ? <Delta pct={halfDelta(e.series)} /> : <span className="text-gray-300">—</span>}</td>
                      <td className="px-5 py-2.5"><Spark values={e.series} color={accent} w={72} h={22} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        {topPages.length > 0 && (
          <Card className="overflow-hidden">
            <div className="ll-display border-b border-gray-100 px-5 py-4 text-[15px] font-semibold">Top landing pages <span className="text-xs font-normal text-gray-400">last {days} days</span></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[440px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
                    <th className="px-5 py-3 font-semibold">Page</th>
                    <th className="px-3 py-3 font-semibold">Users</th>
                    <th className="px-5 py-3 font-semibold">Conversions</th>
                  </tr>
                </thead>
                <tbody>
                  {topPages.map((p, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/60">
                      <td className="ll-mono max-w-[320px] truncate px-5 py-3 text-gray-700">{p.page}</td>
                      <td className="ll-mono px-3 py-3">{fmt(p.users)}</td>
                      <td className="ll-mono px-5 py-3">{fmt(p.conversions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </>)}

      {/* ---- Search Console: same layout as the designed dashboard ---- */}
      {gsc?.live && (<>
        <SectionHeader icon={Search} title="Organic search visibility" sub={`Google Search Console · last ${days} days`} accent={accent} />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={MousePointerClick} label="Clicks" source="GSC" accent={accent} value={fmt(gsc.totals.clicks)} pct={halfDelta((gsc.byDate || []).map((r) => r.clicks))} spark={(gsc.byDate || []).map((r) => r.clicks)} />
          <StatCard icon={Eye} label="Impressions" source="GSC" accent={accent} value={fmt(gsc.totals.impressions)} pct={halfDelta((gsc.byDate || []).map((r) => r.impressions))} spark={(gsc.byDate || []).map((r) => r.impressions)} />
          <StatCard icon={Target} label="Avg. CTR" source="GSC" accent={accent} value={pct1(gsc.totals.ctr)} sub="clicks / impressions" />
          <StatCard icon={Search} label="Avg. position" source="GSC" accent={accent} value={gsc.totals.position ? "#" + gsc.totals.position.toFixed(1) : "—"} invert sub="lower is better" />
        </div>
        <Card className="p-5">
          <div className="ll-display mb-4 text-[15px] font-semibold">Clicks &amp; impressions <span className="text-xs font-normal text-gray-400">daily</span></div>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={gscDaily} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line yAxisId="l" type="monotone" dataKey="Clicks" stroke={accent} strokeWidth={2.2} dot={false} />
              <Line yAxisId="r" type="monotone" dataKey="Impressions" stroke="#94A3B8" strokeWidth={2} dot={false} strokeDasharray="5 4" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        {gsc.queries.length > 0 && (
          <Card className="overflow-hidden">
            <div className="ll-display border-b border-gray-100 px-5 py-4 text-[15px] font-semibold">Top search queries <span className="text-xs font-normal text-gray-400">last {days} days</span></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
                    <QTh k="query" defDir="asc" className="px-5 py-3">Query</QTh>
                    <QTh k="clicks">Clicks</QTh>
                    <QTh k="impressions">Impressions</QTh>
                    <QTh k="ctr">CTR</QTh>
                    <QTh k="position" defDir="asc" className="px-5 py-3">Position</QTh>
                  </tr>
                </thead>
                <tbody>
                  {sortedQueries.map((q) => (
                    <tr key={q.query} className="border-b border-gray-50 hover:bg-gray-50/60">
                      <td className="max-w-[280px] truncate px-5 py-3 font-medium text-gray-800">{q.query}</td>
                      <td className="ll-mono px-3 py-3">{fmt(q.clicks)}</td>
                      <td className="ll-mono px-3 py-3">{fmt(q.impressions)}</td>
                      <td className="ll-mono px-3 py-3">{pct1(q.ctr)}</td>
                      <td className="px-5 py-3"><RankChip pos={Math.round(q.position)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </>)}
    </div>
  );
}

/* kept for compatibility — the connector + live data together (no longer a
   nav view; Google data now shows inside Overview + Website Performance) */
export function GoogleLiveView({ project, company, accent, onUpdate }) {
  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <div className="ll-display flex items-center gap-2 text-[15px] font-semibold"><Activity size={15} style={{ color: accent }} /> Live Analytics — Google</div>
        <div className="text-[11px] text-gray-400">Pulls real data via the Google Analytics Data API (GA4) and Search Console API. Connect these from <b>Project settings → Data sources</b>.</div>
        <GoogleSourcesConnector project={project} company={company} accent={accent} onUpdate={onUpdate} />
      </Card>
      <GoogleLiveData project={project} accent={accent} />
    </div>
  );
}
