import { supabase } from "./supabaseClient";
import { logError } from "./errorLog";
import { STANDARD_TIDER, skabelonFejl } from "./smsAutomationLogik";

// Butikkens automatiske kunde-SMS'er: bekræftelse ved booking, besked ved flytning og påmindelser (oktober 2026).
// Tabellen store_sms_automation kan alle i butikken læse; KUN butikkens admin (admin_butik) eller en systemadmin kan gemme
// (rpc save_sms_automation, som validerer alt). Selve afsendelsen sker på serveren (Edge Function sms-automatik, kører hvert 5. minut) -
// browseren sender aldrig noget. Alt er slået fra, indtil en admin tænder det.
//
// "enabled" er HOVEDKONTAKTEN: er den slået fra, sendes intet, uanset de enkelte beskeder. Standarden, når kontakten tændes første gang,
// er KUN påmindelsen aftenen før (kl. 18) med instruks til afbestilling.
//
// {telefon} er butikkens telefonnummer (kontaktTelefon), til afbestilling/ændring. Bruger en aktiv tekst {telefon}, kræves et nummer.

export const STANDARD_AUTO_TEKSTER = {
  bekraeftelse: "Hej {fornavn}, din levering er booket til {dato}, {tidsrum}. Skal aftalen ændres eller aflyses, ring på {telefon}. Mvh {butik}",
  aendring: "Hej {fornavn}, din levering er flyttet til {dato}, {tidsrum}. Skal aftalen ændres eller aflyses, ring på {telefon}. Mvh {butik}",
  aften: "Hej {fornavn}, en påmindelse om din levering i morgen, {dato}, {tidsrum}. Skal den aflyses eller flyttes, ring på {telefon}. Mvh {butik}",
  morgen: "Hej {fornavn}, i dag leverer vi hos dig, {tidsrum}. Skal aftalen ændres, ring på {telefon}. Mvh {butik}",
};

export function standardAutomation() {
  return {
    enabled: false,
    bekraeftelse: false, aendring: false, aften: true, morgen: false,
    aftenMin: STANDARD_TIDER.aftenMin, morgenMin: STANDARD_TIDER.morgenMin,
    tplBekraeftelse: STANDARD_AUTO_TEKSTER.bekraeftelse, tplAendring: STANDARD_AUTO_TEKSTER.aendring,
    tplAften: STANDARD_AUTO_TEKSTER.aften, tplMorgen: STANDARD_AUTO_TEKSTER.morgen,
    kontaktTelefon: "",
  };
}

function fraRaekke(r) {
  const s = standardAutomation();
  return {
    enabled: r.enabled === true,
    bekraeftelse: r.bekraeftelse_enabled === true, aendring: r.aendring_enabled === true,
    aften: r.aften_enabled === true, morgen: r.morgen_enabled === true,
    aftenMin: Number.isInteger(r.aften_min) ? r.aften_min : s.aftenMin,
    morgenMin: Number.isInteger(r.morgen_min) ? r.morgen_min : s.morgenMin,
    tplBekraeftelse: typeof r.tpl_bekraeftelse === "string" ? r.tpl_bekraeftelse : s.tplBekraeftelse,
    tplAendring: typeof r.tpl_aendring === "string" ? r.tpl_aendring : s.tplAendring,
    tplAften: typeof r.tpl_aften === "string" ? r.tpl_aften : s.tplAften,
    tplMorgen: typeof r.tpl_morgen === "string" ? r.tpl_morgen : s.tplMorgen,
    kontaktTelefon: typeof r.kontakt_telefon === "string" ? r.kontakt_telefon : "",
  };
}

async function butikId(storeId) {
  if (storeId) return { id: storeId };
  const { data, error } = await supabase.rpc("my_store_id");
  if (error) return { fejl: error.message };
  return { id: data || null };
}

// { ok, settings, harRaekke } | { ok: false, fejl }
export async function getSmsAutomation(storeId) {
  const s = await butikId(storeId);
  if (s.fejl) { logError("smsAutomation:find", s.fejl); return { ok: false, fejl: s.fejl }; }
  if (!s.id) return { ok: true, settings: standardAutomation(), harRaekke: false };
  const { data, error } = await supabase.from("store_sms_automation").select("*").eq("store_id", s.id).maybeSingle();
  if (error) { logError("smsAutomation:get", error.message); return { ok: false, fejl: error.message }; }
  return { ok: true, settings: data ? fraRaekke(data) : standardAutomation(), harRaekke: !!data };
}

// Teksten valideres uden {telefon} (den er ikke kendt af den delte skabelonregel i smsAutomationLogik.js).
const telefonSkabelonFejl = (t) => skabelonFejl(String(t ?? "").split("{telefon}").join("12345678"));

// Gyldighed i browseren (databasen validerer igen): første fejl, ellers null.
export function automationFejl(f) {
  for (const [navn, t] of [["Bekræftelse", f.tplBekraeftelse], ["Ændring", f.tplAendring], ["Påmindelse aftenen før", f.tplAften], ["Påmindelse om morgenen", f.tplMorgen]]) {
    const e = telefonSkabelonFejl(t);
    if (e) return `${navn}: ${e}`;
  }
  if (!Number.isInteger(f.aftenMin) || f.aftenMin < 720 || f.aftenMin > 1290) return "Aften-påmindelsen skal sendes mellem kl. 12:00 og 21:30.";
  if (!Number.isInteger(f.morgenMin) || f.morgenMin < 360 || f.morgenMin > 660) return "Morgen-påmindelsen skal sendes mellem kl. 06:00 og 11:00.";
  const tlf = (f.kontaktTelefon || "").trim();
  if (tlf && !/^[0-9 +]{8,16}$/.test(tlf)) return "Telefonnummeret må kun indeholde tal, mellemrum og +.";
  if (f.enabled && !tlf) {
    const bruger = [[f.bekraeftelse, f.tplBekraeftelse], [f.aendring, f.tplAendring], [f.aften, f.tplAften], [f.morgen, f.tplMorgen]]
      .some(([til, t]) => til && String(t).includes("{telefon}"));
    if (bruger) return "Teksten bruger {telefon}, så butikkens telefonnummer skal udfyldes.";
  }
  return null;
}

export async function saveSmsAutomation(storeId, f) {
  const s = await butikId(storeId);
  if (s.fejl || !s.id) return { ok: false, fejl: s.fejl || "Ingen butik angivet" };
  const lokal = automationFejl(f);
  if (lokal) return { ok: false, fejl: lokal };
  const { error } = await supabase.rpc("save_sms_automation", {
    p_store_id: s.id, p_enabled: !!f.enabled,
    p_bekraeftelse: !!f.bekraeftelse, p_aendring: !!f.aendring, p_aften: !!f.aften, p_morgen: !!f.morgen,
    p_aften_min: f.aftenMin, p_morgen_min: f.morgenMin,
    p_tpl_bekraeftelse: f.tplBekraeftelse, p_tpl_aendring: f.tplAendring, p_tpl_aften: f.tplAften, p_tpl_morgen: f.tplMorgen,
    p_kontakt_telefon: (f.kontaktTelefon || "").trim() || null,
  });
  if (error) { logError("smsAutomation:save", error.message); return { ok: false, fejl: error.message }; }
  return { ok: true };
}

export const minTilKl = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const klTilMin = (t) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null);
