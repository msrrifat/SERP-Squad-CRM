package com.serpsquad.agent;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A website's code repository on this computer: its access key and the Git
 * commands the agent's tools are built from.
 *
 * The key is a pair made here for one project. The private half stays in
 * this program's folder (readable by this user only) and is used by Git
 * itself; it is never sent to the CRM, shown in the application or given to
 * Claude. A person adds the public half to the repository as a deploy key.
 *
 * Git is run with the user's own settings and the repository's hooks switched
 * off, and nothing from the repository is ever executed: the agent reads and
 * writes files and makes commits, no more.
 */
final class Repo {
    static final class RepoException extends Exception {
        RepoException(String m) { super(m); }
    }

    static final class Result {
        final int code;
        final String out, err;

        Result(int code, String out, String err) { this.code = code; this.out = out; this.err = err; }

        boolean ok() { return code == 0; }
    }

    private static final boolean TEST_LOCAL = "1".equals(System.getenv("SERPSQUAD_ALLOW_LOCAL_REPO"));     // tests only: a repository in a folder on this computer
    private static final Pattern URL = Pattern.compile("^git@(github\\.com|gitlab\\.com|bitbucket\\.org):([A-Za-z0-9][A-Za-z0-9._-]{0,99})/([A-Za-z0-9._-]{1,100}?)(?:\\.git)?$");
    /** Files the agent neither reads nor writes: keys and server settings, and what decides what runs when the site is built or deployed. */
    private static final Pattern NEVER = Pattern.compile("(?i)(^|/)(\\.git(/|$)|\\.github/|\\.gitlab-ci\\.yml$|\\.gitlab/|\\.circleci/|bitbucket-pipelines\\.yml$|\\.env($|\\.)|\\.npmrc$|\\.netrc$|\\.htpasswd$|id_(rsa|dsa|ecdsa|ed25519)|[^/]*\\.(pem|key|p12|pfx|jks|keystore)$|(secrets?|credentials?)(\\.[a-z0-9]+)?$|wp-config\\.php$)");
    private static final Pattern NO_WRITE = Pattern.compile("(?i)(^|/)(package(-lock)?\\.json|yarn\\.lock|pnpm-lock\\.yaml|composer\\.(json|lock)|gemfile(\\.lock)?|requirements[^/]*\\.txt|pipfile(\\.lock)?|go\\.(mod|sum)|cargo\\.(toml|lock)|makefile|dockerfile[^/]*|docker-compose[^/]*|netlify\\.toml|vercel\\.json|wrangler\\.toml|firebase\\.json|\\.htaccess|\\.gitmodules|\\.gitattributes|[^/]*\\.(sh|bash|ps1|bat|cmd|exe|dll|so|dylib))$");

    private final Path keys, dir;
    private final String projectId;
    private Vault vault = null;
    private String method = "key";      // "key": the key pair made here; "token": an access token for GitHub, kept sealed on this computer

    /** How this repository is reached, and where a token is kept. */
    Repo with(Vault vault, String method) {
        this.vault = vault;
        this.method = "token".equals(method) ? "token" : "key";
        if (vault != null) Redact.alsoHide(vault.secret(tokenName()));      // wherever the token might turn up in text, it is hidden
        return this;
    }

    private String tokenName() { return "repo-token:" + projectId; }

    boolean hasToken() { return vault != null && !vault.secret(tokenName()).isEmpty(); }

    /** Keep the access token for this project's repository, sealed, on this computer only. */
    void saveToken(String token) throws RepoException {
        if (vault == null || token == null || !token.matches("(github_pat_[A-Za-z0-9_]{30,255}|ghp_[A-Za-z0-9]{30,255})")) throw new RepoException("That is not a GitHub access token.");
        try { vault.putSecret(tokenName(), token); } catch (Exception e) { throw new RepoException("The token could not be kept on this computer: " + e.getMessage()); }
    }

    void removeToken() {
        try { if (vault != null) vault.removeSecret(tokenName()); } catch (Exception ignored) { /* nothing was kept */ }
    }

    /** The address Git talks to: with a token the repository is reached over https instead of with the key. */
    String remote(String url) {
        if (!"token".equals(method)) return url;
        Matcher m = URL.matcher(url == null ? "" : url);
        return m.matches() ? "https://" + m.group(1) + "/" + m.group(2) + "/" + m.group(3) + ".git" : url;
    }

    Repo(Config cfg, String projectId) {
        this.projectId = projectId.replaceAll("[^A-Za-z0-9_-]", "");
        this.keys = cfg.home.resolve("keys");
        this.dir = cfg.home.resolve("work").resolve(this.projectId).resolve("repo");
    }

    Path dir() { return dir; }

    private Path key() { return keys.resolve("repo-" + projectId); }

    static boolean validUrl(String url) { return URL.matcher(url == null ? "" : url).matches() || (TEST_LOCAL && url != null && url.startsWith("file:///")); }

    /** A branch name is handed to Git as an argument, so it is checked here as well as in the CRM. */
    static boolean validBranch(String b) { return b != null && b.matches("[A-Za-z0-9][A-Za-z0-9._/-]{0,79}") && !b.contains("..") && !b.endsWith("/"); }

    static boolean neverTouched(String path) { return NEVER.matcher(path.replace('\\', '/')).find(); }

    static boolean neverWritten(String path) { return neverTouched(path) || NO_WRITE.matcher(path.replace('\\', '/')).find(); }

    // ---------- the key ----------

    /** Make the project's key pair if this computer has none yet. Returns the public half. */
    String ensureKey() throws RepoException {
        try {
            Files.createDirectories(keys);
            Secure.ownerOnly(keys, true);
            Path k = key(), pub = keys.resolve(k.getFileName() + ".pub");
            if (!Files.exists(k) || !Files.exists(pub)) {
                Files.deleteIfExists(k);
                Files.deleteIfExists(pub);
                Result r = exec(keys, Map.of(), 30, "ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-C", "serpsquad-agent-" + projectId, "-f", k.toString());
                if (!r.ok() || !Files.exists(pub)) throw new RepoException("The key could not be made (ssh-keygen " + (r.code == -2 ? "is not installed on this computer" : "failed: " + Json.clip(r.err, 160)) + ").");
                Secure.ownerOnly(k, false);
            }
            return Files.readString(pub, StandardCharsets.UTF_8).trim();
        } catch (IOException e) {
            throw new RepoException("The key could not be made: " + e.getMessage());
        }
    }

    boolean hasKey() { return Files.exists(key()); }

    // ---------- git ----------

    private List<String> git(String... args) {
        List<String> c = new ArrayList<>(List.of("git", "-c", "core.hooksPath=" + keys.resolve("no-hooks"), "-c", "core.symlinks=false", "-c", "protocol.ext.allow=never", "-c", "protocol.file.allow=" + (TEST_LOCAL ? "always" : "never"),
            "-c", "submodule.recurse=false", "-c", "credential.helper=", "-c", "user.name=SERP Squad agent", "-c", "user.email=agent@noreply.serpsquad.com", "-c", "commit.gpgsign=false", "-c", "core.quotepath=false"));
        c.addAll(List.of(args));
        return c;
    }

    private Map<String, String> env() {
        Map<String, String> e = new java.util.HashMap<>(sshEnv());
        if ("token".equals(method) && hasToken()) {
            /* the token goes to Git through its environment, never on a command line and never into the repository's settings */
            String basic = java.util.Base64.getEncoder().encodeToString(("x-access-token:" + vault.secret(tokenName())).getBytes(StandardCharsets.UTF_8));
            Redact.alsoHide(basic);
            e.put("GIT_CONFIG_COUNT", "1");
            e.put("GIT_CONFIG_KEY_0", "http.https://github.com/.extraheader");
            e.put("GIT_CONFIG_VALUE_0", "AUTHORIZATION: basic " + basic);
        }
        return e;
    }

    private Map<String, String> sshEnv() {
        String k = key().toString().replace('\\', '/'), known = keys.resolve("known_hosts").toString().replace('\\', '/');
        return Map.of("GIT_SSH_COMMAND", "ssh -i \"" + k + "\" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=\"" + known + "\" -o ConnectTimeout=20",
            "GIT_TERMINAL_PROMPT", "0", "GIT_CONFIG_NOSYSTEM", "1", "GIT_CONFIG_GLOBAL", keys.resolve("gitconfig-empty").toString(), "GIT_ASKPASS", "echo", "LC_ALL", "C");
    }

    Result run(Path cwd, int seconds, String... args) throws RepoException {
        try {
            Files.createDirectories(keys.resolve("no-hooks"));
            if (!Files.exists(keys.resolve("gitconfig-empty"))) Files.writeString(keys.resolve("gitconfig-empty"), "");
        } catch (IOException e) { throw new RepoException("This program's key folder cannot be written."); }
        Result r = exec(cwd, env(), seconds, git(args).toArray(new String[0]));
        if (r.code == -2) throw new RepoException("Git is not installed on this computer. Install Git, then try again.");
        if (r.code == -3) throw new RepoException("Git did not answer within " + seconds + " seconds.");
        return r;
    }

    private static String why(Result r) {
        String e = (r.err + "\n" + r.out).trim();
        if (e.contains("Authentication failed") || e.contains("could not read Username") || e.contains("The requested URL returned error: 403") || e.contains("Invalid username or")) return "GitHub did not accept the access token for this repository. It has to be a token for this one repository with Contents: Read and write (and Pull requests: Read and write), and not expired.";
        if (e.contains("Permission denied (publickey)")) return "The repository refused this computer's key. Add the public key to the repository's deploy keys.";
        if (e.contains("marked as read only") || e.contains("deploy key is read-only") || e.contains("Write access to repository not granted")) return "The key may read the repository but not write to it. In the repository's deploy keys, allow write access for it.";
        if (e.contains("Repository not found") || e.contains("does not appear to be a git repository")) return "No repository was found at that address with this key. Check the address, and that the key was added to this repository.";
        if (e.contains("Could not resolve hostname") || e.contains("Connection timed out") || e.contains("Network is unreachable")) return "The repository's server could not be reached from this computer.";
        if (e.contains("Remote branch") && e.contains("not found")) return "The repository has no branch of that name.";
        if (e.contains("[rejected]") || e.contains("fetch first") || e.contains("non-fast-forward")) return "Someone else pushed to the branch in the meantime. Call repo_sync, apply the change again and publish.";
        return Json.clip(Redact.text(e.replaceAll("\\s+", " ")), 240);
    }

    /** Can this computer read the repository, and does the branch exist? Also tries, without changing anything, whether it may write. */
    String test(String url, String branch) throws RepoException {
        if (!validUrl(url) || !validBranch(branch)) throw new RepoException("That is not a repository address and branch this program works with.");
        if ("token".equals(method)) { if (!hasToken()) throw new RepoException("This computer has no access token for the repository yet. Enter it first."); }
        else if (!hasKey() && !TEST_LOCAL) throw new RepoException("This computer has no key for the repository yet. Create it first.");
        Result r = run(keys, 60, "ls-remote", "--heads", remote(url), branch);
        if (!r.ok()) throw new RepoException(why(r));
        if (r.out.isBlank()) throw new RepoException("The key works, but the repository has no branch \"" + branch + "\".");
        String write;
        try {
            sync(url, branch);
            Result p = run(dir, 60, "push", "--dry-run", "origin", "HEAD:refs/heads/agent/access-test");
            write = p.ok() ? "Reading works, and the " + ("token".equals(method) ? "token" : "key") + " is allowed to write." : "Reading works. Writing does not yet: " + why(p);
        } catch (RepoException e) {
            write = "Reading works. Whether it may write could not be tried: " + e.getMessage();
        }
        return write;
    }

    /** Bring the working copy to exactly what the branch holds now. Anything left over from an earlier run is discarded. */
    String sync(String url, String branch) throws RepoException {
        if (!validUrl(url) || !validBranch(branch)) throw new RepoException("That is not a repository address and branch this program works with.");
        try {
            boolean fresh = !Files.isDirectory(dir.resolve(".git"));
            if (!fresh) {
                Result origin = run(dir, 20, "remote", "get-url", "origin");
                if (!origin.ok() || !origin.out.trim().equals(remote(url))) { SyncStore.deleteTree(dir); fresh = true; }
            }
            if (fresh) {
                SyncStore.deleteTree(dir);
                Files.createDirectories(dir.getParent());
                Result c = run(dir.getParent(), 600, "clone", "--depth", "50", "--single-branch", "--no-tags", "--branch", branch, remote(url), dir.getFileName().toString());
                if (!c.ok()) { SyncStore.deleteTree(dir); throw new RepoException(why(c)); }
            } else {
                Result f = run(dir, 300, "fetch", "--depth", "50", "--no-tags", "--prune", "origin", "+refs/heads/" + branch + ":refs/remotes/origin/" + branch);
                if (!f.ok()) throw new RepoException(why(f));
                Result co = run(dir, 120, "checkout", "-f", "-B", branch, "origin/" + branch);
                if (!co.ok()) throw new RepoException(why(co));
                run(dir, 60, "reset", "--hard", "origin/" + branch);
                run(dir, 60, "clean", "-fd");
            }
            Result head = run(dir, 20, "log", "-1", "--format=%h %ad %s", "--date=short");
            Result count = run(dir, 30, "ls-files");
            long files = count.out.isBlank() ? 0 : count.out.lines().count();
            return "Branch " + branch + " at " + Json.clip(head.out.trim(), 160) + ". " + files + " files.";
        } catch (IOException e) {
            throw new RepoException("The working copy could not be prepared: " + e.getMessage());
        }
    }

    boolean ready() { return Files.isDirectory(dir.resolve(".git")); }

    boolean byToken() { return "token".equals(method); }

    private static final String API = System.getenv("SERPSQUAD_GITHUB_API") == null || System.getenv("SERPSQUAD_GITHUB_API").isBlank() ? "https://api.github.com" : System.getenv("SERPSQUAD_GITHUB_API");

    /**
     * Open a pull request on GitHub for a branch this program just delivered,
     * with the project's access token. Returns the pull request's address.
     */
    String openPullRequest(String url, String base, String head, String title, String body) throws RepoException {
        Matcher m = URL.matcher(url == null ? "" : url);
        String repo = m.matches() && m.group(1).equals("github.com") ? m.group(2) + "/" + m.group(3) : TEST_LOCAL ? "test-owner/test-site" : "";
        if (repo.isEmpty() || !hasToken()) throw new RepoException("A pull request can only be opened on GitHub, with an access token.");
        try {
            com.fasterxml.jackson.databind.node.ObjectNode b = Json.obj();
            b.put("title", Json.clip(title, 200)).put("head", head).put("base", base).put("body", body);
            java.net.http.HttpResponse<String> r = java.net.http.HttpClient.newBuilder().connectTimeout(java.time.Duration.ofSeconds(20)).build().send(
                java.net.http.HttpRequest.newBuilder(java.net.URI.create(API + "/repos/" + repo + "/pulls")).timeout(java.time.Duration.ofSeconds(40))
                    .header("Authorization", "Bearer " + vault.secret(tokenName())).header("Accept", "application/vnd.github+json").header("X-GitHub-Api-Version", "2022-11-28").header("User-Agent", "SERPSquadAgent").header("Content-Type", "application/json")
                    .POST(java.net.http.HttpRequest.BodyPublishers.ofString(Json.str(b))).build(), java.net.http.HttpResponse.BodyHandlers.ofString());
            com.fasterxml.jackson.databind.JsonNode j = null;
            try { j = Json.parse(r.body()); } catch (Exception ignored) { /* an answer that is not JSON is reported by its status */ }
            if (r.statusCode() == 201 && j != null && j.path("html_url").asText("").startsWith("https://")) return j.path("html_url").asText();
            String said = j == null ? "" : j.path("message").asText("") + (j.path("errors").size() > 0 ? " " + j.path("errors").get(0).path("message").asText("") : "");
            if (r.statusCode() == 403 || r.statusCode() == 404) throw new RepoException("the token may not open pull requests on this repository (it needs Pull requests: Read and write)");
            throw new RepoException("GitHub answered " + r.statusCode() + (said.isBlank() ? "" : ": " + Json.clip(Redact.text(said.trim()), 160)));
        } catch (RepoException e) {
            throw e;
        } catch (Exception e) {
            throw new RepoException("GitHub could not be reached");
        }
    }

    /** The repository's page for comparing a branch, where the host has one. */
    static String compareUrl(String url, String base, String branch) {
        Matcher m = URL.matcher(url);
        if (!m.matches()) return "";
        String host = m.group(1), path = m.group(2) + "/" + m.group(3);
        if (host.equals("github.com")) return "https://github.com/" + path + "/compare/" + base + "..." + branch + "?expand=1";
        if (host.equals("gitlab.com")) return "https://gitlab.com/" + path + "/-/compare/" + base + "..." + branch;
        return "https://bitbucket.org/" + path + "/branch/" + branch;
    }

    // ---------- running a program ----------

    /** Run a program and wait. code -2: it is not installed; -3: it did not finish in time. Output is capped. */
    static Result exec(Path cwd, Map<String, String> env, int seconds, String... cmd) {
        Process p = null;
        try {
            ProcessBuilder pb = new ProcessBuilder(cmd).directory(cwd.toFile());
            pb.environment().putAll(env);
            pb.redirectInput(ProcessBuilder.Redirect.from(new java.io.File(Shortcuts.isWindows() ? "NUL" : "/dev/null")));
            p = pb.start();
            final Process proc = p;
            final StringBuilder out = new StringBuilder(), err = new StringBuilder();
            Thread a = new Thread(() -> drain(proc.getInputStream(), out)), b = new Thread(() -> drain(proc.getErrorStream(), err));
            a.setDaemon(true); b.setDaemon(true); a.start(); b.start();
            if (!p.waitFor(seconds, TimeUnit.SECONDS)) { p.destroyForcibly(); return new Result(-3, out.toString(), err.toString()); }
            a.join(3000); b.join(3000);
            return new Result(p.exitValue(), out.toString(), err.toString());
        } catch (IOException e) {
            return new Result(-2, "", String.valueOf(e.getMessage()));
        } catch (InterruptedException e) {
            if (p != null) p.destroyForcibly();
            Thread.currentThread().interrupt();
            return new Result(-3, "", "interrupted");
        }
    }

    private static void drain(java.io.InputStream in, StringBuilder into) {
        try (java.io.Reader r = new java.io.InputStreamReader(in, StandardCharsets.UTF_8)) {
            char[] buf = new char[8192];
            int n;
            while ((n = r.read(buf)) > 0) { synchronized (into) { if (into.length() < 400_000) into.append(buf, 0, Math.min(n, 400_000 - into.length())); } }
        } catch (IOException ignored) { /* the process ended */ }
    }
}
