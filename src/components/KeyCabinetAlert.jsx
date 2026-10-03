import React, { useMemo } from "react";
import { KeyRound, Navigation, HelpCircle } from "lucide-react";
import { isTomgang } from "../data/caseTypes";
import { findKeyCabinets, cabinetMapsQuery } from "../data/keyCabinets";

// ---------------------------------------------------------------------------
// NØGLESKAB-ADVARSEL TIL MONTØREN (september 2026)
//
// Ved en TOMGANGSKØRSEL lukker montøren sig selv ind - og ligger nøglen i
// et boligforenings nøgleskab, skal den hentes FØR man kører til adressen.
// Opdager man det først på adressen, er kørslen spildt. Derfor slås
// sagens adresse automatisk op mod butikkens nøgleskabe (Adresser ->
// Nøgleskabe), og resultatet vises både på rutekortet og øverst på sagen -
// uden at montøren selv skal bladre i noget.
//
// SLÅS OP LØBENDE (ved visning), ikke gemt på sagen: rettes eller slettes
// et skab senere, følger visningen med. Ulempen - at en sag ikke "husker"
// et slettet skab - er bevidst; en forældet skabsplacering er værre end
// ingen.
//
// NØGLESKAB UDELUKKER NØGLEBOKS (september 2026): et skab kopieres derfor
// ALDRIG ind i sagens egne nøglefelter - se manualKeyAccessText i
// data/keyCabinets.js.
//
// Se data/keyCabinets.js for de to niveauer:
//   "sikker" - adressen ligger i skabets område.
//   "mulig"  - vejnavnet stemmer, men husnummeret kunne ikke bekræftes.
//              Vises tydeligt som et TJEK, aldrig som et faktum.

const mapsUrl = (query) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

// Kun tomgang: det er dér, montøren skal ind uden at nogen åbner. Er sagen
// færdigmeldt, er skabet uden betydning, og kaldere skjuler det selv.
export function useCabinetMatches(order, keyCabinets) {
  const tomgang = isTomgang(order);
  const adresse = order?.kunde?.adresse;
  return useMemo(() => (tomgang ? findKeyCabinets(adresse, keyCabinets) : []), [tomgang, adresse, keyCabinets]);
}

// Kompakt version til rutekortet: én linje pr. skab, i samme boks som
// sagens øvrige advarsler.
export function KeyCabinetLines({ matches }) {
  if (!matches || matches.length === 0) return null;
  return (
    <>
      {matches.map(({ cabinet, niveau }) => (
        niveau === "sikker" ? (
          <p key={cabinet.id} className="text-xs font-semibold text-brand flex items-start gap-1.5">
            <KeyRound size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
            <span>Hent nøgle i skab først: {cabinet.navn} — {cabinet.skabPlacering}</span>
          </p>
        ) : (
          <p key={cabinet.id} className="text-xs font-semibold text-info flex items-start gap-1.5">
            <HelpCircle size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
            <span>Muligt nøgleskab — tjek: {cabinet.navn} — {cabinet.skabPlacering}</span>
          </p>
        )
      ))}
    </>
  );
}

// Fuld version til sagsdetaljen: stor, umulig at overse, med knap direkte
// til skabets placering i Google Maps.
export function KeyCabinetAlert({ matches, orderAddress }) {
  if (!matches || matches.length === 0) return null;
  return (
    <div className="mt-2.5 space-y-2" aria-label="Nøgleskab til denne adresse">
      {matches.map(({ cabinet, niveau }) => {
        const sikker = niveau === "sikker";
        return (
          <div
            key={cabinet.id}
            className={`rounded-xl border-2 p-3.5 ${sikker ? "border-brand bg-brand/10" : "border-info bg-info/10"}`}
          >
            <p className={`text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1.5 ${sikker ? "text-brand" : "text-info"}`}>
              {sikker
                ? <><KeyRound size={14} className="shrink-0" aria-hidden="true" /> Hent nøglen i nøgleskab, før du kører derud</>
                : <><HelpCircle size={14} className="shrink-0" aria-hidden="true" /> Muligt nøgleskab — tjek selv</>}
            </p>

            <p className="text-base font-semibold text-ink mt-1 leading-snug">{cabinet.navn}</p>
            <p className="text-sm text-ink">Skab: {cabinet.skabPlacering}</p>
            {cabinet.note && <p className="text-sm font-semibold text-brand mt-1">{cabinet.note}</p>}

            {!sikker && (
              <p className="text-xs text-muted mt-1.5">
                Vejnavnet står i dette skabs område, men husnummeret kunne ikke bekræftes automatisk.
              </p>
            )}
            <p className="text-[11px] text-muted mt-1.5">Skabet dækker: {cabinet.omraade}</p>

            <a
              href={mapsUrl(cabinetMapsQuery(cabinet, orderAddress))}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2.5 inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors"
            >
              <Navigation size={14} aria-hidden="true" /> Naviger til skabet
            </a>
          </div>
        );
      })}
    </div>
  );
}

// Til bookingen (sælgeren): viser samme fund, så et manglende eller forkert
// skab opdages ved bookingen og ikke af montøren på adressen. Skabet lægges
// IKKE ind som nøgleoplysning (nøgleskab udelukker nøgleboks) - montøren får
// det vist automatisk ud fra adressen. Er intet fundet, men butikken HAR
// nøgleskabe, står der en kort påmindelse.
export function KeyCabinetBookingHint({ matches, hasCabinets, addressTyped }) {
  if (matches && matches.length > 0) {
    return (
      <div className="mb-4 space-y-2">
        {matches.map(({ cabinet, niveau }) => {
          const sikker = niveau === "sikker";
          return (
            <div key={cabinet.id} className={`rounded-xl border p-3 ${sikker ? "border-brand bg-brand/5" : "border-info bg-info/5"}`}>
              <p className={`text-xs font-semibold flex items-start gap-1.5 ${sikker ? "text-brand" : "text-info"}`}>
                {sikker ? <KeyRound size={13} className="shrink-0 mt-0.5" aria-hidden="true" /> : <HelpCircle size={13} className="shrink-0 mt-0.5" aria-hidden="true" />}
                <span>
                  {sikker ? "Adressen hører til et nøgleskab" : "Adressen hører muligvis til et nøgleskab"}: {cabinet.navn}
                </span>
              </p>
              <p className="text-xs text-ink mt-1">Skab: {cabinet.skabPlacering}</p>
              {cabinet.note && <p className="text-xs text-muted mt-0.5">{cabinet.note}</p>}
              {!sikker && <p className="text-[11px] text-muted mt-1">Husnummeret kunne ikke bekræftes — skabet dækker: {cabinet.omraade}</p>}
              <p className="text-[11px] text-muted mt-2">Montøren får skabet vist automatisk, og rutelinket kører via skabet først.</p>
            </div>
          );
        })}
      </div>
    );
  }

  if (hasCabinets && addressTyped) {
    return (
      <p className="mb-4 text-[11px] text-muted flex items-start gap-1.5">
        <HelpCircle size={12} className="shrink-0 mt-0.5" aria-hidden="true" />
        Ingen af butikkens nøgleskabe dækker denne adresse. Ligger nøglen i et skab, så tilføj det under Adresser → Nøgleskabe, så montøren får det vist automatisk.
      </p>
    );
  }

  return null;
}
