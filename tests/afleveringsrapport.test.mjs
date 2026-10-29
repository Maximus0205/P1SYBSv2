import assert from "node:assert/strict";
import { kanLaveRapport, lavRapportFelt, rapportData, rapportMangler, MAX_RAPPORT_TEKST } from "../src/lib/afleveringsrapport.js";

assert.equal(kanLaveRapport({ status: "afsluttet" }), true);
for (const s of ["planlagt", "igang", undefined]) assert.equal(kanLaveRapport({ status: s }), false);
assert.equal(kanLaveRapport(null), false);

assert.equal(lavRapportFelt({ udfoert: "  ", noter: "" }, { navn: "A" }), null);
const f = lavRapportFelt({ udfoert: " Monteret vaskemaskine ", noter: "" }, { id: "u1", navn: "Mette" }, "2026-10-29T10:00:00Z");
assert.deepEqual(f, { udfoert: "Monteret vaskemaskine", noter: "", opdateret: "2026-10-29T10:00:00Z", af: { id: "u1", navn: "Mette" } });
assert.equal(lavRapportFelt({ udfoert: "x".repeat(MAX_RAPPORT_TEKST + 50), noter: "" }, null).udfoert.length, MAX_RAPPORT_TEKST);
assert.equal(lavRapportFelt({ udfoert: "a", noter: "" }, null).af, null);

const order = {
  nr: "26-1", status: "afsluttet", kunde: { navn: "Hansen", adresse: "Vej 1", telefon: "12345678" }, dato: "2026-10-28",
  noter: [{ id: "n", tekst: "INTERN: kunden er svær" }],
  afleveringsrapport: { udfoert: "Monteret", noter: "Husk filter" },
  rapporter: [{ id: "r", titel: "Gammel", tekst: "Gammel tekst", tid: "t" }, { id: "r2", titel: "Tom", tekst: "" }],
  varelinjer: [{ id: "a", navn: "Vask", udfoert: true }, { id: "b", rma: { nr: 1 } }],
  materialer: [{ id: "m", navn: "Slange", antal: 2 }, { id: "m2", navn: "Pakning" }],
  underskrift: { navn: "Hansen", tid: "t", data: "data:image/png;base64,x" },
};
const d = rapportData(order);
assert.equal(d.udfoert, "Monteret");
assert.equal(d.noter, "Husk filter");
assert.equal(d.varer.length, 1);
assert.deepEqual(d.materialer, [{ navn: "Slange", antal: 2 }, { navn: "Pakning", antal: 1 }]);
assert.equal(d.tidligere.length, 1);
assert.equal(d.underskrift.navn, "Hansen");
assert.ok(!JSON.stringify(d).includes("INTERN"), "interne noter må aldrig med");
assert.equal(rapportMangler(order), false);
assert.equal(rapportMangler({}), true);
assert.equal(rapportData({}).varer.length, 0);
console.log("afleveringsrapport ok");
