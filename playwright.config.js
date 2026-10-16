// Playwright: browsertests af de rigtige komponenter med simulerede data (se vite.e2e.config.js).
// Kør lokalt:  npm run test:e2e        På GitHub kører de automatisk (.github/workflows/e2e.yml).
import { defineConfig, devices } from "@playwright/test";

const ci = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.js",
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  // "github" skriver fejl som annoteringer på kørslen, så man kan se hvilken test der fejlede uden at åbne logfiler.
  reporter: ci ? [["list"], ["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Samme tests på en computerskærm og en telefon: appen skal virke begge steder.
  projects: [
    { name: "computer", use: { ...devices["Desktop Chrome"] } },
    { name: "mobil", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npx vite --config vite.e2e.config.js",
    url: "http://localhost:4173/e2e/harness/index.html",
    reuseExistingServer: !ci,
    timeout: 120_000,
  },
});
