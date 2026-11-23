package com.serpsquad.agent;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

/**
 * Writes and reads the two kinds of file people open: a spreadsheet (.xlsx)
 * and a document (.docx). Both are plain Office Open XML, made here without
 * any library: a zip of a few small XML parts. Excel, Word, Google Sheets,
 * Google Docs, Numbers, Pages and LibreOffice open them.
 *
 * A sheet is one table: the first row is the header (bold, kept in view when
 * scrolling). A document is written from simple Markdown: headings, bullet
 * and numbered lines, tables, bold text.
 */
final class Office {
    private Office() {}

    private static String esc(String s) {
        StringBuilder b = new StringBuilder(s.length() + 16);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '&') b.append("&amp;");
            else if (c == '<') b.append("&lt;");
            else if (c == '>') b.append("&gt;");
            else if (c == '"') b.append("&quot;");
            else if (c == '\t' || c == '\n' || c == '\r' || (c >= 0x20 && c != 0xFFFE && c != 0xFFFF)) b.append(c);      // other control characters are not allowed in XML
        }
        return b.toString();
    }

    private static void put(ZipOutputStream z, String name, String xml) throws IOException {
        z.putNextEntry(new ZipEntry(name));
        z.write(xml.getBytes(StandardCharsets.UTF_8));
        z.closeEntry();
    }

    private static void save(Path file, Map<String, String> parts) throws IOException {
        Files.createDirectories(file.getParent());
        Path tmp = file.resolveSibling(file.getFileName() + ".part");
        try (OutputStream os = Files.newOutputStream(tmp); ZipOutputStream z = new ZipOutputStream(os)) {
            for (Map.Entry<String, String> e : parts.entrySet()) put(z, e.getKey(), e.getValue());
        }
        Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
    }

    private static final String HEAD = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n";

    // ---------------- spreadsheet ----------------

    static String column(int index) {
        StringBuilder s = new StringBuilder();
        for (int n = index + 1; n > 0; n = (n - 1) / 26) s.insert(0, (char) ('A' + (n - 1) % 26));
        return s.toString();
    }

    private static int columnIndex(String ref) {
        int n = 0;
        for (int i = 0; i < ref.length() && Character.isLetter(ref.charAt(i)); i++) n = n * 26 + (Character.toUpperCase(ref.charAt(i)) - 'A' + 1);
        return n - 1;
    }

    /** A value that is plainly a number is stored as one, so it can be sorted and summed; "0113 496 0000" or "007" stay text. */
    private static boolean number(String v) { return v.matches("-?(0|[1-9]\\d{0,14})(\\.\\d{1,10})?"); }

    static void writeSheet(Path file, List<List<String>> rows, String sheetName) throws IOException {
        int cols = 0;
        for (List<String> r : rows) cols = Math.max(cols, r.size());
        StringBuilder sh = new StringBuilder(HEAD);
        sh.append("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetViews><sheetView workbookViewId=\"0\">");
        if (rows.size() > 1) sh.append("<pane ySplit=\"1\" topLeftCell=\"A2\" activePane=\"bottomLeft\" state=\"frozen\"/>");
        sh.append("</sheetView></sheetViews><cols>");
        for (int c = 0; c < cols; c++) {
            int widest = 8;
            for (int r = 0; r < Math.min(rows.size(), 200); r++) if (c < rows.get(r).size()) widest = Math.max(widest, Math.min(60, rows.get(r).get(c).length() + 2));
            sh.append("<col min=\"").append(c + 1).append("\" max=\"").append(c + 1).append("\" width=\"").append(widest).append("\" customWidth=\"1\"/>");
        }
        sh.append("</cols><sheetData>");
        for (int r = 0; r < rows.size(); r++) {
            sh.append("<row r=\"").append(r + 1).append("\">");
            List<String> row = rows.get(r);
            for (int c = 0; c < row.size(); c++) {
                String v = row.get(c) == null ? "" : row.get(c);
                if (v.isEmpty()) continue;
                String ref = column(c) + (r + 1), style = r == 0 ? " s=\"1\"" : "";
                if (r > 0 && number(v)) sh.append("<c r=\"").append(ref).append("\"").append(style).append("><v>").append(v).append("</v></c>");
                else sh.append("<c r=\"").append(ref).append("\" t=\"inlineStr\"").append(style).append("><is><t xml:space=\"preserve\">").append(esc(v)).append("</t></is></c>");
            }
            sh.append("</row>");
        }
        sh.append("</sheetData></worksheet>");
        String name = (sheetName == null || sheetName.isBlank() ? "Sheet1" : sheetName).replaceAll("[\\[\\]:*?/\\\\]", " ").trim();
        if (name.length() > 31) name = name.substring(0, 31);
        Map<String, String> p = new java.util.LinkedHashMap<>();
        p.put("[Content_Types].xml", HEAD + "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/>"
            + "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>"
            + "<Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/></Types>");
        p.put("_rels/.rels", HEAD + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>");
        p.put("xl/workbook.xml", HEAD + "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><bookViews><workbookView/></bookViews><sheets><sheet name=\"" + esc(name.isEmpty() ? "Sheet1" : name) + "\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>");
        p.put("xl/_rels/workbook.xml.rels", HEAD + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/>"
            + "<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>");
        p.put("xl/styles.xml", HEAD + "<styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><fonts count=\"2\"><font><sz val=\"11\"/><name val=\"Calibri\"/></font><font><b/><sz val=\"11\"/><name val=\"Calibri\"/></font></fonts>"
            + "<fills count=\"2\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill></fills><borders count=\"1\"><border><left/><right/><top/><bottom/><diagonal/></border></borders>"
            + "<cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs><cellXfs count=\"2\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\"/><xf numFmtId=\"0\" fontId=\"1\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyFont=\"1\"/></cellXfs><cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles></styleSheet>");
        p.put("xl/worksheets/sheet1.xml", sh.toString());
        save(file, p);
    }

    private static Document xml(ZipFile z, String name) throws Exception {
        ZipEntry e = z.getEntry(name);
        if (e == null) return null;
        DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
        f.setNamespaceAware(false);
        f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);       // a file from outside is data: no entities, nothing fetched
        f.setExpandEntityReferences(false);
        try (InputStream in = z.getInputStream(e)) { return f.newDocumentBuilder().parse(in); }
    }

    private static String texts(Element e) {
        StringBuilder s = new StringBuilder();
        NodeList t = e.getElementsByTagName("t");
        for (int i = 0; i < t.getLength(); i++) s.append(t.item(i).getTextContent());
        return s.toString();
    }

    /** The name of a workbook's first tab, or "" when it cannot be read. */
    static String sheetName(Path file) {
        try (ZipFile z = new ZipFile(file.toFile())) {
            Document wb = xml(z, "xl/workbook.xml");
            NodeList sh = wb == null ? null : wb.getElementsByTagName("sheet");
            return sh == null || sh.getLength() == 0 ? "" : ((Element) sh.item(0)).getAttribute("name");
        } catch (Exception e) {
            return "";
        }
    }

    /** The first sheet of a workbook as rows of text, whoever saved it last (this program, Excel, Google Sheets). */
    static List<List<String>> readSheet(Path file) throws IOException {
        List<List<String>> rows = new ArrayList<>();
        try (ZipFile z = new ZipFile(file.toFile())) {
            List<String> shared = new ArrayList<>();
            Document ss = xml(z, "xl/sharedStrings.xml");
            if (ss != null) { NodeList si = ss.getElementsByTagName("si"); for (int i = 0; i < si.getLength(); i++) shared.add(texts((Element) si.item(i))); }
            String first = "xl/worksheets/sheet1.xml";
            if (z.getEntry(first) == null) for (java.util.Enumeration<? extends ZipEntry> en = z.entries(); en.hasMoreElements();) { String n = en.nextElement().getName(); if (n.startsWith("xl/worksheets/") && n.endsWith(".xml")) { first = n; break; } }
            Document sheet = xml(z, first);
            if (sheet == null) throw new IOException("That workbook has no sheet.");
            NodeList rs = sheet.getElementsByTagName("row");
            for (int i = 0; i < rs.getLength() && rows.size() < 50000; i++) {
                List<String> row = new ArrayList<>();
                NodeList cs = ((Element) rs.item(i)).getElementsByTagName("c");
                for (int k = 0; k < cs.getLength(); k++) {
                    Element c = (Element) cs.item(k);
                    int at = c.hasAttribute("r") ? columnIndex(c.getAttribute("r")) : row.size();
                    if (at < 0 || at > 500) continue;
                    while (row.size() < at) row.add("");
                    String type = c.getAttribute("t"), v = "";
                    NodeList vs = c.getElementsByTagName("v");
                    if ("inlineStr".equals(type)) v = texts(c);
                    else if (vs.getLength() > 0) { v = vs.item(0).getTextContent(); if ("s".equals(type)) { try { v = shared.get(Integer.parseInt(v.trim())); } catch (Exception e) { v = ""; } } }
                    row.add(v);
                }
                rows.add(row);
            }
        } catch (IOException e) {
            throw e;
        } catch (Exception e) {
            throw new IOException("That file could not be read as a spreadsheet.");
        }
        return rows;
    }

    // ---------------- document ----------------

    private static final java.util.regex.Pattern BOLD = java.util.regex.Pattern.compile("\\*\\*(.+?)\\*\\*");

    private static String run(String text, boolean bold) {
        return text.isEmpty() ? "" : "<w:r>" + (bold ? "<w:rPr><w:b/></w:rPr>" : "") + "<w:t xml:space=\"preserve\">" + esc(text) + "</w:t></w:r>";
    }

    /** Text with **bold** parts; a ** that has no partner stays as it was written. */
    private static String runs(String text) {
        StringBuilder b = new StringBuilder();
        java.util.regex.Matcher m = BOLD.matcher(text);
        int at = 0;
        while (m.find()) { b.append(run(text.substring(at, m.start()), false)).append(run(m.group(1), true)); at = m.end(); }
        return b.append(run(text.substring(at), false)).toString();
    }

    private static String para(String style, String text) {
        return "<w:p>" + (style == null ? "" : "<w:pPr><w:pStyle w:val=\"" + style + "\"/></w:pPr>") + runs(text) + "</w:p>";
    }

    private static List<String> cells(String line) {
        String t = line.trim();
        if (t.startsWith("|")) t = t.substring(1);
        if (t.endsWith("|")) t = t.substring(0, t.length() - 1);
        List<String> out = new ArrayList<>();
        for (String c : t.split("\\|", -1)) out.add(c.trim());
        return out;
    }

    static void writeDocument(Path file, String markdown) throws IOException {
        StringBuilder body = new StringBuilder();
        String[] lines = (markdown == null ? "" : markdown).replace("\r\n", "\n").replace('\r', '\n').split("\n", -1);
        for (int i = 0; i < lines.length; i++) {
            String l = lines[i].stripTrailing(), t = l.trim();
            if (t.isEmpty()) continue;
            if (t.startsWith("|") && i + 1 < lines.length && lines[i + 1].trim().matches("\\|?[\\s:|-]{3,}\\|?") && lines[i + 1].contains("-")) {
                /* a Markdown table: the header row, the dashes, then the rows */
                List<List<String>> rows = new ArrayList<>();
                rows.add(cells(t));
                int k = i + 2;
                while (k < lines.length && lines[k].trim().startsWith("|")) { rows.add(cells(lines[k])); k++; }
                body.append("<w:tbl><w:tblPr><w:tblW w:w=\"0\" w:type=\"auto\"/><w:tblBorders>");
                for (String side : new String[] { "top", "left", "bottom", "right", "insideH", "insideV" }) body.append("<w:").append(side).append(" w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"999999\"/>");
                body.append("</w:tblBorders><w:tblCellMar><w:left w:w=\"100\" w:type=\"dxa\"/><w:right w:w=\"100\" w:type=\"dxa\"/></w:tblCellMar></w:tblPr>");
                for (int r = 0; r < rows.size(); r++) {
                    body.append("<w:tr>");
                    for (String c : rows.get(r)) body.append("<w:tc><w:tcPr><w:tcW w:w=\"0\" w:type=\"auto\"/></w:tcPr>").append(para(null, r == 0 && !c.contains("**") ? "**" + c + "**" : c)).append("</w:tc>");
                    body.append("</w:tr>");
                }
                body.append("</w:tbl>").append(para(null, ""));
                i = k - 1;
                continue;
            }
            if (t.startsWith("### ")) body.append(para("Heading3", t.substring(4)));
            else if (t.startsWith("## ")) body.append(para("Heading2", t.substring(3)));
            else if (t.startsWith("# ")) body.append(para("Heading1", t.substring(2)));
            else if (t.matches("[-*•] .+")) body.append(para("ListItem", "•  " + t.substring(2)));
            else if (t.matches("\\d{1,3}[.)] .+")) body.append(para("ListItem", t));
            else body.append(para(null, t));
        }
        String w = "xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"";
        Map<String, String> p = new java.util.LinkedHashMap<>();
        p.put("[Content_Types].xml", HEAD + "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/>"
            + "<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/><Override PartName=\"/word/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml\"/></Types>");
        p.put("_rels/.rels", HEAD + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>");
        p.put("word/_rels/document.xml.rels", HEAD + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>");
        StringBuilder st = new StringBuilder(HEAD).append("<w:styles ").append(w).append("><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii=\"Calibri\" w:hAnsi=\"Calibri\" w:cs=\"Calibri\"/><w:sz w:val=\"22\"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after=\"140\" w:line=\"276\" w:lineRule=\"auto\"/></w:pPr></w:pPrDefault></w:docDefaults>")
            .append("<w:style w:type=\"paragraph\" w:default=\"1\" w:styleId=\"Normal\"><w:name w:val=\"Normal\"/></w:style>");
        int[] sizes = { 36, 28, 24 };
        for (int h = 1; h <= 3; h++) st.append("<w:style w:type=\"paragraph\" w:styleId=\"Heading").append(h).append("\"><w:name w:val=\"heading ").append(h).append("\"/><w:basedOn w:val=\"Normal\"/><w:next w:val=\"Normal\"/><w:pPr><w:keepNext/><w:spacing w:before=\"").append(h == 1 ? 320 : 240).append("\" w:after=\"120\"/><w:outlineLvl w:val=\"").append(h - 1).append("\"/></w:pPr><w:rPr><w:b/><w:sz w:val=\"").append(sizes[h - 1]).append("\"/></w:rPr></w:style>");
        st.append("<w:style w:type=\"paragraph\" w:styleId=\"ListItem\"><w:name w:val=\"List Item\"/><w:basedOn w:val=\"Normal\"/><w:pPr><w:spacing w:after=\"60\"/><w:ind w:left=\"360\" w:hanging=\"240\"/></w:pPr></w:style></w:styles>");
        p.put("word/styles.xml", st.toString());
        p.put("word/document.xml", HEAD + "<w:document " + w + "><w:body>" + body + "<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/><w:pgMar w:top=\"1134\" w:right=\"1134\" w:bottom=\"1134\" w:left=\"1134\" w:header=\"708\" w:footer=\"708\" w:gutter=\"0\"/></w:sectPr></w:body></w:document>");
        save(file, p);
    }

    /** The text of a Word document, one line per paragraph. */
    static String readDocument(Path file) throws IOException {
        try (ZipFile z = new ZipFile(file.toFile())) {
            Document d = xml(z, "word/document.xml");
            if (d == null) throw new IOException("That file is not a Word document.");
            StringBuilder out = new StringBuilder();
            NodeList ps = d.getElementsByTagName("w:p");
            for (int i = 0; i < ps.getLength(); i++) {
                StringBuilder line = new StringBuilder();
                NodeList ts = ((Element) ps.item(i)).getElementsByTagName("w:t");
                for (int k = 0; k < ts.getLength(); k++) line.append(ts.item(k).getTextContent());
                Node pr = ((Element) ps.item(i)).getElementsByTagName("w:pStyle").item(0);
                String style = pr == null ? "" : ((Element) pr).getAttribute("w:val");
                if (line.length() == 0) continue;
                out.append(style.equals("Heading1") ? "# " : style.equals("Heading2") ? "## " : style.equals("Heading3") ? "### " : "").append(line).append('\n');
            }
            return out.toString();
        } catch (IOException e) {
            throw e;
        } catch (Exception e) {
            throw new IOException("That file could not be read as a document.");
        }
    }

    /** Rows as text for the agent to read: one line per row, cells divided by tabs. */
    static String asText(List<List<String>> rows) {
        StringBuilder s = new StringBuilder();
        for (List<String> r : rows) s.append(String.join("\t", r)).append('\n');
        return s.toString();
    }
}
