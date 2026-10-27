import assert from "node:assert/strict";
import { soegSager, plukseddelLinjer, sagsLabels } from "../src/lib/sagsplukseddel.js";

const o = (id, nr, navn, dato, extra = {}) => ({ id, nr, dato, status: "planlagt", kunde: { navn, adresse: "Åvej 4, Vejle", telefon: "+45 12 34 56 78" }, varelinjer: [{ id: id + "l1", primaerYdelse: { navn: "Opstilling" }, type: "Køleskab" }], ...extra });
const sager = [o("a", "26-223", "Erik Hansen", "2026-11-17"), o("b", "26-224", "Mette Jensen", "2026-10-28"), o("c", "26-225", "Hansen Maskinhandel", null), o("d", "26-100", "Gammel Hansen", "2026-09-01"), o("e", "26-300", "Afsluttet Hansen", "2026-11-01", { status: "afsluttet" })];
const idag = "2026-10-27";

// nr, med og uden #
assert.deepEqual(soegSager(sager, "26-223", { idag }).map((x) => x.id), ["a"]);
assert.deepEqual(soegSager(sager, "#26-223", { idag }).map((x) => x.id), ["a"]);
// navn: kommende først (nærmeste), så uden dato, så tidligere; afsluttede udeladt
assert.deepEqual(soegSager(sager, "hansen", { idag }).map((x) => x.id), ["a", "c", "d"]);
assert.deepEqual(soegSager(sager, "hansen", { idag, inklAfsluttede: true }).map((x) => x.id), ["e", "a", "c", "d"]);
// alle ord skal matche, tegn-uafhængigt (å/aa), telefon
assert.deepEqual(soegSager(sager, "erik vejle", { idag }).map((x) => x.id), ["a"]);
assert.deepEqual(soegSager(sager, "aavej", { idag }).length, 4);
assert.deepEqual(soegSager(sager, "5678", { idag }).length, 4);
assert.deepEqual(soegSager(sager, "   ", { idag }), []);
assert.deepEqual(soegSager(sager, "xyz", { idag }), []);
assert.equal(soegSager(sager, "hansen", { idag, max: 1 }).length, 1);
// varenavn
assert.deepEqual(soegSager(sager, "køleskab 223", { idag, varenavn: (l) => l.type }).map((x) => x.id), ["a"]);

// plukseddelLinjer: RMA-linjer plukkes ikke, men vises som retur
const med = o("f", "26-1", "X", "2026-11-01", { varelinjer: [{ id: "1", primaerYdelse: { navn: "Opstilling" }, type: "Ovn" }, { id: "2", primaerYdelse: { navn: "Opstilling" }, type: "Gammel", rma: { nr: "RMA-26-1-1", status: "oprettet", historik: [] } }, { id: "3", primaerYdelse: { navn: "Opstilling" }, type: "Lukket", rma: { nr: "RMA-26-1-2", status: "afsluttet", historik: [] } }] });
const r = plukseddelLinjer(med, []);
assert.deepEqual(r.linjer.map((l) => l.id), ["1"]);
assert.deepEqual(r.rma.map((l) => l.id), ["2"]);

// labels
const ls = sagsLabels({ order: med, primaryServices: [], butik: "Bjerg", varenavn: (l) => l.type, leveringTekst: "Levering 1.11", kopier: 2 });
assert.equal(ls.length, 2);
assert.equal(ls[0].nr, "SAG-26-1");
assert.equal(ls[0].vare, "Ovn");
assert.equal(sagsLabels({ order: med, primaryServices: [], varenavn: (l) => l.type, kopier: 99 }).length, 4);
console.log("sagsplukseddel: ok");
