// Test af Edge Function-logikken til kapacitetstjek ved booking (supabase/functions/kapacitet-tjek/tjek.js). Kør:  node tests/kapacitet-tjek.test.mjs
import { readFileSync } from "node:fs";
import { validerForespoergsel, punkt1BruttoFraSvar, ordrerTilStop, punkt1Ider, bygPersoner, koerTjek } from "../supabase/functions/kapacitet-tjek/tjek.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

// ---- motorkopien i funktionen er identisk med src/engine/kapacitet (Edge Functionen kan ikke importere fra src)
for (const f of ["index", "indstillinger", "pakning", "tid"]) {
  eq(`motorkopi: ${f}.js er identisk`, readFileSync(`supabase/functions/kapacitet-tjek/engine/${f}.js`, "utf8") === readFileSync(`src/engine/kapacitet/${f}.js`, "utf8"), true);
}

// ---- validering
const gyldig = { dato: "2026-11-09", bilId: "bil1", kandidat: { adresse: "Torvet 1", minutter: 60, tidsrumId: "formiddag", varer: [{ id: "v1", navn: "Køleskab", antal: 2, punkt1Id: "123456" }] } };
eq("validering: gyldig forespørgsel", validerForespoergsel(gyldig).ok, true);
eq("validering: dato", [validerForespoergsel({ ...gyldig, dato: "09-11-2026" }).ok, validerForespoergsel({ ...gyldig, dato: "2026-13-45" }).ok, validerForespoergsel({ ...gyldig, dato: undefined }).ok], [false, false, false]);
eq("validering: bil og kandidat kræves", [validerForespoergsel({ ...gyldig, bilId: "" }).ok, validerForespoergsel({ ...gyldig, kandidat: null }).ok, validerForespoergsel(null).ok], [false, false, false]);
eq("validering: punkt1-id skal være tal, antal holdes inden for grænser", (() => { const r = validerForespoergsel({ ...gyldig, kandidat: { ...gyldig.kandidat, varer: [{ navn: "a", punkt1Id: "12abc", antal: 9999 }, { navn: "b", punkt1Id: "../../etc", antal: -3 }, { navn: "c", punkt1Id: "99", antal: "x" }] } }); return r.kandidat.varer.map((v) => [v.punkt1Id, v.antal]); })(), [[null, 50], [null, 1], [null, 1]]);
eq("validering: højst 40 varer", validerForespoergsel({ ...gyldig, kandidat: { ...gyldig.kandidat, varer: Array.from({ length: 100 }, (_, i) => ({ navn: `v${i}` })) } }).kandidat.varer.length, 40);
eq("validering: tidsrum", [validerForespoergsel(gyldig).kandidat.tidsrum, validerForespoergsel({ ...gyldig, kandidat: { ...gyldig.kandidat, tidsrumId: "heldag" } }).kandidat.tidsrum], [{ fra: 480, til: 720 }, null]);

// ---- punkt1-udlæsning
const raek = (id, vaerdi, enhed) => ({ id, values: [vaerdi], unitType: enhed });
const svarFra = (id, raekker) => ({ productIdToSpecificationAttributes: { [id]: raekker } });
eq("punkt1: læser brutto (mm → cm, komma-kg)", punkt1BruttoFraSvar(svarFra("111", [raek("grossDimensions", "661 x 644 x 859", "mm"), raek("grossWeight", "45,6", "kg")]), "111"), { maal: { l: 66.1, b: 64.4, h: 85.9 }, vaegtKg: 45.6 });
eq("punkt1: kun netto er ikke nok (gættes aldrig)", punkt1BruttoFraSvar(svarFra("111", [raek("netDimensions", "600 x 600 x 850", "mm"), raek("netWeight", "40", "kg")]), "111"), null);
eq("punkt1: manglende vægt giver null", punkt1BruttoFraSvar(svarFra("111", [raek("grossDimensions", "661 x 644 x 859", "mm")]), "111"), null);
eq("punkt1: urimelige mål afvises", punkt1BruttoFraSvar(svarFra("111", [raek("grossDimensions", "1 x 2 x 3", "mm"), raek("grossWeight", "45", "kg")]), "111"), null);
eq("punkt1: tomt/ugyldigt svar", [punkt1BruttoFraSvar(null, "1"), punkt1BruttoFraSvar({}, "1"), punkt1BruttoFraSvar({ products: [{}] }, "1")], [null, null, null]);

// ---- ordrer → stop
const ordre = (id, ekstra = {}) => ({ id, status: "planlagt", kunde: { navn: `K${id}`, adresse: `Vej ${id}` }, tidsrumId: "heldag", raekkefolge: 0, varelinjer: [{ id: `${id}-l`, varetypeNavn: "Køleskab", primaerYdelse: { minutter: 40 }, tillaeg: [{ minutter: 5 }], punkt1Id: "111" }], ...ekstra });
const stopListe = ordrerTilStop([ordre("a", { raekkefolge: 2 }), ordre("b", { raekkefolge: 1 }), ordre("c", { status: "afsluttet" }), ordre("d")], "d");
eq("ordrer: afsluttede og den redigerede sag udelades, rækkefølge bevares", stopListe.map((s) => s.id), ["b", "a"]);
eq("ordrer: minutter og punkt1-id", [stopListe[0].minutter, stopListe[0].linjer[0].punkt1Id], [45, "111"]);
eq("punkt1Ider: samler unikke id'er", punkt1Ider(stopListe, { varer: [{ punkt1Id: "111" }, { punkt1Id: "222" }, { punkt1Id: null }] }).sort(), ["111", "222"]);

// ---- personer
const arbejdstider = [];
eq("personer: længste arbejdstid er montør, øvrige medhjælpere, syge udelades", bygPersoner({
  dato: "2026-11-09", indstillinger: {},
  personer: [{ id: "p1", name: "A" }, { id: "p2", name: "B" }, { id: "p3", name: "C" }],
  arbejdstider: [{ person_id: "p2", weekday: 1, arbejder: true, start_min: 480, end_min: 600, pause_min: 0 }],
  uaendringer: [], fravaer: [{ technician_id: "p3", start_date: "2026-11-01", end_date: null, type: "sygdom" }],
}).map((p) => [p.id, p.rolle]), [["p1", "montoer"], ["p2", "medhjaelper"]]);

// ---- hele beregningen: vægt, omlastning, regler, privatliv
const BUTIK = { lat: 55.4, lon: 10.4, capacity_settings: { koersel: { trafikTillaegPct: 0 } } };
const BIL = { id: "bil1", navn: "Bil 1", tempo: 100, nyttelastKg: 500, vaerktoejKg: 50, lasterum: { laengdeCm: 300, breddeCm: 150, hoejdeCm: 180 } }; // tilladt = 500-50-86,5 = 363,5 kg
const PERSONER = bygPersoner({ dato: "2026-11-09", indstillinger: {}, personer: [{ id: "p1", name: "M" }], arbejdstider: [], uaendringer: [], fravaer: [] });
const HEMMELIG = { vaegtKg: 123.45, maal: { l: 77.7, b: 66.6, h: 55.5 } };
const maal = new Map([["111", HEMMELIG], ["222", HEMMELIG], ["333", { vaegtKg: 400, maal: { l: 80, b: 80, h: 80 } }]]);
const kand = (punkt1Id, extra = {}) => ({ adresse: "", minutter: 30, tidsrum: null, kraever2Mand: false, varer: [{ id: "k1", navn: "Vaskemaskine", type: "Vaskemaskine", antal: 1, punkt1Id }], ...extra });
const kor = (o) => koerTjek({ dato: "2026-11-09", butik: BUTIK, bil: BIL, personer: PERSONER, ordrer: [], sagId: null, kandidat: kand("111"), maalById: maal, koord: new Map(), erAdmin: false, kanOverrule: false, ...o }).svar;

eq("tjek: én vare passer", kor({}).beslutning, "ok");
const to = [ordre("a", { varelinjer: [{ id: "a-l", varetypeNavn: "Køleskab", primaerYdelse: { minutter: 30 }, punkt1Id: "111" }] })];
// 123,45 + 123,45 = 246,9 kg < 363,5 -> passer; tre stk (370,35 kg) -> for tungt på én tur -> omlastning
const tre = [ordre("a", { varelinjer: [{ id: "a1", varetypeNavn: "Køleskab", primaerYdelse: { minutter: 30 }, punkt1Id: "111" }, { id: "a2", varetypeNavn: "Køleskab", primaerYdelse: { minutter: 30 }, punkt1Id: "111" }] })];
eq("tjek: to varer i alt passer uden omlastning", kor({ ordrer: to }).ekstra.omlastninger, 0);
const omlast = kor({ ordrer: tre });
eq("tjek: for tungt på én gang giver omlastning, ikke afvisning", [omlast.beslutning, omlast.ekstra.omlastninger, omlast.noter.some((n) => /omlastning/.test(n))], ["ok", 1, true]);
const tung = kor({ kandidat: kand("333"), ordrer: [] });
eq("tjek: en vare tungere end bilen tillader blokerer", [tung.beslutning, tung.meddelelser.some((m) => m.regel === "nyttelast" && m.niveau === "krav")], ["blokeret", true]);
eq("tjek: overrule-flag følger rettigheden og kun ved blokering", [kor({ kandidat: kand("333"), kanOverrule: true }).kanOverrule, kor({ kandidat: kand("333"), kanOverrule: false }).kanOverrule, kor({ kanOverrule: true }).kanOverrule], [true, false, false]);
const medRegel = (regler) => ({ butik: { ...BUTIK, capacity_settings: { ...BUTIK.capacity_settings, regler } } });
eq("tjek: butikkens regel (rådgivende) gør blokering til advarsel", kor({ kandidat: kand("333"), ...medRegel({ nyttelast: "raadgivende" }) }).beslutning, "advarsel");
eq("tjek: regel sat til Fra ignoreres", kor({ kandidat: kand("333"), ...medRegel({ nyttelast: "fra" }) }).meddelelser.some((m) => m.regel === "nyttelast"), false);
const ukendt = kor({ kandidat: kand(null) });
eq("tjek: ukendte mål gættes ikke - advarsel og navn i note", [ukendt.beslutning, ukendt.noter.some((n) => /Vaskemaskine/.test(n))], ["advarsel", true]);
eq("tjek: bil uden nyttelast/lasterum nævnes", kor({ bil: { id: "bil1", navn: "X" } }).noter.some((n) => /nyttelast eller lasterum/.test(n)), true);
eq("tjek: ingen montør på bilen den dag blokerer", kor({ personer: [] }).beslutning, "blokeret");

// Privatliv: svaret til sælger indeholder aldrig mål eller vægt - hverken i tekst eller felter
const scenarier = [kor({}), omlast, tung, ukendt, kor({ kandidat: kand("333"), ordrer: tre })];
const raaTekst = JSON.stringify(scenarier);
for (const hemmelig of ["123.45", "77.7", "66.6", "55.5", "246.9", "370.35", "363.5", "400", "363"]) eq(`privatliv: "${hemmelig}" findes ikke i svaret til sælger`, raaTekst.includes(hemmelig), false);
eq("privatliv: ingen detaljer til almindelig bruger", scenarier.every((s) => !("detaljer" in s)), true);
const adm = kor({ kandidat: kand("333"), erAdmin: true });
eq("privatliv: systemadmin får detaljer (til test og fejlsøgning)", ["detaljer" in adm, Array.isArray(adm.detaljer.brud)], [true, true]);
eq("tjek: sagen kan flyttes uden at tælle dobbelt (sagId udelades)", kor({ ordrer: tre, sagId: "a" }).ekstra.omlastninger, 0);

console.log(`\n${pass} bestået, ${fail} fejlet`);
process.exit(fail ? 1 : 0);
