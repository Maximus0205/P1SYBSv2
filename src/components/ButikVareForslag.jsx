import React from "react";
import { CheckCircle2, AlertCircle, Check } from "lucide-react";

// Det sælgeren ser under modelnummerfeltet, når modellen ikke er bekræftet på punkt1.dk, men slås op i butikkens egen
// varedatabase (se lib/butikVarer.js og components/ButikVarerAdmin.jsx). Rådgivende: intet ændres uden et tryk, og
// ingenting her kan stoppe en booking.
//   - exact:     modellen findes i butikkens liste (grøn bekræftelse)
//   - lignende:  modeller der ligner det tastede ("Mente du ...?")
//   - ukendt:    modellen findes hverken på punkt1.dk eller i butikkens liste (påmindelse, ikke en fejl)
function ButikVareForslag({ exact, lignende, ukendt, model, onVaelg, foreslaaetType, onSkiftType }) {
  const vaelg = (v) => onVaelg({ brand: v.brand, model: v.model });

  if (exact) {
    // Samme model, men skrevet anderledes end i databasen (fx mellemrum): tilbyd den rigtige skrivemåde.
    const andenSkrivemaade = (model || "").trim() !== exact.model;
    return (
      <div className="space-y-1">
        <div role="status" className="text-[11px] text-success font-semibold flex items-center gap-1.5 flex-wrap">
          <CheckCircle2 size={13} className="shrink-0" aria-hidden="true" />
          <span>Bekræftet i butikkens varedatabase: {exact.brand} {exact.model}</span>
          {andenSkrivemaade && (
            <button type="button" onClick={() => vaelg(exact)} className="min-h-[36px] px-3 rounded-lg text-[11px] font-semibold uppercase tracking-wide text-success border border-success hover:bg-success/10 focus:outline-none focus:ring-2 focus:ring-success">
              Brug {exact.model}
            </button>
          )}
        </div>
        {foreslaaetType && onSkiftType && (
          <div role="alert" className="rounded-lg border border-danger/40 bg-[#FBEFEF] px-2 py-1.5">
            <p className="text-[11px] text-danger font-semibold">Butikkens varedatabase har denne vare som "{foreslaaetType.navn}", men varetypen er en anden.</p>
            <button type="button" onClick={() => onSkiftType(foreslaaetType)} className="mt-1 min-h-[44px] px-3 rounded-lg text-xs font-semibold uppercase tracking-wide text-danger border border-danger hover:bg-white focus:outline-none focus:ring-2 focus:ring-danger">
              Skift til {foreslaaetType.navn}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (lignende.length > 0) {
    return (
      <div className="space-y-1">
        <p className="text-[11px] text-muted">Mente du en af disse fra butikkens varedatabase?</p>
        {lignende.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => vaelg(v)}
            className="w-full min-h-[44px] flex items-center justify-between gap-2 rounded-lg border border-line bg-panel hover:border-success hover:bg-success/10 transition-colors px-2 py-1.5 text-left focus:outline-none focus:ring-2 focus:ring-success"
          >
            <span className="min-w-0 flex-1 text-[11px] text-ink truncate">{v.brand} {v.model}</span>
            <Check size={13} className="text-success shrink-0" aria-hidden="true" />
          </button>
        ))}
      </div>
    );
  }

  if (ukendt) {
    return (
      <p role="status" className="text-[11px] text-muted flex items-start gap-1.5">
        <AlertCircle size={13} className="shrink-0 mt-px" aria-hidden="true" />
        <span>"{(model || "").trim()}" findes hverken på punkt1.dk eller i butikkens varedatabase. Du kan stadig booke den, men tjek stavningen en ekstra gang.</span>
      </p>
    );
  }
  return null;
}

export { ButikVareForslag };
