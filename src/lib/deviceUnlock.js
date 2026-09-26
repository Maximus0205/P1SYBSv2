// ---------------------------------------------------------------------------
// HURTIG OPLÅSNING PÅ DENNE TELEFON (september 2026)
//
// Rører IKKE selve login-systemet (Supabase Auth) og opretter ALDRIG en
// kortere adgangskode dér - det kan hverken appen eller Supabase selv på
// den administrerede platform, uanset hvad man sætter i dashboardet
// (bekræftet: Supabase Cloud håndhæver et hårdt minimum på 6 tegn, som
// ikke kan sættes lavere - kun muligt hvis man selv drifter Supabase på
// egen server).
//
// I stedet er dette et RENT LOKALT lag: efter et helt normalt login
// (brugernavn/e-mail + fulde adgangskode) kan brugeren vælge at "huske"
// netop DENNE telefon, så appen fremover kan låses op med enten en
// 4-cifret kode eller telefonens Face ID/fingeraftryk, uden at skulle
// skrive login-oplysningerne hver gang. Den rigtige Supabase-session
// ligger stadig bag den fulde adgangskode - PIN/biometri er kun en hurtig,
// lokal nøgle til at genåbne appen på netop den telefon.
//
// ÆRLIGT OM SIKKERHEDSNIVEAUET: dette beskytter mod, at nogen samler en
// LÅST/efterladt telefon op og åbner appen - IKKE mod en person med
// direkte adgang til telefonens udviklerværktøjer/lagerplads. Det er
// samme niveau, som de fleste apps' "hurtig-login"-funktioner tilbyder,
// ikke en erstatning for telefonens egen skærmlås. PIN'en gemmes ALDRIG i
// klartekst - kun et saltet PBKDF2-hash - og lukkes automatisk ned (kræver
// fuldt login igen) efter for mange forkerte forsøg, så en 4-cifret kode
// ikke reelt kan gættes igennem.
//
// Biometri bruger telefonens egen platform-autentificator via WebAuthn
// (navigator.credentials). Det er BEVIDST ikke fuld, server-verificeret
// WebAuthn-login (som ville kræve en Supabase-integration, der ikke
// findes for adgangskode-baseret login) - kun en lokal port: et
// succesfuldt biometrisk svar fra TELEFONEN ÅBNER porten, uden noget
// sendes over nettet. Til formålet "lås denne ene telefon hurtigt op
// igen" er det tilstrækkeligt og markant stærkere end en PIN alene.

const CONFIG_KEY = "p1_unlock_config";
const DECLINED_KEY = "p1_unlock_declined";
const FAIL_COUNT_KEY = "p1_unlock_fail_count";
const MAX_FAILED_ATTEMPTS = 5;
const PBKDF2_ITERATIONS = 100000;

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}
function base64ToBytes(b64) {
  const binary = atob(b64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function readConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}
function writeConfig(config) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch (_) {
    // Lagerplads fyldt/blokeret - funktionen falder tilbage til ikke at
    // være konfigureret, hvilket blot betyder normalt login fortsat kræves.
  }
}

const isUnlockConfigured = () => !!readConfig();
const getUnlockKind = () => readConfig()?.kind || null; // 'pin' | 'biometric' | 'begge'

const wasDeclined = () => localStorage.getItem(DECLINED_KEY) === "1";
const markDeclined = () => { try { localStorage.setItem(DECLINED_KEY, "1"); } catch (_) { /* se note ovenfor */ } };

// Findes der overhovedet et biometrisk platform-login på DENNE enhed
// (Face ID, fingeraftryk, Windows Hello e.l.)? Rent klientsidetjek - intet
// netværkskald.
async function isBiometricSupported() {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (_) {
    return false;
  }
}

async function deriveHash(pin, saltBytes) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, keyMaterial, 256);
  return bytesToBase64(new Uint8Array(bits));
}

// Slår PIN-koden til på denne telefon. pin: en streng af cifre, 4-8 lange
// (se DeviceUnlockPrompt.jsx for selve grænserne vist i UI'et).
async function enablePin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveHash(pin, salt);
  const existing = readConfig() || {};
  writeConfig({ ...existing, kind: existing.kind === "biometric" ? "begge" : "pin", pinSalt: bytesToBase64(salt), pinHash: hash });
  resetFailedAttempts();
}

async function verifyPin(pin) {
  const config = readConfig();
  if (!config?.pinHash || !config?.pinSalt) return false;
  const hash = await deriveHash(pin, base64ToBytes(config.pinSalt));
  return hash === config.pinHash;
}

// Slår biometri til på denne telefon. profileName bruges kun til at vise
// et genkendeligt navn i telefonens egen Face ID/fingeraftryk-prompt.
async function enableBiometric(profileName) {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Punkt1" },
      user: { id: userId, name: profileName || "montør", displayName: profileName || "Punkt1-bruger" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
      timeout: 60000,
    },
  });
  if (!credential) throw new Error("Kunne ikke oprette biometrisk login");
  const credentialId = bytesToBase64(new Uint8Array(credential.rawId));
  const existing = readConfig() || {};
  writeConfig({ ...existing, kind: existing.kind === "pin" ? "begge" : "biometric", biometricCredentialId: credentialId });
  resetFailedAttempts();
}

async function verifyBiometric() {
  const config = readConfig();
  if (!config?.biometricCredentialId) return false;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ type: "public-key", id: base64ToBytes(config.biometricCredentialId) }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch (_) {
    // Bruger annullerede, eller telefonen afviste (forkert finger/ansigt).
    return false;
  }
}

function getFailedAttempts() {
  return Number(localStorage.getItem(FAIL_COUNT_KEY) || "0");
}
function resetFailedAttempts() {
  try { localStorage.removeItem(FAIL_COUNT_KEY); } catch (_) { /* se note ved writeConfig */ }
}

// Tælles op ved hvert forkert PIN-forsøg (biometri har intet "forkert
// forsøg" at tælle - telefonens eget styresystem begrænser allerede
// biometriske gæt langt strengere end vi kan herfra). Rammes grænsen,
// ryddes HELE den lokale opsætning - en telefon der ikke kan låses op
// korrekt, skal tilbage til et helt normalt login, ikke blive ved med at
// tilbyde flere gæt på en 4-cifret kode.
function recordFailedPinAttempt() {
  const count = getFailedAttempts() + 1;
  if (count >= MAX_FAILED_ATTEMPTS) {
    clearUnlockConfig();
    return { count, lockedOut: true };
  }
  try { localStorage.setItem(FAIL_COUNT_KEY, String(count)); } catch (_) { /* se note ved writeConfig */ }
  return { count, lockedOut: false };
}

// Fjerner al lokal oplåsnings-opsætning fra denne telefon - brugt ved
// lockout, når brugeren selv slår det fra, og ved eksplicit log ud (så en
// efterfølgende bruger af samme fysiske enhed ikke tilbydes at låse op
// ind i en anden persons session).
function clearUnlockConfig() {
  try {
    localStorage.removeItem(CONFIG_KEY);
    localStorage.removeItem(FAIL_COUNT_KEY);
  } catch (_) { /* se note ved writeConfig */ }
}

export {
  isUnlockConfigured, getUnlockKind, wasDeclined, markDeclined,
  isBiometricSupported, enablePin, verifyPin, enableBiometric, verifyBiometric,
  getFailedAttempts, resetFailedAttempts, recordFailedPinAttempt, clearUnlockConfig,
  MAX_FAILED_ATTEMPTS,
};
