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

// Montører findes ikke længere som selvstændig tabel - se hentButiksBrugere
// nedenfor og profiler.bil_id.

export const hentVaretyper = (butikId) => hentListe("varetyper", butikId);
export const gemVaretyper = (butikId, varetyper) => gemListe("varetyper", butikId, varetyper);

export const hentVarekategorier = (butikId) => hentListe("varekategorier", butikId);
export const gemVarekategorier = (butikId, kategorier) => gemListe("varekategorier", butikId, kategorier);

export const hentPrimaerydelser = (butikId) => hentListe("primaerydelser", butikId);
export const gemPrimaerydelser = (butikId, primaerydelser) => gemListe("primaerydelser", butikId, primaerydelser);

export const hentTillaegsydelser = (butikId) => hentListe("tillaegsydelser", butikId);
export const gemTillaegsydelser = (butikId, tillaegsydelser) => gemListe("tillaegsydelser", butikId, tillaegsydelser);

// ---------- Butikker ----------
// Bruges bl.a. til at hente egen butiks koordinater (adresse-fokuspunkt for
// adresseforslag), og af systemadmin til at oprette/liste/redigere butikker.

export async function hentButik(butikId) {
  if (!butikId) return null;
  const { data, error } = await supabase.from("butikker").select("id, navn, adresse, lat, lon, butiksnummer").eq("id", butikId).maybeSingle();
  if (error) {
    console.error("Kunne ikke hente butik:", error.message);
    return null;
  }
  return data;
}

// Alle butikker (kun synlige for en systemadmin, jf. RLS).
export async function hentAlleButikker() {
  const { data, error } = await supabase.from("butikker").select("id, navn, adresse, lat, lon, butiksnummer, oprettet").order("oprettet", { ascending: false });
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

// Systemadmin retter navn/butiksnummer/koordinater på en eksisterende
// butik. Almindelig klient-opdatering (ingen edge function nødvendig) -
// RLS-policyen "systemadmin opdaterer butikker" tillader det allerede.
// Hvis adressen ændres, skal kaldet inkludere nye lat/lon (geokod med
// geokodAdresse fra steder.js, inden dette kaldes).
export async function opdaterButikSystemadmin(butikId, felter) {
  const { error } = await supabase.from("butikker").update(felter).eq("id", butikId);
  if (error) {
    console.error("Kunne ikke opdatere butik:", error.message);
    return { ok: false, fejl: error.message };
  }
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
export async function opretBrugerAdmin({ email, adgangskode, navn, rolle, bilId }) {
  const { data, error } = await supabase.functions.invoke("admin-opret-bruger", {
    body: { email, adgangskode, navn, rolle, bilId },
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
  return (data || []).map((p) => ({ id: p.id, navn: p.navn, rolle: p.rolle, bilId: p.bil_id }));
}

// Systemadmin: søger på tværs af ALLE butikker (til "Kobl bruger til
// butik"). Uden søgetekst vises kun brugere der endnu ikke hører til nogen
// butik (de mest relevante at koble op). Med søgetekst søges der i navn
// (som pr. default er sat til brugerens e-mail ved oprettelse).
export async function hentAlleBrugereSystemadmin(soegning) {
  let query = supabase.from("profiler").select("id, navn, rolle, butik_id").order("oprettet", { ascending: false });
  query = soegning?.trim() ? query.ilike("navn", `%${soegning.trim()}%`) : query.is("butik_id", null);
  const { data, error } = await query;
  if (error) {
    console.error("Kunne ikke hente brugere (systemadmin):", error.message);
    return [];
  }
  return (data || []).map((p) => ({ id: p.id, navn: p.navn, rolle: p.rolle, butikId: p.butik_id }));
}

// ---------- Ferier (pr. montør) ----------
// Bruges til at afgøre om en bil skal vises som blokeret for booking i en
// periode: en bil er blokeret de dage, hvor den montør, der LIGE NU er
// tilknyttet bilen (profiler.bil_id), holder ferie.

export async function hentFerier(butikId) {
  if (!butikId) return [];
  const { data, error } = await supabase.from("ferier").select("*").eq("butik_id", butikId);
  if (error) {
    console.error("Kunne ikke hente ferier:", error.message);
    return [];
  }
  return (data || []).map((f) => ({ id: f.id, montorId: f.montor_id, startDato: f.start_dato, slutDato: f.slut_dato, note: f.note || "" }));
}

export async function tilfoejFerie(butikId, { montorId, startDato, slutDato, note }) {
  const { error } = await supabase.from("ferier").insert({ butik_id: butikId, montor_id: montorId, start_dato: startDato, slut_dato: slutDato, note: note || null });
  if (error) {
    console.error("Kunne ikke oprette ferie:", error.message);
    return false;
  }
  return true;
}

export async function sletFerie(ferieId) {
  const { error } = await supabase.from("ferier").delete().eq("id", ferieId);
  if (error) {
    console.error("Kunne ikke slette ferie:", error.message);
    return false;
  }
  return true;
}

// Admin (eller systemadmin) retter navn/rolle/montør-kobling/butik på en
// eksisterende bruger.
// NB: kan IKKE oprette nye Auth-brugere herfra (kræver service_role-nøgle,
// som aldrig må ligge i frontend) - nye brugere skal selv oprette login via
// signup, hvorefter en admin/systemadmin sætter butik_id + rolle.
export async function opdaterProfil(brugerId, felter) {
  const { error } = await supabase.from("profiler").update(felter).eq("id", brugerId);
  if (error) {
    console.error("Kunne ikke opdatere profil:", error.message);
    return false;
  }
  return true;
}

// ---------- AI-ruteforslag ----------
// Kalder en Edge Function i stedet for Claude API'et direkte, så
// API-nøglen aldrig ligger i frontend-koden - se
// supabase/functions/ai-ruteforslag.
export async function hentAiRuteforslag({ grundlag, montorTekst, valgtDato }) {
  const { data, error } = await supabase.functions.invoke("ai-ruteforslag", {
    body: { grundlag, montorTekst, valgtDato },
  });
  if (error) return { ok: false, fejl: data?.fejl || error.message || "Kunne ikke hente AI-forslag" };
  if (data?.fejl) return { ok: false, fejl: data.fejl };
  return { ok: true, tekst: data.tekst };
}
