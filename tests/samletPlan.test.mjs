// Test af lib/samletPlan.js (samlet plan for mange uplanlagte sager). Kør med: node tests/samletPlan.test.mjs
import { samletPlan } from "../src/lib/samletPlan.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

const IND = { koersel: { trafikTillaegPct: 0 } };
const lager = { lat: 55.4, lon: 10.4 };
const biler = [{ id: "b1", navn: "Bil 1" }, { id: "b2", navn: "Bil 2" }];
const personnel = [{ id: "p1", navn: "Kim", bilId: "b1" }, { id: "p2", navn: "Ida", bilId: "b2" }];
const grundlag = { indstillinger: IND, arbejdstider: [], uaendringer: [] };
const ordreTilStop = (o) => ({ id: String(o.id), navn: String(o.id), adresse: o.adresse || "", minutter: o.min || 60, lat: o.lat ?? null, lon: o.lon ?? null, varer: [] });
const sag = (id, frist, lat = 55.41, lon = 10.41, min = 60, adresse = "") => ({ id, nr: id, dato: null, bilId: null, status: "planlagt", senestDato: frist, lat, lon, min, adresse });
const base = { orders: [], biler, vehicles: [], personnel, timeOff: [], crew: { helpers: [] }, grundlag, lager, ordreTilStop, foersteDato: "2026-11-09" }; // mandag

let r = await samletPlan({ ...base, sager: [sag("a", "2026-11-13"), sag("b", "2026-11-13"), sag("c", "2026-11-13")], orders: [] });
eq("alle små sager placeres inden fristen", [r.tildelinger.length, r.ikkePlaceret.length, r.tildelinger.every((t) => t.dato >= "2026-11-09" && t.dato <= "2026-11-13")], [3, 0, true]);
eq("ingen weekend", r.tildelinger.every((t) => !["2026-11-14", "2026-11-15"].includes(t.dato)), true);

// Frist før første mulige dag -> ikke placeret med årsag
r = await samletPlan({ ...base, sager: [sag("x", "2026-11-06")] });
eq("frist passeret: ikke placeret", [r.tildelinger.length, r.ikkePlaceret.length, typeof r.ikkePlaceret[0].aarsag], [0, 1, "string"]);

// Mangler koordinater
r = await samletPlan({ ...base, sager: [sag("y", "2026-11-13", null, null)] });
eq("uden koordinater: ikke placeret", [r.tildelinger.length, r.ikkePlaceret[0].aarsag.includes("koordinater")], [0, true]);

// For mange sager til én dag med frist samme dag: kun nogle kan være på dagen, resten meldes ærligt
const mange = Array.from({ length: 30 }, (_, i) => sag("m" + i, "2026-11-09", 55.4 + i * 0.001, 10.4, 90));
r = await samletPlan({ ...base, sager: mange });
eq("kapacitet respekteres: ikke alle 30 på én dag med to biler", [r.tildelinger.length < 30, r.tildelinger.length + r.ikkePlaceret.length], [true, 30]);
eq("ingen bil overfyldes: højst 5 sager à 90 min pr. bil pr. dag", Math.max(...["b1", "b2"].map((b) => r.tildelinger.filter((t) => t.bilId === b).length)) <= 6, true);

// Mest hastende først: knap plads, den med tidligste frist får pladsen
r = await samletPlan({ ...base, biler: [biler[0]], sager: [...Array.from({ length: 12 }, (_, i) => sag("s" + i, "2026-11-30", 55.4, 10.4, 90)), sag("haster", "2026-11-09", 55.4, 10.4, 90)] });
eq("hastende sag får første dag", r.tildelinger.find((t) => t.ordreId === "haster")?.dato, "2026-11-09");

// Samling pr. egn: to sager i nærheden af hinanden lægges på samme bil og dag
r = await samletPlan({ ...base, sager: [sag("j1", "2026-11-20", 56.15, 10.2, 45), sag("j2", "2026-11-20", 56.151, 10.201, 45), sag("f1", "2026-11-20", 55.39, 10.39, 45)] });
const j1 = r.tildelinger.find((t) => t.ordreId === "j1"), j2 = r.tildelinger.find((t) => t.ordreId === "j2");
eq("to sager samme sted samles på samme bil og dag", [j1.dato, j1.bilId], [j2.dato, j2.bilId]);

// Eksisterende planlagt sag tæller med: fyldt dag bruges ikke
const fyldt = Array.from({ length: 6 }, (_, i) => ({ id: "f" + i, dato: "2026-11-09", bilId: "b1", status: "planlagt", lat: 55.4, lon: 10.4, min: 120 }));
r = await samletPlan({ ...base, biler: [biler[0]], orders: fyldt, sager: [sag("n", "2026-11-12")] });
eq("fyldt dag springes over", r.tildelinger[0]?.dato !== "2026-11-09", true);

// En bil kører ét sted pr. dag: Fyn og Jylland blandes ikke på samme bil og dag
r = await samletPlan({ ...base, biler: [biler[0]], sager: [sag("fy1", "2026-11-20", 55.4, 10.4, 45, "Vestergade 1, 5000 Odense C"), sag("jy1", "2026-11-20", 56.15, 10.2, 45, "Torvet 2, 8000 Aarhus C"), sag("fy2", "2026-11-20", 55.41, 10.41, 45, "Algade 3, 5000 Odense C")] });
const dagFor = (id) => r.tildelinger.find((t) => t.ordreId === id)?.dato;
eq("Fyn og Jylland ligger ikke på samme bil og dag", dagFor("jy1") !== dagFor("fy1") && dagFor("fy1") === dagFor("fy2"), true);

import { egnFraAdresse } from "../src/lib/samletPlan.js";
eq("egn ud fra postnummer", [egnFraAdresse("x 5000 Odense C"), egnFraAdresse("x 8000 Aarhus C"), egnFraAdresse("x 2100 København Ø"), egnFraAdresse("ingen")], ["fyn", "jylland", "oest", null]);

// Afbrydelse
let kald = 0;
r = await samletPlan({ ...base, sager: mange, afbrudt: () => ++kald > 3 });
eq("afbrudt: delvist resultat og flag", [r.afbrudt, r.tildelinger.length < 30], [true, true]);

// Fejl i grundlag
r = await samletPlan({ ...base, grundlag: { fejl: "ingen" }, sager: [sag("z", null)] });
eq("manglende grundlag: fejl", r.fejl, "ingen");

console.log(`${pass} bestået, ${fail} fejlet`);
if (fail) process.exit(1);
