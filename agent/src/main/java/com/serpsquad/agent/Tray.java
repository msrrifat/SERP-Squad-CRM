package com.serpsquad.agent;

import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.GraphicsEnvironment;
import java.awt.MenuItem;
import java.awt.PopupMenu;
import java.awt.RenderingHints;
import java.awt.SystemTray;
import java.awt.TrayIcon;
import java.awt.image.BufferedImage;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/**
 * The icon in the notification area (Windows) or menu bar (macOS). Closing the
 * application window does not stop the agent; this icon reopens the window,
 * pauses the agent, or quits it.
 */
final class Tray {
    private Tray() {}

    static BufferedImage icon(int size) {
        BufferedImage img = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setColor(new Color(0x1F, 0x2A, 0x44));
        g.fillRoundRect(0, 0, size, size, size / 4, size / 4);
        g.setColor(new Color(0x34, 0xD3, 0x99));
        g.fillOval(size * 62 / 100, size * 12 / 100, size * 24 / 100, size * 24 / 100);
        g.setColor(Color.WHITE);
        g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, size * 44 / 100));
        java.awt.FontMetrics fm = g.getFontMetrics();
        String t = "SS";
        g.drawString(t, (size - fm.stringWidth(t)) / 2, (size - fm.getHeight()) / 2 + fm.getAscent() + size / 16);
        g.dispose();
        return img;
    }

    /** Returns true when the icon was installed. Never throws. */
    static boolean install(String tooltip, Runnable open, BooleanSupplier paused, Consumer<Boolean> setPaused, Runnable quit) {
        try {
            if (GraphicsEnvironment.isHeadless() || !SystemTray.isSupported()) return false;
            PopupMenu menu = new PopupMenu();
            MenuItem openItem = new MenuItem("Open SERP Squad Agent");
            openItem.addActionListener((e) -> open.run());
            menu.add(openItem);
            if (paused != null && setPaused != null) {
                MenuItem pauseItem = new MenuItem(paused.getAsBoolean() ? "Resume" : "Pause");
                pauseItem.addActionListener((e) -> { boolean now = !paused.getAsBoolean(); setPaused.accept(now); pauseItem.setLabel(now ? "Resume" : "Pause"); });
                menu.add(pauseItem);
            }
            menu.addSeparator();
            MenuItem quitItem = new MenuItem("Quit the agent");
            quitItem.addActionListener((e) -> quit.run());
            menu.add(quitItem);
            TrayIcon icon = new TrayIcon(icon(64), tooltip, menu);
            icon.setImageAutoSize(true);
            icon.addActionListener((e) -> open.run());     // double-click on Windows
            SystemTray.getSystemTray().add(icon);
            return true;
        } catch (Throwable e) {
            return false;
        }
    }
}
