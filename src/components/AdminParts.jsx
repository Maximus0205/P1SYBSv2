import React, { useState } from "react";
import { Trash2, X, Plus, Pencil, UserPlus, Clock } from "lucide-react";
import { STANDARD_YDELSE_MINUTTER, formatVarighed, montorFarve } from "../data/appData";

function MontorRaekke({ m, biler, onUpdate, onDelete }) {
  const [redigerer, setRedigerer] = useState(false);
  const [navn, setNavn] = useState(m.navn);
  const [bil, setBil] = useState(m.bil);

  if (redigerer) {
    return (
      <div className="bg-white border border-[#D8D0BE] p-3 flex items-center gap-2 flex-wrap">
        <input value={navn} onChange={(e) => setNavn(e.target.value)} className="flex-1 min-w-[140px] border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1.5 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        <select value={bil} onChange={(e) => setBil(e.target.value)} className="flex-1 min-w-[140px] border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1.5 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]">
          <option value="">Ingen bil</option>
          {bil && !biler.some((b) => b.navn === bil) && <option value={bil}>{bil} (ikke i listen)</option>}
          {biler.map((b) => (
            <option key={b.id} value={b.navn} disabled={b.lukket && b.navn !== m.bil}>
              {b.navn}{b.lukket ? " (lukket for booking)" : ""}
            </option>
          ))}
        </select>
        <button onClick={() => { onUpdate(m.id, { navn: navn.trim() || m.navn, bil }); setRedigerer(false); }} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white bg-[#3D7A5C] hover:bg-[#1C232E] transition-colors">Gem</button>
        <button onClick={() => { setNavn(m.navn); setBil(m.bil); setRedigerer(false); }} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#52697E] border border-[#D8D0BE]">Fortryd</button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#D8D0BE] p-3 flex items-center gap-3">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: montorFarve(m.id, [m]) }} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm text-[#1C232E] truncate">{m.navn}</p>
        <p className="text-xs text-[#52697E] truncate">{m.bil || "Ingen bil registreret"}</p>
      </div>
      <button onClick={() => setRedigerer(true)} className="p-1.5 text-[#52697E] hover:text-[#E2621B]" title="Rediger"><Pencil size={15} /></button>
      <button onClick={() => onDelete(m.id)} className="p-1.5 text-[#52697E] hover:text-[#B3261E]" title="Slet"><Trash2 size={15} /></button>
    </div>
  );
}

function BilRaekke({ b, brugtAf, onUpdate, onDelete, onToggleLukket }) {
  const [redigerer, setRedigerer] = useState(false);
  const [navn, setNavn] = useState(b.navn);

  if (redigerer) {
    return (
      <div className="bg-white border border-[#D8D0BE] p-2.5 flex items-center gap-2">
        <input autoFocus value={navn} onChange={(e) => setNavn(e.target.value)} className="flex-1 border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        <button onClick={() => { onUpdate(navn.trim() || b.navn); setRedigerer(false); }} className="text-xs text-[#3D7A5C] font-semibold uppercase">Gem</button>
        <button onClick={() => { setNavn(b.navn); setRedigerer(false); }} className="text-xs text-[#52697E] font-semibold uppercase">Fortryd</button>
      </div>
    );
  }
  return (
    <div className={`bg-white border p-2.5 flex items-center gap-2 ${b.lukket ? "border-[#E2621B] opacity-70" : "border-[#D8D0BE]"}`}>
      <p className="text-sm text-[#1C232E] flex-1 truncate">{b.navn}</p>
      {b.lukket && <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 border border-[#E2621B] text-[#E2621B] shrink-0">Lukket</span>}
      {brugtAf && <span className="text-[10px] text-[#52697E] shrink-0">kører af {brugtAf}</span>}
      <button onClick={() => onToggleLukket(b.id)} className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-1 border shrink-0 ${b.lukket ? "border-[#3D7A5C] text-[#3D7A5C] hover:bg-[#3D7A5C] hover:text-white" : "border-[#E2621B] text-[#E2621B] hover:bg-[#E2621B] hover:text-white"} transition-colors`}>
        {b.lukket ? "Åbn igen" : "Luk for booking"}
      </button>
      <button onClick={() => setRedigerer(true)} className="p-1 text-[#52697E] hover:text-[#E2621B] shrink-0" title="Omdøb"><Pencil size={13} /></button>
      <button onClick={onDelete} className="p-1 text-[#52697E] hover:text-[#B3261E] shrink-0" title="Slet"><Trash2 size={13} /></button>
    </div>
  );
}

function NyBrugerForm({ montorer, onAdd }) {
  const [navn, setNavn] = useState("");
  const [brugernavn, setBrugernavn] = useState("");
  const [adgangskode, setAdgangskode] = useState("");
  const [rolle, setRolle] = useState("saelger");
  const [montorId, setMontorId] = useState("");

  const opret = () => {
    if (!navn.trim() || !brugernavn.trim() || !adgangskode.trim()) return;
    if (rolle === "montor" && !montorId) return;
    onAdd({ navn: navn.trim(), brugernavn: brugernavn.trim(), adgangskode, rolle, montorId: rolle === "montor" ? montorId : null });
    setNavn(""); setBrugernavn(""); setAdgangskode(""); setRolle("saelger"); setMontorId("");
  };

  return (
    <div className="border border-[#D8D0BE] bg-white p-5 mb-6">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Opret ny bruger</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <input value={navn} onChange={(e) => setNavn(e.target.value)} placeholder="Navn" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        <input value={brugernavn} onChange={(e) => setBrugernavn(e.target.value)} placeholder="Brugernavn" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        <input value={adgangskode} onChange={(e) => setAdgangskode(e.target.value)} placeholder="Adgangskode" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        <select value={rolle} onChange={(e) => setRolle(e.target.value)} className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]">
          <option value="saelger">Sælger (Salg, Kørsel, Montør, Lager)</option>
          <option value="montor">Montør (kun sin egen rute)</option>
          <option value="admin">Administrator (alt)</option>
        </select>
        {rolle === "montor" && (
          <select value={montorId} onChange={(e) => setMontorId(e.target.value)} className="sm:col-span-2 border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]">
            <option value="">Vælg hvilken montør/bil-profil brugeren logger ind som</option>
            {montorer.map((m) => <option key={m.id} value={m.id}>{m.navn} — {m.bil}</option>)}
          </select>
        )}
      </div>
      <button onClick={opret} className="mt-3 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors flex items-center gap-1.5">
        <UserPlus size={15} /> Opret bruger
      </button>
    </div>
  );
}

const ROLLE_LABEL = { admin: "Administrator", saelger: "Sælger", montor: "Montør" };

function VaretypeRaekke({ v, onUpdate, onDelete }) {
  const [nyYdelse, setNyYdelse] = useState("");
  const [nyYdelseMin, setNyYdelseMin] = useState(STANDARD_YDELSE_MINUTTER);
  const [redigererNavn, setRedigererNavn] = useState(false);
  const [navn, setNavn] = useState(v.navn);

  const tilfoejYdelse = () => {
    if (!nyYdelse.trim()) return;
    onUpdate({ ...v, ydelser: [...v.ydelser, { navn: nyYdelse.trim(), minutter: Number(nyYdelseMin) || 0 }] });
    setNyYdelse(""); setNyYdelseMin(STANDARD_YDELSE_MINUTTER);
  };
  const fjernYdelse = (i) => onUpdate({ ...v, ydelser: v.ydelser.filter((_, idx) => idx !== i) });
  const opdaterYdelseMin = (i, min) => onUpdate({ ...v, ydelser: v.ydelser.map((y, idx) => (idx === i ? { ...y, minutter: Number(min) || 0 } : y)) });

  const samletMin = (Number(v.grundMinutter) || 0) + v.ydelser.reduce((s, y) => s + (Number(y.minutter) || 0), 0);

  return (
    <div className="border border-[#D8D0BE] bg-white p-4">
      <div className="flex items-center justify-between mb-2 gap-2">
        {redigererNavn ? (
          <div className="flex items-center gap-2 flex-1">
            <input value={navn} onChange={(e) => setNavn(e.target.value)} className="flex-1 border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
            <button onClick={() => { onUpdate({ ...v, navn: navn.trim() || v.navn }); setRedigererNavn(false); }} className="text-xs text-[#3D7A5C] font-semibold uppercase">Gem</button>
          </div>
        ) : (
          <p className="font-semibold text-sm text-[#1C232E]">{v.navn}</p>
        )}
        <div className="flex items-center gap-1 shrink-0">
          {!redigererNavn && <button onClick={() => setRedigererNavn(true)} className="p-1 text-[#52697E] hover:text-[#E2621B]"><Pencil size={14} /></button>}
          <button onClick={() => onDelete(v.id)} className="p-1 text-[#52697E] hover:text-[#B3261E]"><Trash2 size={14} /></button>
        </div>
      </div>

      <label className="flex items-center gap-2 mb-3 text-xs text-[#52697E]">
        <Clock size={12} /> Grundtid (selve montering/levering)
        <input type="number" min="0" value={v.grundMinutter ?? 0} onChange={(e) => onUpdate({ ...v, grundMinutter: Number(e.target.value) || 0 })} className="w-16 border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1 text-xs text-right text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        min
      </label>

      <div className="flex flex-col gap-1 mb-2">
        {v.ydelser.length === 0 ? <p className="text-xs text-[#52697E] italic">Ingen standardydelser endnu.</p> : v.ydelser.map((y, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px] px-2 py-1 border border-[#D8D0BE] text-[#52697E]">
            <span className="flex-1 truncate">{y.navn}</span>
            <input type="number" min="0" value={y.minutter ?? STANDARD_YDELSE_MINUTTER} onChange={(e) => opdaterYdelseMin(i, e.target.value)} className="w-12 border border-[#D8D0BE] bg-[#F3EFE6] px-1 py-0.5 text-right text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
            <span>min</span>
            <button onClick={() => fjernYdelse(i)} className="hover:text-[#B3261E]"><X size={11} /></button>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mb-2">
        <input value={nyYdelse} onChange={(e) => setNyYdelse(e.target.value)} onKeyDown={(e) => e.key === "Enter" && tilfoejYdelse()} placeholder="Tilføj standardydelse..." className="flex-1 border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1 text-xs text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        <input type="number" min="0" value={nyYdelseMin} onChange={(e) => setNyYdelseMin(e.target.value)} title="Minutter" className="w-14 border border-[#D8D0BE] bg-[#F3EFE6] px-1 py-1 text-xs text-right text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        <button onClick={tilfoejYdelse} className="px-2 text-[#1C232E] border border-[#D8D0BE] hover:border-[#E2621B]"><Plus size={13} /></button>
      </div>
      <p className="text-[10px] text-[#52697E] flex items-center gap-1 border-t border-[#F0EBDD] pt-1.5"><Clock size={10} /> Samlet ved fuld tjekliste: {formatVarighed(samletMin)}</p>
    </div>
  );
}

function VaretypeAdmin({ varetyper, onAdd, onUpdate, onDelete }) {
  const [nytNavn, setNytNavn] = useState("");
  return (
    <div>
      <div className="border border-[#D8D0BE] bg-white p-5 mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Opret ny varetype</h3>
        <div className="flex gap-2">
          <input value={nytNavn} onChange={(e) => setNytNavn(e.target.value)} placeholder="Fx 'Kaffemaskine' eller 'Router'" className="flex-1 border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <button onClick={() => { if (!nytNavn.trim()) return; onAdd(nytNavn.trim()); setNytNavn(""); }} className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors flex items-center gap-1.5"><Plus size={15} /> Opret</button>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {varetyper.map((v) => (
          <VaretypeRaekke key={v.id} v={v} onUpdate={onUpdate} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}



export { MontorRaekke, BilRaekke, NyBrugerForm, VaretypeRaekke, VaretypeAdmin, ROLLE_LABEL };
