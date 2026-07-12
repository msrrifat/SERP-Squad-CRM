/* ================= Website architecture & content engine =================
   Technical-SEO-grounded generators for the Website Mapping & Content
   Structure tool. These are deterministic scaffolds of what a wired AI
   provider (Company Settings → API settings) would return — same shapes,
   real IA/on-page logic, clearly labeled "draft" in the UI.

   The SEO principles encoded here:
   - Siloed / hub-and-spoke IA: a service hub links to service spokes; a
     location hub links to city pages (local SEO); a blog hub feeds informational
     spokes with contextual internal links back to money pages.
   - One page = one primary intent = one primary keyword (no cannibalization).
   - Content structure from SERP: shared H2s across the top competitors are
     "table stakes" (must-cover); unique H2s are differentiators; shared
     entities drive topical completeness (entity SEO / semantic coverage).
   - E-E-A-T scaffolding: author/trust, FAQ (PAA), schema hints per page type.
   ======================================================================= */
import { hashStr, mulberry32 } from "./rng.js";

const cap = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const uid = (seed) => "n" + hashStr(seed).toString(36) + Math.floor(Math.random() * 1e4).toString(36);

/* ---- 1. site architecture from niche + services ---- */
export function genSiteArchitecture(niche, servicesRaw, brand, locationsRaw = "") {
  const services = (servicesRaw || "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 12);
  const locations = (locationsRaw || "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 12);
  const n = (niche || "your services").trim();
  const page = (title, url, type, primary, children = []) => ({
    id: uid(url), title, url, type, children,
    seo: { primaryKw: primary || "", secondaryKws: "", competitors: [], structure: null, audit: null, content: null },
  });

  const tree = [
    page(`${brand} — ${cap(n)}`, "/", "home", n),
  ];
  // Services hub → spokes (silo)
  if (services.length) {
    const hub = page(`${cap(n)} Services`, "/services", "hub", `${n} services`,
      services.map((sv) => page(cap(sv), "/services/" + slug(sv), "service", sv.toLowerCase())));
    tree.push(hub);
  }
  // Location hub → city pages (local silo)
  if (locations.length) {
    const locHub = page(`Service Areas`, "/locations", "hub", `${n} near me`,
      locations.map((loc) => page(`${cap(n)} in ${loc}`, "/locations/" + slug(loc), "location", `${n} ${loc.toLowerCase()}`)));
    tree.push(locHub);
  }
  // Trust + conversion pages
  tree.push(page("About Us", "/about", "about", `about ${brand.toLowerCase()}`));
  tree.push(page("Reviews & Testimonials", "/reviews", "trust", `${brand.toLowerCase()} reviews`));
  tree.push(page("Contact & Book", "/contact", "contact", `contact ${brand.toLowerCase()}`));
  // Blog hub → informational spokes
  const r = mulberry32(hashStr(n + "blog"));
  const topics = [`what is ${n}`, `${n} cost guide`, `how to choose a ${n} provider`, `${n} vs alternatives`, `${n} FAQ`];
  const blog = page("Blog", "/blog", "hub", `${n} tips`,
    topics.slice(0, 3 + Math.floor(r() * 2)).map((t) => page(cap(t), "/blog/" + slug(t), "article", t)));
  tree.push(blog);
  return tree;
}

export const PAGE_TYPE_META = {
  home: { label: "Homepage", schema: "Organization + WebSite", color: "#1E40AF" },
  hub: { label: "Hub / Silo landing", schema: "CollectionPage + BreadcrumbList", color: "#7C3AED" },
  service: { label: "Service page", schema: "Service + FAQPage", color: "#0E7C66" },
  location: { label: "Location page", schema: "LocalBusiness + FAQPage", color: "#B45309" },
  article: { label: "Blog article", schema: "Article + FAQPage", color: "#DB2777" },
  about: { label: "About", schema: "AboutPage + Organization", color: "#475569" },
  trust: { label: "Trust page", schema: "Review + AggregateRating", color: "#CA8A04" },
  contact: { label: "Contact", schema: "ContactPage + LocalBusiness", color: "#DC2626" },
};

/* count pages in a tree */
export const countPages = (tree) => tree.reduce((n, p) => n + 1 + countPages(p.children || []), 0);

/* ---- internal link plan from the finalized site structure ----
   Given the flattened site map, compute the links THIS page should carry:
   up to its hub, across to siblings, to the same service in other cities,
   down to supporting blog spokes, and to the conversion page. */
export function buildLinkPlan(currentUrl, siteLinks = [], type = "service") {
  const others = siteLinks.filter((l) => l.url && l.url !== currentUrl);
  const parentPath = currentUrl.split("/").slice(0, -1).join("/") || "/";
  const hub = others.find((l) => l.url === parentPath && l.type === "hub") || others.find((l) => l.type === "hub");
  const siblings = others.filter((l) => l.url.startsWith(parentPath + "/") && l.url.split("/").length === currentUrl.split("/").length).slice(0, 3);
  const crossCity = type === "location" ? others.filter((l) => l.type === "location").slice(0, 4)
    : others.filter((l) => l.type === "location").slice(0, 2);
  const blog = others.filter((l) => l.type === "article").slice(0, 2);
  const services = type !== "service" ? others.filter((l) => l.type === "service").slice(0, 3) : [];
  const contact = others.find((l) => l.type === "contact");
  const home = others.find((l) => l.type === "home");
  return { hub, siblings, crossCity, blog, services, contact, home };
}
export const linkPlanRows = (plan) => [
  plan.hub && { ...plan.hub, why: "parent hub (silo integrity)" },
  ...(plan.siblings || []).map((l) => ({ ...l, why: "sibling page (topical cluster)" })),
  ...(plan.services || []).map((l) => ({ ...l, why: "related service" })),
  ...(plan.crossCity || []).map((l) => ({ ...l, why: "same service, other city" })),
  ...(plan.blog || []).map((l) => ({ ...l, why: "supporting article" })),
  plan.contact && { ...plan.contact, why: "conversion CTA" },
].filter(Boolean);

/* ---- 2. content structure from competitor SERP data ---- */
const STOP = new Set("the a an and or for to of in on with your our you we is are how what best near me services service".split(" "));
const words = (s) => (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

export function genContentStructure(page, competitors, niche, siteLinks = []) {
  const primary = page.seo.primaryKw || page.title;
  const secondary = (page.seo.secondaryKws || "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  const r = mulberry32(hashStr(primary + competitors.map((c) => c.url).join("")));

  // entity extraction: terms appearing across ≥2 competitor titles/descriptions
  const freq = {};
  competitors.forEach((c) => new Set(words(`${c.title} ${c.description}`)).forEach((w) => { freq[w] = (freq[w] || 0) + 1; }));
  const entities = Object.entries(freq).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([w, n]) => ({ term: w, inCompetitors: n }));
  const shared = entities.filter((e) => e.inCompetitors >= Math.ceil(competitors.length * 0.6));
  const differentiators = entities.filter((e) => e.inCompetitors < Math.ceil(competitors.length * 0.6) && e.inCompetitors >= 2);

  // H2 outline: table-stakes sections every competitor covers + a differentiator
  const pk = cap(primary);
  const sections = [
    { h2: `What is ${pk}?`, note: "Definition + primary keyword in first 100 words", kind: "table-stakes" },
    { h2: `Benefits of ${pk}`, note: "Bullet list — scannable, features→benefits", kind: "table-stakes" },
    { h2: `${pk} Process / How It Works`, note: "Numbered steps — earns 'how' PAA & featured snippet", kind: "table-stakes" },
    { h2: `${pk} Cost & Pricing`, note: "Transparency section — high commercial intent, competitors often hide this = your differentiator", kind: "differentiator" },
    ...secondary.slice(0, 3).map((kw) => ({ h2: cap(kw), note: `Dedicated section for secondary keyword "${kw}"`, kind: "secondary" })),
    { h2: `Why Choose ${niche ? cap(niche) : "Us"}`, note: "E-E-A-T: experience, credentials, proof", kind: "eeat" },
    { h2: "Frequently Asked Questions", note: "5–7 Q&As from People Also Ask — target FAQPage schema", kind: "table-stakes" },
  ];
  const faqs = [
    `How much does ${primary} cost?`,
    `How long does ${primary} take?`,
    `Is ${primary} right for me?`,
    `What should I expect from ${primary}?`,
  ];
  const wordTarget = Math.round((competitors.length ? 1100 : 900) + shared.length * 40 + r() * 300);
  return {
    generatedAt: Date.now(),
    fromCompetitors: competitors.length,
    sections,
    entities: entities.slice(0, 18),
    sharedEntities: shared.map((e) => e.term),
    differentiators: differentiators.slice(0, 8).map((e) => e.term),
    faqs,
    wordTarget,
    internalLinks: linkPlanRows(buildLinkPlan(page.url, siteLinks, page.type)).map((l) => `"${l.title}" → ${l.url} (${l.why})`),
    schemaHints: [PAGE_TYPE_META[page.type]?.schema || "WebPage", "BreadcrumbList", "FAQPage"],
  };
}

/* ---- 3. audit the structure, propose improvements ---- */
export function auditStructure(structure, page) {
  if (!structure) return null;
  const issues = [];
  const has = (kw) => structure.sections.some((s) => s.h2.toLowerCase().includes(kw));
  if (!has("faq")) issues.push({ sev: "high", text: "No FAQ section — you're leaving People-Also-Ask real estate and FAQPage schema on the table.", fix: "add-faq" });
  if (structure.wordTarget < 1000) issues.push({ sev: "med", text: `Word target ${structure.wordTarget} is thin for a competitive commercial query; top results average more depth.`, fix: "raise-words" });
  if ((structure.differentiators || []).length < 2) issues.push({ sev: "med", text: "Few differentiator angles — the page risks being a me-too of the SERP. Add a unique angle competitors miss.", fix: "add-diff" });
  if (!structure.sections.some((s) => s.kind === "eeat")) issues.push({ sev: "high", text: "No explicit E-E-A-T section — add author credentials, real results, and trust signals.", fix: "add-eeat" });
  if (!(page.seo.secondaryKws || "").trim()) issues.push({ sev: "low", text: "No secondary keywords set — you're missing semantic breadth and long-tail capture.", fix: "note-secondary" });
  if (!has("cost") && !has("pricing")) issues.push({ sev: "med", text: "No pricing/cost section — high commercial-intent searchers bounce without it.", fix: "add-cost" });
  const score = Math.max(20, 100 - issues.reduce((n, i) => n + (i.sev === "high" ? 22 : i.sev === "med" ? 12 : 5), 0));
  return { auditedAt: Date.now(), score, issues,
    summary: issues.length ? `${issues.length} improvement${issues.length > 1 ? "s" : ""} found — mostly ${issues.filter((i) => i.sev === "high").length ? "high-impact E-E-A-T & SERP-feature gaps" : "depth & differentiation tweaks"}.` : "Structure is competitive — no major gaps found." };
}

/* ---- 4. apply audit fixes to the structure ---- */
export function adjustStructure(structure, audit, page) {
  if (!structure || !audit) return structure;
  const s = JSON.parse(JSON.stringify(structure));
  const pk = cap(page.seo.primaryKw || page.title);
  audit.issues.forEach((iss) => {
    if (iss.fix === "add-faq" && !s.sections.some((x) => x.h2.toLowerCase().includes("faq")))
      s.sections.push({ h2: "Frequently Asked Questions", note: "Added by audit — 5–7 PAA Q&As, FAQPage schema", kind: "table-stakes" });
    if (iss.fix === "raise-words") s.wordTarget = Math.max(s.wordTarget, 1400);
    if (iss.fix === "add-diff") { s.differentiators = [...new Set([...(s.differentiators || []), "original data / case study", "expert commentary"])];
      s.sections.splice(3, 0, { h2: `${pk}: What Others Don't Tell You`, note: "Audit-added differentiator — original insight competitors lack", kind: "differentiator" }); }
    if (iss.fix === "add-eeat") s.sections.push({ h2: "Our Expertise & Credentials", note: "Audit-added E-E-A-T block — author bio, certifications, proof", kind: "eeat" });
    if (iss.fix === "add-cost") s.sections.splice(3, 0, { h2: `${pk} Cost & Pricing`, note: "Audit-added pricing transparency", kind: "differentiator" });
  });
  s.adjustedAt = Date.now();
  return s;
}

/* ---- 5. write the page content from the (adjusted) structure ----
   Full on-page SEO: optimized meta title/description, H1→H2→H3 hierarchy,
   structure-aware internal links with descriptive anchors (exact URLs from
   the finalized site plan), image alt suggestions and JSON-LD schema. */
const SCHEMA_TYPES = { home: "Organization", hub: "CollectionPage", service: "Service", location: "LocalBusiness", article: "Article", about: "AboutPage", trust: "Review", contact: "ContactPage" };
export function genPageContent(page, structure, brandVoice, brand, niche, siteLinks = []) {
  if (!structure) return null;
  const primary = page.seo.primaryKw || page.title;
  const pk = cap(primary);
  const plan = buildLinkPlan(page.url, siteLinks, page.type);
  const links = linkPlanRows(plan);
  const tone = (brandVoice?.toneWords || "").trim();
  const city = page.type === "location" ? page.title.split(" in ").pop() : "";

  /* meta optimization: primary kw front-loaded, ≤60 / ≤160, brand suffixed */
  let metaTitle = `${pk}${city ? ` in ${city}` : ""} | ${brand}`;
  if (metaTitle.length > 60) metaTitle = `${pk} | ${brand}`.slice(0, 60);
  let metaDesc = `${pk}${city ? ` in ${city}` : ""} from ${brand}: transparent pricing, expert delivery and same-week availability. See costs, process and real results — book online today.`;
  if (metaDesc.length > 160) metaDesc = metaDesc.slice(0, 157) + "…";

  const L = (l, anchor) => `[${anchor || l.title}](${l.url})`;
  const p = (t) => t + "\n\n";
  let used = [];
  const useLink = (l, anchor) => { if (!l) return ""; used.push(l.url); return L(l, anchor); };

  let md = `# ${pk}${city ? ` in ${city}` : ""} — ${brand}\n\n`;
  if (tone) md += `_Voice: ${tone}._\n\n`;
  md += p(`Looking for ${primary}${city ? ` in ${city}` : ""}? You're in the right place. ${brand} delivers **${primary}** with transparent pricing and real, verifiable results${plan.hub ? ` — part of our full ${useLink(plan.hub, plan.hub.title.toLowerCase())} range` : ""}. Here's everything to know before you decide.`);

  structure.sections.forEach((sec, i) => {
    md += `## ${sec.h2}\n\n`;
    if (/faq/i.test(sec.h2)) {
      (structure.faqs || []).forEach((q) => { md += `**${q}**\n\n${pk} answers vary by situation — at ${brand} you get a straight answer up front, in writing.${plan.blog[0] ? ` Our guide ${L(plan.blog[0])} goes deeper.` : ""}\n\n`; if (plan.blog[0]) used.push(plan.blog[0].url); });
    } else if (/cost|pricing/i.test(sec.h2)) {
      md += p(`We publish clear ${primary} pricing — no surprises. Five factors drive the differences:`);
      md += "- Scope of work\n- Materials & technology\n- Provider experience\n- Location & demand\n- Aftercare included\n\n";
      md += `### What's included at ${brand}\n\n` + p(`Every quote is itemized, so you can compare like-for-like.${plan.contact ? ` Get yours via our ${useLink(plan.contact, "booking page")}.` : ""}`);
    } else if (/process|how it works/i.test(sec.h2)) {
      md += "1. Free consultation & assessment\n2. Transparent written plan & quote\n3. Expert delivery\n4. Follow-up & aftercare\n\n";
      md += `![${pk} process at ${brand}](suggested: process photo, alt "${primary} step by step at ${brand}")\n\n`;
    } else if (i === 1 && plan.siblings.length) {
      md += p(`${sec.note}. Many clients pair ${primary} with ${plan.siblings.slice(0, 2).map((l) => useLink(l, l.title.toLowerCase())).join(" or ")} for a complete result.`);
    } else {
      md += p(`${sec.note}. ${(structure.sharedEntities || []).slice(0, 4).map(cap).join(", ")} all factor into doing ${primary} right — and where competitors stop, ${brand} keeps going.`);
    }
  });

  /* cross-city + service-area block: the "other city similar pages" links */
  if (plan.crossCity.length) {
    md += `## ${city ? "We Also Serve" : "Service Areas"}\n\n`;
    md += p(`${brand} provides ${primary} across the region: ${plan.crossCity.map((l) => useLink(l)).join(" · ")}.`);
  }
  md += `## Ready to Get Started?\n\n`;
  md += p(`Book your ${primary} consultation with ${brand}${plan.contact ? ` on our ${useLink(plan.contact, "contact & booking page")}` : ""} — transparent pricing and same-week availability.${plan.home ? ` Learn more about ${useLink(plan.home, brand)}.` : ""}`);

  /* JSON-LD schema matched to the page type */
  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": SCHEMA_TYPES[page.type] || "WebPage",
    name: metaTitle,
    description: metaDesc,
    url: `https://SITE${page.url}`,
    ...(page.type === "service" ? { provider: { "@type": "LocalBusiness", name: brand }, areaServed: plan.crossCity.map((l) => l.title.split(" in ").pop()) } : {}),
    ...(page.type === "location" ? { address: { "@type": "PostalAddress", addressLocality: city } } : {}),
  }, null, 2);

  const wordCount = md.split(/\s+/).length;
  return {
    generatedAt: Date.now(), markdown: md, metaTitle, metaDesc, schema,
    internalLinksUsed: [...new Set(used)],
    wordCount, targetMet: wordCount >= (structure.wordTarget || 900) * 0.85,
  };
}
