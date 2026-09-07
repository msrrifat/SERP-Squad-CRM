import React, { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Receipt, Percent, Users, Wallet, CalendarDays, Plus, Trash2, FileText, CreditCard, TrendingUp, Pencil } from "lucide-react";
import { Card, Labeled, Modal, inputCls, askDelete } from "../../ui/primitives.jsx";
import { BILLING_MODELS, LEAD_STATUS, PAY_METHODS, leadgenSummary } from "../../lib/leadgen.js";
import { fmtMoney } from "../../lib/affiliate.js";
import { AttachProof, ProofLink } from "../clients/affiliate.jsx";
import { todayISO, uid } from "../../lib/format.jsx";

/* =====================================================================
   LEAD-GEN BILLING — per-lead or commission projects (see lib/leadgen.js).
     LeadGenBillingSetup   model, rates, payment day, payment method,
                           agreement — lives in Project settings → Billing
     LeadGenPanel          setup + lead log + payments + summary — opened
                           from Company dashboard → Lead gen clients
   ===================================================================== */

const fmtDate = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" }) : "—");
const LPill = ({ s }) => { const st = LEAD_STATUS[s] || LEAD_STATUS.new; return <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: st.bg, color: st.fg }}>{st.label}</span>; };
export const BILLING_COLORS = { monthly: { bg: "#F3F4F6", fg: "#4B5563" }, perLead: { bg: "#DBEAFE", fg: "#1D4ED8" }, commission: { bg: "#EDE9FE", fg: "#6D28D9" } };
export const ModelPill = ({ model }) => { const c = BILLING_COLORS[model] || BILLING_COLORS.monthly; return <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: c.bg, color: c.fg }}>{BILLING_MODELS[model]?.short || "Monthly"}</span>; };

export function LeadGenBillingSetup({ project, client, onUpdate, accent = "#0E7C66", currency = "USD" }) {
  const b = project.billing || {};
  const setB = (patch) => onUpdate({ billing: { model: "monthly", leads: [], payments: [], ...b, ...patch } });
  const pm = b.paymentMethod || { type: "bank", details: "" };
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">How this project pays</div>
        <div className="grid gap-2 sm:grid-cols-3">
          {Object.entries(BILLING_MODELS).map(([k, m]) => {
            const on = (b.model || "monthly") === k; const c = BILLING_COLORS[k];
            return (
              <button key={k} onClick={() => setB({ model: k })} className="rounded-xl border p-3 text-left" style={on ? { borderColor: c.fg, background: c.bg } : { borderColor: "#E5E7EB" }}>
                <div className="text-[12.5px] font-semibold" style={on ? { color: c.fg } : { color: "#1F2937" }}>{m.label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-gray-500">{m.desc}</div>
              </button>
            );
          })}
        </div>
      </div>
      {(b.model === "perLead" || b.model === "commission") && (
        <div className="ll-fade grid gap-3 sm:grid-cols-3">
          {b.model === "perLead" ? (
            <Labeled label={`Price per lead (${currency})`}>
              <input type="number" min="0" step="1" value={b.perLead ?? ""} onChange={(e) => setB({ perLead: e.target.value === "" ? 0 : Math.max(0, +e.target.value) })} className={inputCls} />
            </Labeled>
          ) : (
            <Labeled label="Commission on won sales (%)">
              <input type="number" min="0" max="100" step="0.5" value={b.commissionPct ?? ""} onChange={(e) => setB({ commissionPct: e.target.value === "" ? 0 : Math.max(0, Math.min(100, +e.target.value)) })} className={inputCls} />
            </Labeled>
          )}
          <Labeled label="Client pays on day (1–28)">
            <input type="number" min="1" max="28" value={b.payDay ?? ""} onChange={(e) => setB({ payDay: e.target.value === "" ? null : Math.max(1, Math.min(28, +e.target.value)) })} placeholder="e.g. 1" className={inputCls} />
          </Labeled>
          <Labeled label="Payment method">
            <select value={pm.type || "bank"} onChange={(e) => setB({ paymentMethod: { ...pm, type: e.target.value } })} className={inputCls + " bg-white"}>
              {Object.entries(PAY_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Labeled>
          <div className="sm:col-span-3">
            <Labeled label="Payment details (account, PayPal email, invoicing notes…)">
              <input value={pm.details || ""} onChange={(e) => setB({ paymentMethod: { ...pm, details: e.target.value } })} placeholder="e.g. Invoiced on the 1st, paid by bank transfer within 7 days" className={inputCls} />
            </Labeled>
          </div>
          <div className="sm:col-span-3 flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[11.5px] text-gray-600">
            <FileText size={13} className="text-gray-400" /> <span className="font-semibold">Agreement</span>
            {b.agreement
              ? <><ProofLink proof={b.agreement} accent={accent} onRemove={() => setB({ agreement: null })} /><span className="text-gray-400">{b.agreement.name}</span></>
              : <><AttachProof clientId={client?.id} accent={accent} label="Upload signed agreement (PDF or image)" onDone={(f) => setB({ agreement: f })} /><span className="text-gray-400">kept on file for this project</span></>}
          </div>
        </div>
      )}
    </div>
  );
}

const EMPTY_LEAD = { date: todayISO(), name: "", source: "", value: "", status: "new", note: "" };
function LeadForm({ initial, model, currency, onSave, onClose, accent }) {
  const [d, setD] = useState({ ...EMPTY_LEAD, ...(initial || {}), value: initial?.value ?? "" });
  const f = (k) => ({ value: d[k] ?? "", onChange: (e) => setD({ ...d, [k]: e.target.value }), className: inputCls });
  return (
    <Modal title={initial?.id ? "Edit lead" : "Log a lead"} sub={model === "commission" ? "Set the sale value and mark it Won when it closes — commission is calculated from that." : "Every lead that is not Invalid bills at the per-lead price."} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="Date"><input type="date" {...f("date")} /></Labeled>
        <Labeled label="Lead (name / job)"><input {...f("name")} placeholder="Jane — kitchen renovation quote" /></Labeled>
        <Labeled label="Source"><input {...f("source")} placeholder="Google Ads · GBP call · Website form" /></Labeled>
        <Labeled label="Status">
          <select value={d.status || "new"} onChange={(e) => setD({ ...d, status: e.target.value })} className={inputCls + " bg-white"}>
            {Object.entries(LEAD_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Labeled>
        <Labeled label={`Sale value (${currency})${model === "commission" ? "" : " — optional"}`}><input type="number" min="0" step="1" {...f("value")} placeholder="0" /></Labeled>
        <div className="sm:col-span-2"><Labeled label="Note"><input {...f("note")} placeholder="optional" /></Labeled></div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-gray-200 px-3.5 py-2 text-[12px] font-semibold text-gray-500">Cancel</button>
        <button onClick={() => onSave({ ...d, name: d.name.trim(), source: d.source.trim(), note: d.note.trim(), value: d.value === "" ? 0 : Math.max(0, +d.value) })}
          disabled={!d.date} className="rounded-lg px-3.5 py-2 text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>{initial?.id ? "Save" : "Add lead"}</button>
      </div>
    </Modal>
  );
}

export function LeadGenPanel({ client, project, onUpdate, accent = "#0E7C66", currency = "USD", autoLogLead = false, section = "all" }) {
  const b = project.billing || {};
  const s = useMemo(() => leadgenSummary(project), [project]);
  const setB = (patch) => onUpdate({ billing: { model: "monthly", leads: [], payments: [], ...b, ...patch } });
  const [editLead, setEditLead] = useState(autoLogLead ? "new" : null);   // null | "new" | lead
  const [pay, setPay] = useState({ date: todayISO(), amount: "", method: b.paymentMethod?.type || "bank", note: "", proof: null });
  const [setup, setSetup] = useState(!s.isLeadGen);
  const all = section === "all";
  const show = (k) => all || section === k;
  const saveLead = (d) => {
    const now = Date.now();
    if (editLead === "new") setB({ leads: [{ ...d, id: uid(), createdAt: now }, ...(b.leads || [])] });
    else setB({ leads: (b.leads || []).map((l) => (l.id === editLead.id ? { ...l, ...d, updatedAt: now } : l)) });
    setEditLead(null);
  };
  const removeLead = async (l) => { if (await askDelete(`the lead "${l.name || l.date}"`)) setB({ leads: (b.leads || []).filter((x) => x.id !== l.id) }); };
  const setLeadStatus = (l, status) => setB({ leads: (b.leads || []).map((x) => (x.id === l.id ? { ...x, status } : x)) });
  const addPayment = () => {
    const amount = +pay.amount; if (!(amount > 0)) return;
    setB({ payments: [...(b.payments || []), { id: uid(), date: pay.date || todayISO(), amount, method: pay.method, note: pay.note.trim(), proof: pay.proof || null }] });
    setPay({ date: todayISO(), amount: "", method: pay.method, note: "", proof: null });
  };
  const patchPayment = (id, patch) => setB({ payments: (b.payments || []).map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const removePayment = async (p) => { if (await askDelete(`the payment of ${fmtMoney(p.amount, currency)}`)) setB({ payments: (b.payments || []).filter((x) => x.id !== p.id) }); };
  const kpis = [
    { icon: Wallet, label: "Balance due", value: fmtMoney(s.balance, currency), tone: { fg: "#0F766E", bg: "#CCFBF1" }, sub: s.nextPay ? `client pays ${fmtDate(s.nextPay)}` : "owed minus received" },
    { icon: TrendingUp, label: "This month", value: fmtMoney(s.thisMonth.amount, currency), tone: { fg: "#1D4ED8", bg: "#DBEAFE" }, sub: `${s.thisMonth.leads} lead${s.thisMonth.leads === 1 ? "" : "s"}` },
    { icon: Receipt, label: "Billed to date", value: fmtMoney(s.owed, currency), tone: { fg: "#6D28D9", bg: "#EDE9FE" }, sub: s.model === "commission" ? `${s.won} won · ${fmtMoney(s.salesValue, currency)} in sales` : `${s.billable} billable lead${s.billable === 1 ? "" : "s"}` },
    { icon: CreditCard, label: "Received", value: fmtMoney(s.paid, currency), tone: { fg: "#15803D", bg: "#DCFCE7" }, sub: `${s.payments.length} payment${s.payments.length === 1 ? "" : "s"}` },
  ];
  const summaryLine = s.isLeadGen && (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-gray-600">
      <ModelPill model={s.model} />
      <span className="ll-mono font-semibold text-gray-800">{s.model === "perLead" ? `${fmtMoney(s.rate, currency)} per lead` : `${s.rate}% of won sales`}</span>
      <span className="inline-flex items-center gap-1"><CreditCard size={12} className="text-gray-400" /> {s.paymentMethod?.type ? (PAY_METHODS[s.paymentMethod.type] || s.paymentMethod.type) : "no payment method"}</span>
      <span className="inline-flex items-center gap-1"><CalendarDays size={12} className="text-gray-400" /> {s.nextPay ? `client pays ${fmtDate(s.nextPay)}` : "no payment day"}</span>
      <span className="inline-flex items-center gap-1"><FileText size={12} className="text-gray-400" /> {s.agreement ? <ProofLink proof={s.agreement} accent={accent} /> : <span className="text-amber-700">no agreement uploaded</span>}</span>
    </div>
  );
  return (
    <div className="space-y-4">
      {all && (
        <div className="flex flex-wrap items-center gap-2">
          {summaryLine}
          <button onClick={() => setSetup((v) => !v)} className="ml-auto flex items-center gap-1 text-[11.5px] font-semibold hover:underline" style={{ color: accent }}><Pencil size={11} /> {setup ? "Hide billing setup" : "Edit billing setup"}</button>
        </div>
      )}
      {(all ? setup : show("setup")) && <div className={all ? "rounded-xl border border-gray-200 p-4" : ""}><LeadGenBillingSetup project={project} client={client} onUpdate={onUpdate} accent={accent} currency={currency} /></div>}
      {s.isLeadGen && show("overview") && (
        <>
          {!all && summaryLine}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-xl border border-gray-200 bg-white p-3.5" style={{ borderLeft: `3px solid ${k.tone.fg}` }}>
                <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-gray-500"><k.icon size={12} style={{ color: k.tone.fg }} /> {k.label}</div>
                <div className="ll-mono mt-1 text-[22px] font-bold" style={{ color: k.tone.fg }}>{k.value}</div>
                <div className="text-[11px] text-gray-500">{k.sub}</div>
              </div>
            ))}
          </div>
          <Card className="p-4">
            <div className="mb-2 text-[13px] font-semibold text-gray-800">Billed per month — last 12 months</div>
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={s.byMonth} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#F3F4F6" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} interval={1} />
                  <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => fmtMoney(v, currency).replace(/\.00$/, "")} />
                  <Tooltip formatter={(v, n, p) => [fmtMoney(v, currency), `${p.payload.leads} lead${p.payload.leads === 1 ? "" : "s"}`]} contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #E5E7EB" }} />
                  <Bar dataKey="amount" fill={accent} radius={[6, 6, 0, 0]} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}
      {s.isLeadGen && show("leads") && (
        <>
          {/* leads */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-800"><Users size={14} style={{ color: accent }} /> Leads <span className="text-[11px] font-normal text-gray-400">{s.leads.length} logged</span></div>
              <button onClick={() => setEditLead("new")} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white" style={{ background: accent }}><Plus size={13} /> Log lead</button>
            </div>
            {s.leads.length === 0 ? <div className="p-8 text-center text-[12.5px] text-gray-400">No leads logged yet.</div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead><tr className="border-b border-gray-100 text-left text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">
                    <th className="px-4 py-2">Date</th><th className="px-4 py-2">Lead</th><th className="px-4 py-2">Source</th><th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Sale value</th><th className="px-4 py-2 text-right">Bills</th><th className="px-2 py-2" />
                  </tr></thead>
                  <tbody>
                    {s.leads.map((l) => (
                      <tr key={l.id} className="border-b border-gray-50 align-top hover:bg-gray-50/60">
                        <td className="whitespace-nowrap px-4 py-2 text-gray-500">{fmtDate(l.date)}</td>
                        <td className="px-4 py-2"><div className="font-medium text-gray-800">{l.name || "—"}</div>{l.note && <div className="text-[11px] text-gray-400">{l.note}</div>}</td>
                        <td className="px-4 py-2 text-gray-500">{l.source || "—"}</td>
                        <td className="px-4 py-2">
                          <select value={l.status || "new"} onChange={(e) => setLeadStatus(l, e.target.value)} className="rounded-full border-0 px-2 py-0.5 text-[10.5px] font-bold"
                            style={{ background: (LEAD_STATUS[l.status] || LEAD_STATUS.new).bg, color: (LEAD_STATUS[l.status] || LEAD_STATUS.new).fg }}>
                            {Object.entries(LEAD_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        </td>
                        <td className="ll-mono px-4 py-2 text-gray-600">{l.value ? fmtMoney(l.value, currency) : "—"}</td>
                        <td className="ll-mono px-4 py-2 text-right font-bold" style={{ color: l.amount > 0 ? "#6D28D9" : "#9CA3AF" }}>{fmtMoney(l.amount, currency)}</td>
                        <td className="whitespace-nowrap px-2 py-2">
                          <button onClick={() => setEditLead(l)} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Pencil size={12} /></button>
                          <button onClick={() => removeLead(l)} className="rounded-md p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"><Trash2 size={12} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
      {s.isLeadGen && show("payments") && (
        <>
          {/* payments */}
          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-gray-800"><CreditCard size={14} style={{ color: accent }} /> Payments received</div>
            {s.payments.length > 0 && (
              <div className="mb-3 divide-y divide-gray-50 rounded-lg border border-gray-100">
                {s.payments.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-[12px]">
                    <span className="inline-flex items-center gap-1 text-gray-500"><CalendarDays size={12} /> {fmtDate(p.date)}</span>
                    <span className="ll-mono font-bold text-green-700">+{fmtMoney(p.amount, currency)}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">{PAY_METHODS[p.method] || p.method || "—"}</span>
                    <span className="min-w-0 flex-1 truncate text-gray-400">{p.note}</span>
                    {p.proof ? <ProofLink proof={p.proof} accent={accent} onRemove={() => patchPayment(p.id, { proof: null })} /> : <AttachProof clientId={client?.id} accent={accent} label="Attach receipt" onDone={(proof) => patchPayment(p.id, { proof })} />}
                    <button onClick={() => removePayment(p)} className="rounded-md p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-[150px_130px_150px_1fr_auto]">
              <input type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} className={inputCls} />
              <input type="number" min="0" step="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} placeholder={`Amount (${currency})`} className={inputCls} />
              <select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} className={inputCls + " bg-white"}>{Object.entries(PAY_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} placeholder="Note (invoice #, period…)" className={inputCls} />
              <button onClick={addPayment} disabled={!(+pay.amount > 0)} className="rounded-lg border px-3 text-[12px] font-semibold disabled:opacity-40" style={{ borderColor: accent, color: accent }}>Record payment</button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
              {pay.proof ? <><ProofLink proof={pay.proof} accent={accent} onRemove={() => setPay({ ...pay, proof: null })} /><span>receipt attached to this payment</span></>
                : <AttachProof clientId={client?.id} accent={accent} label="Attach receipt (screenshot or PDF)" onDone={(proof) => setPay({ ...pay, proof })} />}
            </div>
          </Card>
        </>
      )}
      {editLead && <LeadForm initial={editLead === "new" ? null : editLead} model={s.model} currency={currency} onSave={saveLead} onClose={() => setEditLead(null)} accent={accent} />}
    </div>
  );
}
