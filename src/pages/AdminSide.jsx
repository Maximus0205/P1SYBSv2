import React, { useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { MontorRaekke, BilRaekke, NyBrugerForm, VaretypeAdmin, ROLLE_LABEL } from "../components/AdminParts";
import { bilLabel } from "../data/appData";

function AdminSide({ montorer, biler, sager, brugere, varetyper, ferier, aktuelBrugerId, onUpdateMontorBil, onAddBil, onUpdateBil, onDeleteBil, onToggleBilLukket, onAddBruger, onUpdateBruger, onDeleteBruger, onAddVaretype, onUpdateVaretype, onDeleteVaretype, onTilfoejFerie, onSletFerie }) {
  const [nyNummerplade, setNyNummerplade] = useState("");
  const [fane, setFane] = useState("montorer");

  return (
    <div>
      <p className="font-mono text-[11px] tracking-widest uppercase text-[#E2621B] mb-1">Administration</p>
      <h1 className="font-['Barlow_Condensed'] text-4xl uppercase tracking-tight text-[#1C232E] mb-6">Opsætning</h1>

      <div className="flex border-b border-[#D8D0BE] mb-6 flex-wrap">
        {[{ k: "montorer", l: "Montører" }, { k: "biler", l: "Biler" }, { k: "brugere", l: "Brugere" }, { k: "varetyper", l: "Varetyper & ydelser" }].map((f) => (
          <button key={f.k} onClick={() => setFane(f.k)} className={`px-4 py-2 text-sm font-semibold uppercase tracking-wide transition-colors ${fane === f.k ? "text-[#1C232E] border-b-2 border-[#E2621B]" : "text-[#52697E] hover:text-[#1C232E]"}`}>{f.l}</button>
        ))}
      </div>

      {fane === "montorer" && (
        <div>
          <p className="text-xs text-[#52697E] mb-4">
            En montør er ikke noget man opretter her — det er en bruger med rollen "Montør" (se fanen "Brugere"). Her styrer du hvilken bil hver montør kører i lige nu, og registrerer ferieperioder. Den bil en montør er tilknyttet, vises automatisk som blokeret i kørselsoverblikket i de perioder montøren holder ferie.
          </p>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Alle montører ({montorer.length})</h3>
          {montorer.length === 0 ? (
            <p className="text-sm text-[#52697E] italic">Ingen brugere med rollen "Montør" endnu — opret en under fanen "Brugere".</p>
          ) : (
            <div className="space-y-2">
              {montorer.map((m) => (
                <MontorRaekke
                  key={m.id}
                  m={m}
                  biler={biler}
                  ferier={ferier}
                  onUpdateBil={onUpdateMontorBil}
                  onTilfoejFerie={onTilfoejFerie}
                  onSletFerie={onSletFerie}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {fane === "biler" && (
        <div>
          <div className="border border-[#D8D0BE] bg-white p-5 mb-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Opret ny bil</h3>
            <div className="flex gap-2 flex-wrap">
              <input value={nyNummerplade} onChange={(e) => setNyNummerplade(e.target.value)} placeholder="Nummerplade, fx 'AB 12 345'" className="flex-1 min-w-[200px] border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
              <button onClick={() => { if (!nyNummerplade.trim()) return; onAddBil(nyNummerplade.trim()); setNyNummerplade(""); }} className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors flex items-center gap-1.5">
                <Plus size={15} /> Opret
              </button>
            </div>
          </div>
          <p className="text-xs text-[#52697E] mb-3">"Blokér" bruges fx når en bil er på værksted. Bilen kan stadig ses, men kan ikke vælges som ny tilknytning for en montør, før den åbnes igen. Bliver bilens montør sendt på ferie, blokeres bilen automatisk i den periode — det kræver ikke noget manuelt her.</p>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Alle biler ({biler.length})</h3>
          {biler.length === 0 ? (
            <p className="text-sm text-[#52697E] italic">Ingen biler oprettet endnu.</p>
          ) : (
            <div className="space-y-2">
              {biler.map((b) => {
                const brugtAf = montorer.find((m) => m.bilId === b.id)?.navn;
                return <BilRaekke key={b.id} b={b} brugtAf={brugtAf} onUpdate={(nummerplade) => onUpdateBil(b.id, nummerplade)} onDelete={() => onDeleteBil(b.id)} onToggleLukket={onToggleBilLukket} />;
              })}
            </div>
          )}
        </div>
      )}

      {fane === "brugere" && (
        <div>
          <NyBrugerForm onAdd={onAddBruger} />
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Alle brugere ({brugere.length})</h3>
          <div className="space-y-2">
            {brugere.map((b) => {
              const tilknyttetBil = biler.find((bil) => bil.id === b.bilId);
              return (
                <div key={b.id} className="bg-white border border-[#D8D0BE] p-3 flex items-center gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-[#1C232E] truncate">{b.navn}</p>
                    <p className="text-xs text-[#52697E] truncate">{ROLLE_LABEL[b.rolle] || b.rolle}{b.rolle === "montor" ? ` · ${tilknyttetBil ? bilLabel(tilknyttetBil) : "ingen bil endnu"}` : ""}</p>
                  </div>
                  <select
                    value={b.rolle}
                    onChange={(e) => onUpdateBruger(b.id, { rolle: e.target.value })}
                    className="border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1.5 text-xs text-[#1C232E]"
                  >
                    {Object.entries(ROLLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  {b.id !== aktuelBrugerId && <button onClick={() => onDeleteBruger(b.id)} className="p-1.5 text-[#52697E] hover:text-[#B3261E]" title="Fjern adgang"><Trash2 size={15} /></button>}
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-[#52697E] mt-3">Sætter du en bruger til rollen "Montør", skal du huske at give vedkommende en bil under fanen "Montører".</p>
        </div>
      )}

      {fane === "varetyper" && (
        <div>
          <p className="text-xs text-[#52697E] mb-4">Definér de varetyper sælgerne kan vælge, hvilke standardydelser der automatisk foreslås pr. varetype, og hvor lang tid hver del forventes at tage. Tiden bruges til at beregne forventet tidsforbrug pr. sag og planlægge bilerne. Ændringer påvirker kun nye bookinger — allerede bookede sager beholder deres egen tjekliste og tid.</p>
          <VaretypeAdmin varetyper={varetyper} onAdd={onAddVaretype} onUpdate={onUpdateVaretype} onDelete={onDeleteVaretype} />
        </div>
      )}
    </div>
  );
}

export { AdminSide };
