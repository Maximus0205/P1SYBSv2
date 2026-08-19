import React from "react";
import { Clock, CalendarCheck2 } from "lucide-react";
import { TIME_SLOTS, buildTitle, formatDuration, orderExpectedMinutes, formatShortDate, isToday } from "../data/domain";
import { StatusBadge, LineItemPills } from "../components/common";

// accent: valgfri venstre-kantfarve (fx rød ved "kræver handling"), så
// alvor kan vises SOM EN DEL af kortet i stedet for en løsrevet boks
// ovenpå. reason: valgfrit lille node øverst i kortet (fx "Ikke tildelt ·
// 3 dage forsinket") - vises inde i kortet, ikke som separat element.
//
// minimal: skjuler forventet-varighed-linjen og alle varelinje-/tillægs-
// mærker, så kortet kun viser tid, sagsnr., status, overskrift og kunde/
// adresse - til lister hvor pointen er et hurtigt overblik (fx dagens
// sager på Salg), ikke alle detaljer på forhånd. Klik åbner stadig fuld
// sagsdetalje uanset minimal eller ej.
//
// Datoen vises nu ALTID (kort format, fx "18. aug") - kortet bruges ofte i
// lister der spænder over flere dage (Kræver handling, Arkiv, Planlagt
// fremad, Afsluttet), hvor det ellers ikke var til at se, hvilken dag en
// given sag rent faktisk lå på uden at åbne den. Er sagen afsluttet, og
// tidspunktet for det er kendt, vises det som en ekstra lille linje.
//
// Kunde-/adresselinjen viser nu ALTID telefonnummer ud over navn og
// adresse (når det findes) - kortet bruges ofte som eneste overblik i
// lister, og telefonnummeret skal derfor være synligt uden at åbne sagen.
//
// VIGTIGT om min-w-0: Kortet ligger som CSS grid/flex-element i sine
// forældre (fx grid'et i PlanningPage). Grid- og flex-elementer har som
// standard en usynlig "min-width: auto", som betyder de IKKE må blive
// smallere end deres eget indhold - typisk et <select>, hvis bredde ellers
// bestemmes af den bredeste <option>-tekst. Uden min-w-0 presser kortet
// derfor sig selv (og alt indhold i det) ud over skærmens kant på mobil,
// i stedet for at ombryde/krympe som forventet. Sættes eksplicit her og på
// select-rækken nedenfor.
function OrderCardCompact({ order, technicians, onOpen, onCycleStatus, onAssign, onUpdateTimeSlot, reason, accent, minimal }) {
  return (
    <div
      className="bg-white rounded-xl border border-[#ECECEC] shadow-sm hover:shadow-md transition-shadow p-3.5 min-w-0 w-full"
      style={accent ? { borderLeftWidth: 4, borderLeftColor: accent } : undefined}
    >
      {reason && <div className="mb-2">{reason}</div>}
      <div className="flex items-start justify-between gap-3">
        <div onClick={() => onOpen(order.id)} className="cursor-pointer min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-mono text-sm text-ink">{order.start}–{order.slut}</span>
            <span className={`font-mono text-[11px] font-semibold ${isToday(order.dato) ? "text-brand" : "text-muted"}`}>{formatShortDate(order.dato)}</span>
            <span className="font-mono text-[10px] text-faint">#{order.nr}</span>
          </div>
          <p className="font-semibold text-sm text-ink truncate">{buildTitle(order.varelinjer)}</p>
          <p className="text-xs text-muted truncate">{order.kunde.navn} · {order.kunde.adresse}{order.kunde.telefon ? ` · ${order.kunde.telefon}` : ""}</p>
          {!minimal && <p className="text-[10px] text-muted flex items-center gap-1 mt-0.5"><Clock size={10} /> {formatDuration(orderExpectedMinutes(order))} forventet</p>}
          {order.status === "afsluttet" && order.afsluttetTidspunkt && (
            <p className="text-[10px] text-success flex items-center gap-1 mt-0.5"><CalendarCheck2 size={10} /> Afsluttet {formatShortDate(order.afsluttetTidspunkt.slice(0, 10))}</p>
          )}
        </div>
        <button onClick={() => onCycleStatus(order.id)} className="shrink-0"><StatusBadge status={order.status} /></button>
      </div>
      {!minimal && <div className="mt-2"><LineItemPills order={order} /></div>}
      {(onAssign || onUpdateTimeSlot) && (
        <div className="flex flex-col sm:flex-row gap-2 mt-2 pt-2 border-t border-divider min-w-0">
          {onUpdateTimeSlot && (
            <select value={order.tidsrumId} onChange={(e) => onUpdateTimeSlot(order.id, e.target.value)} className="w-full sm:w-auto min-w-0 rounded-lg text-xs border border-line px-2 py-1.5 text-muted focus:outline-none focus:border-brand">
              {TIME_SLOTS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          )}
          {onAssign && (
            <select value={order.montorId || ""} onChange={(e) => onAssign(order.id, e.target.value || null)} className={`w-full min-w-0 flex-1 rounded-lg text-xs border px-2 py-1.5 focus:outline-none focus:border-brand ${order.montorId ? "border-line text-ink" : "border-brand text-brand font-semibold"}`}>
              <option value="">Vælg montør...</option>
              {technicians.map((m) => <option key={m.id} value={m.id}>{m.navn}</option>)}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

export { OrderCardCompact };
