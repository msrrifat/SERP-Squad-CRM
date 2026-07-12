/* Shared AI copywriting layer — every writing feature in the app funnels
   through here so the project's Brand Voice and the target field's character
   limit are enforced on EVERY call, no exceptions. Honest by design: live
   provider or a clear error; nothing is silently fabricated. */
import React, { useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";

export async function aiGenerate(ai, { system, prompt, json = false, maxTokens }) {
  if (!ai?.key) { const e = new Error("no AI provider configured"); e.code = 503; throw e; }
  const res = await fetch("/api/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(240000),
    body: JSON.stringify({ provider: ai.provider, apiKey: ai.key, model: ai.model, system, prompt, json, maxTokens }),
  });
  if (res.ok) return (await res.json()).text;
  const err = await res.json().catch(() => ({}));
  const e = new Error(err.detail || err.hint || err.error || `HTTP ${res.status}`);
  e.code = res.status;
  throw e;
}

export function brandVoiceBlock(bv, brand) {
  if (!bv) return `Brand: ${brand}.`;
  const files = (bv.files || []).map((f) => `--- ${f.name} ---\n${f.text}`).join("\n").slice(0, 6000);
  return [
    `Brand: ${bv.brandName || brand}. ${bv.tagline ? "Positioning: " + bv.tagline + "." : ""}`,
    bv.brandInfo ? `About: ${bv.brandInfo}` : "",
    bv.toneWords ? `Tone: ${bv.toneWords}` : "",
    bv.doList ? `Always: ${bv.doList}` : "",
    bv.dontList ? `Never: ${bv.dontList}` : "",
    bv.avoidWords ? `Banned words: ${bv.avoidWords}` : "",
    files ? `Guideline files (must follow):\n${files}` : "",
  ].filter(Boolean).join("\n");
}

/* hard character cap: cut at a sentence boundary when possible, else a word */
export function clampChars(text, max) {
  const t = String(text || "").trim().replace(/^["'`]+|["'`]+$/g, "");
  if (!max || t.length <= max) return t;
  const cut = t.slice(0, max);
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (sentence > max * 0.6) return cut.slice(0, sentence + 1);
  const word = cut.lastIndexOf(" ");
  return (word > 0 ? cut.slice(0, word) : cut).trim();
}

const SYS_COPY = `You are the brand's senior marketing copywriter. You write platform-ready copy that converts — concrete, human, zero filler, no clichés.
Hard rules:
- Follow the BRAND VOICE block exactly (tone, always/never lists, banned words).
- Respect the HARD CHARACTER LIMIT — the entire response must fit within it.
- Output ONLY the copy itself: no quotes around it, no headings, no markdown, no alternatives, no commentary.`;

/* Drop-in "AI write" button for any content field. Always injects the brand
   voice and clamps the output to the field's character limit. */
export function AiWriteButton({ ai, brandVoice, brand, what, context = "", limit, current = "", onText, accent = "#0E7C66", label = "AI write" }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const text = await aiGenerate(ai, {
        system: SYS_COPY,
        maxTokens: Math.min(2000, Math.max(300, Math.ceil((limit || 800) / 2))),
        prompt: `BRAND VOICE (must follow):\n${brandVoiceBlock(brandVoice, brand)}\n\nTASK: Write ${what}.\nHARD CHARACTER LIMIT: ${limit} characters — stay comfortably under it.\n${context ? `CONTEXT:\n${context}\n` : ""}${String(current || "").trim() ? `CURRENT TEXT (rewrite/improve it, keep what already works):\n${current}\n` : ""}Write the final copy now.`,
      });
      onText(clampChars(text, limit));
    } catch (e) {
      setErr(e.code === 503
        ? "No AI provider connected — add one in Company settings → API settings."
        : "AI error: " + (e.message || e));
    }
    setBusy(false);
  };
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {err && <span className="max-w-[240px] truncate text-[10px] font-normal normal-case text-red-500" title={err}>{err}</span>}
      <button type="button" onClick={run} disabled={busy}
        title={`Writes with your Brand Voice, within ${limit} characters`}
        className="flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-bold disabled:opacity-50"
        style={{ background: accent + "14", color: accent }}>
        {busy ? <RefreshCw size={10} className="animate-spin" /> : <Sparkles size={10} />} {busy ? "Writing…" : label}
      </button>
    </span>
  );
}
