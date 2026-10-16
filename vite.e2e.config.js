// VITE-OPSÆTNING TIL BROWSERTESTS (Playwright) - bruges KUN af `npm run test:e2e`, aldrig af selve appen.
//
// Testene kører ikke mod den rigtige database. De åbner små testsider (e2e/harness/) med de RIGTIGE
// komponenter, men hvor dataStore og supabaseClient er erstattet af simulerede udgaver:
//   - supabaseClient: en tom klient uden netværk (e2e/harness/mocks/supabaseClient.js).
//   - dataStore: bygges ud fra den rigtige filspors eksporterede navne, så en ny funktion i dataStore.js
//     automatisk får en "ikke simuleret"-stub. Kun det, e2e/harness/overrides.js leverer, svarer rigtigt.
// Intet i denne fil eller i testene taler med Supabase eller andre eksterne tjenester.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rod = process.cwd();
const rigtigDataStore = resolve(rod, "src/lib/dataStore.js");
const rigtigSupabaseKlient = resolve(rod, "src/lib/supabaseClient.js");

function simuleretDataStore() {
  return {
    name: "simuleret-datastore",
    enforce: "pre",
    load(id) {
      const fil = id.split("?")[0];
      // Både dataStore og supabaseClient udskiftes på filniveau, så det virker uanset hvordan de importeres
      // ("../lib/dataStore", "./dataStore" ...).
      if (fil === rigtigSupabaseKlient) return 'export * from "/e2e/harness/mocks/supabaseClient.js";';
      if (fil !== rigtigDataStore) return null;
      const kilde = readFileSync(rigtigDataStore, "utf8");
      const navne = [...kilde.matchAll(/^export (?:async )?(?:function|const|let) (\w+)/gm)].map((m) => m[1]);
      return [
        'import * as o from "/e2e/harness/overrides.js";',
        ...navne.map((n) => `export const ${n} = o.${n} ?? (async () => ({ ok: false, fejl: "Ikke simuleret i test" }));`),
      ].join("\n");
    },
  };
}

export default defineConfig({
  base: "/",
  plugins: [react(), simuleretDataStore()],
  server: { port: 4173, strictPort: true },
});
