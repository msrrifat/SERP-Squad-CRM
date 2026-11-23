package com.serpsquad.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.regex.Pattern;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Sign-ins for SEO tools, saved on this computer only.
 *
 * A person enters a tool's user name and password in this application. They
 * are stored encrypted (AES-256-GCM), with the key in a separate file that
 * only this user account can read. When a tool has signed the agent out, the
 * program itself types them into that tool's own sign-in page, and only
 * there: the page's site must be the one the sign-in was saved for.
 *
 * They are never sent to the CRM, never given to Claude, never written to a
 * log, and the application never shows them again after saving. Sign-in
 * providers (Google, Microsoft, Apple, Facebook) and payment sites cannot be
 * saved: a person signs in to those in the Chrome ID.
 *
 * What this protects against: the file being read on its own (a backup, a
 * synced folder, another program reading this folder). It does not protect
 * against someone who can use this Windows or macOS account as its owner.
 */
final class Vault {
    private static final Pattern NEVER = Pattern.compile("(?i)(^|\\.)(google\\.[a-z.]+|gmail\\.com|youtube\\.com|microsoft\\.com|microsoftonline\\.com|live\\.com|office\\.com|apple\\.com|icloud\\.com|facebook\\.com|instagram\\.com|paypal\\.com|stripe\\.com|github\\.com|gitlab\\.com)$");
    private static final java.util.Set<String> SECOND = java.util.Set.of("co", "com", "org", "net", "ac", "gov", "edu");
    private final Path file, keyFile;
    private final SecureRandom random = new SecureRandom();

    Vault(Config cfg) {
        this.file = cfg.dataDir().resolve("signins.json");
        this.keyFile = cfg.home.resolve("signins.key");
        for (JsonNode x : load()) { String p = open(x.path("pass").asText("")); if (!p.isEmpty()) Redact.alsoHide(p); }
    }

    /** The site a host belongs to: example.com for app.example.com, example.co.uk for www.example.co.uk. */
    static String site(String host) {
        String h = host == null ? "" : host.toLowerCase().replaceAll("\\.$", "");
        String[] p = h.split("\\.");
        if (p.length <= 2) return h;
        boolean three = p[p.length - 1].length() == 2 && SECOND.contains(p[p.length - 2]);
        int keep = three ? 3 : 2;
        return String.join(".", java.util.Arrays.copyOfRange(p, p.length - keep, p.length));
    }

    static String hostOf(String url) {
        try { String h = URI.create(url).getHost(); return h == null ? "" : h.toLowerCase(); } catch (Exception e) { return ""; }
    }

    private byte[] key() throws Exception {
        if (Files.exists(keyFile)) { byte[] k = Base64.getDecoder().decode(Files.readString(keyFile, StandardCharsets.UTF_8).trim()); if (k.length == 32) return k; }
        if (Files.exists(file) && (load().size() > 0 || root().path("secrets").size() > 0)) throw new IllegalStateException("The key for the saved sign-ins is missing, so they cannot be read. Remove them and save them again.");
        byte[] k = new byte[32];
        random.nextBytes(k);
        Files.writeString(keyFile, Base64.getEncoder().encodeToString(k), StandardCharsets.UTF_8);
        Secure.ownerOnly(keyFile, false);
        return k;
    }

    private String seal(String plain) throws Exception {
        byte[] iv = new byte[12];
        random.nextBytes(iv);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key(), "AES"), new GCMParameterSpec(128, iv));
        byte[] ct = c.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        return Base64.getEncoder().encodeToString(iv) + "." + Base64.getEncoder().encodeToString(ct);
    }

    private String open(String sealed) {
        try {
            String[] p = sealed.split("\\.");
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key(), "AES"), new GCMParameterSpec(128, Base64.getDecoder().decode(p[0])));
            return new String(c.doFinal(Base64.getDecoder().decode(p[1])), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "";
        }
    }

    private ArrayNode load() {
        try {
            if (!Files.exists(file)) return Json.arr();
            JsonNode j = Json.parse(Files.readString(file, StandardCharsets.UTF_8));
            return j != null && j.path("items").isArray() ? (ArrayNode) j.get("items") : Json.arr();
        } catch (Exception e) {
            return Json.arr();
        }
    }

    private ObjectNode root() {
        try {
            if (Files.exists(file)) { JsonNode j = Json.parse(Files.readString(file, StandardCharsets.UTF_8)); if (j != null && j.isObject()) return (ObjectNode) j; }
        } catch (Exception ignored) { /* an unreadable file is started afresh */ }
        return Json.obj();
    }

    /** Another secret this program keeps for itself (a repository's access token), sealed like the sign-ins. */
    synchronized void putSecret(String name, String value) throws Exception {
        ObjectNode o = root();
        o.put("v", 1);
        if (!o.path("items").isArray()) o.putArray("items");
        ObjectNode s = o.path("secrets").isObject() ? (ObjectNode) o.get("secrets") : o.putObject("secrets");
        s.put(name, seal(value));
        write(o);
        Redact.alsoHide(value);
    }

    /** That secret, or "" when there is none (or it cannot be read). */
    synchronized String secret(String name) {
        String sealed = root().path("secrets").path(name).asText("");
        return sealed.isEmpty() ? "" : open(sealed);
    }

    synchronized void removeSecret(String name) throws Exception {
        ObjectNode o = root();
        if (o.path("secrets").isObject() && o.path("secrets").has(name)) { ((ObjectNode) o.get("secrets")).remove(name); write(o); }
    }

    private void write(ObjectNode o) throws Exception {
        Files.createDirectories(file.getParent());
        Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
        Files.writeString(tmp, Json.str(o), StandardCharsets.UTF_8);
        Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
        Secure.ownerOnly(file, false);
    }

    private void save(ArrayNode items) throws Exception {
        ObjectNode o = root();
        o.put("v", 1);
        o.set("items", items);
        Files.createDirectories(file.getParent());
        Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
        Files.writeString(tmp, Json.str(o), StandardCharsets.UTF_8);
        Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
        Secure.ownerOnly(file, false);
    }

    /** What the application shows: never the user name in full, never the password. */
    synchronized ArrayNode view() {
        ArrayNode out = Json.arr();
        for (JsonNode x : load()) {
            String user = open(x.path("user").asText(""));
            out.addObject().put("id", x.path("id").asText("")).put("name", x.path("name").asText("")).put("site", x.path("site").asText("")).put("loginUrl", x.path("loginUrl").asText(""))
                .put("userHint", user.length() > 4 ? user.substring(0, 2) + "…" + user.substring(user.length() - 2) : "…").put("readable", !user.isEmpty()).put("addedAt", x.path("addedAt").asLong(0));
        }
        return out;
    }

    synchronized void add(String name, String loginUrl, String user, String pass) throws Exception {
        String n = name == null ? "" : name.trim(), url = loginUrl == null ? "" : loginUrl.trim();
        String host = hostOf(url);
        if (n.isEmpty() || n.length() > 60) throw new IllegalArgumentException("Give the tool a name.");
        boolean local = "1".equals(System.getenv("SERPSQUAD_ALLOW_LOCAL_BROWSING")) && url.startsWith("http://127.0.0.1");     // tests only
        if ((!url.toLowerCase().startsWith("https://") && !local) || host.isEmpty() || !host.contains(".")) throw new IllegalArgumentException("Give the tool's sign-in page as a full https address.");
        if (NEVER.matcher(host).find()) throw new IllegalArgumentException("Sign-ins for Google, Microsoft, Apple, Facebook, payment sites and code hosts are not saved here. A person signs in to those in the Chrome ID.");
        if (user == null || user.isBlank() || user.length() > 200 || pass == null || pass.length() < 4 || pass.length() > 300) throw new IllegalArgumentException("Enter the user name and the password.");
        ArrayNode items = load();
        for (int i = items.size() - 1; i >= 0; i--) if (items.get(i).path("site").asText("").equals(site(host))) items.remove(i);       // one sign-in per site
        if (items.size() >= 20) throw new IllegalArgumentException("Twenty sign-ins can be saved. Remove one first.");
        items.addObject().put("id", "si_" + Long.toHexString(random.nextLong() & Long.MAX_VALUE)).put("name", n).put("site", site(host)).put("loginUrl", url.length() > 300 ? url.substring(0, 300) : url)
            .put("user", seal(user.trim())).put("pass", seal(pass)).put("addedAt", System.currentTimeMillis());
        save(items);
        Redact.alsoHide(pass);
    }

    /** Which tools this computer holds a sign-in for: the name and the site, nothing else. This is what the CRM is told. */
    synchronized ArrayNode names() {
        ArrayNode out = Json.arr();
        for (JsonNode x : load()) out.addObject().put("name", x.path("name").asText("")).put("site", x.path("site").asText(""));
        return out;
    }

    synchronized boolean removeSite(String site) throws Exception {
        ArrayNode items = load();
        boolean any = false;
        for (int i = items.size() - 1; i >= 0; i--) if (items.get(i).path("site").asText("").equals(site)) { items.remove(i); any = true; }
        if (any) save(items);
        return any;
    }

    synchronized boolean remove(String id) throws Exception {
        ArrayNode items = load();
        for (int i = 0; i < items.size(); i++) if (items.get(i).path("id").asText("").equals(id)) { items.remove(i); save(items); return true; }
        return false;
    }

    /** The saved sign-in for the site a page is on: { user, password }, or null. */
    synchronized String[] forHost(String host) {
        String s = site(host);
        if (s.isEmpty()) return null;
        for (JsonNode x : load()) if (x.path("site").asText("").equals(s)) {
            String u = open(x.path("user").asText("")), p = open(x.path("pass").asText(""));
            return u.isEmpty() || p.isEmpty() ? null : new String[] { u, p };
        }
        return null;
    }

    synchronized boolean hasFor(String host) { return forHost(host) != null; }
}
