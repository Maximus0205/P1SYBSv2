import React, { useState } from "react";
import { Loader2, AlertCircle, Check, Search } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { opretEdgeTransport } from "../adapters/core/edgeTransport";

// TESTRUDE: BRUTTOMÅL OG BRUTTOVÆGT FRA PUNKT1 (oktober 2026, kun systemadmin). Kalder Edge Function "punkt1-produktmaal", som læser selve
// produktsiden på punkt1.dk (siden har intet separat API-kald med målene). Intet gemmes. Funktionen er kun åben for systemadmin, fordi
// målene er forretningsfølsomme og aldrig må kunne ses af sælger eller montør. Svaret viser både de tolkede tal og rå uddrag fra siden,
// så vi kan se, om punkt1 har ændret opbygningen, uden at der gættes.
const transport = opretEdgeTransport({ klient: supabase });
const kort = "rounded-xl border border-line bg-white p-4 shadow-sm";
const felt = "rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink font-mono focus:outline-none focus:border-brand min-w-0";
const cm = (v) => (Number.isFinite(v) ? `${String(v).replace(".", ",")} cm` : "-");
const kg = (v) => (Number.isFinite(v) ? `${String(v).replace(".", ",")} kg` : "-");

function Blok({ titel, d }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">{titel}</p>
      {d ? (
        <p className="text-sm font-mono text-ink">
          {Number.isFinite(d.dybdeCm) ? `${cm(d.dybdeCm)} × ${cm(d.breddeCm)} × ${cm(d.hoejdeCm)} (D × B × H)` : "mål mangler"}
          <br />{kg(d.kg)}
        </p>
      ) : <p className="text-sm text-danger">Ikke fundet på siden</p>}
    </div>
  );
}

function Punkt1MaalTest() {
  const [input, setInput] = useState("https://www.punkt1.dk/point-podw5620w-opvaskemaskine/p-4230288/");
  const [busy, setBusy] = useState(false);
  const [fejl, setFejl] = useState("");
  const [res, setRes] = useState(null);

  const hent = async () => {
    setFejl(""); setRes(null);
    const t = input.trim();
    if (!t) return setFejl("Indtast en adresse eller et produkt-id.");
    setBusy(true);
    const body = /^\d+$/.test(t) ? { productId: t } : { url: t };
    const r = await transport.kald("punkt1-produktmaal", body, { standardFejl: "Kunne ikke hente produktet", logFejl: false });
    setBusy(false);
    if (!r.ok) return setFejl(r.fejl);
    setRes(r.data);
  };

  return (
    <div className={`${kort} mb-6`}>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-ink mb-1">Punkt1: bruttomål og bruttovægt (test)</h4>
      <p className="text-xs text-muted mb-3">Indsæt adressen til en produktside på punkt1.dk (eller kun produkt-id). Kun systemadmin kan bruge det, og intet gemmes.</p>
      <div className="flex gap-2 flex-wrap mb-3">
        <input aria-label="Punkt1-adresse eller produkt-id" value={input} onChange={(e) => setInput(e.target.value)} className={`${felt} flex-1 min-w-[16rem]`} />
        <button onClick={hent} disabled={busy} className="min-h-[44px] px-4 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5 disabled:opacity-60">
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Search size={14} aria-hidden="true" />} Hent mål
        </button>
      </div>
      {fejl && <p role="alert" className="text-xs text-danger mb-2 flex items-center gap-1.5"><AlertCircle size={13} aria-hidden="true" /> {fejl}</p>}
      {res && (
        <div className="space-y-3">
          <p className={`text-sm font-semibold flex items-center gap-1.5 ${res.fundet ? "text-success" : "text-danger"}`}>
            {res.fundet ? <Check size={15} aria-hidden="true" /> : <AlertCircle size={15} aria-hidden="true" />}
            {res.fundet ? `Bruttomål og bruttovægt fundet (produkt ${res.productId})` : "Bruttotallene blev IKKE fundet på siden - se uddragene nedenfor"}
          </p>
          <div className="grid gap-4 sm:grid-cols-2"><Blok titel="Brutto (med emballage)" d={res.brutto} /><Blok titel="Netto (uden emballage)" d={res.netto} /></div>
          {res.motor && <p className="text-xs text-muted font-mono">Til motoren: l {res.motor.maal.l} · b {res.motor.maal.b} · h {res.motor.maal.h} cm · {res.motor.vaegtKg} kg</p>}
          <details className="text-xs text-muted"><summary className="cursor-pointer">Rå uddrag fra siden (til fejlfinding)</summary>
            <pre className="whitespace-pre-wrap break-all mt-2 bg-panel border border-line rounded-lg p-2 max-h-72 overflow-y-auto">{JSON.stringify({ side: res.side, debug: res.debug }, null, 2)}</pre></details>
        </div>
      )}
    </div>
  );
}

export { Punkt1MaalTest };
