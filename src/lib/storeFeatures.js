import { supabase } from "./supabaseClient";
import { logError } from "./errorLog";
import { FEATURE_KEYS } from "../data/storeFeatures";

// Butikkens til/fra-funktioner (tabellen store_features). En funktion er TIL, medmindre
// der eksplicit står false (undtagen funktioner med standard:false i data/storeFeatures.js:
// de er FRA, medmindre der eksplicit står true). Databasen håndhæver det på sagerne; det her er kun adgangen.

// { ok, features: { nøgle: boolean } } | { ok: false, fejl }
export async function getStoreFeatures(storeId) {
  if (!storeId) return { ok: true, features: {} };
  const { data, error } = await supabase.from("store_features").select("features").eq("store_id", storeId).maybeSingle();
  if (error) { logError("storeFeatures:get", error.message); return { ok: false, fejl: error.message }; }
  const raa = data?.features && typeof data.features === "object" ? data.features : {};
  const features = {};
  for (const k of FEATURE_KEYS) if (typeof raa[k] === "boolean") features[k] = raa[k];
  return { ok: true, features };
}

// Kun systemadmin (tjekkes i databasen).
export async function setStoreFeature(storeId, noegle, enabled) {
  const { error } = await supabase.rpc("set_store_feature", { p_store: storeId, p_key: noegle, p_enabled: enabled });
  if (error) { logError("storeFeatures:set", error.message); return { ok: false, fejl: error.message }; }
  return { ok: true };
}
