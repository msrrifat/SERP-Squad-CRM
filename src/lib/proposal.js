/* =====================================================================
   PROPOSAL TEMPLATE — the data behind Company Settings → Proposal template.

   A proposal is sent to a PROSPECT (not yet a client): a cover page, the
   services on offer (Local SEO · Ads campaign · Website design &
   development), the investment, how reporting works, what access is
   needed, and a detailed work checklist in parts (Month 01, 02, 03 …)
   whose rows carry an optional quantity. Stored on the company:

     company.proposals = [{ id, no, title, business, niche, preparedFor,
       preparedBy, contact, date, validUntil, accent, intro, services[],
       checklists[], reporting[], access[], closing, showSignature,
       createdAt, updatedAt }]
     company.proposalTemplate = the parts a NEW proposal starts from
       (services, checklists, reporting, access, intro, closing) once the
       agency has saved its own version; otherwise the built-ins below.

   A service can offer several PACKAGES (Basic $500 · Growth $900 …): each
   package has its own price, points and checklist parts, and the document
   compares them side by side. `packagesOf(service)` returns them, falling
   back to the service's own price/points as a single package for proposals
   saved before packages existed. A checklist part names its package with
   `packageId` (empty = every package of that service).

   Every text may use {business} and {niche}: the document fills them from
   the sidebar, so renaming the brand or the niche updates every line.
   Checklist rows: { id, text, qty, details[] } — an empty qty prints as a
   check mark, a value ("8–15", "20", "All pages") prints as the quantity.
   ===================================================================== */

export const uid = (p = "x") => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* the agency's website brand colour (serpsquad.com) — the cover default */
export const BRAND_BLUE = "#2b7ff0";
export const AGENCY_SITE = "serpsquad.com";

/* {business} / {niche} → the proposal's values (sensible words when empty) */
export function fill(text, d) {
  if (text == null) return "";
  const business = (d?.business || "").trim() || "your business";
  const niche = (d?.niche || "").trim() || "local service";
  const website = String(d?.website || "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "") || "your website";
  return String(text).replace(/\{business\}/gi, business).replace(/\{niche\}/gi, niche).replace(/\{website\}/gi, website);
}

const bullets = (arr) => arr.map(([title, text]) => ({ id: uid("b"), title, text }));

export const DEFAULT_SERVICES = () => [
  {
    id: "seo", key: "seo", enabled: true,
    title: "Local SEO",
    tagline: "Put {business} in front of people searching for {niche} services nearby.",
    price: "", priceNote: "", bullets: [],
    packages: [
      {
        id: "seo-basic", name: "Basic", price: "$500 / month", priceNote: "Month to month, cancel anytime",
        bullets: bullets([
          ["Google Business Profile", "Optimized and managed every month: posts, photos, Q&A, review replies and accurate details for {business}."],
          ["Website SEO", "{niche} service and location pages, schema markup, speed and mobile fixes."],
          ["Blog posts", "5 keyword-targeted articles a month, 800–1000+ words each."],
          ["Listings & citations", "Consistent name, address and phone across the directories that matter for {niche} businesses."],
          ["Backlinks", "White-hat links from relevant, authoritative sources that strengthen the site."],
          ["Technical SEO", "Search Console and Analytics set up, indexing issues fixed, site health watched."],
          ["Monthly reporting", "A call plus rankings, profile views, website clicks and a local heat-map."],
        ]),
      },
      {
        id: "seo-growth", name: "Growth", price: "$900 / month", priceNote: "Month to month, cancel anytime",
        bullets: bullets([
          ["Google Business Profile", "Optimized and managed every month: posts, photos, Q&A, review replies and accurate details for {business}."],
          ["Website SEO", "{niche} service and location pages, schema markup, speed and mobile fixes."],
          ["Blog posts", "8 keyword-targeted articles a month, 800–1000+ words each."],
          ["Listings & citations", "Consistent name, address and phone across the directories that matter for {niche} businesses."],
          ["Backlinks", "White-hat links from relevant, authoritative sources that strengthen the site."],
          ["Technical SEO", "Search Console and Analytics set up, indexing issues fixed, site health watched."],
          ["Monthly reporting", "A call plus rankings, profile views, website clicks and a local heat-map."],
          ["Guest posting", "4 guest posts a month on {niche}-related sites with 15+ domain authority and 500+ organic visits."],
          ["Social media management", "Facebook, YouTube, Instagram, LinkedIn, X, Pinterest, Threads, TikTok and Bluesky: 3 posts a week on each."],
          ["Social content creation", "Keyword-optimized captions, images and graphics made for every post."],
        ]),
      },
    ],
  },
  {
    id: "ads", key: "ads", enabled: true,
    title: "Ads Campaign",
    tagline: "Paid traffic that turns into {niche} calls and bookings from the first week.",
    price: "From $300 / month + ad spend", priceNote: "Ad spend is paid directly to the platform",
    bullets: bullets([
      ["Campaign setup", "Google Search, Local Services and Meta ads built around {business}'s services and service area."],
      ["Keyword & audience research", "Target high-intent {niche} searches and exclude the clicks that waste budget."],
      ["Ads & landing pages", "Ad copy and pages matched to each service so more visitors convert."],
      ["Conversion tracking", "Calls, forms and bookings tracked end to end, so every dollar is accounted for."],
      ["Ongoing optimization", "Bids, budgets, ads and audiences tuned every week."],
      ["Monthly report", "Spend, leads, cost per lead and the plan for next month."],
    ]),
  },
  {
    id: "web", key: "web", enabled: true,
    title: "Website Design & Development",
    tagline: "A fast, modern website for {business} built to rank and to turn visitors into customers.",
    price: "From $1,500 one-time", priceNote: "Hosting and care plan available",
    bullets: bullets([
      ["Custom design", "Mobile-first, on brand and easy to navigate."],
      ["Service & location pages", "Every {niche} service structured for local search from day one."],
      ["Lead capture", "Click-to-call, enquiry forms and booking integrations."],
      ["Speed & security", "Optimized hosting, SSL, backups and regular updates."],
      ["SEO-ready", "Clean structure, schema markup and analytics installed."],
      ["Complimentary care", "Content updates, plugin updates and small design tweaks included with SEO."],
    ]),
  },
];

/* a service's packages; a service without any is its own single package */
export const packagesOf = (s) => (Array.isArray(s?.packages) && s.packages.length
  ? s.packages
  : [{ id: `${s?.id || "svc"}-std`, name: "", price: s?.price || "", priceNote: s?.priceNote || "", bullets: s?.bullets || [], single: true }]);

const task = (text, qty = "", details = []) => ({ id: uid("t"), text, qty, details });
const group = (title, tasks) => ({ id: uid("g"), title, tasks });

const POSTS = (n) => task("GBP updates / post creation", n, ["Posts with images", "Keyword targeting", "150–200 words per post", "Copyright-free images"]);
const IMAGES = () => task("Image sharing", "10+", ["Geo-tagged", "Title optimized", "ALT text optimized", "Image keywords optimized"]);
const PAGES = (n) => task("Service / silo / location pages", n, ["800–1000+ words of {niche} service content", "Keyword and image optimization", "GBP map embedding", "Schema / structured data"]);
const BLOG = () => task("or, blog posts publishing", "", ["800–1000+ words", "2–3 images per post", "Internal linking", "Keyword targeting"]);
const CITATIONS = () => group("Citation management", [
  task("Citations / local directory audit"),
  task("Local citations / business directories", "20", ["SEO-optimized business details and descriptions", "NAP, logo and cover image", "Hours, phone numbers and website", "Social media links", "Service and supporting images"]),
  task("Indexing the citations"),
]);
const REPORTING = () => group("Monthly reporting", [
  task("Monthly phone call"),
  task("Profile views and website clicks from your Business Profile"),
  task("Google local / organic rankings for your keywords"),
  task("Local heat-map report"),
  task("Google Search Console report"),
]);

/* the three SEO months for one package: Basic (5 articles, no social
   media) or Growth (8 articles, guest posts, social media on 9 platforms) */
const GUEST = () => group("Guest posting", [
  task("Guest posts on {niche}-related websites", "4", ["15+ domain authority", "500+ organic visits a month", "Same or related niche", "800+ words, keyword-targeted", "Do-follow link to the website"]),
]);
const SOCIAL = () => group("Social media management", [
  task("Posts on Facebook, YouTube, Instagram, LinkedIn, X, Pinterest, Threads, TikTok and Bluesky", "3 / week each", ["Keyword-optimized captions", "Images and graphics for every post", "NAP, links and hashtags", "Scheduled and published for you"]),
  task("Profile optimization on every platform", "9 platforms"),
  task("Comment and message monitoring"),
]);
const seoMonths = (packageId, growth) => [
  {
    id: uid("p"), packageId, title: "Month 01", subtitle: "Setup, research and foundation for {business}", serviceKey: "seo",
    groups: [
      group("Initial research & planning", [
        task("Google Search Console setup"), task("Google Analytics setup"),
        task("Local heat-map setup", "10–20 keywords"), task("Google Looker Studio setup"),
        task("Keyword research and mapping"),
        task("Niche research: the {niche} terms that matter for the website and GBP (semantic SEO)"),
        task("Competitor GBP research"), task("Competitor website research"),
        task("Business listings research"), task("Competitor backlinks research"),
      ]),
      group("GBP optimization", [
        task("Name & description optimization"), task("Service area optimization"),
        task("Categories & subcategories optimization"), task("Services & descriptions optimization"),
        task("Products & descriptions optimization"), task("Q&A", "1–2"),
        task("NAP consistency check"), POSTS("8–15"), IMAGES(),
        task("Holiday hours and availability updates"), task("Review responding"),
      ]),
      group("Website on-page SEO", [
        task("Website SEO audit"), task("Location optimization"), task("GBP map embedding into the website"),
        task("Header menu optimization"), task("Footer menu optimization"), task("Structured data on the homepage"),
        task("About page optimization"), task("Contact page optimization"),
        PAGES(growth ? "8" : "5"), BLOG(), task("Technical optimization"),
      ]),
      CITATIONS(),
      ...(growth ? [GUEST(), SOCIAL()] : []),
      group("Off-page SEO", [task("Social profile backlinks", "10"), task("Social signals"), task("Backlinks indexing")]),
      REPORTING(),
    ],
  },
  {
    id: uid("p"), packageId, title: "Month 02", subtitle: "Re-optimization and growth", serviceKey: "seo",
    groups: [
      group("Research", [
        task("Search Console keywords: re-optimize the website and GBP"),
        task("Business Profile dashboard keywords: re-optimize the website and GBP"),
      ]),
      group("GBP optimization", [
        task("Re-optimize the Business Profile for new keywords"), task("Q&A", "1–2"), POSTS("12"), IMAGES(),
        task("Holiday hours and availability updates"), task("Review responding"),
      ]),
      group("Website on-page SEO", [
        task("Re-optimize website content with new Search Console keywords"),
        task("Meta titles and descriptions", "All pages"), task("Location optimization"),
        task("GBP map embedding into service pages"), task("Image optimization", "All images"),
        task("Structured data on service pages", "10"), task("Page title (H1) optimization", "All pages"),
        PAGES(growth ? "8" : "5"), BLOG(), task("Technical optimization"),
      ]),
      CITATIONS(),
      ...(growth ? [GUEST(), SOCIAL()] : []),
      group("Off-page SEO", [
        task("Social profile backlinks", "10"), task("Video backlinks (YouTube, Vimeo, Dailymotion)", "3"),
        task("Google entity stack backlinks", "10"), task("Adding links to schema for indexing"), task("Backlinks indexing"),
      ]),
      REPORTING(),
    ],
  },
  {
    id: uid("p"), packageId, title: "Month 03", subtitle: "Authority and expansion", serviceKey: "seo",
    groups: [
      group("Research", [
        task("Search Console keywords: re-optimize the website and GBP"),
        task("Business Profile dashboard keywords: re-optimize the website and GBP"),
      ]),
      group("GBP optimization", [
        task("Re-optimize the Business Profile for new keywords"), task("Q&A", "1–2"), POSTS("12"), IMAGES(),
        task("Holiday hours and availability updates"), task("Review responding"),
      ]),
      group("Website on-page SEO", [
        task("Re-optimize website content with new Search Console keywords"),
        task("H2, H3 and H4 heading optimization", "All pages"), task("Internal linking and anchor text planning"),
        task("Structured data on service / location pages", "10+"),
        PAGES(growth ? "8" : "5"), BLOG(), task("Technical optimization"),
      ]),
      CITATIONS(),
      ...(growth ? [GUEST(), SOCIAL()] : []),
      group("Off-page SEO", [
        task("Social profile backlinks", "20"), task("Web 2.0 backlinks with the map embedded", "5"),
        task("Article submissions", "2"), task("Other backlinks: forums, social bookmarking", "20"),
        task("Adding links to schema for indexing"), task("Backlinks indexing"),
      ]),
      REPORTING(),
    ],
  },
];
export const DEFAULT_CHECKLISTS = () => [...seoMonths("seo-basic", false), ...seoMonths("seo-growth", true)];

export const DEFAULT_REPORTING = () => [
  "Monthly phone call to discuss performance, insights and strategy adjustments",
  "Profile views: how many people viewed your Google Business Profile",
  "Website visits and clicks generated from your listing",
  "Google local and organic rankings for your {niche} keywords",
  "Local heat-map report: visibility across different parts of your service area",
];
export const DEFAULT_ACCESS = () => [
  "Google Business Profile access",
  "Website access (for service pages and blog posts)",
  "Google Search Console and Analytics access",
  "Yelp and other listing logins you already have",
  "Service photos for pages, posts and backlinks",
];
export const DEFAULT_INTRO = "Here is how we would grow {business} online: what is included, what it costs and exactly what gets done each month.";
export const DEFAULT_CLOSING = "Work items and quantities may be adjusted as the strategy for {business} develops; anything that changes is agreed with you first.";

const clone = (v) => JSON.parse(JSON.stringify(v));

/* the agency's public site for the contact line: never the app's own host */
export const agencySite = (company) => {
  const d = String(company?.website || company?.appDomain || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!d || /^app\./.test(d) || /localhost|127\.0\.0\.1/.test(d)) return AGENCY_SITE;
  return d;
};

/* a fresh proposal from the agency's saved template (or the built-ins) */
export function blankProposal(company, tpl = null) {
  const t = tpl || company?.proposalTemplate || null;
  const today = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const n = (company?.proposals || []).length + 1;
  const owner = (company?.team || []).find((m) => m.isOwner) || (company?.team || [])[0];
  return {
    id: uid("pp"),
    no: `P-${today.getFullYear()}-${String(n).padStart(3, "0")}`,
    title: "Local SEO & Marketing Proposal for {business}",
    business: "", niche: "", website: "", preparedFor: "",
    preparedBy: owner?.name || company?.name || "",
    contact: [agencySite(company), owner?.email].filter(Boolean).join(" · "),
    date: iso(today),
    validUntil: iso(new Date(today.getTime() + 30 * 86400000)),
    accent: BRAND_BLUE,
    intro: t?.intro ?? DEFAULT_INTRO,
    services: t?.services ? clone(t.services) : DEFAULT_SERVICES(),
    checklists: t?.checklists ? clone(t.checklists) : DEFAULT_CHECKLISTS(),
    reporting: t?.reporting ? clone(t.reporting) : DEFAULT_REPORTING(),
    access: t?.access ? clone(t.access) : DEFAULT_ACCESS(),
    closing: t?.closing ?? DEFAULT_CLOSING,
    showSignature: true,
    createdAt: Date.now(),
  };
}

/* the reusable parts of a proposal, saved as the agency's template */
export const templateOf = (d) => clone({ intro: d.intro, services: d.services, checklists: d.checklists, reporting: d.reporting, access: d.access, closing: d.closing });

export const fmtLongDate = (iso) => {
  if (!iso) return "";
  const [y, m, dd] = String(iso).split("-").map(Number);
  if (!y) return String(iso);
  return new Date(y, m - 1, dd).toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" });
};

/* ---- AI editing: the editable part of a proposal, and a careful merge of
   what the model sends back (ids kept, shapes checked, nothing else touched) */
export const EDITABLE_KEYS = ["title", "intro", "services", "checklists", "reporting", "access", "closing"];
export const editableOf = (d) => Object.fromEntries(EDITABLE_KEYS.map((k) => [k, d[k]]));

const str = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));
const strList = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : null);
export function mergeAiEdit(d, patch) {
  if (!patch || typeof patch !== "object") return d;
  const out = { ...d };
  if (typeof patch.title === "string") out.title = patch.title;
  if (typeof patch.intro === "string") out.intro = patch.intro;
  if (typeof patch.closing === "string") out.closing = patch.closing;
  if (strList(patch.reporting)) out.reporting = strList(patch.reporting);
  if (strList(patch.access)) out.access = strList(patch.access);
  const bulletsOf = (v) => (Array.isArray(v) ? v : []).filter((b) => b && typeof b === "object").map((b) => ({ id: str(b.id) || uid("b"), title: str(b.title), text: str(b.text) }));
  if (Array.isArray(patch.services)) {
    out.services = patch.services.filter((s) => s && typeof s === "object").map((s, i) => ({
      id: str(s.id) || d.services?.[i]?.id || uid("s"), key: str(s.key) || d.services?.[i]?.key || "seo",
      enabled: s.enabled !== false, title: str(s.title), tagline: str(s.tagline), price: str(s.price), priceNote: str(s.priceNote),
      bullets: bulletsOf(s.bullets),
      ...(Array.isArray(s.packages) ? { packages: s.packages.filter((p) => p && typeof p === "object").map((p) => ({ id: str(p.id) || uid("pk"), name: str(p.name), price: str(p.price), priceNote: str(p.priceNote), bullets: bulletsOf(p.bullets) })) } : {}),
    }));
  }
  if (Array.isArray(patch.checklists)) {
    out.checklists = patch.checklists.filter((p) => p && typeof p === "object").map((p) => ({
      id: str(p.id) || uid("p"), title: str(p.title), subtitle: str(p.subtitle), serviceKey: str(p.serviceKey) || "seo", packageId: str(p.packageId),
      groups: (Array.isArray(p.groups) ? p.groups : []).filter((g) => g && typeof g === "object").map((g) => ({
        id: str(g.id) || uid("g"), title: str(g.title),
        tasks: (Array.isArray(g.tasks) ? g.tasks : []).filter((t) => t && typeof t === "object").map((t) => ({ id: str(t.id) || uid("t"), text: str(t.text), qty: str(t.qty), details: strList(t.details) || [] })),
      })),
    }));
  }
  return out;
}
