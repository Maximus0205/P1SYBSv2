// Replaces the old blob-based storage.js. Instead of saving whole lists as
// one big JSON blob, each order/vehicle/product type etc. lives as its own
// row in Supabase - scoped by store_id, so data is shared between everyone
// in the store (unlike before, where it only lived in a single browser).
//
// IMPORTANT: we always save/delete ONE specific row at a time, never "save
// the whole list and delete everything else". The latter sounds harmless
// but isn't: if two users have the app open at the same time, and user A's
// local list is slightly stale (e.g. because user B just created a new
// order), a "save the whole list" call from A would delete B's new order
// in the database, because it wasn't part of A's (stale) local list.
// Targeted insert/update/delete calls only ever touch the exact row they
// concern.

import { supabase } from "./supabaseClient";
import { logError } from "./errorLog";
import { reportSaveFailure } from "./saveStatus";

// Fejl-logning (august 2026) VED SIDEN AF console.error (ikke i stedet
// for - konsollen er stadig nyttig ved lokal udvikling). Uden dette
// forsvinder en mislykket gem-/hente-handling stille i browserens
// konsol, uden nogen i butikken nogensinde får det at vide.
function logDbError(source, message, error) {
  console.error(message, error?.message);
  logError(source, error?.message || message, { detail: message });
}

// Er dette en fejl, der skyldes FORBINDELSEN frem for en afvisning?
//
// VIGTIGT (august 2026): supabase-js KASTER IKKE ved netværksfejl. Den
// fanger fejlen internt og returnerer den i { error }, præcis som en
// afvist skrivning. Set fra kaldende kode ligner "mobilen har ingen
// dækning" og "du mangler rettigheden Feltarbejde" derfor hinanden - og
// det er en vigtig forskel: den ene skal prøves igen senere, den anden
// vil fejle for evigt.
//
// Uden denne skelnen ville offline-køen (se lib/offlineQueue.js) aldrig
// blive brugt, fordi den fejl-gren den lytter på, aldrig rammes.
function erNetvaerksfejl(error) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const besked = (error?.message || "").toLowerCase();
  return (
    besked.includes("failed to fetch") ||
    besked.includes("networkerror") ||
    besked.includes("network request failed") ||
    besked.includes("load failed") ||
    besked.includes("timeout") ||
    besked.includes("aborted")
  );
}

// Som logDbError, men til SKRIVNINGER: melder desuden fejlen videre til
// brugeren med det samme (se lib/saveStatus.js og
// components/SaveErrorBanner.jsx).
//
// Bruges KUN de steder, hvor UI'et ikke selv viser fejlen. De kald der
// returnerer { ok, fejl } og får den vist af den kaldende komponent
// bruger fortsat logDbError alene - ellers ville samme fejl vises to
// gange.
function logWriteError(source, message, error, brugerBesked) {
  logDbError(source, message, error);
  reportSaveFailure(brugerBesked ? `${brugerBesked} ${error?.message || ""}`.trim() : (error?.message || message));
}

async function getList(table, storeId) {
  if (!storeId) return [];
  const { data, error } = await supabase.from(table).select("data").eq("store_id", storeId);
  if (error) {
    logDbError(`dataStore:getList:${table}`, `Could not load ${table}`, error);
    return [];
  }
  return (data || []).map((r) => r.data);
}

// Creates or updates ONE specific row. Returnerer { ok, netvaerk, fejl },
// så den kaldende kode kan skelne mellem "afvist" og "kunne ikke nå
// serveren".
//
// onConflict: 'store_id,id' er EKSPLICIT sat - disse tabeller har en
// SAMMENSAT primærnøgle (store_id, id), fordi faste standard-ID'er som
// "b1"/"vt1"/"p1" seedes for ENHVER ny butik.
async function saveRowResult(table, storeId, item) {
  if (!storeId || !item) return { ok: false, netvaerk: false, fejl: "Mangler butik eller data" };
  const row = { id: String(item.id), store_id: storeId, data: item, updated_at: new Date().toISOString() };
  const { error } = await supabase.from(table).upsert(row, { onConflict: "store_id,id" });
  if (error) {
    const netvaerk = erNetvaerksfejl(error);
    if (netvaerk) {
      // Ved en netværksfejl vises INGEN besked her. Ændringen er ikke
      // tabt - den lægges i kø og sendes, når forbindelsen er tilbage.
      // "Ændringen blev ikke gemt" ville være direkte forkert.
      logDbError(`dataStore:saveRow:${table}`, `Netværksfejl ved skrivning til ${table}`, error);
    } else {
      logWriteError(`dataStore:saveRow:${table}`, `Could not save to ${table}`, error, "Kunne ikke gemme ændringen:");
    }
    return { ok: false, netvaerk, fejl: error.message };
  }
  return { ok: true, netvaerk: false };
}

async function saveRow(table, storeId, item) {
  const r = await saveRowResult(table, storeId, item);
  return r.ok;
}

// Deletes ONE specific row. Scoped to the store as an extra safety measure
// (RLS already covers it, but det gør hensigten eksplicit).
async function deleteRow(table, storeId, id) {
  if (!storeId || !id) return false;
  const { error } = await supabase.from(table).delete().eq("store_id", storeId).eq("id", String(id));
  if (error) {
    logWriteError(`dataStore:deleteRow:${table}`, `Could not delete from ${table}`, error, "Kunne ikke slette:");
    return false;
  }
  return true;
}

// Seeds default values the FIRST time a store uses a given list.
// Insert/upsert only - never deletes - så det er sikkert, selv hvis to
// faner/enheder starter op på samme butik samtidig.
async function seedDefaults(table, storeId, list) {
  if (!storeId || !list || list.length === 0) return false;
  const rows = list.map((item) => ({ id: String(item.id), store_id: storeId, data: item, updated_at: new Date().toISOString() }));
  const { error } = await supabase.from(table).upsert(rows, { onConflict: "store_id,id" });
  if (error) {
    logWriteError(`dataStore:seedDefaults:${table}`, `Could not seed defaults in ${table}`, error, "Kunne ikke oprette standardopsætningen:");
    return false;
  }
  return true;
}

// Henter én frisk sag - bruges lige efter oprettelse, så vi får det
// RIGTIGE, database-tildelte sagsnummer med det samme (se
// assign_order_number-triggeren) i stedet for browserens midlertidige gæt.
export async function getFreshOrder(storeId, id) {
  if (!storeId || !id) return null;
  const { data, error } = await supabase.from("orders").select("data").eq("store_id", storeId).eq("id", String(id)).maybeSingle();
  if (error) {
    logDbError("dataStore:getFreshOrder", "Could not re-fetch the order", error);
    return null;
  }
  return data?.data || null;
}

export const getOrders = (storeId) => getList("orders", storeId);
export const saveOrder = (storeId, order) => saveRow("orders", storeId, order);
// Til offline-køen: samme skrivning, men med besked om HVORFOR det gik
// galt, så en netværksfejl kan køes i stedet for at blive rullet tilbage.
export const saveOrderResult = (storeId, order) => saveRowResult("orders", storeId, order);
export const deleteOrder = (storeId, id) => deleteRow("orders", storeId, id);

export const getVehicles = (storeId) => getList("vehicles", storeId);
export const saveVehicle = (storeId, vehicle) => saveRow("vehicles", storeId, vehicle);
export const deleteVehicle = (storeId, id) => deleteRow("vehicles", storeId, id);
export const seedDefaultVehicles = (storeId, vehicles) => seedDefaults("vehicles", storeId, vehicles);

// Montører findes ikke som egen tabel - se getStoreUsers nedenfor,
// profiles.vehicle_id og profiles.can_drive.

export const getProductTypes = (storeId) => getList("product_types", storeId);
export const saveProductType = (storeId, productType) => saveRow("product_types", storeId, productType);
export const deleteProductType = (storeId, id) => deleteRow("product_types", storeId, id);
export const seedDefaultProductTypes = (storeId, productTypes) => seedDefaults("product_types", storeId, productTypes);

export const getProductCategories = (storeId) => getList("product_categories", storeId);
export const saveProductCategory = (storeId, category) => saveRow("product_categories", storeId, category);
export const deleteProductCategory = (storeId, id) => deleteRow("product_categories", storeId, id);
export const seedDefaultProductCategories = (storeId, categories) => seedDefaults("product_categories", storeId, categories);

export const getPrimaryServices = (storeId) => getList("primary_services", storeId);
export const savePrimaryService = (storeId, service) => saveRow("primary_services", storeId, service);
export const deletePrimaryService = (storeId, id) => deleteRow("primary_services", storeId, id);
export const seedDefaultPrimaryServices = (storeId, services) => seedDefaults("primary_services", storeId, services);

export const getAddOnServices = (storeId) => getList("add_on_services", storeId);
export const saveAddOnService = (storeId, service) => saveRow("add_on_services", storeId, service);
export const deleteAddOnService = (storeId, id) => deleteRow("add_on_services", storeId, id);
export const seedDefaultAddOnServices = (storeId, services) => seedDefaults("add_on_services", storeId, services);

// Læser den RIGTIGE fejlbesked ud af et Edge Function-svar. Uden dette
// viser supabase-js kun "non-2xx status code" - den rigtige besked (som
// vores funktioner sender som { fejl: "..." }) ligger i error.context.
async function readEdgeFunctionError(data, error, fallbackMessage) {
  if (data?.fejl) return data.fejl;
  if (error?.context && typeof error.context.json === "function") {
    try {
      const body = await error.context.clone().json();
      if (body?.fejl) return body.fejl;
    } catch (_) {
      // Body var ikke JSON - brug standardbeskeden nedenfor.
    }
  }
  return error?.message || fallbackMessage;
}

// ---------- Stores ----------

export async function getStore(storeId) {
  if (!storeId) return null;
  const { data, error } = await supabase.from("stores").select("id, name, address, lat, lon, store_number, sick_leave_window_hours").eq("id", storeId).maybeSingle();
  if (error) {
    logDbError("dataStore:getStore", "Could not load store", error);
    return null;
  }
  if (!data) return null;
  return { id: data.id, navn: data.name, adresse: data.address, lat: data.lat, lon: data.lon, butiksnummer: data.store_number, sygemeldingVindueTimer: data.sick_leave_window_hours ?? 48 };
}

export async function getAllStores() {
  const { data, error } = await supabase.from("stores").select("id, name, address, lat, lon, store_number, created_at").order("created_at", { ascending: false });
  if (error) {
    logDbError("dataStore:getAllStores", "Could not load stores", error);
    return [];
  }
  return (data || []).map((s) => ({ id: s.id, navn: s.name, adresse: s.address, lat: s.lat, lon: s.lon, butiksnummer: s.store_number, oprettet: s.created_at }));
}

export async function createStoreAsSystemAdmin(fields) {
  const { data, error } = await supabase.functions.invoke("systemadmin-opret-butik", { body: fields });
  if (error || data?.fejl) {
    const fejl = await readEdgeFunctionError(data, error, "Could not create the store");
    logError("dataStore:createStoreAsSystemAdmin", fejl);
    return { ok: false, fejl };
  }
  return { ok: true };
}

export async function updateStoreAsSystemAdmin(storeId, fields) {
  const dbFields = {};
  if ("navn" in fields) dbFields.name = fields.navn;
  if ("adresse" in fields) dbFields.address = fields.adresse;
  if ("butiksnummer" in fields) dbFields.store_number = fields.butiksnummer;
  if ("lat" in fields) dbFields.lat = fields.lat;
  if ("lon" in fields) dbFields.lon = fields.lon;
  const { error } = await supabase.from("stores").update(dbFields).eq("id", storeId);
  if (error) {
    logDbError("dataStore:updateStoreAsSystemAdmin", "Could not update store", error);
    return { ok: false, fejl: error.message };
  }
  return { ok: true };
}

// Sletter en butik. Alle dens data slettes automatisk (CASCADE), men
// brugernes LOGIN bevares - de mister blot tilknytningen (SET NULL), så
// ingen mister adgangen til systemet, kun butikkens egne data.
export async function deleteStoreAsSystemAdmin(storeId) {
  const { error } = await supabase.from("stores").delete().eq("id", storeId);
  if (error) {
    logDbError("dataStore:deleteStoreAsSystemAdmin", "Could not delete store", error);
    return { ok: false, fejl: error.message };
  }
  return { ok: true };
}

// Butikkens egen admin må ændre PRÆCIS denne ene indstilling. Kalder en
// snævert afgrænset SECURITY DEFINER-funktion - IKKE et almindeligt
// tabelkald, fordi butiks-admins ellers ikke har skriveadgang til stores.
export async function updateSickLeaveWindow(hours, storeId) {
  const { error } = await supabase.rpc("update_sick_leave_window", { p_hours: hours, p_store_id: storeId ?? null });
  if (error) {
    logDbError("dataStore:updateSickLeaveWindow", "Could not update sick leave window", error);
    return { ok: false, fejl: error.message };
  }
  return { ok: true };
}

// ---------- Rettigheder ----------
// En brugers FAKTISKE rettigheder = rollens standard ∪ extra_permissions,
// minus revoked_permissions - håndhævet i selve databasen (RLS +
// triggere), ikke kun i UI'et.

export async function getMyPermissions() {
  const { data, error } = await supabase.rpc("my_effective_permissions");
  if (error) {
    logDbError("dataStore:getMyPermissions", "Could not load permissions", error);
    return [];
  }
  return data || [];
}

export async function getPermissionsCatalog() {
  const { data, error } = await supabase.from("permissions").select("key, label, category").order("category").order("key");
  if (error) {
    logDbError("dataStore:getPermissionsCatalog", "Could not load permissions catalog", error);
    return [];
  }
  return data || [];
}

export async function getRoleDefaultPermissions() {
  const { data, error } = await supabase.from("role_default_permissions").select("role, permission_key");
  if (error) {
    logDbError("dataStore:getRoleDefaultPermissions", "Could not load role default permissions", error);
    return {};
  }
  const map = {};
  (data || []).forEach((r) => { (map[r.role] ||= []).push(r.permission_key); });
  return map;
}

export async function updateUserPermissions(userId, { extraPermissions, revokedPermissions }) {
  const { error } = await supabase.from("profiles").update({
    extra_permissions: extraPermissions, revoked_permissions: revokedPermissions,
  }).eq("id", userId);
  if (error) {
    logWriteError("dataStore:updateUserPermissions", "Could not update permissions", error, "Rettigheden blev ikke ændret:");
    return { ok: false, fejl: error.message };
  }
  return { ok: true };
}

// ---------- Dashboard-widgets ----------
// Ren visningspræference - giver ingen ny adgang, kun layout.
export async function updateDashboardWidgets(userId, widgetKeys) {
  const { error } = await supabase.from("profiles").update({ dashboard_widgets: widgetKeys }).eq("id", userId);
  if (error) {
    logWriteError("dataStore:updateDashboardWidgets", "Could not save dashboard layout", error, "Forsidens opsætning blev ikke gemt:");
    return { ok: false, fejl: error.message };
  }
  return { ok: true };
}

// ---------- Profiles ----------

export async function createUserAsAdmin({ loginType, email, brugernavn, adgangskode, navn, rolle, bilId, butikId }) {
  const { data, error } = await supabase.functions.invoke("admin-opret-bruger", {
    body: { loginType, email, brugernavn, adgangskode, navn, rolle, bilId, butikId },
  });
  if (error || data?.fejl) {
    const fejl = await readEdgeFunctionError(data, error, "Could not create the user");
    logError("dataStore:createUserAsAdmin", fejl);
    return { ok: false, fejl };
  }
  return { ok: true };
}

export async function resetPasswordAsAdmin(userId, newPassword) {
  const { data, error } = await supabase.functions.invoke("admin-nulstil-adgangskode", {
    body: { brugerId: userId, nyAdgangskode: newPassword },
  });
  if (error || data?.fejl) {
    const fejl = await readEdgeFunctionError(data, error, "Could not reset the password");
    logError("dataStore:resetPasswordAsAdmin", fejl);
    return { ok: false, fejl };
  }
  return { ok: true };
}

// SLETTER en bruger permanent - både Auth-loginet og profilen. Kræver
// service_role, derfor en edge function, som selv tjekker at kalderen har
// admin_brugere (eller er systemadmin) og kun rører sin egen butiks
// brugere.
//
// tjekKun=true UDFØRER INTET, men returnerer konsekvenserne, så
// bekræftelsen kan vise dem FØR nogen trykker. Det er ikke pynt: fravær og
// sygemeldinger SLETTES med brugeren (CASCADE), og kommende sager tildelt
// personen bliver liggende og dukker op under "Montørproblem".
export async function deleteUserAsAdmin(userId, { tjekKun } = {}) {
  const { data, error } = await supabase.functions.invoke("admin-slet-bruger", {
    body: { brugerId: userId, tjekKun: !!tjekKun },
  });
  if (error || data?.fejl) {
    const fejl = await readEdgeFunctionError(data, error, "Kunne ikke slette brugeren");
    logError("dataStore:deleteUserAsAdmin", fejl);
    return { ok: false, fejl };
  }
  return { ok: true, konsekvenser: data?.konsekvenser || null };
}

// kanKoere (september 2026) = profiles.can_drive: må denne person tildeles
// sager og en bil? Bevidst UAFHÆNGIG af rollen, så en sælger eller admin,
// der tager en montørrute en gang imellem, ikke skal have en ekstra
// brugerkonto. To konti for samme menneske spreder sagerne over to navne
// og sender notifikationer til den forkerte af dem.
export async function getOwnProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) {
    logDbError("dataStore:getOwnProfile", "Could not load profile", error);
    return null;
  }
  if (!data) return null;
  return {
    id: data.id, navn: data.name, butik_id: data.store_id, rolle: data.role,
    bil_id: data.vehicle_id, er_systemadmin: data.is_system_admin,
    brugernavn: data.username, dashboard_widgets: data.dashboard_widgets,
    kan_koere: data.can_drive === true,
  };
}

// Alle brugere i samme butik (til Admin-sidens faner). Inkluderer
// individuelle rettigheds-til-/fravalg OG can_drive, så både
// rettigheds-editoren og montør-listen kan bygges af samme data.
export async function getStoreUsers(storeId) {
  if (!storeId) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, role, vehicle_id, username, extra_permissions, revoked_permissions, can_drive")
    .eq("store_id", storeId);
  if (error) {
    logDbError("dataStore:getStoreUsers", "Could not load the store's users", error);
    return [];
  }
  return (data || []).map((p) => ({
    id: p.id, navn: p.name, rolle: p.role, bilId: p.vehicle_id, brugernavn: p.username,
    extraPermissions: p.extra_permissions || [], revokedPermissions: p.revoked_permissions || [],
    kanKoere: p.can_drive === true,
  }));
}

export async function getAllUsersAsSystemAdmin(search, showAll) {
  let query = supabase.from("profiles").select("id, name, role, store_id, username").order("created_at", { ascending: false });
  if (showAll) {
    if (search?.trim()) query = query.or(`name.ilike.%${search.trim()}%,username.ilike.%${search.trim()}%`);
  } else {
    query = search?.trim() ? query.or(`name.ilike.%${search.trim()}%,username.ilike.%${search.trim()}%`) : query.is("store_id", null);
  }
  const { data, error } = await query;
  if (error) {
    logDbError("dataStore:getAllUsersAsSystemAdmin", "Could not load users (system admin)", error);
    return [];
  }
  return (data || []).map((p) => ({ id: p.id, navn: p.name, rolle: p.role, butikId: p.store_id, brugernavn: p.username }));
}

// ---------- Fravær (pr. montør) ----------
// "type" skelner mellem "ferie" (begge datoer kendt på forhånd) og
// "sygdom" (starter ÅBEN - slutDato er null indtil raskmelding).

export async function getTimeOff(storeId) {
  if (!storeId) return [];
  const { data, error } = await supabase.from("time_off").select("*").eq("store_id", storeId);
  if (error) {
    logDbError("dataStore:getTimeOff", "Could not load time off", error);
    return [];
  }
  return (data || []).map((f) => ({ id: f.id, montorId: f.technician_id, startDato: f.start_date, slutDato: f.end_date, note: f.note || "", type: f.type || "ferie" }));
}

export async function addTimeOff(storeId, { montorId, startDato, slutDato, note, type }) {
  const { error } = await supabase.from("time_off").insert({
    store_id: storeId, technician_id: montorId, start_date: startDato, end_date: slutDato || null, note: note || null, type: type || "ferie",
  });
  if (error) {
    logWriteError("dataStore:addTimeOff", "Could not create time off", error, "Fraværet blev ikke oprettet:");
    return false;
  }
  return true;
}

export async function deleteTimeOff(timeOffId) {
  const { error } = await supabase.from("time_off").delete().eq("id", timeOffId);
  if (error) {
    logWriteError("dataStore:deleteTimeOff", "Could not delete time off", error, "Fraværet blev ikke slettet:");
    return false;
  }
  return true;
}

export async function beginSickLeave(storeId, montorId, note) {
  return addTimeOff(storeId, { montorId, startDato: new Date().toISOString().slice(0, 10), slutDato: null, note, type: "sygdom" });
}

export async function endSickLeave(timeOffId) {
  const { error } = await supabase.from("time_off").update({ end_date: new Date().toISOString().slice(0, 10) }).eq("id", timeOffId);
  if (error) {
    logWriteError("dataStore:endSickLeave", "Could not end sick leave", error, "Raskmeldingen blev ikke gemt:");
    return false;
  }
  return true;
}

// Admin (eller systemadmin) retter navn/rolle/bil/butik på en bruger.
//
// BUTIKSSKIFT: butik_id er den vej, en medarbejder flyttes til en anden
// butik - en systemadmin-opgave, da de er de eneste med overblik over alle
// butikker. Butikkens egen admin kan oprette og slette i sin egen butik,
// men ikke flytte folk rundt i kæden.
//
// kanKoere: se noten ved getOwnProfile. Både dette felt og bilen er
// beskyttet af rettigheden admin_montorer i databasen (se
// profiles_guard_privileged_fields) - det er den samme beslutning: hvem
// kører? Uden den beskyttelse kunne enhver skrive sig selv ind i
// montørlisten og blive tildelt kundesager.
export async function updateProfile(userId, fields) {
  const dbFields = {};
  if ("navn" in fields) dbFields.name = fields.navn;
  if ("rolle" in fields) dbFields.role = fields.rolle;
  if ("bilId" in fields) dbFields.vehicle_id = fields.bilId;
  if ("bil_id" in fields) dbFields.vehicle_id = fields.bil_id;
  if ("butik_id" in fields) dbFields.store_id = fields.butik_id;
  if ("butikId" in fields) dbFields.store_id = fields.butikId;
  if ("kanKoere" in fields) dbFields.can_drive = !!fields.kanKoere;
  const { error } = await supabase.from("profiles").update(dbFields).eq("id", userId);
  if (error) {
    logWriteError("dataStore:updateProfile", "Could not update profile", error, "Brugeren blev ikke opdateret:");
    return false;
  }
  return true;
}

// ---------- Ankomst-SMS til kunden ----------
// Sendes via en Edge Function fra firmaets FÆLLES afsender - IKKE fra
// montørens egen telefon. Mange montører bruger deres private telefon og
// skal hverken dele deres nummer med kunden eller selv sende noget.
export async function sendArrivalSms({ telefon, minutter, kundeNavn }) {
  const { data, error } = await supabase.functions.invoke("send-ankomst-sms", {
    body: { telefon, minutter, kundeNavn },
  });
  if (error || data?.fejl) {
    const fejl = await readEdgeFunctionError(data, error, "Kunne ikke sende SMS'en");
    logError("dataStore:sendArrivalSms", fejl);
    return { ok: false, fejl };
  }
  return { ok: true };
}

// ---------- Modelnummer-opslag mod punkt1.dk ----------
// Kalder punkt1.dk's eget offentlige søge-API gennem en edge function
// (undgår CORS ved at kalde det direkte fra browseren).
export async function lookupPunkt1Product(model) {
  const { data, error } = await supabase.functions.invoke("punkt1-produktopslag", { body: { model } });
  if (error || data?.fejl) {
    const fejl = await readEdgeFunctionError(data, error, "Kunne ikke slå produktet op på punkt1.dk");
    logError("dataStore:lookupPunkt1Product", fejl);
    return { ok: false, fejl };
  }
  return { ok: true, matchCount: data.matchCount, brand: data.brand, products: data.products };
}

// ---------- Fejl-log ----------
// Kun læsbar af systemadmin (håndhævet af RLS på error_logs, ikke kun her
// i klienten). Se lib/errorLog.js for selve INDSAMLINGEN.

export async function getErrorLogs(limit = 200) {
  const { data, error } = await supabase.from("error_logs").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) {
    console.error("Could not load error logs:", error.message);
    return [];
  }
  return (data || []).map((e) => ({
    id: e.id, tid: e.created_at, butikId: e.store_id, brugerId: e.user_id, rolle: e.user_role,
    kilde: e.source, besked: e.message, stack: e.stack, url: e.url, kontekst: e.context, brugerAgent: e.user_agent,
  }));
}

export async function deleteErrorLog(id) {
  const { error } = await supabase.from("error_logs").delete().eq("id", id);
  if (error) {
    console.error("Could not delete error log entry:", error.message);
    return false;
  }
  return true;
}

export async function clearErrorLogs() {
  const { error } = await supabase.from("error_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) {
    console.error("Could not clear error log:", error.message);
    return false;
  }
  return true;
}
