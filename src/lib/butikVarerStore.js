import { supabase } from "./supabaseClient";
import { logError } from "./errorLog";

// Adgang til butikkens varedatabase (tabellen store_products). Hvem der må hvad afgøres af databasens RLS
// (alle i butikken må læse, kun admin_katalog må skrive) - UI'et skjuler blot det, man ikke må.

const KOLONNER = "id, brand, model, varetype_id, created_at";
const SIDE = 1000; // Supabase leverer højst 1000 rækker pr. kald
const ATOMER = 200;

const tilVare = (r) => ({ id: r.id, brand: r.brand, model: r.model, varetypeId: r.varetype_id || "", createdAt: r.created_at });
const fejlTekst = (error) => (error?.code === "23505" ? "Modellen findes allerede i butikkens varedatabase" : (error?.message || "Ukendt fejl"));

// { ok, varer } | { ok: false, fejl }. Hele butikkens liste i ét hug (siderne hentes efter hinanden); søgning sker i klienten.
export async function hentButikVarer(storeId) {
  if (!storeId) return { ok: true, varer: [] };
  const varer = [];
  for (let fra = 0; ; fra += SIDE) {
    const { data, error } = await supabase.from("store_products").select(KOLONNER)
      .eq("store_id", storeId).order("brand").order("model").range(fra, fra + SIDE - 1);
    if (error) { logError("butikVarer:hent", error.message); return { ok: false, fejl: error.message }; }
    varer.push(...(data || []).map(tilVare));
    if (!data || data.length < SIDE) break;
  }
  return { ok: true, varer };
}

export async function opretButikVare(storeId, { brand, model, varetypeId }) {
  const { data, error } = await supabase.from("store_products")
    .insert({ store_id: storeId, brand: brand.trim(), model: model.trim(), varetype_id: varetypeId || null })
    .select(KOLONNER).maybeSingle();
  if (error) { logError("butikVarer:opret", error.message); return { ok: false, fejl: fejlTekst(error) }; }
  return { ok: true, vare: data && tilVare(data) };
}

export async function opdaterButikVare(id, { brand, model, varetypeId }) {
  const { error } = await supabase.from("store_products")
    .update({ brand: brand.trim(), model: model.trim(), varetype_id: varetypeId || null }).eq("id", id);
  if (error) { logError("butikVarer:opdater", error.message); return { ok: false, fejl: fejlTekst(error) }; }
  return { ok: true };
}

export async function sletButikVare(id) {
  const { error } = await supabase.from("store_products").delete().eq("id", id);
  if (error) { logError("butikVarer:slet", error.message); return { ok: false, fejl: fejlTekst(error) }; }
  return { ok: true };
}

// Import af mange varer. Findes modellen allerede, springes den over (intet overskrives). { ok, oprettet, sprunget } | { ok: false, fejl }.
export async function importerButikVarer(storeId, varer) {
  let oprettet = 0;
  for (let i = 0; i < varer.length; i += ATOMER) {
    const del = varer.slice(i, i + ATOMER).map((v) => ({ store_id: storeId, brand: v.brand.trim(), model: v.model.trim() }));
    const { data, error } = await supabase.from("store_products")
      .upsert(del, { onConflict: "store_id,model_norm", ignoreDuplicates: true }).select("id");
    if (error) {
      logError("butikVarer:import", error.message);
      return { ok: false, fejl: `${fejlTekst(error)} (${oprettet} varer var allerede oprettet, før det gik galt)`, oprettet };
    }
    oprettet += (data || []).length;
  }
  return { ok: true, oprettet, sprunget: varer.length - oprettet };
}
