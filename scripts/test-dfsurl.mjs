import assert from "node:assert/strict";
import { applyGotoMap, breadcrumbUrl, isGoogleRedirect, normalizeSerpItems, parseGotoConverter, parseSerpRank, unwrapGoogleUrl } from "../src/lib/dataforseo.js";

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

console.log("goto_url_converter:");
const G1 = "https://google.com/goto?url=CAESabc", G2 = "https://www.google.com/goto?url=CAESdef";
const rA = parseGotoConverter({ tasks: [{ status_code: 20000, result: [{ goto_url: G1, url: "https://a.com/x" }, { goto_url: G2, url: "https://b.com/y" }] }] }, [G1, G2]);
assert.equal(rA.get(G1), "https://a.com/x"); assert.equal(rA.get(G2), "https://b.com/y"); ok("object rows (goto_url/url) parsed");
const rA2 = parseGotoConverter({ tasks: [{ result: [{ items: [{ url: G1, resolved_url: "https://a.com/x", domain: "a.com" }] }] }] }, [G1]);
assert.equal(rA2.get(G1), "https://a.com/x"); ok("nested items with other key names parsed");
const rB = parseGotoConverter({ tasks: [{ result: [{ [G1]: "https://a.com/x" }] }] }, [G1]);
assert.equal(rB.get(G1), "https://a.com/x"); ok("goto-keyed map parsed");
const rC = parseGotoConverter({ tasks: [{ result: [{ urls: ["https://a.com/x", "https://b.com/y"] }] }] }, [G1, G2]);
assert.equal(rC.get(G2), "https://b.com/y"); ok("ordered list parsed");
assert.equal(parseGotoConverter({ tasks: [{ status_code: 40000, result: null }] }, [G1]).size, 0); ok("empty reply → no mapping");
const t3 = { result: [{ items: [
  { type: "organic", rank_group: 1, rank_absolute: 2, domain: "google.com", url: G1, breadcrumb: "https://antaplumbing.com" },
  { type: "organic", rank_group: 2, rank_absolute: 3, domain: "google.com", url: G2 },
] }] };
const r3 = parseSerpRank(t3, "antaplumbing.com");
assert.equal(r3.position, 1); assert.equal(r3.url, "https://antaplumbing.com"); assert.equal(r3.gotoUrl, G1); ok("hit reports its goto link for conversion");
assert.equal(applyGotoMap(t3, new Map([[G1, "https://antaplumbing.com/toilet-repair"]])), 1);
assert.equal(t3.result[0].items[0].url, "https://antaplumbing.com/toilet-repair"); assert.equal(t3.result[0].items[0].redirect_url, G1); ok("converter answer applied, original kept");
assert.equal(t3.result[0].items[1].url, G2); ok("unanswered link left for the next pass");
console.log("dfs url tests passed");
