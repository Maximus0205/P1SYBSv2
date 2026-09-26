import React, { useEffect, useState } from "react";
import { Lock, Fingerprint, AlertCircle, LogOut } from "lucide-react";
import { getUnlockKind, verifyPin, verifyBiometric, recordFailedPinAttempt, resetFailedAttempts, clearUnlockConfig, MAX_FAILED_ATTEMPTS } from "../lib/deviceUnlock";
import PUNKT1_LOGO_POSITIV from "../assets/punkt1_positiv.png";

// ---------------------------------------------------------------------------
// LÅSESKÆRM (september 2026) - vises i stedet for appen, når denne telefon
// har hurtig oplåsning konfigureret (se lib/deviceUnlock.js) og appen lige
// er åbnet/genindlæst. Den EKSISTERENDE Supabase-session ligger stadig
// intakt i baggrunden - denne skærm låser kun selve VISNINGEN af appen op,
// den logger ikke ind på ny.
//
// "Log ind med adgangskode i stedet" (nederst) er bevidst ALTID til stede:
// glemmer man PIN-koden, eller virker biometrien ikke, skal man aldrig stå
// fastlåst uden en vej videre - den rydder blot den lokale opsætning og
// falder tilbage til et helt normalt login.
function DeviceLockScreen({ userName, onUnlock, onFallbackToLogin }) {
  const kind = getUnlockKind(); // 'pin' | 'biometric' | 'begge'
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [biometricTried, setBiometricTried] = useState(false);

  const tryBiometric = async () => {
    setError(""); setBusy(true);
    const ok = await verifyBiometric();
    setBusy(false);
    setBiometricTried(true);
    if (ok) { resetFailedAttempts(); onUnlock(); }
    else setError("Biometrisk login lykkedes ikke. Prøv igen, eller brug din kode.");
  };

  // Biometri forsøges automatisk med det samme, hvis det er den ENESTE
  // metode konfigureret - så man som regel aldrig behøver at trykke noget
  // ekstra for at komme videre. Er BÅDE PIN og biometri slået til, venter
  // vi på et bevidst tryk, så PIN-feltet ikke konkurrerer med en
  // uventet Face ID-prompt, der popper op af sig selv.
  useEffect(() => {
    if (kind === "biometric" && !biometricTried) tryBiometric();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const submitPin = async () => {
    if (pin.length < 4) return;
    setError(""); setBusy(true);
    const ok = await verifyPin(pin);
    setBusy(false);
    if (ok) { resetFailedAttempts(); onUnlock(); return; }
    const { count, lockedOut } = recordFailedPinAttempt();
    setPin("");
    if (lockedOut) {
      setError("For mange forkerte forsøg - hurtig oplåsning er slået fra på denne telefon. Log ind med din adgangskode.");
      setTimeout(onFallbackToLogin, 2000);
    } else {
      setError(`Forkert kode (${count}/${MAX_FAILED_ATTEMPTS} forsøg).`);
    }
  };

  const fallback = () => { clearUnlockConfig(); onFallbackToLogin(); };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-6 shadow-sm text-center">
        <img src={PUNKT1_LOGO_POSITIV} alt="Punkt1" className="h-9 w-auto mx-auto mb-6" width={180} height={36} />
        <Lock size={28} className="text-brand mx-auto mb-3" aria-hidden="true" />
        <h1 className="font-display text-2xl uppercase tracking-tight text-ink mb-1">Låst</h1>
        <p className="text-sm text-muted mb-6">{userName ? `Velkommen tilbage, ${userName}` : "Lås appen op for at fortsætte"}</p>

        {(kind === "biometric" || kind === "begge") && (
          <button
            onClick={tryBiometric}
            disabled={busy}
            className="w-full mb-4 px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-brand hover:bg-ink transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <Fingerprint size={16} aria-hidden="true" /> Lås op med Face ID/fingeraftryk
          </button>
        )}

        {(kind === "pin" || kind === "begge") && (
          <div className="grid gap-2 mb-4">
            <input
              type="password"
              inputMode="numeric"
              autoFocus={kind === "pin"}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              onKeyDown={(e) => e.key === "Enter" && submitPin()}
              placeholder="Din kode"
              aria-label="Din oplåsningskode"
              className="w-full rounded-lg border border-line bg-paper px-3 py-3 text-center text-2xl tracking-[0.5em] text-ink focus:outline-none focus:border-brand"
            />
            <button
              onClick={submitPin}
              disabled={busy || pin.length < 4}
              className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors disabled:opacity-50"
            >
              Lås op
            </button>
          </div>
        )}

        {error && <p className="text-sm text-danger mb-3 flex items-center gap-1.5 text-left"><AlertCircle size={14} className="shrink-0" aria-hidden="true" /> {error}</p>}

        <button onClick={fallback} className="w-full mt-2 text-[11px] text-muted hover:text-brand underline flex items-center justify-center gap-1.5">
          <LogOut size={11} aria-hidden="true" /> Log ind med adgangskode i stedet
        </button>
      </div>
    </div>
  );
}

export { DeviceLockScreen };
