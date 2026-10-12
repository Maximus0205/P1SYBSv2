// UI til "Delvist afsluttet" (oktober 2026) - logikken ligger i lib/delvisAfsluttet.js.
import React from "react";
import { Check, X, CalendarCheck2 } from "lucide-react";
import { lineItemLabel } from "../data/domain";
import { resterendeLinjer, delvisHistorik, koertAfTekst } from "../lib/delvisAfsluttet";

const dagTekst = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" });
};

// Montørens panel: vælg hvilke varer der ER udført (mindst én, ikke alle) + en påkrævet begrundelse.
export function DelvisPanel({ order, onSubmit, onCancel }) {
  const rest = resterendeLinjer(order);
  const [valgte, setValgte] = React.useState(() => new Set());
  const [note, setNote] = React.useState("");
  const [fejl, setFejl] = React.useState("");
  const alle = valgte.size >= rest.length;
  const kanGemme = valgte.size > 0 && !alle && note.trim().length > 0;
  const toggle = (id) => setValgte((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const gem = () => {
    if (!kanGemme) return;
    const ok = onSubmit({ udfoerteLinjeIds: [...valgte], note });
    if (ok === false) setFejl("Kunne ikke gemme — sagen er måske ændret. Prøv igen.");
  };
  return (
    <div className="rounded-xl bg-white border border-brand p-4 mb-4 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-brand mb-1 flex items-center gap-1.5"><CalendarCheck2 size={14} aria-hidden="true" /> Delvist afsluttet</h3>
      <p className="text-xs text-muted mb-3">
        Vælg de varer, du HAR udført. Resten bliver på sagen, som flyttes til Planlægning ("Skal planlægges"), og {order.oprettetAf?.navn || "sælgeren"} får besked. Der oprettes ingen ny sag.{order.stemplerInd ? " Tiden på opgaven sættes på pause." : ""}
      </p>
      <fieldset className="mb-3">
        <legend className="text-xs font-semibold uppercase tracking-wide text-muted mb-1.5">Udført</legend>
        <div className="space-y-1.5">
          {rest.map((v) => (
            <label key={v.id} className="flex items-center gap-3 rounded-lg border border-line bg-panel px-3 min-h-[44px] cursor-pointer has-[:checked]:border-success has-[:checked]:bg-success/10">
              <input type="checkbox" checked={valgte.has(v.id)} onChange={() => toggle(v.id)} className="w-5 h-5 accent-[#2E7D32] shrink-0" />
              <span className="text-sm text-ink">{lineItemLabel(v)}</span>
            </label>
          ))}
        </div>
        {alle && rest.length > 0 && <p role="alert" className="text-xs text-danger mt-1.5">Alle varer er valgt — brug i stedet "Færdigmeld".</p>}
      </fieldset>
      <label htmlFor="delvis-note" className="text-xs font-semibold uppercase tracking-wide text-muted block mb-1">Hvorfor mangler resten?</label>
      <textarea
        id="delvis-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3}
        placeholder="Fx ovnen kom ikke med, skal bestilles — kunden kontaktes..."
        className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand mb-3"
      />
      {fejl && <p role="alert" className="text-xs text-danger mb-2">{fejl}</p>}
      <div className="flex gap-2 flex-wrap">
        <button onClick={gem} disabled={!kanGemme} className="px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-brand hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ink transition-opacity flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none">
          <Check size={14} aria-hidden="true" /> Meld delvist afsluttet
        </button>
        <button onClick={onCancel} className="px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-muted focus:outline-none focus:ring-2 focus:ring-muted transition-colors flex items-center gap-1.5"><X size={14} aria-hidden="true" /> Annuller</button>
      </div>
    </div>
  );
}

// Historikken på sagen: hvem (bil + montører) der kørte, hvad der blev udført, og hvorfor resten udestår.
// Vises for både montør og sælger/admin, nyeste først.
export function DelvisBanner({ order, ventendePaaDato }) {
  const hist = delvisHistorik(order);
  if (hist.length === 0) return null;
  const label = (id) => { const v = (order.varelinjer || []).find((x) => x.id === id); return v ? lineItemLabel(v) : null; };
  return (
    <div className="mt-2.5 rounded-lg bg-brand/10 border border-brand px-3 py-2" role="region" aria-label="Delvist afsluttet">
      <p className="text-sm font-semibold text-brand flex items-center gap-1.5"><CalendarCheck2 size={14} className="shrink-0" aria-hidden="true" /> Delvist afsluttet{ventendePaaDato ? " — venter på ny dato" : ""}</p>
      <ul className="mt-1 space-y-1.5">
        {[...hist].reverse().map((h) => {
          const udfoert = (h.udfoerteLinjer || []).map(label).filter(Boolean);
          const hvem = koertAfTekst(h);
          return (
            <li key={h.id} className="text-xs text-ink">
              <span className="font-semibold">{dagTekst(h.tid)}</span>{hvem ? ` · ${hvem}` : ""}
              {udfoert.length > 0 && <span className="block text-muted">Udført: {udfoert.join(", ")}</span>}
              <span className="block">{h.note}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DelvisBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md border border-brand text-brand">
      <CalendarCheck2 size={9} aria-hidden="true" /> Delvist afsluttet
    </span>
  );
}
