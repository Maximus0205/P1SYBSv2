import { createClient } from "@supabase/supabase-js";

// URL og anon-nøgle er IKKE hemmelige (de er designet til at ligge i
// frontend-koden) - den rigtige adgangskontrol sker via Row Level Security
// i databasen (se supabase/migration.sql) og via Supabase Auth.
//
// Sæt disse i en .env-fil i projektets rod:
//   VITE_SUPABASE_URL=...
//   VITE_SUPABASE_ANON_KEY=...
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fejler tydeligt i konsollen fremfor at give kryptiske fejl senere.
  console.error(
    "Supabase er ikke sat op: mangler VITE_SUPABASE_URL og/eller VITE_SUPABASE_ANON_KEY i .env"
  );
}

export const supabase = createClient(url, anonKey);
