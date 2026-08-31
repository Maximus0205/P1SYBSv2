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
// konsol, uden nogen i butikken nogensinde får det at vide - se
// lib/errorLog.js og den nye fejl-log under fanen System.
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
// RETTET (august 2026): fejl-loggen ovenfor er kun synlig for en
// systemadmin bagefter. Fejlede en skrivning - fx fordi
// rettighedstriggeren på orders afviste den, eller fordi mobilen mistede
// forbindelsen midt i et besøg - så brugeren stadig sin ændring på
// skærmen (optimistisk opdatering) og gik derfra i god tro. Databasens
// egne afvisningsbeskeder er allerede formuleret på dansk, så de kan
// vises direkte.
//
// Bruges KUN de steder, hvor UI'et ikke selv viser fejlen. De kald der
// returnerer { ok, fejl } og får den vist af den kaldende komponent (fx
// createStoreAsSystemAdmin, createUserAsAdmin, resetPasswordAsAdmin,
// updateSickLeaveWindow) bruger fortsat logDbError alene - ellers ville
// samme fejl blive vist to gange.
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
// serveren" - se erNetvaerksfejl ovenfor og saveRow nedenfor.
//
// onConflict: 'store_id,id' er EKSPLICIT sat (rettet august 2026) - disse
// tabeller (vehicles, product_types, product_categories, primary_services,
// add_on_services, orders) har en SAMMENSAT primærnøgle (store_id, id),
// fordi faste standard-ID'er som "b1"/"vt1"/"p1" (se domain.js) seedes for
// ENHVER ny butik. Uden dette ville et upsert uden eksplicit onConflict
// stole på databasens PK-target - hvilket nu virker korrekt efter
// migrationen, men er skrøbeligt at stole på implicit; med det eksplicit
// sat her kan skemaet ikke stille og roligt komme ud af trit med koden.
async function saveRowResult(table, storeId, item) {
  if (!storeId || !item) return { ok: false, netvaerk: false, fejl: "Mangler butik eller data" };
  const row = { id: String(item.id), store_id: storeId, data: item, updated_at: new Date().toISOString() };
  const { error } = await supabase.from(table).upsert(row, { onConflict: "store_id,id" });
  if (error) {
    const netvaerk = erNetvaerksfejl(error);
    if (netvaerk) {
      // Ved en netværksfejl vises INGEN besked her. Ændringen er ikke
      // tabt - den lægges i kø og sendes, når forbindelsen er tilbage
      // (se useOrders.js). At vise "Ændringen blev ikke gemt" i den
      // situation ville være direkte forkert og få en montør til at
      // indtaste alting én gang til uden grund.
      logDbError(`dataStore:saveRow:${table}`, `Netværksfejl ved skrivning til ${table}`, error);
    } else {
      logWriteError(`dataStore:saveRow:${table}`, `Could not save to ${table}`, error, "Kunne ikke gemme ændringen:");
    }
    return { ok: false, netvaerk, fejl: error.message };
  }
  return { ok: true, netvaerk: false };
}

// Bagudkompatibel indpakning: de fleste kaldere har kun brug for "gik det
// godt?" og skal ikke forholde sig til hvorfor.
async function saveRow(table, storeId, item) {
  const r = await saveRowResult(table, storeId, item);
  return r.ok;
}

// Deletes ONE specific row. Scoped to the store as an extra safety measure
// in the call itself (RLS already covers this, but it makes the intent
// explicit and stops a wrong storeId from ever hitting the wrong row).
async function deleteRow(table, storeId, id) {
  if (!storeId || !id) return false;
  const { error } = await supabase.from(table).delete().eq("store_id", storeId).eq("id", String(id));
  if (error) {
    logWriteError(`dataStore:deleteRow:${table}`, `Could not delete from ${table}`, error, "Kunne ikke slette:");
    return false;
  }
  return true;
}

// Seeds default values the FIRST time a store uses a given list (the list
// is empty). Insert/upsert only - never deletes - so it's safe even if two
// tabs/devices happened to start up on the same store at the same time.
//
// onConflict: 'store_id,id' er EKSPLICIT sat af samme grund som i saveRow
// ovenfor - dette er netop stedet hvor kollisionen på tværs af butikker
// ville opstå (to butikkers seedning af fx "b1" rammer nu bevidst hver sin
// (store_id, id)-kombination i stedet for samme id-only-række).
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

// Fetches a single, fresh order from the database - used right after
// creation, so we get the REAL, database-assigned order number immediately
// (see the assign_order_number trigger), instead of the temporary number
// guessed in the browser.
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

// Technicians no longer exist as their own table - see getStoreUsers below
// and profiles.vehicle_id.

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

// Reads the real error message out of an Edge Function failure. Without
// this, supabase-js only shows a generic "non-2xx status code" text - the
// real message (which our functions send as { fejl: "..." }) lives in
// error.context (the actual HTTP response), and has to be read explicitly.
async function readEdgeFunctionError(data, error, fallbackMessage) {
  if (data?.fejl) return data.fejl;
  if (error?.context && typeof error.context.json === "function") {
    try {
      const body = await error.context.clone().json();
      if (body?.fejl) return body.fejl;
    } catch (_) {
      // Body wasn't JSON - fall back to the default message below.
    }
  }
  return error?.message || fallbackMessage;
}

// ---------- Stores ----------
// Used to fetch e.g. the own store's coordinates (address focus point for
// address suggestions), and by system admins to create/list/edit/delete
// stores.

export async function getStore(storeId) {
  if (!storeId) return null;
  const { data, error } = await supabase.from("stores").select("id, name, address, lat, lon, store_number, sick_leave_window_hours").eq("id", storeId).maybeSingle();
  if (error) {
    logDbError("dataStore:getStore", "Could not load store", error);
    return null;
  }
  if (!data) return null;
  // Normalized to the camelCase field names the rest of the app (still) expects.
  return { id: data.id, navn: data.name, adresse: data.address, lat: data.lat, lon: data.lon, butiksnummer: data.store_number, sygemeldingVindueTimer: data.sick_leave_window_hours ?? 48 };
}

// All stores (only visible to a system admin, per RLS).
export async function getAllStores() {
  const { data, error } = await supabase.from("stores").select("id, name, address, lat, lon, store_number, created_at").order("created_at", { ascending: false });
  if (error) {
    logDbError("dataStore:getAllStores", "Could not load stores", error);
    return [];
  }
  return (data || []).map((s) => ({ id: s.id, navn: s.name, adresse: s.address, lat: s.lat, lon: s.lon, butiksnummer: s.store_number, oprettet: s.created_at }));
}

// System admin creates a brand new store + its first admin login. Calls an
// Edge Function (needs service_role to create the Auth user, and geocodes
// the address server-side). The source for this and the other Edge
// Functions lives and is maintained inside the Supabase project itself
// (Edge Functions tab), not in this repo.
export async function createStoreAsSystemAdmin(fields) {
  const { data, error } = await supabase.functions.invoke("systemadmin-opret-butik", { body: fields });
  if (error || data?.fejl) {
    const fejl = await readEdgeFunctionError(data, error, "Could not create the store");
    logError("dataStore:createStoreAsSystemAdmin", fejl);
    return { ok: false, fejl };
  }
  return { ok: true };
}

// System admin edits name/store number/coordinates on an existing store.
// Plain client-side update (no Edge Function needed) - the RLS policy for
// stores already allows it.
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

// System admin deletes a store. All of its data (orders, vehicles, product
// types etc.) is deleted automatically (CASCADE in the database) - users'
// LOGINS are preserved, they just lose the link to that store (SET NULL),
// so an admin doesn't accidentally delete anyone's access to the system,
// only the store's own data.
export async function deleteStoreAsSystemAdmin(storeId) {
  const { error } = await supabase.from("stores").delete().eq("id", storeId);
  if (error) {
    logDbError("dataStore:deleteStoreAsSystemAdmin", "Could not delete store", error);
    return { ok: false, fejl: error.message };
  }
  return { ok: true };
}

// Butikkens EGEN admin (eller en systemadmin, for enhver butik - se
// App.jsx: butiks-skifteren) må ændre PRÆCIS denne ene indstilling - hvor
// mange timer frem en sygemeldt montørs sager vises, mens sygemeldingen
// er aktiv. Kalder en snævert afgrænset SECURITY DEFINER-funktion i
// databasen - IKKE et almindeligt tabel-opdateringskald, fordi
// almindelige butiks-admins i øvrigt ikke har skriveadgang til
// stores-tabellen. storeId sendes nu EKSPLICIT med (RETTET august 2026,
// se migrationen "fix_sick_leave_window_for_store_switching") - uden det
// ville en systemadmin, der er skiftet til at se en ANDEN butik end deres
// egen, ved et tryk her stille og roligt ramme deres egen butik i stedet.
export async function updateSickLeaveWindow(hours, storeId) {
  const { error } = await supabase.rpc("update_sick_leave_window", { p_hours: hours, p_store_id: storeId ?? null });
  if (error) {
    logDbError("dataStore:updateSickLeaveWindow", "Could not update sick leave window", error);
    return { ok: false, fejl: error.message };
  }
  return { ok: true };
}

// ---------- Rettigheder (august 2026) ----------
// Se migrationerne "permission_catalog_and_role_defaults",
// "profile_individual_permission_overrides" og
// "enforce_permissions_on_writes" i Supabase-projektet. En brugers
// FAKTISKE rettigheder = rollens standardrettigheder ∪ extra_permissions,
// minus revoked_permissions - håndhævet i selve databasen (RLS +
// triggere på orders/profiles), ikke kun i UI'et. Disse funktioner henter
// kataloget/standarderne (til rettigheds-editoren i Admin) og ens egne,
// faktiske rettigheder (til at styre navigation, se useSession.js).

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

// Opdaterer én brugers individuelle til-/fravalg. Håndhæves også i
// databasen (kun en med admin_brugere-rettighed, på en ANDEN bruger end
// sig selv - se profiles_guard_privileged_fields-triggeren), så dette
// kald ikke kan bruges til at give sig selv flere rettigheder.
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

// ---------- Dashboard-widgets (august 2026) ----------
// Ren visningspræference (se profiles.dashboard_widgets) - hvilke widgets
// den enkelte bruger har valgt at vise på deres forside, og i hvilken
// rækkefølge. Giver ingen ny adgang til noget, kun layout - derfor intet
// særskilt håndhævelses-lag ud over almindelig RLS (man kan altid frit
// tilpasse sin egen forside).
export async function updateDashboardWidgets(userId, widgetKeys) {
  const { error } = await supabase.from("profiles").update({ dashboard_widgets: widgetKeys }).eq("id", userId);
  if (error) {
    logWriteError("dataStore:updateDashboardWidgets", "Could not save dashboard layout", error, "Forsidens opsætning blev ikke gemt:");
    return { ok: false, fejl: error.message };
  }
  return { ok: true };
}

// ---------- Profiles ----------
// Login/password itself is handled by Supabase Auth (see LoginSide.jsx).
// This table only holds store_id + role + name/username per user.

// Creates a brand new user (a real login, not just a profile row). Called
// by either a regular admin (always creates in their own store), OR a
// system admin, who can pass storeId explicitly to create a user directly
// for any store, bypassing the "create new store" flow. loginType is
// "email" or "brugernavn" - see src/lib/brugernavn.js.
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

// Resets a user's password directly (no email needed) - can be called by an
// admin (for their own store's users) or a system admin (for anyone).
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

// SLETTER en bruger permanent - både Auth-loginet og profilen (august
// 2026). Kræver service_role, derfor en edge function (admin-slet-bruger),
// som selv tjekker at kalderen har admin_brugere (eller er systemadmin) og
// kun rører sin egen butiks brugere.
//
// tjekKun=true UDFØRER INTET, men returnerer konsekvenserne, så
// bekræftelsesdialogen kan vise dem, FØR nogen trykker:
//   { navn, rolle, fravaersperioder, kommendeSager }
//
// Det er ikke pynt. Fravær og sygemeldinger SLETTES med brugeren (CASCADE
// i databasen), og kommende sager tildelt personen bliver liggende og
// dukker op i Planlægning under "Montørproblem" med teksten "Montøren
// findes ikke længere". Begge dele skal man kende, inden man sletter en
// montør midt i en uge med 12 sager i kalenderen.
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

export async function getOwnProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) {
    logDbError("dataStore:getOwnProfile", "Could not load profile", error);
    return null;
  }
  if (!data) return null;
  // Normalized to the fields App.jsx expects (butik_id/rolle/bil_id/er_systemadmin).
  return { id: data.id, navn: data.name, butik_id: data.store_id, rolle: data.role, bil_id: data.vehicle_id, er_systemadmin: data.is_system_admin, brugernavn: data.username, dashboard_widgets: data.dashboard_widgets };
}

// All users in the same store (for the admin page's "Users" tab). Includes
// hver brugers individuelle rettigheds-til-/fravalg (extra/revoked), så
// rettigheds-editoren i Admin kan vise dem (se AdminParts.jsx: UserRow).
export async function getStoreUsers(storeId) {
  if (!storeId) return [];
  const { data, error } = await supabase.from("profiles").select("id, name, role, vehicle_id, username, extra_permissions, revoked_permissions").eq("store_id", storeId);
  if (error) {
    logDbError("dataStore:getStoreUsers", "Could not load the store's users", error);
    return [];
  }
  return (data || []).map((p) => ({ id: p.id, navn: p.name, rolle: p.role, bilId: p.vehicle_id, brugernavn: p.username, extraPermissions: p.extra_permissions || [], revokedPermissions: p.revoked_permissions || [] }));
}

// System admin: search/browse across ALL stores (for the "All users" list
// and "Link user to store"). With showAll=true, ALL users in the whole
// chain are shown (optionally filtered by search text). With showAll=false:
// search text searches across everything, otherwise only users not yet
// linked to any store are shown (the most relevant ones to act on).
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

// ---------- Time off (per technician) ----------
// Bruges til at afgøre om en bil skal vises som blokeret i en periode
// (en bil er blokeret de dage montøren der PT er tilknyttet den, har
// fravær - se vehicleBlockedByTimeOff i domain.js), OG som grundlaget for
// "Sygemelding"-fanen i Planlægning (august 2026).
//
// "type" skelner mellem "ferie" (altid begge datoer kendt på forhånd) og
// "sygdom" (starter ÅBEN - slutDato er null indtil "Raskmeld" bruges, se
// endSickLeave nedenfor). Samme underliggende tabel/forespørgsel for
// begge - kun arbejdsgangen omkring dem er forskellig.

export async function getTimeOff(storeId) {
  if (!storeId) return [];
  const { data, error } = await supabase.from("time_off").select("*").eq("store_id", storeId);
  if (error) {
    logDbError("dataStore:getTimeOff", "Could not load time off", error);
    return [];
  }
  return (data || []).map((f) => ({ id: f.id, montorId: f.technician_id, startDato: f.start_date, slutDato: f.end_date, note: f.note || "", type: f.type || "ferie" }));
}

// slutDato må nu være null/undefined (åben sygemelding) - se
// beginSickLeave nedenfor for den forventede brug ved sygemelding.
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

// "Sygemeld": opretter en NY, ÅBEN sygdomsperiode for montøren fra i dag
// (ingen slutdato endnu). Adskilt fra addTimeOff/ferie-flowet i UI'et (se
// "Sygemeld"-knappen i AdminParts.jsx), men bruger samme tabel.
export async function beginSickLeave(storeId, montorId, note) {
  return addTimeOff(storeId, { montorId, startDato: new Date().toISOString().slice(0, 10), slutDato: null, note, type: "sygdom" });
}

// "Raskmeld": lukker en ÅBEN sygdomsperiode ved at sætte slutdatoen til i
// dag. Opdaterer ét specifikt time_off-id, ikke en hel liste.
export async function endSickLeave(timeOffId) {
  const { error } = await supabase.from("time_off").update({ end_date: new Date().toISOString().slice(0, 10) }).eq("id", timeOffId);
  if (error) {
    logWriteError("dataStore:endSickLeave", "Could not end sick leave", error, "Raskmeldingen blev ikke gemt:");
    return false;
  }
  return true;
}

// Admin (or system admin) edits name/role/technician link/store on an
// existing user.
//
// BUTIKSSKIFT (august 2026): butik_id/butikId er den vej, en medarbejder
// flyttes til en anden butik - en opgave for en SYSTEMADMIN, som er den
// eneste med overblik over alle butikker. Butikkens egen admin kan ikke
// flytte nogen; de kan oprette og slette brugere i deres egen butik (se
// deleteUserAsAdmin ovenfor).
export async function updateProfile(userId, fields) {
  const dbFields = {};
  if ("navn" in fields) dbFields.name = fields.navn;
  if ("rolle" in fields) dbFields.role = fields.rolle;
  if ("bilId" in fields) dbFields.vehicle_id = fields.bilId;
  if ("bil_id" in fields) dbFields.vehicle_id = fields.bil_id;
  if ("butik_id" in fields) dbFields.store_id = fields.butik_id;
  if ("butikId" in fields) dbFields.store_id = fields.butikId;
  const { error } = await supabase.from("profiles").update(dbFields).eq("id", userId);
  if (error) {
    logWriteError("dataStore:updateProfile", "Could not update profile", error, "Brugeren blev ikke opdateret:");
    return false;
  }
  return true;
}

// ---------- Ankomst-SMS til kunden ----------
// Sendes via en Edge Function (se supabase/functions/send-ankomst-sms i
// Supabase-projektet), som sender fra firmaets FÆLLES Twilio-afsender -
// IKKE fra montørens egen telefon (mange montører bruger deres private
// telefon, og skal hverken dele deres eget nummer med kunden eller selv
// åbne/afsende noget manuelt). Sendes med det samme når denne kaldes - se
// ArrivalSmsButton i TechnicianPage.jsx.
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
// Kalder punkt1.dk's EGET, offentlige søge-API (fundet via Chrome DevTools,
// bekræftet at give rigtige produktdata - se samtalen om varenummer-
// validering) igennem en edge function (undgår CORS-problemer ved at kalde
// det direkte fra browseren). Returnerer matchende produkter + et
// foreslået mærke, HVIS der er ét entydigt mærke blandt træfferne - se
// ModelNumberLookup i OrderFormFields.jsx.
export async function lookupPunkt1Product(model) {
  const { data, error } = await supabase.functions.invoke("punkt1-produktopslag", { body: { model } });
  if (error || data?.fejl) {
    const fejl = await readEdgeFunctionError(data, error, "Kunne ikke slå produktet op på punkt1.dk");
    logError("dataStore:lookupPunkt1Product", fejl);
    return { ok: false, fejl };
  }
  return { ok: true, matchCount: data.matchCount, brand: data.brand, products: data.products };
}

// ---------- Fejl-log (august 2026) ----------
// Kun læsbar af systemadmin (håndhævet af RLS på selve error_logs-
// tabellen, ikke kun her i klienten) - se SystemAdminPage.jsx. Se
// lib/errorLog.js for selve INDSAMLINGEN af fejl.

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
