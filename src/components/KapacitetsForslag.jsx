import React, { useEffect, useRef, useState } from "react";
import { CalendarClock, Loader2, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { byggForslagBody, hentOmbookingsForslag } from "../lib/kapacitetTjek";
import { addDays, todayISO, formatLongDate } from "../data/domain";

// Forslag til ny dato og bil, når en sag skal ombookes (kunden er syg, har glemt aftalen osv.). Kapacitetsmotoren leder efter de
// NÆRMESTE dage (fra og med den valgte dato, standard i morgen), hvor sagen kan ligge - tidligste dag først, kortest ventetid for kunden.
// Forslagene er rådgivende: et klik lægger dato og bil ind i formularen, og først "Gem ændringer" ændrer sagen. Selve
// kapacitetstjekket kører bagefter på den valgte kombination. Der vises aldrig mål eller vægt.
// onVaelg({ dato, bilId }) udfylder formularen. nuvaerende = sagens nuværende { dato, bilId } (foreslås ikke igen).
const felt = "min-h-[44px] rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink font-mono focus:outline-none focus:border-brand";

function KapacitetsForslag({ sagId, adresse, koordinater, minutter, tidsrumId, varelinjer, nuvaerende, onVaelg }) {
  const [fra, setFra] = useState(() => addDays(todayISO(), 1));
  const [tilstand, setTilstand] = useState({ fase: "hvile" });
  const [valgt, setValgt] = useState(null);
  const loebeNr = useRef(0);

  // Et gammelt resultat må ikke stå, når sagens varer, adresse eller tidsrum er ændret bagefter.
  const noegle = JSON.stringify([sagId, adresse, koordinater?.lat ?? null, koordinater?.lon ?? null, minutter, tidsrumId, (varelinjer || []).map((l) => [l.id, l.punkt1Id, l.varetypeNavn])]);
  useEffect(() => { setTilstand({ fase: "hvile" }); setValgt(null); }, [noegle]);

  const find = async () => {
    const nr = ++loebeNr.current;
    setTilstand({ fase: "henter" }); setValgt(null);
    const r = await hentOmbookingsForslag(byggForslagBody({ fraDato: fra, sagId, adresse, koordinater, minutter, tidsrumId, varelinjer, nuvaerende }));
    if (nr !== loebeNr.current) return; // forældet svar
    setTilstand(r.ok ? { fase: "klar", forslag: r.forslag, noter: r.noter } : { fase: "fejl", fejl: r.fejl });
  };

  return (
    <section aria-labelledby="ombook-h" className="mt-4 rounded-xl border border-line bg-white p-3">
      <h4 id="ombook-h" className="text-xs font-semibold uppercase tracking-wide text-muted mb-1 flex items-center gap-1.5">
        <CalendarClock size={13} aria-hidden="true" /> Find ny dato
      </h4>
      <p className="text-xs text-muted mb-2">Kapacitetsmotoren finder de nærmeste dage, hvor sagen kan ligge (samme tidsrum som sagen har nu). Fx hvis kunden er syg eller har glemt aftalen.</p>
      <div className="flex items-end gap-2 flex-wrap">
        <label className="text-xs text-muted">
          Fra og med
          <input type="date" value={fra} min={todayISO()} onChange={(e) => setFra(e.target.value)} className={`${felt} block mt-1`} />
        </label>
        <button type="button" onClick={find} disabled={tilstand.fase === "henter" || !fra} className="min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-brand hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none">
          {tilstand.fase === "henter" ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <CalendarClock size={14} aria-hidden="true" />}
          {tilstand.fase === "henter" ? "Søger..." : "Find nærmeste ledige dag"}
        </button>
      </div>

      <div aria-live="polite">
        {tilstand.fase === "fejl" && (
          <p role="alert" className="text-xs text-danger mt-2 flex items-start gap-1.5"><Info size={13} className="shrink-0 mt-0.5" aria-hidden="true" /> {tilstand.fejl}</p>
        )}
        {tilstand.fase === "klar" && tilstand.forslag.length === 0 && (
          <p className="text-xs text-ink mt-2">Ingen ledige dage fundet i perioden. Prøv at vælge en senere startdato, eller tjek biler, montørernes arbejdstider og fravær.</p>
        )}
        {tilstand.fase === "klar" && tilstand.forslag.length > 0 && (
          <ul className="mt-2 space-y-2">
            {tilstand.forslag.map((f) => {
              const aktiv = valgt === `${f.dato}|${f.bilId}`;
              return (
                <li key={`${f.dato}|${f.bilId}`}>
                  <button
                    type="button"
                    aria-pressed={aktiv}
                    onClick={() => { setValgt(`${f.dato}|${f.bilId}`); onVaelg({ dato: f.dato, bilId: f.bilId }); }}
                    className={`w-full text-left rounded-lg border px-3 py-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand transition-colors ${aktiv ? "border-brand bg-panel" : "border-line hover:border-brand"}`}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                      {f.beslutning === "ok" ? <CheckCircle2 size={14} className="text-success shrink-0" aria-hidden="true" /> : <AlertTriangle size={14} className="text-ink shrink-0" aria-hidden="true" />}
                      {formatLongDate(f.dato)} · {f.bilNavn || "Bil"}
                    </span>
                    <span className="block text-[11px] text-muted mt-0.5">
                      {f.beslutning === "ok" ? "Der er plads" : "Kan blive stramt"}
                      {f.ekstraMin !== null ? ` · tilføjer ca. ${f.ekstraMin} min.` : ""}
                      {f.ekstraKm !== null && f.ekstraKm > 0 ? ` og ${f.ekstraKm} km` : ""}
                      {f.omlastninger > 0 ? ` · ${f.omlastninger === 1 ? "én omlastning" : `${f.omlastninger} omlastninger`}` : ""}
                      {f.rute === "skoen" ? " · køretid er et skøn" : ""}
                    </span>
                    {f.advarsler.length > 0 && <span className="block text-[11px] text-ink mt-0.5">{f.advarsler.join(" ")}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {tilstand.fase === "klar" && tilstand.noter.map((n) => <p key={n} className="text-[11px] text-muted mt-1">{n}</p>)}
        {valgt && <p role="status" className="text-[11px] text-muted mt-2">Dato og bil er lagt ind ovenfor. Tryk "Gem ændringer" for at ombooke sagen.</p>}
      </div>
    </section>
  );
}

export { KapacitetsForslag };
