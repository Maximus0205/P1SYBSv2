import React, { useState } from "react";
import { isToday as erIDag, formatLongDate as formatDatoLang } from "../data/domain";
import { DatoVaelger } from "../components/common";
import { NyeSagForm } from "../components/NyeSagForm";
import { CsvImport } from "../components/CsvImport";
import { SagKortKompakt } from "../components/SagKortKompakt";

function SalgSide({ sager, montorer, varetyper, varekategorier, primaerydelser, tillaegsydelser, valgtDato, onSkiftDato, onOpen, onAdd, onImport, butikFokus }) {
  const [panel, setPanel] = useState("ny");
  const sorter = (a, b) => (a.start || "").localeCompare(b.start || "");
  const dagensSager = sager.filter((s) => s.dato === valgtDato).sort(sorter);

  return (
    <div>
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-widest uppercase text-[#E2621B] mb-1">{formatDatoLang(valgtDato)}</p>
          <h1 className="font-['Barlow_Condensed'] text-4xl uppercase tracking-tight text-[#1C232E]">Salg &amp; ordrebooking</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-[#52697E]">{dagensSager.length} sager</p>
            <DatoVaelger dato={valgtDato} onSkift={onSkiftDato} />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setPanel(panel === "import" ? null : "import")} className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-[#1C232E] border border-[#1C232E] hover:border-[#E2621B] hover:text-[#E2621B] transition-colors">
            Importér CSV
          </button>
          <button onClick={() => setPanel(panel === "ny" ? null : "ny")} className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors">
            + Book sag
          </button>
        </div>
      </div>

      {panel === "ny" && <div className="mb-6"><NyeSagForm montorer={montorer} varetyper={varetyper} varekategorier={varekategorier} primaerydelser={primaerydelser} tillaegsydelser={tillaegsydelser} sager={sager} valgtDato={valgtDato} onAdd={onAdd} onClose={() => setPanel(null)} butikFokus={butikFokus} /></div>}
      {panel === "import" && <div className="mb-6"><CsvImport montorer={montorer} varetyper={varetyper} primaerydelser={primaerydelser} onImport={onImport} onClose={() => setPanel(null)} /></div>}

      <h2 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Sager {erIDag(valgtDato) ? "i dag" : `d. ${valgtDato}`}</h2>
      {dagensSager.length === 0 ? (
        <p className="text-sm text-[#52697E] italic">Ingen sager booket på denne dato endnu.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2">
          {dagensSager.map((s) => (
            <SagKortKompakt key={s.id} sag={s} montorer={montorer} onOpen={onOpen} onCycleStatus={() => {}} />
          ))}
        </div>
      )}
    </div>
  );
}

export { SalgSide };
