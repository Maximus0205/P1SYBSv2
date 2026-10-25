import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Udgivelsens id: commit-sha fra GitHub Actions (APP_BUILD i deploy.yml) eller
// Cloudflare Pages (CF_PAGES_COMMIT_SHA). Tom i lokal udvikling.
const APP_BUILD = process.env.APP_BUILD || process.env.CF_PAGES_COMMIT_SHA || "";

// Skriver version.json ved selve bygningen, så "ny udgave"-beskeden virker på
// enhver hosting (ikke kun hvor deploy.yml kører). Se src/lib/versionCheck.js.
const writeVersionFile = () => ({
  name: "write-version-file",
  generateBundle() {
    if (APP_BUILD) this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: APP_BUILD }) });
  },
});

export default defineConfig({
  plugins: [react(), writeVersionFile()],
  // Id'et indbygges også i koden, så appen kan se, at den kører en ældre udgave
  // end version.json (en gammel, cachet index.html kender ellers ikke forskellen).
  define: { __APP_BUILD__: JSON.stringify(APP_BUILD) },
  // Rodsti kan sættes med VITE_BASE (fx "/" til Cloudflare). Standard er GitHub Pages-stien til testsiden.
  base: process.env.VITE_BASE || "/P1SYBSv2/",
  // To sider: selve systemet (index.html) og backoffice (backoffice/index.html, vises på <base>backoffice/).
  build: { rollupOptions: { input: { main: fileURLToPath(new URL("./index.html", import.meta.url)), backoffice: fileURLToPath(new URL("./backoffice/index.html", import.meta.url)) } } },
  server: {
    port: 5173,
  },
});
