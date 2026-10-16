// Redigér booking: modelnummeret tjekkes mod punkt1.dk, og varetypen sammenlignes med det, punkt1 kalder varen.
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/e2e/harness/index.html?case=linje-editor");
});

const linje = (page) => page.evaluate(() => window.__items()[0]);

test("et bekræftet modelnummer med en anden varetype giver en advarsel, og et tryk skifter", async ({ page }) => {
  await page.getByLabel("Model", { exact: true }).fill("WAN28");

  await expect(page.getByText("Bekræftet på punkt1.dk")).toBeVisible();
  const advarsel = page.getByRole("alert");
  await expect(advarsel).toContainText('punkt1.dk kalder denne vare "Vaskemaskine"');
  await expect(advarsel).toContainText('varetypen er "Køleskab"');

  // Intet ændres af sig selv: varetypen står stadig på Køleskab, før man trykker.
  expect((await linje(page)).varetypeNavn).toBe("Køleskab");

  await page.getByRole("button", { name: "Skift til Vaskemaskine" }).click();

  const efter = await linje(page);
  expect(efter.varetypeNavn).toBe("Vaskemaskine");
  expect(efter.primaerYdelse.minutter).toBe(45); // standardtiden for Vaskemaskine + Montering
  expect(efter.tillaeg).toEqual([]); // Bortskaffelse gælder kun køleskabe og er fjernet
  expect(efter.punkt1Id).toBe("111");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("ændres varetypen bagefter, kommer advarslen igen", async ({ page }) => {
  await page.getByLabel("Model", { exact: true }).fill("WAN28");
  await page.getByRole("button", { name: "Skift til Vaskemaskine" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);

  // Etiketten rummer også valgmulighederne, så feltet findes via etiketten og vælgeren inden i den.
  await page.locator("label", { hasText: "Varetype" }).locator("select").selectOption("vt1");

  await expect(page.getByRole("alert")).toContainText('punkt1.dk kalder denne vare "Vaskemaskine"');
});

test("et ukendt modelnummer giver rødt kryds og ingen typeadvarsel", async ({ page }) => {
  await page.getByLabel("Model", { exact: true }).fill("ZZZZ");

  await expect(page.getByText('Intet fundet på punkt1.dk for "ZZZZ"')).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
