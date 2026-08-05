// Klient til adresseopslag/afstandsberegning. Kalder IKKE openrouteservice
// direkte længere - det gør en Supabase Edge Function
// (supabase/functions/ors-proxy) i stedet, så ORS-nøglen kun ligger
// server-side og aldrig i den offentlige frontend-kode.
//
// Kræver at brugeren er logget ind (Supabase sender automatisk sessionens
// Authorization-header med via supabase.functions.invoke).

import { supabase } from "./supabaseClient";

async function kaldProxy(krop) {
  const { data, error } = await supabase.functions.invoke("ors-proxy", { body: krop });
  if (error) {
    console.error("ors-proxy fejlede:", error.message);
    return null;
  }
  return data;
}

// In-memory caches - undgår at spamme funktionen (og dermed ORS-kvoten)
// mens brugeren stadig skriver på den samme adresse i samme session.
const geokodeCache = new Map();
const forslagCache = new Map();

const normaliser = (adr) => (adr || "").trim().toLowerCase();

// Slår adressen op og returnerer det bedste hit inkl. label og ORS' egen
// konfidensscore (0-1). Deler cache med geokodAdresse/validerAdresse.
async function bedsteMatch(adresse) {
  const noegle = normaliser(adresse);
  if (!noegle || noegle.length < 5) return null;
  if (geokodeCache.has(noegle)) return geokodeCache.get(noegle);

  const data = await kaldProxy({ handling: "soeg", tekst: adresse });
  const feature = data?.features?.[0];
  const koordinater = feature?.geometry?.coordinates; // [lon, lat]
  const resultat = koordinater
    ? { lon: koordinater[0], lat: koordinater[1], label: feature.properties?.label || adresse, confidence: feature.properties?.confidence ?? 0 }
    : null;
  geokodeCache.set(noegle, resultat);
  return resultat;
}

// Returnerer { lon, lat } eller null (ikke fundet, eller kaldet fejlede).
export async function geokodAdresse(adresse) {
  const match = await bedsteMatch(adresse);
  return match ? { lon: match.lon, lat: match.lat } : null;
}

// Validerer en adresse, så tastefejl/ikke-eksisterende adresser bliver
// fanget, før en sag oprettes. gyldig = ORS fandt et match med rimelig
// sikkerhed (confidence >= 0.6).
export async function validerAdresse(adresse) {
  const match = await bedsteMatch(adresse);
  if (!match) return { gyldig: false, label: null, koordinater: null, confidence: 0 };
  return {
    gyldig: match.confidence >= 0.6,
    label: match.label,
    koordinater: { lon: match.lon, lat: match.lat },
    confidence: match.confidence,
  };
}

// Op til 5 adresseforslag mens brugeren skriver (dropdown under adressefeltet).
export async function soegAdresseForslag(delvisAdresse) {
  const noegle = normaliser(delvisAdresse);
  if (!noegle || noegle.length < 3) return [];
  if (forslagCache.has(noegle)) return forslagCache.get(noegle);

  const data = await kaldProxy({ handling: "autocomplete", tekst: delvisAdresse });
  const forslag = (data?.features || []).map((f) => ({
    label: f.properties?.label || "",
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }));
  forslagCache.set(noegle, forslag);
  return forslag;
}

// Geokoder en liste af adresser (dedupliceret) - bruges af AfstandsForslag
// til at slå alle kommende sagers adresser op på én gang.
export async function geokodAdresser(adresser) {
  const unikke = [...new Set((adresser || []).map(normaliser).filter((a) => a.length >= 5))];
  const par = await Promise.all(unikke.map(async (a) => [a, await geokodAdresse(a)]));
  const map = new Map();
  par.forEach(([a, koord]) => { if (koord) map.set(a, koord); });
  return map;
}

// Køreafstand (meter) fra ét udgangspunkt til flere destinationer.
export async function koereafstande(kilde, destinationer) {
  if (!kilde || !destinationer || destinationer.length === 0) return [];
  const data = await kaldProxy({ handling: "matrix", kilde, destinationer });
  return data?.distances?.[0] || [];
}

// Findes stadig af bagudkompatibilitetshensyn - er nu altid "true" for
// indloggede brugere, fordi nøglen ikke længere afhænger af en lokal .env.
// Behold kaldene i komponenterne (AdresseInput.jsx, AfstandsForslag.jsx) -
// de fejler blot blødt (tomt resultat), hvis funktionen ikke er sat op endnu.
export const harOrsNoegle = () => true;
