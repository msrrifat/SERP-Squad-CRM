import React, { useEffect, useRef, useState } from "react";
import { CornerUpLeft, Send, Smile, X } from "lucide-react";
import { Ava, inputCls } from "../../ui/primitives.jsx";

/* quick reactions shown on hover; the full set feeds the composer picker */
export const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "✅"];
export const EMOJI_SET = [
  "😀", "😄", "😁", "😆", "😅", "😂", "🙂", "😉", "😊", "😍", "🤩", "😎",
  "🤔", "🤨", "😐", "😴", "🤯", "😬", "🥳", "😢", "😡", "🙏", "👏", "👍",
  "👎", "👌", "🤝", "💪", "🔥", "✨", "⭐", "❤️", "💯", "✅", "❌", "⚡",
  "🎉", "🎯", "🚀", "📈", "📉", "💡", "📌", "📅", "☕", "👀", "💬", "🏆",
];

/* retention automation: every thread keeps only its most recent messages */
export const MSG_CAP = 1000;
export const capMsgs = (arr) => (arr.length > MSG_CAP ? arr.slice(-MSG_CAP) : arr);

/* toggle one user's reaction on a message object (pure) */
export const toggleReaction = (m, emoji, user) => {
  const cur = (m.reactions || {})[emoji] || [];
  const next = cur.includes(user) ? cur.filter((x) => x !== user) : [...cur, user];
  const reactions = { ...(m.reactions || {}) };
  if (next.length) reactions[emoji] = next; else delete reactions[emoji];
  return { ...m, reactions };
};

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* =====================================================================
   MessageThread — message list + composer shared by DMs, groups,
   project channels and Project Management → Chat.
   Hover a message → quick reactions + reply; right-click → reply.
   Type @ to mention someone from the thread.
   onSend(text, replyToId) · onReact(msgId, emoji)
   ===================================================================== */
export function MessageThread({ msgs, me, accent, canWrite = true, onSend, onReact, onForward = null, maskName = (n) => n, mentionables = [], dense = false }) {
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hoverId, setHoverId] = useState(null);
  const [mention, setMention] = useState(null);   // { at, q, opts } — active @token
  const [mentionIdx, setMentionIdx] = useState(0);
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [msgs.length]);

  const byId = Object.fromEntries(msgs.map((m) => [m.id, m]));
  const send = () => {
    const text = draft.trim(); if (!text) return;
    onSend(text, replyTo?.id || null);
    setDraft(""); setReplyTo(null); setPickerOpen(false); setMention(null);
  };
  const startReply = (m) => { setReplyTo(m); setPickerOpen(false); taRef.current?.focus(); };

  /* ---- @mentions: detect the token under the caret ---- */
  const candidates = mentionables.filter((n) => n && n !== me);
  const onDraftChange = (e) => {
    const val = e.target.value; setDraft(val);
    const upto = val.slice(0, e.target.selectionStart ?? val.length);
    const at = upto.lastIndexOf("@");
    if (at >= 0 && (at === 0 || /\s/.test(upto[at - 1]))) {
      const q = upto.slice(at + 1);
      if (q.length <= 24 && !q.includes("\n")) {
        const opts = candidates.filter((n) => n.toLowerCase().startsWith(q.toLowerCase()));
        if (opts.length) { setMention({ at, q, opts }); setMentionIdx(0); return; }
      }
    }
    setMention(null);
  };
  const pickMention = (name) => {
    const before = draft.slice(0, mention.at);
    const after = draft.slice(mention.at + 1 + mention.q.length);
    setDraft(before + "@" + name + " " + after);
    setMention(null); taRef.current?.focus();
  };
  const onKeyDown = (e) => {
    if (mention) {
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickMention(mention.opts[mentionIdx]); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx((i) => (i + 1) % mention.opts.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIdx((i) => (i - 1 + mention.opts.length) % mention.opts.length); return; }
      if (e.key === "Escape") { setMention(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  /* ---- render @Name tokens as highlighted chips ---- */
  const allNames = [...new Set([...mentionables, me])].filter(Boolean).sort((a, b) => b.length - a.length);
  const mentionRe = allNames.length ? new RegExp(`@(${allNames.map(escRe).join("|")})`, "g") : null;
  const renderText = (text, own) => {
    if (!mentionRe || !text.includes("@")) return text;
    const parts = text.split(mentionRe);
    return parts.map((part, i) => {
      if (i % 2 === 0) return part;
      const isMe = part === me;
      return (
        <span key={i} className={"rounded px-1 py-px font-semibold " + (isMe ? "bg-amber-300/90 text-gray-900" : own ? "bg-white/25 text-white" : "")}
          style={!isMe && !own ? { background: accent + "18", color: accent } : {}}>
          @{maskName(part)}
        </span>
      );
    });
  };

  const hhmm = (ts) => new Date(ts).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
  const dayOf = (ts) => new Date(ts).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" });
  const fs = dense ? "text-[12px]" : "text-[13px]";
  let lastDay = "";

  return (
    <>
      <div ref={scrollRef} className={"flex-1 space-y-1.5 overflow-y-auto px-4 " + (dense ? "py-3" : "py-4")}>
        {msgs.length === 0 && <div className="py-14 text-center text-[12px] text-gray-300">No messages yet — start the conversation.</div>}
        {msgs.map((m) => {
          const own = m.author === me;
          const day = dayOf(m.ts);
          const sep = day !== lastDay; lastDay = day;
          const quoted = m.replyTo ? byId[m.replyTo] : null;
          const reactions = Object.entries(m.reactions || {}).filter(([, names]) => names.length);
          return (
            <React.Fragment key={m.id}>
              {sep && (
                <div className="flex items-center gap-3 py-1.5">
                  <span className="h-px flex-1 bg-gray-100" />
                  <span className="ll-mono text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">{day}</span>
                  <span className="h-px flex-1 bg-gray-100" />
                </div>
              )}
              <div className={"group/msg relative flex items-end gap-2 " + (own ? "justify-end" : "")}
                onMouseEnter={() => setHoverId(m.id)} onMouseLeave={() => setHoverId((h) => (h === m.id ? null : h))}
                onContextMenu={(e) => { if (!canWrite) return; e.preventDefault(); startReply(m); }}>
                {!own && <Ava name={maskName(m.author)} size={dense ? 20 : 24} />}
                <div className={"relative max-w-[75%] rounded-2xl px-3.5 py-2 " + (own ? "rounded-br-md text-white" : "rounded-bl-md bg-gray-100")}
                  style={own ? { background: accent } : {}}>
                  {hoverId === m.id && (
                    <div className={"absolute -top-8 z-10 flex items-center gap-0.5 rounded-full border border-gray-200 bg-white px-1.5 py-1 shadow-lg " + (own ? "right-0" : "left-0")}>
                      {QUICK_EMOJIS.map((e2) => (
                        <button key={e2} onClick={() => onReact(m.id, e2)} title={`React ${e2}`}
                          className="rounded-full px-1 text-[14px] leading-none hover:scale-125 hover:bg-gray-50">{e2}</button>
                      ))}
                      {canWrite && (
                        <button onClick={() => startReply(m)} title="Reply (or right-click the message)"
                          className="ml-0.5 flex items-center gap-0.5 rounded-full border-l border-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 hover:text-gray-800">
                          <CornerUpLeft size={11} /> Reply
                        </button>
                      )}
                      {onForward && !own && (
                        <button onClick={() => onForward(m)} title="Forward this message to a group"
                          className="flex items-center gap-0.5 rounded-full border-l border-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 hover:text-gray-800">
                          ↪ Forward
                        </button>
                      )}
                    </div>
                  )}
                  {!own && <div className="mb-0.5 text-[10.5px] font-bold" style={{ color: accent }}>{maskName(m.author)}</div>}
                  {quoted && (
                    <div className={"mb-1 rounded-lg border-l-2 px-2 py-1 text-[10.5px] " + (own ? "border-white/50 bg-white/15 text-white/85" : "bg-white text-gray-500")}
                      style={own ? {} : { borderColor: accent }}>
                      <b>{maskName(quoted.author)}</b>: {quoted.text.length > 90 ? quoted.text.slice(0, 90) + "…" : quoted.text}
                    </div>
                  )}
                  {m.replyTo && !quoted && <div className={"mb-1 text-[10px] italic " + (own ? "text-white/60" : "text-gray-400")}>replying to an earlier message</div>}
                  <div className={"whitespace-pre-wrap break-words leading-relaxed " + fs}>{renderText(m.text, own)}</div>
                  <div className={"mt-0.5 text-right text-[8.5px] " + (own ? "text-white/70" : "text-gray-400")}>{hhmm(m.ts)}</div>
                  {reactions.length > 0 && (
                    <div className={"absolute -bottom-3 flex gap-1 " + (own ? "right-2" : "left-2")}>
                      {reactions.map(([emoji, names]) => (
                        <button key={emoji} onClick={() => onReact(m.id, emoji)} title={names.map(maskName).join(", ")}
                          className={"flex items-center gap-0.5 rounded-full border px-1.5 py-px text-[10px] shadow-sm " +
                            (names.includes(me) ? "border-transparent text-white" : "border-gray-200 bg-white text-gray-600")}
                          style={names.includes(me) ? { background: accent } : {}}>
                          {emoji} <span className="ll-mono font-bold">{names.length}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {reactions.length > 0 && <div className="h-2" />}
            </React.Fragment>
          );
        })}
      </div>

      {canWrite ? (
        <div className="relative border-t border-gray-100 px-3 py-2.5">
          {replyTo && (
            <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5 text-[11px] text-gray-500">
              <CornerUpLeft size={11} style={{ color: accent }} />
              <span className="min-w-0 flex-1 truncate">Replying to <b>{maskName(replyTo.author)}</b>: {replyTo.text}</span>
              <button onClick={() => setReplyTo(null)} className="shrink-0 text-gray-400 hover:text-gray-600"><X size={12} /></button>
            </div>
          )}
          {pickerOpen && (
            <div className="absolute bottom-full left-3 z-20 mb-1 grid w-64 grid-cols-8 gap-0.5 rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
              {EMOJI_SET.map((e2) => (
                <button key={e2} onClick={() => { setDraft((d) => d + e2); taRef.current?.focus(); }}
                  className="rounded-lg p-1 text-[16px] leading-none hover:bg-gray-100">{e2}</button>
              ))}
            </div>
          )}
          {mention && (
            <div className="absolute bottom-full left-12 z-20 mb-1 w-60 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl">
              <div className="px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-gray-400">Mention someone</div>
              {mention.opts.slice(0, 6).map((n, i) => (
                <button key={n} onClick={() => pickMention(n)} onMouseEnter={() => setMentionIdx(i)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
                  style={i === mentionIdx ? { background: accent + "12" } : {}}>
                  <Ava name={n} size={20} />
                  <span className="truncate text-[12px] font-semibold text-gray-800">{n}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-1.5">
            <button onClick={() => setPickerOpen((v) => !v)} title="Emoji"
              className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border " + (pickerOpen ? "border-transparent text-white" : "border-gray-200 text-gray-400 hover:text-gray-600")}
              style={pickerOpen ? { background: accent } : {}}>
              <Smile size={15} />
            </button>
            <textarea ref={taRef} value={draft} onChange={onDraftChange} rows={Math.min(4, draft.split("\n").length)}
              onKeyDown={onKeyDown}
              placeholder={"Write a message… (Enter to send · right-click to reply" + (candidates.length ? " · @ to mention" : "") + ")"}
              className={inputCls + " flex-1 resize-none"} />
            <button onClick={send} disabled={!draft.trim()} title="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white disabled:opacity-40" style={{ background: accent }}>
              <Send size={14} />
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-gray-100 px-4 py-3 text-center text-[11px] text-gray-400">You can read this thread, but posting is disabled for your account.</div>
      )}
    </>
  );
}
