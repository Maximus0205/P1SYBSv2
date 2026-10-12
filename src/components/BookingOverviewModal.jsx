import React, { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, User, Truck, Search, X, Package } from "lucide-react";
import { todayISO, addDays, formatLongDate, lineItemLabel } from "../data/domain";
import { StatusBadge } from "./common";
import {
  bookedeVarer, grupperPrDato, normaliserInterval, opsummerVaretyper, saelgereIOrdrer, filtrerPaaVare, antalPrVare,
} from "../lib/bookingOversigt";

// BOOKEDE VARER (oktober 2026): et vindue åbnet fra en knap på forsiden - ikke en
// fane. Hvilke varer er booket i et valgt tidsrum, og hvor mange af en bestemt
// vare (søg på varenummer) kører i perioden - så der er styr på lager og bestilling.
//
// To visninger af SAMME vindue:
//   - DISPONENT (canSeeAll): alle sælgeres bookinger, filter på sælger, ser hvem
//     der har booket.
//   - SÆLGER: kun de varer, de selv har booket (sagens oprettetAf = dem selv).
//     Afgrænsningen er en VISNINGSAFGRÆNSNING - se noten i lib/bookingOversigt.js.
function BookingOverviewModal({ orders, technicians, profile, canSeeAll, onOpen, onClose }) {
  const [fra, setFra] = useState(todayISO());
  const [til, setTil] = useState(addDays(todayISO(), 6));
  const [saelgerId, setSaelgerId] = useState("");
  const [soeg, setSoeg] = useState("");
  const dialogRef = useRef(null);

  // Tastatur og fokus: Escape lukker, fokus flyttes ind i vinduet, og siden bagved
  // kan ikke rulle med. Fokus gives tilbage til knappen, der åbnede vinduet.
  useEffect(() => {
    const tidligere = document.activeElement;
    dialogRef.current?.focus();
    const overflowFoer = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflowFoer;
      if (tidligere && typeof tidligere.focus === "function") tidligere.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const interval = normaliserInterval(fra, til);

  // En sælgers egen visning kan ikke udvides af et filter: id'et er altid deres eget.
  const effektivSaelgerId = canSeeAll ? saelgerId : profile.id;

  const iPerioden = useMemo(
    () => bookedeVarer(orders, { fra, til, saelgerId: effektivSaelgerId }),
    [orders, fra, til, effektivSaelgerId]
  );
  const rows = useMemo(() => filtrerPaaVare(iPerioden, soeg), [iPerioden, soeg]);
  const harSoegning = soeg.trim().length > 0;

  const grupper = useMemo(() => grupperPrDato(rows), [rows]);
  const varetyper = useMemo(() => opsummerVaretyper(rows), [rows]);
  const prVare = useMemo(() => antalPrVare(rows), [rows]);
  const saelgere = useMemo(() => (canSeeAll ? saelgereIOrdrer(orders) : []), [orders, canSeeAll]);
  const bilNavn = (id) => technicians.find((t) => t.id === id)?.navn || null;
  const antalSager = useMemo(() => new Set(rows.map((r) => r.orderId)).size, [rows]);
  const aabn = (id) => { onClose(); onOpen(id); };

  const inputCls = "w-full rounded-lg border border-line bg-panel pl-8 pr-3 py-2.5 text-sm text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand";

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-stretch sm:items-center justify-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="booking-titel"
        className="bg-paper w-full sm:max-w-4xl sm:rounded-xl shadow-xl flex flex-col max-h-full sm:max-h-[90vh] focus:outline-none"
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-line bg-white sm:rounded-t-xl">
          <div className="min-w-0">
            <p className="font-mono text-[11px] tracking-widest uppercase text-brand">Overblik</p>
            <h2 id="booking-titel" className="font-display text-2xl sm:text-3xl uppercase tracking-tight text-ink">Bookede varer</h2>
            <p className="text-xs text-muted mt-0.5">
              {canSeeAll ? "Alle sælgeres bookinger i tidsrummet." : "Kun de varer, du selv har booket."}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Luk" className="shrink-0 w-11 h-11 rounded-lg border border-line text-muted hover:text-brand hover:border-brand flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-brand">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          <div className="rounded-xl border border-line bg-white p-4 mb-4 shadow-sm">
            <div className={`grid gap-3 ${canSeeAll ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              <label className="text-xs text-muted">
                Fra dato
                <div className="relative mt-1">
                  <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true" />
                  <input type="date" value={fra} onChange={(e) => setFra(e.target.value)} className={`${inputCls} font-mono`} />
                </div>
              </label>
              <label className="text-xs text-muted">
                Til dato
                <div className="relative mt-1">
                  <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true" />
                  <input type="date" value={til} onChange={(e) => setTil(e.target.value)} className={`${inputCls} font-mono`} />
                </div>
              </label>
              {canSeeAll && (
                <label className="text-xs text-muted">
                  Sælger
                  <div className="relative mt-1">
                    <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true" />
                    <select value={saelgerId} onChange={(e) => setSaelgerId(e.target.value)} className={inputCls}>
                      <option value="">Alle sælgere</option>
                      {saelgere.map((s) => <option key={s.id} value={s.id}>{s.navn}</option>)}
                    </select>
                  </div>
                </label>
              )}
            </div>
            <label className="text-xs text-muted block mt-3">
              Søg på varenummer (eller mærke/model)
              <div className="relative mt-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true" />
                <input type="search" inputMode="search" value={soeg} onChange={(e) => setSoeg(e.target.value)} placeholder="Fx 4003281" className={`${inputCls} font-mono`} />
              </div>
            </label>
            {interval.byttet && (
              <p role="status" className="mt-3 text-xs text-muted">Datoerne stod i omvendt rækkefølge og er byttet om i visningen.</p>
            )}
          </div>

          <p className="text-xs text-muted mb-3" aria-live="polite">
            {rows.length === 0
              ? (harSoegning ? "Ingen varer matcher søgningen i det valgte tidsrum." : "Ingen varer booket i det valgte tidsrum.")
              : `${rows.length} ${rows.length === 1 ? "vare" : "varer"} på ${antalSager} ${antalSager === 1 ? "sag" : "sager"}`}
          </p>

          {harSoegning && prVare.length > 0 && (
            <div className="rounded-xl border border-line bg-white p-4 mb-5 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5">
                <Package size={13} aria-hidden="true" /> Antal i tidsrummet
              </p>
              <ul className="divide-y divide-divider">
                {prVare.map((v) => (
                  <li key={v.noegle} className="py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink break-words">{v.navn}</p>
                      <p className="font-mono text-[11px] text-muted">{v.varenr ? `Varenr. ${v.varenr}` : "Uden varenummer"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-display text-2xl text-ink leading-none">{v.antal}</p>
                      <p className="text-[10px] text-muted mt-1">{v.kommende} til levering · {v.leveret} leveret</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!harSoegning && varetyper.length > 0 && (
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
                <h3 className="font-mono text-[11px] tracking-widest uppercase text-brand mb-2">{formatLongDate(g.dato)}</h3>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {g.rows.map((r) => (
                    <li key={r.key} className="min-w-0">
                      <div className="bg-white rounded-xl border border-[#ECECEC] shadow-sm p-3.5 min-w-0 w-full">
                        <div className="flex items-start justify-between gap-3">
                          <button type="button" onClick={() => aabn(r.orderId)} className="text-left min-w-0 flex-1 focus:outline-none focus:ring-2 focus:ring-brand rounded">
                            <p className="font-semibold text-sm text-ink break-words">{lineItemLabel(r.linje)}</p>
                            {r.linje.punkt1Id && <p className="font-mono text-[11px] text-muted">Varenr. {r.linje.punkt1Id}</p>}
                            {r.linje.primaerYdelse?.navn && <p className="text-xs text-muted">{r.linje.primaerYdelse.navn}</p>}
                            <p className="text-xs text-muted truncate mt-1">{r.kundeNavn}{r.kundeAdresse ? ` · ${r.kundeAdresse}` : ""}</p>
                            <p className="font-mono text-[10px] text-faint mt-1">
                              #{r.nr}{r.start && r.slut ? ` · ${r.start}–${r.slut}` : ""}
                            </p>
                          </button>
                          <div className="shrink-0"><StatusBadge status={r.status} /></div>
                        </div>
                        <div className="mt-2 pt-2 border-t border-divider flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                          {canSeeAll && (
                            <span className="inline-flex items-center gap-1"><User size={11} aria-hidden="true" /> Booket af {r.oprettetAf?.navn || "ukendt"}</span>
                          )}
                          <span className="inline-flex items-center gap-1"><Truck size={11} aria-hidden="true" /> {bilNavn(r.bilId) || "Ingen bil endnu"}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export { BookingOverviewModal };
