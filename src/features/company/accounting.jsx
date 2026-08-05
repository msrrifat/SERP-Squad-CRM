import React, { useMemo, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { Plus, X, Trash2, Wallet, ChevronDown, Copy, Download, Pencil, Check } from "lucide-react";
import { Card, NEG, POS, Seg, askDelete, inputCls, tooltipStyle } from "../../ui/primitives.jsx";
import { money } from "../../lib/format.jsx";

/* =====================================================================
   ACCOUNTING — month by month

   Every earning and spending belongs to a MONTH. The left rail is the
   navigation: a Summary across a window you choose, then the months
   themselves, newest first, six at a time.

   Universal spending (the costs not tied to one client) is grouped into
   sections you define — Tools, Salaries, Office — because a flat list stops
   answering "where is the money going" the moment it has more than a few
   lines in it.
   ===================================================================== */

export const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const monthLabel = (key, long = false) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en", { month: long ? "long" : "short", year: "numeric" });
};
/* the last `n` month keys, newest first */
const recentMonths = (n, from = new Date()) =>
  Array.from({ length: n }, (_, i) => monthKey(new Date(from.getFullYear(), from.getMonth() - i, 1)));

/* Entries created before accounting had months carry their month in their id
   ("f"+Date.now()), so they land where they actually happened rather than all
   being dumped into whichever month the page was first opened in. */
const monthOfLegacy = (id) => {
  const ts = +String(id || "").replace(/^\D+/, "");
  return ts > 1e12 ? monthKey(new Date(ts)) : monthKey(new Date());
};
const withMonth = (e) => e.month || monthOfLegacy(e.id);

const DEFAULT_CATEGORIES = [
  { id: "cat-tools", name: "Tools & software" },
  { id: "cat-salary", name: "Salaries" },
  { id: "cat-office", name: "Office costs" },
];
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function AccountingSection({ company, onChange, clients }) {
  const fin = company.finance || { clientEntries: [], universal: [] };
  const setFin = (patch) => onChange({ finance: { ...fin, ...(typeof patch === "function" ? patch(fin) : patch) } });
  const accent = company.accent;

  const thisMonth = monthKey(new Date());
  const [view, setView] = useState(thisMonth);      // "summary" | "YYYY-MM"
  const [showAll, setShowAll] = useState(false);
  const [summaryMonths, setSummaryMonths] = useState(6);

  const categories = fin.categories?.length ? fin.categories : DEFAULT_CATEGORIES;
  const hidden = new Set(fin.hiddenClients || []);
  const visibleClients = clients.filter((c) => !hidden.has(c.id));

  /* ---- month-scoped reads ---- */
  const entriesIn = (m) => (fin.clientEntries || []).filter((e) => withMonth(e) === m);
  const universalIn = (m) => (fin.universal || []).filter((e) => withMonth(e) === m);
  const totalsFor = (m) => {
    const ce = entriesIn(m);
    const earn = ce.filter((e) => e.type === "earning").reduce((s, e) => s + +e.amount || 0, 0);
    const cSpend = ce.filter((e) => e.type === "spending").reduce((s, e) => s + +e.amount || 0, 0);
    const uSpend = universalIn(m).reduce((s, e) => s + +e.amount || 0, 0);
    return { earn, cSpend, uSpend, spend: cSpend + uSpend, net: earn - cSpend - uSpend };
  };

  const months = recentMonths(showAll ? 12 : 6);
  /* a month the user has data in but which has scrolled out of the window
     still deserves a way back to it */
  const extraMonths = [...new Set([...(fin.clientEntries || []), ...(fin.universal || [])].map(withMonth))]
    .filter((m) => !months.includes(m)).sort().reverse();

  return (
    <div className="ll-fade flex flex-col gap-4 lg:flex-row">
      {/* ---- left rail: summary, then months ---- */}
      <div className="w-full shrink-0 lg:w-56">
        <Card className="p-2">
          <button onClick={() => setView("summary")}
            className="mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left"
            style={view === "summary" ? { background: accent, color: "#fff" } : { color: "#4B5563" }}>
            <Wallet size={14} />
            <span className="flex-1 text-[13px] font-semibold">Summary</span>
          </button>
          <div className="px-3 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-wider text-gray-400">Months</div>
          {months.map((m) => {
            const t = totalsFor(m);
            const on = view === m;
            const empty = !t.earn && !t.spend;
            return (
              <button key={m} onClick={() => setView(m)}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left"
                style={on ? { background: accent, color: "#fff" } : { color: "#4B5563" }}>
                <span className="flex-1 text-[12.5px] font-medium">
                  {monthLabel(m)}{m === thisMonth ? <span className={"ml-1 text-[9px] font-bold uppercase " + (on ? "opacity-80" : "text-gray-400")}>now</span> : ""}
                </span>
                {!empty && (
                  <span className="ll-mono text-[11px] font-semibold"
                    style={on ? { color: "#fff" } : { color: t.net >= 0 ? POS : NEG }}>
                    {t.net >= 0 ? "+" : "−"}{money(Math.abs(t.net))}
                  </span>
                )}
              </button>
            );
          })}
          {!showAll && (
            <button onClick={() => setShowAll(true)}
              className="mt-1 flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-gray-300 py-1.5 text-[11.5px] font-medium text-gray-400 hover:border-gray-400 hover:text-gray-600">
              <ChevronDown size={12} /> More months
            </button>
          )}
          {showAll && extraMonths.length > 0 && (
            <>
              <div className="px-3 pb-1 pt-3 text-[9px] font-semibold uppercase tracking-wider text-gray-400">Earlier</div>
              {extraMonths.map((m) => (
                <button key={m} onClick={() => setView(m)}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left"
                  style={view === m ? { background: accent, color: "#fff" } : { color: "#4B5563" }}>
                  <span className="flex-1 text-[12.5px] font-medium">{monthLabel(m)}</span>
                </button>
              ))}
            </>
          )}
        </Card>
      </div>

      <div className="min-w-0 flex-1">
        {view === "summary"
          ? <SummaryView fin={fin} clients={visibleClients} accent={accent} categories={categories}
              months={summaryMonths} onMonths={setSummaryMonths} totalsFor={totalsFor}
              entriesIn={entriesIn} universalIn={universalIn} onOpenMonth={setView} />
          : <MonthView month={view} fin={fin} setFin={setFin} clients={clients} visibleClients={visibleClients}
              hidden={hidden} accent={accent} categories={categories} totals={totalsFor(view)}
              entriesIn={entriesIn} universalIn={universalIn} />}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- summary */
function SummaryView({ fin, clients, accent, categories, months, onMonths, totalsFor, entriesIn, universalIn, onOpenMonth }) {
  const keys = recentMonths(months);                 // newest first
  const chrono = [...keys].reverse();
  const per = chrono.map((m) => ({ m, ...totalsFor(m) }));
  const tot = per.reduce((a, p) => ({ earn: a.earn + p.earn, spend: a.spend + p.spend, net: a.net + p.net }), { earn: 0, spend: 0, net: 0 });
  const margin = tot.earn ? (tot.net / tot.earn) * 100 : 0;
  const activeMonths = per.filter((p) => p.earn || p.spend).length;

  const byClient = clients.map((c) => {
    const earn = keys.reduce((s, m) => s + entriesIn(m).filter((e) => e.clientId === c.id && e.type === "earning").reduce((x, e) => x + +e.amount || 0, 0), 0);
    const spend = keys.reduce((s, m) => s + entriesIn(m).filter((e) => e.clientId === c.id && e.type === "spending").reduce((x, e) => x + +e.amount || 0, 0), 0);
    return { name: c.name, earn, spend, net: earn - spend };
  }).filter((r) => r.earn || r.spend).sort((a, b) => b.net - a.net);

  const byCategory = categories.map((cat) => ({
    name: cat.name,
    amount: keys.reduce((s, m) => s + universalIn(m).filter((e) => (e.categoryId || categories[0]?.id) === cat.id).reduce((x, e) => x + +e.amount || 0, 0), 0),
  })).filter((r) => r.amount).sort((a, b) => b.amount - a.amount);

  const ov = [
    { label: "Earnings", value: money(tot.earn), sub: `${activeMonths} month${activeMonths === 1 ? "" : "s"} with activity`, color: POS },
    { label: "Spendings", value: money(tot.spend), sub: "clients + universal", color: NEG },
    { label: "Net profit", value: money(tot.net), sub: `avg ${money(Math.round(tot.net / Math.max(1, activeMonths)))}/mo`, color: tot.net >= 0 ? POS : NEG },
    { label: "Profit margin", value: margin.toFixed(0) + "%", sub: "of earnings kept", color: tot.net >= 0 ? POS : NEG },
  ];

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="ll-display text-[15px] font-semibold">Summary</div>
          <div className="text-[11.5px] text-gray-400">{monthLabel(chrono[0], true)} — {monthLabel(chrono[chrono.length - 1], true)}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11.5px] text-gray-500">Months</span>
          <Seg options={["3", "6", "12", "24"]} value={String(months)} onChange={(v) => onMonths(+v)} accent={accent} />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {ov.map((o, i) => (
          <Card key={i} className="p-4">
            <div className="text-[12px] font-medium text-gray-500">{o.label}</div>
            <div className="ll-display mt-1.5 text-[28px] font-semibold leading-none tracking-tight" style={{ color: o.color }}>{o.value}</div>
            <div className="mt-1.5 text-[11px] text-gray-400">{o.sub}</div>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <div className="ll-display mb-3 text-[15px] font-semibold">Month by month</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={per.map((p) => ({ name: monthLabel(p.m), Earnings: p.earn, Spendings: p.spend, Net: p.net }))} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="Earnings" stroke={POS} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Spendings" stroke={NEG} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Net" stroke={accent} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="ll-display mb-3 text-[15px] font-semibold">By client</div>
          {byClient.length === 0 ? <div className="py-6 text-center text-[12px] text-gray-300">Nothing recorded in this window.</div> : (
            <div className="space-y-1.5">
              {byClient.map((r) => (
                <div key={r.name} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-[12.5px]">
                  <span className="min-w-0 flex-1 truncate text-gray-700">{r.name}</span>
                  <span className="ll-mono text-[11.5px]" style={{ color: POS }}>+{money(r.earn)}</span>
                  <span className="ll-mono text-[11.5px]" style={{ color: NEG }}>−{money(r.spend)}</span>
                  <span className="ll-mono w-20 text-right font-semibold" style={{ color: r.net >= 0 ? POS : NEG }}>{money(r.net)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-5">
          <div className="ll-display mb-3 text-[15px] font-semibold">Universal spending by section</div>
          {byCategory.length === 0 ? <div className="py-6 text-center text-[12px] text-gray-300">No universal spending in this window.</div> : (
            <div className="space-y-1.5">
              {byCategory.map((r) => (
                <div key={r.name} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-[12.5px]">
                  <span className="min-w-0 flex-1 truncate text-gray-700">{r.name}</span>
                  <span className="ll-mono font-semibold" style={{ color: NEG }}>−{money(r.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-2 text-[11.5px] text-gray-400">Jump to a month</div>
        <div className="flex flex-wrap gap-1.5">
          {chrono.slice().reverse().map((m) => (
            <button key={m} onClick={() => onOpenMonth(m)}
              className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11.5px] font-medium text-gray-600 hover:border-gray-300">
              {monthLabel(m)}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------ one month */
function MonthView({ month, fin, setFin, clients, visibleClients, hidden, accent, categories, totals, entriesIn, universalIn }) {
  const [draftFor, setDraftFor] = useState(null);
  const [draft, setDraft] = useState({ type: "earning", label: "", amount: "" });
  const [addingClient, setAddingClient] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [renaming, setRenaming] = useState(null);
  const isThisMonth = month === monthKey(new Date());

  const monthEntries = entriesIn(month);
  const monthUniversal = universalIn(month);
  const sumBy = (clientId, type) => monthEntries.filter((e) => e.clientId === clientId && e.type === type).reduce((s, e) => s + +e.amount || 0, 0);

  const addEntry = (clientId) => {
    if (!draft.label.trim() || !+draft.amount) return;
    setFin((f) => ({ clientEntries: [...(f.clientEntries || []), { id: uid("f"), clientId, month, ...draft, amount: +draft.amount }] }));
    setDraft({ type: "earning", label: "", amount: "" }); setDraftFor(null);
  };
  const addUniversal = (categoryId, label, amount) =>
    setFin((f) => ({ universal: [...(f.universal || []), { id: uid("g"), month, categoryId, label, amount: +amount }] }));

  const saveCategories = (next) => setFin({ categories: next });
  const prevMonth = (() => { const [y, m] = month.split("-").map(Number); return monthKey(new Date(y, m - 2, 1)); })();
  const prevUniversal = universalIn(prevMonth);
  const copyPrevious = () => {
    if (!prevUniversal.length) return;
    setFin((f) => ({ universal: [...(f.universal || []),
      ...prevUniversal.map((e) => ({ ...e, id: uid("g"), month }))] }));
  };

  const exportCsv = () => {
    const rows = [["Type", "Section / client", "Label", "Amount"]];
    visibleClients.forEach((c) => monthEntries.filter((e) => e.clientId === c.id)
      .forEach((e) => rows.push([e.type, c.name, e.label, e.amount])));
    categories.forEach((cat) => monthUniversal.filter((e) => (e.categoryId || categories[0]?.id) === cat.id)
      .forEach((e) => rows.push(["universal", cat.name, e.label, e.amount])));
    const csv = rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `accounting-${month}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  const ov = [
    { label: "Earnings", value: money(totals.earn), sub: "all clients", color: POS },
    { label: "Spendings", value: money(totals.spend), sub: `${money(totals.cSpend)} clients + ${money(totals.uSpend)} universal`, color: NEG },
    { label: "Net profit", value: money(totals.net), sub: "earnings − all spendings", color: totals.net >= 0 ? POS : NEG },
    { label: "Profit margin", value: (totals.earn ? (totals.net / totals.earn) * 100 : 0).toFixed(0) + "%", sub: "of earnings kept", color: totals.net >= 0 ? POS : NEG },
  ];
  const hiddenClients = clients.filter((c) => hidden.has(c.id));

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="ll-display text-[15px] font-semibold">
            {monthLabel(month, true)}
            {isThisMonth && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">current month</span>}
          </div>
          <div className="text-[11.5px] text-gray-400">{monthEntries.length + monthUniversal.length} entr{monthEntries.length + monthUniversal.length === 1 ? "y" : "ies"} recorded</div>
        </div>
        <button onClick={exportCsv} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-gray-600 hover:border-gray-300">
          <Download size={13} /> Export CSV
        </button>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {ov.map((o, i) => (
          <Card key={i} className="p-4">
            <div className="text-[12px] font-medium text-gray-500">{o.label}</div>
            <div className="ll-display mt-1.5 text-[28px] font-semibold leading-none tracking-tight" style={{ color: o.color }}>{o.value}</div>
            <div className="mt-1.5 text-[11px] text-gray-400">{o.sub}</div>
          </Card>
        ))}
      </div>

      {/* ---- clients ---- */}
      <div className="flex items-center justify-between">
        <div className="ll-display text-[14px] font-semibold">Clients</div>
        {hiddenClients.length > 0 && (
          addingClient ? (
            <div className="flex items-center gap-1.5">
              <select onChange={(e) => { if (e.target.value) { setFin({ hiddenClients: (fin.hiddenClients || []).filter((id) => id !== e.target.value) }); setAddingClient(false); } }}
                defaultValue="" className={inputCls + " w-auto bg-white"}>
                <option value="">Choose a client…</option>
                {hiddenClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={() => setAddingClient(false)} className="rounded-lg px-2 text-gray-400 hover:text-gray-600"><X size={14} /></button>
            </div>
          ) : (
            <button onClick={() => setAddingClient(true)} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[11.5px] font-medium text-gray-600 hover:border-gray-300">
              <Plus size={12} /> Add client ({hiddenClients.length} hidden)
            </button>
          )
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {visibleClients.map((c) => {
          const earn = sumBy(c.id, "earning"), spend = sumBy(c.id, "spending"), profit = earn - spend;
          const entries = monthEntries.filter((e) => e.clientId === c.id);
          return (
            <Card key={c.id} className="group/card flex flex-col p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="ll-display min-w-0 truncate text-[14px] font-semibold">{c.name}</div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="ll-mono text-[16px] font-bold" style={{ color: profit >= 0 ? POS : NEG }}>{profit >= 0 ? "+" : ""}{money(profit)}</span>
                  <button title="Remove this client from accounting"
                    onClick={() => { if (askDelete(`${c.name} from accounting (its recorded entries stay)`)) setFin({ hiddenClients: [...(fin.hiddenClients || []), c.id] }); }}
                    className="text-gray-300 opacity-0 hover:text-red-500 group-hover/card:opacity-100"><X size={13} /></button>
                </div>
              </div>
              <div className="mb-3 flex gap-3 text-[11.5px]">
                <span className="text-gray-500">Earned <b className="ll-mono" style={{ color: POS }}>{money(earn)}</b></span>
                <span className="text-gray-500">Spent <b className="ll-mono" style={{ color: NEG }}>{money(spend)}</b></span>
              </div>
              <div className="flex-1 space-y-1">
                {entries.map((e) => (
                  <div key={e.id} className="group flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5 text-[12px]">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: e.type === "earning" ? POS : NEG }} />
                    <span className="min-w-0 flex-1 truncate text-gray-700">{e.label}</span>
                    <span className="ll-mono font-semibold" style={{ color: e.type === "earning" ? POS : NEG }}>
                      {e.type === "earning" ? "+" : "−"}{money(e.amount)}
                    </span>
                    <button onClick={() => { if (askDelete(`the entry "${e.label}"`)) setFin((f) => ({ clientEntries: f.clientEntries.filter((x) => x.id !== e.id) })); }}
                      className="text-gray-300 opacity-0 hover:text-red-500 group-hover:opacity-100"><Trash2 size={12} /></button>
                  </div>
                ))}
                {entries.length === 0 && <div className="py-2 text-center text-[11.5px] text-gray-300">Nothing this month</div>}
              </div>
              {draftFor === c.id ? (
                <div className="ll-fade mt-2 space-y-1.5 rounded-xl border border-gray-200 p-2.5">
                  <Seg options={["earning", "spending"]} value={draft.type} onChange={(v) => setDraft({ ...draft, type: v })} accent={accent} />
                  <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Label (e.g. retainer, ads budget…)" className={inputCls} />
                  <div className="flex gap-1.5">
                    <input value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="Amount $" className={"ll-mono " + inputCls} />
                    <button onClick={() => addEntry(c.id)} className="rounded-lg px-3 text-[12px] font-semibold text-white" style={{ background: accent }}>Add</button>
                    <button onClick={() => setDraftFor(null)} className="rounded-lg px-2 text-gray-400 hover:text-gray-600"><X size={14} /></button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setDraft({ type: "earning", label: "", amount: "" }); setDraftFor(c.id); }}
                  className="mt-2 flex items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 py-1.5 text-[11.5px] font-medium text-gray-400 hover:border-gray-400 hover:text-gray-600">
                  <Plus size={12} /> Add entry
                </button>
              )}
            </Card>
          );
        })}
        {visibleClients.length === 0 && (
          <Card className="p-6 text-center text-[12px] text-gray-400 lg:col-span-3">
            No clients in accounting. Use <b>Add client</b> above to bring one back.
          </Card>
        )}
      </div>

      {/* ---- universal spending, grouped into sections ---- */}
      <Card className="p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="ll-display text-[15px] font-semibold">Universal spending <span className="text-xs font-normal text-gray-400">not tied to one client</span></div>
          <div className="flex items-center gap-2">
            {prevUniversal.length > 0 && (
              <button onClick={copyPrevious} title={`Copy the ${prevUniversal.length} universal entr${prevUniversal.length === 1 ? "y" : "ies"} from ${monthLabel(prevMonth)}`}
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[11.5px] font-medium text-gray-600 hover:border-gray-300">
                <Copy size={12} /> Copy {monthLabel(prevMonth)}
              </button>
            )}
            <span className="ll-mono text-[16px] font-bold" style={{ color: NEG }}>−{money(totals.uSpend)}</span>
          </div>
        </div>
        <p className="mb-3 text-[11.5px] text-gray-400">
          Grouped into sections you control — tools, salaries, office costs, anything else. Rename or remove a section, and add as many as you need.
        </p>

        <div className="space-y-3">
          {categories.map((cat) => {
            const items = monthUniversal.filter((e) => (e.categoryId || categories[0]?.id) === cat.id);
            const catTotal = items.reduce((s, e) => s + +e.amount || 0, 0);
            return (
              <CategoryBlock key={cat.id} cat={cat} items={items} total={catTotal} accent={accent}
                renaming={renaming === cat.id} onRename={(v) => { saveCategories(categories.map((x) => x.id === cat.id ? { ...x, name: v } : x)); setRenaming(null); }}
                onStartRename={() => setRenaming(cat.id)} onCancelRename={() => setRenaming(null)}
                onRemove={() => {
                  if (!askDelete(`the section "${cat.name}"${items.length ? ` and its ${items.length} entr${items.length === 1 ? "y" : "ies"} this month` : ""}`)) return;
                  saveCategories(categories.filter((x) => x.id !== cat.id));
                  setFin((f) => ({ universal: (f.universal || []).filter((e) => (e.categoryId || categories[0]?.id) !== cat.id) }));
                }}
                onAdd={(label, amount) => addUniversal(cat.id, label, amount)}
                onPatch={(id, patch) => setFin((f) => ({ universal: f.universal.map((x) => x.id === id ? { ...x, ...patch } : x) }))}
                onDelete={(id, label) => { if (askDelete(`the spending "${label}"`)) setFin((f) => ({ universal: f.universal.filter((x) => x.id !== id) })); }} />
            );
          })}
        </div>

        <div className="mt-3 flex gap-1.5 border-t border-gray-100 pt-3">
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New section (e.g. Contractors, Travel)" className={inputCls}
            onKeyDown={(e) => { if (e.key === "Enter" && newCat.trim()) { saveCategories([...categories, { id: uid("cat"), name: newCat.trim() }]); setNewCat(""); } }} />
          <button disabled={!newCat.trim()} onClick={() => { saveCategories([...categories, { id: uid("cat"), name: newCat.trim() }]); setNewCat(""); }}
            className="flex items-center gap-1 rounded-lg px-4 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
            <Plus size={13} /> Add section
          </button>
        </div>
      </Card>
    </div>
  );
}

function CategoryBlock({ cat, items, total, accent, renaming, onRename, onStartRename, onCancelRename, onRemove, onAdd, onPatch, onDelete }) {
  const [d, setD] = useState({ label: "", amount: "" });
  const [name, setName] = useState(cat.name);
  return (
    <div className="rounded-xl border border-gray-100 p-3">
      <div className="mb-2 flex items-center gap-2">
        {renaming ? (
          <>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onRename(name.trim()); if (e.key === "Escape") onCancelRename(); }}
              className={inputCls + " max-w-xs py-1 text-[12.5px]"} />
            <button onClick={() => name.trim() && onRename(name.trim())} className="rounded-lg p-1 text-emerald-600 hover:bg-emerald-50"><Check size={14} /></button>
            <button onClick={onCancelRename} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={14} /></button>
          </>
        ) : (
          <>
            <span className="text-[12.5px] font-semibold text-gray-700">{cat.name}</span>
            <button onClick={onStartRename} title="Rename section" className="text-gray-300 hover:text-gray-600"><Pencil size={11} /></button>
            <span className="ll-mono ml-auto text-[12.5px] font-semibold" style={{ color: NEG }}>−{money(total)}</span>
            <button onClick={onRemove} title="Remove section" className="text-gray-300 hover:text-red-500"><Trash2 size={12} /></button>
          </>
        )}
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {items.map((e) => (
          <div key={e.id} className="group flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-[12.5px]">
            <input value={e.label} onChange={(ev) => onPatch(e.id, { label: ev.target.value })}
              className="min-w-0 flex-1 truncate border-0 bg-transparent text-gray-700 outline-none" />
            <input value={e.amount} onChange={(ev) => onPatch(e.id, { amount: +ev.target.value.replace(/[^0-9.]/g, "") || 0 })}
              className="ll-mono w-20 rounded border border-gray-200 px-1.5 py-0.5 text-right text-[12px]" />
            <button onClick={() => onDelete(e.id, e.label)} className="text-gray-300 opacity-0 hover:text-red-500 group-hover:opacity-100"><Trash2 size={12} /></button>
          </div>
        ))}
        {items.length === 0 && <div className="py-1.5 text-[11.5px] text-gray-300">Nothing in this section yet</div>}
      </div>
      <div className="mt-2 flex gap-1.5">
        <input value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} placeholder={`New ${cat.name.toLowerCase()} spending`} className={inputCls + " py-1.5 text-[12px]"} />
        <input value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="$" className={"ll-mono w-24 py-1.5 text-[12px] " + inputCls.replace("w-full ", "")} />
        <button disabled={!d.label.trim() || !+d.amount} onClick={() => { onAdd(d.label.trim(), +d.amount); setD({ label: "", amount: "" }); }}
          className="rounded-lg px-3 text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>Add</button>
      </div>
    </div>
  );
}
