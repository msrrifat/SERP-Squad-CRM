import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    /* split the vendor libraries out of the single index chunk: the VPS builds
       with limited RAM, and one ~900KB chunk was pushing rollup's peak memory
       (a failed build there leaves the previous dist serving stale code).
       Smaller chunks also cache better between deploys. */
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          charts: ["recharts"],
          icons: ["lucide-react"],
        },
      },
    },
  },
  server: {
    watch: { ignored: ["**/server/data/**", "**/server/auth/**"] },
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
});
