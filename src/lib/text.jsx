import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  MapPin, Phone, Globe, Star, Search, Users, Eye, Settings, Plus, X,
  Building2, LayoutDashboard, Target, Palette, Link2, CheckCircle2,
  Printer, ArrowUpRight, ArrowDownRight, Minus, Navigation, Upload,
  MousePointerClick, BarChart3, Smartphone, Monitor, RefreshCw, Clock,
  Trash2, ChevronDown, ChevronRight, Folder, FolderOpen, Zap, KeyRound,
  LogIn, LogOut, ChevronUp, Copy, Settings2, Type, AlignLeft, Table2,
  PieChart as PieIcon, Activity, FileText as FileTextIcon, ArrowLeft, ClipboardPaste,
  Calendar, Sun, Moon, Shield, History, UserPlus, Wallet, Receipt, ListTodo, MessageSquare,
  Rocket, Share2, Lock, Send, ImagePlus, List, ListOrdered, Quote, Facebook, Instagram, Linkedin, Twitter, Youtube, Music2, Pin,
} from "lucide-react";


export function inlineFmt(str, keyBase = "f") {
  const out = []; const re = /(\*\*[^*]+\*\*|~~[^~]+~~|\*[^*\n]+\*)/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(str))) {
    if (m.index > last) out.push(str.slice(last, m.index));
    const tok = m[0];
    out.push(tok.startsWith("**")
      ? <b key={keyBase + "b" + i}>{tok.slice(2, -2)}</b>
      : tok.startsWith("~~")
      ? <s key={keyBase + "s" + i}>{tok.slice(2, -2)}</s>
      : <i key={keyBase + "i" + i}>{tok.slice(1, -1)}</i>);
    last = m.index + tok.length; i++;
  }
  if (last < str.length) out.push(str.slice(last));
  return out;
}
export function renderTextWithLinks(text, links = []) {
  if (!links.length) return inlineFmt(text || "");
  let parts = [text];
  links.forEach((l) => {
    parts = parts.flatMap((seg) => {
      if (typeof seg !== "string" || !seg.includes(l.phrase)) return [seg];
      const [before, ...rest] = seg.split(l.phrase);
      return [before, <a key={l.id} href={l.href} target="_blank" rel="noopener" className="underline decoration-2 underline-offset-2" style={{ color: "#B45309" }}>{l.phrase}</a>, rest.join(l.phrase)];
    });
  });
  return parts.flatMap((seg, i) => (typeof seg === "string" ? inlineFmt(seg, "s" + i) : [seg]));
}
export const escHtml = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const mdFmt = (t = "") => t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/~~([^~]+)~~/g, "<s>$1</s>").replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
export const mdInline = (t = "") => mdFmt(escHtml(t));
export function blocksToHtml(blocks = []) {
  return blocks.map((b) => {
    if (b.kind === "heading") return `<h${b.level}>${mdInline(b.text)}</h${b.level}>`;
    if (b.kind === "image") return `<img src="${escHtml(b.dataUrl || b.src)}" alt="${escHtml(b.alt || "")}" title="${escHtml(b.title || "")}" />`;
    if (b.kind === "list") { const tag = b.style === "number" ? "ol" : "ul"; return `<${tag}>` + (b.items || []).map((it) => `<li>${mdInline(it)}</li>`).join("") + `</${tag}>`; }
    if (b.kind === "quote") return `<blockquote><p>${mdInline(b.text || "")}</p></blockquote>`;
    // links first (on escaped plain text, stashed as placeholders) so markdown
    // can't split a phrase and phrases can't match inside generated tags
    let t = escHtml(b.text || "");
    const stash = [];
    (b.links || []).forEach((l) => {
      const ph = escHtml(l.phrase || "");
      if (!ph || !t.includes(ph)) return;
      const token = `\u0000${stash.length}\u0000`;
      stash.push(`<a href="${escHtml(l.href)}">${mdFmt(ph)}</a>`);
      t = t.replace(ph, token);
    });
    t = mdFmt(t);
    stash.forEach((html, i) => { t = t.replace(`\u0000${i}\u0000`, html); });
    return `<p>${t}</p>`;
  }).join("\n");
}

