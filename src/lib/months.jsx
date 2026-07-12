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


export function monthLabels() {
  const out = []; const now = new Date();
  for (let i = 12; i >= 0; i--) {
    const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(m.toLocaleString("en", { month: "short" }) + " ’" + String(m.getFullYear()).slice(2));
  }
  return out;
}
export const buildMonthDates = () => {
  const out = []; const now = new Date();
  for (let i = 12; i >= 0; i--) out.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  return out;
};
export const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/* The 13-month grid is module state so every component shares one copy, but it is
   NOT frozen at load: useMonthGrid() below refreshes it when the calendar month
   rolls over during an open session and re-renders/regenerates dependent data. */
export let LABELS = monthLabels();
export let MONTH_DATES = buildMonthDates();
export let DEFAULT_RANGE = { start: isoDate(MONTH_DATES[0]), end: isoDate(new Date()) };
export let MONTH_GRID_KEY = new Date().getFullYear() * 12 + new Date().getMonth();
export function refreshMonthGridIfStale() {
  const now = new Date();
  const key = now.getFullYear() * 12 + now.getMonth();
  if (key === MONTH_GRID_KEY) return false;
  MONTH_GRID_KEY = key;
  LABELS = monthLabels();
  MONTH_DATES = buildMonthDates();
  DEFAULT_RANGE = { start: isoDate(MONTH_DATES[0]), end: isoDate(now) };
  return true;
}
export function useMonthGrid() {
  const [key, setKey] = useState(MONTH_GRID_KEY);
  useEffect(() => {
    const check = () => { if (refreshMonthGridIfStale()) setKey(MONTH_GRID_KEY); };
    const iv = setInterval(check, 60000);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", check); };
  }, []);
  return key;
}

export function rangeIdx(range) {
  if (!range) return [0, 12];
  const f = (str) => {
    const d = new Date(str + "T00:00:00");
    let i = MONTH_DATES.length - 1;
    while (i > 0 && MONTH_DATES[i] > d) i--;
    return i;
  };
  let a = f(range.start), b = f(range.end);
  if (a > b) [a, b] = [b, a];
  return [a, b];
}
