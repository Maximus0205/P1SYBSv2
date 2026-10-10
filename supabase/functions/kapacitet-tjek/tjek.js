// KAPACITETSTJEK - ren logik til Edge Function "kapacitet-tjek" (oktober 2026). Ingen Deno- eller netværkskald herinde, så den kan testes
// i Node (tests/kapacitet-tjek.test.mjs). Motoren i ./engine er en uændret kopi af src/engine/kapacitet (testen sammenligner dem).
//
// PRIVATLIV: produktets bruttomål og -vægt hentes live fra punkt1 af Edge Functionen, bruges her i hukommelsen til at regne og
// GEMMES ALDRIG. Svaret til browseren (renseSvar) indeholder aldrig mål eller vægt - kun beslutning, regelnavne, varenavne og
// tid/distance. Kun systemadmin får motorens fulde tekster (som kan indeholde tal) i feltet "detaljer".

import { planlaegDag, vurderTilfoejelse, dagensTilgaengelighed, skoenMatrix, rensIndstillinger, tilMin } from "./engine/index.js";

const TIDSRUM = { formiddag: { fra: 8 * 60, til: 12 * 60 }, eftermiddag: { fra: 12 * 60, til: 16 * 60 } }; // som TIME_SLOTS i src/data/domain.js; heldag = ingen begrænsning
const DATO = /^\d{4}-\d{2}-\d{2}$/;
const PUNKT1_ID = /^\d{3,10}$/;
const tekst = (v, max) => String(v ?? "").trim().slice(0, max);
const heltal = (v, min, max, std) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : std; };

// ---- Indgangsvalidering --------------------------------------------------------------------------------------------------------
function renKandidat(k) {
  const raaVarer = Array.isArray(k.varer) ? k.varer.slice(0, 40) : [];
  const varer = raaVarer.map((v, i) => {
    const pid = tekst(v?.punkt1Id, 12);
    return {
      id: tekst(v?.id, 80) || `kv${i}`, navn: tekst(v?.navn, 120) || "Vare", type: tekst(v?.type, 120),
      antal: heltal(v?.antal, 1, 50, 1), punkt1Id: PUNKT1_ID.test(pid) ? pid : null,
    };
  });
  const tidsrumId = tekst(k.tidsrumId, 20);
  return {
    adresse: tekst(k.adresse, 200), minutter: heltal(k.minutter, 0, 1440, 0), kraever2Mand: k.kraever2Mand === true,
    tidsrum: TIDSRUM[tidsrumId] || null, varer,
  };
}
const gyldigDato = (d) => DATO.test(d) && !Number.isNaN(new Date(`${d}T00:00:00Z`).getTime());

export function validerForespoergsel(body) {
  const b = body && typeof body === "object" ? body : {};
  const dato = tekst(b.dato, 10);
  if (!gyldigDato(dato)) return { ok: false, fejl: "Ugyldig dato" };
  const bilId = tekst(b.bilId, 80);
  if (!bilId) return { ok: false, fejl: "Bil mangler" };
  const k = b.kandidat && typeof b.kandidat === "object" ? b.kandidat : null;
  if (!k) return { ok: false, fejl: "Kandidat mangler" };
  return { ok: true, dato, bilId, sagId: tekst(b.sagId, 80) || null, kandidat: renKandidat(k) };
}

// Forslag til ny dato/bil ved ombooking. fraDato er valgfri (standard: i morgen); ekskluder = den tid, sagen allerede har
// (så den ikke foreslås igen).
export function validerForslag(body) {
  const b = body && typeof body === "object" ? body : {};
  const fraDato = tekst(b.fraDato, 10);
  if (fraDato && !gyldigDato(fraDato)) return { ok: false, fejl: "Ugyldig dato" };
  const k = b.kandidat && typeof b.kandidat === "object" ? b.kandidat : null;
  if (!k) return { ok: false, fejl: "Kandidat mangler" };
  const e = b.ekskluder && typeof b.ekskluder === "object" ? { dato: tekst(b.ekskluder.dato, 10), bilId: tekst(b.ekskluder.bilId, 80) } : null;
  return { ok: true, fraDato: fraDato || null, dage: heltal(b.dage, 1, 30, 21), sagId: tekst(b.sagId, 80) || null, ekskluder: e, kandidat: renKandidat(k) };
}

// ---- punkt1: brutto-mål og -vægt (samme udlæsning som den systemadmin-låste testfunktion punkt1-produktmaal) --------------------------
const tilTal = (s) => { const t = String(s ?? "").trim(); if (!t) return NaN; return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t); };
const find = (raekker, id) => { const lc = id.toLowerCase(); return raekker.find((r) => String(r?.id ?? "").toLowerCase() === lc) || raekker.find((r) => String(r?.nameKey ?? "").toLowerCase().endsWith(`.${lc}`)) || null; };
function laesMaal(r) {
  if (!r) return null;
  const dele = String((r.values ?? [])[0] ?? "").split(/[x×]/i).map(tilTal);
  if (dele.length !== 3 || dele.some((d) => !Number.isFinite(d) || d <= 0)) return null;
  const enhed = String(r.unitType ?? "mm").toLowerCase();
  const faktor = enhed === "mm" ? 0.1 : enhed === "cm" ? 1 : enhed === "m" ? 100 : NaN;
  if (!Number.isFinite(faktor)) return null;
  const cm = dele.map((d) => Math.round(d * faktor * 10) / 10);
  if (cm.some((d) => d < 1 || d > 1000)) return null;
  return { l: cm[0], b: cm[1], h: cm[2] };
}
function laesVaegt(r) {
  if (!r) return null;
  const v = tilTal((r.values ?? [])[0]);
  if (!Number.isFinite(v) || v <= 0) return null;
  const enhed = String(r.unitType ?? "kg").toLowerCase();
  const kg = enhed === "kg" ? v : enhed === "g" ? v / 1000 : NaN;
  if (!Number.isFinite(kg) || kg < 0.01 || kg > 2000) return null;
  return Math.round(kg * 100) / 100;
}
// -> { maal:{l,b,h}, vaegtKg } kun hvis BEGGE brutto-tal kan læses; ellers null (der gættes aldrig)
export function punkt1BruttoFraSvar(data, id) {
  const produkter = Array.isArray(data?.products) ? data.products : [];
  const kort = data?.productIdToSpecificationAttributes ?? produkter.map((p) => p?.productIdToSpecificationAttributes).find((k) => k && k[id]) ?? null;
  const raekker = Array.isArray(kort?.[id]) ? kort[id] : [];
  const maal = laesMaal(find(raekker, "grossDimensions"));
  const vaegtKg = laesVaegt(find(raekker, "grossWeight"));
  return maal && vaegtKg !== null ? { maal, vaegtKg } : null;
}

// ---- Fra databasen til motorens format --------------------------------------------------------------------------------------------
const minutterPaaLinje = (l) => (Number(l?.primaerYdelse?.minutter) || 0) + (Array.isArray(l?.tillaeg) ? l.tillaeg : []).reduce((s, y) => s + (Number(y?.minutter) || 0), 0);

export function ordrerTilStop(ordrer, sagIdDerSkalUdelades) {
  return (ordrer || [])
    .filter((o) => o && o.id !== sagIdDerSkalUdelades && o.status !== "afsluttet")
    .map((o) => ({
      id: String(o.id), navn: o.kunde?.navn || String(o.id), adresse: o.kunde?.adresse || "",
      minutter: (o.varelinjer || []).reduce((s, l) => s + minutterPaaLinje(l), 0),
      tidsrum: TIDSRUM[o.tidsrumId] || null, kraever2Mand: o.kraever2Mand === true,
      raekkefolge: Number.isFinite(Number(o.raekkefolge)) ? Number(o.raekkefolge) : 0,
      linjer: (Array.isArray(o.varelinjer) ? o.varelinjer : []).map((l, i) => ({
        id: String(l?.id ?? `${o.id}-${i}`), navn: l?.varetypeNavn || l?.varetypeTekst || "Vare", type: l?.varetypeNavn || l?.varetypeTekst || "",
        antal: heltal(l?.antal, 1, 50, 1), punkt1Id: PUNKT1_ID.test(String(l?.punkt1Id ?? "")) ? String(l.punkt1Id) : null,
      })),
    }))
    .sort((a, b) => a.raekkefolge - b.raekkefolge);
}

// alle punkt1-id'er, der skal slås op live (højst 40)
export function punkt1Ider(stop, kandidat) {
  const s = new Set();
  for (const st of stop) for (const l of st.linjer) if (l.punkt1Id) s.add(l.punkt1Id);
  for (const v of kandidat.varer) if (v.punkt1Id) s.add(v.punkt1Id);
  return [...s].slice(0, 40);
}

const medMaal = (linjer, maalById) => linjer.map((l) => {
  const m = l.punkt1Id ? maalById.get(l.punkt1Id) : null;
  return { id: l.id, navn: l.navn, type: l.type, antal: l.antal, vaegtKg: m ? m.vaegtKg : null, maal: m ? m.maal : null };
});

// Personer på bilen den dag: længste arbejdstid = montør, øvrige = medhjælper
export function bygPersoner({ dato, personer, arbejdstider, uaendringer, fravaer, indstillinger }) {
  const liste = (personer || []).map((p) => {
    const t = dagensTilgaengelighed({
      dato, indstillinger,
      raekker: (arbejdstider || []).filter((r) => r.person_id === p.id),
      uaendringer: (uaendringer || []).filter((u) => u.person_id === p.id).map((u) => ({ dato: u.dato, fraMin: u.from_min, tilMin: u.to_min })),
      fravaer: (fravaer || []).filter((f) => f.technician_id === p.id).map((f) => ({ startDato: f.start_date, slutDato: f.end_date, type: f.type })),
    });
    return { id: p.id, navn: p.name || "Montør", vinduer: t.vinduer, pauseMin: t.pauseMin, samlet: t.vinduer.reduce((s, w) => s + (w.til - w.fra), 0) };
  }).filter((p) => p.vinduer.length > 0).sort((a, b) => b.samlet - a.samlet);
  return liste.map((p, i) => ({ id: p.id, navn: p.navn, rolle: i === 0 ? "montoer" : "medhjaelper", vinduer: p.vinduer, pauseMin: p.pauseMin }));
}

// koord: Map adresse -> {lat, lon}. maalById: Map punkt1Id -> {maal, vaegtKg}.
export function bygMotorInput({ dato, butik, bil, personer, stop, kandidat, maalById, koord, indstillinger, ruteMatrix = null }) {
  const koordFor = (adresse) => koord?.get(adresse) || null;
  const tilStop = (s) => {
    const k = koordFor(s.adresse);
    return {
      id: s.id, navn: s.navn, adresse: s.adresse, lat: k?.lat, lon: k?.lon, minutter: s.minutter, tidsrum: s.tidsrum, kraever2Mand: s.kraever2Mand,
      varer: medMaal(s.linjer, maalById),
    };
  };
  const eksisterende = stop.map(tilStop);
  const kStop = tilStop({ id: "kandidat", navn: "Denne booking", adresse: kandidat.adresse, minutter: kandidat.minutter, tidsrum: kandidat.tidsrum, kraever2Mand: kandidat.kraever2Mand, linjer: kandidat.varer });
  const lager = { id: "lager", lat: Number.isFinite(butik?.lat) ? butik.lat : undefined, lon: Number.isFinite(butik?.lon) ? butik.lon : undefined };
  const alle = [lager, ...[...eksisterende, kStop]].filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  const b = bil || {};
  const input = {
    dato, indstillinger, lager, personer, matrix: ruteMatrix || (alle.length > 1 ? skoenMatrix(alle.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon }))) : undefined),
    bil: { id: b.id, navn: b.navn, tempo: Number(b.tempo) || 100, nyttelastKg: b.nyttelastKg, vaerktoejKg: b.vaerktoejKg, lasterum: b.lasterum || null },
    stop: eksisterende,
  };
  return { input, kStop };
}

// ---- Køretid og kilometer: punkter til ORS-matricen og omsætning af svaret ----------------------------------------------------------
// Samme id'er som motoren bruger ("lager", sagens id, "kandidat"). Kun punkter med koordinater kommer med.
export function matrixPunkter({ butik, stop, kandidat, koord }) {
  const k = (a) => koord?.get(a) || null;
  const p = [];
  if (Number.isFinite(butik?.lat) && Number.isFinite(butik?.lon)) p.push({ id: "lager", lat: butik.lat, lon: butik.lon });
  for (const s of stop || []) { const c = k(s.adresse); if (c) p.push({ id: s.id, lat: c.lat, lon: c.lon }); }
  const c = k(kandidat.adresse);
  if (c) p.push({ id: "kandidat", lat: c.lat, lon: c.lon });
  return p;
}

// ORS-matrix (sekunder/meter) -> motorens format (minutter/km). null hvis svaret ikke har den rigtige form (så bruges luftlinje).
// Enkelte strækninger ORS ikke kunne beregne bliver null; motoren falder da tilbage til luftlinje for netop dem.
export function ruteMatrixFraOrs(punkter, data) {
  const n = punkter.length;
  const d = data?.durations;
  const a = data?.distances;
  const form = (m) => Array.isArray(m) && m.length === n && m.every((r) => Array.isArray(r) && r.length === n);
  if (n < 2 || !form(d) || !form(a)) return null;
  const tal = (x, del) => (Number.isFinite(x) && x >= 0 ? x / del : null);
  return { ids: punkter.map((p) => p.id), minutter: d.map((r) => r.map((x) => tal(x, 60))), km: a.map((r) => r.map((x) => tal(x, 1000))), skoen: false };
}

// ---- Svar til browseren: ALDRIG mål eller vægt --------------------------------------------------------------------------------------
const TEKSTER = {
  arbejdstid: "Dagen kan ikke nå inden for montørens arbejdstid.",
  tidsrum: "Kundens tidsrum kan ikke overholdes.",
  toMand: "En opgave kræver to mand, men der er ingen medhjælper på bilen den dag.",
  nyttelast: "Varerne er for tunge til at være på bilen på én gang.",
  plads: "Varerne kan ikke være i lasterummet på én gang.",
  ukendtData: "Vægt eller mål mangler for nogle varer, så pladsen kan ikke vurderes fuldt ud.",
};

export function renseSvar({ vurdering, erAdmin, kanOverrule, manglerNavne, bilMangler, kandidatUdenKoord = false, stopUdenKoord = 0 }) {
  const efter = vurdering.efter;
  const alle = [...(efter.brud || []), ...(efter.advarsler || [])];
  const set = new Set();
  const meddelelser = [];
  const noter = [];
  let harKoerselsfund = false;
  for (const f of alle) {
    if (f.regel === "koersel") { harKoerselsfund = true; continue; }
    const n = `${f.regel}|${f.niveau}`;
    if (set.has(n)) continue;
    set.add(n);
    meddelelser.push({ regel: f.regel, niveau: f.niveau, tekst: TEKSTER[f.regel] || "En regel i kapacitetsmotoren er brudt." });
  }
  // Kørsel: sig tydeligt, når en adresse ikke kunne findes (så er km ikke medregnet), i stedet for at vise et misvisende 0 km.
  if (kandidatUdenKoord) noter.push("Adressen på denne sag kunne ikke findes, så kørsel til den er ikke medregnet. Tjek stavningen af adressen.");
  else if (stopUdenKoord > 0) noter.push(stopUdenKoord === 1 ? "Adressen på én anden sag på bilen kunne ikke findes, så dens kørsel er ikke medregnet." : `Adressen på ${stopUdenKoord} andre sager på bilen kunne ikke findes, så deres kørsel er ikke medregnet.`);
  else if (harKoerselsfund) noter.push("Køretiden er et skøn ud fra luftlinje.");
  const omlastninger = vurdering.ekstra ? vurdering.ekstra.omlastninger : 0;
  if (omlastninger > 0) noter.push(omlastninger === 1 ? "Kræver én omlastning på lageret i løbet af dagen." : `Kræver ${omlastninger} omlastninger på lageret i løbet af dagen.`);
  if (bilMangler) noter.push("Bilens nyttelast eller lasterum er ikke sat under Admin → Biler, så vægt og plads kan ikke vurderes.");
  if (manglerNavne.length) noter.push(`Mål/vægt kunne ikke hentes for: ${[...new Set(manglerNavne)].join(", ")}.`);
  const blokeret = meddelelser.some((m) => m.niveau === "krav");
  const beslutning = blokeret ? "blokeret" : meddelelser.length ? "advarsel" : "ok";
  const svar = {
    beslutning, kanOverrule: blokeret ? kanOverrule === true : false, meddelelser, noter,
    ekstra: vurdering.ekstra ? { min: vurdering.ekstra.min, km: kandidatUdenKoord ? null : vurdering.ekstra.km, omlastninger: vurdering.ekstra.omlastninger } : null,
    ledigMin: efter.noegletal?.ledigMin ?? null,
  };
  if (erAdmin) svar.detaljer = { brud: efter.brud, advarsler: efter.advarsler, noegletal: efter.noegletal, forklaring: efter.forklaring, forudsaetninger: efter.forudsaetninger };
  return svar;
}

// Hele beregningen for en forespørgsel, når data er hentet. Returnerer { svar }.
export function koerTjek({ dato, butik, bil, personer, ordrer, sagId, kandidat, maalById, koord, erAdmin, kanOverrule, ruteMatrix = null }) {
  const stop = ordrerTilStop(ordrer, sagId);
  const indstillinger = rensIndstillinger(butik?.capacity_settings);
  const { input, kStop } = bygMotorInput({ dato, butik, bil, personer, stop, kandidat, maalById, koord, indstillinger, ruteMatrix });
  const vurdering = vurderTilfoejelse(input, kStop);
  const manglerNavne = kandidat.varer.filter((v) => !(v.punkt1Id && maalById.get(v.punkt1Id))).map((v) => v.navn);
  const bilMangler = !(Number(bil?.nyttelastKg) > 0) && !bil?.lasterum;
  const kandidatUdenKoord = !koord?.get(kandidat.adresse);
  const stopUdenKoord = stop.filter((s) => !koord?.get(s.adresse)).length;
  return { svar: renseSvar({ vurdering, erAdmin, kanOverrule, manglerNavne, bilMangler, kandidatUdenKoord, stopUdenKoord }), stopAntal: stop.length };
}

// ---- Forslag til ny dato/bil: ren logik (netværk og databaselæsning ligger i index.ts) --------------------------------------------
export const iDagKbh = (nu = new Date()) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen" }).format(nu);

export function plusDage(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Første dag, der må foreslås: aldrig før i dag og højst 90 dage frem. Uden ønske: i morgen.
export function startDato(fraDato, idag) {
  if (!fraDato) return plusDage(idag, 1);
  if (fraDato < idag) return idag;
  const max = plusDage(idag, 90);
  return fraDato > max ? max : fraDato;
}

// Hverdage i vinduet (weekender springes over - samme princip som resten af appen).
export function kandidatDatoer(fraDato, dage) {
  const ud = [];
  const d = new Date(`${fraDato}T00:00:00Z`);
  for (let i = 0; i < dage; i++) {
    const ugedag = d.getUTCDay();
    if (ugedag !== 0 && ugedag !== 6) ud.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return ud;
}

// Er der et hårdt brud, som ikke afhænger af mål, vægt eller kørsel? (grovsigtning før de dyre opslag)
export const harHaardtBrud = (svar) => (svar?.meddelelser || []).some((m) => m.niveau === "krav" && m.regel !== "ukendtData");

// Kompakt forslag ud fra en renset vurdering. Indeholder aldrig mål eller vægt.
export function forslagFraSvar(svar, { dato, bilId, bilNavn, rute }) {
  return {
    dato, bilId, bilNavn: bilNavn || "", beslutning: svar.beslutning,
    ekstraMin: svar.ekstra ? Math.round(svar.ekstra.min) : null,
    ekstraKm: svar.ekstra && svar.ekstra.km !== null ? Math.round(svar.ekstra.km) : null,
    omlastninger: svar.ekstra ? svar.ekstra.omlastninger : 0,
    ledigMin: svar.ledigMin,
    advarsler: (svar.meddelelser || []).map((m) => m.tekst),
    noter: svar.noter || [], rute: rute || "skoen",
  };
}

const RANG = { ok: 0, advarsel: 1 };
const bedreForslag = (a, b) => (RANG[a.beslutning] - RANG[b.beslutning]) || ((a.ekstraMin ?? 0) - (b.ekstraMin ?? 0)) || ((a.ekstraKm ?? 0) - (b.ekstraKm ?? 0));

// Tidligste dato først (kortest ventetid for kunden); pr. dato den bedste bil (ok før advarsel, så mindst ekstra tid og km).
// Blokerede kombinationer udelades. Springer den tid over, sagen allerede har.
export function rangerForslag(kandidater, maks = 5, ekskluder = null) {
  const prDato = new Map();
  for (const k of kandidater || []) {
    if (!k || k.beslutning === "blokeret") continue;
    if (ekskluder && ekskluder.dato === k.dato && ekskluder.bilId === k.bilId) continue;
    const g = prDato.get(k.dato);
    if (!g || bedreForslag(k, g) < 0) prDato.set(k.dato, k);
  }
  return [...prDato.values()].sort((a, b) => (a.dato < b.dato ? -1 : a.dato > b.dato ? 1 : 0)).slice(0, maks);
}

export { tilMin };
