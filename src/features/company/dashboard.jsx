import React, { useMemo, useState } from "react";
import { HandCoins, Users, Wallet, CalendarDays, Receipt, Sparkles, Building2, ChevronRight, LayoutDashboard, Plus, TrendingUp, FileText, Search, UserPlus } from "lucide-react";
import { Card, Modal, inputCls } from "../../ui/primitives.jsx";
import { affiliateSummary, fmtMoney } from "../../lib/affiliate.js";
import { leadgenSummary, isLeadGen, BILLING_MODELS, PAY_METHODS } from "../../lib/leadgen.js";
import { AffiliateSettings, ProspectsView, PROSPECT_STATUS } from "../clients/affiliate.jsx";
import { LeadGenPanel, ModelPill } from "./leadgen.jsx";

/* =====================================================================
   COMPANY DASHBOARD — the agency's money view, three tabs:
     Affiliate partners   who refers clients, what they have earned, when
                          they get paid; enrol new partners
     Pipeline             every prospect every partner has listed
     Lead gen clients     projects billed per lead or on commission:
                          leads, billing, payments, agreements
   Everything here edits the same records Client/Project settings use.
   ===================================================================== */

const fmtDate = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" }) : "—");
const KPI = ({ icon: Icon, label, value, sub, tone }) => (
  <div className="rounded-2xl border p-4" style={{ background: `linear-gradient(135deg, ${tone.bg} 0%, #fff 70%)`, borderColor: tone.bg }}>
    <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: tone.fg }}><Icon size={12} /> {label}</div>
    <div className="ll-mono mt-1.5 text-[24px] font-bold tracking-tight" style={{ color: tone.fg }}>{value}</div>
    {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
  </div>
);
/* a searchable list to pick one client or project from — replaces the
   cramped select + button pair that wrapped badly on narrow screens */
function PickerModal({ title, sub, items, onPick, onClose, accent, placeholder = "Search…", empty = "Nothing to pick." }) {
  const [q, setQ] = useState("");
  const list = items.filter((it) => !q.trim() || `${it.label} ${it.sub || ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Modal title={title} sub={sub} onClose={onClose}>
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className={inputCls + " pl-9"} />
      </div>
      <div className="max-h-[50vh] divide-y divide-gray-50 overflow-y-auto rounded-xl border border-gray-100">
        {list.length === 0 && <div className="p-6 text-center text-[12px] text-gray-400">{items.length ? "No match." : empty}</div>}
        {list.map((it) => (
          <button key={it.key} onClick={() => onPick(it.key)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-gray-50">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold text-white" style={{ background: it.color || accent }}>{(it.label || "?").slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-gray-800">{it.label}</span>
              {it.sub && <span className="block truncate text-[11px] text-gray-400">{it.sub}</span>}
            </span>
            <ChevronRight size={14} className="text-gray-300" />
          </button>
        ))}
      </div>
    </Modal>
  );
}
const KPI_GRID = "grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-5";
const T = { teal: { fg: "#0F766E", bg: "#CCFBF1" }, blue: { fg: "#1D4ED8", bg: "#DBEAFE" }, violet: { fg: "#6D28D9", bg: "#EDE9FE" }, green: { fg: "#15803D", bg: "#DCFCE7" }, amber: { fg: "#92400E", bg: "#FEF3C7" } };

/* ---- affiliate partners ---------------------------------------------- */
function PartnersTab({ clients, updateClient, currency, accent }) {
  const partners = useMemo(() => clients.filter((c) => c.affiliate?.enabled).map((c) => ({ client: c, s: affiliateSummary(c, clients) })), [clients]);
  const [openId, setOpenId] = useState(null);
  const [picking, setPicking] = useState(false);
  const candidates = clients.filter((c) => !c.affiliate?.enabled);
  const tot = partners.reduce((n, p) => ({ earned: n.earned + p.s.totals.earned, paid: n.paid + p.s.totals.paid, balance: n.balance + p.s.totals.balance, month: n.month + p.s.totals.thisMonth, active: n.active + p.s.totals.active }), { earned: 0, paid: 0, balance: 0, month: 0, active: 0 });
  const nextPayouts = partners.filter((p) => p.s.totals.nextPayout).sort((a, b) => a.s.totals.nextPayout.localeCompare(b.s.totals.nextPayout)).slice(0, 5);
  const enrol = (id) => { updateClient(id, (c) => ({ affiliate: { enabled: true, rate: 20, referrals: [], payouts: [], ...(c.affiliate || {}), enabled: true } })); setPicking(false); setOpenId(id); };
  const open = openId ? clients.find((c) => c.id === openId) : null;
  return (
    <div className="space-y-4">
      <div className={KPI_GRID}>
        <KPI icon={Users} label="Partners" value={partners.length} sub={`${tot.active} active referral${tot.active === 1 ? "" : "s"}`} tone={T.blue} />
        <KPI icon={TrendingUp} label="Commission this month" value={fmtMoney(tot.month, currency)} tone={T.violet} />
        <KPI icon={Receipt} label="Earned to date" value={fmtMoney(tot.earned, currency)} tone={T.teal} />
        <KPI icon={HandCoins} label="Paid out" value={fmtMoney(tot.paid, currency)} tone={T.green} />
        <KPI icon={Wallet} label="Owed to partners" value={fmtMoney(tot.balance, currency)} sub={nextPayouts[0] ? `next payout ${fmtDate(nextPayouts[0].s.totals.nextPayout)}` : "no payment days set"} tone={T.amber} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-800"><HandCoins size={14} style={{ color: accent }} /> Affiliate partners</div>
            <button onClick={() => setPicking(true)} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm" style={{ background: accent }}><UserPlus size={13} /> Enrol partner</button>
          </div>
          {partners.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-[12.5px] text-gray-400">No affiliate partners yet. Enrolled clients get an "Affiliate Earnings" screen in their portal.</div>
              <button onClick={() => setPicking(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-white" style={{ background: accent }}><UserPlus size={13} /> Enrol your first partner</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead><tr className="border-b border-gray-100 text-left text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">
                  <th className="px-4 py-2">Partner</th><th className="px-4 py-2">Referrals</th><th className="px-4 py-2">Per month</th><th className="px-4 py-2">Earned</th><th className="px-4 py-2">Paid</th><th className="px-4 py-2">Balance</th><th className="px-4 py-2">Next payout</th><th className="px-4 py-2">PayPal</th><th className="px-2 py-2" />
                </tr></thead>
                <tbody>
                  {partners.map(({ client: c, s }) => (
                    <tr key={c.id} onClick={() => setOpenId(c.id)} className="cursor-pointer border-b border-gray-50 hover:bg-gray-50/70">
                      <td className="px-4 py-2.5"><div className="font-semibold text-gray-800">{c.companyName || c.name}</div><div className="text-[11px] text-gray-400">{c.contact} · {s.rate}%</div></td>
                      <td className="px-4 py-2.5 text-gray-600">{s.totals.active} active <span className="text-gray-400">/ {s.referrals.length}</span></td>
                      <td className="ll-mono px-4 py-2.5" style={{ color: T.blue.fg }}>{fmtMoney(s.totals.activeMonthly, currency)}</td>
                      <td className="ll-mono px-4 py-2.5" style={{ color: T.violet.fg }}>{fmtMoney(s.totals.earned, currency)}</td>
                      <td className="ll-mono px-4 py-2.5" style={{ color: T.green.fg }}>{fmtMoney(s.totals.paid, currency)}</td>
                      <td className="ll-mono px-4 py-2.5 font-bold" style={{ color: s.totals.balance > 0 ? T.amber.fg : "#6B7280" }}>{fmtMoney(s.totals.balance, currency)}</td>
                      <td className="px-4 py-2.5 text-gray-600">{s.totals.nextPayout ? fmtDate(s.totals.nextPayout) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-2.5">{c.affiliate?.payout?.paypalEmail ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">set</span> : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">missing</span>}</td>
                      <td className="px-2 py-2.5 text-gray-300"><ChevronRight size={14} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-gray-800"><CalendarDays size={14} style={{ color: accent }} /> Upcoming payouts</div>
          {nextPayouts.length === 0 && <div className="py-6 text-center text-[12px] text-gray-400">Set a payment day on each referral (partner → referral row) to see the schedule here.</div>}
          <div className="divide-y divide-gray-50">
            {nextPayouts.map((p) => (
              <div key={p.client.id} className="flex items-center gap-3 py-2 text-[12.5px]">
                <div className="min-w-0 flex-1"><div className="truncate font-semibold text-gray-800">{p.client.companyName || p.client.name}</div><div className="text-[11px] text-gray-400">{fmtDate(p.s.totals.nextPayout)}</div></div>
                <span className="ll-mono font-bold" style={{ color: T.amber.fg }}>{fmtMoney(p.s.totals.balance, currency)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      {picking && (
        <PickerModal title="Enrol a client as affiliate partner" sub="They earn commission on every client they refer; the rate and referrals are set next." accent={accent}
          placeholder="Search clients…" empty="Every client is already a partner."
          items={candidates.map((c) => ({ key: c.id, label: c.companyName || c.name, sub: [c.contact, `${(c.projects || []).length} project${(c.projects || []).length === 1 ? "" : "s"}`].filter(Boolean).join(" · "), color: c.projects?.[0]?.accent }))}
          onPick={enrol} onClose={() => setPicking(false)} />
      )}
      {open && (
        <Modal title={`Affiliate partner — ${open.companyName || open.name}`} sub="Referrals, packages, payment days and payouts. Changes save automatically." onClose={() => setOpenId(null)} wide>
          <AffiliateSettings draft={{ affiliate: open.affiliate }} set={(patch) => updateClient(open.id, patch)} client={open} clients={clients} currency={currency} accent={accent} />
        </Modal>
      )}
    </div>
  );
}

/* ---- pipeline: every partner's prospects ------------------------------ */
function PipelineTab({ clients, updateClient, accent }) {
  const rows = useMemo(() => clients.filter((c) => c.affiliate?.enabled).flatMap((c) => (c.affiliate.prospects || []).map((p) => ({ ...p, partnerId: c.id, partner: c.companyName || c.name }))), [clients]);
  const [filter, setFilter] = useState("all");
  const counts = Object.fromEntries(Object.keys(PROSPECT_STATUS).map((k) => [k, rows.filter((p) => (p.status || "new") === k).length]));
  const list = rows.filter((p) => filter === "all" || (p.status || "new") === filter).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const setStatus = (p, status) => updateClient(p.partnerId, (c) => ({ affiliate: { ...(c.affiliate || {}), prospects: (c.affiliate?.prospects || []).map((x) => (x.id === p.id ? { ...x, status, updatedAt: Date.now() } : x)) } }));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {Object.entries(PROSPECT_STATUS).map(([k, v]) => (
          <button key={k} onClick={() => setFilter(filter === k ? "all" : k)} className="rounded-2xl border p-3.5 text-left" style={{ background: `linear-gradient(135deg, ${v.bg} 0%, #fff 75%)`, borderColor: filter === k ? v.fg : v.bg }}>
            <div className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: v.fg }}>{v.label}</div>
            <div className="ll-mono mt-1 text-[24px] font-bold" style={{ color: v.fg }}>{counts[k]}</div>
          </button>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 text-[13px] font-semibold text-gray-800"><Sparkles size={14} style={{ color: accent }} /> Referral pipeline <span className="text-[11px] font-normal text-gray-400">{list.length} prospect{list.length === 1 ? "" : "s"}{filter !== "all" ? ` · ${PROSPECT_STATUS[filter].label}` : ""}</span>
          {filter !== "all" && <button onClick={() => setFilter("all")} className="text-[11px] font-semibold hover:underline" style={{ color: accent }}>Show all</button>}</div>
        {list.length === 0 ? <div className="p-10 text-center text-[12.5px] text-gray-400">Nothing here yet — partners add prospects from their Affiliate Earnings → Prospects tab.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-gray-100 text-left text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">
                <th className="px-4 py-2">Prospect</th><th className="px-4 py-2">Business</th><th className="px-4 py-2">Website</th><th className="px-4 py-2">Area</th><th className="px-4 py-2">Referred by</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Notes</th>
              </tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.partnerId + p.id} className="border-b border-gray-50 align-top hover:bg-gray-50/60">
                    <td className="px-4 py-2.5"><div className="font-semibold text-gray-800">{p.name || "—"}</div><div className="text-[11px] text-gray-400">{[p.email, p.phone].filter(Boolean).join(" · ")}</div></td>
                    <td className="px-4 py-2.5 text-gray-700">{p.business || "—"}</td>
                    <td className="px-4 py-2.5">{p.website ? <a href={/^https?:/.test(p.website) ? p.website : "https://" + p.website} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: accent }}>{p.website.replace(/^https?:\/\//, "")}</a> : "—"}</td>
                    <td className="px-4 py-2.5 text-gray-600">{p.area || "—"}</td>
                    <td className="px-4 py-2.5 text-gray-600">{p.partner}</td>
                    <td className="px-4 py-2.5">
                      <select value={p.status || "new"} onChange={(e) => setStatus(p, e.target.value)} className="rounded-full border-0 px-2 py-0.5 text-[10.5px] font-bold"
                        style={{ background: (PROSPECT_STATUS[p.status] || PROSPECT_STATUS.new).bg, color: (PROSPECT_STATUS[p.status] || PROSPECT_STATUS.new).fg }}>
                        {Object.entries(PROSPECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </td>
                    <td className="max-w-[260px] px-4 py-2.5 text-[12px] text-gray-500"><div className="line-clamp-2" title={p.notes}>{p.notes || "—"}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---- lead gen clients -------------------------------------------------- */
function LeadGenTab({ clients, updateProject, currency, accent }) {
  const all = useMemo(() => clients.flatMap((c) => (c.projects || []).map((p) => ({ client: c, project: p }))), [clients]);
  const rows = useMemo(() => all.filter(({ project }) => isLeadGen(project)).map((x) => ({ ...x, s: leadgenSummary(x.project) })), [all]);
  const [openKey, setOpenKey] = useState(null);   // "clientId|projectId"
  const [picking, setPicking] = useState(false);
  const [autoLead, setAutoLead] = useState(false); // open the panel straight into "Log lead"
  const tot = rows.reduce((n, r) => ({ owed: n.owed + r.s.owed, paid: n.paid + r.s.paid, balance: n.balance + r.s.balance, month: n.month + r.s.thisMonth.amount, leads: n.leads + r.s.thisMonth.leads }), { owed: 0, paid: 0, balance: 0, month: 0, leads: 0 });
  const open = openKey ? all.find((x) => x.client.id + "|" + x.project.id === openKey) : null;
  const setup = (key) => { const [cid, pid] = key.split("|"); updateProject(cid, pid, (p) => ({ billing: { model: "perLead", leads: [], payments: [], ...(p.billing || {}), model: p.billing?.model && p.billing.model !== "monthly" ? p.billing.model : "perLead" } })); setPicking(false); setAutoLead(false); setOpenKey(key); };
  const openRow = (key, withLead = false) => { setAutoLead(withLead); setOpenKey(key); };
  return (
    <div className="space-y-4">
      <div className={KPI_GRID}>
        <KPI icon={Building2} label="Lead-gen projects" value={rows.length} sub={`${rows.filter((r) => r.s.model === "perLead").length} per lead · ${rows.filter((r) => r.s.model === "commission").length} commission`} tone={T.blue} />
        <KPI icon={TrendingUp} label="Billed this month" value={fmtMoney(tot.month, currency)} sub={`${tot.leads} lead${tot.leads === 1 ? "" : "s"}`} tone={T.violet} />
        <KPI icon={Receipt} label="Billed to date" value={fmtMoney(tot.owed, currency)} tone={T.teal} />
        <KPI icon={HandCoins} label="Received" value={fmtMoney(tot.paid, currency)} tone={T.green} />
        <KPI icon={Wallet} label="Outstanding" value={fmtMoney(tot.balance, currency)} tone={T.amber} />
      </div>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-800"><Receipt size={14} style={{ color: accent }} /> Lead gen clients</div>
          <button onClick={() => setPicking(true)} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm" style={{ background: accent }}><Plus size={13} /> Add lead-gen client</button>
        </div>
        {rows.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-[12.5px] text-gray-400">No lead-gen clients yet. Pick a project to bill per lead or on commission — or set it from Project settings → Billing.</div>
            <button onClick={() => setPicking(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-white" style={{ background: accent }}><Plus size={13} /> Add your first lead-gen client</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-gray-100 text-left text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">
                <th className="px-4 py-2">Project</th><th className="px-3 py-2">Model · rate</th><th className="px-3 py-2">This month</th><th className="hidden px-3 py-2 md:table-cell">Billed</th><th className="hidden px-3 py-2 md:table-cell">Received</th><th className="px-3 py-2">Balance</th><th className="hidden px-3 py-2 lg:table-cell">Pays on</th><th className="hidden px-3 py-2 xl:table-cell">Method</th><th className="hidden px-3 py-2 lg:table-cell">Agreement</th><th className="px-2 py-2" />
              </tr></thead>
              <tbody>
                {rows.map(({ client, project, s }) => {
                  const key = client.id + "|" + project.id;
                  return (
                  <tr key={project.id} onClick={() => openRow(key)} className="cursor-pointer border-b border-gray-50 hover:bg-gray-50/70">
                    <td className="px-4 py-2.5"><div className="font-semibold text-gray-800">{project.name}</div><div className="text-[11px] text-gray-400">{client.companyName || client.name}</div></td>
                    <td className="px-3 py-2.5"><ModelPill model={s.model} /><div className="ll-mono mt-0.5 text-[11px] text-gray-600">{s.model === "perLead" ? `${fmtMoney(s.rate, currency)}/lead` : `${s.rate}% of sales`}</div></td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-gray-600"><span className="ll-mono font-semibold" style={{ color: T.blue.fg }}>{fmtMoney(s.thisMonth.amount, currency)}</span><div className="text-[11px] text-gray-400">{s.thisMonth.leads} lead{s.thisMonth.leads === 1 ? "" : "s"}</div></td>
                    <td className="ll-mono hidden px-3 py-2.5 md:table-cell" style={{ color: T.violet.fg }}>{fmtMoney(s.owed, currency)}</td>
                    <td className="ll-mono hidden px-3 py-2.5 md:table-cell" style={{ color: T.green.fg }}>{fmtMoney(s.paid, currency)}</td>
                    <td className="px-3 py-2.5"><span className="ll-mono rounded-md px-1.5 py-0.5 font-bold" style={s.balance > 0 ? { background: T.amber.bg, color: T.amber.fg } : { background: "#F3F4F6", color: "#6B7280" }}>{fmtMoney(s.balance, currency)}</span></td>
                    <td className="hidden whitespace-nowrap px-3 py-2.5 text-gray-600 lg:table-cell">{s.nextPay ? fmtDate(s.nextPay) : <span className="text-gray-300">—</span>}</td>
                    <td className="hidden px-3 py-2.5 text-gray-600 xl:table-cell">{s.paymentMethod?.type ? PAY_METHODS[s.paymentMethod.type] : <span className="text-gray-300">—</span>}</td>
                    <td className="hidden px-3 py-2.5 lg:table-cell">{s.agreement ? <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-700"><FileText size={10} /> on file</span> : <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">missing</span>}</td>
                    <td className="whitespace-nowrap px-2 py-2.5">
                      <button onClick={(e) => { e.stopPropagation(); openRow(key, true); }} title="Log a lead" className="rounded-md border px-2 py-0.5 text-[11px] font-semibold hover:bg-gray-50" style={{ borderColor: accent + "55", color: accent }}>+ Lead</button>
                      <ChevronRight size={14} className="ml-1 inline text-gray-300" />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {picking && (
        <PickerModal title="Add a lead-gen client" sub="Pick the project to bill per lead or on commission. You set the price, payment day and agreement next." accent={accent}
          placeholder="Search projects or clients…" empty="Every project is already on lead-gen billing."
          items={all.filter(({ project }) => !isLeadGen(project)).map(({ client, project }) => ({ key: client.id + "|" + project.id, label: project.name, sub: client.companyName || client.name, color: project.accent }))}
          onPick={setup} onClose={() => setPicking(false)} />
      )}
      {open && (
        <Modal title={`${open.project.name} — ${open.client.companyName || open.client.name}`} sub={`${BILLING_MODELS[open.project.billing?.model || "monthly"].label}. Changes save automatically.`} onClose={() => { setOpenKey(null); setAutoLead(false); }} wide>
          <LeadGenPanel client={open.client} project={open.project} onUpdate={(patch) => updateProject(open.client.id, open.project.id, patch)} accent={accent} currency={currency} autoLogLead={autoLead} />
        </Modal>
      )}
    </div>
  );
}

/* Company dashboard → Affiliate partners: the partner table with the
   referral pipeline as its second tab (the same two-tab shape clients see) */
export function AffiliatePartnersView({ company, clients, updateClient, accent = "#0E7C66" }) {
  const [tab, setTab] = useState("dashboard");
  const currency = company?.invoice?.currency || "USD";
  const prospects = clients.filter((c) => c.affiliate?.enabled).reduce((n, c) => n + (c.affiliate.prospects || []).length, 0);
  const tabs = [["dashboard", "Affiliate dashboard", LayoutDashboard], ["pipeline", `Pipeline${prospects ? ` (${prospects})` : ""}`, Sparkles]];
  return (
    <div className="ll-fade space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="ll-display flex items-center gap-2 text-[18px] font-bold"><HandCoins size={17} style={{ color: accent }} /> Affiliate partners</div>
          <div className="text-[12px] text-gray-400">Clients who refer clients: what they have earned, when they get paid, and the prospects they are working on.</div>
        </div>
        <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1">
          {tabs.map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)} className={"flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold " + (tab === k ? "text-white shadow-sm" : "text-gray-500 hover:text-gray-800")} style={tab === k ? { background: accent } : {}}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>
      {tab === "dashboard" && <PartnersTab clients={clients} updateClient={updateClient} currency={currency} accent={accent} />}
      {tab === "pipeline" && <PipelineTab clients={clients} updateClient={updateClient} accent={accent} />}
    </div>
  );
}

/* Company dashboard → Lead gen clients */
export function LeadGenClientsView({ company, clients, updateProject, accent = "#0E7C66" }) {
  const currency = company?.invoice?.currency || "USD";
  return (
    <div className="ll-fade space-y-4 p-5">
      <div>
        <div className="ll-display flex items-center gap-2 text-[18px] font-bold"><Receipt size={17} style={{ color: accent }} /> Lead gen clients</div>
        <div className="text-[12px] text-gray-400">Projects billed per lead or on commission: leads, what they bill, payments received and agreements on file.</div>
      </div>
      <LeadGenTab clients={clients} updateProject={updateProject} currency={currency} accent={accent} />
    </div>
  );
}

export function CompanyDashboardView({ company, clients, updateClient, updateProject, accent = "#0E7C66" }) {
  const [tab, setTab] = useState("partners");
  const currency = company?.invoice?.currency || "USD";
  const tabs = [["partners", "Affiliate partners", HandCoins], ["pipeline", "Pipeline", Sparkles], ["leadgen", "Lead gen clients", Receipt]];
  return (
    <div className="ll-fade space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="ll-display flex items-center gap-2 text-[18px] font-bold"><LayoutDashboard size={17} style={{ color: accent }} /> Company dashboard</div>
          <div className="text-[12px] text-gray-400">Affiliate partners, their referral pipeline, and clients billed per lead or on commission.</div>
        </div>
        <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1">
          {tabs.map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)} className={"flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold " + (tab === k ? "text-white shadow-sm" : "text-gray-500 hover:text-gray-800")} style={tab === k ? { background: accent } : {}}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>
      {tab === "partners" && <PartnersTab clients={clients} updateClient={updateClient} currency={currency} accent={accent} />}
      {tab === "pipeline" && <PipelineTab clients={clients} updateClient={updateClient} accent={accent} />}
      {tab === "leadgen" && <LeadGenTab clients={clients} updateProject={updateProject} currency={currency} accent={accent} />}
    </div>
  );
}
