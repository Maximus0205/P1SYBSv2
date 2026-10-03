// Offline-kø for montører i marken (august 2026, omarbejdet oktober 2026).
//
// PROBLEMET: en montør står i en kælder, i en elevator, i et
// betonbyggeri. Uden netværk kan sagen ikke lukkes, status ikke skiftes,
// noten ikke gemmes. Skrivninger, der fejler på grund af manglende
// netværk, lægges derfor i en kø og sendes automatisk, når forbindelsen
// er der igen.
//
// ---------------------------------------------------------------------
// VIGTIG AFGRÆNSNING - LÆS DENNE FØR DU UDVIDER MODULET
// ---------------------------------------------------------------------
// Denne kø er IKKE en lokal database, og browseren bliver IKKE kilden til
// sandhed. Køen indeholder kun MIDLERTIDIGE, endnu-ikke-sendte
// skrivninger. Databasen er den eneste autoritative kilde.
//
// KØEN GEMMER HELE SAGEN, men også HVILKEN udgave ændringen byggede på
// (base + baseVersion). Det er det, der gør en forsinket skrivning sikker:
// har en sælger rettet samme sag, mens montøren var offline, opdager
// databasen det (versionsnummeret er skiftet), og useOrders fletter
// ændringerne eller beder brugeren vælge - se lib/orderMerge.js. En
// forsinket skrivning kan ikke længere overskrive andres arbejde stille.
//
//   * Køen er FIFO og sender én ad gangen.
//   * Ved samme sags-id erstattes den ventende post (nyeste udgave), men
//     den OPRINDELIGE base bevares - det er den, en sammenfletning skal
//     regne ud fra.
//   * En ændring forsvinder ALDRIG ved manglende netværk. (Tidligere blev
//     en post smidt væk efter 5 mislykkede forsøg à 30 sekunder - altså
//     efter ca. 2,5 minutter uden dækning. Det er rettet: kun en reel
//     AFVISNING fra serveren tæller som forsøg.)
//
// HVORFOR localStorage: køen SKAL overleve, at appen lukkes. Den er lille,
// synkron og understøttet overalt.

const NOEGLE = "p1sybs.offlinekoe.v1";
const MAKS_POSTER = 200;
const MAKS_FORSOEG = 5;

const listeners = new Set();

function notify(koe) {
  listeners.forEach((fn) => {
    try { fn(koe); } catch (_) { /* en lytter må aldrig vælte køen */ }
  });
}

function laes() {
  try {
    const raa = localStorage.getItem(NOEGLE);
    if (!raa) return [];
    const parsed = JSON.parse(raa);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    // Ødelagt eller utilgængelig (privat browsing kan afvise adgang).
    return [];
  }
}

function skriv(koe) {
  try {
    localStorage.setItem(NOEGLE, JSON.stringify(koe));
  } catch (_) {
    // Fyldt op eller blokeret. enqueueOrder tjekker selv resultatet.
  }
  notify(koe);
}

export function getQueue() {
  return laes();
}

export function queueLength() {
  return laes().length;
}

export function getQueuedPost(orderId, storeId) {
  return laes().find((p) => p.id === String(orderId) && p.storeId === storeId) || null;
}

export function subscribeQueue(fn) {
  listeners.add(fn);
  try { fn(laes()); } catch (_) { /* som i notify */ }
  return () => listeners.delete(fn);
}

// Er dette en fejl, der skyldes FORBINDELSEN frem for en afvisning?
// Kun netværksfejl køes - en afvist skrivning (manglende rettighed, RLS,
// ugyldige data) vil fejle igen og igen, og må ikke se ud som "gemt".
export function isNetworkError(error) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const besked = (error?.message || String(error || "")).toLowerCase();
  return (
    besked.includes("failed to fetch") ||
    besked.includes("networkerror") ||
    besked.includes("network request failed") ||
    besked.includes("load failed") ||
    besked.includes("timeout") ||
    besked.includes("aborted")
  );
}

// Lægger en sag i køen.
//   meta.base         = sagen, som den stod i databasen, da ændringen blev lavet
//   meta.baseVersion  = dens versionsnummer (null = sagen findes ikke i databasen endnu)
//   meta.rebase       = true: erstat også base/baseVersion (bruges efter en
//                       sammenfletning, hvor databasens nyeste udgave er den nye base)
// Findes sagen allerede i køen, erstattes ordren, men den OPRINDELIGE base bevares.
// Returnerer false, hvis køen er fuld ELLER browseren ikke kan gemme - kalderen
// skal så fortælle brugeren, at ændringen ikke er sikret.
export function enqueueOrder(storeId, order, meta = {}) {
  if (!storeId || !order?.id) return false;
  const koe = laes();
  const id = String(order.id);
  const idx = koe.findIndex((p) => p.id === id && p.storeId === storeId);
  const eksisterende = idx >= 0 ? koe[idx] : null;

  const post = {
    id,
    storeId,
    order,
    lagtIKoe: eksisterende ? eksisterende.lagtIKoe : new Date().toISOString(),
    forsoeg: 0,
    rev: (eksisterende?.rev || 0) + 1,
  };
  if (eksisterende && !meta.rebase) {
    if ("base" in eksisterende) post.base = eksisterende.base;
    if ("baseVersion" in eksisterende) post.baseVersion = eksisterende.baseVersion;
  } else {
    post.base = meta.base ?? null;
    if (meta.baseVersion !== undefined) post.baseVersion = meta.baseVersion;
  }

  if (eksisterende) koe[idx] = post;
  else {
    if (koe.length >= MAKS_POSTER) return false; // værn mod at løbe løbsk
    koe.push(post);
  }

  try {
    localStorage.setItem(NOEGLE, JSON.stringify(koe));
  } catch (_) {
    return false; // kunne ikke gemmes - ændringen er IKKE sikret
  }
  notify(koe);
  return true;
}

export function removeFromQueue(orderId, storeId) {
  const koe = laes().filter((p) => !(p.id === String(orderId) && p.storeId === storeId));
  skriv(koe);
}

export function clearQueue() {
  skriv([]);
}

// Tæller et mislykket (AFVIST) forsøg op på den ventende post og returnerer
// det nye antal. Kaldes aldrig ved netværksfejl.
export function noteFailedAttempt(orderId, storeId) {
  const koe = laes();
  const idx = koe.findIndex((p) => p.id === String(orderId) && p.storeId === storeId);
  if (idx < 0) return 0;
  koe[idx] = { ...koe[idx], forsoeg: (koe[idx].forsoeg || 0) + 1 };
  skriv(koe);
  return koe[idx].forsoeg;
}

// Sender køen, én post ad gangen. processFn(post) udfører selve skrivningen
// og fjerner selv posten fra køen, når den er håndteret. Den returnerer:
//   "ok" | "handled"  skrevet / parkeret som konflikt - posten er håndteret
//   "skip"            posten findes ikke længere (allerede håndteret)
//   "network"         forbindelsen er væk - behold resten, stop her
//   "error"           serveren AFVISTE skrivningen
//
// Køen overskrives aldrig som helhed: kun den enkelte post rettes. Det
// betyder, at en ændring der lægges i køen MIDT i en afsendelse ikke går tabt.
//
// En post der gentagne gange AFVISES (fx rettigheden er trukket tilbage)
// opgives efter MAKS_FORSOEG, så den ikke blokerer for evigt. onDropped
// kaldes, så brugeren får det at vide.
export async function flushQueue(processFn, { onDropped } = {}) {
  const snapshot = laes();
  if (snapshot.length === 0) return { sendt: 0, tilbage: 0, opgivet: 0 };

  let sendt = 0;
  let opgivet = 0;

  for (const p of snapshot) {
    let udfald;
    try {
      udfald = await processFn(p);
    } catch (e) {
      udfald = isNetworkError(e) ? "network" : "error";
    }

    if (udfald === "ok" || udfald === "handled") { sendt++; continue; }
    if (udfald === "skip") continue;
    if (udfald === "network") break; // forbindelsen er væk - brænd ikke flere forsøg af

    const forsoeg = noteFailedAttempt(p.id, p.storeId);
    if (forsoeg >= MAKS_FORSOEG) {
      const levende = getQueuedPost(p.id, p.storeId) || p;
      removeFromQueue(p.id, p.storeId);
      opgivet++;
      try { onDropped?.(levende); } catch (_) { /* må ikke vælte tømningen */ }
    }
  }

  return { sendt, tilbage: laes().length, opgivet };
}
