// Test af lib/adresseKoordinater.js (skjulte adressekoordinater på sagen). Kør med: node tests/adresseKoordinater.test.mjs
import { gyldigeKoordinater, koordinaterForKunde, koordinaterTilSag, normaliserAdresse, erSammeHusnummer } from "../src/lib/adresseKoordinater.js";

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

// Tastet adresse med etage/dør = samme bygning som husnummer-forslaget
const hn = { type: "husnummer", vejnavn: "Mariane Thomsens Gade", husnummer: "39", titel: "Mariane Thomsens Gade 39, 8000 Aarhus C" };
eq("husnummer: med etage/dør og postnr", erSammeHusnummer("Mariane Thomsens Gade 39, 4. 1, 8000 Aarhus C", hn), true);
eq("husnummer: uden etage", erSammeHusnummer("mariane thomsens gade 39, 8000 aarhus c", hn), true);
eq("husnummer: kun vej og nummer", erSammeHusnummer("Mariane Thomsens Gade 39", hn), true);
eq("husnummer: andet husnummer matcher ikke", erSammeHusnummer("Mariane Thomsens Gade 3, 8000 Aarhus C", hn), false);
eq("husnummer: 39A er ikke 39", erSammeHusnummer("Mariane Thomsens Gade 39A, 8000 Aarhus C", hn), false);
eq("husnummer: andet postnummer matcher ikke", erSammeHusnummer("Mariane Thomsens Gade 39, 4. 1, 8200 Aarhus N", hn), false);
eq("husnummer: anden vej matcher ikke", erSammeHusnummer("Anden Vej 39, 8000 Aarhus C", hn), false);
eq("husnummer: mangler forslag", [erSammeHusnummer("x 1", null), erSammeHusnummer("x 1", { vejnavn: "x" })], [false, false]);

console.log(`${pass} bestået, ${fail} fejlet`);
if (fail) process.exit(1);

// ---- etage/dør-forslag (oktober 2026) ----
{
  const { etageDoerTokens, etageDoerForslag } = await import("../src/lib/adresseKoordinater.js");
  const hus = { vejnavn: "Mariane Thomsens Gade", husnummer: "39", titel: "Mariane Thomsens Gade 39, 8000 Aarhus C" };
  const adr = (t) => ({ type: "adresse", id: t, titel: t });
  const liste = [
    adr("Mariane Thomsens Gade 39, 4. 1, 8000 Aarhus C"), adr("Mariane Thomsens Gade 39, 4. 2, 8000 Aarhus C"),
    adr("Mariane Thomsens Gade 39, 10. 1, 8000 Aarhus C"), adr("Mariane Thomsens Gade 39, st. tv, 8000 Aarhus C"),
    adr("Mariane Thomsens Gade 39A, 4. 1, 8000 Aarhus C"), // anden bygning - skal ikke med
    { type: "husnummer", id: "x", titel: "Mariane Thomsens Gade 39, 8000 Aarhus C" },
  ];
  const tg = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) console.log("ok -", name); else { console.log("FAIL -", name, JSON.stringify(got)); process.exitCode = 1; } };
  tg("tokens: '4. sal' -> ['4']", etageDoerTokens("Mariane Thomsens Gade 39, 4. sal, 8000 Aarhus C", hus), ["4"]);
  tg("tokens: '4. 1' -> ['4','1']", etageDoerTokens("Mariane Thomsens Gade 39, 4. 1, 8000 Aarhus C", hus), ["4", "1"]);
  tg("tokens: ingen etage -> []", etageDoerTokens("Mariane Thomsens Gade 39, 8000 Aarhus C", hus), []);
  tg("tokens: andet husnummer -> []", etageDoerTokens("Mariane Thomsens Gade 39A, 4. 1, 8000", hus), []);
  tg("uden tastet etage: alle i bygningen, naturligt sorteret, uden 39A", etageDoerForslag("Mariane Thomsens Gade 39, 8000 Aarhus C", hus, liste).map((a) => a.titel.split(", ")[1]), ["st. tv", "4. 1", "4. 2", "10. 1"]);
  tg("tastet '4. sal' snævrer ind til etage 4", etageDoerForslag("Mariane Thomsens Gade 39, 4. sal, 8000 Aarhus C", hus, liste).map((a) => a.titel.split(", ")[1]), ["4. 1", "4. 2"]);
  tg("tastet etage uden match viser alle (ikke tomt)", etageDoerForslag("Mariane Thomsens Gade 39, 9, 8000 Aarhus C", hus, liste).length, 4);
}
