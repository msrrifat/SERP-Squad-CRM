/* =====================================================================
   LEAD-GEN / COMMISSION BILLING — the maths behind projects that do not
   pay a monthly retainer. Stored on the project:

     project.billing = {
       model: "monthly" | "perLead" | "commission",
       perLead,            // amount the client pays per lead delivered
       commissionPct,      // % of each won sale's value
       payDay,             // day of month the client settles (1–28)
       paymentMethod: { type, details },
       agreement: { id, url, name, type } | null,     // uploaded contract
       leads:    [{ id, date, name, source, value, status, note }],
       payments: [{ id, date, amount, method, note, proof }],
     }

   Per lead: every lead that is not marked invalid is billable.
   Commission: only leads marked won bill, at commissionPct of `value`.
   ===================================================================== */
import { monthKey, monthLabel, monthRange, nextPayDate } from "./affiliate.js";

export const BILLING_MODELS = {
  monthly:    { label: "Monthly retainer",    short: "Monthly",     desc: "A fixed monthly package — the default." },
  perLead:    { label: "Per lead",            short: "Per lead",    desc: "The client pays a fixed amount for every lead delivered." },
  commission: { label: "Commission on sales", short: "Commission",  desc: "The client pays a percentage of the sales value of leads they close." },
};
export const LEAD_STATUS = {
  new:       { label: "New",        bg: "#DBEAFE", fg: "#1D4ED8" },
  qualified: { label: "Qualified",  bg: "#FEF3C7", fg: "#92400E" },
  won:       { label: "Won",        bg: "#DCFCE7", fg: "#166534" },
  lost:      { label: "Lost",       bg: "#F3F4F6", fg: "#6B7280" },
  invalid:   { label: "Invalid",    bg: "#FEE2E2", fg: "#991B1B" },
};
export const PAY_METHODS = { bank: "Bank transfer", paypal: "PayPal", stripe: "Stripe / card", cash: "Cash", cheque: "Cheque", other: "Other" };

export const isLeadGen = (project) => ["perLead", "commission"].includes(project?.billing?.model);

export function leadAmount(billing, lead) {
  const model = billing?.model;
  if (model === "perLead") return lead.status === "invalid" ? 0 : Math.max(0, +billing.perLead || 0);
  if (model === "commission") return lead.status === "won" ? Math.max(0, +lead.value || 0) * (Math.max(0, +billing.commissionPct || 0) / 100) : 0;
  return 0;
}

export function leadgenSummary(project, today = new Date()) {
  const b = project?.billing || {};
  const model = b.model || "monthly";
  const now = monthKey(today);
  const leads = (b.leads || []).map((l) => ({ ...l, amount: leadAmount(b, l), month: String(l.date || "").slice(0, 7) }))
    .sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));
  const payments = (b.payments || []).slice().sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));
  const billable = leads.filter((l) => l.amount > 0);
  const owed = leads.reduce((n, l) => n + l.amount, 0);
  const paid = payments.reduce((n, p) => n + (+p.amount || 0), 0);
  const thisMonth = leads.filter((l) => l.month === now);
  const byMonth = monthRange(addMonthsKey(now, -11), now).map((key) => ({
    key, label: monthLabel(key),
    leads: leads.filter((l) => l.month === key).length,
    amount: leads.filter((l) => l.month === key).reduce((n, l) => n + l.amount, 0),
  }));
  const payDay = Number.isFinite(+b.payDay) && +b.payDay > 0 ? Math.min(28, +b.payDay) : null;
  return {
    model, isLeadGen: model !== "monthly",
    rate: model === "perLead" ? +b.perLead || 0 : model === "commission" ? +b.commissionPct || 0 : 0,
    leads, payments, billable: billable.length, won: leads.filter((l) => l.status === "won").length,
    salesValue: leads.filter((l) => l.status === "won").reduce((n, l) => n + (+l.value || 0), 0),
    owed, paid, balance: owed - paid,
    thisMonth: { leads: thisMonth.length, amount: thisMonth.reduce((n, l) => n + l.amount, 0) },
    byMonth, payDay, nextPay: payDay ? nextPayDate(payDay, today) : null,
    agreement: b.agreement || null, paymentMethod: b.paymentMethod || null,
  };
}
function addMonthsKey(key, n) { const [y, m] = key.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return monthKey(d); }
