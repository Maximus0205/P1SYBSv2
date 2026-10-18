// Regressionstest til lib/dagsplan.js (bygger motorens input til tidsbadget i Planlægning). Kør med: node tests/dagsplan.test.mjs
import { bilTilMotor, personerTilMotor, beregnBilDag, badgeFraMotor } from "../src/lib/dagsplan.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};
const IND = { koersel: { trafikTillaegPct: 0 } };
const dato = "2026-11-09"; // mandag

// bil
eq("bil: felter og tempo", bilTilMotor({ id: "b1", navn: "Bil 1", tempo: "130", nyttelastKg: 1200, lasterum: { laengdeCm: 380, breddeCm: 170, hoejdeCm: 200 } }).tempo, 130);
eq("bil: uden lasterum giver null, ikke 0", bilTilMotor({ id: "b1", nyttelastKg: 1000 }).lasterum, null);

// personer
const pers = [{ id: "p1", navn: "Kim", bilId: "b1" }, { id: "p2", navn: "Magnus", bilId: "b1" }, { id: "p3", navn: "Anden bil", bilId: "b2" }];
const a = personerTilMotor({ dato, bilId: "b1", personnel: pers, timeOff: [], arbejdstider: [], uaendringer: [], indstillinger: IND });
eq("personer: kun bilens personer, første er montør", a.personer.map((p) => [p.id, p.rolle]), [["p1", "montoer"], ["p2", "medhjaelper"]]);
const b = personerTilMotor({ dato, bilId: "b1", personnel: pers, timeOff: [{ montorId: "p1", startDato: dato, slutDato: dato, type: "sygdom" }], arbejdstider: [], uaendringer: [], indstillinger: IND });
eq("personer: syg montør udelades, næste bliver montør", b.personer.map((p) => [p.id, p.rolle]), [["p2", "montoer"]]);
const c = personerTilMotor({ dato, bilId: "b1", personnel: pers, timeOff: [], arbejdstider: [{ person_id: "p1", weekday: 1, arbejder: false }], uaendringer: [{ person_id: "p2", dato, from_min: 480, to_min: 720 }], indstillinger: IND });
eq("personer: fridag og ikke-tilgængelig tidsrum respekteres", c.personer.map((p) => [p.id, p.vinduer]), [["p2", [{ fra: 720, til: 960 }]]]);

// dag
const stop = (id, min, lat, lon) => ({ id, navn: id, minutter: min, lat, lon, varer: [] });
const bil = bilTilMotor({ id: "b1", navn: "Bil 1" });
const dag = beregnBilDag({ dato, bil, personer: a.personer, pauseMin: 30, stop: [stop("s1", 60, 55.4, 10.4), stop("s2", 60, 55.41, 10.41)], lager: { lat: 55.4, lon: 10.4 }, indstillinger: IND });
const bdg = badgeFraMotor(dag);
eq("dag: motor svarer og badge har minutter", [!!dag.res, bdg.minutter > 120, bdg.fejl], [true, true, null]);
eq("dag: badge-tid er start til hjemme", bdg.minutter, dag.res.noegletal.slutMin - dag.res.noegletal.startMin);

// overbelastet: 9 timers arbejde på en 8-timers dag
const fuld = beregnBilDag({ dato, bil, personer: a.personer, pauseMin: 30, stop: [stop("s1", 540, 55.4, 10.4)], lager: { lat: 55.4, lon: 10.4 }, indstillinger: IND });
eq("dag: for meget arbejde markeres overbelastet", badgeFraMotor(fuld).overbelastet, true);

// fejl bliver synlig, ikke 0
eq("fejl: motoren kaster -> fejl, ikke 0", typeof badgeFraMotor({ fejl: "x" }).fejl, "string");
eq("fejl: ugyldigt input giver fejl-objekt eller gyldigt svar, aldrig undefined", (() => { const r = beregnBilDag({ dato, bil, personer: null, pauseMin: 0, stop: null, indstillinger: IND }); return !!(r.res || r.fejl); })(), true);

// medhjælpere (dagens hold)
{
  const pers = [{ id: "m1", navn: "Montør", bilId: "b1", rolle: "montor" }, { id: "h1", navn: "Hjælper", bilId: null, rolle: "medhjaelper" }];
  const med = personerTilMotor({ dato, bilId: "b1", personnel: pers, timeOff: [], arbejdstider: [], uaendringer: [], indstillinger: IND, hjaelperIds: ["h1"] });
  eq("hold: montør først, medhjælper som medhjælper", med.personer.map((p) => `${p.id}:${p.rolle}`), ["m1:montoer", "h1:medhjaelper"]);
  const syg = personerTilMotor({ dato, bilId: "b1", personnel: pers, timeOff: [{ montorId: "m1", startDato: dato, slutDato: dato, type: "sygdom" }], arbejdstider: [], uaendringer: [], indstillinger: IND, hjaelperIds: ["h1"] });
  eq("hold: montør syg -> medhjælperen bliver ikke montør", syg.personer, []);
  const uden = personerTilMotor({ dato, bilId: "b1", personnel: pers, timeOff: [], arbejdstider: [], uaendringer: [], indstillinger: IND });
  eq("hold: uden hjaelperIds kun montør", uden.personer.map((p) => p.id), ["m1"]);
}

// manglende koordinater = fejlkode i badgen, aldrig et stille 0 / et tal
{
  const uden = beregnBilDag({ dato, bil, personer: a.personer, pauseMin: 0, stop: [stop("s1", 60, 55.4, 10.4), stop("s2", 60)], lager: { lat: 55.4, lon: 10.4 }, indstillinger: IND });
  const bg = badgeFraMotor(uden);
  eq("manglende koordinater: badge giver fejl og ingen minutter", [bg.minutter, typeof bg.fejl, bg.fejl.includes("koordinater")], [null, "string", true]);
}

// 2. MAND (oktober 2026): en MONTØR kan være 2. mand på en anden bil
{
  const pers2 = [
    { id: "m1", navn: "Montør 1", bilId: "b1", rolle: "montor" },
    { id: "m2", navn: "Montør 2", bilId: "b2", rolle: "montor" },
  ];
  const med = personerTilMotor({ dato, bilId: "b1", personnel: pers2, timeOff: [], arbejdstider: [], uaendringer: [], indstillinger: IND, hjaelperIds: ["m2"] });
  eq("2. mand: montør på anden bil kører med som medhjælper (ikke montør)", med.personer.map((p) => [p.id, p.rolle]), [["m1", "montoer"], ["m2", "medhjaelper"]]);
  const hjemme = personerTilMotor({ dato, bilId: "b2", personnel: pers2, timeOff: [], arbejdstider: [], uaendringer: [], indstillinger: IND, bortePersonIds: ["m2"] });
  eq("2. mand: montøren er væk fra sin egen bil den dag", hjemme.personer, []);
  const uden = personerTilMotor({ dato, bilId: "b1", personnel: pers2, timeOff: [{ montorId: "m1", startDato: dato, slutDato: dato, type: "sygdom" }], arbejdstider: [], uaendringer: [], indstillinger: IND, hjaelperIds: ["m2"] });
  eq("2. mand: kører ikke med, hvis bilens egen montør er syg (ellers bliver 2. mand chauffør)", uden.personer, []);
  const dublet = personerTilMotor({ dato, bilId: "b1", personnel: pers2, timeOff: [], arbejdstider: [], uaendringer: [], indstillinger: IND, hjaelperIds: ["m1"] });
  eq("2. mand: samme person tælles ikke to gange på egen bil", dublet.personer.map((p) => p.id), ["m1"]);
}

console.log(`${pass} bestået, ${fail} fejlet`);
if (fail) process.exit(1);
