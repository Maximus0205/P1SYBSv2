// SAMLET PLAN FOR MANGE UPLANLAGTE SAGER (oktober 2026).
//
// Forslagene på de enkelte kort (lib/forslagMotor.js) vurderer EN sag ad gangen og reserverer intet: ti sager kan derfor få samme bil og dag, og en
// ensom sag i Jylland kan få en bil, der kører 170 km for den. Her planlægges hele bunken i ÉT forløb, så sagerne fylder bilerne op efter hinanden:
//
//  1. Sagerne tages i rækkefølge efter FRIST (mest hastende først; uden frist sidst).
//  2. Hver sag lægges på den bil og dag, hvor den KOSTER MINDST (ekstra køretid + 0,2 · ekstra km) set i forhold til det, der allerede er planlagt -
//     også det, der er lagt på i dette forløb. Det samler af sig selv sagerne pr. egn: nr. 2 i Jylland lægges, hvor nr. 1 allerede kører hen.
//  3. En lille straf pr. dag (DAG_STRAF) gør, at sagen ikke udskydes uden grund; en bil med fast kørselsområde (Admin → Kapacitet) får et fortrin
//     (FORRANG_BONUS), når sagen ligger i dens område.
//  4. EN BIL KØRER ET STED PER DAG: en bil og dag får den egn (Fyn, Jylland eller øst for Storebælt, ud fra postnummeret), som dagens første sag ligger i, og
//     tager derefter kun sager fra samme egn. Ellers ender en Fyn-dag med en tur til Jylland for én enkelt sag. Sager uden kendt postnummer kan alle steder.
//  5. Kun hverdage fra og med foersteDato til og med sagens frist (højst 42 dage frem; uden frist 14 dage) er mulige. Kan sagen ikke være på nogen
//     bil inden fristen, står den under "ikkePlaceret" med årsagen - der gættes aldrig.
//
// Køretider er SKØNNEDE (luftlinje, ingen netværkskald), så en plan for hundredvis af sager er hurtig og ikke bruger ORS-kald. Resultatet er et
// FORSLAG: intet gemmes her - brugeren gennemser og godkender planen i Planlægning.
//
// Ren logik uden netværk, så den kan testes i Node (tests/samletPlan.test.mjs). Arbejdet køres i små skiver (pause + onProgress), så siden ikke hænger.
import { planlaegDag, skoenMatrix } from "../engine/kapacitet/index.js";
import { harForrang, postnrFraAdresse } from "../engine/kapacitet/omraade.js";
import { bilTilMotor, personerTilMotor } from "./dagsplan.js";
import { plusDage } from "./arbejdsuge.js";
import { urgensNoegle } from "./frist.js";

export const DAG_STRAF = 6;        // minutter pr. dag, sagen udskydes
export const FORRANG_BONUS = 45;   // minutter, en bil med fast område "sparer" på en sag i sit område
const STANDARD_DAGE = 14, MAKS_DAGE = 42;

const erWeekend = (iso) => { const d = new Date(`${iso}T12:00:00`).getDay(); return d === 0 || d === 6; };
const pause = () => new Promise((r) => setTimeout(r, 0));
const nu = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
// Egn ud fra postnummer: 5000-5999 = Fyn, fra 6000 = Jylland, under 5000 = øst for Storebælt. null = ukendt (ingen begrænsning).
export function egnFraAdresse(adresse) {
  const nr = Number(postnrFraAdresse(adresse));
  if (!Number.isFinite(nr) || nr < 1000 || nr > 9999) return null;
  return nr >= 6000 ? "jylland" : nr >= 5000 ? "fyn" : "oest";
}
const harKoord = (s) => Number.isFinite(s?.lat) && Number.isFinite(s?.lon);

function ekstraFra(foer, efter) {
  const a = foer?.noegletal || {}, b = efter?.noegletal || {};
  if (a.slutMin !== null && a.slutMin !== undefined) return { min: b.slutMin - a.slutMin, km: (b.km || 0) - (a.km || 0) };
  return { min: (b.slutMin ?? 0) - (b.startMin ?? 0), km: b.km || 0 };
}

// sager: uplanlagte ordrer (rå ordrer). ordreTilStop(ordre) -> stop med lat/lon/minutter.
// Returnerer { tildelinger: [{ ordreId, dato, bilId, bilNavn, ekstraMin, ekstraKm, begrundelse }], ikkePlaceret: [{ ordreId, aarsag }], noter, afbrudt }
export async function samletPlan({
  sager, orders, biler, vehicles, personnel, timeOff, crew, grundlag, lager, ordreTilStop, foersteDato,
  onProgress, afbrudt, skiveMs = 30,
}) {
  if (!grundlag || grundlag.fejl) return { tildelinger: [], ikkePlaceret: [], noter: [], fejl: grundlag?.fejl || "Butikkens kapacitetsindstillinger er ikke indlæst." };
  if (!lager || !Number.isFinite(lager.lat) || !Number.isFinite(lager.lon)) {
    return { tildelinger: [], ikkePlaceret: [], noter: [], fejl: "Lagerets placering kunne ikke findes. Skriv lagerets adresse under Admin → Kapacitet og tryk Gem." };
  }
  const batchIds = new Set((sager || []).map((s) => s.id));
  const aktiveBiler = (biler || []).filter((b) => !b.lukket);
  const noter = [];

  // Det, der allerede er planlagt, grupperet pr. dato og bil (sagerne i bunken selv ligger ikke på nogen dag).
  const eksisterende = new Map();
  for (const o of orders || []) {
    if (!o.dato || !o.bilId || o.status === "afsluttet" || batchIds.has(o.id)) continue;
    const k = `${o.dato}|${o.bilId}`;
    if (!eksisterende.has(k)) eksisterende.set(k, []);
    eksisterende.get(k).push(o);
  }

  const dage = new Map(); // "dato|bil" -> { bil, personer, pauseMin, stop, foer } | null
  const input = (d, stop) => ({
    dato: d.dato, indstillinger: grundlag.indstillinger, lager: { lat: lager.lat, lon: lager.lon }, bil: d.bil, personer: d.personer, pauseMin: d.pauseMin, stop,
    matrix: skoenMatrix([{ id: "lager", lat: lager.lat, lon: lager.lon }, ...stop.map((s) => ({ id: s.id, lat: s.lat, lon: s.lon }))]),
  });
  const hentDag = (dato, t) => {
    const nogle = `${dato}|${t.id}`;
    if (dage.has(nogle)) return dage.get(nogle);
    const vRow = (vehicles || []).find((v) => v.id === t.id);
    const bil = bilTilMotor(vRow, t);
    const hjaelperIds = (crew?.helpers || []).filter((h) => h.dato === dato && h.vehicleId === t.id).map((h) => h.personId);
    const bortePersonIds = (crew?.helpers || []).filter((h) => h.dato === dato && h.vehicleId !== t.id).map((h) => h.personId);
    const { personer, pauseMin } = personerTilMotor({ dato, bilId: t.id, personnel, timeOff, arbejdstider: grundlag.arbejdstider, uaendringer: grundlag.uaendringer, indstillinger: grundlag.indstillinger, hjaelperIds, bortePersonIds });
    let d = null;
    if (personer.length > 0) {
      const stop = (eksisterende.get(nogle) || []).map(ordreTilStop);
      if (stop.some((s) => !harKoord(s))) {
        noter.push(`${bil.navn} ${dato}: springes over - koordinater mangler på en allerede planlagt sag.`);
      } else {
        // Dagens egn: kun hvis alle allerede planlagte sager er i samme egn (ellers ingen begrænsning).
        const egne = new Set((eksisterende.get(nogle) || []).map((o) => egnFraAdresse(ordreTilStop(o).adresse)).filter(Boolean));
        d = { dato, bil, personer, pauseMin, stop, egn: egne.size === 1 ? [...egne][0] : null };
        d.foer = planlaegDag(input(d, stop));
      }
    }
    dage.set(nogle, d);
    return d;
  };

  const sorteret = [...(sager || [])].sort((a, b) => urgensNoegle(a).localeCompare(urgensNoegle(b)) || String(a.nr || a.id).localeCompare(String(b.nr || b.id)));
  const tildelinger = [];
  const ikkePlaceret = [];
  let sidstGivetLuft = nu();
  let gjort = 0;

  for (const ordre of sorteret) {
    if (afbrudt?.()) return { tildelinger, ikkePlaceret, noter, afbrudt: true };
    if (nu() - sidstGivetLuft > skiveMs) {
      onProgress?.({ gjort, total: sorteret.length });
      await pause();
      sidstGivetLuft = nu();
      if (afbrudt?.()) return { tildelinger, ikkePlaceret, noter, afbrudt: true };
    }
    gjort++;

    const kand = { ...ordreTilStop(ordre), id: "kandidat" };
    if (!harKoord(kand)) { ikkePlaceret.push({ ordreId: ordre.id, aarsag: "Adressen mangler koordinater - vælg adressen fra forslagene på sagen." }); continue; }
    const kandEgn = egnFraAdresse(kand.adresse);
    const frist = ordre.senestDato || null;
    const sidste = frist && frist < plusDage(foersteDato, MAKS_DAGE - 1) ? frist : plusDage(foersteDato, (frist ? MAKS_DAGE : STANDARD_DAGE) - 1);
    if (frist && frist < foersteDato) { ikkePlaceret.push({ ordreId: ordre.id, aarsag: `Fristen (${frist}) er allerede passeret eller for tæt på.` }); continue; }

    let bedst = null;
    let idx = 0;
    for (let dato = foersteDato; dato <= sidste; dato = plusDage(dato, 1)) {
      if (erWeekend(dato)) continue;
      const straf = idx * DAG_STRAF;
      idx++;
      if (bedst && straf - FORRANG_BONUS > bedst.score) break; // senere dage kan ikke slå den bedste, selv med forrang
      for (const t of aktiveBiler) {
        const d = hentDag(dato, t);
        if (!d) continue;
        if (kandEgn && d.egn && d.egn !== kandEgn) continue;                       // en bil kører ét sted pr. dag
        if (d.foer?.noegletal?.ledigMin !== undefined && d.foer.noegletal.ledigMin < kand.minutter) continue; // sagens egen arbejdstid kan ikke engang være der
        const stopMed = [...d.stop, kand];
        const efter = planlaegDag(input(d, stopMed));
        if (!efter.ok) continue;
        const e = ekstraFra(d.foer, efter);
        const forrang = harForrang(d.bil, kand.adresse, grundlag.indstillinger?.omraader);
        const score = e.min + e.km * 0.2 + straf - (forrang ? FORRANG_BONUS : 0);
        if (!bedst || score < bedst.score) bedst = { score, d, efter, e, stopMed, forrang };
      }
    }

    if (!bedst) {
      ikkePlaceret.push({ ordreId: ordre.id, aarsag: frist ? `Ingen bil har plads inden fristen ${frist}.` : "Ingen bil har plads de næste 14 dage." });
      continue;
    }
    // Sagen lægges på dagen med sit rigtige id, så den tæller med for de næste sager.
    const mit = { ...kand, id: String(ordre.id) };
    bedst.d.stop = [...bedst.d.stop, mit];
    if (!bedst.d.egn && kandEgn && bedst.d.stop.length === 1) bedst.d.egn = kandEgn;
    bedst.d.foer = planlaegDag(input(bedst.d, bedst.d.stop));
    tildelinger.push({
      ordreId: ordre.id, dato: bedst.d.dato, bilId: bedst.d.bil.id, bilNavn: bedst.d.bil.navn,
      ekstraMin: Math.round(bedst.e.min), ekstraKm: Math.round(bedst.e.km * 10) / 10, forrang: !!bedst.forrang,
    });
  }
  onProgress?.({ gjort, total: sorteret.length });
  return { tildelinger, ikkePlaceret, noter, afbrudt: false };
}
