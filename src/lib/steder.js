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
// fokus: valgfrit { lat, lon } - typisk butikkens egen adresse, så
// resultater nær butikken prioriteres.
async function bedsteMatch(adresse, fokus) {
  const noegle = normaliser(adresse) + (fokus ? `|${fokus.lat},${fokus.lon}` : "");
  if (!noegle || noegle.length < 5) return null;
  if (geokodeCache.has(noegle)) return geokodeCache.get(noegle);

  const data = await kaldProxy({ handling: "soeg", tekst: adresse, fokus });
  // Foretræk en feature med husnummer, hvis flere kandidater kommer tilbage
  // (edge function beder allerede kun om adresse/vej-lag, men rækkefølgen
  // kan stadig variere).
  const features = data?.features || [];
  const feature = features.find((f) => f.properties?.housenumber) || features[0];
  const koordinater = feature?.geometry?.coordinates; // [lon, lat]
  const resultat = koordinater
    ? { lon: koordinater[0], lat: koordinater[1], label: feature.properties?.label || adresse, confidence: feature.properties?.confidence ?? 0 }
    : null;
  geokodeCache.set(noegle, resultat);
  return resultat;
}

// Returnerer { lon, lat } eller null (ikke fundet, eller kaldet fejlede).
export async function geokodAdresse(adresse, fokus) {
  const match = await bedsteMatch(adresse, fokus);
  return match ? { lon: match.lon, lat: match.lat } : null;
}

// Validerer en adresse, så tastefejl/ikke-eksisterende adresser bliver
// fanget, før en sag oprettes. gyldig = ORS fandt et match med rimelig
// sikkerhed (confidence >= 0.6).
export async function validerAdresse(adresse, fokus) {
  const match = await bedsteMatch(adresse, fokus);
  if (!match) return { gyldig: false, label: null, koordinater: null, confidence: 0 };
  return {
    gyldig: match.confidence >= 0.6,
    label: match.label,
    koordinater: { lon: match.lon, lat: match.lat },
    confidence: match.confidence,
  };
}

// Op til 8 adresseforslag mens brugeren skriver (dropdown under adressefeltet).
// Bygger selv en pæn to-linjers visning (vej+nr / postnr+by) i stedet for
// ORS' rå label, som mangler postnummer og bruger engelske region-navne.
//
// Forslag MED husnummer vises altid før forslag UDEN (rene vejnavne uden
// nummer) - det var hovedårsagen til at husnummeret ofte manglede: uden
// denne sortering kunne et upræcist "hele vejen"-forslag stå øverst, selvom
// et præcist adresseforslag med husnummer også fandtes i svaret.
export async function soegAdresseForslag(delvisAdresse, fokus) {
  const noegle = normaliser(delvisAdresse) + (fokus ? `|${fokus.lat},${fokus.lon}` : "");
  if (!noegle || noegle.length < 3) return [];
  if (forslagCache.has(noegle)) return forslagCache.get(noegle);

  const data = await kaldProxy({ handling: "autocomplete", tekst: delvisAdresse, fokus });
  const forslag = (data?.features || [])
    .map((f) => {
      const p = f.properties || {};
      const harHusnummer = !!p.housenumber;
      const hovedtekst = [p.street, p.housenumber].filter(Boolean).join(" ") || p.name || p.label || "";
      const undertekst = [p.postalcode, p.locality || p.county].filter(Boolean).join(" ");
      return {
        // Bruges når forslaget vælges - selve adressen der lægges i feltet.
        label: undertekst ? `${hovedtekst}, ${undertekst}` : (p.label || hovedtekst),
        hovedtekst,
        undertekst,
        harHusnummer,
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      };
    })
    // Adresser med husnummer først, ellers behold ORS' egen relevans-rækkefølge.
    .sort((a, b) => (b.harHusnummer ? 1 : 0) - (a.harHusnummer ? 1 : 0))
    .slice(0, 8);
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
