import React, { useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { MontorRaekke, BilRaekke, BrugerRaekke, NyBrugerForm, VarekategoriAdmin, VaretypeAdmin, PrimaerydelseAdmin, TillaegsydelseAdmin } from "../components/AdminParts";

function AdminSide({
  montorer, biler, sager, brugere, ferier, aktuelBrugerId,
  varetyper, varekategorier, primaerydelser, tillaegsydelser,
  onUpdateMontorBil, onAddBil, onUpdateBil, onDeleteBil, onToggleBilLukket,
  onAddBruger, onUpdateBruger, onDeleteBruger,
  onAddVarekategori, onUpdateVarekategori, onDeleteVarekategori,
  onAddVaretype, onUpdateVaretype, onDeleteVaretype,
  onAddPrimaerydelse, onUpdatePrimaerydelse, onDeletePrimaerydelse,
  onAddTillaegsydelse, onUpdateTillaegsydelse, onDeleteTillaegsydelse,
  onTilfoejFerie, onSletFerie,
}) {
  const [nytNavn, setNytNavn] = useState("");
  const [nyNummerplade, setNyNummerplade] = useState("");
  const [fane, setFane] = useState("montorer");
  const [vareFane, setVareFane] = useState("kategorier");

  return (
    <div>
      <p className="font-mono text-[11px] tracking-widest uppercase text-[#E2621B] mb-1">Administration</p>
      <h1 className="font-['Barlow_Condensed'] text-4xl uppercase tracking-tight text-[#1C232E] mb-6">Opsætning</h1>

      <div className="flex border-b border-[#D8D0BE] mb-6 flex-wrap">
        {[{ k: "montorer", l: "Montører" }, { k: "biler", l: "Biler" }, { k: "brugere", l: "Brugere" }, { k: "varer", l: "Varer & ydelser" }].map((f) => (
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
              <input value={nytNavn} onChange={(e) => setNytNavn(e.target.value)} placeholder="Navn/tag, fx 'Bil 1'" className="flex-1 min-w-[160px] border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
              <input value={nyNummerplade} onChange={(e) => setNyNummerplade(e.target.value)} placeholder="Nummerplade, fx 'AB 12 345'" className="flex-1 min-w-[160px] border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
              <button onClick={() => { if (!nytNavn.trim() || !nyNummerplade.trim()) return; onAddBil(nytNavn.trim(), nyNummerplade.trim()); setNytNavn(""); setNyNummerplade(""); }} className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors flex items-center gap-1.5">
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
                return <BilRaekke key={b.id} b={b} brugtAf={brugtAf} onUpdate={(felter) => onUpdateBil(b.id, felter)} onDelete={() => onDeleteBil(b.id)} onToggleLukket={onToggleBilLukket} />;
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
              return <BrugerRaekke key={b.id} b={b} tilknyttetBil={tilknyttetBil} aktuelBrugerId={aktuelBrugerId} onUpdate={onUpdateBruger} onDelete={onDeleteBruger} />;
            })}
          </div>
          <p className="text-[11px] text-[#52697E] mt-3">Sætter du en bruger til rollen "Montør", skal du huske at give vedkommende en bil under fanen "Montører".</p>
        </div>
      )}

      {fane === "varer" && (
        <div>
          <p className="text-xs text-[#52697E] mb-4">
            En sag vælger for hver varelinje: en varetype, mærke/model, én primær ydelse (fx "Montering" — bestemmer grundtiden) og valgfrit tillægsydelser. Hvilke tillægsydelser der kan vælges afhænger af BÅDE varetypen og den valgte primære ydelse — sæt dem op under hver af de to faner nedenfor. Ændringer her påvirker kun nye bookinger; allerede bookede sager beholder deres egne tal.
          </p>
          <div className="flex gap-1 mb-4 flex-wrap">
            {[{ k: "kategorier", l: "Kategorier" }, { k: "varetyper", l: "Varetyper" }, { k: "primaer", l: "Primære ydelser" }, { k: "tillaeg", l: "Tillægsydelser" }].map((f) => (
              <button key={f.k} onClick={() => setVareFane(f.k)} className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wide border transition-colors ${vareFane === f.k ? "bg-[#1C232E] text-white border-[#1C232E]" : "text-[#52697E] border-[#D8D0BE] hover:border-[#E2621B] hover:text-[#E2621B]"}`}>{f.l}</button>
            ))}
          </div>
          {vareFane === "kategorier" && <VarekategoriAdmin varekategorier={varekategorier} onAdd={onAddVarekategori} onUpdate={onUpdateVarekategori} onDelete={onDeleteVarekategori} />}
          {vareFane === "varetyper" && <VaretypeAdmin varetyper={varetyper} varekategorier={varekategorier} tillaegsydelser={tillaegsydelser} onAdd={onAddVaretype} onUpdate={onUpdateVaretype} onDelete={onDeleteVaretype} />}
          {vareFane === "primaer" && <PrimaerydelseAdmin primaerydelser={primaerydelser} tillaegsydelser={tillaegsydelser} onAdd={onAddPrimaerydelse} onUpdate={onUpdatePrimaerydelse} onDelete={onDeletePrimaerydelse} />}
          {vareFane === "tillaeg" && <TillaegsydelseAdmin tillaegsydelser={tillaegsydelser} onAdd={onAddTillaegsydelse} onUpdate={onUpdateTillaegsydelse} onDelete={onDeleteTillaegsydelse} />}
        </div>
      )}
    </div>
  );
}

export { AdminSide };
