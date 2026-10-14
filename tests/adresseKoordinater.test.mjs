// Test af lib/adresseKoordinater.js (skjulte adressekoordinater på sagen). Kør med: node tests/adresseKoordinater.test.mjs
import { gyldigeKoordinater, koordinaterForKunde, koordinaterTilSag, normaliserAdresse } from "../src/lib/adresseKoordinater.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};
const k = { lat: 55.4, lon: 10.4, adresseId: "x", type: "adresse", tekst: "Vej 1, 5000 Odense C" };

eq("normaliser: små bogstaver og mellemrum", normaliserAdresse("  Vej  1,  5000 Odense C "), "vej 1, 5000 odense c");
eq("gyldig: samme tekst (uanset store bogstaver/mellemrum)", gyldigeKoordinater(k, " vej 1,  5000 odense c"), { lat: 55.4, lon: 10.4 });
eq("forældet: adressen er rettet siden valget", gyldigeKoordinater(k, "Vej 2, 5000 Odense C"), null);
eq("ugyldig: uden for Danmark", gyldigeKoordinater({ ...k, lat: 0, lon: 0 }, k.tekst), null);
eq("ugyldig: ikke tal", gyldigeKoordinater({ ...k, lat: "abc" }, k.tekst), null);
eq("ugyldig: mangler helt", [gyldigeKoordinater(null, "x"), gyldigeKoordinater(undefined, "x"), koordinaterForKunde(null)], [null, null, null]);
eq("kunde: bruger gemte koordinater", koordinaterForKunde({ adresse: k.tekst, adresseKoordinater: k }), { lat: 55.4, lon: 10.4 });
eq("kunde: gamle sager uden koordinater", koordinaterForKunde({ adresse: k.tekst }), null);
eq("til sag: gemmer felterne", koordinaterTilSag(k, "Vej 1, 5000 Odense C"), { lat: 55.4, lon: 10.4, adresseId: "x", type: "adresse", tekst: "Vej 1, 5000 Odense C" });
eq("til sag: udelader forældede koordinater", koordinaterTilSag(k, "Anden vej 9"), undefined);

console.log(`${pass} bestået, ${fail} fejlet`);
if (fail) process.exit(1);
