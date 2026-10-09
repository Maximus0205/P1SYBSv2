// Regressionstest til kapacitetsmotoren (src/engine/kapacitet). Kør med:  node tests/engine.kapacitet.test.mjs
// Alle forventninger er regnet i hånden ud fra en simpel "verden på en linje": 1 enhed = 1 minut = 0,5 km.
import { planlaegDag, vurderTilfoejelse, dagensTilgaengelighed, rensIndstillinger, medBrugerRegler, PERSONVAEGT_KG, tilHHMM, tilMin, pakVarer, standardStabling, skoenMatrix } from "../src/engine/kapacitet/index.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

// ---------- fixtures
const linje = (pos) => { const ids = Object.keys(pos); return { ids, minutter: ids.map((a) => ids.map((b) => Math.abs(pos[a] - pos[b]))), km: ids.map((a) => ids.map((b) => Math.abs(pos[a] - pos[b]) * 0.5)) }; };
const IND = { koersel: { trafikTillaegPct: 0 } };
const dag = { fra: 480, til: 960 };
const montoer = (vinduer = [dag], id = "m") => ({ id, navn: "Montør", rolle: "montoer", vinduer });
const hjaelper = (vinduer = [dag]) => ({ id: "h", navn: "Medhjælper", rolle: "medhjaelper", vinduer });
const stop = (id, minutter, ekstra = {}) => ({ id, navn: id, minutter, varer: [], ...ekstra });
const vare = (id, vaegtKg, maal, type = "Ukendt", ekstra = {}) => ({ id, navn: id, type, vaegtKg, maal, ...ekstra });
const plan = (o) => planlaegDag({ dato: "2026-11-09", indstillinger: IND, bil: { id: "b", navn: "Bil" }, personer: [montoer()], pauseMin: 30, ...o });
const typer = (r) => r.haendelser.map((h) => h.type);

// =====================================================================================================
// TID OG INDSTILLINGER
// =====================================================================================================
eq("tid: tilMin og tilHHMM", [tilMin("08:00"), tilMin("8:05"), tilMin("24:00"), tilMin("24:01"), tilMin("25:00"), tilMin("ab"), tilHHMM(495), tilHHMM(1025)], [480, 485, 1440, null, null, null, "08:15", "17:05"]);
eq("indstillinger: standarder", [rensIndstillinger(null).tider.omlastningMin, rensIndstillinger({}).regler.nyttelast, rensIndstillinger(undefined).tider.arbejdsdage], [15, "krav", [1, 2, 3, 4, 5]]);
eq("indstillinger: tal holdes inden for grænser", [rensIndstillinger({ tider: { omlastningMin: 9999 } }).tider.omlastningMin, rensIndstillinger({ tider: { omlastningMin: -4 } }).tider.omlastningMin, rensIndstillinger({ tider: { omlastningMin: "abc" } }).tider.omlastningMin, rensIndstillinger({ tider: { omlastningMin: null } }).tider.omlastningMin], [120, 0, 15, 15]);
eq("indstillinger: ugyldige tider og regler giver standard", [rensIndstillinger({ tider: { standardStart: "xx" } }).tider.standardStart, rensIndstillinger({ tider: { standardStart: "17:00", standardSlut: "09:00" } }).tider.standardSlut, rensIndstillinger({ regler: { nyttelast: "maaske" } }).regler.nyttelast, rensIndstillinger({ regler: { nyttelast: "fra" } }).regler.nyttelast], ["08:00", "16:00", "krav", "fra"]);
eq("indstillinger: arbejdsdage renses", rensIndstillinger({ tider: { arbejdsdage: [1, 1, 6, 9, "x", 3.5, 0] } }).tider.arbejdsdage, [1, 6]);
eq("indstillinger: lagerkoordinater kræver begge og gyldige værdier", [rensIndstillinger({ lager: { lat: 55, lon: 10 } }).lager.lat, rensIndstillinger({ lager: { lat: 55, lon: null } }).lager.lat, rensIndstillinger({ lager: { lat: 999, lon: 10 } }).lager.lat], [55, null, null]);
eq("indstillinger: personvægten er FAST og kan ikke sættes udefra", [PERSONVAEGT_KG, "personVaegtKg" in rensIndstillinger({ personVaegtKg: 200, pakning: { personVaegtKg: 200 }, nyttelast: { personVaegtKg: 200 } }), JSON.stringify(rensIndstillinger({ nyttelast: { personVaegtKg: 200 } })).includes("200")], [86.5, false, false]);
eq("indstillinger: ukendte felter kasseres", Object.keys(rensIndstillinger({ hacker: 1, tider: { x: 1 } })).sort(), ["koersel", "lager", "regler", "samling", "tider"]);

// =====================================================================================================
// PERSONERS TILGÆNGELIGHED
// =====================================================================================================
const mandag = "2026-11-09", loerdag = "2026-11-14";
eq("tilgængelighed: standard mandag er 08:00-16:00 med 30 min pause", dagensTilgaengelighed({ dato: mandag }), { arbejder: true, vinduer: [{ fra: 480, til: 960 }], pauseMin: 30, aarsag: null });
eq("tilgængelighed: lørdag er fri som standard", dagensTilgaengelighed({ dato: loerdag }).arbejder, false);
eq("tilgængelighed: butikken kan sætte lørdag til arbejdsdag", dagensTilgaengelighed({ dato: loerdag, indstillinger: { tider: { arbejdsdage: [1, 2, 3, 4, 5, 6] } } }).arbejder, true);
eq("tilgængelighed: personlig arbejdstid for ugedagen", dagensTilgaengelighed({ dato: mandag, raekker: [{ weekday: 1, arbejder: true, start_min: 600, end_min: 840, pause_min: 0 }] }).vinduer, [{ fra: 600, til: 840 }]);
eq("tilgængelighed: fri på en ugedag", dagensTilgaengelighed({ dato: mandag, raekker: [{ weekday: 1, arbejder: false }] }).arbejder, false);
eq("tilgængelighed: 'møder først kl. 10' (ikke tilgængelig 00:00-10:00)", dagensTilgaengelighed({ dato: mandag, uaendringer: [{ dato: mandag, fraMin: 0, tilMin: 600 }] }).vinduer, [{ fra: 600, til: 960 }]);
eq("tilgængelighed: 'går kl. 15'", dagensTilgaengelighed({ dato: mandag, uaendringer: [{ dato: mandag, fraMin: 900, tilMin: 1440 }] }).vinduer, [{ fra: 480, til: 900 }]);
eq("tilgængelighed: væk 12-13 giver to vinduer", dagensTilgaengelighed({ dato: mandag, uaendringer: [{ dato: mandag, fraMin: 720, tilMin: 780 }] }).vinduer, [{ fra: 480, til: 720 }, { fra: 780, til: 960 }]);
eq("tilgængelighed: en ændring på en ANDEN dato rører ikke denne", dagensTilgaengelighed({ dato: mandag, uaendringer: [{ dato: "2026-11-10", fraMin: 0, tilMin: 600 }] }).vinduer, [{ fra: 480, til: 960 }]);
eq("tilgængelighed: hele dagen optaget giver ikke arbejde", dagensTilgaengelighed({ dato: mandag, uaendringer: [{ dato: mandag, fraMin: 0, tilMin: 1440 }] }).arbejder, false);
eq("tilgængelighed: ferie og sygdom er hele dage", [dagensTilgaengelighed({ dato: mandag, fravaer: [{ startDato: "2026-11-09", slutDato: "2026-11-13", type: "ferie" }] }).aarsag, dagensTilgaengelighed({ dato: mandag, fravaer: [{ startDato: "2026-11-02", slutDato: null, type: "sygdom" }] }).aarsag, dagensTilgaengelighed({ dato: mandag, fravaer: [{ startDato: "2026-11-02", slutDato: "2026-11-06", type: "ferie" }] }).arbejder], ["Ferie/fridag", "Sygemeldt", true]);

// =====================================================================================================
// PAKNING
// =====================================================================================================
const rum = { laengdeCm: 300, breddeCm: 150, hoejdeCm: 200 };
const opv = (id, stopNr = 0) => ({ id, type: "Opvaskemaskine", stopNr, vaegtKg: 40, maal: { l: 60, b: 60, h: 85 } });
const kol = (id, stopNr = 0) => ({ id, type: "Køleskab", stopNr, vaegtKg: 60, maal: { l: 70, b: 70, h: 170 } });
eq("pakning: standardviden", [standardStabling("Opvaskemaskine").kanStaaPaa, standardStabling("Køleskab").kanStaaPaa, standardStabling("Fryser").kanBaereKg, standardStabling("Vaskemaskine").kanBaereKg, standardStabling("Tørretumbler").kanBaereKg, standardStabling("Noget helt andet").kanStaaPaa], [true, false, 0, 0, 60, false]);
let p = pakVarer({ lasterum: rum, varer: [opv("a"), opv("b")] });
eq("pakning: to opvaskemaskiner stables (gulvet bruges kun til én)", [p.ok, p.placeringer.find((x) => x.id === "b").paa, p.placeringer.find((x) => x.id === "b").z, p.gulvPct], [true, "a", 91, 10]);
p = pakVarer({ lasterum: rum, varer: [kol("a"), kol("b")] });
eq("pakning: to køleskabe stables IKKE - de står på gulvet", [p.ok, p.placeringer.every((x) => x.paa === null)], [true, true]);
p = pakVarer({ lasterum: rum, varer: [opv("a", 1), opv("b", 2)] });
eq("pakning: varen til det TIDLIGERE stop (a) lægges oven på den til det senere (b), så den kan tages af først", [p.placeringer.find((x) => x.id === "a").paa, p.placeringer.find((x) => x.id === "b").paa], ["b", null]);
p = pakVarer({ lasterum: rum, varer: [opv("a", 2), opv("b", 1)] });
eq("pakning: samme regel, byttet om", p.placeringer.find((x) => x.id === "b").paa, "a");
p = pakVarer({ lasterum: rum, varer: [{ ...opv("a"), vaegtKg: null }, opv("b")] });
eq("pakning: ukendt vægt stables aldrig (gættes ikke)", p.placeringer.every((x) => x.paa === null), true);
p = pakVarer({ lasterum: rum, varer: [{ ...opv("a"), vaegtKg: 70 }, { ...opv("b"), vaegtKg: 70 }] });
eq("pakning: for tung til at stå oven på (opvaskemaskinen bærer højst 60 kg)", p.placeringer.every((x) => x.paa === null), true);
p = pakVarer({ lasterum: { laengdeCm: 300, breddeCm: 150, hoejdeCm: 120 }, varer: [kol("a")] });
eq("pakning: for høj (170 + emballage > 120) - vippes ikke", [p.ok, p.aarsag, p.vareId], [false, "for_hoej", "a"]);
p = pakVarer({ lasterum: { laengdeCm: 100, breddeCm: 60, hoejdeCm: 200 }, varer: [kol("a")] });
eq("pakning: for stor til gulvet", [p.ok, p.aarsag], [false, "for_stor"]);
p = pakVarer({ lasterum: { laengdeCm: 300, breddeCm: 150, hoejdeCm: 200 }, varer: [kol("a"), kol("b"), kol("c"), kol("d")] });
eq("pakning: gulvet bliver brugt op (kun 3 køleskabe på 76 cm i rækker på 150 cm bredde)", [p.ok, p.aarsag], [false, "gulv"]);
p = pakVarer({ lasterum: { laengdeCm: 400, breddeCm: 200, hoejdeCm: 200 }, varer: Array.from({ length: 10 }, (_, i) => kol(`k${i}`)) });
eq("pakning: 10 køleskabe passer i 400×200 (2 pr. række, 5 rækker)", [p.ok, p.placeringer.length], [true, 10]);
p = pakVarer({ lasterum: { laengdeCm: 400, breddeCm: 200, hoejdeCm: 200 }, varer: [{ id: "x", type: "Ovn", stopNr: 0, vaegtKg: 30, maal: { l: 100, b: 100, h: 50 } }], emballageMarginCm: 0 });
eq("pakning: uden emballagemargin passer en vare på præcis rummets bredde, med margin gør den ikke", [pakVarer({ lasterum: { laengdeCm: 300, breddeCm: 100, hoejdeCm: 100 }, varer: [{ id: "x", type: "Ovn", vaegtKg: 1, maal: { l: 100, b: 100, h: 50 } }], emballageMarginCm: 0 }).ok, pakVarer({ lasterum: { laengdeCm: 300, breddeCm: 100, hoejdeCm: 100 }, varer: [{ id: "x", type: "Ovn", vaegtKg: 1, maal: { l: 100, b: 100, h: 50 } }], emballageMarginCm: 3 }).ok], [true, false]);
eq("pakning: varer uden mål pakkes ikke og meldes", pakVarer({ lasterum: rum, varer: [opv("a"), { id: "u", type: "Ovn", vaegtKg: 1 }] }).ukendte, ["u"]);
eq("pakning: uden lasterum springes over", pakVarer({ lasterum: null, varer: [kol("a")] }).sprunget, true);
eq("pakning: lasterum med 0 springes også over", pakVarer({ lasterum: { laengdeCm: 0, breddeCm: 100, hoejdeCm: 100 }, varer: [] }).sprunget, true);
eq("pakning: første stops varer ligger nærmest bagdøren (højest y = længst bagud)", (() => { const r = pakVarer({ lasterum: rum, varer: [kol("foerst", 0), kol("sidst", 1)] }); const y = (id) => r.placeringer.find((x) => x.id === id).y; return y("foerst") > y("sidst"); })(), true);

// =====================================================================================================
// ÉT STOP: tidslinjen regnet i hånden
// =====================================================================================================
const M1 = linje({ lager: 0, A: 20 });
let r = plan({ matrix: M1, stop: [stop("A", 60)] });
eq("ét stop: 08:00 læs 15 → kør 20 → stop 65 → kør 20 → tøm 15 = hjemme 10:15", [r.ok, r.noegletal.hjemmeKl, typer(r), r.haendelser.map((h) => tilHHMM(h.fra))], [true, "10:15", ["laes", "koersel", "stop", "koersel", "hjem"], ["08:00", "08:15", "08:35", "09:40", "10:00"]]);
eq("ét stop: nøgletal", [r.noegletal.km, r.noegletal.koerselMin, r.noegletal.arbejdeMin, r.noegletal.venteMin, r.noegletal.ledigMin, r.noegletal.omlastninger], [20, 40, 65, 0, 315, 0]);
eq("ingen priser i resultatet (timepris og kilometerpris er fjernet)", ["omkostningKr" in r.noegletal, "timeKr" in r.noegletal, "kmKr" in r.noegletal, "oekonomi" in rensIndstillinger({ oekonomi: { timeprisKr: 1 } })], [false, false, false, false]);
r = plan({ matrix: M1, bil: { id: "b", tempo: 130 }, stop: [stop("A", 60)] });
eq("tempo 130 %: 60 min bliver 78 + 5 buffer, hjemme 10:33", r.noegletal.hjemmeKl, "10:33");
r = plan({ matrix: M1, bil: { id: "b", tempo: 80 }, stop: [stop("A", 60)] });
eq("tempo 80 %: 48 + 5 = 53, hjemme 10:03", r.noegletal.hjemmeKl, "10:03");
r = plan({ matrix: M1, indstillinger: { koersel: { trafikTillaegPct: 15 } }, stop: [stop("A", 60)] });
eq("trafiktillæg 15 %: 20 min bliver 23 min hver vej, hjemme 10:21", [r.noegletal.hjemmeKl, r.noegletal.koerselMin], ["10:21", 46]);
r = plan({ matrix: M1, indstillinger: { koersel: { trafikTillaegPct: 0 }, tider: { stopBufferMin: 0, omlastningMin: 0, morgenLaesningMin: 0, dagsafslutningMin: 0 } }, stop: [stop("A", 60)] });
eq("alle faste tider på 0: kun kørsel og arbejde (08:00 + 20 + 60 + 20 = 09:40)", r.noegletal.hjemmeKl, "09:40");
r = plan({ matrix: M1, stop: [stop("A", 60)], personer: [montoer([{ fra: 600, til: 960 }])] });
eq("montør der først møder kl. 10: dagen starter 10:00 og kapaciteten er kortere", [r.noegletal.startMin, r.noegletal.hjemmeKl, r.noegletal.ledigMin], [600, "12:15", 195]);

// =====================================================================================================
// TOM DAG OG INGEN MONTØR
// =====================================================================================================
r = plan({ matrix: M1, stop: [] });
eq("tom dag: ok, og hele arbejdstiden (minus pause) er ledig: 480 - 30 = 450", [r.ok, r.noegletal.ledigMin, r.haendelser.length], [true, 450, 0]);
r = plan({ matrix: M1, stop: [], personer: [montoer([{ fra: 600, til: 960 }])] });
eq("tom dag med sen start: 360 - 30 = 330 ledig", r.noegletal.ledigMin, 330);
r = plan({ matrix: M1, stop: [stop("A", 30)], personer: [] });
eq("ingen montør og stop: brud", [r.ok, r.brud[0].regel], [false, "arbejdstid"]);
r = plan({ matrix: M1, stop: [], personer: [] });
eq("ingen montør og ingen stop: ikke en fejl, men 0 ledig", [r.ok, r.noegletal.ledigMin], [true, 0]);

// =====================================================================================================
// ARBEJDSTID, OVERTID OG REGELNIVEAUER
// =====================================================================================================
const M3 = linje({ lager: 0, A: 10, B: 10, C: 10 });
const tre = [stop("A", 150), stop("B", 150), stop("C", 150)];
r = plan({ matrix: M3, stop: tre });
eq("tre lange stop: hjemme 16:35 uden pause, 17:05 med pausen → 65 min over → brud (krav)", [r.ok, r.noegletal.hjemmeKl, r.brud.length, r.brud[0].regel, r.brud[0].tal.overMin], [false, "16:35", 1, "arbejdstid", 65]);
eq("pausen placeres ALDRIG af systemet (chaufføren vælger selv)", r.haendelser.filter((h) => h.type === "pause").length, 0);
r = plan({ matrix: M3, stop: tre, indstillinger: { koersel: { trafikTillaegPct: 0 }, regler: { arbejdstid: "raadgivende" } } });
eq("arbejdstid rådgivende: planen er ok, men der er en advarsel", [r.ok, r.brud.length, r.advarsler.some((a) => a.regel === "arbejdstid")], [true, 0, true]);
r = plan({ matrix: M3, stop: tre, indstillinger: { koersel: { trafikTillaegPct: 0 }, regler: { arbejdstid: "fra" } } });
eq("arbejdstid fra: ingen brud og ingen advarsel", [r.ok, r.brud.length, r.advarsler.filter((a) => a.regel === "arbejdstid").length], [true, 0, 0]);
r = plan({ matrix: M3, stop: tre, indstillinger: { koersel: { trafikTillaegPct: 0 }, tider: { tilladtOvertidMin: 120 } } });
eq("tilladt overtid 120 min: 17:05 er inden for 18:00", [r.ok, r.noegletal.ledigMin], [true, 55]);
r = plan({ matrix: M1, stop: [stop("A", 200)], indstillinger: { koersel: { trafikTillaegPct: 0 } } });
eq("pause: ingen pause-hændelse i tidslinjen, men 30 min reserveres", [typer(r).includes("pause"), r.noegletal.pauseMin], [false, 30]);
r = plan({ matrix: M1, stop: [stop("A", 60)] });
eq("pause: kommer slet ikke, hvis dagen er slut før 11:30", typer(r).includes("pause"), false);
r = plan({ matrix: M1, stop: [stop("A", 100)], personer: [montoer([{ fra: 600, til: 960 }])] });
eq("pause: ingen pause-hændelse for sen starter, hjemme-tid uændret", [typer(r).includes("pause"), r.noegletal.hjemmeKl], [false, "12:55"]);
r = plan({ matrix: M1, stop: [stop("A", 300)], personer: [montoer([{ fra: 600, til: 1020 }])] });
eq("pause: aldrig en pause-hændelse, heller ikke på en lang dag", r.haendelser.some((h) => h.type === "pause"), false);

// =====================================================================================================
// KALENDER: hul midt på dagen
// =====================================================================================================
const hul = [{ fra: 480, til: 720 }, { fra: 780, til: 960 }];
r = plan({ matrix: linje({ lager: 0, A: 10, B: 10 }), personer: [montoer(hul)], stop: [stop("A", 175), stop("B", 60)] });
const stopEv = r.haendelser.filter((h) => h.type === "stop");
eq("hul 12-13: intet stop ligger i hullet, og ingen aktivitet ender uden for kalenderen", [stopEv.every((h) => h.til <= 720 || h.fra >= 780), r.ok], [true, true]);
eq("hul 12-13: der er en ventetid i hullet", r.haendelser.some((h) => h.type === "vent" && h.fra >= 600 && h.til <= 780 && h.minutter > 30), true);

// =====================================================================================================
// KUNDENS TIDSRUM
// =====================================================================================================
r = plan({ matrix: M1, stop: [stop("A", 60, { tidsrum: { fra: 600, til: 720 } })] });
eq("tidsrum 10-12: ankomst 08:35 → venter til 10:00, færdig 11:05", [r.ok, r.haendelser.find((h) => h.type === "vent").minutter, tilHHMM(r.haendelser.find((h) => h.type === "stop").til)], [true, 85, "11:05"]);
r = plan({ matrix: M1, stop: [stop("A", 60, { tidsrum: { fra: 480, til: 540 } })] });
eq("tidsrum 08-09 kan ikke nås: færdig 09:40 → brud, 40 min over", [r.ok, r.brud[0].regel, r.brud[0].tal.overMin], [false, "tidsrum", 40]);
r = plan({ matrix: M1, stop: [stop("A", 60, { tidsrum: { fra: 480, til: 540 } })], indstillinger: { koersel: { trafikTillaegPct: 0 }, regler: { tidsrum: "raadgivende" } } });
eq("tidsrum rådgivende: kun advarsel", [r.ok, r.advarsler.some((a) => a.regel === "tidsrum")], [true, true]);
r = plan({ matrix: linje({ lager: 0, A: 10, B: 10 }), stop: [stop("A", 60, { tidsrum: { fra: 780, til: 900 } }), stop("B", 60, { tidsrum: { fra: 480, til: 600 } })] });
eq("to tidsrum: formiddagsstoppet køres før eftermiddagsstoppet, selv om de ligger samme sted", r.rutefolge, ["B", "A"]);

// =====================================================================================================
// TO MAND
// =====================================================================================================
r = plan({ matrix: M1, stop: [stop("A", 60, { kraever2Mand: true })] });
eq("to mand uden medhjælper: brud", [r.ok, r.brud[0].regel], [false, "toMand"]);
r = plan({ matrix: M1, stop: [stop("A", 60, { kraever2Mand: true })], personer: [montoer(), hjaelper()] });
eq("to mand med medhjælper: ok", [r.ok, r.forudsaetninger.harMedhjaelper, r.forudsaetninger.antalPersoner], [true, true, 2]);
r = plan({ matrix: M1, stop: [stop("A", 60, { kraever2Mand: true })], personer: [montoer(), hjaelper([{ fra: 600, til: 960 }])] });
eq("to mand, medhjælper først til stede kl. 10: stoppet venter til 10:00", [r.ok, tilHHMM(r.haendelser.find((h) => h.type === "stop").fra)], [true, "10:00"]);
r = plan({ matrix: M1, stop: [stop("A", 60, { kraever2Mand: true })], personer: [montoer(), hjaelper([{ fra: 480, til: 540 }])] });
eq("to mand, medhjælper kun til 09:00: kan ikke nå inden for den fælles arbejdstid", [r.ok, r.brud.some((b) => b.regel === "arbejdstid")], [false, true]);
r = plan({ matrix: M1, stop: [stop("A", 60, { kraever2Mand: true })], indstillinger: { koersel: { trafikTillaegPct: 0 }, regler: { toMand: "raadgivende" } } });
eq("to mand rådgivende: advarsel, ikke brud", [r.ok, r.advarsler.some((a) => a.regel === "toMand")], [true, true]);
r = plan({ matrix: M1, stop: [stop("A", 60)], personer: [montoer(), hjaelper()] });
eq("et stop uden to-mands-krav lader medhjælperen være i fred", r.ok, true);

// =====================================================================================================
// NYTTELAST OG TURE
// =====================================================================================================
const bil = (ekstra = {}) => ({ id: "b", navn: "Bil", nyttelastKg: 1000, vaerktoejKg: 50, ...ekstra });
const M2 = linje({ lager: 0, A: 10, B: 20 });
r = plan({ matrix: M2, bil: bil(), indstillinger: { koersel: { trafikTillaegPct: 0 }, nyttelast: { sikkerhedsmarginPct: 0 } }, personer: [montoer(), hjaelper()], stop: [stop("A", 60, { varer: [vare("a", 600)] })] });
eq("tilladt vægt = 1000 − 50 − 2 × 86,5 = 777 kg (margin 0)", [r.forudsaetninger.tilladtKg, r.forudsaetninger.antalPersoner], [777, 2]);
r = plan({ matrix: M2, bil: bil(), indstillinger: { koersel: { trafikTillaegPct: 0 }, nyttelast: { sikkerhedsmarginPct: 0 } }, stop: [stop("A", 60, { varer: [vare("a", 600)] })] });
eq("med én person: 1000 − 50 − 86,5 = 863,5 kg", r.forudsaetninger.tilladtKg, 863.5);
r = plan({ matrix: M2, bil: bil(), indstillinger: { koersel: { trafikTillaegPct: 0 }, nyttelast: { sikkerhedsmarginPct: 10 } /* ignoreres: marginer er fjernet */ }, personer: [montoer(), hjaelper()], stop: [stop("A", 60, { varer: [vare("a", 600)] })] });
eq("ingen sikkerhedsmargin: en indstillet margin ignoreres, hele nyttelasten (777 kg) kan bruges", r.forudsaetninger.tilladtKg, 777);

const to600 = [stop("A", 60, { varer: [vare("a", 600)] }), stop("B", 60, { varer: [vare("b", 600)] })];
r = plan({ matrix: M2, bil: bil(), indstillinger: { koersel: { trafikTillaegPct: 0 }, nyttelast: { sikkerhedsmarginPct: 0 } }, personer: [montoer(), hjaelper()], stop: to600 });
eq("2 × 600 kg mod 777 kg: to ture med lager-stop imellem", [r.ok, r.ture.length, r.noegletal.omlastninger, typer(r).filter((t) => t === "omlastning").length], [true, 2, 1, 1]);
eq("hver tur er inden for grænsen", r.ture.every((t) => t.vaegtKg <= t.tilladtKg), true);
eq("den billigste rækkefølge vælges: A først (10 min fra lageret), så B - hjemme 11:55 og 30 km", [r.rutefolge, r.noegletal.hjemmeKl, r.noegletal.km], [["A", "B"], "11:55", 30]);
eq("omlastningen er 15 min og ligger på lageret mellem turene", (() => { const o = r.haendelser.find((h) => h.type === "omlastning"); return [o.minutter, o.tur]; })(), [15, 2]);
eq("forklaringen nævner hvorfor tur 2 er nødvendig", r.forklaring.some((l) => l.startsWith("Tur 2 er nødvendig")), true);
r = plan({ matrix: M2, bil: bil(), pauseMin: 0, indstillinger: { koersel: { trafikTillaegPct: 0 }, nyttelast: { sikkerhedsmarginPct: 0 }, tider: { omlastningMin: 30 } }, personer: [montoer(), hjaelper()], stop: to600 });
eq("admin kan ændre omlastningstiden (30 min giver 15 min senere hjem end 11:55: 12:10)", r.noegletal.hjemmeKl, "12:10");
r = plan({ matrix: M2, bil: bil(), indstillinger: { koersel: { trafikTillaegPct: 0 }, nyttelast: { sikkerhedsmarginPct: 0 }, tider: { omlastningMin: 30 } }, personer: [montoer(), hjaelper()], stop: to600 });
eq("…pausen forsinker ikke tidslinjen (hjemme som uden pause: 12:10), men er en reserve", [r.noegletal.hjemmeKl, r.noegletal.pauseMin], ["12:10", 30]);

r = plan({ matrix: M2, bil: bil(), indstillinger: { koersel: { trafikTillaegPct: 0 }, nyttelast: { sikkerhedsmarginPct: 0 } }, stop: [stop("A", 60, { varer: [vare("a", 900)] })] });
eq("én vare på 900 kg mod 863,5: kan aldrig bæres - brud, og planen er ikke ok", [r.ok, r.brud.some((b) => b.regel === "nyttelast"), r.brud[0].besked.includes("for tung")], [false, true, true]);
r = plan({ matrix: M2, bil: bil(), indstillinger: { koersel: { trafikTillaegPct: 0 }, nyttelast: { sikkerhedsmarginPct: 0 }, regler: { nyttelast: "raadgivende" } }, personer: [montoer(), hjaelper()], stop: to600 });
eq("nyttelast rådgivende: der deles IKKE i ture, men der advares", [r.ok, r.ture.length, r.advarsler.some((a) => a.regel === "nyttelast")], [true, 1, true]);
r = plan({ matrix: M2, bil: bil(), indstillinger: { koersel: { trafikTillaegPct: 0 }, regler: { nyttelast: "fra" } }, personer: [montoer(), hjaelper()], stop: to600 });
eq("nyttelast fra: ingen deling og ingen advarsel", [r.ok, r.ture.length, r.advarsler.filter((a) => a.regel === "nyttelast").length], [true, 1, 0]);
r = plan({ matrix: M2, bil: { id: "b" }, stop: [stop("A", 60, { varer: [vare("a", 5000)] })] });
eq("nyttelast ikke sat på bilen: vægten springes over", [r.ok, r.forudsaetninger.tilladtKg, r.forudsaetninger.nyttelastKg], [true, null, null]);
r = plan({ matrix: M2, bil: bil({ nyttelastKg: 100 }), stop: [stop("A", 60, { varer: [vare("a", 10)] })] });
eq("nyttelast mindre end værktøj + personer: tilladt vægt bliver 0, ikke negativ", [r.forudsaetninger.tilladtKg, r.ok], [0, false]);
r = plan({ matrix: M2, bil: bil(), indstillinger: { koersel: { trafikTillaegPct: 0 }, nyttelast: { sikkerhedsmarginPct: 0 } }, stop: [stop("A", 60, { varer: [vare("a", 300, null, "Ovn", { antal: 3 })] })] });
eq("antal udfoldes: 3 × 300 kg = 900 kg mod 863,5 → to ture, samme stop besøges to gange", [r.ture.length, r.haendelser.filter((h) => h.type === "stop").length], [2, 2]);
eq("det delte stops arbejdstid fordeles efter vægt (2/3 + 1/3 af 60 min, hver med 5 min buffer)", r.haendelser.filter((h) => h.type === "stop").map((h) => h.minutter), [45, 25]);

// =====================================================================================================
// PLADS I LASTERUMMET (via planlægningen)
// =====================================================================================================
const rumBil = (l, b, h) => bil({ lasterum: { laengdeCm: l, breddeCm: b, hoejdeCm: h } });
r = plan({ matrix: M2, bil: rumBil(300, 150, 200), indstillinger: { koersel: { trafikTillaegPct: 0 } }, stop: [stop("A", 60, { varer: [vare("a", 40, { l: 60, b: 60, h: 85 }, "Opvaskemaskine"), vare("b", 40, { l: 60, b: 60, h: 85 }, "Opvaskemaskine")] })] });
eq("to opvaskemaskiner i en lille kasse: ok, én tur", [r.ok, r.ture.length], [true, 1]);
r = plan({ matrix: M2, bil: rumBil(300, 150, 120), stop: [stop("A", 60, { varer: [vare("k", 60, { l: 70, b: 70, h: 170 }, "Køleskab")] })] });
eq("køleskab 170 cm i en kasse på 120 cm: brud om plads", [r.ok, r.brud.some((b) => b.regel === "plads"), r.brud.find((b) => b.regel === "plads").besked.includes("høj")], [false, true, true]);
r = plan({ matrix: M2, bil: rumBil(210, 100, 200), stop: [stop("A", 60, { varer: [vare("k", 60, { l: 70, b: 70, h: 170 }, "Køleskab", { antal: 4 })] })] });
eq("4 køleskabe i en kasse med plads til 3: tur 1 har 3, tur 2 har 1", [r.ok, r.ture.map((t) => t.besoeg.reduce((s, b) => s + b.varer.length, 0))], [true, [3, 1]]);
r = plan({ matrix: M2, bil: rumBil(210, 100, 200), indstillinger: { koersel: { trafikTillaegPct: 0 }, regler: { plads: "raadgivende" } }, stop: [stop("A", 60, { varer: [vare("k", 60, { l: 70, b: 70, h: 170 }, "Køleskab", { antal: 4 })] })] });
eq("plads rådgivende: ingen deling, men en advarsel", [r.ok, r.ture.length, r.advarsler.some((a) => a.regel === "plads")], [true, 1, true]);
r = plan({ matrix: M2, bil: bil(), stop: [stop("A", 60, { varer: [vare("k", 60, { l: 70, b: 70, h: 170 }, "Køleskab")] })] });
eq("lasterum ikke sat: pladsen springes over", [r.ok, r.forudsaetninger.lasterumSat], [true, false]);

// =====================================================================================================
// UKENDTE DATA
// =====================================================================================================
r = plan({ matrix: M2, bil: bil(), stop: [stop("A", 60, { varer: [vare("a", null)] })] });
eq("ukendt vægt: advarsel (rådgivende som standard), planen er ok, og der gættes ikke", [r.ok, r.advarsler.some((a) => a.regel === "ukendtData" && a.besked.includes("Vægt mangler"))], [true, true]);
r = plan({ matrix: M2, bil: bil(), indstillinger: { koersel: { trafikTillaegPct: 0 }, regler: { ukendtData: "krav" } }, stop: [stop("A", 60, { varer: [vare("a", null)] })] });
eq("ukendt vægt med Krav: brud", [r.ok, r.brud.some((b) => b.regel === "ukendtData")], [false, true]);
r = plan({ matrix: M2, bil: bil(), indstillinger: { koersel: { trafikTillaegPct: 0 }, regler: { ukendtData: "fra" } }, stop: [stop("A", 60, { varer: [vare("a", null)] })] });
eq("ukendt vægt med Fra: ingen advarsel", r.advarsler.filter((a) => a.regel === "ukendtData").length, 0);
r = plan({ matrix: M2, bil: rumBil(300, 150, 200), stop: [stop("A", 60, { varer: [vare("a", 10, null, "Ovn")] })] });
eq("ukendte mål: advarsel om at de ikke indgår", r.advarsler.some((a) => a.besked.includes("Mål mangler")), true);

// =====================================================================================================
// RÆKKEFØLGE OG OPTIMERING
// =====================================================================================================
const M4 = linje({ lager: 0, A1: 10, A2: 11, B1: -10, B2: -11 });
r = plan({ matrix: M4, stop: [stop("A1", 30), stop("B1", 30), stop("A2", 30), stop("B2", 30)] });
const rf = r.rutefolge.join("");
eq("to klynger på hver sin side af lageret: hver klynge køres samlet (ingen zigzag)", ["A1A2B1B2", "A2A1B1B2", "A1A2B2B1", "A2A1B2B1", "B1B2A1A2", "B2B1A1A2", "B1B2A2A1", "B2B1A2A1"].includes(rf), true);
eq("…og kørslen er det mindste mulige: ud til 11 og hjem, så ud til −11 og hjem = 22 + 22 min = 22 km", r.noegletal.km, 22);
const pos9 = { lager: 0 }; const ni = [];
[90, 10, 80, 20, 70, 30, 60, 40, 50].forEach((p, i) => { pos9[`S${i}`] = p; ni.push(stop(`S${i}`, 10)); });
r = plan({ matrix: linje(pos9), stop: ni });
eq("9 stop (heuristik): alle besøges præcis én gang", [r.rutefolge.length, new Set(r.rutefolge).size], [9, 9]);
eq("9 stop på en linje i værste rækkefølge: kørslen ender på det mindste (ud til 90 og hjem = 90 km)", r.noegletal.km, 90);
r = plan({ matrix: M4, stop: [stop("A1", 30), stop("B1", 30), stop("A2", 30), stop("B2", 30)] });
const r2 = plan({ matrix: M4, stop: [stop("A1", 30), stop("B1", 30), stop("A2", 30), stop("B2", 30)] });
eq("samme input giver altid samme plan (deterministisk)", JSON.stringify(r) === JSON.stringify(r2), true);

// =====================================================================================================
// KØRSEL UDEN MATRIX
// =====================================================================================================
const koord = (id, lat, lon, min) => stop(id, min, { lat, lon });
r = planlaegDag({ dato: "2026-11-09", indstillinger: IND, bil: { id: "b" }, personer: [montoer()], lager: { lat: 55.4, lon: 10.4 }, stop: [koord("A", 55.45, 10.45, 60)] });
eq("uden matrix: skøn fra koordinater, og det meldes", [r.ok, r.forudsaetninger.skoenKoersel, r.advarsler.some((a) => a.regel === "koersel" && a.besked.includes("skøn")), r.noegletal.km > 0], [true, true, true, true]);
r = planlaegDag({ dato: "2026-11-09", indstillinger: IND, bil: { id: "b" }, personer: [montoer()], stop: [stop("A", 60)] });
eq("uden matrix og uden koordinater: køretid 0, men det meldes", [r.noegletal.koerselMin, r.advarsler.some((a) => a.besked.includes("koordinater"))], [0, true]);
eq("skoenMatrix: symmetrisk, 0 til sig selv, km = luftlinje × 1,3", (() => { const m = skoenMatrix([{ id: "a", lat: 55, lon: 10 }, { id: "b", lat: 56, lon: 10 }]); return [m.km[0][0], m.km[0][1] === m.km[1][0], Math.round(m.km[0][1])]; })(), [0, true, 145]);

// =====================================================================================================
// TILFØJ ET STOP (grundlag for forslag ved booking)
// =====================================================================================================
const base = { dato: "2026-11-09", indstillinger: IND, bil: { id: "b" }, personer: [montoer()], matrix: linje({ lager: 0, A: 10, B: 12, C: 80 }), stop: [stop("A", 60)] };
let v = vurderTilfoejelse(base, stop("B", 60));
eq("tilføj et stop ved siden af: muligt, koster kun ét stops tid + lidt kørsel", [v.mulig, v.ekstra.min, v.ekstra.km], [true, 65 + 4, 2]);
v = vurderTilfoejelse(base, stop("C", 60));
eq("tilføj et stop langt væk: muligt, men dyrere", [v.mulig, v.ekstra.km > 60], [true, true]);
v = vurderTilfoejelse(base, stop("B", 600));
eq("tilføj et stop, der ikke er plads til: ikke muligt, med årsag", [v.mulig, v.aarsager.some((x) => x.includes("arbejdstid") || x.includes("Dagen slutter"))], [false, true]);
v = vurderTilfoejelse({ ...base, stop: [] }, stop("B", 60));
eq("tilføj til en tom dag: ekstra er hele dagen", [v.mulig, v.ekstra.min > 60], [true, true]);

// PAUSE ER FLEKSIBEL (okt. 2026): ventetid kan rumme den; ellers er den en reserve; den placeres aldrig af systemet
r = plan({ matrix: M3, stop: [stop("A", 60, { tidsrum: { fra: 720, til: 900 } })], indstillinger: { koersel: { trafikTillaegPct: 0 } } });
eq("pause: ventetid på kunden (>= 30 min) rummer pausen, så der reserveres intet", [r.noegletal.venteMin >= 30, r.noegletal.pauseMin], [true, 0]);
r = plan({ matrix: M3, stop: tre, pauseMin: 0, indstillinger: { koersel: { trafikTillaegPct: 0 } } });
eq("pause 0 min: hjemme 16:35, 35 min over arbejdstidens slutning", [r.noegletal.hjemmeKl, r.brud[0].tal.overMin], ["16:35", 35]);


// INDIVIDUELLE REGLER PR. BRUGER (okt. 2026): oven på butikkens standard; ukendte regler/niveauer ignoreres; originalen røres ikke
{
  const butik = rensIndstillinger({ regler: { plads: "raadgivende" } });
  const med = medBrugerRegler(butik, { plads: "krav", nyttelast: "fra", hacker: "krav", toMand: "ugyldigt" });
  eq("brugerregler: overstyrer kendte regler, resten følger butikken", [med.regler.plads, med.regler.nyttelast, med.regler.toMand, "hacker" in med.regler], ["krav", "fra", "krav", false]);
  eq("brugerregler: butikkens indstillinger ændres ikke", [butik.regler.plads, butik.regler.nyttelast], ["raadgivende", "krav"]);
  eq("brugerregler: tom/ugyldig overstyring giver butikkens regler", [medBrugerRegler(butik, null).regler.plads, medBrugerRegler(butik, []).regler.plads, medBrugerRegler(butik, "x").regler.plads], ["raadgivende", "raadgivende", "raadgivende"]);
  const stor = { matrix: M2, bil: rumBil(210, 100, 200), stop: [stop("A", 60, { varer: [vare("k", 60, { l: 70, b: 70, h: 170 }, "Køleskab", { antal: 4 })] })] };
  eq("brugerregler: samme dag giver forskelligt udfald pr. bruger (rådgivende deler ikke ture)", [plan({ ...stor, indstillinger: medBrugerRegler(rensIndstillinger({}), { plads: "raadgivende" }) }).ture.length, plan({ ...stor, indstillinger: medBrugerRegler(rensIndstillinger({}), { plads: "krav" }) }).ture.length], [1, 2]);
}

// RUTEVALG: ingen priser - kortest samlet tid vinder, selv om en anden rækkefølge er kortere i km
{
  const asym = { ids: ["lager", "A", "B"], minutter: [[0, 10, 20], [10, 0, 5], [10, 5, 0]], km: [[0, 30, 5], [30, 0, 5], [30, 5, 0]] };
  // A→B: lager→A 10 min/30 km, A→B 5/5, B→lager 10/30 = 25 min, 65 km.  B→A: lager→B 20/5, B→A 5/5, A→lager 10/30 = 35 min, 40 km.
  const rr = plan({ matrix: asym, stop: [stop("A", 60), stop("B", 60)], indstillinger: { koersel: { trafikTillaegPct: 0 } } });
  eq("rutevalg: kortest tid (A→B, 25 min) vælges frem for kortest distance (B→A, 40 km)", [rr.rutefolge, rr.noegletal.koerselMin, rr.noegletal.km], [["A", "B"], 25, 65]);
  const lig = { ids: ["lager", "A", "B"], minutter: [[0, 10, 10], [10, 0, 10], [10, 10, 0]], km: [[0, 5, 20], [5, 0, 5], [5, 5, 0]] };
  // Lige lang tid begge veje (30 min): A→B er 5+5+5 = 15 km, B→A er 20+5+5 = 30 km.
  const r3 = plan({ matrix: lig, stop: [stop("B", 60), stop("A", 60)], indstillinger: { koersel: { trafikTillaegPct: 0 } } });
  eq("rutevalg: ved lige tid afgør distancen (A→B, 15 km)", [r3.rutefolge, r3.noegletal.km], [["A", "B"], 15]);
}

console.log(`\n${pass} bestået, ${fail} fejlet`);
process.exit(fail ? 1 : 0);
