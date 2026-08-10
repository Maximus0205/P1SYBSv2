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
    return null; // "null" her betyder "selve kaldet fejlede" (netværk/429/500) - IKKE "ingen resultater".
  }
  return data;
}

// In-memory caches - undgår at spamme funktionen (og dermed ORS-kvoten)
// mens brugeren stadig skriver på den samme adresse i samme session.
//
// VIGTIGT: kun VELLYKKEDE kald caches. Slår et kald fejl (fx fordi vi ramte
// ORS' rate-limit), skal det kunne prøves igen senere - ellers sidder en
// adresse "fast" som fejlet resten af sessionen, selvom tjenesten for
// længst er tilgængelig igen.
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
  if (data === null) return null; // kaldet fejlede (fx rate-limit) - IKKE cachet, prøv igen senere.

  // Foretræk en feature med husnummer, hvis flere kandidater kommer tilbage
  // (edge function beder allerede kun om adresse/vej-lag, men rækkefølgen
  // kan stadig variere).
  const features = data?.features || [];
  const feature = features.find((f) => f.properties?.housenumber) || features[0];
  const koordinater = feature?.geometry?.coordinates; // [lon, lat]
  const resultat = koordinater
    ? { lon: koordinater[0], lat: koordinater[1], label: feature.properties?.label || adresse, confidence: feature.properties?.confidence ?? 0 }
    : null; // reelt "ikke fundet" (tomt svar) - trygt at cache, ændrer sig sjældent.
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
  if (data === null) return []; // kaldet fejlede - ikke cachet, felten falder blot tilbage til intet forslag.

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
//
// Kører i små hold (BATCH_STOERRELSE ad gangen) med en kort pause imellem,
// i stedet for at fyre ALLE opslag af på én gang. Uden dette kunne en butik
// med mange kommende sager (fx efter en CSV-import, eller bare en travl
// uge) sende hundredvis af samtidige kald til ORS-proxyen på et øjeblik -
// det udløste ORS' rate-limit (429 "for mange forespørgsler"), og fordi
// fejlede kald tidligere blev cachet som "ikke fundet", sad selv brugerens
// egen adresse fast som fejlet resten af sessionen.
const BATCH_STOERRELSE = 4;
const BATCH_PAUSE_MS = 300;
const MAKS_ADRESSER = 40; // nok til formålet (vise nærliggende bookinger) uden at bruge hele ORS-kvoten på ét opslag

export async function geokodAdresser(adresser) {
  const unikke = [...new Set((adresser || []).map(normaliser).filter((a) => a.length >= 5))].slice(0, MAKS_ADRESSER);
  const map = new Map();
  for (let i = 0; i < unikke.length; i += BATCH_STOERRELSE) {
    const hold = unikke.slice(i, i + BATCH_STOERRELSE);
    const resultater = await Promise.all(hold.map(async (a) => [a, await geokodAdresse(a)]));
    resultater.forEach(([a, koord]) => { if (koord) map.set(a, koord); });
    if (i + BATCH_STOERRELSE < unikke.length) await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
  }
  return map;
}

// Køreafstand (meter) fra ét udgangspunkt til flere destinationer.
export async function koereafstande(kilde, destinationer) {
  if (!kilde || !destinationer || destinationer.length === 0) return [];
  const data = await kaldProxy({ handling: "matrix", kilde, destinationer });
  return data?.distances?.[0] || [];
}

// Samlet forventet køretid (minutter) for at besøge en liste af punkter I
// DEN RÆKKEFØLGE de gives i - bruges af Kørselsoverblikket til at vise
// "opgavetid + køretid" pr. bil, så man kan se om en dag er ved at være
// overbooket. Ikke en ægte ruteoptimering (punkterne besøges i den
// rækkefølge de kommer ind, typisk kronologisk efter tidsrum/starttid) -
// kun et realistisk estimat af den samlede kørsel gennem dagens stop.
export async function koeretidForRute(punkterOrdnet) {
  const gyldige = (punkterOrdnet || []).filter((p) => p && p.lat != null && p.lon != null);
  if (gyldige.length < 2) return 0;
  const data = await kaldProxy({ handling: "matrix", punkter: gyldige });
  const varigheder = data?.durations;
  if (!varigheder) return null; // kaldet fejlede - lad kalderen vise "kunne ikke beregne" i stedet for 0
  let sekunderIAlt = 0;
  for (let i = 0; i < gyldige.length - 1; i++) {
    const leg = varigheder[i]?.[i + 1];
    if (leg == null) return null;
    sekunderIAlt += leg;
  }
  return Math.round(sekunderIAlt / 60);
}

// Findes stadig af bagudkompatibilitetshensyn - er nu altid "true" for
// indloggede brugere, fordi nøglen ikke længere afhænger af en lokal .env.
// Behold kaldene i komponenterne (AdresseInput.jsx, AfstandsForslag.jsx) -
// de fejler blot blødt (tomt resultat), hvis funktionen ikke er sat op endnu.
export const harOrsNoegle = () => true;
