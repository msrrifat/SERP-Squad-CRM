import React, { useState } from "react";
import { CheckCircle2, Clock, RefreshCw, Search, X } from "lucide-react";
import { Card, Labeled, inputCls } from "../../ui/primitives.jsx";
import { DfsCostChip } from "../../lib/dfsCost.jsx";
import { fmtTs2 } from "../../lib/format.jsx";

/* ================= Google index checker =================
   REAL checks only. The API server runs one `site:<url>` query per URL through
   the DataForSEO SERP API and requires an exact URL match (root URLs may match
   by prefix — site:example.com legitimately returns deeper pages). There is NO
   demo fallback here by design: an index status is either verified or absent.
   Statuses shown are therefore never fabricated. */

export const realDfs = (dfs) =>
  dfs?.login && dfs?.password && !dfs.login.includes("demo@serpsquad") ? { login: dfs.login, password: dfs.password } : undefined;

export async function checkIndexApi(urls, dfs) {
  const res = await fetch("/api/check-index", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(120000),
    body: JSON.stringify({ urls, dfs: realDfs(dfs) }),
  });
  if (res.ok) return res.json();
  const err = await res.json().catch(() => ({}));
  const e = new Error(err.detail || err.hint || err.error || `HTTP ${res.status}`);
  e.code = res.status;
  throw e;
}

export const INDEX_STALE_MS = 7 * 864e5; // recheck cadence: 7 days
export const indexStale = (idx) => !idx || Date.now() - idx.checkedAt > INDEX_STALE_MS;

/* the tag shown in Pages/Posts tables: status + last-checked date */
export function IndexTag({ idx, checking }) {
  if (checking && (!idx || indexStale(idx))) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-1.5 py-px text-[8.5px] font-bold uppercase text-blue-600"><RefreshCw size={8} className="animate-spin" /> Checking</span>;
  }
  if (!idx) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-1.5 py-px text-[8.5px] font-bold uppercase text-gray-400"
      title="Index status is only shown from a real Google check — start the API server (npm run api) and add DataForSEO credentials in API settings.">Index unknown</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="rounded-full px-1.5 py-px text-[8.5px] font-bold uppercase"
        style={idx.status === "indexed" ? { background: "#DCFCE7", color: "#166534" } : { background: "#FEE2E2", color: "#991B1B" }}>
        {idx.status === "indexed" ? "Indexed" : "Not indexed"}
      </span>
      <span className="ll-mono text-[9px] text-gray-400" title="Last real Google check — rechecked automatically every 7 days">
        <Clock size={8} className="mr-0.5 inline" />{fmtTs2(idx.checkedAt)}
      </span>
    </span>
  );
}

/* ================= the Index Checker rail section ================= */
export function IndexCheckerTab({ opt, setOpt, accent, log, project, dfs }) {
  const store = opt.indexChecker || {};
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const parsed = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const valid = [], invalid = [];
  [...new Set(parsed)].forEach((l) => {
    try {
      const u = new URL(/^https?:\/\//.test(l) ? l : "https://" + l);
      if (u.hostname.includes(".") && !/\s/.test(u.hostname)) valid.push(l); else invalid.push(l);
    } catch { invalid.push(l); }
  });

  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const { results } = await checkIndexApi(valid.slice(0, 50), dfs);
      setOpt("indexChecker", { results, at: Date.now() });
      log?.(`Index check: ${results.filter((r) => r.indexed).length}/${results.length} indexed`, project.name);
    } catch (e) {
      setErr(e.code === 503
        ? "Not configured — start the API server (npm run api) and add your DataForSEO credentials in Company Settings → API settings. Index statuses are only ever shown from real Google checks."
        : "Check failed: " + e.message);
    } finally { setBusy(false); }
  };

  const results = store.results || [];
  const indexed = results.filter((r) => r.indexed).length;

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <div className="ll-display flex items-center gap-2 text-[15px] font-semibold"><Search size={15} style={{ color: accent }} /> Google index checker</div>
        <div className="text-[11.5px] text-gray-400">
          Paste URLs (one per line, up to 50). Each is verified with a real <span className="ll-mono">site:</span> query on Google via the
          SERP API — a URL counts as indexed only when Google returns that exact URL. No guesses, no demo data.
        </div>
        <Labeled label={`URLs to check (${valid.length} valid${invalid.length ? ` · ${invalid.length} invalid` : ""})`}>
          <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={6}
            placeholder={"https://" + project.website + "/services\nhttps://" + project.website + "/blog/some-post\n…"}
            className={"ll-mono " + inputCls + " resize-y text-[12px]"} />
        </Labeled>
        {invalid.length > 0 && (
          <div className="flex flex-wrap gap-1 text-[10.5px] text-red-500">
            <X size={11} className="mt-0.5" /> Not valid URLs: {invalid.slice(0, 5).join(", ")}{invalid.length > 5 ? "…" : ""}
          </div>
        )}
        <button onClick={run} disabled={busy || !valid.length}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
          {busy ? <><RefreshCw size={12} className="animate-spin" /> Checking {Math.min(valid.length, 50)} URL{valid.length === 1 ? "" : "s"} on Google…</> : <><Search size={12} /> Check indexing</>}
          {!busy && valid.length > 0 && <DfsCostChip requests={Math.min(valid.length, 50)} kind="organic" className="ml-1 border-white/40 bg-white/20 text-white" />}
        </button>
        {err && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-amber-800">{err}</div>}
      </Card>

      {results.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
            <span className="text-[12.5px] font-semibold text-gray-700">Last check — {fmtTs2(store.at)}</span>
            <span className="text-[11px] font-semibold text-emerald-600">✓ {indexed} indexed</span>
            <span className="text-[11px] font-semibold text-red-500">{results.filter((r) => r.indexed === false).length} not indexed</span>
            {results.some((r) => r.status === "error") && <span className="text-[11px] text-amber-600">{results.filter((r) => r.status === "error").length} errored</span>}
          </div>
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-gray-100 text-[9.5px] uppercase tracking-wider text-gray-400">
                <th className="px-4 py-2.5 font-semibold">URL</th>
                <th className="px-2 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Google's canonical match</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/60">
                  <td className="ll-mono max-w-[280px] truncate px-4 py-2 text-[11px] text-gray-700">{r.url}</td>
                  <td className="px-2 py-2">
                    {r.status === "error"
                      ? <span className="rounded-full bg-amber-50 px-1.5 py-px text-[8.5px] font-bold uppercase text-amber-600" title={r.error}>Error</span>
                      : <span className="rounded-full px-1.5 py-px text-[8.5px] font-bold uppercase" style={r.indexed ? { background: "#DCFCE7", color: "#166534" } : { background: "#FEE2E2", color: "#991B1B" }}>{r.indexed ? "Indexed" : "Not indexed"}</span>}
                  </td>
                  <td className="ll-mono max-w-[260px] truncate px-4 py-2 text-[10.5px] text-gray-400">{r.matchedUrl || (r.indexed === false ? "— submit via Search Console" : "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {!results.length && !err && (
        <Card className="p-8 text-center text-[12px] text-gray-400">No checks yet. Pages & Posts in Business Website also get automatic index tags — rechecked every 7 days when the API server is available.</Card>
      )}
    </div>
  );
}
