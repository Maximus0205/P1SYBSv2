import React, { useState } from "react";
import { Printer, Undo2, ScanBarcode } from "lucide-react";
import { RMA_STATUSSER, rmaStatusLabel, lavRma, rettRma, skiftRmaStatus } from "../lib/rma";
import { RmaLabelDialog } from "./UdskrivDialoger";

// RMA-MARKERING PÅ EN VARELINJE (oktober 2026): en vare, der skal hentes retur og følges (afhentet -> på lager -> sendt til leverandør -> afsluttet).
// Gemmes på varelinjen (se lib/rma.js). Alle, der må redigere varelinjer, kan markere og skifte status; label kan udskrives fra sagen.
// props: order, linje, canEdit, butik (navn til labelen), af ({ id, navn }), onSet(lineItemId, rma | null), visUdskriv (false på montørens telefon).
const felt = "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand";
const knap = "min-h-[44px] px-3 rounded-lg text-xs font-semibold uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-brand transition-colors";

export function RmaPanel({ order, linje, canEdit, butik, af, onSet, visUdskriv = true }) {
  const [redigerer, setRedigerer] = useState(false);
  const [aarsag, setAarsag] = useState("");
  const [serienr, setSerienr] = useState("");
  const [label, setLabel] = useState(false);
  const rma = linje.rma;

  const gem = () => {
    if (rma) onSet(linje.id, rettRma(rma, { aarsag, serienr }));
    else onSet(linje.id, lavRma(order, { aarsag, serienr }, new Date().toISOString(), af));
    setRedigerer(false);
  };
  const start = () => { setAarsag(rma?.aarsag || ""); setSerienr(rma?.serienr || ""); setRedigerer(true); };

  if (!rma && !redigerer) {
    if (!canEdit) return null;
    return (
      <div className="pl-2 mt-1">
        <button type="button" onClick={start} className={`${knap} border border-line text-muted hover:border-brand hover:text-brand inline-flex items-center gap-1.5`}>
          <ScanBarcode size={14} aria-hidden="true" /> Marker som RMA-vare
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 ml-2 rounded-lg border border-brand/40 bg-brand/5 p-3" role="group" aria-label={rma ? `RMA ${rma.nr}` : "Ny RMA-markering"}>
      {rma && (
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand"><ScanBarcode size={14} aria-hidden="true" /> RMA-vare · <span className="font-mono">{rma.nr}</span></span>
          <span className="text-[11px] text-muted">{rmaStatusLabel(rma.status)}</span>
        </div>
      )}
      {!redigerer && rma && (
        <>
          {(rma.aarsag || rma.serienr) && <p className="text-xs text-ink mb-1.5">{[rma.aarsag && `Årsag: ${rma.aarsag}`, rma.serienr && `Serienr.: ${rma.serienr}`].filter(Boolean).join(" · ")}</p>}
          {canEdit && (
            <label className="block text-xs text-muted mb-2">Status
              <select value={rma.status} onChange={(e) => { const n = skiftRmaStatus(rma, e.target.value, new Date().toISOString(), af); if (n && n !== rma) onSet(linje.id, n); }} className={`${felt} mt-1 min-h-[44px]`}>
                {RMA_STATUSSER.map((s) => <option key={s.id} value={s.id}>{s.label} – {s.hjaelp}</option>)}
              </select>
            </label>
          )}
          {(rma.historik || []).length > 1 && (
            <ul className="text-[11px] text-muted mb-2 space-y-0.5">
              {rma.historik.map((h, i) => <li key={i}>{rmaStatusLabel(h.status)} · {String(h.tid || "").slice(0, 16).replace("T", " ")}{h.af?.navn ? ` · ${h.af.navn}` : ""}</li>)}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            {visUdskriv && <button type="button" onClick={() => setLabel(true)} className={`${knap} text-white bg-brand hover:bg-brand-dark inline-flex items-center gap-1.5`}><Printer size={14} aria-hidden="true" /> Udskriv label</button>}
            {canEdit && <button type="button" onClick={start} className={`${knap} border border-line text-muted hover:border-brand hover:text-brand`}>Ret årsag / serienr.</button>}
            {canEdit && rma.status === "oprettet" && (
              <button type="button" onClick={() => { if (window.confirm("Fjern RMA-markeringen? Nummeret og historikken slettes.")) onSet(linje.id, null); }} className={`${knap} border border-line text-muted hover:border-danger hover:text-danger inline-flex items-center gap-1.5`}><Undo2 size={14} aria-hidden="true" /> Fjern markering</button>
            )}
          </div>
        </>
      )}
      {redigerer && (
        <div className="space-y-2">
          <label className="block text-xs text-muted">Årsag til RMA
            <input value={aarsag} maxLength={120} onChange={(e) => setAarsag(e.target.value)} placeholder="Fx støjer, lækker, transportskade" className={`${felt} mt-1`} />
          </label>
          <label className="block text-xs text-muted">Serienummer (valgfrit)
            <input value={serienr} maxLength={40} onChange={(e) => setSerienr(e.target.value)} className={`${felt} mt-1`} />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={gem} className={`${knap} text-white bg-brand hover:bg-brand-dark`}>{rma ? "Gem" : "Marker som RMA"}</button>
            <button type="button" onClick={() => setRedigerer(false)} className={`${knap} border border-line text-muted hover:border-muted`}>Annuller</button>
          </div>
        </div>
      )}
      {label && rma && <RmaLabelDialog order={order} linje={linje} butik={butik} onClose={() => setLabel(false)} />}
    </div>
  );
}
