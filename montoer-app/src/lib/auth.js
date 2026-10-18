import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { supabase } from "./supabase";

const MIN_KODE = 4;
const BIO_FLAG = "p1sybs_montor_bio"; // ikke hemmelig: { butik, brugernavn }. Fortæller kun, at Face ID er slået til her.
const BIO_NOEGLE = "p1sybs_montor_login"; // hemmelig: { butik, brugernavn, pin } bag Face ID/fingeraftryk i Keychain/Keystore

async function laesFejl(data, error, standard) {
  if (data?.fejl) return data.fejl;
  if (error?.context && typeof error.context.json === "function") {
    try {
      const body = await error.context.clone().json();
      if (body?.fejl) return body.fejl;
    } catch { /* ikke JSON, brug standardteksten */ }
  }
  return error?.message || standard;
}

// Samme login som webappen: serveren tjekker koden og giver en engangskode, som indløses hos Supabase Auth.
export async function loginMedKode({ butik, brugernavn, pin, nyPin }) {
  const body = { butik: String(butik).trim(), brugernavn: String(brugernavn).trim(), pin };
  if (nyPin) body.nyPin = nyPin;
  const { data, error } = await supabase.functions.invoke("login-with-pin", { body });
  if (data?.skalSkiftePin) return { ok: false, skalSkiftePin: true, minLaengde: data.minLaengde, kraeverBlanding: data.kraeverBlanding === true };
  if (error || data?.fejl) return { ok: false, fejl: await laesFejl(data, error, "Forkert butik, bruger eller kode.") };
  const { error: otpFejl } = await supabase.auth.verifyOtp({ email: data.email, token: data.otp, type: "magiclink" });
  if (otpFejl) return { ok: false, fejl: "Koden var rigtig, men login kunne ikke gennemføres. Prøv igen." };
  return { ok: true };
}

export const minKodeLaengde = (krav) => Math.max(MIN_KODE, krav?.minLaengde || MIN_KODE);

// Appen er til dem, der kører: montør, medhjælper og andre, der er sat til at køre.
export function maaBrugeAppen(profil) {
  if (!profil) return false;
  if (profil.erSystemadmin) return false;
  return profil.rolle === "montor" || profil.rolle === "medhjaelper" || profil.kanKoere === true;
}

export async function hentProfil(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, role, vehicle_id, store_id, username, can_drive, is_system_admin")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id, navn: data.name, rolle: data.role, bilId: data.vehicle_id, butikId: data.store_id,
    brugernavn: data.username, kanKoere: !!data.can_drive, erSystemadmin: !!data.is_system_admin,
  };
}

export async function hentButik(butikId) {
  if (!butikId) return null;
  const { data, error } = await supabase.from("stores").select("id, name, store_number").eq("id", butikId).maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, navn: data.name, nummer: data.store_number } : null;
}

export const logUd = async () => {
  try { await supabase.auth.signOut(); } catch { /* lokal oprydning sker alligevel */ }
};

// ---------- Face ID / fingeraftryk ----------

export async function biometriInfo() {
  try {
    const harUdstyr = await LocalAuthentication.hasHardwareAsync();
    const erOpsat = harUdstyr && (await LocalAuthentication.isEnrolledAsync());
    if (!erOpsat) return { tilgaengelig: false, navn: "Face ID" };
    const typer = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const ansigt = typer.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    return { tilgaengelig: true, navn: ansigt ? "Face ID" : "fingeraftryk" };
  } catch {
    return { tilgaengelig: false, navn: "Face ID" };
  }
}

export async function laesBioFlag() {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(BIO_FLAG)) || "null");
    return v && v.butik && v.brugernavn ? v : null;
  } catch { return null; }
}

// Låser appen op med Face ID/fingeraftryk (eller telefonens kode, hvis den ikke kan bruge biometri).
export async function bekraeftMedBiometri(besked) {
  try {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: besked || "Lås op", cancelLabel: "Annuller", fallbackLabel: "Brug kode" });
    return r.success === true;
  } catch { return false; }
}

// Gemmer logindata bag biometri. Selve koden ligger kun i telefonens sikre lager og kan kun læses efter Face ID.
export async function slaaBiometriTil({ butik, brugernavn, pin }) {
  try {
    await SecureStore.setItemAsync(BIO_NOEGLE, JSON.stringify({ butik, brugernavn, pin }), {
      requireAuthentication: true,
      authenticationPrompt: "Bekræft for at slå Face ID til",
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    await AsyncStorage.setItem(BIO_FLAG, JSON.stringify({ butik, brugernavn }));
    return true;
  } catch {
    await slaaBiometriFra();
    return false;
  }
}

export async function slaaBiometriFra() {
  try { await SecureStore.deleteItemAsync(BIO_NOEGLE); } catch { /* ikke kritisk */ }
  try { await AsyncStorage.removeItem(BIO_FLAG); } catch { /* ikke kritisk */ }
}

// Henter logindata efter Face ID. status: "ok" | "annulleret" | "fejl"
export async function hentBiometriLogin() {
  try {
    const raa = await SecureStore.getItemAsync(BIO_NOEGLE, { requireAuthentication: true, authenticationPrompt: "Log ind" });
    if (!raa) return { status: "fejl" };
    const v = JSON.parse(raa);
    if (!v?.butik || !v?.brugernavn || !v?.pin) return { status: "fejl" };
    return { status: "ok", login: v };
  } catch (e) {
    const tekst = String(e?.message || e).toLowerCase();
    if (tekst.includes("cancel") || tekst.includes("user_cancel") || tekst.includes("authentication")) return { status: "annulleret" };
    return { status: "fejl" };
  }
}
