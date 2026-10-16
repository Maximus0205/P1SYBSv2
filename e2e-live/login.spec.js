// Login mod den RIGTIGE app og Testmiljø-databasen. Kun læsning: testene opretter, ændrer og sletter intet.
// Brugeren (rollen sælger, butikken TESTMILJØ2.0) ligger i hemmelighederne E2E_EMAIL og E2E_PASSWORD.
// E2E_EMAIL kan være et brugernavn ("e2e") eller en e-mail - samme felt som på loginsiden.
import { test, expect } from "@playwright/test";

const bruger = process.env.E2E_EMAIL;
const kode = process.env.E2E_PASSWORD;

test.skip(!bruger || !kode, "E2E_EMAIL/E2E_PASSWORD er ikke sat - login-testene springes over");

const aabn = async (page) => {
  await page.goto("/P1SYBSv2/");
  await expect(page.getByRole("heading", { name: /velkommen/i })).toBeVisible();
};

const logInd = async (page, b, k) => {
  await page.getByLabel(/e-mail eller brugernavn/i).fill(b);
  await page.getByLabel("Adgangskode").fill(k);
  await page.getByRole("button", { name: "Log ind", exact: true }).click();
};

test("forkert adgangskode afvises med en forståelig fejl", async ({ page }) => {
  await aabn(page);
  await logInd(page, bruger, `${kode}-forkert`);
  await expect(page.getByText("Forkert e-mail/brugernavn eller adgangskode.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Log ud" })).toHaveCount(0);
});

test("login, session består ved genindlæsning, og log ud virker", async ({ page }) => {
  await aabn(page);
  await logInd(page, bruger, kode);

  const logUd = page.getByRole("button", { name: "Log ud" }).first();
  await expect(logUd).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: /velkommen/i })).toHaveCount(0);

  // Ingen vandret rulning på skærmen efter login (computer og telefon).
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.reload();
  await expect(page.getByRole("button", { name: "Log ud" }).first()).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Log ud" }).first().click();
  await expect(page.getByRole("heading", { name: /velkommen/i })).toBeVisible({ timeout: 20_000 });
});
