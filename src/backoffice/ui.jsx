import React from "react";
import { Loader2, AlertCircle, Check } from "lucide-react";

// Fælles byggeklodser til backoffice-siderne.
export const felt = "w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink min-h-[44px] focus:outline-none focus:border-bo";
export const label = "block text-xs font-semibold text-muted mb-1";
export const kort = "rounded-xl border border-line bg-white p-4 sm:p-5 shadow-sm mb-4";
export const overskrift = "text-sm font-semibold text-ink mb-3";
export const knapPrim = "min-h-[44px] px-4 rounded-lg text-sm font-semibold text-white bg-bo hover:bg-bo-dark focus:outline-none focus:ring-2 focus:ring-bo transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none";
export const knapSek = "min-h-[44px] px-4 rounded-lg text-sm font-semibold text-ink border border-line hover:border-bo hover:text-bo focus:outline-none focus:ring-2 focus:ring-bo transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none";
export const knapFare = "min-h-[44px] px-4 rounded-lg text-sm font-semibold text-danger border border-danger hover:bg-danger hover:text-white focus:outline-none focus:ring-2 focus:ring-danger transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none";

const STATUS_FARVE = {
  proeve: "bg-info/10 text-info", aktiv: "bg-success/10 text-success", pause: "bg-faint/30 text-muted", opsagt: "bg-danger/10 text-danger",
  kladde: "bg-faint/30 text-muted", udstedt: "bg-info/10 text-info", betalt: "bg-success/10 text-success", annulleret: "bg-danger/10 text-danger",
};
export function Chip({ id, tekst }) { return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_FARVE[id] || "bg-faint/30 text-muted"}`}>{tekst}</span>; }

export function Meddelelse({ fejl, besked }) {
  return (
    <>
      {fejl && <p role="alert" className="text-xs text-danger mt-3 flex items-start gap-1.5"><AlertCircle size={13} className="shrink-0 mt-0.5" aria-hidden="true" /> {fejl}</p>}
      {besked && <p role="status" className="text-xs text-success mt-3 flex items-start gap-1.5"><Check size={13} className="shrink-0 mt-0.5" aria-hidden="true" /> {besked}</p>}
    </>
  );
}
export const Indlaeser = ({ tekst = "Henter..." }) => <p className="text-xs text-muted flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" aria-hidden="true" /> {tekst}</p>;

export function Felt({ id, titel, children, hjaelp }) {
  return (
    <div>
      <label htmlFor={id} className={label}>{titel}</label>
      {children}
      {hjaelp && <p className="text-[11px] text-muted mt-1">{hjaelp}</p>}
    </div>
  );
}

// Brugt/til rådighed som bjælke. til = null betyder ubegrænset/ukendt.
export function Maaler({ titel, brugt, til, enhed = "", detalje }) {
  const b = Number(brugt) || 0;
  const t = til === null || til === undefined ? null : Number(til);
  const pct = t && t > 0 ? Math.min(100, Math.round((b / t) * 100)) : null;
  const fyldt = t !== null && b >= t;
  const tal = (n) => n.toLocaleString("da-DK", { maximumFractionDigits: 2 });
  return (
    <div className="rounded-lg bg-panel px-3 py-2">
      <p className="text-[11px] text-muted">{titel}</p>
      <p className="text-sm text-ink font-semibold">{tal(b)}{enhed ? ` ${enhed}` : ""}{t !== null ? ` af ${tal(t)}${enhed ? ` ${enhed}` : ""}` : ""}{fyldt && <span className="ml-1.5 text-[11px] text-danger font-semibold">Fuldt</span>}</p>
      {pct !== null && <div className="mt-1.5 h-1.5 rounded-full bg-line overflow-hidden" role="img" aria-label={`${pct} procent af ${titel} er brugt`}><div className={`h-full ${pct >= 90 ? "bg-danger" : "bg-bo"}`} style={{ width: `${pct}%` }} /></div>}
      {detalje && <p className="text-[11px] text-muted mt-1">{detalje}</p>}
    </div>
  );
}
