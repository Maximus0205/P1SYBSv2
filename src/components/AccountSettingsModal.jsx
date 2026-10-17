import React, { useEffect, useState } from "react";
import { X, KeyRound, Check, AlertCircle, Loader2, Fingerprint } from "lucide-react";
import { setLoginPin, registerBiometric } from "../lib/dataStore";
import { erBiometriTilgaengelig } from "../lib/webauthn";

const ABSOLUT_MIN = 4;
const MAX_LAENGDE = 64;

// ---------------------------------------------------------------------------
// KONTOINDSTILLINGER (september 2026, rettet) - PIN-opsætning + biometrisk
// login. Åbnes fra TopNav (ikonet ved siden af log ud). Selvbetjening: en
// bruger sætter selv sin PIN/Face ID/fingeraftryk op her, mens de allerede
// er logget ind normalt - se LoginPage.jsx for selve login-vejene, og
// lib/dataStore.js: setLoginPin/registerBiometric.
//
// BEGGE ER RIGTIGE, KONTO-BUNDNE LOGIN-METODER (ikke en lokal "lås denne
// telefon op"-genvej) - en PIN eller et Face ID sat op her virker derfor
// også som login på en ANDEN enhed, hvis den understøtter samme biometri
// (eller for PIN'en: overalt, den er jo bare en kode).
//
// KODEKRAV: butikkens admin bestemmer minimumslængde (aldrig under 4 tegn) og om
// koden skal have både bogstaver og tal (Admin -> Login-krav). Kravet vises her og
// håndhæves server-side i set-login-pin (Edge Function).
//
// PIN-skift er altid tilgængeligt. Face ID/fingeraftryk skjules, hvis butikken har
// slået det fra (Admin -> Brugere) - se store.simpelLoginAktiveret.
function AccountSettingsModal({ store, onClose }) {
  const simpelLoginAktiveret = store?.simpelLoginAktiveret !== false;
  const minLaengde = Math.max(ABSOLUT_MIN, store?.adgangskodeMinLaengde || ABSOLUT_MIN);
  const kraeverBlanding = store?.adgangskodeKraeverBlanding === true;
  const kravTekst = `Mindst ${minLaengde} tegn${kraeverBlanding ? ", både bogstaver og tal" : ""}.`;

  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [checkingBiometric, setCheckingBiometric] = useState(true);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricError, setBiometricError] = useState("");
  const [biometricSaved, setBiometricSaved] = useState(false);

  useEffect(() => {
    if (!simpelLoginAktiveret) { setCheckingBiometric(false); return; }
    erBiometriTilgaengelig().then((ok) => { setBiometricAvailable(ok); setCheckingBiometric(false); });
  }, [simpelLoginAktiveret]);

  const save = async () => {
    setError(""); setSaved(false);
    if (pin.length < minLaengde) { setError(`Koden er for kort. ${kravTekst}`); return; }
    if (kraeverBlanding && !(/\p{L}/u.test(pin) && /\d/.test(pin))) { setError("Koden skal indeholde både bogstaver og tal."); return; }
    if (pin !== pinConfirm) { setError("De to koder er ikke ens."); setPinConfirm(""); return; }
    setSaving(true);
    const result = await setLoginPin(pin);
    setSaving(false);
    if (!result.ok) { setError(result.fejl || "Kunne ikke gemme koden."); return; }
    setSaved(true);
    setPin(""); setPinConfirm("");
    setTimeout(() => setSaved(false), 2000);
  };

  const enableBiometric = async () => {
    setBiometricError(""); setBiometricSaved(false); setBiometricBusy(true);
    const result = await registerBiometric(navigator.userAgentData?.platform || navigator.platform || "");
    setBiometricBusy(false);
    if (!result.ok) { setBiometricError(result.fejl || "Kunne ikke slå det til."); return; }
    setBiometricSaved(true);
    setTimeout(() => setBiometricSaved(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/50 p-3" role="dialog" aria-modal="true" aria-label="Kontoindstillinger">
      <div className="w-full sm:max-w-sm rounded-xl bg-white border border-line shadow-lg p-6">
        <div className="flex items-start justify-between gap-2 mb-4">
          <h2 className="font-display text-2xl uppercase tracking-tight text-ink">Din konto</h2>
          <button onClick={onClose} aria-label="Luk" className="w-9 h-9 -m-1 flex items-center justify-center rounded-lg text-muted hover:text-ink focus:outline-none focus:ring-2 focus:ring-brand shrink-0">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {
          <>
            {simpelLoginAktiveret && !checkingBiometric && biometricAvailable && (
              <div className="mb-5 pb-5 border-b border-divider">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1.5 flex items-center gap-1.5"><Fingerprint size={15} className="text-brand" aria-hidden="true" /> Face ID/fingeraftryk</h3>
                <p className="text-xs text-muted mb-3">Log ind med telefonens egen Face ID eller fingeraftryk i stedet for at taste PIN. Du skal stadig skrive butiksnummer og brugernavn.</p>
                <button
                  onClick={enableBiometric}
                  disabled={biometricBusy}
                  className="w-full px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-brand hover:bg-brand-dark transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {biometricBusy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                  {biometricBusy ? "Venter på telefonen..." : "Slå til på denne enhed"}
                </button>
                {biometricError && <p className="text-xs text-danger mt-2 flex items-center gap-1.5"><AlertCircle size={13} className="shrink-0" aria-hidden="true" /> {biometricError}</p>}
                {biometricSaved && <p className="text-xs text-success mt-2 flex items-center gap-1.5"><Check size={13} className="shrink-0" aria-hidden="true" /> Slået til på denne enhed.</p>}
              </div>
            )}

            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1.5 flex items-center gap-1.5"><KeyRound size={15} className="text-brand" aria-hidden="true" /> Skift kode</h3>
            <p className="text-xs text-muted mb-3">
              Vælg en ny kode. {kravTekst} Du bruger den sammen med butiksnummer og brugernavn (initialer) til at logge ind på alle dine enheder. Undgå lette koder som 1234 eller aaaa.
            </p>
            <div className="grid gap-2 mb-3">
              <input
                type="password" inputMode="text" autoComplete="new-password" autoCapitalize="off" autoCorrect="off" spellCheck={false} maxLength={MAX_LAENGDE} autoFocus={!biometricAvailable}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\s/g, "").slice(0, MAX_LAENGDE))}
                placeholder="Ny kode"
                aria-label="Ny kode"
                className="w-full rounded-lg border border-line bg-panel px-3 py-3 text-center text-xl tracking-[0.2em] text-ink focus:outline-none focus:border-brand"
              />
              <input
                type="password" inputMode="text" autoComplete="new-password" autoCapitalize="off" autoCorrect="off" spellCheck={false} maxLength={MAX_LAENGDE}
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\s/g, "").slice(0, MAX_LAENGDE))}
                onKeyDown={(e) => e.key === "Enter" && save()}
                placeholder="Gentag koden"
                aria-label="Gentag koden"
                className="w-full rounded-lg border border-line bg-panel px-3 py-3 text-center text-xl tracking-[0.2em] text-ink focus:outline-none focus:border-brand"
              />
            </div>
            {error && <p className="text-xs text-danger mb-3 flex items-center gap-1.5"><AlertCircle size={13} className="shrink-0" aria-hidden="true" /> {error}</p>}
            {saved && <p className="text-xs text-success mb-3 flex items-center gap-1.5"><Check size={13} className="shrink-0" aria-hidden="true" /> Koden er gemt.</p>}
            <button
              onClick={save}
              disabled={saving || pin.length < minLaengde}
              className="w-full px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-brand hover:bg-brand-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
              {saving ? "Gemmer..." : "Gem kode"}
            </button>
          </>
        }
      </div>
    </div>
  );
}

export { AccountSettingsModal };
