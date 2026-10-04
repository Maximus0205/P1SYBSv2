import { supabase } from "./supabaseClient";
import { logError } from "./errorLog";

// Læser den RIGTIGE fejlbesked ud af et Edge Function-svar. Uden dette viser
// supabase-js kun "non-2xx status code" - den rigtige besked (som funktionen
// sender som { fejl: "..." }) ligger i error.context. (Samme som i dataStore.js.)
async function laesFejl(data, error, standard) {
  if (data?.fejl) return data.fejl;
  if (error?.context && typeof error.context.json === "function") {
    try {
      const body = await error.context.clone().json();
      if (body?.fejl) return body.fejl;
    } catch (_) { /* ikke JSON - brug standardbeskeden */ }
  }
  return error?.message || standard;
}

// Sender ankomst-SMS'en til kunden via Edge Function send-ankomst-sms, fra
// firmaets FÆLLES afsender (ikke montørens egen telefon).
//   minutter     hvor lang tid der går - eller, med minutterTil, det MINDSTE
//   minutterTil  valgfri: sendes et interval "mellem <minutter> og <minutterTil>"
// Erstatter sendArrivalSms i lib/dataStore.js, som ikke kunne sende et interval.
export async function sendArrivalSms({ telefon, minutter, minutterTil, kundeNavn }) {
  const body = { telefon, minutter, kundeNavn };
  if (minutterTil !== undefined && minutterTil !== null) body.minutterTil = minutterTil;
  const { data, error } = await supabase.functions.invoke("send-ankomst-sms", { body });
  if (error || data?.fejl) {
    const fejl = await laesFejl(data, error, "Kunne ikke sende SMS'en");
    logError("arrivalSms:sendArrivalSms", fejl);
    return { ok: false, fejl };
  }
  return { ok: true };
}
