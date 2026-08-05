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
export function parseSerpRank(taskResult, domain) {
  const items = taskResult?.result?.[0]?.items || [];
  const clean = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
  const matches = (it) => {
    const hd = (it.domain || (it.url || "").replace(/^https?:\/\//, "")).replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
    return hd && (hd === clean || hd.endsWith("." + clean)); // subdomains rank for the site too
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
  return {
    position: hit ? (hit.rank_group ?? hit.rank_absolute) : null,  // organic position; null = not in top `depth`
    absPos: hit ? hit.rank_absolute : null,            // position counting ads/AI/pack/PAA — display only
    url: hit ? hit.url : null,
    mapPos: mapIdx >= 0 ? mapIdx + 1 : null,           // 1–3 inside the pack; null = not in the pack
    packShown: pack.length > 0,                        // whether Google showed a map pack for this query at all
  };
}

