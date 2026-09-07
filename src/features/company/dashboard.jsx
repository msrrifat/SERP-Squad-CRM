import React, { useEffect, useMemo, useState } from "react";
import { HandCoins, Users, Wallet, CalendarDays, Receipt, Sparkles, ChevronRight, ChevronLeft, LayoutDashboard, Plus, TrendingUp, FileText, Search, UserPlus, Settings2, CreditCard, ListChecks } from "lucide-react";
import { Card, Modal, inputCls } from "../../ui/primitives.jsx";
import { affiliateSummary, fmtMoney } from "../../lib/affiliate.js";
import { leadgenSummary, isLeadGen, BILLING_MODELS, PAY_METHODS } from "../../lib/leadgen.js";
import { AffiliateSettings, PROSPECT_STATUS } from "../clients/affiliate.jsx";
import { LeadGenPanel, ModelPill } from "./leadgen.jsx";

/* =====================================================================
   COMPANY DASHBOARD — two screens, one shape:

     a stat strip on top, then a master–detail body: the list on the left,
     the selected record on the right with its own small tabs. Nothing
     opens in a modal except the "add" picker, so there is never a form
     stacked on a form.

     Affiliate partners   partners → Overview / Referrals / Payouts /
                          Prospects / Settings; second screen tab: Pipeline
     Lead gen clients     projects → Overview / Leads / Payments / Billing
   Everything edits the same records Client/Project settings use.
   ===================================================================== */

const fmtDate = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" }) : "—");
const T = { teal: "#0F766E", blue: "#1D4ED8", violet: "#6D28D9", green: "#15803D", amber: "#B45309", gray: "#6B7280" };

/* one quiet card with the headline numbers side by side */
function StatStrip({ stats }) {
  return (
    <Card className="grid grid-cols-2 divide-y divide-gray-100 sm:grid-cols-3 sm:divide-y-0 sm:divide-x xl:grid-cols-5">
      {stats.map((st) => (
        <div key={st.label} className="px-4 py-3">
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-gray-500"><st.icon size={12} style={{ color: st.color }} /> {st.label}</div>
          <div className="ll-mono mt-1 text-[20px] font-bold tracking-tight" style={{ color: st.color }}>{st.value}</div>
          {st.sub && <div className="truncate text-[11px] text-gray-400">{st.sub}</div>}
        </div>
      ))}
    </Card>
  );
}

/* a searchable list to pick one client or project from */
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

/* the list + detail frame. On small screens the list and the detail take
   turns (a Back button returns to the list); from lg up they sit side by side */
function MasterDetail({ list, detail, selected, onBack }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className={selected ? "hidden lg:block" : ""}>{list}</div>
      <div className={selected ? "" : "hidden lg:block"}>
        {selected && (
          <button onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-[12px] font-semibold text-gray-500 hover:text-gray-800 lg:hidden"><ChevronLeft size={14} /> Back to list</button>
        )}
        {detail}
      </div>
    </div>
  );
}
function ListCard({ title, count, action, children, empty }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5">
        <div className="text-[12.5px] font-semibold text-gray-800">{title} <span className="text-[11px] font-normal text-gray-400">{count}</span></div>
        {action}
      </div>
      <div className="max-h-[70vh] overflow-y-auto">
        {children}
        {empty}
      </div>
    </Card>
  );
}
function ListRow({ active, onClick, title, sub, right, rightSub, pill, color, accent }) {
  return (
    <button onClick={onClick} className={"flex w-full items-center gap-3 border-b border-gray-50 px-4 py-3 text-left hover:bg-gray-50 " + (active ? "bg-gray-50" : "")} style={active ? { boxShadow: `inset 3px 0 0 ${accent}` } : {}}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold text-white" style={{ background: color || accent }}>{(title || "?").slice(0, 1).toUpperCase()}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5"><span className="truncate text-[13px] font-semibold text-gray-800">{title}</span>{pill}</span>
        <span className="block truncate text-[11px] text-gray-400">{sub}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="ll-mono block text-[12.5px] font-bold" style={{ color: right?.color || "#1F2937" }}>{right?.value}</span>
        {rightSub && <span className="block text-[10.5px] text-gray-400">{rightSub}</span>}
      </span>
    </button>
  );
}
function SubTabs({ tabs, value, onChange, accent }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-gray-100 px-2 pt-2">
      {tabs.map(([k, label, Icon]) => (
        <button key={k} onClick={() => onChange(k)}
          className={"-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12px] font-semibold " + (value === k ? "" : "border-transparent text-gray-500 hover:text-gray-800")}
          style={value === k ? { borderColor: accent, color: accent } : {}}>
          {Icon && <Icon size={13} />} {label}
        </button>
      ))}
    </div>
  );
}
const PrimaryBtn = ({ onClick, accent, children }) => (
  <button onClick={onClick} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm" style={{ background: accent }}>{children}</button>
);

/* ---- affiliate partners ---------------------------------------------- */
function PartnersTab({ clients, updateClient, currency, accent }) {
  const partners = useMemo(() => clients.filter((c) => c.affiliate?.enabled).map((c) => ({ client: c, s: affiliateSummary(c, clients) })), [clients]);
  const [selId, setSelId] = useState(null);
  const [sub, setSub] = useState("overview");
  const [picking, setPicking] = useState(false);
  const candidates = clients.filter((c) => !c.affiliate?.enabled);
  const tot = partners.reduce((n, p) => ({ earned: n.earned + p.s.totals.earned, paid: n.paid + p.s.totals.paid, balance: n.balance + p.s.totals.balance, month: n.month + p.s.totals.thisMonth, active: n.active + p.s.totals.active }), { earned: 0, paid: 0, balance: 0, month: 0, active: 0 });
  const nextPayouts = partners.filter((p) => p.s.totals.nextPayout).sort((a, b) => a.s.totals.nextPayout.localeCompare(b.s.totals.nextPayout));
  const enrol = (id) => { updateClient(id, (c) => ({ affiliate: { enabled: true, rate: 20, referrals: [], payouts: [], ...(c.affiliate || {}), enabled: true } })); setPicking(false); setSelId(id); setSub("referrals"); };
  const sel = partners.find((p) => p.client.id === selId) || null;
  /* keep a sensible selection on wide screens without stealing the list on narrow ones */
  useEffect(() => { if (selId && !partners.some((p) => p.client.id === selId)) setSelId(null); }, [partners, selId]);

  const stats = [
    { icon: Users, label: "Partners", value: partners.length, sub: `${tot.active} active referral${tot.active === 1 ? "" : "s"}`, color: T.blue },
    { icon: TrendingUp, label: "This month", value: fmtMoney(tot.month, currency), sub: "commission accruing", color: T.violet },
    { icon: Receipt, label: "Earned to date", value: fmtMoney(tot.earned, currency), color: T.teal },
    { icon: HandCoins, label: "Paid out", value: fmtMoney(tot.paid, currency), color: T.green },
    { icon: Wallet, label: "Owed to partners", value: fmtMoney(tot.balance, currency), sub: nextPayouts[0] ? `next ${fmtDate(nextPayouts[0].s.totals.nextPayout)} · ${nextPayouts[0].client.companyName || nextPayouts[0].client.name}` : "no payment days set", color: T.amber },
  ];
  const list = (
    <ListCard title="Partners" count={partners.length} action={<PrimaryBtn onClick={() => setPicking(true)} accent={accent}><UserPlus size={13} /> Enrol</PrimaryBtn>}
      empty={partners.length === 0 && (
        <div className="p-8 text-center text-[12px] text-gray-400">No affiliate partners yet. Enrol a client — they get an "Affiliate program" screen in their portal.</div>
      )}>
      {partners.map(({ client: c, s }) => (
        <ListRow key={c.id} active={c.id === selId} onClick={() => { setSelId(c.id); setSub("overview"); }} accent={accent} color={c.projects?.[0]?.accent}
          title={c.companyName || c.name} sub={`${s.totals.active} active · ${s.rate}% · ${s.totals.nextPayout ? "pays " + fmtDate(s.totals.nextPayout) : "no pay day"}`}
          right={{ value: fmtMoney(s.totals.balance, currency), color: s.totals.balance > 0 ? T.amber : T.gray }} rightSub="balance"
          pill={!c.affiliate?.payout?.paypalEmail && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700" title="No PayPal details yet">no PayPal</span>} />
      ))}
    </ListCard>
  );
  const detail = !sel ? (
    <Card className="flex min-h-[320px] items-center justify-center p-8 text-center text-[12.5px] text-gray-400">
      {partners.length ? "Select a partner to see their referrals, payouts and prospects." : "Enrol your first partner to get started."}
    </Card>
  ) : (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <div className="ll-display truncate text-[16px] font-bold text-gray-900">{sel.client.companyName || sel.client.name}</div>
          <div className="text-[11.5px] text-gray-400">{sel.client.contact}{sel.client.email ? ` · ${sel.client.email}` : ""} · {sel.s.rate}% commission</div>
        </div>
        <div className="flex gap-2 text-right">
          {[["Balance due", sel.s.totals.balance, T.amber], ["This month", sel.s.totals.thisMonth, T.violet], ["Next payout", sel.s.totals.nextPayout ? fmtDate(sel.s.totals.nextPayout) : "—", T.gray]].map(([l, v, c]) => (
            <div key={l} className="rounded-lg bg-gray-50 px-3 py-1.5">
              <div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">{l}</div>
              <div className="ll-mono text-[13px] font-bold" style={{ color: c }}>{typeof v === "number" ? fmtMoney(v, currency) : v}</div>
            </div>
          ))}
        </div>
      </div>
      <SubTabs value={sub} onChange={setSub} accent={accent} tabs={[
        ["overview", "Overview", LayoutDashboard], ["referrals", `Referrals (${sel.s.referrals.length})`, Users], ["payouts", `Payouts (${sel.s.payouts.length})`, HandCoins],
        ["prospects", `Prospects (${(sel.client.affiliate?.prospects || []).length})`, Sparkles], ["settings", "Settings", Settings2]]} />
      <div className="p-4">
        {sub === "overview" && (
          <div className="space-y-4">
            <AffiliateSettings section="overview" draft={{ affiliate: sel.client.affiliate }} set={(patch) => updateClient(sel.client.id, patch)} client={sel.client} clients={clients} currency={currency} accent={accent} />
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Referred clients</div>
              {sel.s.referrals.length === 0 ? <div className="rounded-lg border border-dashed border-gray-200 p-3 text-center text-[11.5px] text-gray-400">No referrals yet — add them in the Referrals tab.</div> : (
                <div className="divide-y divide-gray-50 rounded-lg border border-gray-100">
                  {sel.s.referrals.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-[12px]">
                      <span className="font-semibold text-gray-800">{r.name}</span>
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: r.status === "active" ? "#DCFCE7" : "#F3F4F6", color: r.status === "active" ? "#166534" : "#6B7280" }}>{r.status}</span>
                      <span className="ll-mono text-gray-500">{fmtMoney(r.monthly, currency)}/mo → <b style={{ color: T.blue }}>{fmtMoney(r.commission, currency)}</b></span>
                      <span className="ml-auto text-gray-400">{r.nextPay ? `pays ${fmtDate(r.nextPay)}` : "no pay day"} · earned {fmtMoney(r.earned, currency)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {sub !== "overview" && (
          <AffiliateSettings section={sub} draft={{ affiliate: sel.client.affiliate }} set={(patch) => updateClient(sel.client.id, patch)} client={sel.client} clients={clients} currency={currency} accent={accent} />
        )}
      </div>
    </Card>
  );
  return (
    <div className="space-y-4">
      <StatStrip stats={stats} />
      <MasterDetail list={list} detail={detail} selected={!!sel} onBack={() => setSelId(null)} />
      {picking && (
        <PickerModal title="Enrol a client as affiliate partner" sub="They earn commission on every client they refer; you set the referrals next." accent={accent}
          placeholder="Search clients…" empty="Every client is already a partner."
          items={candidates.map((c) => ({ key: c.id, label: c.companyName || c.name, sub: [c.contact, `${(c.projects || []).length} project${(c.projects || []).length === 1 ? "" : "s"}`].filter(Boolean).join(" · "), color: c.projects?.[0]?.accent }))}
          onPick={enrol} onClose={() => setPicking(false)} />
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
      <StatStrip stats={[{ icon: Sparkles, label: "Prospects", value: rows.length, color: T.gray }, ...Object.entries(PROSPECT_STATUS).map(([k, v]) => ({ icon: ListChecks, label: v.label, value: counts[k], color: v.fg }))]} />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-100 px-4 py-2.5">
          {[["all", "All"], ...Object.entries(PROSPECT_STATUS).map(([k, v]) => [k, v.label])].map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} className={"rounded-full border px-2.5 py-1 text-[11px] font-semibold " + (filter === k ? "" : "border-gray-200 text-gray-500 hover:border-gray-300")}
              style={filter === k ? { borderColor: accent, background: accent + "14", color: accent } : {}}>{label}{k !== "all" ? ` ${counts[k]}` : ""}</button>
          ))}
        </div>
        {list.length === 0 ? <div className="p-10 text-center text-[12.5px] text-gray-400">Nothing here yet — partners add prospects from their Affiliate program → Prospects tab.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-gray-100 text-left text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">
                <th className="px-4 py-2">Prospect</th><th className="px-3 py-2">Business</th><th className="hidden px-3 py-2 md:table-cell">Website</th><th className="hidden px-3 py-2 lg:table-cell">Area</th><th className="px-3 py-2">Referred by</th><th className="px-3 py-2">Status</th><th className="hidden px-3 py-2 xl:table-cell">Notes</th>
              </tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.partnerId + p.id} className="border-b border-gray-50 align-top hover:bg-gray-50/60">
                    <td className="px-4 py-2.5"><div className="font-semibold text-gray-800">{p.name || "—"}</div><div className="text-[11px] text-gray-400">{[p.email, p.phone].filter(Boolean).join(" · ")}</div></td>
                    <td className="px-3 py-2.5 text-gray-700">{p.business || "—"}</td>
                    <td className="hidden px-3 py-2.5 md:table-cell">{p.website ? <a href={/^https?:/.test(p.website) ? p.website : "https://" + p.website} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: accent }}>{p.website.replace(/^https?:\/\//, "")}</a> : "—"}</td>
                    <td className="hidden px-3 py-2.5 text-gray-600 lg:table-cell">{p.area || "—"}</td>
                    <td className="px-3 py-2.5 text-gray-600">{p.partner}</td>
                    <td className="px-3 py-2.5">
                      <select value={p.status || "new"} onChange={(e) => setStatus(p, e.target.value)} className="rounded-full border-0 px-2 py-0.5 text-[10.5px] font-bold"
                        style={{ background: (PROSPECT_STATUS[p.status] || PROSPECT_STATUS.new).bg, color: (PROSPECT_STATUS[p.status] || PROSPECT_STATUS.new).fg }}>
                        {Object.entries(PROSPECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </td>
                    <td className="hidden max-w-[260px] px-3 py-2.5 text-[12px] text-gray-500 xl:table-cell"><div className="line-clamp-2" title={p.notes}>{p.notes || "—"}</div></td>
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
  const [selKey, setSelKey] = useState(null);
  const [sub, setSub] = useState("overview");
  const [picking, setPicking] = useState(false);
  const [autoLead, setAutoLead] = useState(false);
  const tot = rows.reduce((n, r) => ({ owed: n.owed + r.s.owed, paid: n.paid + r.s.paid, balance: n.balance + r.s.balance, month: n.month + r.s.thisMonth.amount, leads: n.leads + r.s.thisMonth.leads }), { owed: 0, paid: 0, balance: 0, month: 0, leads: 0 });
  const sel = rows.find((x) => x.client.id + "|" + x.project.id === selKey) || null;
  useEffect(() => { if (selKey && !sel) setSelKey(null); }, [rows, selKey]); // eslint-disable-line
  const setup = (key) => { const [cid, pid] = key.split("|"); updateProject(cid, pid, (p) => ({ billing: { model: "perLead", leads: [], payments: [], ...(p.billing || {}), model: p.billing?.model && p.billing.model !== "monthly" ? p.billing.model : "perLead" } })); setPicking(false); setSelKey(key); setSub("setup"); };
  const openRow = (key, tab = "overview", withLead = false) => { setSelKey(key); setSub(tab); setAutoLead(withLead); };

  const stats = [
    { icon: Receipt, label: "Lead-gen projects", value: rows.length, sub: `${rows.filter((r) => r.s.model === "perLead").length} per lead · ${rows.filter((r) => r.s.model === "commission").length} commission`, color: T.blue },
    { icon: TrendingUp, label: "Billed this month", value: fmtMoney(tot.month, currency), sub: `${tot.leads} lead${tot.leads === 1 ? "" : "s"}`, color: T.violet },
    { icon: FileText, label: "Billed to date", value: fmtMoney(tot.owed, currency), color: T.teal },
    { icon: CreditCard, label: "Received", value: fmtMoney(tot.paid, currency), color: T.green },
    { icon: Wallet, label: "Outstanding", value: fmtMoney(tot.balance, currency), color: T.amber },
  ];
  const list = (
    <ListCard title="Lead gen clients" count={rows.length} action={<PrimaryBtn onClick={() => setPicking(true)} accent={accent}><Plus size={13} /> Add</PrimaryBtn>}
      empty={rows.length === 0 && (
        <div className="p-8 text-center text-[12px] text-gray-400">No lead-gen clients yet. Add a project to bill it per lead or on commission — or set it from Project settings → Billing.</div>
      )}>
      {rows.map(({ client, project, s }) => {
        const key = client.id + "|" + project.id;
        return (
          <ListRow key={key} active={key === selKey} onClick={() => openRow(key)} accent={accent} color={project.accent}
            title={project.name} sub={`${client.companyName || client.name} · ${s.model === "perLead" ? `${fmtMoney(s.rate, currency)}/lead` : `${s.rate}% of sales`}${s.nextPay ? ` · pays ${fmtDate(s.nextPay)}` : ""}`}
            right={{ value: fmtMoney(s.balance, currency), color: s.balance > 0 ? T.amber : T.gray }} rightSub="balance"
            pill={<ModelPill model={s.model} />} />
        );
      })}
    </ListCard>
  );
  const detail = !sel ? (
    <Card className="flex min-h-[320px] items-center justify-center p-8 text-center text-[12.5px] text-gray-400">
      {rows.length ? "Select a project to see its leads, payments and billing." : "Add your first lead-gen client to get started."}
    </Card>
  ) : (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <div className="ll-display truncate text-[16px] font-bold text-gray-900">{sel.project.name}</div>
          <div className="text-[11.5px] text-gray-400">{sel.client.companyName || sel.client.name} · {BILLING_MODELS[sel.s.model]?.label}{sel.s.paymentMethod?.type ? ` · ${PAY_METHODS[sel.s.paymentMethod.type]}` : ""}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-2 text-right">
            {[["Balance due", sel.s.balance, T.amber], ["This month", sel.s.thisMonth.amount, T.violet], ["Client pays", sel.s.nextPay ? fmtDate(sel.s.nextPay) : "—", T.gray]].map(([l, v, c]) => (
              <div key={l} className="rounded-lg bg-gray-50 px-3 py-1.5">
                <div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">{l}</div>
                <div className="ll-mono text-[13px] font-bold" style={{ color: c }}>{typeof v === "number" ? fmtMoney(v, currency) : v}</div>
              </div>
            ))}
          </div>
          <PrimaryBtn onClick={() => openRow(selKey, "leads", true)} accent={accent}><Plus size={13} /> Log lead</PrimaryBtn>
        </div>
      </div>
      <SubTabs value={sub} onChange={(k) => { setSub(k); setAutoLead(false); }} accent={accent} tabs={[
        ["overview", "Overview", LayoutDashboard], ["leads", `Leads (${sel.s.leads.length})`, Users], ["payments", `Payments (${sel.s.payments.length})`, CreditCard], ["setup", "Billing setup", Settings2]]} />
      <div className="p-4">
        <LeadGenPanel key={selKey + sub + (autoLead ? "+lead" : "")} section={sub} client={sel.client} project={sel.project} onUpdate={(patch) => updateProject(sel.client.id, sel.project.id, patch)} accent={accent} currency={currency} autoLogLead={autoLead && sub === "leads"} />
      </div>
    </Card>
  );
  return (
    <div className="space-y-4">
      <StatStrip stats={stats} />
      <MasterDetail list={list} detail={detail} selected={!!sel} onBack={() => setSelKey(null)} />
      {picking && (
        <PickerModal title="Add a lead-gen client" sub="Pick the project to bill per lead or on commission. You set the price, payment day and agreement next." accent={accent}
          placeholder="Search projects or clients…" empty="Every project is already on lead-gen billing."
          items={all.filter(({ project }) => !isLeadGen(project)).map(({ client, project }) => ({ key: client.id + "|" + project.id, label: project.name, sub: client.companyName || client.name, color: project.accent }))}
          onPick={setup} onClose={() => setPicking(false)} />
      )}
    </div>
  );
}

/* ---- screens ---------------------------------------------------------- */
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

/* kept for older links — the combined three-tab screen */
export function CompanyDashboardView(props) { return <AffiliatePartnersView {...props} />; }
