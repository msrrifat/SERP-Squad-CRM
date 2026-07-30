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
import { mdInline } from "./text.jsx";

const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const cap = (s) => String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/* darken/lighten a hex color — theme shades derive from the project accent */
const shade = (hex, pct) => {
  const h = String(hex || "#0E7C66").replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
  const f = (i) => Math.max(0, Math.min(255, Math.round(parseInt(n.slice(i, i + 2), 16) * (1 + pct / 100))));
  return "#" + [0, 2, 4].map((i) => f(i).toString(16).padStart(2, "0")).join("");
};
const hexRgba = (hex, a) => {
  const h = String(hex || "").replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
  const v = (i) => parseInt(n.slice(i, i + 2), 16) || 0;
  return `rgba(${v(0)},${v(2)},${v(4)},${a})`;
};

/* ---- researched-content parser: the writer's markdown → design sections ---
   The generated page body (seo.content.markdown) is the page — every H2
   becomes a styled section; lists become checklists, numbered lists become
   process steps, bold-question paragraphs become the FAQ accordion, images
   with real URLs render with captions and "suggested:" images become
   labeled slots the user can fill later. */
export function parseContentMd(md) {
  const chunks = String(md || "").replace(/\r/g, "").split(/\n(?=## )/);
  let intro = "";
  const sections = [];
  chunks.forEach((chunk) => {
    const m = chunk.match(/^##\s+(.*)/);
    const bodyTxt = m ? chunk.replace(/^##\s+.*\n?/, "") : chunk;
    const blocks = [];
    bodyTxt.split(/\n{2,}/).forEach((blk) => {
      const b = blk.trim();
      if (!b || /^#\s/.test(b) || /^_Voice:/.test(b)) return;
      if (/^###\s/.test(b)) {
        b.split("\n").forEach((l) => {
          const h3 = l.match(/^###\s+(.*)/);
          if (h3) blocks.push({ k: "h3", text: h3[1].trim() });
          else if (l.trim()) blocks.push({ k: "p", text: l.trim() });
        });
        return;
      }
      const im = b.match(/^!\[([^\]]*)\]\(([^)]*)\)\s*$/);
      if (im) { blocks.push({ k: "img", alt: im[1], src: im[2] }); return; }
      const lns = b.split("\n").filter((l) => l.trim());
      if (lns.every((l) => /^\s*[-*]\s+/.test(l))) { blocks.push({ k: "ul", items: lns.map((l) => l.replace(/^\s*[-*]\s+/, "")) }); return; }
      if (lns.every((l) => /^\s*\d+[.)]\s+/.test(l))) { blocks.push({ k: "ol", items: lns.map((l) => l.replace(/^\s*\d+[.)]\s+/, "")) }); return; }
      if (/^>/.test(b)) { blocks.push({ k: "quote", text: b.replace(/^>\s?/gm, "") }); return; }
      blocks.push({ k: "p", text: b.replace(/\n/g, " ") });
    });
    if (!m) { intro = (blocks.find((x) => x.k === "p") || {}).text || ""; return; }
    if (blocks.length) sections.push({ h2: m[1].trim(), blocks });
  });
  return { intro, sections };
}
const contentKind = (sec) => {
  const h = sec.h2.toLowerCase();
  if (/faq|frequently|questions/.test(h)) return "faq";
  if (sec.blocks.some((b) => b.k === "ol")) return "steps";
  if (/cost|price|pricing/.test(h)) return "cost";
  if (sec.blocks.some((b) => b.k === "ul")) return "list";
  return "prose";
};
/* bold-question paragraphs → FAQ q/a pairs */
const mdFaqPairs = (blocks) => {
  const out = []; let cur = null;
  blocks.forEach((b) => {
    if (b.k === "p" && /^\*\*.+?\*\*/.test(b.text)) {
      if (cur) out.push(cur);
      const q = b.text.match(/^\*\*([^*]+)\*\*\s*(.*)$/s);
      cur = { q: q ? q[1].trim() : b.text, a: q ? q[2].trim() : "" };
    } else if (cur && b.k === "p") cur.a += (cur.a ? " " : "") + b.text;
  });
  if (cur) out.push(cur);
  return out;
};

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

  /* THE RESEARCHED CONTENT IS THE PAGE — when the writer has produced the
     page body, every one of its sections deploys as a styled design block.
     Template blocks then only fill what the content doesn't cover
     (reviews, NAP/map, city links, CTA). */
  const rc = node.seo?.content?.markdown ? parseContentMd(node.seo.content.markdown) : null;
  const hasResearched = !!(rc && rc.sections.length);

  /* intro + rule 4 service description */
  push("intro", { h1: `${cap(primary)}${city ? ` in ${city}` : ""} — ${brand}`, image: imgFor(primary, 0), phone: gbp?.phone || "",
    text: (rc && rc.intro) || node.seo?.content?.intro || `Looking for ${primary}${city ? ` in ${city}` : ""}? ${brand} delivers ${primary} with transparent pricing, a written scope and results you can verify. ${brandVoice.tagline || ""}`.trim() });

  let hasRcFaq = false;
  if (hasResearched) {
    rc.sections.forEach((sec, i) => {
      const kind = contentKind(sec);
      if (kind === "faq") {
        const pairs = mdFaqPairs(sec.blocks);
        if (pairs.length) { hasRcFaq = true; push("faq", { h2: sec.h2, items: pairs.slice(0, 8) }); return; }
      }
      push("content", { h2: sec.h2, kind, blocks: sec.blocks,
        /* every third section gets a labeled image slot beside the text so
           photos can be dropped in later without breaking the layout */
        imageSlot: !sec.blocks.some((b) => b.k === "img") && i % 3 === 1
          ? { alt: `${cap(primary)}${city ? ` in ${city}` : ""} — ${sec.h2}`, side: i % 2 ? "left" : "right" } : null });
    });
  }

  if (!hasResearched && (type === "service" || type === "location" || type === "home")) {
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

  /* FAQ from the researched structure — only when the written content
     didn't already ship its own FAQ section */
  const faqs = node.seo?.structure?.faqs || [];
  if (faqs.length && !hasRcFaq) push("faq", { h2: "Frequently asked questions",
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

  /* alternating band backgrounds — white/tinted sections make the page read
     as designed, not as one long text column (hero + CTA carry brand bands) */
  let band = 0;
  sections.forEach((s) => { if (s.t !== "intro" && s.t !== "cta") s.bg = band++ % 2 ? "tint" : "plain"; });

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
/* every section is a self-scoped .ss-sec band — no wrapper div needed, so the
   exact same markup works in raw HTML, Gutenberg html blocks and Elementor
   widgets, and the design survives any theme */
const imgSlotHtml = (alt, cls = "") =>
  `<div class="imgslot ${cls}"><span class="ph">🖼</span><span>Image slot — ${esc(alt || "add a photo here")}</span></div>`;
const contentBlockHtml = (b) => {
  if (b.k === "h3") return `<h3>${mdInline(b.text)}</h3>`;
  if (b.k === "ul") return `<ul class="checks">${b.items.map((it) => `<li>${mdInline(it)}</li>`).join("")}</ul>`;
  if (b.k === "ol") return `<ol class="steps">${b.items.map((it) => `<li>${mdInline(it)}</li>`).join("")}</ol>`;
  if (b.k === "quote") return `<blockquote>${mdInline(b.text)}</blockquote>`;
  if (b.k === "img") return /^https?:\/\//.test(b.src || "")
    ? `<figure><img src="${esc(b.src)}" alt="${esc(b.alt)}" loading="lazy"><figcaption>${esc(b.alt)}</figcaption></figure>`
    : imgSlotHtml(b.alt);
  return `<p>${mdInline(b.text)}</p>`;
};
const sectionHtml = (s, base) => {
  const cls = `ss-sec sec-${s.t}${s.bg ? " bg-" + s.bg : ""}`;
  const wrap = (inner, extra = "") => `<section class="${cls}${extra}"><div class="wrap">${inner}</div></section>`;
  const a = (l, txt) => l ? `<a href="${base}${l.url}"${l.citySpecific ? ' data-city-specific="1"' : ""}>${esc(txt || l.title)}</a>` : esc(txt || "");
  switch (s.t) {
    case "intro": return `<section class="ss-sec sec-hero"><div class="wrap hgrid"><div class="htext"><h1>${esc(s.h1)}</h1><p>${mdInline(s.text)}</p><p class="hbtns"><a class="btn light" href="${base}/contact">Get a free written quote</a>${s.phone ? `<a class="btn ghost" href="tel:${esc(String(s.phone).replace(/[^+\d]/g, ""))}">☎ ${esc(s.phone)}</a>` : ""}</p></div><div class="hmedia">${s.image ? `<img src="${esc(s.image.src)}" alt="${esc(s.image.alt)}" title="${esc(s.image.title)}" loading="eager">` : imgSlotHtml(s.h1, "hero")}</div></div></section>`;
    case "content": {
      const body = s.blocks.map(contentBlockHtml).join("");
      return s.imageSlot
        ? wrap(`<h2>${mdInline(s.h2)}</h2><div class="split${s.imageSlot.side === "left" ? " rev" : ""}"><div class="ctext">${body}</div>${imgSlotHtml(s.imageSlot.alt, "side")}</div>`)
        : wrap(`<h2>${mdInline(s.h2)}</h2>${body}`);
    }
    case "subServices": return wrap(`<h2>${esc(s.h2)}</h2><div class="grid3">${s.items.map((it) => `<div class="card"><h3>${it.link ? a(it.link, it.name) : esc(it.name)}</h3><p>${esc(it.blurb)}</p></div>`).join("")}</div>`);
    case "signs": return wrap(`<h2>${esc(s.h2)}</h2><ul class="checks">${s.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`);
    case "pricing": return wrap(`<h2>${esc(s.h2)}</h2><table class="price"><tbody>${s.rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</tbody></table><p class="note">${esc(s.note)}</p>`);
    case "whyChoose": return wrap(`<h2>${esc(s.h2)}</h2><div class="grid2">${s.items.map((it) => `<div class="card"><h3>${esc(it.h3)}</h3><p>${esc(it.text)}</p></div>`).join("")}</div>`);
    case "cityCoverage": return wrap(`<h2>${esc(s.h2)}</h2><p>${esc(s.text)}</p><h3>Neighborhoods we serve</h3><p class="chips">${s.hoods.map((h) => `<span>${esc(h)}</span>`).join("")}</p><h3>Zip codes covered</h3><p class="chips zips">${s.zips.map((z) => `<span>${esc(z)}</span>`).join("")}</p>`);
    case "citiesServed": return wrap(`<h2>${esc(s.h2)}</h2><p class="chips">${s.items.map((c) => `<a href="${base}${c.url}">${esc(c.name)}</a>`).join("")}</p>`);
    case "reviews": return wrap(`<h2>${esc(s.h2)}</h2><div class="grid3">${s.items.map((r) => `<blockquote class="card rev"><span class="stars">★★★★★</span><p>“${esc(r.text)}”</p><footer>${esc(r.author)}</footer></blockquote>`).join("")}</div>${s.source ? `<p class="note"><a href="${esc(s.source)}" rel="nofollow noopener" target="_blank">Read all Google reviews →</a></p>` : ""}`);
    case "napMap": return wrap(`<h2>${esc(s.h2)}</h2><div class="napgrid"><div class="card napinfo"><p><strong>${esc(s.nap.name)}</strong></p><p>${esc(s.nap.address || "")}</p><p>☎ <a href="tel:${esc((s.nap.phone || "").replace(/[^+\d]/g, ""))}">${esc(s.nap.phone || "")}</a></p>${s.nap.email ? `<p>✉ <a href="mailto:${esc(s.nap.email)}">${esc(s.nap.email)}</a></p>` : ""}<p><a href="${esc(s.nap.website || "#")}">${esc((s.nap.website || "").replace(/https?:\/\//, ""))}</a></p>${Object.keys(s.nap.hours || {}).length ? `<h3>Business hours</h3><ul class="hours">${Object.entries(s.nap.hours).map(([d, h]) => `<li><span>${esc(d)}</span> ${esc(h)}</li>`).join("")}</ul>` : ""}</div><div class="napmap"><iframe src="https://www.google.com/maps?q=${s.mapQuery}&output=embed" title="Map — ${esc(s.nap.name)}" loading="lazy" width="100%" height="300" style="border:0" referrerpolicy="no-referrer-when-downgrade"></iframe></div></div>`);
    case "faq": return wrap(`<h2>${esc(s.h2)}</h2><div class="faq">${s.items.map((f) => `<details><summary>${mdInline(f.q)}</summary><p>${mdInline(f.a)}</p></details>`).join("")}</div>`);
    case "cta": return `<section class="ss-sec sec-cta"><div class="wrap"><h2>${esc(s.h2)}</h2><p>${esc(s.text)}</p><p class="hbtns"><a class="btn light" href="${base}/contact">Get my written quote</a></p></div></section>`;
    default: return "";
  }
};

/* rule 15 — the DESIGN SYSTEM. One generator, scoped to .ss-sec, so the exact
   same professional design ships to raw HTML, Gutenberg and Elementor pages.
   All colors derive from the project's theme accent (ctx.accent): brand bands
   for hero/CTA, alternating white/tinted content bands, cards, checklists,
   numbered process steps, styled pricing, FAQ accordion and labeled image
   slots. `hard` adds !important so any WordPress theme is overridden. */
function designCss(ctx, { hard = false } = {}) {
  const i = hard ? "!important" : "";
  /* the palette comes from Brand Voice → Brand colors; anything unset falls
     back to the project accent + clean neutral defaults */
  const c = (ctx && ctx.brandColors) || {};
  const okHex = (v) => (/^#[0-9a-fA-F]{3,8}$/.test(String(v || "").trim()) ? String(v).trim() : "");
  const acc = okHex(c.primary) || (ctx && ctx.accent) || "#0E7C66";
  const sec = okHex(c.secondary) || acc;
  const band = okHex(c.ctaBg) || acc;                    // hero + CTA brand bands
  const accD = shade(band, -26), accT = hexRgba(acc, 0.07);
  const ink = okHex(c.heading) || "#141b24", mut = okHex(c.text) || "#46525f";
  const link = okHex(c.link) || acc, btn = okHex(c.button) || acc, btnTx = okHex(c.buttonText) || "#fff";
  const pageBg = okHex(c.pageBg) || "#fff", line = "#e5eaef";
  const tint = okHex(c.sectionTint) || "#f5f8fa";
  const sh = okHex(c.cardShadow) || "#0f1e32";
  return `
.ss-sec{box-sizing:border-box;width:100%${i};max-width:none${i};margin:0${i};padding:56px 5vw;background:${pageBg}${i};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif${i};line-height:1.7}
.ss-sec *{box-sizing:border-box}
.ss-sec .wrap{max-width:1060px;margin:0 auto}
.ss-sec.bg-tint{background:${tint}${i}}
.ss-sec h1,.ss-sec h2,.ss-sec h3{font-family:inherit${i};letter-spacing:-.01em${i};text-transform:none${i};color:${ink}${i};line-height:1.2${i}}
.ss-sec h1{font-size:clamp(30px,4.4vw,46px)${i};font-weight:800${i};margin:0 0 16px${i}}
.ss-sec h2{font-size:clamp(23px,3vw,32px)${i};font-weight:750${i};margin:0 0 20px${i}}
.ss-sec h3{font-size:clamp(16.5px,2.2vw,20px)${i};font-weight:700${i};margin:22px 0 8px${i}}
.ss-sec p{font-size:16.5px${i};margin:0 0 14px${i};color:${mut}${i};line-height:1.75${i}}
.ss-sec a{color:${link}${i}}
.ss-sec img{max-width:100%${i};height:auto${i};border-radius:16px;display:block}
.ss-sec figure{margin:18px 0}.ss-sec figcaption{font-size:12.5px;color:${mut};margin-top:8px;text-align:center}
.ss-sec ul,.ss-sec ol{margin:0 0 16px;padding-left:22px}.ss-sec li{font-size:16px${i};color:${mut};margin:6px 0}
.ss-sec blockquote{border-left:4px solid ${acc};margin:16px 0;padding:10px 18px;background:${accT};border-radius:0 12px 12px 0}
.ss-sec .btn{display:inline-block;background:${btn}${i};color:${btnTx}${i};padding:14px 26px;border-radius:12px;text-decoration:none${i};font-weight:700;font-size:15.5px}
.ss-sec .hbtns{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}
/* hero + CTA brand bands */
.ss-sec.sec-hero{background:linear-gradient(130deg,${accD},${band})${i};padding:64px 5vw}
.ss-sec.sec-hero h1,.ss-sec.sec-cta h2{color:#fff${i}}
.ss-sec.sec-hero p,.ss-sec.sec-cta p{color:rgba(255,255,255,.86)${i};font-size:17.5px${i}}
.ss-sec.sec-hero .hgrid{display:grid;gap:36px;grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr));align-items:center}
.ss-sec.sec-hero .hmedia img{box-shadow:0 22px 50px rgba(0,0,0,.28)}
.ss-sec .btn.light{background:#fff${i};color:${accD}${i}}
.ss-sec .btn.ghost{background:transparent;color:#fff${i};border:1.5px solid rgba(255,255,255,.65)}
.ss-sec.sec-cta{background:linear-gradient(130deg,${accD},${band})${i};text-align:center;padding:60px 5vw}
.ss-sec.sec-cta .hbtns{justify-content:center}
/* researched-content layouts */
.ss-sec .split{display:grid;gap:32px;grid-template-columns:1.5fr 1fr;align-items:start}
.ss-sec .split.rev{grid-template-columns:1fr 1.5fr}.ss-sec .split.rev .ctext{order:2}
.ss-sec .imgslot{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:220px;border:2px dashed ${hexRgba(acc,0.33)};border-radius:16px;background:${accT};color:${mut};font-size:13px;text-align:center;padding:18px}
.ss-sec .imgslot .ph{font-size:30px;opacity:.7}
.ss-sec .imgslot.hero{min-height:280px;background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.5);color:rgba(255,255,255,.85)}
.ss-sec ul.checks{list-style:none;padding:0;display:grid;gap:10px 22px;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))}
.ss-sec ul.checks li{position:relative;padding-left:30px;list-style:none${i}}
.ss-sec ul.checks li:before{content:"✓";position:absolute;left:0;top:1px;width:21px;height:21px;border-radius:50%;background:${sec};color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center}
.ss-sec ol.steps{list-style:none;padding:0;counter-reset:step}
.ss-sec ol.steps li{counter-increment:step;position:relative;padding:0 0 14px 44px}
.ss-sec ol.steps li:before{content:counter(step);position:absolute;left:0;top:0;width:30px;height:30px;border-radius:50%;background:${sec};color:#fff;font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center}
/* cards, grids, pricing, chips */
.ss-sec .grid3{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(250px,100%),1fr))}
.ss-sec .grid2{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))}
.ss-sec .card{background:${pageBg === "#fff" ? "#fff" : pageBg}${i};border:1px solid ${line};border-radius:16px;padding:22px;box-shadow:0 4px 18px ${hexRgba(sh,0.05)};margin:0}
.ss-sec.bg-tint .card{box-shadow:0 6px 22px ${hexRgba(sh,0.07)}}
.ss-sec .card h3{margin-top:0${i}}
.ss-sec table.price{width:100%;border-collapse:collapse;background:#fff${i};border:1px solid ${line};border-radius:16px;overflow:hidden}
.ss-sec table.price td{padding:14px 18px;border-bottom:1px solid ${line};font-size:15.5px${i};color:${mut}${i}}
.ss-sec table.price tr:last-child td{border-bottom:0}
.ss-sec table.price td:last-child{text-align:right;font-weight:800;color:${acc}}
.ss-sec .chips span,.ss-sec .chips a{display:inline-block;background:#fff${i};border:1px solid ${line};border-radius:999px;padding:5px 13px;margin:0 6px 8px 0;font-size:13.5px;text-decoration:none;color:${ink}}
.ss-sec.bg-plain .chips span,.ss-sec.bg-plain .chips a{background:${tint}}
/* reviews, FAQ, NAP */
.ss-sec .card.rev .stars{color:#F59E0B;font-size:15px;letter-spacing:2px}
.ss-sec .card.rev footer{margin-top:10px;font-size:13px;font-weight:700;color:${ink}}
.ss-sec .faq details{background:#fff${i};border:1px solid ${line};border-radius:14px;padding:0;margin:0 0 10px;overflow:hidden}
.ss-sec .faq summary{cursor:pointer;list-style:none;padding:16px 20px;font-weight:700;font-size:16px;color:${ink}${i};position:relative}
.ss-sec .faq summary:after{content:"+";position:absolute;right:18px;top:12px;font-size:22px;color:${acc};font-weight:400}
.ss-sec .faq details[open] summary:after{content:"–"}
.ss-sec .faq details p{padding:0 20px 16px;margin:0}
.ss-sec .napgrid{display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))}
.ss-sec .napmap iframe{width:100%;min-height:280px;border:0;border-radius:16px}
.ss-sec .hours{padding:0}.ss-sec .hours li{display:flex;justify-content:space-between;max-width:300px;list-style:none}
.ss-sec .note{font-size:13px${i};margin-top:12px}
@media(max-width:760px){.ss-sec{padding:40px 5vw}.ss-sec .split,.ss-sec .split.rev{grid-template-columns:1fr}.ss-sec .split.rev .ctext{order:0}.ss-sec .btn{display:block;text-align:center}}${hard ? `
/* WP embed mode (LAST so its !important wins the order fight): sections
   BREAK OUT of the theme's boxed content container to true full-bleed
   bands, the horizontal-scroll side effect is guarded, and the theme's own
   page title is hidden so the hero H1 is the one and only title */
html,body{overflow-x:hidden}
h1.entry-title,.page-header h1.page-title,h1.page-title,.elementor-page-title{display:none!important}
.ss-sec{position:relative;width:100vw!important;left:50%!important;right:50%!important;margin-left:-50vw!important;margin-right:-50vw!important}` : ""}`;
}

/* WordPress body variant: no doctype/head — the scoped design system + full
   section bands, safe inside any theme (full-bleed on Elementor Canvas) */
const chromeHeaderHtml = (chrome, ctx) => `<header class="ss-sec" style="padding:16px 5vw;border-bottom:1px solid #e5eaef"><nav class="wrap" style="display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center"><a href="/" style="font-weight:800;font-size:17px;text-decoration:none;color:#141b24">${esc(ctx.brand)}</a>${chrome.nav.map((n) => `<a href="${n.url}" style="text-decoration:none;color:#141b24;font-weight:600;font-size:14.5px">${esc(n.title)}</a>`).join("")}</nav></header>`;
const chromeFooterHtml = (chrome, ctx) => chrome.footer.nap ? `<footer class="ss-sec" style="padding:22px 5vw;border-top:1px solid #e5eaef;background:#f5f8fa"><div class="wrap" style="color:#46525f;font-size:14px"><p style="margin:0"><strong>${esc(chrome.footer.nap.name)}</strong> · ${esc(chrome.footer.nap.address || "")} · ${esc(chrome.footer.nap.phone || "")}</p></div></footer>` : "";
export function serializeWpBody(page, chrome, ctx, { withChrome = false } = {}) {
  const base = "";
  const style = `<style>${designCss(ctx, { hard: true })}</style>`;
  const body = page.sections.map((s2) => sectionHtml(s2, base)).join("\n");
  return `${style}${withChrome ? chromeHeaderHtml(chrome, ctx) : ""}${body}${withChrome ? chromeFooterHtml(chrome, ctx) : ""}\n<script type="application/ld+json">${JSON.stringify(page.schema)}</script>`;
}

export function serializeHtml(page, chrome, ctx) {
  const base = ""; // relative links — portable across staging/production hosts
  const body = page.sections.map((s2) => sectionHtml(s2, base)).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(page.metaTitle)}</title>
<meta name="description" content="${esc(page.metaDesc)}">
<link rel="canonical" href="https://${ctx.website}${page.node.url}">
<meta property="og:title" content="${esc(page.metaTitle)}"><meta property="og:description" content="${esc(page.metaDesc)}"><meta property="og:type" content="website">
<style>*{box-sizing:border-box;margin:0}body{font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#141b24;background:#fff}header.site{background:#fff}header.site,footer.site{padding:16px 5vw;border-bottom:1px solid #e5eaef}footer.site{border-top:1px solid #e5eaef;border-bottom:0;color:#46525f;font-size:14px;background:#f5f8fa;padding:24px 5vw}footer.site p{margin:6px 0}nav{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center}nav a{text-decoration:none;color:#141b24;font-weight:600;font-size:14.5px}footer.site a{color:${ctx.accent || "#0E7C66"}}
${designCss(ctx)}</style>
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

/* Gutenberg: the design system + one Custom-HTML block per section band —
   each band stays independently editable in the block editor, and the page
   renders EXACTLY as designed (native heading/paragraph blocks would sit
   outside the section bands and lose the design) */
export function serializeGutenberg(page, chrome, ctx) {
  const b = [];
  b.push(`<!-- wp:html --><style>${designCss(ctx, { hard: true })}</style><!-- /wp:html -->`);
  page.sections.forEach((s) => b.push(`<!-- wp:html -->${sectionHtml(s, "")}<!-- /wp:html -->`));
  b.push(`<!-- wp:html --><script type="application/ld+json">${JSON.stringify(page.schema)}</script><!-- /wp:html -->`);
  return b.join("\n");
}

/* Elementor: _elementor_data JSON — one full-width section per design band,
   each holding an HTML widget with the band's markup (editable per-section
   in Elementor; the shared design CSS ships in the first widget) */
export function serializeElementor(page, chrome, ctx) {
  const wid = (n) => "w" + hashStr(page.node.url + n).toString(36);
  const widget = (type, settings, i) => ({ id: wid(type + i), elType: "widget", widgetType: type, settings });
  const section = (widgets, i) => ({ id: wid("sec" + i), elType: "section", settings: { layout: "full_width", gap: "no" }, elements: [{ id: wid("col" + i), elType: "column", settings: { _column_size: 100 }, elements: widgets }] });
  const data = [
    section([widget("html", { html: `<style>${designCss(ctx, { hard: true })}</style>` }, 0)], 0),
    ...page.sections.map((s, i) => section([widget("html", { html: sectionHtml(s, "") }, i + 1)], i + 1)),
    section([widget("html", { html: `<script type="application/ld+json">${JSON.stringify(page.schema)}</script>` }, 990)], 990),
  ];
  return {
    elementorData: JSON.stringify(data),
    /* content body only — the site's own header/footer/menu stay */
    fallbackHtml: serializeWpBody(page, chrome, ctx, { withChrome: false }),
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
