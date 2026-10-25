// Regressionstest til reglerne for træk og slip (src/lib/traekOgSlip.js).
// Kør med:  node tests/traekOgSlip.test.mjs
import { indsaetIndex, afledHandling, erGyldigtMaal, beskedEfterSlip } from "../src/lib/traekOgSlip.js";

let pass = 0, fail = 0;
const eq = (navn, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", navn, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

// --- indsætningssted
eq("over første kort: 0", indsaetIndex([100, 200, 300], 50), 0);
eq("mellem 1 og 2: 1", indsaetIndex([100, 200, 300], 150), 1);
eq("under sidste: n", indsaetIndex([100, 200, 300], 999), 3);
eq("tom zone: 0", indsaetIndex([], 10), 0);
eq("præcis på midtpunkt: før kortet", indsaetIndex([100], 100), 0);

const fra = (orderId, ids, rowId = "b1", day = "2026-10-26") => ({ orderId, rowId, day, ids });

// --- samme bil: ændre rækkefølgen
eq("ned: A,B,C -> A til slot 2 (mellem B og C)", afledHandling(fra("A", ["A", "B", "C"]), { rowId: "b1", day: "2026-10-26", index: 2 }), { type: "omraekker", rowId: "b1", day: "2026-10-26", ids: ["B", "A", "C"] });
eq("ned: A til slut", afledHandling(fra("A", ["A", "B", "C"]), { rowId: "b1", day: "2026-10-26", index: 3 }), { type: "omraekker", rowId: "b1", day: "2026-10-26", ids: ["B", "C", "A"] });
eq("op: C til først", afledHandling(fra("C", ["A", "B", "C"]), { rowId: "b1", day: "2026-10-26", index: 0 }), { type: "omraekker", rowId: "b1", day: "2026-10-26", ids: ["C", "A", "B"] });
eq("op: C til midten", afledHandling(fra("C", ["A", "B", "C"]), { rowId: "b1", day: "2026-10-26", index: 1 }), { type: "omraekker", rowId: "b1", day: "2026-10-26", ids: ["A", "C", "B"] });
eq("slip lige over sig selv: ingen ændring", afledHandling(fra("B", ["A", "B", "C"]), { rowId: "b1", day: "2026-10-26", index: 1 }), { type: "ingen" });
eq("slip lige under sig selv: ingen ændring", afledHandling(fra("B", ["A", "B", "C"]), { rowId: "b1", day: "2026-10-26", index: 2 }), { type: "ingen" });
eq("sidste til slut: ingen ændring", afledHandling(fra("C", ["A", "B", "C"]), { rowId: "b1", day: "2026-10-26", index: 3 }), { type: "ingen" });
eq("ingen sag mistes eller dubleres", [...afledHandling(fra("B", ["A", "B", "C", "D"]), { rowId: "b1", day: "2026-10-26", index: 4 }).ids].sort(), ["A", "B", "C", "D"]);
eq("index uden for intervallet klemmes", afledHandling(fra("A", ["A", "B"]), { rowId: "b1", day: "2026-10-26", index: 99 }).ids, ["B", "A"]);
eq("en sag alene: ingen ændring", afledHandling(fra("A", ["A"]), { rowId: "b1", day: "2026-10-26", index: 0 }), { type: "ingen" });
eq("sagen findes ikke i listen: ingen", afledHandling(fra("X", ["A", "B"]), { rowId: "b1", day: "2026-10-26", index: 0 }), { type: "ingen" });

// --- anden bil / ikke tildelt
eq("til anden bil samme dag: tildel", afledHandling(fra("A", ["A", "B"]), { rowId: "b2", day: "2026-10-26", index: 0 }), { type: "tildel", orderId: "A", vehicleId: "b2" });
eq("til 'Ikke tildelt': fjern bil", afledHandling(fra("A", ["A"]), { rowId: null, day: "2026-10-26", index: 0 }), { type: "tildel", orderId: "A", vehicleId: null });
eq("fra 'Ikke tildelt' til en bil: tildel", afledHandling(fra("A", ["A", "B"], null), { rowId: "b1", day: "2026-10-26", index: 1 }), { type: "tildel", orderId: "A", vehicleId: "b1" });
eq("'Ikke tildelt' til sig selv: ingen", afledHandling(fra("A", ["A", "B"], null), { rowId: null, day: "2026-10-26", index: 0 }), { type: "ingen" });
eq("tom streng som 'ikke tildelt' tæller som null", afledHandling(fra("A", ["A"], null), { rowId: "", day: "2026-10-26", index: 0 }), { type: "ingen" });

// --- anden dag: aldrig tilladt
eq("anden dag: ingen handling", afledHandling(fra("A", ["A", "B"]), { rowId: "b2", day: "2026-10-27", index: 0 }), { type: "ingen" });
eq("anden dag, samme bil: ingen handling", afledHandling(fra("A", ["A", "B"]), { rowId: "b1", day: "2026-10-27", index: 0 }), { type: "ingen" });
eq("uden for alle zoner: ingen", afledHandling(fra("A", ["A"]), null), { type: "ingen" });
eq("uden kilde: ingen", afledHandling(null, { rowId: "b1", day: "x", index: 0 }), { type: "ingen" });

// --- gyldigt mål og besked
eq("gyldigt mål: samme dag", erGyldigtMaal(fra("A", ["A"]), { rowId: "b2", day: "2026-10-26" }), true);
eq("ugyldigt mål: anden dag", erGyldigtMaal(fra("A", ["A"]), { rowId: "b1", day: "2026-10-27" }), false);
eq("ugyldigt mål: ingen zone", erGyldigtMaal(fra("A", ["A"]), null), false);
eq("besked: rækkefølge", beskedEfterSlip({ type: "omraekker" }, { kundeNavn: "Hansen" }), "Hansen er flyttet i rækkefølgen.");
eq("besked: ny bil", beskedEfterSlip({ type: "tildel", vehicleId: "b2" }, { kundeNavn: "Hansen", bilNavn: "Bil 2" }), "Hansen er flyttet til Bil 2.");
eq("besked: ikke tildelt", beskedEfterSlip({ type: "tildel", vehicleId: null }, { kundeNavn: "Hansen" }), "Hansen er ikke længere tildelt en bil.");
eq("besked: ingen handling giver ingen tekst", beskedEfterSlip({ type: "ingen" }), "");

console.log(`traekOgSlip: ${pass} ok, ${fail} fejl`);
if (fail) process.exit(1);
