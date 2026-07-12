import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  MapPin, Phone, Globe, Star, Search, Users, Eye, Settings, Plus, X,
  Building2, LayoutDashboard, Target, Palette, Link2, CheckCircle2,
  Printer, ArrowUpRight, ArrowDownRight, Minus, Navigation, Upload,
  MousePointerClick, BarChart3, Smartphone, Monitor, RefreshCw, Clock,
  Trash2, ChevronDown, ChevronRight, Folder, FolderOpen, Zap, KeyRound,
  LogIn, LogOut, ChevronUp, Copy, Settings2, Type, AlignLeft, Table2,
  PieChart as PieIcon, Activity, FileText as FileTextIcon, ArrowLeft, ClipboardPaste,
  Calendar, Sun, Moon, Shield, History, UserPlus, Wallet, Receipt, ListTodo, MessageSquare,
  Rocket, Share2, Lock, Send, ImagePlus, List, ListOrdered, Quote, Facebook, Instagram, Linkedin, Twitter, Youtube, Music2, Pin,
} from "lucide-react";
import { findCity } from "../lib/geo.js";
import { isoDate } from "../lib/months.jsx";

export const DEFAULT_WIDGETS = {
  gbp: { views: true, breakdown: true, calls: true, directions: true, websiteClicks: true, searchKeywords: true, platformDevice: true },
  bing: { impressions: true, clicks: true, calls: true, directions: true },
  apple: { views: true, calls: true, directions: true, websiteTaps: true },
  ga: { users: true, sessions: true, engagement: true, conversions: true, channels: true, sources: true, events: true, topPages: true },
  gsc: { clicks: true, impressions: true, ctr: true, position: true, topQueries: true },
  ranks: { insights: true, distribution: true, table: true },
  ads: { kpis: true, charts: true, table: true },
};
export const cloneWidgets = () => JSON.parse(JSON.stringify(DEFAULT_WIDGETS));

export let seedN = 0;
export const seedEntry = (domain, keyword, cityName, device, days, opts = {}) => ({
  id: "t" + (++seedN),
  domain, keyword,
  engine: opts.engine || "Google",
  city: findCity(cityName),
  device,
  reportingType: opts.once ? "One time" : "Recurring",
  rerunDays: opts.once ? null : (opts.rerunDays || 1),
  scrape: "DataForSEO SERP API",
  days,
});
export const mkOpt = () => ({
  gbp: { connected: false, bizName: "", categories: [], phone: "", website: "", address: "", description: "",
    hours: { Mon: "9:00 AM – 5:00 PM", Tue: "9:00 AM – 5:00 PM", Wed: "9:00 AM – 5:00 PM", Thu: "9:00 AM – 5:00 PM", Fri: "9:00 AM – 5:00 PM", Sat: "Closed", Sun: "Closed" },
    svcCats: [], services: [], products: [], posts: [], photos: [] },
  bing: { connected: false, bizName: "", categories: [], phone: "", website: "", address: "", description: "",
    hours: { Mon: "9:00 AM \u2013 5:00 PM", Tue: "9:00 AM \u2013 5:00 PM", Wed: "9:00 AM \u2013 5:00 PM", Thu: "9:00 AM \u2013 5:00 PM", Fri: "9:00 AM \u2013 5:00 PM", Sat: "Closed", Sun: "Closed" },
    photos: [] },
  apple: { connected: false, bizName: "", categories: [], phone: "", website: "", address: "", description: "",
    hours: { Mon: "9:00 AM \u2013 5:00 PM", Tue: "9:00 AM \u2013 5:00 PM", Wed: "9:00 AM \u2013 5:00 PM", Thu: "9:00 AM \u2013 5:00 PM", Fri: "9:00 AM \u2013 5:00 PM", Sat: "Closed", Sun: "Closed" },
    photos: [], showcases: [] },
  website: { connected: false, platform: null, siteKey: null, verified: false, credential: null, crawled: false, lastCrawl: null, pages: [], blogs: [] },
  social: {
    accounts: [
      { id: "fb", platform: "Facebook Page", connected: false, handle: "", name: "", bio: "" },
      { id: "ig", platform: "Instagram Business", connected: false, handle: "", name: "", bio: "" },
      { id: "li", platform: "LinkedIn Page", connected: false, handle: "", name: "", bio: "" },
      { id: "x", platform: "X (Twitter)", connected: false, handle: "", name: "", bio: "" },
      { id: "yt", platform: "YouTube Channel", connected: false, handle: "", name: "", bio: "" },
      { id: "tt", platform: "TikTok Business", connected: false, handle: "", name: "", bio: "" },
      { id: "pin", platform: "Pinterest Business", connected: false, handle: "", name: "", bio: "" },
      { id: "th", platform: "Threads", connected: false, handle: "", name: "", bio: "" },
      { id: "bs", platform: "Bluesky", connected: false, handle: "", name: "", bio: "" },
    ],
    posts: [] },
  /* Branding & Automation — off-page SEO hub: media library, Web 2.0 branded
     sites (per-platform state) and content automation campaigns */
  branding: { media: [], sites: {}, campaigns: [] },
});
export const mkProject = (id, name, website, accent, tracking, records = [], opt = null) => ({
  id, name, website, accent, logo: null, widgets: cloneWidgets(),
  integrations: { gbp: true, ga: true, gsc: true, bing: false, apple: false },
  /* location groups: one per business location; each holds its own GBP/Bing/Apple
     connection. The flat integrations gbp/bing/apple above are DERIVED (any
     location connected) so every existing gate keeps working. */
  locations: [{ id: id + "-loc1", name: "Primary location", integrations: { gbp: true, bing: false, apple: false } }],
  tracking, records, opt: opt || mkOpt(),
});

export const ROLE_PRESETS = {
  Admin:   { viewData: true, manageKeywords: true, createReports: true, manageClients: true, manageTasks: true },
  Manager: { viewData: true, manageKeywords: true, createReports: true, manageClients: false, manageTasks: true },
  "Content Developer": { viewData: false, manageKeywords: false, createReports: false, manageClients: false, manageTasks: true },
  "Web Developer":     { viewData: false, manageKeywords: false, createReports: false, manageClients: false, manageTasks: true },
  "Paid Ads Manager":  { viewData: false, manageKeywords: false, createReports: false, manageClients: false, manageTasks: true },
};
/* sections each role sees AUTOMATICALLY on every assigned project (manual
   per-project grants in Project settings → Team can only ADD to these).
   Admins see everything and can create clients/projects & assign the team. */
export const ROLE_AUTO_SECTIONS = {
  Admin: "all",
  Manager: ["gbp", "web", "ranks", "geogrid", "adsperf", "records", "wiki", "chat"],   // Performance + PM (+ reports via createReports)
  "Content Developer": ["records", "wiki", "chat"],
  "Web Developer": ["records", "wiki", "chat"],
  "Paid Ads Manager": ["records", "wiki", "chat", "ads", "adsperf"],
};
/* what a CLIENT sees instead of a team member's real name (identity wall) */
export const ROLE_CLIENT_LABEL = {
  Admin: "SEO Manager", Manager: "SEO Manager",
  "Content Developer": "Content Developer", "Web Developer": "Web Developer", "Paid Ads Manager": "Paid Ads Manager",
};
export const SEED_COMPANY = {
  name: "SERP Squad",
  logo: null,
  accent: "#1F2A44",
  dfs: { login: "demo@serpsquad.io", password: "demo-api-password", connected: true }, // demo creds — connected must always mean credentials exist
  // credentials for every API_REGISTRY entry, keyed by id → { values, connected };
  // Claude ships connected in the demo so editor AI suggestions work out of the box
  apis: { claude: { values: { apiKey: "sk-ant-demo-key", model: "claude-sonnet-5" }, connected: true } },
  team: [
    { id: "u1", name: "You (Owner)", email: "owner@serpsquad.io", password: "", role: "Admin", projects: "all", perms: { ...ROLE_PRESETS.Admin }, isOwner: true, title: "Founder & SEO Lead", phone: "+1 212 555 0100", avatar: null },
    { id: "u2", name: "Rifat Hasan", email: "rifat@serpsquad.io", password: "squad123", role: "Manager", projects: ["p1", "p2"], perms: { ...ROLE_PRESETS.Manager }, title: "SEO Manager", phone: "+880 17 5550 1122", avatar: null },
    { id: "u3", name: "Sara Lim", email: "sara@serpsquad.io", password: "squad123", role: "Content Developer", projects: ["p4"], perms: { ...ROLE_PRESETS["Content Developer"] }, title: "Content & Reporting", phone: "+65 8555 0177", avatar: null },
  ],
  finance: {
    clientEntries: [
      { id: "f1", clientId: "cl1", type: "earning", label: "Monthly SEO retainer", amount: 1500 },
      { id: "f2", clientId: "cl1", type: "spending", label: "Content writing", amount: 250 },
      { id: "f3", clientId: "cl1", type: "spending", label: "Citations & directories", amount: 60 },
      { id: "f4", clientId: "cl2", type: "earning", label: "Monthly SEO retainer", amount: 900 },
      { id: "f5", clientId: "cl2", type: "spending", label: "Link building", amount: 120 },
      { id: "f6", clientId: "cl3", type: "earning", label: "Monthly SEO retainer", amount: 600 },
      { id: "f7", clientId: "cl3", type: "spending", label: "Local citations", amount: 80 },
    ],
    universal: [
      { id: "g1", label: "Team salaries", amount: 2800 },
      { id: "g2", label: "DataForSEO API", amount: 90 },
      { id: "g3", label: "Tools (Ahrefs, Figma…)", amount: 240 },
      { id: "g4", label: "Hosting & infrastructure", amount: 60 },
    ],
  },
  recordTemplates: [
    { id: "tpl1", name: "Monthly SEO Sprint", fromProject: "Bright Smile — Manhattan", savedAt: Date.now() - 12 * 864e5,
      checklists: [
        { name: "On-page", tasks: [{ title: "Refresh title & meta on money pages" }, { title: "Internal links from new blog posts" }, { title: "Fix crawl errors from Search Console" }] },
        { name: "GBP", tasks: [{ title: "Publish 2 GBP posts" }, { title: "Upload 5 fresh photos" }, { title: "Reply to all new reviews" }] },
      ] },
  ],
  chatGroups: [
    { id: "grp1", name: "Content Team", members: ["You (Owner)", "Rifat Hasan", "Sara Lim"], createdBy: "You (Owner)", createdAt: Date.now() - 4 * 864e5,
      msgs: [
        { id: "gm1", ts: Date.now() - 8 * 3600000, author: "Sara Lim", text: "Monthly content calendar draft is in the wiki — @Rifat Hasan can you sanity-check the Brooklyn topics?" },
        { id: "gm2", ts: Date.now() - 7 * 3600000, author: "Rifat Hasan", text: "On it 👍", replyTo: "gm1" },
      ],
      reads: { "Rifat Hasan": Date.now() - 7 * 3600000, "Sara Lim": Date.now() - 7 * 3600000 } },
  ],
  dms: {
    "Rifat Hasan|You (Owner)": [
      { id: "dm1", ts: Date.now() - 5 * 3600000, author: "Rifat Hasan", text: "Pushed the Manhattan schema changes live — Search Console is picking them up already. 🚀" },
      { id: "dm2", ts: Date.now() - 1.5 * 3600000, author: "Rifat Hasan", text: "Also: Dr. Park asked about the Saturday-hours post in the project chat, I replied but you may want to confirm the offer wording." },
    ],
  },
  dmReads: { "Rifat Hasan|You (Owner)": { "Rifat Hasan": Date.now() - 1.5 * 3600000 } },
  activity: [
    { id: "a1", ts: Date.now() - 0.2 * 3600000, member: "Rifat Hasan", action: "Viewed project", target: "Bright Smile — Brooklyn" },
    { id: "a2", ts: Date.now() - 1.1 * 3600000, member: "Rifat Hasan", action: "Added 3 keywords", target: "Bright Smile — Manhattan" },
    { id: "a3", ts: Date.now() - 4 * 3600000, member: "Sara Lim", action: "Viewed client", target: "Bloom & Vine" },
    { id: "a4", ts: Date.now() - 7 * 3600000, member: "Sara Lim", action: "Logged in", target: "" },
  ],
};

export const SEED_CLIENTS = [
  {
    id: "cl1", name: "Bright Smile Group",
    contact: "Dr. Hannah Park", email: "hannah@brightsmile.com", phone: "+1 212 555 0148",
    companyName: "Bright Smile Dental Group LLC", companyWebsite: "brightsmiledental.com", address: "New York, NY",
    whiteLabel: { enabled: false, name: "", website: "", logo: null },
    login: { enabled: false, email: "hannah@brightsmile.com", password: "", projectIds: ["p1", "p2"], canViewRanks: true, canDownload: true, canManageTasks: false, canComment: true, canChat: true, canViewAds: true },
    projects: [
      mkProject("p1", "Bright Smile — Manhattan", "brightsmiledental.com", "#0E7C66", [
        seedEntry("brightsmiledental.com", "dentist near me", "New York", "Mobile", 240),
        seedEntry("brightsmiledental.com", "teeth whitening", "New York", "Desktop", 180),
        seedEntry("brightsmiledental.com", "dental implants", "New York", "Desktop", 365, { rerunDays: 7 }),
      ], [
        {
          id: "r1", name: "March On-Page Sprint",
          createdAt: Date.now() - 12 * 864e5, updatedAt: Date.now() - 1 * 864e5,
          dueDate: isoDate(new Date(Date.now() + 5 * 864e5)), completedAt: null,
          assignees: ["You (Owner)", "Rifat Hasan"],
          checklists: [
            { id: "cl1", name: "Homepage optimization", tasks: [
              { id: "t1", title: "Rewrite title & meta description", createdAt: Date.now() - 12 * 864e5, dueDate: isoDate(new Date(Date.now() - 2 * 864e5)), completedAt: Date.now() - 3 * 864e5, assignees: ["Rifat Hasan"] },
              { id: "t2", title: "Add LocalBusiness schema markup", createdAt: Date.now() - 10 * 864e5, dueDate: isoDate(new Date(Date.now() - 1 * 864e5)), completedAt: null, assignees: ["Rifat Hasan"] },
              { id: "t3", title: "Compress hero images to WebP", createdAt: Date.now() - 8 * 864e5, dueDate: isoDate(new Date(Date.now() + 3 * 864e5)), completedAt: null, assignees: ["You (Owner)"] },
            ]},
            { id: "cl2", name: "GBP updates", tasks: [
              { id: "t4", title: "Upload 10 new interior photos", createdAt: Date.now() - 6 * 864e5, dueDate: isoDate(new Date(Date.now() + 2 * 864e5)), completedAt: null, assignees: ["Sara Lim"] },
            ]},
          ],
          comments: [{ id: "c1", ts: Date.now() - 2 * 864e5, author: "Rifat Hasan", text: "Schema draft is ready — review before I push it live." }],
          activity: [
            { id: "pa1", ts: Date.now() - 3 * 864e5, author: "Rifat Hasan", text: 'completed task "Rewrite title & meta description"' },
            { id: "pa2", ts: Date.now() - 6 * 864e5, author: "You (Owner)", text: 'added checklist "GBP updates"' },
            { id: "pa3", ts: Date.now() - 12 * 864e5, author: "You (Owner)", text: "created this record" },
          ],
        },
      ], {
        gbp: { connected: true, bizName: "Bright Smile Dental — Manhattan", categories: ["Dentist", "Cosmetic dentist"],
          phone: "(212) 555-0142", website: "https://brightsmiledental.com", address: "350 5th Ave, New York, NY 10118", lat: 40.748441, lng: -73.985664,
          description: "Family and cosmetic dentistry in Midtown Manhattan. Same-day appointments, gentle care and modern equipment for whitening, implants and routine checkups.",
          hours: { Mon: "8:00 AM – 6:00 PM", Tue: "8:00 AM – 6:00 PM", Wed: "8:00 AM – 6:00 PM", Thu: "8:00 AM – 6:00 PM", Fri: "8:00 AM – 4:00 PM", Sat: "9:00 AM – 2:00 PM", Sun: "Closed" },
          svcCats: [
            { id: "sc1", name: "Dentist", services: [
              { id: "sv1", name: "Teeth whitening", desc: "In-office Zoom whitening, 60–90 minutes.", priceType: "fixed", price: "349" },
              { id: "sv2", name: "Dental implants", desc: "Consultation, placement and crown.", priceType: "from", price: "2800" },
              { id: "sv3", name: "Routine cleaning & exam", desc: "Cleaning, X-rays and full exam.", priceType: "fixed", price: "120" },
            ]},
            { id: "sc2", name: "Cosmetic dentist", services: [
              { id: "sv4", name: "Invisalign", desc: "Clear aligner treatment with free initial scan.", priceType: "from", price: "3500" },
            ]},
          ],
          services: [],
          products: [
            { id: "pd1", name: "Whitening take-home kit", desc: "Custom trays + professional gel.", price: "$149", image: null },
          ],
          posts: [
            { id: "gp1", type: "offer", title: "New patient special — $99 exam", body: "Cleaning, X-rays and exam for new patients this month.", cta: "Book", ctaUrl: "https://brightsmiledental.com/book", startDate: isoDate(new Date(Date.now() - 5 * 864e5)), endDate: isoDate(new Date(Date.now() + 9 * 864e5)), coupon: "SMILE99", image: null, status: "published", publishAt: null, createdAt: Date.now() - 5 * 864e5 },
            { id: "gp2", type: "update", title: "", body: "We now offer Saturday appointments! Book online or call us.", cta: "Learn more", ctaUrl: "https://brightsmiledental.com", image: null, status: "scheduled", publishAt: Date.now() + 2 * 864e5, createdAt: Date.now() - 1 * 864e5 },
          ],
          photos: [
            { id: "ph1", name: "reception-area.jpg", addedAt: Date.now() - 20 * 864e5 },
            { id: "ph2", name: "treatment-room.jpg", addedAt: Date.now() - 6 * 864e5 },
            { id: "ph3", name: "storefront.jpg", addedAt: Date.now() - 45 * 864e5 },
            { id: "ph4", name: "smile-makeover-result.jpg", addedAt: Date.now() - 3 * 864e5 },
            { id: "ph5", name: "our-team.jpg", addedAt: Date.now() - 30 * 864e5 },
          ] },
        website: { connected: true, platform: "wordpress", siteKey: "ss_live_p1_k7f3x9", verified: true, crawled: true, lastCrawl: Date.now() - 2 * 864e5, credential: { type: "Application Password", masked: "brig••••••••", status: "valid", addedAt: Date.now() - 20 * 864e5 },
          pages: [
            { id: "pg1", url: "/", name: "Home", updatedAt: Date.now() - 2 * 864e5, metaTitle: "Bright Smile Dental \u2014 Dentist in Midtown Manhattan", metaDesc: "Family & cosmetic dentistry on Madison Ave. Same-day appointments, gentle care. Book online.", dirty: false,
              content: [
                { id: "c1", kind: "heading", level: 1, text: "Manhattan's friendliest dental care" },
                { id: "c2", kind: "text", text: "From routine cleanings to full smile makeovers, our Madison Avenue clinic combines gentle care with modern equipment. Same-day appointments available for new patients.", links: [{ id: "lk1", phrase: "Same-day appointments", href: "https://brightsmiledental.com/book" }] },
                { id: "c3", kind: "image", src: "hero-office.jpg", alt: "Reception area of Bright Smile Dental Manhattan", title: "Bright Smile Dental office", dataUrl: null },
                { id: "c4", kind: "heading", level: 2, text: "Why patients choose us" },
                { id: "c5", kind: "text", text: "Over 1,200 five-star reviews, transparent pricing, and a team that actually explains what's happening. We accept most major insurance plans.", links: [] },
              ] },
            { id: "pg2", url: "/teeth-whitening", name: "Teeth Whitening", metaTitle: "Teeth Whitening NYC \u2014 Zoom In-Office | Bright Smile", metaDesc: "Professional Zoom teeth whitening in Manhattan. Up to 8 shades brighter in one visit.", dirty: false,
              content: [
                { id: "c6", kind: "heading", level: 1, text: "Teeth whitening in NYC" },
                { id: "c7", kind: "text", text: "In-office Zoom whitening lifts up to 8 shades in a single 90-minute visit. Includes a custom take-home touch-up kit.", links: [] },
                { id: "c8", kind: "image", src: "whitening-before-after.jpg", alt: "", title: "", dataUrl: null },
              ] },
            { id: "pg3", url: "/dental-implants", name: "Dental Implants", metaTitle: "Dental Implants Manhattan", metaDesc: "", dirty: false,
              content: [
                { id: "c9", kind: "heading", level: 1, text: "Dental implants" },
                { id: "c10", kind: "text", text: "Permanent, natural-looking replacements \u2014 consultation and 3D scan included.", links: [] },
              ] },
          ],
          blogs: [
            { id: "bl1", title: "How often should you whiten your teeth?", slug: "how-often-whiten-teeth", body: "Professional whitening is safe every 12–18 months...", status: "published", publishAt: null, createdAt: Date.now() - 14 * 864e5 },
            { id: "bl2", title: "Implants vs bridges: what lasts longer?", slug: "implants-vs-bridges", body: "Draft in progress...", status: "scheduled", publishAt: Date.now() + 3 * 864e5, createdAt: Date.now() - 2 * 864e5 },
          ] },
        social: {
          accounts: [
            { id: "fb", platform: "Facebook Page", connected: true, handle: "@brightsmilenyc", name: "Bright Smile Dental NYC", bio: "Midtown Manhattan family & cosmetic dentistry. Book online." },
            { id: "ig", platform: "Instagram Business", connected: true, handle: "@brightsmile.nyc", name: "Bright Smile Dental", bio: "Smiles made in Manhattan ✨ Whitening · Implants · Invisalign" },
            { id: "li", platform: "LinkedIn Page", connected: false, handle: "", name: "", bio: "" },
            { id: "x", platform: "X (Twitter)", connected: false, handle: "", name: "", bio: "" },
            { id: "yt", platform: "YouTube Channel", connected: false, handle: "", name: "", bio: "" },
            { id: "tt", platform: "TikTok Business", connected: false, handle: "", name: "", bio: "" },
            { id: "pin", platform: "Pinterest Business", connected: false, handle: "", name: "", bio: "" },
            { id: "th", platform: "Threads", connected: false, handle: "", name: "", bio: "" },
            { id: "bs", platform: "Bluesky", connected: false, handle: "", name: "", bio: "" },
          ],
          posts: [
            { id: "sp1", platforms: ["fb", "ig"], text: "Saturday appointments are here! Tag someone who keeps 'forgetting' the dentist 😁 Book at brightsmiledental.com", image: null, status: "published", publishAt: null, createdAt: Date.now() - 3 * 864e5 },
          ] },
      }),
      mkProject("p2", "Bright Smile — Brooklyn", "brooklyn.brightsmiledental.com", "#7C3AED", [
        seedEntry("brooklyn.brightsmiledental.com", "dentist near me", "Brooklyn", "Mobile", 240),
        seedEntry("brooklyn.brightsmiledental.com", "emergency dentist", "Brooklyn", "Mobile", 120),
        seedEntry("brooklyn.brightsmiledental.com", "root canal treatment", "Queens", "Mobile", 90, { rerunDays: 3 }),
      ]),
    ],
  },
  {
    id: "cl2", name: "Metro Plumbing Co.",
    contact: "Luis Romero", email: "luis@metroplumbing.co", phone: "+1 512 555 0190",
    companyName: "Metro Plumbing Co.", companyWebsite: "metroplumbing.co", address: "Austin, TX",
    whiteLabel: { enabled: false, name: "", website: "", logo: null },
    login: { enabled: false, email: "luis@metroplumbing.co", password: "", projectIds: ["p3"], canViewRanks: true, canDownload: true, canManageTasks: false, canComment: true },
    projects: [
      mkProject("p3", "Metro Plumbing — Austin", "metroplumbing.co", "#2456E6", [
        seedEntry("metroplumbing.co", "plumber near me", "Austin", "Mobile", 300),
        seedEntry("metroplumbing.co", "water heater repair", "Austin", "Desktop", 200),
        seedEntry("metroplumbing.co", "emergency plumber", "Round Rock", "Mobile", 150),
        seedEntry("metroplumbing.co", "drain cleaning", "Austin", "Mobile", 60, { engine: "Bing", rerunDays: 7 }),
      ]),
    ],
  },
  {
    id: "cl3", name: "Bloom & Vine",
    contact: "Imogen Hale", email: "imogen@bloomandvine.shop", phone: "+44 20 7946 0921",
    companyName: "Bloom & Vine Ltd.", companyWebsite: "bloomandvine.shop", address: "London, UK",
    whiteLabel: { enabled: true, name: "Bloom & Vine Insights", website: "bloomandvine.shop", logo: null },
    login: { enabled: true, email: "imogen@bloomandvine.shop", password: "bloom123", projectIds: ["p4"], canViewRanks: true, canDownload: true, canManageTasks: true, canComment: true, canUseAgent: true },
    /* white-label demo: this client runs on their OWN DataForSEO account */
    dfs: { useOwn: true, login: "", password: "" },
    projects: [
      mkProject("p4", "Bloom & Vine — London", "bloomandvine.shop", "#E11D48", [
        seedEntry("bloomandvine.shop", "florist near me", "London", "Mobile", 180),
        seedEntry("bloomandvine.shop", "same day flower delivery", "London", "Mobile", 180),
        seedEntry("bloomandvine.shop", "wedding flowers", "London", "Desktop", 90, { once: true }),
      ]),
    ],
  },
];

/* demo section grants (project.teamAccess[memberId][sectionKey]) — what each
   assigned team member can open once they sign in; managed per project in
   Project settings → Team. Without at least one grant a member sees nothing. */
{
  const grant = (cIdx, pId, mid, keys) => {
    const p = SEED_CLIENTS[cIdx].projects.find((x) => x.id === pId);
    if (p) p.teamAccess = { ...(p.teamAccess || {}), [mid]: Object.fromEntries(keys.map((k) => [k, true])) };
  };
  // any seed project with a hand-built opt gets newer sections (bing/apple/branding) merged in
  SEED_CLIENTS.forEach((c) => c.projects.forEach((pr) => { pr.opt = { ...mkOpt(), ...pr.opt }; }));
  grant(0, "p1", "u2", ["ranks", "geogrid", "gbp", "web", "records", "wiki", "chat", "webPages", "webPosts", "agent", "ads"]); // Rifat (Manager)
  grant(0, "p2", "u2", ["ranks", "web", "records"]);
  grant(2, "p4", "u3", ["ranks", "web"]); // Sara (Viewer)
  // demo: the Manhattan project is a two-location franchise with all three profiles live
  const p1 = SEED_CLIENTS[0].projects.find((x) => x.id === "p1");
  if (p1) {
    p1.integrations = { ...p1.integrations, bing: true, apple: true };
    const demoProf = (name, address) => ({ id: "demo-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name, address, account: "hannah@brightsmile.com", demo: true, connectedAt: Date.now() - 30 * 864e5 });
    p1.locations = [
      { id: "p1-loc1", name: "Midtown — 350 5th Ave", integrations: { gbp: true, bing: true, apple: true },
        profiles: { gbp: demoProf("Bright Smile Dental — Midtown", "350 5th Ave, New York, NY 10118"), bing: demoProf("Bright Smile Dental — Midtown", "350 5th Ave, New York, NY 10118"), apple: demoProf("Bright Smile Dental — Midtown", "350 5th Ave, New York, NY 10118") } },
      { id: "p1-loc2", name: "Upper East Side — Lexington Ave", integrations: { gbp: true, bing: true, apple: false },
        profiles: { gbp: demoProf("Bright Smile Dental — Upper East Side", "1032 Lexington Ave, New York, NY 10021"), bing: demoProf("Bright Smile Dental — Upper East Side", "1032 Lexington Ave, New York, NY 10021") } },
    ];
  }
  // demo ads: two connected (demo) accounts + three campaigns across platforms
  if (p1) {
    p1.ads = {
      accounts: {
        meta: { id: "demo-meta-p1", name: "Bright Smile Dental — Meta Ads", connected: true, demo: true, connectedAt: Date.now() - 40 * 864e5 },
        google: { id: "demo-google-p1", name: "Bright Smile Dental — Google Ads", connected: true, demo: true, connectedAt: Date.now() - 40 * 864e5 },
      },
      campaigns: [
        { id: "adc1", platform: "meta", objective: "Leads", name: "Whitening Special — Lead Gen", status: "active",
          budgetType: "daily", budget: 25, startDate: isoDate(new Date(Date.now() - 21 * 864e5)), endDate: "",
          targeting: { location: "Manhattan, New York", radiusKm: 12, ageMin: 25, ageMax: 60, genders: "All", interests: ["teeth whitening", "cosmetic dentistry"] },
          creative: { headline: "Whiter Smile in One Visit — $349", primaryText: "Midtown's ★★★★★ dentist. Zoom whitening, gentle care, same-day appointments. New patients get a full exam for $99.", description: "Book online in 60 seconds", cta: "Book now", landingUrl: "https://brightsmiledental.com/whitening" },
          createdAt: Date.now() - 22 * 864e5, launchedAt: Date.now() - 21 * 864e5, demo: true },
        { id: "adc2", platform: "google", objective: "Search — Leads", name: "Emergency Dentist — Search", status: "active",
          budgetType: "daily", budget: 40, startDate: isoDate(new Date(Date.now() - 45 * 864e5)), endDate: "",
          targeting: { location: "New York, NY", radiusKm: 20, ageMin: 18, ageMax: 99, genders: "All", interests: ["emergency dentist", "dentist near me", "tooth pain"] },
          creative: { headline: "Emergency Dentist — Seen Today", primaryText: "Tooth pain can't wait. Same-day emergency appointments in Midtown Manhattan.", description: "Open Saturdays · Insurance accepted", cta: "Call now", landingUrl: "https://brightsmiledental.com/emergency" },
          createdAt: Date.now() - 46 * 864e5, launchedAt: Date.now() - 45 * 864e5, demo: true },
        { id: "adc3", platform: "tiktok", objective: "Video views", name: "Smile Transformations — UGC", status: "paused",
          budgetType: "daily", budget: 15, startDate: isoDate(new Date(Date.now() - 12 * 864e5)), endDate: "",
          targeting: { location: "New York, NY", radiusKm: 25, ageMin: 18, ageMax: 40, genders: "All", interests: ["beauty", "self care"] },
          creative: { headline: "POV: your dentist is actually nice", primaryText: "Real patients, real transformations. Watch the glow-up.", description: "Bright Smile Dental — Midtown", cta: "Learn more", landingUrl: "https://brightsmiledental.com" },
          createdAt: Date.now() - 13 * 864e5, launchedAt: Date.now() - 12 * 864e5, demo: true },
      ],
    };
  }
  // demo board lists + a company-wide record template
  if (p1) {
    p1.lists = [{ id: "l1", name: "All Optimization Checklists" }, { id: "l2", name: "Monthly Tasks" }];
    (p1.records || []).forEach((r) => { r.listId = "l1"; });
  }
  // demo project chat: two team messages + a client reply, unread for the owner
  if (p1) {
    p1.chatMsgs = [
      { id: "cm1", ts: Date.now() - 26 * 3600000, author: "Rifat Hasan", text: "Schema markup is live on the Manhattan site — GBP posts for the whitening offer go out tomorrow." },
      { id: "cm2", ts: Date.now() - 22 * 3600000, author: "Dr. Hannah Park", text: "Great! Can we also highlight the Saturday appointments in the next post?", replyTo: "cm1", reactions: { "👍": ["Rifat Hasan"] } },
      { id: "cm3", ts: Date.now() - 3 * 3600000, author: "Rifat Hasan", text: "Absolutely — drafting it now, you'll see it in Records for approval today." },
    ];
    p1.chatReads = { "Rifat Hasan": Date.now() - 3 * 3600000 };
  }
}

