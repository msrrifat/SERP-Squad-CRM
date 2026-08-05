/* =====================================================================
   STALE-TAB DETECTION

   A deploy replaces the code on the server; it does NOT touch tabs that are
   already open. Those keep running whatever they loaded, indefinitely. That is
   not cosmetic: a tab opened before a data-safety fix keeps the bug for as
   long as it stays open, which is how a report was built, printed, and never
   saved — hours after the fix for that exact problem had shipped.

   main.jsx already recovers from a lazy chunk that has gone missing, but that
   only fires when the user navigates to a screen whose chunk was replaced. A
   tab sitting on a screen it already loaded never trips it.

   So the running build is compared against the one the server is serving. The
   entry bundle's filename is content-hashed by the build, which makes it a
   reliable version marker with nothing extra to maintain: if index.html now
   points at a different one, this tab is out of date.
   ===================================================================== */
import { useEffect, useState } from "react";

const ENTRY_RE = /assets\/index-[A-Za-z0-9_-]+\.js/;

/* the entry bundle THIS page is running, taken from its own script tag.
   In dev the entry is /src/main.jsx, so there is nothing to compare and the
   check stays off. */
export function runningEntry() {
  const el = document.querySelector('script[type="module"][src*="/assets/"]');
  const src = el?.getAttribute("src") || "";
  const m = src.match(ENTRY_RE);
  return m ? m[0] : null;
}

/* what the server is serving right now */
async function latestEntry() {
  /* cache-busted and no-store: a cached index.html would report this tab's own
     version back to it and the check would never fire */
  const res = await fetch(`/?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) return null;
  const html = await res.text();
  const m = html.match(ENTRY_RE);
  return m ? m[0] : null;
}

/* true once the server is serving a different build than this tab is running */
export function useAppOutdated({ pollMs = 5 * 60 * 1000 } = {}) {
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    const mine = runningEntry();
    if (!mine) return;                       // dev, or no hashed entry — nothing to compare
    let alive = true;
    let timer = null;

    const check = async () => {
      if (!alive || document.hidden) return;
      try {
        const theirs = await latestEntry();
        /* only a CONFIRMED different build counts — a failed fetch or an
           unparsable page must never nag the user to reload */
        if (alive && theirs && theirs !== mine) setOutdated(true);
      } catch { /* offline or server hiccup — try again next cycle */ }
    };

    /* on returning to the tab is the moment that matters most: it is exactly
       when someone comes back to a page that has been sitting open for hours */
    const onVisible = () => { if (!document.hidden) check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    timer = setInterval(check, pollMs);
    const first = setTimeout(check, 20000);   // not during the initial load rush

    return () => {
      alive = false;
      clearInterval(timer); clearTimeout(first);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [pollMs]);

  return outdated;
}
