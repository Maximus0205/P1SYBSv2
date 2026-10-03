import React, { useEffect, useRef, useState } from "react";
import { Check, AlertTriangle, Loader2, MapPin } from "lucide-react";
import { searchAdressevaelger } from "../lib/geocodingAdressevaelger";

// ---------------------------------------------------------------------------
// LIVE FØRSOG (september 2026): dette felt bruger nu Klimadatastyrelsens
// Adressevælger (adressevaelger.dk) i STEDET for den hidtidige
// OpenRouteService-baserede løsning - på brugerens eget ønske, direkte i
// bookingflowet, mens systemet endnu ikke har rigtig drift. Den gamle
// ORS-baserede udgave findes i versionshistorikken (git) og i lib/geocoding.js.
// Se lib/geocodingAdressevaelger.js og supabase/functions/adressevaelger-proxy.
//
// Selve postnummer-splitningen (se lib/geocodingAdressevaelger.js: parseQuery)
// sker INDE I searchAdressevaelger, ikke her - komponenten sender bare den
// rå, tastede tekst videre.
//
// NÆRHED ER EN FORRANG, ALDRIG ET KRAV (september 2026, rettet)
//
// Adressevælgeren sorterer sine svar i ren stigende postnummer og returnerer
// kun de første 10. Det har to konsekvenser:
//   1. Sorterer man EFTER søgningen, kan man kun omsortere de 10, der kom
//      med - er det rigtige svar ikke blandt dem, er der intet at sortere.
//   2. Filtrerer man HÅRDT på butikkens kommune, forsvinder alt uden for
//      kommunen. Det var fejlen, da kommunekoden først blev slået op: en
//      adresse i Ringe gav slet ingen forslag, selv med postnummer og
//      husnummer tastet, fordi Ringe ikke ligger i Odense kommune.
//
// Derfor søges der nu tre steder PARALLELT og resultaterne flettes:
//   A. NÆR    - butikkens eget postnummer (kun hvis brugeren ikke selv har
//               tastet et postnummer).
//   B. KOMMUNE - butikkens kommune (kun hvis kommunekoden er kendt).
//   C. LANDET - helt uden geografisk filter. Er det eneste, der rammer en
//               adresse i en anden kommune, og respekterer et tastet
//               postnummer. Henter FLERE end 10 resultater, så der er noget
//               at rangere efter nærhed.
// Rækkefølgen i listen er A, B, C, dernæst sorteres der efter specificitet
// (en konkret adgang før et blot vejnavn) og postnummer-afstand til
// butikken. En adresse i nærheden står altså øverst, men en adresse langt
// væk kan stadig findes.
//
// Alle tre bruger /husnumre/soeg. Etage/dør er stadig ét klik væk:
// selectSuggestion nedenfor søger AUTOMATISK videre efter lejlighederne, så
// snart et husnummer er valgt.
const DEBOUNCE_MS = 350;
const MAX_FORSLAG = 10;
const ENDPOINT = "soeg-husnumre";
// Den landsdækkende søgning henter FLERE end de 10, listen viser, så der er
// noget at rangere efter nærhed (se lib/geocodingAdressevaelger.js). Falder
// automatisk tilbage til et lavere tal, hvis Adressevælgeren ikke tillader det.
const LANDET_MAKSIMUM = 100;
// Antal husnumre vi henter, når man har valgt en vej (typisk højst 100).
const HUSNUMRE_MAKSIMUM = 100;

// Naturlig sortering af husnumre: 1, 1A, 1B, 2, 3, 10 (ikke 1, 10, 2, 3).
function husnummerSortKey(f) {
  const raw = String(f.husnummer || (f.titel || "").match(/\s(\d+[A-Za-zÆØÅæøå]?)\b/)?.[1] || "");
  const m = raw.match(/^(\d+)(.*)$/);
  return m ? [parseInt(m[1], 10), m[2].toLowerCase()] : [Infinity, raw.toLowerCase()];
}
function compareHusnumre(a, b) {
  const [na, la] = husnummerSortKey(a);
  const [nb, lb] = husnummerSortKey(b);
  return na !== nb ? na - nb : la.localeCompare(lb, "da");
}

// Forslag med en KONKRET adgang (husnummer/adresse) frem for blot et
// gadenavn eller "gadenavn + postnummer" (som betyder søgningen endnu er
// for bred til at pege på ét sted).
const SPECIFICITY = { husnummer: 0, adresse: 0, navngivenvejpostnummer: 1, vejnavn: 2 };

// Udtrækker et 4-cifret postnummer af en Adressevælger-titel, fx
// "Fuglsang 41, Næsby, 5270 Odense N" -> "5270". Bruges BÅDE til at søge
// videre efter et valgt "husnummer"-forslag (se selectSuggestion) OG til
// postnummer-nærheds-sorteringen - et husnummer-forslag har intet eget
// postnr-felt, så det må læses ud af teksten.
function extractPostalCode(titel) {
  const match = (titel || "").match(/\b(\d{4})\b/);
  return match ? match[1] : null;
}

// Numerisk afstand mellem et forslags postnummer og butikkens eget. Et
// forslag uden postnummer at læse placeres sidst, ikke øverst.
function postalDistance(f, storePostnr) {
  if (!storePostnr) return 0; // ingen butiks-postnr kendt endnu - ingen omsortering
  const code = f.postnr || extractPostalCode(f.titel);
  const num = code ? Number(code) : NaN;
  const storeNum = Number(storePostnr);
  if (Number.isNaN(num) || Number.isNaN(storeNum)) return Infinity;
  return Math.abs(num - storeNum);
}

function AddressInput({ value, onChange, placeholder, onValidationChange, focus, kommunekode, storePostnr }) {
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
      // Se noten øverst i filen: tre parallelle søgninger, flettet.
      const tomt = Promise.resolve({ ok: false, fund: [] });
      const [naer, kommune, landet] = await Promise.all([
        storePostnr ? searchAdressevaelger(value, undefined, ENDPOINT, storePostnr) : tomt,
        kommunekode ? searchAdressevaelger(value, kommunekode, ENDPOINT) : tomt,
        searchAdressevaelger(value, undefined, ENDPOINT, undefined, LANDET_MAKSIMUM),
      ]);
      if (cancelled) return;

      // Flet i rækkefølgen nær -> kommune -> landet, uden dubletter.
      const set = new Set();
      const flettet = [];
      for (const f of [...(naer.fund || []), ...(kommune.fund || []), ...(landet.fund || [])]) {
        const noegle = f.id || f.titel;
        if (set.has(noegle)) continue;
        set.add(noegle);
        flettet.push(f);
      }

      // Sortering i to trin: først specificitet, dernæst nærmeste postnummer
      // til butikken. Array.sort er stabil, så ved lige afstand bevares
      // fletterrækkefølgen (nær før kommune før landet).
      const fund = flettet
        .sort((a, b) => {
          const specDiff = (SPECIFICITY[a.type] ?? 9) - (SPECIFICITY[b.type] ?? 9);
          if (specDiff !== 0) return specDiff;
          return postalDistance(a, storePostnr) - postalDistance(b, storePostnr);
        })
        .slice(0, MAX_FORSLAG);

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
  }, [value, kommunekode, storePostnr]);

  // ---------------------------------------------------------------------
  // RETTET (september 2026): et "husnummer"-forslag er kun selve OPGANGENS
  // egen adgang - ikke nødvendigvis en konkret, leveringsklar adresse, hvis
  // bygningen har flere lejligheder (etage/dør). Vælges et "husnummer"-
  // forslag, søges der derfor STRAKS videre efter de konkrete adresser
  // under det - uden at brugeren selv skal skrive postnummeret. Den
  // opfølgende søgning rammer ALTID /adresser/soeg, som er den eneste, der
  // kan returnere etage/dør-niveau.
  //   - Findes der FLERE lejligheder, vises de som en ny, mere specifik
  //     forslagsliste.
  //   - Findes der PRÆCIS ÉN, vælges den automatisk.
  //   - Findes der INGEN (fx et enfamiliehus), er husnummeret selv den
  //     endelige adresse.
  const selectSuggestion = async (f) => {
    // VEJ + POSTNUMMER valgt (fx "Kløvervej 5750 Ringe, 15 husnumre"): vis en
    // ny liste med vejens husnumre, så man kan vælge det rigtige i stedet for
    // selv at skulle taste det. Adressen er først specifik, når et husnummer
    // er valgt, så status forbliver "usikker" indtil da.
    if (f.type === "navngivenvejpostnummer" && f.vejnavn && f.postnr) {
      const vejTekst = `${f.vejnavn} ${f.postnr}`;
      // Kun hvis teksten reelt ændrer sig, udløser onChange en effekt, der
      // forbruger flaget - ellers ville næste tastetryk blive sprunget over.
      selectedRef.current = vejTekst !== value;
      onChange(vejTekst);
      setStatus("tjekker");
      const result = await searchAdressevaelger(`${f.vejnavn} ${f.postnr}`, undefined, ENDPOINT, undefined, HUSNUMRE_MAKSIMUM);
      const husnumre = (result.fund || []).filter((x) => x.type === "husnummer").sort(compareHusnumre);
      if (husnumre.length === 0) {
        // Ingen husnumre at vise - lad brugeren taste husnummeret selv.
        onChange(f.titel);
        setSuggestions([]);
        setShowSuggestions(false);
        setStatus("usikker");
        onValidationChange?.("usikker");
        return;
      }
      setSuggestions(husnumre);
      setShowSuggestions(true);
      setStatus("usikker");
      onValidationChange?.("usikker");
      return;
    }

    if (f.type !== "husnummer" || !f.vejnavn || !f.husnummer) {
      selectedRef.current = true;
      onChange(f.titel);
      setSuggestions([]);
      setShowSuggestions(false);
      setStatus("gyldig");
      onValidationChange?.("gyldig");
      return;
    }

    selectedRef.current = true;
    onChange(f.titel);
    setStatus("tjekker");

    const postnummer = extractPostalCode(f.titel);
    const result = postnummer ? await searchAdressevaelger(`${f.vejnavn} ${f.husnummer} ${postnummer}`) : { ok: false, fund: [] };
    const specific = (result.fund || []).filter((x) => x.type === "adresse");

    if (specific.length === 0) {
      setSuggestions([]);
      setShowSuggestions(false);
      setStatus("gyldig");
      onValidationChange?.("gyldig");
      return;
    }
    if (specific.length === 1) {
      selectedRef.current = true;
      onChange(specific[0].titel);
      setSuggestions([]);
      setShowSuggestions(false);
      setStatus("gyldig");
      onValidationChange?.("gyldig");
      return;
    }
    setSuggestions(specific);
    setShowSuggestions(true);
    setStatus("usikker");
    onValidationChange?.("usikker");
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
          <AlertTriangle size={11} /> {suggestions.length > 0 && suggestions.every((s) => s.type === "adresse") ? "Vælg den konkrete lejlighed herunder." : "Adressen er endnu ikke specifik nok, eller kunne ikke bekræftes — tilføj fx husnummer eller postnummer, eller vælg et forslag herunder."}
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
