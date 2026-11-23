package com.serpsquad.agent;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.concurrent.TimeUnit;
import javax.imageio.ImageIO;

/**
 * Makes the agent start like an application: launcher scripts that keep it
 * running and install updates, a hidden-window launcher and Desktop / Start
 * menu shortcuts on Windows, and a small .app bundle on macOS.
 */
final class Shortcuts {
    static final String NAME = "SERP Squad Agent";

    private Shortcuts() {}

    static boolean isWindows() { return System.getProperty("os.name", "").toLowerCase().contains("win"); }

    static boolean isMac() { return System.getProperty("os.name", "").toLowerCase().contains("mac"); }

    private static String javaPath() {
        return Paths.get(System.getProperty("java.home"), "bin", isWindows() ? "java.exe" : "java").toString();
    }

    /**
     * An update is installed by the launcher script: the agent exits with a
     * special code and the script swaps the program file and starts it again.
     * An agent that was started without the script (straight from the jar) has
     * nobody to do that, so before it exits it starts the script itself, a few
     * seconds later, when this process and its window port are gone.
     */
    static void relaunchIfAlone(Path home) {
        if ("1".equals(System.getenv("SERPSQUAD_LAUNCHER"))) return;
        try {
            writeLaunchers(home);
            Files.createDirectories(home.resolve("logs"));
            ProcessBuilder pb = isWindows()
                ? new ProcessBuilder("cmd", "/c", "start", "\"\"", "/min", "cmd", "/c", "timeout /t 4 /nobreak >nul & run.bat")
                : new ProcessBuilder("/bin/sh", "-c", "(sleep 3; exec ./run.sh) >> logs/launcher.log 2>&1 &");
            pb.directory(home.toFile()).redirectErrorStream(true);
            if (!isWindows()) pb.redirectOutput(ProcessBuilder.Redirect.DISCARD);
            pb.start();
            Log.info("Starting again through the launcher to install the update.");
        } catch (Exception e) {
            Log.warn("The agent could not restart itself (" + e.getMessage() + "). Start it again to finish the update.");
        }
    }

    /** run.bat / run.sh: start the agent, install a downloaded update when it asks, restart it if it stops. */
    static void writeLaunchers(Path home) throws Exception {
        String bat = String.join("\r\n",
            "@echo off",
            "rem Starts the SERP Squad agent and keeps it running. Installs a downloaded update when the agent asks for it.",
            "setlocal",
            "cd /d \"%~dp0\"",
            "set \"JAVA=" + javaPath() + "\"",
            "if not exist \"%JAVA%\" set \"JAVA=java\"",
            "set SERPSQUAD_LAUNCHER=1",
            ":loop",
            "if exist serpsquad-agent-next.jar (",
            "  copy /y serpsquad-agent.jar serpsquad-agent-prev.jar >nul",
            "  move /y serpsquad-agent-next.jar serpsquad-agent.jar >nul",
            "  echo Installed the downloaded update.",
            ")",
            "\"%JAVA%\" -jar serpsquad-agent.jar run",
            "set CODE=%ERRORLEVEL%",
            "if %CODE%==75 goto loop",
            "if %CODE%==0 goto end",
            "if %CODE%==76 if exist serpsquad-agent-prev.jar (",
            "  copy /y serpsquad-agent-prev.jar serpsquad-agent.jar >nul",
            "  echo The update could not start. The previous version was restored.",
            ")",
            "echo The agent stopped with code %CODE%. Restarting in 30 seconds. Press Ctrl+C to stop.",
            "timeout /t 30 /nobreak >nul",
            "goto loop",
            ":end",
            "");
        Files.writeString(home.resolve("run.bat"), bat, StandardCharsets.UTF_8);
        String sh = String.join("\n",
            "#!/bin/sh",
            "# Starts the SERP Squad agent and keeps it running. Installs a downloaded update when the agent asks for it.",
            "cd \"$(dirname \"$0\")\" || exit 1",
            "JAVA='" + javaPath().replace("'", "'\\''") + "'",
            "[ -x \"$JAVA\" ] || JAVA=java",
            "export SERPSQUAD_LAUNCHER=1",
            "while true; do",
            "  if [ -f serpsquad-agent-next.jar ]; then",
            "    cp -f serpsquad-agent.jar serpsquad-agent-prev.jar && mv -f serpsquad-agent-next.jar serpsquad-agent.jar && echo 'Installed the downloaded update.'",
            "  fi",
            "  \"$JAVA\" -jar serpsquad-agent.jar run",
            "  CODE=$?",
            "  [ \"$CODE\" = 75 ] && continue",
            "  [ \"$CODE\" = 0 ] && break",
            "  if [ \"$CODE\" = 76 ] && [ -f serpsquad-agent-prev.jar ]; then cp -f serpsquad-agent-prev.jar serpsquad-agent.jar; echo 'The update could not start. The previous version was restored.'; fi",
            "  echo \"The agent stopped with code $CODE. Restarting in 30 seconds. Press Ctrl+C to stop.\"",
            "  sleep 30",
            "done",
            "");
        Path shPath = home.resolve("run.sh");
        Files.writeString(shPath, sh, StandardCharsets.UTF_8);
        try { Files.setPosixFilePermissions(shPath, PosixFilePermissions.fromString("rwxr-xr-x")); } catch (Exception ignored) { /* Windows */ }
        if (isWindows()) {
            /* starts run.bat with no console window, so only the application window and the tray icon show */
            String vbs = String.join("\r\n",
                "Set sh = CreateObject(\"WScript.Shell\")",
                "sh.CurrentDirectory = CreateObject(\"Scripting.FileSystemObject\").GetParentFolderName(WScript.ScriptFullName)",
                "sh.Run \"cmd /c run.bat\", 0, False",
                "");
            Files.writeString(home.resolve(NAME + ".vbs"), vbs, StandardCharsets.UTF_8);
            Files.write(home.resolve("agent.ico"), ico());
        }
        if (isMac()) writeMacApp(home);
    }

    /** A 256 px PNG wrapped as a Windows .ico (supported since Windows Vista). */
    private static byte[] ico() throws Exception {
        ByteArrayOutputStream png = new ByteArrayOutputStream();
        ImageIO.write(Tray.icon(256), "png", png);
        byte[] data = png.toByteArray();
        ByteBuffer b = ByteBuffer.allocate(22 + data.length).order(ByteOrder.LITTLE_ENDIAN);
        b.putShort((short) 0).putShort((short) 1).putShort((short) 1);          // reserved, type icon, one image
        b.put((byte) 0).put((byte) 0).put((byte) 0).put((byte) 0);              // 256 x 256, no palette
        b.putShort((short) 1).putShort((short) 32).putInt(data.length).putInt(22);
        b.put(data);
        return b.array();
    }

    private static void writeMacApp(Path home) {
        try {
            Path macos = home.resolve(NAME + ".app").resolve("Contents").resolve("MacOS");
            Files.createDirectories(macos);
            String plist = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\"><dict>\n"
                + "<key>CFBundleName</key><string>" + NAME + "</string>\n<key>CFBundleIdentifier</key><string>com.serpsquad.agent</string>\n<key>CFBundleExecutable</key><string>launcher</string>\n"
                + "<key>CFBundlePackageType</key><string>APPL</string>\n<key>CFBundleShortVersionString</key><string>" + Main.version() + "</string>\n<key>LSUIElement</key><true/>\n</dict></plist>\n";
            Files.writeString(macos.getParent().resolve("Info.plist"), plist, StandardCharsets.UTF_8);
            String launcher = "#!/bin/sh\ncd '" + home.toAbsolutePath().toString().replace("'", "'\\''") + "' || exit 1\nmkdir -p logs\nexec ./run.sh >> logs/launcher.log 2>&1\n";
            Path l = macos.resolve("launcher");
            Files.writeString(l, launcher, StandardCharsets.UTF_8);
            Files.setPosixFilePermissions(l, PosixFilePermissions.fromString("rwxr-xr-x"));
        } catch (Exception ignored) { /* the .app is a convenience; run.sh still works */ }
    }

    private static String ps(String s) { return s.replace("'", "''"); }

    private static boolean powershell(String script) {
        try {
            Process p = new ProcessBuilder("powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script).redirectErrorStream(true).redirectOutput(ProcessBuilder.Redirect.DISCARD).start();
            return p.waitFor(30, TimeUnit.SECONDS) && p.exitValue() == 0;
        } catch (Exception e) {
            return false;
        }
    }

    private static String shortcutScript(Path home, String folders) {
        String h = ps(home.toAbsolutePath().toString());
        return "$w = New-Object -ComObject WScript.Shell; foreach ($d in @(" + folders + ")) { $s = $w.CreateShortcut((Join-Path $d '" + NAME + ".lnk')); $s.TargetPath = 'wscript.exe'; "
            + "$s.Arguments = '\"" + h + "\\" + NAME + ".vbs\"'; $s.WorkingDirectory = '" + h + "'; $s.IconLocation = '" + h + "\\agent.ico'; $s.Description = '" + NAME + "'; $s.Save() }";
    }

    /** Desktop and Start menu shortcuts (Windows only). Best effort. */
    static boolean installShortcuts(Path home) {
        if (!isWindows()) return false;
        return powershell(shortcutScript(home, "[Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs')"));
    }

    private static Path startupLink() {
        String appData = System.getenv("APPDATA");
        return appData == null ? null : Paths.get(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", NAME + ".lnk");
    }

    private static Path macAgent() { return Paths.get(System.getProperty("user.home"), "Library", "LaunchAgents", "com.serpsquad.agent.plist"); }

    private static Path linuxAutostart() {
        String x = System.getenv("XDG_CONFIG_HOME");
        return (x == null || x.isBlank() ? Paths.get(System.getProperty("user.home"), ".config") : Paths.get(x)).resolve("autostart").resolve("serpsquad-agent.desktop");
    }

    static boolean autostartOn() {
        Path p = isWindows() ? startupLink() : isMac() ? macAgent() : linuxAutostart();
        return p != null && Files.exists(p);
    }

    /**
     * Start the agent when the computer starts and this user is signed in, so
     * that after a power cut it comes back by itself: a shortcut in the
     * Startup folder on Windows, a launch agent on macOS, an autostart entry
     * on Linux. The computer itself has to be set to switch on again when the
     * power returns and to sign this user in; that is a setting of the
     * computer, not of this program.
     */
    static boolean setAutostart(Path home, boolean on) {
        try {
            if (isWindows()) {
                Path p = startupLink();
                if (p == null) return false;
                if (!on) { Files.deleteIfExists(p); return true; }
                return powershell(shortcutScript(home, "[Environment]::GetFolderPath('Startup')"));
            }
            Path p = isMac() ? macAgent() : linuxAutostart();
            if (!on) { Files.deleteIfExists(p); return true; }
            writeLaunchers(home);
            Files.createDirectories(home.resolve("logs"));
            Files.createDirectories(p.getParent());
            String h = home.toAbsolutePath().toString();
            String xml = h.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
            String text = isMac()
                ? "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\"><dict>\n"
                    + "<key>Label</key><string>com.serpsquad.agent</string>\n<key>ProgramArguments</key><array><string>/bin/sh</string><string>" + xml + "/run.sh</string></array>\n"
                    + "<key>WorkingDirectory</key><string>" + xml + "</string>\n<key>RunAtLoad</key><true/>\n<key>ProcessType</key><string>Interactive</string>\n"
                    + "<key>StandardOutPath</key><string>" + xml + "/logs/launcher.log</string>\n<key>StandardErrorPath</key><string>" + xml + "/logs/launcher.log</string>\n</dict></plist>\n"
                : "[Desktop Entry]\nType=Application\nName=" + NAME + "\nExec=/bin/sh \"" + h.replace("\"", "\\\"") + "/run.sh\"\nPath=" + h + "\nX-GNOME-Autostart-enabled=true\nTerminal=false\n";
            Files.writeString(p, text, StandardCharsets.UTF_8);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
