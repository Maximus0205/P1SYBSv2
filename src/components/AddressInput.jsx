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
        className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]"
      />
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => {
            // lille forsinkelse så et klik på et forslag når at blive registreret først
            blurTimerRef.current = setTimeout(() => setShowSuggestions(false), 150);
          }}
          placeholder={placeholder}
          className="w-full border border-[#D8D0BE] bg-[#F3EFE6] pl-3 pr-8 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]"
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
          {status === "tjekker" && <Loader2 size={14} className="animate-spin text-[#52697E]" />}
          {status === "gyldig" && <Check size={14} className="text-[#3D7A5C]" />}
          {status === "usikker" && <AlertTriangle size={14} className="text-[#B3261E]" />}
        </span>
      </div>

      {status === "usikker" && (
        <p className="text-[11px] text-[#B3261E] mt-1 flex items-center gap-1">
          <AlertTriangle size={11} /> Adressen kunne ikke bekræftes — tjek for tastefejl, eller vælg et forslag herunder.
        </p>
      )}

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[#D8D0BE] shadow-lg max-h-64 overflow-auto">
          {suggestions.map((f, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectSuggestion(f)}
              className="w-full text-left px-3 py-2.5 hover:bg-[#F3EFE6] flex items-start gap-2.5 border-b border-[#D8D0BE] last:border-b-0"
            >
              <MapPin size={15} className="text-[#52697E] shrink-0 mt-0.5" />
              <span className="min-w-0">
                <span className="block text-sm text-[#1C232E] font-medium truncate">{f.hovedtekst || f.label}</span>
                {f.undertekst && <span className="block text-xs text-[#52697E] truncate">{f.undertekst}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { AddressInput };
