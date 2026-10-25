import React from "react";
import { Clock } from "lucide-react";
import { formatDuration } from "../data/domain";
import { SAGSTYPE_SPECIALTUR, SPECIAL_MAKS_MINUTTER, SPECIALTUR_COLOR, specialturFejl } from "../data/caseTypes";

// Felterne på en SPECIALTUR (oktober 2026), delt mellem oprettelsen (NewOrderForm) og
// redigeringen af en booket sag (BookingEditor i OrderView): en beskrivelse af opgaven, et
// valgfrit krav til montøren og tiden for HELE turen i minutter. Se data/caseTypes.js.
//
// Beskrivelsen er påkrævet, fordi den er det, montøren og senere forslag til tid bygger på.
// Tiden erstatter varelinjernes tider for hele sagen, og det står her, så ingen forventer, at
// tiderne på varelinjerne også tæller.
const HURTIGE_MINUTTER = [30, 60, 90, 120, 180, 240, 360];

const inputKlasse = "w-full mt-1 rounded-lg border bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand disabled:opacity-60 disabled:cursor-not-allowed";

function SpecialturFelter({ beskrivelse, krav, minutter, onBeskrivelse, onKrav, onMinutter, visFejl, disabled }) {
  const beskrivelseFejl = visFejl && !(beskrivelse || "").toString().trim();
  // Teksten til tiden hentes med en udfyldt beskrivelse, så kun tidens egen fejl kommer med.
  const tidBesked = specialturFejl({ sagstype: SAGSTYPE_SPECIALTUR, specialBeskrivelse: "x", manuelTid: minutter })[0];
  const tidFejl = visFejl && Boolean(tidBesked);
  const antal = Math.round(Number(minutter));
  const erGyldigTid = Number.isFinite(antal) && antal > 0 && antal <= SPECIAL_MAKS_MINUTTER;

  return (
    <div className="mb-4 rounded-xl border-2 p-3 bg-white" style={{ borderColor: SPECIALTUR_COLOR }}>
      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: SPECIALTUR_COLOR }}>Specialtur</p>

      <label className="block text-xs text-muted mb-3">
        Beskrivelse af opgaven (påkrævet)
        <textarea
          value={beskrivelse}
          onChange={(e) => onBeskrivelse(e.target.value)}
          rows={3}
          maxLength={1000}
          disabled={disabled}
          aria-required="true"
          aria-invalid={beskrivelseFejl ? "true" : undefined}
          placeholder="Hvad skal gøres? Fx 'Lofthængt emhætte over kogeø, montering og tilslutning'"
          className={`${inputKlasse} ${beskrivelseFejl ? "border-danger" : "border-line"}`}
        />
        {beskrivelseFejl && <span role="alert" className="block text-xs text-danger mt-1">Beskriv opgaven, så montøren ved, hvad der skal gøres.</span>}
      </label>

      <label className="block text-xs text-muted mb-3">
        Krav til montør (valgfrit)
        <input
          value={krav}
          onChange={(e) => onKrav(e.target.value)}
          maxLength={200}
          disabled={disabled}
          placeholder="Fx 'Kræver højdekompetence' eller 'Kun to mand'"
          className={`${inputKlasse} border-line`}
        />
        <span className="block text-[11px] text-muted mt-1">Vises for planlæggeren og montøren. Systemet tjekker ikke selv, hvem der kan hvad.</span>
      </label>

      <div className="text-xs text-muted">
        <label htmlFor="specialtur-minutter" className="flex items-center gap-1.5">
          <Clock size={12} className="shrink-0" aria-hidden="true" /> Forventet tid for hele turen i minutter (påkrævet)
        </label>
        <div className="flex items-center gap-2 mt-1">
          <input
            id="specialtur-minutter"
            type="number"
            inputMode="numeric"
            min="1"
            max={SPECIAL_MAKS_MINUTTER}
            step="1"
            value={minutter}
            onChange={(e) => onMinutter(e.target.value)}
            disabled={disabled}
            aria-required="true"
            aria-invalid={tidFejl ? "true" : undefined}
            className={`w-28 rounded-lg border bg-white px-3 py-2 text-sm text-ink font-mono text-right focus:outline-none focus:border-brand disabled:opacity-60 disabled:cursor-not-allowed ${tidFejl ? "border-danger" : "border-line"}`}
          />
          <span className="text-sm text-ink">{erGyldigTid ? formatDuration(antal) : ""}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2" role="group" aria-label="Hurtige valg af tid">
          {HURTIGE_MINUTTER.map((m) => (
            <button
              key={m}
              type="button"
              disabled={disabled}
              onClick={() => onMinutter(String(m))}
              aria-pressed={antal === m}
              className={`min-h-[44px] px-3 rounded-full border text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-60 ${antal === m ? "bg-ink text-white border-ink" : "bg-white text-ink border-line hover:border-brand"}`}
            >
              {formatDuration(m)}
            </button>
          ))}
        </div>
        {tidFejl && <p role="alert" className="text-xs text-danger mt-2">{tidBesked}</p>}
        <p className="text-[11px] text-muted mt-2">Tiden gælder hele turen og erstatter tiderne på varelinjerne.</p>
      </div>
    </div>
  );
}

export { SpecialturFelter };
