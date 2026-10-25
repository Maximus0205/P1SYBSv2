import React, { useState } from "react";
import { setStoreRole } from "../lib/dataStore";
import { alleRoller } from "../data/roller";

// Butikkens valg af roller (oktober 2026). Roller oprettes af systemadministratoren og er fælles for alle butikker,
// men hver butik vælger selv de roller, den vil bruge - en tømrervirksomhed har brug for andre roller end en kæde-butik.
// Alle roller behandles ens. En rolle, som brugere i butikken har, kan ikke fravælges
// (databasen afviser det med en forklaring, som vises her).
function ButikRollerValg({ storeId, tilvalgte, onChanged }) {
  const [busyKey, setBusyKey] = useState("");
  const [fejl, setFejl] = useState("");
  const faelles = alleRoller();
  if (faelles.length === 0) return null;

  const skift = async (rolle, aktiv) => {
    setFejl(""); setBusyKey(rolle.key);
    const res = await setStoreRole(storeId, rolle.key, aktiv);
    setBusyKey("");
    if (!res.ok) { setFejl(res.fejl || "Kunne ikke ændre rollen."); return; }
    onChanged?.();
  };

  return (
    <fieldset className="rounded-xl border border-line bg-white p-4 mb-6 shadow-sm">
      <legend className="px-1 text-sm font-semibold uppercase tracking-wide text-ink">Roller i butikken</legend>
      <p className="text-xs text-muted mb-2">Vælg de roller, jeres brugere kan få.</p>
      <div className="space-y-1">
        {faelles.map((r) => {
          const aktiv = (tilvalgte || []).includes(r.key);
          return (
            <label key={r.key} className="flex items-start gap-2 min-h-[44px] py-1 cursor-pointer">
              <input
                type="checkbox" checked={aktiv} disabled={busyKey === r.key}
                onChange={(e) => skift(r, e.target.checked)}
                className="w-4 h-4 mt-1 accent-brand shrink-0"
              />
              <span className="text-sm text-ink">
                {r.label}
                {r.beskrivelse && <span className="block text-xs text-muted">{r.beskrivelse}</span>}
              </span>
            </label>
          );
        })}
      </div>
      {fejl && <p role="alert" className="text-xs text-danger mt-2">{fejl}</p>}
    </fieldset>
  );
}

export { ButikRollerValg };
