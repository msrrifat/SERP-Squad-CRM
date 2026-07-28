import React, { useMemo, useState } from "react";
import {
  BookOpen, FileText, ImagePlus, ListTree, MessageCircleQuestion,
  RefreshCw, Replace, Sparkles, Trash2, UploadCloud, X,
} from "lucide-react";
import { Card, Labeled, Modal, Toggle, inputCls, CharCount } from "../../ui/primitives.jsx";
import { aiGenerate, brandVoiceBlock } from "../../lib/aiwrite.jsx";
import { useWork } from "../../lib/worklog.jsx";
import { hashStr, mulberry32 } from "../../lib/rng.js";
import { escHtml } from "../../lib/text.jsx";

/* ================= Posts Architect =================
   Blog architecture for TOPICAL AUTHORITY + LOCAL PROXIMITY, in two
   categories that become real WordPress categories:
   - Blog:   generalized guides (pillar/cluster coverage per service)
   - Answer: one post per real question people ask about each service —
     mined from GSC queries when Google is connected, plus AI intelligence
     emulating Reddit / Quora / People-Also-Ask / AnswerThePublic sourcing.
   Content generation reads the LIVE Pages list for internal links, keeps a
   site-wide anchor-text memory so link anchors stay varied (branded, exact,
   partial, secondary, naked URL, generic), auto-inserts captioned images
   matched from the synced media library, and cross-checks every suggestion
   against existing pages/posts so old sites never get duplicates. */

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 70);
const cap = (s) => String(s).replace(/\b\w/g, (c) => c.toUpperCase());
const parseJsonLoose = (text) => { const m = String(text).match(/\{[\s\S]*\}/); return JSON.parse(m ? m[0] : text); };

/* ---------- markdown → editor blocks (Posts tab full editor) ----------
   Markdown links stay inline in text blocks — the editor renders them as
   highlighted anchor text. */
export function mdToBlocks(md) {
  const blocks = []; let i = 0;
  const bid = () => "mb" + Date.now().toString(36) + i++;
  let list = null;
  const flushList = () => { if (list) { blocks.push(list); list = null; } };
  String(md || "").split("\n").forEach((l) => {
    const h = l.match(/^(#{1,4})\s+(.*)/);
    const img = l.match(/^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/);
    const li = l.match(/^\s*[-*]\s+(.*)/);
    if (h) { flushList(); if (h[1].length > 1) blocks.push({ id: bid(), kind: "heading", level: Math.min(5, h[1].length), text: h[2] }); return; } // H1 = the post title, not a block
    if (img) { flushList(); blocks.push({ id: bid(), kind: "image", src: img[2], alt: img[1], title: img[1], dataUrl: null }); return; }
    if (li) { if (!list) list = { id: bid(), kind: "list", style: "bullet", items: [] }; list.items.push(li[1]); return; }
    if (/^\*[^*]+\*\s*$/.test(l)) { flushList(); blocks.push({ id: bid(), kind: "text", text: l, links: [] }); return; } // image caption line
    if (l.trim()) { flushList(); blocks.push({ id: bid(), kind: "text", text: l, links: [] }); }
  });
  flushList();
  return blocks.slice(0, 80);
}

/* ---------- markdown → WordPress HTML (figure/figcaption for images) ----------
   A caption line in *italics* directly under an image becomes its figcaption. */
export function mdToWpHtml(md) {
  const lines = String(md || "").split("\n");
  const out = [];
  let list = null; // "ul" | "ol"
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const inline = (t) => escHtml(t)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, a, h) => `<a href="${h}">${a}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const img = l.match(/^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/);
    if (img) {
      /* caption: next non-empty line if it's an italic one-liner */
      let capText = "";
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      const capM = (lines[j] || "").match(/^\*([^*]+)\*\s*$/);
      if (capM) { capText = capM[1].trim(); i = j; }
      out.push(`<figure class="wp-block-image"><img src="${escHtml(img[2])}" alt="${escHtml(img[1])}" loading="lazy" style="max-width:100%;height:auto;border-radius:8px" />${capText ? `<figcaption style="font-size:.85em;color:#6b7280;margin-top:.4em">${escHtml(capText)}</figcaption>` : ""}</figure>`);
      continue;
    }
    const h = l.match(/^(#{1,4})\s+(.*)/);
    if (h) { closeList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    const li = l.match(/^\s*[-*]\s+(.*)/);
    if (li) { if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(li[1])}</li>`); continue; }
    const oli = l.match(/^\s*\d+[.)]\s+(.*)/);
    if (oli) { if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(oli[1])}</li>`); continue; }
    if (!l.trim()) { closeList(); continue; }
    closeList(); out.push(`<p>${inline(l)}</p>`);
  }
  closeList();
  return out.join("\n");
}

/* ---------- anchor-text intelligence ----------
   Site-wide memory of which anchors + anchor TYPES were already used per
   target URL (opt.website.linkMemory). Each new post gets the LEAST-used
   type per target, so the profile stays naturally varied. */
export const ANCHOR_TYPES = ["exact", "partial", "branded", "secondary", "naked", "generic"];
const TYPE_HINT = {
  exact: (t) => `EXACT MATCH — the anchor is the target keyword itself ("${t.kw}")`,
  partial: (t) => `PARTIAL MATCH — a natural phrase containing part of "${t.kw}"`,
  branded: (t, brand) => `BRANDED — the anchor includes the brand name "${brand}"`,
  secondary: (t) => `SECONDARY KEYWORD — a closely-related variation of "${t.kw}", not the exact keyword`,
  naked: (t) => `NAKED URL — the visible anchor is the URL itself (${t.url})`,
  generic: () => `GENERIC — e.g. "learn more", "read this guide", "see details"`,
};
export function classifyAnchor(anchor, url, kw, brand) {
  const a = anchor.toLowerCase().trim(), k = (kw || "").toLowerCase(), b = (brand || "").toLowerCase();
  if (a === url.toLowerCase() || /^https?:\/\//.test(a)) return "naked";
  if (b && a.includes(b)) return "branded";
  if (k && a === k) return "exact";
  if (k && (a.includes(k) || k.split(" ").filter((w) => a.includes(w)).length >= Math.max(2, k.split(" ").length - 1))) return "partial";
  if (/learn more|read|this guide|see |details|here|full/.test(a)) return "generic";
  return "secondary";
}
export function assignAnchorTypes(targets, linkMemory = {}, brand) {
  return targets.map((t) => {
    const mem = linkMemory[t.url] || {};
    const counts = Object.fromEntries(ANCHOR_TYPES.map((ty) => [ty, mem[ty] || 0]));
    /* naked/generic are seasoning, not staples — cap their share */
    const total = ANCHOR_TYPES.reduce((n, ty) => n + counts[ty], 0);
    const order = [...ANCHOR_TYPES].sort((x, y) => counts[x] - counts[y]);
    let type = order.find((ty) => (ty !== "naked" && ty !== "generic") || counts[ty] < Math.max(1, total * 0.15)) || order[0];
    return { ...t, anchorType: type, usedAnchors: mem.anchors || [] };
  });
}
export function recordAnchors(setOpt, md, targets, brand) {
  const found = [...String(md).matchAll(/\[([^\]]+)\]\((\/[^)\s]*)\)/g)].map((m) => ({ anchor: m[1], url: m[2] }));
  if (!found.length) return;
  setOpt("website", (cur) => {
    const mem = JSON.parse(JSON.stringify(cur?.linkMemory || {}));
    found.forEach(({ anchor, url }) => {
      const t = targets.find((x) => x.url === url);
      const type = classifyAnchor(anchor, url, t?.kw || "", brand);
      mem[url] = mem[url] || {};
      mem[url][type] = (mem[url][type] || 0) + 1;
      mem[url].anchors = [...new Set([...(mem[url].anchors || []), anchor])].slice(-20);
    });
    return { linkMemory: mem };
  });
}

/* ---------- duplicate detection vs the live site ---------- */
const tokens = (s) => new Set(String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2));
const jaccard = (a, b) => { const A = tokens(a), B = tokens(b); if (!A.size || !B.size) return 0; let n = 0; A.forEach((w) => B.has(w) && n++); return n / (A.size + B.size - n); };
export function findDuplicate(item, pages = [], blogs = []) {
  const slug = item.slug || item.url?.split("/").filter(Boolean).pop() || "";
  for (const b of blogs) {
    if (b.slug && slug && (b.slug === slug || b.slug.includes(slug) || slug.includes(b.slug))) return { kind: "post", title: b.title, url: "/blog/" + b.slug, id: b.id };
    if (jaccard(item.title, b.title) >= 0.55) return { kind: "post", title: b.title, url: "/blog/" + (b.slug || ""), id: b.id };
  }
  for (const p of pages) {
    const pslug = (p.url || "").split("/").filter(Boolean).pop() || "";
    if (slug && pslug && pslug === slug) return { kind: "page", title: p.name || p.metaTitle || p.url, url: p.url, id: p.id };
    if (jaccard(item.title, p.name || p.metaTitle) >= 0.6) return { kind: "page", title: p.name || p.metaTitle || p.url, url: p.url, id: p.id };
  }
  return null;
}

/* ---------- AI prompts ---------- */
const SYS_POSTS_ARCHITECT = `You are a senior SEO strategist who builds TOPICAL AUTHORITY maps for business blogs.
You design post architectures in exactly TWO categories:
- "blog": generalized guides that build pillar/cluster topical authority per service (cost guides, comparisons, processes, mistakes, checklists, seasonal and LOCAL-PROXIMITY angles that weave the market's city/region into topics where search behavior is local).
- "answer": one post per REAL question people ask about each specific service — the questions asked on Reddit threads, Quora, People-Also-Ask boxes, AnswerThePublic and Google autocomplete. Titles are the question, verbatim style ("How much does X cost in CITY?", "Can you X without Y?").
Rules:
- Cover EVERY provided service with both categories. No two posts targeting the same query (no cannibalization).
- When real Search Console queries are provided, prioritize turning genuine question-style queries into "answer" posts.
- Slugs: kebab-case, short, no stop words. Each post names the ONE service page it supports.
Return STRICT JSON only: {"posts":[{"category":"blog"|"answer","title":string,"slug":string,"primaryKw":string,"service":string,"serviceUrl":string,"note":string}]}`;

const SYS_POST_WRITER = `You are an expert SEO blog writer and technical on-page SEO. Write for humans first — concrete, useful, zero filler.
Output EXACTLY this format:
---META---
Title: <meta title ≤60 chars, keyword front-loaded>
Description: <meta description ≤160 chars>
---CONTENT---
<pure markdown post>
Rules:
- One H1 (the post title). Logical ## sections; answer posts open with a direct 2-3 sentence answer to the question (featured-snippet ready) before elaborating.
- INTERNAL LINKING (critical): the LINK PLAN lists every URL to include EXACTLY ONCE as [anchor](url), each with an assigned ANCHOR TYPE you must follow precisely. Never reuse any listed previously-used anchor. Weave links into sentences naturally.
- Cite business facts from the brand block exactly; never invent details, prices you weren't given, or reviews.
- FAQ section at the end for answer posts (2-3 related questions).
- Meet the word target. Follow the brand voice block exactly.`;

/* ---------- deterministic fallback (no AI key → labeled draft) ---------- */
function draftArchitecture(services, market, niche) {
  const posts = [];
  services.forEach((sv) => {
    const s = sv.name.toLowerCase();
    const r = mulberry32(hashStr(s + market));
    const city = (market.split(",")[0] || "").trim();
    [[`${cap(s)} Cost Guide${city ? ` in ${city}` : ""}: What You'll Actually Pay`, `${s} cost ${city}`.trim()],
     [`How to Choose a ${cap(s)} Provider: ${5 + Math.floor(r() * 3)} Things to Check`, `best ${s} provider`],
    ].forEach(([title, kw]) => posts.push({ category: "blog", title, slug: slugify(title), primaryKw: kw, service: sv.name, serviceUrl: sv.url, note: "pillar/cluster guide" }));
    [[`How much does ${s} cost${city ? ` in ${city}` : ""}?`, `how much does ${s} cost`],
     [`How long does ${s} take?`, `how long does ${s} take`],
     [`Can I do ${s} myself or should I hire a pro?`, `${s} diy vs professional`],
    ].forEach(([title, kw]) => posts.push({ category: "answer", title, slug: slugify(title), primaryKw: kw, service: sv.name, serviceUrl: sv.url, note: "PAA/Reddit-style question" }));
  });
  return posts;
}

/* ---------- media matching: title+alt scored against post terms ---------- */
export function matchMedia(media = [], post, sections = [], count = 2) {
  const terms = tokens(`${post.title} ${post.primaryKw} ${post.service} ${sections.join(" ")}`);
  return media
    .filter((m) => (m.type ? m.type === "image" : true) && m.url)
    .map((m) => { const mt = tokens(`${m.name || m.title || ""} ${m.alt || ""}`); let score = 0; mt.forEach((w) => terms.has(w) && score++); return { ...m, score }; })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}
export function insertImages(md, images, brand) {
  if (!images.length) return md;
  const lines = md.split("\n");
  /* place after the 2nd and 4th H2 (or append) with a caption line under each */
  let h2Seen = 0, placed = 0;
  const out = [];
  for (const l of lines) {
    out.push(l);
    if (/^##\s/.test(l)) {
      h2Seen++;
      if ((h2Seen === 2 || h2Seen === 4) && placed < images.length) {
        const im = images[placed++];
        const alt = im.alt || im.name || im.title || brand;
        out.push("", `![${alt}](${im.url})`, `*${cap(alt)}${brand ? ` — ${brand}` : ""}*`, "");
      }
    }
  }
  while (placed < images.length) { const im = images[placed++]; const alt = im.alt || im.name || brand; out.push("", `![${alt}](${im.url})`, `*${cap(alt)}${brand ? ` — ${brand}` : ""}*`); }
  return out.join("\n");
}

/* ---------- GSC question mining ---------- */
async function fetchGscQuestions(google, services) {
  if (!google?.connectionId || !google?.gscSite) return null;
  try {
    const r = await fetch("/api/google/gsc/query", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(45000),
      body: JSON.stringify({ connectionId: google.connectionId, siteUrl: google.gscSite, days: 180 }) });
    if (!r.ok) return null;
    const d = await r.json();
    const svWords = tokens(services.map((s) => s.name).join(" "));
    const isQ = (q) => /^(how|what|why|when|where|who|which|can|do|does|is|are|should|will|vs)\b/.test(q) || / near me$| cost| price| worth/.test(q);
    return (d.queries || d.rows || []).map((row) => row.query || row.keys?.[0]).filter(Boolean)
      .filter((q) => isQ(q.toLowerCase()) || [...tokens(q)].some((w) => svWords.has(w)))
      .slice(0, 50);
  } catch { return null; }
}

const CatChip = ({ cat }) => (
  <span className="rounded-full px-1.5 py-px text-[8.5px] font-bold uppercase"
    style={cat === "answer" ? { background: "#EDE9FE", color: "#5B21B6" } : { background: "#DBEAFE", color: "#1D4ED8" }}>
    {cat === "answer" ? "Answer" : "Blog"}
  </span>
);
const LiveChip = ({ live, provider }) => (
  <span className="rounded-full px-1.5 py-px text-[8.5px] font-bold uppercase"
    style={live ? { background: "#DCFCE7", color: "#166534" } : { background: "#FEF3C7", color: "#92400E" }}>
    {live ? `AI · ${provider || "live"}` : "draft"}
  </span>
);

/* ================= the tab ================= */
export function PostsArchitectTab({ opt, setOpt, accent, log, project, aiConfig = null }) {
  const work = useWork();
  const w = opt.website || {};
  const plan = w.postsPlan || null;
  const posts = plan?.posts || [];
  const brand = project.name.split(" — ")[0];
  const brandVoice = opt.brandVoice || {};
  const brandProps = opt.branding?.properties || null;
  const c0 = project.tracking?.[0]?.city;
  const market = c0 ? `${c0.city},${c0.region},${c0.country}` : "United States";
  const media = w.media || [];
  const livePages = w.pages || [];
  const liveBlogs = w.blogs || [];
  const google = project.google || {};

  /* services: live service pages first (the real site), then the architecture map */
  const services = useMemo(() => {
    const out = [];
    livePages.forEach((p) => { if (/^\/services\//.test(p.url || "") || p.url?.split("/").filter(Boolean).length === 1 && /clean|repair|install|service|removal|remodel/.test(p.url)) out.push({ name: p.name || p.url.split("/").pop().replace(/-/g, " "), url: p.url }); });
    const walk = (nodes) => (nodes || []).forEach((n) => { if (n.type === "service") out.push({ name: n.title, url: n.url }); walk(n.children); });
    walk(w.architecture?.tree);
    const seen = new Set();
    return out.filter((s) => { const k = s.url; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12);
  }, [livePages, w.architecture]);
  const [svcDraft, setSvcDraft] = useState("");
  const svcList = svcDraft.trim()
    ? svcDraft.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).map((name) => ({ name, url: services.find((s) => s.name.toLowerCase() === name.toLowerCase())?.url || "/services/" + slugify(name) }))
    : services;

  const [busy, setBusy] = useState(false);
  const [genErr, setGenErr] = useState(null);
  const [gscNote, setGscNote] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [publishing, setPublishing] = useState(false);

  const patchPost = (id, patch) => setOpt("website", (cur) => ({
    postsPlan: { ...(cur?.postsPlan || {}), posts: (cur?.postsPlan?.posts || []).map((p) => p.id === id ? { ...p, ...(typeof patch === "function" ? patch(p) : patch) } : p) },
  }));

  const architect = async () => {
    if (!svcList.length) { setGenErr("No services found — generate the Website Mapping first, or type services below."); return; }
    setBusy(true); setGenErr(null); setGscNote(null);
    const gscQs = await fetchGscQuestions(google, svcList);
    if (gscQs?.length) setGscNote(`${gscQs.length} real Search Console queries fed into the architecture.`);
    let list = null, live = false;
    try {
      const text = await aiGenerate(aiConfig, {
        system: SYS_POSTS_ARCHITECT, json: true, maxTokens: 4000,
        prompt: `Business: ${brand} (${project.website}). Niche: ${w.architecture?.niche || project.name}. Market: ${market}.\nServices (each MUST get blog + answer coverage; use the EXACT serviceUrl given):\n${svcList.map((s) => `- ${s.name} → ${s.url}`).join("\n")}\n${gscQs?.length ? `\nREAL Search Console queries from this site's last 180 days (turn genuine questions into "answer" posts):\n${gscQs.join("\n")}` : ""}\nExisting posts (do NOT duplicate their topics):\n${liveBlogs.slice(0, 30).map((b) => "- " + b.title).join("\n") || "(none)"}\n\nDesign 2-3 "blog" + 3-4 "answer" posts per service. Local proximity: this business serves ${market} — weave the location into topics where locals search locally.`,
      });
      const parsed = parseJsonLoose(text);
      if (!Array.isArray(parsed.posts) || !parsed.posts.length) throw new Error("empty architecture");
      list = parsed.posts.map((p) => ({
        category: p.category === "answer" ? "answer" : "blog",
        title: String(p.title || "").slice(0, 140), slug: slugify(p.slug || p.title),
        primaryKw: String(p.primaryKw || "").slice(0, 80), service: String(p.service || ""),
        serviceUrl: svcList.find((s) => s.url === p.serviceUrl)?.url || svcList.find((s) => s.name.toLowerCase() === String(p.service).toLowerCase())?.url || svcList[0]?.url || "",
        note: String(p.note || ""),
      })).filter((p) => p.title);
      live = true;
    } catch (e) {
      if (e.code === 502) { setGenErr("AI provider error: " + e.message); setBusy(false); return; }
      await new Promise((r) => setTimeout(r, 900));
      list = draftArchitecture(svcList, market, w.architecture?.niche || "");
    }
    /* duplicate cross-check against the LIVE site */
    /* posts only match existing POSTS — a service page sharing words with a
       post title is not a duplicate of it */
    const withDup = list.map((p, i) => ({
      id: "pa" + Date.now().toString(36) + i, ...p, status: "planned", content: null,
      dup: findDuplicate(p, [], liveBlogs),
    }));
    setOpt("website", (cur) => ({ postsPlan: { generatedAt: Date.now(), live, provider: aiConfig?.provider, posts: withDup } }));
    const dups = withDup.filter((p) => p.dup).length;
    work?.("website", "postsArchitected", { detail: `${withDup.length} posts${dups ? `, ${dups} possible duplicates` : ""}` });
    log?.(`Architected ${withDup.length} blog/answer posts${live ? " (AI)" : " (draft)"}${dups ? ` — ${dups} duplicate warnings` : ""}`, project.name);
    setBusy(false);
  };

  const openPost = posts.find((p) => p.id === openId);
  const activePosts = posts.filter((p) => p.status !== "removed" && !p.useExisting);
  const dupPosts = posts.filter((p) => p.dup && p.status !== "removed" && !p.useExisting && !p.dupResolved);
  const written = activePosts.filter((p) => p.content).length;

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <div className="ll-display flex items-center gap-2 text-[15px] font-semibold"><ListTree size={15} style={{ color: accent }} /> Posts Architect
          {plan && <LiveChip live={plan.live} provider={plan.provider} />}
        </div>
        <div className="text-[11.5px] leading-relaxed text-gray-400">
          Architects the blog for <b>topical authority</b> and <b>local proximity</b> in two live categories:
          <b> Blog</b> (generalized guides per service) and <b>Answer</b> (the questions people actually ask about each service on
          Reddit, Quora, People-Also-Ask and AnswerThePublic{google.connectionId && google.gscSite ? <> — plus <b>real Search Console queries</b> from this site</> : ""}).
          Content generation links to the live service pages with varied anchor text and pulls captioned images from the media library.
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400">Services covered:</span>
          {svcList.map((s) => <span key={s.url} className="ll-mono rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600" title={s.url}>{s.name}</span>)}
          {svcList.length === 0 && <span className="text-[11px] text-amber-600">none found — type them below or run Website Mapping first</span>}
        </div>
        <Labeled label="Override services (optional, comma-separated — otherwise pulled from live pages + site map)">
          <input value={svcDraft} onChange={(e) => setSvcDraft(e.target.value)} placeholder="drain cleaning, water heater repair" className={inputCls} />
        </Labeled>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={architect} disabled={busy}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
            {busy ? <><RefreshCw size={13} className="animate-spin" /> Architecting posts…</> : <><Sparkles size={13} /> {posts.length ? "Re-architect posts" : "Architect blog & answer posts"}</>}
          </button>
          <span className="text-[10.5px] text-gray-400">
            {google.connectionId && google.gscSite ? "✓ Search Console connected — real queries feed the plan" : "Connect Google (Website Performance tab) to feed real GSC queries into the plan"}
          </span>
        </div>
        {gscNote && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">{gscNote}</div>}
        {genErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-700">{genErr}</div>}
      </Card>

      {posts.length > 0 && (
        <div className={"grid gap-4 " + (dupPosts.length ? "lg:grid-cols-[1fr,300px]" : "")}>
          <div className="space-y-4">
            {["blog", "answer"].map((cat) => {
              const list = activePosts.filter((p) => p.category === cat);
              if (!list.length) return null;
              return (
                <Card key={cat} className="p-4">
                  <div className="ll-display mb-2 flex items-center gap-2 text-[13.5px] font-semibold">
                    {cat === "blog" ? <BookOpen size={14} style={{ color: accent }} /> : <MessageCircleQuestion size={14} style={{ color: accent }} />}
                    {cat === "blog" ? "Blog — guides & topical authority" : "Answer — real questions per service"}
                    <span className="text-[11px] font-normal text-gray-400">{list.length} posts · category "{cat === "blog" ? "Blog" : "Answer"}" on WordPress</span>
                  </div>
                  <div className="space-y-1">
                    {list.map((p) => (
                      <div key={p.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                        <CatChip cat={p.category} />
                        <button onClick={() => setOpenId(p.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                          <span className="truncate text-[12.5px] font-medium text-gray-800">{p.title}</span>
                          <span className="ll-mono hidden shrink-0 text-[9.5px] text-gray-400 sm:inline">→ {p.serviceUrl}</span>
                          {p.dup && !p.dupResolved && <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-px text-[8.5px] font-bold uppercase text-amber-700">possible duplicate</span>}
                          {p.content && <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-px text-[8.5px] font-bold uppercase text-emerald-700">{p.status === "published" ? "published" : "written"}</span>}
                        </button>
                        <button onClick={() => patchPost(p.id, { status: "removed" })} className="shrink-0 rounded p-1 text-gray-300 opacity-0 hover:text-red-500 group-hover:opacity-100"><Trash2 size={12} /></button>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
            <Card className="flex flex-wrap items-center gap-3 p-4">
              <button onClick={() => setPublishing(true)} disabled={!written}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-40" style={{ background: accent }}>
                <UploadCloud size={14} /> Publish written posts ({written})
              </button>
              <span className="text-[10.5px] leading-relaxed text-gray-400">
                Posts go to WordPress <b>Posts</b> under their category (Blog / Answer) on a schedule.
                Click any post above to generate its content first — {written}/{activePosts.length} written so far.
              </span>
            </Card>
          </div>

          {/* ---- duplicate cross-check panel (right side) ---- */}
          {dupPosts.length > 0 && (
            <Card className="h-fit space-y-2 p-4">
              <div className="ll-display flex items-center gap-2 text-[13px] font-semibold text-amber-700"><Replace size={13} /> Already on the site?</div>
              <div className="text-[10.5px] leading-relaxed text-gray-400">These suggestions look like existing pages/posts. Remove the suggestion, or keep the existing one (internal links will point at it instead).</div>
              {dupPosts.map((p) => (
                <div key={p.id} className="space-y-1.5 rounded-xl border border-amber-100 bg-amber-50/50 p-2.5">
                  <div className="text-[11.5px] font-semibold text-gray-800">{p.title}</div>
                  <div className="flex items-center gap-1.5 text-[10.5px] text-gray-500">
                    <span className="rounded bg-white px-1.5 py-px text-[8.5px] font-bold uppercase text-gray-500">existing {p.dup.kind}</span>
                    <span className="ll-mono truncate">{p.dup.url}</span>
                  </div>
                  <div className="truncate text-[10.5px] text-gray-500">"{p.dup.title}"</div>
                  <div className="flex gap-1.5">
                    <button onClick={() => patchPost(p.id, { status: "removed" })}
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-gray-600 hover:text-red-600">Remove suggestion</button>
                    <button onClick={() => patchPost(p.id, { useExisting: p.dup.url, dupResolved: true })}
                      className="flex-1 rounded-lg px-2 py-1 text-[10.5px] font-semibold text-white" style={{ background: accent }}>Keep existing</button>
                  </div>
                  <button onClick={() => patchPost(p.id, { dupResolved: true })} className="w-full text-center text-[9.5px] font-semibold text-gray-400 hover:text-gray-600">Not a duplicate — keep both</button>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {openPost && (
        <PostWriter post={openPost} opt={opt} setOpt={setOpt} accent={accent} project={project} ai={aiConfig}
          brand={brand} brandVoice={brandVoice} brandProps={brandProps} market={market} media={media}
          livePages={livePages} liveBlogs={liveBlogs} allPosts={activePosts}
          onPatch={(patch) => patchPost(openPost.id, patch)} onClose={() => setOpenId(null)} />
      )}
      {publishing && (
        <PublishPostsModal posts={activePosts.filter((p) => p.content && p.status !== "published")} opt={opt} setOpt={setOpt}
          accent={accent} project={project} log={log} onDone={(ids, live) => {
            ids.forEach((id) => patchPost(id, { status: "published" }));
          }} onClose={() => setPublishing(false)} />
      )}
    </div>
  );
}

/* ================= per-post writer ================= */
function PostWriter({ post, opt, setOpt, accent, project, ai, brand, brandVoice, brandProps, market, media, livePages, liveBlogs, allPosts, onPatch, onClose }) {
  const work = useWork();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [autoImages, setAutoImages] = useState(media.length > 0);
  const w = opt.website || {};

  /* link targets from the LIVE site: the money page first, then variety */
  const buildTargets = () => {
    const targets = [];
    const push = (url, title, kw) => { if (url && !targets.some((t) => t.url === url)) targets.push({ url, title, kw: kw || title }); };
    push(post.serviceUrl, post.service || "service page", post.service ? `${post.service.toLowerCase()} ${market.split(",")[0]}`.trim() : "");
    /* a sibling service (topical breadth) */
    const sib = livePages.find((p) => /^\/services\//.test(p.url || "") && p.url !== post.serviceUrl);
    if (sib) push(sib.url, sib.name || sib.url, (sib.name || "").toLowerCase());
    /* related posts from the plan: blog↔answer cross-link on the same service
       first (the cluster's strongest signal), then a same-category sibling */
    const postUrl = (x) => "/" + (x.category === "answer" ? "answers" : "blog") + "/" + x.slug;
    const rels = allPosts.filter((x) => x.id !== post.id && (x.content || x.status === "published"));
    const crossCat = rels.find((x) => x.service === post.service && x.category !== post.category);
    if (crossCat) push(postUrl(crossCat), crossCat.title, crossCat.primaryKw);
    const sameCat = rels.find((x) => x.service === post.service && x.category === post.category);
    if (sameCat) push(postUrl(sameCat), sameCat.title, sameCat.primaryKw);
    if (!crossCat && !sameCat) { const lb = liveBlogs.find((b) => jaccard2(b.title, post.title) > 0.15); if (lb) push("/blog/" + (lb.slug || ""), lb.title, ""); }
    const contact = livePages.find((p) => /contact/.test(p.url || ""));
    if (contact) push(contact.url, "contact page", `contact ${brand.toLowerCase()}`);
    const home = livePages.find((p) => p.url === "/");
    if (home) push("/", brand, brand.toLowerCase());
    return targets.slice(0, 6);
  };
  function jaccard2(a, b) { const A = tokens2(a), B = tokens2(b); if (!A.size || !B.size) return 0; let n = 0; A.forEach((x) => B.has(x) && n++); return n / (A.size + B.size - n); }
  function tokens2(s) { return new Set(String(s || "").toLowerCase().split(/\W+/).filter((x) => x.length > 2)); }

  const generate = async () => {
    setBusy(true); setErr(null);
    const targets = assignAnchorTypes(buildTargets(), w.linkMemory || {}, brand);
    const linkPlanText = targets.map((t) =>
      `- ${t.url} — "${t.title}" — anchor type: ${TYPE_HINT[t.anchorType](t, brand)}${t.usedAnchors.length ? ` — previously used anchors you must NOT repeat: ${t.usedAnchors.map((a) => `"${a}"`).join(", ")}` : ""}`).join("\n");
    try {
      const text = await aiGenerate(ai, {
        system: SYS_POST_WRITER, maxTokens: 6000,
        prompt: `BRAND VOICE & BUSINESS FACTS (must follow):\n${brandVoiceBlock(brandVoice, brand, brandProps)}\n\nPOST: "${post.title}" (category: ${post.category === "answer" ? "Answer — a real question people ask" : "Blog — a guide"}).\nPrimary keyword: "${post.primaryKw}". Supports service page: ${post.serviceUrl}. Market: ${market}.\nWord target: ${post.category === "answer" ? 900 : 1400}+ words.\n\nLINK PLAN (every URL exactly once, anchor types are assignments, not suggestions):\n${linkPlanText || "(no internal targets yet)"}\n\nWrite the complete post now in the required ---META---/---CONTENT--- format.`,
      });
      const metaM = text.match(/---META---([\s\S]*?)---CONTENT---/);
      const contentM = text.match(/---CONTENT---([\s\S]*)$/);
      let md = (contentM ? contentM[1] : text).trim();
      if (!/^#\s/m.test(md)) md = `# ${post.title}\n\n` + md;
      if (autoImages) {
        const secs = [...md.matchAll(/^##\s+(.*)$/gm)].map((m) => m[1]);
        md = insertImages(md, matchMedia(media, post, secs, 2), brand);
      }
      const metaTitle = (metaM?.[1].match(/Title:\s*(.+)/) || [])[1]?.trim() || post.title.slice(0, 60);
      const metaDesc = (metaM?.[1].match(/Description:\s*(.+)/) || [])[1]?.trim() || "";
      recordAnchors(setOpt, md, targets, brand);
      onPatch({ status: "written", content: { generatedAt: Date.now(), live: true, provider: ai?.provider, markdown: md, metaTitle, metaDesc, wordCount: md.split(/\s+/).length } });
      work?.("website", "postWritten", { detail: post.title });
    } catch (e) {
      if (e.code === 502) { setErr("AI provider error: " + e.message); setBusy(false); return; }
      /* labeled draft fallback */
      await new Promise((r) => setTimeout(r, 800));
      const targets2 = targets;
      let md = `# ${post.title}\n\n${post.category === "answer" ? `**Short answer:** it depends on your situation — here's exactly how to think about ${post.primaryKw}.` : `Everything you need to know about ${post.primaryKw}, from ${brand}.`}\n\n`;
      md += `## ${cap(post.primaryKw)}: The Essentials\n\nOur team at ${brand} handles ${post.service || "this"} every week${targets2[0] ? ` — see our ${anchorFor(targets2[0], brand)} for the full service` : ""}.\n\n`;
      md += `## What It Means for You\n\n- Clear, honest guidance\n- Transparent pricing\n- Local expertise in ${market.split(",")[0]}\n\n`;
      md += `## Next Steps\n\n${targets2.filter((t, i) => i > 0).map((t) => anchorFor(t, brand)).join(" · ")}\n\n`;
      if (autoImages) md = insertImages(md, matchMedia(media, post, [], 2), brand);
      recordAnchors(setOpt, md, targets2, brand);
      onPatch({ status: "written", content: { generatedAt: Date.now(), live: false, markdown: md, metaTitle: post.title.slice(0, 60), metaDesc: `${cap(post.primaryKw)} explained by ${brand}.`, wordCount: md.split(/\s+/).length } });
      work?.("website", "postWritten", { detail: post.title });
    }
    setBusy(false);
  };
  const anchorFor = (t, brand2) => {
    const a = t.anchorType === "exact" ? t.kw : t.anchorType === "branded" ? `${brand2} ${t.title}`.trim()
      : t.anchorType === "naked" ? project.website + t.url : t.anchorType === "generic" ? "learn more" : t.title.toLowerCase();
    return `[${a}](${t.url})`;
  };

  const c = post.content;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-3" onClick={onClose}>
      <div className="flex h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
          <FileText size={15} style={{ color: accent }} />
          <div className="min-w-0 flex-1">
            <div className="ll-display flex items-center gap-2 truncate text-[14px] font-semibold">{post.title} <CatChip cat={post.category} /></div>
            <div className="ll-mono text-[10.5px] text-gray-400">/{post.category === "answer" ? "answers" : "blog"}/{post.slug} · supports {post.serviceUrl} · kw "{post.primaryKw}" · <span className="text-emerald-600">✓ auto-saves</span></div>
          </div>
          <button onClick={onClose} title="Content is already saved to the plan — close and continue anytime"
            className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-[11.5px] font-semibold text-gray-600 hover:border-gray-300">Save &amp; close</button>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X size={16} /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {post.dup && !post.dupResolved && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11.5px] text-amber-800">
              <b>Possible duplicate:</b> existing {post.dup.kind} <span className="ll-mono">{post.dup.url}</span> ("{post.dup.title}"). Resolve it in the panel on the main list before publishing.
            </div>
          )}
          <Card className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled label="Post title"><input value={post.title} onChange={(e) => onPatch({ title: e.target.value })} className={inputCls} /></Labeled>
              <Labeled label="Primary keyword"><input value={post.primaryKw} onChange={(e) => onPatch({ primaryKw: e.target.value })} className={inputCls} /></Labeled>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Toggle on={autoImages} onChange={setAutoImages} label={`Auto-insert images from Media (${media.length} synced)`}
                desc="Matches library images by title + alt text to this post's topic; every image gets a caption underneath." />
            </div>
            <button onClick={generate} disabled={busy}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
              {busy ? <><RefreshCw size={13} className="animate-spin" /> Writing…</> : <><Sparkles size={13} /> {c ? "Regenerate content" : "Generate content"}</>}
            </button>
            <div className="text-[10.5px] leading-relaxed text-gray-400">
              The writer links to the live service page and related content with <b>assigned anchor types</b> (exact, partial, branded,
              secondary, naked, generic) balanced against every anchor already used across the site — no repeated anchors, no over-optimization.
            </div>
            {err && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-700">{err}</div>}
          </Card>
          {c && (
            <Card className="space-y-2.5 p-4">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                <b className="text-gray-700">Content</b> <LiveChip live={c.live} provider={c.provider} /> · {c.wordCount} words
                {(c.markdown.match(/\]\(\//g) || []).length > 0 && <span className="rounded-full bg-blue-50 px-1.5 py-px text-[8.5px] font-bold uppercase text-blue-700">{(c.markdown.match(/\]\(\//g) || []).length} internal links</span>}
                {(c.markdown.match(/^!\[/gm) || []).length > 0 && <span className="rounded-full bg-purple-50 px-1.5 py-px text-[8.5px] font-bold uppercase text-purple-700"><ImagePlus size={9} className="mr-0.5 inline" />{(c.markdown.match(/^!\[/gm) || []).length} captioned images</span>}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Labeled label={<span className="flex items-center justify-between">Meta title <CharCount value={c.metaTitle || ""} max={60} /></span>}>
                  <input value={c.metaTitle || ""} onChange={(e) => onPatch((cur) => ({ content: { ...cur.content, metaTitle: e.target.value } }))} className={inputCls} />
                </Labeled>
                <Labeled label={<span className="flex items-center justify-between">Meta description <CharCount value={c.metaDesc || ""} max={160} /></span>}>
                  <input value={c.metaDesc || ""} onChange={(e) => onPatch((cur) => ({ content: { ...cur.content, metaDesc: e.target.value } }))} className={inputCls} />
                </Labeled>
              </div>
              <textarea value={c.markdown} onChange={(e) => onPatch((cur) => ({ content: { ...cur.content, markdown: e.target.value, wordCount: e.target.value.split(/\s+/).length } }))}
                rows={16} className={"ll-mono " + inputCls + " resize-y text-[11.5px] leading-relaxed"} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= publish modal (schedule → WP posts w/ categories) ================= */
function PublishPostsModal({ posts, opt, setOpt, accent, project, log, onDone, onClose }) {
  const work = useWork();
  const w = opt.website || {};
  const credStr = typeof w.credential === "string" ? w.credential : (w.credential?.value || "");
  const canLive = w.platform === "wordpress" && /:/.test(credStr);
  const [mode, setMode] = useState(canLive ? "live" : "demo");
  const live = mode === "live" && canLive;
  const [start, setStart] = useState(new Date(Date.now() + 864e5).toISOString().slice(0, 10));
  const [every, setEvery] = useState(3);
  /* per-post dates: seeded by the drip cadence, then editable ROW BY ROW —
     a date of today (or past) publishes immediately, future = WP scheduled */
  const seedDates = (startISO, everyDays) => posts.map((_, i) =>
    new Date(new Date((startISO || new Date().toISOString().slice(0, 10)) + "T09:00:00").getTime() + i * Math.max(1, +everyDays || 3) * 864e5).toISOString().slice(0, 10));
  const [dates, setDates] = useState(() => seedDates(start, every));
  const reseed = (s, ev) => setDates(seedDates(s, ev));
  const [progress, setProgress] = useState(null);
  const [done, setDone] = useState(false);

  const publish = async () => {
    const rows = posts.map((p) => ({ title: p.title, status: "pending", note: "" }));
    setProgress([...rows]);
    const mark = (i, status, note = "") => { rows[i] = { ...rows[i], status, note }; setProgress([...rows]); };
    const doneIds = [];
    for (let i = 0; i < posts.length; i++) {
      const p = posts[i];
      mark(i, "creating");
      const when = new Date((dates[i] || start) + "T09:00:00");
      const scheduled = when.getTime() > Date.now();
      if (live) {
        try {
          const r = await fetch("/api/wp/deploy", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(60000),
            body: JSON.stringify({ site: project.website, credential: credStr, payload: {
              kind: "post", slug: p.slug, title: p.title, metaTitle: p.content.metaTitle, metaDesc: p.content.metaDesc,
              content: mdToWpHtml(p.content.markdown.replace(/^#\s.*\n/, "")),
              categories: [p.category === "answer" ? "Answer" : "Blog"],
              ...(scheduled ? { status: "future", date: when.toISOString() } : { status: "publish" }),
            } }) });
          const d = await r.json().catch(() => ({}));
          if (r.ok) { mark(i, "done", scheduled ? "scheduled " + when.toISOString().slice(0, 10) : "published"); doneIds.push(p.id); }
          else { mark(i, "error", d.detail || `HTTP ${r.status}`); continue; }
        } catch (e) { mark(i, "error", String(e?.message || e)); continue; }
      } else {
        await new Promise((r) => setTimeout(r, 120));
        mark(i, "done", "demo"); doneIds.push(p.id);
      }
      /* mirror into the Posts tab list */
      setOpt("website", (cur) => ({
        blogs: [
          { id: "pb" + Date.now() + i, title: p.title, slug: p.slug, metaTitle: p.content.metaTitle, metaDesc: p.content.metaDesc,
            content: mdToBlocks(p.content.markdown), categories: [p.category === "answer" ? "Answer" : "Blog"],
            ...(scheduled ? { status: "scheduled", scheduledAt: when.getTime() } : { status: "published", publishedAt: Date.now() }),
            createdAt: Date.now(), demo: !live },
          ...(cur.blogs || []).filter((b) => b.slug !== p.slug),
        ],
      }));
    }
    onDone?.(doneIds, live);
    work?.("website", "postsPublished", { detail: `${doneIds.length}/${posts.length}${live ? "" : " (demo)"}` });
    log?.(`Published ${doneIds.length} architected posts to WordPress${live ? "" : " (demo)"}`, project.website);
    setDone(true);
  };

  const st = { pending: "text-gray-300", creating: "text-blue-500", done: "text-emerald-600", error: "text-red-500" };
  return (
    <Modal title={`Publish ${posts.length} posts`} sub={`${project.website} · WordPress Posts with Blog/Answer categories`} onClose={onClose}>
      {!progress ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-100 p-3">
            <div className="text-[12px] font-semibold text-gray-700">Publishing schedule</div>
            <div className="mt-1.5 flex items-center gap-2 text-[12px] text-gray-500">
              seed: start <input type="date" value={start} onChange={(e) => { setStart(e.target.value); reseed(e.target.value, every); }} className={inputCls + " w-auto"} />
              every <input type="number" min={1} value={every} onChange={(e) => { setEvery(e.target.value); reseed(start, e.target.value); }} className={inputCls + " w-16"} /> day(s)
            </div>
            {/* per-post dates — each article pushes ON ITS OWN DATE */}
            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
              {posts.map((p, i) => (
                <div key={p.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-2 py-1 text-[11.5px]">
                  <span className="min-w-0 flex-1 truncate text-gray-700">{p.title}</span>
                  <input type="date" value={dates[i] || start} onChange={(e) => setDates((d) => d.map((x, j) => (j === i ? e.target.value : x)))}
                    className={"ll-mono " + inputCls + " w-auto py-1 text-[11px]"} />
                </div>
              ))}
            </div>
            <div className="mt-1 text-[10px] text-gray-400">Adjust any post's date individually. Today or earlier publishes immediately; future dates deploy as WordPress "scheduled" and auto-publish that day. Drip-feeding reads naturally to Google.</div>
          </div>
          {canLive && (
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 p-1">
              {[["live", `Live — publish to ${project.website}`], ["demo", "Demo run — don't touch the site"]].map(([k, l]) => (
                <button key={k} onClick={() => setMode(k)} className="flex-1 rounded-lg px-3 py-2 text-[11.5px] font-semibold"
                  style={mode === k ? { background: accent, color: "#fff" } : { color: "#6B7280" }}>{l}</button>
              ))}
            </div>
          )}
          {!live && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11.5px] text-amber-800"><b>Demo publish.</b> {canLive ? "Nothing touches the live site." : "WordPress isn't connected (Connector tab) — posts land in the Posts tab labeled demo."}</div>}
          <button onClick={publish} className="w-full rounded-xl py-3 text-[14px] font-bold text-white" style={{ background: accent }}>
            {live ? `Publish ${posts.length} posts to ${project.website}` : `Run demo publish (${posts.length} posts)`}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {progress.map((r, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] hover:bg-gray-50">
                <span className={"ll-mono w-4 shrink-0 " + st[r.status]}>{r.status === "done" ? "✓" : r.status === "error" ? "✕" : r.status === "creating" ? "…" : "·"}</span>
                <span className="min-w-0 flex-1 truncate text-gray-700">{r.title}</span>
                <span className={"shrink-0 text-[10px] " + st[r.status]}>{r.note || r.status}</span>
              </div>
            ))}
          </div>
          {done && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12px] text-emerald-800">Posts are live in the <b>Posts</b> tab{live ? " and on WordPress under their categories" : " (demo)"}.</div>}
          <button onClick={onClose} className="w-full rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-600">{done ? "Close" : "Run in background (close)"}</button>
        </div>
      )}
    </Modal>
  );
}
