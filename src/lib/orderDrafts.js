// KLADDER TIL SAGER UNDER OPRETTELSE (oktober 2026)
//
// BAGGRUND: bliver man afbrudt midt i en booking - en kunde står i butikken,
// telefonen ringer, sessionen timer ud - forsvandt alt, der var tastet, og
// man måtte starte forfra. Nu gemmes en ufærdig booking løbende som en
// KLADDE ("parkeret"), og kan genoptages derfra, hvor man slap.
//
// HVOR KLADDER BOR (ændret oktober 2026): kladden følger sælgeren på tværs af enheder. Sandheden
// ligger i databasen (tabellen order_drafts, kun læsbar af ejeren selv); denne fil er den LOKALE
// CACHE oven på den. Formularen gemmer stadig øjeblikkeligt og virker uden forbindelse: hver
// ændring skrives først her og markeres som "ikke sendt" (dirty), og lib/draftSync.js sender den
// til databasen og henter kladder fra brugerens andre enheder. Filen her er ren logik uden netværk.
//
// SYNKRONISERINGENS FELTER på en lokal kladde:
//   rev        tæller lokale ændringer
//   syncedRev  den rev, databasen sidst bekræftede (rev !== syncedRev = ikke sendt endnu)
//   version    databasens versionsnummer ved sidste synkronisering (til at opdage, at en anden
//              enhed har ændret kladden imellemtiden)
// Slettes en kladde, huskes sletningen (en "gravsten"), til databasen har fået besked - ellers ville
// næste hentning genoplive den.
//
// PRIVATLIV: en kladde indeholder kundens navn, telefon og adresse. Derfor:
//   * en kladde tilhører BRUGEREN og BUTIKKEN - en anden bruger ser den ikke i appen, og databasen
//     afviser, at andre (heller ikke butiksadmin eller systemadmin) læser den
//   * den slettes automatisk efter butikkens frist (standard 14 dage; butikkens administrator vælger 1-90 dage, og
//     om kladder overhovedet er slået til - se "INDSTILLINGER PR. BUTIK" nedenfor)
//   * den slettes straks, når sagen er booket eller kladden kasseres
//   * den fjernes IKKE ved log ud: en automatisk udlogning efter inaktivitet
//     (se loginpolitikken) er netop en af de situationer, kladden skal overleve.
//
// En kladde oprettes først, når der faktisk er tastet noget - at åbne
// formularen og lukke den igen efterlader intet.

import { deepEqual } from "./orderMerge.js";

const NOEGLE = "p1sybs.kladder.v1";
const GRAVSTEN = "p1sybs.kladder.slettet.v1";
const MAKS_KLADDER = 20;
const DAG_MS = 24 * 60 * 60 * 1000;
// En gravsten må leve længere end den længste mulige frist (90 dage), så en sletning aldrig glemmes for tidligt.
const GRAVSTEN_ALDER_MS = 90 * DAG_MS;

// ---------------------------------------------------------------------------------------------------------
// INDSTILLINGER PR. BUTIK (oktober 2026): butikkens administrator bestemmer, OM kladder er slået til, og HVOR MANGE
// DAGE de ligger (1-90). Kladder indeholder kundens navn, telefon og adresse. Databasen håndhæver indstillingen
// (den afviser at gemme, når funktionen er slået fra, og sletter kladder, der ikke længere må ligge); her følger den
// lokale cache med, så formularen ikke parkerer noget, listen ikke viser noget, og kopierne på enheden ikke bliver
// stående. Indstillingen huskes pr. butik i browseren, så den gælder fra første sekund ved næste åbning - før den
// er hentet fra databasen, gælder standarden (til, 14 dage).
const INDST = "p1sybs.kladder.indstillinger.v1";
export const STANDARD_INDSTILLINGER = Object.freeze({ aktiveret: true, dage: 14 });
export const MIN_DAGE = 1;
export const MAKS_DAGE = 90;

// Retter en indstilling til noget gyldigt: til/fra er "til", medmindre den udtrykkeligt er false; dage afrundes og
// holdes inden for 1-90 (ulæseli ge værdier giver 14).
export function rensIndstillinger(raa) {
  // null, undefined og tom tekst er "ikke udfyldt" og giver standarden (Number(null) er 0, som ellers ville give 1 dag).
  const udfyldt = raa?.dage !== null && raa?.dage !== undefined && raa?.dage !== "";
  const d = udfyldt ? Math.round(Number(raa.dage)) : NaN;
  return {
    aktiveret: raa?.aktiveret !== false,
    dage: Number.isFinite(d) ? Math.min(MAKS_DAGE, Math.max(MIN_DAGE, d)) : STANDARD_INDSTILLINGER.dage,
  };
}

function laesIndstillinger() {
  try {
    const raa = localStorage.getItem(INDST);
    const o = raa ? JSON.parse(raa) : {};
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch (_) {
    return {};
  }
}

export function kladdeIndstillinger(storeId) {
  const raa = laesIndstillinger()[storeId];
  return raa ? rensIndstillinger(raa) : { ...STANDARD_INDSTILLINGER };
}
export const kladderAktiveret = (storeId) => kladdeIndstillinger(storeId).aktiveret;

const listeners = new Set();
let storageLytter = false;

// Synkroniseringen (lib/draftSync.js) melder sig her og får besked, når der er noget at sende.
let syncTrigger = null;
export function saetSyncTrigger(fn) { syncTrigger = typeof fn === "function" ? fn : null; }
const udloesSync = () => { try { if (syncTrigger) syncTrigger(); } catch (_) { /* synkronisering må aldrig vælte lageret */ } };

// Er der lokale ændringer, databasen endnu ikke har fået? Ældre kladder (fra før synkroniseringen)
// har ingen rev/syncedRev og regnes derfor som ikke sendt, så de bliver sendt første gang.
export const kladdeErDirty = (k) => (k?.syncedRev ?? -1) !== (k?.rev ?? 0);
// Ligger kladden sikkert i databasen (og dermed på brugerens andre enheder)?
export const kladdeErSynket = (k) => k?.version !== undefined && !kladdeErDirty(k);

function laes() {
  try {
    const raa = localStorage.getItem(NOEGLE);
    const parsed = raa ? JSON.parse(raa) : [];
    return Array.isArray(parsed)
      ? parsed.filter((k) => k && typeof k.id === "string" && k.state && typeof k.state === "object")
      : [];
  } catch (_) {
    return [];
  }
}

function notify() {
  listeners.forEach((fn) => {
    try { fn(); } catch (_) { /* en lytter må ikke vælte lageret */ }
  });
}

function skriv(liste) {
  try {
    localStorage.setItem(NOEGLE, JSON.stringify(liste));
  } catch (_) {
    return false; // fuld eller blokeret
  }
  notify();
  return true;
}

// Kladder ældre end deres butiks frist (eller med ulæselig tid) regnes ikke længere med.
const levende = (liste, nu) => {
  const indst = laesIndstillinger();
  const frist = (storeId) => (indst[storeId] ? rensIndstillinger(indst[storeId]).dage : STANDARD_INDSTILLINGER.dage) * DAG_MS;
  return liste.filter((k) => nu - Date.parse(k.savedAt) < frist(k.storeId));
};

export function nyKladdeId() {
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const tekst = (v) => typeof v === "string" && v.trim() !== "";

// Fjerner id-felter rekursivt: nye varelinjer får tilfældige id'er, så to
// "tomme" linjer ellers aldrig ville se ens ud.
const utenId = (v) => {
  if (Array.isArray(v)) return v.map(utenId);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).filter(([k]) => k !== "id").map(([k, x]) => [k, utenId(x)]));
  }
  return v;
};

// Nøgle-feltet "kræves" slås til af sig selv ved tomgang og tæller derfor ikke.
const utenKraeves = (k) => {
  const { kraeves, ...rest } = k || {};
  return rest;
};

// Er der tastet noget, der er værd at gemme? Dato, tidsrum og bil har
// standardværdier og tæller ikke alene. blank = { lineItem, keyAccess } fra en
// helt tom formular, så standardværdier ikke forveksles med noget indtastet.
export function harIndhold(s, blank) {
  if (!s) return false;
  if ([s.customerName, s.phone, s.email, s.externalReference, s.address, s.deliveryNote].some(tekst)) return true;
  // Specialtur (oktober 2026): en tastet beskrivelse eller et krav er indhold, der er værd at gemme.
  if ([s.specialBeskrivelse, s.specialKrav].some(tekst)) return true;
  if (s.hasBuyer && [s.buyerName, s.buyerPhone, s.buyerEmail, s.buyerAddress].some(tekst)) return true;
  if (blank?.keyAccess && s.keyAccess && !deepEqual(utenKraeves(s.keyAccess), utenKraeves(blank.keyAccess))) return true;
  if (blank?.lineItem && Array.isArray(s.lineItems) && !deepEqual(utenId(s.lineItems), utenId([blank.lineItem]))) return true;
  return false;
}
