import React, { useState } from "react";
import { KeyRound, Building2, Hash, Pencil, X, Check } from "lucide-react";
import { TIME_SLOTS as TIDSRUM, buildTitle as dannTitel, keyAccessText as noegleTekst, timeSlotById as tidsrumFraId, timeSlotText as tidsrumTekst } from "../data/domain";
import { StatusBadge } from "../components/common";
import { VarelinjerDetalje, Noter, Billeder, Rapporter, Tidsregistrering, StempelUr } from "../components/SagDele";
import { AdresseInput } from "../components/AdresseInput";

// Hurtig-redigering af en booket sag: dato, tidsrum, montør og
// leveringsadresse - de felter der oftest skal justeres efter oprettelse
// (fx kunden ringer og vil rykke datoen). Resten af sagen (varelinjer,
// kunde-/købernavn osv.) redigeres ikke her - det er bevidst holdt til de
// hyppigste ændringer, for at redigeringen forbliver hurtig og overskuelig.
function BookingRedigering({ sag, montorer, onGem, onAnnuller }) {
  const [dato, setDato] = useState(sag.dato);
  const [tidsrumId, setTidsrumId] = useState(sag.tidsrumId);
  const [montorId, setMontorId] = useState(sag.montorId || "");
  const [adresse, setAdresse] = useState(sag.kunde.adresse);

  const gem = () => {
    const t = tidsrumFraId(tidsrumId);
    onGem({
      dato, tidsrumId, start: t.start, slut: t.slut,
      montorId: montorId || null,
      kunde: { ...sag.kunde, adresse: adresse.trim() },
    });
  };

  return (
    <div className="bg-white border border-[#E2621B] p-4 mb-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Redigér booking</h3>
      <div className="grid gap-3 sm:grid-cols-2 mb-3">
        <label className="text-xs text-[#52697E]">
          Dato
          <input type="date" value={dato} onChange={(e) => setDato(e.target.value)} className="w-full mt-1 border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] font-mono focus:outline-none focus:border-[#E2621B]" />
        </label>
        <label className="text-xs text-[#52697E]">
          Tidsrum
          <select value={tidsrumId} onChange={(e) => setTidsrumId(e.target.value)} className="w-full mt-1 border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]">
            {TIDSRUM.map((t) => <option key={t.id} value={t.id}>{tidsrumTekst(t.id)}</option>)}
          </select>
        </label>
        <label className="text-xs text-[#52697E] sm:col-span-2">
          Montør/bil
          <select value={montorId} onChange={(e) => setMontorId(e.target.value)} className="w-full mt-1 border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]">
            <option value="">Ikke tildelt</option>
            {montorer.map((m) => <option key={m.id} value={m.id}>{m.navn} — {m.bil}</option>)}
          </select>
        </label>
        <label className="text-xs text-[#52697E] sm:col-span-2">
          Leveringsadresse
          <div className="mt-1"><AdresseInput value={adresse} onChange={setAdresse} placeholder="Leveringsadresse" /></div>
        </label>
      </div>
      <div className="flex gap-2">
        <button onClick={gem} className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors flex items-center gap-1.5"><Check size={14} /> Gem ændringer</button>
        <button onClick={onAnnuller} className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-[#52697E] border border-[#D8D0BE] hover:border-[#52697E] transition-colors flex items-center gap-1.5"><X size={14} /> Annuller</button>
      </div>
    </div>
  );
}

function SagView({ sag, montorer, onBack, addNote, addPhoto, addReport, onCycleStatus, onStempleInd, onStempleUd, onToggleYdelse, onAddYdelse, onRemoveYdelse, onUpdateBooking }) {
  const [tab, setTab] = useState("noter");
  const [redigerer, setRedigerer] = useState(false);
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

      {redigerer ? (
        <BookingRedigering
          sag={sag}
          montorer={montorer}
          onAnnuller={() => setRedigerer(false)}
          onGem={(felter) => { onUpdateBooking(felter); setRedigerer(false); }}
        />
      ) : (
        <div className="bg-white border border-[#D8D0BE] p-5 mb-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="font-mono text-xs text-[#52697E] mb-1">
                #{sag.nr} · {sag.dato} · {sag.start}–{sag.slut}{montor ? ` · ${montor.navn}` : " · ikke tildelt"}
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
            <div className="flex flex-col items-end gap-2">
              <button onClick={() => onCycleStatus(sag.id)}><StatusBadge status={sag.status} /></button>
              <button onClick={() => setRedigerer(true)} className="text-xs font-semibold uppercase tracking-wide text-[#52697E] hover:text-[#E2621B] flex items-center gap-1"><Pencil size={13} /> Redigér booking</button>
            </div>
          </div>
        </div>
      )}

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
