/* =====================================================================
   LIVE ANALYTICS (GOOGLE) — real GA4 + Search Console for this project.
   Uses the agency's Google OAuth app (Company Settings → API settings):
   click Connect → real Google consent popup → the server stores a refresh
   token and this view pulls LIVE data. Pick a Search Console site + a GA4
   property; everything shown here is real (or an honest error). ---- */
import React, { useEffect, useState } from "react";
import { Activity, BarChart3, CheckCircle2, ExternalLink, Link2, RefreshCw, Search, TrendingUp, X } from "lucide-react";
import { Card, Labeled, inputCls } from "../../ui/primitives.jsx";

const fmt = (n) => (n == null ? "—" : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(Math.round(n)));
const pct = (n) => (n == null ? "—" : (n * 100).toFixed(1) + "%");

function MiniTrend({ rows, keyName, accent }) {
  const vals = (rows || []).map((r) => r[keyName] || 0);
  const max = Math.max(1, ...vals);
  return (
    <div className="flex h-12 items-end gap-px">
      {vals.map((v, i) => <div key={i} className="flex-1 rounded-t" style={{ height: `${Math.max(3, (v / max) * 100)}%`, background: accent + "99" }} title={rows[i]?.date + ": " + v} />)}
    </div>
  );
}
const Stat = ({ label, value, sub }) => (
  <div className="rounded-xl border border-gray-100 p-3">
    <div className="ll-mono text-[19px] font-bold text-gray-800">{value}</div>
    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
    {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
  </div>
);

export function GoogleLiveView({ project, company, accent, onUpdate }) {
  const oauth = company.apis?.googleOauth?.values || {};
  const oauthReady = !!(oauth.clientId && oauth.clientSecret && oauth.redirectUri);
  const conn = project.google || {}; // { connectionId, email, gscSite, ga4Property }
  const setConn = (patch) => onUpdate({ google: { ...(project.google || {}), ...patch } });

  const [connecting, setConnecting] = useState(false);
  const [err, setErr] = useState(null);
  const [sites, setSites] = useState(null);
  const [props, setProps] = useState(null);
  const [gsc, setGsc] = useState(null);   // { busy } | { err } | data
  const [ga4, setGa4] = useState(null);

  /* --- OAuth connect (real Google consent popup) --- */
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
          setSites(null); setProps(null); setGsc(null); setGa4(null);
        } else setErr("Google connection was cancelled or failed.");
      };
      window.addEventListener("message", onMsg);
      /* if the popup is closed without finishing, stop the spinner */
      const iv = setInterval(() => { if (popup?.closed) { clearInterval(iv); setConnecting(false); window.removeEventListener("message", onMsg); } }, 800);
    } catch (e) { setErr("API server unreachable — the OAuth flow runs there. " + (e?.message || "")); setConnecting(false); }
  };
  const disconnect = () => { setConn({ connectionId: null, email: "", gscSite: "", ga4Property: "" }); setSites(null); setProps(null); setGsc(null); setGa4(null); };

  /* --- once connected, load the account's sites + properties --- */
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

  /* --- states --- */
  if (!oauthReady) return (
    <Card className="p-8 text-center">
      <Activity size={26} className="mx-auto text-gray-300" />
      <div className="ll-display mt-2 text-[15px] font-semibold">Connect Google Analytics & Search Console</div>
      <p className="mx-auto mt-1 max-w-md text-[12.5px] text-gray-400">
        First add your <b>Google OAuth app</b> (Client ID, Secret & redirect URI) in <b>Company Settings → API settings</b>.
        Then you can connect a Google account here and pull live GA4 and Search Console data for this project.
      </p>
    </Card>
  );

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="ll-display flex items-center gap-2 text-[15px] font-semibold"><Activity size={15} style={{ color: accent }} /> Live Analytics — Google</div>
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
        <div className="text-[11px] text-gray-400">Pulls real data via the Google Analytics Data API (GA4) and Search Console API. Business Profile connects separately once Google approves its API access.</div>
        {err && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">{err}</div>}
        {conn.connectionId && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Search Console site">
              {sites?.err ? <div className="text-[11px] text-amber-700">{sites.err}</div>
              : <select value={conn.gscSite || ""} onChange={(e) => setConn({ gscSite: e.target.value })} className={inputCls + " bg-white"}>
                  <option value="">{sites ? (sites.length ? "Select a site…" : "No sites on this account") : "Loading…"}</option>
                  {Array.isArray(sites) && sites.map((s) => <option key={s.url} value={s.url}>{s.url}</option>)}
                </select>}
            </Labeled>
            <Labeled label="GA4 property">
              {props?.err ? <div className="text-[11px] text-amber-700">{props.err}</div>
              : <select value={conn.ga4Property || ""} onChange={(e) => setConn({ ga4Property: e.target.value })} className={inputCls + " bg-white"}>
                  <option value="">{props ? (props.length ? "Select a property…" : "No GA4 properties") : "Loading…"}</option>
                  {Array.isArray(props) && props.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.account}</option>)}
                </select>}
            </Labeled>
          </div>
        )}
      </Card>

      {/* GA4 */}
      {conn.connectionId && conn.ga4Property && (
        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <div className="ll-display text-[14px] font-semibold"><BarChart3 size={14} className="mr-1 inline" style={{ color: accent }} /> Analytics 4 — last 28 days</div>
            {ga4?.busy && <RefreshCw size={13} className="animate-spin text-gray-300" />}
            <button onClick={() => loadGa4(conn.ga4Property)} className="ml-auto text-[11px] font-semibold" style={{ color: accent }}>↻ Refresh</button>
          </div>
          {ga4?.err && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">{ga4.err}</div>}
          {ga4?.live && (<>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Active users" value={fmt(ga4.totals.users)} />
              <Stat label="Sessions" value={fmt(ga4.totals.sessions)} />
              <Stat label="Page views" value={fmt(ga4.totals.views)} />
              <Stat label="Conversions" value={fmt(ga4.totals.conversions)} />
            </div>
            <div><div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">Active users / day</div><MiniTrend rows={ga4.byDate} keyName="users" accent={accent} /></div>
          </>)}
        </Card>
      )}

      {/* Search Console */}
      {conn.connectionId && conn.gscSite && (
        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <div className="ll-display text-[14px] font-semibold"><Search size={14} className="mr-1 inline" style={{ color: accent }} /> Search Console — last 28 days</div>
            {gsc?.busy && <RefreshCw size={13} className="animate-spin text-gray-300" />}
            <button onClick={() => loadGsc(conn.gscSite)} className="ml-auto text-[11px] font-semibold" style={{ color: accent }}>↻ Refresh</button>
          </div>
          {gsc?.err && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">{gsc.err}</div>}
          {gsc?.live && (<>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Clicks" value={fmt(gsc.totals.clicks)} />
              <Stat label="Impressions" value={fmt(gsc.totals.impressions)} />
              <Stat label="Avg CTR" value={pct(gsc.totals.ctr)} />
              <Stat label="Avg position" value={gsc.totals.position ? gsc.totals.position.toFixed(1) : "—"} />
            </div>
            <div><div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">Clicks / day</div><MiniTrend rows={gsc.byDate} keyName="clicks" accent={accent} /></div>
            <div>
              <div className="mb-1.5 text-[12px] font-bold text-gray-700">Top queries</div>
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
                        <td className="ll-mono px-2 py-1.5 text-gray-500">{pct(q.ctr)}</td>
                        <td className="ll-mono px-2 py-1.5 text-gray-500">{q.position?.toFixed(1)}</td>
                      </tr>
                    ))}
                    {!gsc.queries.length && <tr><td colSpan={5} className="py-3 text-center text-[11px] text-gray-300">No query data in this window.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>)}
        </Card>
      )}

      {conn.connectionId && !conn.gscSite && !conn.ga4Property && (
        <Card className="p-6 text-center text-[12px] text-gray-400">Pick a Search Console site and/or a GA4 property above to see live data.</Card>
      )}
    </div>
  );
}
