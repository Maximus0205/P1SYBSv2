// Client for address lookup/distance calculation. Does NOT call
// openrouteservice directly anymore - a Supabase Edge Function
// (supabase/functions/ors-proxy) does that instead, so the ORS key only
// ever lives server-side, never in the public frontend code.
//
// Requires the user to be logged in (Supabase automatically sends the
// session's Authorization header via supabase.functions.invoke).

import { supabase } from "./supabaseClient";

async function callProxy(body) {
  const { data, error } = await supabase.functions.invoke("ors-proxy", { body });
  if (error) {
    console.error("ors-proxy failed:", error.message);
    return null; // "null" here means "the call itself failed" (network/429/500) - NOT "no results".
  }
  return data;
}

// In-memory caches - avoids spamming the function (and thereby the ORS
// quota) while the user is still typing the same address in the same
// session.
//
// IMPORTANT: only SUCCESSFUL calls are cached. If a call fails (e.g.
// because we hit ORS' rate limit), it must be retryable later - otherwise
// an address gets permanently "stuck" as failed for the rest of the
// session, even though the service has long since recovered.
const geocodeCache = new Map();
const suggestionCache = new Map();

const normalize = (address) => (address || "").trim().toLowerCase();

// ---------------------------------------------------------------------------
// POSTNUMMER-GENKENDELSE (september 2026, RETTET)
//
// Første forsøg her var at omskrive "Fuglebakken 5750" til "Fuglebakken,
// 5750" for at hjælpe ORS' adresseparser med at genkende postnummeret. Det
// virkede IKKE i praksis (bekræftet ved test) - og det er ikke en fejl i
// formateringen, men i selve tjenesten: ORS' geocoding (bygget på Pelias)
// har en KENDT, ubekræftet fejl i deres egen bug-tracker, hvor postnummeret
// reelt ignoreres af søgningen, uanset hvordan det sendes (se
// github.com/GIScience/openrouteservice, issue #1003 - "Structured query
// for postal code doesn't work"). Der findes ingen pålidelig måde at bede
// ORS om at indsnævre en søgning til et postnummer på - hverken via fri
// tekst eller strukturerede parametre.
//
// Komma-omskrivningen er BEHOLDT (harmløs, og kan stadig hjælpe i mindre
// skæve tilfælde end "Fuglebakken"/Odense), men den egentlige rettelse for
// DENNE fejl er i stedet at GØRE OPMÆRKSOM på begrænsningen, se
// extractPostalCodeHint og AddressInput.jsx: kan søgningen ikke bekræftes
// at ramme det skrevne postnummer, vises et konkret tip om at skrive
// BYNAVNET i stedet - det er det, ORS rent faktisk kan finde ud af.
export function extractPostalCodeHint(text) {
  const match = (text || "").trim().match(/^(.*\S)\s+(\d{4})$/);
  if (!match) return null;
  const postnr = Number(match[2]);
  if (postnr < 1000 || postnr > 9990) return null;
  return match[2];
}

function splitPostalCodeHint(text) {
  const postnr = extractPostalCodeHint(text);
  if (!postnr) return { query: text, postnr: null };
  const withoutCode = text.trim().slice(0, text.trim().length - postnr.length).trim().replace(/,$/, "");
  return { query: `${withoutCode}, ${postnr}`, postnr };
}

// Luftlinjeafstand (meter, Haversine) - bruges KUN til at SORTERE forslag
// efter nærhed til et fokuspunkt (typisk butikken). Til reelle køreafstande
// bruges ORS' matrix-kald i stedet, se drivingDistances/routeDrivingTime
// nedenfor - denne er bevidst en simpel tilnærmelse, hurtig nok til at
// sortere en dropdown-liste uden endnu et netværkskald pr. tastetryk.
function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Splitter et husnummer som "11A" i { num: 11, letter: "A" }, så en liste
// kan sorteres i den rækkefølge, man rent faktisk går ned ad en gade i.
// ORS/Pelias returnerer dem i sin egen relevans-rækkefølge, som hverken er
// numerisk eller på nogen anden forudsigelig måde ordnet (den observerede
// fejl: "11A, 9, 11, 13, 7, 15, 5, 17").
function parseHouseNumber(raw) {
  const match = (raw || "").trim().match(/^(\d+)\s*([a-zA-Z]?)/);
  if (!match) return { num: Infinity, letter: "" };
  return { num: Number(match[1]), letter: (match[2] || "").toUpperCase() };
}

// Looks up the address and returns the best hit incl. label and ORS' own
// confidence score (0-1). Shares cache with geocodeAddress/validateAddress.
// focus: optional { lat, lon } - typically the store's own address, so
// results near the store are prioritized.
async function bestMatch(address, focus) {
  const key = normalize(address) + (focus ? `|${focus.lat},${focus.lon}` : "");
  if (!key || key.length < 5) return null;
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  const { query } = splitPostalCodeHint(address);
  const data = await callProxy({ handling: "soeg", tekst: query, fokus: focus });
  if (data === null) return null; // the call failed (e.g. rate limit) - NOT cached, retry later.

  // Prefer a feature with a house number if several candidates come back
  // (the edge function already only asks for address/street layers, but
  // the order can still vary).
  const features = data?.features || [];
  const feature = features.find((f) => f.properties?.housenumber) || features[0];
  const coordinates = feature?.geometry?.coordinates; // [lon, lat]
  const result = coordinates
    ? { lon: coordinates[0], lat: coordinates[1], label: feature.properties?.label || address, confidence: feature.properties?.confidence ?? 0 }
    : null; // genuinely "not found" (empty response) - safe to cache, rarely changes.
  geocodeCache.set(key, result);
  return result;
}

// Returns { lon, lat } or null (not found, or the call failed).
export async function geocodeAddress(address, focus) {
  const match = await bestMatch(address, focus);
  return match ? { lon: match.lon, lat: match.lat } : null;
}

// Validates an address, so typos/non-existent addresses get caught before
// an order is created. valid = ORS found a match with reasonable confidence
// (>= 0.6).
export async function validateAddress(address, focus) {
  const match = await bestMatch(address, focus);
  if (!match) return { gyldig: false, label: null, koordinater: null, confidence: 0 };
  return {
    gyldig: match.confidence >= 0.6,
    label: match.label,
    koordinater: { lon: match.lon, lat: match.lat },
    confidence: match.confidence,
  };
}

// Up to 10 address suggestions while the user is typing (dropdown under the
// address field). Builds its own clean two-line display (street+number /
// zip+city) instead of ORS' raw label, which lacks a postal code and uses
// English region names.
//
// Tre forbedringer af selve rangeringen, ovenpå ORS/Pelias' rå
// relevans-liste (som IKKE er numerisk eller geografisk ordnet ud af sig
// selv):
//  1. Postnummer-hint - findes der mindst ét forslag med det postnummer,
//     brugeren faktisk skrev, filtreres til KUN dem. Dette virker dog KUN
//     når ORS overhovedet returnerer et forslag i den by til at starte med
//     - se noten ved extractPostalCodeHint: det er ikke altid tilfældet
//     (kendt begrænsning i selve ORS), og AddressInput.jsx viser i så fald
//     et tip om at skrive bynavnet i stedet.
//  2. Afstand til et fokuspunkt (typisk butikken) - forslag tættest på
//     kommer først. Adskiller effektivt forskellige byer med samme
//     gadenavn, UDEN at forstyrre rækkefølgen for numre på samme gade
//     (som ligger for tæt på hinanden til at afstanden gør nogen reel
//     forskel - se de 50 meters margin nedenfor).
//  3. Husnumre med tal sorteres NUMERISK ("5, 7, 9, 11, 11A, 13...") i
//     stedet for ORS' egen, ude-af-trit rækkefølge.
export async function searchAddressSuggestions(partialAddress, focus) {
  const key = normalize(partialAddress) + (focus ? `|${focus.lat},${focus.lon}` : "");
  if (!key || key.length < 3) return [];
  if (suggestionCache.has(key)) return suggestionCache.get(key);

  const { query, postnr } = splitPostalCodeHint(partialAddress);
  const data = await callProxy({ handling: "autocomplete", tekst: query, fokus: focus });
  if (data === null) return []; // the call failed - not cached, the field just falls back to no suggestion.

  let suggestions = (data?.features || []).map((f) => {
    const p = f.properties || {};
    const hasHouseNumber = !!p.housenumber;
    const mainText = [p.street, p.housenumber].filter(Boolean).join(" ") || p.name || p.label || "";
    const subText = [p.postalcode, p.locality || p.county].filter(Boolean).join(" ");
    return {
      // Used when the suggestion is selected - the actual address put into the field.
      label: subText ? `${mainText}, ${subText}` : (p.label || mainText),
      hovedtekst: mainText,
      undertekst: subText,
      harHusnummer: hasHouseNumber,
      husnummer: parseHouseNumber(p.housenumber),
      postnummer: p.postalcode || null,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    };
  });

  if (postnr) {
    const matching = suggestions.filter((s) => s.postnummer === postnr);
    if (matching.length > 0) suggestions = matching;
  }

  suggestions.sort((a, b) => {
    if (focus) {
      const da = haversineMeters(focus, a);
      const db = haversineMeters(focus, b);
      // Under 50 meters reel forskel er støj (typisk to numre på samme
      // gade) - lad husnummer-sorteringen nedenfor afgøre den rækkefølge
      // i stedet for tilfældige meter-udsving.
      if (Math.abs(da - db) > 50) return da - db;
    }
    if (a.harHusnummer !== b.harHusnummer) return a.harHusnummer ? -1 : 1;
    if (a.husnummer.num !== b.husnummer.num) return a.husnummer.num - b.husnummer.num;
    return a.husnummer.letter.localeCompare(b.husnummer.letter);
  });

  const result = suggestions.slice(0, 10);
  suggestionCache.set(key, result);
  return result;
}

// Geocodes a list of addresses (deduplicated) - used by AfstandsForslag to
// look up all upcoming orders' addresses at once.
//
// Runs in small batches (BATCH_SIZE at a time) with a short pause in
// between, instead of firing ALL lookups at once. Without this, a store
// with many upcoming orders (e.g. after a CSV import, or just a busy week)
// could send hundreds of simultaneous calls to the ORS proxy in an instant
// - that triggered ORS' rate limit (429 "too many requests"), and because
// failed calls used to be cached as "not found", even the user's own
// address would get stuck as failed for the rest of the session.
const BATCH_SIZE = 4;
const BATCH_PAUSE_MS = 300;
const MAX_ADDRESSES = 40; // enough for the purpose (showing nearby bookings) without burning the whole ORS quota on one lookup

export async function geocodeAddresses(addresses) {
  const unique = [...new Set((addresses || []).map(normalize).filter((a) => a.length >= 5))].slice(0, MAX_ADDRESSES);
  const map = new Map();
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(async (a) => [a, await geocodeAddress(a)]));
    results.forEach(([a, coords]) => { if (coords) map.set(a, coords); });
    if (i + BATCH_SIZE < unique.length) await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
  }
  return map;
}

// Driving distance (meters) from ONE origin to several destinations.
export async function drivingDistances(source, destinations) {
  if (!source || !destinations || destinations.length === 0) return [];
  const data = await callProxy({ handling: "matrix", kilde: source, destinationer: destinations });
  return data?.distances?.[0] || [];
}

// Total expected driving time (minutes) to visit a list of points IN THE
// ORDER given - used by the driving overview to show "job time + driving
// time" per vehicle, so it's easy to see if a day is getting overbooked.
// Not a real route optimization (the points are visited in the order they
// come in, typically chronological by time slot/start time) - just a
// realistic estimate of the total driving through the day's stops.
export async function routeDrivingTime(orderedPoints) {
  const valid = (orderedPoints || []).filter((p) => p && p.lat != null && p.lon != null);
  if (valid.length < 2) return 0;
  const data = await callProxy({ handling: "matrix", punkter: valid });
  const durations = data?.durations;
  if (!durations) return null; // the call failed - let the caller show "could not calculate" instead of 0
  let totalSeconds = 0;
  for (let i = 0; i < valid.length - 1; i++) {
    const leg = durations[i]?.[i + 1];
    if (leg == null) return null;
    totalSeconds += leg;
  }
  return Math.round(totalSeconds / 60);
}

// Ægte RÆKKEFØLGE-optimering (ikke bare et estimat på en given rækkefølge,
// se routeDrivingTime ovenfor) - beregner den bedste besøgsrækkefølge for
// en montørs stop, med points[0] som FAST udgangspunkt (typisk firmaets
// adresse). Bruger den fulde afstandsmatrix fra ÉT enkelt ORS-kald (samme
// underliggende kald som routeDrivingTime, bare udnyttet fuldt ud i
// stedet for kun de "kronologiske" nabo-afstande), og kører derefter en
// "nærmeste nabo"-algoritme lokalt: fra det aktuelle punkt, vælg altid det
// nærmeste ubesøgte punkt. Ikke matematisk bevist optimal for mange stop
// (det er et NP-svært problem, "rejsende sælger"-problemet) - men for de
// typisk 2-8 stop en montør har på én dag, giver det et solidt, hurtigt og
// forklarligt forslag uden nogen AI involveret.
//
// Returnerer et array af INDEKSER ind i `points` i den foreslåede
// rækkefølge (altid startende med 0), eller null hvis kaldet fejlede.
export async function optimalVisitOrder(points) {
  const valid = (points || []).filter((p) => p && p.lat != null && p.lon != null);
  if (valid.length < 3) return valid.map((_, i) => i); // 0-1 stop udover startpunktet - intet at optimere
  const data = await callProxy({ handling: "matrix", punkter: valid });
  const durations = data?.durations;
  if (!durations) return null;

  const n = valid.length;
  const visited = new Array(n).fill(false);
  visited[0] = true;
  const order = [0];
  let current = 0;
  for (let step = 1; step < n; step++) {
    let best = -1;
    let bestTime = Infinity;
    for (let j = 1; j < n; j++) {
      if (visited[j]) continue;
      const t = durations[current]?.[j];
      if (t != null && t < bestTime) { bestTime = t; best = j; }
    }
    if (best === -1) break; // manglende data for resten - stop, det vi har er stadig gyldigt
    visited[best] = true;
    order.push(best);
    current = best;
  }
  return order;
}

// Still here for backwards compatibility - now always "true" for logged-in
// users, since the key no longer depends on a local .env. Keep the calls in
// the components (AdresseInput.jsx, AfstandsForslag.jsx) - they just fail
// softly (empty result) if the function isn't set up yet.
export const hasOrsKey = () => true;
