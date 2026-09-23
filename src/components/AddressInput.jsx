import React, { useEffect, useRef, useState } from "react";
import { Check, AlertTriangle, Loader2, MapPin } from "lucide-react";
import { searchAdressevaelger } from "../lib/geocodingAdressevaelger";

// ---------------------------------------------------------------------------
// LIVE FORSØG (september 2026): dette felt bruger nu Klimadatastyrelsens
// Adressevælger (adressevaelger.dk) i STEDET for den hidtidige
// OpenRouteService-baserede løsning - på brugerens eget ønske, direkte i
// bookingflowet, mens systemet endnu ikke har rigtig drift. Den gamle
// ORS-baserede udgave af komponenten er BEVIDST BEVARET som kommentar
// nederst i filen - er Adressevælgeren utilfredsstillende, er det at
// fjerne kommentar-markørerne og fjerne det aktive afsnit ovenfor nok til
// at være tilbage, hvor vi slap. Se lib/geocodingAdressevaelger.js og
// supabase/functions/adressevaelger-proxy.
const DEBOUNCE_MS = 350;

// Splitter et afsluttende 4-cifret postnummer fra selve søgeteksten, så det
// kan sendes som sin EGEN, strukturerede parameter til Adressevælgeren
// (som selv anbefaler præcis dette i deres dokumentation: "vejnavn=...
// &postnummer=..." for at undgå tvetydige gadenavne) - i stedet for at
// overlade til fritekst-parseren at gætte, om tallet er et husnummer eller
// et postnummer.
function splitTextAndPostnummer(raw) {
  const match = (raw || "").trim().match(/^(.*\S)\s+(\d{4})$/);
  if (!match) return { tekst: raw, postnummer: undefined };
  const num = Number(match[2]);
  if (num < 1000 || num > 9990) return { tekst: raw, postnummer: undefined };
  return { tekst: match[1], postnummer: match[2] };
}

// Forslag med en KONKRET adgang (husnummer/adresse) frem for blot et
// gadenavn eller "gadenavn + postnummer" (som betyder søgningen endnu er
// for bred til at pege på ét sted) - samme princip som "husnummer først"
// i den tidligere ORS-baserede sortering, blot tilpasset Adressevælgerens
// egne typer.
const SPECIFICITY = { husnummer: 0, adresse: 0, navngivenvejpostnummer: 1, vejnavn: 2 };

function AddressInput({ value, onChange, placeholder, onValidationChange, focus }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [status, setStatus] = useState("tom"); // tom | tjekker | gyldig | usikker
  const selectedRef = useRef(false);
  const blurTimerRef = useRef(null);

  useEffect(() => {
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
      const { tekst, postnummer } = splitTextAndPostnummer(value);
      const result = await searchAdressevaelger(tekst, { postnummer });
      if (cancelled) return;
      const fund = [...(result.fund || [])].sort((a, b) => (SPECIFICITY[a.type] ?? 9) - (SPECIFICITY[b.type] ?? 9));
      setSuggestions(fund);
      if (fund.length > 0) setShowSuggestions(true);
      // "gyldig" her betyder: mindst ét forslag er en KONKRET adgang, ikke
      // blot et gadenavn/postnummer-forslag man skal indsnævre yderligere.
      const newStatus = fund.some((f) => f.type === "husnummer" || f.type === "adresse") ? "gyldig" : "usikker";
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
    onChange(f.titel);
    setSuggestions([]);
    setShowSuggestions(false);
    setStatus("gyldig");
    onValidationChange?.("gyldig");
  };

  return (
    <div className="relative">
      <div className="relative">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (blurTimerRef.current) { clearTimeout(blurTimerRef.current); blurTimerRef.current = null; }
            setShowSuggestions(true);
          }}
          onBlur={() => {
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
          <AlertTriangle size={11} /> Adressen er endnu ikke specifik nok, eller kunne ikke bekræftes — tilføj fx husnummer eller postnummer, eller vælg et forslag herunder.
        </p>
      )}

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl bg-white border border-line shadow-lg max-h-64 overflow-auto">
          {suggestions.map((f) => (
            <button
              key={f.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectSuggestion(f)}
              className="w-full text-left px-3 py-2.5 hover:bg-panel flex items-start gap-2.5 border-b border-divider last:border-b-0"
            >
              <MapPin size={15} className="text-muted shrink-0 mt-0.5" />
              <span className="min-w-0">
                <span className="block text-sm text-ink font-medium truncate">{f.titel}</span>
                {f.type === "navngivenvejpostnummer" && <span className="block text-xs text-muted truncate">{f.antalHusnumre} husnumre — vælg og tilføj husnummer</span>}
                {f.type === "vejnavn" && <span className="block text-xs text-muted truncate">Gadenavn — tilføj husnummer/by</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { AddressInput };

// ---------------------------------------------------------------------------
// TIDLIGERE, ORS-BASEREDE UDGAVE (bevaret til nem tilbagerulning - se noten
// øverst i filen). IKKE i brug lige nu.
//
// import { searchAddressSuggestions, validateAddress, hasOrsKey, extractPostalCodeHint } from "../lib/geocoding";
//
// function AddressInputORS({ value, onChange, placeholder, onValidationChange, focus }) {
//   const [suggestions, setSuggestions] = useState([]);
//   const [showSuggestions, setShowSuggestions] = useState(false);
//   const [status, setStatus] = useState("tom"); // tom | tjekker | gyldig | usikker
//   const selectedRef = useRef(false); // sidste ændring kom fra klik på et forslag (springer så re-validering over)
//   const blurTimerRef = useRef(null);
//
//   useEffect(() => {
//     if (!hasOrsKey()) return;
//     if (!value || value.trim().length < 4) {
//       setStatus("tom");
//       setSuggestions([]);
//       onValidationChange?.("tom");
//       return;
//     }
//     if (selectedRef.current) {
//       selectedRef.current = false;
//       return;
//     }
//
//     let cancelled = false;
//     setStatus("tjekker");
//
//     const timer = setTimeout(async () => {
//       const [list, validation] = await Promise.all([searchAddressSuggestions(value, focus), validateAddress(value, focus)]);
//       if (cancelled) return;
//       setSuggestions(list);
//       if (list.length > 0) setShowSuggestions(true);
//       const newStatus = validation.gyldig ? "gyldig" : "usikker";
//       setStatus(newStatus);
//       onValidationChange?.(newStatus);
//     }, DEBOUNCE_MS);
//
//     return () => {
//       cancelled = true;
//       clearTimeout(timer);
//     };
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [value]);
//
//   const selectSuggestion = (f) => {
//     selectedRef.current = true;
//     onChange(f.label);
//     setSuggestions([]);
//     setShowSuggestions(false);
//     setStatus("gyldig");
//     onValidationChange?.("gyldig");
//   };
//
//   if (!hasOrsKey()) {
//     return (
//       <input
//         value={value}
//         onChange={(e) => onChange(e.target.value)}
//         placeholder={placeholder}
//         className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
//       />
//     );
//   }
//
//   const postalHint = extractPostalCodeHint(value);
//   const postalHintUnused = postalHint && suggestions.length > 0 && !suggestions.some((s) => s.postnummer === postalHint);
//
//   return (
//     <div className="relative">
//       <div className="relative">
//         <input
//           value={value}
//           onChange={(e) => onChange(e.target.value)}
//           onFocus={() => {
//             if (blurTimerRef.current) { clearTimeout(blurTimerRef.current); blurTimerRef.current = null; }
//             setShowSuggestions(true);
//           }}
//           onBlur={() => {
//             blurTimerRef.current = setTimeout(() => setShowSuggestions(false), 150);
//           }}
//           placeholder={placeholder}
//           className="w-full rounded-lg border border-line bg-panel pl-3 pr-8 py-2 text-sm text-ink focus:outline-none focus:border-brand"
//         />
//         <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
//           {status === "tjekker" && <Loader2 size={14} className="animate-spin text-muted" />}
//           {status === "gyldig" && <Check size={14} className="text-success" />}
//           {status === "usikker" && <AlertTriangle size={14} className="text-danger" />}
//         </span>
//       </div>
//
//       {status === "usikker" && (
//         <p className="text-[11px] text-danger mt-1 flex items-center gap-1">
//           <AlertTriangle size={11} /> Adressen kunne ikke bekræftes — tjek for tastefejl, eller vælg et forslag herunder.
//         </p>
//       )}
//
//       {postalHintUnused && (
//         <p className="text-[11px] text-brand mt-1 flex items-center gap-1">
//           <Info size={11} className="shrink-0" /> Postnummeret {postalHint} ser ikke ud til at være brugt i forslagene herunder — prøv at skrive byens navn i stedet.
//         </p>
//       )}
//
//       {showSuggestions && suggestions.length > 0 && (
//         <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl bg-white border border-line shadow-lg max-h-64 overflow-auto">
//           {suggestions.map((f, i) => (
//             <button
//               key={i}
//               type="button"
//               onMouseDown={(e) => e.preventDefault()}
//               onClick={() => selectSuggestion(f)}
//               className="w-full text-left px-3 py-2.5 hover:bg-panel flex items-start gap-2.5 border-b border-divider last:border-b-0"
//             >
//               <MapPin size={15} className="text-muted shrink-0 mt-0.5" />
//               <span className="min-w-0">
//                 <span className="block text-sm text-ink font-medium truncate">{f.hovedtekst || f.label}</span>
//                 {f.undertekst && <span className="block text-xs text-muted truncate">{f.undertekst}</span>}
//               </span>
//             </button>
//           ))}
//         </div>
//       )}
//     </div>
//   );
// }
