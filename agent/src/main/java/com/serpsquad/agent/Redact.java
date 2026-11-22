package com.serpsquad.agent;

import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Hides anything that looks like a password or a key before it leaves this
 * computer: page text on its way to Claude, tool results, events for the CRM
 * and lines for the log file. The CRM hides the same patterns again before it
 * stores anything, so a secret that shows up on a page (a plugin's settings
 * screen, a pasted note) is not repeated anywhere.
 */
final class Redact {
    static final String HIDDEN = "[hidden: looked like a password or key]";

    private static final Pattern[] PATTERNS = {
        Pattern.compile("-----BEGIN [A-Z ]*PRIVATE KEY-----[\\s\\S]*?-----END [A-Z ]*PRIVATE KEY-----"),
        Pattern.compile("\\bsk-ant-[A-Za-z0-9_-]{8,}"), Pattern.compile("\\bsk-[A-Za-z0-9_-]{24,}"), Pattern.compile("\\bAIza[0-9A-Za-z_-]{30,}"),
        Pattern.compile("\\bya29\\.[0-9A-Za-z_.-]{20,}"), Pattern.compile("\\bgh[pousr]_[A-Za-z0-9]{20,}"), Pattern.compile("\\bgithub_pat_[A-Za-z0-9_]{20,}"),
        Pattern.compile("\\bxox[baprs]-[A-Za-z0-9-]{10,}"), Pattern.compile("\\bAKIA[0-9A-Z]{16}\\b"), Pattern.compile("\\bssa_[a-f0-9]{40,}"),
        Pattern.compile("\\beyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{8,}"), Pattern.compile("\\bBearer\\s+[A-Za-z0-9._~+/-]{20,}=*"),
    };
    private static final Pattern LABELLED = Pattern.compile(
        "\\b(pass ?word|passwd|pwd|pass ?code|pass ?phrase|secret(?: key)?|api[ _-]?key|access[ _-]?token|auth[ _-]?token|client[ _-]?secret|token|pin code)\\b(\\s*(?:is|was|:|=|→)\\s*)(\"[^\"\\n]{4,}\"|'[^'\\n]{4,}'|[^\\s\"']{6,})",
        Pattern.CASE_INSENSITIVE);
    private static final Pattern APP_PASSWORD = Pattern.compile("\\b((?:app )?pass ?word|passcode)\\b([^\\n]{0,24}?)\\b([a-z]{4}(?: [a-z]{4}){3})\\b", Pattern.CASE_INSENSITIVE);
    private static final Set<String> PLAIN_WORDS = Set.of("required", "optional", "missing", "invalid", "incorrect", "protected", "expired", "changed", "unknown", "needed", "hidden", "stored", "secure", "secured", "wrong", "reset", "empty", "blank");

    private Redact() {}

    private static boolean secretLooking(String label, String sep, String raw) {
        String v = raw.replaceAll("^[\"']|[\"']$", "").replaceAll("[.,;:!?)\\]]+$", "");
        if (v.length() < 6 || v.toLowerCase(Locale.ROOT).matches("https?://.*") || v.startsWith("[hidden")) return false;
        if (v.matches(".*\\d.*") || v.matches(".*[!@#$%^&*_+=~].*")) return true;
        return label.toLowerCase(Locale.ROOT).matches(".*(pass|pwd).*") && sep.matches(".*[:=].*") && v.length() >= 8 && !PLAIN_WORDS.contains(v.toLowerCase(Locale.ROOT));
    }

    /** The text with every secret-looking part replaced. */
    static String text(String input) {
        if (input == null || input.length() < 8) return input == null ? "" : input;
        String t = input;
        for (Pattern p : PATTERNS) t = p.matcher(t).replaceAll(Matcher.quoteReplacement(HIDDEN));
        Matcher a = APP_PASSWORD.matcher(t);
        StringBuilder sb = new StringBuilder();
        while (a.find()) a.appendReplacement(sb, Matcher.quoteReplacement(a.group(1) + a.group(2) + HIDDEN));
        a.appendTail(sb);
        Matcher m = LABELLED.matcher(sb.toString());
        StringBuilder out = new StringBuilder();
        while (m.find()) m.appendReplacement(out, Matcher.quoteReplacement(secretLooking(m.group(1), m.group(2), m.group(3)) ? m.group(1) + m.group(2) + HIDDEN : m.group()));
        m.appendTail(out);
        return out.toString();
    }

    /** True when the text holds something that looks like a password or a key. */
    static boolean hasSecret(String input) {
        return input != null && !text(input).equals(input);
    }
}
