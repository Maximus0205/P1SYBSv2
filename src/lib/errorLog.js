import { supabase } from "./supabaseClient";

// Central fejl-logning (august 2026) - se components/ErrorBoundary.jsx
// (fanger React render-crashes) og main.jsx (fanger globale window.onerror/
// unhandledrejection-fejl, dvs. UVENTEDE JS-fejl der ellers kun ville stå i
// browserens konsol). Bruges desuden VED SIDEN AF de eksisterende
// console.error-kald i dataStore.js (ikke i stedet for - konsollen er
// stadig nyttig ved lokal udvikling), så mislykkede Supabase-kald (en note
// der ikke bliver gemt, en ordre der fejler) rent faktisk bliver synlige
// for systemadmin bagefter, i stedet for at forsvinde stille.
//
// Fejl ved SELVE logningen fanges bevidst helt stille - en fejlrapportering
// må aldrig kunne vælte appen eller forstyrre brugeren yderligere, uanset
// hvad der går galt undervejs (fx ingen internetforbindelse).
//
// Henter brugerens egen store_id/rolle FRISK ved hver fejl (ikke cachet) -
// simplere og mere korrekt end at risikere en forældet cache efter et
// login/logout-skift midt i samme browser-session. Fejl bør være sjældne
// nok til at det ekstra opslag ikke er en reel omkostning.
export async function logError(source, error, context) {
  try {
    let userId = null;
    let storeId = null;
    let role = null;
    try {
      const { data } = await supabase.auth.getUser();
      userId = data?.user?.id || null;
      if (userId) {
        const { data: profile } = await supabase.from("profiles").select("store_id, role").eq("id", userId).maybeSingle();
        storeId = profile?.store_id || null;
        role = profile?.role || null;
      }
    } catch (_) {
      // Ikke logget ind, eller opslaget selv fejlede - loggen fortsætter uden identitet.
    }

    const message = typeof error === "string" ? error : (error?.message || String(error) || "Ukendt fejl");
    const stack = error?.stack || null;

    await supabase.from("error_logs").insert({
      store_id: storeId,
      user_id: userId,
      user_role: role,
      source,
      message: String(message).slice(0, 2000),
      stack: stack ? String(stack).slice(0, 8000) : null,
      url: typeof window !== "undefined" ? window.location.href : null,
      context: context || null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
  } catch (_) {
    // Bevidst stille - se note ovenfor.
  }
}
