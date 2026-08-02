import React, { useState } from "react";
import { Trash2, X, Plus, AlertCircle, KeyRound, Clock } from "lucide-react";
import { ANDET_VARETYPE, NOEGLE_TYPER, STANDARD_GRUNDMINUTTER, STANDARD_YDELSE_MINUTTER, bygningsNoegle, formatDatoLang, formatVarighed, lavYdelse, linjeMinutter, varetypeNavne, ydelseIkon } from "../data/appData";

function VarelinjeRedigering({ linje, varetyper, onChange, onFjern, kanFjerne }) {
  const erAndet = linje.varetype === ANDET_VARETYPE;

  const skiftVaretype = (nyType) => {
    if (nyType === linje.varetype) return;
    const def = varetyper.find((v) => v.navn === nyType);
    onChange({ ...linje, varetype: nyType, varetypeTekst: "", grundMinutter: def ? (Number(def.grundMinutter) || 0) : STANDARD_GRUNDMINUTTER, ydelser: (def ? def.ydelser : []).map((y) => lavYdelse(y.navn, y.minutter)) });
  };
  const toggleYdelse = (yId) => onChange({ ...linje, ydelser: linje.ydelser.map((y) => (y.id === yId ? { ...y, udfoert: !y.udfoert } : y)) });
  const setYdelseMin = (yId, min) => onChange({ ...linje, ydelser: linje.ydelser.map((y) => (y.id === yId ? { ...y, minutter: Number(min) || 0 } : y)) });
  const [nyPunkt, setNyPunkt] = useState("");
  const tilfoejPunkt = () => {
    if (!nyPunkt.trim()) return;
    onChange({ ...linje, ydelser: [...linje.ydelser, lavYdelse(nyPunkt.trim())] });
    setNyPunkt("");
  };
  const fjernPunkt = (yId) => onChange({ ...linje, ydelser: linje.ydelser.filter((y) => y.id !== yId) });

  return (
    <div className="border border-[#D8D0BE] bg-[#FCFAF4] p-3">
      <div className="flex items-center gap-2 mb-2">
        <select value={linje.varetype} onChange={(e) => skiftVaretype(e.target.value)} className="flex-1 border border-[#D8D0BE] bg-white px-2 py-1.5 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]">
          {varetypeNavne(varetyper).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <div className="flex items-center gap-1 shrink-0" title="Grundtid for selve varen/opgaven">
          <input type="number" min="0" value={linje.grundMinutter ?? 0} onChange={(e) => onChange({ ...linje, grundMinutter: Number(e.target.value) || 0 })} className="w-14 border border-[#D8D0BE] bg-white px-1.5 py-1.5 text-xs text-right text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <span className="text-[10px] text-[#52697E] whitespace-nowrap">min grundtid</span>
        </div>
        {kanFjerne && <button onClick={onFjern} className="p-1.5 text-[#52697E] hover:text-[#B3261E]" title="Fjern varelinje"><Trash2 size={15} /></button>}
      </div>
      {erAndet && (
        <input
          value={linje.varetypeTekst}
          onChange={(e) => onChange({ ...linje, varetypeTekst: e.target.value })}
          placeholder="Beskriv varen/opgaven, fx 'Specialbygget vinkøleskab'"
          className="w-full border border-[#D8D0BE] bg-white px-2 py-1.5 text-sm text-[#1C232E] mb-2 focus:outline-none focus:border-[#E2621B]"
        />
      )}
      {linje.ydelser.length > 0 && (
        <div className="space-y-1 mb-2">
          {linje.ydelser.map((y) => {
            const Icon = ydelseIkon(y.navn);
            return (
              <div key={y.id} className="flex items-center gap-2 px-1.5 py-1 hover:bg-white group">
                <label className="flex items-center gap-2 flex-1 cursor-pointer min-w-0">
                  <input type="checkbox" checked={y.udfoert} onChange={() => toggleYdelse(y.id)} className="w-4 h-4 accent-[#3D7A5C] shrink-0" />
                  <Icon size={13} className="text-[#52697E] shrink-0" strokeWidth={2.5} />
                  <span className="text-sm text-[#1C232E] flex-1 truncate">{y.navn}</span>
                </label>
                <input type="number" min="0" value={y.minutter ?? STANDARD_YDELSE_MINUTTER} onChange={(e) => setYdelseMin(y.id, e.target.value)} className="w-12 border border-[#D8D0BE] bg-white px-1 py-0.5 text-xs text-right text-[#52697E] focus:outline-none focus:border-[#E2621B]" />
                <span className="text-[10px] text-[#52697E]">min</span>
                <button onClick={(e) => { e.preventDefault(); fjernPunkt(y.id); }} className="opacity-0 group-hover:opacity-100 text-[#52697E] hover:text-[#E2621B]"><X size={13} /></button>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex gap-1.5 mb-1.5">
        <input value={nyPunkt} onChange={(e) => setNyPunkt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && tilfoejPunkt()} placeholder="Tilføj punkt til denne varelinje..." className="flex-1 border border-[#D8D0BE] bg-white px-2 py-1 text-xs text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        <button onClick={tilfoejPunkt} className="px-2 text-[#1C232E] border border-[#D8D0BE] hover:border-[#E2621B] hover:text-[#E2621B]"><Plus size={13} /></button>
      </div>
      <p className="text-[10px] text-[#52697E] flex items-center gap-1"><Clock size={10} /> I alt for denne linje: {formatVarighed(linjeMinutter(linje))}</p>
    </div>
  );
}

function NoegleFelter({ noegle, onChange }) {
  return (
    <div className="border border-[#D8D0BE] bg-[#FCFAF4] p-3">
      <label className="flex items-center gap-2 cursor-pointer mb-2">
        <input type="checkbox" checked={noegle.kraeves} onChange={(e) => onChange({ ...noegle, kraeves: e.target.checked })} className="w-4 h-4 accent-[#E2621B]" />
        <KeyRound size={14} className="text-[#52697E]" />
        <span className="text-sm font-medium text-[#1C232E]">Kræver nøgle/adgang</span>
      </label>
      {noegle.kraeves && (
        <div className="grid gap-2 sm:grid-cols-2 pl-1">
          <select value={noegle.type} onChange={(e) => onChange({ ...noegle, type: e.target.value })} className="border border-[#D8D0BE] bg-white px-2 py-1.5 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]">
            <option value="">Vælg type</option>
            {NOEGLE_TYPER.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={noegle.detaljer} onChange={(e) => onChange({ ...noegle, detaljer: e.target.value })} placeholder="Detaljer, fx kode eller nøgleboks-nr." className="border border-[#D8D0BE] bg-white px-2 py-1.5 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <input value={noegle.placering} onChange={(e) => onChange({ ...noegle, placering: e.target.value })} placeholder="Placering, fx 'Ved hoveddøren bag lampen'" className="sm:col-span-2 border border-[#D8D0BE] bg-white px-2 py-1.5 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        </div>
      )}
    </div>
  );
}

function AdresseForslag({ adresse, dato, sager, onBrugDato }) {
  const noegle = bygningsNoegle(adresse);
  if (!noegle || adresse.trim().length < 5) return null;
  const matches = (sager || []).filter((s) => s.dato && s.dato !== dato && bygningsNoegle(s.kunde?.adresse) === noegle);
  if (matches.length === 0) return null;
  const datoer = [...new Set(matches.map((s) => s.dato))].sort();
  return (
    <div className="mb-3 border border-[#E2621B] bg-[#E2621B10] p-3">
      <p className="text-sm font-semibold text-[#E2621B] flex items-center gap-1.5"><AlertCircle size={14} /> Samme opgang/ejendom er allerede booket</p>
      <p className="text-xs text-[#52697E] mt-1">Der er allerede en sag på denne adresse på en anden dag — overvej at samle dem, så I ikke kører to gange til samme opgang:</p>
      <div className="mt-2 space-y-1">
        {datoer.map((d) => {
          const paaDenDag = matches.filter((s) => s.dato === d);
          return (
            <div key={d} className="flex items-center justify-between gap-2 bg-white border border-[#D8D0BE] px-2 py-1.5 flex-wrap">
              <span className="text-xs text-[#1C232E]">{formatDatoLang(d)} — {paaDenDag.map((s) => s.kunde.navn).join(", ")}</span>
              <button onClick={() => onBrugDato(d)} className="text-[10px] font-semibold uppercase tracking-wide text-[#1C232E] border border-[#D8D0BE] hover:border-[#E2621B] hover:text-[#E2621B] px-2 py-1 shrink-0">Brug denne dato</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}



export { VarelinjeRedigering, NoegleFelter, AdresseForslag };
