import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Udgivelsens id: commit-sha fra GitHub Actions (APP_BUILD i deploy.yml) eller
// Cloudflare Pages (CF_PAGES_COMMIT_SHA). Tom i lokal udvikling.
const APP_BUILD = process.env.APP_BUILD || process.env.CF_PAGES_COMMIT_SHA || "";

// Skriver udgivelsens filer ved selve bygningen, så de virker på enhver hosting (ikke kun hvor deploy.yml kører):
//   version.json  - "ny udgave"-beskeden, se src/lib/versionCheck.js
//   sw.js         - service workeren, der lader appen åbne uden net, se sw/sw.template.js. Id'et i filen ændrer
//                   sig ved HVER udgivelse (uden commit-sha bruges tidspunktet), så browseren henter den nye.
const SW_SKABELON = new URL("./sw/sw.template.js", import.meta.url);
const udgivelsesFiler = () => ({
  name: "udgivelsesfiler",
  generateBundle() {
    if (APP_BUILD) this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: APP_BUILD }) });
    const swId = APP_BUILD || `t${Date.now()}`;
    this.emitFile({ type: "asset", fileName: "sw.js", source: readFileSync(SW_SKABELON, "utf8").replaceAll('"__BUILD__"', JSON.stringify(swId)) });
  },
});

export default defineConfig({
  plugins: [react(), udgivelsesFiler()],
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
