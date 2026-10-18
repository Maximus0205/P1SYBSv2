import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

export const supabase = createClient(SUPABASE_URL || "http://mangler.invalid", SUPABASE_ANON_KEY || "mangler", {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Sessionen fornyes kun, mens appen er åben i forgrunden (anbefalet af Supabase til React Native).
AppState.addEventListener("change", (tilstand) => {
  if (tilstand === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
