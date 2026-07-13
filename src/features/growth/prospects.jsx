/* =====================================================================
   GROWTH & PROSPECTS — the agency's own lead-gen engine.
   1 Lead Finder        — city + GBP category → every business on Google
                          Maps (live via the Places key; labeled demo
                          otherwise), excel-style grid + CSV export.
   2 Prospect List      — folders auto-named "{category} — {city}"; NAP +
                          website + REAL email scraping from each site.
   3 Outreach Campaigns — cold-email sequences (Instantly/Lemlist style):
                          AI-personalized pitch, follow-up steps, real
                          sends through the agency SMTP, per-contact log.
   ===================================================================== */
import React, { useMemo, useRef, useState } from "react";
import {
  AtSign, CheckCircle2, ChevronRight, Download, Folder, FolderOpen, Mail,
  Plus, RefreshCw, Search, Send, Sparkles, Target, Trash2, X,
} from "lucide-react";
import { Card, Labeled, Toggle, inputCls } from "../../ui/primitives.jsx";
import { GBP_CATEGORIES } from "../../data/gbpCategories.js";
import { hashStr, mulberry32 } from "../../lib/rng.js";
import { aiGenerate } from "../../lib/aiwrite.jsx";
import { csvDownload } from "../research/tools.jsx";

const gid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const folderKeyOf = (category, city) => `${category} — ${city}`;
const cityOf = (folder) => (folder.split(" — ")[1] || "").trim();

/* labeled demo rows when no Places key is configured — deterministic, obvious */
function demoLeads(city, category) {
  const r = mulberry32(hashStr(city + "|" + category));
  const first = ["Summit", "Golden", "Prime", "Blue Sky", "Cornerstone", "Metro", "Evergreen", "Bright", "Family", "Premier", "Central", "Elite", "Harbor", "Lakeside", "Downtown", "Sunrise", "Union", "Heritage"];
  const streets = ["Main St", "Oak Ave", "2nd St", "Park Blvd", "Washington Ave", "Maple Dr", "Broadway", "Center St", "Elm St", "5th Ave"];
  return Array.from({ length: 14 + Math.floor(r() * 6) }, (_, i) => {
    const nm = `${first[Math.floor(r() * first.length)]} ${category}`;
    const hasSite = r() > 0.25;
    return {
      placeId: `demo-${i}`, demo: true,
      name: i === 0 ? nm : `${nm}${["", " Co.", " Group", " Pros", " Experts"][Math.floor(r() * 5)]}`,
      address: `${100 + Math.floor(r() * 8900)} ${streets[Math.floor(r() * streets.length)]}, ${city}`,
      phone: `(${200 + Math.floor(r() * 700)}) 555-${String(1000 + Math.floor(r() * 9000))}`,
      website: hasSite ? `https://${nm.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com` : "",
      rating: Math.round((3.4 + r() * 1.6) * 10) / 10, reviews: Math.floor(r() * 320),
      categories: [category.toLowerCase().replace(/\s+/g, "_")], status: "OPERATIONAL", hours: r() > 0.3 ? ["set"] : null,
    };
  });
}

/* =================== 1 · Lead Finder =================== */
function LeadFinder({ accent, placesKey, growth, commit }) {
  const [city, setCity] = useState("");
  const [cat, setCat] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const [detailsCap, setDetailsCap] = useState(20);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [res, setRes] = useState(null); // { city, category, rows, live }
  const catMatches = useMemo(() => {
    const q = cat.trim().toLowerCase();
    return q ? GBP_CATEGORIES.filter((c) => c.toLowerCase().includes(q)).slice(0, 12) : GBP_CATEGORIES.slice(0, 12);
  }, [cat]);

  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/leads/search", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(120000),
        body: JSON.stringify({ city: city.trim(), category: cat.trim(), placesKey, detailsCap }) });
      const d = await r.json();
      if (!r.ok) setErr(d.detail || d.error || `HTTP ${r.status}`);
      else setRes({ ...d, rows: d.rows });
    } catch (e) { setErr("API server unreachable (npm run api) — the Maps search runs through it. " + (e?.message || "")); }
    setBusy(false);
  };
  const loadDemo = () => { setErr(null); setRes({ live: false, city: city.trim(), category: cat.trim(), rows: demoLeads(city.trim(), cat.trim()) }); };

  const inList = (row) => (growth.contacts || []).some((c) => c.placeId === row.placeId);
  const addProspect = (rows) => {
    const folder = folderKeyOf(res.category, res.city);
    const fresh = rows.filter((row) => !inList(row)).map((row) => ({
      id: gid("ct"), placeId: row.placeId, folder,
      name: row.name, address: row.address, phone: row.phone, website: row.website,
      email: "", socials: [], demo: !!row.demo, addedAt: Date.now(), replied: false,
    }));
    if (fresh.length) commit({ contacts: [...(growth.contacts || []), ...fresh] });
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <div className="ll-display text-[15px] font-semibold">Lead Finder — every business in a city, per category</div>
        <div className="text-[11.5px] text-gray-400">
          Searches Google Maps live through your <b>Google Places API key</b> (up to 60 businesses per search, contact details for the top {detailsCap}) —
          zero DataForSEO cost. Services/products/posts counts aren't public API data; run the <b>Business Profile Audit</b> on shortlisted leads for the deep dive.
        </div>
        <div className="grid items-end gap-3 sm:grid-cols-[1fr,1fr,auto,auto]">
          <Labeled label="City"><input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Austin, TX" className={inputCls} /></Labeled>
          <Labeled label="Business category (search Google's list)">
            <div className="relative">
              <input value={cat} onChange={(e) => { setCat(e.target.value); setCatOpen(true); }} onFocus={() => setCatOpen(true)} onBlur={() => setTimeout(() => setCatOpen(false), 150)}
                placeholder="e.g. Dentist, Plumber, HVAC contractor…" className={"w-full " + inputCls} />
              {catOpen && catMatches.length > 0 && (
                <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                  {catMatches.map((c) => (
                    <button key={c} onMouseDown={() => { setCat(c); setCatOpen(false); }} className="block w-full px-3 py-1.5 text-left text-[12px] text-gray-700 hover:bg-gray-50">{c}</button>
                  ))}
                </div>
              )}
            </div>
          </Labeled>
          <Labeled label="Contact details for">
            <select value={detailsCap} onChange={(e) => setDetailsCap(+e.target.value)} className={inputCls + " bg-white"}>
              {[10, 20, 40, 60].map((n) => <option key={n} value={n}>top {n}</option>)}
            </select>
          </Labeled>
          <button onClick={run} disabled={busy || !city.trim() || !cat.trim()}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
            {busy ? <><RefreshCw size={13} className="animate-spin" /> Searching Maps…</> : <><Search size={13} /> Find businesses</>}
          </button>
        </div>
        {err && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11.5px] text-amber-800">
            {err}
            {city.trim() && cat.trim() && <button onClick={loadDemo} className="ml-2 rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[10.5px] font-bold text-amber-700">Load labeled demo results instead</button>}
          </div>
        )}
      </Card>

      {res && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="ll-display text-[14px] font-semibold">{res.rows.length} businesses — {res.category} in {res.city}</div>
            <span className={"rounded px-1.5 py-px text-[8.5px] font-bold uppercase " + (res.live ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{res.live ? "live · Google Maps" : "demo"}</span>
            <span className="ml-auto flex gap-2">
              <button onClick={() => addProspect(res.rows)} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold text-white" style={{ background: accent }}>
                <Plus size={12} /> Add all to prospects
              </button>
              <button onClick={() => csvDownload(`leads-${res.category}-${res.city}.csv`.replace(/[^\w.-]+/g, "-"),
                ["Business", "Address", "Phone", "Website", "Rating", "Reviews", "Categories", "Hours set", "Status"],
                res.rows.map((r) => [r.name, r.address, r.phone, r.website, r.rating ?? "", r.reviews, (r.categories || []).join(" | "), r.hours ? "yes" : "no", r.status]))}
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-[11.5px] font-semibold text-gray-600"><Download size={12} /> Excel / CSV</button>
            </span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full min-w-[900px] text-left text-[11px]">
              <thead><tr className="border-b border-gray-200 bg-gray-50 text-[9.5px] uppercase tracking-wide text-gray-400">
                {["#", "Business", "Address", "Phone", "Website", "Rating", "Reviews", "Cats", "Hours", ""].map((h, i) => <th key={i} className="px-2.5 py-2 font-semibold">{h}</th>)}
              </tr></thead>
              <tbody>
                {res.rows.map((r, i) => (
                  <tr key={r.placeId} className={"border-b border-gray-50 " + (i % 2 ? "bg-gray-50/50" : "")}>
                    <td className="ll-mono px-2.5 py-2 text-gray-400">{i + 1}</td>
                    <td className="max-w-[180px] truncate px-2.5 py-2 font-semibold text-gray-800" title={r.name}>{r.name}</td>
                    <td className="max-w-[200px] truncate px-2.5 py-2 text-gray-500" title={r.address}>{r.address}</td>
                    <td className="ll-mono whitespace-nowrap px-2.5 py-2 text-gray-600">{r.phone || "—"}</td>
                    <td className="ll-mono max-w-[150px] truncate px-2.5 py-2">{r.website ? <a href={r.website} target="_blank" rel="noreferrer" className="underline" style={{ color: accent }}>{r.website.replace(/^https?:\/\/(www\.)?/, "")}</a> : <span className="font-bold text-red-400">no site ✳</span>}</td>
                    <td className="ll-mono px-2.5 py-2 text-gray-600">{r.rating ?? "—"}</td>
                    <td className="ll-mono px-2.5 py-2 text-gray-600">{r.reviews}</td>
                    <td className="ll-mono px-2.5 py-2 text-gray-600">{(r.categories || []).length}</td>
                    <td className="px-2.5 py-2 text-gray-600">{r.hours ? "✓" : "—"}</td>
                    <td className="px-2.5 py-2">
                      {inList(r)
                        ? <span className="flex items-center gap-1 text-[10.5px] font-bold text-emerald-600"><CheckCircle2 size={11} /> Added</span>
                        : <button onClick={() => addProspect([r])} className="whitespace-nowrap rounded-md px-2 py-1 text-[10.5px] font-bold" style={{ background: accent + "14", color: accent }}>+ Prospect</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[10.5px] text-gray-400">✳ businesses with no website are your hottest web-design prospects. Ratings under 4.0 or missing hours signal weak profiles — easy SEO pitches.</div>
        </Card>
      )}
    </div>
  );
}

/* =================== 2 · Prospect List =================== */
function ProspectList({ accent, growth, commit }) {
  const contacts = growth.contacts || [];
  const folders = useMemo(() => {
    const map = {};
    contacts.forEach((c) => { (map[c.folder] = map[c.folder] || []).push(c); });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [contacts]);
  const [sel, setSel] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [note, setNote] = useState(null);
  const active = folders.find(([k]) => k === sel) || folders[0];

  const patchContact = (id, patch) => commit({ contacts: contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const scrape = async (c) => {
    if (!c.website) { setNote(`${c.name} has no website to scrape.`); return; }
    setBusyId(c.id); setNote(null);
    try {
      const r = await fetch("/api/scrape-email", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(25000), body: JSON.stringify({ website: c.website }) });
      const d = await r.json();
      if (r.ok && d.emails?.length) patchContact(c.id, { email: d.emails[0], allEmails: d.emails, socials: d.socials || [] });
      else setNote(r.ok ? `No public email found on ${c.website} — check the site's contact form.` : d.detail || "Scrape failed.");
    } catch (e) { setNote("API server unreachable — email scraping runs there. " + (e?.message || "")); }
    setBusyId(null);
  };

  if (!folders.length) return (
    <Card className="p-10 text-center">
      <FolderOpen size={26} className="mx-auto text-gray-300" />
      <div className="ll-display mt-2 text-[15px] font-semibold">No prospects yet</div>
      <p className="mx-auto mt-1 max-w-md text-[12px] text-gray-400">Run the <b>Lead Finder</b> and click "+ Prospect" on interesting businesses — folders are created automatically per category + city.</p>
    </Card>
  );
  const [folderName, list] = active || ["", []];
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="w-full shrink-0 space-y-1 lg:w-64">
        {folders.map(([k, arr]) => (
          <button key={k} onClick={() => setSel(k)} className="flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left"
            style={k === folderName ? { borderColor: accent, background: accent + "0A" } : { borderColor: "#E5E7EB", background: "#fff" }}>
            <Folder size={14} style={{ color: k === folderName ? accent : "#9CA3AF" }} />
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-gray-700">{k}</span>
            <span className="ll-mono rounded-full bg-gray-100 px-1.5 py-0.5 text-[9.5px] font-bold text-gray-500">{arr.length}</span>
          </button>
        ))}
      </div>
      <Card className="min-w-0 flex-1 space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="ll-display text-[14px] font-semibold">{folderName}</div>
          <span className="text-[11px] text-gray-400">· {list.filter((c) => c.email).length}/{list.length} with email</span>
          <span className="ml-auto flex gap-2">
            <button onClick={async () => { for (const c of list.filter((x) => !x.email && x.website)) await scrape(c); }}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold text-white" style={{ background: accent }}>
              <AtSign size={12} /> Scrape all missing emails
            </button>
            <button onClick={() => csvDownload(`prospects-${folderName}.csv`.replace(/[^\w.-]+/g, "-"),
              ["Business", "Address", "Phone", "Website", "Email", "Socials"],
              list.map((c) => [c.name, c.address, c.phone, c.website, c.email, (c.socials || []).join(" | ")]))}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-[11.5px] font-semibold text-gray-600"><Download size={12} /> CSV</button>
          </span>
        </div>
        {note && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">{note}</div>}
        <div className="space-y-1.5">
          {list.map((c) => (
            <div key={c.id} className="rounded-xl border border-gray-100 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold text-gray-800">{c.name}</span>
                {c.demo && <span className="rounded bg-amber-100 px-1.5 py-px text-[8px] font-bold uppercase text-amber-700">demo</span>}
                <span className="ml-auto flex items-center gap-1.5">
                  {c.website && (
                    <button onClick={() => scrape(c)} disabled={busyId === c.id} title="Scrape the site for a contact email (real fetch of their public pages)"
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-bold disabled:opacity-50" style={{ background: accent + "14", color: accent }}>
                      {busyId === c.id ? <RefreshCw size={10} className="animate-spin" /> : <AtSign size={10} />} Scrape email
                    </button>
                  )}
                  <button onClick={() => commit({ contacts: contacts.filter((x) => x.id !== c.id) })} className="rounded-md p-1 text-gray-300 hover:text-red-500"><Trash2 size={12} /></button>
                </span>
              </div>
              <div className="mt-1 grid gap-x-4 gap-y-0.5 text-[11px] text-gray-500 sm:grid-cols-2">
                <span>{c.address}</span>
                <span className="ll-mono">{c.phone || "no phone"}</span>
                {c.website && <a href={c.website} target="_blank" rel="noreferrer" className="ll-mono truncate underline" style={{ color: accent }}>{c.website.replace(/^https?:\/\/(www\.)?/, "")}</a>}
                <span className="flex items-center gap-1">
                  <Mail size={10} className="shrink-0 text-gray-300" />
                  <input value={c.email} onChange={(e) => patchContact(c.id, { email: e.target.value })} placeholder="email — scrape or enter manually"
                    className="ll-mono w-full border-b border-dashed border-gray-200 bg-transparent text-[11px] outline-none focus:border-gray-400" />
                </span>
              </div>
              {(c.socials || []).length > 0 && <div className="ll-mono mt-1 truncate text-[9.5px] text-gray-400">{c.socials.join(" · ")}</div>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* =================== 3 · Outreach Campaigns =================== */
const personalize = (tpl, c) => String(tpl || "")
  .replaceAll("{{name}}", c.name || "there")
  .replaceAll("{{website}}", c.website || "your website")
  .replaceAll("{{city}}", cityOf(c.folder) || "your area")
  .replaceAll("{{niche}}", c.niche || (c.folder.split(" — ")[0] || "your niche").toLowerCase())
  .replaceAll("{{category}}", (c.folder.split(" — ")[0] || "business").toLowerCase());

function Outreach({ accent, company, growth, commit, aiConfig }) {
  const smtp = company.apis?.smtp?.values;
  const smtpReady = !!(smtp?.host && smtp?.user);
  const contacts = growth.contacts || [];
  const campaigns = growth.campaigns || [];
  const folders = [...new Set(contacts.map((c) => c.folder))];
  /* a folder is "guest-post" outreach when its saved sites came from the
     Guest Post Finder — the pitch, subject and merge tags all adapt */
  const folderIsGuest = (folder) => contacts.some((c) => c.folder === folder && c.kind === "guestpost");
  const [openId, setOpenId] = useState(null);
  const [fromName, setFromName] = useState(growth.fromName || company.name || "");
  const [testTo, setTestTo] = useState("");
  const [sending, setSending] = useState(null); // { done, total, fails }
  const [err, setErr] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const camp = campaigns.find((c) => c.id === openId);

  const patchCamp = (id, patch) => commit({ campaigns: campaigns.map((c) => (c.id === id ? { ...c, ...(typeof patch === "function" ? patch(c) : patch) } : c)) });
  const newCampaign = () => {
    const folder = folders[0] || "";
    const guest = folderIsGuest(folder);
    const c = guest ? {
      id: gid("cp"), name: "Guest post outreach", folder, status: "draft", createdAt: Date.now(), guest: true,
      subject: "Guest post for {{name}}?",
      body: `Hi,\n\nI'm a big fan of {{website}} — your recent {{niche}} posts are exactly the depth I look for.\n\nI'd love to contribute a original, well-researched guest article your readers would genuinely find useful (no fluff, no thin content). I can send a few headline ideas tailored to your audience — would that be welcome?\n\nEither way, keep up the great work.\n\n${fromName || company.name}`,
      followUps: [{ afterDays: 3, body: "Hi again — just bumping this in case it slipped by. Happy to send 2–3 {{niche}} topic ideas for {{name}} so you can see the angle before committing. Worth a look?" }],
      sends: [],
    } : {
      id: gid("cp"), name: "New campaign", folder, status: "draft", createdAt: Date.now(),
      subject: "Quick question about {{name}}",
      body: `Hi {{name}} team,\n\nI was looking at local {{category}} results in {{city}} and noticed a few quick wins on {{website}} that competitors are already using.\n\nMind if I send over a free 2-minute audit? No strings — if it's useful, great.\n\n${fromName || company.name}`,
      followUps: [{ afterDays: 3, body: "Hi again — just floating my last note to the top. Want that free audit for {{name}}? Takes me 10 minutes, could be worth a lot to you." }],
      sends: [],
    };
    commit({ campaigns: [c, ...campaigns], fromName });
    setOpenId(c.id);
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
        prompt: `Sender: ${fromName || company.name}. Audience: ${camp.folder || "niche blogs"} — blogs that accept guest posts in the "${(camp.folder.split(" — ")[0] || "").trim()}" niche. Goal: land a guest post. Write the email.`,
      } : {
        system: `You are a cold-email expert (Instantly/Lemlist school). Write ONE plain-text cold email:
- under 110 words, first line personal, one concrete observation, ONE soft CTA (a question), no links, no images, no spam words (free!!!, guarantee, act now), no "hope this finds you well"
- use merge tags exactly: {{name}} (business name), {{city}}, {{category}}, {{website}}
- Output format: first line "Subject: ..." then a blank line then the body. Nothing else.`,
        maxTokens: 400,
        prompt: `Sender: ${fromName || company.name}, a local-SEO & web agency. Audience: ${camp.folder || "local businesses"}. Offer: a free mini SEO/website audit that leads to a proposal. Write the email.`,
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
  /* follow-ups that are due: initial send ok, N days elapsed, not replied, step not yet sent */
  const dueFollowUps = camp ? (camp.followUps || []).flatMap((fu, fi) =>
    (camp.sends || []).filter((s) => s.step === 0 && s.ok
      && Date.now() - s.at >= fu.afterDays * 864e5
      && !(camp.sends || []).some((x) => x.contactId === s.contactId && x.step === fi + 1)
      && !contacts.find((c) => c.id === s.contactId)?.replied
      && contacts.find((c) => c.id === s.contactId))
      .map((s) => ({ contact: contacts.find((c) => c.id === s.contactId), fu, step: fi + 1 }))) : [];

  const sendBatch = async (batch) => { // batch: [{contact, subject, body, step}]
    setSending({ done: 0, total: batch.length, fails: 0 }); setErr(null);
    const results = [];
    for (let i = 0; i < batch.length; i++) {
      const { contact, subject, body, step } = batch[i];
      try {
        const r = await fetch("/api/outreach/send", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000),
          body: JSON.stringify({ smtp, fromName, to: contact.email, subject: personalize(subject, contact), text: personalize(body, contact) }) });
        const d = await r.json();
        results.push({ id: gid("sd"), contactId: contact.id, email: contact.email, step, at: Date.now(), ok: r.ok, error: r.ok ? null : (d.detail || d.error) });
        if (!r.ok && r.status === 503) { setErr(d.detail); break; }
      } catch (e) { results.push({ id: gid("sd"), contactId: contact.id, email: contact.email, step, at: Date.now(), ok: false, error: String(e?.message || e) }); }
      setSending({ done: i + 1, total: batch.length, fails: results.filter((x) => !x.ok).length });
      if (i < batch.length - 1) await new Promise((res) => setTimeout(res, 1300)); // spacing protects the sender score
    }
    patchCamp(camp.id, (c) => ({ sends: [...(c.sends || []), ...results], status: "running", launchedAt: c.launchedAt || Date.now() }));
    setSending(null);
  };

  return (
    <div className="space-y-4">
      {/* sender */}
      <Card className="space-y-3 p-5">
        <div className="ll-display text-[15px] font-semibold">Sending account</div>
        <div className="grid items-end gap-3 sm:grid-cols-[1fr,1fr,auto]">
          <Labeled label="From name"><input value={fromName} onChange={(e) => setFromName(e.target.value)} onBlur={() => commit({ fromName })} className={inputCls} /></Labeled>
          <Labeled label="SMTP (Company Settings → API settings)">
            <div className={"flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] " + (smtpReady ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700")}>
              {smtpReady ? <><CheckCircle2 size={12} /> {smtp.user} via {smtp.host}</> : "Not configured — add the SMTP credentials (same as sign-in emails)."}
            </div>
          </Labeled>
          <div className="flex gap-2">
            <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@agency.com" className={inputCls + " w-44"} />
            <button disabled={!smtpReady || !testTo.trim()}
              onClick={() => sendBatch([{ contact: { id: "test", name: "Test", email: testTo.trim(), folder: folders[0] || "Test — City", website: "example.com" }, subject: "SERP Squad outreach test", body: "This is a deliverability test from your outreach tool. Plain text, sent through your own SMTP — check the spam folder too.", step: -1 }])}
              className="whitespace-nowrap rounded-lg border border-gray-200 px-3 py-2 text-[11.5px] font-semibold text-gray-600 disabled:opacity-40">Send test</button>
          </div>
        </div>
        <div className="rounded-xl bg-gray-50 p-3 text-[10.5px] leading-relaxed text-gray-500">
          <b className="text-gray-700">Deliverability rules baked in:</b> plain-text only (no HTML/images/links in the AI pitch) · 1.3s spacing between sends ·
          server-enforced 60/hour cap · follow-ups stop the moment you mark a contact <b>Replied</b>. Before real volume: set up <b>SPF, DKIM & DMARC</b> on the
          sending domain, warm the inbox 2–3 weeks, and stay under ~40 cold emails/day per inbox.
        </div>
      </Card>

      {/* campaign list / editor */}
      {!camp ? (
        <Card className="space-y-2 p-5">
          <div className="flex items-center justify-between">
            <div className="ll-display text-[15px] font-semibold">Campaigns</div>
            <button onClick={newCampaign} disabled={!folders.length}
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
              <Plus size={13} /> New campaign
            </button>
          </div>
          {!folders.length && <div className="text-[11.5px] text-gray-400">Add prospects first — campaigns target a prospect folder.</div>}
          {campaigns.map((c) => {
            const ok = (c.sends || []).filter((s) => s.ok).length;
            return (
              <button key={c.id} onClick={() => setOpenId(c.id)} className="flex w-full items-center gap-3 rounded-xl border border-gray-100 p-3 text-left hover:border-gray-200">
                <Send size={14} style={{ color: accent }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-gray-800">{c.name}</span>
                  <span className="block text-[10.5px] text-gray-400">{c.folder} · {(c.followUps || []).length} follow-up step(s)</span>
                </span>
                <span className={"rounded-full px-2 py-0.5 text-[9px] font-bold uppercase " + (c.status === "running" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500")}>{c.status}</span>
                <span className="ll-mono text-[10.5px] text-gray-400">{ok} sent</span>
                <ChevronRight size={14} className="text-gray-300" />
              </button>
            );
          })}
          {campaigns.length === 0 && folders.length > 0 && <div className="py-3 text-center text-[11.5px] text-gray-300">No campaigns yet.</div>}
        </Card>
      ) : (
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setOpenId(null)} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-500">← Campaigns</button>
            <input value={camp.name} onChange={(e) => patchCamp(camp.id, { name: e.target.value })} className="ll-display min-w-0 flex-1 border-b border-transparent bg-transparent text-[15px] font-semibold outline-none focus:border-gray-300" />
            <button onClick={() => { commit({ campaigns: campaigns.filter((x) => x.id !== camp.id) }); setOpenId(null); }} className="rounded-md p-1.5 text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label={<span className="flex items-center gap-1.5">Prospect folder ({targets.length} contacts · {emailable.length} emailable)
              {(camp.guest || folderIsGuest(camp.folder)) && <span className="rounded bg-violet-100 px-1.5 py-px text-[8.5px] font-bold uppercase text-violet-600">guest post</span>}</span>}>
              <select value={camp.folder} onChange={(e) => patchCamp(camp.id, { folder: e.target.value, guest: folderIsGuest(e.target.value) })} className={inputCls + " bg-white"}>
                {folders.map((f) => <option key={f}>{f}</option>)}
              </select>
            </Labeled>
            <Labeled label={`Subject (merge tags: {{name}} {{website}} ${camp.guest || folderIsGuest(camp.folder) ? "{{niche}}" : "{{city}} {{category}}"})`}>
              <input value={camp.subject} onChange={(e) => patchCamp(camp.id, { subject: e.target.value })} className={inputCls} />
            </Labeled>
          </div>
          <Labeled label={<span className="flex items-center justify-between">Pitch — plain text, personalized per contact
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
          {/* follow-ups */}
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
          {sending && (
            <div className="rounded-xl border border-gray-200 p-3">
              <div className="mb-1 text-[11.5px] font-semibold text-gray-600">Sending {sending.done}/{sending.total}{sending.fails ? ` · ${sending.fails} failed` : ""}…</div>
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full transition-all" style={{ width: `${(sending.done / sending.total) * 100}%`, background: accent }} /></div>
            </div>
          )}
          {/* launch + follow-up queue */}
          <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
            <button disabled={!smtpReady || !toSend.length || !!sending}
              onClick={() => sendBatch(toSend.slice(0, 40).map((contact) => ({ contact, subject: camp.subject, body: camp.body, step: 0 })))}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-40" style={{ background: accent }}>
              <Send size={13} /> {toSend.length ? `Launch — email ${Math.min(toSend.length, 40)} prospect(s) now` : "All emailable prospects contacted"}
            </button>
            {dueFollowUps.length > 0 && (
              <button disabled={!smtpReady || !!sending}
                onClick={() => sendBatch(dueFollowUps.slice(0, 40).map(({ contact, fu, step }) => ({ contact, subject: "Re: " + camp.subject, body: fu.body, step })))}
                className="flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-[12.5px] font-bold disabled:opacity-40" style={{ borderColor: accent, color: accent }}>
                Send {dueFollowUps.length} due follow-up(s)
              </button>
            )}
            <span className="text-[10px] text-gray-400">Max 40 per launch · real sends via your SMTP{smtpReady ? "" : " (configure it above first)"} · reply detection needs IMAP — mark replies below to stop sequences.</span>
          </div>
          {/* per-contact log */}
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
                        {s.step === 0 ? "initial" : `follow-up ${s.step}`} {s.ok ? "✓" : "✕"}
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
        </Card>
      )}
    </div>
  );
}

/* =================== the view =================== */
export function GrowthView({ tab, setTab, company, onUpdateCompany, accent, aiConfig, placesKey, showTabs = true }) {
  const growth = company.growth || { contacts: [], campaigns: [] };
  const ref = useRef(growth); ref.current = growth;
  /* commit against the freshest state so async loops (scrape-all, send batches) never clobber */
  const commit = (patch) => onUpdateCompany({ growth: { ...ref.current, ...patch } });

  const TABS = [["finder", "Lead Finder", Target], ["prospects", `Prospect List`, FolderOpen], ["outreach", "Outreach Campaigns", Send]];
  return (
    <div className="ll-fade mx-auto max-w-5xl space-y-4 p-5">
      {showTabs && (
        <div className="flex flex-wrap gap-1.5">
          {TABS.map(([k, l, Icon]) => (
            <button key={k} onClick={() => setTab(k)} className="flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold"
              style={tab === k ? { background: accent, borderColor: accent, color: "#fff" } : { background: "#fff", borderColor: "#E5E7EB", color: "#4B5563" }}>
              <Icon size={13} /> {l}
              {k === "prospects" && (growth.contacts || []).length > 0 && <span className="ll-mono rounded-full bg-white/20 px-1.5 text-[9.5px] font-bold" style={tab === k ? {} : { background: "#F3F4F6", color: "#6B7280" }}>{growth.contacts.length}</span>}
            </button>
          ))}
        </div>
      )}
      {tab === "finder" && <LeadFinder accent={accent} placesKey={placesKey} growth={growth} commit={commit} />}
      {tab === "prospects" && <ProspectList accent={accent} growth={growth} commit={commit} />}
      {tab === "outreach" && <Outreach accent={accent} company={company} growth={growth} commit={commit} aiConfig={aiConfig} />}
    </div>
  );
}
