import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// To byggemåder:
//   vite build                 -> GitHub Pages (base "/P1SYBSv2/"), uændret.
//   vite build --mode native   -> Capacitor-appen (iOS/Android). Filerne
//                                 ligger i selve appen og åbnes fra roden,
//                                 så stierne skal være relative ("./").
// Se docs/MONTOER-APP.md.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === "native" ? "./" : "/P1SYBSv2/",
  server: {
    port: 5173,
  },
}));
