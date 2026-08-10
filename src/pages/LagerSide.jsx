import React from "react";
import { Check, KeyRound } from "lucide-react";
import { buildTitle as dannTitel, formatLongDate as formatDatoLang } from "../data/domain";
import { DatoVaelger } from "../components/common";

function LagerSide({ sager, montorer, valgtDato, onSkiftDato, onTogglePluk, onOpen }) {
  const sorter = (a, b) => (a.start || "").localeCompare(b.start || "");
  const dagensSager = sager.filter((s) => s.dato === valgtDato);
  const mangler = dagensSager.filter((s) => !s.plukket).sort(sorter);
  const klar = dagensSager.filter((s) => s.plukket).sort(sorter);

  const Raekke = ({ s }) => {
    const montor = montorer.find((m) => m.id === s.montorId);
    return (
      <div className="bg-white border border-[#D8D0BE] p-3 flex items-center gap-3">
        <button
          onClick={() => onTogglePluk(s.id)}
          className="w-6 h-6 shrink-0 border-2 flex items-center justify-center transition-colors"
          style={{ borderColor: s.plukket ? "#3D7A5C" : "#D8D0BE", background: s.plukket ? "#3D7A5C" : "white" }}
          title={s.plukket ? "Marker som ikke plukket" : "Marker som plukket"}
        >
          {s.plukket && <Check size={14} color="white" strokeWidth={3} />}
        </button>
        <div onClick={() => onOpen(s.id)} className="min-w-0 flex-1 cursor-pointer">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm text-[#1C232E] truncate">{dannTitel(s.varelinjer)}</p>
            <span className="font-mono text-[10px] text-[#D8D0BE]">#{s.nr}</span>
            {s.noegle?.kraeves && <KeyRound size={12} className="text-[#E2621B] shrink-0" />}
          </div>
          <p className="text-xs text-[#52697E] truncate">{s.kunde.navn} · {s.start}–{s.slut}{montor ? ` · ${montor.navn}` : " · ikke tildelt bil"}</p>
        </div>
      </div>
    );
  };

  return (
    <div>
      <p className="font-mono text-[11px] tracking-widest uppercase text-[#E2621B] mb-1">{formatDatoLang(valgtDato)}</p>
      <h1 className="font-['Barlow_Condensed'] text-4xl uppercase tracking-tight text-[#1C232E] mb-1">Lager & ordrepluk</h1>
      <div className="flex items-center gap-3 mb-6">
        <p className="text-sm text-[#52697E]">{mangler.length} mangler at blive plukket · {klar.length} klar til afhentning</p>
        <DatoVaelger dato={valgtDato} onSkift={onSkiftDato} />
      </div>

      <h2 className="text-sm font-semibold uppercase tracking-wide text-[#E2621B] mb-3 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[#E2621B]" /> Mangler pluk ({mangler.length})
      </h2>
      {mangler.length === 0 ? <p className="text-sm text-[#52697E] italic mb-8">Alt er plukket til denne dags ture.</p> : <div className="space-y-2 mb-8">{mangler.map((s) => <Raekke key={s.id} s={s} />)}</div>}

      <h2 className="text-sm font-semibold uppercase tracking-wide text-[#3D7A5C] mb-3 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[#3D7A5C]" /> Klar til afhentning ({klar.length})
      </h2>
      {klar.length === 0 ? <p className="text-sm text-[#52697E] italic">Ingen endnu.</p> : <div className="space-y-2">{klar.map((s) => <Raekke key={s.id} s={s} />)}</div>}
    </div>
  );
}

// ---------------- Side: Administration ----------------



export { LagerSide };
