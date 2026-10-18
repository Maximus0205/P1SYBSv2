// Supabase-adresse og offentlig nøgle læses ved bygning fra EXPO_PUBLIC_*-variabler (samme værdier som VITE_SUPABASE_* i webappen).
// De er ikke hemmelige: adgangen styres af login og Row Level Security i databasen. Service role-nøglen må ALDRIG ligge her.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
export const ER_SAT_OP = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
