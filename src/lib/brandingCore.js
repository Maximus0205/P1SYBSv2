// BRANDING - rene hjælpefunktioner (ingen Supabase/DOM), så de kan testes
// direkte med node (tests/branding.test.mjs). Se src/lib/branding.js for
// hentning/anvendelse og migrationen organizations_and_branding for
// datamodellen.
//
// To lag: KÆDENS branding (organizations.branding) og BUTIKKENS egen
// (stores.branding), hvor butikkens felter vinder. Logoerne behandles som
// et PAR: har butikken sat blot ét af sine logoer, bruges butikkens par -
// ellers kunne topbaren vise kædens logo og login-siden butikkens.

// Systemets egne standardfarver, når hverken kæde eller butik har valgt
// andet. Skal matche :root i src/index.css.
export const DEFAULT_COLORS = Object.freeze({
  brand: "#C8232E",
  brand_dark: "#A61B24",
  ink: "#1A1A1A",
  paper: "#F2F2F2",
});

export const COLOR_KEYS = Object.keys(DEFAULT_COLORS);

// Navn vist i stedet for et logo, når intet logo er sat (eller det ikke
// kan indlæses). Bevidst neutralt - kundens navn kommer fra databasen.
export const FALLBACK_NAME = "P1SYBS";

export function isHexColor(value) {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value);
}

// "#C8232E" -> "200 35 46" (formatet Tailwinds rgb(var(--x) / <alpha>) kræver).
export function hexToRgbChannels(hex) {
  if (!isHexColor(hex)) return null;
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

function cleanColors(colors) {
  const out = {};
  if (!colors || typeof colors !== "object") return out;
  for (const key of COLOR_KEYS) if (isHexColor(colors[key])) out[key] = colors[key];
  return out;
}

function hasLogo(b) {
  return !!(b && (b.logo_light || b.logo_dark));
}

// org/store: { name, branding } eller null (formen fra RPC'erne).
// Returnerer den effektive branding, klar til visning.
export function resolveBranding(org, store) {
  const ob = org?.branding || {};
  const sb = store?.branding || {};
  const logos = hasLogo(sb) ? sb : ob;
  return {
    displayName: sb.display_name || ob.display_name || org?.name || store?.name || FALLBACK_NAME,
    logoLight: logos.logo_light || null,
    logoDark: logos.logo_dark || null,
    colors: { ...DEFAULT_COLORS, ...cleanColors(ob.colors), ...cleanColors(sb.colors) },
  };
}

export const DEFAULT_BRANDING = Object.freeze(resolveBranding(null, null));

// Robust mod hvad som helst fra localStorage-cachen.
export function sanitizeResolved(value) {
  if (!value || typeof value !== "object") return null;
  const path = (p) => (typeof p === "string" && /^(org|store)\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,100}$/.test(p) ? p : null);
  return {
    displayName: typeof value.displayName === "string" && value.displayName.trim() ? value.displayName.slice(0, 80) : FALLBACK_NAME,
    logoLight: path(value.logoLight),
    logoDark: path(value.logoDark),
    colors: { ...DEFAULT_COLORS, ...cleanColors(value.colors) },
  };
}

// Normaliserer et indtastet domæne ("https://Bjerg.dk/login" -> "bjerg.dk").
// Returnerer null, hvis det ikke ligner et gyldigt værtsnavn.
export function normalizeHostname(input) {
  if (typeof input !== "string") return null;
  let h = input.trim().toLowerCase();
  h = h.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0].split(":")[0].replace(/\.$/, "");
  if (!h || h.length > 253) return null;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(h) ? h : null;
}
