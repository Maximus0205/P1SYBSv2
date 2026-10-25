// LÆSE-CACHE TIL OFFLINE (oktober 2026): sidst hentede data, så en montør kan ÅBNE appen og se dagens
// sager uden net. Reglerne er rene (ingen IndexedDB, DOM eller Supabase), så de kan afprøves direkte med
// node (tests/laeseCache.test.mjs); selve lageret er nederst i filen.
//
// DETTE ER EN CACHE, IKKE EN DATABASE. Databasen er stadig eneste kilde til sandhed:
//   * Der LÆSES kun herfra, når hentningen fejler på grund af FORBINDELSEN (ikke ved en afvisning).
//   * Ændringer lægges aldrig her - de ligger i offline-køen (lib/offlineQueue.js) og billedkøen.
//   * Alt ældre end 14 dage ignoreres og slettes.
//   * Alt slettes, når brugeren logger ud (kundedata skal ikke ligge på en telefon efter logud).
//   * Nøglerne indeholder bruger-id'et, så en anden bruger på samme enhed aldrig ser andres data.
export const MAKS_ALDER_MS = 14 * 24 * 60 * 60 * 1000;

export function opretLaeseCache({ store, nu = () => Date.now(), maksAlder = MAKS_ALDER_MS } = {}) {
  if (!store) throw new Error("opretLaeseCache: store mangler");
  return {
    // Svarer true, hvis det blev gemt. Fejler lageret (fuldt, blokeret), er det ikke kritisk - det er kun en cache.
    async gem(noegle, vaerdi) {
      try { await store.put({ noegle, vaerdi, gemt: nu() }); return true; } catch (_) { return false; }
    },
    // { vaerdi, gemt } eller null (findes ikke, for gammelt eller ulæseligt).
    async hent(noegle) {
      try {
        const r = await store.get(noegle);
        if (!r || typeof r.gemt !== "number") return null;
        if (nu() - r.gemt > maksAlder) { try { await store.delete(noegle); } catch (_) { /* ryddes næste gang */ } return null; }
        return { vaerdi: r.vaerdi, gemt: r.gemt };
      } catch (_) { return null; }
    },
    async ryd() {
      try { await store.clear(); } catch (_) { /* ikke kritisk */ }
    },
  };
}

// ---------------------------------------------------------------------------
// "Viser gemte data": hvem (kilde) viser lige nu data fra cachen i stedet for databasen, og hvornår de blev
// hentet. Banneret øverst (OfflineBanner) fortæller det, så ingen tror, at skærmen er frisk.
const kilder = new Map();
const lyttere = new Set();
const aeldste = () => (kilder.size === 0 ? null : Math.min(...kilder.values()));

export function saetViserCache(kilde, gemtTid) {
  if (gemtTid == null) kilder.delete(kilde); else kilder.set(kilde, gemtTid);
  const v = aeldste();
  lyttere.forEach((fn) => { try { fn(v); } catch (_) { /* en lytter må ikke vælte noget */ } });
}
export function subscribeViserCache(fn) {
  lyttere.add(fn);
  try { fn(aeldste()); } catch (_) { /* som ovenfor */ }
  return () => lyttere.delete(fn);
}

// ---------------------------------------------------------------------------
// Lageret: IndexedDB. Findes det ikke, bruges ingen cache (appen virker som før).
const DB_NAVN = "p1sybs-laesecache";
const STORE_NAVN = "kv";
let dbLoefte = null;

function aabn() {
  if (dbLoefte) return dbLoefte;
  dbLoefte = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAVN, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAVN)) req.result.createObjectStore(STORE_NAVN, { keyPath: "noegle" });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => { dbLoefte = null; };
      db.onversionchange = () => { db.close(); dbLoefte = null; };
      resolve(db);
    };
    req.onerror = () => { dbLoefte = null; reject(req.error || new Error("IndexedDB kunne ikke åbnes")); };
    req.onblocked = () => { dbLoefte = null; reject(new Error("IndexedDB er blokeret")); };
  });
  return dbLoefte;
}

async function transaktion(tilstand, arbejde) {
  const db = await aabn();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAVN, tilstand);
    let resultat;
    tx.oncomplete = () => resolve(resultat);
    tx.onerror = () => reject(tx.error || new Error("IndexedDB-fejl"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB afbrudt"));
    const req = arbejde(tx.objectStore(STORE_NAVN));
    if (req) req.onsuccess = () => { resultat = req.result; };
  });
}

export function opretIndexedDbLaeseStore() {
  if (typeof indexedDB === "undefined" || !indexedDB) return null;
  return {
    put: (post) => transaktion("readwrite", (s) => s.put(post)),
    get: (noegle) => transaktion("readonly", (s) => s.get(noegle)),
    delete: (noegle) => transaktion("readwrite", (s) => s.delete(noegle)),
    clear: () => transaktion("readwrite", (s) => s.clear()),
  };
}

const standardStore = opretIndexedDbLaeseStore();
// Den cache, appen bruger. Uden IndexedDB: en cache, der aldrig gemmer eller finder noget.
export const laeseCache = standardStore
  ? opretLaeseCache({ store: standardStore })
  : { gem: async () => false, hent: async () => null, ryd: async () => {} };
