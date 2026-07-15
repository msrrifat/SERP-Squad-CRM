/* =====================================================================
   LIVE ANALYTICS (GOOGLE) — real GA4 + Search Console for this project.
   Uses the agency's Google OAuth app (Company Settings → API settings):
   click Connect → real Google consent popup → the server stores a refresh
   token and this view pulls LIVE data. Pick a Search Console site + a GA4
   property; everything shown here is real (or an honest error). ---- */
import React, { useEffect, useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, BarChart3, CheckCircle2, Eye, Link2, MousePointerClick, RefreshCw, Search, Target, Users } from "lucide-react";
import { Card, Labeled, StatCard, inputCls, tooltipStyle } from "../../ui/primitives.jsx";
import { fmt, pctDelta } from "../../lib/format.jsx";

const pct1 = (n) => (n == null ? "—" : (n * 100).toFixed(1) + "%");
/* period-over-period delta from a daily series: second half vs first half */
const halfDelta = (series) => {
  if (!series || series.length < 4) return null;
  const h = Math.floor(series.length / 2);
  const a = series.slice(0, h).reduce((s, v) => s + v, 0);
  const b = series.slice(h).reduce((s, v) => s + v, 0);
  return pctDelta(b, a);
};

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
  const conn = project.google || {};
  const [gsc, setGsc] = useState(null);   // { busy } | { err } | data
  const [ga4, setGa4] = useState(null);

  const loadGsc = async (site) => {
    setGsc({ busy: true });
    try {
      const r = await fetch("/api/google/gsc/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connectionId: conn.connectionId, siteUrl: site, days: 28 }) });
      const d = await r.json(); setGsc(r.ok ? d : { err: d.detail || d.error });
    } catch (e) { setGsc({ err: String(e?.message || e) }); }
  };
  const loadGa4 = async (propertyId) => {
    setGa4({ busy: true });
    try {
      const r = await fetch("/api/google/ga4/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connectionId: conn.connectionId, propertyId, days: 28 }) });
      const d = await r.json(); setGa4(r.ok ? d : { err: d.detail || d.error });
    } catch (e) { setGa4({ err: String(e?.message || e) }); }
  };
  useEffect(() => { if (conn.connectionId && conn.gscSite) loadGsc(conn.gscSite); }, [conn.connectionId, conn.gscSite]); // eslint-disable-line
  useEffect(() => { if (conn.connectionId && conn.ga4Property) loadGa4(conn.ga4Property); }, [conn.connectionId, conn.ga4Property]); // eslint-disable-line

  const hasGa = conn.connectionId && conn.ga4Property;
  const hasGsc = conn.connectionId && conn.gscSite;

  /* metric toggle for the daily trend — GA4 metrics use ga4.byDate, GSC metrics use gsc.byDate */
  const metrics = useMemo(() => {
    const list = [];
    if (ga4?.live) {
      list.push(
        { key: "users", label: "Active users", src: "GA4", rows: ga4.byDate, k: "users" },
        { key: "sessions", label: "Sessions", src: "GA4", rows: ga4.byDate, k: "sessions" },
      );
    }
    if (gsc?.live) {
      list.push(
        { key: "clicks", label: "Clicks", src: "GSC", rows: gsc.byDate, k: "clicks" },
        { key: "impressions", label: "Impressions", src: "GSC", rows: gsc.byDate, k: "impressions" },
      );
    }
    return list;
  }, [ga4, gsc]);
  const [metric, setMetric] = useState("users");
  const active = metrics.find((m) => m.key === metric) || metrics[0];
  const chartData = (active?.rows || []).map((r) => ({ date: (r.date || "").slice(5), v: r[active.k] || 0 }));

  if (!conn.connectionId || (!hasGsc && !hasGa)) return null;
  const busy = ga4?.busy || gsc?.busy;
  const refresh = () => { if (hasGa) loadGa4(conn.ga4Property); if (hasGsc) loadGsc(conn.gscSite); };

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-center gap-2">
        <div className="ll-display text-[15px] font-semibold text-gray-800">Google — live data</div>
        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">Last 28 days</span>
        {busy && <RefreshCw size={13} className="animate-spin text-gray-300" />}
        <button onClick={refresh} className="ml-auto flex items-center gap-1 text-[11px] font-semibold" style={{ color: accent }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {(ga4?.err || gsc?.err) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
          {ga4?.err && <div>Analytics: {ga4.err}</div>}
          {gsc?.err && <div>Search Console: {gsc.err}</div>}
        </div>
      )}

      {/* KPI grid — same StatCard look as the demo dashboard */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {ga4?.live && (<>
          <StatCard icon={Users} label="Active users" source="GA4" accent={accent} value={fmt(ga4.totals.users)} pct={halfDelta((ga4.byDate || []).map((r) => r.users))} spark={(ga4.byDate || []).map((r) => r.users)} />
          <StatCard icon={Activity} label="Sessions" source="GA4" accent={accent} value={fmt(ga4.totals.sessions)} pct={halfDelta((ga4.byDate || []).map((r) => r.sessions))} spark={(ga4.byDate || []).map((r) => r.sessions)} />
          <StatCard icon={Eye} label="Page views" source="GA4" accent={accent} value={fmt(ga4.totals.views)} pct={halfDelta((ga4.byDate || []).map((r) => r.views))} spark={(ga4.byDate || []).map((r) => r.views)} />
          <StatCard icon={Target} label="Conversions" source="GA4" accent={accent} value={fmt(ga4.totals.conversions)} pct={halfDelta((ga4.byDate || []).map((r) => r.conversions))} spark={(ga4.byDate || []).map((r) => r.conversions)} />
        </>)}
        {gsc?.live && (<>
          <StatCard icon={MousePointerClick} label="Clicks" source="GSC" accent={accent} value={fmt(gsc.totals.clicks)} pct={halfDelta((gsc.byDate || []).map((r) => r.clicks))} spark={(gsc.byDate || []).map((r) => r.clicks)} />
          <StatCard icon={Eye} label="Impressions" source="GSC" accent={accent} value={fmt(gsc.totals.impressions)} pct={halfDelta((gsc.byDate || []).map((r) => r.impressions))} spark={(gsc.byDate || []).map((r) => r.impressions)} />
          <StatCard icon={Target} label="Avg CTR" source="GSC" accent={accent} value={pct1(gsc.totals.ctr)} sub="clicks / impressions" />
          <StatCard icon={Search} label="Avg position" source="GSC" accent={accent} value={gsc.totals.position ? gsc.totals.position.toFixed(1) : "—"} invert sub="lower is better" />
        </>)}
        {busy && !ga4?.live && !gsc?.live && Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4"><div className="h-20 animate-pulse rounded-lg bg-gray-100" /></Card>
        ))}
      </div>

      {/* daily trend — recharts AreaChart with metric toggle, matching the demo */}
      {active && chartData.length > 0 && (
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="ll-display text-[14px] font-semibold text-gray-800">Daily trend</div>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {metrics.map((m) => (
                <button key={m.key} onClick={() => setMetric(m.key)}
                  className="rounded-lg px-2.5 py-1 text-[11px] font-semibold transition"
                  style={metric === m.key ? { background: accent, color: "#fff" } : { background: accent + "12", color: accent }}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="glvArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f2" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} minTickGap={18} />
              <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={38} tickFormatter={fmt} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmt(v), active.label]} />
              <Area type="monotone" dataKey="v" stroke={accent} strokeWidth={2} fill="url(#glvArea)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Search Console top queries */}
      {gsc?.live && (
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Search size={14} style={{ color: accent }} />
            <div className="ll-display text-[14px] font-semibold text-gray-800">Top queries</div>
            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">Search Console</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[440px] text-left text-[11.5px]">
              <thead><tr className="border-b border-gray-200 text-[9.5px] uppercase tracking-wide text-gray-400">
                <th className="px-2 py-1.5 font-semibold">Query</th><th className="px-2 py-1.5 font-semibold">Clicks</th><th className="px-2 py-1.5 font-semibold">Impr.</th><th className="px-2 py-1.5 font-semibold">CTR</th><th className="px-2 py-1.5 font-semibold">Pos.</th>
              </tr></thead>
              <tbody>
                {gsc.queries.map((q) => (
                  <tr key={q.query} className="border-b border-gray-50">
                    <td className="max-w-[240px] truncate px-2 py-1.5 font-medium text-gray-700">{q.query}</td>
                    <td className="ll-mono px-2 py-1.5 text-gray-600">{q.clicks}</td>
                    <td className="ll-mono px-2 py-1.5 text-gray-500">{q.impressions}</td>
                    <td className="ll-mono px-2 py-1.5 text-gray-500">{pct1(q.ctr)}</td>
                    <td className="ll-mono px-2 py-1.5 text-gray-500">{q.position?.toFixed(1)}</td>
                  </tr>
                ))}
                {!gsc.queries.length && <tr><td colSpan={5} className="py-3 text-center text-[11px] text-gray-300">No query data in this window.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}
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
