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

// ---------- Butikker ----------
export async function hentButik(butikId) {
  if (!butikId) return null;
  const { data, error } = await supabase.from("butikker").select("id, navn, adresse, lat, lon").eq("id", butikId).maybeSingle();
  if (error) {
    console.error("Kunne ikke hente butik:", error.message);
    return null;
  }
  return data;
}

// Alle butikker (kun synlige for en systemadmin, jf. RLS).
export async function hentAlleButikker() {
  const { data, error } = await supabase.from("butikker").select("id, navn, adresse, oprettet").order("oprettet", { ascending: false });
  if (error) {
    console.error("Kunne ikke hente butikker:", error.message);
    return [];
  }
  return data || [];
}

// Systemadmin opretter en helt ny butik + dens første admin-login.
// Kalder en edge function (kræver service_role for at oprette Auth-brugeren
// og geokoder adressen server-side) - se
// supabase/functions/systemadmin-opret-butik.
export async function opretButikSystemadmin(felter) {
  const { data, error } = await supabase.functions.invoke("systemadmin-opret-butik", { body: felter });
  if (error) return { ok: false, fejl: data?.fejl || error.message || "Kunne ikke oprette butikken" };
  if (data?.fejl) return { ok: false, fejl: data.fejl };
  return { ok: true };
}

// ---------- Profiler (erstatter den gamle "brugere"-blob) ----------
// Selve login/adgangskode håndteres af Supabase Auth (se LoginSide.jsx).
// Denne tabel holder kun butik_id + rolle + navn pr. bruger.

// Admin opretter en helt ny bruger (rigtigt login, ikke bare en profilrække).
// Kalder en Edge Function, fordi det kræver service_role-rettigheder, som
// aldrig må ligge i frontend-koden - funktionen tjekker selv at kalderen
// rent faktisk er admin, før den opretter noget (se
// supabase/functions/admin-opret-bruger).
export async function opretBrugerAdmin({ email, adgangskode, navn, rolle, montorId }) {
  const { data, error } = await supabase.functions.invoke("admin-opret-bruger", {
    body: { email, adgangskode, navn, rolle, montorId },
  });
  if (error) {
    // Supabase pakker edge-function-fejl lidt akavet ind - prøv at finde den rigtige besked.
    const besked = data?.fejl || error.message || "Kunne ikke oprette brugeren";
    return { ok: false, fejl: besked };
  }
  if (data?.fejl) return { ok: false, fejl: data.fejl };
  return { ok: true };
}

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