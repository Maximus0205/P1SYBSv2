// Erstatter den gamle blob-baserede storage.js. I stedet for at gemme hele
// lister som én stor JSON-tekst, ligger hver sag/bil/montør/varetype nu som
// sin egen række i Supabase - med store_id, så data er delt mellem alle i
// butikken (i modsætning til før, hvor det kun lå i den enkelte browser).
//
// VIGTIGT: vi gemmer og sletter altid ÉN specifik række ad gangen, aldrig
// "gem hele listen og slet alt andet". Se git-historikken for den fulde
// begrundelse (undgår "lost update" mellem samtidige brugere).
//
// NB (omlægning til engelsk skema): selve databasen (tabeller/kolonner) er
// nu omdøbt til engelsk (stores, orders, vehicles, profiles, osv.) som
// første skridt i en større oprydning af navngivningen i hele projektet.
// Denne fils EGNE funktionsnavne (hentSager, gemBil osv.) er bevidst IKKE
// ændret endnu, for at holde denne akutte rettelse lille og sikker - resten
// af koden (App.jsx m.fl.) importerer stadig disse navne uændret. De bliver
// omdøbt til engelsk i en efterfølgende, samlet omgang.

import { supabase } from "./supabaseClient";

async function hentListe(tabel, butikId) {
  if (!butikId) return [];
  const { data, error } = await supabase.from(tabel).select("data").eq("store_id", butikId);
  if (error) {
    console.error(`Kunne ikke hente ${tabel}:`, error.message);
    return [];
  }
  return (data || []).map((r) => r.data);
}

// Opretter eller opdaterer ÉN specifik række.
async function gemRaekke(tabel, butikId, item) {
  if (!butikId || !item) return false;
  const raekke = { id: String(item.id), store_id: butikId, data: item, updated_at: new Date().toISOString() };
  const { error } = await supabase.from(tabel).upsert(raekke);
  if (error) {
    console.error(`Kunne ikke gemme i ${tabel}:`, error.message);
    return false;
  }
  return true;
}

// Sletter ÉN specifik række. Afgrænset til egen butik som ekstra sikkerhed i
// selve kaldet (RLS dækker det allerede, men det gør intentionen tydelig og
// forhindrer et forkert butikId i at ramme forkert række).
async function sletRaekke(tabel, butikId, id) {
  if (!butikId || !id) return false;
  const { error } = await supabase.from(tabel).delete().eq("store_id", butikId).eq("id", String(id));
  if (error) {
    console.error(`Kunne ikke slette fra ${tabel}:`, error.message);
    return false;
  }
  return true;
}

// Sætter standardværdier op FØRSTE gang en butik bruger en liste (listen er
// tom i forvejen). Kun insert/upsert - aldrig sletning - så det er ufarligt
// selv hvis to faner/enheder skulle starte op på samme butik samtidig.
async function opsaetStandarder(tabel, butikId, liste) {
  if (!butikId || !liste || liste.length === 0) return false;
  const raekker = liste.map((item) => ({ id: String(item.id), store_id: butikId, data: item, updated_at: new Date().toISOString() }));
  const { error } = await supabase.from(tabel).upsert(raekker);
  if (error) {
    console.error(`Kunne ikke oprette standardværdier i ${tabel}:`, error.message);
    return false;
  }
  return true;
}

// Henter én enkelt (frisk) sag fra databasen - bruges lige efter oprettelse,
// så vi får det RIGTIGE, databasetildelte ordrenummer med det samme (se
// assign_order_number-triggeren i databasen), i stedet for det midlertidige
// nummer der blev gættet i browseren.
export async function hentFriskSag(butikId, id) {
  if (!butikId || !id) return null;
  const { data, error } = await supabase.from("orders").select("data").eq("store_id", butikId).eq("id", String(id)).maybeSingle();
  if (error) {
    console.error("Kunne ikke hente sagen igen:", error.message);
    return null;
  }
  return data?.data || null;
}

export const hentSager = (butikId) => hentListe("orders", butikId);
export const gemSag = (butikId, sag) => gemRaekke("orders", butikId, sag);
export const sletSag = (butikId, id) => sletRaekke("orders", butikId, id);

export const hentBiler = (butikId) => hentListe("vehicles", butikId);
export const gemBil = (butikId, bil) => gemRaekke("vehicles", butikId, bil);
export const sletBil = (butikId, id) => sletRaekke("vehicles", butikId, id);
export const opsaetStandardBiler = (butikId, biler) => opsaetStandarder("vehicles", butikId, biler);

// Montører findes ikke længere som selvstændig tabel - se hentButiksBrugere
// nedenfor og profiles.vehicle_id.

export const hentVaretyper = (butikId) => hentListe("product_types", butikId);
export const gemVaretype = (butikId, varetype) => gemRaekke("product_types", butikId, varetype);
export const sletVaretype = (butikId, id) => sletRaekke("product_types", butikId, id);
export const opsaetStandardVaretyper = (butikId, varetyper) => opsaetStandarder("product_types", butikId, varetyper);

export const hentVarekategorier = (butikId) => hentListe("product_categories", butikId);
export const gemVarekategori = (butikId, kategori) => gemRaekke("product_categories", butikId, kategori);
export const sletVarekategori = (butikId, id) => sletRaekke("product_categories", butikId, id);
export const opsaetStandardVarekategorier = (butikId, kategorier) => opsaetStandarder("product_categories", butikId, kategorier);

export const hentPrimaerydelser = (butikId) => hentListe("primary_services", butikId);
export const gemPrimaerydelse = (butikId, ydelse) => gemRaekke("primary_services", butikId, ydelse);
export const sletPrimaerydelse = (butikId, id) => sletRaekke("primary_services", butikId, id);
export const opsaetStandardPrimaerydelser = (butikId, primaerydelser) => opsaetStandarder("primary_services", butikId, primaerydelser);

export const hentTillaegsydelser = (butikId) => hentListe("add_on_services", butikId);
export const gemTillaegsydelse = (butikId, ydelse) => gemRaekke("add_on_services", butikId, ydelse);
export const sletTillaegsydelse = (butikId, id) => sletRaekke("add_on_services", butikId, id);
export const opsaetStandardTillaegsydelser = (butikId, tillaegsydelser) => opsaetStandarder("add_on_services", butikId, tillaegsydelser);

// Henter den rigtige fejlbesked fra en Edge Function-fejl. Uden dette viser
// supabase-js kun en generisk "non-2xx status code"-tekst - den rigtige
// besked (som vores funktioner selv sender som { fejl: "..." }) ligger i
// error.context (selve HTTP-svaret), og skal læses eksplicit.
async function laesEdgeFejl(data, error, standardBesked) {
  if (data?.fejl) return data.fejl;
  if (error?.context && typeof error.context.json === "function") {
    try {
      const krop = await error.context.clone().json();
      if (krop?.fejl) return krop.fejl;
    } catch (_) {
      // Kroppen var ikke JSON - falder tilbage til standardbeskeden herunder.
    }
  }
  return error?.message || standardBesked;
}

// ---------- Butikker ----------
// Bruges bl.a. til at hente egen butiks koordinater (adresse-fokuspunkt for
// adresseforslag), og af systemadmin til at oprette/liste/redigere/slette
// butikker.

export async function hentButik(butikId) {
  if (!butikId) return null;
  const { data, error } = await supabase.from("stores").select("id, name, address, lat, lon, store_number").eq("id", butikId).maybeSingle();
  if (error) {
    console.error("Kunne ikke hente butik:", error.message);
    return null;
  }
  if (!data) return null;
  // Normaliseret til de camelCase-feltnavne resten af appen (endnu) forventer.
  return { id: data.id, navn: data.name, adresse: data.address, lat: data.lat, lon: data.lon, butiksnummer: data.store_number };
}

// Alle butikker (kun synlige for en systemadmin, jf. RLS).
export async function hentAlleButikker() {
  const { data, error } = await supabase.from("stores").select("id, name, address, lat, lon, store_number, created_at").order("created_at", { ascending: false });
  if (error) {
    console.error("Kunne ikke hente butikker:", error.message);
    return [];
  }
  return (data || []).map((b) => ({ id: b.id, navn: b.name, adresse: b.address, lat: b.lat, lon: b.lon, butiksnummer: b.store_number, oprettet: b.created_at }));
}

// Systemadmin opretter en helt ny butik + dens første admin-login.
// Kalder en edge function (kræver service_role for at oprette Auth-brugeren
// og geokoder adressen server-side). Kildekoden til denne og de øvrige
// edge functions ligger og vedligeholdes inde i selve Supabase-projektet
// (Edge Functions-fanen), ikke i dette repo.
export async function opretButikSystemadmin(felter) {
  const { data, error } = await supabase.functions.invoke("systemadmin-opret-butik", { body: felter });
  if (error || data?.fejl) return { ok: false, fejl: await laesEdgeFejl(data, error, "Kunne ikke oprette butikken") };
  return { ok: true };
}

// Systemadmin retter navn/butiksnummer/koordinater på en eksisterende
// butik. Almindelig klient-opdatering (ingen edge function nødvendig) -
// RLS-policyen for stores tillader det allerede.
export async function opdaterButikSystemadmin(butikId, felter) {
  const dbFelter = {};
  if ("navn" in felter) dbFelter.name = felter.navn;
  if ("adresse" in felter) dbFelter.address = felter.adresse;
  if ("butiksnummer" in felter) dbFelter.store_number = felter.butiksnummer;
  if ("lat" in felter) dbFelter.lat = felter.lat;
  if ("lon" in felter) dbFelter.lon = felter.lon;
  const { error } = await supabase.from("stores").update(dbFelter).eq("id", butikId);
  if (error) {
    console.error("Kunne ikke opdatere butik:", error.message);
    return { ok: false, fejl: error.message };
  }
  return { ok: true };
}

// Systemadmin sletter en butik. Alt tilhørende data (sager, biler,
// varetyper osv.) slettes automatisk med (CASCADE i databasen) - brugernes
// LOGIN bevares, de mister blot koblingen til butikken (SET NULL), så en
// admin ikke ved et uheld sletter folks adgang til systemet, kun selve
// butiksdataen.
export async function sletButikSystemadmin(butikId) {
  const { error } = await supabase.from("stores").delete().eq("id", butikId);
  if (error) {
    console.error("Kunne ikke slette butik:", error.message);
    return { ok: false, fejl: error.message };
  }
  return { ok: true };
}

// ---------- Profiler (erstatter den gamle "brugere"-blob) ----------
// Selve login/adgangskode håndteres af Supabase Auth (se LoginSide.jsx).
// Denne tabel holder kun store_id + role + name/username pr. bruger.

// Opretter en helt ny bruger (rigtigt login, ikke bare en profilrække).
// Kaldes af en almindelig admin (opretter altid i egen butik), ELLER af en
// systemadmin, som kan angive butikId eksplicit for at oprette en bruger
// direkte til en hvilken som helst butik, uden om "opret ny butik"-flowet.
// loginType er "email" eller "brugernavn" - se src/lib/brugernavn.js.
export async function opretBrugerAdmin({ loginType, email, brugernavn, adgangskode, navn, rolle, bilId, butikId }) {
  const { data, error } = await supabase.functions.invoke("admin-opret-bruger", {
    body: { loginType, email, brugernavn, adgangskode, navn, rolle, bilId, butikId },
  });
  if (error || data?.fejl) return { ok: false, fejl: await laesEdgeFejl(data, error, "Kunne ikke oprette brugeren") };
  return { ok: true };
}

// Nulstiller en brugers adgangskode direkte (ingen e-mail nødvendig) - kan
// kaldes af en admin (for sin egen butiks brugere) eller en systemadmin
// (for hvem som helst).
export async function nulstilAdgangskodeAdmin(brugerId, nyAdgangskode) {
  const { data, error } = await supabase.functions.invoke("admin-nulstil-adgangskode", {
    body: { brugerId, nyAdgangskode },
  });
  if (error || data?.fejl) return { ok: false, fejl: await laesEdgeFejl(data, error, "Kunne ikke nulstille adgangskoden") };
  return { ok: true };
}

export async function hentEgenProfil(brugerId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", brugerId).maybeSingle();
  if (error) {
    console.error("Kunne ikke hente profil:", error.message);
    return null;
  }
  if (!data) return null;
  // Normaliseret til de felter App.jsx forventer (butik_id/rolle/bil_id/er_systemadmin).
  return { id: data.id, navn: data.name, butik_id: data.store_id, rolle: data.role, bil_id: data.vehicle_id, er_systemadmin: data.is_system_admin, brugernavn: data.username };
}

// Alle brugere i samme butik (til admin-siden, "Brugere"-fanen).
export async function hentButiksBrugere(butikId) {
  if (!butikId) return [];
  const { data, error } = await supabase.from("profiles").select("id, name, role, vehicle_id, username").eq("store_id", butikId);
  if (error) {
    console.error("Kunne ikke hente butikkens brugere:", error.message);
    return [];
  }
  return (data || []).map((p) => ({ id: p.id, navn: p.name, rolle: p.role, bilId: p.vehicle_id, brugernavn: p.username }));
}

// Systemadmin: søger/browser på tværs af ALLE butikker (til "Alle
// brugere"-listen og "Kobl bruger til butik"). Med visAlle=true vises ALLE
// brugere i hele kæden (evt. filtreret af søgetekst). Med visAlle=false:
// søgetekst søger på tværs af alt, ellers vises kun brugere der endnu ikke
// hører til nogen butik (de mest relevante at koble op).
export async function hentAlleBrugereSystemadmin(soegning, visAlle) {
  let query = supabase.from("profiles").select("id, name, role, store_id, username").order("created_at", { ascending: false });
  if (visAlle) {
    if (soegning?.trim()) query = query.or(`name.ilike.%${soegning.trim()}%,username.ilike.%${soegning.trim()}%`);
  } else {
    query = soegning?.trim() ? query.or(`name.ilike.%${soegning.trim()}%,username.ilike.%${soegning.trim()}%`) : query.is("store_id", null);
  }
  const { data, error } = await query;
  if (error) {
    console.error("Kunne ikke hente brugere (systemadmin):", error.message);
    return [];
  }
  return (data || []).map((p) => ({ id: p.id, navn: p.name, rolle: p.role, butikId: p.store_id, brugernavn: p.username }));
}

// ---------- Ferier (pr. montør) ----------
// Bruges til at afgøre om en bil skal vises som blokeret for booking i en
// periode: en bil er blokeret de dage, hvor den montør, der LIGE NU er
// tilknyttet bilen (profiles.vehicle_id), holder ferie.

export async function hentFerier(butikId) {
  if (!butikId) return [];
  const { data, error } = await supabase.from("time_off").select("*").eq("store_id", butikId);
  if (error) {
    console.error("Kunne ikke hente ferier:", error.message);
    return [];
  }
  return (data || []).map((f) => ({ id: f.id, montorId: f.technician_id, startDato: f.start_date, slutDato: f.end_date, note: f.note || "" }));
}

export async function tilfoejFerie(butikId, { montorId, startDato, slutDato, note }) {
  const { error } = await supabase.from("time_off").insert({ store_id: butikId, technician_id: montorId, start_date: startDato, end_date: slutDato, note: note || null });
  if (error) {
    console.error("Kunne ikke oprette ferie:", error.message);
    return false;
  }
  return true;
}

export async function sletFerie(ferieId) {
  const { error } = await supabase.from("time_off").delete().eq("id", ferieId);
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
// signup, hvorefter en admin/systemadmin sætter store_id + role.
export async function opdaterProfil(brugerId, felter) {
  const dbFelter = {};
  if ("navn" in felter) dbFelter.name = felter.navn;
  if ("rolle" in felter) dbFelter.role = felter.rolle;
  if ("bilId" in felter) dbFelter.vehicle_id = felter.bilId;
  if ("bil_id" in felter) dbFelter.vehicle_id = felter.bil_id;
  if ("butik_id" in felter) dbFelter.store_id = felter.butik_id;
  if ("butikId" in felter) dbFelter.store_id = felter.butikId;
  const { error } = await supabase.from("profiles").update(dbFelter).eq("id", brugerId);
  if (error) {
    console.error("Kunne ikke opdatere profil:", error.message);
    return false;
  }
  return true;
}

// ---------- AI-ruteforslag ----------
// Kalder en Edge Function i stedet for Claude API'et direkte, så
// API-nøglen aldrig ligger i frontend-koden.
export async function hentAiRuteforslag({ grundlag, montorTekst, valgtDato }) {
  const { data, error } = await supabase.functions.invoke("ai-ruteforslag", {
    body: { grundlag, montorTekst, valgtDato },
  });
  if (error || data?.fejl) return { ok: false, fejl: await laesEdgeFejl(data, error, "Kunne ikke hente AI-forslag") };
  return { ok: true, tekst: data.tekst };
}
