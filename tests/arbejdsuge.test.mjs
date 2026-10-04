// Regressionstest til arbejdsuge og forslagsvindue (src/lib/arbejdsuge.js).
// Kør med:  node tests/arbejdsuge.test.mjs
import { plusDage, erWeekend, foersteArbejdsdagFra, ugeFor, forslagsVindue } from "../src/lib/arbejdsuge.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

// 2026: 2. okt = fredag, 3. okt = lørdag, 4. okt = søndag, 5. okt = mandag
eq("plusDage over månedsskifte", plusDage("2026-10-31", 1), "2026-11-01");
eq("plusDage over årsskifte", plusDage("2026-12-31", 1), "2027-01-01");
eq("plusDage baglæns", plusDage("2026-10-05", -1), "2026-10-04");
eq("plusDage over sommertid-skifte (25. okt 2026)", plusDage("2026-10-24", 2), "2026-10-26");
eq("weekend", [erWeekend("2026-10-02"), erWeekend("2026-10-03"), erWeekend("2026-10-04"), erWeekend("2026-10-05")], [false, true, true, false]);
eq("tom dato er ikke weekend", [erWeekend(""), erWeekend(null)], [false, false]);

// --- LØRDAG/SØNDAG: næste uge
eq("fredag er stadig fredag", foersteArbejdsdagFra("2026-10-02"), "2026-10-02");
eq("LØRDAG giver mandag i næste uge", foersteArbejdsdagFra("2026-10-03"), "2026-10-05");
eq("SØNDAG giver mandag i næste uge", foersteArbejdsdagFra("2026-10-04"), "2026-10-05");
eq("mandag er mandag", foersteArbejdsdagFra("2026-10-05"), "2026-10-05");
eq("lørdag over årsskifte (2. jan 2027)", foersteArbejdsdagFra("2027-01-02"), "2027-01-04");

// --- ugen
eq("uge for en onsdag: mandag-søndag", ugeFor("2026-10-07"), ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
eq("uge for en søndag hører til ugen før", ugeFor("2026-10-04")[0], "2026-09-28");
eq("uge for lørdagens mandag er næste uge", ugeFor(foersteArbejdsdagFra("2026-10-03"))[0], "2026-10-05");
eq("en uge har altid 7 dage", ugeFor("2026-03-29").length, 7); // sommertid-skiftet
eq("ugen over sommertid er sammenhængende", ugeFor("2026-03-29"), ["2026-03-23", "2026-03-24", "2026-03-25", "2026-03-26", "2026-03-27", "2026-03-28", "2026-03-29"]);

// --- forslagsvindue
const v = forslagsVindue({ idag: "2026-10-07", valgtDato: "2026-10-07" });
eq("vinduet er 21 sammenhængende dage fra i dag", [v.length, v[0], v[20]], [21, "2026-10-07", "2026-10-27"]);
eq("vinduet rækker ud over den nuværende uge (til og med uge 3)", v.includes("2026-10-12") && v.includes("2026-10-19") && v.includes("2026-10-26"), true);
const lor = forslagsVindue({ idag: "2026-10-03", valgtDato: "2026-10-03" });
eq("om LØRDAGEN starter vinduet mandag", [lor[0], lor.length], ["2026-10-05", 21]);
eq("om søndagen starter vinduet mandag", forslagsVindue({ idag: "2026-10-04", valgtDato: "2026-10-04" })[0], "2026-10-05");
eq("en valgt dato i nær fremtid ændrer ikke start", forslagsVindue({ idag: "2026-10-07", valgtDato: "2026-10-14" })[0], "2026-10-07");
eq("en valgt dato præcis 14 dage frem ændrer ikke start", forslagsVindue({ idag: "2026-10-07", valgtDato: "2026-10-21" })[0], "2026-10-07");
eq("en valgt dato langt ude i fremtiden: vinduet følger den", forslagsVindue({ idag: "2026-10-07", valgtDato: "2026-12-01" })[0], "2026-12-01");
eq("en valgt weekenddato langt ude: starter næste mandag", forslagsVindue({ idag: "2026-10-07", valgtDato: "2026-12-05" })[0], "2026-12-07");
eq("en valgt dato i fortiden ændrer ikke start", forslagsVindue({ idag: "2026-10-07", valgtDato: "2026-09-01" })[0], "2026-10-07");
eq("ingen valgt dato", forslagsVindue({ idag: "2026-10-07" })[0], "2026-10-07");
eq("antal dage kan vælges", forslagsVindue({ idag: "2026-10-07", dage: 5 }).length, 5);
eq("vinduet har ingen huller eller dubletter", new Set(v).size === 21 && v.every((d, i) => i === 0 || d === plusDage(v[i - 1], 1)), true);

console.log(`\n${pass} bestået, ${fail} fejlet`);
process.exit(fail ? 1 : 0);
