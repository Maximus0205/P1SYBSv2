import { supabase } from "./supabaseClient";
import { rensIndstillinger } from "../engine/kapacitet";
import { REGLER, NIVEAUER } from "../engine/kapacitet/indstillinger";

// Læsning og gemning af det, kapacitetsmotoren (src/engine/kapacitet) arbejder efter: butikkens indstillinger, montørernes
// normale arbejdstid pr. ugedag og ændringer på bestemte datoer. Se supabase/migrations/20261006_capacity.sql for
// rettighederne. Motoren selv er ren logik og kender ikke til databasen.

// Butikkens kapacitetsindstillinger, altid renset (ukendte felter fjernet, tal holdt inden for grænser). null = kunne ikke hentes.
export async function hentKapacitetsIndstillinger(storeId) {
  if (!storeId) return null;
  const { data, error } = await supabase.from("stores").select("capacity_settings").eq("id", storeId).maybeSingle();
  if (error || !data) return null;
  return rensIndstillinger(data.capacity_settings);
}

// Kun butikkens admin (admin_butik) eller en systemadmin; databasen håndhæver det. Reglerne (Fra/Rådgivende/Krav) følger IKKE med:
// de kan kun sættes af systemadmin (gemButiksRegler), og databasen bevarer de gemte regler uanset hvad der sendes her.
export async function gemKapacitetsIndstillinger(storeId, indstillinger) {
  const { error } = await supabase.rpc("update_capacity_settings", { p_settings: rensIndstillinger(indstillinger), p_store_id: storeId ?? null });
  return error ? { ok: false, fejl: error.message } : { ok: true };
}

export async function hentArbejdstider(storeId) {
  if (!storeId) return [];
  const { data, error } = await supabase.from("person_work_hours").select("person_id, weekday, arbejder, start_min, end_min, pause_min").eq("store_id", storeId);
  return error ? [] : data || [];
}

// En ugedag for en person (upsert). Kræver admin_kalender.
export async function gemArbejdstid({ storeId, personId, weekday, arbejder, startMin, endMin, pauseMin }) {
  const { error } = await supabase.from("person_work_hours").upsert(
    { store_id: storeId, person_id: personId, weekday, arbejder: !!arbejder, start_min: startMin, end_min: endMin, pause_min: pauseMin },
    { onConflict: "person_id,weekday" },
  );
  return error ? { ok: false, fejl: error.message } : { ok: true };
}

// Tilbage til butikkens standard for ugedagen.
export async function nulstilArbejdstid(personId, weekday) {
  const { error } = await supabase.from("person_work_hours").delete().eq("person_id", personId).eq("weekday", weekday);
  return error ? { ok: false, fejl: error.message } : { ok: true };
}

export async function hentUaendringer(storeId, fraDato) {
  if (!storeId) return [];
  let q = supabase.from("person_unavailability").select("id, person_id, dato, from_min, to_min").eq("store_id", storeId).order("dato", { ascending: true });
  if (fraDato) q = q.gte("dato", fraDato);
  const { data, error } = await q;
  return error ? [] : data || [];
}

// "Ikke tilgængelig" i et tidsrum på en dato. Der gemmes bevidst INGEN årsag (en årsag kan være en helbredsoplysning).
export async function tilfoejUaendring({ storeId, personId, dato, fraMin, tilMin }) {
  const { error } = await supabase.from("person_unavailability").insert({ store_id: storeId, person_id: personId, dato, from_min: fraMin, to_min: tilMin });
  return error ? { ok: false, fejl: error.message } : { ok: true };
}

export async function sletUaendring(id) {
  const { error } = await supabase.from("person_unavailability").delete().eq("id", id);
  return error ? { ok: false, fejl: error.message } : { ok: true };
}

// ---- Regler (Fra / Rådgivende / Krav): kun systemadmin kan ændre dem; databasen håndhæver det (RPC update_capacity_rules og RLS) ----

// Butikkens standardregler (renset). null = kunne ikke hentes.
export async function hentButiksRegler(storeId) {
  const ind = await hentKapacitetsIndstillinger(storeId);
  return ind ? ind.regler : null;
}

export async function gemButiksRegler(storeId, regler) {
  const { error } = await supabase.rpc("update_capacity_rules", { p_store_id: storeId, p_regler: rensIndstillinger({ regler }).regler });
  return error ? { ok: false, fejl: error.message } : { ok: true };
}

// En brugers individuelle regelniveauer ({} = følger butikken). En almindelig bruger kan kun læse sine egne.
export async function hentBrugerRegler(userId) {
  if (!userId) return {};
  const { data, error } = await supabase.from("user_capacity_rules").select("regler").eq("user_id", userId).maybeSingle();
  return error || !data ? {} : data.regler || {};
}

// Alle individuelle overstyringer i en butik (systemadmin): { [userId]: regler }
export async function hentBrugerReglerForButik(storeId) {
  if (!storeId) return {};
  const { data, error } = await supabase.from("user_capacity_rules").select("user_id, regler").eq("store_id", storeId);
  if (error) return null;
  return Object.fromEntries((data || []).map((r) => [r.user_id, r.regler || {}]));
}

// Tomt objekt = fjern overstyringen (brugeren følger butikkens standard).
export async function gemBrugerRegler({ userId, storeId, regler }) {
  const rent = Object.fromEntries(Object.entries(regler || {}).filter(([k, v]) => k in REGLER && NIVEAUER.includes(v)));
  if (Object.keys(rent).length === 0) {
    const { error } = await supabase.from("user_capacity_rules").delete().eq("user_id", userId);
    return error ? { ok: false, fejl: error.message } : { ok: true };
  }
  const { error } = await supabase.from("user_capacity_rules").upsert({ user_id: userId, store_id: storeId, regler: rent, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return error ? { ok: false, fejl: error.message } : { ok: true };
}
