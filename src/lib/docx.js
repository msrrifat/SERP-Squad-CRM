/* ================= Markdown → Word (.docx) exporter =================
   A real OOXML .docx built from scratch — no libraries. The written page or
   post downloads as a Word file where the formatting is NATIVE Word
   formatting: # headings become Title/Heading 1-3 styles (they show in
   Word's navigation pane), [anchor](url) becomes a live hyperlink, - lists
   become bulleted lists, 1. lists become numbered lists (each list restarts
   at 1), bold and italic markers become real runs, > becomes the Quote style
   and ![alt](url) becomes a labeled image note. No stars, no raw HTML.

   A .docx is a zip of XML parts; the zip here uses STORED entries (no
   compression), which every unzip implementation — Word, Google Docs,
   LibreOffice, Pages — accepts.
   ===================================================================== */

const enc = new TextEncoder();

/* ---- CRC-32 (required by the zip format even for stored entries) ---- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};

/* ---- minimal zip writer (stored entries) ---- */
function zipStore(files) {
  const chunks = [], central = [];
  let offset = 0;
  const u16 = (v) => new Uint8Array([v & 0xFF, (v >> 8) & 0xFF]);
  const u32 = (v) => new Uint8Array([v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >>> 24) & 0xFF]);
  const cat = (...parts) => {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    parts.forEach((p) => { out.set(p, o); o += p.length; });
    return out;
  };
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const local = cat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data);
    central.push(cat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset), name));
    chunks.push(local);
    offset += local.length;
  }
  const centralAll = cat(...central);
  const end = cat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralAll.length), u32(offset), u16(0));
  return new Blob([cat(...chunks, centralAll, end)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

/* ---- markdown → block model ---- */
const escXml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* inline: links first, then bold/italic inside each side */
function emphRuns(text) {
  const out = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    if (m[2] != null) out.push({ text: m[2], bold: true });
    else out.push({ text: m[3], italic: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.filter((r) => r.text);
}
function inlineRuns(text) {
  const out = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(...emphRuns(text.slice(last, m.index)));
    emphRuns(m[1]).forEach((r) => out.push({ ...r, link: m[2].trim() }));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(...emphRuns(text.slice(last)));
  return out;
}

export function parseMdBlocks(md) {
  const blocks = [];
  let list = null; // { kind: 'ul'|'ol', items: [runs] }
  const flush = () => { if (list) { blocks.push(list); list = null; } };
  for (const raw of String(md || "").split("\n")) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flush(); continue; }
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { flush(); blocks.push({ t: "h" + m[1].length, runs: inlineRuns(m[2]) }); continue; }
    if ((m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/))) { flush(); blocks.push({ t: "img", alt: m[1], src: m[2].trim() }); continue; }
    if ((m = line.match(/^>\s?(.*)$/))) { flush(); blocks.push({ t: "quote", runs: inlineRuns(m[1]) }); continue; }
    if ((m = line.match(/^[-*]\s+(.*)$/))) { if (!list || list.kind !== "ul") { flush(); list = { t: "list", kind: "ul", items: [] }; } list.items.push(inlineRuns(m[1])); continue; }
    if ((m = line.match(/^\d+[.)]\s+(.*)$/))) { if (!list || list.kind !== "ol") { flush(); list = { t: "list", kind: "ol", items: [] }; } list.items.push(inlineRuns(m[1])); continue; }
    flush();
    blocks.push({ t: "p", runs: inlineRuns(line.trim()) });
  }
  flush();
  return blocks;
}

/* ---- OOXML assembly ---- */
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/>
  <w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="52"/><w:color w:val="111827"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>
  <w:pPr><w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="1F2937"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/>
  <w:pPr><w:keepNext/><w:spacing w:before="240" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="27"/><w:color w:val="1F2937"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/>
  <w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="374151"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/>
  <w:pPr><w:ind w:left="567"/></w:pPr><w:rPr><w:i/><w:color w:val="4B5563"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/>
  <w:pPr><w:contextualSpacing/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="MetaInfo"><w:name w:val="Meta Info"/><w:basedOn w:val="Normal"/>
  <w:pPr><w:spacing w:after="40"/></w:pPr><w:rPr><w:sz w:val="18"/><w:color w:val="6B7280"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>
</w:styles>`;

function numberingXml(olCount) {
  const nums = [`<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>`];
  for (let i = 0; i < olCount; i++) {
    nums.push(`<w:num w:numId="${i + 2}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/>
  <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="567" w:hanging="283"/></w:pPr></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/>
  <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="567" w:hanging="283"/></w:pPr></w:lvl></w:abstractNum>
${nums.join("\n")}
</w:numbering>`;
}

/* build the whole package from parsed blocks */
export function markdownToDocxBlob({ markdown, metaTitle = "", metaDesc = "", site = "", pageUrl = "" }) {
  const blocks = parseMdBlocks(markdown);
  /* hyperlink relationships: one per unique absolute target */
  const rels = new Map(); // href -> rId
  const absolutize = (href) => (/^https?:\/\//i.test(href) ? href : href.startsWith("/") && site ? "https://" + site.replace(/^https?:\/\//, "").replace(/\/$/, "") + href : href);
  const relIdFor = (href) => {
    const abs = absolutize(href);
    if (!rels.has(abs)) rels.set(abs, "rId" + (rels.size + 10));
    return rels.get(abs);
  };

  const runXml = (r) => {
    const rpr = `${r.link ? '<w:rStyle w:val="Hyperlink"/>' : ""}${r.bold ? "<w:b/>" : ""}${r.italic ? "<w:i/>" : ""}${r.gray ? '<w:color w:val="6B7280"/><w:sz w:val="18"/>' : ""}`;
    const run = `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}<w:t xml:space="preserve">${escXml(r.text)}</w:t></w:r>`;
    return r.link ? `<w:hyperlink r:id="${relIdFor(r.link)}">${run}</w:hyperlink>` : run;
  };
  const pXml = (style, runs, numId) =>
    `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${numId ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>` : ""}</w:pPr>${runs.map(runXml).join("")}</w:p>`;

  const body = [];
  /* meta block on top — small gray lines an editor or client can act on */
  if (metaTitle) body.push(pXml("MetaInfo", [{ text: "Meta title: ", bold: true, gray: true }, { text: metaTitle, gray: true }]));
  if (metaDesc) body.push(pXml("MetaInfo", [{ text: "Meta description: ", bold: true, gray: true }, { text: metaDesc, gray: true }]));
  if (site && pageUrl) body.push(pXml("MetaInfo", [{ text: "Page: ", bold: true, gray: true }, { text: absolutize(pageUrl), gray: true, link: pageUrl }]));

  let olSeen = 0;
  for (const b of blocks) {
    if (b.t === "h1") body.push(pXml("Title", b.runs));
    else if (b.t === "h2") body.push(pXml("Heading1", b.runs));
    else if (b.t === "h3") body.push(pXml("Heading2", b.runs));
    else if (b.t === "h4") body.push(pXml("Heading3", b.runs));
    else if (b.t === "quote") body.push(pXml("Quote", b.runs));
    else if (b.t === "img") {
      const runs = [{ text: "Image", bold: true, gray: true }, { text: b.alt ? `: ${b.alt}` : "", gray: true }];
      if (/^https?:\/\//i.test(b.src)) runs.push({ text: "  (view)", gray: true, link: b.src });
      body.push(pXml("MetaInfo", runs.filter((r) => r.text)));
    } else if (b.t === "list") {
      const numId = b.kind === "ol" ? (olSeen++, olSeen + 1) : 1;
      b.items.forEach((runs) => body.push(pXml("ListParagraph", runs, numId)));
    } else body.push(pXml(null, b.runs));
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${body.join("")}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>
</w:body></w:document>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
${[...rels.entries()].map(([href, id]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escXml(href)}" TargetMode="External"/>`).join("\n")}
</Relationships>`;

  return zipStore([
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>` },
    { name: "word/document.xml", data: documentXml },
    { name: "word/_rels/document.xml.rels", data: docRels },
    { name: "word/styles.xml", data: STYLES_XML },
    { name: "word/numbering.xml", data: numberingXml(olSeen) },
  ]);
}

/* one-call download */
export function downloadContentDocx({ title, markdown, metaTitle, metaDesc, site, pageUrl, filename }) {
  const blob = markdownToDocxBlob({ markdown, metaTitle, metaDesc, site, pageUrl });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (filename || String(title || "content").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "content") + ".docx";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
