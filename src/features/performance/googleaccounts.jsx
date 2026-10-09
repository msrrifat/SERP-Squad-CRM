/* =====================================================================
   CONNECTED GOOGLE ACCOUNTS — the agency-wide registry behind every
   "Connect Google" button. A Google account goes through Google's consent
   screen ONCE; afterwards any project picks it from this list without
   another sign-in. The server keeps the tokens (server/index.js,
   /api/google/accounts) and already filters by viewer: admins and the
   owner see every account, other team members only the ones they added.
   ===================================================================== */
import React, { useEffect, useState } from "react";
import { CheckCircle2, Link2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { askDisconnect } from "../../ui/primitives.jsx";

const hdrs = () => ({ "Content-Type": "application/json", "x-ss-token": localStorage.getItem("ss_token") || "" });

const SCOPE_LABELS = [
  ["analytics.readonly", "GA4"], ["webmasters.readonly", "Search Console"],
  ["business.manage", "Business Profile"], ["adwords", "Google Ads"],
];
export const scopeBadges = (scopes = []) => SCOPE_LABELS.map(([s, label]) => ({ label, on: scopes.includes(s) }));

export function useGoogleAccounts(enabled = true) {
  const [accounts, setAccounts] = useState(null); // null = loading, [] | {err}
  const [admin, setAdmin] = useState(false);
  const load = async () => {
    try {
      const r = await fetch("/api/google/accounts", { method: "POST", headers: hdrs(), body: "{}" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setAccounts({ err: d.detail || d.error || `HTTP ${r.status}` }); return; }
      setAccounts(d.accounts || []); setAdmin(!!d.admin);
    } catch { setAccounts({ err: "API server unreachable." }); }
  };
  const remove = async (connectionId) => {
    const r = await fetch("/api/google/accounts", { method: "POST", headers: hdrs(), body: JSON.stringify({ action: "remove", connectionId }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { setAccounts(d.accounts || []); return null; }
    return d.detail || d.error || `HTTP ${r.status}`;
  };
  useEffect(() => { if (enabled) load(); }, [enabled]); // eslint-disable-line
  return { accounts, admin, reload: load, remove };
}

/* opens Google's consent popup through the agency OAuth app; resolves with
   { connectionId, email } or null when cancelled */
export function connectGoogleAccount(oauth) {
  return new Promise(async (resolve, reject) => {
    const r = await fetch("/api/oauth/google/start", { method: "POST", headers: hdrs(),
      body: JSON.stringify({ clientId: oauth.clientId, clientSecret: oauth.clientSecret, redirectUri: oauth.redirectUri }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { reject(new Error(d.detail || d.error || `HTTP ${r.status}`)); return; }
    const popup = window.open(d.authUrl, "ss_google_oauth", "width=520,height=640");
    let done = false;
    const finish = (v) => { if (done) return; done = true; window.removeEventListener("message", onMsg); clearInterval(iv); resolve(v); };
    const onMsg = (e) => {
      if (!e.data || !e.data.googleOAuth) return;
      finish(e.data.googleOAuth === "ok" && e.data.connectionId ? { connectionId: e.data.connectionId, email: e.data.email || "" } : null);
    };
    window.addEventListener("message", onMsg);
    const iv = setInterval(() => { if (popup?.closed) finish(null); }, 800);
  });
}

const fmtDate = (t) => (t ? new Date(t).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" }) : "");

/* the list a project chooses from: every account this viewer may use, plus
   "Add a new Google account" */
export function GoogleAccountPicker({ accounts, current = null, accent, busy = false, onPick, onAdd, onCancel = null }) {
  const list = Array.isArray(accounts) ? accounts.filter((a) => a.connectionId !== current) : [];
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          {accounts === null ? "Loading connected accounts…" : list.length ? "Use a connected Google account" : "No Google account connected yet"}
        </span>
        {onCancel && <button onClick={onCancel} className="text-[11px] font-semibold text-gray-400 hover:text-gray-600">Cancel</button>}
      </div>
      {accounts?.err && <div className="mb-2 text-[11px] text-amber-700">{accounts.err}</div>}
      {list.length > 0 && (
        <div className="mb-2 space-y-1.5">
          {list.map((a) => (
            <div key={a.connectionId} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold text-gray-800">{a.email || "Google account"}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-gray-400">
                  {scopeBadges(a.scopes).map((b) => (
                    <span key={b.label} className="rounded-full px-1.5 py-px font-semibold" style={b.on ? { background: "#DCFCE7", color: "#166534" } : { background: "#F3F4F6", color: "#9CA3AF", textDecoration: "line-through" }}>{b.label}</span>
                  ))}
                  <span className="ml-1">{a.addedByName ? `added by ${a.addedByName}` : ""}{a.at ? ` · ${fmtDate(a.at)}` : ""}</span>
                </div>
              </div>
              <button onClick={() => onPick(a)} disabled={busy} className="rounded-lg px-3 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-50" style={{ background: accent }}>Use</button>
            </div>
          ))}
        </div>
      )}
      <button onClick={onAdd} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
        {busy ? <><RefreshCw size={12} className="animate-spin" /> Waiting for Google…</> : <><Plus size={12} /> Add a new Google account</>}
      </button>
      {list.length > 0 && <div className="mt-1.5 text-[10.5px] text-gray-400">Picking an account needs no new sign-in. Adding one opens Google's consent screen once; it is then available to every project.</div>}
    </div>
  );
}

/* Company Settings → API settings: every connected account, with removal */
export function GoogleAccountsAdmin({ company, accent }) {
  const oauth = company.apis?.googleOauth?.values || {};
  const ready = !!(oauth.clientId && oauth.clientSecret && oauth.redirectUri);
  const { accounts, reload, remove } = useGoogleAccounts(ready);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  if (!ready) return null;
  const list = Array.isArray(accounts) ? accounts : [];
  const add = async () => {
    setBusy(true); setErr(null);
    try { if (await connectGoogleAccount(oauth)) await reload(); }
    catch (e) { setErr(String(e?.message || e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="mb-3 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Connected Google accounts</span>
        <span className="rounded-full bg-gray-200 px-1.5 py-px text-[9.5px] font-bold text-gray-600">{list.length}</span>
        <button onClick={add} disabled={busy} className="ml-auto flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-gray-600 hover:border-gray-300 disabled:opacity-50">
          {busy ? <RefreshCw size={11} className="animate-spin" /> : <Plus size={11} />} Add account
        </button>
      </div>
      {accounts?.err && <div className="text-[10.5px] text-amber-700">{accounts.err}</div>}
      {err && <div className="text-[10.5px] text-amber-700">{err}</div>}
      {Array.isArray(accounts) && !list.length && <div className="text-[10.5px] text-gray-400">None yet — connect one here or from any project's Data sources. Each account is then reusable by every project without signing in again.</div>}
      <div className="space-y-1">
        {list.map((a) => (
          <div key={a.connectionId} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
            <CheckCircle2 size={12} className="text-emerald-600" />
            <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-gray-800">{a.email || "Google account"}</span>
            <span className="flex flex-wrap gap-1">
              {scopeBadges(a.scopes).map((b) => (
                <span key={b.label} className="rounded-full px-1.5 py-px text-[9px] font-semibold" style={b.on ? { background: "#DCFCE7", color: "#166534" } : { background: "#F3F4F6", color: "#9CA3AF", textDecoration: "line-through" }}>{b.label}</span>
              ))}
            </span>
            <span className="text-[10px] text-gray-400">{a.addedByName ? `by ${a.addedByName}` : ""}{a.at ? ` · ${fmtDate(a.at)}` : ""}</span>
            <button title="Remove this Google account — projects using it lose their live Google data until another account is picked"
              onClick={async () => { if (await askDisconnect(`${a.email || "this Google account"} from every project`)) { const e = await remove(a.connectionId); if (e) setErr(e); } }}
              className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 size={12} /></button>
          </div>
        ))}
      </div>
      {list.some((a) => scopeBadges(a.scopes).some((b) => !b.on)) && (
        <div className="mt-1.5 text-[10px] text-gray-400"><Link2 size={10} className="mr-0.5 inline" /> A struck-out permission means the account was connected before that scope existed — add it again (same email) to refresh it; projects keep working.</div>
      )}
    </div>
  );
}
