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

async function getList(table, storeId) {
  if (!storeId) return [];
  const { data, error } = await supabase.from(table).select("data").eq("store_id", storeId);
  if (error) {
    console.error(`Could not load ${table}:`, error.message);
    return [];
  }
  return (data || []).map((r) => r.data);
}

// Creates or updates ONE specific row.
async function saveRow(table, storeId, item) {
  if (!storeId || !item) return false;
  const row = { id: String(item.id), store_id: storeId, data: item, updated_at: new Date().toISOString() };
  const { error } = await supabase.from(table).upsert(row);
  if (error) {
    console.error(`Could not save to ${table}:`, error.message);
    return false;
  }
  return true;
}

// Deletes ONE specific row. Scoped to the store as an extra safety measure
// in the call itself (RLS already covers this, but it makes the intent
// explicit and stops a wrong storeId from ever hitting the wrong row).
async function deleteRow(table, storeId, id) {
  if (!storeId || !id) return false;
  const { error } = await supabase.from(table).delete().eq("store_id", storeId).eq("id", String(id));
  if (error) {
    console.error(`Could not delete from ${table}:`, error.message);
    return false;
  }
  return true;
}

// Seeds default values the FIRST time a store uses a given list (the list
// is empty). Insert/upsert only - never deletes - so it's safe even if two
// tabs/devices happened to start up on the same store at the same time.
async function seedDefaults(table, storeId, list) {
  if (!storeId || !list || list.length === 0) return false;
  const rows = list.map((item) => ({ id: String(item.id), store_id: storeId, data: item, updated_at: new Date().toISOString() }));
  const { error } = await supabase.from(table).upsert(rows);
  if (error) {
    console.error(`Could not seed defaults in ${table}:`, error.message);
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
    console.error("Could not re-fetch the order:", error.message);
    return null;
  }
  return data?.data || null;
}

export const getOrders = (storeId) => getList("orders", storeId);
export const saveOrder = (storeId, order) => saveRow("orders", storeId, order);
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
  const { data, error } = await supabase.from("stores").select("id, name, address, lat, lon, store_number").eq("id", storeId).maybeSingle();
  if (error) {
    console.error("Could not load store:", error.message);
    return null;
  }
  if (!data) return null;
  // Normalized to the camelCase field names the rest of the app (still) expects.
  return { id: data.id, navn: data.name, adresse: data.address, lat: data.lat, lon: data.lon, butiksnummer: data.store_number };
}

// All stores (only visible to a system admin, per RLS).
export async function getAllStores() {
  const { data, error } = await supabase.from("stores").select("id, name, address, lat, lon, store_number, created_at").order("created_at", { ascending: false });
  if (error) {
    console.error("Could not load stores:", error.message);
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
  if (error || data?.fejl) return { ok: false, fejl: await readEdgeFunctionError(data, error, "Could not create the store") };
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
    console.error("Could not update store:", error.message);
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
    console.error("Could not delete store:", error.message);
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
  if (error || data?.fejl) return { ok: false, fejl: await readEdgeFunctionError(data, error, "Could not create the user") };
  return { ok: true };
}

// Resets a user's password directly (no email needed) - can be called by an
// admin (for their own store's users) or a system admin (for anyone).
export async function resetPasswordAsAdmin(userId, newPassword) {
  const { data, error } = await supabase.functions.invoke("admin-nulstil-adgangskode", {
    body: { brugerId: userId, nyAdgangskode: newPassword },
  });
  if (error || data?.fejl) return { ok: false, fejl: await readEdgeFunctionError(data, error, "Could not reset the password") };
  return { ok: true };
}

export async function getOwnProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) {
    console.error("Could not load profile:", error.message);
    return null;
  }
  if (!data) return null;
  // Normalized to the fields App.jsx expects (butik_id/rolle/bil_id/er_systemadmin).
  return { id: data.id, navn: data.name, butik_id: data.store_id, rolle: data.role, bil_id: data.vehicle_id, er_systemadmin: data.is_system_admin, brugernavn: data.username };
}

// All users in the same store (for the admin page's "Users" tab).
export async function getStoreUsers(storeId) {
  if (!storeId) return [];
  const { data, error } = await supabase.from("profiles").select("id, name, role, vehicle_id, username").eq("store_id", storeId);
  if (error) {
    console.error("Could not load the store's users:", error.message);
    return [];
  }
  return (data || []).map((p) => ({ id: p.id, navn: p.name, rolle: p.role, bilId: p.vehicle_id, brugernavn: p.username }));
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
    console.error("Could not load users (system admin):", error.message);
    return [];
  }
  return (data || []).map((p) => ({ id: p.id, navn: p.name, rolle: p.role, butikId: p.store_id, brugernavn: p.username }));
}

// ---------- Time off (per technician) ----------
// Used to determine whether a vehicle should show as blocked for booking in
// a period: a vehicle is blocked on the days where the technician CURRENTLY
// linked to it (profiles.vehicle_id) is on time off.

export async function getTimeOff(storeId) {
  if (!storeId) return [];
  const { data, error } = await supabase.from("time_off").select("*").eq("store_id", storeId);
  if (error) {
    console.error("Could not load time off:", error.message);
    return [];
  }
  return (data || []).map((f) => ({ id: f.id, montorId: f.technician_id, startDato: f.start_date, slutDato: f.end_date, note: f.note || "" }));
}

export async function addTimeOff(storeId, { montorId, startDato, slutDato, note }) {
  const { error } = await supabase.from("time_off").insert({ store_id: storeId, technician_id: montorId, start_date: startDato, end_date: slutDato, note: note || null });
  if (error) {
    console.error("Could not create time off:", error.message);
    return false;
  }
  return true;
}

export async function deleteTimeOff(timeOffId) {
  const { error } = await supabase.from("time_off").delete().eq("id", timeOffId);
  if (error) {
    console.error("Could not delete time off:", error.message);
    return false;
  }
  return true;
}

// Admin (or system admin) edits name/role/technician link/store on an
// existing user.
// NB: can NOT create new Auth users from here (needs the service_role key,
// which must never live in the frontend) - new users have to sign up
// themselves, after which an admin/system admin sets store_id + role.
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
    console.error("Could not update profile:", error.message);
    return false;
  }
  return true;
}

// ---------- AI route suggestion ----------
// Calls an Edge Function instead of the Claude/Gemini API directly, so the
// API key never lives in the frontend code. `nyOpgave` er valgfri - angives
// den, returnerer edge function STRUKTUREREDE forslag ({forslag: [...],
// generelKommentar}) i stedet for fri tekst - se SuggestedDates i
// OrderFormFields.jsx, som bruger dette til klikbare datoforslag i
// bookingflowets sidste trin.
export async function getAiRouteSuggestion({ grundlag, montorTekst, valgtDato, nyOpgave }) {
  const { data, error } = await supabase.functions.invoke("ai-ruteforslag", {
    body: { grundlag, montorTekst, valgtDato, nyOpgave },
  });
  if (error || data?.fejl) return { ok: false, fejl: await readEdgeFunctionError(data, error, "Could not get an AI suggestion") };
  return { ok: true, tekst: data.tekst, forslag: data.forslag, generelKommentar: data.generelKommentar };
}
