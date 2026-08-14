import React, { useEffect, useRef, useState } from "react";
import { Check, AlertTriangle, Loader2, MapPin } from "lucide-react";
import { searchAddressSuggestions, validateAddress, hasOrsKey } from "../lib/geocoding";

const DEBOUNCE_MS = 350;

// Adressefelt med:
//  - dropdown af forslag mens man skriver (autocomplete mod openrouteservice)
//  - validering af den endelige adresse mod korttjenesten, så tastefejl og
//    ikke-eksisterende adresser bliver fanget, før sagen oprettes
//
// Uden en ORS-nøgle opfører feltet sig som et helt almindeligt tekstfelt —
// ingen dropdown, ingen valideringsikon, ingen fejl.
function AddressInput({ value, onChange, placeholder, onValidationChange, focus }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [status, setStatus] = useState("tom"); // tom | tjekker | gyldig | usikker
  const selectedRef = useRef(false); // sidste ændring kom fra klik på et forslag (springer så re-validering over)
  const blurTimerRef = useRef(null);

  useEffect(() => {
    if (!hasOrsKey()) return;
    if (!value || value.trim().length < 4) {
      setStatus("tom");
      setSuggestions([]);
      onValidationChange?.("tom");
      return;
    }
    if (selectedRef.current) {
      selectedRef.current = false;
      return;
    }

    let cancelled = false;
    setStatus("tjekker");

    const timer = setTimeout(async () => {
      const [list, validation] = await Promise.all([searchAddressSuggestions(value, focus), validateAddress(value, focus)]);
      if (cancelled) return;
      setSuggestions(list);
      // Så snart der kommer nye forslag mens brugeren stadig sidder i
      // feltet, skal listen vises igen - selv hvis den lige var skjult af
      // en forsinket blur (se onBlur/onFocus nedenfor).
      if (list.length > 0) setShowSuggestions(true);
      const newStatus = validation.gyldig ? "gyldig" : "usikker";
      setStatus(newStatus);
      onValidationChange?.(newStatus);
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const selectSuggestion = (f) => {
    selectedRef.current = true;
    onChange(f.label);
    setSuggestions([]);
    setShowSuggestions(false);
    setStatus("gyldig");
    onValidationChange?.("gyldig");
  };

  if (!hasOrsKey()) {
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
      />
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            // VIGTIGT: en tidligere "skjul om 150ms"-timer fra en kortvarig
            // blur (se onBlur) skal annulleres her. Ellers kunne brugeren
            // fokusere feltet igen og skrive videre, men listen forsvandt
            // alligevel når den gamle timer til sidst udløb - det så ud
            // som om adresseforslag "holdt op med at virke" efter man
            // havde slettet og skrevet videre.
            if (blurTimerRef.current) { clearTimeout(blurTimerRef.current); blurTimerRef.current = null; }
            setShowSuggestions(true);
          }}
          onBlur={() => {
            // lille forsinkelse så et klik på et forslag når at blive registreret først
            blurTimerRef.current = setTimeout(() => setShowSuggestions(false), 150);
          }}
          placeholder={placeholder}
          className="w-full rounded-lg border border-line bg-panel pl-3 pr-8 py-2 text-sm text-ink focus:outline-none focus:border-brand"
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
          {status === "tjekker" && <Loader2 size={14} className="animate-spin text-muted" />}
          {status === "gyldig" && <Check size={14} className="text-success" />}
          {status === "usikker" && <AlertTriangle size={14} className="text-danger" />}
        </span>
      </div>

      {status === "usikker" && (
        <p className="text-[11px] text-danger mt-1 flex items-center gap-1">
          <AlertTriangle size={11} /> Adressen kunne ikke bekræftes — tjek for tastefejl, eller vælg et forslag herunder.
        </p>
      )}

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl bg-white border border-line shadow-lg max-h-64 overflow-auto">
          {suggestions.map((f, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectSuggestion(f)}
              className="w-full text-left px-3 py-2.5 hover:bg-panel flex items-start gap-2.5 border-b border-divider last:border-b-0"
            >
              <MapPin size={15} className="text-muted shrink-0 mt-0.5" />
              <span className="min-w-0">
                <span className="block text-sm text-ink font-medium truncate">{f.hovedtekst || f.label}</span>
                {f.undertekst && <span className="block text-xs text-muted truncate">{f.undertekst}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { AddressInput };
