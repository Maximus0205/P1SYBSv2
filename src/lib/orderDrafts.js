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
//   * den slettes automatisk efter 14 dage
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
const MAKS_ALDER_MS = 14 * 24 * 60 * 60 * 1000;

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
  const kendt = laes().find((k) => k.id === id);
  let liste = levende(laes(), nu).filter((k) => k.id !== id);
  // version bevares (så en senere afsendelse kan opdage en ændring fra en anden enhed); rev tælles op,
  // så ændringen regnes som "ikke sendt". naegtet nulstilles: en ny ændring prøves igen.
  liste.push({ id, storeId, userId, savedAt, step: Number(step) || 0, state, version: kendt?.version, rev: (kendt?.rev ?? 0) + 1, syncedRev: kendt?.syncedRev });
  if (liste.length > MAKS_KLADDER) {
    liste.sort((a, b) => Date.parse(a.savedAt) - Date.parse(b.savedAt));
    liste = liste.slice(liste.length - MAKS_KLADDER);
  }
  const ok = skriv(liste);
  if (ok) udloesSync();
  return { ok, savedAt };
}

export function fjernKladde(id) {
  const foer = laes();
  const gammel = foer.find((k) => k.id === id);
  const efter = foer.filter((k) => k.id !== id);
  if (efter.length !== foer.length) {
    // Gravstenen sikrer, at databasen også får besked, og at kladden ikke genoplives af en hentning.
    if (gammel) tilfoejGravsten({ id, userId: gammel.userId });
    skriv(efter);
    udloesSync();
  }
}

function laesGravsten(nu = Date.now()) {
  try {
    const raa = localStorage.getItem(GRAVSTEN);
    const l = raa ? JSON.parse(raa) : [];
    return Array.isArray(l) ? l.filter((g) => g && typeof g.id === "string" && nu - Date.parse(g.tid) < MAKS_ALDER_MS) : [];
  } catch (_) {
    return [];
  }
}
function skrivGravsten(l) {
  try { localStorage.setItem(GRAVSTEN, JSON.stringify(l)); return true; } catch (_) { return false; }
}
function tilfoejGravsten({ id, userId }) {
  const l = laesGravsten().filter((g) => g.id !== id);
  l.push({ id, userId, tid: new Date().toISOString() });
  skrivGravsten(l);
}
// Brugerens egne sletninger, der endnu ikke er meldt til databasen.
export function hentGravsten(userId) { return laesGravsten().filter((g) => g.userId === userId); }
export function fjernGravsten(ids) {
  const s = new Set(ids);
  skrivGravsten(laesGravsten().filter((g) => !s.has(g.id)));
}

// Databasen har bekræftet en afsendelse: kladden er sendt op til og med rev, og har fået denne version.
// Er der kommet nye ændringer, mens afsendelsen var undervejs (rev er større), forbliver den "ikke sendt".
export function markerSendt(id, { rev, version }) {
  const liste = laes();
  const k = liste.find((x) => x.id === id);
  if (!k) return;
  k.version = version;
  k.syncedRev = rev;
  delete k.naegtet;
  skriv(liste);
}

// Databasen afviste kladden (fx manglende rettighed). Den prøves først igen, når den ændres.
export function markerNaegtet(id, besked) {
  const liste = laes();
  const k = liste.find((x) => x.id === id);
  if (!k) return;
  k.naegtet = String(besked || "afvist");
  skriv(liste);
}

// En kopi, når to enheder har ændret den samme kladde: den andens udgave gemmes som en NY kladde, så
// intet går tabt. Markeret med _kopi, så den kan kendes i listen.
export function opretKopi({ storeId, userId, state, step }) {
  const id = nyKladdeId();
  const liste = laes();
  liste.push({ id, storeId, userId, savedAt: new Date().toISOString(), step: Number(step) || 0, state: { ...state, _kopi: true }, rev: 1, syncedRev: -1 });
  skriv(liste);
  return id;
}

// Fletter databasens kladder ind i den lokale cache (ren funktion - testet i Node).
//   * en kladde, der kun findes i databasen, tilføjes (ligger nu også på denne enhed)
//   * en lokal kladde UDEN ændringer får databasens nyere udgave
//   * en lokal kladde MED ikke-sendte ændringer røres ikke (den sendes og afstemmes bagefter)
//   * en kladde, der er sendt før, men nu mangler i databasen, er kasseret/booket på en anden enhed og fjernes
//   * en kladde, jeg selv har slettet (gravsten), genoplives aldrig
export function fletRemote(raa, remote, { storeId, userId, slettede = [] }) {
  const slet = new Set(slettede);
  const andre = raa.filter((k) => !(k.storeId === storeId && k.userId === userId));
  const mine = raa.filter((k) => k.storeId === storeId && k.userId === userId);
  const ud = [];
  for (const l of mine) {
    if (slet.has(l.id)) continue;
    const r = remote.find((x) => x.id === l.id);
    if (!r) {
      if (kladdeErDirty(l) || l.version === undefined) ud.push(l);
      continue;
    }
    if (kladdeErDirty(l)) { ud.push(l); continue; }
    if (r.version > (l.version ?? 0)) {
      ud.push({ ...l, state: r.state, step: r.step, version: r.version, savedAt: r.updated_at || l.savedAt, rev: l.rev ?? 0, syncedRev: l.rev ?? 0 });
    } else {
      ud.push(l);
    }
  }
  for (const r of remote) {
    if (slet.has(r.id) || mine.some((l) => l.id === r.id)) continue;
    ud.push({ id: r.id, storeId, userId, savedAt: r.updated_at || new Date().toISOString(), step: r.step || 0, state: r.state, version: r.version, rev: 0, syncedRev: 0 });
  }
  return [...andre, ...ud];
}

export function anvendRemote(storeId, userId, remote) {
  const raa = laes();
  const ny = fletRemote(raa, remote, { storeId, userId, slettede: hentGravsten(userId).map((g) => g.id) });
  if (JSON.stringify(ny) !== JSON.stringify(raa)) skriv(ny);
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
  return { navn: navn.trim() + (s._kopi ? " (kopi fra anden enhed)" : ""), linje2: linje2.trim() };
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
