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
export function validerForespoergsel(body) {
  const b = body && typeof body === "object" ? body : {};
  const dato = tekst(b.dato, 10);
  if (!DATO.test(dato) || Number.isNaN(new Date(`${dato}T00:00:00Z`).getTime())) return { ok: false, fejl: "Ugyldig dato" };
  const bilId = tekst(b.bilId, 80);
  if (!bilId) return { ok: false, fejl: "Bil mangler" };
  const k = b.kandidat && typeof b.kandidat === "object" ? b.kandidat : null;
  if (!k) return { ok: false, fejl: "Kandidat mangler" };
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
    ok: true, dato, bilId, sagId: tekst(b.sagId, 80) || null,
    kandidat: {
      adresse: tekst(k.adresse, 200), minutter: heltal(k.minutter, 0, 1440, 0), kraever2Mand: k.kraever2Mand === true,
      tidsrum: TIDSRUM[tidsrumId] || null, varer,
    },
  };
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
export function bygMotorInput({ dato, butik, bil, personer, stop, kandidat, maalById, koord, indstillinger }) {
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
    dato, indstillinger, lager, personer, matrix: alle.length > 1 ? skoenMatrix(alle.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon }))) : undefined,
    bil: { id: b.id, navn: b.navn, tempo: Number(b.tempo) || 100, nyttelastKg: b.nyttelastKg, vaerktoejKg: b.vaerktoejKg, lasterum: b.lasterum || null },
    stop: eksisterende,
  };
  return { input, kStop };
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

export function renseSvar({ vurdering, erAdmin, kanOverrule, manglerNavne, bilMangler }) {
  const efter = vurdering.efter;
  const alle = [...(efter.brud || []), ...(efter.advarsler || [])];
  const set = new Set();
  const meddelelser = [];
  const noter = [];
  for (const f of alle) {
    if (f.regel === "koersel") { noter.push("Køretiden er et skøn ud fra luftlinje."); continue; }
    const n = `${f.regel}|${f.niveau}`;
    if (set.has(n)) continue;
    set.add(n);
    meddelelser.push({ regel: f.regel, niveau: f.niveau, tekst: TEKSTER[f.regel] || "En regel i kapacitetsmotoren er brudt." });
  }
  const omlastninger = vurdering.ekstra ? vurdering.ekstra.omlastninger : 0;
  if (omlastninger > 0) noter.push(omlastninger === 1 ? "Kræver én omlastning på lageret i løbet af dagen." : `Kræver ${omlastninger} omlastninger på lageret i løbet af dagen.`);
  if (bilMangler) noter.push("Bilens nyttelast eller lasterum er ikke sat under Admin → Biler, så vægt og plads kan ikke vurderes.");
  if (manglerNavne.length) noter.push(`Mål/vægt kunne ikke hentes for: ${[...new Set(manglerNavne)].join(", ")}.`);
  const blokeret = meddelelser.some((m) => m.niveau === "krav");
  const beslutning = blokeret ? "blokeret" : meddelelser.length ? "advarsel" : "ok";
  const svar = {
    beslutning, kanOverrule: blokeret ? kanOverrule === true : false, meddelelser, noter,
    ekstra: vurdering.ekstra ? { min: vurdering.ekstra.min, km: vurdering.ekstra.km, omlastninger: vurdering.ekstra.omlastninger } : null,
    ledigMin: efter.noegletal?.ledigMin ?? null,
  };
  if (erAdmin) svar.detaljer = { brud: efter.brud, advarsler: efter.advarsler, noegletal: efter.noegletal, forklaring: efter.forklaring, forudsaetninger: efter.forudsaetninger };
  return svar;
}

// Hele beregningen for en forespørgsel, når data er hentet. Returnerer { svar }.
export function koerTjek({ dato, butik, bil, personer, ordrer, sagId, kandidat, maalById, koord, erAdmin, kanOverrule }) {
  const stop = ordrerTilStop(ordrer, sagId);
  const indstillinger = rensIndstillinger(butik?.capacity_settings);
  const { input, kStop } = bygMotorInput({ dato, butik, bil, personer, stop, kandidat, maalById, koord, indstillinger });
  const vurdering = vurderTilfoejelse(input, kStop);
  const manglerNavne = kandidat.varer.filter((v) => !(v.punkt1Id && maalById.get(v.punkt1Id))).map((v) => v.navn);
  const bilMangler = !(Number(bil?.nyttelastKg) > 0) && !bil?.lasterum;
  return { svar: renseSvar({ vurdering, erAdmin, kanOverrule, manglerNavne, bilMangler }), stopAntal: stop.length };
}
export { tilMin };
