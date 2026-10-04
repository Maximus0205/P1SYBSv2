import React, { useState } from "react";
import { Clock } from "lucide-react";
import { kladdeEtiket, tidTekst } from "../lib/orderDrafts";

// Parkerede bookinger ("kladder") - ufærdige sager, der blev afbrudt og kan
// genoptages præcis, hvor man slap. Se lib/orderDrafts.js.
//
// Kassér kræver et ekstra tryk: en kladde er tastet arbejde, og et uheldigt tryk
// på mobil må ikke fjerne den.
function OrderDrafts({ kladder, onResume, onDiscard, antalTrin = 4 }) {
  const [bekraeft, setBekraeft] = useState(null);
  if (!kladder || kladder.length === 0) return null;

  return (
    <div className="rounded-xl border border-brand bg-white p-4 mb-6 shadow-sm" role="region" aria-label="Parkerede bookinger">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1 flex items-center gap-1.5">
        <Clock size={15} className="text-brand shrink-0" aria-hidden="true" />
        Parkerede bookinger ({kladder.length})
      </h2>
      <p className="text-xs text-muted mb-3">Ufærdige sager, der blev afbrudt. Fortsæt, hvor du slap — de gemmes på denne enhed i op til 14 dage.</p>
      <ul className="space-y-2">
        {kladder.map((k) => {
          const { navn, linje2 } = kladdeEtiket(k);
          const sikker = bekraeft === k.id;
          return (
            <li key={k.id} className="rounded-lg border border-line bg-panel p-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{navn}</p>
                  {linje2 && <p className="text-xs text-muted truncate">{linje2}</p>}
                  <p className="text-[11px] text-muted mt-0.5">Trin {Math.min((k.step || 0) + 1, antalTrin)} af {antalTrin} · gemt {tidTekst(k.savedAt)}</p>
                </div>
                {sikker ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-danger font-semibold">Kassér kladden?</span>
                    <button type="button" onClick={() => { setBekraeft(null); onDiscard(k); }} className="min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-danger hover:bg-ink focus:outline-none focus:ring-2 focus:ring-ink">Ja, kassér</button>
                    <button type="button" onClick={() => setBekraeft(null)} className="min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide text-muted border border-line hover:border-muted focus:outline-none focus:ring-2 focus:ring-muted">Behold</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => onResume(k)} className="min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors">Fortsæt</button>
                    <button type="button" onClick={() => setBekraeft(k.id)} aria-label={`Kassér kladden for ${navn}`} className="min-h-[44px] px-3 rounded-lg text-xs font-semibold uppercase tracking-wide text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger">Kassér</button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export { OrderDrafts };
