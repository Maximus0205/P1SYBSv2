// FORSLAG TIL DATO OG BIL = KAPACITETSMOTOREN (oktober 2026).
//
// Før havde forslagene (booking: "Foreslåede datoer", Planlægning: "Kræver handling") en egen, enklere pointmodel (lib/scheduling.js, fjernet: fast
// arbejdsdag på 7,5 t, "samme opgang", luftlinje/ORS-afstand til andre sager). Den kendte hverken lagerlæsning, omlastning, pause, trafiktillæg,
// personernes rigtige arbejdstider eller ventetid til tidsrum - og kunne derfor foreslå en dag, som badget i Planlægning bagefter viste som
// overfyldt. Nu er det SAMME motor (planlaegDag / vurderTilfoejelse) og SAMME input-bygning (lib/dagsplan.js) som badget, så forslag og planlægning
// altid hænger sammen.
//
// Fremgangsmåde (holder antallet af ORS-kald nede):
//  1. Alle (dato, bil)-kombinationer vurderes med motoren og en SKØNNET matrix (luftlinje, ingen netværkskald).
//  2. Bedste bil pr. dato vurderes igen med den RIGTIGE køretidsmatrix (ORS) for de tidligste datoer; forslagene vises tidligste dato først.
//     Svigter ORS, bruges skønnet, og forslaget markeres med "~".
// Mangler en sag på dagen koordinater, kan dagen ikke vurderes og udelades (og det meldes i noter) - der gættes aldrig.
// Ren logik: netværk (hentMatrix) og sagsomsætning (ordreTilStop) sendes ind, så den kan testes i Node (tests/forslagMotor.test.mjs).
import { vurderTilfoejelse, skoenMatrix } from "../engine/kapacitet/index.js";
import { harJyllandForrang } from "../engine/kapacitet/omraade.js";
import { bilTilMotor, personerTilMotor } from "./dagsplan.js";

const erWeekend = (iso) => { const d = new Date(`${iso}T12:00:00`).getDay(); return d === 0 || d === 6; };
const dageMellem = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 86400000);
const afrund1 = (x) => Math.round(x * 10) / 10;

// Valg af BIL pr. dato: færrest ekstra minutter, så færrest ekstra km. Forslagene vises derefter med TIDLIGSTE DATO FØRST (kortest ventetid for kunden) -
// samme princip som serverens ombookingsforslag (kapacitet-tjek: rangerForslag), så booking og ombooking følger samme regel.
function score(v) {
  const e = v.ekstra || { min: 0, km: 0 };
  return e.min + e.km * 0.2;
}

function begrund(v, bilNavn, dato, originalDate) {
  const n = v.efter.noegletal;
  const e = v.ekstra || { min: 0, km: 0 };
  const skoen = !!v.efter.forudsaetninger?.skoenKoersel;
  const dele = [`${bilNavn}: ${skoen ? "~" : ""}+${Math.round(e.min)} min · +${afrund1(e.km)} km`];
  if (n.hjemmeKl) dele.push(`hjemme kl. ${n.hjemmeKl}`);
  if (n.ledigMin > 0) dele.push(`${n.ledigMin} min ledig`);
  if (originalDate) {
    const flyt = dageMellem(originalDate, dato);
    if (flyt === 0) dele.push("uændret dato");
    else if (flyt > 0) dele.push(`${flyt} ${flyt === 1 ? "dag" : "dage"} senere`);
  }
  return dele.join(" · ");
}

const matrixCache = new Map();
async function matrixFor(hentMatrix, punkter) {
  if (!hentMatrix || punkter.length < 2) return null;
  const noegle = punkter.map((p) => `${p.id}:${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join("|");
  if (matrixCache.has(noegle)) return matrixCache.get(noegle);
  let m = null;
  try { m = (await hentMatrix(punkter)) || null; } catch { m = null; }
  if (m) { if (matrixCache.size > 200) matrixCache.clear(); matrixCache.set(noegle, m); }
  return m;
}

// kandidat: { id?, navn, adresse, lat, lon, minutter, tidsrum?, kraever2Mand?, varer? } - samme form som et stop i dagsplan.
// Returnerer { forslag: [...], noter: [...], fejl?: "..." }. fejl = forslag kan slet ikke beregnes (fx adressen mangler koordinater).
export async function motorForslag({
  kandidat, dates, orders, biler, vehicles, personnel, timeOff, crew, grundlag, lager, hentMatrix, ordreTilStop,
  idag, originalDate, ekskluderSagId, max = 3, raffiner = 6,
}) {
  if (!grundlag || grundlag.fejl) return { forslag: [], noter: [], fejl: grundlag?.fejl || "Butikkens kapacitetsindstillinger er ikke indlæst." };
  if (!kandidat || !Number.isFinite(kandidat.lat) || !Number.isFinite(kandidat.lon)) {
    return { forslag: [], noter: [], fejl: "Adressen mangler koordinater - vælg adressen fra forslagene, så kan der beregnes forslag." };
  }
  if (!lager || !Number.isFinite(lager.lat) || !Number.isFinite(lager.lon)) {
    return { forslag: [], noter: [], fejl: "Butikkens lageradresse mangler koordinater - forslag kan ikke beregnes." };
  }
  const kandStop = { id: "kandidat", navn: kandidat.navn || "Ny sag", varer: [], kraever2Mand: false, ...kandidat };
  const noter = [];
  const kombinationer = [];

  for (const dato of dates || []) {
    if (dato < idag || erWeekend(dato)) continue;
    for (const t of (biler || []).filter((b) => !b.lukket)) {
      const vRow = (vehicles || []).find((v) => v.id === t.id);
      const bil = bilTilMotor(vRow, t);
      const hjaelperIds = (crew?.helpers || []).filter((h) => h.dato === dato && h.vehicleId === t.id).map((h) => h.personId);
      const { personer, pauseMin } = personerTilMotor({ dato, bilId: t.id, personnel, timeOff, arbejdstider: grundlag.arbejdstider, uaendringer: grundlag.uaendringer, indstillinger: grundlag.indstillinger, hjaelperIds });
      if (personer.length === 0) continue; // ingen på bilen den dag
      const dagensOrdrer = (orders || []).filter((o) => o.dato === dato && o.bilId === t.id && o.status !== "afsluttet" && o.id !== ekskluderSagId);
      const stop = dagensOrdrer.map(ordreTilStop);
      const uden = stop.filter((s) => !Number.isFinite(s.lat) || !Number.isFinite(s.lon));
      if (uden.length > 0) { noter.push(`${bil.navn} ${dato}: kan ikke vurderes - koordinater mangler på ${uden.length} ${uden.length === 1 ? "sag" : "sager"}.`); continue; }
      kombinationer.push({ dato, bil, personer, pauseMin, stop });
    }
  }

  const input = (k, matrix) => ({ dato: k.dato, indstillinger: grundlag.indstillinger, lager: { lat: lager.lat, lon: lager.lon }, bil: k.bil, personer: k.personer, pauseMin: k.pauseMin, stop: k.stop, matrix });
  const punkterFor = (k) => [{ id: "lager", lat: lager.lat, lon: lager.lon }, ...[...k.stop, kandStop].map((s) => ({ id: s.id, lat: s.lat, lon: s.lon }))];

  // 1. Screening med skønnet matrix.
  const vurderet = [];
  for (const k of kombinationer) {
    const v = vurderTilfoejelse(input(k, skoenMatrix(punkterFor(k))), kandStop);
    // Forrang: en fast Jylland-bil vælges frem for en anden bil på samme dag, når sagen ligger i Jylland og begge kan tage den. Den udelukker ingen.
    if (v.mulig) vurderet.push({ k, v, s: score(v), forrang: harJyllandForrang(k.bil, kandStop.adresse) });
  }
  vurderet.sort((a, b) => (b.forrang - a.forrang) || (a.s - b.s));

  // Bedste bil pr. dato; datoerne i kronologisk rækkefølge (tidligste først).
  const set = new Set();
  const bedstePrDato = [];
  for (const x of vurderet) { if (set.has(x.k.dato)) continue; set.add(x.k.dato); bedstePrDato.push(x); }
  bedstePrDato.sort((a, b) => (a.k.dato < b.k.dato ? -1 : a.k.dato > b.k.dato ? 1 : 0));

  // 2. De bedste vurderes igen med rigtig køretid.
  const raffineret = [];
  for (const x of bedstePrDato.slice(0, Math.max(raffiner, max))) {
    const m = await matrixFor(hentMatrix, punkterFor(x.k));
    if (!m) { raffineret.push(x); continue; }
    const v = vurderTilfoejelse(input(x.k, m), kandStop);
    if (v.mulig) raffineret.push({ k: x.k, v, s: score(v), forrang: x.forrang });
    // Er den ikke mulig med de rigtige tider, udgår kombinationen (skønnet var for optimistisk).
  }
  raffineret.sort((a, b) => (a.k.dato < b.k.dato ? -1 : a.k.dato > b.k.dato ? 1 : 0));

  const forslag = raffineret.slice(0, max).map(({ k, v, forrang }) => ({
    dato: k.dato, bilId: k.bil.id, bilNavn: k.bil.navn, montorId: k.bil.id, montorNavn: k.bil.navn,
    begrundelse: begrund(v, k.bil.navn, k.dato, originalDate) + (forrang ? " · fast Jylland-bil" : ""),
    ekstraMin: Math.round(v.ekstra?.min ?? 0), ekstraKm: afrund1(v.ekstra?.km ?? 0),
    hjemmeKl: v.efter.noegletal.hjemmeKl || null, ledigMin: v.efter.noegletal.ledigMin ?? null,
    skoen: !!v.efter.forudsaetninger?.skoenKoersel,
  }));
  return { forslag, noter };
}
