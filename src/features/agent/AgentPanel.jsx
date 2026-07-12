import React, { useEffect, useRef, useState } from "react";
import { RefreshCw, Send, Shield, X, Zap } from "lucide-react";
import { agentReply } from "./agent.js";

/* ================= SERP Squad AI — chat panel =================
   Floating assistant, permission-scoped by the caller (App / ClientPortal).
   All answers come from agent.js against live project data; the two actions
   (create plan, open report builder) execute through callbacks the host owns,
   so the agent can never write anything the signed-in user couldn't. */

const QUICK = (isClient) => [
  "Project overview",
  "Keyword opportunities",
  "Rankings",
  "Compare vs 3 months",
  ...(isClient ? [] : ["Create a monthly plan", "Generate a report"]),
];

/* minimal markdown-ish: **bold** + line breaks + bullets */
const rich = (t) =>
  t.split("\n").map((line, i) => (
    <div key={i} className={line.startsWith("•") ? "pl-1" : ""}>
      {line.split(/(\*\*[^*]+\*\*)/g).map((seg, j) =>
        seg.startsWith("**") ? <b key={j}>{seg.slice(2, -2)}</b> : <span key={j}>{seg}</span>
      )}
    </div>
  ));

export function AgentPanel({ ctx, accent, aiProvider, onAction, onClose }) {
  const [messages, setMessages] = useState(() => [{
    role: "agent",
    text: `Hi! I'm your SERP Squad AI agent${aiProvider ? ` (powered by ${aiProvider})` : ""}. I can see ${ctx.allowed.length} project${ctx.allowed.length === 1 ? "" : "s"} you have access to — ask me anything about them, or type "help".`,
  }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(() => new Set()); // executed action message idx
  const bodyRef = useRef(null);
  useEffect(() => { bodyRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }); }, [messages, busy]);

  const send = (raw) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setBusy(true);
    setTimeout(() => { // PROD: stream from the configured AI provider with agent.js functions as tools
      const reply = agentReply(text, ctx);
      setMessages((m) => [...m, { role: "agent", ...reply }]);
      setBusy(false);
    }, 700);
  };
  const runAction = (idx, action) => {
    onAction(action);
    setDone((d) => new Set([...d, idx]));
    setMessages((m) => [...m, {
      role: "agent",
      text: action.type === "plan"
        ? "✓ Done — the plan is now in Project Management with tasks assigned. I logged it in the activity feed."
        : "✓ Opening the report builder with this project's live data…",
    }]);
  };

  return (
    <div className="fixed bottom-20 right-5 z-[60] flex h-[560px] w-[390px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3" style={{ background: accent + "0D" }}>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg text-white" style={{ background: accent }}><Zap size={14} /></span>
        <div className="min-w-0 flex-1">
          <div className="ll-display text-[13.5px] font-semibold leading-tight">SERP Squad AI</div>
          <div className="flex items-center gap-1 text-[10px] text-gray-400">
            <Shield size={9} /> scoped to {ctx.allowed.length} project{ctx.allowed.length === 1 ? "" : "s"}{aiProvider ? ` · via ${aiProvider}` : ""}
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-white/60"><X size={15} /></button>
      </div>

      <div ref={bodyRef} className="flex-1 space-y-2.5 overflow-y-auto p-3">
        {messages.map((m, i) => (
          <div key={i} className={"flex " + (m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={"max-w-[85%] space-y-1 rounded-2xl px-3 py-2 text-[12px] leading-relaxed " +
              (m.role === "user" ? "rounded-br-md text-white" : "rounded-bl-md bg-gray-50 text-gray-700")}
              style={m.role === "user" ? { background: accent } : {}}>
              {rich(m.text)}
              {m.action && !done.has(i) && (
                <button onClick={() => runAction(i, m.action)}
                  className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[11.5px] font-bold text-white"
                  style={{ background: accent }}>
                  <Zap size={11} /> {m.action.label}
                </button>
              )}
              {m.action && done.has(i) && <div className="mt-1 text-[10.5px] font-semibold text-emerald-600">✓ executed</div>}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-gray-50 px-3 py-2 text-[11.5px] text-gray-400">
              <RefreshCw size={11} className="animate-spin" /> analyzing project data…
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 p-2.5">
        <div className="mb-2 flex flex-wrap gap-1">
          {QUICK(ctx.isClient).map((qc) => (
            <button key={qc} onClick={() => send(qc)} disabled={busy}
              className="rounded-full border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-500 hover:border-gray-300 disabled:opacity-40">
              {qc}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder='Ask about your projects — or type "help"'
            className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-[12px] outline-none focus:border-gray-300" />
          <button onClick={() => send()} disabled={busy || !input.trim()}
            className="rounded-xl px-3 text-white disabled:opacity-40" style={{ background: accent }}>
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AgentLauncher({ accent, onClick }) {
  return (
    <button onClick={onClick} title="SERP Squad AI agent"
      className="no-print fixed bottom-5 right-5 z-[59] flex h-12 w-12 items-center justify-center rounded-full text-white shadow-xl transition-transform hover:scale-105"
      style={{ background: accent }}>
      <Zap size={19} />
    </button>
  );
}
