// Erstatter den gamle blob-baserede storage.js. I stedet for at gemme hele
// lister som én stor JSON-tekst, ligger hver sag/bil/montør/varetype nu som
// sin egen række i Supabase - med butik_id, så data er delt mellem alle i
// butikken (i modsætning til før, hvor det kun lå i den enkelte browser).
//
// De eksporterede funktioner har bevidst samme "form" (hent + gem en hel
// liste ad gangen) som appen allerede brugte, så App.jsx kun skal ændres et
// minimum af steder.

import { supabase } from "./supabaseClient";

async function hentListe(tabel, butikId) {
  if (!butikId) return [];
  const { data, error } = await supabase.from(tabel).select("data").eq("butik_id", butikId);
  if (error) {
    console.error(`Kunne ikke hente ${tabel}:`, error.message);
    return [];
  }
  return (data || []).map((r) => r.data);
}

// Gemmer HELE listen: opdaterer/indsætter alt i den, og sletter rækker der
// ikke længere er med (samme "erstat det hele"-opførsel som før).
async function gemListe(tabel, butikId, liste) {
  if (!butikId) return false;

  const raekker = liste.map((item) => ({
    id: String(item.id),
    butik_id: butikId,
    data: item,
    opdateret: new Date().toISOString(),
  }));

  if (raekker.length > 0) {
    const { error } = await supabase.from(tabel).upsert(raekker);
    if (error) {
      console.error(`Kunne ikke gemme ${tabel}:`, error.message);
      return false;
    }
  }

  const idsAtBeholde = liste.map((item) => String(item.id));
  let sletQuery = supabase.from(tabel).delete().eq("butik_id", butikId);
  sletQuery = idsAtBeholde.length > 0 ? sletQuery.not("id", "in", `(${idsAtBeholde.join(",")})`) : sletQuery;
  const { error: sletFejl } = await sletQuery;
  if (sletFejl) {
    console.error(`Kunne ikke oprydde i ${tabel}:`, sletFejl.message);
    // Ikke fatalt - selve gemningen af det nye/ændrede lykkedes stadig.
  }

  return true;
}

export const hentSager = (butikId) => hentListe("sager", butikId);
export const gemSager = (butikId, sager) => gemListe("sager", butikId, sager);

export const hentBiler = (butikId) => hentListe("biler", butikId);
export const gemBiler = (butikId, biler) => gemListe("biler", butikId, biler);

export const hentMontorer = (butikId) => hentListe("montorer", butikId);
export const gemMontorer = (butikId, montorer) => gemListe("montorer", butikId, montorer);

export const hentVaretyper = (butikId) => hentListe("varetyper", butikId);
export const gemVaretyper = (butikId, varetyper) => gemListe("varetyper", butikId, varetyper);

// ---------- Profiler (erstatter den gamle "brugere"-blob) ----------
// Selve login/adgangskode håndteres af Supabase Auth (se LoginSide.jsx).
// Denne tabel holder kun butik_id + rolle + navn pr. bruger.

export async function hentEgenProfil(brugerId) {
  const { data, error } = await supabase.from("profiler").select("*").eq("id", brugerId).maybeSingle();
  if (error) {
    console.error("Kunne ikke hente profil:", error.message);
    return null;
  }
  return data;
}

// Alle brugere i samme butik (til admin-siden, "Brugere"-fanen).
export async function hentButiksBrugere(butikId) {
  if (!butikId) return [];
  const { data, error } = await supabase.from("profiler").select("*").eq("butik_id", butikId);
  if (error) {
    console.error("Kunne ikke hente butikkens brugere:", error.message);
    return [];
  }
  // Normaliseret til samme feltnavne som resten af appen bruger (camelCase).
  return (data || []).map((p) => ({ id: p.id, navn: p.navn, rolle: p.rolle, montorId: p.montor_id }));
}

// Admin retter navn/rolle/montør-kobling på en eksisterende bruger.
// NB: kan IKKE oprette nye Auth-brugere herfra (kræver service_role-nøgle,
// som aldrig må ligge i frontend) - nye brugere skal selv oprette login via
// signup, hvorefter en admin sætter butik_id + rolle (se migration.sql).
export async function opdaterProfil(brugerId, felter) {
  const { error } = await supabase.from("profiler").update(felter).eq("id", brugerId);
  if (error) {
    console.error("Kunne ikke opdatere profil:", error.message);
    return false;
  }
  return true;
}
