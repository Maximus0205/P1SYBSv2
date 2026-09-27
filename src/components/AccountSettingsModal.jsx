import React, { useEffect, useState } from "react";
import { X, KeyRound, Check, AlertCircle, Loader2, Fingerprint, Info } from "lucide-react";
import { setLoginPin, registerBiometric } from "../lib/dataStore";
import { erBiometriTilgaengelig } from "../lib/webauthn";

const PIN_LAENGDE = 4;

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
// PIN-KODEN ER FAST 4 CIFRE (rettet september 2026) - ikke noget butikken
// sætter en "minimumslængde" for, det gav kun indtryk af, at "koden" kunne
// have to forskellige krav samtidig. Håndhæves server-side i
// set-login-pin (Edge Function).
//
// Begge dele skjules helt, hvis butikken har slået "simpelt login" fra
// (Admin -> Brugere) - se store.simpelLoginAktiveret.
function AccountSettingsModal({ store, onClose }) {
  const simpelLoginAktiveret = store?.simpelLoginAktiveret !== false;

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
    if (pin.length !== PIN_LAENGDE) { setError(`PIN-koden skal være præcis ${PIN_LAENGDE} cifre.`); return; }
    if (pin !== pinConfirm) { setError("De to koder er ikke ens."); setPinConfirm(""); return; }
    setSaving(true);
    const result = await setLoginPin(pin);
    setSaving(false);
    if (!result.ok) { setError(result.fejl || "Kunne ikke gemme PIN-koden."); return; }
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

        {!simpelLoginAktiveret ? (
          <p className="text-sm text-muted flex items-start gap-2">
            <Info size={15} className="text-brand shrink-0 mt-0.5" aria-hidden="true" />
            PIN-login og Face ID/fingeraftryk er slået fra for denne butik. Log ind med din almindelige adgangskode.
          </p>
        ) : (
          <>
            {!checkingBiometric && biometricAvailable && (
              <div className="mb-5 pb-5 border-b border-divider">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1.5 flex items-center gap-1.5"><Fingerprint size={15} className="text-brand" aria-hidden="true" /> Face ID/fingeraftryk</h3>
                <p className="text-xs text-muted mb-3">Log ind med telefonens egen Face ID eller fingeraftryk i stedet for adgangskode eller PIN.</p>
                <button
                  onClick={enableBiometric}
                  disabled={biometricBusy}
                  className="w-full px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-brand hover:bg-ink transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {biometricBusy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                  {biometricBusy ? "Venter på telefonen..." : "Slå til på denne enhed"}
                </button>
                {biometricError && <p className="text-xs text-danger mt-2 flex items-center gap-1.5"><AlertCircle size={13} className="shrink-0" aria-hidden="true" /> {biometricError}</p>}
                {biometricSaved && <p className="text-xs text-success mt-2 flex items-center gap-1.5"><Check size={13} className="shrink-0" aria-hidden="true" /> Slået til på denne enhed.</p>}
              </div>
            )}

            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1.5 flex items-center gap-1.5"><KeyRound size={15} className="text-brand" aria-hidden="true" /> PIN-login</h3>
            <p className="text-xs text-muted mb-3">
              Sæt en {PIN_LAENGDE}-cifret PIN-kode, så du kan logge ind hurtigere fremover - på denne eller enhver anden enhed. Din almindelige adgangskode virker stadig som hidtil.
            </p>
            <div className="grid gap-2 mb-3">
              <input
                type="password" inputMode="numeric" autoFocus={!biometricAvailable}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LAENGDE))}
                placeholder="Ny PIN-kode"
                aria-label="Ny PIN-kode"
                className="w-full rounded-lg border border-line bg-panel px-3 py-3 text-center text-xl tracking-[0.4em] text-ink focus:outline-none focus:border-brand"
              />
              <input
                type="password" inputMode="numeric"
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, PIN_LAENGDE))}
                onKeyDown={(e) => e.key === "Enter" && save()}
                placeholder="Gentag PIN-koden"
                aria-label="Gentag PIN-koden"
                className="w-full rounded-lg border border-line bg-panel px-3 py-3 text-center text-xl tracking-[0.4em] text-ink focus:outline-none focus:border-brand"
              />
            </div>
            {error && <p className="text-xs text-danger mb-3 flex items-center gap-1.5"><AlertCircle size={13} className="shrink-0" aria-hidden="true" /> {error}</p>}
            {saved && <p className="text-xs text-success mb-3 flex items-center gap-1.5"><Check size={13} className="shrink-0" aria-hidden="true" /> PIN-koden er gemt.</p>}
            <button
              onClick={save}
              disabled={saving || pin.length !== PIN_LAENGDE}
              className="w-full px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
              {saving ? "Gemmer..." : "Gem PIN-kode"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export { AccountSettingsModal };
