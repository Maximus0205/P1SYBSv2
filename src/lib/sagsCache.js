// SAGER TIL OFFLINE-CACHEN: rene funktioner (afprøvet i tests/sagsCache.test.mjs). Se laeseCache.js for reglerne.
//
// Der caches serverens SENESTE KENDTE udgave af hver sag (id, version, data) - ikke brugerens lokale, endnu
// ikke sendte ændringer. De ligger i offline-køen (lib/offlineQueue.js) og lægges oven på, når sagerne vises.
// Cachen bevarer også versionen, så en ændring lavet uden net bygger på den udgave, brugeren faktisk så, og
// databasen kan opdage en konflikt, når ændringen sendes (se lib/orderMerge.js).

export const sagsNoegle = (ejerId, butikId) => `sager:${ejerId}:${butikId}`;
export const kontekstNoegle = (ejerId) => `kontekst:${ejerId}`;

// versions/bases: Map(id -> version) og Map(id -> data) som useOrders holder. Sager uden kendt data springes over.
export function raekkerTilCache(versions, bases) {
  const out = [];
  for (const [id, version] of versions) {
    const data = bases.get(id);
    if (data && typeof data === "object") out.push({ id, version, data });
  }
  return out;
}

// raekker: det, der blev læst fra cachen (kan være ødelagt - valideres). koe: offline-køens poster.
// Svarer { orders, versions, bases } til at starte useOrders fra.
export function visningFraCache(raekker, koe, butikId) {
  const gyldige = (Array.isArray(raekker) ? raekker : []).filter(
    (r) => r && typeof r.id === "string" && Number.isFinite(r.version) && r.data && typeof r.data === "object",
  );
  const ventende = new Map((koe || []).filter((p) => p && p.storeId === butikId && p.order).map((p) => [String(p.id), p]));
  const versions = new Map(), bases = new Map(), orders = [];
  for (const r of gyldige) {
    versions.set(r.id, r.version);
    bases.set(r.id, r.data);
    orders.push(ventende.has(r.id) ? ventende.get(r.id).order : r.data);   // egne ventende ændringer ligger øverst
  }
  // En sag oprettet uden net findes endnu ikke i cachen, men skal vises.
  for (const [id, p] of ventende) if (!versions.has(id)) orders.push(p.order);
  return { orders, versions, bases };
}
