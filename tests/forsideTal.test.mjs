// Kør med: node tests/forsideTal.test.mjs
import { haster, bilFremdrift, plukFremdrift, dagensTal, ugenForan, afsluttetPrDag, rmaOversigt, holdForBil, bilNavnUdenHold } from "../src/lib/forsideTal.js";
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

// dagensTal (en kasse for dagens fremdrift - ikke to med samme tal)
const t1 = dagensTal({ orders: os, idag: I, imorgen: "2026-10-28", skalPlanlaegges: skal, kanPlan: false });
eq("uden rettigheder: fremdrift og i morgen", t1.map((x) => x.id), ["i-dag", "i-morgen"]);
eq("i dag: x af y", [t1[0].vaerdi, t1[0].af], [1, 4]);
const t2 = dagensTal({ orders: [...os, o("u1", { senestDato: "2026-10-29" }), o("u2")], idag: I, imorgen: "2026-10-28", skalPlanlaegges: skal, kanPlan: true });
eq("planlæggere ser skal planlægges med haster som underlinje", t2.map((x) => [x.id, x.vaerdi, x.under || null]), [["i-dag", 1, null], ["i-morgen", 1, null], ["planlaegges", 2, "heraf 1 haster"]]);
eq("haster skjules, når Haster-kassen vises", dagensTal({ orders: [o("u1", { senestDato: "2026-10-29" })], idag: I, skalPlanlaegges: skal, kanPlan: true, skjulHaster: true }).find((x) => x.id === "planlaegges").under, null);
eq("ingen i morgen uden dato", dagensTal({ orders: [], idag: I, skalPlanlaegges: skal, kanPlan: false }).map((x) => x.id), ["i-dag"]);

// ugenForan
const uv = ugenForan({ orders: [o("a", { dato: I }), o("b", { dato: I }), o("c", { dato: "2026-10-29" }), o("d", { dato: "2026-12-01" })], vehicles: [{ id: "b1" }, { id: "b2" }, { id: "b3", lukket: true }], idag: I, minutter: () => 240 });
eq("ugenForan: 7 dage, tæller og belægning", [uv.length, uv[0].dato, uv[0].antal, uv[0].minutter, uv[0].kapacitet, uv[0].pct, uv[2].antal, uv[1].pct], [7, I, 2, 480, 960, 50, 1, 0]);
eq("ugenForan: ingen åbne biler giver ingen procent", ugenForan({ orders: [], vehicles: [], idag: I, minutter: () => 1 })[0].pct, null);
eq("ugenForan: månedsskifte", ugenForan({ orders: [], vehicles: [], idag: "2026-10-30" }).map((x) => x.dato).slice(0, 4), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);

// afsluttetPrDag
const midt = (d) => `${d}T12:00:00`;
const tp = afsluttetPrDag({ orders: [o("a", { status: "afsluttet", afsluttetTidspunkt: midt(I) }), o("b", { status: "afsluttet", afsluttetTidspunkt: midt(I) }), o("c", { status: "afsluttet", afsluttetTidspunkt: midt("2026-10-25") }), o("d", { status: "afsluttet", afsluttetTidspunkt: midt("2026-10-18") }), o("e", { status: "afsluttet" }), o("f", { afsluttetTidspunkt: midt(I) })], idag: I });
eq("tempo: 7 dage, i dag sidst", [tp.dage.length, tp.dage[6].dato, tp.dage[6].antal, tp.dage[4].antal, tp.samlet, tp.foer], [7, I, 2, 1, 3, 1]);

// rmaOversigt
const r = (id, status, oprettet) => ({ id, rma: { nr: `RMA-${id}`, status, oprettet } });
const ro = rmaOversigt([o("x", { varelinjer: [r("1", "oprettet", "2026-10-20"), { id: "ingen" }, r("2", "afsluttet", "2026-10-01")] }), o("y", { varelinjer: [r("3", "hentet", "2026-10-10")] })]);
eq("rmaOversigt: åbne, ældste først, pr. status", [ro.antal, ro.liste.map((x) => x.rma.nr), ro.prStatus], [2, ["RMA-3", "RMA-1"], { hentet: 1, oprettet: 1 }]);
eq("rmaOversigt: tom", rmaOversigt([]).antal, 0);

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
