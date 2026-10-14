import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  base: "/P1SYBSv2/",
  // To sider: selve systemet (index.html) og backoffice (backoffice/index.html, vises på /P1SYBSv2/backoffice/).
  build: { rollupOptions: { input: { main: fileURLToPath(new URL("./index.html", import.meta.url)), backoffice: fileURLToPath(new URL("./backoffice/index.html", import.meta.url)) } } },
  server: {
    port: 5173,
  },
});
