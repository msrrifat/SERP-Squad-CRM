import React, { useMemo, useState } from "react";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { HandCoins, Users, Wallet, TrendingUp, CalendarDays, Plus, Trash2, Gift, CheckCircle2, Clock, BadgeDollarSign, CreditCard, Pencil, Paperclip, FileText, X, Download, UserPlus, Globe, MapPin, Mail, Phone, LayoutDashboard, Sparkles } from "lucide-react";
import { Card, Labeled, Toggle, Modal, inputCls, askDelete, shrinkImage } from "../../ui/primitives.jsx";
import { AFFILIATE_RATE_DEFAULT, affiliateSummary, fmtMoney } from "../../lib/affiliate.js";
import { todayISO, uid } from "../../lib/format.jsx";

/* =====================================================================
   AFFILIATE PROGRAM — two faces of one record (see lib/affiliate.js):
     AffiliateSettings      the agency side, inside Client settings
     AffiliateEarningsView  the client side, "Affiliate Earnings" in the portal
   ===================================================================== */

const fmtDate = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" }) : "—");
const STATUS = {
  active:      { label: "Active",      bg: "#DCFCE7", fg: "#166534" },
  ended:       { label: "Ended",       bg: "#F3F4F6", fg: "#6B7280" },
  upcoming:    { label: "Starts soon", bg: "#DBEAFE", fg: "#1D4ED8" },
  unscheduled: { label: "No start date", bg: "#FEF3C7", fg: "#92400E" },
};
/* ---- payment proofs: uploaded to /api/files, fetched with the session token
   (a plain <img src> cannot send it), shown in a lightbox ---------------- */
const tokenHeaders = () => ({ "X-SS-Token": localStorage.getItem("ss_token") || "" });
async function uploadProof(file, clientId) {
  const isImg = /^image\//.test(file.type);
  const dataUrl = isImg
    ? await shrinkImage(file, 1600, "image/jpeg", 0.85)
    : await new Promise((res, rej) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result)); rd.onerror = () => rej(new Error("unreadable")); rd.readAsDataURL(file); });
  const r = await fetch("/api/files", { method: "POST", headers: { "Content-Type": "application/json", ...tokenHeaders() }, body: JSON.stringify({ dataUrl, name: file.name, clientId }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.detail || `Upload failed (HTTP ${r.status})`);
  return { id: d.id, url: d.url, name: d.name, type: d.type, size: d.size };
}
/* blob URL for a protected file, released when the component goes away */
function useProofUrl(proof, active) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState(null);
  React.useEffect(() => {
    if (!active || !proof?.url) return undefined;
    let obj = null, dead = false;
    fetch(proof.url, { headers: tokenHeaders() }).then(async (r) => {
      if (!r.ok) throw new Error(r.status === 403 ? "You don't have access to this file." : `Could not load the file (HTTP ${r.status}).`);
      obj = URL.createObjectURL(await r.blob());
      if (!dead) setUrl(obj);
    }).catch((e) => { if (!dead) setErr(String(e.message || e)); });
    return () => { dead = true; if (obj) URL.revokeObjectURL(obj); };
  }, [proof?.url, active]);
  return { url, err };
}
export function ProofViewer({ proof, onClose }) {
  const { url, err } = useProofUrl(proof, true);
  const isPdf = proof.type === "application/pdf";
  return (
    <Modal title="Payment proof" sub={proof.name} onClose={onClose} wide>
      {err && <div className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-700">{err}</div>}
      {!err && !url && <div className="py-10 text-center text-[12px] text-gray-400">Loading…</div>}
      {url && (isPdf
        ? <iframe title={proof.name} src={url} className="h-[70vh] w-full rounded-xl border border-gray-200" />
        : <img src={url} alt={proof.name} className="mx-auto max-h-[70vh] rounded-xl border border-gray-200 object-contain" />)}
      {url && <a href={url} download={proof.name} className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-600 hover:underline"><Download size={13} /> Download</a>}
    </Modal>
  );
}
export function ProofLink({ proof, onRemove = null, accent = "#0E7C66" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} title={proof.name}
        className="inline-flex max-w-[200px] items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold hover:bg-gray-50"
        style={{ borderColor: accent + "55", color: accent }}>
        {proof.type === "application/pdf" ? <FileText size={11} /> : <Paperclip size={11} />} <span className="truncate">View proof</span>
      </button>
      {onRemove && <button onClick={onRemove} title="Remove attachment" className="rounded p-0.5 text-gray-300 hover:text-red-500"><X size={12} /></button>}
      {open && <ProofViewer proof={proof} onClose={() => setOpen(false)} />}
    </>
  );
}
export function AttachProof({ clientId, onDone, accent = "#0E7C66", label = "Attach proof" }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const pick = async (e) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setBusy(true); setErr(null);
    try { onDone(await uploadProof(file, clientId)); } catch (x) { setErr(String(x.message || x)); }
    setBusy(false);
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <label className={"inline-flex cursor-pointer items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-[11px] font-semibold " + (busy ? "opacity-50" : "hover:bg-gray-50")} style={{ borderColor: accent + "66", color: accent }}>
        <Paperclip size={11} /> {busy ? "Uploading…" : label}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" onChange={pick} disabled={busy} className="hidden" />
      </label>
      {err && <span className="text-[10.5px] text-red-600">{err}</span>}
    </span>
  );
}

const Pill = ({ s }) => { const st = STATUS[s] || STATUS.unscheduled; return <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: st.bg, color: st.fg }}>{st.label}</span>; };

/* ---- agency side ------------------------------------------------------- */
export function AffiliateSettings({ draft, set, client, clients = [], currency = "USD", accent = "#0E7C66", section = "all" }) {
  const a = draft.affiliate || { enabled: false, rate: AFFILIATE_RATE_DEFAULT, referrals: [], payouts: [] };
  const setA = (patch) => set({ affiliate: { enabled: false, rate: AFFILIATE_RATE_DEFAULT, referrals: [], payouts: [], ...a, ...patch } });
  const summary = useMemo(() => affiliateSummary({ ...client, affiliate: a }, clients), [a, client, clients]);
  const referredIds = new Set((a.referrals || []).map((r) => r.clientId));
  /* any other client not already listed can be picked as a referral */
  const candidates = clients.filter((c) => c.id !== client.id && !referredIds.has(c.id));
  const [pick, setPick] = useState("");
  const [pay, setPay] = useState({ date: todayISO(), amount: "", note: "", proof: null });

  const addReferral = () => {
    const c = clients.find((x) => x.id === pick);
    if (!c) return;
    setA({ referrals: [...(a.referrals || []), { id: uid(), clientId: c.id, name: c.companyName || c.name, monthly: 0, startDate: todayISO(), endDate: null, note: "" }] });
    setPick("");
  };
  const patchRef = (id, p) => setA({ referrals: (a.referrals || []).map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const removeRef = async (r) => {
    if (!(await askDelete(`the referral of ${r.name}`))) return;
    setA({ referrals: (a.referrals || []).filter((x) => x.id !== r.id) });
  };
  const addPayout = () => {
    const amount = +pay.amount;
    if (!(amount > 0)) return;
    setA({ payouts: [...(a.payouts || []), { id: uid(), date: pay.date || todayISO(), amount, note: pay.note.trim(), proof: pay.proof || null }] });
    setPay({ date: todayISO(), amount: "", note: "", proof: null });
  };
  const removePayout = (p) => setA({ payouts: (a.payouts || []).filter((x) => x.id !== p.id) });
  const patchPayout = (id, patch) => setA({ payouts: (a.payouts || []).map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const byId = (id) => summary.referrals.find((r) => r.id === id);
  /* `section` lets the Company dashboard show one part at a time (its own
     tabs); "all" is the full panel inside Client settings */
  const all = section === "all";
  const show = (k) => all || section === k;
  const totals = (
    <div className={"grid grid-cols-3 gap-2" + (all ? " sm:col-span-2" : "")}>
      {[["Earned to date", summary.totals.earned], ["Paid out", summary.totals.paid], ["Balance due", summary.totals.balance]].map(([l, v]) => (
        <div key={l} className="rounded-lg bg-gray-50 px-3 py-2">
          <div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">{l}</div>
          <div className="ll-mono text-[14px] font-bold" style={l === "Balance due" && v > 0 ? { color: accent } : {}}>{fmtMoney(v, currency)}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div className={all ? "border-t border-gray-100 pt-4" : ""}>
      {all && (<>
        <div className="mb-2 flex items-center gap-2"><HandCoins size={15} className="text-gray-400" /><span className="ll-display text-[14px] font-semibold">Affiliate program</span></div>
        <Toggle on={!!a.enabled} onChange={(v) => setA({ enabled: v })}
          label="This client is an affiliate"
          desc={`They earn ${a.rate ?? AFFILIATE_RATE_DEFAULT}% of every client they refer, for as long as that client stays with you. Turning this on adds an "Affiliate Earnings" screen to their portal.`} />
      </>)}
      {(a.enabled || !all) && (
        <div className={all ? "ll-fade mt-3 space-y-4 rounded-xl border border-gray-200 p-4" : "space-y-4"}>
          {show("settings") && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Labeled label="Commission rate (%)">
                <input type="number" min="0" max="100" step="0.5" value={a.rate ?? AFFILIATE_RATE_DEFAULT}
                  onChange={(e) => setA({ rate: e.target.value === "" ? AFFILIATE_RATE_DEFAULT : Math.max(0, Math.min(100, +e.target.value)) })} className={inputCls} />
              </Labeled>
              {all && totals}
            </div>
          )}
          {show("overview") && !all && totals}
          {show("overview") && (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-[11.5px]" style={{ background: a.payout?.paypalEmail ? "#EFF6FF" : "#FFFBEB", color: a.payout?.paypalEmail ? "#1E40AF" : "#92400E" }}>
              <CreditCard size={13} />
              {a.payout?.paypalEmail
                ? <span>Pays out to <b>PayPal</b> · {a.payout.paypalEmail}{a.payout.name ? ` (${a.payout.name})` : ""}</span>
                : <span>No payment details yet — the client adds their PayPal account on their Affiliate Earnings screen.</span>}
            </div>
          )}
          {section === "settings" && (
            <div className="rounded-lg border border-gray-100 p-3">
              <Toggle on={!!a.enabled} onChange={(v) => setA({ enabled: v })} label="Affiliate program active"
                desc="Turning this off hides the Affiliate Earnings screen from the client's portal. Referrals and payouts are kept." />
            </div>
          )}

          {/* referrals */}
          {show("referrals") && (
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Clients they referred</div>
            {(a.referrals || []).length === 0 && <div className="rounded-lg border border-dashed border-gray-200 p-3 text-center text-[11.5px] text-gray-400">No referrals yet — pick a client below.</div>}
            <div className="space-y-2">
              {(a.referrals || []).map((r) => {
                const s = byId(r.id);
                return (
                  <div key={r.id} className="rounded-lg border border-gray-100 p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-semibold text-gray-800">{s?.name || r.name}</span>
                      {s && <Pill s={s.status} />}
                      {s && <span className="ll-mono text-[11px] text-gray-500">{fmtMoney(s.commission, currency)}/mo · {s.monthsActive} month{s.monthsActive === 1 ? "" : "s"} · earned {fmtMoney(s.earned, currency)}</span>}
                      <button onClick={() => removeRef(r)} title="Remove referral" className="ml-auto rounded-md p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"><Trash2 size={13} /></button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-4">
                      <Labeled label={`Monthly package (${currency})`}>
                        <input type="number" min="0" step="1" value={r.monthly ?? ""} onChange={(e) => patchRef(r.id, { monthly: e.target.value === "" ? 0 : Math.max(0, +e.target.value) })} className={inputCls} />
                      </Labeled>
                      <Labeled label="Client since">
                        <input type="date" value={r.startDate || ""} onChange={(e) => patchRef(r.id, { startDate: e.target.value || null })} className={inputCls} />
                      </Labeled>
                      <Labeled label="Ended on (blank = still a client)">
                        <input type="date" value={r.endDate || ""} onChange={(e) => patchRef(r.id, { endDate: e.target.value || null })} className={inputCls} />
                      </Labeled>
                      <Labeled label="Payment day (1–28)">
                        <input type="number" min="1" max="28" value={r.payDay ?? ""} onChange={(e) => patchRef(r.id, { payDay: e.target.value === "" ? null : Math.max(1, Math.min(28, +e.target.value)) })} placeholder="e.g. 5" className={inputCls} />
                      </Labeled>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-4">
                      <div className="sm:col-span-3">
                        <Labeled label="Note">
                          <input value={r.note || ""} onChange={(e) => patchRef(r.id, { note: e.target.value })} placeholder="optional" className={inputCls} />
                        </Labeled>
                      </div>
                      <div className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
                        <div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Next payment</div>
                        {s?.nextPay ? <span className="font-semibold text-gray-800">{fmtDate(s.nextPay)}</span> : <span>set a payment day</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex gap-2">
              <select value={pick} onChange={(e) => setPick(e.target.value)} className={inputCls + " bg-white"}>
                <option value="">Add a referred client…</option>
                {candidates.map((c) => <option key={c.id} value={c.id}>{c.companyName || c.name}{c.companyName && c.companyName !== c.name ? ` (${c.name})` : ""}</option>)}
              </select>
              <button onClick={addReferral} disabled={!pick} className="flex shrink-0 items-center gap-1 rounded-lg px-3 text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}><Plus size={13} /> Add</button>
            </div>
            <p className="mt-1.5 text-[10.5px] text-gray-400">Commission accrues for every calendar month between "client since" and "ended on" (or today), at the rate above on the monthly package.</p>
          </div>
          )}

          {/* payouts */}
          {show("payouts") && (
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Payouts recorded</div>
            {summary.payouts.length > 0 && (
              <div className="mb-2 divide-y divide-gray-50 rounded-lg border border-gray-100">
                {summary.payouts.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-[12px]">
                    <span className="text-gray-500">{fmtDate(p.date)}</span>
                    <span className="ll-mono font-semibold text-gray-800">{fmtMoney(p.amount, currency)}</span>
                    <span className="min-w-0 flex-1 truncate text-gray-400">{p.note}</span>
                    {p.proof
                      ? <ProofLink proof={p.proof} accent={accent} onRemove={() => patchPayout(p.id, { proof: null })} />
                      : <AttachProof clientId={client.id} accent={accent} onDone={(proof) => patchPayout(p.id, { proof })} />}
                    <button onClick={() => removePayout(p)} title="Remove payout" className="rounded-md p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-[150px_140px_1fr_auto]">
              <input type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} className={inputCls} />
              <input type="number" min="0" step="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} placeholder={`Amount (${currency})`} className={inputCls} />
              <input value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} placeholder="Note (bank transfer, invoice #…)" className={inputCls} />
              <button onClick={addPayout} disabled={!(+pay.amount > 0)} className="rounded-lg border px-3 text-[12px] font-semibold disabled:opacity-40" style={{ borderColor: accent, color: accent }}>Record payout</button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
              {pay.proof
                ? <><ProofLink proof={pay.proof} accent={accent} onRemove={() => setPay({ ...pay, proof: null })} /><span>attached — it will be saved with this payout and visible to the client.</span></>
                : <><AttachProof clientId={client.id} accent={accent} label="Attach payment proof (screenshot or PDF)" onDone={(proof) => setPay({ ...pay, proof })} /><span>optional — the client sees it in their payout history.</span></>}
            </div>
          </div>
          )}

          {/* what the client plans to bring in — theirs to edit, yours to read */}
          {show("prospects") && (!all || (a.prospects || []).length > 0) && (
            <div>
              {all && <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Prospects they listed ({(a.prospects || []).length})</div>}
              <ProspectsView prospects={a.prospects || []} accent={accent} readOnly={all} onChange={(list) => setA({ prospects: list })} />
              <p className="mt-1.5 text-[10.5px] text-gray-400">When one of them signs, add them as a referred client above so commission starts.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- prospects: people the affiliate intends to refer ------------------- */
export const PROSPECT_STATUS = {
  new:       { label: "New lead",        bg: "#DBEAFE", fg: "#1D4ED8" },
  contacted: { label: "Introduced",      bg: "#FEF3C7", fg: "#92400E" },
  signed:    { label: "Became a client", bg: "#DCFCE7", fg: "#166534" },
  lost:      { label: "Not interested",  bg: "#F3F4F6", fg: "#6B7280" },
};
const SPill = ({ s }) => { const st = PROSPECT_STATUS[s] || PROSPECT_STATUS.new; return <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: st.bg, color: st.fg }}>{st.label}</span>; };
const hostOf = (url) => String(url || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
const hrefOf = (url) => (/^https?:\/\//i.test(url || "") ? url : "https://" + url);
const EMPTY_PROSPECT = { name: "", business: "", website: "", area: "", email: "", phone: "", notes: "", status: "new" };

function ProspectForm({ initial, onSave, onClose, accent }) {
  const [d, setD] = useState({ ...EMPTY_PROSPECT, ...(initial || {}) });
  const f = (k) => ({ value: d[k] || "", onChange: (e) => setD({ ...d, [k]: e.target.value }), className: inputCls });
  const valid = d.name.trim() || d.business.trim();
  return (
    <Modal title={initial?.id ? "Edit prospect" : "Add a prospect"} sub="Someone you plan to introduce — the agency sees this list and can follow up with you." onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="Prospect name"><input {...f("name")} placeholder="Jane Smith" /></Labeled>
        <Labeled label="Business name"><input {...f("business")} placeholder="Smith Plumbing" /></Labeled>
        <Labeled label="Website"><input {...f("website")} placeholder="smithplumbing.com" /></Labeled>
        <Labeled label="Service area"><input {...f("area")} placeholder="Toronto, ON" /></Labeled>
        <Labeled label="Email"><input type="email" {...f("email")} placeholder="jane@smithplumbing.com" /></Labeled>
        <Labeled label="Phone"><input {...f("phone")} placeholder="+1 416 555 0100" /></Labeled>
        <Labeled label="Status">
          <select value={d.status || "new"} onChange={(e) => setD({ ...d, status: e.target.value })} className={inputCls + " bg-white"}>
            {Object.entries(PROSPECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Labeled>
        <div className="sm:col-span-2">
          <Labeled label="Notes"><textarea rows={4} {...f("notes")} placeholder="What they need, best time to call, who introduced you…" className={inputCls + " resize-y"} /></Labeled>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-gray-200 px-3.5 py-2 text-[12px] font-semibold text-gray-500">Cancel</button>
        <button onClick={() => valid && onSave({ ...d, name: d.name.trim(), business: d.business.trim(), website: d.website.trim(), area: d.area.trim(), email: d.email.trim(), phone: d.phone.trim(), notes: d.notes.trim() })}
          disabled={!valid} className="rounded-lg px-3.5 py-2 text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>{initial?.id ? "Save changes" : "Add prospect"}</button>
      </div>
    </Modal>
  );
}

export function ProspectsView({ prospects = [], onChange, accent = "#0E7C66", readOnly = false }) {
  const [editing, setEditing] = useState(null);   // null | "new" | prospect
  const [filter, setFilter] = useState("all");
  const counts = Object.fromEntries(Object.keys(PROSPECT_STATUS).map((k) => [k, prospects.filter((p) => (p.status || "new") === k).length]));
  const list = prospects.filter((p) => filter === "all" || (p.status || "new") === filter)
    .slice().sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  const save = (d) => {
    const now = Date.now();
    if (editing === "new") onChange([{ ...d, id: uid(), createdAt: now, updatedAt: now }, ...prospects]);
    else onChange(prospects.map((p) => (p.id === editing.id ? { ...p, ...d, updatedAt: now } : p)));
    setEditing(null);
  };
  const remove = async (p) => { if (await askDelete(`the prospect "${p.business || p.name}"`)) onChange(prospects.filter((x) => x.id !== p.id)); };
  const setStatus = (p, status) => onChange(prospects.map((x) => (x.id === p.id ? { ...x, status, updatedAt: Date.now() } : x)));
  return (
    <div className="ll-fade space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {Object.entries(PROSPECT_STATUS).map(([k, v]) => (
          <button key={k} onClick={() => setFilter(filter === k ? "all" : k)}
            className="rounded-2xl border p-3.5 text-left transition-shadow hover:shadow-sm"
            style={{ background: `linear-gradient(135deg, ${v.bg} 0%, #ffffff 75%)`, borderColor: filter === k ? v.fg : v.bg }}>
            <div className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: v.fg }}>{v.label}</div>
            <div className="ll-mono mt-1 text-[24px] font-bold" style={{ color: v.fg }}>{counts[k]}</div>
          </button>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-800"><Sparkles size={14} style={{ color: accent }} /> Your prospects
            <span className="text-[11px] font-normal text-gray-400">{filter === "all" ? `${prospects.length} total` : `${list.length} · ${PROSPECT_STATUS[filter].label}`}</span>
            {filter !== "all" && <button onClick={() => setFilter("all")} className="text-[11px] font-semibold hover:underline" style={{ color: accent }}>Show all</button>}
          </div>
          {!readOnly && <button onClick={() => setEditing("new")} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white" style={{ background: accent }}><UserPlus size={13} /> Add prospect</button>}
        </div>
        {list.length === 0 ? (
          <div className="p-10 text-center text-[12.5px] text-gray-400">
            {prospects.length === 0 ? (readOnly ? "The client has not listed any prospects yet." : "No prospects yet. Add the businesses you'd like to introduce — every one that signs up earns you commission.") : "Nothing in this status."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-gray-100 text-left text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">
                <th className="px-4 py-2">Prospect</th><th className="px-4 py-2">Business</th><th className="px-4 py-2">Website</th><th className="px-4 py-2">Service area</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Notes</th>{!readOnly && <th className="px-2 py-2" />}
              </tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 align-top hover:bg-gray-50/60">
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-gray-800">{p.name || "—"}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-gray-400">
                        {p.email && <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1 hover:underline"><Mail size={10} /> {p.email}</a>}
                        {p.phone && <span className="inline-flex items-center gap-1"><Phone size={10} /> {p.phone}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-gray-700">{p.business || "—"}</td>
                    <td className="px-4 py-2.5">{p.website ? <a href={hrefOf(p.website)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline" style={{ color: accent }}><Globe size={11} /> {hostOf(p.website)}</a> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-2.5 text-gray-600">{p.area ? <span className="inline-flex items-center gap-1"><MapPin size={11} className="text-gray-400" /> {p.area}</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-2.5">
                      {readOnly ? <SPill s={p.status} /> : (
                        <select value={p.status || "new"} onChange={(e) => setStatus(p, e.target.value)}
                          className="rounded-full border-0 px-2 py-0.5 text-[10.5px] font-bold"
                          style={{ background: (PROSPECT_STATUS[p.status] || PROSPECT_STATUS.new).bg, color: (PROSPECT_STATUS[p.status] || PROSPECT_STATUS.new).fg }}>
                          {Object.entries(PROSPECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="max-w-[260px] px-4 py-2.5 text-[12px] text-gray-500"><div className="line-clamp-2" title={p.notes}>{p.notes || <span className="text-gray-300">—</span>}</div></td>
                    {!readOnly && (
                      <td className="px-2 py-2.5 whitespace-nowrap">
                        <button onClick={() => setEditing(p)} title="Edit" className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Pencil size={13} /></button>
                        <button onClick={() => remove(p)} title="Delete" className="rounded-md p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"><Trash2 size={13} /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && <ProspectForm initial={editing === "new" ? null : editing} onSave={save} onClose={() => setEditing(null)} accent={accent} />}
    </div>
  );
}

/* ---- client side --------------------------------------------------------- */
const TONES = {
  balance: { fg: "#0F766E", bg: "#CCFBF1", ring: "#99F6E4" },
  month:   { fg: "#1D4ED8", bg: "#DBEAFE", ring: "#BFDBFE" },
  earned:  { fg: "#6D28D9", bg: "#EDE9FE", ring: "#DDD6FE" },
  paid:    { fg: "#15803D", bg: "#DCFCE7", ring: "#BBF7D0" },
};

function PayoutDetailsCard({ payout, onSave, accent }) {
  const [editing, setEditing] = useState(!payout?.paypalEmail);
  const [draft, setDraft] = useState({ paypalEmail: payout?.paypalEmail || "", name: payout?.name || "" });
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.paypalEmail.trim());
  const save = () => { if (!valid) return; onSave({ method: "paypal", paypalEmail: draft.paypalEmail.trim(), name: draft.name.trim() }); setEditing(false); };
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-800"><CreditCard size={14} style={{ color: accent }} /> Payment details</div>
        {!editing && onSave && <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-[11px] font-semibold hover:underline" style={{ color: accent }}><Pencil size={11} /> Edit</button>}
      </div>
      {!editing ? (
        <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-3.5 py-3">
          <span className="ll-display rounded-lg bg-[#003087] px-2 py-1 text-[11px] font-black italic text-white">Pay<span className="text-[#009CDE]">Pal</span></span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-gray-800">{payout.paypalEmail}</div>
            <div className="text-[11px] text-gray-500">{payout.name ? `${payout.name} · ` : ""}Your commission is sent here.</div>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="text-[11.5px] text-gray-500">Where should we send your commission? PayPal only for now.</div>
          <Labeled label="PayPal email">
            <input type="email" value={draft.paypalEmail} onChange={(e) => setDraft({ ...draft, paypalEmail: e.target.value })} placeholder="you@example.com" className={inputCls} />
          </Labeled>
          <Labeled label="Account holder name (optional)">
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name on the PayPal account" className={inputCls} />
          </Labeled>
          <div className="flex gap-2">
            <button onClick={save} disabled={!valid || !onSave} className="rounded-lg px-3.5 py-2 text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>Save PayPal details</button>
            {payout?.paypalEmail && <button onClick={() => { setEditing(false); setDraft({ paypalEmail: payout.paypalEmail, name: payout.name || "" }); }} className="rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-semibold text-gray-500">Cancel</button>}
          </div>
        </div>
      )}
    </Card>
  );
}

export function AffiliateEarningsView({ summary, brand, currency = "USD", accent = "#0E7C66", contactEmail = "", payout = null, onSavePayout = null, prospects = [], onSaveProspects = null }) {
  const [tab, setTab] = useState("dashboard");
  const t = summary.totals;
  const nowKey = summary.byMonth[summary.byMonth.length - 1]?.key;
  const kpis = [
    { key: "balance", icon: Wallet, label: "Balance due", value: fmtMoney(t.balance, currency), sub: t.nextPayout ? `next payout ${fmtDate(t.nextPayout)}` : "earned minus paid out" },
    { key: "month", icon: TrendingUp, label: "This month", value: fmtMoney(t.thisMonth, currency), sub: `${t.active} active referral${t.active === 1 ? "" : "s"}` },
    { key: "earned", icon: BadgeDollarSign, label: "Earned to date", value: fmtMoney(t.earned, currency), sub: `${summary.rate}% of each referral's package` },
    { key: "paid", icon: CheckCircle2, label: "Paid out", value: fmtMoney(t.paid, currency), sub: `${summary.payouts.length} payout${summary.payouts.length === 1 ? "" : "s"}` },
  ];
  const tabs = [["dashboard", "Affiliate dashboard", LayoutDashboard], ["prospects", `Prospects${prospects.length ? ` (${prospects.length})` : ""}`, UserPlus]];
  return (
    <div className="ll-fade space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="ll-display flex items-center gap-2 text-[18px] font-bold"><HandCoins size={17} style={{ color: accent }} /> Affiliate Earnings</div>
          <div className="text-[12px] text-gray-400">You earn <b style={{ color: accent }}>{summary.rate}%</b> of every client you refer to {brand?.name || "us"}, every month, for as long as they stay a client.</div>
          <div className="mt-3 inline-flex rounded-xl border border-gray-200 bg-white p-1">
            {tabs.map(([k, label, Icon]) => (
              <button key={k} onClick={() => setTab(k)}
                className={"flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold " + (tab === k ? "text-white shadow-sm" : "text-gray-500 hover:text-gray-800")}
                style={tab === k ? { background: accent } : {}}>
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl border px-3.5 py-2.5 text-[11.5px]" style={{ borderColor: accent + "33", background: accent + "0D", color: "#374151" }}>
          <div className="flex items-center gap-1.5 font-semibold text-gray-800"><Gift size={13} style={{ color: accent }} /> Know someone who needs SEO or a website?</div>
          <div className="mt-0.5">Introduce them{contactEmail ? <> by email at <a href={`mailto:${contactEmail}`} className="font-semibold hover:underline" style={{ color: accent }}>{contactEmail}</a></> : " through your chat"} — once they sign up, they appear here.</div>
        </div>
      </div>

      {tab === "prospects" && <ProspectsView prospects={prospects} onChange={onSaveProspects || (() => {})} accent={accent} readOnly={!onSaveProspects} />}
      {tab === "dashboard" && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => { const tone = TONES[k.key]; return (
          <div key={k.label} className="rounded-2xl border p-4" style={{ background: `linear-gradient(135deg, ${tone.bg} 0%, #ffffff 70%)`, borderColor: tone.ring }}>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: tone.fg }}>
              <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ background: tone.bg, color: tone.fg }}><k.icon size={13} /></span> {k.label}
            </div>
            <div className="ll-mono mt-2 text-[26px] font-bold tracking-tight" style={{ color: tone.fg }}>{k.value}</div>
            <div className="text-[11px] text-gray-500">{k.sub}</div>
          </div>
        ); })}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="p-4 lg:col-span-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[13px] font-semibold text-gray-800">Monthly commission — last 12 months</div>
            <div className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: TONES.month.bg, color: TONES.month.fg }}>{fmtMoney(t.activeMonthly, currency)}/mo from active referrals</div>
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.byMonth} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="affBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={TONES.earned.fg} /><stop offset="100%" stopColor={TONES.month.fg} /></linearGradient>
                  <linearGradient id="affBarNow" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={TONES.balance.fg} /><stop offset="100%" stopColor="#14B8A6" /></linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#F3F4F6" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} interval={1} />
                <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => fmtMoney(v, currency).replace(/\.00$/, "")} />
                <Tooltip cursor={{ fill: TONES.month.bg + "80" }} formatter={(v, n, p) => [fmtMoney(v, currency), `${p.payload.referrals} referral${p.payload.referrals === 1 ? "" : "s"}`]}
                  contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #E5E7EB" }} />
                <Bar dataKey="amount" radius={[6, 6, 0, 0]} maxBarSize={34}>
                  {summary.byMonth.map((m) => <Cell key={m.key} fill={m.key === nowKey ? "url(#affBarNow)" : "url(#affBar)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <div className="space-y-4 lg:col-span-2">
          <PayoutDetailsCard payout={payout} onSave={onSavePayout} accent={accent} />
          <Card className="p-4">
            <div className="mb-2 text-[13px] font-semibold text-gray-800">Payout history</div>
            {summary.payouts.length === 0 && <div className="py-4 text-center text-[12px] text-gray-400">No payouts yet. Your balance is paid out by {brand?.name || "the agency"} — ask in chat if you have a question about timing.</div>}
            <div className="divide-y divide-gray-50">
              {summary.payouts.map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-2 text-[12.5px]">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: TONES.paid.bg, color: TONES.paid.fg }}><CheckCircle2 size={12} /></span>
                  <span className="inline-flex items-center gap-1 text-gray-500"><CalendarDays size={12} /> {fmtDate(p.date)}</span>
                  {p.proof && <ProofLink proof={p.proof} accent={accent} />}
                  <span className="ll-mono ml-auto font-bold" style={{ color: TONES.paid.fg }}>+{fmtMoney(p.amount, currency)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 text-[13px] font-semibold text-gray-800"><Users size={14} style={{ color: accent }} /> Your referrals</div>
        {summary.referrals.length === 0 ? (
          <div className="p-8 text-center text-[12.5px] text-gray-400">No referrals recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-gray-100 text-left text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">
                <th className="px-4 py-2">Client</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Client since</th><th className="px-4 py-2">Monthly package</th>
                <th className="px-4 py-2">Your commission</th><th className="px-4 py-2">Months</th><th className="px-4 py-2">Pays on</th><th className="px-4 py-2 text-right">Earned to date</th>
              </tr></thead>
              <tbody>
                {summary.referrals.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-2.5 font-semibold text-gray-800">{r.name}</td>
                    <td className="px-4 py-2.5"><Pill s={r.status} /></td>
                    <td className="px-4 py-2.5 text-gray-500">{fmtDate(r.startDate)}{r.endDate ? <span className="text-gray-400"> → {fmtDate(r.endDate)}</span> : null}</td>
                    <td className="ll-mono px-4 py-2.5 font-semibold text-gray-700">{fmtMoney(r.monthly, currency)}</td>
                    <td className="px-4 py-2.5"><span className="ll-mono rounded-md px-1.5 py-0.5 font-bold" style={{ background: TONES.month.bg, color: TONES.month.fg }}>{fmtMoney(r.commission, currency)}/mo</span></td>
                    <td className="px-4 py-2.5 text-gray-500"><span className="inline-flex items-center gap-1"><Clock size={11} /> {r.monthsActive}</span></td>
                    <td className="px-4 py-2.5 text-gray-600">{r.payDay ? <span title={r.nextPay ? `Next: ${fmtDate(r.nextPay)}` : ""}>Day {r.payDay}{r.nextPay ? <span className="text-gray-400"> · next {fmtDate(r.nextPay)}</span> : null}</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="ll-mono px-4 py-2.5 text-right font-bold" style={{ color: TONES.earned.fg }}>{fmtMoney(r.earned, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="text-[11px] text-gray-400">Commission is calculated per calendar month on the referred client's monthly package. "Pays on" is the day each referred client settles with the agency — your commission for that client is paid out on the same day. Figures update automatically as the agency records packages, end dates and payouts.</div>
      </>}
    </div>
  );
}
