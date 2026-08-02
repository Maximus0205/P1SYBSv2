import React from "react";
import { Clock } from "lucide-react";
import { TIDSRUM, dannTitel, formatVarighed, sagForventetMinutter } from "../data/appData";
import { StatusBadge, VarelinjePiller } from "../components/common";

function SagKortKompakt({ sag, montorer, onOpen, onCycleStatus, onAssign, onUpdateTidsrum }) {
  return (
    <div className="bg-white border border-[#D8D0BE] hover:border-[#1C232E] transition-colors p-3">
      <div className="flex items-start justify-between gap-3">
        <div onClick={() => onOpen(sag.id)} className="cursor-pointer min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm text-[#1C232E]">{sag.start}–{sag.slut}</span>
            <span className="font-mono text-[10px] text-[#D8D0BE]">#{sag.nr}</span>
          </div>
          <p className="font-semibold text-sm text-[#1C232E] truncate">{dannTitel(sag.varelinjer)}</p>
          <p className="text-xs text-[#52697E] truncate">{sag.kunde.navn} · {sag.kunde.adresse}</p>
          <p className="text-[10px] text-[#52697E] flex items-center gap-1 mt-0.5"><Clock size={10} /> {formatVarighed(sagForventetMinutter(sag))} forventet</p>
        </div>
        <button onClick={() => onCycleStatus(sag.id)} className="shrink-0"><StatusBadge status={sag.status} /></button>
      </div>
      <div className="mt-2"><VarelinjePiller sag={sag} /></div>
      {(onAssign || onUpdateTidsrum) && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#F0EBDD]">
          {onUpdateTidsrum && (
            <select value={sag.tidsrumId} onChange={(e) => onUpdateTidsrum(sag.id, e.target.value)} className="text-xs border border-[#D8D0BE] px-1.5 py-1 text-[#52697E] focus:outline-none focus:border-[#E2621B]">
              {TIDSRUM.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          )}
          {onAssign && (
            <select value={sag.montorId || ""} onChange={(e) => onAssign(sag.id, e.target.value || null)} className="flex-1 text-xs border border-[#D8D0BE] px-1.5 py-1 text-[#1C232E] focus:outline-none focus:border-[#E2621B]">
              <option value="">Ikke tildelt</option>
              {montorer.map((m) => <option key={m.id} value={m.id}>{m.navn}</option>)}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------- Side: Salg / Ordrebooking ----------------



export { SagKortKompakt };
