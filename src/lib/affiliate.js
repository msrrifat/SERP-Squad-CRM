/* =====================================================================
   AFFILIATE PROGRAM — the maths, shared by the agency's client settings
   and the client portal's Affiliate Earnings screen.

   A client who refers another client earns a percentage (default 20%) of
   that client's monthly package for every calendar month the referred
   client stays with the agency. Stored on the REFERRING client:

     client.affiliate = {
       enabled, rate,                       // rate in percent
       referrals: [{ id, clientId, name, monthly, startDate, endDate, note }],
       payouts:   [{ id, date, amount, note }],
     }

   `startDate`/`endDate` are ISO dates; endDate null = still a client.
   Commission accrues per calendar month from the start month through the
   end month (or the current month). `name` is a snapshot so a referral
   still reads correctly if the referred client is later deleted.
   ===================================================================== */

export const AFFILIATE_RATE_DEFAULT = 20;

export const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const monthLabel = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en", { month: "short", year: "numeric" });
};
const keyOfISO = (iso) => (iso ? String(iso).slice(0, 7) : null);
const addMonths = (key, n) => { const [y, m] = key.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return monthKey(d); };

/* every month key from `from` through `to`, inclusive */
export function monthRange(from, to) {
  const out = [];
  if (!from || !to || from > to) return out;
  let k = from;
  while (k <= to && out.length < 600) { out.push(k); k = addMonths(k, 1); }
  return out;
}

export function fmtMoney(n, currency = "USD") {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(n || 0); }
  catch { return `$${(n || 0).toFixed(2)}`; }
}

/* the referring client's full picture as of `today` */
export function affiliateSummary(client, allClients = [], today = new Date()) {
  const a = client?.affiliate || {};
  const rate = Number.isFinite(+a.rate) ? +a.rate : AFFILIATE_RATE_DEFAULT;
  const now = monthKey(today);
  const referrals = (a.referrals || []).map((r) => {
    const referred = allClients.find((c) => c.id === r.clientId) || null;
    const name = referred?.companyName || referred?.name || r.name || "Referred client";
    const monthly = Math.max(0, +r.monthly || 0);
    const commission = monthly * rate / 100;
    const from = keyOfISO(r.startDate);
    const endKey = keyOfISO(r.endDate);
    const to = endKey && endKey < now ? endKey : now;
    const months = from ? monthRange(from, to) : [];
    const status = !from ? "unscheduled" : from > now ? "upcoming" : (endKey && endKey < now) ? "ended" : "active";
    return { ...r, name, monthly, rate, commission, months, status, earned: months.length * commission, monthsActive: months.length,
      thisMonth: months.includes(now) ? commission : 0 };
  });
  const payouts = (a.payouts || []).slice().sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));
  const earned = referrals.reduce((n, r) => n + r.earned, 0);
  const paid = payouts.reduce((n, p) => n + (+p.amount || 0), 0);
  const thisMonth = referrals.reduce((n, r) => n + r.thisMonth, 0);
  const activeMonthly = referrals.filter((r) => r.status === "active").reduce((n, r) => n + r.commission, 0);
  /* last 12 months, oldest first, for the earnings chart */
  const byMonth = monthRange(addMonths(now, -11), now).map((key) => ({
    key, label: monthLabel(key),
    amount: referrals.reduce((n, r) => n + (r.months.includes(key) ? r.commission : 0), 0),
    referrals: referrals.filter((r) => r.months.includes(key)).length,
  }));
  return {
    enabled: !!a.enabled, rate, referrals, payouts,
    totals: { earned, paid, balance: earned - paid, thisMonth, activeMonthly, active: referrals.filter((r) => r.status === "active").length },
    byMonth,
  };
}
