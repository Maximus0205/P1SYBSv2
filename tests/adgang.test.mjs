import assert from "node:assert/strict";
import { test } from "node:test";
import { ETAGER, etageLabel, gyldigEtage, adgangsFelter, adgangTekst } from "../src/data/adgang.js";
import { maalingsRaekker } from "../src/data/estimates.js";

test("etager: gyldige værdier, ukendte afvises", () => {
  assert.equal(ETAGER.length, 5);
  assert.equal(gyldigEtage("3"), "3");
  for (const v of ["", "5", "stuen", null, undefined, 3]) assert.equal(gyldigEtage(v), null);
  assert.equal(etageLabel("stue"), "Stue");
  assert.equal(etageLabel("x"), null);
});

test("adgangsFelter gemmer kun det, der er oplyst", () => {
  assert.deepEqual(adgangsFelter({}), {});
  assert.deepEqual(adgangsFelter({ etage: "2" }), { etage: "2" });
  assert.deepEqual(adgangsFelter({ parkeringBesvaerlig: true }), { parkeringBesvaerlig: true });
  assert.deepEqual(adgangsFelter({ parkeringBesvaerlig: false, etage: "ugyldig" }), {});
  assert.deepEqual(adgangsFelter({ etage: "4+", parkeringBesvaerlig: true }), { etage: "4+", parkeringBesvaerlig: true });
  assert.deepEqual(adgangsFelter(undefined), {});
});

test("adgangTekst: tom når intet er oplyst, ellers kort tekst", () => {
  assert.equal(adgangTekst({}), "");
  assert.equal(adgangTekst(null), "");
  assert.equal(adgangTekst({ etage: "3" }), "3. sal");
  assert.equal(adgangTekst({ parkeringBesvaerlig: true }), "Besværlig parkering");
  assert.equal(adgangTekst({ etage: "stue", parkeringBesvaerlig: true }), "Stue · Besværlig parkering");
});

test("opfølgning kan kopiere adgangsforhold fra kildesagen", () => {
  const kilde = { etage: "3", parkeringBesvaerlig: true, andet: 1 };
  assert.deepEqual(adgangsFelter(kilde), { etage: "3", parkeringBesvaerlig: true });
});

test("målingsoversigten bærer adgangsforholdene med til senere sammenligning", () => {
  const sag = { status: "afsluttet", etage: "3", parkeringBesvaerlig: true, varelinjer: [{ varetypeId: "v", primaerYdelse: { id: "m" }, tillaeg: [] }], startetTidspunkt: "2026-10-01T08:00:00Z", afsluttetTidspunkt: "2026-10-01T09:00:00Z", logs: [] };
  assert.equal(maalingsRaekker([sag])[0].adgang, "3. sal · Besværlig parkering");
  assert.equal(maalingsRaekker([{ ...sag, etage: undefined, parkeringBesvaerlig: undefined }])[0].adgang, "");
});
