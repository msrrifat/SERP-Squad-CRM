/* =====================================================================
   Where is this CRM hosted? Single source of truth for every generated
   URL that client sites or third parties must reach (the pixel above all).

   Resolution order:
   1. explicit override from Company Settings → "App domain"
   2. the domain the app is actually served from (any real host — connect
      the repo to a domain/subdomain and everything adapts automatically)
   3. the canonical production fallback (so local dev never emits localhost)
   ===================================================================== */
const FALLBACK = "https://app.serpsquad.com";
let override = null;

export const setAppOrigin = (v) => {
  const clean = String(v || "").trim().replace(/\/+$/, "");
  override = clean ? (/^https?:\/\//.test(clean) ? clean : "https://" + clean) : null;
};

const isLocalHost = (h) =>
  h === "localhost" || h === "127.0.0.1" || h.endsWith(".local") ||
  /^192\.168\./.test(h) || /^10\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);

export const appOrigin = () => {
  if (override) return override;
  if (typeof window !== "undefined" && !isLocalHost(window.location.hostname)) return window.location.origin;
  return FALLBACK;
};
export const appOriginIsAuto = () => !override && typeof window !== "undefined" && !isLocalHost(window.location.hostname);

/* dev introspection */
if (typeof window !== "undefined") { window.__appOrigin = appOrigin; window.__setAppOrigin = setAppOrigin; }
