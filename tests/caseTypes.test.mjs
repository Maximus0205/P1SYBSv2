// Regressionstest til sagstyperne (src/data/caseTypes.js): kundesag, tomgang, servicetur og specialtur.
// Kør med:  node tests/caseTypes.test.mjs
// domain.js importerer lucide-react (ikke tilgængelig i ren node). orderExpectedMinutes i domain.js bruger
// specialMinutter herfra, og det er den, der testes her.
import {
  SAGSTYPE_KUNDE, SAGSTYPE_TOMGANG, SAGSTYPE_SERVICETUR, SAGSTYPE_SPECIALTUR,
  CASE_TYPES, caseType, isTomgang, isServicetur, isSpecialtur, caseTypeLabel, caseTypeColor,
  kraeverModelnummer, specialMinutter, specialturFejl, showsArrivalContact, tomgangWarnings,
  KUNDE_COLOR, SPECIAL_MAKS_MINUTTER,
} from "../src/data/caseTypes.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

// --- de fire typer og deres rækkefølge i vælgeren
eq("fire sagstyper i vælgeren, i rækkefølge", CASE_TYPES.map((t) => t.id), ["kunde", "tomgang", "servicetur", "specialtur"]);
eq("hver type har tekst og farve", CASE_TYPES.every((t) => t.label && t.kort && t.beskrivelse && /^#[0-9A-F]{6}$/i.test(t.farve)), true);
eq("typerne har hver sin farve", new Set(CASE_TYPES.map((t) => t.farve)).size, 4);
eq("reklamation er ikke en sagstype (den er en opfølgning)", CASE_TYPES.some((t) => t.id === "reklamation"), false);

// --- genkendelse, og ældre sager uden sagstype
eq("sag uden sagstype er en kundesag", caseType({}), SAGSTYPE_KUNDE);
eq("null/undefined er en kundesag", [caseType(null), caseType(undefined)], [SAGSTYPE_KUNDE, SAGSTYPE_KUNDE]);
eq("isTomgang", [isTomgang({ sagstype: "tomgang" }), isTomgang({ sagstype: "servicetur" }), isTomgang({})], [true, false, false]);
eq("isServicetur", [isServicetur({ sagstype: "servicetur" }), isServicetur({ sagstype: "specialtur" }), isServicetur({})], [true, false, false]);
eq("isSpecialtur", [isSpecialtur({ sagstype: "specialtur" }), isSpecialtur({ sagstype: "kunde" }), isSpecialtur({})], [true, false, false]);
eq("kort navn pr. type", ["kunde", "tomgang", "servicetur", "specialtur"].map((s) => caseTypeLabel({ sagstype: s })), ["Kunde", "Tomgang", "Servicetur", "Specialtur"]);
eq("ukendt type vises som kunde i teksten", caseTypeLabel({ sagstype: "findesikke" }), "Kunde");
eq("ukendt type får kundens farve", caseTypeColor({ sagstype: "findesikke" }), KUNDE_COLOR);
eq("farve følger typen", caseTypeColor({ sagstype: SAGSTYPE_SERVICETUR }), CASE_TYPES[2].farve);

// --- modelnummer: kun servicetur slipper
eq("modelnummer kræves på kundesag, tomgang og specialtur", [SAGSTYPE_KUNDE, SAGSTYPE_TOMGANG, SAGSTYPE_SPECIALTUR].map((s) => kraeverModelnummer({ sagstype: s })), [true, true, true]);
eq("modelnummer kræves ikke på servicetur", kraeverModelnummer({ sagstype: SAGSTYPE_SERVICETUR }), false);
eq("modelnummer kræves på sag uden type (ældre sager)", kraeverModelnummer({}), true);

// --- kontakt ved ankomst og nøgle-advarsler er uændrede for de andre typer
eq("ankomstkontakt: ikke ved tomgang, ellers ja", [SAGSTYPE_KUNDE, SAGSTYPE_TOMGANG, SAGSTYPE_SERVICETUR, SAGSTYPE_SPECIALTUR].map((s) => showsArrivalContact({ sagstype: s })), [true, false, true, true]);
eq("nøgle-advarsel kun ved tomgang", [tomgangWarnings({ sagstype: "servicetur" }), tomgangWarnings({ sagstype: "specialtur" }), tomgangWarnings({ sagstype: "tomgang" }).length], [[], [], 1]);

// --- specialMinutter: manuel tid for hele turen
eq("specialtur med tid", specialMinutter({ sagstype: "specialtur", manuelTid: 150 }), 150);
eq("tid som tekst fra formularen", specialMinutter({ sagstype: "specialtur", manuelTid: "90" }), 90);
eq("tid rundes til hele minutter", specialMinutter({ sagstype: "specialtur", manuelTid: 89.6 }), 90);
eq("tom/0/negativ/ikke et tal giver null (falder tilbage på varelinjerne)", [null, undefined, "", 0, "0", -5, "abc", NaN].map((t) => specialMinutter({ sagstype: "specialtur", manuelTid: t })), [null, null, null, null, null, null, null, null]);
eq("andre typer bruger aldrig manuel tid, selv hvis feltet findes", ["kunde", "tomgang", "servicetur"].map((s) => specialMinutter({ sagstype: s, manuelTid: 120 })), [null, null, null]);
eq("sag uden type bruger ikke manuel tid", specialMinutter({ manuelTid: 120 }), null);
eq("null-sag giver null", specialMinutter(null), null);

// --- specialturFejl: krav ved oprettelse og redigering
const ok = { sagstype: "specialtur", specialBeskrivelse: "Lofthængt emhætte", manuelTid: "120" };
eq("udfyldt specialtur har ingen fejl", specialturFejl(ok), []);
eq("andre typer har aldrig specialtur-fejl", ["kunde", "tomgang", "servicetur"].map((s) => specialturFejl({ sagstype: s, specialBeskrivelse: "", manuelTid: "" })), [[], [], []]);
eq("mangler både beskrivelse og tid: to fejl", specialturFejl({ sagstype: "specialtur", specialBeskrivelse: "", manuelTid: "" }).length, 2);
eq("kun mellemrum tæller ikke som beskrivelse", specialturFejl({ ...ok, specialBeskrivelse: "   " }).length, 1);
eq("mangler tid: én fejl", specialturFejl({ ...ok, manuelTid: "" }).length, 1);
eq("tid 0 afvises", specialturFejl({ ...ok, manuelTid: "0" }).length, 1);
eq("negativ tid afvises", specialturFejl({ ...ok, manuelTid: "-30" }).length, 1);
eq("tekst som tid afvises", specialturFejl({ ...ok, manuelTid: "to timer" }).length, 1);
eq("præcis 24 timer er ok", specialturFejl({ ...ok, manuelTid: String(SPECIAL_MAKS_MINUTTER) }), []);
eq("over 24 timer afvises", specialturFejl({ ...ok, manuelTid: String(SPECIAL_MAKS_MINUTTER + 1) }).length, 1);
eq("krav til montør er valgfrit", specialturFejl({ ...ok, specialKrav: "" }), []);
eq("manglende beskrivelse (undefined) afvises", specialturFejl({ sagstype: "specialtur", manuelTid: 60 }).length, 1);

console.log(`\n${pass} bestået, ${fail} fejlet`);
process.exit(fail ? 1 : 0);
