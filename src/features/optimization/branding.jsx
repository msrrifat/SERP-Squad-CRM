import React, { useMemo, useState } from "react";
import {
  Building2, Calendar, CheckCircle2, ChevronRight, Globe, ImagePlus, Link2, Lock,
  MapPin, Plus, RefreshCw, Rocket, Search, Send, Share2, Trash2, Upload, X, Zap,
} from "lucide-react";
import { Card, CharCount, Labeled, OAuthButton, Seg, Toggle, inputCls } from "../../ui/primitives.jsx";
import { fmtTs2 } from "../../lib/format.jsx";
import { hashStr, mulberry32 } from "../../lib/rng.js";
import { CITY_DATA } from "../../lib/geo.js";
import { isoDate } from "../../lib/months.jsx";
import { SOCIAL_COLORS, SOCIAL_ICONS, SocialOptTab, photoThumb } from "./studio.jsx";

/* ================= Branding & Automation =================
   Off-page SEO hub: branded Web 2.0 properties + automated content
   distribution. The link-building model is the classic tiered brand wheel:
   branded article sites and social profiles all link to the money site and
   the GBP, and cross-link each other — brand-anchor heavy, never spun.

   Platform policy: ONLY platforms with a real automation surface are listed.
   Anything without a public publishing API is explicitly excluded below —
   no fake integrations. */
export const WEB2_PLATFORMS = [
  { key: "wordpress", name: "WordPress.com", api: "REST API v2 · OAuth2", creds: "WordPress.com OAuth app (Client ID + Secret) — added in Company Settings → API settings; brand account authorized per client" },
  { key: "blogger", name: "Blogger", api: "Blogger API v3 · Google OAuth", creds: "Reuses your Google Cloud OAuth app from API settings (blogger scope)" },
  { key: "tumblr", name: "Tumblr", api: "Tumblr API · OAuth 1.0a", creds: "Tumblr consumer key + secret — added in Company Settings → API settings" },
  { key: "ghost", name: "Ghost", api: "Admin API · JWT", creds: "Admin API key of the brand's Ghost(Pro) or self-hosted instance — pasted here" },
  { key: "hashnode", name: "Hashnode", api: "GraphQL API · PAT", creds: "Personal access token of the brand account — pasted here" },
  { key: "devto", name: "DEV.to", api: "Forem REST API · API key", creds: "API key from the brand account's settings — pasted here" },
  { key: "wix", name: "Wix Blog", api: "Wix REST · API key", creds: "Wix Headless API key + site ID — pasted here" },
];
/* Evaluated and excluded (no automation surface): Medium (API retired),
   Substack, Site123, Jimdo, Weebly (post-Square), Google Sites. */
const BRAND_PAGES = ["About", "Contact", "Terms of Service", "Privacy & Data Policy", "Sitemap"];
const BRAND_CATS = ["News", "Blog"];

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/* ---------- campaign topic engine (deterministic, geo/audience aware) ---------- */
const bestTime = (audience, local) => {
  const a = (audience || "").toLowerCase();
  if (/professional|business|b2b/.test(a)) return "7:30 AM";
  if (/parent|famil/.test(a)) return "8:00 PM";
  if (/student|young/.test(a)) return "6:00 PM";
  return local ? "8:30 AM" : "10:00 AM";
};
export function genCampaignTopics(campaign, brand, variant = 0) {
  const r = mulberry32(hashStr(campaign.id + "|" + campaign.niche + "|" + variant));
  const geo = campaign.strategy === "local"
    ? (campaign.geo.cities.length ? campaign.geo.cities : [campaign.geo.country])
    : [campaign.geo.country || "the country"];
  const niche = (campaign.niche || "your services").split(/[,.\n]/)[0].trim().toLowerCase();
  const aud = (campaign.audience || "local customers").split(/[,.\n]/)[0].trim().toLowerCase();
  const year = new Date().getFullYear();
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const srcQuestions = (campaign.sources || []).map((src) => {
    const qs = [
      `is ${niche} worth it`, `how to choose ${niche}`, `${niche} red flags to avoid`,
      `${niche} cost breakdown`, `diy vs professional ${niche}`,
    ];
    return { src, q: pick(qs) };
  });
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const blog = [
    () => `The complete ${niche} guide for ${pick(geo)} (${year})`,
    () => `How much does ${niche} cost in ${pick(geo)}? Real ${year} prices`,
    () => `7 questions ${aud} ask about ${niche} — answered by ${brand}`,
    () => `Choosing a ${niche} provider in ${pick(geo)}: what locals should know`,
    () => `${cap(niche)} myths ${aud} still believe`,
    () => `Why ${pick(geo)} ${aud} are switching to ${brand} for ${niche}`,
  ];
  const news = [
    () => `${brand} expands ${niche} availability across ${pick(geo)}`,
    () => `${cap(niche)} trends in ${pick(geo)} this quarter — what changed`,
    () => `New ${niche} technology arrives in ${pick(geo)}: what it means for ${aud}`,
    () => `${brand} announces same-week ${niche} appointments in ${pick(geo)}`,
  ];
  const base = campaign.contentType === "news" ? news : blog;
  const count = Math.max(3, Math.min(20, +campaign.topicCount || 8));
  const titles = [];
  for (let i = 0; i < count; i++) titles.push(base[(i + variant) % base.length]());
  srcQuestions.slice(0, Math.max(1, Math.floor(count / 4))).forEach(({ src, q }) => titles.push(`"${cap(q)}?" — what ${src} keeps asking (expert answer)`));

  const cadence = Math.max(1, +campaign.cadenceDays || 3);
  const time = bestTime(campaign.audience, campaign.strategy === "local");
  const start = new Date(); start.setDate(start.getDate() + 1);
  return [...new Set(titles)].slice(0, count).map((title, i) => {
    const d = new Date(start); d.setDate(d.getDate() + i * cadence);
    // shift weekends to the next Tuesday — engagement dead-zones for local intent
    if (d.getDay() === 0) d.setDate(d.getDate() + 2);
    if (d.getDay() === 6) d.setDate(d.getDate() + 3);
    return { id: "tp" + hashStr(campaign.id + title), title, date: isoDate(d), time, selected: i < 4, status: "draft" };
  });
}

/* ---------- brand property registry (the link vault) ----------
   Families of URLs every campaign links to. Off-page fundamentals: entity
   consistency (same NAP + brand URL everywhere), branded/partial anchors,
   and a tight link wheel between properties, the money site and the GBP. */
export const MAIN_PROPERTIES = [
  ["website", "Business website"],
  ["gbpShare", "Google Business Profile — share link"],
  ["gbpCid", "Google Business Profile — CID link"],
  ["gbpReview", "Google Business Profile — review link"],
  ["bing", "Bing Places link"],
  ["apple", "Apple Maps link"],
];
export const MAIN_SOCIALS = [
  ["fb", "Facebook"], ["ig", "Instagram"], ["li", "LinkedIn"], ["x", "X (Twitter)"],
  ["yt", "YouTube"], ["tt", "TikTok"], ["pin", "Pinterest"],
];
/* secondary = a second account per network — same platforms as the main list */
export const SECONDARY_SOCIALS = MAIN_SOCIALS.map(([k, name]) => [k, name]);
/* 54 business directories, tiered the way citation audits tier them.
   DA values approximate Moz domain authority — they drive scan priority. */
export const BIZ_DIRECTORIES = [
  // Tier 1 — the national heavyweights every local business needs
  { name: "Yelp", domain: "yelp.com", tier: 1, da: 93 }, { name: "Yellow Pages", domain: "yellowpages.com", tier: 1, da: 91 },
  { name: "BBB", domain: "bbb.org", tier: 1, da: 92 }, { name: "Foursquare", domain: "foursquare.com", tier: 1, da: 92 },
  { name: "TripAdvisor", domain: "tripadvisor.com", tier: 1, da: 93 }, { name: "Angi", domain: "angi.com", tier: 1, da: 89 },
  { name: "MapQuest", domain: "mapquest.com", tier: 1, da: 92 }, { name: "Nextdoor", domain: "nextdoor.com", tier: 1, da: 91 },
  { name: "Manta", domain: "manta.com", tier: 1, da: 85 }, { name: "Superpages", domain: "superpages.com", tier: 1, da: 84 },
  { name: "Chamber of Commerce", domain: "chamberofcommerce.com", tier: 1, da: 82 }, { name: "DexKnows", domain: "dexknows.com", tier: 1, da: 80 },
  { name: "Citysearch", domain: "citysearch.com", tier: 1, da: 80 }, { name: "Local.com", domain: "local.com", tier: 1, da: 78 },
  { name: "Hotfrog", domain: "hotfrog.com", tier: 1, da: 75 }, { name: "MerchantCircle", domain: "merchantcircle.com", tier: 1, da: 76 },
  { name: "Yellowbook", domain: "yellowbook.com", tier: 1, da: 74 }, { name: "411.com", domain: "411.com", tier: 1, da: 76 },
  { name: "WhitePages", domain: "whitepages.com", tier: 1, da: 88 }, { name: "Alignable", domain: "alignable.com", tier: 1, da: 77 },
  // Tier 2 — solid general citations
  { name: "Brownbook", domain: "brownbook.net", tier: 2, da: 68 }, { name: "Cylex", domain: "cylex.us.com", tier: 2, da: 66 },
  { name: "EZlocal", domain: "ezlocal.com", tier: 2, da: 65 }, { name: "ShowMeLocal", domain: "showmelocal.com", tier: 2, da: 64 },
  { name: "GoLocal247", domain: "golocal247.com", tier: 2, da: 58 }, { name: "iBegin", domain: "ibegin.com", tier: 2, da: 60 },
  { name: "Tupalo", domain: "tupalo.co", tier: 2, da: 61 }, { name: "2FindLocal", domain: "2findlocal.com", tier: 2, da: 62 },
  { name: "n49", domain: "n49.com", tier: 2, da: 59 }, { name: "Yalwa", domain: "yalwa.com", tier: 2, da: 57 },
  { name: "Hub.biz", domain: "hub.biz", tier: 2, da: 55 }, { name: "eLocal", domain: "elocal.com", tier: 2, da: 63 },
  { name: "LocalStack", domain: "localstack.com", tier: 2, da: 54 }, { name: "City-Data", domain: "city-data.com", tier: 2, da: 81 },
  { name: "YellowBot", domain: "yellowbot.com", tier: 2, da: 58 }, { name: "Judy's Book", domain: "judysbook.com", tier: 2, da: 57 },
  { name: "Storeboard", domain: "storeboard.com", tier: 2, da: 56 }, { name: "Cybo", domain: "cybo.com", tier: 2, da: 60 },
  { name: "Opendi", domain: "opendi.us", tier: 2, da: 55 }, { name: "SaleSpider", domain: "salespider.com", tier: 2, da: 58 },
  { name: "Bizapedia", domain: "bizapedia.com", tier: 2, da: 62 }, { name: "Fyple", domain: "fyple.com", tier: 2, da: 52 },
  { name: "Enroll Business", domain: "enrollbusiness.com", tier: 2, da: 53 }, { name: "Spoke", domain: "spoke.com", tier: 2, da: 61 },
  // Niche & vertical — matched to the business category at scan time
  { name: "Houzz", domain: "houzz.com", tier: 3, da: 90 }, { name: "Thumbtack", domain: "thumbtack.com", tier: 3, da: 87 },
  { name: "Porch", domain: "porch.com", tier: 3, da: 79 }, { name: "HomeAdvisor", domain: "homeadvisor.com", tier: 3, da: 88 },
  { name: "Healthgrades", domain: "healthgrades.com", tier: 3, da: 89 }, { name: "Zocdoc", domain: "zocdoc.com", tier: 3, da: 85 },
  { name: "Avvo", domain: "avvo.com", tier: 3, da: 84 }, { name: "Expertise.com", domain: "expertise.com", tier: 3, da: 72 },
  { name: "OpenTable", domain: "opentable.com", tier: 3, da: 90 }, { name: "Crunchbase", domain: "crunchbase.com", tier: 3, da: 91 },
];
export const LISTING_DIRECTORIES = BIZ_DIRECTORIES.map((d) => d.name); // kept for link-target ids

/* per-directory profile URL the scanner produces on a hit */
const listingUrl = (dir, slug, city) => {
  const special = {
    "Yelp": `https://www.yelp.com/biz/${slug}`, "Yellow Pages": `https://www.yellowpages.com/${city}/${slug}`,
    "BBB": `https://www.bbb.org/us/profile/${slug}`, "Foursquare": `https://foursquare.com/v/${slug}`,
    "Nextdoor": `https://nextdoor.com/pages/${slug}`, "MapQuest": `https://www.mapquest.com/us/${city}/${slug}`,
  };
  return special[dir.name] || `https://www.${dir.domain}/biz/${slug}`;
};

/* resolve a selected link-target id ("main:website", "soc:fb", …) to href + anchor pool */
export function resolveLinkTarget(id, props, brand, website) {
  const soc = props.socials || {}, sec = props.secondary || {}, lst = props.listings || {};
  const P = { // [href, [anchor options]]
    "main:website": [props.website || "https://" + website, [brand, "visit " + brand, "our official website"]],
    "main:gbpShare": [props.gbpShare, ["find " + brand + " on Google", "our Google Business Profile"]],
    "main:gbpCid": [props.gbpCid, ["our Google listing"]],
    "main:gbpReview": [props.gbpReview, ["read our verified Google reviews", "see what customers say"]],
    "main:bing": [props.bing, ["find us on Bing Places"]],
    "main:apple": [props.apple, ["find us on Apple Maps"]],
  };
  MAIN_SOCIALS.forEach(([k, name]) => { P["soc:" + k] = [soc[k], ["follow " + brand + " on " + name]]; });
  SECONDARY_SOCIALS.forEach(([k, name]) => { P["sec:" + k] = [sec[k], [brand + " on " + name]]; });
  Object.keys(lst).forEach((name) => { P["list:" + name] = [lst[name], [brand + " on " + name]]; });
  const w2 = props.web2 || {};
  WEB2_PLATFORMS.forEach((pl) => { P["web2:" + pl.key] = [w2[pl.key], [brand + " on " + pl.name, "our " + pl.name + " blog"]]; });
  if (id.startsWith("custom:")) {
    const rows = Object.values(props.custom || {}).flat();
    const row = rows.find((x) => "custom:" + x.id === id);
    return row && row.url ? { href: row.url, anchors: [row.name || brand, brand + " — " + (row.name || "link")] } : null;
  }
  const hit = P[id];
  return hit && hit[0] ? { href: hit[0], anchors: hit[1] } : null;
}

/* ---------- word counting + hashtags ---------- */
const WORDS = (x) => (x || "").trim().split(/\s+/).filter(Boolean).length;
export const blocksWordCount = (blocks = []) => blocks.reduce((n, b) => {
  if (b.kind === "heading" || b.kind === "text") return n + WORDS(b.text);
  if (b.kind === "list") return n + (b.items || []).reduce((x, it) => x + WORDS(it), 0);
  return n;
}, 0);
export function genHashtags(c, brand) {
  const nw = (c.niche || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3).slice(0, 3);
  const cities = (c.geo.cities || []).slice(0, 2).map((x) => x.replace(/\s+/g, "").toLowerCase());
  return [...new Set([
    "#trending", "#viral", "#fyp",
    ...nw.map((w) => "#" + w),
    "#" + brand.replace(/[^a-z0-9]/gi, "").toLowerCase(),
    ...cities.map((ct) => "#" + ct), ...cities.map((ct) => "#" + ct + "local"),
    "#nearme", "#local" + (nw[0] || "business"),
  ])].slice(0, 12);
}

/* ---------- content generators: real block structures ----------
   News: 100–120 words + trending/related/viral/local hashtags.
   Blog: minimum 700 words, auto internal-linked to the selected properties. */
export function genTopicBlocks(t, c, brand, website, props, media) {
  let seq = 0;
  const bid = () => "cb" + hashStr(t.id) + "_" + seq++;
  const r = mulberry32(hashStr("content|" + t.id + "|" + (c.variant || 0)));
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const niche = (c.niche || "your services").split(/[,.\n]/)[0].trim().toLowerCase();
  const aud = (c.audience || "local customers").split(/[,.\n]/)[0].trim().toLowerCase();
  const place = c.strategy === "local" ? (c.geo.cities[0] || c.geo.country) : c.geo.country;
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const H = (text) => ({ id: bid(), kind: "heading", level: 2, text });
  const T = (text, links = []) => ({ id: bid(), kind: "text", text, links });
  const L = (items) => ({ id: bid(), kind: "list", items });

  if (c.contentType === "news") {
    let para = `${brand} has news for ${aud} in ${place}: ${niche} is now easier to access than ever, with same-week availability and fully transparent pricing published up front. The team reports growing demand across ${place}, driven by ${aud} comparing options online before booking. Anyone considering ${niche} can check live availability, browse real before-and-after results and read verified reviews before making a decision. Local demand is expected to keep climbing this quarter, so early booking is recommended — appointments are released every morning and the most popular slots go fast each week.`;
    // hard 100–120 window: pad with rotating filler sentences, then trim
    const fillers = [
      `Availability updates are posted daily on the ${brand} profile.`,
      `Walk-in consultations run on select weekdays across ${place}.`,
      `Seasonal offers rotate monthly — ask when booking.`,
      `Full pricing is published openly on the ${brand} website.`,
    ];
    let fi = 0;
    while (para.split(/\s+/).filter(Boolean).length < 102) { para += " " + fillers[fi % fillers.length]; fi++; }
    const trimmed = para.split(/\s+/).filter(Boolean).slice(0, 118).join(" ");
    return [T(trimmed), { id: bid(), kind: "hashtags", tags: genHashtags(c, brand) }];
  }

  /* ---- blog: structured long-form ---- */
  const blocks = [
    T(`If you've been searching for ${niche} in ${place}, you're in good company — it's one of the most researched local services among ${aud} this year. But the difference between a great outcome and a disappointing one usually comes down to a handful of details most first-timers never think to check. This guide walks through all of them, based on what we see every week working with real customers across ${place}.`),
    T(`${cap(aud)} usually start with a simple search and end up with dozens of tabs open, comparing claims that all sound the same. Below we break down what actually separates providers: qualifications, transparent pricing, realistic timelines and the questions worth asking before you commit to anything.`),
    H(`Why ${niche} matters more than ${aud} think`),
    T(`${cap(niche)} isn't just a cosmetic decision — done right, it affects confidence, comfort and long-term costs. The most common regret we hear from ${aud} isn't about price; it's about waiting too long or choosing purely on the cheapest quote. A provider who explains trade-offs honestly will save you money over any multi-year horizon.`),
    T(`${c.topicGuide ? cap(c.topicGuide.toLowerCase()) + " — that's the editorial standard this guide follows." : "Every recommendation below is backed by real local cases."} Nothing here is theory: it reflects the patterns we see across hundreds of ${place} customers each year.`),
    H(`What does ${niche} cost in ${place}?`),
    T(`Pricing varies more than most people expect, and the spread usually comes from five factors rather than quality alone. Before comparing quotes, make sure each one itemizes the same things — otherwise you're comparing apples to oranges. Here's what drives the differences:`),
    L([
      `Scope — a partial treatment can cost half as much as a comprehensive plan`,
      `Materials & technology — newer methods cost more up front but often last longer`,
      `Experience — senior specialists price higher and re-do less`,
      `Location — ${place} pricing runs above the national average, but promotions are common`,
      `Aftercare — the cheapest quote often excludes follow-ups that others include`,
    ]),
    H(`How to choose the right provider`),
    T(`Start with verification: check credentials, look at recent (not curated) results and read the newest reviews rather than the overall score. Then talk to them — a ten-minute conversation reveals more than an hour of website reading. You're listening for straight answers about risks, timelines and what happens if something doesn't go to plan.`),
    T(`Ask specifically: How many of these do you do each month? What does the quote exclude? What's your policy if I'm not satisfied? Reputable providers answer these without hesitation. Evasive answers on any of the three are your cue to keep looking, no matter how attractive the price is.`),
  ];
  if (c.strategy === "local" && c.geo.cities.length) {
    blocks.push(H(`Local notes for ${c.geo.cities.slice(0, 3).join(", ")}`));
    blocks.push(T(`${c.geo.cities.map((ct) => `${ct}: demand for ${niche} peaks early in the week, so mid-week appointments are easiest to get.`).join(" ")} Parking, transit access and evening hours differ by location — worth checking before you book, especially if you're coming from outside the immediate area.`));
  }
  if (media.length) blocks.push({ id: bid(), kind: "image", mediaId: pickMediaFor(t, media) });
  blocks.push(H(`Frequently asked questions`));
  blocks.push(T(`How long does it take? Most ${niche} plans complete within weeks, not months — your provider should give you a written timeline. Does insurance help? Sometimes partially; ask for the billing codes up front and check before committing. Is it painful or disruptive? Modern approaches are dramatically gentler than the procedures ${aud} remember hearing about years ago.`));
  const closing = T(`Ready to take the next step? ${brand} serves ${aud} across ${place} with transparent pricing and same-week availability.`);
  blocks.push(closing);

  /* pad to the 700-word floor with substantive paragraphs */
  const padPool = [
    `A note on timing: ${niche} demand in ${place} is seasonal, and the best providers book out weeks ahead during peak months. If you're planning around an event or deadline, work backwards from that date and add buffer for a consultation, any preparatory work and at least one follow-up visit.`,
    `One more thing ${aud} often overlook: maintenance. The results of ${niche} last dramatically longer with simple upkeep, and the total cost of ownership matters more than the sticker price. Ask every provider for their maintenance recommendations in writing and factor that into your comparison.`,
    `Red flags worth taking seriously: pressure to decide on the spot, quotes that change after you commit, no written treatment plan, and reviews that mention surprise charges. None of these are deal-breakers alone, but two or more together tell you everything you need to know.`,
  ];
  const leadIns = ["", "Another angle worth considering: ", "From our experience with local customers: ", "A detail that separates good providers from great ones: "];
  let pi = 0;
  while (blocksWordCount(blocks) < 700) { // hard floor — the 700-word rule is guaranteed at generation time
    blocks.splice(blocks.length - 2, 0, T(leadIns[Math.floor(pi / padPool.length) % leadIns.length] + padPool[pi % padPool.length]));
    pi++;
  }

  /* auto internal links to the selected brand properties */
  const textBlocks = blocks.filter((b) => b.kind === "text");
  (c.linkTargets || []).forEach((tid, i) => {
    const lt = resolveLinkTarget(tid, props || {}, brand, website);
    if (!lt) return;
    const anchor = lt.anchors[i % lt.anchors.length];
    const target = textBlocks[(i + 1) % textBlocks.length];
    const sentence = pick([` Learn more: ${anchor}.`, ` For details, ${anchor}.`, ` You can also ${anchor}.`]);
    target.text += sentence;
    target.links = [...(target.links || []), { id: "lk" + hashStr(tid + t.id), phrase: anchor, href: lt.href }];
  });
  return blocks;
}

export const pickMediaFor = (t, media) => {
  if (!media.length) return null;
  const byTag = media.find((m) => m.tag && t.title.toLowerCase().includes(m.tag.toLowerCase()));
  return (byTag || media[hashStr(t.id) % media.length]).id;
};

/* ================= the tab ================= */
export function BrandingOptTab({ opt, setOpt, accent, log, project, company }) {
  const br = opt.branding || { media: [], sites: {}, campaigns: [] };
  const set = (patch) => setOpt("branding", patch);
  const [sub, setSub] = useState("properties");
  const brandName = opt.gbp?.bizName || project.name;

  const SUBS = [
    ["properties", "Brand properties & connectors", Link2],
    ["media", "Project Media", ImagePlus],
    ["campaigns", "Automation campaigns", Zap],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {SUBS.map(([key, label, Icon]) => (
          <button key={key} onClick={() => setSub(key)}
            className="flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold"
            style={sub === key ? { background: accent + "10", borderColor: accent, color: accent } : { background: "var(--chip-bg, #fff)", borderColor: "#E5E7EB", color: "var(--chip-fg, #4B5563)" }}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {sub === "properties" && <PropertiesTab br={br} set={set} accent={accent} project={project} opt={opt} setOpt={setOpt} log={log} brandName={brandName} />}
      {sub === "media" && <MediaTab br={br} set={set} accent={accent} />}
      {sub === "campaigns" && <CampaignsTab br={br} set={set} accent={accent} log={log} project={project} brandName={brandName} opt={opt} />}
    </div>
  );
}

/* ---------------- Brand properties — the link vault ---------------- */
function CustomLinks({ fam, br, set, accent }) {
  const rows = ((br.properties || {}).custom || {})[fam] || [];
  const save = (next) => set((cur) => ({ properties: { ...(cur.properties || {}), custom: { ...((cur.properties || {}).custom || {}), [fam]: next } } }));
  return (
    <div className="space-y-1.5 border-t border-gray-50 pt-2">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-2">
          <input value={row.name} onChange={(e) => save(rows.map((x) => (x.id === row.id ? { ...x, name: e.target.value } : x)))}
            placeholder="Name" className={"w-36 shrink-0 " + inputCls} />
          <input value={row.url} onChange={(e) => save(rows.map((x) => (x.id === row.id ? { ...x, url: e.target.value } : x)))}
            placeholder="https://…" className={"ll-mono flex-1 " + inputCls} />
          <button onClick={() => save(rows.filter((x) => x.id !== row.id))} className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
        </div>
      ))}
      <button onClick={() => save([...rows, { id: "cl" + Date.now(), name: "", url: "" }])}
        className="rounded-lg border border-dashed border-gray-300 px-2.5 py-1 text-[10.5px] font-medium text-gray-400 hover:border-gray-400 hover:text-gray-600">
        + Add custom link
      </button>
    </div>
  );
}

/* connect-only social rows — the composer lives in Automation campaigns */
function SocialConnectors({ accounts, onPatch, accent, log, title, note }) {
  const [editId, setEditId] = useState(null);
  const patchAcc = (id, p) => onPatch(accounts.map((x) => (x.id === id ? { ...x, ...p } : x)));
  return (
    <Card className="space-y-2 p-5">
      <div className="ll-display text-[14px] font-semibold">{title}</div>
      <div className="text-[11.5px] text-gray-400">{note}</div>
      {accounts.map((a) => {
        const Icon = SOCIAL_ICONS[a.id] || Globe;
        const editing = editId === a.id;
        return (
          <div key={a.id} className="rounded-xl border border-gray-100">
            <div className="flex items-center gap-2.5 px-3 py-2.5">
              <Icon size={16} style={{ color: a.connected ? SOCIAL_COLORS[a.id] || "#374151" : "#C7CDD8" }} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-gray-800">{a.platform}</div>
                <div className="ll-mono truncate text-[10.5px] text-gray-400">{a.connected ? `${a.handle} · ${a.name}` : "Not connected"}</div>
              </div>
              {a.connected && (
                <button onClick={() => setEditId(editing ? null : a.id)} className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-500 hover:border-gray-300">
                  {editing ? "Close" : "Edit info"}
                </button>
              )}
              <OAuthButton label="Connect" accent={accent} connected={a.connected}
                onDone={() => { patchAcc(a.id, { connected: true, handle: a.handle || "@yourhandle", name: a.name || a.platform }); log?.(`Connected ${a.platform}`, ""); }}
                onDisconnect={() => patchAcc(a.id, { connected: false })} />
            </div>
            {editing && a.connected && (
              <div className="ll-fade grid gap-2 border-t border-gray-50 p-3 sm:grid-cols-2">
                <Labeled label="Display name"><input value={a.name} onChange={(e) => patchAcc(a.id, { name: e.target.value })} className={inputCls} /></Labeled>
                <Labeled label="Handle"><input value={a.handle} onChange={(e) => patchAcc(a.id, { handle: e.target.value })} className={"ll-mono " + inputCls} /></Labeled>
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}

function PropertiesTab({ br, set, accent, project, opt, setOpt, log, brandName }) {
  const [mode, setMode] = useState("connectors"); // "connectors" | "properties"
  /* secondary accounts: same networks, second profile — created lazily */
  const secondaryAccounts = br.secondarySocial || MAIN_SOCIALS.map(([k, name]) => ({ id: k, platform: name + " (2nd)", connected: false, handle: "", name: "" }));
  const props = br.properties || {};
  const patchProps = (p) => set((cur) => ({ properties: { ...(cur.properties || {}), ...p } }));
  const patchFam = (fam, key, val) => set((cur) => ({ properties: { ...(cur.properties || {}), [fam]: { ...((cur.properties || {})[fam] || {}), [key]: val } } }));
  const filled = (fam) => Object.values(props[fam] || {}).filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* connectors ↔ properties switch */}
      <div className="flex gap-1.5">
        {[["connectors", "Connectors", Share2], ["properties", "Properties", Link2]].map(([key, label, Icon]) => (
          <button key={key} onClick={() => setMode(key)}
            className="flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold"
            style={mode === key ? { background: accent + "10", borderColor: accent, color: accent } : { background: "var(--chip-bg, #fff)", borderColor: "#E5E7EB", color: "var(--chip-fg, #4B5563)" }}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {mode === "connectors" && (
        <div className="space-y-4">
          <Card className="flex items-start gap-2.5 p-4">
            <Share2 size={15} className="mt-0.5 shrink-0 text-gray-400" />
            <div className="text-[11.5px] leading-relaxed text-gray-500">
              <b className="text-gray-700">Connectors.</b> Authorize the accounts and platforms campaigns publish to — social profiles
              (main + secondary) and the Web 2.0 article sites. Composing happens in Automation campaigns; connected channels appear
              there automatically as publish destinations.
            </div>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <SocialConnectors accounts={opt.social?.accounts || []} accent={accent} log={log}
              title="Main social profiles" note="Your brand's primary accounts — OAuth per platform."
              onPatch={(next) => setOpt("social", { accounts: next })} />
            <SocialConnectors accounts={secondaryAccounts} accent={accent} log={log}
              title="Secondary social profiles" note="Second accounts on the same networks — location pages, brand alts."
              onPatch={(next) => set({ secondarySocial: next })} />
          </div>
          <div>
            <div className="ll-display mb-2 text-[14px] font-semibold">Article submission connectors</div>
            <SitesTab br={br} set={set} accent={accent} log={log} project={project} brandName={brandName} opt={opt} />
          </div>
        </div>
      )}

      {mode === "properties" && (
      <div className="space-y-4">
      <Card className="flex items-start gap-2.5 p-4">
        <Link2 size={15} className="mt-0.5 shrink-0 text-gray-400" />
        <div className="text-[11.5px] leading-relaxed text-gray-500">
          <b className="text-gray-700">The link vault.</b> Every URL here becomes a linkable target for campaign content — select which ones
          in each campaign's "Link target properties". Consistent entity signals (same brand, same links, everywhere) are the backbone of
          off-page SEO; blog content links out with branded and partial-match anchors, never spammy exact-match walls.
        </div>
      </Card>

      <Card className="space-y-2.5 p-5">
        <div className="ll-display text-[14px] font-semibold">Main properties</div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {MAIN_PROPERTIES.map(([key, label]) => (
            <Labeled key={key} label={label}>
              <input value={props[key] || (key === "website" ? "https://" + project.website : "")}
                onChange={(e) => patchProps({ [key]: e.target.value })}
                placeholder={key === "website" ? "https://" + project.website : "Paste the " + label.toLowerCase() + "…"}
                className={"ll-mono " + inputCls} />
            </Labeled>
          ))}
        </div>
        <CustomLinks fam="main" br={br} set={set} accent={accent} />
      </Card>

      <Card className="space-y-2.5 p-5">
        <div className="ll-display flex items-center gap-2 text-[14px] font-semibold">Main social profiles
          <span className="ll-mono rounded-full bg-gray-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-gray-500">{filled("socials")}/{MAIN_SOCIALS.length}</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {MAIN_SOCIALS.map(([k, name]) => {
            const I = SOCIAL_ICONS[k];
            return (
              <div key={k} className="flex items-center gap-2">
                <I size={16} className="shrink-0" style={{ color: SOCIAL_COLORS[k] }} />
                <input value={(props.socials || {})[k] || ""} onChange={(e) => patchFam("socials", k, e.target.value)}
                  placeholder={name + " profile URL"} className={"ll-mono flex-1 " + inputCls} />
              </div>
            );
          })}
        </div>
        <CustomLinks fam="socials" br={br} set={set} accent={accent} />
      </Card>

      <Card className="space-y-2.5 p-5">
        <div className="ll-display flex items-center gap-2 text-[14px] font-semibold">Secondary social media
          <span className="ll-mono rounded-full bg-gray-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-gray-500">{filled("secondary")}/{SECONDARY_SOCIALS.length}</span>
          <span className="text-[10px] font-normal text-gray-400">second accounts on the same networks — location pages, brand alts</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {SECONDARY_SOCIALS.map(([k, name]) => {
            const I = SOCIAL_ICONS[k];
            return (
              <div key={k} className="flex items-center gap-2">
                <I size={16} className="shrink-0" style={{ color: SOCIAL_COLORS[k] }} />
                <input value={(props.secondary || {})[k] || ""} onChange={(e) => patchFam("secondary", k, e.target.value)}
                  placeholder={name + " — secondary profile URL"} className={"ll-mono flex-1 " + inputCls} />
              </div>
            );
          })}
        </div>
        <CustomLinks fam="secondary" br={br} set={set} accent={accent} />
      </Card>

      {/* ---- business listings: populated by the Business Listings scanner (left rail) ---- */}
      <Card className="space-y-2.5 p-5">
        <div className="ll-display flex items-center gap-2 text-[14px] font-semibold">Business listings
          <span className="ll-mono rounded-full bg-gray-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-gray-500">{filled("listings")} linked</span>
        </div>
        {filled("listings") === 0 ? (
          <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-[11.5px] text-gray-500">
            No listings linked yet — run the <b>Business Listings</b> scanner (left sidebar) and every listing it finds appears here automatically, ready to use as a campaign link target.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(props.listings || {}).filter(([, url]) => url).map(([name, url]) => (
              <div key={name} className="flex items-center gap-2">
                <span className="flex w-28 shrink-0 items-center gap-1 truncate text-[11.5px] font-medium text-gray-600">
                  <CheckCircle2 size={10} className="shrink-0 text-emerald-500" /> {name}
                </span>
                <input value={url} onChange={(e) => patchFam("listings", name, e.target.value)} className={"ll-mono flex-1 " + inputCls} />
              </div>
            ))}
          </div>
        )}
        <CustomLinks fam="listings" br={br} set={set} accent={accent} />
      </Card>

      <Card className="space-y-2.5 p-5">
        <div className="ll-display flex items-center gap-2 text-[14px] font-semibold">Article submission & Web 2.0 properties
          <span className="ll-mono rounded-full bg-gray-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-gray-500">{Object.values(props.web2 || {}).filter(Boolean).length}/{WEB2_PLATFORMS.length}</span>
        </div>
        <div className="text-[11px] text-gray-400">Branded sites created via the connectors fill in automatically; paste any existing Web 2.0 property manually.</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {WEB2_PLATFORMS.map((pl) => {
            const auto = (br.sites || {})[pl.key]?.siteUrl ? "https://" + br.sites[pl.key].siteUrl : "";
            return (
              <div key={pl.key} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate text-[11.5px] font-medium text-gray-600">{pl.name}</span>
                <input value={(props.web2 || {})[pl.key] ?? auto} onChange={(e) => patchFam("web2", pl.key, e.target.value)}
                  placeholder={pl.name + " property URL"} className={"ll-mono flex-1 " + inputCls} />
              </div>
            );
          })}
        </div>
        <CustomLinks fam="web2" br={br} set={set} accent={accent} />
      </Card>
      </div>
      )}
    </div>
  );
}

/* ---------------- Media library ---------------- */
function MediaTab({ br, set, accent }) {
  return (
    <Card className="space-y-2.5 p-5">
      <div className="ll-display text-[15px] font-semibold">Campaign media library</div>
      <div className="text-[11.5px] text-gray-400">Upload service photos, team shots and brand graphics once — the automation engine pulls a matching image for every social post and article it publishes.</div>
      <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {br.media.map((m) => (
          <div key={m.id} className="group relative overflow-hidden rounded-xl border border-gray-100 bg-white">
            <img src={m.dataUrl || photoThumb(m.name)} alt={m.name} className="aspect-[4/3] w-full object-cover" />
            <div className="px-2 py-1.5">
              <input value={m.tag || ""} placeholder="Tag: e.g. whitening, team…"
                onChange={(e) => set({ media: br.media.map((x) => (x.id === m.id ? { ...x, tag: e.target.value } : x)) })}
                className="w-full border-0 bg-transparent text-[10.5px] text-gray-500 outline-none" />
            </div>
            <button onClick={() => set({ media: br.media.filter((x) => x.id !== m.id) })}
              className="absolute right-1.5 top-1.5 rounded-md bg-black/40 p-1 text-white opacity-0 hover:bg-red-500 group-hover:opacity-100"><Trash2 size={12} /></button>
          </div>
        ))}
        {br.media.length === 0 && <div className="col-span-full py-6 text-center text-[11.5px] text-gray-300">No media yet — upload the first images below. Tag them so campaigns pick the right image per topic.</div>}
      </div>
      <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 py-2.5 text-[12px] font-medium text-gray-400 hover:border-gray-400 hover:text-gray-600">
        <Upload size={13} /> Upload campaign media
        <input type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => {
            [...(e.target.files || [])].forEach((f) => {
              const rd = new FileReader();
              rd.onload = () => set((cur) => ({ media: [...(cur.media || []), { id: "md" + Date.now() + Math.random().toString(36).slice(2, 4), name: f.name, tag: "", addedAt: Date.now(), dataUrl: rd.result }] }));
              rd.readAsDataURL(f);
            });
            e.target.value = "";
          }} />
      </label>
    </Card>
  );
}

/* ---------------- Web 2.0 article sites ---------------- */
function SitesTab({ br, set, accent, log, project, brandName, opt }) {
  const [credDraft, setCredDraft] = useState({});
  const [provisioning, setProvisioning] = useState(null); // { key, step }
  const siteState = (k) => br.sites[k] || {};
  const patchSite = (k, p) => set((cur) => ({ sites: { ...(cur.sites || {}), [k]: { ...(cur.sites || {})[k], ...p } } }));

  const connect = (pl) => {
    const cred = (credDraft[pl.key] || "").trim();
    if (!cred) return;
    patchSite(pl.key, { connected: true, credential: cred.slice(0, 4) + "••••••", connectedAt: Date.now() });
    setCredDraft((d) => ({ ...d, [pl.key]: "" }));
    log?.(`Connected ${pl.name} for automation`, project.name);
  };
  const PROVISION_STEPS = [
    "Creating the branded site", "Uploading logo & brand name", "Creating categories (News, Blog)",
    "Generating About, Contact, Terms, Privacy & Data Policy pages", "Publishing sitemap page & submitting XML sitemap",
    "Linking to main website, GBP & social profiles",
  ];
  const createSite = (pl) => {
    setProvisioning({ key: pl.key, step: 0 });
    // PROD: sequential API calls per platform (site/blog create → media upload →
    // taxonomy → static pages → sitemap ping). Simulated with staged progress.
    PROVISION_STEPS.forEach((_, i) => setTimeout(() => {
      setProvisioning((p) => (p && p.key === pl.key ? { ...p, step: i + 1 } : p));
      if (i === PROVISION_STEPS.length - 1) {
        const host = { wordpress: "wordpress.com", blogger: "blogspot.com", tumblr: "tumblr.com", ghost: "ghost.io", hashnode: "hashnode.dev", devto: "dev.to", wix: "wixsite.com" }[pl.key];
        const siteUrl = pl.key === "devto" ? `dev.to/${slugify(brandName)}` : `${slugify(brandName)}.${host}`;
        patchSite(pl.key, { siteCreated: true, createdAt: Date.now(), siteUrl, pages: BRAND_PAGES, categories: BRAND_CATS });
        set((cur) => ({ properties: { ...(cur.properties || {}), web2: { ...((cur.properties || {}).web2 || {}), [pl.key]: "https://" + siteUrl } } }));
        setProvisioning(null);
        log?.(`Provisioned branded site on ${pl.name}`, project.name);
      }
    }, 600 * (i + 1)));
  };

  return (
    <div className="space-y-4">
      <Card className="flex items-start gap-2.5 p-4">
        <Link2 size={15} className="mt-0.5 shrink-0 text-gray-400" />
        <div className="text-[11.5px] leading-relaxed text-gray-500">
          <b className="text-gray-700">The brand wheel:</b> every branded site below gets your logo, name, About/Contact/Terms/Privacy
          pages and News + Blog categories — then links to <b>{project.website}</b>, your <b>Google Business Profile</b> and your social
          profiles with brand-name anchors. Campaign posts cross-link the wheel. Only platforms with a real publishing API are listed.
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        {WEB2_PLATFORMS.map((pl) => {
          const st = siteState(pl.key);
          const prov = provisioning?.key === pl.key ? provisioning : null;
          return (
            <Card key={pl.key} className="space-y-2 p-4">
              <div className="flex items-center gap-2">
                <div className="text-[13.5px] font-semibold">{pl.name}</div>
                <span className="ll-mono rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-semibold text-gray-500">{pl.api}</span>
                <span className="ml-auto rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase"
                  style={st.siteCreated ? { background: "#DCFCE7", color: "#166534" } : st.connected ? { background: "#DBEAFE", color: "#1E40AF" } : { background: "#F1F5F9", color: "#64748B" }}>
                  {st.siteCreated ? "Site live" : st.connected ? "Connected" : "Not connected"}
                </span>
              </div>
              <div className="text-[10.5px] leading-relaxed text-gray-400"><b className="text-gray-500">Credentials needed:</b> {pl.creds}</div>
              {!st.connected && (
                <div className="flex gap-1.5">
                  <input value={credDraft[pl.key] || ""} onChange={(e) => setCredDraft((d) => ({ ...d, [pl.key]: e.target.value }))}
                    placeholder="Paste credential / token" type="password" className={"ll-mono flex-1 " + inputCls} />
                  <button onClick={() => connect(pl)} disabled={!(credDraft[pl.key] || "").trim()}
                    className="rounded-lg px-3 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>Connect</button>
                </div>
              )}
              {st.connected && !st.siteCreated && !prov && (
                <button onClick={() => createSite(pl)} className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12px] font-semibold text-white" style={{ background: accent }}>
                  <Rocket size={12} /> Create branded site
                </button>
              )}
              {prov && (
                <div className="space-y-1 rounded-lg bg-gray-50 p-2.5">
                  {PROVISION_STEPS.map((step, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[10.5px]" style={{ color: i < prov.step ? "#16A34A" : i === prov.step ? "#1E40AF" : "#C3CAD6" }}>
                      {i < prov.step ? <CheckCircle2 size={11} /> : i === prov.step ? <RefreshCw size={11} className="animate-spin" /> : <span className="inline-block h-[11px] w-[11px] rounded-full border border-gray-200" />}
                      {step}
                    </div>
                  ))}
                </div>
              )}
              {st.siteCreated && (
                <div className="space-y-1.5 rounded-lg bg-emerald-50/60 p-2.5 text-[10.5px] text-emerald-800">
                  <div className="ll-mono font-semibold">https://{st.siteUrl}</div>
                  <div>Pages: {st.pages.join(" · ")} — Categories: {st.categories.join(", ")}</div>
                  <div className="flex flex-wrap gap-1">
                    {["→ " + project.website, "→ Google Business Profile", "→ social profiles"].map((l) => (
                      <span key={l} className="rounded bg-white px-1.5 py-0.5 text-[9.5px] font-medium text-emerald-700">{l}</span>
                    ))}
                  </div>
                  <button onClick={() => patchSite(pl.key, { siteCreated: false, connected: false, credential: null })} className="text-[10px] text-emerald-600/70 hover:text-red-500">Disconnect</button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

    </div>
  );
}

/* ---------------- Automation campaigns ---------------- */
const COUNTRY_LIST = Object.keys(CITY_DATA);
function CampaignsTab({ br, set, accent, log, project, brandName, opt }) {
  const [openId, setOpenId] = useState(null);
  const campaigns = br.campaigns || [];
  const patchCampaign = (id, p) => set((cur) => ({ campaigns: (cur.campaigns || []).map((c) => (c.id === id ? { ...c, ...(typeof p === "function" ? p(c) : p) } : c)) }));
  const create = () => {
    const c = {
      id: "cp" + Date.now(), name: `${brandName} — content campaign`, createdAt: Date.now(),
      strategy: "local", geo: { country: "United States", states: [], cities: [] }, niche: "", audience: "",
      step: 0, cadenceDays: 3, topicGuide: "", contentType: "blog", topicCount: 8, sources: [], sourceDraft: "",
      topics: null, variant: 0, contents: {}, channels: [], linkTargets: ["main:website", "main:gbpShare"], launched: false,
    };
    set((cur) => ({ campaigns: [c, ...(cur.campaigns || [])] }));
    setOpenId(c.id);
  };
  const open = campaigns.find((c) => c.id === openId);

  if (open) return <CampaignWizard c={open} patch={(p) => patchCampaign(open.id, p)} onBack={() => setOpenId(null)}
    accent={accent} log={log} project={project} brandName={brandName} br={br} opt={opt} />;

  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="ll-display text-[15px] font-semibold">Automation campaigns</div>
          <div className="text-[11.5px] text-gray-400">Brand info + SEO strategy in, a scheduled multi-platform publishing queue out — articles on your Web 2.0 sites, posts on your socials, all cross-linked to {project.website} and your GBP.</div>
        </div>
        <button onClick={create} className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-white" style={{ background: accent }}>
          <Plus size={13} /> New campaign
        </button>
      </div>
      {campaigns.map((c) => {
        const sel = (c.topics || []).filter((t) => t.selected);
        return (
          <button key={c.id} onClick={() => setOpenId(c.id)} className="flex w-full items-center gap-3 rounded-xl border border-gray-100 p-3 text-left hover:border-gray-200">
            <Zap size={15} style={{ color: c.launched ? "#16A34A" : "#9CA3AF" }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-gray-800">{c.name}</span>
              <span className="block text-[10.5px] text-gray-400">
                Created {fmtTs2(c.createdAt)} · {c.strategy === "local" ? `Local SEO — ${c.geo.cities.slice(0, 2).join(", ") || c.geo.country}` : `National SEO — ${c.geo.country}`}
                {c.launched ? ` · ${sel.length} posts scheduled` : ` · step ${Math.min(c.step + 1, 4)} of 4`}
              </span>
            </span>
            <span className="rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase" style={c.launched ? { background: "#DCFCE7", color: "#166534" } : { background: "#FEF3C7", color: "#92400E" }}>
              {c.launched ? "Active" : "Draft"}
            </span>
            <ChevronRight size={14} className="text-gray-300" />
          </button>
        );
      })}
      {campaigns.length === 0 && <div className="py-5 text-center text-[12px] text-gray-300">No campaigns yet — create the first one.</div>}
    </Card>
  );
}

function StepBox({ n, title, done, active, children }) {
  return (
    <Card className={"p-4 " + (!active && !done ? "opacity-45" : "")}>
      <div className="mb-2 flex items-center gap-2">
        <span className="ll-mono flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: done ? "#16A34A" : active ? "#1E40AF" : "#C3CAD6" }}>
          {done ? "✓" : n}
        </span>
        <span className="text-[13px] font-semibold text-gray-800">{title}</span>
      </div>
      {(active || done) && children}
    </Card>
  );
}

/* ---------------- campaign block editor — a real blog editor ----------------
   Headings, paragraphs (with anchor-text links), bullet lists, images from the
   Media library, hashtags for news — reorder, add, delete, live word count. */
function BlockEditor({ blocks, onChange, media, accent, contentType }) {
  const [linkForm, setLinkForm] = useState(null); // { blockId, phrase, href }
  let seq = blocks.length;
  const bid = () => "nb" + Date.now() + "_" + seq++;
  const patchB = (id, p) => onChange(blocks.map((b) => (b.id === id ? { ...b, ...p } : b)));
  const remove = (id) => onChange(blocks.filter((b) => b.id !== id));
  const move = (id, dir) => {
    const i = blocks.findIndex((b) => b.id === id), j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks]; [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const addBlock = (kind) => onChange([...blocks,
    kind === "heading" ? { id: bid(), kind, level: 2, text: "New section heading" }
    : kind === "list" ? { id: bid(), kind, items: ["First point", "Second point"] }
    : kind === "image" ? { id: bid(), kind, mediaId: media[0]?.id || null }
    : { id: bid(), kind: "text", text: "New paragraph…", links: [] }]);
  const wc = blocksWordCount(blocks);
  const wcOk = contentType === "news" ? wc >= 100 && wc <= 120 : wc >= 700;

  const Controls = ({ b }) => (
    <span className="absolute -right-1 -top-2 hidden gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm group-hover:flex">
      <button onClick={() => move(b.id, -1)} className="rounded p-0.5 text-gray-400 hover:bg-gray-50"><ChevronRight size={11} style={{ transform: "rotate(-90deg)" }} /></button>
      <button onClick={() => move(b.id, 1)} className="rounded p-0.5 text-gray-400 hover:bg-gray-50"><ChevronRight size={11} style={{ transform: "rotate(90deg)" }} /></button>
      <button onClick={() => remove(b.id)} className="rounded p-0.5 text-gray-300 hover:text-red-500"><Trash2 size={11} /></button>
    </span>
  );

  return (
    <div className="space-y-2">
      {blocks.map((b) => (
        <div key={b.id} className="group relative">
          <Controls b={b} />
          {b.kind === "heading" && (
            <input value={b.text} onChange={(e) => patchB(b.id, { text: e.target.value })}
              className="ll-display w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-[15px] font-bold text-gray-900 outline-none hover:border-gray-100 focus:border-gray-200" />
          )}
          {b.kind === "text" && (
            <div className="rounded-lg border border-transparent px-1 hover:border-gray-100">
              <textarea value={b.text} rows={Math.max(2, Math.ceil((b.text || "").length / 95))}
                onChange={(e) => patchB(b.id, { text: e.target.value })}
                className="w-full resize-none border-0 bg-transparent px-1 py-1 text-[12.5px] leading-relaxed text-gray-700 outline-none" />
              <div className="flex flex-wrap items-center gap-1.5 pb-1.5">
                {(b.links || []).map((l) => (
                  <span key={l.id} className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800" title={l.href}>
                    <Link2 size={9} /> {l.phrase}
                    <button onClick={() => patchB(b.id, { links: b.links.filter((x) => x.id !== l.id) })} className="text-amber-400 hover:text-red-500"><X size={10} /></button>
                  </span>
                ))}
                <button onClick={() => setLinkForm({ blockId: b.id, phrase: "", href: "" })}
                  className="rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-[10px] text-gray-400 hover:border-gray-400">+ link / anchor</button>
              </div>
              {linkForm?.blockId === b.id && (
                <div className="mb-2 flex gap-1.5 rounded-lg border border-amber-200 bg-amber-50/60 p-2">
                  <input value={linkForm.phrase} onChange={(e) => setLinkForm({ ...linkForm, phrase: e.target.value })}
                    placeholder="Anchor text (must appear in the paragraph)" className="flex-1 rounded border border-amber-200 bg-white px-2 py-1 text-[11px]" />
                  <input value={linkForm.href} onChange={(e) => setLinkForm({ ...linkForm, href: e.target.value })}
                    placeholder="https://…" className="ll-mono flex-1 rounded border border-amber-200 bg-white px-2 py-1 text-[11px]" />
                  <button disabled={!linkForm.phrase.trim() || !linkForm.href.trim() || !b.text.includes(linkForm.phrase)}
                    onClick={() => { patchB(b.id, { links: [...(b.links || []), { id: "lk" + Date.now(), phrase: linkForm.phrase, href: linkForm.href }] }); setLinkForm(null); }}
                    className="rounded px-2.5 py-1 text-[10.5px] font-semibold text-white disabled:opacity-40" style={{ background: "#B45309" }}>Add</button>
                  <button onClick={() => setLinkForm(null)} className="text-gray-400"><X size={12} /></button>
                </div>
              )}
            </div>
          )}
          {b.kind === "list" && (
            <div className="rounded-lg border border-transparent px-2 py-1 hover:border-gray-100">
              <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-gray-300">Bullet list — one item per line</div>
              <textarea value={(b.items || []).join("\n")} rows={Math.max(2, (b.items || []).length)}
                onChange={(e) => patchB(b.id, { items: e.target.value.split("\n") })}
                className="w-full resize-none border-0 bg-transparent text-[12.5px] leading-relaxed text-gray-700 outline-none" />
            </div>
          )}
          {b.kind === "image" && (
            <div className="rounded-lg border border-dashed border-gray-200 p-2">
              <div className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-gray-300">Image — from the Media library</div>
              {media.length === 0 ? <div className="text-[11px] text-amber-600">Media library is empty — upload images in the Media tab.</div> : (
                <div className="flex flex-wrap gap-1.5">
                  {media.map((m) => (
                    <button key={m.id} onClick={() => patchB(b.id, { mediaId: m.id })}
                      className="overflow-hidden rounded-lg border-2" style={{ borderColor: b.mediaId === m.id ? accent : "transparent" }} title={m.tag || m.name}>
                      <img src={m.dataUrl || photoThumb(m.name)} alt={m.name} className="h-12 w-16 object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {b.kind === "hashtags" && (
            <div className="rounded-lg border border-transparent px-2 py-1 hover:border-gray-100">
              <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-gray-300">Hashtags — trending · related · viral · local</div>
              <input value={(b.tags || []).join(" ")} onChange={(e) => patchB(b.id, { tags: e.target.value.split(/\s+/).filter(Boolean) })}
                className="ll-mono w-full border-0 bg-transparent text-[11.5px] text-blue-600 outline-none" />
            </div>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2">
        {[["text", "+ Paragraph"], ["heading", "+ Heading"], ["list", "+ Bullet list"], ["image", "+ Image"]].map(([k, label]) => (
          <button key={k} onClick={() => addBlock(k)} className="rounded-lg border border-dashed border-gray-300 px-2 py-1 text-[10.5px] font-medium text-gray-400 hover:border-gray-400 hover:text-gray-600">{label}</button>
        ))}
        <span className="ll-mono ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={wcOk ? { background: "#DCFCE7", color: "#166534" } : { background: "#FEE2E2", color: "#991B1B" }}>
          {wc} words {contentType === "news" ? "(need 100–120)" : "(min 700)"}
        </span>
      </div>
    </div>
  );
}

function CampaignWizard({ c, patch, onBack, accent, log, project, brandName, br, opt }) {
  const [citySearch, setCitySearch] = useState("");
  const [stateSearch, setStateSearch] = useState("");
  const [genBusy, setGenBusy] = useState(null); // "topics" | "content"
  const [openDrafts, setOpenDrafts] = useState(() => new Set()); // step-5 accordion — drafts collapsed by default
  const connectedSites = WEB2_PLATFORMS.filter((pl) => br.sites[pl.key]?.siteCreated);
  const connectedSocials = (opt.social?.accounts || []).filter((a) => a.connected);
  const connectedSecondary = (br.secondarySocial || []).filter((a) => a.connected);
  const geo = { states: [], ...c.geo };
  const regions = [...new Set((CITY_DATA[geo.country] || []).map(([, r]) => r))].filter((r) => r.toLowerCase().includes(stateSearch.toLowerCase()));
  const cityPool = (CITY_DATA[geo.country] || []).filter(([city, r]) =>
    (!geo.states.length || geo.states.includes(r)) && (city + r).toLowerCase().includes(citySearch.toLowerCase()));
  const selTopics = (c.topics || []).filter((t) => t.selected);
  const media = br.media || [];
  const today = isoDate(new Date());

  const regenTopics = () => {
    const v = (c.variant || 0) + 1;
    patch({ variant: v, topics: genCampaignTopics({ ...c, variant: v }, brandName, v), contents: {} });
  };
  const genTopics = () => {
    setGenBusy("topics");
    setTimeout(() => { patch({ step: 3, topics: genCampaignTopics(c, brandName, c.variant || 0) }); setGenBusy(null); }, 900);
  };
  const genContents = () => {
    setGenBusy("content");
    setTimeout(() => { // PROD: one AI-provider call per topic (niche + audience + guide as the prompt)
      patch((cur) => ({
        step: Math.max(cur.step, 4),
        contents: Object.fromEntries(selTopics.map((t) => [t.id, cur.contents?.[t.id] || genTopicBlocks(t, cur, brandName, project.website, br.properties || {}, media)])),
      }));
      setGenBusy(null);
    }, 1300);
  };
  const toMediaStep = () => patch({
    step: 5,
    topics: c.topics.map((t) => (t.selected && !t.mediaId ? { ...t, mediaId: pickMediaFor(t, media) } : t)),
  });
  const toggleChannel = (id) => patch({ channels: (c.channels || []).includes(id) ? c.channels.filter((x) => x !== id) : [...(c.channels || []), id] });
  const publishNow = selTopics.filter((t) => t.date <= today).length;
  const publish = () => {
    patch({
      launched: true, step: 7,
      topics: c.topics.map((t) => (t.selected ? { ...t, status: t.date <= today ? "published" : "scheduled" } : t)),
    });
    log?.(`Campaign "${c.name}": ${publishNow} published now, ${selTopics.length - publishNow} scheduled across ${(c.channels || []).length} channels`, project.name);
  };
  const nextBtn = (enabled, onClick, label = "Go to next step", busyKey = null) => (
    <div className="mt-3 flex gap-2">
      <button onClick={onClick} disabled={!enabled || !!genBusy}
        className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
        {genBusy === busyKey && busyKey ? <><RefreshCw size={11} className="animate-spin" /> Working…</> : <>{label} <ChevronRight size={12} /></>}
      </button>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* starting box */}
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <button onClick={onBack} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11.5px] text-gray-500">← All campaigns</button>
        <div className="min-w-[220px] flex-1">
          <Labeled label="Campaign name">
            <input value={c.name} onChange={(e) => patch({ name: e.target.value })} className={inputCls} />
          </Labeled>
        </div>
        <div className="ll-mono text-[10.5px] text-gray-400">Created {fmtTs2(c.createdAt)}</div>
        {c.launched && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">Active</span>}
      </Card>

      {/* brand & strategy settings */}
      <Card className="space-y-3 p-4">
        <div className="text-[13px] font-semibold text-gray-800">Brand & SEO strategy</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="SEO strategy">
            <Seg options={["local", "national"]} value={c.strategy} onChange={(v) => patch({ strategy: v })} accent={accent} />
          </Labeled>
          <Labeled label="Country">
            <select value={geo.country} onChange={(e) => patch({ geo: { country: e.target.value, states: [], cities: [] } })} className={inputCls}>
              {COUNTRY_LIST.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Labeled>
        </div>
        {c.strategy === "local" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label={`States / regions (${geo.states.length} selected)`}>
              <input value={stateSearch} onChange={(e) => setStateSearch(e.target.value)} placeholder="Search states…" className={inputCls + " mb-1.5"} />
              <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto rounded-lg border border-gray-100 p-2">
                {regions.map((rg) => {
                  const on = geo.states.includes(rg);
                  return (
                    <button key={rg} onClick={() => patch({ geo: { ...geo, states: on ? geo.states.filter((x) => x !== rg) : [...geo.states, rg], cities: on ? geo.cities.filter((ct) => (CITY_DATA[geo.country] || []).some(([city, r2]) => city === ct && r2 !== rg)) : geo.cities } })}
                      className="rounded-full border px-2 py-0.5 text-[10.5px] font-medium"
                      style={on ? { borderColor: accent, color: accent, background: accent + "0D" } : { borderColor: "#E5E7EB", color: "#6B7280" }}>
                      {rg}
                    </button>
                  );
                })}
                {regions.length === 0 && <span className="text-[10.5px] text-gray-300">No states match "{stateSearch}"</span>}
              </div>
            </Labeled>
            <Labeled label={`Target cities (${geo.cities.length} selected)`}>
              <input value={citySearch} onChange={(e) => setCitySearch(e.target.value)} placeholder="Search cities…" className={inputCls + " mb-1.5"} />
              <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto rounded-lg border border-gray-100 p-2">
                {cityPool.map(([city, region]) => {
                  const on = geo.cities.includes(city);
                  return (
                    <button key={city} onClick={() => patch({ geo: { ...geo, cities: on ? geo.cities.filter((x) => x !== city) : [...geo.cities, city] } })}
                      className="rounded-full border px-2 py-0.5 text-[10.5px] font-medium"
                      style={on ? { borderColor: accent, color: accent, background: accent + "0D" } : { borderColor: "#E5E7EB", color: "#6B7280" }}>
                      <MapPin size={8} className="mr-0.5 inline" />{city}, {region}
                    </button>
                  );
                })}
                {cityPool.length === 0 && <span className="text-[10.5px] text-gray-300">No cities match — adjust search or state filter</span>}
              </div>
            </Labeled>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Niche information">
            <textarea value={c.niche} rows={2} onChange={(e) => patch({ niche: e.target.value })}
              placeholder="e.g. cosmetic & family dentistry, teeth whitening, implants" className={inputCls + " resize-none"} />
          </Labeled>
          <Labeled label="Target audience & customization">
            <textarea value={c.audience} rows={2} onChange={(e) => patch({ audience: e.target.value })}
              placeholder="e.g. young professionals & families in Manhattan, value-focused" className={inputCls + " resize-none"} />
          </Labeled>
        </div>
      </Card>

      {/* step 1 */}
      <StepBox n={1} title="Topic guides & publishing cadence" done={c.step > 0} active={c.step === 0}>
        <div className="grid gap-3 sm:grid-cols-[1fr,180px]">
          <Labeled label="Topic guide — what the content should push">
            <textarea value={c.topicGuide} rows={2} onChange={(e) => patch({ topicGuide: e.target.value })}
              placeholder="e.g. lead with pricing transparency, feature before/after cases, target 'near me' intent" className={inputCls + " resize-none"} />
          </Labeled>
          <Labeled label="Publish every … days">
            <input type="number" min="1" max="30" value={c.cadenceDays} onChange={(e) => patch({ cadenceDays: +e.target.value })} className={inputCls} />
          </Labeled>
        </div>
        {c.step === 0 && nextBtn(!!c.niche.trim() && !!c.topicGuide.trim(), () => patch({ step: 1 }))}
      </StepBox>

      {/* step 2 */}
      <StepBox n={2} title="Content type & volume" done={c.step > 1} active={c.step === 1}>
        <div className="grid gap-2 sm:grid-cols-2">
          {[["blog", "Blog post campaign", "Evergreen guides, cost breakdowns, comparisons — compounding organic value"], ["news", "News content campaign", "Announcements, local trends, timely angles — fast indexing, brand signals"]].map(([k, label, desc]) => (
            <button key={k} onClick={() => patch({ contentType: k })}
              className="rounded-xl border p-3 text-left" style={c.contentType === k ? { borderColor: accent, background: accent + "08" } : { borderColor: "#E5E7EB" }}>
              <div className="text-[12.5px] font-semibold" style={{ color: c.contentType === k ? accent : "#374151" }}>{label}</div>
              <div className="mt-0.5 text-[10.5px] text-gray-400">{desc}</div>
            </button>
          ))}
        </div>
        <div className="mt-2.5 w-56">
          <Labeled label="Topics to generate in step 4">
            <input type="number" min="3" max="20" value={c.topicCount || 8} onChange={(e) => patch({ topicCount: +e.target.value })} className={inputCls} />
          </Labeled>
        </div>
        {c.contentType === "blog" && (
          <div className="mt-2.5">
            <Labeled label={`Link target properties (${(c.linkTargets || []).length} selected) — blog posts auto-link to these with branded anchors`}>
              <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto rounded-lg border border-gray-100 p-2">
                {[
                  ...MAIN_PROPERTIES.map(([k, label]) => ["main:" + k, label]),
                  ...MAIN_SOCIALS.map(([k, name]) => ["soc:" + k, name]),
                  ...SECONDARY_SOCIALS.map(([k, name]) => ["sec:" + k, name + " (2nd)"]),
                  ...WEB2_PLATFORMS.map((pl) => ["web2:" + pl.key, pl.name + " (Web 2.0)"]),
                  ...Object.entries((br.properties || {}).listings || {}).filter(([, u]) => u).map(([name]) => ["list:" + name, name]),
                  ...Object.values((br.properties || {}).custom || {}).flat().filter((row) => row.url).map((row) => ["custom:" + row.id, row.name || "Custom link"]),
                ].map(([id, label]) => {
                  const on = (c.linkTargets || []).includes(id);
                  const hasUrl = !!resolveLinkTarget(id, br.properties || {}, brandName, project.website);
                  return (
                    <button key={id} onClick={() => patch({ linkTargets: on ? c.linkTargets.filter((x) => x !== id) : [...(c.linkTargets || []), id] })}
                      title={hasUrl ? "" : "No URL saved in Brand properties yet — will be skipped"}
                      className="rounded-full border px-2 py-0.5 text-[10.5px] font-medium"
                      style={on ? { borderColor: accent, color: accent, background: accent + "0D" } : { borderColor: "#E5E7EB", color: hasUrl ? "#6B7280" : "#C3CAD6" }}>
                      <Link2 size={8} className="mr-0.5 inline" />{label}{hasUrl ? "" : " ∅"}
                    </button>
                  );
                })}
              </div>
            </Labeled>
            <div className="mt-1 text-[10px] text-gray-400">∅ = no URL in Brand properties yet. Anchor strategy: branded & partial-match only, one link per property, distributed across paragraphs.</div>
          </div>
        )}
        {c.step === 1 && nextBtn(true, () => patch({ step: 2 }))}
      </StepBox>

      {/* step 3 */}
      <StepBox n={3} title="Audience research sources" done={c.step > 2} active={c.step === 2}>
        <div className="text-[11px] text-gray-400">Communities and forums where your audience talks — the engine mines them for the questions people actually ask.</div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {(c.sources || []).map((src) => (
            <span key={src} className="flex items-center gap-1 rounded-full border border-gray-200 px-2 py-0.5 text-[11px] text-gray-600">
              <Search size={9} /> {src}
              <button onClick={() => patch({ sources: c.sources.filter((x) => x !== src) })} className="text-gray-300 hover:text-red-400"><X size={10} /></button>
            </span>
          ))}
          <input value={c.sourceDraft || ""} onChange={(e) => patch({ sourceDraft: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter" && c.sourceDraft?.trim()) { patch({ sources: [...(c.sources || []), c.sourceDraft.trim()], sourceDraft: "" }); } }}
            placeholder="e.g. r/dentistry, Quora, local Facebook groups — Enter to add" className={"min-w-[240px] flex-1 " + inputCls} />
        </div>
        {c.step === 2 && nextBtn((c.sources || []).length > 0, genTopics, `Generate ${c.topicCount || 8} trending topics`, "topics")}
      </StepBox>

      {/* step 4 — topics & schedule (titles and dates editable) */}
      <StepBox n={4} title="Trending topics & publishing schedule" done={c.step > 3} active={c.step === 3 && !!c.topics}>
        {c.topics && (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[10.5px] text-gray-400">
                Tick the topics to run, edit any title or date. Times tuned for {c.strategy === "local" ? (geo.cities[0] || geo.country) + " local audience" : "a national audience"} · weekends auto-shifted.
              </div>
              <button onClick={regenTopics} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-500 hover:border-gray-300">
                <RefreshCw size={10} /> Edit & regenerate
              </button>
            </div>
            <div className="space-y-1.5">
              {c.topics.map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-2.5 py-2">
                  <button onClick={() => patch({ topics: c.topics.map((x) => (x.id === t.id ? { ...x, selected: !x.selected } : x)) })}>
                    <CheckCircle2 size={15} style={{ color: t.selected ? "#16A34A" : "#D6DAE1" }} />
                  </button>
                  <input value={t.title} onChange={(e) => patch({ topics: c.topics.map((x) => (x.id === t.id ? { ...x, title: e.target.value } : x)) })}
                    className="min-w-0 flex-1 border-0 bg-transparent text-[12px] font-medium text-gray-700 outline-none" />
                  <input type="date" value={t.date} onChange={(e) => patch({ topics: c.topics.map((x) => (x.id === t.id ? { ...x, date: e.target.value } : x)) })}
                    className="ll-mono rounded border border-gray-200 px-1.5 py-0.5 text-[10.5px] text-gray-500" />
                  <span className="ll-mono w-16 text-right text-[10px] text-gray-400">{t.time}</span>
                  {c.launched && t.selected && (
                    <span className="rounded-full px-1.5 py-px text-[8.5px] font-bold uppercase" style={t.status === "published" ? { background: "#DCFCE7", color: "#166534" } : { background: "#FEF3C7", color: "#92400E" }}>{t.status}</span>
                  )}
                </div>
              ))}
            </div>
            {c.step === 3 && (
              <>
                <div className="mt-2 text-[10px] text-gray-400">{c.contentType === "news" ? "News rule: every draft lands at 100–120 words with trending, related, viral and local hashtags." : "Blog rule: every draft is generated at 700+ words and auto-linked to your selected brand properties."}</div>
                {nextBtn(selTopics.length > 0, genContents, `Write content for ${selTopics.length} topic${selTopics.length === 1 ? "" : "s"}`, "content")}
              </>
            )}
          </>
        )}
      </StepBox>

      {/* step 5 — editable content drafts */}
      <StepBox n={5} title="Content creation — full blog editor" done={c.step > 4} active={c.step === 4}>
        <div className="text-[10.5px] text-gray-400">
          Real drafts, fully editable: headings, paragraphs with anchor-text links, bullet lists, images from Media{c.contentType === "news" ? ", hashtags" : ""}.
          {c.contentType === "news" ? " News rule: 100–120 words per draft." : " Blog rule: 700+ words per draft, internal links to your selected brand properties already placed."}
        </div>
        {c.step === 4 && (
          <div className="mt-2 flex justify-end">
            <button onClick={() => { patch({ contents: {} }); genContents(); }} disabled={!!genBusy}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-500 hover:border-gray-300 disabled:opacity-50">
              <RefreshCw size={10} className={genBusy === "content" ? "animate-spin" : ""} /> Regenerate all drafts
            </button>
          </div>
        )}
        <div className="mt-2 space-y-2.5">
          {selTopics.map((t) => {
            const isOpen = openDrafts.has(t.id);
            const wcT = blocksWordCount(c.contents?.[t.id] || []);
            const okT = c.contentType === "news" ? wcT >= 100 && wcT <= 120 : wcT >= 700;
            return (
              <div key={t.id} className="rounded-xl border border-gray-100">
                <button onClick={() => setOpenDrafts((o) => { const n = new Set(o); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n; })}
                  className="flex w-full items-center gap-2 p-3 text-left hover:bg-gray-50/60">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-gray-900">{t.title}</span>
                  <span className="ll-mono shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-bold"
                    style={okT ? { background: "#DCFCE7", color: "#166534" } : { background: "#FEE2E2", color: "#991B1B" }}>
                    {wcT} words
                  </span>
                  <ChevronRight size={15} className="shrink-0 text-gray-300 transition-transform" style={{ transform: isOpen ? "rotate(90deg)" : "none" }} />
                </button>
                {isOpen && (
                  <div className="ll-fade border-t border-gray-50 p-3">
                    <BlockEditor blocks={c.contents?.[t.id] || []} media={media} accent={accent} contentType={c.contentType}
                      onChange={(blocks) => patch((cur) => ({ contents: { ...cur.contents, [t.id]: blocks } }))} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {c.step === 4 && nextBtn(selTopics.every((t) => {
          const wcT = blocksWordCount(c.contents?.[t.id] || []);
          return c.contentType === "news" ? wcT >= 100 && wcT <= 120 : wcT >= 700;
        }), toMediaStep)}
      </StepBox>

      {/* step 6 — attach media from the project's media store */}
      <StepBox n={6} title="Attach media from the Media library" done={c.step > 5} active={c.step === 5}>
        {media.length === 0 ? (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">The media library is empty — upload images in the Media tab (tags help auto-matching). You can continue without images.</div>
        ) : (
          <div className="space-y-2">
            {selTopics.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-lg border border-gray-100 p-2">
                <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-gray-700">{t.title}</span>
                <div className="flex gap-1.5">
                  {media.map((m) => (
                    <button key={m.id} onClick={() => patch({ topics: c.topics.map((x) => (x.id === t.id ? { ...x, mediaId: m.id } : x)) })}
                      className="overflow-hidden rounded-lg border-2" style={{ borderColor: t.mediaId === m.id ? accent : "transparent" }} title={m.tag || m.name}>
                      <img src={m.dataUrl || photoThumb(m.name)} alt={m.name} className="h-9 w-12 object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {c.step === 5 && nextBtn(true, () => patch({ step: 6 }))}
      </StepBox>

      {/* step 7 — channels + publish/schedule */}
      <StepBox n={7} title="Publication channels & launch" done={c.launched} active={c.step === 6 && !c.launched}>
        <div className="space-y-2.5">
          <Labeled label="Article submission sites">
            <div className="flex flex-wrap gap-1.5">
              {connectedSites.map((pl) => {
                const id = "site:" + pl.key, on = (c.channels || []).includes(id);
                return (
                  <button key={id} onClick={() => toggleChannel(id)} className="rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium"
                    style={on ? { borderColor: accent, color: accent, background: accent + "0D" } : { borderColor: "#E5E7EB", color: "#6B7280" }}>
                    <Globe size={10} className="mr-1 inline" />{pl.name}
                  </button>
                );
              })}
              {connectedSites.length === 0 && <span className="text-[11px] text-amber-600">No branded sites yet — create them in Article submissions.</span>}
            </div>
          </Labeled>
          <Labeled label="Social profiles (main + secondary)">
            <div className="flex flex-wrap gap-1.5">
              {[...connectedSocials.map((a) => ["soc:" + a.id, a.platform]), ...connectedSecondary.map((a) => ["soc2:" + a.id, a.platform])].map(([id, label]) => {
                const on = (c.channels || []).includes(id);
                return (
                  <button key={id} onClick={() => toggleChannel(id)} className="rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium"
                    style={on ? { borderColor: accent, color: accent, background: accent + "0D" } : { borderColor: "#E5E7EB", color: "#6B7280" }}>
                    <Share2 size={10} className="mr-1 inline" />{label}
                  </button>
                );
              })}
              {connectedSocials.length + connectedSecondary.length === 0 && <span className="text-[11px] text-amber-600">No socials connected — connect them in Brand properties & connectors → Connectors.</span>}
            </div>
          </Labeled>
          {!c.launched && c.step === 6 && (
            <div className="flex items-center gap-3 border-t border-gray-100 pt-3">
              <button onClick={publish} disabled={!(c.channels || []).length || !selTopics.length}
                className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
                <Rocket size={13} /> {publishNow > 0 ? `Publish ${publishNow} now & schedule ${selTopics.length - publishNow}` : `Schedule ${selTopics.length} posts`}
              </button>
              <span className="text-[10.5px] text-gray-400">Today's posts go live immediately; future dates are queued. Every article links to {project.website}, the GBP and the matching social post.</span>
            </div>
          )}
          {c.launched && (
            <div className="text-[11px] font-medium text-emerald-700">✓ Live — {c.topics.filter((t) => t.status === "published").length} published, {c.topics.filter((t) => t.status === "scheduled").length} scheduled across {(c.channels || []).length} channels.</div>
          )}
        </div>
      </StepBox>
    </div>
  );
}

/* ================= Business Listings — the citation scanner =================
   Own section in the Optimization Studio rail. A citation audit the way the
   commercial tools run one: NAP pulled from the project, per-directory search,
   match confidence, NAP-consistency flags and a citation health score.
   PROD: per-directory search APIs / SERP queries, fuzzy NAP matching. */
export function ListingsScannerTab({ opt, setOpt, accent, log, project, dfs }) {
  const br = opt.branding || {};
  const set = (patch) => setOpt("branding", patch);
  const scanData = br.listingScan || null;
  const [params, setParams] = useState(() => ({
    name: opt?.gbp?.bizName || project.name,
    phone: opt?.gbp?.phone || "",
    address: opt?.gbp?.address || "",
    website: project.website,
    category: (opt?.gbp?.categories || [])[0] || "",
    depth: "deep", // "quick" (tier 1) | "deep" (all 54)
  }));
  const [running, setRunning] = useState(null); // { idx, total, mode }
  const [scanErr, setScanErr] = useState(null);
  const [filter, setFilter] = useState("all");

  const dirs = params.depth === "quick" ? BIZ_DIRECTORIES.filter((d) => d.tier === 1) : BIZ_DIRECTORIES;
  const slug = params.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const city = (params.address.split(",")[1] || params.address.split(",")[0] || "local").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "local";

  /* commit results (live or demo) — shared scoring */
  const commit = (resultsArr, live) => {
    const results = Object.fromEntries(resultsArr.map((r) => [r.name, r]));
    const foundList = Object.entries(results).filter(([, r]) => r.status === "found");
    const napIssues = foundList.filter(([, r]) => r.nap && !(r.nap.name !== false && r.nap.address !== false && r.nap.phone !== false)).length;
    const consistency = foundList.length ? (foundList.length - napIssues) / foundList.length : 0;
    const score = Math.round((foundList.length / resultsArr.length) * 65 + consistency * 35);
    set((cur) => ({
      listingScan: { at: Date.now(), depth: params.depth, results, score, live, found: foundList.length, missing: resultsArr.filter((r) => r.status === "missing").length, napIssues },
      properties: { ...(cur.properties || {}), listings: { ...((cur.properties || {}).listings || {}), ...Object.fromEntries(foundList.map(([n, r]) => [n, r.url])) } },
    }));
    setRunning(null);
    log?.(`Citation scan (${live ? "live" : "demo"}): ${foundList.length}/${resultsArr.length} found, ${napIssues} NAP issue(s)`, project.name);
  };

  const runScan = async () => {
    /* REAL scan first: POST to the API server, which runs one site:directory
       SERP query per directory through DataForSEO and NAP-checks the results. */
    setRunning({ idx: 0, total: dirs.length, mode: "live" });
    setScanErr(null);
    try {
      const res = await fetch("/api/scan-listings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(180000),
        body: JSON.stringify({
          biz: { name: params.name, phone: params.phone, address: params.address, website: params.website, city: (params.address.split(",")[1] || "").trim(), country: "United States", category: params.category },
          directories: dirs.map(({ name, domain, tier, da }) => ({ name, domain, tier, da })),
          // seeded demo credentials are not real — sending them would just 401 at the provider
          dfs: dfs?.login && dfs?.password && !dfs.login.includes("demo@serpsquad") ? { login: dfs.login, password: dfs.password } : undefined,
        }),
      });
      if (res.ok) { const data = await res.json(); return commit(data.results, true); }
      if (res.status === 502) { // provider rejected (bad credentials, quota…) — surface, don't mask with demo data
        const err = await res.json().catch(() => ({}));
        setScanErr(err.detail || "The SERP provider rejected the request — check the DataForSEO credentials in API settings.");
        setRunning(null);
        return;
      }
      if (res.status !== 503) throw new Error(await res.text()); // 503 = no credentials → demo fallback below
    } catch { /* API server down → demo fallback below */ }

    /* demo fallback — deterministic simulation, clearly labeled in the UI */
    setRunning({ idx: 0, total: dirs.length, mode: "demo" });
    const results = {};
    dirs.forEach((dir, i) => setTimeout(() => {
      const h = (salt) => hashStr(project.id + "|scan|" + dir.name + "|" + salt) % 100;
      const found = h("hit") < (dir.tier === 1 ? 72 : dir.tier === 2 ? 48 : 35); // big dirs index more businesses
      if (found) {
        results[dir.name] = {
          status: "found", url: listingUrl(dir, slug, city), da: dir.da, tier: dir.tier,
          confidence: 82 + (h("conf") % 18),
          nap: { name: h("n") < 94, address: h("a") < 74, phone: h("p") < 81 },
        };
      } else {
        results[dir.name] = { status: "missing", da: dir.da, tier: dir.tier };
      }
      const isLast = i === dirs.length - 1;
      if (isLast) commit(Object.entries(results).map(([name, r]) => ({ name, ...r })), false);
      else setRunning({ idx: i + 1, total: dirs.length, mode: "demo" });
    }, 110 * (i + 1)));
  };

  const rows = scanData ? Object.entries(scanData.results) : [];
  const shown = rows.filter(([, r]) =>
    filter === "all" ? true
    : filter === "found" ? r.status === "found"
    : filter === "issues" ? r.status === "found" && !(r.nap.name && r.nap.address && r.nap.phone)
    : r.status === "missing");
  const NapFlag = ({ ok, label }) => (
    <span className="ll-mono rounded px-1 text-[8.5px] font-bold"
      style={ok === null || ok === undefined ? { background: "#F1F5F9", color: "#94A3B8" } : ok ? { background: "#DCFCE7", color: "#166534" } : { background: "#FEE2E2", color: "#991B1B" }}
      title={ok === null || ok === undefined ? label + " not verifiable from the search snippet" : label + (ok ? " matches" : " mismatch — fix at the directory")}>{label[0]}</span>
  );

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <div className="ll-display flex items-center gap-2 text-[15px] font-semibold"><Search size={15} style={{ color: accent }} /> Business listing scanner</div>
        <div className="text-[11.5px] text-gray-400">NAP data pulled from this project — adjust, pick a depth, scan {BIZ_DIRECTORIES.length} directories. Found listings are checked for name/address/phone consistency and pushed to Brand properties automatically.</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Labeled label="Business name"><input value={params.name} onChange={(e) => setParams({ ...params, name: e.target.value })} className={inputCls} /></Labeled>
          <Labeled label="Phone"><input value={params.phone} onChange={(e) => setParams({ ...params, phone: e.target.value })} className={"ll-mono " + inputCls} /></Labeled>
          <Labeled label="Address"><input value={params.address} onChange={(e) => setParams({ ...params, address: e.target.value })} className={inputCls} /></Labeled>
          <Labeled label="Website"><input value={params.website} onChange={(e) => setParams({ ...params, website: e.target.value })} className={"ll-mono " + inputCls} /></Labeled>
          <Labeled label="Category / niche"><input value={params.category} onChange={(e) => setParams({ ...params, category: e.target.value })} placeholder="e.g. Dentist" className={inputCls} /></Labeled>
          <Labeled label="Scan depth">
            <Seg options={["quick", "deep"]} value={params.depth} onChange={(v) => setParams({ ...params, depth: v })} accent={accent} />
          </Labeled>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={runScan} disabled={!!running || !params.name.trim()}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
            {running ? <><RefreshCw size={12} className="animate-spin" /> Scanning…</> : <><Search size={12} /> {params.depth === "quick" ? "Quick scan (Tier 1 — 20 directories)" : "Deep scan (all " + BIZ_DIRECTORIES.length + " directories)"}</>}
          </button>
          {running && (
            <div className="flex flex-1 items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full transition-all" style={{ width: (running.idx / running.total) * 100 + "%", background: accent }} />
              </div>
              <span className="ll-mono text-[10px] text-gray-400">{running.idx}/{running.total} · {dirs[running.idx]?.name}</span>
            </div>
          )}
        </div>
      </Card>

      {scanErr && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[11.5px] leading-relaxed text-red-700">
          <b>Live scan failed:</b> <span className="ll-mono">{scanErr.slice(0, 220)}</span>
        </div>
      )}
      {scanData && !running && !scanData.live && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11.5px] leading-relaxed text-amber-800">
          <b>Demo results.</b> For live scans: start the API server (<span className="ll-mono">npm run api</span>) and add your DataForSEO
          credentials in Company Settings → API settings. The scanner then runs one real <span className="ll-mono">site:directory</span> SERP
          query per directory and NAP-checks each result — no fabricated links.
        </div>
      )}
      {scanData && !running && (
        <Card className="flex flex-wrap items-center gap-5 p-4">
          <div className="flex items-center gap-3">
            <div className="ll-display flex h-14 w-14 items-center justify-center rounded-2xl text-[19px] font-bold text-white"
              style={{ background: scanData.score >= 70 ? "#16A34A" : scanData.score >= 45 ? "#D97706" : "#DC2626" }}>{scanData.score}</div>
            <div>
              <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-800">Citation health score
                <span className="rounded-full px-1.5 py-px text-[8.5px] font-bold uppercase"
                  style={scanData.live ? { background: "#DCFCE7", color: "#166534" } : { background: "#FEF3C7", color: "#92400E" }}>
                  {scanData.live ? "Live scan" : "Demo data"}
                </span>
              </div>
              <div className="text-[10.5px] text-gray-400">coverage (65%) + NAP consistency (35%) · scanned {fmtTs2(scanData.at)}</div>
            </div>
          </div>
          <div className="flex gap-4 text-[12px]">
            <span className="text-emerald-600 font-semibold">✓ {scanData.found} found</span>
            <span className="text-amber-600 font-semibold">{scanData.missing} missing</span>
            <span className="text-red-500 font-semibold">{scanData.napIssues} NAP issue{scanData.napIssues === 1 ? "" : "s"}</span>
          </div>
          <div className="ml-auto text-[10.5px] leading-relaxed text-gray-400">
            Missing = citation-building list. NAP issues = fix name/address/phone<br />at the directory — inconsistent NAP dilutes local rankings.
          </div>
        </Card>
      )}

      {scanData && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-100 px-4 py-3">
            {[["all", "All"], ["found", "Found"], ["issues", "NAP issues"], ["missing", "Missing"]].map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)} className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                style={filter === k ? { borderColor: accent, color: accent, background: accent + "0D" } : { borderColor: "#E5E7EB", color: "#6B7280" }}>
                {label}
              </button>
            ))}
            <span className="ml-auto text-[10.5px] text-gray-400">{shown.length} directories</span>
          </div>
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-gray-100 text-[9.5px] uppercase tracking-wider text-gray-400">
                <th className="px-4 py-2.5 font-semibold">Directory</th>
                <th className="px-2 py-2.5 font-semibold">Tier</th>
                <th className="px-2 py-2.5 font-semibold">DA</th>
                <th className="px-2 py-2.5 font-semibold">Status</th>
                <th className="px-2 py-2.5 font-semibold">NAP</th>
                <th className="px-4 py-2.5 font-semibold">Listing</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(([name, r]) => (
                <tr key={name} className="border-b border-gray-50 hover:bg-gray-50/60">
                  <td className="px-4 py-2 font-medium text-gray-800">{name}</td>
                  <td className="ll-mono px-2 py-2 text-gray-400">T{r.tier}</td>
                  <td className="ll-mono px-2 py-2 text-gray-500">{r.da}</td>
                  <td className="px-2 py-2">
                    <span className="rounded-full px-1.5 py-px text-[8.5px] font-bold uppercase"
                      style={r.status === "found" ? { background: "#DCFCE7", color: "#166534" } : { background: "#FEF3C7", color: "#92400E" }}>
                      {r.status === "found" ? `Found · ${r.confidence}%` : "Missing"}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    {r.status === "found" ? <span className="flex gap-0.5"><NapFlag ok={r.nap.name} label="Name" /><NapFlag ok={r.nap.address} label="Addr" /><NapFlag ok={r.nap.phone} label="Phone" /></span> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="ll-mono max-w-[220px] truncate px-4 py-2 text-[10.5px]">
                    {r.status === "found"
                      ? <span className="text-blue-600">{r.url}</span>
                      : <span className="text-gray-400">Create listing → {name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {!scanData && !running && (
        <Card className="p-8 text-center text-[12px] text-gray-400">No scan yet — run the first citation scan above. Found listings flow into Brand properties automatically.</Card>
      )}
    </div>
  );
}
