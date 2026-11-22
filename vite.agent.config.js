import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/* Builds the AI agent's management screens as one script + one stylesheet for
   the agent's own application (npm run build:agent-ui). The CRM's own build is
   vite.config.js and is not affected. */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: false,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "agent/src/main/resources/manage",
    emptyOutDir: true,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: "src/agent-app/main.jsx",
      output: { format: "iife", inlineDynamicImports: true, entryFileNames: "manage.js", assetFileNames: "manage[extname]" },
    },
  },
});
