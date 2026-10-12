// BILLEDDAGENS TID I PLANLÆGNING = KAPACITETSMOTOREN (oktober 2026).
//
// Tidsbadget i Planlægning (fx "3t35m") blev før regnet med en egen, ældre formel (sagernes minutter x bilens tempo + ruteopslag, mod en fast
// arbejdsdag på 7,5 t). Den kendte hverken lagerlæsning, omlastning, pause, trafiktillæg, personernes rigtige arbejdstider eller ventetid til
// tidsrum, og kunne derfor vise noget andet end motoren (Kapacitetslab / booking). Nu bygges motorens input her, og motoren (planlaegDag) er
// den ENESTE kilde til dagens tid. Filen er ren logik uden netværk, så den kan testes (tests/dagsplan.test.mjs).
import { planlaegDag, dagensTilgaengelighed } from "../engine/kapacitet/index.js";

const tal = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// Bilens egenskaber til motoren. vehicleRow er bilens gemte række (nyttelast, lasterum, tempo); mangler et felt, sendes null, og motoren
// springer den kontrol over og skriver det i sine forudsætninger.
export function bilTilMotor(vehicleRow, fallbackRow) {
  const v = { ...(fallbackRow || {}), ...(vehicleRow || {}) };
  const l = tal(v.lasterum?.laengdeCm); const b = tal(v.lasterum?.breddeCm); const h = tal(v.lasterum?.hoejdeCm);
  return {
    id: String(v.id), navn: v.navn || v.bil || "Bil", tempo: tal(v.tempo) || 100, nyttelastKg: tal(v.nyttelastKg), vaerktoejKg: tal(v.vaerktoejKg) || 0,
    lasterum: l && b && h ? { laengdeCm: l, breddeCm: b, hoejdeCm: h } : null,
  };
}

// Personerne på bilen den dag, med deres rigtige arbejdstid (person_work_hours), fravær og "ikke tilgængelig"-tidsrum.
// Den første, der arbejder, er montør; øvrige på bilen er medhjælpere (en bil med to personer kan løfte "to mand"-stop).
//
// MEDHJÆLPERE (oktober 2026): hjaelperIds er dagens medhjælpere på netop denne bil (tabellen day_helpers). De lægges EFTER bilens faste montører,
// så en montør altid er den første - en medhjælper bliver aldrig "montør" for motoren, og bilen får først en helper, når der er en montør.
export function arbejderDenDag({ dato, personId, timeOff, arbejdstider, uaendringer, indstillinger }) {
  return dagensTilgaengelighed({
    dato, indstillinger,
    raekker: (arbejdstider || []).filter((r) => r.person_id === personId),
    fravaer: (timeOff || []).filter((f) => f.montorId === personId),
    uaendringer: (uaendringer || []).filter((u) => u.person_id === personId).map((u) => ({ dato: u.dato, fraMin: u.from_min, tilMin: u.to_min })),
  });
}

export function personerTilMotor({ dato, bilId, personnel, timeOff, arbejdstider, uaendringer, indstillinger, hjaelperIds }) {
  const fast = (personnel || []).filter((p) => p.bilId === bilId && p.rolle !== "medhjaelper");
  const hjaelpere = (hjaelperIds || []).map((id) => (personnel || []).find((p) => p.id === id)).filter(Boolean);
  const ud = [];
  let pauseMin = null;
  let fastArbejder = 0;
  for (const p of [...fast, ...hjaelpere]) {
    // En medhjælper kører kun med, hvis bilens montør faktisk arbejder - ellers ville motoren gøre vedkommende til montør.
    if (p.rolle === "medhjaelper" && fastArbejder === 0) continue;
    const t = dagensTilgaengelighed({
      dato, indstillinger,
      raekker: (arbejdstider || []).filter((r) => r.person_id === p.id),
      fravaer: (timeOff || []).filter((f) => f.montorId === p.id),
      uaendringer: (uaendringer || []).filter((u) => u.person_id === p.id).map((u) => ({ dato: u.dato, fraMin: u.from_min, tilMin: u.to_min })),
    });
    if (!t.arbejder) continue;
    if (p.rolle !== "medhjaelper") fastArbejder += 1;
    if (pauseMin === null) pauseMin = t.pauseMin;
    ud.push({ id: String(p.id), navn: p.navn || "Person", rolle: ud.length === 0 ? "montoer" : "medhjaelper", vinduer: t.vinduer });
  }
  return { personer: ud, pauseMin: pauseMin ?? 0 };
}

// Beregner én bils dag. stop er allerede i motorens format. matrix er valgfri (uden den skønner motoren køretid ud fra luftlinje og siger det).
// Returnerer altid et objekt: { res } ved succes, { fejl } hvis motoren fejler - aldrig et stille 0.
export function beregnBilDag({ dato, bil, personer, pauseMin, stop, matrix, lager, indstillinger }) {
  try {
    const res = planlaegDag({ dato, indstillinger, lager: lager || undefined, bil, personer, pauseMin, stop, matrix: matrix || undefined });
    return { res };
  } catch (e) {
    return { fejl: `Motoren fejlede: ${e?.message || e}` };
  }
}

// Det badgen viser ud fra motorens svar. Tid = fra dagens start til bilen er hjemme. Rød hvis motoren melder brud på et krav (fx arbejdstid
// overskredet, nyttelast, to mand) - ikke ud fra en fast grænse.
export function badgeFraMotor(r) {
  if (!r) return null;
  if (r.fejl) return { minutter: null, overbelastet: false, fejl: r.fejl, titel: r.fejl };
  const res = r.res; const n = res.noegletal;
  const minutter = n.startMin != null && n.slutMin != null ? Math.max(0, n.slutMin - n.startMin) : 0;
  const linjer = [];
  if (n.hjemmeKl) linjer.push(`Hjemme kl. ${n.hjemmeKl} · kørsel ${n.km} km / ${n.koerselMin} min · arbejde ${n.arbejdeMin} min`);
  if (n.ledigMin > 0 && res.ok) linjer.push(`${n.ledigMin} min ledig`);
  for (const b of res.brud) linjer.push(`Brud: ${b.besked}`);
  if (res.forudsaetninger?.skoenKoersel) linjer.push("Køretiden er et skøn (ruteopslag ikke tilgængeligt).");
  return { minutter, overbelastet: !res.ok, fejl: null, skoen: !!res.forudsaetninger?.skoenKoersel, titel: linjer.join("\n") };
}
