import React, { useMemo, useState } from "react";
import { Calendar, User, Truck } from "lucide-react";
import { todayISO, addDays, formatLongDate, lineItemLabel } from "../data/domain";
import { StatusBadge } from "../components/common";
import { bookedeVarer, grupperPrDato, normaliserInterval, opsummerVaretyper, saelgereIOrdrer } from "../lib/bookingOversigt";

// BOOKINGOVERSIGT (oktober 2026): hvilke varer er booket i et valgt tidsrum?
//
// To visninger af SAMME side:
//   - DISPONENT (rettigheden 'disponent', samt systemadmin): ser alle varer
//     booket i tidsrummet, kan filtrere på sælger, og ser hvem der har booket.
//   - SÆLGER (rettigheden 'salg', uden 'disponent'): ser kun de varer, de
//     selv har booket (sagens oprettetAf = den indloggede bruger).
//
// Afgrænsningen til "egne" sker her i visningen - se noten øverst i
// lib/bookingOversigt.js om, hvorfor det ikke er en sikkerhedsgrænse.
function BookingOverviewPage({ orders, technicians, profile, canSeeAll, onOpen }) {
  const [fra, setFra] = useState(todayISO());
  const [til, setTil] = useState(addDays(todayISO(), 6));
  const [saelgerId, setSaelgerId] = useState("");

  const interval = normaliserInterval(fra, til);

  // Sælgerens egen visning kan ikke udvides af et filter: id'et er altid deres eget.
  const effektivSaelgerId = canSeeAll ? saelgerId : profile.id;

  const rows = useMemo(
    () => bookedeVarer(orders, { fra, til, saelgerId: effektivSaelgerId }),
    [orders, fra, til, effektivSaelgerId]
  );
  const grupper = useMemo(() => grupperPrDato(rows), [rows]);
  const varetyper = useMemo(() => opsummerVaretyper(rows), [rows]);
  const saelgere = useMemo(() => (canSeeAll ? saelgereIOrdrer(orders) : []), [orders, canSeeAll]);
  const bilNavn = (id) => technicians.find((t) => t.id === id)?.navn || null;
  const antalSager = useMemo(() => new Set(rows.map((r) => r.orderId)).size, [rows]);

  return (
    <div>
      <p className="font-mono text-[11px] tracking-widest uppercase text-brand mb-1">Overblik</p>
      <h1 className="font-display text-4xl uppercase tracking-tight text-ink mb-1">Bookinger</h1>
      <p className="text-sm text-muted mb-4">
        {canSeeAll
          ? "Se hvilke varer der er booket i et tidsrum — på tværs af alle sælgere."
          : "Se hvilke varer du selv har booket i et tidsrum."}
      </p>

      <div className="rounded-xl border border-line bg-white p-4 mb-4 shadow-sm">
        <div className={`grid gap-3 ${canSeeAll ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          <label className="text-xs text-muted">
            Fra dato
            <div className="relative mt-1">
              <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true" />
              <input type="date" value={fra} onChange={(e) => setFra(e.target.value)} className="w-full rounded-lg border border-line bg-panel pl-8 pr-3 py-2.5 text-sm text-ink font-mono focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand" />
            </div>
          </label>
          <label className="text-xs text-muted">
            Til dato
            <div className="relative mt-1">
              <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true" />
              <input type="date" value={til} onChange={(e) => setTil(e.target.value)} className="w-full rounded-lg border border-line bg-panel pl-8 pr-3 py-2.5 text-sm text-ink font-mono focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand" />
            </div>
          </label>
          {canSeeAll && (
            <label className="text-xs text-muted">
              Sælger
              <div className="relative mt-1">
                <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true" />
                <select value={saelgerId} onChange={(e) => setSaelgerId(e.target.value)} className="w-full rounded-lg border border-line bg-panel pl-8 pr-3 py-2.5 text-sm text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand">
                  <option value="">Alle sælgere</option>
                  {saelgere.map((s) => <option key={s.id} value={s.id}>{s.navn}</option>)}
                </select>
              </div>
            </label>
          )}
        </div>
        {interval.byttet && (
          <p role="status" className="mt-3 text-xs text-muted">Datoerne stod i omvendt rækkefølge og er byttet om i visningen.</p>
        )}
      </div>

      <p className="text-xs text-muted mb-3" aria-live="polite">
        {rows.length === 0
          ? "Ingen varer booket i det valgte tidsrum."
          : `${rows.length} ${rows.length === 1 ? "vare" : "varer"} på ${antalSager} ${antalSager === 1 ? "sag" : "sager"}`}
      </p>

      {varetyper.length > 0 && (
        <div className="rounded-xl border border-line bg-white p-4 mb-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">Fordelt på varetype</p>
          <ul className="flex flex-wrap gap-2">
            {varetyper.map((v) => (
              <li key={v.navn} className="inline-flex items-center gap-1.5 text-xs rounded-lg border border-line bg-panel px-2.5 py-1.5 text-ink">
                <span className="font-semibold">{v.antal}</span> {v.navn}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-5">
        {grupper.map((g) => (
          <section key={g.dato} aria-label={formatLongDate(g.dato)}>
            <h2 className="font-mono text-[11px] tracking-widest uppercase text-brand mb-2 capitalize">{formatLongDate(g.dato)}</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {g.rows.map((r) => (
                <li key={r.key} className="min-w-0">
                  <div className="bg-white rounded-xl border border-[#ECECEC] shadow-sm p-3.5 min-w-0 w-full">
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" onClick={() => onOpen(r.orderId)} className="text-left min-w-0 flex-1 focus:outline-none focus:ring-2 focus:ring-brand rounded">
                        <p className="font-semibold text-sm text-ink break-words">{lineItemLabel(r.linje)}</p>
                        {r.linje.primaerYdelse?.navn && <p className="text-xs text-muted">{r.linje.primaerYdelse.navn}</p>}
                        <p className="text-xs text-muted truncate mt-1">{r.kundeNavn}{r.kundeAdresse ? ` · ${r.kundeAdresse}` : ""}</p>
                        <p className="font-mono text-[10px] text-faint mt-1">
                          #{r.nr}{r.start && r.slut ? ` · ${r.start}–${r.slut}` : ""}
                        </p>
                      </button>
                      <div className="shrink-0"><StatusBadge status={r.status} /></div>
                    </div>
                    {(canSeeAll || bilNavn(r.bilId)) && (
                      <div className="mt-2 pt-2 border-t border-divider flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                        {canSeeAll && (
                          <span className="inline-flex items-center gap-1"><User size={11} aria-hidden="true" /> Booket af {r.oprettetAf?.navn || "ukendt"}</span>
                        )}
                        <span className="inline-flex items-center gap-1"><Truck size={11} aria-hidden="true" /> {bilNavn(r.bilId) || "Ingen bil endnu"}</span>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export { BookingOverviewPage };
