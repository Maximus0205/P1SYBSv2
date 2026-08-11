import React, { useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { TechnicianRow, VehicleRow, UserRow, NewUserForm, ProductCategoryAdmin, ProductTypeAdmin, PrimaryServiceAdmin, AddOnServiceAdmin } from "../components/AdminParts";

function AdminPage({
  technicians, vehicles, users, timeOff, currentUserId,
  productTypes, productCategories, primaryServices, addOnServices,
  onUpdateTechnicianVehicle, onAddVehicle, onUpdateVehicle, onDeleteVehicle, onToggleVehicleClosed,
  onAddUser, onUpdateUser, onDeleteUser, onResetPassword,
  onAddProductCategory, onUpdateProductCategory, onDeleteProductCategory,
  onAddProductType, onUpdateProductType, onDeleteProductType,
  onAddPrimaryService, onUpdatePrimaryService, onDeletePrimaryService,
  onAddAddOnService, onUpdateAddOnService, onDeleteAddOnService,
  onAddTimeOff, onDeleteTimeOff,
}) {
  const [newName, setNewName] = useState("");
  const [newPlate, setNewPlate] = useState("");
  const [tab, setTab] = useState("montorer");
  const [productTab, setProductTab] = useState("kategorier");

  return (
    <div>
      <p className="font-mono text-[11px] tracking-widest uppercase text-[#E2621B] mb-1">Administration</p>
      <h1 className="font-['Barlow_Condensed'] text-4xl uppercase tracking-tight text-[#1C232E] mb-6">Opsætning</h1>

      <div className="flex border-b border-[#D8D0BE] mb-6 flex-wrap">
        {[{ k: "montorer", l: "Montører" }, { k: "biler", l: "Biler" }, { k: "brugere", l: "Brugere" }, { k: "varer", l: "Varer & ydelser" }].map((f) => (
          <button key={f.k} onClick={() => setTab(f.k)} className={`px-4 py-2 text-sm font-semibold uppercase tracking-wide transition-colors ${tab === f.k ? "text-[#1C232E] border-b-2 border-[#E2621B]" : "text-[#52697E] hover:text-[#1C232E]"}`}>{f.l}</button>
        ))}
      </div>

      {tab === "montorer" && (
        <div>
          <p className="text-xs text-[#52697E] mb-4">
            En montør er ikke noget man opretter her — det er en bruger med rollen "Montør" (se fanen "Brugere"). Her styrer du hvilken bil hver montør kører i lige nu, og registrerer ferieperioder. Den bil en montør er tilknyttet, vises automatisk som blokeret i kørselsoverblikket i de perioder montøren holder ferie.
          </p>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Alle montører ({technicians.length})</h3>
          {technicians.length === 0 ? (
            <p className="text-sm text-[#52697E] italic">Ingen brugere med rollen "Montør" endnu — opret en under fanen "Brugere".</p>
          ) : (
            <div className="space-y-2">
              {technicians.map((m) => (
                <TechnicianRow
                  key={m.id}
                  technician={m}
                  vehicles={vehicles}
                  timeOff={timeOff}
                  onUpdateVehicle={onUpdateTechnicianVehicle}
                  onAddTimeOff={onAddTimeOff}
                  onDeleteTimeOff={onDeleteTimeOff}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "biler" && (
        <div>
          <div className="border border-[#D8D0BE] bg-white p-5 mb-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Opret ny bil</h3>
            <div className="flex gap-2 flex-wrap">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Navn/tag, fx 'Bil 1'" className="flex-1 min-w-[160px] border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
              <input value={newPlate} onChange={(e) => setNewPlate(e.target.value)} placeholder="Nummerplade, fx 'AB 12 345'" className="flex-1 min-w-[160px] border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
              <button onClick={() => { if (!newName.trim() || !newPlate.trim()) return; onAddVehicle(newName.trim(), newPlate.trim()); setNewName(""); setNewPlate(""); }} className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors flex items-center gap-1.5">
                <Plus size={15} /> Opret
              </button>
            </div>
          </div>
          <p className="text-xs text-[#52697E] mb-3">"Blokér" bruges fx når en bil er på værksted. Bilen kan stadig ses, men kan ikke vælges som ny tilknytning for en montør, før den åbnes igen. Bliver bilens montør sendt på ferie, blokeres bilen automatisk i den periode — det kræver ikke noget manuelt her.</p>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Alle biler ({vehicles.length})</h3>
          {vehicles.length === 0 ? (
            <p className="text-sm text-[#52697E] italic">Ingen biler oprettet endnu.</p>
          ) : (
            <div className="space-y-2">
              {vehicles.map((b) => {
                const usedBy = technicians.find((m) => m.bilId === b.id)?.navn;
                return <VehicleRow key={b.id} vehicle={b} usedBy={usedBy} onUpdate={(fields) => onUpdateVehicle(b.id, fields)} onDelete={() => onDeleteVehicle(b.id)} onToggleClosed={onToggleVehicleClosed} />;
              })}
            </div>
          )}
        </div>
      )}

      {tab === "brugere" && (
        <div>
          <NewUserForm onAdd={onAddUser} />
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Alle brugere ({users.length})</h3>
          <div className="space-y-2">
            {users.map((b) => {
              const vehicle = vehicles.find((v) => v.id === b.bilId);
              return <UserRow key={b.id} user={b} vehicle={vehicle} currentUserId={currentUserId} onUpdate={onUpdateUser} onDelete={onDeleteUser} onResetPassword={onResetPassword} />;
            })}
          </div>
          <p className="text-[11px] text-[#52697E] mt-3">Sætter du en bruger til rollen "Montør", skal du huske at give vedkommende en bil under fanen "Montører".</p>
        </div>
      )}

      {tab === "varer" && (
        <div>
          <p className="text-xs text-[#52697E] mb-4">
            En sag vælger for hver varelinje: en varetype, mærke/model, én primær ydelse (fx "Montering" — bestemmer grundtiden) og valgfrit tillægsydelser. Hvilke tillægsydelser der kan vælges styres samlet under fanen "Tillægsydelser" nedenfor: der sættes for hver tillægsydelse, hvilke primære ydelser den gælder under, og eventuelt hvilke varetyper den er begrænset til. Tidsestimaterne her er kun udgangspunkter — de kan altid rettes for den enkelte booking. Ændringer her påvirker kun nye bookinger; allerede bookede sager beholder deres egne tal.
          </p>
          <div className="flex gap-1 mb-4 flex-wrap">
            {[{ k: "kategorier", l: "Kategorier" }, { k: "varetyper", l: "Varetyper" }, { k: "primaer", l: "Primære ydelser" }, { k: "tillaeg", l: "Tillægsydelser" }].map((f) => (
              <button key={f.k} onClick={() => setProductTab(f.k)} className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wide border transition-colors ${productTab === f.k ? "bg-[#1C232E] text-white border-[#1C232E]" : "text-[#52697E] border-[#D8D0BE] hover:border-[#E2621B] hover:text-[#E2621B]"}`}>{f.l}</button>
            ))}
          </div>
          {productTab === "kategorier" && <ProductCategoryAdmin productCategories={productCategories} onAdd={onAddProductCategory} onUpdate={onUpdateProductCategory} onDelete={onDeleteProductCategory} />}
          {productTab === "varetyper" && <ProductTypeAdmin productTypes={productTypes} productCategories={productCategories} onAdd={onAddProductType} onUpdate={onUpdateProductType} onDelete={onDeleteProductType} />}
          {productTab === "primaer" && <PrimaryServiceAdmin primaryServices={primaryServices} onAdd={onAddPrimaryService} onUpdate={onUpdatePrimaryService} onDelete={onDeletePrimaryService} />}
          {productTab === "tillaeg" && <AddOnServiceAdmin addOnServices={addOnServices} productTypes={productTypes} primaryServices={primaryServices} onAdd={onAddAddOnService} onUpdate={onUpdateAddOnService} onDelete={onDeleteAddOnService} />}
        </div>
      )}
    </div>
  );
}

export { AdminPage };
