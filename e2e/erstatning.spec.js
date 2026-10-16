// Erstat manglende vare: forslag fra POS, konsekvens for kunde og avance, og bekræftelse før skift.
import { test, expect } from "@playwright/test";

const aabn = (page, params = "") => page.goto(`/e2e/harness/index.html?case=erstatning${params}`);

test("viser muligheder med lager først og regner konsekvens ud", async ({ page }) => {
  await aabn(page);

  const muligheder = page.getByRole("radio");
  await expect(muligheder).toHaveCount(3);
  // På lager først, derefter nærmest i pris: AEG (6.250), Bosch (9.000), Beko (ikke på lager).
  await expect(muligheder.nth(0)).toContainText("AEG LR744PX6P");
  await expect(muligheder.nth(1)).toContainText("Bosch WAN28");
  await expect(muligheder.nth(2)).toContainText("Ikke på lager");

  await muligheder.nth(0).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Kunden beholder sin pris");
  await expect(dialog).toContainText("Kunden følger den nye pris");
  await expect(dialog).toContainText("500 kr (13 %)"); // avance, hvis butikken tager forskellen
  await expect(dialog).toContainText("1.500 kr (30 %)"); // avance, hvis kunden betaler den nye pris
});

test("intet ændres før bekræftelse, og et skifte giver mulighed for at ringe til kunden", async ({ page }) => {
  await aabn(page);
  await page.getByRole("radio").nth(0).click();

  await page.getByRole("button", { name: "Skift til denne vare" }).click();
  expect(await page.evaluate(() => window.__applied.length)).toBe(0);

  await page.getByRole("button", { name: "Ja, skift varen på sagen" }).click();
  expect(await page.evaluate(() => window.__applied)).toEqual([["l1", { maerke: "AEG", model: "LR744PX6P" }]]);
  await expect(page.getByRole("link", { name: /Ring til kunden/ })).toBeVisible();
});

test("manglende indkøbspris giver en ærlig besked i stedet for et tal", async ({ page }) => {
  await aabn(page);
  await page.getByRole("radio").nth(2).click();
  await expect(page.getByRole("dialog")).toContainText("POS mangler indkøbs- eller udsalgspris");
});

test("POS-fejl vises og kan prøves igen", async ({ page }) => {
  await aabn(page, "&pos=fejl");
  await expect(page.getByRole("alert")).toContainText("endnu ikke koblet til Flow Retail");
  await expect(page.getByRole("button", { name: "Prøv igen" })).toBeVisible();
});

test("ingen muligheder: forklarer hvad man kan gøre i stedet", async ({ page }) => {
  await aabn(page, "&pos=tom");
  await expect(page.getByRole("dialog")).toContainText("POS fandt ingen lignende varer");
});

test("uden ret til at ændre varer kan man ikke skifte, men stadig åbne sagen", async ({ page }) => {
  await aabn(page, "&kan=0");
  await page.getByRole("radio").nth(0).click();
  await expect(page.getByRole("button", { name: "Skift til denne vare" })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toContainText("ikke rettigheden");
  await expect(page.getByRole("button", { name: /Åbn sagen/ })).toBeVisible();
});

test("Escape lukker, og siden bliver ikke bredere end skærmen", async ({ page }) => {
  await aabn(page);
  await expect(page.getByRole("radio")).toHaveCount(3);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.__lukket)).toBe(true);
});
