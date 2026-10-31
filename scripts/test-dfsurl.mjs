import assert from "node:assert/strict";
import { breadcrumbUrl, isGoogleRedirect, normalizeSerpItems, parseSerpRank, unwrapGoogleUrl } from "../src/lib/dataforseo.js";

const ok = (name) => console.log("  ✓ " + name);
console.log("google redirect links:");
assert.equal(unwrapGoogleUrl("https://www.google.com/url?q=https://antaplumbing.com/toilet-repair&sa=U&ved=abc"), "https://antaplumbing.com/toilet-repair"); ok("url?q= unwrapped");
assert.equal(unwrapGoogleUrl("https://www.google.com/goto?url=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1"), "https://example.com/a?b=1"); ok("goto?url= unwrapped and decoded");
assert.equal(unwrapGoogleUrl("https://www.google.com/goto/" + encodeURIComponent("https://example.com/page")), "https://example.com/page"); ok("goto/<encoded> unwrapped");
assert.equal(unwrapGoogleUrl("https://www.google.com/goto/" + Buffer.from("https://example.com/b64").toString("base64url")), "https://example.com/b64"); ok("goto/<base64url> unwrapped");
assert.equal(unwrapGoogleUrl("https://www.google.com/goto?id=opaque"), "https://www.google.com/goto?id=opaque"); ok("opaque goto left alone");
assert.equal(unwrapGoogleUrl("https://example.com/plain"), "https://example.com/plain"); ok("plain url untouched");
assert.equal(unwrapGoogleUrl("https://www.google.com/maps/place/x"), "https://www.google.com/maps/place/x"); ok("google maps url is not a redirect");
assert.equal(isGoogleRedirect("https://google.ca/url?q=https://x.ca"), true); ok("country TLD recognised");
assert.equal(breadcrumbUrl("https://www.example.com › services › plumbing"), "https://www.example.com/services/plumbing"); ok("breadcrumb rebuilt");
assert.equal(breadcrumbUrl("not a breadcrumb"), ""); ok("bad breadcrumb empty");

const task = { result: [{ items: [
  { type: "organic", rank_group: 1, rank_absolute: 3, domain: "google.com", url: "https://www.google.com/url?q=https://antaplumbing.com/toilet&sa=U", breadcrumb: "https://antaplumbing.com › toilet" },
  { type: "organic", rank_group: 2, rank_absolute: 4, domain: "google.com", url: "https://www.google.com/goto?id=opaque1", breadcrumb: "https://www.rival.ca › plumbing" },
  { type: "organic", rank_group: 3, rank_absolute: 5, domain: "third.com", url: "https://www.google.com/goto?id=opaque2" },
  { type: "local_pack", domain: "antaplumbing.com", url: "https://www.google.com/goto?id=opaque3" },
  { type: "ai_overview", items: [{ type: "ai_overview_element", references: [{ domain: "google.com", url: "https://www.google.com/url?q=https://antaplumbing.com/guide" }] }] },
] }] };
const r = parseSerpRank(task, "antaplumbing.com");
assert.equal(r.position, 1); assert.equal(r.url, "https://antaplumbing.com/toilet"); ok("ranked #1 through a url?q= link, landing page recovered");
assert.equal(task.result[0].items[0].redirect_url.startsWith("https://www.google.com/url"), true); ok("original link kept as redirect_url");
assert.equal(task.result[0].items[1].url, "https://www.rival.ca/plumbing"); assert.equal(task.result[0].items[1].domain, "rival.ca"); ok("opaque goto → breadcrumb page, domain corrected");
assert.equal(task.result[0].items[2].url, "https://third.com"); ok("opaque goto without breadcrumb → domain root");
assert.equal(r.mapPos, 1); ok("map pack matched by domain despite goto link");
assert.equal(r.aiPos, 1); ok("AI overview citation matched through the redirect");
const r2 = parseSerpRank({ result: [{ items: [{ type: "organic", rank_group: 4, rank_absolute: 6, domain: "google.com", url: "https://www.google.com/goto?id=x", breadcrumb: "https://rival.ca › a" }] }] }, "antaplumbing.com");
assert.equal(r2.position, null); ok("a redirect to another site never counts as ours");
assert.equal(normalizeSerpItems(task).result[0].items[0].url, "https://antaplumbing.com/toilet"); ok("normalisation is idempotent");
console.log("dfs url tests passed");
