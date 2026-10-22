// BRANDING - hentning fra Supabase og anvendelse i browseren.
// Rene regler (sammenfletning, validering) ligger i brandingCore.js.
//
// Databasen er kilden til sandhed. localStorage bruges KUN som cache pr.
// domæne, så login-siden kan vise det rigtige logo/farver med det samme i
// stedet for at blinke med standardudseendet, mens opslaget kører.

import { supabase } from "./supabaseClient";
import { COLOR_KEYS, DEFAULT_BRANDING, hexToRgbChannels, resolveBranding, sanitizeResolved } from "./brandingCore";

export const BRANDING_BUCKET = "branding";
const CACHE_KEY = "branding:v1";

export function logoUrl(path) {
  if (!path) return null;
  return supabase.storage.from(BRANDING_BUCKET).getPublicUrl(path).data?.publicUrl || null;
}

// Sætter CSS-variablerne, som tailwind.config.js' farver (brand, ink,
// paper) læser fra.
export function applyBrandingColors(colors) {
  const root = document.documentElement;
  for (const key of COLOR_KEYS) {
    const channels = hexToRgbChannels(colors?.[key]);
    const cssVar = `--color-${key.replace("_", "-")}`;
    if (channels) root.style.setProperty(cssVar, channels);
    else root.style.removeProperty(cssVar);
  }
}

export function readCachedBranding() {
  try {
    return sanitizeResolved(JSON.parse(localStorage.getItem(CACHE_KEY) || "null")) || DEFAULT_BRANDING;
  } catch {
    return DEFAULT_BRANDING;
  }
}

export function writeCachedBranding(resolved) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(resolved)); } catch { /* fx privat browsing - cachen er kun en bekvemmelighed */ }
}

// Før login: kædens branding ud fra det domæne, systemet er åbnet på.
// Returnerer null ved fejl (fx netværk), så kalderen kan beholde det, den har.
export async function fetchHostBranding(hostname) {
  const { data, error } = await supabase.rpc("public_branding_for_host", { p_host: hostname });
  if (error) return null;
  return resolveBranding(data, null);
}

// Efter login: kædens + butikkens branding for den viste butik.
export async function fetchStoreBranding(storeId) {
  const { data, error } = await supabase.rpc("branding_for_store", { p_store_id: storeId });
  if (error || !data) return null;
  return resolveBranding(data.organization, data.store);
}

// ---------------------------------------------------------------------------
// Systemadmin: kæder, domæner, butikkens kæde/branding og logo-filer.
// Alt håndhæves af RLS (kun systemadmin) - se migrationen.

export async function getOrganizations() {
  const [orgs, domains] = await Promise.all([
    supabase.from("organizations").select("id, name, branding, created_at, updated_at").order("name"),
    supabase.from("organization_domains").select("hostname, organization_id").order("hostname"),
  ]);
  if (orgs.error) return { ok: false, fejl: orgs.error.message, data: [] };
  const byOrg = new Map();
  for (const d of domains.data || []) {
    if (!byOrg.has(d.organization_id)) byOrg.set(d.organization_id, []);
    byOrg.get(d.organization_id).push(d.hostname);
  }
  return { ok: true, data: orgs.data.map((o) => ({ ...o, domains: byOrg.get(o.id) || [] })) };
}

export async function getStoresBranding() {
  const { data, error } = await supabase.from("stores").select("id, name, organization_id, branding").order("name");
  if (error) return { ok: false, fejl: error.message, data: [] };
  return { ok: true, data };
}

export async function createOrganization(name) {
  const { data, error } = await supabase.from("organizations").insert({ name: name.trim() }).select("id").single();
  return error ? { ok: false, fejl: error.message } : { ok: true, id: data.id };
}

export async function updateOrganization(id, { name, branding }) {
  const fields = { updated_at: new Date().toISOString() };
  if (name !== undefined) fields.name = name.trim();
  if (branding !== undefined) fields.branding = branding;
  const { error } = await supabase.from("organizations").update(fields).eq("id", id);
  return error ? { ok: false, fejl: error.message } : { ok: true };
}

export async function deleteOrganization(id) {
  const { error } = await supabase.from("organizations").delete().eq("id", id);
  return error ? { ok: false, fejl: error.message } : { ok: true };
}

export async function addOrganizationDomain(organizationId, hostname) {
  const { error } = await supabase.from("organization_domains").insert({ hostname, organization_id: organizationId });
  if (error?.code === "23505") return { ok: false, fejl: "Domænet er allerede koblet til en kæde." };
  return error ? { ok: false, fejl: error.message } : { ok: true };
}

export async function removeOrganizationDomain(hostname) {
  const { error } = await supabase.from("organization_domains").delete().eq("hostname", hostname);
  return error ? { ok: false, fejl: error.message } : { ok: true };
}

export async function updateStoreBranding(storeId, { organizationId, branding }) {
  const fields = {};
  if (organizationId !== undefined) fields.organization_id = organizationId;
  if (branding !== undefined) fields.branding = branding;
  const { error } = await supabase.from("stores").update(fields).eq("id", storeId);
  return error ? { ok: false, fejl: error.message } : { ok: true };
}

const MAX_LOGO_BYTES = 1024 * 1024;
const LOGO_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

// Uploader et logo under org/<id>/ eller store/<id>/. Unikt filnavn, så
// browsere/CDN aldrig viser en gammel cachet udgave efter en udskiftning.
export async function uploadLogo(scope, ownerId, variant, file) {
  const ext = LOGO_TYPES[file?.type];
  if (!ext) return { ok: false, fejl: "Logoet skal være PNG, JPG eller WebP." };
  if (file.size > MAX_LOGO_BYTES) return { ok: false, fejl: "Logoet må højst fylde 1 MB." };
  const path = `${scope}/${ownerId}/logo-${variant}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BRANDING_BUCKET).upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  return error ? { ok: false, fejl: error.message } : { ok: true, path };
}

// Oprydning efter udskiftning/fjernelse. Fejl her er ikke kritiske (en
// forældreløs fil skader ikke), så de rapporteres blot til kalderen.
export async function deleteLogoFile(path) {
  if (!path) return { ok: true };
  const { error } = await supabase.storage.from(BRANDING_BUCKET).remove([path]);
  return error ? { ok: false, fejl: error.message } : { ok: true };
}
