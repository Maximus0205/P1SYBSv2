// ---------------------------------------------------------------------------
// BIOMETRISK LOGIN - browser-siden (september 2026)
//
// Ren omsætning mellem WebAuthn-browser-API'ets rå bytes (ArrayBuffer) og
// den base64url-tekst, serveren (Edge Functions, se lib/dataStore.js) og
// @simplewebauthn/server forventer - samme JSON-form, som WebAuthn-
// standarden selv definerer for "PublicKeyCredential i JSON". Al reel
// KRYPTOGRAFISK verificering sker udelukkende server-side (se
// webauthn-register-verify/webauthn-login-verify) - denne fil laver ikke
// selv nogen sikkerhedsvurdering, kun formatkonvertering.
function b64urlTilBuffer(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
function bufferTilB64url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Findes der overhovedet et biometrisk platform-login (Face ID,
// fingeraftryk, Windows Hello e.l.) på DENNE enhed? Rent klientsidetjek.
async function erBiometriTilgaengelig() {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (_) {
    return false;
  }
}

// Omsætter serverens registrerings-parametre (base64url-tekst) til de rå
// bytes, navigator.credentials.create() kræver.
function optionsTilCreateInput(options) {
  return {
    ...options,
    challenge: b64urlTilBuffer(options.challenge),
    user: { ...options.user, id: b64urlTilBuffer(options.user.id) },
    excludeCredentials: (options.excludeCredentials || []).map((c) => ({ ...c, id: b64urlTilBuffer(c.id) })),
  };
}

// Omsætter browserens svar (rå bytes) til den JSON-form, serveren forventer.
function credentialTilJSON(credential) {
  const response = credential.response;
  return {
    id: credential.id,
    rawId: bufferTilB64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferTilB64url(response.clientDataJSON),
      attestationObject: bufferTilB64url(response.attestationObject),
      transports: response.getTransports ? response.getTransports() : undefined,
    },
    clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {},
  };
}

function optionsTilGetInput(options) {
  return {
    ...options,
    challenge: b64urlTilBuffer(options.challenge),
    allowCredentials: (options.allowCredentials || []).map((c) => ({ ...c, id: b64urlTilBuffer(c.id) })),
  };
}

function assertionTilJSON(credential) {
  const response = credential.response;
  return {
    id: credential.id,
    rawId: bufferTilB64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferTilB64url(response.clientDataJSON),
      authenticatorData: bufferTilB64url(response.authenticatorData),
      signature: bufferTilB64url(response.signature),
      userHandle: response.userHandle ? bufferTilB64url(response.userHandle) : undefined,
    },
    clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {},
  };
}

// Beder telefonen om Face ID/fingeraftryk og returnerer resultatet klar til
// at sende videre til serveren - kaster en fejl, hvis brugeren annullerer,
// eller telefonen afviser (forkert ansigt/finger).
async function opretBiometriskSvar(options) {
  const credential = await navigator.credentials.create({ publicKey: optionsTilCreateInput(options) });
  if (!credential) throw new Error("Kunne ikke oprette biometrisk login");
  return credentialTilJSON(credential);
}

async function bekraeftBiometriskSvar(options) {
  const credential = await navigator.credentials.get({ publicKey: optionsTilGetInput(options) });
  if (!credential) throw new Error("Biometrisk login blev annulleret");
  return assertionTilJSON(credential);
}

export { erBiometriTilgaengelig, opretBiometriskSvar, bekraeftBiometriskSvar };
