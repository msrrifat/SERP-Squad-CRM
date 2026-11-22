/* ================= Word (.docx) → plain text =================
   A .docx is a zip of XML parts. This reads the zip's central directory,
   pulls out word/document.xml (inflating it with the browser's own
   DecompressionStream) and turns its paragraphs into plain text: headings
   become "# " lines and list items become "- " lines, so a style guide keeps
   its shape. No library. Used for brand documents, where only the words
   matter. */
const dec = new TextDecoder();

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot open Word files. Paste the text instead.");
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
}

/* the bytes of one named file inside the zip, as text */
async function zipEntryText(buf, wanted) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let e = u8.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e -= 1;      // end of central directory
  if (e < 0) throw new Error("This is not a Word (.docx) file.");
  const count = dv.getUint16(e + 10, true);
  let off = dv.getUint32(e + 16, true);
  for (let i = 0; i < count && off + 46 <= u8.length; i += 1) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true), size = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true), extraLen = dv.getUint16(off + 30, true), commentLen = dv.getUint16(off + 32, true);
    const local = dv.getUint32(off + 42, true);
    if (dec.decode(u8.subarray(off + 46, off + 46 + nameLen)) === wanted) {
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      const data = u8.subarray(start, start + size);
      if (method === 0) return dec.decode(data);
      if (method === 8) return inflateRaw(data);
      throw new Error("This Word file is packed in a way that cannot be read here. Paste the text instead.");
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("This is not a Word (.docx) file.");
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescapeXml = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, k) => {
  if (k[0] !== "#") return ENT[k.toLowerCase()] ?? m;
  const code = k[1].toLowerCase() === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
  return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
});

/* word/document.xml → text, one line per paragraph */
export function documentXmlToText(xml) {
  const body = xml.replace(/^[\s\S]*?<w:body[^>]*>/, "").replace(/<w:sectPr[\s\S]*$/, "");
  const out = [];
  for (const raw of body.split(/<\/w:p>/)) {
    const style = (raw.match(/<w:pStyle\s+w:val="([^"]+)"/) || [])[1] || "";
    const text = unescapeXml(raw
      .replace(/<w:instrText[\s\S]*?<\/w:instrText>/g, "").replace(/<w:delText[\s\S]*?<\/w:delText>/g, "")
      .replace(/<w:tab\b[^>]*\/>/g, "\t").replace(/<w:(br|cr)\b[^>]*\/>/g, "\n").replace(/<\/w:tc>/g, "\t")
      .replace(/<[^>]+>/g, "")).replace(/[ \t]+$/gm, "").trim();
    if (!text) { if (out.length && out[out.length - 1] !== "") out.push(""); continue; }
    const h = /^(Title|Heading\s?(\d))/i.exec(style);
    if (h) out.push("", "#".repeat(Math.min(4, +(h[2] || 1))) + " " + text, "");
    else if (/<w:numPr>/.test(raw)) out.push("- " + text);
    else out.push(text);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* ArrayBuffer of a .docx → its text */
export async function docxToText(buf) {
  return documentXmlToText(await zipEntryText(buf, "word/document.xml"));
}
