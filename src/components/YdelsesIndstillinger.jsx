import React from "react";
import { standardYdelse, kraeverBeskrivelse, skalPlukkes } from "../lib/ydelser";

// Butikkens indstillinger for de PRIMÆRE YDELSER (oktober 2026), vist øverst under
// Admin -> Varer & ydelser -> Primære ydelser:
//   * STANDARD: den ydelse, en ny varelinje starter på i bookingens trin 3. Er ingen valgt,
//     bruges "Montering". Sælgeren kan altid skifte på den enkelte linje.
//   * OPGAVEBESKRIVELSE: viser et fritekstfelt på varelinjen, så montøren ved, hvad der skal
//     gøres (typisk en servicetur). Er det aldrig sat, regnes en ydelse med "service" i
//     navnet for en servicetur.
//   * PLUKKES PÅ LAGER: om en varelinje med ydelsen står på lagerets plukliste. Slået fra for en
//     servicetur, hvor produktet typisk allerede er hos kunden.
// Gemmes som egenskaber på selve ydelsen (standard, kraeverBeskrivelse, plukkes) via den samme
// opdatering som resten af kataloget - se lib/ydelser.js.
function YdelsesIndstillinger({ primaryServices, onUpdate }) {
  const liste = primaryServices || [];
  if (liste.length === 0) return null;
  const valgt = standardYdelse(liste);

  const vaelgStandard = (id) => {
    // Højst én ydelse er standard: fjern markeringen fra alle andre først.
    liste.filter((p) => p.standard === true && p.id !== id).forEach((p) => onUpdate(p.id, { standard: false }));
    onUpdate(id, { standard: true });
  };

  return (
    <div className="rounded-xl border border-line bg-white p-5 mb-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1">Standard, opgavebeskrivelse og pluk</h3>
      <p className="text-xs text-muted mb-3">
        <strong>Standard</strong> er den ydelse, en ny varelinje starter på, når der bookes en sag. Sælgeren kan altid vælge en anden.
        <strong> Opgavebeskrivelse</strong> giver et felt på varelinjen, hvor sælgeren skriver, hvad montøren skal gøre — fx ved en servicetur.
        <strong> Plukkes</strong> styrer, om varen står på lagerets plukliste — slå det fra, når produktet allerede er hos kunden.
      </p>
      <fieldset>
        <legend className="sr-only">Standardydelse og opgavebeskrivelse pr. ydelse</legend>
        {liste.map((p) => (
          <div key={p.id} className="flex items-center gap-x-4 gap-y-0 flex-wrap border-b border-divider last:border-b-0 min-h-[44px]">
            <span className="flex-1 min-w-[140px] text-sm text-ink py-2">{p.navn}</span>
            <label className="flex items-center gap-2 min-h-[44px] text-xs text-muted cursor-pointer">
              <input type="radio" name="standard-ydelse" checked={valgt?.id === p.id} onChange={() => vaelgStandard(p.id)} className="w-5 h-5 accent-ink" aria-label={`${p.navn} er standard`} />
              Standard
            </label>
            <label className="flex items-center gap-2 min-h-[44px] text-xs text-muted cursor-pointer">
              <input type="checkbox" checked={kraeverBeskrivelse(p)} onChange={() => onUpdate(p.id, { kraeverBeskrivelse: !kraeverBeskrivelse(p) })} className="w-5 h-5 accent-ink" aria-label={`${p.navn} kræver opgavebeskrivelse`} />
              Opgavebeskrivelse
            </label>
            <label className="flex items-center gap-2 min-h-[44px] text-xs text-muted cursor-pointer">
              <input type="checkbox" checked={skalPlukkes(p)} onChange={() => onUpdate(p.id, { plukkes: !skalPlukkes(p) })} className="w-5 h-5 accent-ink" aria-label={`${p.navn} plukkes på lager`} />
              Plukkes
            </label>
          </div>
        ))}
      </fieldset>
    </div>
  );
}

export { YdelsesIndstillinger };
