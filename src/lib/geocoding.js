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

// Looks up the address and returns the best hit incl. label and ORS' own
// confidence score (0-1). Shares cache with geocodeAddress/validateAddress.
// focus: optional { lat, lon } - typically the store's own address, so
// results near the store are prioritized.
async function bestMatch(address, focus) {
  const key = normalize(address) + (focus ? `|${focus.lat},${focus.lon}` : "");
  if (!key || key.length < 5) return null;
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  const data = await callProxy({ handling: "soeg", tekst: address, fokus: focus });
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

// Up to 8 address suggestions while the user is typing (dropdown under the
// address field). Builds its own clean two-line display (street+number /
// zip+city) instead of ORS' raw label, which lacks a postal code and uses
// English region names.
//
// Suggestions WITH a house number are always shown before those WITHOUT
// (plain street names with no number) - this was the main reason the house
// number was often missing: without this sort, an imprecise "whole street"
// suggestion could rank above a precise address suggestion with a house
// number, even when both existed in the response.
export async function searchAddressSuggestions(partialAddress, focus) {
  const key = normalize(partialAddress) + (focus ? `|${focus.lat},${focus.lon}` : "");
  if (!key || key.length < 3) return [];
  if (suggestionCache.has(key)) return suggestionCache.get(key);

  const data = await callProxy({ handling: "autocomplete", tekst: partialAddress, fokus: focus });
  if (data === null) return []; // the call failed - not cached, the field just falls back to no suggestion.

  const suggestions = (data?.features || [])
    .map((f) => {
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
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      };
    })
    // House-number suggestions first, otherwise keep ORS' own relevance order.
    .sort((a, b) => (b.harHusnummer ? 1 : 0) - (a.harHusnummer ? 1 : 0))
    .slice(0, 8);
  suggestionCache.set(key, suggestions);
  return suggestions;
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

// Still here for backwards compatibility - now always "true" for logged-in
// users, since the key no longer depends on a local .env. Keep the calls in
// the components (AdresseInput.jsx, AfstandsForslag.jsx) - they just fail
// softly (empty result) if the function isn't set up yet.
export const hasOrsKey = () => true;
