import React, { useEffect, useRef, useState } from "react";
import { Check, AlertTriangle, Loader2, MapPin } from "lucide-react";
import { soegAdresseForslag, validerAdresse, harOrsNoegle } from "../lib/steder";

const DEBOUNCE_MS = 350;

// Adressefelt med:
//  - dropdown af forslag mens man skriver (autocomplete mod openrouteservice)
//  - validering af den endelige adresse mod korttjenesten, så tastefejl og
//    ikke-eksisterende adresser bliver fanget, før sagen oprettes
//
// Uden en ORS-nøgle opfører feltet sig som et helt almindeligt tekstfelt —
// ingen dropdown, ingen valideringsikon, ingen fejl.
function AdresseInput({ value, onChange, placeholder, onValideringChange }) {
  const [forslag, setForslag] = useState([]);
  const [visForslag, setVisForslag] = useState(false);
  const [status, setStatus] = useState("tom"); // tom | tjekker | gyldig | usikker
  const valgtRef = useRef(false); // sidste ændring kom fra klik på et forslag (springer så re-validering over)
  const blurTimerRef = useRef(null);

  useEffect(() => {
    if (!harOrsNoegle()) return;
    if (!value || value.trim().length < 4) {
      setStatus("tom");
      setForslag([]);
      onValideringChange?.("tom");
      return;
    }
    if (valgtRef.current) {
      valgtRef.current = false;
      return;
    }

    let annulleret = false;
    setStatus("tjekker");

    const timer = setTimeout(async () => {
      const [liste, validering] = await Promise.all([soegAdresseForslag(value), validerAdresse(value)]);
      if (annulleret) return;
      setForslag(liste);
      const nyStatus = validering.gyldig ? "gyldig" : "usikker";
      setStatus(nyStatus);
      onValideringChange?.(nyStatus);
    }, DEBOUNCE_MS);

    return () => {
      annulleret = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const vaelgForslag = (f) => {
    valgtRef.current = true;
    onChange(f.label);
    setForslag([]);
    setVisForslag(false);
    setStatus("gyldig");
    onValideringChange?.("gyldig");
  };

  if (!harOrsNoegle()) {
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
          onFocus={() => setVisForslag(true)}
          onBlur={() => {
            // lille forsinkelse så et klik på et forslag når at blive registreret først
            blurTimerRef.current = setTimeout(() => setVisForslag(false), 150);
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

      {visForslag && forslag.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[#D8D0BE] shadow-md max-h-52 overflow-auto">
          {forslag.map((f, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => vaelgForslag(f)}
              className="w-full text-left px-3 py-2 text-sm text-[#1C232E] hover:bg-[#F3EFE6] flex items-center gap-2 border-b border-[#D8D0BE] last:border-b-0"
            >
              <MapPin size={12} className="text-[#52697E] shrink-0" />
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { AdresseInput };