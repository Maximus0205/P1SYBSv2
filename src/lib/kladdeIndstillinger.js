import { supabase } from "./supabaseClient";
import { rensIndstillinger } from "./orderDrafts";

// Butikkens kladde-indstillinger (oktober 2026): om parkerede bookinger er slået til, og hvor mange dage de ligger.
// Butikkens administrator bestemmer det (Admin -> Kladder). Databasen håndhæver det (se
// supabase/migrations/20261005_draft_settings.sql); den lokale cache (lib/orderDrafts.js) følger med.

// Henter butikkens indstilling. null = kunne ikke hentes (fx uden forbindelse) - kalderen beholder så det kendte
// i stedet for at gætte; en forbindelsesfejl må hverken slå kladder fra eller til.
export async function hentKladdeIndstillinger(storeId) {
  if (!storeId) return null;
  const { data, error } = await supabase.from("stores").select("drafts_enabled, draft_retention_days").eq("id", storeId).maybeSingle();
  if (error || !data) return null;
  return rensIndstillinger({ aktiveret: data.drafts_enabled, dage: data.draft_retention_days });
}

// Gemmer indstillingen via databasefunktionen update_draft_settings (kun butikkens admin, eller en systemadmin).
// Slås kladder fra, eller forkortes fristen, slettes de kladder, der ikke længere må ligge, STRAKS - antallet
// returneres, så administratoren kan se, hvad der skete.
export async function gemKladdeIndstillinger({ aktiveret, dage, storeId }) {
  const { data, error } = await supabase.rpc("update_draft_settings", {
    p_enabled: !!aktiveret, p_retention_days: dage, p_store_id: storeId ?? null,
  });
  if (error) return { ok: false, fejl: error.message };
  return { ok: true, slettede: data?.slettede ?? 0 };
}
