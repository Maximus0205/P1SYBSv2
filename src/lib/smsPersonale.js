import { supabase } from "./supabaseClient";
import { logError } from "./errorLog";

// SMS-advisering af personale (oktober 2026). Butikkens admin slår typerne til/fra (tabellen store_staff_sms, rpc
// save_staff_sms_settings); hver medarbejder tilmelder sig SELV med eget mobilnummer (rpc save_my_staff_sms) og vælger,
// hvilke af de tændte typer vedkommende vil have. Nummeret kan kun læses af medarbejderen selv. Admin ser kun et
// maskeret nummer (rpc staff_sms_overview). Afsendelsen sker på serveren (Edge Function sms-automatik), aldrig i browseren.
//
// Typer:
//   manglende_vare  til sælgeren, der oprettede sagen, når lageret melder en vare "kan ikke findes"
//   problem         til sælgeren, der oprettede sagen, når montøren markerer et problem
//   nyt_pluk        til de tilmeldte (typisk lageret), når en sag kommer til pluklisten SAMME DAG - efter det valgte tidspunkt

export function standardPersonale() {
  return { enabled: false, manglendeVare: true, problem: true, nytPluk: true, nytPlukEfterMin: 360 };
}

function fraRaekke(r) {
  const s = standardPersonale();
  return {
    enabled: r.enabled === true,
    manglendeVare: r.manglende_vare !== false,
    problem: r.problem !== false,
    nytPluk: r.nyt_pluk !== false,
    nytPlukEfterMin: Number.isInteger(r.nyt_pluk_efter_min) ? r.nyt_pluk_efter_min : s.nytPlukEfterMin,
  };
}

async function butikId(storeId) {
  if (storeId) return { id: storeId };
  const { data, error } = await supabase.rpc("my_store_id");
  if (error) return { fejl: error.message };
  return { id: data || null };
}

// { ok, settings, harRaekke } | { ok: false, fejl }
export async function getStaffSmsSettings(storeId) {
  const s = await butikId(storeId);
  if (s.fejl) { logError("smsPersonale:find", s.fejl); return { ok: false, fejl: s.fejl }; }
  if (!s.id) return { ok: true, settings: standardPersonale(), harRaekke: false };
  const { data, error } = await supabase.from("store_staff_sms").select("*").eq("store_id", s.id).maybeSingle();
  if (error) { logError("smsPersonale:get", error.message); return { ok: false, fejl: error.message }; }
  return { ok: true, settings: data ? fraRaekke(data) : standardPersonale(), harRaekke: !!data };
}

export function personaleFejl(f) {
  if (!Number.isInteger(f.nytPlukEfterMin) || f.nytPlukEfterMin < 240 || f.nytPlukEfterMin > 1200) return "Tidspunktet for nyt pluk skal ligge mellem kl. 04:00 og 20:00.";
  return null;
}

export async function saveStaffSmsSettings(storeId, f) {
  const s = await butikId(storeId);
  if (s.fejl || !s.id) return { ok: false, fejl: s.fejl || "Ingen butik angivet" };
  const lokal = personaleFejl(f);
  if (lokal) return { ok: false, fejl: lokal };
  const { error } = await supabase.rpc("save_staff_sms_settings", {
    p_store_id: s.id, p_enabled: !!f.enabled, p_manglende_vare: !!f.manglendeVare, p_problem: !!f.problem,
    p_nyt_pluk: !!f.nytPluk, p_nyt_pluk_efter_min: f.nytPlukEfterMin,
  });
  if (error) { logError("smsPersonale:save", error.message); return { ok: false, fejl: error.message }; }
  return { ok: true };
}

// Admin: hvem er tilmeldt (nummeret er maskeret). { ok, liste } | { ok: false, fejl }
export async function staffSmsOverview(storeId) {
  const s = await butikId(storeId);
  if (s.fejl || !s.id) return { ok: false, fejl: s.fejl || "Ingen butik angivet" };
  const { data, error } = await supabase.rpc("staff_sms_overview", { p_store_id: s.id });
  if (error) { logError("smsPersonale:oversigt", error.message); return { ok: false, fejl: error.message }; }
  return {
    ok: true,
    liste: (data || []).map((r) => ({ navn: r.user_name, rolle: r.role, nummer: r.phone_masked, manglendeVare: r.manglende_vare, problem: r.problem, nytPluk: r.nyt_pluk })),
  };
}

// Medarbejderens egen tilmelding. { ok, tilmelding: null | { telefon, manglendeVare, problem, nytPluk } }
export async function getMyStaffSms() {
  const { data, error } = await supabase.from("staff_sms_optin").select("phone, manglende_vare, problem, nyt_pluk").maybeSingle();
  if (error) { logError("smsPersonale:min", error.message); return { ok: false, fejl: error.message }; }
  return { ok: true, tilmelding: data ? { telefon: data.phone, manglendeVare: data.manglende_vare, problem: data.problem, nytPluk: data.nyt_pluk } : null };
}

export async function saveMyStaffSms(f) {
  const { error } = await supabase.rpc("save_my_staff_sms", {
    p_phone: f.telefon, p_manglende_vare: !!f.manglendeVare, p_problem: !!f.problem, p_nyt_pluk: !!f.nytPluk,
  });
  if (error) { logError("smsPersonale:gem-min", error.message); return { ok: false, fejl: error.message }; }
  return { ok: true };
}

export async function deleteMyStaffSms() {
  const { error } = await supabase.rpc("delete_my_staff_sms");
  if (error) { logError("smsPersonale:slet-min", error.message); return { ok: false, fejl: error.message }; }
  return { ok: true };
}
