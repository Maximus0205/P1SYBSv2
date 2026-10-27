// Test af lib/forslagMotor.js (forslag til dato/bil bygger på kapacitetsmotoren). Kør med: node tests/forslagMotor.test.mjs
import { motorForslag } from "../src/lib/forslagMotor.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

const IND = { koersel: { trafikTillaegPct: 0 } };
const lager = { lat: 55.4, lon: 10.4 };
const biler = [{ id: "b1", navn: "Bil 1" }, { id: "b2", navn: "Bil 2" }];
const personnel = [{ id: "p1", navn: "Kim", bilId: "b1" }, { id: "p2", navn: "Ida", bilId: "b2" }];
const grundlag = { indstillinger: IND, arbejdstider: [], uaendringer: [] };
const dates = ["2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]; // lør, søn, man-fre
const ordreTilStop = (o) => ({ id: o.id, navn: o.id, minutter: o.min || 60, lat: o.lat ?? null, lon: o.lon ?? null, varer: [] });
const ordre = (id, dato, bilId, lat, lon, min) => ({ id, dato, bilId, status: "booket", lat, lon, min });
const kandidat = { navn: "Ny", adresse: "x", lat: 55.41, lon: 10.41, minutter: 60 };
const base = { kandidat, dates, orders: [], biler, vehicles: [], personnel, timeOff: [], crew: { helpers: [] }, grundlag, lager, ordreTilStop, idag: "2026-11-09", hentMatrix: null };

let r = await motorForslag({ ...base });
eq("tom plan: forslag fra tidligste hverdag, ikke weekend/passeret", [r.forslag.length, r.forslag.every((f) => f.dato >= "2026-11-09" && !["2026-11-14", "2026-11-15"].includes(f.dato)), r.forslag[0].dato], [3, true, "2026-11-09"]);
eq("forslag har dato, bil og begrundelse", [typeof r.forslag[0].bilNavn, r.forslag[0].begrundelse.includes("min"), r.forslag[0].skoen], ["string", true, true]);
eq("højst ét forslag pr. dato", new Set(r.forslag.map((f) => f.dato)).size, r.forslag.length);

r = await motorForslag({ ...base, kandidat: { ...kandidat, lat: null, lon: null } });
eq("kandidat uden koordinater: fejl, ingen forslag", [r.forslag.length, typeof r.fejl, r.fejl.includes("koordinater")], [0, "string", true]);

r = await motorForslag({ ...base, lager: {} });
eq("lager uden koordinater: fejl", [r.forslag.length, typeof r.fejl], [0, "string"]);

r = await motorForslag({ ...base, grundlag: { fejl: "ingen indstillinger" } });
eq("manglende grundlag: fejl", [r.forslag.length, r.fejl], [0, "ingen indstillinger"]);

// En sag uden koordinater gør netop den bil/dag uvurderlig - den udelades og meldes
r = await motorForslag({ ...base, dates: ["2026-11-09"], orders: [ordre("o1", "2026-11-09", "b1", null, null, 60)] });
eq("sag uden koordinater: kombinationen udelades og meldes", [r.forslag.map((f) => f.bilId), r.noter.length], [["b2"], 1]);

// En fyldt dag foreslås ikke
const fyldt = Array.from({ length: 6 }, (_, i) => ordre(`f${i}`, "2026-11-09", "b1", 55.4, 10.4, 120));
r = await motorForslag({ ...base, dates: ["2026-11-09"], orders: fyldt, biler: [biler[0]] });
eq("fyldt dag: intet forslag", r.forslag.length, 0);

// Forslag vises med tidligste dato først
r = await motorForslag({ ...base, dates: ["2026-11-12", "2026-11-10", "2026-11-11"], biler: [biler[0]], orders: [ordre("n1", "2026-11-11", "b1", 55.412, 10.412, 60)] });
eq("rangering: tidligste dato først", r.forslag.map((f) => f.dato), ["2026-11-10", "2026-11-11", "2026-11-12"]);

// Pr. dato vælges den bil, der giver færrest ekstra minutter (her: bilen med en nabo-sag lige ved)
r = await motorForslag({ ...base, dates: ["2026-11-10"], orders: [ordre("n1", "2026-11-10", "b2", 55.412, 10.412, 60)] });
eq("bilvalg: bilen med nabo-sag giver mindst ekstra tid", r.forslag.map((f) => f.bilId), ["b2"]);

// Rigtig matrix bruges til de bedste; skøn-flaget forsvinder
let kald = 0;
const hentMatrix = async (punkter) => { kald++; const ids = punkter.map((p) => p.id); return { ids, minutter: ids.map((a) => ids.map((b) => (a === b ? 0 : 10))), km: ids.map((a) => ids.map((b) => (a === b ? 0 : 5))) }; };
r = await motorForslag({ ...base, hentMatrix });
eq("rigtig matrix: forslag uden skøn, og kun få ORS-kald", [r.forslag.every((f) => f.skoen === false), kald <= 6, kald > 0], [true, true, true]);

// ORS svigter -> skøn, og forslagene findes stadig
r = await motorForslag({ ...base, kandidat: { ...kandidat, lat: 55.43, lon: 10.43 }, hentMatrix: async () => { throw new Error("nede"); } }); // andre koordinater end ovenfor, så en cachet matrix ikke bruges
eq("ORS nede: skønnede forslag", [r.forslag.length > 0, r.forslag.every((f) => f.skoen)], [true, true]);

// Omplanlægning: oprindelig dato foretrækkes mildt, og sagens egen plads tæller ikke med
r = await motorForslag({ ...base, dates: ["2026-11-10", "2026-11-12"], biler: [biler[0]], originalDate: "2026-11-12", orders: [ordre("sag", "2026-11-12", "b1", 55.41, 10.41, 60)], ekskluderSagId: "sag" });
eq("omplanlægning: uændret dato i begrundelsen", r.forslag.find((f) => f.dato === "2026-11-12").begrundelse.includes("uændret dato"), true);

// Lukkede biler og biler uden personer udelades
r = await motorForslag({ ...base, biler: [{ id: "b1", navn: "Bil 1", lukket: true }, { id: "b3", navn: "Bil 3" }, biler[1]] });
eq("lukket bil og bil uden personer udelades", [...new Set(r.forslag.map((f) => f.bilId))], ["b2"]);

// Tidlig afbrydelse: at stoppe, når de tidligste datoer er fundet, giver SAMME forslag som at vurdere alle datoer (raffiner stort = ingen afbrydelse)
{
  const lang = Array.from({ length: 30 }, (_, i) => { const d = new Date(Date.parse("2026-11-09T12:00:00Z") + i * 864e5); return d.toISOString().slice(0, 10); });
  const optaget = Array.from({ length: 3 }, (_, i) => ordre(`x${i}`, "2026-11-10", "b1", 55.41 + i * 0.01, 10.41, 120));
  const hurtig = await motorForslag({ ...base, dates: [...lang].reverse(), orders: optaget });
  const fuld = await motorForslag({ ...base, dates: lang, orders: optaget, raffiner: 100 });
  eq("tidlig afbrydelse giver samme forslag som fuld gennemgang", hurtig.forslag.map((f) => [f.dato, f.bilId]), fuld.forslag.map((f) => [f.dato, f.bilId]));
}

console.log(`${pass} bestået, ${fail} fejlet`);
if (fail) process.exit(1);
