import React from "react";
import { Clock } from "lucide-react";
import { TIME_SLOTS, buildTitle, formatDuration, orderExpectedMinutes } from "../data/domain";
import { StatusBadge, LineItemPills } from "../components/common";

// accent: valgfri venstre-kantfarve (fx rød ved "kræver handling"), så
// alvor kan vises SOM EN DEL af kortet i stedet for en løsrevet boks
// ovenpå. reason: valgfrit lille node øverst i kortet (fx "Ikke tildelt ·
// 3 dage forsinket") - vises inde i kortet, ikke som separat element.
//
// VIGTIGT om min-w-0: Kortet ligger som CSS grid/flex-element i sine
// forældre (fx grid'et i PlanningPage). Grid- og flex-elementer har som
// standard en usynlig "min-width: auto", som betyder de IKKE må blive
// smallere end deres eget indhold - typisk et <select>, hvis bredde ellers
// bestemmes af den bredeste <option>-tekst. Uden min-w-0 presser kortet
// derfor sig selv (og alt indhold i det) ud over skærmens kant på mobil,
// i stedet for at ombryde/krympe som forventet. Sættes eksplicit her og på
// select-rækken nedenfor.
function OrderCardCompact({ order, technicians, onOpen, onCycleStatus, onAssign, onUpdateTimeSlot, reason, accent }) {
  return (
    <div
      className="bg-white border border-[#D8D0BE] hover:border-[#1C232E] transition-colors p-3 min-w-0 w-full"
      style={accent ? { borderLeftWidth: 4, borderLeftColor: accent } : undefined}
    >
      {reason && <div className="mb-2">{reason}</div>}
      <div className="flex items-start justify-between gap-3">
        <div onClick={() => onOpen(order.id)} className="cursor-pointer min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm text-[#1C232E]">{order.start}–{order.slut}</span>
            <span className="font-mono text-[10px] text-[#D8D0BE]">#{order.nr}</span>
          </div>
          <p className="font-semibold text-sm text-[#1C232E] truncate">{buildTitle(order.varelinjer)}</p>
          <p className="text-xs text-[#52697E] truncate">{order.kunde.navn} · {order.kunde.adresse}</p>
          <p className="text-[10px] text-[#52697E] flex items-center gap-1 mt-0.5"><Clock size={10} /> {formatDuration(orderExpectedMinutes(order))} forventet</p>
        </div>
        <button onClick={() => onCycleStatus(order.id)} className="shrink-0"><StatusBadge status={order.status} /></button>
      </div>
      <div className="mt-2"><LineItemPills order={order} /></div>
      {(onAssign || onUpdateTimeSlot) && (
        <div className="flex flex-col sm:flex-row gap-2 mt-2 pt-2 border-t border-[#F0EBDD] min-w-0">
          {onUpdateTimeSlot && (
            <select value={order.tidsrumId} onChange={(e) => onUpdateTimeSlot(order.id, e.target.value)} className="w-full sm:w-auto min-w-0 text-xs border border-[#D8D0BE] px-1.5 py-1.5 text-[#52697E] focus:outline-none focus:border-[#E2621B]">
              {TIME_SLOTS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          )}
          {onAssign && (
            <select value={order.montorId || ""} onChange={(e) => onAssign(order.id, e.target.value || null)} className={`w-full min-w-0 flex-1 text-xs border px-1.5 py-1.5 focus:outline-none focus:border-[#E2621B] ${order.montorId ? "border-[#D8D0BE] text-[#1C232E]" : "border-[#E2621B] text-[#E2621B] font-semibold"}`}>
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
