import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { subscribeConflicts, requestResolve } from "../lib/conflictStore";

// Synlig, bevidst besked når to personer har rettet SAMME felt på samme sag
// (oktober 2026). Se lib/orderMerge.js for hvornår det er en konflikt, og
// hooks/useOrders.js for hvordan den opstår og afgøres.
//
// Brugerens egen ændring er IKKE gemt og IKKE tabt: den ligger parkeret
// (lib/conflictStore.js), også hvis appen lukkes, indtil der er valgt.
// Ingen automatisk afvisning og ingen timeout - et valg skal træffes
// bevidst. "Afgør senere" skjuler blot vinduet bag en lille knap nederst,
// så en montør ikke blokeres midt i arbejdet.
//
// Monteret ÉN gang i main.jsx, uden for HashRouter og ErrorBoundary
// (samme begrundelse som SaveErrorBanner).
//
// TILGÆNGELIGHED: role="alertdialog" + aria-modal, fokus flyttes til
// vinduet når det åbner (ikke til en knap, så et uheldigt Enter ikke
// vælger noget), alle knapper har et touch-mål på mindst 44 px, og
// forskellen vises som tekst - ikke kun farve.

const FELT_NAVNE = {
  dato: "Dato", tidsrumId: "Tidsrum", start: "Starttid", slut: "Sluttid", bilId: "Bil",
  status: "Status", plukket: "Plukket", varelinjer: "Varelinjer", noter: "Noter",
  billeder: "Billeder", rapporter: "Rapporter", materialer: "Materialer", logs: "Tidsregistrering",
  kunde: "Kundeoplysninger", koeber: "Køber", noegle: "Nøgle", problem: "Problem-markering",
  ordrenummer: "Ordrenummer", raekkefolge: "Rækkefølge i dagen", stemplerInd: "Stemplet ind",
  startetTidspunkt: "Startet", afsluttetTidspunkt: "Færdigmeldt", notifikationSet: "Læste beskeder",
  harOpfoelgning: "Opfølgning", posStatus: "POS-status", sagstype: "Sagstype", opfoelgningsType: "Opfølgningstype",
};

const feltNavn = (k) => FELT_NAVNE[k] || k;

function kort(v) {
  if (v === null || v === undefined || v === "") return "(tom)";
  if (v === true) return "ja";
  if (v === false) return "nej";
  if (Array.isArray(v)) return `${v.length} ${v.length === 1 ? "element" : "elementer"}`;
  if (typeof v === "object") return "(ændret)";
  const s = String(v);
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
}

function ConflictBanner() {
  const [liste, setListe] = useState([]);
  const [skjult, setSkjult] = useState(false);
  const vinduRef = useRef(null);

  useEffect(() => subscribeConflicts(setListe), []);

  // En NY konflikt åbner vinduet igen, også selvom man tidligere trykkede "Afgør senere".
  useEffect(() => { setSkjult(false); }, [liste.length]);

  useEffect(() => {
    if (liste.length > 0 && !skjult) vinduRef.current?.focus();
  }, [liste.length, skjult]);

  if (liste.length === 0) return null;
  const c = liste[0];
  const antal = liste.length;

  if (skjult) {
    return (
      <button
        onClick={() => setSkjult(false)}
        className="fixed left-3 bottom-3 z-[60] min-h-[44px] rounded-full bg-danger px-4 text-xs font-semibold text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-danger focus:ring-offset-2"
      >
        {antal} {antal === 1 ? "ændring" : "ændringer"} ikke gemt – afgør
      </button>
    );
  }

  const flereEndKonflikt = (c.mineKeys?.length || 0) - (c.keys?.length || 0);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-3 sm:items-center" role="presentation">
      <div
        ref={vinduRef}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="konflikt-titel"
        aria-describedby="konflikt-tekst"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-danger bg-white p-4 shadow-lg focus:outline-none"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 id="konflikt-titel" className="text-sm font-semibold text-danger">Din ændring er IKKE gemt</h2>
            <p id="konflikt-tekst" className="mt-1 text-xs text-ink">
              {c.nr ? `Sag ${c.nr}` : "Sagen"} blev ændret af en anden, mens du arbejdede på den – og I har rettet de samme felter.
              Intet er overskrevet. Vælg, hvad der skal gælde:
            </p>
          </div>
        </div>

        <ul className="mt-3 space-y-2">
          {(c.keys || []).map((k) => (
            <li key={k} className="rounded-lg border border-line bg-panel p-2 text-xs">
              <div className="font-semibold text-ink">{feltNavn(k)}</div>
              <div className="text-muted">Din version: <span className="text-ink">{kort(c.mine?.[k])}</span></div>
              <div className="text-muted">Deres version: <span className="text-ink">{kort(c.theirs?.[k])}</span></div>
            </li>
          ))}
        </ul>

        {flereEndKonflikt > 0 && (
          <p className="mt-2 text-[11px] text-muted">
            Dine øvrige ændringer på sagen ({flereEndKonflikt}) følger med, hvis du vælger din version.
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            onClick={() => requestResolve(c.kid, "mine")}
            className="min-h-[44px] flex-1 rounded-lg bg-brand px-3 text-sm font-semibold text-white hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
          >
            Gem min ændring
          </button>
          <button
            onClick={() => requestResolve(c.kid, "theirs")}
            className="min-h-[44px] flex-1 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink hover:bg-panel focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
          >
            Behold deres version
          </button>
        </div>
        <button
          onClick={() => setSkjult(true)}
          className="mt-1 min-h-[44px] w-full text-xs text-muted underline focus:outline-none focus:ring-2 focus:ring-brand"
        >
          Afgør senere
        </button>
        {antal > 1 && (
          <p className="text-center text-[11px] text-muted">Der er {antal - 1} {antal - 1 === 1 ? "ændring" : "ændringer"} mere, der skal afgøres.</p>
        )}
      </div>
    </div>
  );
}

export { ConflictBanner };
