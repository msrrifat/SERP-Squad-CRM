/* =====================================================================
   OUTREACH SUITE — one engine, separate scopes.
   scope="growth" → company.growth (client prospecting — private)
   scope="guest"  → company.guest  (guest-post outreach — separable later)
   Campaigns and contacts NEVER mix between scopes.

   Tabs: Campaigns (sequences, AI pitch, merge tags, launch)
         Mailbox   (real IMAP inbox + reply, Sent, Drafts)
         Analytics (deliverability / opens / clicks / replies per campaign)
         Email accounts (Gmail app-password or custom SMTP/IMAP, verified)
   Sends are real (agency SMTP), tracking is real (pixel + redirect served
   by the API server), inbox is real (minimal IMAP client) — or an honest
   error. Nothing simulated silently.
   ===================================================================== */
import React, { useMemo, useRef, useState } from "react";
import {
  AtSign, BarChart3, CalendarClock, CheckCircle2, ChevronRight, Inbox, Mail, MailOpen,
  MousePointerClick, Plus, RefreshCw, Reply, Send, Sparkles, Trash2, X,
} from "lucide-react";
import { Card, Labeled, Modal, Toggle, inputCls } from "../../ui/primitives.jsx";
import { aiGenerate } from "../../lib/aiwrite.jsx";
import { appOrigin } from "../../lib/appOrigin.js";
import { hashStr } from "../../lib/rng.js";
import { DfsCostChip } from "../../lib/dfsCost.jsx";
import { buildAuditEmailHtml, buildAuditEmailText, demoInsightAudit, generateInsightAudit, topCompetitorNames } from "./insight.jsx";
import { BookingsTab } from "./booking.jsx";

const gid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const cityOf = (folder) => ((folder || "").split(" — ")[1] || "").trim();
export const personalize = (tpl, c, extras = {}) => String(tpl || "")
  .replaceAll("{{name}}", c.name || "there")
  .replaceAll("{{website}}", c.website || "your website")
  .replaceAll("{{city}}", extras.city || cityOf(c.folder) || "your area")
  .replaceAll("{{niche}}", c.niche || ((c.folder || "").split(" — ")[0] || "your niche").toLowerCase())
  .replaceAll("{{category}}", extras.category || ((c.folder || "").split(" — ")[0] || "business").toLowerCase())
  .replaceAll("{{competitor1}}", extras.competitor1 || "the top-ranked business")
  .replaceAll("{{competitor2}}", extras.competitor2 || "your closest rival");

/* text pitch → tracked HTML twin: paragraphs, links via the click redirect,
   1px open pixel. Only used when the campaign's tracking toggle is ON. */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function trackedHtml(text, token) {
  const base = appOrigin();
  const linked = esc(text).replace(/https?:\/\/[^\s<]+/g, (u) =>
    `<a href="${base}/api/t/c/${encodeURIComponent(token)}?u=${encodeURIComponent(u)}">${u}</a>`);
  return `<div style="font:14px/1.5 Arial,sans-serif;color:#222">${linked.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("")}</div>` +
    `<img src="${base}/api/t/o/${encodeURIComponent(token)}.gif" width="1" height="1" alt="" style="display:none">`;
}

const TabBtn = ({ active, onClick, icon: Icon, label, accent, badge }) => (
  <button onClick={onClick} className="flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold"
    style={active ? { background: accent, borderColor: accent, color: "#fff" } : { background: "#fff", borderColor: "#E5E7EB", color: "#4B5563" }}>
    <Icon size={13} /> {label}
    {badge != null && badge > 0 && <span className="ll-mono rounded-full px-1.5 text-[9.5px] font-bold" style={active ? { background: "rgba(255,255,255,.25)" } : { background: "#F3F4F6", color: "#6B7280" }}>{badge}</span>}
  </button>
);

/* ================= Email accounts (shared across scopes) ================= */
function AccountsTab({ company, onUpdateCompany, accent }) {
  const accounts = company.emailAccounts || [];
  const [adding, setAdding] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testMsg, setTestMsg] = useState(null);
  const [testBusy, setTestBusy] = useState(null);
  const commit = (list) => onUpdateCompany({ emailAccounts: list });

  const sendTest = async (a) => {
    if (!testTo.trim()) { setTestMsg("Enter an address to send the test to."); return; }
    setTestBusy(a.id); setTestMsg(null);
    try {
      const r = await fetch("/api/outreach/send", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ smtp: { ...a.smtp, from: a.email }, fromName: a.name, to: testTo.trim(), subject: "Outreach deliverability test", text: "Plain-text test sent through your own SMTP by the outreach tool. If this landed in spam, warm the inbox and check SPF/DKIM/DMARC." }) });
      const d = await r.json();
      setTestMsg(r.ok ? `✓ Test sent to ${testTo.trim()} from ${a.email}` : (d.detail || d.error));
    } catch (e) { setTestMsg("Send failed: " + (e?.message || e)); }
    setTestBusy(null);
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="ll-display text-[15px] font-semibold">Email accounts</div>
          <span className="text-[11px] text-gray-400">· shared by both outreach suites · each campaign picks its sender</span>
          <button onClick={() => setAdding(true)} className="ml-auto flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12px] font-semibold text-white" style={{ background: accent }}>
            <Plus size={13} /> Add a new Email ID
          </button>
        </div>
        {accounts.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center text-[12px] text-gray-400">
            No sending accounts yet — add a Gmail / G-Suite (app password) or any custom SMTP/IMAP mailbox.
          </div>
        )}
        <div className="space-y-2">
          {accounts.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 p-3">
              <Mail size={15} style={{ color: accent }} />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-gray-800">{a.name} <span className="ll-mono font-normal text-gray-400">&lt;{a.email}&gt;</span></span>
                <span className="text-[10.5px] text-gray-400">{a.type === "gmail" ? "Gmail / G-Suite" : `SMTP ${a.smtp?.host} · IMAP ${a.imap?.host || "—"}`}</span>
              </span>
              <span className={"rounded-full px-2 py-0.5 text-[9px] font-bold uppercase " + (a.smtpOk ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{a.smtpOk ? "SMTP ✓" : "SMTP unverified"}</span>
              <span className={"rounded-full px-2 py-0.5 text-[9px] font-bold uppercase " + (a.imapOk ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400")}>{a.imapOk ? "IMAP ✓" : "no inbox"}</span>
              <span className="ml-auto flex items-center gap-1.5">
                <button onClick={() => sendTest(a)} disabled={!!testBusy} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[10.5px] font-semibold text-gray-600 disabled:opacity-40">
                  {testBusy === a.id ? "Sending…" : "Send test"}
                </button>
                <button onClick={() => commit(accounts.filter((x) => x.id !== a.id))} className="rounded-md p-1 text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
              </span>
            </div>
          ))}
        </div>
        {accounts.length > 0 && (
          <div className="flex items-center gap-2">
            <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@agency.com — test recipient" className={inputCls + " w-64"} />
            {testMsg && <span className="text-[11px] font-medium text-gray-500">{testMsg}</span>}
          </div>
        )}
        <div className="rounded-xl bg-gray-50 p-3 text-[10.5px] leading-relaxed text-gray-500">
          <b className="text-gray-700">Deliverability rules baked in:</b> plain-text by default · 1.3s spacing · 60/hour server cap · sequences stop on reply.
          Before volume: <b>SPF, DKIM & DMARC</b> on the sending domain, warm each inbox 2–3 weeks, stay under ~40 cold emails/day per inbox — and rotate across several accounts here.
        </div>
      </Card>
      {adding && <AddAccountModal accent={accent} onClose={() => setAdding(false)}
        onAdd={(a) => { commit([...accounts, a]); setAdding(false); }} />}
    </div>
  );
}

function AddAccountModal({ accent, onClose, onAdd }) {
  const [d, setD] = useState({ name: "", email: "", type: "gmail", appPass: "",
    imapHost: "", imapPort: "993", imapUser: "", imapPass: "", smtpHost: "", smtpPort: "465", smtpUser: "", smtpPass: "" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value });
  const build = () => {
    const smtp = d.type === "gmail"
      ? { host: "smtp.gmail.com", port: 465, user: d.email.trim(), pass: d.appPass }
      : { host: d.smtpHost.trim(), port: +d.smtpPort || 465, user: d.smtpUser.trim() || d.email.trim(), pass: d.smtpPass };
    const imap = d.type === "gmail"
      ? { host: "imap.gmail.com", port: 993, user: d.email.trim(), pass: d.appPass }
      : d.imapHost.trim() ? { host: d.imapHost.trim(), port: +d.imapPort || 993, user: d.imapUser.trim() || d.email.trim(), pass: d.imapPass } : null;
    return { smtp, imap };
  };
  const testAndAdd = async () => {
    setBusy(true); setResult(null);
    const { smtp, imap } = build();
    let smtpOk = false, imapOk = false, note = "";
    try {
      const r = await fetch("/api/mail/test", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(45000),
        body: JSON.stringify({ smtp, imap }) });
      const res = await r.json();
      smtpOk = !!res.smtp?.ok; imapOk = !!res.imap?.ok;
      note = [`SMTP: ${smtpOk ? "✓ authenticated" : "✕ " + (res.smtp?.detail || "failed")}`, `IMAP: ${imapOk ? "✓ inbox reachable" : "○ " + (res.imap?.detail || "not configured")}`].join("  ·  ");
    } catch (e) { note = "API server unreachable — " + (e?.message || e); }
    setResult({ smtpOk, imapOk, note });
    setBusy(false);
    if (smtpOk) onAdd({ id: gid("ea"), name: d.name.trim(), email: d.email.trim().toLowerCase(), type: d.type, smtp, imap, smtpOk, imapOk, addedAt: Date.now() });
  };
  const valid = d.name.trim() && /@/.test(d.email) && (d.type === "gmail" ? d.appPass : d.smtpHost.trim() && d.smtpPass);
  return (
    <Modal title="Add a new Email ID" sub="The account cold emails send from — and whose inbox the Mailbox reads" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Name On E-Mail *"><input value={d.name} onChange={set("name")} placeholder="Your Name on Email Account" className={inputCls} /></Labeled>
          <Labeled label="E-Mail Address *"><input value={d.email} onChange={set("email")} placeholder="Your Email Address" className={"ll-mono " + inputCls} /></Labeled>
        </div>
        <Labeled label="Account Type *">
          <select value={d.type} onChange={set("type")} className={inputCls + " bg-white"}>
            <option value="gmail">Gmail / G-Suite</option>
            <option value="custom">SMTP / IMAP (any provider)</option>
          </select>
        </Labeled>
        {d.type === "gmail" ? (
          <div className="space-y-2.5">
            <div className="rounded-xl bg-gray-50 p-3 text-[11.5px] leading-relaxed text-gray-600">
              <b>Google / G-Suite</b><br />
              Step 1: Enable IMAP access in Settings → Forwarding and POP/IMAP.<br />
              Step 2: Enable 2FA on your Google account.<br />
              Step 3: Generate an App-Specific Password (myaccount.google.com → Security → App passwords).
            </div>
            <div className="rounded-xl bg-amber-400/90 px-3 py-2 text-[11.5px] font-bold text-gray-900">This is not your Account Password.</div>
            <Labeled label="App Password *"><input type="password" value={d.appPass} onChange={set("appPass")} placeholder="Google App Password" className={"ll-mono " + inputCls} /></Labeled>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="text-[12px] font-bold text-gray-700">IMAP <span className="font-normal text-gray-400">(optional — powers the Inbox & reply detection)</span></div>
            <div className="grid grid-cols-[1fr,110px] gap-2">
              <Labeled label="IMAP Host"><input value={d.imapHost} onChange={set("imapHost")} placeholder="imap.yourhost.com" className={"ll-mono " + inputCls} /></Labeled>
              <Labeled label="IMAP Port"><input value={d.imapPort} onChange={set("imapPort")} placeholder="Generally 993" className={"ll-mono " + inputCls} /></Labeled>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Labeled label="IMAP Username"><input value={d.imapUser} onChange={set("imapUser")} placeholder="Generally the email id" className={"ll-mono " + inputCls} /></Labeled>
              <Labeled label="IMAP Password"><input type="password" value={d.imapPass} onChange={set("imapPass")} placeholder="Generally the email password" className={"ll-mono " + inputCls} /></Labeled>
            </div>
            <div className="text-[12px] font-bold text-gray-700">SMTP</div>
            <div className="grid grid-cols-[1fr,110px] gap-2">
              <Labeled label="SMTP Host *"><input value={d.smtpHost} onChange={set("smtpHost")} placeholder="smtp.yourhost.com" className={"ll-mono " + inputCls} /></Labeled>
              <Labeled label="SMTP Port *"><input value={d.smtpPort} onChange={set("smtpPort")} placeholder="465" className={"ll-mono " + inputCls} /></Labeled>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Labeled label="SMTP Username"><input value={d.smtpUser} onChange={set("smtpUser")} placeholder="Generally the email id" className={"ll-mono " + inputCls} /></Labeled>
              <Labeled label="SMTP Password *"><input type="password" value={d.smtpPass} onChange={set("smtpPass")} placeholder="Generally the email password" className={"ll-mono " + inputCls} /></Labeled>
            </div>
            <div className="text-[10.5px] text-gray-400">Direct SSL/TLS ports (SMTP 465, IMAP 993). STARTTLS (587/143) isn't supported yet — most hosts offer both.</div>
          </div>
        )}
        {result && (
          <div className={"rounded-xl border px-3 py-2 text-[11.5px] " + (result.smtpOk ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700")}>
            {result.note}{result.smtpOk ? " — account added." : ""}
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-[12.5px] font-medium text-gray-600">Cancel</button>
          <button onClick={testAndAdd} disabled={!valid || busy}
            className="flex items-center gap-1.5 rounded-lg px-5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
            {busy ? <><RefreshCw size={12} className="animate-spin" /> Verifying…</> : "Verify & add account"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ================= Campaigns ================= */
function CampaignsTab({ accent, company, store, commit, aiConfig, scope, openId, setOpenId }) {
  const guestScope = scope === "guest";
  const contacts = store.contacts || [];
  const campaigns = store.campaigns || [];
  const accounts = company.emailAccounts || [];
  const folders = [...new Set(contacts.map((c) => c.folder))];
  const [fromName] = useState(store.fromName || company.name || "");
  const [sending, setSending] = useState(null);
  const [err, setErr] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const camp = campaigns.find((c) => c.id === openId);
  const folderIsGuest = (folder) => guestScope || contacts.some((c) => c.folder === folder && c.kind === "guestpost");
  /* insightful campaigns: live data sources for audit generation */
  const dfs = company.dfs;
  const dfsReady = !!(dfs?.login && dfs?.password && !String(dfs.login).includes("demo@serpsquad"));
  const placesKey = company.apis?.googlePlaces?.values?.apiKey;
  const [preview, setPreview] = useState(null);   // audit email html for the preview modal
  const [previewBusy, setPreviewBusy] = useState(false);
  const [abStats, setAbStats] = useState(null);   // { A:{...}, B:{...} }
  const [insightNote, setInsightNote] = useState(null);
  const vidList = (camp?.videos || "").split(/\n|,/).map((s) => s.trim()).filter(Boolean);
  /* deterministic 50/50 split; "first"/"engaged" force one variant for all */
  const variantOf = (c) => (camp?.abSplit === "first" ? "A" : camp?.abSplit === "engaged" ? "B" : (hashStr(c.id) % 2 ? "B" : "A"));

  const patchCamp = (id, patch) => commit({ campaigns: campaigns.map((c) => (c.id === id ? { ...c, ...(typeof patch === "function" ? patch(c) : patch) } : c)) });
  const acctOf = (c) => accounts.find((a) => a.id === c?.accountId) || accounts[0] || null;
  const smtpOf = (c) => {
    const a = acctOf(c);
    if (a) return { smtp: { ...a.smtp, from: a.email }, fromName: a.name || fromName };
    const legacy = company.apis?.smtp?.values;
    return legacy?.host ? { smtp: legacy, fromName } : null;
  };

  const newCampaign = () => {
    const folder = folders[0] || "";
    const guest = folderIsGuest(folder);
    const c = guest ? {
      id: gid("cp"), name: "Guest post outreach", folder, status: "draft", createdAt: Date.now(), guest: true, accountId: accounts[0]?.id || null, tracking: false,
      subject: "Guest post for {{name}}?",
      body: `Hi,\n\nI'm a big fan of {{website}} — your recent {{niche}} posts are exactly the depth I look for.\n\nI'd love to contribute a original, well-researched guest article your readers would genuinely find useful (no fluff, no thin content). I can send a few headline ideas tailored to your audience — would that be welcome?\n\nEither way, keep up the great work.\n\n${fromName}`,
      followUps: [{ afterDays: 3, body: "Hi again — just bumping this in case it slipped by. Happy to send 2–3 {{niche}} topic ideas for {{name}} so you can see the angle before committing. Worth a look?" }],
      sends: [],
    } : {
      id: gid("cp"), name: "New campaign", folder, status: "draft", createdAt: Date.now(), accountId: accounts[0]?.id || null, tracking: false,
      subject: "Quick question about {{name}}",
      body: `Hi {{name}} team,\n\nI was looking at local {{category}} results in {{city}} and noticed a few quick wins on {{website}} that competitors are already using.\n\nMind if I send over a free 2-minute audit? No strings — if it's useful, great.\n\n${fromName}`,
      followUps: [{ afterDays: 3, body: "Hi again — just floating my last note to the top. Want that free audit for {{name}}? Takes me 10 minutes, could be worth a lot to you." }],
      sends: [],
    };
    commit({ campaigns: [c, ...campaigns], fromName });
    setOpenId(c.id);
  };

  /* INSIGHTFUL campaign: auto-generated branded audit emails + A/B test.
     A = audit embedded in the FIRST email. B = plain teaser first; the
     audit goes out in email #2 only to prospects who engage (open/click/
     reply). abSplit "ab" runs both on a deterministic 50/50 split. */
  const newInsightCampaign = () => {
    const folder = folders[0] || "";
    const [catPart, cityPart] = folder.split(" — ").map((s) => (s || "").trim());
    const c = {
      id: gid("cp"), name: "Insightful audit campaign", insight: true, abSplit: "ab",
      category: (catPart || "").toLowerCase(), city: cityPart || "", videos: "",
      folder, status: "draft", createdAt: Date.now(), accountId: accounts[0]?.id || null, tracking: true,
      subject: `Outrank {{competitor1}} & {{competitor2}} and win the ${(catPart || "local").toLowerCase()} leads in {{city}}`,
      body: `Hi {{name}} team,\n\n{{competitor1}} and {{competitor2}} are winning most of the ${(catPart || "local").toLowerCase()} leads in {{city}} right now.\n\nFix your website and business profiles to outrank them and win those leads back. Here's exactly what's pulling {{name}} behind — and where you're losing jobs to them:`,
      followUps: [{ afterDays: 3, body: "Hi again — {{name}}'s visibility numbers vs {{competitor1}} were genuinely eye-opening (a few quick wins in there). Want me to send the full audit over? Just reply." }],
      sends: [],
    };
    commit({ campaigns: [c, ...campaigns], fromName });
    setOpenId(c.id);
  };

  const auditFor = async (contact, demo = false) => {
    const business = { name: contact.name, city: camp.city, website: contact.website || "" };
    return demo ? demoInsightAudit(business, camp.category, camp.city)
      : generateInsightAudit({ business, category: camp.category, city: camp.city, dfs, placesKey });
  };
  /* competitor merge tags: from THIS prospect's audit when we have it, else
     the campaign-level primed pair (competitors are city-level anyway) */
  const extrasFrom = (audit) => {
    const names = audit ? topCompetitorNames(audit, 2) : (camp?.topCompetitors || []);
    return { city: camp.city, category: camp.category, competitor1: names[0], competitor2: names[1] };
  };
  const bookingUrlFor = (contact) => `${appOrigin()}/book/${camp.id}.${contact.id}`;
  const auditHtmlFor = (audit, contact, token) =>
    buildAuditEmailHtml(audit, { company, accent, videos: vidList, repName: acctOf(camp)?.name || fromName,
      bookingUrl: bookingUrlFor(contact), pitch: personalize(camp.body, contact, extrasFrom(audit)) }) +
    `<img src="${appOrigin()}/api/t/o/${encodeURIComponent(token)}.gif" width="1" height="1" alt="" style="display:none">`;

  const previewAudit = async () => {
    const contact = targets[0] || { id: "px", name: "Sample Business", website: "sample-business.com" };
    setPreviewBusy(true); setInsightNote(null);
    try {
      const audit = await auditFor(contact, !dfsReady);
      if (audit) patchCamp(camp.id, { topCompetitors: topCompetitorNames(audit, 2) });
      setPreview(buildAuditEmailHtml(audit, { company, accent, videos: vidList, repName: acctOf(camp)?.name || fromName,
        bookingUrl: bookingUrlFor(contact), pitch: personalize(camp.body, contact, extrasFrom(audit)) }));
      if (!dfsReady) setInsightNote("Preview uses labeled DEMO data — connect DataForSEO to generate real audits.");
    } catch (e) { setInsightNote("Audit failed: " + (e?.message || e)); }
    setPreviewBusy(false);
  };

  const launchInsight = async () => {
    const cfg = smtpOf(camp);
    if (!cfg) { setErr("No sending account — add one in the Email accounts tab."); return; }
    if (!dfsReady) { setErr("Insightful campaigns only send with LIVE data — connect DataForSEO in API settings. Demo audits are preview-only and never reach a prospect."); return; }
    if (!camp.category.trim() || !camp.city.trim()) { setErr("Set the main category and city first — the 8 audit keywords are built from them."); return; }
    const batch = toSend.slice(0, 20);
    /* prime the city's top-2 competitors once (for B-teaser subjects) if a
       B variant will send and we don't have them yet */
    let primed = camp.topCompetitors || [];
    if (!primed.length && camp.abSplit !== "first") {
      try { const pa = await auditFor(batch[0]); primed = topCompetitorNames(pa, 2); patchCamp(camp.id, { topCompetitors: primed }); } catch { /* non-fatal */ }
    }
    setSending({ done: 0, total: batch.length, fails: 0 }); setErr(null); setInsightNote(null);
    const results = [];
    for (let i = 0; i < batch.length; i++) {
      const contact = batch[i];
      const variant = variantOf(contact);
      const token = `${camp.id}.${contact.id}`;
      try {
        let html, text, extras;
        if (variant === "A") {
          const audit = await auditFor(contact);
          extras = extrasFrom(audit);
          html = auditHtmlFor(audit, contact, token);
          text = buildAuditEmailText(audit, { company, pitch: personalize(camp.body, contact, extras) });
        } else {
          extras = { city: camp.city, category: camp.category, competitor1: primed[0], competitor2: primed[1] };
          const pitchP = personalize(camp.body, contact, extras); text = pitchP; html = trackedHtml(pitchP, token);
        }
        const r = await fetch("/api/outreach/send", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000),
          body: JSON.stringify({ smtp: cfg.smtp, fromName: cfg.fromName, to: contact.email, subject: personalize(camp.subject, contact, extras), text, html }) });
        const d = await r.json();
        results.push({ id: gid("sd"), contactId: contact.id, email: contact.email, step: 0, variant, audit: variant === "A", at: Date.now(), ok: r.ok, error: r.ok ? null : (d.detail || d.error) });
        if (!r.ok && r.status === 503) { setErr(d.detail); break; }
      } catch (e) { results.push({ id: gid("sd"), contactId: contact.id, email: contact.email, step: 0, variant, at: Date.now(), ok: false, error: String(e?.message || e).slice(0, 140) }); }
      setSending({ done: i + 1, total: batch.length, fails: results.filter((x) => !x.ok).length });
      if (i < batch.length - 1) await new Promise((res) => setTimeout(res, 1300));
    }
    patchCamp(camp.id, (c) => ({ sends: [...(c.sends || []), ...results], status: "running", launchedAt: c.launchedAt || Date.now() }));
    setSending(null);
  };

  /* B-variant step 2: pull engagement (opens/clicks via tracking + replies
     via contacts) and send the audit ONLY to engaged prospects */
  const engagementOf = async () => {
    let track = {};
    try {
      const r = await fetch("/api/track/stats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefix: camp.id }) });
      const d = await r.json(); if (r.ok) track = d.stats || {};
    } catch { /* tracking unreachable — replies still count */ }
    return track;
  };
  const sendAuditsToEngaged = async () => {
    if (!dfsReady) { setErr("Live DataForSEO required to generate the audits."); return; }
    setInsightNote("Checking opens, clicks & replies…"); setErr(null);
    const track = await engagementOf();
    const bSent = (camp.sends || []).filter((s) => s.step === 0 && s.ok && s.variant === "B");
    const already = new Set((camp.sends || []).filter((s) => s.audit && s.ok).map((s) => s.contactId));
    const engaged = bSent.map((s) => contacts.find((c) => c.id === s.contactId)).filter(Boolean)
      .filter((c) => !already.has(c.id) && (c.replied || (track[c.id]?.opens || 0) > 0 || (track[c.id]?.clicks || 0) > 0));
    if (!engaged.length) { setInsightNote(`No newly-engaged B prospects yet (${bSent.length} teaser(s) out) — opens, clicks and replies all count.`); return; }
    setInsightNote(`${engaged.length} engaged prospect(s) found — generating & sending their audits…`);
    const cfg = smtpOf(camp);
    setSending({ done: 0, total: engaged.length, fails: 0 });
    const results = [];
    for (let i = 0; i < engaged.length; i++) {
      const contact = engaged[i];
      const token = `${camp.id}.${contact.id}`;
      try {
        const audit = await auditFor(contact);
        const html = auditHtmlFor(audit, contact, token);
        const intro = `As promised — here's the full visibility audit for ${contact.name}. 60 seconds, real Google data:`;
        const r = await fetch("/api/outreach/send", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000),
          body: JSON.stringify({ smtp: cfg.smtp, fromName: cfg.fromName, to: contact.email,
            subject: "Re: " + personalize(camp.subject, contact),
            text: buildAuditEmailText(audit, { company, pitch: intro }), html }) });
        const d = await r.json();
        results.push({ id: gid("sd"), contactId: contact.id, email: contact.email, step: 1, variant: "B", audit: true, at: Date.now(), ok: r.ok, error: r.ok ? null : (d.detail || d.error) });
      } catch (e) { results.push({ id: gid("sd"), contactId: contact.id, email: contact.email, step: 1, variant: "B", audit: true, at: Date.now(), ok: false, error: String(e?.message || e).slice(0, 140) }); }
      setSending({ done: i + 1, total: engaged.length, fails: results.filter((x) => !x.ok).length });
      if (i < engaged.length - 1) await new Promise((res) => setTimeout(res, 1300));
    }
    patchCamp(camp.id, (c) => ({ sends: [...(c.sends || []), ...results] }));
    setSending(null);
  };

  const refreshAbStats = async () => {
    const track = await engagementOf();
    const rows = { A: { sent: 0, opened: 0, clicked: 0, replied: 0, audits: 0 }, B: { sent: 0, opened: 0, clicked: 0, replied: 0, audits: 0 } };
    (camp.sends || []).filter((s) => s.step === 0 && s.ok && s.variant).forEach((s) => {
      const v = rows[s.variant]; if (!v) return;
      v.sent++;
      if ((track[s.contactId]?.opens || 0) > 0) v.opened++;
      if ((track[s.contactId]?.clicks || 0) > 0) v.clicked++;
      if (contacts.find((c) => c.id === s.contactId)?.replied) v.replied++;
    });
    (camp.sends || []).filter((s) => s.audit && s.ok && s.variant).forEach((s) => { if (rows[s.variant]) rows[s.variant].audits++; });
    setAbStats(rows);
  };

  const aiPitch = async () => {
    if (!camp) return;
    setAiBusy(true); setErr(null);
    const guest = camp.guest || folderIsGuest(camp.folder);
    try {
      const text = await aiGenerate(aiConfig, guest ? {
        system: `You are an expert blogger-outreach / guest-post pitch writer (Pitchbox/Respona school). Write ONE plain-text email that gets a "yes, pitch me topics":
- under 110 words, warm and specific, first line a genuine compliment about their site, then offer an ORIGINAL high-quality guest article for their audience, then ONE soft CTA (offer to send topic ideas — a question)
- no links, no attachments, no payment talk, no "I'll add 3 links", no spam words, no "hope this finds you well"
- use merge tags exactly: {{name}} (site/domain), {{website}}, {{niche}}
- Output format: first line "Subject: ..." then a blank line then the body. Nothing else.`,
        maxTokens: 400,
        prompt: `Sender: ${fromName}. Audience: ${camp.folder || "niche blogs"} — blogs that accept guest posts in the "${(camp.folder.split(" — ")[0] || "").trim()}" niche. Goal: land a guest post. Write the email.`,
      } : {
        system: `You are a cold-email expert (Instantly/Lemlist school). Write ONE plain-text cold email:
- under 110 words, first line personal, one concrete observation, ONE soft CTA (a question), no links, no images, no spam words (free!!!, guarantee, act now), no "hope this finds you well"
- use merge tags exactly: {{name}} (business name), {{city}}, {{category}}, {{website}}
- Output format: first line "Subject: ..." then a blank line then the body. Nothing else.`,
        maxTokens: 400,
        prompt: `Sender: ${fromName}, a local-SEO & web agency. Audience: ${camp.folder || "local businesses"}. Offer: a free mini SEO/website audit that leads to a proposal. Write the email.`,
      });
      const m = text.match(/^Subject:\s*(.+)\n+([\s\S]+)$/i);
      patchCamp(camp.id, m ? { subject: m[1].trim(), body: m[2].trim() } : { body: text.trim() });
    } catch (e) { setErr(e.code === 503 ? "No AI provider connected — add a key in API settings, or write the pitch manually." : "AI error: " + e.message); }
    setAiBusy(false);
  };

  const targets = camp ? contacts.filter((c) => c.folder === camp.folder) : [];
  const emailable = targets.filter((c) => c.email && !c.replied);
  const sentIds = new Set((camp?.sends || []).filter((s) => s.step === 0 && s.ok).map((s) => s.contactId));
  const toSend = emailable.filter((c) => !sentIds.has(c.id));
  /* follow-ups due, computed from any contact list (so the pre-send reply
     check can recompute against freshly-detected replies) */
  const duesFrom = (list) => camp ? (camp.followUps || []).flatMap((fu, fi) =>
    (camp.sends || []).filter((s) => s.step === 0 && s.ok
      && Date.now() - s.at >= fu.afterDays * 864e5
      && !(camp.sends || []).some((x) => x.contactId === s.contactId && x.step === fi + 1)
      && !list.find((c) => c.id === s.contactId)?.replied
      && list.find((c) => c.id === s.contactId))
      .map((s) => ({ contact: list.find((c) => c.id === s.contactId), fu, step: fi + 1 }))) : [];
  const dueFollowUps = duesFrom(contacts);

  /* HARD STOP on reply: before any follow-ups go out, the sending account's
     inbox is pulled over IMAP and every reply marks its contact Replied —
     those sequences end right here, automatically. */
  const [replyCheck, setReplyCheck] = useState(null);
  const sendDueFollowUps = async () => {
    let list = contacts;
    const a = acctOf(camp);
    if (a?.imap?.host) {
      setReplyCheck("Checking the inbox for replies first…");
      try {
        const r = await fetch("/api/mail/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(45000),
          body: JSON.stringify({ imap: a.imap, limit: 40 }) });
        const d = await r.json();
        if (r.ok) {
          const repliers = new Set((d.messages || []).map((m) => m.fromEmail));
          const hits = list.filter((c) => c.email && repliers.has(c.email.toLowerCase()) && !c.replied);
          if (hits.length) {
            const ids = new Set(hits.map((c) => c.id));
            list = list.map((c) => (ids.has(c.id) ? { ...c, replied: true, repliedAt: Date.now() } : c));
            commit({ contacts: list });
            setReplyCheck(`✓ ${hits.length} repl${hits.length === 1 ? "y" : "ies"} detected — their sequences are stopped, follow-ups skip them.`);
          } else setReplyCheck("✓ Inbox checked — no new replies.");
        } else setReplyCheck("Inbox check failed (" + (d.detail || d.error) + ") — sending only to contacts not marked Replied.");
      } catch { setReplyCheck("Inbox unreachable — sending only to contacts not marked Replied."); }
    } else setReplyCheck("No IMAP on the sending account — replies can't be auto-detected; only manual Replied marks stop sequences.");
    const dues = duesFrom(list);
    if (!dues.length) { setReplyCheck((n) => (n ? n + " Nothing left to send." : "No follow-ups due.")); return; }
    await sendBatch(dues.slice(0, 40).map(({ contact, fu, step }) => ({ contact, subject: "Re: " + camp.subject, body: fu.body, step })));
  };

  const sendBatch = async (batch) => {
    const cfg = smtpOf(camp);
    if (!cfg) { setErr("No sending account — add one in the Email accounts tab."); return; }
    setSending({ done: 0, total: batch.length, fails: 0 }); setErr(null);
    const results = [];
    for (let i = 0; i < batch.length; i++) {
      const { contact, subject, body, step } = batch[i];
      const token = `${camp.id}.${contact.id}`;
      try {
        const r = await fetch("/api/outreach/send", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000),
          body: JSON.stringify({ smtp: cfg.smtp, fromName: cfg.fromName, to: contact.email,
            subject: personalize(subject, contact), text: personalize(body, contact),
            html: camp.tracking ? trackedHtml(personalize(body, contact), token) : undefined }) });
        const d = await r.json();
        results.push({ id: gid("sd"), contactId: contact.id, email: contact.email, step, at: Date.now(), ok: r.ok, error: r.ok ? null : (d.detail || d.error) });
        if (!r.ok && r.status === 503) { setErr(d.detail); break; }
      } catch (e) { results.push({ id: gid("sd"), contactId: contact.id, email: contact.email, step, at: Date.now(), ok: false, error: String(e?.message || e) }); }
      setSending({ done: i + 1, total: batch.length, fails: results.filter((x) => !x.ok).length });
      if (i < batch.length - 1) await new Promise((res) => setTimeout(res, 1300));
    }
    patchCamp(camp.id, (c) => ({ sends: [...(c.sends || []), ...results], status: "running", launchedAt: c.launchedAt || Date.now() }));
    setSending(null);
  };

  if (!camp) return (
    <Card className="space-y-2 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="ll-display text-[15px] font-semibold">{guestScope ? "Guest post campaigns" : "Campaigns"}</div>
        <span className="flex gap-2">
          <button onClick={newCampaign} disabled={!folders.length}
            className="flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[12px] font-semibold disabled:opacity-40" style={{ borderColor: accent, color: accent }}>
            <Plus size={13} /> General campaign
          </button>
          {!guestScope && (
            <button onClick={newInsightCampaign} disabled={!folders.length}
              title="Auto-generates a branded visibility audit per prospect (GBP + website + 6 search ranks + 2 map ranks + competitors) with A/B testing"
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12px] font-bold text-white disabled:opacity-40" style={{ background: accent }}>
              <Sparkles size={13} /> Insightful campaign
            </button>
          )}
        </span>
      </div>
      {!folders.length && <div className="text-[11.5px] text-gray-400">{guestScope ? "Save sites from the Guest Post Finder first — campaigns target a folder." : "Add prospects first — campaigns target a prospect folder."}</div>}
      {campaigns.map((c) => {
        const ok = (c.sends || []).filter((s) => s.ok).length;
        return (
          <button key={c.id} onClick={() => setOpenId(c.id)} className="flex w-full items-center gap-3 rounded-xl border border-gray-100 p-3 text-left hover:border-gray-200">
            <Send size={14} style={{ color: accent }} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-800">{c.name}
                {c.insight && <span className="rounded bg-indigo-100 px-1.5 py-px text-[8.5px] font-bold uppercase text-indigo-700">insight · A/B</span>}
              </span>
              <span className="block text-[10.5px] text-gray-400">{c.folder} · {(c.followUps || []).length} follow-up step(s){c.tracking ? " · tracking on" : ""}</span>
            </span>
            <span className={"rounded-full px-2 py-0.5 text-[9px] font-bold uppercase " + (c.status === "running" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500")}>{c.status}</span>
            <span className="ll-mono text-[10.5px] text-gray-400">{ok} sent</span>
            <ChevronRight size={14} className="text-gray-300" />
          </button>
        );
      })}
      {campaigns.length === 0 && folders.length > 0 && <div className="py-3 text-center text-[11.5px] text-gray-300">No campaigns yet.</div>}
    </Card>
  );

  const acct = acctOf(camp);
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setOpenId(null)} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-500">← Campaigns</button>
        <input value={camp.name} onChange={(e) => patchCamp(camp.id, { name: e.target.value })} className="ll-display min-w-0 flex-1 border-b border-transparent bg-transparent text-[15px] font-semibold outline-none focus:border-gray-300" />
        <button onClick={() => { commit({ campaigns: campaigns.filter((x) => x.id !== camp.id) }); setOpenId(null); }} className="rounded-md p-1.5 text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Labeled label={<span className="flex items-center gap-1.5">Folder ({targets.length} · {emailable.length} emailable)
          {(camp.guest || folderIsGuest(camp.folder)) && <span className="rounded bg-violet-100 px-1.5 py-px text-[8.5px] font-bold uppercase text-violet-600">guest post</span>}</span>}>
          <select value={camp.folder} onChange={(e) => patchCamp(camp.id, { folder: e.target.value, guest: folderIsGuest(e.target.value) })} className={inputCls + " bg-white"}>
            {folders.map((f) => <option key={f}>{f}</option>)}
          </select>
        </Labeled>
        <Labeled label="Sending account">
          <select value={camp.accountId || ""} onChange={(e) => patchCamp(camp.id, { accountId: e.target.value })} className={"ll-mono " + inputCls + " bg-white"}>
            {!accounts.length && <option value="">— add one in Email accounts —</option>}
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
          </select>
        </Labeled>
        <Labeled label={`Subject ({{name}} {{website}} ${camp.guest || folderIsGuest(camp.folder) ? "{{niche}}" : "{{city}} {{category}}"})`}>
          <input value={camp.subject} onChange={(e) => patchCamp(camp.id, { subject: e.target.value })} className={inputCls} />
        </Labeled>
        <div className="rounded-xl border border-gray-100 p-2">
          <Toggle on={!!camp.tracking} onChange={(v) => patchCamp(camp.id, { tracking: v })} label="Open & click tracking"
            desc="Adds an HTML twin with a pixel + link redirects. Plain-text-only (off) deliverability is slightly better." />
        </div>
      </div>
      {camp.insight && (
        <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-bold text-indigo-800">✦ Insightful audit settings</span>
            <span className="text-[10.5px] text-indigo-500">6 search scans + 25-point map grid per audit ≈ <b>$0.09</b> DataForSEO; the real map snapshot uses your Google key (enable the <b>Static Maps API</b> on it) — GBP, website crawl & competitors ride along free.</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Labeled label="Main category (drives the 8 keywords)"><input value={camp.category} onChange={(e) => patchCamp(camp.id, { category: e.target.value })} placeholder="roofing" className={inputCls} /></Labeled>
            <Labeled label="City"><input value={camp.city} onChange={(e) => patchCamp(camp.id, { city: e.target.value })} placeholder="Austin, TX" className={inputCls} /></Labeled>
            <Labeled label="A/B mode">
              <select value={camp.abSplit} onChange={(e) => patchCamp(camp.id, { abSplit: e.target.value })} className={inputCls + " bg-white"}>
                <option value="ab">A/B test — 50/50 split</option>
                <option value="first">All A — audit in the first email</option>
                <option value="engaged">All B — audit after engagement</option>
              </select>
            </Labeled>
            <Labeled label="YouTube videos (portfolio/reviews, one per line)">
              <textarea value={camp.videos || ""} onChange={(e) => patchCamp(camp.id, { videos: e.target.value })} rows={1} placeholder="https://youtu.be/…" className={inputCls + " resize-y"} />
            </Labeled>
          </div>
          <div className="rounded-lg bg-white/70 px-3 py-2 text-[10.5px] leading-relaxed text-indigo-900">
            Audit keywords: <span className="ll-mono">{camp.category || "category"}</span> · <span className="ll-mono">{camp.category || "category"} near me</span> · <span className="ll-mono">{camp.category || "category"} {(camp.city || "city").split(",")[0]}</span> · + service / contractor / company —
            plus Maps rankings for the two local ones. <b>Variant A</b> gets the branded audit in email #1; <b>variant B</b> gets a teaser, and the audit ships automatically to whoever <b>opens, clicks or replies</b>.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={previewAudit} disabled={previewBusy}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11.5px] font-bold disabled:opacity-50" style={{ borderColor: accent, color: accent }}>
              {previewBusy ? <RefreshCw size={11} className="animate-spin" /> : <Mail size={11} />} Preview the audit email {dfsReady && <DfsCostChip requests={8} kind="organic" />}
            </button>
            {!dfsReady && <span className="text-[10.5px] font-semibold text-amber-700">DataForSEO not connected — preview runs on labeled demo data; live sending is disabled (audits are never sent with fabricated numbers).</span>}
          </div>
        </div>
      )}
      <Labeled label={<span className="flex items-center justify-between">Pitch — personalized per contact
        <button onClick={aiPitch} disabled={aiBusy} className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-bold disabled:opacity-50" style={{ background: accent + "14", color: accent }}>
          {aiBusy ? <RefreshCw size={10} className="animate-spin" /> : <Sparkles size={10} />} AI write the pitch
        </button></span>}>
        <textarea value={camp.body} onChange={(e) => patchCamp(camp.id, { body: e.target.value })} rows={7} className={"ll-mono " + inputCls + " resize-y text-[12px]"} />
      </Labeled>
      {targets[0] && (
        <div className="rounded-xl bg-gray-50 p-3 text-[11px] text-gray-500">
          <b className="text-gray-600">Preview for {targets[0].name}:</b> <i>{personalize(camp.subject, targets[0])}</i><br />
          <span className="whitespace-pre-wrap">{personalize(camp.body, targets[0]).slice(0, 320)}…</span>
        </div>
      )}
      <div className="space-y-2">
        <div className="text-[12.5px] font-bold text-gray-700">Follow-up sequence</div>
        {(camp.followUps || []).map((fu, i) => (
          <div key={i} className="rounded-xl border border-gray-100 p-3">
            <div className="mb-1.5 flex items-center gap-2 text-[11.5px] text-gray-500">
              <span className="rounded-full px-2 py-0.5 text-[9px] font-bold text-white" style={{ background: accent }}>Step {i + 2}</span>
              send <input type="number" min={1} value={fu.afterDays} onChange={(e) => patchCamp(camp.id, (c) => ({ followUps: c.followUps.map((x, j) => j === i ? { ...x, afterDays: Math.max(1, +e.target.value || 1) } : x) }))} className={inputCls + " w-14"} /> day(s) after the previous step · same thread ("Re:")
              <button onClick={() => patchCamp(camp.id, (c) => ({ followUps: c.followUps.filter((_, j) => j !== i) }))} className="ml-auto text-gray-300 hover:text-red-500"><X size={13} /></button>
            </div>
            <textarea value={fu.body} onChange={(e) => patchCamp(camp.id, (c) => ({ followUps: c.followUps.map((x, j) => j === i ? { ...x, body: e.target.value } : x) }))} rows={3} className={"ll-mono " + inputCls + " resize-y text-[12px]"} />
          </div>
        ))}
        {(camp.followUps || []).length < 3 && (
          <button onClick={() => patchCamp(camp.id, (c) => ({ followUps: [...(c.followUps || []), { afterDays: 4, body: (camp.guest || folderIsGuest(camp.folder))
            ? "Last one from me — if guest posts aren't a fit for {{name}} right now, no worries at all. If they are, my best {{niche}} topic ideas are one reply away."
            : "Last note from me — should I close the file on {{name}}, or is a free audit worth 10 minutes?" }] }))}
            className="flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-[11.5px] font-medium text-gray-500"><Plus size={12} /> Add follow-up step</button>
        )}
      </div>
      {err && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-700">{err}</div>}
      {replyCheck && <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-[11.5px] font-medium text-violet-700">{replyCheck}</div>}
      {insightNote && <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11.5px] font-medium text-indigo-700">{insightNote}</div>}
      {sending && (
        <div className="rounded-xl border border-gray-200 p-3">
          <div className="mb-1 text-[11.5px] font-semibold text-gray-600">Sending {sending.done}/{sending.total}{sending.fails ? ` · ${sending.fails} failed` : ""}…</div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full transition-all" style={{ width: `${(sending.done / sending.total) * 100}%`, background: accent }} /></div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
        <button disabled={!acct?.smtpOk && !company.apis?.smtp?.values?.host || !toSend.length || !!sending || (camp.insight && !dfsReady)}
          onClick={() => camp.insight
            ? launchInsight()
            : sendBatch(toSend.slice(0, 40).map((contact) => ({ contact, subject: camp.subject, body: camp.body, step: 0 })))}
          className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-40" style={{ background: accent }}>
          <Send size={13} /> {toSend.length ? (camp.insight ? `Launch insight — audit & email ${Math.min(toSend.length, 20)} prospect(s)` : `Launch — email ${Math.min(toSend.length, 40)} prospect(s) now`) : "All emailable prospects contacted"}
          {camp.insight && dfsReady && toSend.length > 0 && <DfsCostChip requests={Math.min(toSend.length, 20) * 8} kind="organic" />}
        </button>
        {camp.insight && (camp.sends || []).some((s) => s.variant === "B" && s.step === 0 && s.ok) && (
          <button disabled={!!sending} onClick={sendAuditsToEngaged}
            className="flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-[12.5px] font-bold disabled:opacity-40" style={{ borderColor: "#6366F1", color: "#4F46E5" }}>
            ✦ Send audits to engaged B prospects
          </button>
        )}
        {dueFollowUps.length > 0 && (
          <button disabled={!!sending} onClick={sendDueFollowUps}
            className="flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-[12.5px] font-bold disabled:opacity-40" style={{ borderColor: accent, color: accent }}>
            Send {dueFollowUps.length} due follow-up(s)
          </button>
        )}
        <span className="text-[10px] text-gray-400">Max 40 per launch · sends from {acct ? acct.email : "your SMTP"} · before follow-ups go out the inbox is checked over IMAP and <b>anyone who replied is skipped automatically</b>.</span>
      </div>
      {camp.insight && (camp.sends || []).length > 0 && (
        <div className="rounded-xl border border-gray-100 p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[12px] font-bold text-gray-700">A/B results</span>
            <button onClick={refreshAbStats} className="rounded-md px-2 py-0.5 text-[10.5px] font-bold" style={{ background: accent + "14", color: accent }}>Refresh</button>
            <span className="text-[10px] text-gray-400">opens/clicks from the tracking pixel · replies from IMAP/manual marks</span>
          </div>
          {abStats ? (
            <table className="w-full text-left text-[11.5px]">
              <thead><tr className="text-[9px] uppercase tracking-wide text-gray-400">
                <th className="py-1 pr-2 font-semibold">Variant</th><th className="py-1 pr-2 font-semibold">Sent</th><th className="py-1 pr-2 font-semibold">Opened</th><th className="py-1 pr-2 font-semibold">Clicked</th><th className="py-1 pr-2 font-semibold">Replied</th><th className="py-1 font-semibold">Audits delivered</th>
              </tr></thead>
              <tbody>
                {["A", "B"].map((v) => (
                  <tr key={v} className="border-t border-gray-50">
                    <td className="py-1.5 pr-2 font-bold" style={{ color: v === "A" ? accent : "#4F46E5" }}>{v} — {v === "A" ? "audit first" : "audit on engagement"}</td>
                    <td className="ll-mono py-1.5 pr-2">{abStats[v].sent}</td>
                    <td className="ll-mono py-1.5 pr-2">{abStats[v].opened}</td>
                    <td className="ll-mono py-1.5 pr-2">{abStats[v].clicked}</td>
                    <td className="ll-mono py-1.5 pr-2 font-bold text-emerald-600">{abStats[v].replied}</td>
                    <td className="ll-mono py-1.5">{abStats[v].audits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="text-[11px] text-gray-400">Hit Refresh to pull the split.</div>}
        </div>
      )}
      {(camp.sends || []).length > 0 && (
        <div className="space-y-1">
          <div className="text-[12px] font-bold text-gray-700">Send log</div>
          {targets.filter((c) => (camp.sends || []).some((s) => s.contactId === c.id)).map((c) => {
            const steps = (camp.sends || []).filter((s) => s.contactId === c.id).sort((a, b) => a.at - b.at);
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 text-[11px]">
                <span className="font-semibold text-gray-700">{c.name}</span>
                <span className="ll-mono text-gray-400">{c.email}</span>
                {steps.map((s) => (
                  <span key={s.id} title={s.error || ""} className={"rounded px-1.5 py-px text-[9px] font-bold " + (s.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>
                    {s.variant ? s.variant + " · " : ""}{s.step === 0 ? "initial" : s.audit ? "audit" : `follow-up ${s.step}`}{s.audit && s.step === 0 ? " +audit" : ""} {s.ok ? "✓" : "✕"}
                  </span>
                ))}
                <label className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-gray-500">
                  <input type="checkbox" checked={!!c.replied} onChange={(e) => commit({ contacts: contacts.map((x) => (x.id === c.id ? { ...x, replied: e.target.checked } : x)) })} />
                  Replied (stop sequence)
                </label>
              </div>
            );
          })}
        </div>
      )}

      {preview && (
        <Modal title="Audit email preview" sub="Exactly what the prospect receives — branded HTML, no PDF" onClose={() => setPreview(null)} wide>
          <iframe title="audit preview" srcDoc={preview} className="h-[70vh] w-full rounded-xl border border-gray-200 bg-white" />
        </Modal>
      )}
    </Card>
  );
}

/* ================= Mailbox: Inbox (IMAP) / Sent / Drafts ================= */
function MailboxTab({ accent, company, store, commit, setSuiteTab, setOpenId }) {
  const accounts = (company.emailAccounts || []).filter((a) => a.imap?.host);
  const allAccounts = company.emailAccounts || [];
  const contacts = store.contacts || [];
  const campaigns = store.campaigns || [];
  const [box, setBox] = useState("inbox");
  const [acctId, setAcctId] = useState(accounts[0]?.id || "");
  const [messages, setMessages] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [openMsg, setOpenMsg] = useState(null);
  const [reply, setReply] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const acct = allAccounts.find((a) => a.id === acctId) || accounts[0];

  const contactOf = (email) => contacts.find((c) => (c.email || "").toLowerCase() === String(email || "").toLowerCase());

  const refresh = async () => {
    if (!acct?.imap?.host) { setNote("This account has no IMAP settings — Gmail accounts get them automatically; edit custom accounts to add them."); return; }
    setBusy(true); setNote(null);
    try {
      const r = await fetch("/api/mail/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(45000),
        body: JSON.stringify({ imap: acct.imap, limit: 25 }) });
      const d = await r.json();
      if (!r.ok) setNote(d.detail || d.error);
      else {
        setMessages(d.messages);
        /* REAL reply detection: an inbox message from a contact's address stops their sequence */
        const hits = d.messages.map((m) => contactOf(m.fromEmail)).filter((c) => c && !c.replied);
        if (hits.length) {
          const ids = new Set(hits.map((c) => c.id));
          commit({ contacts: contacts.map((c) => (ids.has(c.id) ? { ...c, replied: true, repliedAt: Date.now() } : c)) });
          setNote(`✓ ${hits.length} prospect repl${hits.length === 1 ? "y" : "ies"} detected — their sequences are stopped.`);
        }
      }
    } catch (e) { setNote("API server unreachable — " + (e?.message || e)); }
    setBusy(false);
  };

  const sendReply = async () => {
    if (!openMsg || !reply.trim() || !acct) return;
    setReplyBusy(true);
    try {
      const r = await fetch("/api/outreach/send", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ smtp: { ...acct.smtp, from: acct.email }, fromName: acct.name, to: openMsg.fromEmail,
          subject: /^re:/i.test(openMsg.subject) ? openMsg.subject : "Re: " + openMsg.subject, text: reply.trim() }) });
      const d = await r.json();
      commit({ mailLog: [{ id: gid("ml"), to: openMsg.fromEmail, subject: "Re: " + openMsg.subject.replace(/^re:\s*/i, ""), body: reply.trim(), at: Date.now(), ok: r.ok, error: r.ok ? null : (d.detail || d.error) }, ...(store.mailLog || [])] });
      setNote(r.ok ? `✓ Reply sent to ${openMsg.fromEmail}` : (d.detail || d.error));
      if (r.ok) { setOpenMsg(null); setReply(""); }
    } catch (e) { setNote("Send failed: " + (e?.message || e)); }
    setReplyBusy(false);
  };

  /* Sent = every campaign send + manual replies; Drafts = campaigns not yet launched */
  const sentRows = useMemo(() => [
    ...campaigns.flatMap((cp) => (cp.sends || []).map((s) => ({ ...s, campaign: cp.name, subject: personalize(cp.subject, contacts.find((c) => c.id === s.contactId) || {}), kind: s.step === 0 ? "initial" : `follow-up ${s.step}` }))),
    ...(store.mailLog || []).map((m) => ({ ...m, campaign: "manual reply", email: m.to, kind: "reply" })),
  ].sort((a, b) => b.at - a.at), [campaigns, store.mailLog, contacts]);
  const drafts = campaigns.filter((c) => !(c.sends || []).length);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {[["inbox", "Inbox", Inbox], ["sent", "Sent", Send], ["drafts", "Drafts", Mail]].map(([k, l, Icon]) => (
          <button key={k} onClick={() => setBox(k)} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11.5px] font-semibold"
            style={box === k ? { borderColor: accent, background: accent + "10", color: accent } : { borderColor: "#E5E7EB", color: "#6B7280" }}>
            <Icon size={12} /> {l}{k === "drafts" && drafts.length > 0 ? ` (${drafts.length})` : ""}
          </button>
        ))}
        {box === "inbox" && (
          <span className="ml-auto flex items-center gap-2">
            <select value={acctId} onChange={(e) => { setAcctId(e.target.value); setMessages(null); }} className={"ll-mono rounded-lg border border-gray-200 px-2 py-1.5 text-[11px]"}>
              {!accounts.length && <option value="">no IMAP account</option>}
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
            </select>
            <button onClick={refresh} disabled={busy || !accounts.length}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
              {busy ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />} {messages ? "Refresh inbox" : "Load inbox"}
            </button>
          </span>
        )}
      </div>
      {note && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">{note}</div>}

      {box === "inbox" && (
        <Card className="p-4">
          {!accounts.length && <div className="py-8 text-center text-[12px] text-gray-400">Add an email account with IMAP (Gmail accounts include it automatically) to read the inbox here.</div>}
          {accounts.length > 0 && !messages && !busy && <div className="py-8 text-center text-[12px] text-gray-400">Hit <b>Load inbox</b> — the newest 25 messages are pulled live over IMAP. Replies from prospects are detected and stop their sequences.</div>}
          {messages && messages.length === 0 && <div className="py-8 text-center text-[12px] text-gray-400">Inbox is empty.</div>}
          {messages && messages.length > 0 && (
            <div className="divide-y divide-gray-50">
              {messages.map((m) => {
                const c = contactOf(m.fromEmail);
                return (
                  <button key={m.seq} onClick={() => { setOpenMsg(m); setReply(""); }} className="flex w-full items-start gap-2.5 px-1 py-2.5 text-left hover:bg-gray-50">
                    {!m.seen && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} />}
                    <span className={"min-w-0 flex-1 " + (m.seen ? "" : "font-semibold")}>
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[12.5px] text-gray-800">{m.from || m.fromEmail}</span>
                        {c && <span className="rounded bg-violet-100 px-1.5 py-px text-[8.5px] font-bold uppercase text-violet-600">{c.kind === "guestpost" ? "guest site" : "prospect"}</span>}
                        <span className="ll-mono ml-auto shrink-0 text-[9.5px] font-normal text-gray-400">{m.date.replace(/\s[+-]\d{4}.*$/, "")}</span>
                      </span>
                      <span className="block truncate text-[12px] text-gray-600">{m.subject || "(no subject)"}</span>
                      <span className="block truncate text-[11px] font-normal text-gray-400">{m.text.slice(0, 120)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {box === "sent" && (
        <Card className="p-4">
          {sentRows.length === 0 && <div className="py-8 text-center text-[12px] text-gray-400">Nothing sent yet — launch a campaign or reply from the Inbox.</div>}
          <div className="divide-y divide-gray-50">
            {sentRows.slice(0, 60).map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-2 px-1 py-2 text-[11.5px]">
                <span className={"rounded px-1.5 py-px text-[9px] font-bold " + (s.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")} title={s.error || ""}>{s.ok ? "✓" : "✕"} {s.kind}</span>
                <span className="ll-mono text-gray-600">{s.email}</span>
                <span className="min-w-0 flex-1 truncate text-gray-500">{s.subject || ""}</span>
                <span className="text-[10px] text-gray-400">{s.campaign}</span>
                <span className="ll-mono text-[10px] text-gray-400">{new Date(s.at).toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {box === "drafts" && (
        <Card className="p-4">
          {drafts.length === 0 && <div className="py-8 text-center text-[12px] text-gray-400">No drafts — campaigns that haven't launched yet appear here.</div>}
          <div className="space-y-1.5">
            {drafts.map((c) => (
              <button key={c.id} onClick={() => { setOpenId(c.id); setSuiteTab("campaigns"); }} className="flex w-full items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-left text-[12px] hover:border-gray-200">
                <Mail size={13} className="text-gray-300" />
                <span className="font-semibold text-gray-700">{c.name}</span>
                <span className="text-gray-400">· {c.folder}</span>
                <span className="ll-mono ml-auto text-[10px] text-gray-400">draft</span>
                <ChevronRight size={13} className="text-gray-300" />
              </button>
            ))}
          </div>
        </Card>
      )}

      {openMsg && (
        <Modal title={openMsg.subject || "(no subject)"} sub={`${openMsg.from} · ${openMsg.date}`} onClose={() => setOpenMsg(null)}>
          <div className="space-y-3">
            <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-[12.5px] leading-relaxed text-gray-700">{openMsg.text || "(no text content)"}</div>
            {contactOf(openMsg.fromEmail) && <div className="rounded-lg bg-violet-50 px-3 py-1.5 text-[11px] font-semibold text-violet-700">This sender is in your list — their sequence is stopped automatically.</div>}
            <Labeled label={`Reply as ${acct?.email || "—"}`}>
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={5} placeholder="Write your reply…" autoFocus className={inputCls + " resize-y"} />
            </Labeled>
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpenMsg(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-[12px] font-medium text-gray-600">Close</button>
              <button onClick={sendReply} disabled={!reply.trim() || replyBusy}
                className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
                {replyBusy ? <RefreshCw size={12} className="animate-spin" /> : <Reply size={12} />} Send reply
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ================= Analytics ================= */
function AnalyticsTab({ accent, store }) {
  const campaigns = store.campaigns || [];
  const contacts = store.contacts || [];
  const [campId, setCampId] = useState(campaigns[0]?.id || "");
  const [track, setTrack] = useState(null);
  const [busy, setBusy] = useState(false);
  const camp = campaigns.find((c) => c.id === campId) || campaigns[0];

  const load = async (c) => {
    if (!c) return;
    setBusy(true); setTrack(null);
    try {
      const r = await fetch("/api/track/stats", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ prefix: c.id }) });
      const d = await r.json();
      if (r.ok) setTrack(d.stats || {});
    } catch { /* server offline — cards still show send data */ }
    setBusy(false);
  };

  if (!campaigns.length) return <Card className="p-8 text-center text-[12px] text-gray-400">No campaigns yet — analytics appear once a campaign exists.</Card>;

  const sends = camp?.sends || [];
  const init = sends.filter((s) => s.step === 0);
  const delivered = init.filter((s) => s.ok).length;
  const failed = init.length - delivered;
  const followOk = sends.filter((s) => s.step > 0 && s.ok).length;
  const inCamp = new Set(sends.map((s) => s.contactId));
  const replied = contacts.filter((c) => inCamp.has(c.id) && c.replied).length;
  const opened = track ? Object.values(track).filter((t) => t.opens > 0).length : null;
  const clicked = track ? Object.values(track).filter((t) => t.clicks > 0).length : null;
  const pct = (n) => (delivered ? Math.round((n / delivered) * 100) : 0);

  const FUNNEL = [
    { label: "Emails sent", n: init.length + followOk, color: "#64748B", always: true },
    { label: "Delivered (SMTP accepted)", n: delivered, color: accent, always: true, rate: init.length ? Math.round((delivered / init.length) * 100) + "%" : "—" },
    { label: "Opened", n: opened, color: "#8B5CF6", rate: opened != null ? pct(opened) + "%" : null },
    { label: "Clicked", n: clicked, color: "#F59E0B", rate: clicked != null ? pct(clicked) + "%" : null },
    { label: "Replied", n: replied, color: "#16A34A", always: true, rate: pct(replied) + "%" },
  ];
  const max = Math.max(1, ...FUNNEL.map((f) => f.n || 0));

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="ll-display text-[15px] font-semibold">Campaign analytics</div>
        <select value={camp?.id || ""} onChange={(e) => { setCampId(e.target.value); setTrack(null); }} className={inputCls + " w-auto bg-white"}>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={() => load(camp)} disabled={busy} className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[11.5px] font-semibold disabled:opacity-40" style={{ borderColor: accent, color: accent }}>
          {busy ? <RefreshCw size={12} className="animate-spin" /> : <BarChart3 size={12} />} Load open/click data
        </button>
        {camp && !camp.tracking && <span className="rounded-lg bg-gray-100 px-2 py-1 text-[10px] text-gray-500">tracking is OFF for this campaign — opens/clicks aren't collected (plain-text mode)</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[["Sent", init.length + followOk, Send], ["Delivered", delivered, CheckCircle2], ["Opened", opened ?? "—", MailOpen], ["Clicked", clicked ?? "—", MousePointerClick], ["Replied", replied, Reply]].map(([l, v, Icon]) => (
          <div key={l} className="rounded-xl border border-gray-100 p-3 text-center">
            <Icon size={14} className="mx-auto mb-1 text-gray-300" />
            <div className="ll-mono text-[18px] font-bold text-gray-800">{v}</div>
            <div className="text-[9.5px] font-semibold uppercase tracking-wide text-gray-400">{l}</div>
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        {FUNNEL.map((f) => (f.always || f.n != null) && (
          <div key={f.label} className="flex items-center gap-2">
            <span className="w-52 shrink-0 text-right text-[11px] font-semibold text-gray-500">{f.label}</span>
            <div className="h-5 flex-1 overflow-hidden rounded-md bg-gray-50">
              <div className="flex h-full items-center rounded-md pl-2 text-[10px] font-bold text-white transition-all" style={{ width: `${Math.max(4, ((f.n || 0) / max) * 100)}%`, background: f.color }}>{f.n ?? 0}</div>
            </div>
            <span className="ll-mono w-12 shrink-0 text-[10.5px] text-gray-400">{f.rate || ""}</span>
          </div>
        ))}
      </div>
      <div className="grid gap-2 text-[10.5px] leading-relaxed text-gray-400 sm:grid-cols-2">
        <div><b className="text-gray-600">Deliverability</b> = accepted by the recipient's server ({failed} rejected{failed ? " — check the send log" : ""}). Bounces after acceptance land in the Mailbox inbox as mailer-daemon messages.</div>
        <div><b className="text-gray-600">Opens/clicks</b> come from the tracking pixel & link redirects (campaign toggle) served by your own API server. <b>Replies</b> combine IMAP auto-detection and manual marks — the most honest success metric.</div>
      </div>
    </Card>
  );
}

/* ================= the suite ================= */
export function OutreachSuite({ company, onUpdateCompany, accent, aiConfig, scope = "growth" }) {
  const store = company[scope] || { contacts: [], campaigns: [] };
  const ref = useRef(store); ref.current = store;
  const commit = (patch) => onUpdateCompany({ [scope]: { ...ref.current, ...patch } });
  const [tab, setTab] = useState("campaigns");
  const [openId, setOpenId] = useState(null);
  const unsent = (store.campaigns || []).filter((c) => !(c.sends || []).length).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <TabBtn active={tab === "campaigns"} onClick={() => setTab("campaigns")} icon={Send} label="Campaigns" accent={accent} badge={(store.campaigns || []).length} />
        <TabBtn active={tab === "bookings"} onClick={() => setTab("bookings")} icon={CalendarClock} label="Booked Prospects" accent={accent} badge={(store.bookings || []).length} />
        <TabBtn active={tab === "mailbox"} onClick={() => setTab("mailbox")} icon={Inbox} label="Mailbox" accent={accent} badge={unsent} />
        <TabBtn active={tab === "analytics"} onClick={() => setTab("analytics")} icon={BarChart3} label="Analytics" accent={accent} />
        <TabBtn active={tab === "accounts"} onClick={() => setTab("accounts")} icon={AtSign} label="Email accounts" accent={accent} badge={(company.emailAccounts || []).length} />
        <span className="ml-auto rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ background: scope === "guest" ? "#EDE9FE" : "#DBEAFE", color: scope === "guest" ? "#6D28D9" : "#1D4ED8" }}>
          {scope === "guest" ? "Guest post outreach — separate data" : "Prospect outreach — private"}
        </span>
      </div>
      {tab === "campaigns" && <CampaignsTab accent={accent} company={company} store={store} commit={commit} aiConfig={aiConfig} scope={scope} openId={openId} setOpenId={setOpenId} />}
      {tab === "bookings" && <BookingsTab accent={accent} company={company} store={store} commit={commit} />}
      {tab === "mailbox" && <MailboxTab accent={accent} company={company} store={store} commit={commit} setSuiteTab={setTab} setOpenId={setOpenId} />}
      {tab === "analytics" && <AnalyticsTab accent={accent} store={store} />}
      {tab === "accounts" && <AccountsTab company={company} onUpdateCompany={onUpdateCompany} accent={accent} />}
    </div>
  );
}
