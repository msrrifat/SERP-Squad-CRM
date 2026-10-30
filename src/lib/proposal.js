/* =====================================================================
   PROPOSAL TEMPLATE — the data behind Company Settings → Proposal template.

   A proposal is a client-facing document: a cover page, the services on
   offer (Local SEO · Ads campaign · Website design & development), the
   investment, how reporting works, what access is needed, and a detailed
   work checklist in parts (Month 01, 02, 03 …) whose rows carry an
   optional quantity. Stored on the company:

     company.proposals = [{ id, no, title, clientId, business, preparedFor,
       preparedBy, contact, date, validUntil, accent, intro, services[],
       checklists[], reporting[], access[], closing, showSignature,
       createdAt, updatedAt }]
     company.proposalTemplate = the parts a NEW proposal starts from
       (services, checklists, reporting, access, intro, closing) once the
       agency has saved its own version; otherwise the built-ins below.

   Checklist rows: { id, text, qty, details[] } — an empty qty prints as a
   check mark, a value ("8–15", "20", "All pages") prints as the quantity.
   ===================================================================== */

export const uid = (p = "x") => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const SERVICE_META = {
  seo: { label: "SEO", icon: "search" },
  ads: { label: "Ads Campaign", icon: "megaphone" },
  web: { label: "Website Design & Development", icon: "layout" },
};

const bullets = (arr) => arr.map(([title, text]) => ({ id: uid("b"), title, text }));

export const DEFAULT_SERVICES = () => [
  {
    id: "seo", key: "seo", enabled: true,
    title: "Local SEO",
    tagline: "Show up first when people nearby search for your services.",
    price: "$500 / month", priceNote: "Month to month, cancel anytime",
    bullets: bullets([
      ["Google Business Profile", "Optimized and managed every month: posts, photos, Q&A, review replies and accurate business details."],
      ["Website SEO", "Service and location pages, blog posts, schema markup, speed and mobile fixes."],
      ["Listings & citations", "Consistent name, address and phone across the directories that matter in your industry."],
      ["Backlinks", "White-hat links from relevant, authoritative sources that strengthen your site."],
      ["Technical SEO", "Search Console and Analytics set up, indexing issues fixed, site health watched."],
      ["Monthly reporting", "A call plus rankings, profile views, website clicks and a local heat-map."],
    ]),
  },
  {
    id: "ads", key: "ads", enabled: true,
    title: "Ads Campaign",
    tagline: "Paid traffic that turns into calls and bookings from the first week.",
    price: "From $300 / month + ad spend", priceNote: "Ad spend is paid directly to the platform",
    bullets: bullets([
      ["Campaign setup", "Google Search, Local Services and Meta ads built around your services and service area."],
      ["Keyword & audience research", "Target high-intent searches and exclude the clicks that waste budget."],
      ["Ads & landing pages", "Ad copy and pages matched to each service so more visitors convert."],
      ["Conversion tracking", "Calls, forms and bookings tracked end to end, so every dollar is accounted for."],
      ["Ongoing optimization", "Bids, budgets, ads and audiences tuned every week."],
      ["Monthly report", "Spend, leads, cost per lead and the plan for next month."],
    ]),
  },
  {
    id: "web", key: "web", enabled: true,
    title: "Website Design & Development",
    tagline: "A fast, modern website built to rank and to convert visitors into customers.",
    price: "From $1,500 one-time", priceNote: "Hosting and care plan available",
    bullets: bullets([
      ["Custom design", "Mobile-first, on brand and easy to navigate."],
      ["Service & location pages", "Structured for local search from day one."],
      ["Lead capture", "Click-to-call, enquiry forms and booking integrations."],
      ["Speed & security", "Optimized hosting, SSL, backups and regular updates."],
      ["SEO-ready", "Clean structure, schema markup and analytics installed."],
      ["Complimentary care", "Content updates, plugin updates and small design tweaks included with SEO."],
    ]),
  },
];

const task = (text, qty = "", details = []) => ({ id: uid("t"), text, qty, details });
const group = (title, tasks) => ({ id: uid("g"), title, tasks });

const POSTS = (n) => task("GBP updates / post creation", n, ["Posts with images", "Keyword targeting", "150–200 words per post", "Copyright-free images"]);
const IMAGES = task("Image sharing", "10+", ["Geo-tagged", "Title optimized", "ALT text optimized", "Image keywords optimized"]);
const PAGES = (n) => task("Service / silo / location pages", n, ["800–1000+ words of service content", "Keyword and image optimization", "GBP map embedding", "Schema / structured data"]);
const BLOG = task("or, blog posts publishing", "", ["800–1000+ words", "2–3 images per post", "Internal linking", "Keyword targeting"]);
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

export const DEFAULT_CHECKLISTS = () => [
  {
    id: uid("p"), title: "Month 01", subtitle: "Setup, research and foundation", serviceKey: "seo",
    groups: [
      group("Initial research & planning", [
        task("Google Search Console setup"), task("Google Analytics setup"),
        task("Local heat-map setup", "10–20 keywords"), task("Google Looker Studio setup"),
        task("Keyword research and mapping"),
        task("Niche research: the terms that matter for the website and GBP (semantic SEO)"),
        task("Competitor GBP research"), task("Competitor website research"),
        task("Business listings research"), task("Competitor backlinks research"),
      ]),
      group("GBP optimization", [
        task("Name & description optimization"), task("Service area optimization"),
        task("Categories & subcategories optimization"), task("Services & descriptions optimization"),
        task("Products & descriptions optimization"), task("Q&A", "1–2"),
        task("NAP consistency check"), POSTS("8–15"), IMAGES,
        task("Holiday hours and availability updates"), task("Review responding"),
      ]),
      group("Website on-page SEO", [
        task("Website SEO audit"), task("Location optimization"), task("GBP map embedding into the website"),
        task("Header menu optimization"), task("Footer menu optimization"), task("Structured data on the homepage"),
        task("About page optimization"), task("Contact page optimization"),
        PAGES("5+"), BLOG, task("Technical optimization"),
      ]),
      CITATIONS(),
      group("Off-page SEO", [task("Social profile backlinks", "10"), task("Social signals"), task("Backlinks indexing")]),
      REPORTING(),
    ],
  },
  {
    id: uid("p"), title: "Month 02", subtitle: "Re-optimization and growth", serviceKey: "seo",
    groups: [
      group("Research", [
        task("Search Console keywords: re-optimize the website and GBP"),
        task("Business Profile dashboard keywords: re-optimize the website and GBP"),
      ]),
      group("GBP optimization", [
        task("Re-optimize the Business Profile for new keywords"), task("Q&A", "1–2"), POSTS("12"), IMAGES,
        task("Holiday hours and availability updates"), task("Review responding"),
      ]),
      group("Social media activity (Facebook, Instagram, YouTube)", [
        task("Publishing posts on Facebook, Instagram and YouTube", "12", ["The GBP posts, re-optimized with NAP, links and hashtags", "Keyword targeting", "150–200 words per post", "Copyright-free images"]),
      ]),
      group("Website on-page SEO", [
        task("Re-optimize website content with new Search Console keywords"),
        task("Meta titles and descriptions", "All pages"), task("Location optimization"),
        task("GBP map embedding into service pages"), task("Image optimization", "All images"),
        task("Structured data on service pages", "10"), task("Page title (H1) optimization", "All pages"),
        PAGES("5"), BLOG, task("Technical optimization"),
      ]),
      CITATIONS(),
      group("Off-page SEO", [
        task("Social profile backlinks", "10"), task("Video backlinks (YouTube, Vimeo, Dailymotion)", "3"),
        task("Google entity stack backlinks", "10"), task("Adding links to schema for indexing"), task("Backlinks indexing"),
      ]),
      REPORTING(),
    ],
  },
  {
    id: uid("p"), title: "Month 03", subtitle: "Authority and expansion", serviceKey: "seo",
    groups: [
      group("Research", [
        task("Search Console keywords: re-optimize the website and GBP"),
        task("Business Profile dashboard keywords: re-optimize the website and GBP"),
      ]),
      group("GBP optimization", [
        task("Re-optimize the Business Profile for new keywords"), task("Q&A", "1–2"), POSTS("12"), IMAGES,
        task("Holiday hours and availability updates"), task("Review responding"),
      ]),
      group("Social media activity (Facebook, Instagram, YouTube)", [
        task("Publishing posts on Facebook, Instagram and YouTube", "12", ["The GBP posts, re-optimized with NAP, links and hashtags", "Keyword targeting", "150–200 words per post", "Copyright-free images"]),
      ]),
      group("Website on-page SEO", [
        task("Re-optimize website content with new Search Console keywords"),
        task("H2, H3 and H4 heading optimization", "All pages"), task("Internal linking and anchor text planning"),
        task("Structured data on service / location pages", "10+"),
        PAGES("5"), BLOG, task("Technical optimization"),
      ]),
      CITATIONS(),
      group("Off-page SEO", [
        task("Social profile backlinks", "20"), task("Web 2.0 backlinks with the map embedded", "5"),
        task("Article submissions", "2"), task("Other backlinks: forums, social bookmarking", "20"),
        task("Adding links to schema for indexing"), task("Backlinks indexing"),
      ]),
      REPORTING(),
    ],
  },
];

export const DEFAULT_REPORTING = () => [
  "Monthly phone call to discuss performance, insights and strategy adjustments",
  "Profile views: how many people viewed your Google Business Profile",
  "Website visits and clicks generated from your listing",
  "Google local and organic rankings for your keywords",
  "Local heat-map report: visibility across different parts of your city",
];
export const DEFAULT_ACCESS = () => [
  "Google Business Profile access",
  "Website access (for service pages and blog posts)",
  "Google Search Console and Analytics access",
  "Yelp and other listing logins you already have",
  "Service photos for pages, posts and backlinks",
];
export const DEFAULT_INTRO = "Here is how we would grow your business online: what is included, what it costs and exactly what gets done each month.";
export const DEFAULT_CLOSING = "Work items and quantities may be adjusted as the strategy develops; anything that changes is agreed with you first.";

const clone = (v) => JSON.parse(JSON.stringify(v));

/* a fresh proposal from the agency's saved template (or the built-ins) */
export function blankProposal(company, clients, tpl = null) {
  const t = tpl || company?.proposalTemplate || null;
  const today = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const c = clients?.[0] || null;
  const n = (company?.proposals || []).length + 1;
  const owner = (company?.team || []).find((m) => m.isOwner) || (company?.team || [])[0];
  return {
    id: uid("pp"),
    no: `P-${today.getFullYear()}-${String(n).padStart(3, "0")}`,
    title: "Local SEO & Marketing Proposal",
    clientId: c?.id || "",
    business: c?.companyName || c?.name || "",
    preparedFor: c?.contact || "",
    preparedBy: owner?.name || company?.name || "",
    contact: [company?.appDomain, owner?.email].filter(Boolean).join(" · "),
    date: iso(today),
    validUntil: iso(new Date(today.getTime() + 30 * 86400000)),
    accent: company?.accent || "#1F2A44",
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
