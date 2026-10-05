// ADAPTER-KERNEN: kald til Supabase Edge Functions (oktober 2026).
//
// Alle adaptere (src/adapters/*) taler med eksterne tjenester gennem en Edge Function, så hemmelige
// nøgler aldrig ligger i browseren. Fejlhåndteringen var før kopieret ind i flere filer; her er den ÉT sted.
//
// UAFHÆNGIG AF APPEN: filen importerer intet - hverken React, Supabase eller noget fra dette projekt.
// Den får en "klient" udefra (alt med functions.invoke(navn, { body }), fx supabase-js) og en valgfri
// log-funktion. Derfor kan den bruges uændret i andre projekter. Se README.md.

// Er det en FORBINDELSESFEJL (prøv igen senere) frem for en afvisning (vil fejle hver gang)?
// supabase-js kaster ikke ved netværksfejl; den returnerer dem i { error }, så de ligner en afvisning.
export function erNetvaerksfejl(error, miljoe) {
  const nav = miljoe !== undefined ? miljoe : (typeof navigator !== "undefined" ? navigator : undefined);
  if (nav && nav.onLine === false) return true;
  const besked = (error?.message || "").toLowerCase();
  return ["failed to fetch", "networkerror", "network request failed", "load failed", "timeout", "aborted"].some((s) => besked.includes(s));
}

// Læser den RIGTIGE fejlbesked ud af et Edge Function-svar. Uden dette viser supabase-js kun
// "non-2xx status code"; den rigtige besked (som funktionerne sender som { fejl: "..." }) ligger i error.context.
export async function laesFejl(data, error, standard) {
  if (data?.fejl) return data.fejl;
  if (error?.context && typeof error.context.json === "function") {
    try {
      const body = await error.context.clone().json();
      if (body?.fejl) return body.fejl;
    } catch (_) { /* ikke JSON - brug standardbeskeden */ }
  }
  return error?.message || standard;
}

// Opretter transporten. kald(funktion, body, valg) svarer ALTID { ok, data?, fejl?, netvaerk? } - den kaster aldrig.
//   standardFejl   besked, hvis funktionen ikke selv giver en
//   kilde          navn i loggen (standard: funktionens navn)
//   logFejl        false = log ikke fejlen (fx en test, hvor fejlen vises direkte)
//   dataFejlErFejl false = et svar med { fejl } i brødteksten er IKKE en fejl (kun en afvist forespørgsel er)
export function opretEdgeTransport({ klient, log } = {}) {
  if (!klient || !klient.functions || typeof klient.functions.invoke !== "function") {
    throw new Error("opretEdgeTransport: klienten mangler functions.invoke");
  }
  const logger = typeof log === "function" ? log : () => {};

  async function kald(funktion, body, { standardFejl = "Kaldet fejlede", kilde = funktion, logFejl = true, dataFejlErFejl = true } = {}) {
    let svar;
    try {
      svar = await klient.functions.invoke(funktion, { body });
    } catch (e) {
      // En kastet fejl er teknisk (fx "Failed to fetch"): brugeren får den venlige standardbesked, loggen den rå.
      if (logFejl) { try { logger(kilde, e?.message || standardFejl); } catch (_) { /* logning må aldrig vælte kaldet */ } }
      return { ok: false, fejl: standardFejl, netvaerk: erNetvaerksfejl(e) };
    }
    const { data, error } = svar || {};
    if (!error && !(dataFejlErFejl && data?.fejl)) return { ok: true, data };
    const fejl = await laesFejl(data, error, standardFejl);
    if (logFejl) { try { logger(kilde, fejl); } catch (_) { /* som ovenfor */ } }
    return { ok: false, fejl, data, netvaerk: erNetvaerksfejl(error) };
  }

  return { kald };
}
