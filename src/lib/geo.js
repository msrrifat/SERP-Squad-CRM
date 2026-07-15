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
    ["New York","New York"],["Brooklyn","New York"],["Queens","New York"],["Buffalo","New York"],["Rochester","New York"],["Syracuse","New York"],["Albany","New York"],["Yonkers","New York"],
    ["Los Angeles","California"],["San Diego","California"],["San Francisco","California"],["San Jose","California"],["Sacramento","California"],["Fresno","California"],["Long Beach","California"],["Oakland","California"],["Bakersfield","California"],["Anaheim","California"],["Riverside","California"],["Irvine","California"],["Santa Ana","California"],["Stockton","California"],
    ["Chicago","Illinois"],["Aurora","Illinois"],["Naperville","Illinois"],["Rockford","Illinois"],["Springfield","Illinois"],
    ["Houston","Texas"],["San Antonio","Texas"],["Dallas","Texas"],["Austin","Texas"],["Fort Worth","Texas"],["El Paso","Texas"],["Arlington","Texas"],["Corpus Christi","Texas"],["Plano","Texas"],["Lubbock","Texas"],["Laredo","Texas"],["Irving","Texas"],["Garland","Texas"],["Frisco","Texas"],["McKinney","Texas"],["Round Rock","Texas"],["Waco","Texas"],["Amarillo","Texas"],
    ["Phoenix","Arizona"],["Tucson","Arizona"],["Mesa","Arizona"],["Chandler","Arizona"],["Scottsdale","Arizona"],["Glendale","Arizona"],["Gilbert","Arizona"],["Tempe","Arizona"],
    ["Philadelphia","Pennsylvania"],["Pittsburgh","Pennsylvania"],["Allentown","Pennsylvania"],["Erie","Pennsylvania"],
    ["Jacksonville","Florida"],["Miami","Florida"],["Tampa","Florida"],["Orlando","Florida"],["St. Petersburg","Florida"],["Hialeah","Florida"],["Fort Lauderdale","Florida"],["Tallahassee","Florida"],["Cape Coral","Florida"],["Port St. Lucie","Florida"],["West Palm Beach","Florida"],["Sarasota","Florida"],
    ["Columbus","Ohio"],["Cleveland","Ohio"],["Cincinnati","Ohio"],["Toledo","Ohio"],["Akron","Ohio"],["Dayton","Ohio"],
    ["Charlotte","North Carolina"],["Raleigh","North Carolina"],["Greensboro","North Carolina"],["Durham","North Carolina"],["Winston-Salem","North Carolina"],["Fayetteville","North Carolina"],["Cary","North Carolina"],["Wilmington","North Carolina"],["Asheville","North Carolina"],
    ["Indianapolis","Indiana"],["Fort Wayne","Indiana"],["Evansville","Indiana"],["South Bend","Indiana"],
    ["Seattle","Washington"],["Spokane","Washington"],["Tacoma","Washington"],["Vancouver","Washington"],["Bellevue","Washington"],
    ["Denver","Colorado"],["Colorado Springs","Colorado"],["Aurora","Colorado"],["Fort Collins","Colorado"],["Boulder","Colorado"],
    ["Washington","District of Columbia"],
    ["Boston","Massachusetts"],["Worcester","Massachusetts"],["Springfield","Massachusetts"],["Cambridge","Massachusetts"],["Lowell","Massachusetts"],
    ["Nashville","Tennessee"],["Memphis","Tennessee"],["Knoxville","Tennessee"],["Chattanooga","Tennessee"],["Clarksville","Tennessee"],["Murfreesboro","Tennessee"],
    ["Detroit","Michigan"],["Grand Rapids","Michigan"],["Warren","Michigan"],["Ann Arbor","Michigan"],["Lansing","Michigan"],
    ["Portland","Oregon"],["Salem","Oregon"],["Eugene","Oregon"],["Bend","Oregon"],
    ["Las Vegas","Nevada"],["Henderson","Nevada"],["Reno","Nevada"],["North Las Vegas","Nevada"],
    ["Louisville","Kentucky"],["Lexington","Kentucky"],
    ["Baltimore","Maryland"],["Columbia","Maryland"],["Annapolis","Maryland"],
    ["Atlanta","Georgia"],["Augusta","Georgia"],["Savannah","Georgia"],["Athens","Georgia"],["Macon","Georgia"],
    ["Minneapolis","Minnesota"],["St. Paul","Minnesota"],["Rochester","Minnesota"],["Duluth","Minnesota"],
    ["Salt Lake City","Utah"],["Provo","Utah"],["St. George","Utah"],["Ogden","Utah"],
    ["Kansas City","Missouri"],["St. Louis","Missouri"],["Springfield","Missouri"],["Columbia","Missouri"],
    ["Virginia Beach","Virginia"],["Norfolk","Virginia"],["Richmond","Virginia"],["Chesapeake","Virginia"],["Arlington","Virginia"],["Alexandria","Virginia"],
    ["Milwaukee","Wisconsin"],["Madison","Wisconsin"],["Green Bay","Wisconsin"],
    ["Oklahoma City","Oklahoma"],["Tulsa","Oklahoma"],["Norman","Oklahoma"],
    ["Albuquerque","New Mexico"],["Santa Fe","New Mexico"],["Las Cruces","New Mexico"],
    ["Omaha","Nebraska"],["Lincoln","Nebraska"],
    ["New Orleans","Louisiana"],["Baton Rouge","Louisiana"],["Shreveport","Louisiana"],["Lafayette","Louisiana"],
    ["Wichita","Kansas"],["Overland Park","Kansas"],["Topeka","Kansas"],
    ["Honolulu","Hawaii"],["Anchorage","Alaska"],["Boise","Idaho"],["Meridian","Idaho"],
    ["Des Moines","Iowa"],["Cedar Rapids","Iowa"],["Little Rock","Arkansas"],["Fayetteville","Arkansas"],
    ["Jackson","Mississippi"],["Gulfport","Mississippi"],["Birmingham","Alabama"],["Montgomery","Alabama"],["Huntsville","Alabama"],["Mobile","Alabama"],
    ["Charleston","South Carolina"],["Columbia","South Carolina"],["Greenville","South Carolina"],["Myrtle Beach","South Carolina"],
    ["Hartford","Connecticut"],["Bridgeport","Connecticut"],["New Haven","Connecticut"],["Stamford","Connecticut"],
    ["Providence","Rhode Island"],["Newark","New Jersey"],["Jersey City","New Jersey"],["Paterson","New Jersey"],["Trenton","New Jersey"],["Edison","New Jersey"],
    ["Manchester","New Hampshire"],["Burlington","Vermont"],["Portland","Maine"],["Wilmington","Delaware"],
    ["Charleston","West Virginia"],["Billings","Montana"],["Fargo","North Dakota"],["Sioux Falls","South Dakota"],["Cheyenne","Wyoming"],
  ],
  "Canada": [
    ["Toronto","Ontario"],["Ottawa","Ontario"],["Mississauga","Ontario"],["Brampton","Ontario"],["Hamilton","Ontario"],["London","Ontario"],["Markham","Ontario"],["Vaughan","Ontario"],["Kitchener","Ontario"],["Windsor","Ontario"],["Richmond Hill","Ontario"],["Oakville","Ontario"],["Burlington","Ontario"],["Oshawa","Ontario"],["Barrie","Ontario"],["St. Catharines","Ontario"],["Guelph","Ontario"],["Kingston","Ontario"],["Waterloo","Ontario"],["Thunder Bay","Ontario"],["Sudbury","Ontario"],
    ["Vancouver","British Columbia"],["Surrey","British Columbia"],["Burnaby","British Columbia"],["Richmond","British Columbia"],["Abbotsford","British Columbia"],["Coquitlam","British Columbia"],["Kelowna","British Columbia"],["Victoria","British Columbia"],["Langley","British Columbia"],["Nanaimo","British Columbia"],["Kamloops","British Columbia"],
    ["Montreal","Quebec"],["Quebec City","Quebec"],["Laval","Quebec"],["Gatineau","Quebec"],["Longueuil","Quebec"],["Sherbrooke","Quebec"],["Trois-Rivieres","Quebec"],
    ["Calgary","Alberta"],["Edmonton","Alberta"],["Red Deer","Alberta"],["Lethbridge","Alberta"],["Fort McMurray","Alberta"],
    ["Winnipeg","Manitoba"],["Brandon","Manitoba"],
    ["Halifax","Nova Scotia"],["Sydney","Nova Scotia"],
    ["Saskatoon","Saskatchewan"],["Regina","Saskatchewan"],
    ["St. John's","Newfoundland and Labrador"],["Fredericton","New Brunswick"],["Moncton","New Brunswick"],["Saint John","New Brunswick"],["Charlottetown","Prince Edward Island"],
  ],
  "United Kingdom": [
    ["London","England"],["Birmingham","England"],["Manchester","England"],["Leeds","England"],["Liverpool","England"],["Sheffield","England"],["Bristol","England"],["Leicester","England"],["Nottingham","England"],["Brighton","England"],["Oxford","England"],["Cambridge","England"],["Newcastle upon Tyne","England"],["Sunderland","England"],["Coventry","England"],["Bradford","England"],["Stoke-on-Trent","England"],["Wolverhampton","England"],["Plymouth","England"],["Southampton","England"],["Portsmouth","England"],["Reading","England"],["Derby","England"],["Luton","England"],["Northampton","England"],["Milton Keynes","England"],["Norwich","England"],["Bournemouth","England"],["Swindon","England"],["Southend-on-Sea","England"],["Middlesbrough","England"],["Peterborough","England"],["Hull","England"],["York","England"],["Ipswich","England"],["Blackpool","England"],["Bolton","England"],["Exeter","England"],["Gloucester","England"],["Watford","England"],["Cheltenham","England"],["Doncaster","England"],["Preston","England"],["Chelmsford","England"],["Colchester","England"],["Bath","England"],
    ["Glasgow","Scotland"],["Edinburgh","Scotland"],["Aberdeen","Scotland"],["Dundee","Scotland"],["Inverness","Scotland"],["Stirling","Scotland"],["Perth","Scotland"],
    ["Cardiff","Wales"],["Swansea","Wales"],["Newport","Wales"],["Wrexham","Wales"],
    ["Belfast","Northern Ireland"],["Derry","Northern Ireland"],["Lisburn","Northern Ireland"],
  ],
  "Australia": [
    ["Sydney","New South Wales"],["Newcastle","New South Wales"],["Wollongong","New South Wales"],["Central Coast","New South Wales"],["Parramatta","New South Wales"],["Penrith","New South Wales"],["Coffs Harbour","New South Wales"],["Wagga Wagga","New South Wales"],["Albury","New South Wales"],["Tamworth","New South Wales"],
    ["Melbourne","Victoria"],["Geelong","Victoria"],["Ballarat","Victoria"],["Bendigo","Victoria"],["Frankston","Victoria"],["Mildura","Victoria"],["Shepparton","Victoria"],
    ["Brisbane","Queensland"],["Gold Coast","Queensland"],["Sunshine Coast","Queensland"],["Townsville","Queensland"],["Cairns","Queensland"],["Toowoomba","Queensland"],["Mackay","Queensland"],["Rockhampton","Queensland"],["Bundaberg","Queensland"],
    ["Perth","Western Australia"],["Mandurah","Western Australia"],["Bunbury","Western Australia"],["Geraldton","Western Australia"],
    ["Adelaide","South Australia"],["Mount Gambier","South Australia"],
    ["Canberra","Australian Capital Territory"],
    ["Hobart","Tasmania"],["Launceston","Tasmania"],
    ["Darwin","Northern Territory"],["Alice Springs","Northern Territory"],
  ],
  "Netherlands": [
    ["Amsterdam","North Holland"],["Haarlem","North Holland"],["Zaanstad","North Holland"],["Haarlemmermeer","North Holland"],["Alkmaar","North Holland"],["Hilversum","North Holland"],["Amstelveen","North Holland"],["Purmerend","North Holland"],["Hoorn","North Holland"],
    ["Rotterdam","South Holland"],["The Hague","South Holland"],["Leiden","South Holland"],["Dordrecht","South Holland"],["Zoetermeer","South Holland"],["Delft","South Holland"],["Westland","South Holland"],["Alphen aan den Rijn","South Holland"],["Schiedam","South Holland"],["Gouda","South Holland"],
    ["Utrecht","Utrecht"],["Amersfoort","Utrecht"],["Veenendaal","Utrecht"],["Nieuwegein","Utrecht"],["Zeist","Utrecht"],
    ["Eindhoven","North Brabant"],["Tilburg","North Brabant"],["Breda","North Brabant"],["'s-Hertogenbosch","North Brabant"],["Helmond","North Brabant"],["Oss","North Brabant"],["Roosendaal","North Brabant"],["Bergen op Zoom","North Brabant"],
    ["Groningen","Groningen"],["Almere","Flevoland"],["Lelystad","Flevoland"],
    ["Nijmegen","Gelderland"],["Arnhem","Gelderland"],["Apeldoorn","Gelderland"],["Ede","Gelderland"],["Doetinchem","Gelderland"],
    ["Enschede","Overijssel"],["Zwolle","Overijssel"],["Deventer","Overijssel"],["Hengelo","Overijssel"],
    ["Maastricht","Limburg"],["Venlo","Limburg"],["Sittard-Geleen","Limburg"],["Heerlen","Limburg"],
    ["Leeuwarden","Friesland"],["Emmen","Drenthe"],["Assen","Drenthe"],["Middelburg","Zeeland"],["Vlissingen","Zeeland"],
  ],
};
export const COUNTRY_LABEL = { "United States": "USA", "Canada": "Canada", "United Kingdom": "England (UK)", "Australia": "Australia", "Netherlands": "Netherlands" };
export const ALL_CITIES = Object.entries(CITY_DATA).flatMap(([country, list]) =>
  list.map(([city, region]) => ({ city, region, country }))
);
export const REGION_ABBR = {
  "New York":"NY","California":"CA","Illinois":"IL","Texas":"TX","Arizona":"AZ",
  "Pennsylvania":"PA","Florida":"FL","Ohio":"OH","North Carolina":"NC","Indiana":"IN",
  "Washington":"WA","Colorado":"CO","District of Columbia":"DC","Massachusetts":"MA",
  "Tennessee":"TN","Michigan":"MI","Oregon":"OR","Nevada":"NV","Kentucky":"KY",
  "Maryland":"MD","Georgia":"GA","Virginia":"VA","Minnesota":"MN","Utah":"UT","Missouri":"MO",
  "Wisconsin":"WI","Oklahoma":"OK","New Mexico":"NM","Nebraska":"NE","Louisiana":"LA","Kansas":"KS",
  "Hawaii":"HI","Alaska":"AK","Idaho":"ID","Iowa":"IA","Arkansas":"AR","Mississippi":"MS","Alabama":"AL",
  "South Carolina":"SC","Connecticut":"CT","Rhode Island":"RI","New Jersey":"NJ","New Hampshire":"NH",
  "Vermont":"VT","Maine":"ME","Delaware":"DE","West Virginia":"WV","Montana":"MT","North Dakota":"ND",
  "South Dakota":"SD","Wyoming":"WY",
  "Ontario":"ON","Quebec":"QC","British Columbia":"BC","Alberta":"AB","Manitoba":"MB",
  "Nova Scotia":"NS","Saskatchewan":"SK","Newfoundland and Labrador":"NL","New Brunswick":"NB","Prince Edward Island":"PE",
  "England":"ENG","Scotland":"SCT","Wales":"WLS","Northern Ireland":"NIR",
  "North Holland":"NH","South Holland":"ZH","Utrecht":"UT","North Brabant":"NB","Groningen":"GR",
  "Flevoland":"FL","Gelderland":"GE","Overijssel":"OV","Limburg":"LI","Friesland":"FR","Drenthe":"DR","Zeeland":"ZE",
  "New South Wales":"NSW","Victoria":"VIC","Queensland":"QLD","Western Australia":"WA",
  "South Australia":"SA","Australian Capital Territory":"ACT","Tasmania":"TAS","Northern Territory":"NT",
};
export const regionShort = (region) => REGION_ABBR[region] || region;
export const cityKey = (c) => `${c.city}|${c.region || ""}|${c.country}`;
export const cityLabel = (c) => c.region ? `${c.city}, ${regionShort(c.region)}` : c.city;
/* the DataForSEO location_name — skips an empty region so custom cities like
   "York,United Kingdom" resolve correctly against DataForSEO's location list */
export const cityLocationName = (c) => [c.city, c.region, c.country].filter(Boolean).join(",");
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

