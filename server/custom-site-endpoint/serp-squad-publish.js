/* SERP Squad Publisher — Node variant of serp-squad-publish.php for custom
   sites hosted on Node. Same protocol: X-SS-Key auth; actions health /
   deploy_page / deploy_post (immediate or scheduled) / cleanup.
   Run next to your site root:  SS_SITE_KEY=ss_live_… node serp-squad-publish.js [port] [webroot]  */
import http from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { timingSafeEqual } from "node:crypto";

const KEY = process.env.SS_SITE_KEY || "";
const PORT = +(process.argv[2] || 8099);
const ROOT = resolve(process.argv[3] || ".");
const F = { pages: join(ROOT, "ss-pages.json"), posts: join(ROOT, "ss-posts.json"), queue: join(ROOT, "ss-queue.json") };
const load = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return f === F.queue ? [] : {}; } };
const save = (f, d) => writeFileSync(f, JSON.stringify(d, null, 2));
const keyOk = (k) => { const a = Buffer.from(String(k || "")), b = Buffer.from(KEY); return KEY && a.length === b.length && timingSafeEqual(a, b); };
const cleanPath = (p) => { p = String(p || "").replace(/^\/+|\/+$/g, ""); return p === "" || (/^[a-z0-9/_-]{1,200}$/i.test(p) && !p.includes("..")) ? p : null; };
const writePage = (rel, html) => { const dir = rel ? join(ROOT, rel) : ROOT; mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "index.html"), html); };
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const rebuildBlogIndex = (posts) => {
  const items = Object.values(posts).filter((p) => p.status === "published")
    .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
    .map((p) => `<article class="card"><h2><a href="/blog/${esc(p.slug)}/">${esc(p.title)}</a></h2><p>${esc(p.metaDesc || "")}</p><time>${new Date(p.publishedAt || Date.now()).toLocaleDateString("en", { year: "numeric", month: "long", day: "numeric" })}</time></article>`).join("");
  writePage("blog", `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blog</title><style>body{font:16px/1.6 -apple-system,sans-serif;max-width:760px;margin:0 auto;padding:24px 5vw}.card{border-bottom:1px solid #e6e9ee;padding:18px 0}h2{margin:0 0 6px}a{color:#0E7C66}time{color:#889;font-size:13px}</style></head><body><h1>Blog</h1>${items}</body></html>`);
};
const flushQueue = () => {
  const queue = load(F.queue), posts = load(F.posts), left = [];
  let published = 0;
  for (const q of queue) {
    if ((q.publishAt || 0) <= Date.now()) {
      writePage("blog/" + q.slug, q.html);
      const { html, ...meta } = q;
      posts[q.slug] = { ...meta, status: "published", publishedAt: q.publishAt };
      published++;
    } else left.push(q);
  }
  if (published) { save(F.queue, left); save(F.posts, posts); rebuildBlogIndex(posts); }
  return published;
};

http.createServer(async (req, res) => {
  const out = (code, obj) => { res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "Content-Type, X-SS-Key" }); res.end(JSON.stringify(obj)); };
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  if (!KEY) return out(503, { error: "not_configured", detail: "SS_SITE_KEY env var not set." });
  if (!keyOk(req.headers["x-ss-key"])) return out(401, { error: "unauthorized", detail: "X-SS-Key does not match this site's key." });
  const justPublished = flushQueue();
  let body = ""; for await (const c of req) body += c;
  let b; try { b = JSON.parse(body || "{}"); } catch { return out(400, { error: "bad_json" }); }
  const action = b.action || "health";

  if (action === "health") return out(200, { ok: true, writable: true, managedPages: Object.keys(load(F.pages)).length, managedPosts: Object.keys(load(F.posts)).length, queued: load(F.queue).length, justPublished });
  if (action === "deploy_page") {
    const rel = cleanPath(b.path); if (rel === null) return out(400, { error: "bad_path" });
    writePage(rel, String(b.html || ""));
    const pages = load(F.pages); pages[rel || "/"] = { at: Date.now() }; save(F.pages, pages);
    return out(200, { ok: true, url: "/" + rel });
  }
  if (action === "deploy_post") {
    const slug = cleanPath(b.slug); if (!slug || slug.includes("/")) return out(400, { error: "bad_slug" });
    const meta = { slug, title: String(b.title || slug), metaDesc: String(b.metaDesc || "") };
    if (b.publishAt && b.publishAt > Date.now()) {
      const queue = load(F.queue).filter((q) => q.slug !== slug);
      queue.push({ ...meta, publishAt: +b.publishAt, status: "scheduled", html: String(b.html || "") });
      save(F.queue, queue);
      return out(200, { ok: true, scheduled: true, publishAt: +b.publishAt });
    }
    writePage("blog/" + slug, String(b.html || ""));
    const posts = load(F.posts); posts[slug] = { ...meta, status: "published", publishedAt: Date.now() }; save(F.posts, posts);
    rebuildBlogIndex(posts);
    return out(200, { ok: true, url: "/blog/" + slug });
  }
  if (action === "cleanup") {
    const keep = new Set((b.keep || []).map(String));
    const pages = load(F.pages); const removed = [];
    for (const rel of Object.keys(pages)) {
      if (!keep.has(rel)) {
        const f = join(ROOT, rel === "/" ? "" : rel, "index.html");
        if (existsSync(f)) unlinkSync(f);
        removed.push(rel); delete pages[rel];
      }
    }
    save(F.pages, pages);
    return out(200, { ok: true, removed });
  }
  out(400, { error: "unknown_action" });
}).listen(PORT, "127.0.0.1", () => console.log(`SERP Squad publisher on :${PORT} → ${ROOT}`));
