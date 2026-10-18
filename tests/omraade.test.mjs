// Test af kørselsområde og Jylland-forrang (engine/kapacitet/omraade.js + forslagMotor). Kør med: node tests/omraade.test.mjs
import { postnrFraAdresse, erJyllandPostnr, erJyllandAdresse, erFastJylland, harJyllandForrang, harForrang, parsPostnumre, renPostnumre, postnrIOmraade, omraadeForBil, JYLLAND_POSTNUMRE } from "../src/engine/kapacitet/omraade.js";
import { rensIndstillinger } from "../src/engine/kapacitet/indstillinger.js";
import { motorForslag } from "../src/lib/forslagMotor.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

// Postnummer ud af adressen
eq("postnr: almindelig adresse", postnrFraAdresse("Åboulevarden 12, 8000 Aarhus C"), "8000");
eq("postnr: uden komma", postnrFraAdresse("Vej 1 7400 Herning"), "7400");
eq("postnr: firecifret husnummer er ikke et postnummer", postnrFraAdresse("Stor Vej 1234"), null);
eq("postnr: husnummer og postnummer", postnrFraAdresse("Stor Vej 1234, 6700 Esbjerg"), "6700");
eq("postnr: tom/null", [postnrFraAdresse(""), postnrFraAdresse(null), postnrFraAdresse(undefined)], [null, null, null]);

// Hvad er Jylland
eq("Fyn er ikke Jylland", [erJyllandPostnr("5000"), erJyllandPostnr("5260"), erJyllandPostnr("5999")], [false, false, false]);
eq("Sjælland er ikke Jylland", [erJyllandPostnr("2100"), erJyllandPostnr("4999")], [false, false]);
eq("Jylland: grænser og byer", [erJyllandPostnr("6000"), erJyllandPostnr("8000"), erJyllandPostnr("9990"), erJyllandPostnr("9999")], [true, true, true, true]);
eq("øer uden bro regnes ikke med", [erJyllandPostnr("8305"), erJyllandPostnr("8592"), erJyllandPostnr("9940")], [false, false, false]);
eq("ugyldigt postnr", [erJyllandPostnr(""), erJyllandPostnr("abc"), erJyllandPostnr("80000"), erJyllandPostnr(null)], [false, false, false, false]);
eq("adresse uden postnr giver ingen forrang", erJyllandAdresse("Vej 1, Aarhus"), false);

// Forrang kræver både Jylland-bil og Jylland-adresse
eq("erFastJylland", [erFastJylland({ omraade: "jylland" }), erFastJylland({}), erFastJylland(null), erFastJylland({ omraade: "fyn" })], [true, false, false, false]);
eq("forrang: bil + adresse", [
  harJyllandForrang({ omraade: "jylland" }, "Vej 1, 8000 Aarhus C"),
  harJyllandForrang({ omraade: "jylland" }, "Vej 1, 5000 Odense C"),
  harJyllandForrang({}, "Vej 1, 8000 Aarhus C"),
], [true, false, false]);

// Admin-oprettede områder
eq("parsPostnumre", parsPostnumre("6000-8304, 5000; abc 12 9999-9000 10000"), [[6000, 8304], [5000, 5000]]);
eq("renPostnumre", renPostnumre(" 5000 , 6000-6000, 7000-7100 x"), "5000, 6000, 7000-7100");
eq("postnrIOmraade", [postnrIOmraade("5260", "5000-5999"), postnrIOmraade("6000", "5000-5999"), postnrIOmraade(null, "5000-5999"), postnrIOmraade("5260", "")], [true, false, false, false]);
eq("indbygget Jylland: øer udenfor", [postnrIOmraade("8000", JYLLAND_POSTNUMRE), postnrIOmraade("8305", JYLLAND_POSTNUMRE), postnrIOmraade("9940", JYLLAND_POSTNUMRE), postnrIOmraade("9942", JYLLAND_POSTNUMRE)], [true, false, false, true]);
const oms = [{ id: "sj", navn: "Sjælland", postnumre: "1000-4999" }];
eq("eget område: forrang efter postnummer", [harForrang({ omraade: "sj" }, "Vej 1, 4000 Roskilde", oms), harForrang({ omraade: "sj" }, "Vej 1, 5000 Odense C", oms)], [true, false]);
eq("slettet område: ingen forrang, men gammelt 'jylland' virker stadig", [harForrang({ omraade: "vaek" }, "Vej 1, 4000 Roskilde", oms), harForrang({ omraade: "jylland" }, "Vej 1, 8000 Aarhus C", oms), omraadeForBil({}, oms)], [false, true, null]);
eq("oprettet 'jylland' går forud for indbygget", harForrang({ omraade: "jylland" }, "Vej 1, 8000 Aarhus C", [{ id: "jylland", navn: "Jylland", postnumre: "9000-9999" }]), false);
eq("rensIndstillinger: områder renses", rensIndstillinger({ omraader: [{ id: "a", navn: " Syd ", postnumre: "6000-6999, x" }, { id: "a", navn: "Dublet", postnumre: "1000" }, { id: "", navn: "Uden id", postnumre: "1000" }, "skrald"] }).omraader, [{ id: "a", navn: "Syd", postnumre: "6000-6999" }]);
eq("rensIndstillinger: ingen områder som standard", [rensIndstillinger({}).omraader, rensIndstillinger({ omraader: "x" }).omraader], [[], []]);

// Forslag: forrang uden at udelukke andre
const IND = { koersel: { trafikTillaegPct: 0 } };
const lager = { lat: 55.4, lon: 10.4 };
const biler = [{ id: "b1", navn: "Jylland-bil" }, { id: "b2", navn: "Bil 2" }];
const personnel = [{ id: "p1", navn: "Kim", bilId: "b1" }, { id: "p2", navn: "Ida", bilId: "b2" }];
const grundlag = { indstillinger: IND, arbejdstider: [], uaendringer: [] };
const ordreTilStop = (o) => ({ id: o.id, navn: o.id, minutter: o.min || 60, lat: o.lat ?? null, lon: o.lon ?? null, varer: [] });
const naboHosB2 = [{ id: "n1", dato: "2026-11-10", bilId: "b2", status: "booket", lat: 55.412, lon: 10.412, min: 60 }];
const base = {
  dates: ["2026-11-10"], orders: naboHosB2, biler, vehicles: [{ id: "b1", omraade: "jylland" }], personnel, timeOff: [], crew: { helpers: [] },
  grundlag, lager, ordreTilStop, idag: "2026-11-09", hentMatrix: null,
};
const sag = (adresse) => ({ navn: "Ny", adresse, lat: 55.41, lon: 10.41, minutter: 60 });

let r = await motorForslag({ ...base, kandidat: sag("Vej 1, 5000 Odense C") });
eq("Fyn-sag: bilen med nabo-sag vinder, ingen forrang", [r.forslag[0].bilId, r.forslag[0].begrundelse.includes("Jylland")], ["b2", false]);

r = await motorForslag({ ...base, kandidat: sag("Vej 1, 8000 Aarhus C") });
eq("Jylland-sag: den faste Jylland-bil har forrang selv om den anden er billigere", [r.forslag[0].bilId, r.forslag[0].begrundelse.includes("fast bil i Jylland")], ["b1", true]);

r = await motorForslag({ ...base, vehicles: [], kandidat: sag("Vej 1, 8000 Aarhus C") });
eq("uden Jylland-bil ingen forrang", r.forslag[0].bilId, "b2");

r = await motorForslag({ ...base, kandidat: sag("Vej 1, Aarhus") });
eq("adresse uden postnummer: ingen forrang", r.forslag[0].bilId, "b2");

// Eget område via butikkens indstillinger
r = await motorForslag({ ...base, vehicles: [{ id: "b1", omraade: "sj" }], grundlag: { ...grundlag, indstillinger: { ...IND, omraader: oms } }, kandidat: sag("Vej 1, 4000 Roskilde") });
eq("Sjælland-bil med eget område har forrang", [r.forslag[0].bilId, r.forslag[0].begrundelse.includes("fast bil i Sjælland")], ["b1", true]);

// Er Jylland-bilen fyldt, tager den anden bil sagen: forrangen udelukker ikke
const fyldt = Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, dato: "2026-11-10", bilId: "b1", status: "booket", lat: 55.4, lon: 10.4, min: 120 }));
r = await motorForslag({ ...base, orders: fyldt, kandidat: sag("Vej 1, 8000 Aarhus C") });
eq("Jylland-bil fyldt: den anden bil tager sagen", r.forslag.map((f) => f.bilId), ["b2"]);

console.log(`${pass} bestået, ${fail} fejlet`);
process.exit(fail ? 1 : 0);
