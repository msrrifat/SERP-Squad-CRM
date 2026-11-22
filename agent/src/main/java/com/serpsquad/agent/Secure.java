package com.serpsquad.agent;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.AclEntry;
import java.nio.file.attribute.AclEntryFlag;
import java.nio.file.attribute.AclEntryPermission;
import java.nio.file.attribute.AclEntryType;
import java.nio.file.attribute.AclFileAttributeView;
import java.nio.file.attribute.PosixFilePermissions;
import java.nio.file.attribute.UserPrincipal;
import java.util.EnumSet;
import java.util.List;

/**
 * Keeps what is sensitive on this computer readable by its owner only:
 * config.json (the device token and, if one was saved, this computer's Claude
 * key), the data folder (the Chrome IDs, which hold live sign-ins) and the
 * logs. On macOS and Linux this is the usual owner-only mode; on Windows it
 * is an access list with the current user as the only entry.
 */
final class Secure {
    private Secure() {}

    static void lockDown(Path home) {
        try {
            Files.createDirectories(home.resolve("data"));
            Files.createDirectories(home.resolve("logs"));
        } catch (Exception ignored) { /* reported by whoever needs the folder */ }
        ownerOnly(home.resolve("data"), true);
        ownerOnly(home.resolve("logs"), true);
        if (Files.exists(home.resolve("config.json"))) ownerOnly(home.resolve("config.json"), false);
    }

    static void ownerOnly(Path p, boolean dir) {
        try {
            Files.setPosixFilePermissions(p, PosixFilePermissions.fromString(dir ? "rwx------" : "rw-------"));
            return;
        } catch (UnsupportedOperationException e) {
            /* not a POSIX file system: Windows, handled below */
        } catch (Exception e) {
            Log.warn("Could not restrict access to " + p.getFileName() + ": " + e.getMessage());
            return;
        }
        try {
            AclFileAttributeView view = Files.getFileAttributeView(p, AclFileAttributeView.class);
            if (view == null) return;
            UserPrincipal me = p.getFileSystem().getUserPrincipalLookupService().lookupPrincipalByName(System.getProperty("user.name"));
            AclEntry.Builder b = AclEntry.newBuilder().setType(AclEntryType.ALLOW).setPrincipal(me).setPermissions(EnumSet.allOf(AclEntryPermission.class));
            if (dir) b.setFlags(AclEntryFlag.FILE_INHERIT, AclEntryFlag.DIRECTORY_INHERIT);
            view.setAcl(List.of(b.build()));
        } catch (Exception e) {
            Log.warn("Could not restrict access to " + p.getFileName() + ": " + e.getMessage());
        }
    }
}
