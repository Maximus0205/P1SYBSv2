import assert from "node:assert/strict";
import { navigationsUrl, sagsTitel, sorterDagensSager, sagerForDag, kortFraSag, noegleTekst, telefonLink, antalFaerdige } from "../src/lib/rute.js";

assert.equal(sagsTitel([]), "Ny opgave");
assert.equal(
  sagsTitel([{ varetypeNavn: "Opvaskemaskine", primaerYdelse: { navn: "Montering" }, tillaeg: [{ navn: "Bortskaffelse af gammelt produkt" }] }]),
  "Montering – Opvaskemaskine (+ Bortskaffelse af gammelt produkt)"
);
assert.equal(sagsTitel([{ varetypeNavn: "A" }, { varetypeNavn: "B", primaerYdelse: { navn: "Levering" } }]), "A + Levering – B");
assert.equal(sagsTitel([{ varetypeId: "andet", varetypeTekst: "Flyt vask" }]), "Flyt vask");

const a = { id: "1", bilId: "b1", dato: "2026-10-19", start: "12:00", slut: "16:00" };
const b = { id: "2", bilId: "b1", dato: "2026-10-19", start: "08:00", slut: "12:00" };
const c = { id: "3", bilId: "b2", dato: "2026-10-19", start: "08:00", slut: "16:00" };
const d = { id: "4", bilId: "b1", dato: "2026-10-20", start: "08:00", slut: "16:00" };
assert.deepEqual(sagerForDag([a, b, c, d], "b1", "2026-10-19").map((s) => s.id), ["2", "1"]);
// Kun når begge har en bevidst rækkefølge, vinder den over starttid.
assert.deepEqual(sagerForDag([{ ...a, raekkefolge: 0 }, { ...b, raekkefolge: 1 }], "b1", "2026-10-19").map((s) => s.id), ["1", "2"]);
assert.deepEqual(sagerForDag([{ ...a, raekkefolge: 0 }, b], "b1", "2026-10-19").map((s) => s.id), ["2", "1"]);
assert.deepEqual(sagerForDag(null, "b1", "2026-10-19"), []);
assert.equal(sorterDagensSager({}, {}), 0);

const kort = kortFraSag({ id: 7, nr: 12, start: "08:00", slut: "16:00", status: "ukendt", toMand: true, sagstype: "tomgang", kunde: { navn: "Anna", adresse: "Vej 1, 5000 Odense", telefon: "12 34 56 78" } });
assert.equal(kort.id, "7");
assert.equal(kort.tid, "08:00–16:00");
assert.equal(kort.toMand, true);
assert.equal(kort.tomgang, true);
assert.equal(kort.status, "planlagt");
assert.equal(kortFraSag({ id: 1 }).kunde, "");
assert.equal(noegleTekst({ kraeves: true, type: "Nøgleboks", placering: "Kode 1234" }), "Nøgleboks — Kode 1234");
assert.equal(noegleTekst({ kraeves: false, type: "Nøgleboks" }), "");
assert.equal(telefonLink("12 34 56 78"), "tel:12345678");
assert.equal(telefonLink("+45 12 34 56 78"), "tel:+4512345678");
assert.equal(telefonLink(""), "");
assert.equal(antalFaerdige([{ status: "afsluttet" }, { status: "planlagt" }]), 1);
assert.equal(navigationsUrl({ kunde: { adresse: "Vej 1, 5000 Odense" } }, "ios"), "https://maps.apple.com/?daddr=Vej%201%2C%205000%20Odense&dirflg=d");
assert.equal(navigationsUrl({ kunde: { adresse: "Vej 1", adresseKoordinater: { lat: 55.4, lon: 10.4 } } }, "android"), "https://www.google.com/maps/dir/?api=1&destination=55.4,10.4");
assert.equal(navigationsUrl({ kunde: { adresse: " " } }, "ios"), "");
assert.equal(navigationsUrl({}, "android"), "");
console.log("rute: ok");
