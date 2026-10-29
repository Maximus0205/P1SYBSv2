import assert from "node:assert/strict";
import { ugeOversigt } from "../src/lib/ugeoversigt.js";

const dage = ["2026-11-02", "2026-11-03"];
const biler = [{ id: "b1", navn: "Bil 1" }, { id: "b2", navn: "Bil 2", lukket: true }, { id: "b3", navn: "Bil 3", lukket: true }];
const orders = [
  { id: "1", nr: "26-1", dato: "2026-11-02", bilId: "b1", status: "planlagt", kunde: { navn: "A" } },
  { id: "2", nr: "26-2", dato: "2026-11-03", bilId: "b1", status: "afsluttet", kunde: { navn: "B" }, toMand: true },
  { id: "3", nr: "26-3", dato: "2026-11-02", bilId: "b2", status: "planlagt", kunde: {} },
  { id: "4", nr: "26-4", dato: "2026-11-02", status: "planlagt", kunde: { navn: "D" } },
  { id: "5", nr: "26-5", dato: "2026-12-01", bilId: "b1", status: "planlagt", kunde: { navn: "Uden for ugen" } },
];
const u = ugeOversigt({ orders, biler, dage, tidTekst: (o) => `t${o.nr}`, hold: (b, d) => `${b.navn}${d.slice(8)}`, sortering: (a, b) => a.nr.localeCompare(b.nr) });
assert.deepEqual(u.raekker.map((r) => r.navn), ["Bil 1", "Bil 2", "Ikke tildelt"]); // Bil 3: lukket uden sager -> udeladt
assert.equal(u.antal, 4);
assert.equal(u.raekker[0].celler[0].sager[0].tid, "t26-1");
assert.equal(u.raekker[0].celler[1].sager[0].afsluttet, true);
assert.equal(u.raekker[0].celler[1].sager[0].toMand, true);
assert.equal(u.raekker[1].celler[0].sager[0].kunde, "Ukendt kunde");
assert.equal(u.raekker[2].celler[0].sager[0].nr, "26-4");
assert.equal(u.raekker[0].hold[1], "Bil 103");
assert.equal(ugeOversigt({ orders: [], biler: [{ id: "x", navn: "X" }], dage }).raekker.length, 1);
assert.equal(ugeOversigt({ orders: [], biler: [], dage }).raekker.length, 0);
console.log("ugeoversigt ok");
