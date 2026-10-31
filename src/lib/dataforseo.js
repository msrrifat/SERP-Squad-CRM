/* ================= DataForSEO client =================
   Pure module — no React/browser dependencies, so BOTH the frontend and the
   Node API server (server/index.js) import these same functions. */

export function dataForSeoAuthHeader(company) {
  const raw = `${company.dfs.login}:${company.dfs.password}`;
  return "Basic " + (typeof btoa === "function" ? btoa(raw) : Buffer.from(raw).toString("base64"));
}
export function buildSerpTask(entry) {
  return {
    keyword: entry.keyword,
    location_name: `${entry.city.city},${entry.city.region},${entry.city.country}`,
    language_code: "en",
    device: entry.device.toLowerCase(),            // "desktop" | "mobile"
    os: entry.device === "Mobile" ? "android" : "windows",
    depth: 100,                                    // scan top 100 organic results
  };
}
export function buildSerpBatches(dueEntries) {
  // DataForSEO routes by engine-specific endpoint (/v3/serp/{engine}/organic/task_post)
  // and accepts up to 100 task objects per POST — so group by engine, then chunk.
  // Returns [{ engine: "google"|"bing", tasks: [...≤100] }, ...] covering EVERY due entry.
  const byEngine = {};
  dueEntries.forEach((e) => {
    const engine = (e.engine || "Google").toLowerCase();
    (byEngine[engine] = byEngine[engine] || []).push(buildSerpTask(e));
  });
  return Object.entries(byEngine).flatMap(([engine, tasks]) => {
    const batches = [];
    for (let i = 0; i < tasks.length; i += 100) batches.push({ engine, tasks: tasks.slice(i, i + 100) });
    return batches;
  });
}

export async function rerunNow(entryIds, dfsCredentials) {
  // In the browser this call goes to YOUR backend proxy — never expose
  // DataForSEO credentials to the client directly.
  const res = await fetch("/api/rerun", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entryIds }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { updated: [{ id, positions: [...], url }] }
}
/* ---- Google redirect links ------------------------------------------
   Since late October 2026 Google hands out many result links as a redirect
   (google.com/goto…, google.com/url?q=…) instead of the landing page, and
   DataForSEO passes them through at every priority. A tracker that matches
   the link's host against the client's domain then sees "google.com" and
   reports "not ranked" for a site that ranks. These helpers recover the
   real page: the target is usually inside the redirect's query string; when
   it is not, DataForSEO's own `domain` / `breadcrumb` fields still name the
   site, and the server can follow the redirect as a last resort. */
const GOOGLE_HOST = /(^|\.)google\.[a-z.]{2,}$/i;
const REDIRECT_PATH = /^\/(url|goto|interstitial|aclk|imgres|search\/goto)(\/|$)/i;
const hostOfUrl = (u) => { try { return new URL(String(u)).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
export const isGoogleRedirect = (u) => { try { const x = new URL(String(u)); return GOOGLE_HOST.test(x.hostname) && REDIRECT_PATH.test(x.pathname); } catch { return false; } };
export function unwrapGoogleUrl(u) {
  if (!isGoogleRedirect(u)) return u;
  try {
    const x = new URL(String(u));
    for (const k of ["q", "url", "u", "adurl", "imgrefurl", "dest", "target", "link", "continue", "to"]) {
      const v = x.searchParams.get(k);
      if (v && /^https?:\/\//i.test(v) && !GOOGLE_HOST.test(hostOfUrl(v))) return v;
    }
    /* …/goto/<encoded target> and …/goto/<base64url target> */
    const tail = x.pathname.replace(/^\/(search\/)?goto\/?/i, "");
    if (tail) {
      try { const dec = decodeURIComponent(tail); if (/^https?:\/\//i.test(dec)) return dec; } catch { /* not percent-encoded */ }
      try {
        const b64 = Buffer.from(tail.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
        if (/^https?:\/\/[^\s]+$/i.test(b64)) return b64;
      } catch { /* not base64 */ }
    }
  } catch { /* leave as is */ }
  return u;
}
/* "https://www.example.com › services › plumbing" → "https://www.example.com/services/plumbing" */
export function breadcrumbUrl(bc) {
  const parts = String(bc || "").split(/\s*›\s*/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length || !/^https?:\/\//i.test(parts[0])) return "";
  const path = parts.slice(1).filter((x) => !/^\.\.\.?$/.test(x)).map((x) => x.replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/");
  return parts[0].replace(/\/+$/, "") + (path ? "/" + path : "");
}
/* rewrite every `url` in a DataForSEO SERP task result to the real page:
   organic items, local pack, AI-overview references, nested elements.
   The original link is kept as `redirect_url`; `domain` is corrected when
   it named google. Idempotent, in place. */
export function normalizeSerpItems(task) {
  const fix = (node, depth = 0) => {
    if (!node || typeof node !== "object" || depth > 8) return;
    if (Array.isArray(node)) { node.forEach((n) => fix(n, depth + 1)); return; }
    if (typeof node.url === "string" && isGoogleRedirect(node.url)) {
      const original = node.url;
      let real = unwrapGoogleUrl(original);
      if (isGoogleRedirect(real) && node.breadcrumb) real = breadcrumbUrl(node.breadcrumb) || real;
      if (isGoogleRedirect(real) && node.domain && !GOOGLE_HOST.test(node.domain)) real = "https://" + String(node.domain).replace(/^https?:\/\//, "");
      if (real !== original) { node.redirect_url = original; node.url = real; }
      const h = hostOfUrl(node.url);
      if (h && !GOOGLE_HOST.test(h) && (!node.domain || GOOGLE_HOST.test(String(node.domain)))) node.domain = h;
    }
    for (const k of ["items", "references", "links", "expanded_element", "expanded_elements", "table", "chunks", "elements"]) if (node[k]) fix(node[k], depth + 1);
  };
  for (const r of task?.result || []) fix(r);
  return task;
}

export function parseSerpRank(taskResult, domain) {
  normalizeSerpItems(taskResult);
  const items = taskResult?.result?.[0]?.items || [];
  const clean = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
  const sameSite = (hd) => hd && (hd === clean || hd.endsWith("." + clean)); // subdomains rank for the site too
  const matches = (it) => {
    /* every hint of the real host: DataForSEO's domain, the (unwrapped)
       link, the breadcrumb — a redirect link alone must never decide */
    const hosts = [it.domain, hostOfUrl(it.url), hostOfUrl(breadcrumbUrl(it.breadcrumb))]
      .map((h) => String(h || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase())
      .filter((h) => h && !GOOGLE_HOST.test(h));
    return hosts.some(sameSite);
  };
  const hit = items.find((it) => it.type === "organic" && matches(it));
  /* local map pack (3-pack) — SAME response, zero extra cost: the business's
     position among the local_pack items, matched by its website domain */
  const pack = items.filter((it) => it.type === "local_pack");
  const mapIdx = pack.findIndex(matches);
  /* POSITION = rank_group, the position among ORGANIC results — the number
     every rank tracker reports and the one a client recognises as "we rank #1".

     We used to report rank_absolute, which counts EVERY block on the page:
     AI overviews, ad units, product carousels, videos, People Also Ask, the
     map pack. On a modern local SERP that is four to six blocks before the
     first organic link, so a site sitting at organic #1 was reported as #5,
     #7, #9 — and the more SERP features Google added, the worse the number
     got even when nothing about the ranking had changed. Verified against a
     live Toronto SERP: antaplumbing.com for "toilet plumbing" is
     rank_group 1 / rank_absolute 5, and every other tracker calls that #1.

     rank_absolute is still returned as `absPos` — it is genuinely useful
     (how far down the page the listing actually sits) and nothing that reads
     `position` is affected by its presence. */
  /* Google AI Overview — SAME response again, zero extra cost: whether the
     query shows an AI overview, and the domain's 1-based position among the
     overview's cited references (the order Google lists its sources).
     Rank-tracking tasks are posted with load_async_ai_overview, so
     asynchronously rendered overviews (nearly all of them) come back too.
     References are collected in document order from every level of the
     overview — the item itself, each ai_overview_element, and the expanded
     elements / tables / chunks nested inside them — because DataForSEO
     places citations wherever the corresponding text block sits. */
  const aio = items.find((it) => it.type === "ai_overview");
  let aiPos = null, aiRefsCount = 0;
  if (aio) {
    const seen = new Set();
    const refs = [];
    const collect = (r) => {
      if (!r || typeof r !== "object") return;
      const key = (r.domain || "") + "|" + (r.url || "");
      if (seen.has(key)) return;
      seen.add(key);
      refs.push(r);
    };
    const walk = (node, depth = 0) => {
      if (!node || typeof node !== "object" || depth > 6) return;
      (Array.isArray(node.references) ? node.references : []).forEach(collect);
      (Array.isArray(node.items) ? node.items : []).forEach((child) => walk(child, depth + 1));
    };
    walk(aio);
    const idx = refs.findIndex(matches);
    aiPos = idx >= 0 ? idx + 1 : null;
    aiRefsCount = refs.length;
  }
  return {
    position: hit ? (hit.rank_group ?? hit.rank_absolute) : null,  // organic position; null = not in top `depth`
    absPos: hit ? hit.rank_absolute : null,            // position counting ads/AI/pack/PAA — display only
    url: hit ? hit.url : null,
    mapPos: mapIdx >= 0 ? mapIdx + 1 : null,           // 1–3 inside the pack; null = not in the pack
    packShown: pack.length > 0,                        // whether Google showed a map pack for this query at all
    aiPos,                                             // 1-based citation position in the AI Overview; null = not cited
    aiShown: !!aio,                                    // whether an AI overview appeared for this query
    aiRefs: aio ? aiRefsCount : 0,                     // how many sources the overview cites (0 = placeholder / not loaded)
  };
}

