/* =====================================================================
   GOOGLE SEO KNOWLEDGE — distilled from "Google SEO PRO Guides"
   (Google Search Central: SEO Starter Guide, How Search Works, Helpful
   Content / E-E-A-T, Generative-AI search guidance, URL/link/sitemap best
   practices, title links & snippets, structured data, local business,
   page experience / Core Web Vitals, ranking systems, and more).

   Two layers feed every AI feature in the CRM:
     • SEO_CORE — the always-on digest injected into every writing,
       architecture and planning prompt.
     • SEO_TOPICS — deeper per-discipline blocks a tool opts into with
       seoGuideBlock("writing", "titles", …).
   The FULL corpus (413 KB, 60 chapters) lives server-side in
   server/data/seo-guide.json and is queried per-question through
   POST /api/seo-guide — the AI agent cites it verbatim.
   ===================================================================== */

export const SEO_CORE = `GOOGLE SEO DOCTRINE (from Google Search Central — follow exactly, never contradict):
- Google Search works in three stages, none guaranteed: crawling (Googlebot fetches and RENDERS pages, running JS), indexing (content analysis + canonical selection), serving (ranking by hundreds of signals). Google never accepts payment to crawl or rank; nobody can guarantee #1.
- Helpful, reliable, PEOPLE-FIRST content influences presence in Search more than anything else. Content must show original information/analysis, substantial completeness, and first-hand experience. Never write search-engine-first content: no mass-produced topic sweeps, no summarizing others without added value, no chasing trends outside your expertise, no fake freshness (changing dates without substantive change).
- E-E-A-T (Experience, Expertise, Authoritativeness, Trust — trust matters most) is NOT a direct ranking factor, but Google's systems reward content that demonstrates it, with extra weight on YMYL (health/money/safety) topics. Make "Who, How, Why" visible: clear bylines and author background; disclose how content was produced (including AI assistance where a reader would ask); the "why" must be helping people, not attracting search visits. AI-generated content used primarily to manipulate rankings violates spam policy (scaled content abuse).
- Titles: every page needs a unique, descriptive, concise <title>; no keyword stuffing, no boilerplate repeated across pages; brand the site name concisely at start or end with a delimiter. The main heading must be the visually dominant title, matching page language. Google rewrites bad titles from headings/anchors.
- Snippets come primarily from page content; the meta description is used when it describes the page better. Write a unique, specific meta description per page — a short pitch with the page's key facts (price, location, hours, author, date where relevant); keyword lists are ignored.
- Links: crawlable only as <a href="…">; anchor text must be descriptive, concise and make sense out of context ("click here" is useless). Every important page needs at least one internal link from another page; cross-reference related content with contextual anchors; don't chain links or stuff keywords into anchors. Link out to cite sources (builds trust); use nofollow/sponsored/ugc for paid, untrusted or user-generated links.
- URLs: descriptive readable words, hyphens (never underscores), few parameters, lowercase, logical topical directories. Keywords in domain/URL have almost no ranking effect. Reduce duplicate content; prefer redirects, else rel="canonical".
- Images: high-quality, placed near relevant text, with descriptive alt text. Videos: standalone page, descriptive title/description text.
- Page experience is rewarded: good Core Web Vitals (LCP ≤ 2.5 s, INP < 200 ms, CLS < 0.1), HTTPS, mobile-friendly, main content distinguishable, no intrusive interstitials, ads that don't interfere.
- Generative-AI search (AI Overviews / AI Mode) needs NO special optimization: no llms.txt, no "chunking", no AEO/GEO hacks, no special schema. It's grounded in normal Search ranking (RAG + query fan-out). What wins there: unique, non-commodity content with a first-hand point of view (not "7 generic tips" anyone could write), crawlable/indexable pages eligible for snippets, and up-to-date Business Profile / Merchant data.
- Explicit NON-factors: meta keywords, word-count targets (no minimum/maximum), heading order/count, subdomain vs subdirectory, TLD choice (outside geo-targeting), duplicate-content "penalty" (doesn't exist), E-E-A-T as a literal ranking factor.
- Spam to never do: keyword stuffing, scaled content abuse (mass-generated pages incl. AI), link schemes, cloaking, misleading structured data.
- Structured data (JSON-LD recommended) makes pages eligible for rich results (never guaranteed); it must describe VISIBLE page content, never invented or hidden data. Local businesses: LocalBusiness markup, claimed Business Profile, Organization logo, Breadcrumb.
- Changes take time: hours to months to reflect in Search; assess after a few weeks. Verify everything in Search Console rather than guessing.`;

export const SEO_TOPICS = {
  writing: `WRITING RULES (Google Search Central):
- Easy to read, well organized: natural writing, correct spelling/grammar, paragraphs and sections with headings that help navigation. No ideal length exists — cover the topic completely, then stop.
- Unique and original: never rehash what's already published; add original information, reporting, research or analysis. Ask: would this be referenced by a magazine or encyclopedia? Would a reader bookmark it? Does it offer substantial value versus the pages already ranking?
- First-hand experience beats commodity content: "Why we waived the inspection and saved money" outranks "7 tips for first-time homebuyers" in usefulness. Demonstrate the product was used, the place visited, the process performed — with evidence (numbers, photos described, specifics).
- Anticipate readers' search terms: experts search "charcuterie", novices "cheese board" — write for your audience's vocabulary, but don't force every variation; Google's language systems match synonyms and related concepts.
- After reading, the visitor must feel they've learned enough to achieve their goal — never leave them needing to search again.
- Keep content up to date; update or remove stale material — but never fake freshness by changing dates alone.
- Show E-E-A-T on the page: byline where expected, author background, cited sources with descriptive external links, disclosure of how the content was made (including AI assistance) when a reader would reasonably ask.
- Repeating keywords (even in variations) tires readers and violates spam policy. Write each concept once, well.`,

  architecture: `SITE ARCHITECTURE RULES (Google Search Central):
- Organize logically: topical directories (/policies/…, /promotions/…) help Google learn crawl frequency per section and help users predict content. For local service businesses: a services hub linking one page per service, a locations hub with one page per city, a blog hub whose posts support the money pages.
- ONE piece of content per URL — never two pages competing for the same query. Consolidate duplicates with 301 redirects (permanent) or rel="canonical"; temporary moves use 302. A page removed for good must return a real 404 (never a soft 404).
- Every page you care about must be reachable by at least one crawlable <a href> link from another findable page — no orphans. Hub/category pages are how Google discovers new posts.
- Descriptive URLs in the audience's language: readable words not IDs, hyphens between words, as few parameters as possible; URL words can appear as breadcrumbs in results. URLs are case-sensitive.
- Sitemaps: needed for large sites (500+ pages), new sites with few external links, or lots of media/news; list the pages that matter, keep it current, submit in Search Console. Google prioritizes (not limits itself to) sitemap URLs.
- robots.txt prevents CRAWLING (use for infinite spaces: faceted filters, calendars, cart/session URLs, internal search results) — it does NOT prevent indexing; use noindex or login walls for that. Never block CSS/JS Google needs to render.
- Sitelinks are automatic; earn them with a logical structure, informative compact titles/headings, concise relevant internal anchors, and no repetitive content.
- Mobile-first indexing: content, metadata and structured data must be the same on mobile and desktop.
- Multi-page articles need prominent crawlable next/previous links; infinite scroll needs a paginated equivalent.
- If it uses JavaScript: unique titles/snippets per screen, History API not URL fragments (Google ignores #fragment content), each piece of content needs its own URL, meaningful HTTP status codes, canonical injected correctly.`,

  posts: `BLOG / FAQ PLANNING RULES (Google Search Central):
- Plan people-first, not volume-first: producing lots of content on many topics hoping some ranks IS search-engine-first content, and scaled content abuse (incl. AI mass-generation) violates spam policy. Every planned post must serve the existing audience and demonstrate real expertise.
- One post per REAL question or intent — no two posts targeting the same query (cannibalization); don't create a page per keyword variation, Google matches synonyms and related phrasings ("query fan-out" in AI search does this automatically).
- Answer posts: the title is the question people actually ask (Search Console, People-Also-Ask, forums); answer completely enough that the reader doesn't need to search again. Featured snippets and AI Overviews favor pages that answer a question directly then add depth.
- Guides must be non-commodity: bring a unique angle, first-hand data, local specificity — not generic listicles anyone could produce.
- Freshness matters only where the query deserves it (news, seasonal, "best X 2026"); evergreen guides win by completeness and updates, not re-dating.
- Structure each post: descriptive H1 (the one dominant title), scannable H2 sections, FAQs where people ask them, internal links with descriptive anchors to the service pages the post supports, plus cited external sources.
- Reviews content (any "best/top/vs" post) is evaluated by the reviews system: it must show in-depth research, first-hand testing evidence, and expert analysis — thin summaries of products are demoted.
- Discover traffic favors compelling titles that capture the essence WITHOUT clickbait (no withheld information, no sensationalism), plus large (1200px+) high-quality images.`,

  titles: `TITLE & SNIPPET RULES (Google Search Central):
- <title>: unique per page, descriptive and concise, no vague labels ("Home", "Profile"), no keyword stuffing, no boilerplate that varies by one word across pages. Brand as "Page topic — Site Name" (site name at start or end, delimited). Match the page's language/script. Google rebuilds bad titles from H1s, prominent text and anchors — a rewritten title is a symptom to fix.
- The main visual title (H1) must be THE prominent heading — one clear dominant title, matching the <title>'s meaning; avoid several same-weight headings.
- Meta description: a specific, accurate pitch for the page; unique per page (site-level copy only on the homepage); can pack key data (price, author, date, hours, location). No length limit — Google truncates to device width; keyword strings are ignored. Programmatic generation is fine and encouraged at scale IF human-readable and page-specific.
- Snippet controls where needed: nosnippet, max-snippet:[n], data-nosnippet.
- Every page must have title + meta description filled; these are the first things checked in any audit.`,

  links: `LINKING & ANCHOR RULES (Google Search Central):
- Crawlable = <a> element with resolvable href. Not crawlable: <span href>, onclick-only, javascript: URLs, routerLink without href. JS-inserted links are fine if proper <a href> markup results.
- Anchor text: descriptive, reasonably concise, meaningful OUT OF CONTEXT. Bad: "click here", "read more", "website", whole-sentence anchors. For image links the img alt is the anchor. Empty anchors waste the link.
- Internal: every important page linked from at least one other page, in context, with anchors that say what the target is. Vary anchors naturally across pages; don't repeat one exact-match anchor everywhere — and never stuff keywords into anchors (spam policy).
- Space links out with surrounding context; never chain multiple links back-to-back.
- External: cite sources with descriptive anchors — it builds trust. nofollow only for untrusted targets; sponsored for paid links; ugc for user-generated. Automate ugc/nofollow on all user-submitted links.
- No link schemes: never buy, exchange or mass-place links for ranking; PageRank flows through editorial links.`,

  local: `LOCAL SEO RULES (Google Search Central):
- Claim and verify the Google Business Profile: it powers Maps, the local pack and the knowledge panel. Keep name, address, phone, categories, hours, photos and services complete and current — Business Profile data also feeds AI features and shopping experiences.
- Establish the business: verify the site in Search Console, keep NAP consistent everywhere, update the knowledge panel as the verified representative.
- LocalBusiness structured data (JSON-LD) on the site: exact name/address/phone/hours/geo, the most specific @type (e.g. Restaurant, Electrician), only data visible on the page. Add Organization (logo) and Breadcrumb markup site-wide.
- One landing page per location with unique, substantive local content — never doorway pages (near-duplicate city pages exist only to funnel searches and violate spam policy). A city page earns its place with genuinely local proof: local projects, local reviews, area-specific details.
- Reviews: gather them honestly on Google and independent sites; respond to them; review markup on the site only for reviews OF OTHER businesses displayed on your page, never self-serving markup.
- "Top places" list mentions and local news coverage feed local prominence; local ranking blends relevance, distance and prominence.
- Multi-regional targeting: country-specific domain or subdirectory; hreflang for language variants.`,

  structured: `STRUCTURED DATA RULES (Google Search Central):
- JSON-LD recommended (script tag in head or body, may be JS-injected); Microdata and RDFa equally accepted. Rely on Google's docs, not schema.org, for what's required per feature.
- Markup must describe the VISIBLE main content of that page — never invented data, hidden text, or markup-only pages. Misleading markup ⇒ manual action (loses rich-result eligibility).
- Include ALL required properties for eligibility; fewer complete and accurate recommended properties beat many sloppy ones. Rich results are never guaranteed even with valid markup.
- Don't block marked-up pages from Googlebot; keep markup identical on mobile and desktop; match structured data to on-page text.
- Validate with the Rich Results Test before deploy, monitor in Search Console after.
- High-value types for business sites: LocalBusiness, Organization (logo), Breadcrumb, Product, Review/AggregateRating (only reviews of OTHER entities), FAQ where genuinely present, Video, ProfilePage for author pages (supports E-E-A-T).
- Structured data is NOT required for AI features and doesn't boost ranking — it enables rich results and helps Google understand entities.`,

  technical: `TECHNICAL SEO RULES (Google Search Central):
- Confirm indexing with site: / Search Console; if absent check technical requirements first. Googlebot must fetch the page AND its CSS/JS (blocked resources break rendering); use URL Inspection to see the page as Google does. Googlebot crawls from the US.
- Crawl control: robots.txt for crawling (not indexing!), noindex/login for keeping pages out, sitemaps to encourage and prioritize. HTTP 500s slow crawling; persistent errors drop pages.
- Canonicalization: Google clusters similar pages and picks one canonical. Steer it with 301/302 redirects, rel="canonical", consistent internal linking, and sitemap listing only canonicals. Language variants need hreflang.
- Site moves: 301 everything, update sitemaps, use Search Console's change-of-address; signals forward.
- HTTPS is required practice; HTTP pages get marked "not secure".
- Core Web Vitals: LCP ≤ 2.5 s, INP < 200 ms, CLS < 0.1 (measure via Search Console CWV report / PageSpeed Insights). Speed and stability are rewarded, but relevance still wins — CWV perfection isn't an SEO shortcut.
- Mobile-first: Google indexes the mobile version; content parity is mandatory.
- JavaScript: rendered by an evergreen Chromium — but use meaningful HTTP codes, History API (no #fragments), proper canonical injection, lazy-loaded content visible in viewport testing, unique metadata per route.
- Interstitials that obscure content hurt both users and indexing — use small banners; age gates should let verified Googlebot through or overlay (not redirect).
- Indexable file types include HTML, PDF, images, video — but text in HTML is always the safest carrier of meaning; text in images/video is invisible.`,

  audit: `AUDIT METHOD (derived strictly from Google Search Central priorities — score each area and cite the guideline it comes from):
1. INDEXABILITY: pages crawlable (robots.txt, meaningful status codes, crawlable <a href> links, no orphans), sitemap present and clean, canonicals consistent, HTTPS everywhere, mobile parity.
2. TITLES & SNIPPETS: unique descriptive <title> + meta description on every page; no boilerplate/duplication; one dominant H1 matching intent.
3. CONTENT QUALITY (the heaviest factor): people-first vs search-engine-first test; originality and first-hand experience; completeness per topic; E-E-A-T visibility (bylines, about, sources); no cannibalization; up-to-date.
4. ARCHITECTURE & LINKS: logical hubs, every important page internally linked with descriptive anchors, no doorway city pages, breadcrumbs, clean descriptive URLs.
5. LOCAL PRESENCE: Business Profile completeness (categories, hours, photos, services, review count/rating/velocity, owner responses), NAP consistency, LocalBusiness/Organization/Breadcrumb markup, per-location pages that earn their place.
6. PAGE EXPERIENCE: CWV thresholds, no intrusive interstitials, ads not interfering, content distinguishable.
7. STRUCTURED DATA: valid, visible-content-matching markup for the applicable types; Rich Results eligibility.
8. COMPETITIVE POSITION: who actually ranks for the money queries, what they cover that the site doesn't (content gaps), what the site can do that they can't (differentiation) — recommend covering gaps ONLY with people-first, expert content, never mass-produced pages.
Always: report findings with severity, the specific Google guideline behind each, and the concrete fix. Never invent data not present in the crawl/SERP/profile inputs; say plainly when something wasn't measured.`,
};

/* compose a guideline block for a prompt: the core + chosen deep topics */
export function seoGuideBlock(...topics) {
  const parts = [SEO_CORE];
  for (const t of topics) if (SEO_TOPICS[t]) parts.push(SEO_TOPICS[t]);
  return parts.join("\n\n");
}
