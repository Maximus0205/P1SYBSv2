// Id på den indloggede bruger (fra den gemte session - ingen netværkskald), eller null.
import { supabase } from "./supabaseClient";

export async function hentEjerId() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id || null;
  } catch (_) {
    return null;
  }
}
