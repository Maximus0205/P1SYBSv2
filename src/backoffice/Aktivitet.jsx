import React, { useCallback, useEffect, useState } from "react";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { hentLog } from "../lib/billing";
import { LOG_TABELLER, logFelter } from "../lib/dashboardHelpers";

// Aktivitet: hvem ændrede hvad og hvornår - priser, abonnementer, lofter, indstillinger, fakturaer, kreditnotaer og udgifter.
// Loggen skrives automatisk af databasen og kan ikke redigeres eller slettes herfra.
const knapSek = "min-h-[44px] px-4 rounded-lg text-sm font-semibold text-ink border border-line bg-white hover:border-bo hover:text-bo focus:outline-none focus:ring-2 focus:ring-bo transition-colors inline-flex items-center justify-center gap-1.5";
const tid = (t) => { const d = new Date(t); return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("da-DK", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); };

export function AktivitetSektion() {
  const [log, setLog] = useState(null);
  const [fejl, setFejl] = useState("");
  const hent = useCallback(async () => { setFejl(""); setLog(null); const r = await hentLog(200); if (!r.ok) { setFejl(r.fejl); setLog([]); return; } setLog(r.data || []); }, []);
  useEffect(() => { hent(); }, [hent]);

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <p className="text-sm text-muted max-w-xl">De seneste 200 ændringer. Loggen skrives automatisk af databasen og kan ikke redigeres.</p>
        <button onClick={hent} className={knapSek}><RefreshCw size={15} aria-hidden="true" /> Opdater</button>
      </div>
      {fejl && <p role="alert" className="text-xs text-danger mb-3 flex items-start gap-1.5"><AlertCircle size={13} className="shrink-0 mt-0.5" aria-hidden="true" /> {fejl}</p>}
      {log === null && <p className="text-sm text-muted flex items-center gap-2"><Loader2 size={15} className="animate-spin" aria-hidden="true" /> Henter...</p>}
      {log && log.length === 0 && !fejl && <p className="text-sm text-muted">Ingen aktivitet endnu. Ændringer vises her, så snart du retter noget.</p>}
      {log && log.length > 0 && (
        <ul className="space-y-2">
          {log.map((r) => {
            const felter = logFelter(r.felter);
            return (
              <li key={r.id} className="rounded-xl border border-line bg-white shadow-sm">
                <details>
                  <summary className="cursor-pointer list-none p-4 min-h-[44px] flex items-start justify-between gap-3 flex-wrap">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink break-words">{LOG_TABELLER[r.tabel] || r.tabel} {r.handling}{r.kontekst ? `: ${r.kontekst}` : ""}</span>
                      <span className="block text-xs text-muted mt-0.5">{r.bruger_email || "Ukendt bruger"}</span>
                    </span>
                    <span className="text-xs text-muted whitespace-nowrap">{tid(r.tidspunkt)}</span>
                  </summary>
                  {felter.length > 0 && (
                    <dl className="px-4 pb-4 text-xs space-y-1 border-t border-divider pt-3">
                      {felter.map((f) => (
                        <div key={f.navn} className="flex gap-2 flex-wrap">
                          <dt className="text-muted min-w-[9rem]">{f.navn}</dt>
                          <dd className="text-ink break-words">{f.fra !== null && f.til !== null ? `${f.fra} → ${f.til}` : f.til !== null ? f.til : `${f.fra} (før)`}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
