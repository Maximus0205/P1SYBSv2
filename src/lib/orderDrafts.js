// KLADDER TIL SAGER UNDER OPRETTELSE (oktober 2026)
//
// BAGGRUND: bliver man afbrudt midt i en booking - en kunde står i butikken,
// telefonen ringer, sessionen timer ud - forsvandt alt, der var tastet, og
// man måtte starte forfra. Nu gemmes en ufærdig booking løbende som en
// KLADDE ("parkeret"), og kan genoptages derfra, hvor man slap.
//
// HVORFOR PÅ ENHEDEN OG IKKE I DATABASEN: en kladde er personlig og
// midlertidig, ikke en delt forretningssag - den hører ikke til i sagslisten,
// planlægningen eller andres skærme, før den er bookede. Den lever derfor kun i
// denne browser (localStorage) og er IKKE tilgængelig fra en anden enhed.
// (Skulle den kunne følge brugeren på tværs af enheder, skulle den i en
// tabel med RLS - det er en bevidst afgrænsning, ikke en glemt ting.)
//
// PRIVATLIV: en kladde indeholder kundens navn, telefon og adresse, ligesom
// offline-køen (lib/offlineQueue.js). Derfor:
//   * en kladde tilhører BRUGEREN og BUTIKKEN - en anden bruger på samme
//     computer ser den ikke i appen
//   * den slettes automatisk efter 14 dage
//   * den slettes straks, når sagen er booket eller kladden kasseres
//   * den fjernes IKKE ved log ud: en automatisk udlogning efter inaktivitet
//     (se loginpolitikken) er netop en af de situationer, kladden skal overleve.
//
// En kladde oprettes først, når der faktisk er tastet noget - at åbne
// formularen og lukke den igen efterlader intet.

import { deepEqual } from "./orderMerge.js";

const NOEGLE = "p1sybs.kladder.v1";
const MAKS_KLADDER = 20;
const MAKS_ALDER_MS = 14 * 24 * 60 * 60 * 1000;

const listeners = new Set();
let storageLytter = false;

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

// Kladder ældre end 14 dage (eller med ulæselig tid) regnes ikke længere med.
const levende = (liste, nu) => liste.filter((k) => nu - Date.parse(k.savedAt) < MAKS_ALDER_MS);

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
  if (s.hasBuyer && [s.buyerName, s.buyerPhone, s.buyerEmail, s.buyerAddress].some(tekst)) return true;
  if (blank?.keyAccess && s.keyAccess && !deepEqual(utenKraeves(s.keyAccess), utenKraeves(blank.keyAccess))) return true;
  if (blank?.lineItem && Array.isArray(s.lineItems) && !deepEqual(utenId(s.lineItems), utenId([blank.lineItem]))) return true;
  return false;
}

export function hentKladder(storeId, userId) {
  return levende(laes(), Date.now())
    .filter((k) => k.storeId === storeId && k.userId === userId)
    .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
}

// Opretter eller opdaterer en kladde. Returnerer { ok, savedAt }; ok = false,
// hvis browseren ikke kunne gemme - kalderen skal så fortælle brugeren det.
export function gemKladde({ id, storeId, userId, state, step }) {
  const nu = Date.now();
  const savedAt = new Date(nu).toISOString();
  let liste = levende(laes(), nu).filter((k) => k.id !== id);
  liste.push({ id, storeId, userId, savedAt, step: Number(step) || 0, state });
  if (liste.length > MAKS_KLADDER) {
    liste.sort((a, b) => Date.parse(a.savedAt) - Date.parse(b.savedAt));
    liste = liste.slice(liste.length - MAKS_KLADDER);
  }
  return { ok: skriv(liste), savedAt };
}

export function fjernKladde(id) {
  const foer = laes();
  const efter = foer.filter((k) => k.id !== id);
  if (efter.length !== foer.length) skriv(efter);
}

export function subscribeKladder(fn) {
  listeners.add(fn);
  if (!storageLytter && typeof window !== "undefined") {
    storageLytter = true;
    // Ændringer fra en anden fane vises også her.
    window.addEventListener("storage", (e) => { if (e.key === NOEGLE || e.key === null) notify(); });
  }
  try { fn(); } catch (_) { /* som i notify */ }
  return () => listeners.delete(fn);
}

export function kladdeEtiket(k) {
  const s = k?.state || {};
  const navn = [s.customerName, s.buyerName].find(tekst) || "Uden navn";
  const linje2 = [s.address, s.phone].find(tekst) || "";
  return { navn: navn.trim(), linje2: linje2.trim() };
}

export function klokkeslaet(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
}

export function tidTekst(iso, nu = Date.now()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const min = Math.round((nu - t) / 60000);
  if (min < 1) return "lige nu";
  if (min < 60) return `for ${min} min. siden`;
  const d = new Date(t);
  const kl = klokkeslaet(iso);
  if (new Date(nu).toDateString() === d.toDateString()) return `i dag kl. ${kl}`;
  return `${d.toLocaleDateString("da-DK", { day: "numeric", month: "short" })} kl. ${kl}`;
}

// GENOPTAG FRA FORSIDEN (oktober 2026): "Fortsæt" på en parkeret booking i widgetten på Forsiden
// fører til bookingformularen. Hvilken kladde, der skal genoptages, huskes kortvarigt i fanens
// sessionStorage og læses (og fjernes) ÉN gang af bookingsiden. sessionStorage frem for en URL,
// fordi kladde-id'et ikke skal ligge i adresselinjen eller historikken, og fordi det forsvinder med
// fanen, hvis det aldrig bliver brugt.
const GENOPTAG = "p1sybs.genoptag.v1";

export function bedOmGenoptagelse(id) {
  try { sessionStorage.setItem(GENOPTAG, String(id)); return true; } catch (_) { return false; }
}

export function hentGenoptagelse() {
  try {
    const id = sessionStorage.getItem(GENOPTAG);
    if (id !== null) sessionStorage.removeItem(GENOPTAG);
    return id || null;
  } catch (_) {
    return null;
  }
}
