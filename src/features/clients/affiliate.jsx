import React, { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { HandCoins, Users, Wallet, TrendingUp, CalendarDays, Plus, Trash2, Gift, CheckCircle2, Clock, BadgeDollarSign } from "lucide-react";
import { Card, Labeled, Toggle, inputCls, askDelete } from "../../ui/primitives.jsx";
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
const Pill = ({ s }) => { const st = STATUS[s] || STATUS.unscheduled; return <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: st.bg, color: st.fg }}>{st.label}</span>; };

/* ---- agency side ------------------------------------------------------- */
export function AffiliateSettings({ draft, set, client, clients = [], currency = "USD", accent = "#0E7C66" }) {
  const a = draft.affiliate || { enabled: false, rate: AFFILIATE_RATE_DEFAULT, referrals: [], payouts: [] };
  const setA = (patch) => set({ affiliate: { enabled: false, rate: AFFILIATE_RATE_DEFAULT, referrals: [], payouts: [], ...a, ...patch } });
  const summary = useMemo(() => affiliateSummary({ ...client, affiliate: a }, clients), [a, client, clients]);
  const referredIds = new Set((a.referrals || []).map((r) => r.clientId));
  /* any other client not already listed can be picked as a referral */
  const candidates = clients.filter((c) => c.id !== client.id && !referredIds.has(c.id));
  const [pick, setPick] = useState("");
  const [pay, setPay] = useState({ date: todayISO(), amount: "", note: "" });

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
    setA({ payouts: [...(a.payouts || []), { id: uid(), date: pay.date || todayISO(), amount, note: pay.note.trim() }] });
    setPay({ date: todayISO(), amount: "", note: "" });
  };
  const removePayout = (p) => setA({ payouts: (a.payouts || []).filter((x) => x.id !== p.id) });
  const byId = (id) => summary.referrals.find((r) => r.id === id);

  return (
    <div className="border-t border-gray-100 pt-4">
      <div className="mb-2 flex items-center gap-2"><HandCoins size={15} className="text-gray-400" /><span className="ll-display text-[14px] font-semibold">Affiliate program</span></div>
      <Toggle on={!!a.enabled} onChange={(v) => setA({ enabled: v })}
        label="This client is an affiliate"
        desc={`They earn ${a.rate ?? AFFILIATE_RATE_DEFAULT}% of every client they refer, for as long as that client stays with you. Turning this on adds an "Affiliate Earnings" screen to their portal.`} />
      {a.enabled && (
        <div className="ll-fade mt-3 space-y-4 rounded-xl border border-gray-200 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Labeled label="Commission rate (%)">
              <input type="number" min="0" max="100" step="0.5" value={a.rate ?? AFFILIATE_RATE_DEFAULT}
                onChange={(e) => setA({ rate: e.target.value === "" ? AFFILIATE_RATE_DEFAULT : Math.max(0, Math.min(100, +e.target.value)) })} className={inputCls} />
            </Labeled>
            <div className="sm:col-span-2 grid grid-cols-3 gap-2">
              {[["Earned to date", summary.totals.earned], ["Paid out", summary.totals.paid], ["Balance due", summary.totals.balance]].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-gray-50 px-3 py-2">
                  <div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">{l}</div>
                  <div className="ll-mono text-[14px] font-bold" style={l === "Balance due" && v > 0 ? { color: accent } : {}}>{fmtMoney(v, currency)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* referrals */}
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
                      <Labeled label="Note">
                        <input value={r.note || ""} onChange={(e) => patchRef(r.id, { note: e.target.value })} placeholder="optional" className={inputCls} />
                      </Labeled>
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

          {/* payouts */}
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Payouts recorded</div>
            {summary.payouts.length > 0 && (
              <div className="mb-2 divide-y divide-gray-50 rounded-lg border border-gray-100">
                {summary.payouts.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-[12px]">
                    <span className="text-gray-500">{fmtDate(p.date)}</span>
                    <span className="ll-mono font-semibold text-gray-800">{fmtMoney(p.amount, currency)}</span>
                    <span className="min-w-0 flex-1 truncate text-gray-400">{p.note}</span>
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
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- client side --------------------------------------------------------- */
export function AffiliateEarningsView({ summary, brand, currency = "USD", accent = "#0E7C66", contactEmail = "" }) {
  const t = summary.totals;
  const kpis = [
    { icon: Wallet, label: "Balance due", value: fmtMoney(t.balance, currency), sub: "earned minus paid out", hi: t.balance > 0 },
    { icon: TrendingUp, label: "This month", value: fmtMoney(t.thisMonth, currency), sub: `${t.active} active referral${t.active === 1 ? "" : "s"}` },
    { icon: BadgeDollarSign, label: "Earned to date", value: fmtMoney(t.earned, currency), sub: `${summary.rate}% of each referral's package` },
    { icon: CheckCircle2, label: "Paid out", value: fmtMoney(t.paid, currency), sub: `${summary.payouts.length} payout${summary.payouts.length === 1 ? "" : "s"}` },
  ];
  return (
    <div className="ll-fade space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="ll-display flex items-center gap-2 text-[18px] font-bold"><HandCoins size={17} style={{ color: accent }} /> Affiliate Earnings</div>
          <div className="text-[12px] text-gray-400">You earn <b>{summary.rate}%</b> of every client you refer to {brand?.name || "us"}, every month, for as long as they stay a client.</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-[11.5px] text-gray-500">
          <div className="flex items-center gap-1.5 font-semibold text-gray-700"><Gift size={13} style={{ color: accent }} /> Know someone who needs SEO?</div>
          <div className="mt-0.5">Introduce them{contactEmail ? <> by email at <a href={`mailto:${contactEmail}`} className="font-semibold hover:underline" style={{ color: accent }}>{contactEmail}</a></> : " through your chat"} — once they sign up, they appear here.</div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400"><k.icon size={13} style={{ color: accent }} /> {k.label}</div>
            <div className="ll-mono mt-1.5 text-[24px] font-bold tracking-tight" style={k.hi ? { color: accent } : {}}>{k.value}</div>
            <div className="text-[11px] text-gray-400">{k.sub}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="p-4 lg:col-span-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[13px] font-semibold text-gray-800">Monthly commission — last 12 months</div>
            <div className="text-[11px] text-gray-400">{fmtMoney(t.activeMonthly, currency)}/mo from active referrals</div>
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.byMonth} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#F3F4F6" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} interval={1} />
                <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => fmtMoney(v, currency).replace(/\.00$/, "")} />
                <Tooltip cursor={{ fill: accent + "10" }} formatter={(v, n, p) => [fmtMoney(v, currency), `${p.payload.referrals} referral${p.payload.referrals === 1 ? "" : "s"}`]}
                  contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #E5E7EB" }} />
                <Bar dataKey="amount" fill={accent} radius={[6, 6, 0, 0]} maxBarSize={34} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4 lg:col-span-2">
          <div className="mb-2 text-[13px] font-semibold text-gray-800">Payout history</div>
          {summary.payouts.length === 0 && <div className="py-6 text-center text-[12px] text-gray-400">No payouts yet. Your balance is paid out by {brand?.name || "the agency"} — ask in chat if you have a question about timing.</div>}
          <div className="divide-y divide-gray-50">
            {summary.payouts.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2 text-[12.5px]">
                <span className="inline-flex items-center gap-1 text-gray-500"><CalendarDays size={12} /> {fmtDate(p.date)}</span>
                <span className="ll-mono ml-auto font-semibold text-gray-800">{fmtMoney(p.amount, currency)}</span>
              </div>
            ))}
          </div>
        </Card>
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
                <th className="px-4 py-2">Your commission</th><th className="px-4 py-2">Months</th><th className="px-4 py-2 text-right">Earned to date</th>
              </tr></thead>
              <tbody>
                {summary.referrals.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="px-4 py-2.5 font-semibold text-gray-800">{r.name}</td>
                    <td className="px-4 py-2.5"><Pill s={r.status} /></td>
                    <td className="px-4 py-2.5 text-gray-500">{fmtDate(r.startDate)}{r.endDate ? <span className="text-gray-400"> → {fmtDate(r.endDate)}</span> : null}</td>
                    <td className="ll-mono px-4 py-2.5">{fmtMoney(r.monthly, currency)}</td>
                    <td className="ll-mono px-4 py-2.5" style={{ color: accent }}>{fmtMoney(r.commission, currency)}/mo</td>
                    <td className="px-4 py-2.5 text-gray-500"><span className="inline-flex items-center gap-1"><Clock size={11} /> {r.monthsActive}</span></td>
                    <td className="ll-mono px-4 py-2.5 text-right font-semibold">{fmtMoney(r.earned, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="text-[11px] text-gray-400">Commission is calculated per calendar month on the referred client's monthly package. Figures update automatically as the agency records packages, end dates and payouts.</div>
    </div>
  );
}
