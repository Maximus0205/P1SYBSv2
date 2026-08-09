import React, { useState } from "react";
import { KeyRound, Building2, Hash } from "lucide-react";
import { dannTitel, noegleTekst } from "../data/appData";
import { StatusBadge } from "../components/common";
import { VarelinjerDetalje, Noter, Billeder, Rapporter, Tidsregistrering, StempelUr } from "../components/SagDele";

function SagView({ sag, montorer, onBack, addNote, addPhoto, addReport, onCycleStatus, onStempleInd, onStempleUd, onToggleYdelse, onAddYdelse, onRemoveYdelse }) {
  const [tab, setTab] = useState("noter");
  const montor = montorer.find((m) => m.id === sag.montorId);
  const tabs = [
    { key: "noter", label: "Noter", count: sag.noter.length },
    { key: "billeder", label: "Billeder", count: sag.billeder.length },
    { key: "rapporter", label: "Rapporter", count: sag.rapporter.length },
    { key: "tid", label: "Tid", count: sag.logs.length },
  ];

  return (
    <div>
      <button onClick={onBack} className="text-sm text-[#52697E] hover:text-[#E2621B] mb-4 flex items-center gap-1">← Tilbage</button>
      <div className="bg-white border border-[#D8D0BE] p-5 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="font-mono text-xs text-[#52697E] mb-1">
              #{sag.nr} · {sag.start}–{sag.slut}{montor ? ` · ${montor.navn}` : " · ikke tildelt"}
              {sag.ordrenummer && <span className="ml-2 inline-flex items-center gap-0.5"><Hash size={10} /> {sag.ordrenummer}</span>}
            </p>
            <h1 className="font-['Barlow_Condensed'] text-3xl uppercase tracking-tight text-[#1C232E] leading-none">{dannTitel(sag.varelinjer)}</h1>
            <p className="text-sm text-[#52697E] mt-2 font-semibold">Kunde (modtager)</p>
            <p className="text-sm text-[#52697E]">{sag.kunde.navn}{sag.kunde.telefon ? ` · ${sag.kunde.telefon}` : ""}{sag.kunde.email ? ` · ${sag.kunde.email}` : ""}</p>
            <p className="text-sm text-[#52697E]">{sag.kunde.adresse}</p>
            {sag.kunde.leveringsnote && <p className="text-sm text-[#E2621B] font-medium mt-1">⚠ {sag.kunde.leveringsnote}</p>}
            {sag.koeber && (
              <div className="mt-3 pt-3 border-t border-[#F0EBDD]">
                <p className="text-sm text-[#52697E] font-semibold flex items-center gap-1.5"><Building2 size={13} /> Køber (afviger fra kunden)</p>
                <p className="text-sm text-[#52697E]">{sag.koeber.navn}{sag.koeber.telefon ? ` · ${sag.koeber.telefon}` : ""}{sag.koeber.email ? ` · ${sag.koeber.email}` : ""}</p>
                {sag.koeber.adresse && <p className="text-sm text-[#52697E]">{sag.koeber.adresse}</p>}
              </div>
            )}
            {sag.noegle?.kraeves && (
              <p className="text-sm text-[#E2621B] font-semibold mt-2 flex items-center gap-1.5"><KeyRound size={14} /> {noegleTekst(sag.noegle)}</p>
            )}
          </div>
          <button onClick={() => onCycleStatus(sag.id)}><StatusBadge status={sag.status} /></button>
        </div>
      </div>
      <VarelinjerDetalje sag={sag} onToggleYdelse={onToggleYdelse} onAddYdelse={onAddYdelse} onRemoveYdelse={onRemoveYdelse} />
      <StempelUr sag={sag} onStempleInd={onStempleInd} onStempleUd={onStempleUd} />
      <div className="flex border-b border-[#D8D0BE] mb-5">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 text-sm font-semibold uppercase tracking-wide transition-colors ${tab === t.key ? "text-[#1C232E] border-b-2 border-[#E2621B]" : "text-[#52697E] hover:text-[#1C232E]"}`}>
            {t.label} <span className="font-mono text-xs">({t.count})</span>
          </button>
        ))}
      </div>
      {tab === "noter" && <Noter sag={sag} onAdd={addNote} />}
      {tab === "billeder" && <Billeder sag={sag} onAdd={addPhoto} />}
      {tab === "rapporter" && <Rapporter sag={sag} onAdd={addReport} />}
      {tab === "tid" && <Tidsregistrering sag={sag} />}
    </div>
  );
}

export { SagView };
