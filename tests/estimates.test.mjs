import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEstimateIndex, estimateForLineItem, estimateDataStatus, signatures } from "../src/data/estimates.js";

const linje = (vare, ydelse = "mont") => ({ varetypeId: vare, primaerYdelse: { id: ydelse }, tillaeg: [] });
const sag = (vare, min, extra = {}) => ({
  status: "afsluttet", varelinjer: [linje(vare)],
  startetTidspunkt: "2026-10-01T08:00:00Z",
  afsluttetTidspunkt: new Date(Date.parse("2026-10-01T08:00:00Z") + min * 60000).toISOString(),
  logs: [], ...extra,
});

test("signaturer: ingen pulje på tværs af varetyper (kun 2 niveauer)", () => {
  assert.equal(signatures(linje("opvask")).length, 2);
});

test("10 sager af ANDEN varetype giver ikke forslag til opvaskemaskine", () => {
  const sager = Array.from({ length: 10 }, () => sag("tumbler", 15));
  const idx = buildEstimateIndex(sager);
  assert.equal(estimateForLineItem(idx, linje("opvask")), null);
});

test("kræver mindst 5 observationer af samme vare og ydelse", () => {
  const fire = Array.from({ length: 4 }, () => sag("opvask", 60));
  assert.equal(estimateForLineItem(buildEstimateIndex(fire), linje("opvask")), null);
  const fem = Array.from({ length: 5 }, () => sag("opvask", 60));
  assert.equal(estimateForLineItem(buildEstimateIndex(fem), linje("opvask")).minutter, 60);
});

test("urealistisk korte (<5 min) og lange (>10 t) målinger kasseres", () => {
  const sager = [...Array.from({ length: 5 }, () => sag("opvask", 2)), ...Array.from({ length: 5 }, () => sag("opvask", 700))];
  assert.equal(buildEstimateIndex(sager).size, 0);
});

test("datastatus: for lidt data kan forslaget ikke slås til", () => {
  const s = estimateDataStatus(Array.from({ length: 10 }, () => sag("opvask", 60)));
  assert.equal(s.antalMaalt, 10);
  assert.equal(s.tilstraekkeligt, false);
});

test("datastatus: nok data og en kombination med nok målinger", () => {
  const s = estimateDataStatus(Array.from({ length: 20 }, () => sag("opvask", 60)));
  assert.equal(s.tilstraekkeligt, true);
  assert.equal(s.antalKombinationer, 1);
});

test("datastatus: 20 sager spredt på for mange kombinationer er ikke nok", () => {
  const sager = Array.from({ length: 20 }, (_, i) => sag("vare" + i, 60));
  assert.equal(estimateDataStatus(sager).tilstraekkeligt, false);
});

test("målingsoversigt: årsag til at sager ikke tæller med", async () => {
  const { maalingsRaekker, maalingsGrupper } = await import("../src/data/estimates.js");
  const sager = [sag("opvask", 60), sag("opvask", 2), { ...sag("opvask", 60), varelinjer: [linje("opvask"), linje("tumbler")] }, { status: "afsluttet", varelinjer: [linje("opvask")], logs: [] }];
  const r = maalingsRaekker(sager);
  assert.deepEqual(r.map((x) => x.aarsag), [null, "under 5 min", "mangler grundtid for en af varerne", "ingen måling"]);
  assert.equal(maalingsGrupper(r)[0].antal, 1);
});

test("overblik: tæller, årsager og uger", async () => {
  const { maalingsRaekker, maalingsOverblik } = await import("../src/data/estimates.js");
  const r = maalingsRaekker([sag("a", 60, { dato: "2026-10-19" }), sag("a", 2, { dato: "2026-10-21" }), sag("a", 60, { dato: "2026-10-12" })]);
  const o = maalingsOverblik(r);
  assert.equal(o.afsluttet, 3); assert.equal(o.indgaar, 2);
  assert.deepEqual(o.aarsager, [{ aarsag: "under 5 min", antal: 1 }]);
  assert.deepEqual(o.uger.map((u) => [u.uge, u.ialt, u.indgaar]), [["2026-10-19", 2, 1], ["2026-10-12", 1, 1]]);
});

test("prøv forslag: leave-one-out sammenligner forslag og plan med målt", async () => {
  const { proeveForslag } = await import("../src/data/estimates.js");
  const sager = Array.from({ length: 7 }, (_, i) => sag("opvask", 60, { id: "o" + i }));
  const p = proeveForslag(sager, () => 30);
  assert.equal(p.antal, 7); assert.equal(p.antalMedForslag, 7);
  assert.equal(p.forslagFejlSammeSager, 0); assert.equal(p.planFejlSammeSager, 30);
  const faa = proeveForslag(sager.slice(0, 4), () => 30); // kun 3 andre pr. sag - for lidt
  assert.equal(faa.antalMedForslag, 0);
});

test("flere varelinjer: tæller med når alle varer har grundtid, og stordriftsfaktor læres", async () => {
  const { maalingsRaekker, stordriftsOversigt, proeveForslag } = await import("../src/data/estimates.js");
  const tid = (min) => ({ startetTidspunkt: "2026-10-01T08:00:00Z", afsluttetTidspunkt: new Date(Date.parse("2026-10-01T08:00:00Z") + min * 60000).toISOString() });
  const enkelt = [...Array.from({ length: 5 }, (_, i) => sag("a", 60, { id: "a" + i })), ...Array.from({ length: 5 }, (_, i) => sag("b", 40, { id: "b" + i }))];
  // 5 sager med a+b (sum 100) målt til 80 min -> faktor 0,8, hver på sin egen dag/adresse
  const flere = Array.from({ length: 5 }, (_, i) => ({ status: "afsluttet", id: "m" + i, dato: "2026-10-0" + (i + 1), bilId: "x", kunde: { adresse: "Vej " + (i + 1) + ", 8000 Aarhus" }, varelinjer: [linje("a"), linje("b")], logs: [], ...tid(80) }));
  const alle = [...enkelt, ...flere];
  const r = maalingsRaekker(alle);
  assert.ok(r.filter((x) => x.flere).every((x) => x.indgaar && x.faktor === 0.8));
  assert.ok(maalingsRaekker([...enkelt, { ...flere[0], varelinjer: [linje("a"), linje("ukendt")] }]).find((x) => x.flere).aarsag.startsWith("mangler grundtid"));
  const sd = stordriftsOversigt(alle);
  assert.equal(sd.length, 1); assert.equal(sd[0].enheder, 2); assert.equal(sd[0].faktor, 0.8);
  const p = proeveForslag(alle, () => 100);
  assert.equal(p.antalFlere, 5);
});
