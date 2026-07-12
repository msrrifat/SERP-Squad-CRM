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
import { isoDate } from "./months.jsx";

export const fmt = (n) => {
  if (n == null || isNaN(n)) return "–";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return Math.round(n).toLocaleString();
};
export const pctDelta = (cur, prev) => (!prev ? 0 : ((cur - prev) / prev) * 100);
export const money = (n) => "$" + (+n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
export const linkify = (text) => {
  const parts = String(text || "").split(/(https?:\/\/[^\s]+|www\.[^\s]+)/g);
  return parts.map((p, i) =>
    /^(https?:\/\/|www\.)/.test(p)
      ? <a key={i} href={p.startsWith("http") ? p : "https://" + p} target="_blank" rel="noopener"
          className="underline" style={{ color: "inherit" }}>{p}</a>
      : p
  );
};
export const relTime = (ts) => {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return "just now";
  const m = Math.floor(sec / 60); if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60); if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
};

export const uid = () => "b" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
export const todayISO = () => isoDate(new Date());
export const fmtDay = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric" }) : "—");
export const fmtTs2 = (ts) => (ts ? new Date(ts).toLocaleDateString("en", { month: "short", day: "numeric" }) : "—");
