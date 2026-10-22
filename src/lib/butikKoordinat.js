import { searchAdressevaelger, lookupAdressevaelgerCoordinates } from "./geocodingAdressevaelger";
import { geocodeAddress } from "./geocoding";

// Butikkens adresse -> { lat, lon }. Bruges, når butikken ikke har koordinater i databasen. Først Adressevælgeren (samme kilde som sagernes adresser),
// derefter ORS som reserve. Svaret huskes pr. adresse; et mislykket opslag huskes ikke, så det prøves igen næste gang.
const cache = new Map();
const gyldig = (k) => (k && Number.isFinite(k.lat) && Number.isFinite(k.lon) ? { lat: k.lat, lon: k.lon } : null);

export async function butikKoordinat(adresse) {
  const a = String(adresse || "").trim();
  if (!a) return null;
  if (cache.has(a)) return cache.get(a);
  let k = null;
  try {
    const r = await searchAdressevaelger(a, undefined, "soeg-husnumre");
    const traef = r?.ok ? (r.fund.find((f) => f.type === "husnummer") || r.fund[0]) : null;
    if (traef?.id) k = gyldig(await lookupAdressevaelgerCoordinates(traef.id, traef.type));
  } catch { k = null; }
  if (!k) { try { k = gyldig(await geocodeAddress(a)); } catch { k = null; } }
  if (k) cache.set(a, k);
  return k;
}
