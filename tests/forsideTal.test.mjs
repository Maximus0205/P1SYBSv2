// Kør med: node tests/forsideTal.test.mjs
import { haster, bilFremdrift, plukFremdrift, mineSager, dagensTal, holdForBil, bilNavnUdenHold } from "../src/lib/forsideTal.js";
let pass = 0, fail = 0;
const eq = (n, g, w) => { if (JSON.stringify(g) === JSON.stringify(w)) pass++; else { fail++; console.log("FAIL:", n, "\n  got: ", JSON.stringify(g), "\n  want:", JSON.stringify(w)); } };
const I = "2026-10-27";
const skal = (o) => !o.dato || !o.bilId;
const o = (id, x = {}) => ({ id, nr: id, status: "planlagt", ...x });

// haster
const h = haster({ orders: [o("a", { senestDato: "2026-10-26" }), o("b", { senestDato: "2026-10-29" }), o("c", { senestDato: "2026-11-20" }), o("d"), o("e", { dato: "2026-11-02" }), o("f", { senestDato: "2026-10-28", status: "afsluttet" }), o("g", { dato: "2026-10-28", bilId: "b1" })], idag: I, skalPlanlaegges: skal });
eq("haster: sorteret, kun uplanlagte inden for 7 dage", h.map((x) => [x.order.id, x.dage, x.niveau]), [["a", -1, "overskredet"], ["b", 2, "snart"], ["e", 6, "ok"]]);

// bilFremdrift
const sm = (a, b) => (a.start || "").localeCompare(b.start || "");
const biler = [{ id: "b1", navn: "Bil 1" }, { id: "b2", navn: "Bil 2" }, { id: "b3", navn: "Bil 3", lukket: true }];
const os = [o("1", { bilId: "b1", dato: I, start: "08:00", status: "afsluttet" }), o("2", { bilId: "b1", dato: I, start: "10:00", problem: { x: 1 } }), o("3", { bilId: "b1", dato: I, start: "12:00", varelinjer: [{ id: "l" }] }), o("4", { bilId: "b3", dato: I }), o("5", { bilId: "b1", dato: "2026-10-28" })];
const f = bilFremdrift({ orders: os, biler, dato: I, sammenlign: sm, erManglende: (_, l) => l.id === "l" });
eq("bilFremdrift", f.map((x) => [x.bil.id, x.total, x.faerdige, x.naeste.id, x.problemer, x.manglende]), [["b1", 3, 1, "2", 1, 1]]);
eq("ingen sager: ingen biler", bilFremdrift({ orders: [], biler, dato: I, sammenlign: sm }), []);

// plukFremdrift
const pl = [o("p", { bilId: "b1", dato: I, raekkefolge: 0 })];
const pts = [{ order: pl[0], lineItem: { id: "x", plukket: true } }, { order: pl[0], lineItem: { id: "y" } }];
eq("plukFremdrift", plukFremdrift({ orders: pl, points: pts, vehicles: biler, dato: I, sammenlign: sm, erManglende: () => false }).map((x) => [x.bil.id, x.linjer, x.plukket, x.manglende]), [["b1", 2, 1, 0]]);
eq("bil uden pluklinjer udelades", plukFremdrift({ orders: pl, points: [], vehicles: biler, dato: I, sammenlign: sm }), []);

// mineSager
const ms = mineSager({ orders: [o("a", { oprettetAf: { id: "u1" } }), o("b", { oprettetAf: { id: "u1" }, dato: "2026-11-03", bilId: "b1" }), o("c", { oprettetAf: { id: "u1" }, dato: "2026-10-30", bilId: "b1" }), o("d", { oprettetAf: { id: "u2" } }), o("e", { oprettetAf: { id: "u1" }, status: "afsluttet", dato: I, bilId: "b1" })], profilId: "u1", skalPlanlaegges: skal });
eq("mineSager", [ms.venter.map((x) => x.id), ms.planlagte.map((x) => x.id), ms.alle], [["a"], ["c", "b"], 3]);

// dagensTal
const t1 = dagensTal({ orders: os, idag: I, skalPlanlaegges: skal, kanPlan: false, kanLager: false });
eq("uden rettigheder: kun sager og afsluttet", t1.map((x) => x.id), ["sager", "faerdige"]);
const t2 = dagensTal({ orders: os, idag: I, skalPlanlaegges: skal, kanPlan: true, kanLager: true, pluk: { mangler: 4, kanIkkeFindes: 1 } });
eq("alle tal", t2.map((x) => [x.id, x.vaerdi]), [["sager", 4], ["faerdige", 1], ["planlaegges", 0], ["haster", 0], ["pluk", 4], ["findes-ikke", 1]]);
eq("kan ikke findes vises kun hvis >0", dagensTal({ orders: [], idag: I, skalPlanlaegges: skal, kanPlan: false, kanLager: true, pluk: { mangler: 0, kanIkkeFindes: 0 } }).map((x) => x.id), ["sager", "faerdige", "pluk"]);
// holdForBil
{ const pers = [{ id: "m1", navn: "Magnus", bilId: "b1", rolle: "montor" }, { id: "m2", navn: "Mette", bilId: "b1", rolle: "montor" }, { id: "h1", navn: "Hans", bilId: null, rolle: "medhjaelper" }, { id: "k", navn: "Kim", bilId: "b2", rolle: "montor" }];
  const er = (r) => r === "medhjaelper";
  const base = { bilId: "b1", dato: I, personnel: pers, erMedhjaelper: er };
  eq("faste montører, ingen 2. mand", holdForBil({ ...base, helpers: [] }), { montoerer: ["Magnus", "Mette"], andenMand: [], fravaer: 0 });
  eq("2. mand fra dagens hold", holdForBil({ ...base, helpers: [{ dato: I, vehicleId: "b1", personId: "h1" }] }).andenMand, ["Hans"]);
  eq("en montør fra en anden bil kan være 2. mand", holdForBil({ ...base, helpers: [{ dato: I, vehicleId: "b1", personId: "k" }] }).andenMand, ["Kim"]);
  eq("fast montør, der er 2. mand på en anden bil, er ikke montør her", holdForBil({ ...base, helpers: [{ dato: I, vehicleId: "b2", personId: "m2" }] }).montoerer, ["Magnus"]);
  eq("hold fra en anden dag tæller ikke", holdForBil({ ...base, helpers: [{ dato: "2026-10-28", vehicleId: "b1", personId: "h1" }] }).andenMand, []);
  eq("fraværende udelades og tælles", holdForBil({ ...base, helpers: [{ dato: I, vehicleId: "b1", personId: "h1" }], fraværende: (id) => id === "m1" || id === "h1" }), { montoerer: ["Mette"], andenMand: [], fravaer: 2 });
  eq("bil uden folk", holdForBil({ ...base, bilId: "bx", helpers: [] }), { montoerer: [], andenMand: [], fravaer: 0 });
  eq("bilnavn uden parentes", [bilNavnUdenHold("Bil 2 (Mette, Jens)"), bilNavnUdenHold("Bil3"), bilNavnUdenHold("(x)")], ["Bil 2", "Bil3", "(x)"]);
}
console.log(`forsideTal: ${pass} ok, ${fail} fejl`);
if (fail) process.exit(1);
