import React, { useState, useEffect } from "react";
import { Trash2, Plus } from "lucide-react";
import { TechnicianRow, SickLeaveWindowSetting, VehicleRow, UserRow, NewUserForm, ProductCategoryAdmin, ProductTypeAdmin, PrimaryServiceAdmin, AddOnServiceAdmin } from "../components/AdminParts";
import { getPermissionsCatalog, getRoleDefaultPermissions } from "../lib/dataStore";

// RETTET (august 2026): Admin-sidens FANER vises nu ud fra brugerens
// faktiske admin_*-rettigheder (permissions), ikke længere ubetinget for
// enhver der kan åbne "/admin" overhovedet. permissions === null betyder
// systemadmin - se App.jsx, som bevidst IKKE sender et permissions-array
// for dem (de har altid alt, uafhængigt af deres egen butiks-profil).
const hasPerm = (permissions, key) => permissions === null || permissions.includes(key);

function AdminPage({
  technicians, vehicles, users, timeOff, currentUserId, store,
  productTypes, productCategories, primaryServices, addOnServices,
  permissions,
  onUpdateTechnicianVehicle, onAddVehicle, onUpdateVehicle, onDeleteVehicle, onToggleVehicleClosed,
  onAddUser, onUpdateUser, onDeleteUser, onResetPassword, onUpdatePermissions,
  onAddProductCategory, onUpdateProductCategory, onDeleteProductCategory,
  onAddProductType, onUpdateProductType, onDeleteProductType,
  onAddPrimaryService, onUpdatePrimaryService, onDeletePrimaryService,
  onAddAddOnService, onUpdateAddOnService, onDeleteAddOnService,
  onAddTimeOff, onDeleteTimeOff, onSygemeld, onRaskmeld, onSickLeaveWindowUpdated,
}) {
  const allTabs = [
    { k: "montorer", l: "Montører", perm: "admin_montorer" },
    { k: "biler", l: "Biler", perm: "admin_biler" },
    { k: "brugere", l: "Brugere", perm: "admin_brugere" },
    { k: "varer", l: "Varer & ydelser", perm: "admin_katalog" },
  ];
  const visibleTabs = allTabs.filter((f) => hasPerm(permissions, f.perm));
  const visibleTabKeys = visibleTabs.map((f) => f.k).join(",");

  const [newName, setNewName] = useState("");
  const [newPlate, setNewPlate] = useState("");
  const [tab, setTab] = useState(visibleTabs[0]?.k || "montorer");
  const [productTab, setProductTab] = useState("kategorier");

  // Rettighedskataloget + rolle-standarderne (til rettigheds-editoren for
  // hver bruger, se UserRow i AdminParts.jsx) - statiske/sjældent
  // ændrede, så hentes én gang her frem for i hver enkelt brugerrække.
  const [permissionsCatalog, setPermissionsCatalog] = useState([]);
  const [roleDefaults, setRoleDefaults] = useState({});
  useEffect(() => {
    getPermissionsCatalog().then(setPermissionsCatalog);
    getRoleDefaultPermissions().then(setRoleDefaults);
  }, []);

  // Hvis brugerens rettigheder ændrer sig (fx en anden admin fjerner en
  // rettighed mens siden er åben) og den valgte fane ikke længere er
  // synlig, skift til den første tilgængelige - i en effect, ikke direkte
  // under selve renderingen, så det ikke udløser en "state opdateret
  // under render"-advarsel.
  useEffect(() => {
    if (!visibleTabs.some((f) => f.k === tab) && visibleTabs.length > 0) {
      setTab(visibleTabs[0].k);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTabKeys]);

  if (visibleTabs.length === 0) {
    return (
      <div>
        <p className="font-mono text-[11px] tracking-widest uppercase text-brand mb-1">Administration</p>
        <h1 className="font-display text-4xl uppercase tracking-tight text-ink mb-6">Opsætning</h1>
        <p className="text-sm text-muted italic">Du har ikke nogen administrations-rettigheder tildelt endnu.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="font-mono text-[11px] tracking-widest uppercase text-brand mb-1">Administration</p>
      <h1 className="font-display text-4xl uppercase tracking-tight text-ink mb-6">Opsætning</h1>

      <div className="flex border-b border-line mb-6 flex-wrap">
        {visibleTabs.map((f) => (
          <button key={f.k} onClick={() => setTab(f.k)} className={`px-4 py-2 text-sm font-semibold uppercase tracking-wide transition-colors ${tab === f.k ? "text-ink border-b-2 border-brand" : "text-muted hover:text-ink"}`}>{f.l}</button>
        ))}
      </div>

      {tab === "montorer" && (
        <div>
          <p className="text-xs text-muted mb-4">
            En montør er ikke noget man opretter her — det er en bruger med rollen "Montør" (se fanen "Brugere"). Her styrer du hvilken bil hver montør kører i lige nu, registrerer ferieperioder, og kan sygemelde/raskmelde en montør akut. Den bil en montør er tilknyttet, vises automatisk som blokeret i kørselsoverblikket i de perioder montøren er fraværende (ferie eller sygdom).
          </p>
          {hasPerm(permissions, "admin_butik") && <SickLeaveWindowSetting store={store} onUpdated={onSickLeaveWindowUpdated} />}
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-3">Alle montører ({technicians.length})</h3>
          {technicians.length === 0 ? (
            <p className="text-sm text-muted italic">Ingen brugere med rollen "Montør" endnu — opret en under fanen "Brugere".</p>
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
                  onSygemeld={onSygemeld}
                  onRaskmeld={onRaskmeld}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "biler" && (
        <div>
          <div className="rounded-xl border border-line bg-white p-5 mb-6 shadow-sm">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-3">Opret ny bil</h3>
            <div className="flex gap-2 flex-wrap">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Navn/tag, fx 'Bil 1'" className="flex-1 min-w-[160px] rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
              <input value={newPlate} onChange={(e) => setNewPlate(e.target.value)} placeholder="Nummerplade, fx 'AB 12 345'" className="flex-1 min-w-[160px] rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
              <button onClick={() => { if (!newName.trim() || !newPlate.trim()) return; onAddVehicle(newName.trim(), newPlate.trim()); setNewName(""); setNewPlate(""); }} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors flex items-center gap-1.5">
                <Plus size={15} /> Opret
              </button>
            </div>
          </div>
          <p className="text-xs text-muted mb-3">"Blokér" bruges fx når en bil er på værksted. Bilen kan stadig ses, men kan ikke vælges som ny tilknytning for en montør, før den åbnes igen. Bliver bilens montør fraværende (ferie eller sygdom), blokeres bilen automatisk i den periode — det kræver ikke noget manuelt her.</p>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-3">Alle biler ({vehicles.length})</h3>
          {vehicles.length === 0 ? (
            <p className="text-sm text-muted italic">Ingen biler oprettet endnu.</p>
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
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-3">Alle brugere ({users.length})</h3>
          <div className="space-y-2">
            {users.map((b) => {
              const vehicle = vehicles.find((v) => v.id === b.bilId);
              return (
                <UserRow
                  key={b.id} user={b} vehicle={vehicle} currentUserId={currentUserId}
                  onUpdate={onUpdateUser} onDelete={onDeleteUser} onResetPassword={onResetPassword}
                  permissionsCatalog={permissionsCatalog} roleDefaults={roleDefaults} onUpdatePermissions={onUpdatePermissions}
                />
              );
            })}
          </div>
          <p className="text-[11px] text-muted mt-3">Sætter du en bruger til rollen "Montør", skal du huske at give vedkommende en bil under fanen "Montører". Brug "Rettigheder" på den enkelte bruger til at tilføje eller fratage adgang udover det, rollen giver som udgangspunkt.</p>
        </div>
      )}

      {tab === "varer" && (
        <div>
          <p className="text-xs text-muted mb-4">
            En sag vælger for hver varelinje: en varetype, mærke/model, én primær ydelse (fx "Montering" — bestemmer grundtiden) og valgfrit tillægsydelser. Hvilke tillægsydelser der kan vælges styres samlet under fanen "Tillægsydelser" nedenfor: der sættes for hver tillægsydelse, hvilke primære ydelser den gælder under, og eventuelt hvilke varetyper den er begrænset til. Tidsestimaterne her er kun udgangspunkter — de kan altid rettes for den enkelte booking. Ændringer her påvirker kun nye bookinger; allerede bookede sager beholder deres egne tal.
          </p>
          <div className="flex gap-1.5 mb-4 flex-wrap">
            {[{ k: "kategorier", l: "Kategorier" }, { k: "varetyper", l: "Varetyper" }, { k: "primaer", l: "Primære ydelser" }, { k: "tillaeg", l: "Tillægsydelser" }].map((f) => (
              <button key={f.k} onClick={() => setProductTab(f.k)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide border transition-colors ${productTab === f.k ? "bg-ink text-white border-ink" : "text-muted border-line hover:border-brand hover:text-brand"}`}>{f.l}</button>
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
