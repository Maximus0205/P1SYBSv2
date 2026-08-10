import React from "react";
import { ChevronLeft, ChevronRight, Calendar, KeyRound } from "lucide-react";
import { isToday as erIDag, addDays as flytDato, keyAccessText as noegleTekst, STATUS_META as statusMeta, todayISO, lineItemLabel as varelinjeLabel, serviceIcon as ydelseIkon } from "../data/domain";

function StatusBadge({ status }) {
  const m = statusMeta[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase px-2 py-0.5" style={{ color: m.color, border: `1px solid ${m.color}` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

function YdelsePille({ ydelse }) {
  const Icon = ydelseIkon(ydelse.navn);
  return (
    <span
      className="inline-flex items-center text-[11px] px-2 py-0.5 gap-1 border font-medium"
      style={{
        borderColor: ydelse.udfoert ? "#3D7A5C" : "#E2621B",
        color: ydelse.udfoert ? "#3D7A5C" : "#E2621B",
        background: ydelse.udfoert ? "#3D7A5C10" : "#E2621B10",
        textDecoration: ydelse.udfoert ? "line-through" : "none",
      }}
    >
      <Icon size={11} strokeWidth={2.5} />
      {ydelse.navn}
    </span>
  );
}

function NoeglePille({ noegle }) {
  if (!noegle || !noegle.kraeves) return null;
  return (
    <span className="inline-flex items-center text-[11px] px-2 py-0.5 gap-1 border font-semibold border-[#E2621B] text-[#E2621B] bg-[#E2621B10]">
      <KeyRound size={11} strokeWidth={2.5} />
      {noegleTekst(noegle)}
    </span>
  );
}

function VarelinjePiller({ sag }) {
  if (!sag.varelinjer || sag.varelinjer.length === 0) return null;
  return (
    <div className="space-y-1">
      {sag.noegle?.kraeves && (
        <div className="flex flex-wrap items-center gap-1.5"><NoeglePille noegle={sag.noegle} /></div>
      )}
      {sag.varelinjer.map((v) => (
        <div key={v.id} className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 border border-[#52697E] text-[#52697E]">{varelinjeLabel(v)}</span>
          {(v.tillaeg || []).map((y) => <YdelsePille key={y.id} ydelse={y} />)}
        </div>
      ))}
    </div>
  );
}

function DatoVaelger({ dato, onSkift }) {
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={() => onSkift(flytDato(dato, -1))} className="p-1.5 text-[#52697E] hover:text-[#E2621B] border border-[#D8D0BE] hover:border-[#E2621B] transition-colors" title="Forrige dag">
        <ChevronLeft size={15} />
      </button>
      <div className="relative">
        <Calendar size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#52697E] pointer-events-none" />
        <input type="date" value={dato} onChange={(e) => e.target.value && onSkift(e.target.value)} className="border border-[#D8D0BE] bg-white pl-7 pr-2 py-1.5 text-sm text-[#1C232E] font-mono focus:outline-none focus:border-[#E2621B]" />
      </div>
      <button onClick={() => onSkift(flytDato(dato, 1))} className="p-1.5 text-[#52697E] hover:text-[#E2621B] border border-[#D8D0BE] hover:border-[#E2621B] transition-colors" title="Næste dag">
        <ChevronRight size={15} />
      </button>
      {!erIDag(dato) && (
        <button onClick={() => onSkift(todayISO())} className="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#E2621B] border border-[#E2621B] hover:bg-[#E2621B] hover:text-white transition-colors">
          I dag
        </button>
      )}
    </div>
  );
}



export { StatusBadge, YdelsePille, NoeglePille, VarelinjePiller, DatoVaelger };
