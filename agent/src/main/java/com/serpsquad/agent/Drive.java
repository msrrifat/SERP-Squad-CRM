package com.serpsquad.agent;

import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads a Google Drive folder that is shared with "Anyone with the link".
 *
 * Nothing is signed in: the folder's public listing page and the public
 * download address are asked for the way any visitor's browser asks, from
 * this program, not from one of the signed-in Chrome windows. A folder that
 * is not shared that way simply cannot be read, and the agent is told so.
 * Google Docs, Sheets and Slides in the folder are listed but not fetched
 * (they are not files).
 */
final class Drive {
    static final class Entry {
        final String id, name, modified;
        final boolean folder, document;

        Entry(String id, String name, String modified, boolean folder, boolean document) { this.id = id; this.name = name; this.modified = modified; this.folder = folder; this.document = document; }
    }

    static final class DriveException extends Exception {
        DriveException(String m) { super(m); }
    }

    /* the two addresses can be pointed at a stand-in for tests */
    private static final String LIST = env("SERPSQUAD_DRIVE_LIST", "https://drive.google.com/embeddedfolderview?id=");
    private static final String FILE = env("SERPSQUAD_DRIVE_FILE", "https://drive.usercontent.google.com/download?export=download&id=");
    static final long MAX_BYTES = 80L * 1024 * 1024;

    private static String env(String name, String dflt) { String v = System.getenv(name); return v == null || v.isBlank() ? dflt : v; }

    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(20)).followRedirects(HttpClient.Redirect.NORMAL).build();
    private static final Pattern FOLDER_ID = Pattern.compile("^https://drive\\.google\\.com/drive/folders/([A-Za-z0-9_-]{10,80})$");
    private static final Pattern ENTRY = Pattern.compile("<div class=\"flip-entry\" id=\"entry-([A-Za-z0-9_-]{10,80})\"[^>]*>.*?<a href=\"([^\"]+)\"[^>]*>.*?<div class=\"flip-entry-title\">(.*?)</div>(?:.*?<div class=\"flip-entry-last-modified\"><div>(.*?)</div>)?", Pattern.DOTALL);

    static String folderId(String location) throws DriveException {
        Matcher m = FOLDER_ID.matcher(location == null ? "" : location.trim());
        if (!m.matches()) throw new DriveException("That is not the address of a Google Drive folder.");
        return m.group(1);
    }

    private static String plain(String html) {
        return html.replaceAll("<[^>]+>", "").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'").trim();
    }

    /** What is in one folder. */
    static List<Entry> list(String folderId) throws DriveException {
        if (!folderId.matches("[A-Za-z0-9_-]{10,80}")) throw new DriveException("That is not a Google Drive folder.");
        String html;
        try {
            HttpResponse<String> r = HTTP.send(HttpRequest.newBuilder(URI.create(LIST + folderId)).timeout(Duration.ofSeconds(40)).header("User-Agent", "SERPSquadAgent (reads a shared folder)").GET().build(), HttpResponse.BodyHandlers.ofString());
            if (r.statusCode() == 404) throw new DriveException("Google Drive has no folder at that link (it was deleted, or the link is wrong).");
            if (r.statusCode() != 200 || r.uri().getHost() == null || r.uri().getHost().startsWith("accounts.")) throw new DriveException("The folder is not shared with \"Anyone with the link\", so it cannot be read without signing in. Change its sharing in Google Drive, or use a folder on this computer.");
            html = r.body();
        } catch (DriveException e) {
            throw e;
        } catch (Exception e) {
            throw new DriveException("Google Drive could not be reached: " + Json.clip(String.valueOf(e.getMessage()), 120));
        }
        if (!html.contains("flip-entr") && !html.contains("flip-list")) throw new DriveException("Google Drive returned a page that is not a folder listing. The folder may not be shared with \"Anyone with the link\".");
        List<Entry> out = new ArrayList<>();
        Matcher m = ENTRY.matcher(html);
        while (m.find() && out.size() < 500) {
            String href = m.group(2), name = plain(m.group(3));
            if (name.isEmpty()) continue;
            boolean folder = href.contains("/drive/folders/"), doc = href.startsWith("https://docs.google.com/");
            out.add(new Entry(m.group(1), Json.clip(name, 200), m.group(4) == null ? "" : plain(m.group(4)), folder, doc));
        }
        return out;
    }

    /** Fetch one file into `to`. Returns its size. */
    static long download(String fileId, Path to) throws DriveException {
        if (!fileId.matches("[A-Za-z0-9_-]{10,80}")) throw new DriveException("That is not a Google Drive file.");
        Path tmp = to.resolveSibling(to.getFileName() + ".part");
        try {
            Files.createDirectories(to.getParent());
            HttpResponse<InputStream> r = HTTP.send(HttpRequest.newBuilder(URI.create(FILE + fileId)).timeout(Duration.ofMinutes(4)).header("User-Agent", "SERPSquadAgent (reads a shared folder)").GET().build(), HttpResponse.BodyHandlers.ofInputStream());
            String type = r.headers().firstValue("content-type").orElse("").toLowerCase();
            try (InputStream in = r.body()) {
                if (r.statusCode() != 200) throw new DriveException("Google Drive did not hand out that file (answer " + r.statusCode() + "). It may not be shared with \"Anyone with the link\".");
                /* a page instead of the file: Google asks for a confirmation on very large files, or for a sign-in */
                if (type.startsWith("text/html")) throw new DriveException("Google Drive showed a page instead of the file. It is either too large to be fetched this way or not shared with \"Anyone with the link\". Put it in a folder on this computer instead.");
                long size = r.headers().firstValueAsLong("content-length").orElse(-1);
                if (size > MAX_BYTES) throw new DriveException("That file is larger than " + (MAX_BYTES / 1024 / 1024) + " MB. Put it in a folder on this computer instead.");
                long n = 0;
                try (java.io.OutputStream os = Files.newOutputStream(tmp)) {
                    byte[] buf = new byte[65536];
                    int k;
                    while ((k = in.read(buf)) > 0) {
                        n += k;
                        if (n > MAX_BYTES) throw new DriveException("That file is larger than " + (MAX_BYTES / 1024 / 1024) + " MB. Put it in a folder on this computer instead.");
                        os.write(buf, 0, k);
                    }
                }
                Files.move(tmp, to, StandardCopyOption.REPLACE_EXISTING);
                return n;
            }
        } catch (DriveException e) {
            try { Files.deleteIfExists(tmp); } catch (Exception ignored) { /* left for the next clean-up */ }
            throw e;
        } catch (Exception e) {
            try { Files.deleteIfExists(tmp); } catch (Exception ignored) { /* as above */ }
            throw new DriveException("The file could not be fetched from Google Drive: " + Json.clip(String.valueOf(e.getMessage()), 120));
        }
    }
}
