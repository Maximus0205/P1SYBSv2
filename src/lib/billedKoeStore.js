// BILLEDKØ - lageret (oktober 2026): billederne gemmes i IndexedDB på enheden.
//
// HVORFOR IKKE localStorage (som offlineQueue.js bruger): et billede er hundredvis af kilobyte, og
// localStorage kan kun rumme tekst og cirka 5 MB i alt. IndexedDB gemmer billedet som en fil.
//
// KILDEN TIL SANDHED er stadig databasen/lageret på serveren. Her ligger kun billeder, der endnu
// ikke er bekræftet sendt - og de slettes igen, så snart serveren har bekræftet dem
// (se billedKoeCore.js).
//
// put() svarer først, når transaktionen er FÆRDIG (oncomplete), ikke når forespørgslen blot er
// accepteret: kun så er billedet reelt skrevet, hvis appen lukkes lige bagefter.

const DB_NAVN = "p1sybs-billedkoe";
const STORE_NAVN = "poster";

let dbLoefte = null;

function aabn() {
  if (dbLoefte) return dbLoefte;
  dbLoefte = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAVN, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAVN)) req.result.createObjectStore(STORE_NAVN, { keyPath: "id" });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Lukker en anden fane/en opgradering forbindelsen, åbnes den igen ved næste brug.
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
    tx.onabort = () => reject(tx.error || new Error("IndexedDB afbrudt (fx fuldt lager)"));
    const req = arbejde(tx.objectStore(STORE_NAVN));
    if (req) req.onsuccess = () => { resultat = req.result; };
  });
}

// Findes IndexedDB overhovedet (ikke i fx nogle private vinduer)? Ellers svarer vi null, og
// kalderen sender billedet direkte som før - uden offline-beskyttelse.
export function opretIndexedDbStore() {
  if (typeof indexedDB === "undefined" || !indexedDB) return null;
  return {
    put: (post) => transaktion("readwrite", (s) => s.put(post)),
    delete: (id) => transaktion("readwrite", (s) => s.delete(id)),
    getAll: () => transaktion("readonly", (s) => s.getAll()).then((r) => r || []),
  };
}
