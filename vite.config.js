import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  // Rodsti kan sættes med VITE_BASE (fx "/" til Cloudflare). Standard er GitHub Pages-stien til testsiden.
  base: process.env.VITE_BASE || "/P1SYBSv2/",
  // To sider: selve systemet (index.html) og backoffice (backoffice/index.html, vises på <base>backoffice/).
  build: { rollupOptions: { input: { main: fileURLToPath(new URL("./index.html", import.meta.url)), backoffice: fileURLToPath(new URL("./backoffice/index.html", import.meta.url)) } } },
  server: {
    port: 5173,
  },
});
