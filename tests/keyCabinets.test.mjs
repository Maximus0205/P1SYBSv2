// Regressionstest til nøgleskab-matchningen (src/data/keyCabinets.js).
// Kør med:  node tests/keyCabinets.test.mjs
// Ingen afhængigheder - ren Node. Afslutter med fejlkode, hvis noget fejler.
import { findKeyCabinets, parseAddress, parseCoverage, cabinetMapsQuery, parsePostalCode } from "../src/data/keyCabinets.js";

let fail = 0, pass = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};
const level = (addr, omraade) => {
  const r = findKeyCabinets(addr, [{ id: "x", navn: "T", omraade, skabPlacering: "Jacob Hansens vej 18H" }]);
  return r.length ? r[0].niveau : null;
};

// --- Det oprindelige eksempel fra de laminerede ark
const BOSERA = "Parkvej 1-7 & 8-26 samt Odensevej 9A-F";
eq("Parkvej 5 m. etage/by", level("Parkvej 5, 2. th, 5000 Odense C", BOSERA), "sikker");
eq("Parkvej 1 (nedre grænse)", level("Parkvej 1, 5000 Odense C", BOSERA), "sikker");
eq("Parkvej 7 (øvre i 1-7)", level("Parkvej 7", BOSERA), "sikker");
eq("Parkvej 8 (nedre i 8-26)", level("Parkvej 8", BOSERA), "sikker");
eq("Parkvej 26", level("Parkvej 26", BOSERA), "sikker");
eq("Parkvej 27 udenfor", level("Parkvej 27", BOSERA), null);
eq("Parkvej 40 udenfor", level("Parkvej 40, 5000 Odense C", BOSERA), null);
eq("Parkvej 8B (bogstav i interval)", level("Parkvej 8B", BOSERA), "sikker");
eq("Parkvej 5 A (bogstav for sig)", level("Parkvej 5 A, 1. tv", BOSERA), "sikker");
eq("små bogstaver", level("parkvej 5", BOSERA), "sikker");
eq("Odensevej 9A", level("Odensevej 9A", BOSERA), "sikker");
eq("Odensevej 9C, 1. tv", level("Odensevej 9C, 1. tv, 5000 Odense C", BOSERA), "sikker");
eq("Odensevej 9F (øvre bogstav)", level("Odensevej 9F", BOSERA), "sikker");
eq("Odensevej 9G udenfor bogstaver", level("Odensevej 9G", BOSERA), null);
eq("Odensevej 9 uden bogstav = mulig", level("Odensevej 9, st. th", BOSERA), "mulig");
eq("Odensevej 11 udenfor", level("Odensevej 11", BOSERA), null);
eq("anden vej", level("Storegade 3", BOSERA), null);
eq("kun vejnavn = mulig", level("Parkvej", BOSERA), "mulig");

// --- Andre skrivemåder
eq("lige: 4 ok", level("Parkvej 4", "Parkvej 2-20 lige"), "sikker");
eq("lige: 5 nej", level("Parkvej 5", "Parkvej 2-20 lige"), null);
eq("ulige: 5 ok", level("Parkvej 5", "Parkvej 1-19 ulige"), "sikker");
eq("ulige: 6 nej", level("Parkvej 6", "Parkvej 1-19 ulige"), null);
eq("enkelte numre 5", level("Parkvej 5", "Parkvej 1, 3, 5 og 7"), "sikker");
eq("enkelte numre 6", level("Parkvej 6", "Parkvej 1, 3, 5 og 7"), null);
eq("til", level("Parkvej 4", "Parkvej 1 til 7"), "sikker");
eq("t/m", level("Parkvej 7", "Parkvej 1 t/m 7"), "sikker");
eq("t.o.m.", level("Parkvej 7", "Parkvej 1 t.o.m. 7"), "sikker");
eq("bindestreg med mellemrum", level("Parkvej 4", "Parkvej 1 - 7"), "sikker");
eq("en-dash", level("Parkvej 4", "Parkvej 1–7"), "sikker");
eq("9A-9F", level("Odensevej 9D", "Odensevej 9A-9F"), "sikker");
eq("hele vejen", level("Nørrebrogade 88", "Nørrebrogade hele vejen"), "sikker");
eq("blot vejnavn i område = mulig", level("Kastanjevej 3", "Kastanjevej"), "mulig");
eq("æøå-vej", level("Nørregade 6, 2. th", "Nørregade 4-10"), "sikker");
eq("allé/alle", level("Kastanjealle 5", "Kastanjeallé 3-9"), "sikker");
eq("H.C. Andersens Vej", level("H.C. Andersens Vej 12", "HC Andersens Vej 10-14"), "sikker");
eq("semikolon+slash", level("Odensevej 9B", "Parkvej 1-7; Odensevej 9A-F"), "sikker");
eq("slash mellem veje = mulig", level("Parkvej 99", "Parkvej/Odensevej"), "mulig");
eq("ukendt tekst uden vej", level("Parkvej 5", "Hele afdeling fem"), null);
eq("tekst nævner vejen uden tal, adressen har tal", level("Parkvej 5", "Alle beboere på Parkvej"), "mulig");
eq("tom adresse", findKeyCabinets("", [{ omraade: "Parkvej 1-7" }]), []);
eq("ingen skabe", findKeyCabinets("Parkvej 5", []), []);

// --- Sortering: sikker før mulig
const both = findKeyCabinets("Parkvej 5", [
  { id: "a", navn: "Mulig", omraade: "Parkvej" },
  { id: "b", navn: "Sikker", omraade: "Parkvej 1-9" },
]);
eq("sikker først", both.map((r) => r.cabinet.id + ":" + r.niveau), ["b:sikker", "a:mulig"]);

// --- parseAddress
eq("parse: etage ikke husnr", parseAddress("Parkvej 5, 3. th, 5000 Odense C"), { street: "parkvej", number: 5, letter: "" });
eq("parse: bogstav klistret", parseAddress("Odensevej 9b, 2. tv"), { street: "odensevej", number: 9, letter: "b" });
eq("parse: st th er ikke bogstav", parseAddress("Parkvej 5 st th"), { street: "parkvej", number: 5, letter: "" });
eq("parse: flere ord i vej", parseAddress("H C Andersens Vej 12"), { street: "h c andersens vej", number: 12, letter: "" });
eq("parse: kun vej", parseAddress("Parkvej"), null);

// --- Maps-søgning
eq("maps: placering + by", cabinetMapsQuery({ skabPlacering: "Ved ejendomsmesterkontor, Jacob Hansens vej 18H" }, "Parkvej 5, 2. th, 5000 Odense C"), "Jacob Hansens vej 18H, 5000 Odense C");
eq("maps: uden by", cabinetMapsQuery({ skabPlacering: "Jacob Hansens vej 18H" }, "Parkvej 5"), "Jacob Hansens vej 18H");
eq("maps: uden tal i placering", cabinetMapsQuery({ skabPlacering: "Ved vaskeriet" }, "Parkvej 5, 5000 Odense C"), "Ved vaskeriet, 5000 Odense C");

// --- Robusthed: ingen exceptions på skæve input
for (const junk of [null, undefined, "", "   ", "1-", "-7", "&&&", ";;;", "9A-", "abc", "12345", "æøå 1", "Parkvej 1--7", "Parkvej 7-1"]) {
  try { parseCoverage(junk); parseAddress(junk); findKeyCabinets(junk || "x 1", [{ omraade: junk }]); pass++; }
  catch (e) { fail++; console.log("THROW on", JSON.stringify(junk), e.message); }
}
eq("omvendt interval 7-1", level("Parkvej 4", "Parkvej 7-1"), "sikker");

// --- Postnummer-adskillelse (september 2026)
eq("postnr: udtrukket", parsePostalCode("Parkvej 5, 2. th, 5000 Odense C"), "5000");
eq("postnr: intet", parsePostalCode("Parkvej 5"), null);
eq("postnr: husnr forveksles ikke", parsePostalCode("Parkvej 5000"), "5000");

const cabWithPostal = (postnummer) => [{ id: "x", navn: "T", omraade: "Parkvej 1-9", postnummer, skabPlacering: "Jacob Hansens vej 18H" }];
eq("postnr match -> sikker", findKeyCabinets("Parkvej 5, 5000 Odense C", cabWithPostal("5000")).map((r) => r.niveau), ["sikker"]);
eq("postnr mismatch -> intet, selvom vej+nr matcher", findKeyCabinets("Parkvej 5, 8000 Aarhus C", cabWithPostal("5000")), []);
eq("skab uden postnr -> matcher stadig", findKeyCabinets("Parkvej 5, 8000 Aarhus C", cabWithPostal(null)).map((r) => r.niveau), ["sikker"]);
eq("adresse uden postnr -> matcher stadig", findKeyCabinets("Parkvej 5", cabWithPostal("5000")).map((r) => r.niveau), ["sikker"]);
eq("postnr mismatch afviser også 'mulig'", findKeyCabinets("Parkvej, 8000 Aarhus C", cabWithPostal("5000")), []);

console.log(`\n${pass} bestået, ${fail} fejlet`);
process.exit(fail ? 1 : 0);
