/* =====================================================================
   PROPOSAL TEMPLATE — Company Settings → Proposal template.

   List of saved proposals → a full-screen editor: the A4 document on the
   left (what the client receives, also what prints), the editor sidebar
   on the right. Document: cover · what's included (the three services,
   each short) · investment · reporting & access · the work checklist in
   parts with a quantity column · closing with acceptance lines.
   Printing renders the same document into a portal at the body root so
   the browser paginates it on its own (A4, no app chrome).
   ===================================================================== */
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft, ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Copy, FileSignature, Layout, Megaphone, Plus, Printer, Save, Search, Trash2,
} from "lucide-react";
import { Card, Labeled, Toggle, askConfirm, askDelete, inputCls } from "../../ui/primitives.jsx";
import { DEFAULT_ACCESS, DEFAULT_CHECKLISTS, DEFAULT_CLOSING, DEFAULT_INTRO, DEFAULT_REPORTING, DEFAULT_SERVICES, blankProposal, fmtLongDate, templateOf, uid } from "../../lib/proposal.js";

const ICONS = { search: Search, megaphone: Megaphone, layout: Layout };
const PAGE_W = 794; // A4 at 96dpi

/* ---------------- the document ---------------- */
function ProposalDoc({ d, company, clientName }) {
  const accent = d.accent || company.accent || "#1F2A44";
  const services = (d.services || []).filter((s) => s.enabled !== false);
  const business = d.business || clientName || "your business";
  const Page = ({ children, className = "", cover = false }) => (
    <div className={`pp-page ${cover ? "pp-cover" : ""} ${className}`}
      style={{ width: PAGE_W, minHeight: 1123, background: "#fff", padding: cover ? 0 : "60px 56px 52px", boxSizing: "border-box", position: "relative" }}>
      {children}
      {!cover && (
        <div className="pp-foot" style={{ position: "absolute", left: 56, right: 56, bottom: 26, display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "#9CA3AF" }}>
          <span>{company.name}{d.contact ? ` · ${d.contact}` : ""}</span>
          <span>{d.title} · {business}</span>
        </div>
      )}
    </div>
  );
  const H = ({ kicker, title, sub }) => (
    <div style={{ marginBottom: 22 }}>
      {kicker && <div className="ll-mono" style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: accent, fontWeight: 700 }}>{kicker}</div>}
      <div className="ll-display" style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15, color: "#111827", marginTop: 4 }}>{title}</div>
      {sub && <div style={{ fontSize: 12.5, color: "#6B7280", marginTop: 6, maxWidth: 560 }}>{sub}</div>}
    </div>
  );
  const Tick = () => (
    <span style={{ display: "inline-flex", width: 16, height: 16, borderRadius: 4, background: accent + "1A", color: accent, alignItems: "center", justifyContent: "center" }}><Check size={11} strokeWidth={3} /></span>
  );

  return (
    <div className="pp-doc ll-root" style={{ width: PAGE_W, color: "#18202F" }}>
      {/* ---- cover ---- */}
      <Page cover>
        <div style={{ height: 1123, display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
          <div style={{ background: accent, color: "#fff", padding: "54px 56px 48px", flex: "0 0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {company.logo
                ? <img src={company.logo} alt="" style={{ height: 34, maxWidth: 160, objectFit: "contain", filter: "brightness(0) invert(1)" }} />
                : <span className="ll-display" style={{ fontSize: 18, fontWeight: 700 }}>{company.name}</span>}
              <span className="ll-mono" style={{ marginLeft: "auto", fontSize: 10, letterSpacing: 2, opacity: 0.8 }}>PROPOSAL {d.no ? `· ${d.no}` : ""}</span>
            </div>
            <div style={{ height: 150 }} />
            <div className="ll-mono" style={{ fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase", opacity: 0.75 }}>Prepared for</div>
            <div className="ll-display" style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.15, marginTop: 6 }}>{business}</div>
            {d.preparedFor && <div style={{ fontSize: 13.5, opacity: 0.85, marginTop: 6 }}>Attn. {d.preparedFor}</div>}
          </div>
          <div style={{ padding: "52px 56px 0", flex: "1 1 auto", display: "flex", flexDirection: "column" }}>
            <div className="ll-display" style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.08, letterSpacing: -0.5, color: "#111827", maxWidth: 600 }}>{d.title}</div>
            {d.intro && <div style={{ fontSize: 14, lineHeight: 1.6, color: "#4B5563", marginTop: 18, maxWidth: 560 }}>{d.intro}</div>}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 26 }}>
              {services.map((s) => (
                <span key={s.id} style={{ border: `1.5px solid ${accent}`, color: accent, borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 600 }}>{s.title}</span>
              ))}
            </div>
            <div style={{ marginTop: "auto", paddingBottom: 48, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18, borderTop: "1px solid #E5E7EB", paddingTop: 22 }}>
              {[["Prepared by", d.preparedBy || company.name], ["Date", fmtLongDate(d.date)], ["Valid until", fmtLongDate(d.validUntil)]].map(([k, v]) => (
                <div key={k}>
                  <div className="ll-mono" style={{ fontSize: 9.5, letterSpacing: 1.5, textTransform: "uppercase", color: "#9CA3AF" }}>{k}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", marginTop: 4 }}>{v || "—"}</div>
                </div>
              ))}
              {d.contact && <div style={{ gridColumn: "1 / -1", fontSize: 11.5, color: "#6B7280" }}>{d.contact}</div>}
            </div>
          </div>
        </div>
      </Page>

      {/* ---- what's included ---- */}
      <Page>
        <H kicker="What's included" title="Services at a glance" sub={`Everything below is tailored to ${business}. Each service stands on its own, and they work best together.`} />
        <div style={{ display: "grid", gap: 16 }}>
          {services.map((s, i) => {
            const Icon = ICONS[(s.key && { seo: "search", ads: "megaphone", web: "layout" }[s.key]) || "search"] || Search;
            return (
              <div key={s.id} className="pp-keep" style={{ border: "1px solid #E5E7EB", borderRadius: 14, padding: "18px 20px", background: "#fff" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 10, background: accent + "14", color: accent, alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}><Icon size={17} /></span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                      <span className="ll-display" style={{ fontSize: 17, fontWeight: 700, color: "#111827" }}>{String(i + 1).padStart(2, "0")} · {s.title}</span>
                      {s.price && <span className="ll-mono" style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: accent, background: accent + "12", borderRadius: 8, padding: "3px 10px" }}>{s.price}</span>}
                    </div>
                    {s.tagline && <div style={{ fontSize: 12.5, color: "#6B7280", marginTop: 3 }}>{s.tagline}</div>}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "9px 18px", marginTop: 14 }}>
                  {(s.bullets || []).map((b) => (
                    <div key={b.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ marginTop: 2, flex: "0 0 auto" }}><Tick /></span>
                      <div style={{ fontSize: 11.5, lineHeight: 1.45, color: "#374151" }}>
                        {b.title && <b style={{ color: "#111827" }}>{b.title}</b>}{b.title && b.text ? " — " : ""}{b.text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Page>

      {/* ---- investment · reporting · access ---- */}
      <Page>
        <H kicker="Investment" title="Pricing" sub="Clear monthly pricing, no long-term lock-in. Ad spend is paid directly to the ad platforms." />
        <table className="pp-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: accent, color: "#fff" }}>
              <th style={{ textAlign: "left", padding: "9px 14px", fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", borderRadius: "8px 0 0 0" }}>Service</th>
              <th style={{ textAlign: "left", padding: "9px 14px", fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase" }}>Includes</th>
              <th style={{ textAlign: "right", padding: "9px 14px", fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", borderRadius: "0 8px 0 0" }}>Price</th>
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #E5E7EB" }}>
                <td style={{ padding: "11px 14px", fontWeight: 600, color: "#111827", verticalAlign: "top", width: 190 }}>{s.title}</td>
                <td style={{ padding: "11px 14px", color: "#4B5563", verticalAlign: "top", fontSize: 11.5 }}>{(s.bullets || []).map((b) => b.title).filter(Boolean).join(" · ")}</td>
                <td style={{ padding: "11px 14px", textAlign: "right", verticalAlign: "top", whiteSpace: "nowrap" }}>
                  <div className="ll-mono" style={{ fontWeight: 700, color: accent }}>{s.price || "—"}</div>
                  {s.priceNote && <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>{s.priceNote}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, marginTop: 40 }}>
          <div className="pp-keep">
            <div className="ll-display" style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 10 }}>How we report</div>
            <div style={{ display: "grid", gap: 8 }}>
              {(d.reporting || []).filter(Boolean).map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 8, fontSize: 11.5, lineHeight: 1.45, color: "#374151" }}><span style={{ marginTop: 2 }}><Tick /></span><span>{r}</span></div>
              ))}
            </div>
          </div>
          <div className="pp-keep">
            <div className="ll-display" style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 10 }}>Access we need</div>
            <div style={{ display: "grid", gap: 8 }}>
              {(d.access || []).filter(Boolean).map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 8, fontSize: 11.5, lineHeight: 1.45, color: "#374151" }}>
                  <span className="ll-mono" style={{ width: 18, flex: "0 0 auto", color: accent, fontWeight: 700 }}>{i + 1}.</span><span>{r}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Page>

      {/* ---- work checklist, one part per page ---- */}
      {(d.checklists || []).map((part, pi) => {
        const svc = services.find((s) => s.key === part.serviceKey);
        return (
          <Page key={part.id}>
            <H kicker={`Work checklist · part ${pi + 1} of ${d.checklists.length}${svc ? ` · ${svc.title}` : ""}`} title={part.title} sub={part.subtitle} />
            <table className="pp-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
              <thead>
                <tr style={{ background: "#F3F4F6" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "#6B7280", width: 190 }}>Task</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "#6B7280" }}>What gets done</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "#6B7280", width: 96 }}>Quantity</th>
                </tr>
              </thead>
              <tbody>
                {(part.groups || []).map((g) => (g.tasks || []).map((t, ti) => (
                  <tr key={t.id} style={{ borderBottom: "1px solid #EEF0F3", borderTop: ti === 0 ? "2px solid #E5E7EB" : undefined }}>
                    {ti === 0 && (
                      <td rowSpan={g.tasks.length} style={{ padding: "9px 12px", verticalAlign: "top", fontWeight: 700, color: accent, fontSize: 12, background: accent + "08" }}>{g.title}</td>
                    )}
                    <td style={{ padding: "7px 12px", color: "#1F2937", verticalAlign: "top" }}>
                      {t.text}
                      {(t.details || []).filter(Boolean).length > 0 && (
                        <div style={{ marginTop: 3, display: "grid", gap: 2 }}>
                          {t.details.filter(Boolean).map((x, i) => <div key={i} style={{ fontSize: 10.5, color: "#6B7280", display: "flex", gap: 6 }}><span style={{ color: accent }}>✓</span>{x}</div>)}
                        </div>
                      )}
                    </td>
                    <td className="ll-mono" style={{ padding: "7px 12px", textAlign: "right", verticalAlign: "top", whiteSpace: "nowrap", fontWeight: 600, color: t.qty ? "#111827" : accent }}>
                      {t.qty ? t.qty : <Check size={13} strokeWidth={3} style={{ display: "inline" }} />}
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </Page>
        );
      })}

      {/* ---- closing ---- */}
      <Page>
        <H kicker="Next steps" title="Let's get started" sub={d.closing} />
        <div style={{ display: "grid", gap: 10, marginTop: 6 }}>
          {[["1", "Approve this proposal", "Reply with a yes, or sign below."], ["2", "Share access", "The items on the access list; we guide you through each one."], ["3", "Kick-off call", "We confirm goals, keywords and service areas, then work begins."]].map(([n, t, s]) => (
            <div key={n} style={{ display: "flex", gap: 14, alignItems: "flex-start", border: "1px solid #E5E7EB", borderRadius: 12, padding: "12px 16px" }}>
              <span className="ll-display" style={{ fontSize: 20, fontWeight: 800, color: accent, lineHeight: 1 }}>{n}</span>
              <div><div style={{ fontWeight: 600, color: "#111827", fontSize: 13 }}>{t}</div><div style={{ fontSize: 11.5, color: "#6B7280", marginTop: 2 }}>{s}</div></div>
            </div>
          ))}
        </div>
        {d.showSignature !== false && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, marginTop: 70 }}>
            {[[business, d.preparedFor || "Authorized signature"], [company.name, d.preparedBy || "Authorized signature"]].map(([who, name]) => (
              <div key={who}>
                <div style={{ borderBottom: "1.5px solid #111827", height: 44 }} />
                <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", marginTop: 8 }}>{who}</div>
                <div style={{ fontSize: 11, color: "#6B7280" }}>{name} · Date: ____________</div>
              </div>
            ))}
          </div>
        )}
      </Page>
    </div>
  );
}

/* ---------------- small editor helpers ---------------- */
const Sec = ({ title, open, onToggle, children, right = null }) => (
  <div className="rounded-xl border border-gray-200 bg-white">
    <div className="flex w-full items-center gap-2 px-3.5 py-2.5">
      <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        {open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        <span className="ll-display text-[13px] font-semibold text-gray-800">{title}</span>
      </button>
      {right}
    </div>
    {open && <div className="space-y-3 border-t border-gray-100 px-3.5 py-3">{children}</div>}
  </div>
);
const Lines = ({ value = [], onChange, rows = 4, placeholder = "" }) => (
  <textarea rows={rows} value={(value || []).join("\n")} placeholder={placeholder}
    onChange={(e) => onChange(e.target.value.split("\n"))}
    onBlur={(e) => onChange(e.target.value.split("\n").map((x) => x.trim()).filter(Boolean))}
    className={inputCls + " leading-snug"} />
);
const IconBtn = ({ onClick, title, children, danger = false, disabled = false }) => (
  <button onClick={onClick} title={title} disabled={disabled} className={"shrink-0 rounded-md p-0.5 text-gray-400 disabled:opacity-30 " + (danger ? "hover:bg-red-50 hover:text-red-500" : "hover:bg-gray-100 hover:text-gray-700")}>{children}</button>
);
const Switch = ({ on, onChange, title }) => (
  <button onClick={() => onChange(!on)} title={title} className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors" style={{ background: on ? "#16A34A" : "#D1D5DB" }}>
    <span className="absolute h-4 w-4 rounded-full bg-white shadow transition-transform" style={{ transform: on ? "translateX(18px)" : "translateX(2px)" }} />
  </button>
);
const move = (arr, i, dir) => { const j = i + dir; if (j < 0 || j >= arr.length) return arr; const c = arr.slice(); [c[i], c[j]] = [c[j], c[i]]; return c; };

/* ---------------- the editor ---------------- */
function ProposalEditor({ company, clients, initial, onSave, onClose, onSaveTemplate }) {
  const [d, setD] = useState(initial);
  const set = (p) => setD((x) => ({ ...x, ...(typeof p === "function" ? p(x) : p) }));
  const [open, setOpen] = useState({ cover: true, services: false, checklist: false, extras: false });
  const tog = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const [svcOpen, setSvcOpen] = useState(null);
  const [partOpen, setPartOpen] = useState(null);
  const accent = d.accent || company.accent;
  const client = clients.find((c) => c.id === d.clientId);
  const clientName = client ? (client.companyName || client.name) : "";

  /* preview scale: the A4 page shrinks to the column it has */
  const colRef = useRef(null), docRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [docH, setDocH] = useState(1123);
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (colRef.current) setScale(Math.max(0.4, Math.min(1, (colRef.current.clientWidth - 40) / PAGE_W)));
      if (docRef.current) setDocH(docRef.current.scrollHeight);
    });
    if (colRef.current) ro.observe(colRef.current);
    if (docRef.current) ro.observe(docRef.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { if (docRef.current) setDocH(docRef.current.scrollHeight); }, [d]);

  const print = () => {
    const prev = document.title;
    document.title = `${d.title || "Proposal"} — ${d.business || clientName || company.name}`;
    const restore = () => { document.title = prev; window.removeEventListener("afterprint", restore); };
    window.addEventListener("afterprint", restore);
    setTimeout(restore, 60000);
    window.print();
  };

  /* service / checklist mutators */
  const patchSvc = (id, p) => set((x) => ({ services: x.services.map((s) => (s.id === id ? { ...s, ...(typeof p === "function" ? p(s) : p) } : s)) }));
  const patchPart = (id, p) => set((x) => ({ checklists: x.checklists.map((c) => (c.id === id ? { ...c, ...(typeof p === "function" ? p(c) : p) } : c)) }));
  const patchGroup = (pid, gid, p) => patchPart(pid, (c) => ({ groups: c.groups.map((g) => (g.id === gid ? { ...g, ...(typeof p === "function" ? p(g) : p) } : g)) }));
  const patchTask = (pid, gid, tid, p) => patchGroup(pid, gid, (g) => ({ tasks: g.tasks.map((t) => (t.id === tid ? { ...t, ...p } : t)) }));
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const reId = (part) => ({ ...part, id: uid("p"), groups: part.groups.map((g) => ({ ...g, id: uid("g"), tasks: g.tasks.map((t) => ({ ...t, id: uid("t") })) })) });

  const printCss = `
    .pp-print { display: none; }
    @media print {
      @page { size: A4; margin: 0; }
      html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
      #root { display: none !important; }
      .pp-print { display: block !important; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .pp-doc { width: 210mm !important; }
      .pp-page { width: 210mm !important; min-height: 296.5mm !important; box-sizing: border-box; page-break-after: always; break-after: page; box-shadow: none !important; }
      .pp-page.pp-cover { height: 296.5mm !important; overflow: hidden; }
      .pp-page:last-child { page-break-after: auto; break-after: auto; }
      .pp-keep, .pp-table tr { break-inside: avoid; page-break-inside: avoid; }
      .pp-table thead { display: table-header-group; }
      .pp-doc * { box-shadow: none !important; }
    }`;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-gray-100">
      <style>{printCss}</style>
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2.5">
        <button onClick={onClose} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-[12.5px] font-medium text-gray-600 hover:border-gray-300"><ArrowLeft size={14} /> All proposals</button>
        <span className="ll-display ml-1 text-[14px] font-semibold text-gray-800">{d.title || "Proposal"}</span>
        <span className="ll-mono text-[11px] text-gray-400">{d.no}</span>
        <span className="ml-auto flex items-center gap-2">
          <button onClick={async () => { if (await askConfirm({ title: "Save as the default template?", message: "New proposals will start from this proposal's services, checklist, reporting and access lists.", confirmLabel: "Save template" })) onSaveTemplate(templateOf(d)); }}
            className="rounded-xl border border-gray-200 px-3 py-2 text-[12px] font-semibold text-gray-600 hover:border-gray-300" title="New proposals start from these services and checklists">Save as default template</button>
          <button onClick={print} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-[12.5px] font-semibold text-gray-700 hover:border-gray-300"><Printer size={14} /> Download PDF</button>
          <button onClick={() => onSave(d)} className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-semibold text-white" style={{ background: accent }}><Save size={14} /> Save</button>
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* document preview */}
        <div ref={colRef} className="min-w-0 flex-1 overflow-auto p-5">
          <div style={{ width: PAGE_W * scale, height: docH * scale, margin: "0 auto" }}>
            <div ref={docRef} style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: PAGE_W }} className="pp-preview">
              <style>{`.pp-preview .pp-page { box-shadow: 0 2px 14px rgba(0,0,0,.08); margin-bottom: 20px; border-radius: 4px; }`}</style>
              <ProposalDoc d={d} company={company} clientName={clientName} />
            </div>
          </div>
        </div>

        {/* editor sidebar */}
        <div className="w-[460px] shrink-0 space-y-2.5 overflow-y-auto border-l border-gray-200 bg-gray-50 p-3">
          <Sec title="Cover" open={open.cover} onToggle={() => tog("cover")}>
            <Labeled label="Client">
              <select value={d.clientId} onChange={(e) => { const c = clients.find((x) => x.id === e.target.value); set({ clientId: e.target.value, business: c ? (c.companyName || c.name) : d.business, preparedFor: c?.contact || d.preparedFor }); }} className={inputCls + " bg-white"}>
                <option value="">— none —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.companyName || c.name}</option>)}
              </select>
            </Labeled>
            <Labeled label="Proposal title"><input value={d.title} onChange={(e) => set({ title: e.target.value })} className={inputCls} /></Labeled>
            <div className="grid grid-cols-2 gap-2">
              <Labeled label="Business name"><input value={d.business} onChange={(e) => set({ business: e.target.value })} className={inputCls} /></Labeled>
              <Labeled label="Contact person"><input value={d.preparedFor} onChange={(e) => set({ preparedFor: e.target.value })} className={inputCls} /></Labeled>
              <Labeled label="Prepared by"><input value={d.preparedBy} onChange={(e) => set({ preparedBy: e.target.value })} className={inputCls} /></Labeled>
              <Labeled label="Proposal no."><input value={d.no} onChange={(e) => set({ no: e.target.value })} className={inputCls + " ll-mono"} /></Labeled>
              <Labeled label="Date"><input type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} className={inputCls} /></Labeled>
              <Labeled label="Valid until"><input type="date" value={d.validUntil} onChange={(e) => set({ validUntil: e.target.value })} className={inputCls} /></Labeled>
            </div>
            <Labeled label="Your contact line (website · email · phone)"><input value={d.contact} onChange={(e) => set({ contact: e.target.value })} className={inputCls} /></Labeled>
            <Labeled label="Intro (cover)"><textarea rows={3} value={d.intro} onChange={(e) => set({ intro: e.target.value })} className={inputCls} /></Labeled>
            <Labeled label="Accent colour">
              <div className="flex items-center gap-2">
                <input type="color" value={d.accent || company.accent} onChange={(e) => set({ accent: e.target.value })} className="h-8 w-12 cursor-pointer rounded border border-gray-200" />
                <button onClick={() => set({ accent: company.accent })} className="text-[11px] font-semibold text-gray-500 hover:underline">Use brand colour</button>
              </div>
            </Labeled>
          </Sec>

          <Sec title="Services" open={open.services} onToggle={() => tog("services")}
            right={<button onClick={() => set({ services: DEFAULT_SERVICES() })} className="text-[10.5px] font-semibold text-gray-400 hover:text-gray-600">Reset</button>}>
            <div className="text-[10.5px] text-gray-400">Keep each point to one line: a client should get the idea in a few seconds. Turn a service off to leave it out of this proposal.</div>
            {d.services.map((s) => (
              <div key={s.id} className="rounded-lg border border-gray-200 bg-white">
                <div className="flex items-center gap-2 px-3 py-2">
                  <button onClick={() => setSvcOpen(svcOpen === s.id ? null : s.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                    {svcOpen === s.id ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
                    <span className={"truncate text-[12.5px] font-semibold " + (s.enabled === false ? "text-gray-400 line-through" : "text-gray-800")}>{s.title}</span>
                  </button>
                  <Switch on={s.enabled !== false} onChange={(v) => patchSvc(s.id, { enabled: v })} title={s.enabled === false ? "Include this service" : "Leave this service out"} />
                </div>
                {svcOpen === s.id && (
                  <div className="space-y-2 border-t border-gray-100 px-3 py-2.5">
                    <Labeled label="Title"><input value={s.title} onChange={(e) => patchSvc(s.id, { title: e.target.value })} className={inputCls} /></Labeled>
                    <Labeled label="One-line promise"><input value={s.tagline} onChange={(e) => patchSvc(s.id, { tagline: e.target.value })} className={inputCls} /></Labeled>
                    <div className="grid grid-cols-2 gap-2">
                      <Labeled label="Price"><input value={s.price} onChange={(e) => patchSvc(s.id, { price: e.target.value })} className={inputCls} placeholder="$500 / month" /></Labeled>
                      <Labeled label="Price note"><input value={s.priceNote} onChange={(e) => patchSvc(s.id, { priceNote: e.target.value })} className={inputCls} placeholder="Cancel anytime" /></Labeled>
                    </div>
                    <div className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">What's included</div>
                    {(s.bullets || []).map((b, bi) => (
                      <div key={b.id} className="rounded-lg border border-gray-100 bg-gray-50/60 p-2">
                        <div className="flex items-center gap-1">
                          <input value={b.title} placeholder="Point" onChange={(e) => patchSvc(s.id, (x) => ({ bullets: x.bullets.map((y) => (y.id === b.id ? { ...y, title: e.target.value } : y)) }))} className={inputCls + " font-semibold"} />
                          <IconBtn title="Move up" disabled={bi === 0} onClick={() => patchSvc(s.id, (x) => ({ bullets: move(x.bullets, bi, -1) }))}><ArrowUp size={12} /></IconBtn>
                          <IconBtn title="Move down" disabled={bi === s.bullets.length - 1} onClick={() => patchSvc(s.id, (x) => ({ bullets: move(x.bullets, bi, 1) }))}><ArrowDown size={12} /></IconBtn>
                          <IconBtn danger title="Remove" onClick={() => patchSvc(s.id, (x) => ({ bullets: x.bullets.filter((y) => y.id !== b.id) }))}><Trash2 size={12} /></IconBtn>
                        </div>
                        <input value={b.text} placeholder="One short line about it" onChange={(e) => patchSvc(s.id, (x) => ({ bullets: x.bullets.map((y) => (y.id === b.id ? { ...y, text: e.target.value } : y)) }))} className={inputCls + " mt-1 text-[12px]"} />
                      </div>
                    ))}
                    <button onClick={() => patchSvc(s.id, (x) => ({ bullets: [...(x.bullets || []), { id: uid("b"), title: "", text: "" }] }))} className="flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: accent }}><Plus size={12} /> Add point</button>
                  </div>
                )}
              </div>
            ))}
          </Sec>

          <Sec title={`Work checklist (${d.checklists.length} parts)`} open={open.checklist} onToggle={() => tog("checklist")}
            right={<button onClick={() => set({ checklists: DEFAULT_CHECKLISTS() })} className="text-[10.5px] font-semibold text-gray-400 hover:text-gray-600">Reset</button>}>
            <div className="text-[10.5px] text-gray-400">Each part prints on its own page. Leave the quantity empty for a plain check mark; type one ("8–15", "20", "All pages") when the amount matters.</div>
            {d.checklists.map((part, pi) => (
              <div key={part.id} className="rounded-lg border border-gray-200 bg-white">
                <div className="flex items-center gap-1 px-2.5 py-2">
                  <button onClick={() => setPartOpen(partOpen === part.id ? null : part.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                    {partOpen === part.id ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
                    <span className="truncate text-[12.5px] font-semibold text-gray-800">{part.title || `Part ${pi + 1}`}</span>
                    <span className="ll-mono text-[10px] text-gray-400">{part.groups.reduce((n, g) => n + g.tasks.length, 0)} rows</span>
                  </button>
                  <IconBtn title="Move up" disabled={pi === 0} onClick={() => set((x) => ({ checklists: move(x.checklists, pi, -1) }))}><ArrowUp size={12} /></IconBtn>
                  <IconBtn title="Move down" disabled={pi === d.checklists.length - 1} onClick={() => set((x) => ({ checklists: move(x.checklists, pi, 1) }))}><ArrowDown size={12} /></IconBtn>
                  <IconBtn title="Duplicate this part (same tasks, new title)" onClick={() => set((x) => { const c = reId(clone(part)); c.title = `${part.title} (copy)`; const i = x.checklists.findIndex((y) => y.id === part.id); const arr = x.checklists.slice(); arr.splice(i + 1, 0, c); return { checklists: arr }; })}><Copy size={12} /></IconBtn>
                  <IconBtn danger title="Delete part" onClick={async () => { if (await askDelete(`the checklist part "${part.title}"`)) set((x) => ({ checklists: x.checklists.filter((y) => y.id !== part.id) })); }}><Trash2 size={12} /></IconBtn>
                </div>
                {partOpen === part.id && (
                  <div className="space-y-2.5 border-t border-gray-100 px-2.5 py-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <Labeled label="Part title"><input value={part.title} onChange={(e) => patchPart(part.id, { title: e.target.value })} className={inputCls} placeholder="Month 01" /></Labeled>
                      <Labeled label="Subtitle"><input value={part.subtitle || ""} onChange={(e) => patchPart(part.id, { subtitle: e.target.value })} className={inputCls} placeholder="Setup and research" /></Labeled>
                    </div>
                    <Labeled label="Belongs to service">
                      <select value={part.serviceKey || ""} onChange={(e) => patchPart(part.id, { serviceKey: e.target.value })} className={inputCls + " bg-white"}>
                        <option value="">— general —</option>
                        {d.services.map((s) => <option key={s.id} value={s.key}>{s.title}</option>)}
                      </select>
                    </Labeled>
                    {part.groups.map((g, gi) => (
                      <div key={g.id} className="rounded-lg border border-gray-100 bg-gray-50/70 p-2">
                        <div className="flex items-center gap-1">
                          <input value={g.title} onChange={(e) => patchGroup(part.id, g.id, { title: e.target.value })} placeholder="Task group" className={inputCls + " font-semibold"} />
                          <IconBtn title="Move up" disabled={gi === 0} onClick={() => patchPart(part.id, (c) => ({ groups: move(c.groups, gi, -1) }))}><ArrowUp size={12} /></IconBtn>
                          <IconBtn title="Move down" disabled={gi === part.groups.length - 1} onClick={() => patchPart(part.id, (c) => ({ groups: move(c.groups, gi, 1) }))}><ArrowDown size={12} /></IconBtn>
                          <IconBtn danger title="Delete group" onClick={() => patchPart(part.id, (c) => ({ groups: c.groups.filter((y) => y.id !== g.id) }))}><Trash2 size={12} /></IconBtn>
                        </div>
                        <div className="mt-1.5 space-y-1">
                          {g.tasks.map((t, ti) => (
                            <TaskRow key={t.id} t={t} first={ti === 0} last={ti === g.tasks.length - 1} accent={accent}
                              onChange={(p) => patchTask(part.id, g.id, t.id, p)}
                              onMove={(dir) => patchGroup(part.id, g.id, (x) => ({ tasks: move(x.tasks, ti, dir) }))}
                              onDelete={() => patchGroup(part.id, g.id, (x) => ({ tasks: x.tasks.filter((y) => y.id !== t.id) }))} />
                          ))}
                        </div>
                        <button onClick={() => patchGroup(part.id, g.id, (x) => ({ tasks: [...x.tasks, { id: uid("t"), text: "", qty: "", details: [] }] }))} className="mt-1.5 flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: accent }}><Plus size={12} /> Add row</button>
                      </div>
                    ))}
                    <button onClick={() => patchPart(part.id, (c) => ({ groups: [...c.groups, { id: uid("g"), title: "", tasks: [{ id: uid("t"), text: "", qty: "", details: [] }] }] }))} className="flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: accent }}><Plus size={12} /> Add task group</button>
                  </div>
                )}
              </div>
            ))}
            <button onClick={() => set((x) => ({ checklists: [...x.checklists, { id: uid("p"), title: `Month ${String(x.checklists.length + 1).padStart(2, "0")}`, subtitle: "", serviceKey: "seo", groups: [{ id: uid("g"), title: "", tasks: [{ id: uid("t"), text: "", qty: "", details: [] }] }] }] }))}
              className="flex items-center gap-1 text-[12px] font-semibold" style={{ color: accent }}><Plus size={13} /> Add part</button>
          </Sec>

          <Sec title="Reporting, access & closing" open={open.extras} onToggle={() => tog("extras")}
            right={<button onClick={() => set({ reporting: DEFAULT_REPORTING(), access: DEFAULT_ACCESS(), closing: DEFAULT_CLOSING, intro: DEFAULT_INTRO })} className="text-[10.5px] font-semibold text-gray-400 hover:text-gray-600">Reset</button>}>
            <Labeled label="How we report (one per line)"><Lines value={d.reporting} onChange={(v) => set({ reporting: v })} rows={5} /></Labeled>
            <Labeled label="Access we need (one per line)"><Lines value={d.access} onChange={(v) => set({ access: v })} rows={5} /></Labeled>
            <Labeled label="Closing note"><textarea rows={3} value={d.closing} onChange={(e) => set({ closing: e.target.value })} className={inputCls} /></Labeled>
            <Toggle on={d.showSignature !== false} onChange={(v) => set({ showSignature: v })} label="Acceptance signature lines" desc="Two signature lines on the last page: the client and you." />
          </Sec>
        </div>
      </div>

      {/* print copy, paginated by the browser */}
      {createPortal(<div className="pp-print ll-root"><ProposalDoc d={d} company={company} clientName={clientName} /></div>, document.body)}
    </div>
  );
}

function TaskRow({ t, first, last, accent, onChange, onMove, onDelete }) {
  const [more, setMore] = useState(false);
  return (
    <div className="rounded-md border border-gray-200 bg-white px-1.5 py-1">
      <div className="flex items-center gap-1">
        <input value={t.text} placeholder="What gets done" onChange={(e) => onChange({ text: e.target.value })} className="min-w-0 flex-1 rounded-md border border-transparent px-1.5 py-1 text-[12px] hover:border-gray-200 focus:border-gray-300 focus:outline-none" />
        <input value={t.qty} placeholder="qty" title="Quantity — empty prints a check mark" onChange={(e) => onChange({ qty: e.target.value })}
          className="ll-mono w-[64px] shrink-0 rounded-md border border-gray-200 px-1.5 py-1 text-right text-[11px]" style={t.qty ? { borderColor: accent + "80", color: "#111827" } : {}} />
        <IconBtn title={more ? "Hide details" : "Details under this row"} onClick={() => setMore(!more)}><ChevronDown size={12} style={{ transform: more ? "rotate(180deg)" : "", color: (t.details || []).filter(Boolean).length ? accent : undefined }} /></IconBtn>
        <IconBtn title="Move up" disabled={first} onClick={() => onMove(-1)}><ArrowUp size={12} /></IconBtn>
        <IconBtn title="Move down" disabled={last} onClick={() => onMove(1)}><ArrowDown size={12} /></IconBtn>
        <IconBtn danger title="Remove row" onClick={onDelete}><Trash2 size={12} /></IconBtn>
      </div>
      {more && <div className="px-1 pb-1 pt-1"><Lines value={t.details || []} onChange={(v) => onChange({ details: v })} rows={3} placeholder={"Sub-points, one per line\ne.g. 150–200 words per post"} /></div>}
    </div>
  );
}

/* ---------------- the list in Company Settings ---------------- */
export function ProposalSection({ company, onChange, clients }) {
  const saved = company.proposals || [];
  const [editing, setEditing] = useState(null);
  const accent = company.accent;
  const nameOf = (p) => { const c = clients.find((x) => x.id === p.clientId); return p.business || (c ? (c.companyName || c.name) : "—"); };
  const save = (d) => {
    const rec = { ...d, updatedAt: Date.now() };
    onChange({ proposals: saved.some((x) => x.id === rec.id) ? saved.map((x) => (x.id === rec.id ? rec : x)) : [rec, ...saved] });
    setEditing(rec);
  };
  const remove = async (p) => { if (await askDelete(`the proposal for ${nameOf(p)}`)) onChange({ proposals: saved.filter((x) => x.id !== p.id) }); };
  const duplicate = (p) => {
    const c = JSON.parse(JSON.stringify(p));
    c.id = uid("pp"); c.no = `P-${new Date().getFullYear()}-${String(saved.length + 1).padStart(3, "0")}`; c.createdAt = Date.now(); delete c.updatedAt;
    onChange({ proposals: [c, ...saved] });
  };
  const hasTpl = !!company.proposalTemplate;

  if (editing) return (
    <ProposalEditor company={company} clients={clients} initial={editing} onSave={save} onClose={() => setEditing(null)}
      onSaveTemplate={(tpl) => onChange({ proposalTemplate: tpl })} />
  );
  return (
    <div className="ll-fade space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-5">
        <div className="min-w-0 flex-1">
          <div className="ll-display flex items-center gap-2 text-[16px] font-semibold"><FileSignature size={16} style={{ color: accent }} /> Proposal template</div>
          <div className="mt-0.5 text-[11.5px] text-gray-400">
            Client proposals: cover, the three services in short, pricing, reporting and access, then the detailed work checklist with quantities. Edit on the right, the PDF is on the left.
            {hasTpl ? " New proposals start from your saved template." : " New proposals start from the built-in template until you save your own."}
          </div>
        </div>
        {hasTpl && <button onClick={async () => { if (await askConfirm({ title: "Go back to the built-in template?", message: "Your saved default is removed; existing proposals are not changed.", confirmLabel: "Reset" })) onChange({ proposalTemplate: null }); }} className="rounded-xl border border-gray-200 px-3 py-2 text-[12px] font-semibold text-gray-500 hover:border-gray-300">Reset default template</button>}
        <button onClick={() => setEditing(blankProposal(company, clients))} className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-semibold text-white" style={{ background: accent }}><Plus size={14} /> New proposal</button>
      </Card>
      {saved.length === 0 && <Card className="p-8 text-center text-[13px] text-gray-400">No proposals yet. Create one, pick the client and adjust the services and checklist; download it as a PDF when it reads right.</Card>}
      <div className="grid gap-3 md:grid-cols-2">
        {saved.map((p) => (
          <Card key={p.id} className="flex items-start gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: (p.accent || accent) + "14", color: p.accent || accent }}><FileSignature size={18} /></div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-semibold text-gray-800">{nameOf(p)}</div>
              <div className="truncate text-[11.5px] text-gray-500">{p.title}</div>
              <div className="ll-mono mt-1 flex flex-wrap gap-x-2 text-[10px] text-gray-400">
                <span>{p.no}</span><span>{fmtLongDate(p.date)}</span>
                <span>{(p.services || []).filter((s) => s.enabled !== false).map((s) => s.title).join(" · ")}</span>
                <span>{(p.checklists || []).length} checklist parts</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button onClick={() => setEditing(p)} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11.5px] font-semibold text-gray-700 hover:border-gray-300">Open</button>
              <button onClick={() => duplicate(p)} title="Duplicate" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Copy size={14} /></button>
              <button onClick={() => remove(p)} title="Delete" className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 size={14} /></button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
