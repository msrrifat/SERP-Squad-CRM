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


export const CITY_DATA = {
  "United States": [
    ["New York","New York"],["Brooklyn","New York"],["Queens","New York"],["Los Angeles","California"],
    ["San Diego","California"],["San Francisco","California"],["Chicago","Illinois"],["Houston","Texas"],
    ["San Antonio","Texas"],["Dallas","Texas"],["Austin","Texas"],["Round Rock","Texas"],["Phoenix","Arizona"],
    ["Philadelphia","Pennsylvania"],["Jacksonville","Florida"],["Miami","Florida"],["Tampa","Florida"],
    ["Columbus","Ohio"],["Charlotte","North Carolina"],["Indianapolis","Indiana"],["Seattle","Washington"],
    ["Denver","Colorado"],["Washington","District of Columbia"],["Boston","Massachusetts"],
    ["Nashville","Tennessee"],["Detroit","Michigan"],["Portland","Oregon"],["Las Vegas","Nevada"],
    ["Louisville","Kentucky"],["Baltimore","Maryland"],["Atlanta","Georgia"],["Minneapolis","Minnesota"],
    ["Salt Lake City","Utah"],["Kansas City","Missouri"],["Raleigh","North Carolina"],
  ],
  "Canada": [
    ["Toronto","Ontario"],["Ottawa","Ontario"],["Vancouver","British Columbia"],["Montreal","Quebec"],
    ["Calgary","Alberta"],["Edmonton","Alberta"],["Winnipeg","Manitoba"],["Halifax","Nova Scotia"],
    ["Mississauga","Ontario"],["Surrey","British Columbia"],
  ],
  "United Kingdom": [
    ["London","England"],["Birmingham","England"],["Manchester","England"],["Leeds","England"],
    ["Liverpool","England"],["Sheffield","England"],["Bristol","England"],["Leicester","England"],
    ["Nottingham","England"],["Brighton","England"],["Oxford","England"],["Cambridge","England"],
  ],
  "Australia": [
    ["Sydney","New South Wales"],["Melbourne","Victoria"],["Brisbane","Queensland"],
    ["Perth","Western Australia"],["Adelaide","South Australia"],["Canberra","Australian Capital Territory"],
    ["Gold Coast","Queensland"],["Newcastle","New South Wales"],["Hobart","Tasmania"],
  ],
};
export const COUNTRY_LABEL = { "United States": "USA", "Canada": "Canada", "United Kingdom": "England (UK)", "Australia": "Australia" };
export const ALL_CITIES = Object.entries(CITY_DATA).flatMap(([country, list]) =>
  list.map(([city, region]) => ({ city, region, country }))
);
export const REGION_ABBR = {
  "New York":"NY","California":"CA","Illinois":"IL","Texas":"TX","Arizona":"AZ",
  "Pennsylvania":"PA","Florida":"FL","Ohio":"OH","North Carolina":"NC","Indiana":"IN",
  "Washington":"WA","Colorado":"CO","District of Columbia":"DC","Massachusetts":"MA",
  "Tennessee":"TN","Michigan":"MI","Oregon":"OR","Nevada":"NV","Kentucky":"KY",
  "Maryland":"MD","Georgia":"GA","Virginia":"VA","Minnesota":"MN","Utah":"UT","Missouri":"MO",
  "Ontario":"ON","Quebec":"QC","British Columbia":"BC","Alberta":"AB","Manitoba":"MB",
  "Nova Scotia":"NS","England":"ENG",
  "New South Wales":"NSW","Victoria":"VIC","Queensland":"QLD","Western Australia":"WA",
  "South Australia":"SA","Australian Capital Territory":"ACT","Tasmania":"TAS","Northern Territory":"NT",
};
export const regionShort = (region) => REGION_ABBR[region] || region;
export const cityKey = (c) => `${c.city}|${c.region}|${c.country}`;
export const cityLabel = (c) => `${c.city}, ${regionShort(c.region)}`;
export const urlSlug = (url) => {
  const noProto = url.includes("//") ? url.slice(url.indexOf("//") + 2) : url;
  const i = noProto.indexOf("/");
  return i === -1 ? "/" : noProto.slice(i);
};
export const findCity = (name) => {
  const hit = ALL_CITIES.find((c) => c.city === name);
  // never silently substitute a different location — a wrong city means wrong SERP scans
  if (!hit) throw new Error(`Unknown city "${name}" — add it to CITY_DATA before tracking keywords there.`);
  return hit;
};

