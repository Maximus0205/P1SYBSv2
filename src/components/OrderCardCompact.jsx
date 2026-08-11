import React from "react";
import { Clock } from "lucide-react";
import { TIME_SLOTS, buildTitle, formatDuration, orderExpectedMinutes } from "../data/domain";
import { StatusBadge, LineItemPills } from "../components/common";

function OrderCardCompact({ order, technicians, onOpen, onCycleStatus, onAssign, onUpdateTimeSlot }) {
  return (
    <div className="bg-white border border-[#D8D0BE] hover:border-[#1C232E] transition-colors p-3">
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
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#F0EBDD]">
          {onUpdateTimeSlot && (
            <select value={order.tidsrumId} onChange={(e) => onUpdateTimeSlot(order.id, e.target.value)} className="text-xs border border-[#D8D0BE] px-1.5 py-1 text-[#52697E] focus:outline-none focus:border-[#E2621B]">
              {TIME_SLOTS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          )}
          {onAssign && (
            <select value={order.montorId || ""} onChange={(e) => onAssign(order.id, e.target.value || null)} className="flex-1 text-xs border border-[#D8D0BE] px-1.5 py-1 text-[#1C232E] focus:outline-none focus:border-[#E2621B]">
              <option value="">Ikke tildelt</option>
              {technicians.map((m) => <option key={m.id} value={m.id}>{m.navn}</option>)}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

export { OrderCardCompact };
