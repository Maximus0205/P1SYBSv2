// VERSIONEREDE SKRIVNINGER OG LÆSNINGER AF SAGER (oktober 2026)
//
// Supplerer lib/dataStore.js (som er uændret). Sager gemmes nu via
// databasefunktionen save_order, der KUN skriver, hvis kalderen byggede på
// den nuværende version - se supabase/migrations/20261003_order_versioning.sql.
// Skrives en sag ud fra en forældet udgave, afvises det, og den nyeste
// udgave returneres, så hooks/useOrders.js kan flette eller spørge brugeren.
//
// Funktionerne her kaster aldrig: de returnerer altid et resultat, så en
// netværksfejl (supabase-js kaster ikke, men returnerer den i { error })
// aldrig kan forveksles med en afvisning.

import { supabase } from "./supabaseClient";
import { logError } from "./errorLog";
import { isNetworkError } from "./offlineQueue";

// Supabase afkorter svar ved 1000 rækker. Over den grænse må vi ikke
// tolke "mangler i svaret" som "slettet" (se useOrders.refresh).
export const MAKS_RAEKKER = 1000;

const BID = 80; // antal id'er pr. forespørgsel (URL-længde)

export async function fetchAllOrders(storeId) {
  if (!storeId) return { ok: true, rows: [] };
  const { data, error } = await supabase.from("orders").select("id, version, data").eq("store_id", storeId);
  if (error) {
    logError("orderStore:fetchAllOrders", error.message);
    return { ok: false, rows: [], netvaerk: isNetworkError(error) };
  }
  return { ok: true, rows: data || [] };
}

// Let forespørgsel (kun id + version) til den løbende opdatering - hele
// sagsbasen hentes ikke hvert 20. sekund.
export async function fetchOrderVersions(storeId) {
  if (!storeId) return { ok: true, rows: [] };
  const { data, error } = await supabase.from("orders").select("id, version").eq("store_id", storeId);
  if (error) {
    if (!isNetworkError(error)) logError("orderStore:fetchOrderVersions", error.message);
    return { ok: false, rows: [], netvaerk: isNetworkError(error) };
  }
  return { ok: true, rows: data || [] };
}

export async function fetchOrdersByIds(storeId, ids) {
  if (!storeId || !ids || ids.length === 0) return { ok: true, rows: [] };
  const rows = [];
  for (let i = 0; i < ids.length; i += BID) {
    const del = ids.slice(i, i + BID).map(String);
    const { data, error } = await supabase.from("orders").select("id, version, data").eq("store_id", storeId).in("id", del);
    if (error) {
      if (!isNetworkError(error)) logError("orderStore:fetchOrdersByIds", error.message);
      return { ok: false, rows: [], netvaerk: isNetworkError(error) };
    }
    rows.push(...(data || []));
  }
  return { ok: true, rows };
}

// Gemmer ÉN sag.
//   expectedVersion = nummeret, ændringen byggede på (null = ny sag)
// Resultat: { status, version?, data?, fejl? } hvor status er
//   "ok"        gemt (version = den nye; data medfølger ved oprettelse og har sagsnummeret)
//   "conflict"  nogen nåede først (version + data = den nyeste udgave)
//   "exists"    forsøgt oprettet, men id findes allerede
//   "not_found" sagen findes ikke (slettet, eller ingen adgang)
//   "network"   serveren kunne ikke nås - ændringen er IKKE afvist
//   "error"     serveren afviste skrivningen (fejl = tekst, allerede på dansk ved rettighedsfejl)
export async function saveOrderVersioned(storeId, order, expectedVersion) {
  if (!storeId || !order?.id) return { status: "error", fejl: "Mangler butik eller sag" };
  const { data, error } = await supabase.rpc("save_order", {
    p_store_id: storeId,
    p_id: String(order.id),
    p_data: order,
    p_expected_version: expectedVersion ?? null,
  });
  if (error) {
    if (isNetworkError(error)) return { status: "network", fejl: error.message };
    logError("orderStore:saveOrderVersioned", error.message, { orderId: order.id });
    return { status: "error", fejl: error.message };
  }
  const status = data?.status;
  if (status === "ok" || status === "conflict" || status === "exists" || status === "not_found") {
    return { status, version: data.version, data: data.data };
  }
  logError("orderStore:saveOrderVersioned", "Uventet svar fra save_order", { svar: data });
  return { status: "error", fejl: "Uventet svar fra serveren" };
}
