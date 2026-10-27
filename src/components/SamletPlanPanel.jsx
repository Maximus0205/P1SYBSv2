import React, { useMemo, useRef, useState } from "react";
import { CalendarCheck2, CheckCircle2, Loader2, Sparkles, X } from "lucide-react";
import { addDays, todayISO, formatShortDate, timeSlotById } from "../data/domain";
import { ordreTilStop, hentKapGrundlag, lagerKoordinatAsync } from "../lib/motorStop";
import { samletPlan } from "../lib/samletPlan";

// SAMLET PLAN FOR ALLE UPLANLAGTE SAGER (oktober 2026) - se lib/samletPlan.js for reglerne.
//
// Knappen foreslår en plan for hele bunken af sager UDEN dato (sager med en aftalt dato flyttes aldrig - de kan kun få en bil på deres egen dag, og det sker
// på kortet). Planen er et FORSLAG: intet gemmes, før brugeren trykker "Anvend plan". Sager, der ikke kan placeres inden fristen, vises med årsag og
// forbliver uplanlagte. Køretider er skønnet (luftlinje), så planen kommer hurtigt og uden at bruge rute-tjenesten.

const pause = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const MAKS_DAGE_VIST = 10;
const MAKS_UBEHANDLET_VIST = 8;

function Knap({ children, onClick, primaer, disabled, ...rest }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className={`min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50 ${primaer ? "bg-brand text-white hover:opacity-90" : "border border-line text-muted hover:text-brand hover:border-brand"}`}
      {...rest}
    >{children}</button>
  );
}

function SamletPlanPanel({ items, orders, technicians, vehicles, personnel, timeOff, crew, store, onUpdateBooking }) {
  const [fase, setFase] = useState("hvile"); // hvile | beregner | forhaand | gemmer | faerdig
  const [fremdrift, setFremdrift] = useState({ gjort: 0, total: 0 });
  const [resultat, setResultat] = useState(null);
  const [fejl, setFejl] = useState("");
  const [visAlleDage, setVisAlleDage] = useState(false);
  const [gemt, setGemt] = useState({ gjort: 0, total: 0, sprunget: 0 });
  const stopRef = useRef(false);
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  // Kun sager UDEN dato indgår. Sager med en dato (aftalt med kunden) flyttes aldrig af den samlede plan.
  const uplanlagte = useMemo(() => items.filter((o) => !o.dato && !o.bilId), [items]);
  const udenfor = items.length - uplanlagte.length;
  if (uplanlagte.length < 2) return null;

  const navnPaaBil = (id) => technicians.find((t) => t.id === id)?.navn || "Bil";

  const beregn = async () => {
    setFejl(""); setResultat(null); setVisAlleDage(false); stopRef.current = false;
    setFase("beregner"); setFremdrift({ gjort: 0, total: uplanlagte.length });
    try {
      const grundlag = await hentKapGrundlag(store?.id);
      const lager = await lagerKoordinatAsync(store, grundlag);
      const r = await samletPlan({
        sager: uplanlagte, orders: ordersRef.current, biler: technicians, vehicles, personnel, timeOff, crew, grundlag, lager, ordreTilStop,
        foersteDato: addDays(todayISO(), 1), onProgress: setFremdrift, afbrudt: () => stopRef.current,
      });
      if (r.fejl) { setFejl(r.fejl); setFase("hvile"); return; }
      if (r.afbrudt) { setFase("hvile"); return; }
      setResultat(r); setFase("forhaand");
    } catch (e) {
      setFejl("Planen kunne ikke beregnes lige nu. Prøv igen.");
      setFase("hvile");
    }
  };

  const anvend = async () => {
    if (!resultat) return;
    setFase("gemmer");
    const liste = resultat.tildelinger;
    const t = timeSlotById("heldag");
    let sprunget = 0;
    setGemt({ gjort: 0, total: liste.length, sprunget: 0 });
    for (let i = 0; i < liste.length; i += 8) {
      for (const x of liste.slice(i, i + 8)) {
        // Planlagt af en kollega i mellemtiden? Så røres sagen ikke.
        const nu = ordersRef.current.find((o) => o.id === x.ordreId);
        if (!nu || nu.dato || nu.bilId || nu.status === "afsluttet") { sprunget++; continue; }
        onUpdateBooking(x.ordreId, { dato: x.dato, tidsrumId: nu.tidsrumId || "heldag", start: nu.start || t.start, slut: nu.slut || t.slut, bilId: x.bilId });
      }
      setGemt({ gjort: Math.min(i + 8, liste.length), total: liste.length, sprunget });
      await pause(120); // giver siden og forbindelsen luft
    }
    setFase("faerdig");
  };

  // Oversigt pr. dag: dato -> { bil -> antal }
  const pr = {};
  for (const x of resultat?.tildelinger || []) {
    pr[x.dato] = pr[x.dato] || {};
    pr[x.dato][x.bilId] = (pr[x.dato][x.bilId] || 0) + 1;
  }
  const datoer = Object.keys(pr).sort();
  const viste = visAlleDage ? datoer : datoer.slice(0, MAKS_DAGE_VIST);
  const navnPaaSag = (id) => { const o = orders.find((x) => x.id === id); return o ? `${o.kunde?.navn || "Sag"} #${o.nr}` : id; };
  const km = Math.round((resultat?.tildelinger || []).reduce((a, x) => a + x.ekstraKm, 0));

  return (
    <div className="rounded-xl border border-line bg-white p-3 mb-3">
      {fase === "hvile" && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink flex items-center gap-1.5"><Sparkles size={14} className="text-brand shrink-0" aria-hidden="true" /> Samlet plan for {uplanlagte.length} sager uden dato</p>
            <p className="text-[11px] text-muted mt-0.5">Mest hastende først, samlet pr. egn (Fyn/Jylland), og aldrig efter fristen. Du ser planen, før noget gemmes.{udenfor > 0 ? ` ${udenfor} sager med en aftalt dato indgår ikke.` : ""}</p>
          </div>
          <Knap primaer onClick={beregn}>Foreslå plan</Knap>
        </div>
      )}
      {fejl && <p role="alert" className="text-xs text-danger mt-2">{fejl}</p>}

      {fase === "beregner" && (
        <div className="flex items-center gap-3" role="status" aria-live="polite">
          <Loader2 size={16} className="animate-spin text-brand shrink-0" aria-hidden="true" />
          <p className="text-sm text-ink flex-1">Planlægger... {fremdrift.gjort} af {fremdrift.total} sager</p>
          <Knap onClick={() => { stopRef.current = true; }}>Stop</Knap>
        </div>
      )}

      {fase === "forhaand" && resultat && (
        <div>
          <p className="text-sm font-semibold text-ink">
            Forslag: {resultat.tildelinger.length} af {uplanlagte.length} sager kan placeres
            {resultat.ikkePlaceret.length > 0 && <span className="text-danger"> · {resultat.ikkePlaceret.length} kan ikke</span>}
          </p>
          <p className="text-[11px] text-muted mb-2">Ca. {km} km ekstra kørsel i alt. Køretider er skønnet (luftlinje) - tjek de enkelte dage i ugevisningen bagefter.</p>
          {datoer.length > 0 && (
            <ul className="divide-y divide-divider border border-line rounded-lg mb-2">
              {viste.map((d) => (
                <li key={d} className="px-3 py-2 text-xs flex flex-wrap gap-x-3 gap-y-0.5">
                  <span className="font-semibold text-ink w-24 shrink-0">{formatShortDate(d)}</span>
                  <span className="text-muted">{Object.entries(pr[d]).map(([b, n]) => `${navnPaaBil(b)}: ${n}`).join(" · ")}</span>
                </li>
              ))}
            </ul>
          )}
          {datoer.length > MAKS_DAGE_VIST && (
            <button type="button" onClick={() => setVisAlleDage((v) => !v)} className="text-xs text-brand underline min-h-[44px] mb-1">
              {visAlleDage ? "Vis færre dage" : `Vis alle ${datoer.length} dage`}
            </button>
          )}
          {resultat.ikkePlaceret.length > 0 && (
            <div className="rounded-lg bg-panel p-2.5 mb-2">
              <p className="text-xs font-semibold text-danger mb-1">Kan ikke placeres (forbliver uplanlagte)</p>
              <ul className="space-y-0.5">
                {resultat.ikkePlaceret.slice(0, MAKS_UBEHANDLET_VIST).map((x) => (
                  <li key={x.ordreId} className="text-[11px] text-muted"><span className="text-ink font-medium">{navnPaaSag(x.ordreId)}</span> - {x.aarsag}</li>
                ))}
              </ul>
              {resultat.ikkePlaceret.length > MAKS_UBEHANDLET_VIST && <p className="text-[11px] text-muted mt-1">...og {resultat.ikkePlaceret.length - MAKS_UBEHANDLET_VIST} flere.</p>}
            </div>
          )}
          {resultat.noter.length > 0 && <p className="text-[11px] text-muted mb-2">{resultat.noter.length} bil/dag-kombinationer blev sprunget over (koordinater mangler på en planlagt sag).</p>}
          <div className="flex flex-wrap gap-2">
            <Knap primaer onClick={anvend} disabled={resultat.tildelinger.length === 0}>Anvend plan ({resultat.tildelinger.length} sager)</Knap>
            <Knap onClick={() => { setResultat(null); setFase("hvile"); }}><X size={13} className="inline -mt-0.5 mr-1" aria-hidden="true" />Forkast</Knap>
          </div>
        </div>
      )}

      {fase === "gemmer" && (
        <div className="flex items-center gap-3" role="status" aria-live="polite">
          <Loader2 size={16} className="animate-spin text-brand shrink-0" aria-hidden="true" />
          <p className="text-sm text-ink">Gemmer planen... {gemt.gjort} af {gemt.total}</p>
        </div>
      )}

      {fase === "faerdig" && (
        <div className="flex items-start gap-2" role="status" aria-live="polite">
          <CheckCircle2 size={16} className="text-success shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm text-ink font-semibold">Planen er anvendt på {gemt.total - gemt.sprunget} sager.</p>
            {gemt.sprunget > 0 && <p className="text-[11px] text-muted">{gemt.sprunget} sager var allerede planlagt af andre og blev ikke ændret.</p>}
            <p className="text-[11px] text-muted flex items-center gap-1 mt-0.5"><CalendarCheck2 size={11} aria-hidden="true" /> Se dagene i ugevisningen ovenfor. Resten ligger stadig under "Skal planlægges".</p>
          </div>
          <Knap onClick={() => { setResultat(null); setFase("hvile"); }}>Luk</Knap>
        </div>
      )}
    </div>
  );
}

export { SamletPlanPanel };
