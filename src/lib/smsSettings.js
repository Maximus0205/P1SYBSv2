import { supabase } from "./supabaseClient";
import { logError } from "./errorLog";
import { ENKELT_TIDER, INTERVALLER, STANDARD_SKABELON_ENKELT, STANDARD_SKABELON_INTERVAL } from "./arrivalTime";

// Butikkens SMS-indstillinger (oktober 2026): tabellen store_sms_settings, se
// supabase/migrations/20261004_sms_settings.sql.
//   * alle i butikken kan LÆSE (montøren skal bruge knapperne og teksterne)
//   * butikkens admin (rettigheden admin_butik) kan gemme tekster, knapper og til/fra
//   * KUN en systemadmin kan sætte afsenderen
// Databasen håndhæver det og validerer alt - det her er kun adgangen dertil.
// En butik uden række bruger standardværdierne herunder, som svarer til dét, appen
// og serveren gjorde før indstillingerne fandtes.

export function standardIndstillinger() {
  return {
    enabled: true,
    sender: null,
    templateSingle: STANDARD_SKABELON_ENKELT,
    templateInterval: STANDARD_SKABELON_INTERVAL,
    quickSingles: [...ENKELT_TIDER],
    quickIntervals: INTERVALLER.map((p) => [...p]),
  };
}

function fraRaekke(r) {
  const std = standardIndstillinger();
  return {
    enabled: r.enabled !== false,
    sender: typeof r.sender === "string" && r.sender.trim() ? r.sender.trim() : null,
    templateSingle: typeof r.template_single === "string" ? r.template_single : std.templateSingle,
    templateInterval: typeof r.template_interval === "string" ? r.template_interval : std.templateInterval,
    quickSingles: Array.isArray(r.quick_singles) ? r.quick_singles.filter((x) => Number.isInteger(x)) : std.quickSingles,
    quickIntervals: Array.isArray(r.quick_intervals) ? r.quick_intervals.filter((p) => Array.isArray(p) && p.length === 2) : std.quickIntervals,
  };
}

// Sidst hentede indstillinger, så SMS-panelet kan vise knapperne med det samme, når
// det åbnes (og så opdatere i baggrunden).
let sidste = null;
export const seneste = () => sidste;
export const rydSmsCache = () => { sidste = null; };

// Uden storeId bruges brugerens egen butik - den samme, serveren bruger, når SMS'en sendes.
async function find(storeId) {
  if (storeId) return { id: storeId };
  const { data, error } = await supabase.rpc("my_store_id");
  if (error) return { fejl: error.message };
  return { id: data || null };
}

// { ok, settings, harRaekke } | { ok: false, fejl }
export async function getSmsSettings(storeId) {
  const s = await find(storeId);
  if (s.fejl) { logError("smsSettings:find", s.fejl); return { ok: false, fejl: s.fejl }; }
  if (!s.id) return { ok: true, settings: standardIndstillinger(), harRaekke: false };
  const { data, error } = await supabase
    .from("store_sms_settings")
    .select("enabled, sender, template_single, template_interval, quick_singles, quick_intervals")
    .eq("store_id", s.id)
    .maybeSingle();
  if (error) { logError("smsSettings:get", error.message); return { ok: false, fejl: error.message }; }
  const settings = data ? fraRaekke(data) : standardIndstillinger();
  sidste = { id: s.id, settings };
  return { ok: true, settings, harRaekke: !!data };
}

// Butikkens admin: tekster, knapper og til/fra. Rører aldrig afsenderen.
export async function saveSmsSettings(storeId, f) {
  const s = await find(storeId);
  if (s.fejl || !s.id) return { ok: false, fejl: s.fejl || "Ingen butik angivet" };
  const { error } = await supabase.rpc("save_sms_settings", {
    p_store_id: s.id,
    p_enabled: !!f.enabled,
    p_template_single: f.templateSingle,
    p_template_interval: f.templateInterval,
    p_quick_singles: f.quickSingles,
    p_quick_intervals: f.quickIntervals,
  });
  if (error) { logError("smsSettings:save", error.message); return { ok: false, fejl: error.message }; }
  rydSmsCache();
  return { ok: true };
}

// KUN systemadmin: butikkens afsendernavn/-nummer. Tomt = den fælles afsender.
export async function setSmsSender(storeId, sender) {
  const s = await find(storeId);
  if (s.fejl || !s.id) return { ok: false, fejl: s.fejl || "Ingen butik angivet" };
  const { error } = await supabase.rpc("set_store_sms_sender", { p_store_id: s.id, p_sender: String(sender ?? "").trim() });
  if (error) { logError("smsSettings:sender", error.message); return { ok: false, fejl: error.message }; }
  rydSmsCache();
  return { ok: true };
}
