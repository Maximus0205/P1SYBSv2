import React, { useEffect, useState } from "react";
import { Fingerprint, KeyRound, X, AlertCircle, Loader2 } from "lucide-react";
import { isBiometricSupported, enablePin, enableBiometric, markDeclined } from "../lib/deviceUnlock";

// ---------------------------------------------------------------------------
// TILBUD OM HURTIG OPLÅSNING (september 2026) - vises ÉN GANG, lige efter
// et helt almindeligt, gennemført login, hvis denne telefon endnu ikke har
// PIN/biometri sat op og ikke tidligere har fravalgt det (se App.jsx:
// styret af sessionStorage-flaget "p1_fresh_login", sat af LoginPage.jsx
// i selve login-øjeblikket, og lib/deviceUnlock.js: wasDeclined()).
//
// Rent tilvalg - "Nej tak" lukker skærmen og spørger ikke igen på denne
// telefon (markDeclined). Vælger brugeren senere, de VIL have det
// alligevel, er der intet sted i UI'et endnu til at slå det til
// efterfølgende - en fremtidig, mindre opgave, ikke bygget nu.
function DeviceUnlockPrompt({ profileName, onDone }) {
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [checkingBiometric, setCheckingBiometric] = useState(true);
  const [mode, setMode] = useState(null); // null | 'pin'
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isBiometricSupported().then((ok) => { setBiometricAvailable(ok); setCheckingBiometric(false); });
  }, []);

  const decline = () => { markDeclined(); onDone(); };

  const chooseBiometric = async () => {
    setError(""); setBusy(true);
    try {
      await enableBiometric(profileName);
      onDone();
    } catch (_) {
      setBusy(false);
      setError("Kunne ikke slå Face ID/fingeraftryk til på denne telefon. Prøv en kode i stedet.");
    }
  };

  const choosePin = () => { setError(""); setMode("pin"); };

  const confirmPin = async () => {
    if (pin.length < 4) { setError("Koden skal være mindst 4 cifre."); return; }
    if (pin !== pinConfirm) { setError("De to koder er ikke ens."); setPinConfirm(""); return; }
    setBusy(true);
    await enablePin(pin);
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/50 p-3" role="dialog" aria-modal="true" aria-label="Hurtig oplåsning">
      <div className="w-full sm:max-w-sm rounded-xl bg-white border border-line shadow-lg p-6">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h2 className="font-display text-2xl uppercase tracking-tight text-ink">Lås hurtigere op?</h2>
          <button onClick={decline} aria-label="Nej tak" className="w-9 h-9 -m-1 flex items-center justify-center rounded-lg text-muted hover:text-ink focus:outline-none focus:ring-2 focus:ring-brand shrink-0">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {mode === null ? (
          <>
            <p className="text-sm text-muted mb-5">
              Slip for at skrive brugernavn og adgangskode hver gang på DENNE telefon. Din rigtige adgangskode bruges stadig - dette er blot en hurtig, lokal genvej.
            </p>
            <div className="grid gap-2">
              {checkingBiometric ? (
                <p className="text-xs text-muted flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" aria-hidden="true" /> Tjekker telefonen...</p>
              ) : biometricAvailable ? (
                <button onClick={chooseBiometric} disabled={busy} className="w-full px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-brand hover:bg-ink transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                  <Fingerprint size={16} aria-hidden="true" /> Brug Face ID/fingeraftryk
                </button>
              ) : null}
              <button onClick={choosePin} disabled={busy} className="w-full px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-ink border border-line hover:border-brand transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                <KeyRound size={16} aria-hidden="true" /> Brug en kode (4+ cifre)
              </button>
            </div>
            {error && <p className="text-xs text-danger mt-3 flex items-center gap-1.5"><AlertCircle size={13} className="shrink-0" aria-hidden="true" /> {error}</p>}
            <button onClick={decline} className="w-full mt-4 text-[11px] text-muted hover:text-brand underline">Nej tak, spørg ikke igen på denne telefon</button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted mb-4">Vælg en kode på mindst 4 cifre - du skal bruge den til at låse appen op fremover på denne telefon.</p>
            <div className="grid gap-2 mb-3">
              <input
                type="password" inputMode="numeric" autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="Ny kode"
                aria-label="Ny kode"
                className="w-full rounded-lg border border-line bg-panel px-3 py-3 text-center text-xl tracking-[0.4em] text-ink focus:outline-none focus:border-brand"
              />
              <input
                type="password" inputMode="numeric"
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 8))}
                onKeyDown={(e) => e.key === "Enter" && confirmPin()}
                placeholder="Gentag koden"
                aria-label="Gentag koden"
                className="w-full rounded-lg border border-line bg-panel px-3 py-3 text-center text-xl tracking-[0.4em] text-ink focus:outline-none focus:border-brand"
              />
            </div>
            {error && <p className="text-xs text-danger mb-3 flex items-center gap-1.5"><AlertCircle size={13} className="shrink-0" aria-hidden="true" /> {error}</p>}
            <button onClick={confirmPin} disabled={busy || pin.length < 4} className="w-full px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors disabled:opacity-50">
              {busy ? "Gemmer..." : "Slå til"}
            </button>
            <button onClick={() => { setMode(null); setPin(""); setPinConfirm(""); setError(""); }} className="w-full mt-2 text-[11px] text-muted hover:text-brand underline">Tilbage</button>
          </>
        )}
      </div>
    </div>
  );
}

export { DeviceUnlockPrompt };
