import React from "react";
import { ETAGER } from "../data/adgang";

// Etage og besværlig parkering (valgfrit, se data/adgang.js). Et tryk på den valgte etage fjerner valget igen.
// Alle knapper har et touch-mål på mindst 44 px, og valget vises både med farve og med markeret tilstand (aria-pressed).
function AdgangsFelter({ etage, parkeringBesvaerlig, onEtage, onParkering, disabled = false }) {
  return (
    <fieldset className="rounded-lg border border-line bg-panel px-3 py-2" disabled={disabled}>
      <legend className="px-1 text-xs text-muted">Adgangsforhold (valgfrit)</legend>
      <div role="group" aria-label="Etage" className="flex flex-wrap gap-1.5">
        {ETAGER.map((e) => {
          const valgt = etage === e.id;
          return (
            <button
              key={e.id}
              type="button"
              aria-pressed={valgt}
              onClick={() => onEtage(valgt ? null : e.id)}
              className={`min-h-[44px] px-3 rounded-lg border text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand ${valgt ? "bg-ink text-white border-ink" : "bg-white text-ink border-line hover:border-brand"}`}
            >
              {e.label}
            </button>
          );
        })}
      </div>
      <label className="mt-1.5 flex items-center gap-2 min-h-[44px] text-sm text-ink cursor-pointer">
        <input type="checkbox" checked={!!parkeringBesvaerlig} onChange={(ev) => onParkering(ev.target.checked)} className="w-4 h-4 accent-brand shrink-0" />
        Besværlig parkering (bilen kan ikke holde tæt på)
      </label>
    </fieldset>
  );
}

export { AdgangsFelter };
