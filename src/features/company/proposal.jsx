/* =====================================================================
   PROPOSAL TEMPLATE — Company Settings → Proposal template.

   List of saved proposals → a full-screen editor: the A4 document on the
   left (what the prospect receives, also what prints), the editor sidebar
   on the right. The document is an ordered list of sections (cover ·
   services at a glance · pricing · reporting & access · one page per
   checklist month · next steps) that can be edited, hidden and moved.
   Services carry packages (Basic / Growth …) compared side by side; the
   checklist is one general set of months whose rows say which packages
   include them. {business}, {niche} and {website} are filled from the
   sidebar. The SERP Squad AI box rewrites the editable parts on command.
   Printing renders the same document into a portal at the body root so
   the browser paginates it on its own (A4, no app chrome).
   ===================================================================== */
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft, ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Copy, Eye, EyeOff, FileSignature, Layout, Megaphone, Pencil, Plus, Printer, RefreshCw, Save, Search, Sparkles, Trash2, Undo2,
} from "lucide-react";
import { Card, Labeled, Toggle, askConfirm, askDelete, inputCls } from "../../ui/primitives.jsx";
import { aiGenerate } from "../../lib/aiwrite.jsx";
import {
  BRAND_BLUE, DEFAULT_ACCESS, DEFAULT_CHECKLISTS, DEFAULT_CLOSING, DEFAULT_INTRO, DEFAULT_REPORTING, DEFAULT_SERVICES, DEFAULT_STEPS, DEFAULT_TEXTS, FIXED_SECTIONS,
  blankProposal, cellOf, editableOf, fill, fmtLongDate, layoutOf, mergeAiEdit, packagesOf, templateOf, uid,
} from "../../lib/proposal.js";

const ICONS = { seo: Search, ads: Megaphone, web: Layout };
const PAGE_W = 794; // A4 at 96dpi

/* the cover band: the website hero's gradient for the brand blue, a
   two-tone gradient of whatever colour the agency picks otherwise */
const shade = (hex, f) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v + (f > 0 ? (255 - v) * f : v * f))));
  return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, "0")).join("");
};
const coverBg = (accent) => accent.toLowerCase() === BRAND_BLUE
  ? "radial-gradient(900px 620px at 88% 8%, rgba(53,223,212,0.75), transparent 55%), radial-gradient(820px 640px at 0% 100%, rgba(139,63,240,0.8), transparent 55%), linear-gradient(120deg, #1fa3ee, #2b7ff0 55%, #35c6e8)"
  : `radial-gradient(700px 500px at 90% 5%, ${shade(accent, 0.45)}, transparent 55%), linear-gradient(120deg, ${shade(accent, -0.25)}, ${accent} 55%, ${shade(accent, 0.2)})`;

/* the packages a checklist part compares: the chosen ones, else all of its service's */
export const partColumns = (part, services) => {
  const svc = services.find((x) => x.key === part.serviceKey);
  if (!svc) return { svc: null, cols: [] };
  const pk = packagesOf(svc);
  if (pk.length <= 1 || pk[0].single) return { svc, cols: [] };
  const chosen = Array.isArray(part.compare) && part.compare.length ? pk.filter((p) => part.compare.includes(p.id)) : pk;
  return { svc, cols: chosen.length ? chosen : pk };
};

/* ---------------- the document ---------------- */
function ProposalDoc({ d, company }) {
  const accent = d.accent || BRAND_BLUE;
  const f = (t) => fill(t, d);
  const services = (d.services || []).filter((s) => s.enabled !== false);
  const business = (d.business || "").trim() || "your business";
  const texts = { ...DEFAULT_TEXTS(), ...Object.fromEntries(["coverTag", "servicesIntro", "pricingNote", "closingTitle"].filter((k) => d[k] != null).map((k) => [k, d[k]])) };
  const Page = ({ children, cover = false }) => (
    <div className={`pp-page ${cover ? "pp-cover" : ""}`}
      style={{ width: PAGE_W, minHeight: 1123, background: "#fff", padding: cover ? 0 : "60px 56px 52px", boxSizing: "border-box", position: "relative" }}>
      {children}
      {!cover && (
        <div className="pp-foot" style={{ position: "absolute", left: 56, right: 56, bottom: 26, display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "#9CA3AF" }}>
          <span>{company.name}{d.contact ? ` · ${d.contact}` : ""}</span>
          <span>{f(d.title)}</span>
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
  const bubble = (src, left, top, size = 54) => (
    <img src={src} alt="" width={size} height={size} style={{ position: "absolute", left, top, width: size, height: size, borderRadius: "50%", boxShadow: "0 12px 30px rgba(10,40,100,0.25)", background: "#fff" }} />
  );
  const th = (extra) => ({ padding: "8px 10px", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "#6B7280", ...extra });
  const Details = ({ t }) => ((t.details || []).filter(Boolean).length > 0 ? (
    <div style={{ marginTop: 2, display: "grid", gap: 1 }}>
      {t.details.filter(Boolean).map((x, i) => <div key={i} style={{ fontSize: 10, color: "#6B7280", display: "flex", gap: 5 }}><span style={{ color: accent }}>✓</span>{f(x)}</div>)}
    </div>
  ) : null);
  const Cell = ({ v }) => (v == null ? <span style={{ color: "#D1D5DB" }}>—</span> : v ? <span style={{ color: "#111827" }}>{v}</span> : <Check size={13} strokeWidth={3} style={{ display: "inline", color: accent }} />);

  const sections = layoutOf(d);
  const partNo = (id) => { const ps = sections.filter((k) => k.startsWith("part:")); return [ps.indexOf(`part:${id}`) + 1, ps.length]; };

  const renderCover = () => (
    <Page key="cover" cover>
      <div style={{ height: 1123, display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
        <div style={{ position: "relative", overflow: "hidden", background: coverBg(accent), color: "#fff", padding: "50px 56px 46px", flex: "0 0 auto", minHeight: 470 }}>
          {/* soft circle + rings + floating platform icons, as on the website */}
          <div style={{ position: "absolute", right: "-8%", top: "4%", width: 420, height: 420, borderRadius: "50%", background: "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.35), rgba(255,255,255,0.08) 60%)", filter: "blur(2px)" }} />
          <div style={{ position: "absolute", right: -120, bottom: -160, width: 420, height: 420, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.25)", boxShadow: "0 0 0 50px rgba(255,255,255,0.05), 0 0 0 110px rgba(255,255,255,0.04)" }} />
          {bubble("/proposal/google.webp", 470, 150)}
          {bubble("/proposal/maps.webp", 560, 92, 48)}
          {bubble("/proposal/gbp.webp", 650, 170, 58)}
          {bubble("/proposal/facebook.webp", 580, 262, 44)}
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
            {company.logo
              ? <img src={company.logo} alt="" style={{ height: 34, maxWidth: 170, objectFit: "contain", filter: "brightness(0) invert(1)" }} />
              : <span className="ll-display" style={{ fontSize: 18, fontWeight: 700 }}>{company.name}</span>}
            <span className="ll-mono" style={{ marginLeft: "auto", fontSize: 10, letterSpacing: 2, opacity: 0.85 }}>PROPOSAL{d.no ? ` · ${d.no}` : ""}</span>
          </div>
          <div style={{ position: "relative", marginTop: 150, maxWidth: 420 }}>
            {texts.coverTag && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 999, padding: "5px 12px", fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#35dfd4", boxShadow: "0 0 0 4px rgba(53,223,212,0.35)" }} /> {f(texts.coverTag)}
              </div>
            )}
            <div className="ll-mono" style={{ fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase", opacity: 0.8, marginTop: 22 }}>Prepared for</div>
            <div className="ll-display" style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.12, marginTop: 6, textShadow: "0 2px 12px rgba(0,0,0,0.12)" }}>{business}</div>
            {(d.preparedFor || d.niche || d.website) && <div style={{ fontSize: 13, opacity: 0.9, marginTop: 8 }}>{[d.preparedFor && `Attn. ${d.preparedFor}`, d.niche, d.website && String(d.website).replace(/^https?:\/\//, "").replace(/\/$/, "")].filter(Boolean).join(" · ")}</div>}
          </div>
        </div>
        <div style={{ padding: "48px 56px 0", flex: "1 1 auto", display: "flex", flexDirection: "column" }}>
          <div className="ll-display" style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.08, letterSpacing: -0.5, color: "#0e1b33", maxWidth: 640 }}>{f(d.title)}</div>
          {d.intro && <div style={{ fontSize: 14, lineHeight: 1.6, color: "#55617c", marginTop: 16, maxWidth: 580 }}>{f(d.intro)}</div>}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 24 }}>
            {services.map((s) => (
              <span key={s.id} style={{ border: `1.5px solid ${accent}`, color: accent, borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 600 }}>{f(s.title)}</span>
            ))}
          </div>
          <div style={{ marginTop: "auto", paddingBottom: 46, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18, borderTop: "1px solid #dfe7f3", paddingTop: 22 }}>
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
  );

  const renderServices = () => (
    <Page key="services">
      <H kicker="What's included" title="Services at a glance" sub={f(texts.servicesIntro)} />
      <div style={{ display: "grid", gap: 16 }}>
        {services.map((s, i) => {
          const Icon = ICONS[s.key] || Search;
          const pk = packagesOf(s);
          return (
            <div key={s.id} className="pp-keep" style={{ border: "1px solid #E5E7EB", borderRadius: 14, padding: "18px 20px", background: "#fff" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 10, background: accent + "14", color: accent, alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}><Icon size={17} /></span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                    <span className="ll-display" style={{ fontSize: 17, fontWeight: 700, color: "#111827" }}>{String(i + 1).padStart(2, "0")} · {f(s.title)}</span>
                    {pk.length === 1 && pk[0].price && <span className="ll-mono" style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: accent, background: accent + "12", borderRadius: 8, padding: "3px 10px" }}>{pk[0].price}</span>}
                    {pk.length > 1 && <span className="ll-mono" style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 700, color: accent, background: accent + "12", borderRadius: 8, padding: "3px 10px" }}>{pk.length} packages</span>}
                  </div>
                  {s.tagline && <div style={{ fontSize: 12.5, color: "#6B7280", marginTop: 3 }}>{f(s.tagline)}</div>}
                </div>
              </div>
              {pk.length <= 1 ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "9px 18px", marginTop: 14 }}>
                  {(pk[0]?.bullets || []).map((b) => (
                    <div key={b.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ marginTop: 2, flex: "0 0 auto" }}><Tick /></span>
                      <div style={{ fontSize: 11.5, lineHeight: 1.45, color: "#374151" }}>
                        {b.title && <b style={{ color: "#111827" }}>{f(b.title)}</b>}{b.title && b.text ? " — " : ""}{f(b.text)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (() => {
                /* several packages: one comparison table, a column per package */
                const rows = [];
                pk.forEach((p) => (p.bullets || []).forEach((b) => { const k = f(b.title).trim().toLowerCase(); if (k && !rows.some((r) => r.k === k)) rows.push({ k, title: f(b.title), text: f(b.text) }); }));
                const cell = (p, r) => (p.bullets || []).find((b) => f(b.title).trim().toLowerCase() === r.k);
                return (
                  <table className="pp-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 14 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 9.5, letterSpacing: 1, textTransform: "uppercase", color: "#9CA3AF", borderBottom: "1px solid #E5E7EB" }}>What's included</th>
                        {pk.map((p, j) => (
                          <th key={p.id} style={{ textAlign: "center", padding: "6px 8px", width: 118, borderBottom: "1px solid #E5E7EB", background: j === pk.length - 1 ? accent + "0D" : "transparent", borderRadius: "8px 8px 0 0" }}>
                            <div className="ll-display" style={{ fontSize: 12.5, fontWeight: 700, color: "#111827" }}>{p.name || "Package"}</div>
                            <div className="ll-mono" style={{ fontSize: 10.5, fontWeight: 700, color: accent }}>{p.price}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.k} style={{ borderBottom: "1px solid #EEF0F3" }}>
                          <td style={{ padding: "6px 8px", verticalAlign: "top" }}>
                            <b style={{ color: "#111827" }}>{r.title}</b>
                            {r.text && <div style={{ fontSize: 10.5, color: "#6B7280", lineHeight: 1.4 }}>{r.text}</div>}
                          </td>
                          {pk.map((p, j) => {
                            const b = cell(p, r);
                            const same = b && f(b.text).trim() === r.text.trim();
                            return (
                              <td key={p.id} style={{ padding: "6px 8px", textAlign: "center", verticalAlign: "top", background: j === pk.length - 1 ? accent + "0D" : "transparent" }}>
                                {!b ? <span style={{ color: "#D1D5DB" }}>—</span> : same || !f(b.text).trim() ? <Tick /> : <span style={{ fontSize: 10.5, color: "#111827", fontWeight: 600, lineHeight: 1.35, display: "block", textAlign: "left" }}>{f(b.text)}</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          );
        })}
      </div>
    </Page>
  );

  const renderPricing = () => (
    <Page key="pricing">
      <H kicker="Investment" title="Pricing" sub={f(texts.pricingNote)} />
      <table className="pp-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr style={{ background: accent, color: "#fff" }}>
            <th style={{ textAlign: "left", padding: "9px 14px", fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", borderRadius: "8px 0 0 0" }}>Service</th>
            <th style={{ textAlign: "left", padding: "9px 14px", fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase" }}>Includes</th>
            <th style={{ textAlign: "right", padding: "9px 14px", fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", borderRadius: "0 8px 0 0" }}>Price</th>
          </tr>
        </thead>
        <tbody>
          {services.flatMap((s) => packagesOf(s).map((p) => (
            <tr key={s.id + p.id} style={{ borderBottom: "1px solid #E5E7EB" }}>
              <td style={{ padding: "11px 14px", fontWeight: 600, color: "#111827", verticalAlign: "top", width: 190 }}>{f(s.title)}{p.name ? <div style={{ fontSize: 11, color: accent, fontWeight: 700 }}>{p.name}</div> : null}</td>
              <td style={{ padding: "11px 14px", color: "#4B5563", verticalAlign: "top", fontSize: 11.5 }}>{(p.bullets || []).map((b) => f(b.title)).filter(Boolean).join(" · ")}</td>
              <td style={{ padding: "11px 14px", textAlign: "right", verticalAlign: "top", whiteSpace: "nowrap" }}>
                <div className="ll-mono" style={{ fontWeight: 700, color: accent }}>{p.price || "—"}</div>
                {p.priceNote && <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>{p.priceNote}</div>}
              </td>
            </tr>
          )))}
        </tbody>
      </table>
    </Page>
  );

  const renderExtras = () => (
    <Page key="extras">
      <H kicker="Working together" title="Reporting & access" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
        <div className="pp-keep">
          <div className="ll-display" style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 10 }}>How we report</div>
          <div style={{ display: "grid", gap: 8 }}>
            {(d.reporting || []).filter(Boolean).map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 8, fontSize: 11.5, lineHeight: 1.45, color: "#374151" }}><span style={{ marginTop: 2 }}><Tick /></span><span>{f(r)}</span></div>
            ))}
          </div>
        </div>
        <div className="pp-keep">
          <div className="ll-display" style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 10 }}>Access we need</div>
          <div style={{ display: "grid", gap: 8 }}>
            {(d.access || []).filter(Boolean).map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 8, fontSize: 11.5, lineHeight: 1.45, color: "#374151" }}>
                <span className="ll-mono" style={{ width: 18, flex: "0 0 auto", color: accent, fontWeight: 700 }}>{i + 1}.</span><span>{f(r)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Page>
  );

  /* a checklist month: one table, a column per compared package (✓ /
     quantity / —) like the services summary; a single column when the
     service has one package (or one is chosen) */
  const renderPart = (part) => {
    const { svc, cols } = partColumns(part, services);
    const [n, of] = partNo(part.id);
    const multi = cols.length > 1;
    const one = cols.length === 1 ? cols[0] : null;
    const last = cols.length - 1;
    const label = [svc && f(svc.title), multi ? cols.map((c) => c.name || "package").join(" vs ") : one ? `${one.name || "package"}${one.price ? ` · ${one.price}` : ""}` : ""].filter(Boolean).join(" · ");
    const vis = (t) => (one ? cellOf(t, one.id) !== null : multi ? cols.some((c) => cellOf(t, c.id) !== null) : true);
    return (
      <Page key={"part:" + part.id}>
        <H kicker={`Work checklist · part ${n} of ${of}${label ? ` · ${label}` : ""}`} title={f(part.title)} sub={f(part.subtitle)} />
        <table className="pp-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: multi ? 11 : 11.5 }}>
          <thead>
            <tr style={{ background: "#F3F4F6" }}>
              <th style={th({ textAlign: "left", width: multi ? 150 : 190 })}>Task</th>
              <th style={th({ textAlign: "left" })}>What gets done</th>
              {multi ? cols.map((c, j) => (
                <th key={c.id} style={th({ textAlign: "center", width: 92, background: j === last ? accent + "14" : undefined })}>
                  <div className="ll-display" style={{ fontSize: 11.5, fontWeight: 700, color: "#111827", textTransform: "none", letterSpacing: 0 }}>{c.name || "Package"}</div>
                  <div className="ll-mono" style={{ fontSize: 9.5, fontWeight: 700, color: accent, textTransform: "none", letterSpacing: 0 }}>{c.price}</div>
                </th>
              )) : <th style={th({ textAlign: "right", width: 96 })}>Quantity</th>}
            </tr>
          </thead>
          <tbody>
            {(part.groups || []).map((g) => {
              const tasks = (g.tasks || []).filter(vis);
              return tasks.map((t, ti) => (
                <tr key={t.id} style={{ borderBottom: "1px solid #EEF0F3", borderTop: ti === 0 ? "2px solid #E5E7EB" : undefined }}>
                  {ti === 0 && <td rowSpan={tasks.length} style={{ padding: "9px 10px", verticalAlign: "top", fontWeight: 700, color: accent, fontSize: 11.5, background: accent + "08" }}>{f(g.title)}</td>}
                  <td style={{ padding: "6px 10px", color: "#1F2937", verticalAlign: "top" }}>{f(t.text)}<Details t={t} /></td>
                  {multi ? cols.map((c, j) => (
                    <td key={c.id} className="ll-mono" style={{ padding: "6px 8px", textAlign: "center", verticalAlign: "top", whiteSpace: "nowrap", fontWeight: 600, fontSize: 10.5, background: j === last ? accent + "08" : undefined }}>
                      <Cell v={cellOf(t, c.id)} />
                    </td>
                  )) : (
                    <td className="ll-mono" style={{ padding: "6px 10px", textAlign: "right", verticalAlign: "top", whiteSpace: "nowrap", fontWeight: 600 }}>
                      <Cell v={one ? cellOf(t, one.id) : String(t.qty || "")} />
                    </td>
                  )}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </Page>
    );
  };

  const renderClosing = () => (
    <Page key="closing">
      <H kicker="Next steps" title={f(texts.closingTitle)} sub={f(d.closing)} />
      <div style={{ display: "grid", gap: 10, marginTop: 6 }}>
        {(d.steps || []).map((st, i) => (
          <div key={st.id || i} style={{ display: "flex", gap: 14, alignItems: "flex-start", border: "1px solid #E5E7EB", borderRadius: 12, padding: "12px 16px" }}>
            <span className="ll-display" style={{ fontSize: 20, fontWeight: 800, color: accent, lineHeight: 1 }}>{i + 1}</span>
            <div><div style={{ fontWeight: 600, color: "#111827", fontSize: 13 }}>{f(st.title)}</div><div style={{ fontSize: 11.5, color: "#6B7280", marginTop: 2 }}>{f(st.text)}</div></div>
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
  );

  return (
    <div className="pp-doc ll-root" style={{ width: PAGE_W, color: "#18202F" }}>
      {sections.map((k) => {
        if (k === "cover") return renderCover();
        if (k === "services") return renderServices();
        if (k === "pricing") return renderPricing();
        if (k === "extras") return renderExtras();
        if (k === "closing") return renderClosing();
        const part = (d.checklists || []).find((p) => `part:${p.id}` === k);
        return part ? renderPart(part) : null;
      })}
    </div>
  );
}

/* ---------------- small editor helpers ---------------- */
const Sec = ({ id, title, open, onToggle, children, right = null }) => (
  <div className="rounded-xl border border-gray-200 bg-white" data-sec={id}>
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

/* ---------------- SERP Squad AI: edit the proposal on command ---------------- */
const AI_SYSTEM = `You edit a marketing agency's client proposal. You receive the proposal as JSON and an instruction from the agency.
Return ONLY a JSON object (no prose, no code fences) containing the keys you changed, chosen from: title, intro, coverTag, servicesIntro, pricingNote, closingTitle, steps, services, checklists, reporting, access, closing. Return a key with its COMPLETE new value (whole arrays), never a fragment.
Keep every existing "id" and "key" value; give new items an id of your own. Keep the shapes exactly:
services[] = { id, key ("seo"|"ads"|"web"), enabled, title, tagline, price, priceNote, bullets: [{ id, title, text }], packages: [{ id, name, price, priceNote, bullets: [{ id, title, text }] }] }
  (a service with packages keeps price/bullets empty at the service level; packages are compared side by side, so give them the same point titles and differ in the text, e.g. "5 articles" vs "8 articles")
checklists[] = { id, title, subtitle, serviceKey, compare: [packageId], groups: [{ id, title, tasks: [{ id, text, qty, details: [string], only: [packageId], qtyBy: { packageId: qty } }] }] }
  (the checklist is ONE set of months for all packages: a row with only = ["seo-growth"] is included by that package alone; qtyBy gives a package its own quantity; compare = [] compares every package)
steps[] = { id, title, text }. reporting and access are arrays of strings. qty is a short string ("8–15", "20", "All pages") or "" for a plain check mark.
Writing rules: short and concrete, plain words a business owner understands, no hype, no em dashes, at most one line per service point. You may use the placeholders {business}, {niche} and {website}: they are replaced with the prospect's details.`;
const QUICK = [
  ["Tailor to this business", "Rewrite the service taglines, points, checklist subtitles and the intro so they speak to {business} in the {niche} niche: mention the kinds of customers, services and searches typical for that niche. Keep prices and quantities."],
  ["Shorter points", "Make every service point and checklist row shorter and plainer without losing meaning. Keep ids, prices and quantities."],
  ["Add Month 04", "Add a fourth checklist part, 'Month 04', in the same style as the existing months: re-optimization, posts, pages, citations, guest posts and social media for the Growth package only, off-page work with sensible quantities, monthly reporting."],
];
function AiBox({ ai, d, onApply }) {
  const [cmd, setCmd] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const run = async (instruction) => {
    const text = (instruction || cmd).trim();
    if (!text) return;
    setBusy(true); setMsg(null);
    try {
      const prompt = `Prospect: business "${d.business || "(not set)"}", niche "${d.niche || "(not set)"}", website "${d.website || "(not set)"}".\n\nInstruction: ${text}\n\nCurrent proposal JSON:\n${JSON.stringify(editableOf(d))}`;
      const out = await aiGenerate(ai, { system: AI_SYSTEM, prompt, json: true });
      let obj = null;
      try { obj = JSON.parse(String(out).replace(/^```(?:json)?\s*|\s*```$/g, "").trim()); }
      catch { const m = String(out).match(/\{[\s\S]*\}/); obj = m ? JSON.parse(m[0]) : null; }
      if (!obj || typeof obj !== "object") throw new Error("The AI did not return a usable edit.");
      const keys = Object.keys(obj).filter((k) => ["title", "intro", "coverTag", "servicesIntro", "pricingNote", "closingTitle", "steps", "services", "checklists", "reporting", "access", "closing"].includes(k));
      if (!keys.length) throw new Error("The AI changed nothing it is allowed to change.");
      onApply(obj);
      setMsg({ ok: true, text: `Updated ${keys.join(", ")}. Undo is at the top if it went too far.` });
      setCmd("");
    } catch (e) { setMsg({ ok: false, text: e?.code === 503 ? "Connect an AI provider in API settings first." : String(e?.message || e) }); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded-xl border bg-white p-3" style={{ borderColor: "#C7D2FE" }}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-gray-800"><Sparkles size={14} className="text-indigo-500" /> SERP Squad AI</div>
      {!ai ? <div className="text-[11px] text-amber-700">No AI provider is connected. Add one in API settings and the assistant can rewrite this proposal on command.</div> : (
        <>
          <textarea rows={2} value={cmd} onChange={(e) => setCmd(e.target.value)} disabled={busy}
            placeholder={'e.g. "make the SEO service about emergency plumbing", "reduce Month 02 to 20 rows", "translate everything to French"'}
            className={inputCls + " text-[12px]"} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(); }} />
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {QUICK.map(([label, ins]) => (
              <button key={label} disabled={busy} onClick={() => run(ins)} className="rounded-full border border-gray-200 px-2.5 py-1 text-[10.5px] font-semibold text-gray-600 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50">{label}</button>
            ))}
            <button onClick={() => run()} disabled={busy || !cmd.trim()} className="ml-auto flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-50">
              {busy ? <><RefreshCw size={12} className="animate-spin" /> Working…</> : <><Sparkles size={12} /> Apply</>}
            </button>
          </div>
          {msg && <div className={"mt-1.5 text-[11px] " + (msg.ok ? "text-emerald-700" : "text-amber-700")}>{msg.text}</div>}
        </>
      )}
    </div>
  );
}

/* ---------------- document sections: order, hide, bring back ---------------- */
function SectionsPanel({ d, set, onEdit }) {
  const layout = layoutOf(d);
  const nameOf = (k) => (k.startsWith("part:") ? ((d.checklists || []).find((p) => `part:${p.id}` === k)?.title || "Month") : FIXED_SECTIONS[k]);
  const hidden = Object.keys(FIXED_SECTIONS).filter((k) => !layout.includes(k));
  const [open, setOpen] = useState(true);
  const setLayout = (next) => set({ layout: next });
  const remove = async (k) => {
    if (k.startsWith("part:")) {
      const part = (d.checklists || []).find((p) => `part:${p.id}` === k);
      if (!await askDelete(`the checklist month "${part?.title || "this month"}"`)) return;
      set((x) => ({ checklists: x.checklists.filter((p) => p.id !== part.id), layout: layoutOf(x).filter((y) => y !== k) }));
    } else setLayout(layout.filter((y) => y !== k));
  };
  return (
    <Sec id="sections" title="Document sections" open={open} onToggle={() => setOpen(!open)}
      right={<span className="ll-mono text-[10px] text-gray-400">{layout.length} pages</span>}>
      <div className="text-[10.5px] text-gray-400">The order the pages print in. Edit opens the section's settings; hiding a page keeps its content so it can come back; a month is deleted for good.</div>
      <div className="space-y-1">
        {layout.map((k, i) => (
          <div key={k} className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5">
            <span className="ll-mono w-5 text-[10px] text-gray-400">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-gray-800">{fill(nameOf(k), d)}</span>
            <IconBtn title="Edit this section" onClick={() => onEdit(k)}><Pencil size={12} /></IconBtn>
            <IconBtn title="Move up" disabled={i === 0} onClick={() => setLayout(move(layout, i, -1))}><ArrowUp size={12} /></IconBtn>
            <IconBtn title="Move down" disabled={i === layout.length - 1} onClick={() => setLayout(move(layout, i, 1))}><ArrowDown size={12} /></IconBtn>
            <IconBtn danger title={k.startsWith("part:") ? "Delete this month" : "Hide this page"} onClick={() => remove(k)}>{k.startsWith("part:") ? <Trash2 size={12} /> : <EyeOff size={12} />}</IconBtn>
          </div>
        ))}
      </div>
      {hidden.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10.5px] text-gray-400">Hidden:</span>
          {hidden.map((k) => (
            <button key={k} onClick={() => { const i = layout.indexOf("closing"); const next = layout.slice(); next.splice(i < 0 ? next.length : i, 0, k); setLayout(next); }}
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2 py-0.5 text-[10.5px] font-semibold text-gray-600 hover:border-gray-300"><Eye size={10} /> {FIXED_SECTIONS[k]}</button>
          ))}
        </div>
      )}
    </Sec>
  );
}

/* ---------------- the editor ---------------- */
function ProposalEditor({ company, ai, initial, onSave, onClose, onSaveTemplate }) {
  const [d, setD] = useState(initial);
  const [undo, setUndo] = useState(null); // the proposal before the last AI edit
  const set = (p) => setD((x) => ({ ...x, ...(typeof p === "function" ? p(x) : p) }));
  const [open, setOpen] = useState({ cover: true, services: false, checklist: false, extras: false });
  const tog = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const [svcOpen, setSvcOpen] = useState(null);
  const [partOpen, setPartOpen] = useState(null);
  const accent = d.accent || BRAND_BLUE;
  const sbRef = useRef(null);

  /* "Edit" on a document section opens its settings and scrolls there */
  const jump = (k) => {
    const sec = k === "cover" ? "cover" : k === "services" || k === "pricing" ? "services" : k === "extras" || k === "closing" ? "extras" : "checklist";
    setOpen((o) => ({ ...o, [sec]: true }));
    if (k.startsWith("part:")) setPartOpen(k.slice(5));
    setTimeout(() => { const el = sbRef.current?.querySelector(k.startsWith("part:") ? `[data-part="${k.slice(5)}"]` : `[data-sec="${sec}"]`); el?.scrollIntoView({ block: "start", behavior: "smooth" }); }, 60);
  };

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
    document.title = `${fill(d.title, d) || "Proposal"} — ${company.name}`;
    const restore = () => { document.title = prev; window.removeEventListener("afterprint", restore); };
    window.addEventListener("afterprint", restore);
    setTimeout(restore, 60000);
    window.print();
  };

  /* service / package / checklist mutators */
  const patchSvc = (id, p) => set((x) => ({ services: x.services.map((s) => (s.id === id ? { ...s, ...(typeof p === "function" ? p(s) : p) } : s)) }));
  const patchPkg = (sid, pid, patch) => patchSvc(sid, (x) => ({ price: "", priceNote: "", bullets: [], packages: packagesOf(x).map((q) => (q.id === pid ? { ...q, ...patch, single: undefined } : { ...q, single: undefined })) }));
  const duplicatePkg = (s, p) => patchSvc(s.id, (x) => {
    const list = packagesOf(x).map((q) => ({ ...q, single: undefined }));
    const i = list.findIndex((q) => q.id === p.id);
    list.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(p)), id: uid("pk"), name: `${p.name || "Package"} (copy)`, single: undefined, bullets: (p.bullets || []).map((b) => ({ ...b, id: uid("b") })) });
    return { price: "", priceNote: "", bullets: [], packages: list };
  });
  const deletePkg = async (s, p) => {
    if (!await askDelete(`the "${p.name || "Package"}" package`)) return;
    set((x) => ({
      services: x.services.map((y) => (y.id === s.id ? { ...y, packages: packagesOf(y).filter((q) => q.id !== p.id).map((q) => ({ ...q, single: undefined })) } : y)),
      /* rows that pointed at it forget it */
      checklists: x.checklists.map((c) => (c.serviceKey !== s.key ? c : {
        ...c, compare: (c.compare || []).filter((id) => id !== p.id),
        groups: c.groups.map((g) => ({ ...g, tasks: g.tasks.map((t) => ({ ...t, ...(t.only ? { only: t.only.filter((id) => id !== p.id) } : {}), ...(t.qtyBy ? { qtyBy: Object.fromEntries(Object.entries(t.qtyBy).filter(([id]) => id !== p.id)) } : {}) })) })),
      })),
    }));
  };
  const patchPart = (id, p) => set((x) => ({ checklists: x.checklists.map((c) => (c.id === id ? { ...c, ...(typeof p === "function" ? p(c) : p) } : c)) }));
  const patchGroup = (pid, gid, p) => patchPart(pid, (c) => ({ groups: c.groups.map((g) => (g.id === gid ? { ...g, ...(typeof p === "function" ? p(g) : p) } : g)) }));
  const patchTask = (pid, gid, tid, p) => patchGroup(pid, gid, (g) => ({ tasks: g.tasks.map((t) => (t.id === tid ? { ...t, ...p } : t)) }));
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const reId = (part) => ({ ...part, id: uid("p"), groups: part.groups.map((g) => ({ ...g, id: uid("g"), tasks: g.tasks.map((t) => ({ ...t, id: uid("t") })) })) });
  const addPart = (part, afterId = null) => set((x) => {
    const cl = x.checklists.slice(); const i = afterId ? cl.findIndex((y) => y.id === afterId) : cl.length - 1; cl.splice(i + 1, 0, part);
    const lay = layoutOf(x).slice(); const li = afterId ? lay.indexOf(`part:${afterId}`) : Math.max(lay.indexOf("closing") - 1, lay.length - 2); lay.splice(li + 1, 0, `part:${part.id}`);
    return { checklists: cl, layout: lay };
  });
  const delPart = async (part) => {
    if (!await askDelete(`the checklist month "${part.title}"`)) return;
    set((x) => ({ checklists: x.checklists.filter((y) => y.id !== part.id), layout: layoutOf(x).filter((k) => k !== `part:${part.id}`) }));
  };

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
  const texts = { ...DEFAULT_TEXTS(), ...Object.fromEntries(["coverTag", "servicesIntro", "pricingNote", "closingTitle"].filter((k) => d[k] != null).map((k) => [k, d[k]])) };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-gray-100">
      <style>{printCss}</style>
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2.5">
        <button onClick={onClose} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-[12.5px] font-medium text-gray-600 hover:border-gray-300"><ArrowLeft size={14} /> All proposals</button>
        <span className="ll-display ml-1 truncate text-[14px] font-semibold text-gray-800">{fill(d.title, d) || "Proposal"}</span>
        <span className="ll-mono text-[11px] text-gray-400">{d.no}</span>
        <span className="ml-auto flex items-center gap-2">
          {undo && <button onClick={() => { setD(undo); setUndo(null); }} className="flex items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800" title="Put the proposal back as it was before the last AI edit"><Undo2 size={13} /> Undo AI edit</button>}
          <button onClick={async () => { if (await askConfirm({ title: "Save as the default template?", message: "New proposals will start from this proposal's services, checklist, texts, page order, reporting and access lists.", confirmLabel: "Save template" })) onSaveTemplate(templateOf(d)); }}
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
              <style>{`.pp-preview .pp-page { box-shadow: 0 2px 14px rgba(0,0,0,.08); margin-bottom: 20px; border-radius: 4px; overflow: hidden; }`}</style>
              <ProposalDoc d={d} company={company} />
            </div>
          </div>
        </div>

        {/* editor sidebar */}
        <div ref={sbRef} className="w-[460px] shrink-0 space-y-2.5 overflow-y-auto border-l border-gray-200 bg-gray-50 p-3">
          <AiBox ai={ai} d={d} onApply={(patch) => { setUndo(d); setD((x) => mergeAiEdit(x, patch)); }} />
          <SectionsPanel d={d} set={set} onEdit={jump} />

          <Sec id="cover" title="Cover & prospect" open={open.cover} onToggle={() => tog("cover")}>
            <div className="grid grid-cols-2 gap-2">
              <Labeled label="Brand / business name"><input value={d.business} onChange={(e) => set({ business: e.target.value })} className={inputCls} placeholder="Appliance Repair Solutions Plus" /></Labeled>
              <Labeled label="Business niche"><input value={d.niche || ""} onChange={(e) => set({ niche: e.target.value })} className={inputCls} placeholder="appliance repair" /></Labeled>
            </div>
            <Labeled label="Website"><input value={d.website || ""} onChange={(e) => set({ website: e.target.value })} className={inputCls} placeholder="www.example.com" /></Labeled>
            <div className="text-[10.5px] text-gray-400">Every line in the document that says <span className="ll-mono">{"{business}"}</span>, <span className="ll-mono">{"{niche}"}</span> or <span className="ll-mono">{"{website}"}</span> updates from these fields: change the name and the whole proposal follows.</div>
            <Labeled label="Proposal title"><input value={d.title} onChange={(e) => set({ title: e.target.value })} className={inputCls} /></Labeled>
            <Labeled label="Cover tag line (pill on the band)"><input value={texts.coverTag} onChange={(e) => set({ coverTag: e.target.value })} className={inputCls} /></Labeled>
            <div className="grid grid-cols-2 gap-2">
              <Labeled label="Contact person"><input value={d.preparedFor} onChange={(e) => set({ preparedFor: e.target.value })} className={inputCls} /></Labeled>
              <Labeled label="Prepared by"><input value={d.preparedBy} onChange={(e) => set({ preparedBy: e.target.value })} className={inputCls} /></Labeled>
              <Labeled label="Proposal no."><input value={d.no} onChange={(e) => set({ no: e.target.value })} className={inputCls + " ll-mono"} /></Labeled>
              <Labeled label="Date"><input type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} className={inputCls} /></Labeled>
              <Labeled label="Valid until"><input type="date" value={d.validUntil} onChange={(e) => set({ validUntil: e.target.value })} className={inputCls} /></Labeled>
              <Labeled label="Accent colour">
                <div className="flex items-center gap-2">
                  <input type="color" value={d.accent || BRAND_BLUE} onChange={(e) => set({ accent: e.target.value })} className="h-8 w-12 cursor-pointer rounded border border-gray-200" />
                  {(d.accent || BRAND_BLUE).toLowerCase() !== BRAND_BLUE && <button onClick={() => set({ accent: BRAND_BLUE })} className="text-[11px] font-semibold text-gray-500 hover:underline">Brand blue</button>}
                </div>
              </Labeled>
            </div>
            <Labeled label="Your contact line (website · email · phone)"><input value={d.contact} onChange={(e) => set({ contact: e.target.value })} className={inputCls} /></Labeled>
            <Labeled label="Intro (cover)"><textarea rows={3} value={d.intro} onChange={(e) => set({ intro: e.target.value })} className={inputCls} /></Labeled>
          </Sec>

          <Sec id="services" title="Services & pricing" open={open.services} onToggle={() => tog("services")}
            right={<button onClick={() => set({ services: DEFAULT_SERVICES() })} className="text-[10.5px] font-semibold text-gray-400 hover:text-gray-600">Reset</button>}>
            <Labeled label="Services page intro"><textarea rows={2} value={texts.servicesIntro} onChange={(e) => set({ servicesIntro: e.target.value })} className={inputCls} /></Labeled>
            <Labeled label="Pricing page note"><textarea rows={2} value={texts.pricingNote} onChange={(e) => set({ pricingNote: e.target.value })} className={inputCls} /></Labeled>
            <div className="text-[10.5px] text-gray-400">Keep each point to one line: a prospect should get the idea in a few seconds. Turn a service off to leave it out of this proposal.</div>
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
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">Packages</span>
                      <span className="text-[10.5px] text-gray-400">one price each; two or more print as a side-by-side comparison</span>
                    </div>
                    {packagesOf(s).map((p, pi2) => (
                      <PackageEditor key={p.id} p={p} index={pi2} count={packagesOf(s).length} accent={accent}
                        onChange={(patch) => patchPkg(s.id, p.id, patch)}
                        onMove={(dir) => patchSvc(s.id, (x) => ({ packages: move(packagesOf(x).map((q) => ({ ...q, single: undefined })), pi2, dir) }))}
                        onDuplicate={() => duplicatePkg(s, p)}
                        onDelete={() => deletePkg(s, p)} />
                    ))}
                    <button onClick={() => patchSvc(s.id, (x) => ({ packages: [...packagesOf(x).map((q) => ({ ...q, single: undefined })), { id: uid("pk"), name: "New package", price: "", priceNote: "", bullets: [] }] }))} className="flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: accent }}><Plus size={12} /> Add package</button>
                  </div>
                )}
              </div>
            ))}
          </Sec>

          <Sec id="checklist" title={`Work checklist (${d.checklists.length} months)`} open={open.checklist} onToggle={() => tog("checklist")}
            right={<button onClick={() => set((x) => { const next = DEFAULT_CHECKLISTS(); return { checklists: next, layout: [...layoutOf(x).filter((k) => !k.startsWith("part:") && k !== "closing"), ...next.map((p) => `part:${p.id}`), "closing"] }; })} className="text-[10.5px] font-semibold text-gray-400 hover:text-gray-600">Reset</button>}>
            <div className="text-[10.5px] text-gray-400">One set of months for every package. Each month prints as one page with the compared packages as columns; a row's details say which packages include it and with what quantity. Arrows move months, task groups and rows.</div>
            {d.checklists.map((part, pi) => {
              const { svc, cols } = partColumns(part, d.services);
              const allPk = svc ? packagesOf(svc).filter((p) => !p.single) : [];
              return (
                <div key={part.id} className="rounded-lg border border-gray-200 bg-white" data-part={part.id}>
                  <div className="flex items-center gap-1 px-2.5 py-2">
                    <button onClick={() => setPartOpen(partOpen === part.id ? null : part.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                      {partOpen === part.id ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
                      <span className="truncate text-[12.5px] font-semibold text-gray-800">{part.title || `Month ${pi + 1}`}</span>
                      <span className="ll-mono text-[10px] text-gray-400">{part.groups.reduce((n, g) => n + g.tasks.length, 0)} rows{cols.length > 1 ? ` · ${cols.map((c) => c.name).join(" vs ")}` : cols.length === 1 ? ` · ${cols[0].name}` : ""}</span>
                    </button>
                    <IconBtn title="Move month up" disabled={pi === 0} onClick={() => set((x) => { const lay = layoutOf(x); const i = lay.indexOf(`part:${part.id}`); const prev = lay.slice(0, i).reverse().find((k) => k.startsWith("part:")); const j = lay.indexOf(prev); const nl = lay.slice(); nl.splice(i, 1); nl.splice(j, 0, `part:${part.id}`); return { checklists: move(x.checklists, pi, -1), layout: nl }; })}><ArrowUp size={12} /></IconBtn>
                    <IconBtn title="Move month down" disabled={pi === d.checklists.length - 1} onClick={() => set((x) => { const lay = layoutOf(x); const i = lay.indexOf(`part:${part.id}`); const nxt = lay.slice(i + 1).find((k) => k.startsWith("part:")); const j = lay.indexOf(nxt); const nl = lay.slice(); nl.splice(j + 1, 0, `part:${part.id}`); nl.splice(i, 1); return { checklists: move(x.checklists, pi, 1), layout: nl }; })}><ArrowDown size={12} /></IconBtn>
                    <IconBtn title="Duplicate this month" onClick={() => { const c = reId(clone(part)); c.title = `${part.title} (copy)`; addPart(c, part.id); }}><Copy size={12} /></IconBtn>
                    <IconBtn danger title="Delete month" onClick={() => delPart(part)}><Trash2 size={12} /></IconBtn>
                  </div>
                  {partOpen === part.id && (
                    <div className="space-y-2.5 border-t border-gray-100 px-2.5 py-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <Labeled label="Month title"><input value={part.title} onChange={(e) => patchPart(part.id, { title: e.target.value })} className={inputCls} placeholder="Month 01" /></Labeled>
                        <Labeled label="Subtitle"><input value={part.subtitle || ""} onChange={(e) => patchPart(part.id, { subtitle: e.target.value })} className={inputCls} placeholder="Setup and research" /></Labeled>
                      </div>
                      <Labeled label="Belongs to service">
                        <select value={part.serviceKey || ""} onChange={(e) => patchPart(part.id, { serviceKey: e.target.value, compare: [] })} className={inputCls + " bg-white"}>
                          <option value="">— general —</option>
                          {d.services.map((s) => <option key={s.id} value={s.key}>{s.title}</option>)}
                        </select>
                      </Labeled>
                      {allPk.length > 1 && (
                        <Labeled label="Packages to compare on this page">
                          <div className="flex flex-wrap gap-1.5">
                            {allPk.map((p) => {
                              const chosen = Array.isArray(part.compare) && part.compare.length ? part.compare : allPk.map((q) => q.id);
                              const on = chosen.includes(p.id);
                              return (
                                <button key={p.id} onClick={() => { const next = on ? chosen.filter((id) => id !== p.id) : [...chosen, p.id]; patchPart(part.id, { compare: next.length === allPk.length ? [] : next }); }}
                                  disabled={on && chosen.length === 1} className="rounded-full border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-60"
                                  style={on ? { borderColor: accent, color: accent, background: accent + "0D" } : { borderColor: "#E5E7EB", color: "#6B7280" }}>{p.name || "Package"}{p.price ? ` · ${p.price}` : ""}</button>
                              );
                            })}
                          </div>
                          <div className="mt-1 text-[10.5px] text-gray-400">All of them print as columns; pick one to show just that package's version.</div>
                        </Labeled>
                      )}
                      {part.groups.map((g, gi) => (
                        <div key={g.id} className="rounded-lg border border-gray-100 bg-gray-50/70 p-2">
                          <div className="flex items-center gap-1">
                            <input value={g.title} onChange={(e) => patchGroup(part.id, g.id, { title: e.target.value })} placeholder="Task group" className={inputCls + " font-semibold"} />
                            <IconBtn title="Move group up" disabled={gi === 0} onClick={() => patchPart(part.id, (c) => ({ groups: move(c.groups, gi, -1) }))}><ArrowUp size={12} /></IconBtn>
                            <IconBtn title="Move group down" disabled={gi === part.groups.length - 1} onClick={() => patchPart(part.id, (c) => ({ groups: move(c.groups, gi, 1) }))}><ArrowDown size={12} /></IconBtn>
                            <IconBtn danger title="Delete group" onClick={() => patchPart(part.id, (c) => ({ groups: c.groups.filter((y) => y.id !== g.id) }))}><Trash2 size={12} /></IconBtn>
                          </div>
                          {allPk.length > 1 && allPk.length <= 2 && (
                            <div className="mt-1.5 flex items-center justify-end gap-1 pr-[82px] text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">
                              {allPk.map((p) => <span key={p.id} className="w-[82px] text-center">{p.name || "Package"}</span>)}
                            </div>
                          )}
                          <div className="mt-1 space-y-1">
                            {g.tasks.map((t, ti) => (
                              <TaskRow key={t.id} t={t} first={ti === 0} last={ti === g.tasks.length - 1} accent={accent} packages={allPk}
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
              );
            })}
            <button onClick={() => addPart({ id: uid("p"), title: `Month ${String(d.checklists.length + 1).padStart(2, "0")}`, subtitle: "", serviceKey: "seo", compare: [], groups: [{ id: uid("g"), title: "", tasks: [{ id: uid("t"), text: "", qty: "", details: [] }] }] })}
              className="flex items-center gap-1 text-[12px] font-semibold" style={{ color: accent }}><Plus size={13} /> Add month</button>
          </Sec>

          <Sec id="extras" title="Reporting, access & next steps" open={open.extras} onToggle={() => tog("extras")}
            right={<button onClick={() => set({ reporting: DEFAULT_REPORTING(), access: DEFAULT_ACCESS(), closing: DEFAULT_CLOSING, intro: DEFAULT_INTRO, steps: DEFAULT_STEPS(), ...DEFAULT_TEXTS() })} className="text-[10.5px] font-semibold text-gray-400 hover:text-gray-600">Reset</button>}>
            <Labeled label="How we report (one per line)"><Lines value={d.reporting} onChange={(v) => set({ reporting: v })} rows={5} /></Labeled>
            <Labeled label="Access we need (one per line)"><Lines value={d.access} onChange={(v) => set({ access: v })} rows={5} /></Labeled>
            <Labeled label="Next steps page title"><input value={texts.closingTitle} onChange={(e) => set({ closingTitle: e.target.value })} className={inputCls} /></Labeled>
            <Labeled label="Closing note"><textarea rows={3} value={d.closing} onChange={(e) => set({ closing: e.target.value })} className={inputCls} /></Labeled>
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">Next steps</div>
            {(d.steps || []).map((st, i) => (
              <div key={st.id || i} className="rounded-lg border border-gray-100 bg-gray-50/60 p-2">
                <div className="flex items-center gap-1">
                  <input value={st.title} placeholder="Step" onChange={(e) => set((x) => ({ steps: x.steps.map((y) => (y.id === st.id ? { ...y, title: e.target.value } : y)) }))} className={inputCls + " font-semibold"} />
                  <IconBtn title="Move up" disabled={i === 0} onClick={() => set((x) => ({ steps: move(x.steps, i, -1) }))}><ArrowUp size={12} /></IconBtn>
                  <IconBtn title="Move down" disabled={i === (d.steps || []).length - 1} onClick={() => set((x) => ({ steps: move(x.steps, i, 1) }))}><ArrowDown size={12} /></IconBtn>
                  <IconBtn danger title="Remove" onClick={() => set((x) => ({ steps: x.steps.filter((y) => y.id !== st.id) }))}><Trash2 size={12} /></IconBtn>
                </div>
                <input value={st.text} placeholder="One line about it" onChange={(e) => set((x) => ({ steps: x.steps.map((y) => (y.id === st.id ? { ...y, text: e.target.value } : y)) }))} className={inputCls + " mt-1 text-[12px]"} />
              </div>
            ))}
            <button onClick={() => set((x) => ({ steps: [...(x.steps || []), { id: uid("st"), title: "", text: "" }] }))} className="flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: accent }}><Plus size={12} /> Add step</button>
            <Toggle on={d.showSignature !== false} onChange={(v) => set({ showSignature: v })} label="Acceptance signature lines" desc="Two signature lines on the last page: the prospect and you." />
          </Sec>
        </div>
      </div>

      {/* print copy, paginated by the browser */}
      {createPortal(<div className="pp-print ll-root"><ProposalDoc d={d} company={company} /></div>, document.body)}
    </div>
  );
}

function PackageEditor({ p, index, count, accent, onChange, onMove, onDuplicate, onDelete }) {
  const [open, setOpen] = useState(index === 0);
  const setB = (fn) => onChange({ bullets: fn(p.bullets || []) });
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-1 px-2.5 py-2">
        <button onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          {open ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
          <span className="truncate text-[12.5px] font-semibold text-gray-800">{p.name || (p.single ? "Standard" : "Package")}</span>
          {p.price && <span className="ll-mono text-[10.5px] font-semibold" style={{ color: accent }}>{p.price}</span>}
          <span className="ll-mono text-[10px] text-gray-400">{(p.bullets || []).length} points</span>
        </button>
        <IconBtn title="Move package up" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={12} /></IconBtn>
        <IconBtn title="Move package down" disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown size={12} /></IconBtn>
        <IconBtn title="Duplicate this package, then change the price and the points that differ" onClick={onDuplicate}><Copy size={12} /></IconBtn>
        <IconBtn danger title="Delete package" disabled={count <= 1} onClick={onDelete}><Trash2 size={12} /></IconBtn>
      </div>
      {open && (
        <div className="space-y-2 border-t border-gray-100 px-2.5 py-2.5">
          <div className="grid grid-cols-3 gap-2">
            <Labeled label="Package name"><input value={p.name || ""} onChange={(e) => onChange({ name: e.target.value })} className={inputCls} placeholder="Basic" /></Labeled>
            <Labeled label="Price"><input value={p.price || ""} onChange={(e) => onChange({ price: e.target.value })} className={inputCls} placeholder="$500 / month" /></Labeled>
            <Labeled label="Price note"><input value={p.priceNote || ""} onChange={(e) => onChange({ priceNote: e.target.value })} className={inputCls} placeholder="Cancel anytime" /></Labeled>
          </div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">What's included</div>
          {(p.bullets || []).map((b, bi) => (
            <div key={b.id} className="rounded-lg border border-gray-100 bg-gray-50/60 p-2">
              <div className="flex items-center gap-1">
                <input value={b.title} placeholder="Point" onChange={(e) => setB((x) => x.map((y) => (y.id === b.id ? { ...y, title: e.target.value } : y)))} className={inputCls + " font-semibold"} />
                <IconBtn title="Move up" disabled={bi === 0} onClick={() => setB((x) => move(x, bi, -1))}><ArrowUp size={12} /></IconBtn>
                <IconBtn title="Move down" disabled={bi === (p.bullets || []).length - 1} onClick={() => setB((x) => move(x, bi, 1))}><ArrowDown size={12} /></IconBtn>
                <IconBtn danger title="Remove" onClick={() => setB((x) => x.filter((y) => y.id !== b.id))}><Trash2 size={12} /></IconBtn>
              </div>
              <input value={b.text} placeholder="One short line about it" onChange={(e) => setB((x) => x.map((y) => (y.id === b.id ? { ...y, text: e.target.value } : y)))} className={inputCls + " mt-1 text-[12px]"} />
            </div>
          ))}
          <button onClick={() => setB((x) => [...x, { id: uid("b"), title: "", text: "" }])} className="flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: accent }}><Plus size={12} /> Add point</button>
          <div className="text-[10.5px] text-gray-400">Points with the same title line up as one row in the comparison; a different text shows in that package's column.</div>
        </div>
      )}
    </div>
  );
}

/* a checklist row. With packages, every package gets its own cell right on
   the row: an on/off (is this row in that package?) and that package's
   quantity (empty = a check mark). Without packages, one quantity box. */
function TaskRow({ t, first, last, accent, packages = [], onChange, onMove, onDelete }) {
  const [more, setMore] = useState(false);
  const included = (id) => !(Array.isArray(t.only) && t.only.length) || t.only.includes(id);
  const toggle = (id) => {
    const all = packages.map((p) => p.id);
    const cur = Array.isArray(t.only) && t.only.length ? t.only.filter((x) => all.includes(x)) : all;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    onChange({ only: next.length === all.length ? undefined : next });
  };
  const multi = packages.length > 1;
  const cells = packages.map((p) => (
    <span key={p.id} className="flex shrink-0 items-center gap-0.5" title={`${p.name || "Package"}: ${included(p.id) ? "included" : "not included"}`}>
      <button onClick={() => toggle(p.id)} className="flex h-6 w-6 items-center justify-center rounded-md border text-[10px] font-bold"
        style={included(p.id) ? { borderColor: accent, color: "#fff", background: accent } : { borderColor: "#E5E7EB", color: "#9CA3AF", background: "#fff" }}>
        {included(p.id) ? <Check size={11} strokeWidth={3} /> : (p.name || "P")[0]}
      </button>
      <input value={(t.qtyBy || {})[p.id] ?? ""} placeholder={included(p.id) ? (t.qty || "✓") : "—"} disabled={!included(p.id)} title={`${p.name || "Package"} quantity (empty = ${t.qty ? `the general "${t.qty}"` : "a check mark"})`}
        onChange={(e) => onChange({ qtyBy: { ...(t.qtyBy || {}), [p.id]: e.target.value } })}
        className="ll-mono w-[54px] rounded-md border border-gray-200 px-1 py-1 text-right text-[10.5px] disabled:bg-gray-50 disabled:opacity-50" />
    </span>
  ));
  return (
    <div className="rounded-md border border-gray-200 bg-white px-1.5 py-1">
      <div className="flex items-center gap-1">
        <input value={t.text} placeholder="What gets done" onChange={(e) => onChange({ text: e.target.value })} className="min-w-0 flex-1 rounded-md border border-transparent px-1.5 py-1 text-[12px] hover:border-gray-200 focus:border-gray-300 focus:outline-none" />
        {multi && packages.length <= 2 && cells}
        {!multi && (
          <input value={t.qty} placeholder="qty" title="Quantity — empty prints a check mark" onChange={(e) => onChange({ qty: e.target.value })}
            className="ll-mono w-[64px] shrink-0 rounded-md border border-gray-200 px-1.5 py-1 text-right text-[11px]" style={t.qty ? { borderColor: accent + "80", color: "#111827" } : {}} />
        )}
        <IconBtn title={more ? "Hide details" : "Sub-points under this row"} onClick={() => setMore(!more)}><ChevronDown size={12} style={{ transform: more ? "rotate(180deg)" : "", color: (t.details || []).filter(Boolean).length ? accent : undefined }} /></IconBtn>
        <IconBtn title="Move row up" disabled={first} onClick={() => onMove(-1)}><ArrowUp size={12} /></IconBtn>
        <IconBtn title="Move row down" disabled={last} onClick={() => onMove(1)}><ArrowDown size={12} /></IconBtn>
        <IconBtn danger title="Remove row" onClick={onDelete}><Trash2 size={12} /></IconBtn>
      </div>
      {multi && packages.length > 2 && <div className="mt-1 flex flex-wrap items-center gap-1.5 px-1">{packages.map((p, i) => <span key={p.id} className="flex items-center gap-1"><span className="text-[10px] text-gray-400">{p.name}</span>{cells[i]}</span>)}</div>}
      {more && (
        <div className="space-y-1.5 px-1 pb-1 pt-1">
          {multi && <Labeled label="General quantity (used by a package whose box is empty)"><input value={t.qty} placeholder="qty" onChange={(e) => onChange({ qty: e.target.value })} className="ll-mono w-24 rounded-md border border-gray-200 px-1.5 py-1 text-right text-[11px]" /></Labeled>}
          <Lines value={t.details || []} onChange={(v) => onChange({ details: v })} rows={3} placeholder={"Sub-points, one per line\ne.g. 150–200 words per post"} />
        </div>
      )}
    </div>
  );
}

/* ---------------- the list in Company Settings ---------------- */
export function ProposalSection({ company, onChange, ai = null }) {
  const saved = company.proposals || [];
  const [editing, setEditing] = useState(null);
  const accent = company.accent;
  const save = (d) => {
    const rec = { ...d, updatedAt: Date.now() };
    onChange({ proposals: saved.some((x) => x.id === rec.id) ? saved.map((x) => (x.id === rec.id ? rec : x)) : [rec, ...saved] });
    setEditing(rec);
  };
  const remove = async (p) => { if (await askDelete(`the proposal for ${p.business || "this prospect"}`)) onChange({ proposals: saved.filter((x) => x.id !== p.id) }); };
  const duplicate = (p) => {
    const c = JSON.parse(JSON.stringify(p));
    c.id = uid("pp"); c.no = `P-${new Date().getFullYear()}-${String(saved.length + 1).padStart(3, "0")}`; c.createdAt = Date.now(); delete c.updatedAt;
    onChange({ proposals: [c, ...saved] });
  };
  const hasTpl = !!company.proposalTemplate;

  if (editing) return (
    <ProposalEditor company={company} ai={ai} initial={editing} onSave={save} onClose={() => setEditing(null)}
      onSaveTemplate={(tpl) => onChange({ proposalTemplate: tpl })} />
  );
  return (
    <div className="ll-fade space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-5">
        <div className="min-w-0 flex-1">
          <div className="ll-display flex items-center gap-2 text-[16px] font-semibold"><FileSignature size={16} style={{ color: accent }} /> Proposal template</div>
          <div className="mt-0.5 text-[11.5px] text-gray-400">
            Proposals for prospects: cover, the services with their packages compared, pricing, reporting and access, the monthly work checklist, next steps. Every page can be edited, hidden or moved; the SERP Squad AI rewrites it on command.
            {hasTpl ? " New proposals start from your saved template." : " New proposals start from the built-in template until you save your own."}
          </div>
        </div>
        {hasTpl && <button onClick={async () => { if (await askConfirm({ title: "Go back to the built-in template?", message: "Your saved default is removed; existing proposals are not changed.", confirmLabel: "Reset" })) onChange({ proposalTemplate: null }); }} className="rounded-xl border border-gray-200 px-3 py-2 text-[12px] font-semibold text-gray-500 hover:border-gray-300">Reset default template</button>}
        <button onClick={() => setEditing(blankProposal(company))} className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-semibold text-white" style={{ background: accent }}><Plus size={14} /> New proposal</button>
      </Card>
      {saved.length === 0 && <Card className="p-8 text-center text-[13px] text-gray-400">No proposals yet. Create one, enter the prospect's brand name and niche, adjust the services and checklist; download it as a PDF when it reads right.</Card>}
      <div className="grid gap-3 md:grid-cols-2">
        {saved.map((p) => (
          <Card key={p.id} className="flex items-start gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: (p.accent || BRAND_BLUE) + "14", color: p.accent || BRAND_BLUE }}><FileSignature size={18} /></div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-semibold text-gray-800">{p.business || "Untitled prospect"}{p.niche ? <span className="ml-1.5 text-[11px] font-medium text-gray-400">· {p.niche}</span> : null}</div>
              <div className="truncate text-[11.5px] text-gray-500">{fill(p.title, p)}</div>
              <div className="ll-mono mt-1 flex flex-wrap gap-x-2 text-[10px] text-gray-400">
                <span>{p.no}</span><span>{fmtLongDate(p.date)}</span>
                <span>{(p.services || []).filter((s) => s.enabled !== false).map((s) => { const pk = packagesOf(s); return pk.length > 1 ? `${s.title} (${pk.map((q) => q.name || "package").join(" / ")})` : s.title; }).join(" · ")}</span>
                <span>{(p.checklists || []).length} months</span>
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
