/* =====================================================================
   WEBSITE DEPLOY ENGINE — turns the researched site map (architecture
   tree + generated content) into fully-optimized, deployable pages.

   Implements the agency SEO spec:
   1  meta title/description (kw front-loaded, ≤60/≤160, brand-suffixed)
   2  single H1, hierarchical H2/H3 per section
   3  JSON-LD schema graph per page type (LocalBusiness/Service/Breadcrumb/FAQ…)
   4  service description + sub-services with SMART links (city-specific
      sub-service page first, central page as fallback)
   5  reviews section (synced from the Google review source)
   6  brand-voice personalization hooks
   7  deep internal linking (local silo for multi-location, topical for national)
   8  media placement with generated alt/title
   9  cities-we-serve section w/ city-page links; city pages get
      neighborhoods + zip coverage
   10 NAP + map block ("Quality-first {service}, one click away")
   11 pricing table  12 signs-you-need  13 why-choose-{brand}
   14 semantic header/footer (nav = silo hubs; footer = NAP + link hubs)
   15 speed: self-contained pages, system fonts, inline critical CSS,
      lazy images, zero render-blocking externals
   Serializers: static HTML · Elementor (data JSON) · Gutenberg blocks.
   ===================================================================== */
import { hashStr, mulberry32 } from "./rng.js";

const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const cap = (s) => String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ---- tree utilities ---- */
export const flattenTree = (tree, parent = null, out = []) => {
  (tree || []).forEach((n) => { out.push({ node: n, parent }); flattenTree(n.children || [], n, out); });
  return out;
};
export const findByUrl = (tree, url) => flattenTree(tree).find((x) => x.node.url === url)?.node || null;

/* rule 4/7 — smart link resolution: city-specific page wins, central falls back */
export const resolveServiceLink = (tree, serviceName, city = "") => {
  const flat = flattenTree(tree).map((x) => x.node);
  const sSlug = slug(serviceName), cSlug = slug(city);
  if (cSlug) {
    const citySpecific = flat.find((n) => n.url.includes(sSlug) && n.url.includes(cSlug));
    if (citySpecific) return { url: citySpecific.url, title: citySpecific.title, citySpecific: true };
  }
  const central = flat.find((n) => n.type === "service" && n.url.includes(sSlug))
    || flat.find((n) => n.url.includes(sSlug));
  return central ? { url: central.url, title: central.title, citySpecific: false } : null;
};

/* rule 8 — media matching: keyword overlap on filename/alt */
export const pickMedia = (media, keywords, count = 2) => {
  const kws = keywords.map((k) => slug(k)).filter(Boolean);
  const scored = (media || []).map((m) => ({
    m, score: kws.reduce((n, k) => n + (slug(m.title || m.name).includes(k) || slug(m.alt || "").includes(k) ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map((x) => x.m);
};

/* rule 9 — deterministic neighborhoods/zips for a city page (demo data,
   replaced by the AI research payload when present on the node) */
const cityCoverage = (city) => {
  const r = mulberry32(hashStr("cov" + city));
  const HOODS = ["Downtown", "Midtown", "Riverside", "Old Town", "Northside", "Southside", "West End", "East Village", "Harbor District", "Uptown"];
  const hoods = HOODS.filter(() => r() > 0.35).slice(0, 6);
  const zips = Array.from({ length: 4 + Math.floor(r() * 3) }, () => String(10000 + Math.floor(r() * 89999)));
  return { hoods: hoods.length ? hoods : HOODS.slice(0, 5), zips };
};

/* ---- the page model (builder-agnostic) ---- */
export function composePage(node, ctx) {
  const { tree, brand, niche, gbp, reviews = [], media = [], brandVoice = {}, website } = ctx;
  const primary = node.seo?.primaryKw || node.title;
  const type = node.type;
  const city = type === "location" ? (node.title.split(" in ").pop() || "").trim() : "";
  const flat = flattenTree(tree);
  const chain = [];                                    // breadcrumb chain
  let cur = flat.find((x) => x.node.id === node.id);
  while (cur) { chain.unshift(cur.node); cur = cur.parent ? flat.find((x) => x.node.id === cur.parent.id) : null; }

  /* 1 — meta */
  let metaTitle = node.seo?.content?.metaTitle || `${cap(primary)}${city ? ` in ${city}` : ""} | ${brand}`;
  if (metaTitle.length > 60) metaTitle = metaTitle.slice(0, 57) + "…";
  let metaDesc = node.seo?.content?.metaDesc ||
    `${cap(primary)}${city ? ` in ${city}` : ""} by ${brand}. Transparent pricing, ${(brandVoice.toneWords || "expert, friendly").split(",")[0].trim()} service and same-week availability — see costs, reviews and book online.`;
  if (metaDesc.length > 160) metaDesc = metaDesc.slice(0, 157) + "…";

  const services = (ctx.services || []).filter(Boolean);
  const locations = flat.map((x) => x.node).filter((n) => n.type === "location");
  const img = pickMedia(media, [primary, niche, city].filter(Boolean), 2);
  const imgFor = (kw, idx = 0) => {
    const m = img[idx] || media[idx];
    return m ? { src: m.url || m.src, alt: `${cap(kw)}${city ? ` in ${city}` : ""} — ${brand}`, title: `${cap(kw)} | ${brand}` } : null;
  };

  const sections = [];
  const push = (t, data) => sections.push({ t, ...data });

  /* intro + rule 4 service description */
  push("intro", { h1: `${cap(primary)}${city ? ` in ${city}` : ""} — ${brand}`, image: imgFor(primary, 0),
    text: node.seo?.content?.intro || `Looking for ${primary}${city ? ` in ${city}` : ""}? ${brand} delivers ${primary} with transparent pricing, a written scope and results you can verify. ${brandVoice.tagline || ""}`.trim() });

  if (type === "service" || type === "location" || type === "home") {
    /* rule 4 — sub-services with smart links */
    const subs = services.filter((sv) => slug(sv) !== slug(primary)).slice(0, 6);
    if (subs.length) push("subServices", {
      h2: `${cap(primary)} services we offer${city ? ` in ${city}` : ""}`,
      items: subs.map((sv) => ({ name: cap(sv), link: resolveServiceLink(tree, sv, city),
        blurb: `${cap(sv)} handled by the same ${brand} team — one point of contact, one written quote.` })),
    });
    /* rule 12 */
    push("signs", { h2: `Signs you need ${primary}${city ? ` in ${city}` : ""}`, items: [
      `Recurring problems that quick fixes never fully solve`,
      `Costs creeping up month over month`,
      `You've been quoted wildly different prices with no written scope`,
      `Deadlines or compliance dates approaching`,
    ]});
    /* rule 11 */
    push("pricing", { h2: `${cap(primary)} pricing${city ? ` in ${city}` : ""}`, rows: (() => {
      const r = mulberry32(hashStr("price" + primary + city));
      const base = 90 + Math.floor(r() * 160);
      return [
        ["Assessment & written quote", "Free"],
        [`Standard ${primary}`, `from $${base}`],
        [`Complex / same-day ${primary}`, `from $${base * 2}`],
        ["Ongoing care plan", `$${Math.round(base * 0.6)}/mo`],
      ];
    })(), note: "Final pricing confirmed in writing before any work starts." });
    /* rule 13 */
    push("whyChoose", { h2: `Why choose ${brand} over others`, items: [
      { h3: "Transparent, written pricing", text: "Every job starts with a written scope — the quote is the price." },
      { h3: "Verified local reviews", text: `Real ${gbp?.address ? gbp.address.split(",").slice(-2)[0].trim() : "local"} customers, public reviews, nothing curated.` },
      { h3: "Specialists, not generalists", text: `${cap(niche)} is all we do — depth beats breadth when it's your money.` },
      { h3: "Guaranteed response times", text: "Booked slots are honored — running late means you're told, not ghosted." },
    ]});
  }

  /* rule 9 — cities served / city coverage */
  if (type === "location") {
    const covPayload = node.seo?.coverage || cityCoverage(city);
    push("cityCoverage", { h2: `${brand} covers all of ${city}`, hoods: covPayload.hoods, zips: covPayload.zips,
      text: `From ${covPayload.hoods[0]} to ${covPayload.hoods[covPayload.hoods.length - 1]}, our ${city} team covers every neighborhood — same pricing, same response times, everywhere in ${city}.` });
  } else if ((type === "service" || type === "home") && locations.length) {
    push("citiesServed", { h2: `Cities we serve`, items: locations.map((n) => ({ name: n.title.split(" in ").pop(), url: n.url })) });
  }

  /* rule 5 — reviews */
  if (reviews.length) push("reviews", { h2: `What ${city || "our"} customers say about ${brand}`,
    items: reviews.slice(0, 3), source: ctx.reviewSource || null });

  /* rule 10 — NAP + map block */
  if (gbp?.bizName) push("napMap", {
    h2: `Quality-first ${primary} just one click away`,
    nap: { name: gbp.bizName, address: gbp.address, phone: gbp.phone, website: website ? "https://" + website : gbp.website, email: ctx.email || "", hours: gbp.hours || {} },
    mapQuery: encodeURIComponent(`${gbp.bizName} ${gbp.address || city}`),
  });

  /* FAQ from the researched structure */
  const faqs = node.seo?.structure?.faqs || [];
  if (faqs.length) push("faq", { h2: "Frequently asked questions",
    items: faqs.slice(0, 6).map((q) => ({ q, a: `Straight answer: it depends on scope — ${brand} confirms specifics in a written quote before any commitment. Call ${gbp?.phone || "us"} for a same-day answer.` })) });

  push("cta", { h2: `Book ${primary}${city ? ` in ${city}` : ""} today`,
    text: `Written quote, transparent pricing, ${(brandVoice.toneWords || "friendly").split(",")[0].trim()} service. ${gbp?.phone ? `Call ${gbp.phone} or book` : "Book"} online in under a minute.` });

  /* 3 — schema graph */
  const base = website ? "https://" + website : "";
  const schema = { "@context": "https://schema.org", "@graph": [] };
  schema["@graph"].push({ "@type": "BreadcrumbList", itemListElement: chain.map((n, i) => ({ "@type": "ListItem", position: i + 1, name: n.title, item: base + n.url })) });
  if (type === "home") schema["@graph"].push(
    { "@type": "Organization", name: brand, url: base, telephone: gbp?.phone, address: gbp?.address },
    { "@type": "WebSite", name: brand, url: base });
  if (type === "service") schema["@graph"].push({ "@type": "Service", name: cap(primary), provider: { "@type": "LocalBusiness", name: gbp?.bizName || brand, telephone: gbp?.phone, address: gbp?.address }, areaServed: locations.map((n) => n.title.split(" in ").pop()) });
  if (type === "location") schema["@graph"].push({ "@type": "LocalBusiness", name: gbp?.bizName || brand, telephone: gbp?.phone, address: { "@type": "PostalAddress", addressLocality: city }, areaServed: city });
  if (type === "article") schema["@graph"].push({ "@type": "Article", headline: metaTitle, author: { "@type": "Organization", name: brand } });
  if (type === "about") schema["@graph"].push(
    { "@type": "AboutPage", name: metaTitle, url: base + node.url },
    { "@type": "Organization", name: brand, url: base, telephone: gbp?.phone,
      address: gbp?.address ? { "@type": "PostalAddress", streetAddress: gbp.address } : undefined,
      /* entity consolidation: business listings + social profiles */
      sameAs: (ctx.sameAs || []).filter(Boolean) });
  if (faqs.length) schema["@graph"].push({ "@type": "FAQPage", mainEntity: faqs.slice(0, 6).map((q) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: `${brand} confirms specifics in a written quote — call ${gbp?.phone || "us"} for a same-day answer.` } })) });

  return { node, type, city, metaTitle, metaDesc, h1: sections[0].h1, sections, schema, chain,
    slugPath: node.url.replace(/^\//, ""), parentUrl: chain.length > 1 ? chain[chain.length - 2].url : null };
}

/* rule 14 — shared header/footer models */
export function composeChrome(tree, ctx) {
  const flat = flattenTree(tree).map((x) => x.node);
  return {
    nav: (tree || []).filter((n) => n.url !== "/").slice(0, 6).map((n) => ({ title: n.title.replace(` — ${ctx.brand}`, ""), url: n.url })),
    footer: {
      nap: ctx.gbp?.bizName ? { name: ctx.gbp.bizName, address: ctx.gbp.address, phone: ctx.gbp.phone } : null,
      services: flat.filter((n) => n.type === "service").slice(0, 8).map((n) => ({ title: n.title, url: n.url })),
      cities: flat.filter((n) => n.type === "location").slice(0, 10).map((n) => ({ title: n.title.split(" in ").pop(), url: n.url })),
    },
  };
}

/* ================= SERIALIZERS ================= */
const sectionHtml = (s, base) => {
  const wrap = (inner) => `<section class="sec sec-${s.t}">${inner}</section>`;
  const a = (l, txt) => l ? `<a href="${base}${l.url}"${l.citySpecific ? ' data-city-specific="1"' : ""}>${esc(txt || l.title)}</a>` : esc(txt || "");
  switch (s.t) {
    case "intro": return `<section class="sec hero"><h1>${esc(s.h1)}</h1>${s.image ? `<img src="${esc(s.image.src)}" alt="${esc(s.image.alt)}" title="${esc(s.image.title)}" loading="eager" width="720" height="420">` : ""}<p>${esc(s.text)}</p></section>`;
    case "subServices": return wrap(`<h2>${esc(s.h2)}</h2><div class="grid3">${s.items.map((it) => `<div class="card"><h3>${it.link ? a(it.link, it.name) : esc(it.name)}</h3><p>${esc(it.blurb)}</p></div>`).join("")}</div>`);
    case "signs": return wrap(`<h2>${esc(s.h2)}</h2><ul>${s.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`);
    case "pricing": return wrap(`<h2>${esc(s.h2)}</h2><table class="price"><tbody>${s.rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</tbody></table><p class="note">${esc(s.note)}</p>`);
    case "whyChoose": return wrap(`<h2>${esc(s.h2)}</h2><div class="grid2">${s.items.map((it) => `<div class="card"><h3>${esc(it.h3)}</h3><p>${esc(it.text)}</p></div>`).join("")}</div>`);
    case "cityCoverage": return wrap(`<h2>${esc(s.h2)}</h2><p>${esc(s.text)}</p><h3>Neighborhoods we serve</h3><p class="chips">${s.hoods.map(esc).join(" · ")}</p><h3>Zip codes covered</h3><p class="chips zips">${s.zips.map(esc).join(", ")}</p>`);
    case "citiesServed": return wrap(`<h2>${esc(s.h2)}</h2><p class="chips">${s.items.map((c) => `<a href="${base}${c.url}">${esc(c.name)}</a>`).join(" · ")}</p>`);
    case "reviews": return wrap(`<h2>${esc(s.h2)}</h2><div class="grid3">${s.items.map((r) => `<blockquote class="card"><p>“${esc(r.text)}”</p><footer>★★★★★ — ${esc(r.author)}</footer></blockquote>`).join("")}${s.source ? `<p class="note"><a href="${esc(s.source)}" rel="nofollow noopener" target="_blank">Read all Google reviews →</a></p>` : ""}`);
    case "napMap": return wrap(`<h2>${esc(s.h2)}</h2><div class="napgrid"><div class="napinfo"><p><strong>${esc(s.nap.name)}</strong></p><p>${esc(s.nap.address || "")}</p><p>☎ <a href="tel:${esc((s.nap.phone || "").replace(/[^+\d]/g, ""))}">${esc(s.nap.phone || "")}</a></p>${s.nap.email ? `<p>✉ <a href="mailto:${esc(s.nap.email)}">${esc(s.nap.email)}</a></p>` : ""}<p><a href="${esc(s.nap.website || "#")}">${esc((s.nap.website || "").replace(/https?:\/\//, ""))}</a></p>${Object.keys(s.nap.hours || {}).length ? `<h3>Business hours</h3><ul class="hours">${Object.entries(s.nap.hours).map(([d, h]) => `<li><span>${esc(d)}</span> ${esc(h)}</li>`).join("")}</ul>` : ""}</div><div class="napmap"><iframe src="https://www.google.com/maps?q=${s.mapQuery}&output=embed" title="Map — ${esc(s.nap.name)}" loading="lazy" width="100%" height="300" style="border:0" referrerpolicy="no-referrer-when-downgrade"></iframe></div></div>`);
    case "faq": return wrap(`<h2>${esc(s.h2)}</h2>${s.items.map((f) => `<details><summary><h3>${esc(f.q)}</h3></summary><p>${esc(f.a)}</p></details>`).join("")}`);
    case "cta": return wrap(`<h2>${esc(s.h2)}</h2><p>${esc(s.text)}</p><p><a class="btn" href="/contact">Get my written quote</a></p>`);
    default: return "";
  }
};

/* rule 15 — self-contained fast page: system fonts, tiny inline CSS, lazy media */
const CRITICAL_CSS = `:root{--ink:#16202b;--mut:#5b6774;--line:#e6e9ee;--acc:ACCENT}*{box-sizing:border-box;margin:0}body{font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--ink)}img{max-width:100%;height:auto;border-radius:12px}header.site,footer.site{padding:14px 5vw;border-bottom:1px solid var(--line)}footer.site{border-top:1px solid var(--line);border-bottom:0;color:var(--mut);font-size:14px}nav{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center}nav a{text-decoration:none;color:var(--ink);font-weight:600}main{max-width:960px;margin:0 auto;padding:24px 5vw}h1{font-size:clamp(26px,4vw,38px);line-height:1.2;margin:12px 0}h2{font-size:clamp(20px,3vw,26px);margin:34px 0 10px}h3{font-size:clamp(15px,2.2vw,17px);margin:12px 0 6px}p{margin:8px 0;color:var(--mut)}a{color:var(--acc)}.grid3{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))}.grid2{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))}.card{border:1px solid var(--line);border-radius:14px;padding:16px}table.price{width:100%;border-collapse:collapse}table.price td{padding:10px 12px;border-bottom:1px solid var(--line)}table.price td:last-child{text-align:right;font-weight:700;color:var(--ink)}.napgrid{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))}.napmap iframe{width:100%;min-height:260px}.hours li{display:flex;justify-content:space-between;max-width:280px;list-style:none}.btn{display:inline-block;background:var(--acc);color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:700}.chips a{margin-right:6px}details{border-bottom:1px solid var(--line);padding:10px 0}summary h3{display:inline}blockquote footer{margin-top:8px;font-size:13px}@media(max-width:640px){main{padding:16px 4vw}h2{margin:24px 0 8px}.sec .btn{display:block;text-align:center}}`;

/* CMS-NEUTRALIZING RESET: everything deployed into WordPress is wrapped in
   .ss-site — this scoped reset overrides the THEME's layout width, fonts and
   sizes so pages look exactly like the system designed them, on any theme. */
const WP_RESET_CSS = `.ss-site{all:revert;font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif!important;color:#16202b;max-width:none!important;width:100%!important}
.ss-site *{box-sizing:border-box;max-width:none}
.ss-site h1,.ss-site h2,.ss-site h3,.ss-site p,.ss-site li{font-family:inherit!important;letter-spacing:normal!important;text-transform:none!important}
.ss-site h1{font-size:clamp(26px,4vw,38px)!important;line-height:1.2!important;margin:12px 0!important}
.ss-site h2{font-size:clamp(20px,3vw,26px)!important;margin:34px 0 10px!important}
.ss-site h3{font-size:clamp(15px,2.2vw,17px)!important;margin:12px 0 6px!important}
.ss-site p{font-size:16px!important;margin:8px 0!important;color:#5b6774}
.ss-site img{max-width:100%!important;height:auto!important;border-radius:12px}
.ss-site .sec{max-width:960px;margin:0 auto;padding:0 4vw}
.ss-site .grid3{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))}
.ss-site .grid2{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))}
.ss-site .card{border:1px solid #e6e9ee;border-radius:14px;padding:16px}
.ss-site table.price{width:100%;border-collapse:collapse}.ss-site table.price td{padding:10px 12px;border-bottom:1px solid #e6e9ee}.ss-site table.price td:last-child{text-align:right;font-weight:700}
.ss-site .napgrid{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))}.ss-site .napmap iframe{width:100%;min-height:260px;border:0}
.ss-site .btn{display:inline-block;background:ACCENT;color:#fff!important;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:700}
.ss-site .chips a{margin-right:6px}.ss-site details{border-bottom:1px solid #e6e9ee;padding:10px 0}.ss-site summary h3{display:inline}
@media(max-width:640px){.ss-site .sec{padding:0 5vw}.ss-site .btn{display:block;text-align:center}}`;

/* WordPress body variant: no doctype/head — a scoped reset + sections, safe
   inside any theme (and full-bleed on the Elementor Canvas blank template) */
export function serializeWpBody(page, chrome, ctx, { withChrome = false } = {}) {
  const base = "";
  const style = `<style>${WP_RESET_CSS.replaceAll("ACCENT", ctx.accent || "#0E7C66")}</style>`;
  const body = page.sections.map((s2) => sectionHtml(s2, base)).join("\n");
  const chromeHtml = withChrome ? `<header class="site" style="padding:14px 4vw;border-bottom:1px solid #e6e9ee"><nav style="display:flex;flex-wrap:wrap;gap:6px 14px"><a href="/" style="font-weight:800;text-decoration:none;color:#16202b">${esc(ctx.brand)}</a>${chrome.nav.map((n) => `<a href="${n.url}" style="text-decoration:none;color:#16202b;font-weight:600">${esc(n.title)}</a>`).join("")}</nav></header>` : "";
  const footHtml = withChrome && chrome.footer.nap ? `<footer class="site" style="padding:14px 4vw;border-top:1px solid #e6e9ee;color:#5b6774;font-size:14px"><p><strong>${esc(chrome.footer.nap.name)}</strong> · ${esc(chrome.footer.nap.address || "")} · ${esc(chrome.footer.nap.phone || "")}</p></footer>` : "";
  return `${style}<div class="ss-site">${chromeHtml}${body}${footHtml}</div>\n<script type="application/ld+json">${JSON.stringify(page.schema)}</script>`;
}

export function serializeHtml(page, chrome, ctx) {
  const base = ""; // relative links — portable across staging/production hosts
  const body = page.sections.map((s) => sectionHtml(s, base)).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(page.metaTitle)}</title>
<meta name="description" content="${esc(page.metaDesc)}">
<link rel="canonical" href="https://${ctx.website}${page.node.url}">
<meta property="og:title" content="${esc(page.metaTitle)}"><meta property="og:description" content="${esc(page.metaDesc)}"><meta property="og:type" content="website">
<style>${CRITICAL_CSS.replace("ACCENT", ctx.accent || "#0E7C66")}</style>
<script type="application/ld+json">${JSON.stringify(page.schema)}</script>
</head>
<body>
<header class="site"><nav><a href="/"><strong>${esc(ctx.brand)}</strong></a> ${chrome.nav.map((n) => `<a href="${n.url}">${esc(n.title)}</a>`).join(" ")}</nav></header>
<main>
${body}
</main>
<footer class="site">
${chrome.footer.nap ? `<p><strong>${esc(chrome.footer.nap.name)}</strong> · ${esc(chrome.footer.nap.address || "")} · ${esc(chrome.footer.nap.phone || "")}</p>` : ""}
${chrome.footer.services.length ? `<p>Services: ${chrome.footer.services.map((x) => `<a href="${x.url}">${esc(x.title)}</a>`).join(" · ")}</p>` : ""}
${chrome.footer.cities.length ? `<p>Areas: ${chrome.footer.cities.map((x) => `<a href="${x.url}">${esc(x.title)}</a>`).join(" · ")}</p>` : ""}
<p>© ${esc(ctx.brand)} — all rights reserved.</p>
</footer>
</body>
</html>`;
}

/* Gutenberg: native block-comment markup — editable in the WP block editor */
export function serializeGutenberg(page, chrome, ctx) {
  const b = [];
  /* neutralize the theme's layout/typography defaults for everything below */
  b.push(`<!-- wp:html --><style>${WP_RESET_CSS.replaceAll("ACCENT", ctx.accent || "#0E7C66")}</style><div class="ss-site"><!-- /wp:html -->`);
  const h = (level, text) => b.push(`<!-- wp:heading {"level":${level}} --><h${level}>${esc(text)}</h${level}><!-- /wp:heading -->`);
  const p = (text) => b.push(`<!-- wp:paragraph --><p>${esc(text)}</p><!-- /wp:paragraph -->`);
  const rawHtml = (html) => b.push(`<!-- wp:html -->${html}<!-- /wp:html -->`);
  page.sections.forEach((s) => {
    if (s.t === "intro") { h(1, s.h1); if (s.image) b.push(`<!-- wp:image --><figure class="wp-block-image"><img src="${esc(s.image.src)}" alt="${esc(s.image.alt)}" title="${esc(s.image.title)}" loading="lazy"/></figure><!-- /wp:image -->`); p(s.text); }
    else if (s.t === "signs") { h(2, s.h2); b.push(`<!-- wp:list --><ul>${s.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><!-- /wp:list -->`); }
    else if (s.t === "faq") { h(2, s.h2); s.items.forEach((f) => { h(3, f.q); p(f.a); }); }
    else { const html = sectionHtml(s, ""); h(2, s.h2 || ""); rawHtml(html.replace(/<h2>.*?<\/h2>/, "")); }
  });
  rawHtml(`<script type="application/ld+json">${JSON.stringify(page.schema)}</script>`);
  b.push(`<!-- wp:html --></div><!-- /wp:html -->`);
  return b.join("\n");
}

/* Elementor: _elementor_data JSON (sections→columns→widgets) + HTML fallback */
export function serializeElementor(page, chrome, ctx) {
  const wid = (n) => "w" + hashStr(page.node.url + n).toString(36);
  const widget = (type, settings, i) => ({ id: wid(type + i), elType: "widget", widgetType: type, settings });
  const section = (widgets, i) => ({ id: wid("sec" + i), elType: "section", elements: [{ id: wid("col" + i), elType: "column", settings: { _column_size: 100 }, elements: widgets }] });
  const data = page.sections.map((s, i) => {
    if (s.t === "intro") return section([
      widget("heading", { title: s.h1, header_size: "h1" }, i),
      ...(s.image ? [widget("image", { image: { url: s.image.src }, caption: "", alt: s.image.alt }, i + 100)] : []),
      widget("text-editor", { editor: `<p>${esc(s.text)}</p>` }, i + 200),
    ], i);
    if (s.t === "napMap") return section([
      widget("heading", { title: s.h2, header_size: "h2" }, i),
      widget("html", { html: sectionHtml(s, "").replace(/<h2>.*?<\/h2>/, "") }, i + 200),
    ], i);
    return section([
      widget("heading", { title: s.h2 || "", header_size: "h2" }, i),
      widget("html", { html: sectionHtml(s, "").replace(/<h2>.*?<\/h2>/, "") }, i + 200),
    ], i);
  });
  return {
    elementorData: JSON.stringify(data),
    fallbackHtml: serializeWpBody(page, chrome, ctx, { withChrome: true }),
  };
}

/* ---- deploy plan: parent-first ordering so WP parent ids exist in time ---- */
export function buildDeployPlan(tree, ctx) {
  const chrome = composeChrome(tree, ctx);
  const ordered = [];
  const walk = (nodes) => nodes.forEach((n) => { ordered.push(n); walk(n.children || []); });
  walk(tree || []);
  return ordered.map((node) => ({ node, page: composePage(node, ctx), chrome }));
}

/* blog scheduling: spread N posts from a start date at a cadence */
export const scheduleDates = (count, startISO, everyDays) => {
  const start = new Date(startISO + "T09:00:00").getTime();
  return Array.from({ length: count }, (_, i) => new Date(start + i * everyDays * 864e5));
};

/* deterministic demo reviews (labeled) — replaced by the live Google sync */
export const demoReviews = (brand, city) => {
  const r = mulberry32(hashStr("rev" + brand + city));
  const NAMES = ["Maria G.", "James T.", "Priya S.", "Daniel K.", "Aisha B.", "Tom W."];
  const TEXTS = [
    `Booked online, got a written quote the same day, and the work matched it to the dollar. Rare these days.`,
    `Second time using ${brand} — same crew, same quality. The follow-up call afterwards was a nice touch.`,
    `They explained every option without upselling. Finished ahead of schedule${city ? ` and they know ${city} traffic, showed up exactly on time` : ""}.`,
  ];
  return TEXTS.map((text, i) => ({ author: NAMES[Math.floor(r() * NAMES.length)] || NAMES[i], text, rating: 5, demo: true }));
};


/* =====================================================================
   Static-site export for CUSTOM-CODED websites: every page as
   /path/index.html inside a real ZIP (store method, CRC-32) — upload the
   extracted folder to any host; no builder or CMS required.
   ===================================================================== */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (bytes) => {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};
export function buildZip(files) {           // files: [{ path, content }]
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let offset = 0;
  const u16 = (v) => new Uint8Array([v & 255, (v >> 8) & 255]);
  const u32 = (v) => new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255]);
  files.forEach((f) => {
    const name = enc.encode(f.path), data = enc.encode(f.content), crc = crc32(data);
    const head = [u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0)];
    central.push({ name, data, crc, offset });
    head.forEach((b) => chunks.push(b)); chunks.push(name, data);
    offset += 30 + name.length + data.length;
  });
  const cdStart = offset;
  central.forEach((e) => {
    [u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(e.crc), u32(e.data.length), u32(e.data.length),
      u16(e.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(e.offset)].forEach((b) => chunks.push(b));
    chunks.push(e.name);
    offset += 46 + e.name.length;
  });
  [u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(offset - cdStart), u32(cdStart), u16(0)].forEach((b) => chunks.push(b));
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0; chunks.forEach((c) => { out.set(c, pos); pos += c.length; });
  return new Blob([out], { type: "application/zip" });
}
export function exportSiteZip(plan, ctx, { pagesOnly = false } = {}) {
  const files = plan.map(({ node, page, chrome }) => ({
    path: (node.url === "/" ? "index.html" : node.url.replace(/^\//, "") + "/index.html"),
    content: serializeHtml(page, chrome, ctx),
  }));
  /* pagesOnly: partial export onto an existing site — must not ship a
     robots/sitemap that would clobber the site's real ones */
  if (!pagesOnly) {
    files.push({ path: "robots.txt", content: `User-agent: *\nAllow: /\nSitemap: https://${ctx.website}/sitemap.xml\n` });
    files.push({ path: "sitemap.xml", content: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${plan.map(({ node }) => `  <url><loc>https://${ctx.website}${node.url}</loc></url>`).join("\n")}\n</urlset>\n` });
  }
  return buildZip(files);
}

/* Webflow: map page models onto CMS collection items (the standard
   programmatic pattern on Webflow — Collections drive templated pages) */
export function webflowItems(plan, ctx) {
  const collectionOf = (t) => (t === "article" ? "Blog Posts" : t === "location" ? "Locations" : t === "service" ? "Services" : "Pages");
  return plan.map(({ node, page, chrome }) => ({
    collection: collectionOf(node.type),
    name: page.h1, slug: node.url.split("/").filter(Boolean).pop() || "home",
    fields: {
      "meta-title": page.metaTitle, "meta-description": page.metaDesc,
      body: page.sections.map((s2) => sectionHtml(s2, "")).join("\n") + `\n<script type="application/ld+json">${JSON.stringify(page.schema)}</script>`,
    },
    ...(node.type === "article" ? { draft: true } : {}),
  }));
}
