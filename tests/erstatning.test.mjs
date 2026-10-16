// Regressionstest til erstatning af manglende vare (src/data/erstatning.js).
// Kør med:  node tests/erstatning.test.mjs
import { avance, beregnKonsekvens, rangerAlternativer, normaliserVare, krMedFortegn } from "../src/data/erstatning.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

const O = { varenummer: "1", maerke: "Point", model: "POWM58MKA", udsalgspris: 5000, indkoebspris: 3000, lager: 0 };
const A = { varenummer: "2", maerke: "AEG", model: "LR744PX6P", udsalgspris: 6250, indkoebspris: 3500, lager: 2 };

// avance regnes på udsalgspris UDEN moms
eq("avance 5000 inkl. moms / 3000 indkøb", avance(5000, 3000), { kr: 1000, procent: 25 });
eq("avance mangler pris", avance(null, 3000), { kr: null, procent: null });
eq("avance mangler indkøb", avance(5000, undefined), { kr: null, procent: null });

const k = beregnKonsekvens(O, A);
eq("på lager", k.paaLager, true);
eq("udsalgsforskel", k.udsalgsForskel, 1250);
eq("indkøbsforskel", k.indkoebForskel, 500);
eq("behold kundepris: butikken tager forskellen", k.behold, { avanceKr: 500, avanceProcent: 12.5, avanceForskelKr: -500, kundePris: 5000 });
eq("fuld pris: kunden betaler forskellen", k.fuld, { avanceKr: 1500, avanceProcent: 30, avanceForskelKr: 500, kundeForskel: 1250, kundePris: 6250 });

// manglende tal giver null, aldrig NaN
const k2 = beregnKonsekvens({ ...O, indkoebspris: null }, A);
eq("manglende indkøb på original: avanceforskel ukendt", [k2.behold.avanceForskelKr, k2.fuld.avanceForskelKr], [null, null]);
eq("ugyldige data", beregnKonsekvens(null, A), null);
eq("tekst som pris", normaliserVare({ udsalgspris: "abc", lager: "x" }).udsalgspris, null);
eq("negativt lager klippes", normaliserVare({ lager: -3 }).lager, 0);
eq("ukendt lager er ikke 'på lager'", beregnKonsekvens(O, { ...A, lager: null }).paaLager, false);

// rangering: på lager først, så nærmest i pris; dubletter og originalen fjernes
const liste = [
  { varenummer: "3", model: "FAR", udsalgspris: 9000, lager: 1 },
  { varenummer: "4", model: "UDEN", udsalgspris: 5100, lager: 0 },
  { varenummer: "5", model: "NAER", udsalgspris: 5200, lager: 4 },
  { varenummer: "5", model: "NAER-DUBLET", udsalgspris: 5200, lager: 4 },
  { varenummer: "1", model: "POWM58MKA", udsalgspris: 5000, lager: 3 },
  null, "tekst", {},
];
eq("rangering", rangerAlternativer(O, liste).map((v) => v.varenummer), ["5", "3", "4"]);
eq("tom/ugyldig liste", rangerAlternativer(O, null), []);

eq("fortegn", [krMedFortegn(500), krMedFortegn(-500), krMedFortegn(0), krMedFortegn(null)], ["+500 kr", "−500 kr", "0 kr", "–"]);

console.log(`erstatning: ${pass} ok, ${fail} fejl`);
process.exit(fail ? 1 : 0);
