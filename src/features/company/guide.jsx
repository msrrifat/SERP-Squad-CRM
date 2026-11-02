import React, { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronRight, Lock, Search } from "lucide-react";
import { mdInline } from "../../lib/text.jsx";

/* ================= Product guide (internal) =================
   Reads docs/product-guide/*.md through the API server, which only answers
   signed-in TEAM sessions — the same pages the AI agent quotes. Nothing here
   is bundled into the public site. */
const hdrs = () => ({ "X-SS-Token": localStorage.getItem("ss_token") || "" });

/* tiny markdown renderer: headings, lists, tables, code, paragraphs */
function renderMd(md) {
  const lines = String(md || "").split("\n");
  const out = [];
  let i = 0, key = 0;
  const flushList = (items, ordered) => out.push(ordered
    ? <ol key={key++} className="my-2 list-decimal space-y-1 pl-6 text-[13px] leading-6 text-gray-700">{items.map((t, k) => <li key={k} dangerouslySetInnerHTML={{ __html: mdInline(t) }} />)}</ol>
    : <ul key={key++} className="my-2 list-disc space-y-1 pl-6 text-[13px] leading-6 text-gray-700">{items.map((t, k) => <li key={k} dangerouslySetInnerHTML={{ __html: mdInline(t) }} />)}</ul>);
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    const h = l.match(/^(#{1,4})\s+(.+)$/);
    if (h) {
      const lvl = h[1].length, id = h[2].toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const cls = lvl === 1 ? "mt-2 text-xl font-bold text-gray-900" : lvl === 2 ? "mt-8 border-b border-gray-200 pb-1 text-base font-bold text-gray-900" : lvl === 3 ? "mt-5 text-sm font-bold text-gray-900" : "mt-4 text-[13px] font-semibold text-gray-800";
      out.push(React.createElement(`h${lvl}`, { key: key++, id, className: cls, dangerouslySetInnerHTML: { __html: mdInline(h[2]) } }));
      i++; continue;
    }
    if (l.startsWith("```")) {
      const code = []; i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i++;
      out.push(<pre key={key++} className="my-2 overflow-x-auto rounded-lg bg-gray-900 p-3 text-[12px] leading-5 text-gray-100">{code.join("\n")}</pre>);
      continue;
    }
    if (/^\|/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim())); i++; }
      const body = rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
      const [head, ...rest] = body;
      out.push(<div key={key++} className="my-3 overflow-x-auto rounded-lg border border-gray-200"><table className="w-full text-[12.5px]">
        <thead className="bg-gray-50"><tr>{head.map((c, k) => <th key={k} className="px-3 py-2 text-left font-semibold text-gray-800" dangerouslySetInnerHTML={{ __html: mdInline(c) }} />)}</tr></thead>
        <tbody>{rest.map((r, ri) => <tr key={ri} className="border-t border-gray-100 align-top">{r.map((c, k) => <td key={k} className="px-3 py-2 text-gray-700" dangerouslySetInnerHTML={{ __html: mdInline(c) }} />)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^\s*[-*]\s+/.test(l) || /^\s*\d+\.\s+/.test(l)) {
      const ordered = /^\s*\d+\.\s+/.test(l), items = [];
      while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) {
        if (/^\s{2,}\S/.test(lines[i]) && items.length && !/^\s*[-*\d]/.test(lines[i])) items[items.length - 1] += " " + lines[i].trim();
        else items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
        i++;
      }
      flushList(items, ordered); continue;
    }
    if (/^>\s?/.test(l)) {
      const q = []; while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ""));
      out.push(<blockquote key={key++} className="my-2 border-l-4 border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900" dangerouslySetInnerHTML={{ __html: mdInline(q.join(" ")) }} />);
      continue;
    }
    const para = []; while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\||\s*[-*]\s|\s*\d+\.\s|>)/.test(lines[i])) para.push(lines[i++]);
    out.push(<p key={key++} className="my-2 text-[13px] leading-6 text-gray-700" dangerouslySetInnerHTML={{ __html: mdInline(para.join(" ")) }} />);
  }
  return out;
}

export function ProductGuideSection() {
  const [toc, setToc] = useState(null);
  const [err, setErr] = useState("");
  const [file, setFile] = useState("");
  const [doc, setDoc] = useState(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState(null);
  useEffect(() => {
    fetch("/api/product-guide/toc", { headers: hdrs() }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.detail || `HTTP ${r.status}`);
      setToc(j.docs || []); if (j.docs?.[0]) setFile(j.docs[0].file);
    }).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => {
    if (!file) return;
    setDoc(null);
    fetch("/api/product-guide/doc?file=" + encodeURIComponent(file), { headers: hdrs() }).then((r) => r.json()).then((j) => setDoc(j.markdown ? j : null)).catch(() => setDoc(null));
  }, [file]);
  const rendered = useMemo(() => (doc ? renderMd(doc.markdown) : null), [doc]);
  const search = async (e) => {
    e?.preventDefault?.();
    if (!q.trim()) { setHits(null); return; }
    try {
      const r = await fetch("/api/product-guide", { method: "POST", headers: { "Content-Type": "application/json", ...hdrs() }, body: JSON.stringify({ q, limit: 8 }) });
      const j = await r.json(); setHits(j.sections || []);
    } catch { setHits([]); }
  };
  if (err) return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><Lock size={14} className="mr-1 inline" /> {err}</div>;
  return (
    <div className="flex gap-5">
      <aside className="w-64 shrink-0">
        <form onSubmit={search} className="mb-3 flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2">
          <Search size={13} className="text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the guide…" className="w-full bg-transparent py-1.5 text-[13px] outline-none" />
        </form>
        {hits && (
          <div className="mb-3 rounded-lg border border-gray-200 bg-white p-2 text-[12px]">
            <div className="mb-1 flex items-center justify-between font-semibold text-gray-700"><span>{hits.length} match{hits.length === 1 ? "" : "es"}</span><button onClick={() => setHits(null)} className="text-gray-400 hover:text-gray-700">clear</button></div>
            {hits.map((h, k) => <button key={k} onClick={() => setFile(h.file)} className="block w-full rounded px-1 py-1 text-left hover:bg-gray-50"><span className="text-gray-500">{h.doc} ›</span> {h.heading}</button>)}
            {!hits.length && <div className="text-gray-500">Nothing matched — try another word.</div>}
          </div>
        )}
        {(toc || []).map((d) => (
          <div key={d.file} className="mb-1">
            <button onClick={() => setFile(d.file)} className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[13px] ${file === d.file ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"}`}>
              <BookOpen size={13} /> <span className="truncate">{d.title}</span>
            </button>
            {file === d.file && d.sections.length > 0 && (
              <div className="ml-3 border-l border-gray-200 pl-2">
                {d.sections.map((h) => <a key={h} href={"#" + h.toLowerCase().replace(/[^a-z0-9]+/g, "-")} onClick={(e) => { e.preventDefault(); document.getElementById(h.toLowerCase().replace(/[^a-z0-9]+/g, "-"))?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="flex items-center gap-1 py-0.5 text-[12px] text-gray-500 hover:text-gray-900"><ChevronRight size={10} /> <span className="truncate">{h}</span></a>)}
              </div>
            )}
          </div>
        ))}
        {toc && !toc.length && <div className="text-[12px] text-gray-500">No guide documents are shipped on this server.</div>}
      </aside>
      <article className="min-w-0 flex-1 rounded-2xl border border-gray-200 bg-white p-6">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700"><Lock size={12} /> Internal — team members and the SERP Squad AI agent only</div>
        {!toc && !err && <div className="text-sm text-gray-500">Loading…</div>}
        {toc && file && !doc && <div className="text-sm text-gray-500">Loading document…</div>}
        {rendered}
      </article>
    </div>
  );
}
