// Test af lib/plukPrBil.js (pluklisten pr. bil i læsserækkefølge). Kør med: node tests/plukPrBil.test.mjs
import { bilTure } from "../src/lib/plukPrBil.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};
// samme regel som dailyOrderCompare i data/domain.js
const sammenlign = (a, b) => {
  const ar = typeof a.raekkefolge === "number" ? a.raekkefolge : null, br = typeof b.raekkefolge === "number" ? b.raekkefolge : null;
  if (ar !== null && br !== null) return ar - br;
  return (a.start || "").localeCompare(b.start || "");
};
const D = "2026-11-02";
const biler = [{ id: "b1", navn: "Bil 1" }, { id: "b2", navn: "Bil 2" }, { id: "b3", navn: "Bil 3", lukket: true }];
const ordre = (id, bilId, extra = {}) => ({ id, bilId, dato: D, status: "planlagt", start: "08:00", ...extra });
const linje = (id, plukket = false) => ({ id, plukket });
const punkter = (os) => os.flatMap((o) => (o.l || []).map((l) => ({ order: o, lineItem: l })));

let o = [ordre("a", "b1", { raekkefolge: 0, l: [linje("a1"), linje("a2")] }), ordre("b", "b1", { raekkefolge: 1, l: [linje("b1")] }), ordre("c", "b1", { raekkefolge: 2, l: [linje("c1")] })];
let t = bilTure({ orders: o, points: punkter(o), vehicles: biler, dato: D, sammenlign });
eq("sidste stop læsses først", t[0].stops.map((s) => [s.order.id, s.laesNr, s.koerselNr]), [["c", 1, 3], ["b", 2, 2], ["a", 3, 1]]);
eq("tal pr. bil", [t.length, t[0].antalStop, t[0].antalLinjer, t[0].antalPlukket], [1, 3, 4, 0]);

// uden raekkefolge følger kørslen starttidspunktet
o = [ordre("x", "b1", { start: "13:00", l: [linje("x1")] }), ordre("y", "b1", { start: "08:00", l: [linje("y1")] })];
t = bilTure({ orders: o, points: punkter(o), vehicles: biler, dato: D, sammenlign });
eq("uden rækkefølge: starttid afgør, sidste læsses først", t[0].stops.map((s) => s.order.id), ["x", "y"]);

// plukket og manglende tælles
o = [ordre("p", "b1", { raekkefolge: 0, l: [linje("p1", true), linje("p2"), linje("p3")] })];
t = bilTure({ orders: o, points: punkter(o), vehicles: biler, dato: D, sammenlign, erManglende: (_, l) => l.id === "p3" });
eq("plukket og manglende", [t[0].stops[0].antalPlukket, t[0].stops[0].antalManglende, t[0].antalPlukket], [1, 1, 1]);

// lukket bil, afsluttede og andre dage udelades; flere biler holdes adskilt og i bilernes rækkefølge
o = [ordre("k", "b3", { l: [linje("k1")] }), ordre("f", "b1", { status: "afsluttet", l: [linje("f1")] }), ordre("g", "b1", { dato: "2026-11-03", l: [linje("g1")] }), ordre("m", "b2", { l: [linje("m1")] }), ordre("n", "b1", { l: [linje("n1")] })];
t = bilTure({ orders: o, points: punkter(o), vehicles: biler, dato: D, sammenlign });
eq("lukket/afsluttet/anden dag udelades", t.map((x) => [x.bil.id, x.stops.map((s) => s.order.id)]), [["b1", ["n"]], ["b2", ["m"]]]);

// stop uden pluk (fx servicetur) er stadig et stop i ruten
o = [ordre("s", "b1", { raekkefolge: 0, l: [] }), ordre("t", "b1", { raekkefolge: 1, l: [linje("t1")] })];
t = bilTure({ orders: o, points: punkter(o), vehicles: biler, dato: D, sammenlign });
eq("stop uden pluk tæller med i rute og læsning", t[0].stops.map((s) => [s.order.id, s.laesNr, s.linjer.length]), [["t", 1, 1], ["s", 2, 0]]);

eq("ingen sager: ingen ture", bilTure({ orders: [], points: [], vehicles: biler, dato: D, sammenlign }), []);

console.log(`${pass} bestået, ${fail} fejlet`);
if (fail) process.exit(1);
