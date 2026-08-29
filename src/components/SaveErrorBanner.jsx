import React, { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { subscribeSaveFailure, clearSaveFailure } from "../lib/saveStatus";

// Synlig besked når en ændring IKKE blev gemt (august 2026). Se
// lib/saveStatus.js for baggrunden.
//
// Monteret ÉN gang i main.jsx, uden for HashRouter - så banneret ikke
// forsvinder, hvis brugeren navigerer videre i samme sekund som
// skrivningen fejler.
//
// Placeret NEDERST på skærmen, ikke øverst: montører bruger appen på
// mobil med én hånd, og bunden er både det, tommelfingeren kan nå, og
// det sted der ikke dækker for sagens overskrift. Fylder hele bredden på
// mobil, og lægger sig i højre hjørne på større skærme.
//
// TILGÆNGELIGHED: role="alert" + aria-live="assertive", så en skærmlæser
// selv siger det højt - dette er netop en besked, brugeren ikke må
// overse. Luk-knappen er en rigtig <button> med aria-label og et
// touch-mål på 44x44 px. Ingen automatisk timeout: en fejl skal aktivt
// erkendes, ikke forsvinde af sig selv, mens man kigger ned i kassen.
function SaveErrorBanner() {
  const [failure, setFailure] = useState(null);

  useEffect(() => subscribeSaveFailure(setFailure), []);

  useEffect(() => {
    if (!failure) return;
    const onKey = (e) => { if (e.key === "Escape") clearSaveFailure(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [failure]);

  if (!failure) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-x-0 bottom-0 z-50 p-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-md"
    >
      <div className="rounded-xl border border-danger bg-white shadow-lg p-3 flex items-start gap-3">
        <AlertTriangle size={18} className="text-danger shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-danger">Ændringen blev ikke gemt</p>
          <p className="text-xs text-ink mt-0.5 break-words">{failure.besked}</p>
          <p className="text-[11px] text-muted mt-1.5">
            Det, du så på skærmen, er rullet tilbage til den version, der står i databasen. Prøv igen — bliver ved med at fejle, så tryk Opdater, så du helt sikkert arbejder på de nyeste data.
          </p>
        </div>
        <button
          onClick={clearSaveFailure}
          aria-label="Luk besked"
          className="shrink-0 -m-1 p-1 w-11 h-11 flex items-center justify-center rounded-lg text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export { SaveErrorBanner };
