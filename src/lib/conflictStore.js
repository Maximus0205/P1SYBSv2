// PARKEREDE KONFLIKTER (oktober 2026)
//
// Når to personer har rettet SAMME felt på samme sag til forskellige
// værdier, gætter appen ikke. Brugerens ændring parkeres HER - bevaret,
// også hvis appen lukkes - og ConflictBanner.jsx beder brugeren vælge
// mellem sin egen og den andens version. Intet overskrives, og intet
// forsvinder usynligt. Se lib/orderMerge.js for hvornår en ændring er en
// konflikt, og hooks/useOrders.js for hvordan den opstår og afgøres.
//
// Samme mønster som lib/saveStatus.js: et lille Set af lyttere, ingen
// ny dependency. En konflikt har et eget id (kid), så flere konflikter på
// samme sag kan ligge side om side og afgøres hver for sig.

const NOEGLE = "p1sybs.konflikter.v1";
const MAKS = 50;

const listeners = new Set();
const resolveListeners = new Set();

function laesFraLager() {
  try {
    const raa = localStorage.getItem(NOEGLE);
    const parsed = raa ? JSON.parse(raa) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

// Hukommelsen er kilden i en kørende app; localStorage sikrer, at
// konflikterne overlever en genstart. Kan browseren ikke skrive, virker
// konflikterne stadig, så længe appen er åben.
let liste = laesFraLager();

function persister() {
  try {
    localStorage.setItem(NOEGLE, JSON.stringify(liste));
  } catch (_) {
    // Fuld eller blokeret - hukommelsen bærer videre.
  }
  listeners.forEach((fn) => {
    try { fn(liste); } catch (_) { /* en lytter må ikke vælte lageret */ }
  });
}

export function getConflicts() {
  return liste;
}

export function addConflict(post) {
  const kid = post.kid || `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  liste = [...liste, { ...post, kid, tid: post.tid || new Date().toISOString() }].slice(-MAKS);
  persister();
  return kid;
}

export function updateConflict(kid, felter) {
  liste = liste.map((c) => (c.kid === kid ? { ...c, ...felter } : c));
  persister();
}

export function removeConflict(kid) {
  liste = liste.filter((c) => c.kid !== kid);
  persister();
}

export function subscribeConflicts(fn) {
  listeners.add(fn);
  try { fn(liste); } catch (_) { /* som ovenfor */ }
  return () => listeners.delete(fn);
}

// Bannerets valg ("mine" | "theirs") sendes videre til useOrders, som ejer
// selve skrivningen til databasen.
export function requestResolve(kid, valg) {
  resolveListeners.forEach((fn) => {
    try { fn(kid, valg); } catch (_) { /* som ovenfor */ }
  });
}

export function subscribeResolve(fn) {
  resolveListeners.add(fn);
  return () => resolveListeners.delete(fn);
}
