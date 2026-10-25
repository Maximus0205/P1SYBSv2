// OFFLINE-OPSTART: rene hjælpere (ingen DOM/Supabase), afprøvet i tests/offlineSession.test.mjs.
//
// PROBLEMET: supabase-js' getSession() svarer { session: null } med en forbindelsesfejl, når adgangstokenet
// er udløbet (de varer typisk en time) og det ikke kan fornyes, fordi telefonen ingen forbindelse har - selv om
// den gemte session ligger urørt i lageret og straks kan fornyes, når nettet er tilbage. Uden dette ville appen
// vise loginsiden i en kælder, og en montør kunne hverken se dagens sager eller logge ind.
//
// LØSNINGEN: er fejlen en forbindelsesfejl, OG der findes gemte data for den bruger, den gemte session tilhører,
// bruges brugerens identitet fra lageret til at VISE de gemte data. Det giver INGEN adgang til noget: alle kald
// til databasen kræver stadig en gyldig session (Row Level Security), og så snart nettet er tilbage, fornyer
// supabase-js sessionen af sig selv.

// Er fejlen fra supabase-js en forbindelsesfejl (kan vente) frem for en reel afvisning (session ugyldig)?
export function erForbindelsesFejl(error, online = true) {
  if (!error) return false;
  if (online === false) return true;
  const navn = String(error.name || "");
  const besked = String(error.message || "").toLowerCase();
  return navn === "AuthRetryableFetchError" || /failed to fetch|networkerror|network request failed|load failed|timeout|aborted/.test(besked);
}

// Finder den gemte session i lageret (localStorage-agtigt: { length, key(i), getItem(k) }).
// Svarer { user, session } eller null. Bruger ALDRIG en session uden bruger-id.
export function laesGemtSession(lager) {
  try {
    for (let i = 0; i < lager.length; i++) {
      const noegle = lager.key(i);
      if (!/^sb-.+-auth-token$/.test(noegle || "")) continue;
      const parsed = JSON.parse(lager.getItem(noegle) || "null");
      const s = parsed && (parsed.currentSession || parsed);
      if (s && s.user && typeof s.user.id === "string" && s.user.id) return { user: s.user, session: s };
    }
  } catch (_) { /* ulæseligt - ingen offline-session */ }
  return null;
}
