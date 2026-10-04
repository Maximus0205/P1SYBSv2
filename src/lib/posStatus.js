import { supabase } from "./supabaseClient";
import { logError } from "./errorLog";

// Er POS-integrationen slået til for brugerens egen butik? (oktober 2026)
// Svaret kommer fra databasefunktionen pos_enabled_for_my_store, som kun siger ja/nej
// (aktiveret OG nøgle gemt) - selve opsætningen kan kun læses af admin, men ALLE der
// opretter sager skal vide, om "Hent fra POS" overhovedet kan bruges. Kan svaret ikke
// hentes, regnes POS for IKKE slået til: hellere en skjult knap end en, der giver en
// fejl hver gang.
export async function erPosAktiv() {
  const { data, error } = await supabase.rpc("pos_enabled_for_my_store");
  if (error) {
    logError("posStatus:erPosAktiv", error.message);
    return false;
  }
  return data === true;
}
