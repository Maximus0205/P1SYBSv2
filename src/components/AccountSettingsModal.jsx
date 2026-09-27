import React, { useState } from "react";
import { X, KeyRound, Check, AlertCircle, Loader2 } from "lucide-react";
import { setLoginPin } from "../lib/dataStore";

// ---------------------------------------------------------------------------
// KONTOINDSTILLINGER (september 2026) - foreløbig kun PIN-opsætning.
// Åbnes fra TopNav (ikonet ved siden af log ud). Selvbetjening: en bruger
// sætter sin egen PIN her, mens de allerede er logget ind normalt - se
// LoginPage.jsx for selve PIN-login-vejen, og lib/dataStore.js: setLoginPin.
//
// minLength/kraeverBlanding er IKKE relevante her (kun til
// adgangskoder, se PasswordPolicySetting) - PIN'en har sin egen,
// separate politik (store.pinMinLaengde), sat i Admin -> Brugere.
function AccountSettingsModal({ store, onClose }) {
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const minLength = store?.pinMinLaengde ?? 4;

  const save = async () => {
    setError(""); setSaved(false);
    if (pin.length < minLength) { setError(`PIN-koden skal være mindst ${minLength} cifre.`); return; }
    if (pin !== pinConfirm) { setError("De to koder er ikke ens."); setPinConfirm(""); return; }
    setSaving(true);
    const result = await setLoginPin(pin);
    setSaving(false);
    if (!result.ok) { setError(result.fejl || "Kunne ikke gemme PIN-koden."); return; }
    setSaved(true);
    setPin(""); setPinConfirm("");
    setTimeout(() => setSaved(false), 2000);
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

        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1.5 flex items-center gap-1.5"><KeyRound size={15} className="text-brand" aria-hidden="true" /> PIN-login</h3>
        <p className="text-xs text-muted mb-3">
          Sæt en PIN-kode (mindst {minLength} cifre), så du kan logge ind hurtigere fremover - på denne eller enhver anden enhed. Din almindelige adgangskode virker stadig som hidtil.
        </p>
        <div className="grid gap-2 mb-3">
          <input
            type="password" inputMode="numeric" autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 12))}
            placeholder="Ny PIN-kode"
            aria-label="Ny PIN-kode"
            className="w-full rounded-lg border border-line bg-panel px-3 py-3 text-center text-xl tracking-[0.4em] text-ink focus:outline-none focus:border-brand"
          />
          <input
            type="password" inputMode="numeric"
            value={pinConfirm}
            onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 12))}
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
          disabled={saving || pin.length < minLength}
          className="w-full px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
          {saving ? "Gemmer..." : "Gem PIN-kode"}
        </button>
      </div>
    </div>
  );
}

export { AccountSettingsModal };
