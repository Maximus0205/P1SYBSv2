import { supabase } from "./supabaseClient";
import { rensIndstillinger } from "../engine/kapacitet";

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

// Kun butikkens admin (admin_butik) eller en systemadmin; databasen håndhæver det.
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
