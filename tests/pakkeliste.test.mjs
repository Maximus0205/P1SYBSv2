// Kør med: node tests/pakkeliste.test.mjs
import { pakkelisteData, sagerPaaTuren } from "../src/lib/pakkeliste.js";
let pass = 0, fail = 0;
const eq = (n, g, w) => { if (JSON.stringify(g) === JSON.stringify(w)) pass++; else { fail++; console.log("FAIL:", n, "\n  got: ", JSON.stringify(g), "\n  want:", JSON.stringify(w)); } };
const D = "2026-10-27";
const sm = (a, b) => (a.raekkefolge ?? 0) - (b.raekkefolge ?? 0);
const vehicles = [{ id: "b1", navn: "Bil 1" }, { id: "b2", navn: "Bil 2" }, { id: "b3", navn: "Bil 3", lukket: true }];
const personnel = [{ id: "m1", navn: "Magnus", bilId: "b1", rolle: "montor" }, { id: "h1", navn: "Hans", bilId: null, rolle: "medhjaelper" }];
const helpers = [{ dato: D, vehicleId: "b1", personId: "h1" }];
const o = (id, bilId, r, linjer, extra = {}) => ({ id, nr: `26-${id}`, bilId, dato: D, status: "planlagt", raekkefolge: r, kunde: { navn: `K${id}` }, varelinjer: linjer, ...extra });
const l = (id, x = {}) => ({ id, ...x });
const rma = (nr, status = "oprettet") => ({ nr, status });
const orders = [
  o("1", "b1", 0, [l("a", { plukket: true }), l("b")]),
  o("2", "b1", 1, [l("c"), l("r1", { rma: rma("RMA-26-2-1") }), l("r2", { rma: rma("RMA-26-2-2", "afsluttet") })]),
  o("3", "b2", 0, [l("d")]),
  o("4", "b3", 0, [l("e")]),
];
const points = orders.flatMap((x) => x.varelinjer.filter((v) => !v.rma).map((v) => ({ order: x, lineItem: v })));
const base = { orders, points, vehicles, dato: D, sammenlign: sm, erManglende: () => false, personnel, helpers, erMedhjaelper: (r) => r === "medhjaelper" };

let d = pakkelisteData(base);
eq("komplet: begge åbne biler, lukket udeladt", d.map((t) => t.bil.id), ["b1", "b2"]);
eq("stop i læsserækkefølge med rma", d[0].stops.map((s) => [s.order.id, s.laesNr, s.koerselNr, s.linjer.map((x) => x.id), s.rma.map((x) => x.id)]), [["2", 1, 2, ["c"], ["r1"]], ["1", 2, 1, ["a", "b"], []]]);
eq("afsluttet rma udeladt, tal", [d[0].antalRma, d[0].antalLinjer, d[0].antalPlukket, d[1].antalRma], [1, 3, 1, 0]);
eq("hold", [d[0].hold.montoerer, d[0].hold.andenMand, d[1].hold.montoerer], [["Magnus"], ["Hans"], []]);
d = pakkelisteData({ ...base, bilId: "b2" });
eq("kun én bil", d.map((t) => t.bil.id), ["b2"]);
d = pakkelisteData({ ...base, bilId: "findes-ikke" });
eq("ukendt bil giver ingenting", d, []);
d = pakkelisteData({ ...base, kunMangler: true });
eq("kun varer der mangler pluk", d[0].stops.map((s) => s.linjer.map((x) => x.id)), [["c"], ["b"]]);
d = pakkelisteData({ ...base, kunMangler: true, erManglende: (_, v) => v.id === "a" });
eq("manglende varer vises altid", d[0].stops[1].linjer.map((x) => x.id), ["a", "b"]);
eq("sager på turen", sagerPaaTuren(pakkelisteData(base)).map((x) => x.id), ["2", "1", "3"]);
eq("andre dage tæller ikke", pakkelisteData({ ...base, dato: "2026-10-28" }), []);
console.log(`pakkeliste: ${pass} ok, ${fail} fejl`);
if (fail) process.exit(1);
