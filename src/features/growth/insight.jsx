/* =====================================================================
   INSIGHTFUL CAMPAIGNS — the audit engine behind them.
   One /api/insight/audit call per prospect (≈$0.025 of DataForSEO +
   the agency's own Places key) returns GBP + website + 6 organic ranks
   + 2 map ranks + competitors. This module turns that into a BRANDED,
   email-safe HTML audit (no PDF): inline styles only, YouTube as
   thumbnail links (mail clients strip iframes), rule-based summaries
   (zero AI cost) showing losses and the chance of winning.
   ===================================================================== */
import { hashStr, mulberry32 } from "../../lib/rng.js";
import { appOrigin } from "../../lib/appOrigin.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/* the snapshot/booking base: in local dev the vite proxy serves /api, so the
   in-app preview works; hosted, everything resolves to the app domain */
export const apiBase = () => (typeof window !== "undefined" && /localhost|127\.0\.0\.1/.test(window.location.hostname) ? window.location.origin : appOrigin());

/* youtube url → video id (watch?v=, youtu.be/, shorts/, embed/) */
export const ytId = (url) => {
  const m = String(url || "").match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{6,20})/);
  return m ? m[1] : null;
};

export async function generateInsightAudit({ business, category, city, dfs, placesKey }) {
  const r = await fetch("/api/insight/audit", {
    method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(120000),
    body: JSON.stringify({ business, category, city, placesKey: placesKey || undefined,
      dfs: dfs?.login && dfs?.password && !String(dfs.login).includes("demo@serpsquad") ? { login: dfs.login, password: dfs.password } : undefined }),
  });
  const d = await r.json();
  if (!r.ok) { const e = new Error(d.detail || d.error || `HTTP ${r.status}`); e.code = r.status; throw e; }
  return d;
}

/* labeled demo audit — same shape as the endpoint, for previews only */
export function demoInsightAudit(business, category, city) {
  const r = mulberry32(hashStr(`${business.name}|${category}|${city}`));
  const cityShort = city.split(",")[0].trim();
  const kws = [category, `${category} near me`, `${category} ${cityShort}`, `${category} service`, `${category} contractor`, `${category} company`];
  const comps = ["prime", "citywide", "elite", "allstar", "metro", "summit", "rapid", "family", "premier", "local"].map((p) => `${p}${category.replace(/\s+/g, "")}.com`);
  const topFor = () => comps.slice().sort(() => r() - 0.5).slice(0, 10).map((d, i) => ({ domain: d, rank: i + 1, title: d.split(".")[0] }));
  return {
    live: false, demo: true, business: { name: business.name, city, website: business.website || "" }, category,
    gbp: { name: business.name, rating: Math.round((3.4 + r() * 1.4) * 10) / 10, reviews: Math.floor(r() * 90), photosVisible: Math.floor(r() * 9),
      description: r() > 0.5 ? "" : "Short description under 100 chars.", hours: r() > 0.4 ? ["set"] : [], categories: [category], website: business.website || "" },
    website: business.website ? { crawled: 5, pages: Array.from({ length: 5 }, (_, i) => ({ path: i ? `/page-${i}` : "/", title: r() > 0.3 ? "Page title" : "", titleLen: 20 + Math.floor(r() * 40), metaDescLen: r() > 0.5 ? 0 : 120, h1Count: r() > 0.7 ? 0 : 1, words: 120 + Math.floor(r() * 600), imagesNoAlt: Math.floor(r() * 6), schemaTypes: r() > 0.75 ? ["LocalBusiness"] : [], https: true })) } : { note: "No website on file — a huge opportunity in itself." },
    organic: kws.map((k) => ({ keyword: k, position: r() < 0.3 ? 1 + Math.floor(r() * 10) : r() < 0.55 ? 11 + Math.floor(r() * 19) : null, top: topFor() })),
    geoGrid: (() => {
      const points = []; let found = 0, top3 = 0, sum = 0;
      for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) {
        const roll = r();
        const rank = roll < 0.4 ? 1 + Math.floor(r() * 3) : roll < 0.65 ? 4 + Math.floor(r() * 16) : null;
        if (rank != null) { found++; sum += rank; if (rank <= 3) top3++; }
        points.push({ row, col, rank, skipped: false });
      }
      return { keyword: `${category} ${cityShort}`, size: 5, spacingKm: 2, points, total: 25, found, top3,
        centerRank: points[12].rank, arp: found ? Math.round((sum / found) * 10) / 10 : null, solv: Math.round((top3 / 25) * 100) };
    })(),
    competitors: comps.slice(0, 10).map((d, i) => ({ domain: d, appearances: 8 - Math.floor(i / 2), bestRank: i + 1 })),
    requestsUsed: 0,
  };
}

/* ---- rule-based summaries: short, concrete, losses + the win ---- */
export function auditSummaries(a) {
  const s = {};
  const orgMiss = a.organic.filter((k) => !k.position || k.position > 10);
  const orgTop3 = a.organic.filter((k) => k.position && k.position <= 3);
  const topComp = a.competitors[0];
  s.organic = {
    loss: orgMiss.length ? `Missing from Google's top 10 for ${orgMiss.length} of ${a.organic.length} money keywords${topComp ? ` — searches ${topComp.domain.replace("📍 ", "")} is capturing right now` : ""}.` : "Strong visibility across the money keywords.",
    win: orgMiss.length ? `Ranking for even ${Math.min(2, orgMiss.length)} more of these puts ${a.business.name} in front of every customer typing them — these are bottom-of-funnel, ready-to-buy searches.` : `Defend the lead: ${orgTop3.length} top-3 spots are worth protecting with fresh content.`,
  };
  const gg = a.geoGrid && a.geoGrid.points ? a.geoGrid : null;
  s.maps = gg ? {
    loss: gg.solv < 60
      ? `In the Google Maps 3-pack at only ${gg.top3} of ${gg.total} points around ${a.business.city.split(",")[0]} (${gg.solv}% coverage)${topComp ? ` — ${topComp.domain.replace("📍 ", "")} owns the map where you don't` : ""}. Every grey/red square is a neighbourhood handing its calls to a competitor.`
      : `Strong map coverage — top-3 at ${gg.top3} of ${gg.total} grid points (${gg.solv}%).`,
    win: gg.solv < 60 ? "Profile optimization + review velocity + geo-relevant citations typically expand the green zone across 60–90 days — that's more of the map showing YOUR business first." : "Hold it: keep reviews and posts flowing so the coverage doesn't slip.",
  } : { loss: a.geoGrid?.note || "Map grid unavailable.", win: "" };
  if (a.gbp && !a.gbp.note) {
    const g = a.gbp; const issues = [];
    if ((g.rating || 0) < 4.4) issues.push(`rating ${g.rating}★ (buyers filter at 4.4+)`);
    if ((g.reviews || 0) < 30) issues.push(`only ${g.reviews} reviews`);
    if (!g.description || g.description.length < 200) issues.push("thin/missing description");
    if ((g.photosVisible || 0) < 8) issues.push("few photos");
    if (!(g.hours || []).length) issues.push("no business hours");
    s.gbp = {
      loss: issues.length ? `Profile gaps: ${issues.join(", ")}.` : "The profile fundamentals look solid.",
      win: issues.length ? "These are quick fixes — a complete profile converts up to 70% more profile views into calls & directions." : "Next lever: weekly posts and fresh photos to boost engagement signals.",
    };
  } else s.gbp = { loss: a.gbp?.note || "GBP data unavailable.", win: "" };
  if (a.website?.pages?.length) {
    const p = a.website.pages;
    const iss = [];
    const noDesc = p.filter((x) => !x.metaDescLen).length; if (noDesc) iss.push(`${noDesc} page(s) without meta descriptions`);
    const thin = p.filter((x) => (x.words || 0) < 300).length; if (thin) iss.push(`${thin} thin page(s) (<300 words)`);
    const noSchema = p.filter((x) => !(x.schemaTypes || []).length).length; if (noSchema) iss.push(`${noSchema} without schema markup`);
    const noH1 = p.filter((x) => !x.h1Count).length; if (noH1) iss.push(`${noH1} missing an H1`);
    s.website = {
      loss: iss.length ? `Across ${a.website.crawled} crawled pages: ${iss.join(", ")}.` : `The ${a.website.crawled} crawled pages pass the technical basics.`,
      win: iss.length ? "Each fix directly feeds the rankings above — technical SEO is the cheapest ranking win available." : "The next win is content depth on service pages.",
    };
  } else s.website = { loss: a.website?.note || "Website not analyzed.", win: a.website?.note?.includes("No website") ? "A fast, service-focused site would immediately unlock every keyword opportunity above." : "" };
  return s;
}

/* ---- the branded HTML audit email (email-safe: tables, inline styles) ---- */
const chip = (pos, capNote) => {
  const [bg, fg, label] = pos == null ? ["#FEE2E2", "#B91C1C", capNote] : pos <= 3 ? ["#DCFCE7", "#15803D", "#" + pos] : pos <= 10 ? ["#D9F99D", "#3F6212", "#" + pos] : ["#FEF3C7", "#92400E", "#" + pos];
  return `<span style="display:inline-block;min-width:44px;text-align:center;padding:2px 8px;border-radius:6px;background:${bg};color:${fg};font-weight:700;font-size:13px">${label}</span>`;
};
const summaryBox = (s) => `
  <div style="border-left:4px solid #DC2626;background:#FEF2F2;padding:8px 12px;border-radius:0 8px 8px 0;margin:10px 0 4px;font-size:13px;color:#7F1D1D"><b>Where you're losing:</b> ${esc(s.loss)}</div>
  ${s.win ? `<div style="border-left:4px solid #16A34A;background:#F0FDF4;padding:8px 12px;border-radius:0 8px 8px 0;margin:4px 0 10px;font-size:13px;color:#14532D"><b>Your chance to win:</b> ${esc(s.win)}</div>` : ""}`;
const h2 = (t, accent) => `<h2 style="font-size:17px;margin:26px 0 6px;color:#111827;border-bottom:2px solid ${accent};padding-bottom:5px">${t}</h2>`;

/* 5×5 geo-grid → an email-safe heatmap (nested table with bgcolor cells,
   which every mail client renders — no images, no SVG, no hosting) */
const gridCell = (rank) => {
  const [bg, fg] = rank == null ? ["#FCA5A5", "#7F1D1D"] : rank <= 3 ? ["#22C55E", "#fff"] : rank <= 10 ? ["#FCD34D", "#78350F"] : ["#FDBA74", "#7C2D12"];
  return `<td width="20%" bgcolor="${bg}" style="background:${bg};color:${fg};text-align:center;font-weight:700;font-size:13px;padding:10px 0;border:2px solid #fff;border-radius:6px">${rank == null ? "20+" : rank}</td>`;
};
const geoGridTable = (gg) => `
  <table cellpadding="0" cellspacing="0" width="100%" style="max-width:340px;margin:6px auto">
    ${[0, 1, 2, 3, 4].map((row) => `<tr>${[0, 1, 2, 3, 4].map((col) => {
      const p = gg.points.find((x) => x.row === row && x.col === col) || {};
      return gridCell(p.rank);
    }).join("")}</tr>`).join("")}
  </table>
  <div style="text-align:center;font-size:11px;color:#6B7280;margin-top:4px">5×5 grid · 2 km spacing · your business sits at the centre · <span style="color:#16A34A;font-weight:700">green = top 3</span>, <span style="color:#B45309;font-weight:700">amber = 4-10</span>, <span style="color:#B91C1C;font-weight:700">red = not ranking</span></div>`;

export function buildAuditEmailHtml(a, { company, accent = "#0E7C66", videos = [], pitch = "", bookingUrl = "", repName = "" }) {
  const s = auditSummaries(a);
  const vids = videos.map(ytId).filter(Boolean).slice(0, 3);
  const g = a.gbp && !a.gbp.note ? a.gbp : null;
  const gg = a.geoGrid && a.geoGrid.points ? a.geoGrid : null;
  return `<div style="margin:0;padding:0;background:#F3F4F6"><div style="max-width:640px;margin:0 auto;padding:18px;font-family:Arial,Helvetica,sans-serif;color:#1F2937">
  ${a.demo ? `<div style="background:#F59E0B;color:#111;font-weight:800;text-align:center;padding:6px;border-radius:8px;margin-bottom:10px;font-size:12px">DEMO DATA — preview only, never send this to a prospect</div>` : ""}
  <div style="background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E5E7EB">
    <div style="background:${accent};padding:18px 24px">
      <div style="color:#fff;font-size:20px;font-weight:800">${esc(company.name)}</div>
      <div style="color:#fff;opacity:.85;font-size:12px">Local Visibility Audit — prepared for <b>${esc(a.business.name)}</b>, ${esc(a.business.city)}</div>
    </div>
    <div style="padding:20px 24px">
      ${pitch ? `<p style="font-size:14px;line-height:1.6;white-space:pre-line;margin:0 0 6px">${esc(pitch)}</p>` : ""}

      ${h2("📍 Google Maps coverage — where you show up", accent)}
      ${gg ? `<p style="font-size:13px;color:#4B5563;margin:2px 0 6px">Live geo-grid scan for <b>"${esc(gg.keyword)}"</b> — in the top 3 at <b>${gg.top3} of ${gg.total}</b> points (${gg.solv}% of the map), average rank ${gg.arp ?? "—"} where you appear.</p>
      ${gg.snapshotId
        ? `<a href="https://www.google.com/maps/search/${encodeURIComponent(gg.keyword)}" style="text-decoration:none">
             <img src="${apiBase()}/api/geo/snapshot/${esc(gg.snapshotId)}.png" width="100%" alt="Map rank grid for ${esc(gg.keyword)}: top-3 at ${gg.top3}/${gg.total} points" style="display:block;border-radius:12px;border:1px solid #E5E7EB"></a>
           <div style="text-align:center;font-size:11px;color:#6B7280;margin-top:4px">Real scan · "${esc(gg.keyword)}" · 5×5 grid, 2 km spacing · <span style="color:#16A34A;font-weight:700">green = top 3</span>, <span style="color:#B45309;font-weight:700">orange = 4-9</span>, <span style="color:#B91C1C;font-weight:700">red = 10+ / not found</span></div>`
        : geoGridTable(gg)}` : `<p style="font-size:13px;color:#6B7280">${esc(a.geoGrid?.note || "")}</p>`}
      ${summaryBox(s.maps)}

      ${h2("🔎 Google search rankings — 6 money keywords", accent)}
      <table cellpadding="0" cellspacing="0" style="width:100%;font-size:13.5px">${a.organic.map((k) => `
        <tr><td style="padding:6px 0;border-bottom:1px solid #F3F4F6">${esc(k.keyword)}</td>
        <td style="padding:6px 0;border-bottom:1px solid #F3F4F6;text-align:right">${chip(k.position, "not in top 30")}</td></tr>`).join("")}
      </table>
      ${summaryBox(s.organic)}

      ${g ? `${h2("🏪 Google Business Profile", accent)}
      <table cellpadding="0" cellspacing="0" style="width:100%;font-size:13.5px">
        <tr><td style="padding:5px 0">Rating</td><td style="text-align:right;font-weight:700">${g.rating ?? "—"}★ (${g.reviews ?? 0} reviews)</td></tr>
        <tr><td style="padding:5px 0">Photos visible</td><td style="text-align:right;font-weight:700">${g.photosVisible ?? 0}${g.photosCapped ? "+" : ""}</td></tr>
        <tr><td style="padding:5px 0">Description</td><td style="text-align:right;font-weight:700">${g.description ? g.description.length + " chars" : "missing"}</td></tr>
        <tr><td style="padding:5px 0">Hours set</td><td style="text-align:right;font-weight:700">${(g.hours || []).length ? "yes" : "no"}</td></tr>
      </table>${summaryBox(s.gbp)}` : `${h2("🏪 Google Business Profile", accent)}<p style="font-size:13px;color:#6B7280">${esc(a.gbp?.note || "Not available.")}</p>`}

      ${h2("🌐 Website health", accent)}
      ${a.website?.pages?.length ? `<p style="font-size:13px;color:#4B5563;margin:4px 0">${a.website.crawled} page(s) analyzed on <b>${esc(a.business.website)}</b>.</p>${summaryBox(s.website)}` : `<p style="font-size:13px;color:#6B7280">${esc(a.website?.note || "")}</p>${s.website.win ? summaryBox(s.website) : ""}`}

      ${a.competitors.length ? `${h2("🏆 Who's winning " + esc(a.business.city.split(",")[0]) + " right now", accent)}
      <table cellpadding="0" cellspacing="0" style="width:100%;font-size:13px">${a.competitors.map((c, i) => `
        <tr><td style="padding:5px 0;border-bottom:1px solid #F3F4F6;color:#9CA3AF;width:24px">${i + 1}.</td>
        <td style="padding:5px 0;border-bottom:1px solid #F3F4F6;font-weight:600">${esc(c.domain.replace("📍 ", ""))}${c.local ? ` <span style="font-size:10px;color:#6B7280">(Maps${c.rating ? ` · ${c.rating}★/${c.reviews}` : ""})</span>` : ""}</td>
        <td style="padding:5px 0;border-bottom:1px solid #F3F4F6;text-align:right;color:#6B7280">in ${c.appearances} of 8 searches · best #${c.bestRank}</td></tr>`).join("")}
      </table>
      <p style="font-size:12px;color:#6B7280;margin:6px 0 0">Every row is a business eating searches ${esc(a.business.name)} could own.</p>` : ""}

      ${vids.length ? `${h2("🎥 What working with us looks like", accent)}
      <table cellpadding="0" cellspacing="0" style="width:100%"><tr>${vids.map((id) => `
        <td style="padding:4px;width:${Math.floor(100 / vids.length)}%"><a href="https://www.youtube.com/watch?v=${id}" style="text-decoration:none">
          <img src="https://img.youtube.com/vi/${id}/hqdefault.jpg" width="100%" style="border-radius:10px;display:block" alt="Watch on YouTube">
          <div style="text-align:center;font-size:12px;color:${accent};font-weight:700;padding-top:4px">▶ Watch on YouTube</div></a></td>`).join("")}
      </tr></table>` : ""}

      <div style="margin-top:24px;padding:20px;border-radius:14px;background:${accent};text-align:center">
        <div style="font-size:17px;font-weight:800;color:#fff">Let's turn this map green together</div>
        <p style="font-size:13.5px;color:#fff;opacity:.92;margin:8px 0 14px;line-height:1.55">
          Schedule a one-on-one live video meeting with ${repName ? esc(repName) : "me"} and I'll show you, screen-to-screen, exactly how we'll fix your website &amp; business profiles, outrank the businesses above, and keep your calendar full of ${esc(a.category)} work — day after day.
        </p>
        ${bookingUrl ? `<a href="${esc(bookingUrl)}" style="display:inline-block;background:#fff;color:${accent};font-weight:800;font-size:14px;text-decoration:none;padding:12px 26px;border-radius:10px">📅 Book my free strategy call</a>` : `<div style="background:#fff;color:${accent};font-weight:800;font-size:14px;padding:12px 26px;border-radius:10px;display:inline-block">📅 Reply "CALL" to book your free strategy session</div>`}
      </div>

      <div style="margin-top:14px;padding:14px 16px;border-radius:12px;background:${accent}14;border:1px solid ${accent}40">
        <div style="font-size:14px;font-weight:800;color:#111827">Prefer to just reply?</div>
        <p style="font-size:13px;color:#374151;margin:5px 0 0">Hit reply and ${esc(company.name)} will walk you through the whole plan in plain language — no obligation, no pressure.</p>
      </div>
    </div>
    <div style="padding:12px 24px;background:#F9FAFB;border-top:1px solid #E5E7EB;font-size:11px;color:#9CA3AF">
      Prepared by ${esc(company.name)} · data from live Google results${a.demo ? " (DEMO)" : ""} · reply "no thanks" and we won't email again.
    </div>
  </div>
</div></div>`;
}

/* top-2 competitor display names — for the subject/intro merge tags.
   Domains lose their TLD; local (Maps) names pass through cleaned. */
export function topCompetitorNames(a, n = 2) {
  return (a.competitors || []).slice(0, n).map((c) => {
    const raw = String(c.domain || "").replace("📍 ", "");
    return c.local ? raw : raw.replace(/\.(com|net|org|co|io|us|biz|info)(\.[a-z]{2})?$/i, "").replace(/[-_]/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());
  });
}

/* plain-text twin (multipart fallback — deliverability) */
export function buildAuditEmailText(a, { company, pitch = "" }) {
  const s = auditSummaries(a);
  const gg = a.geoGrid && a.geoGrid.points ? a.geoGrid : null;
  const line = (k, cap) => `  ${k.keyword}: ${k.position ? "#" + k.position : cap}`;
  return [pitch, "",
    `--- LOCAL VISIBILITY AUDIT: ${a.business.name}, ${a.business.city} ---`, "",
    gg ? `GOOGLE MAPS COVERAGE ("${gg.keyword}"): top-3 at ${gg.top3}/${gg.total} grid points (${gg.solv}%).` : "",
    `  ${s.maps.loss}`, `  Win: ${s.maps.win}`, "",
    "GOOGLE SEARCH (money keywords):", ...a.organic.map((k) => line(k, "not in top 30")), `Losing: ${s.organic.loss}`, `Win: ${s.organic.win}`, "",
    `TOP COMPETITORS: ${a.competitors.slice(0, 5).map((c) => c.domain.replace("📍 ", "")).join(", ")}`, "",
    `Reply to this email (or click the link) to book a free strategy call — ${company.name} will show you the exact fix.`,
  ].filter((l) => l !== "").join("\n");
}
