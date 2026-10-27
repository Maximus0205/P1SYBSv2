import React from "react";
import { ShieldAlert } from "lucide-react";
import { overrulningTekst } from "../lib/kapacitetOverrulet";

// Synlig markering på en sag, der blev booket trods et blokerende kapacitetstjek (se lib/kapacitetOverrulet.js).
// Planlæggeren og montøren skal kunne se, at sagen kan være stram, og hvem der tog ansvaret.
export function OverrulingsNote({ order }) {
  const t = overrulningTekst(order?.kapacitetOverrulet);
  if (!t) return null;
  return (
    <div role="note" className="rounded-xl border border-brand/40 bg-brand/5 p-3 mb-4 text-sm text-ink">
      <p className="font-semibold flex items-center gap-1.5 text-brand"><ShieldAlert size={15} aria-hidden="true" /> Booket trods kapacitetstjekket</p>
      <p className="text-xs mt-1">Overstyret{t.af ? ` af ${t.af}` : ""}{t.hvornaar ? ` den ${t.hvornaar}` : ""}.</p>
      {t.regler.length > 0 && (
        <ul className="text-xs mt-1 list-disc pl-4">{t.regler.map((r) => <li key={r}>{r}</li>)}</ul>
      )}
    </div>
  );
}
