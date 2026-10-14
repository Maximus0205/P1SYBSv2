import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serverer appen under /P1SYBSv2/, Cloudflare Pages i roden.
  // Cloudflare sætter selv CF_PAGES=1 under bygget, så GitHub-deployet er
  // uændret.
  base: process.env.CF_PAGES ? "/" : "/P1SYBSv2/",
  server: {
    port: 5173,
  },
});
