import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Info } from "lucide-react";
import { byggTjekBody, koerKapacitetTjek } from "../lib/kapacitetTjek";

// Viser kapacitetsmotorens vurdering af den valgte dato/bil/vare-kombination under bookingens "Tidspunkt & bil".
// Rådgivende: tjenestefejl blokerer aldrig. Kun regler på niveau "krav" blokerer - og kun for brugere uden retten
// "overstyr_kapacitet". Der vises aldrig mål eller vægt (de forlader aldrig serveren).
// onStatus({ blokeret, overrulet, regler }) bruges af formularen til at slå "Book" fra og logge en overrulning.
const FORSINKELSE_MS = 700;

function KapacitetsTjek({ dato, bilId, adresse, minutter, tidsrumId, varelinjer, sagId, onStatus }) {
  const [tilstand, setTilstand] = useState({ fase: "ingen" });
  const [overrulet, setOverrulet] = useState(false);
  const loebeNr = useRef(0);

  const noegle = JSON.stringify([dato, bilId, adresse, minutter, tidsrumId, sagId, (varelinjer || []).map((l) => [l.id, l.punkt1Id, l.maerke, l.model, l.varetypeNavn])]);

  useEffect(() => {
    if (!dato || !bilId) { setTilstand({ fase: "ingen" }); return undefined; }
    const nr = ++loebeNr.current;
    setTilstand((t) => ({ fase: "henter", forrige: t.svar || t.forrige }));
    setOverrulet(false);
    const timer = setTimeout(async () => {
      const r = await koerKapacitetTjek(byggTjekBody({ dato, bilId, sagId, adresse, minutter, tidsrumId, varelinjer }));
      if (nr !== loebeNr.current) return; // forældet svar
      setTilstand(r.ok ? { fase: "klar", svar: r.svar } : { fase: "fejl", fejl: r.fejl });
    }, FORSINKELSE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noegle]);

  const svar = tilstand.fase === "klar" ? tilstand.svar : null;
  const blokeret = svar?.beslutning === "blokeret";
  const regler = blokeret ? svar.meddelelser.filter((m) => m.niveau === "krav").map((m) => m.regel) : [];

  useEffect(() => {
    if (onStatus) onStatus({ blokeret: tilstand.fase === "henter" ? tilstand.forrige?.beslutning === "blokeret" : blokeret && !overrulet, overrulet: blokeret && overrulet, regler });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tilstand, overrulet]);

  useEffect(() => () => { if (onStatus) onStatus({ blokeret: false, overrulet: false, regler: [] }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (tilstand.fase === "ingen") return null;
  if (tilstand.fase === "henter") {
    return (
      <p role="status" className="text-xs text-muted flex items-center gap-1.5 mt-2">
        <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Tjekker kapacitet…
      </p>
    );
  }
  if (tilstand.fase === "fejl") {
    return (
      <p role="status" className="text-xs text-muted flex items-start gap-1.5 mt-2">
        <Info size={13} className="shrink-0 mt-0.5" aria-hidden="true" /> {tilstand.fejl} Du kan stadig booke.
      </p>
    );
  }

  const farve = blokeret ? "border-danger" : svar.beslutning === "advarsel" ? "border-line" : "border-success";
  return (
    <div className={`mt-3 rounded-xl border-2 ${farve} bg-white p-3`} role={blokeret ? "alert" : "status"}>
      <p className={`text-sm font-semibold flex items-center gap-1.5 ${blokeret ? "text-danger" : svar.beslutning === "ok" ? "text-success" : "text-ink"}`}>
        {svar.beslutning === "ok"
          ? <CheckCircle2 size={15} aria-hidden="true" />
          : <AlertTriangle size={15} aria-hidden="true" />}
        {blokeret ? "Kapaciteten rækker ikke" : svar.beslutning === "advarsel" ? "Pas på – kan blive stramt" : "Der er plads til sagen"}
      </p>
      {svar.meddelelser.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {svar.meddelelser.map((m) => (
            <li key={`${m.regel}-${m.niveau}`} className="text-xs text-ink">{m.tekst}</li>
          ))}
        </ul>
      )}
      {svar.ekstra && (svar.ekstra.min > 0 || svar.ekstra.km > 0) && (
        <p className="text-xs text-muted mt-1.5">Sagen tilføjer ca. {Math.round(svar.ekstra.min)} min.{svar.ekstra.km === null ? "" : ` og ${Math.round(svar.ekstra.km)} km`} til bilens dag.</p>
      )}
      {svar.noter.map((n) => <p key={n} className="text-[11px] text-muted mt-1">{n}</p>)}
      {blokeret && (
        svar.kanOverrule ? (
          <label className="mt-2 flex items-start gap-2 text-xs text-ink min-h-[44px] cursor-pointer">
            <input type="checkbox" checked={overrulet} onChange={(e) => setOverrulet(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
            <span>Jeg overruler kapacitetsmotoren og booker alligevel. Det noteres på sagen.</span>
          </label>
        ) : (
          <p className="text-xs text-danger mt-2">Vælg en anden dato/bil, eller bed en kollega med ret til at overstyre kapaciteten om at booke.</p>
        )
      )}
    </div>
  );
}

export { KapacitetsTjek };
