// Playwright MOD DEN RIGTIGE APP: login mod Testmiljø-butikken (se e2e-live/login.spec.js).
// Kør lokalt:  E2E_EMAIL=... E2E_PASSWORD=... VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npm run test:e2e:live
// På GitHub kører den i jobbet "live" i .github/workflows/e2e.yml med repoets hemmeligheder.
// Testene springes over, hvis E2E_EMAIL/E2E_PASSWORD ikke er sat - de fejler aldrig bare fordi hemmeligheder mangler.
import { defineConfig, devices } from "@playwright/test";

const ci = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e-live",
  testMatch: "**/*.spec.js",
  // Én ad gangen: de deler samme testbruger, og login-forsøg skal ikke ramme Supabase Auths hastighedsgrænse.
  fullyParallel: false,
  workers: 1,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? [["list"], ["github"], ["html", { open: "never", outputFolder: "playwright-report-live" }]] : [["list"]],
  outputDir: "test-results-live",
  use: {
    baseURL: "http://localhost:4174",
    // Aldrig trace/screenshot/video: de kunne indeholde adgangskoden eller virkelige kundedata.
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    { name: "computer", use: { ...devices["Desktop Chrome"] } },
    { name: "mobil", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // Bygger den rigtige app (med VITE_SUPABASE_* fra miljøet) og serverer den som på GitHub Pages.
    command: "npx vite build && npx vite preview --port 4174 --strictPort",
    url: "http://localhost:4174/P1SYBSv2/",
    reuseExistingServer: !ci,
    timeout: 240_000,
  },
});
