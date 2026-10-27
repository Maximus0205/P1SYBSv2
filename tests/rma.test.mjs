// Kør med: node tests/rma.test.mjs
import { RMA_STATUSSER, rmaStatusLabel, rmaLinjer, naesteRmaNr, lavRma, rettRma, skiftRmaStatus, rmaLabel, rmaLabelsTilSager } from "../src/lib/rma.js";
let pass = 0, fail = 0;
const eq = (n, g, w) => { if (JSON.stringify(g) === JSON.stringify(w)) pass++; else { fail++; console.log("FAIL:", n, "\n  got: ", JSON.stringify(g), "\n  want:", JSON.stringify(w)); } };
const T = "2026-10-27T10:00:00.000Z";
const o = { id: "abc-123456", nr: "26-223", kunde: { navn: "Erik Hansen" }, varelinjer: [{ id: "l1" }, { id: "l2" }] };

eq("første nummer", naesteRmaNr(o), "RMA-26-223-1");
eq("uden sagsnr: ud fra id", naesteRmaNr({ id: "abc-123456", varelinjer: [] }), "RMA-123456-1");
const m1 = lavRma(o, { aarsag: "  Støjer  ", serienr: "SN 99", note: "" }, T, { id: "u1", navn: "Magnus" });
eq("ny rma", [m1.nr, m1.aarsag, m1.serienr, m1.status, m1.historik.length], ["RMA-26-223-1", "Støjer", "SN 99", "oprettet", 1]);
const med = { ...o, varelinjer: [{ id: "l1", rma: m1 }, { id: "l2" }] };
eq("næste nummer tæller op", naesteRmaNr(med), "RMA-26-223-2");
eq("nummer genbruges ikke, selv om en linje er fjernet", naesteRmaNr({ ...o, varelinjer: [{ id: "l1", rma: { nr: "RMA-26-223-3" } }] }), "RMA-26-223-4");
eq("fremmed nummer ignoreres", naesteRmaNr({ ...o, varelinjer: [{ id: "l1", rma: { nr: "RMA-99-1-7" } }] }), "RMA-26-223-1");
eq("rmaLinjer", rmaLinjer(med).map((l) => l.id), ["l1"]);

// felter renses og begrænses
eq("lange felter klippes", [lavRma(o, { aarsag: "x".repeat(500) }, T).aarsag.length, lavRma(o, { serienr: "y".repeat(500) }, T).serienr.length], [120, 40]);
eq("rettRma bevarer nr og status", (() => { const r = rettRma(m1, { aarsag: "Lækker" }); return [r.nr, r.status, r.aarsag, r.serienr]; })(), ["RMA-26-223-1", "oprettet", "Lækker", "SN 99"]);

// status
const m2 = skiftRmaStatus(m1, "afhentet", "2026-10-28T08:00:00.000Z", { id: "u2", navn: "Kim" });
eq("status skifter og logges", [m2.status, m2.historik.map((h) => h.status), m2.historik[1].af.navn], ["afhentet", ["oprettet", "afhentet"], "Kim"]);
eq("samme status igen ændrer intet", skiftRmaStatus(m2, "afhentet", T, null) === m2, true);
eq("ukendt status afvises", skiftRmaStatus(m1, "tjekket", T, null), null);
eq("originalen er uændret", m1.status, "oprettet");
eq("statusser og labels", [RMA_STATUSSER.length, rmaStatusLabel("sendt"), rmaStatusLabel("x")], [5, "Sendt til leverandør", "x"]);

// labels
const linje = { id: "l1", rma: { ...m1, serienr: "SN 99" } };
const lab = rmaLabel({ order: o, linje, butik: "Bjerg Iversen", varenavn: () => "Køleskab – Bosch KGN" });
eq("label-indhold", lab, { nr: "RMA-26-223-1", kunde: "Erik Hansen", sag: "#26-223", vare: "Køleskab – Bosch KGN", serienr: "SN 99", aarsag: "Støjer", butik: "Bjerg Iversen", dato: "2026-10-27" });
const sager = [med, { ...o, id: "b", nr: "26-224", varelinjer: [{ id: "x", rma: { ...m1, nr: "RMA-26-224-1", status: "afsluttet" } }, { id: "y", rma: { ...m1, nr: "RMA-26-224-2" } }] }];
eq("labels til sager: afsluttede springes over", rmaLabelsTilSager({ orders: sager, butik: "B", varenavn: () => "V" }).map((l) => l.nr), ["RMA-26-223-1", "RMA-26-224-2"]);
eq("kopier 2 og begrænses til 4", [rmaLabelsTilSager({ orders: sager, kopier: 2 }).length, rmaLabelsTilSager({ orders: sager, kopier: 9 }).length, rmaLabelsTilSager({ orders: sager, kopier: 0 }).length], [4, 8, 2]);
eq("ingen sager", rmaLabelsTilSager({ orders: [] }), []);
console.log(`rma: ${pass} ok, ${fail} fejl`);
if (fail) process.exit(1);
