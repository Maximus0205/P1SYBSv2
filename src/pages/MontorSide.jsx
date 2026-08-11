import React from "react";
import { RefreshCw, Truck, KeyRound, Clock } from "lucide-react";
import { buildTitle as dannTitel, isToday as erIDag, formatLongDate as formatDatoLang, formatDuration as formatVarighed, technicianColor as montorFarve, keyAccessText as noegleTekst, orderExpectedMinutes as sagForventetMinutter, totalMinutes as totalMinutter } from "../data/domain";
import { StatusBadge, LineItemPills, DateSelector } from "../components/common";

function MontorVaelger({ montorer, onVaelg }) {
  return (
    <div>
      <p className="font-mono text-[11px] tracking-widest uppercase text-[#E2621B] mb-1">Montør-visning</p>
      <h1 className="font-['Barlow_Condensed'] text-3xl uppercase tracking-tight text-[#1C232E] mb-6">Vælg montør at se</h1>
      {montorer.length === 0 ? (
        <p className="text-sm text-[#52697E] italic">Ingen montører oprettet endnu — opret under fanen "Admin".</p>
      ) : (
        <div className="space-y-2">
          {montorer.map((m) => (
            <button key={m.id} onClick={() => onVaelg(m.id)} className="w-full text-left bg-white border border-[#D8D0BE] hover:border-[#E2621B] transition-colors p-4 flex items-center gap-3">
              <Truck size={18} style={{ color: montorFarve(m.id, montorer) }} />
              <div>
                <p className="font-semibold text-[#1C232E]">{m.navn}</p>
                <p className="text-sm text-[#52697E]">{m.bil}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MontorRuteView({ sager, montor, valgtDato, onSkiftDato, onOpen, onCycleStatus, onSkift, onRefresh, refreshing }) {
  const mineSager = sager.filter((s) => s.montorId === montor.id && s.dato === valgtDato).sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  const afsluttede = mineSager.filter((s) => s.status === "afsluttet").length;

  return (
    <div>
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-widest uppercase text-[#E2621B] mb-1">{formatDatoLang(valgtDato)}</p>
          <h1 className="font-['Barlow_Condensed'] text-4xl uppercase tracking-tight text-[#1C232E]">{erIDag(valgtDato) ? "Dagens rute" : "Rute"}</h1>
          <p className="text-sm text-[#52697E] mt-1">{montor.navn} · {montor.bil}</p>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-[#52697E]">{mineSager.length} sager · {afsluttede} afsluttet</p>
            <DateSelector date={valgtDato} onChange={onSkiftDato} />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onRefresh} className="p-2 text-[#1C232E] border border-[#D8D0BE] hover:border-[#E2621B] hover:text-[#E2621B] transition-colors" title="Opdater">
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </button>
          {onSkift && (
            <button onClick={onSkift} className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-[#52697E] border border-[#D8D0BE] hover:border-[#52697E] transition-colors">
              Skift montør
            </button>
          )}
        </div>
      </div>

      {mineSager.length === 0 ? (
        <p className="text-sm text-[#52697E] italic">Ingen sager booket på din bil denne dag endnu.</p>
      ) : (
        <div className="relative pl-8">
          <div className="absolute left-[7px] top-2 bottom-2 w-[2px]" style={{ background: "#D8D0BE" }} />
          {mineSager.map((s) => (
            <div key={s.id} className="relative mb-4">
              <div className="absolute -left-8 top-5 w-4 h-4 rounded-full border-2 bg-[#F3EFE6]" style={{ borderColor: STATUS_COLOR(s.status) }} />
              <div onClick={() => onOpen(s.id)} className="cursor-pointer bg-white border border-[#D8D0BE] hover:border-[#1C232E] transition-colors p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-baseline gap-4 min-w-0">
                    <span className="font-mono text-lg text-[#52697E] shrink-0">{s.start}–{s.slut}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-[#1C232E] truncate">{dannTitel(s.varelinjer)}</p>
                      <p className="text-sm text-[#52697E] truncate">{s.kunde.navn} · {s.kunde.adresse}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {s.stemplerInd ? (
                      <span className="font-mono text-[11px] text-[#E2621B] flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#E2621B] animate-pulse" /> stemplet ind
                      </span>
                    ) : totalMinutter(s) > 0 ? (
                      <span className="font-mono text-[11px] text-[#52697E]">{formatVarighed(totalMinutter(s))}</span>
                    ) : (
                      <span className="font-mono text-[11px] text-[#52697E] flex items-center gap-1" title="Forventet tidsforbrug"><Clock size={10} /> {formatVarighed(sagForventetMinutter(s))}</span>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); onCycleStatus(s.id); }}><StatusBadge status={s.status} /></button>
                  </div>
                </div>
                {s.noegle?.kraeves && (
                  <p className="text-xs text-[#E2621B] mt-2 font-semibold flex items-center gap-1.5"><KeyRound size={13} /> {noegleTekst(s.noegle)}</p>
                )}
                {s.kunde.leveringsnote && <p className="text-xs text-[#E2621B] mt-1 font-medium">⚠ {s.kunde.leveringsnote}</p>}
                {s.koeber && <p className="text-xs text-[#52697E] mt-1">Køber: {s.koeber.navn}</p>}
                <div className="mt-3 pt-3 border-t border-[#F0EBDD]"><LineItemPills order={s} /></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Side: Lager / Ordrepluk ----------------



export { MontorVaelger, MontorRuteView };
