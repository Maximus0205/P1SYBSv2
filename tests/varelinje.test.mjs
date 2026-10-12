// Regressionstest til modelnummer-reglerne (src/lib/varelinje.js).
// Kør med:  node tests/varelinje.test.mjs
import { manglerModel, linjerUdenModel, erVarenummer, modelNoegle } from "../src/lib/varelinje.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};
const L = (model, extra = {}) => ({ model, ...extra });

// --- krav ved booking: der skal stå et modelnummer
eq("tomt modelfelt mangler", manglerModel(L("")), true);
eq("kun mellemrum mangler", manglerModel(L("   ")), true);
eq("uden modelfelt mangler", [manglerModel({}), manglerModel(null), manglerModel(undefined)], [true, true, true]);
eq("et modelnummer mangler ikke", manglerModel(L("PODW5620W")), false);
eq("varetypen 'andet' fritager ikke (kravet gælder alle linjer)", manglerModel(L("", { varetypeId: "andet", varetypeTekst: "Diverse" })), true);
eq("linjer uden model udpeges", linjerUdenModel([L("A1"), L(""), L("  "), L("B2")]).length, 2);
eq("ikke en liste", [linjerUdenModel(null), linjerUdenModel(undefined), linjerUdenModel("x")], [[], [], []]);

// --- ligner det et modelnummer?
for (const m of ["PODW5620W", "POWM58MKA", "Wq1000", "RI177ASD", "SECR18055EWN", "WWG888", "TR844P85P", "WWG 888", " podw5620w "]) {
  eq(`modelnummer: ${m}`, erVarenummer(L(m)), true);
}
eq("fritekst fra butikken tælles ikke", erVarenummer(L("Mål op til vinkøleskab og emhætte, husk at tjekke tilslutning og aftræk")), false);
eq("ét ord uden ciffer er ikke et modelnummer", erVarenummer(L("Diverse")), false);
eq("en sætning uden komma og uden ciffer", erVarenummer(L("husk nøglen")), false);
eq("en sætning MED ciffer men mange ord", erVarenummer(L("mål op 2 skabe til emhætte")), false);
eq("komma = fritekst, selv med ciffer", erVarenummer(L("PODW5620W, husk 2 mand")), false);
eq("over 40 tegn = fritekst", erVarenummer(L("A1".repeat(21))), false);
eq("tomt / mangler", [erVarenummer(L("")), erVarenummer({}), erVarenummer(null)], [false, false, false]);
eq("vare uden for sortimentet MED modelnummer tælles, uanset varetype og uden Punkt1-id", erVarenummer(L("MW123X", { varetypeId: "andet", varetypeTekst: "Mikroovn" })), true);
eq("Punkt1-id er ligegyldigt", [erVarenummer(L("PODW5620W", { punkt1Id: "4230288" })), erVarenummer(L("PODW5620W"))], [true, true]);

// --- samme model, flere stavemåder
eq("samme model = samme nøgle", new Set([" podw5620w", "PODW5620W", "PODW5620W  "].map((m) => modelNoegle(L(m)))).size, 1);
eq("mellemrum i midten samles", modelNoegle(L("WWG   888")), "wwg 888");

console.log(`${pass} bestået, ${fail} fejlet`);
if (fail > 0) process.exit(1);
