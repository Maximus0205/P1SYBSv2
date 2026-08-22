import React, { useState, useEffect } from "react";

import { todayISO, PAGES_FOR_ROLE } from "./data/domain";
import { useSession } from "./hooks/useSession";
import { useCatalog } from "./hooks/useCatalog";
import { useVehicles } from "./hooks/useVehicles";
import { useTimeOff } from "./hooks/useTimeOff";
import { useUsers } from "./hooks/useUsers";
import { useOrders } from "./hooks/useOrders";

import { TopNav } from "./components/TopNav";
import { LoginPage } from "./components/LoginPage";
import { OrderView } from "./components/OrderView";

import { SalesPage } from "./pages/SalesPage";
import { PlanningPage } from "./pages/PlanningPage";
import { TechnicianPicker, TechnicianRouteView } from "./pages/TechnicianPage";
import { WarehousePage } from "./pages/WarehousePage";
import { ArchivePage } from "./pages/ArchivePage";
import { AdminPage } from "./pages/AdminPage";
import { SystemAdminPage } from "./pages/SystemAdminPage";

// ---------------------------------------------------------------------------
// ARKITEKTUR-OPRYDNING FULDFØRT (august 2026, 4 faser): App.jsx var ved at
// blive for stor og blande for mange ansvarsområder (se rapport 22. august
// 2026: ~750 linjer, al state/CRUD for hele appen ét sted). Al domænelogik
// er nu udtrukket til dedikerede hooks (se hooks/-mappen):
//   useSession  - login/session/profil/butik (den mest følsomme del,
//                 indeholder en kendt onAuthStateChange-fælde - se der)
//   useCatalog  - varekatalog (varetyper/kategorier/ydelser/tillæg)
//   useVehicles - biler
//   useTimeOff  - fravær
//   useUsers    - brugere
//   useOrders   - ordrer (booking, status, pluk, rækkefølge, dupliker,
//                 noter/billeder/rapporter/tid/underskrift)
// App.jsx's tilbageværende ansvar er nu udelukkende: kalde disse hooks,
// håndtere den lille smule NAVIGATIONS-UI-state der krydser flere hooks
// (page, selectedId osv.), og selve routing/visningen. Ren komposition,
// ikke selve forretningslogikken.
// ---------------------------------------------------------------------------

// Læser den aktuelle fane ud af URL'ens hash (fx "#planlaegning" -> "planlaegning").
// HASH-baseret (ikke rigtige URL-stier) er bevidst: GitHub Pages serverer
// kun statiske filer uden server-side rewrites, så et refresh på en "rigtig"
// sti som /P1SYBSv2/planlaegning ville give en 404, medmindre der er sat en
// særlig fallback op. Hash-delen af en URL sendes ALDRIG til serveren - et
// refresh på "#planlaegning" indlæser altid den samme index.html, hvorefter
// JavaScript blot læser hashet og viser den rigtige fane. Ingen ny
// afhængighed nødvendig for noget så simpelt.
const pageFromHash = () => window.location.hash.replace(/^#\/?/, "") || null;

export default function App() {
  const { loading, session, profile, store, logOut } = useSession();

  const catalog = useCatalog(profile?.butikId);
  const vehiclesStore = useVehicles(profile?.butikId);
  const timeOffStore = useTimeOff(profile?.butikId);
  const usersStore = useUsers(profile?.butikId);
  const ordersStore = useOrders(profile?.butikId);
  const { vehicles } = vehiclesStore;
  const { timeOff } = timeOffStore;
  const { users } = usersStore;
  const { orders } = ordersStore;

  const [page, setPage] = useState("salg");
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [selectedTechnicianId, setSelectedTechnicianId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  // De sider den indloggede bruger reelt må se, ud fra rolle - bruges til
  // både at vælge en fornuftig standardfane OG til at afvise et evt.
  // hash i URL'en der peger på noget der ikke er tilladt (fx et gammelt
  // bogmærke til "#admin" for en sælger, der ikke længere er admin).
  // BEMÆRK: dette er UI-bekvemmelighed, ikke selve sikkerhedsgrænsen -
  // den reelle beskyttelse ligger i Supabase RLS, ligesom resten af appen.
  const allowedPages = profile?.butikId ? (PAGES_FOR_ROLE[profile.rolle] || ["salg"]) : (profile?.erSystemadmin ? ["systemadmin"] : []);

  // Skifter fane OG opdaterer URL'ens hash, så et refresh på en anden fane
  // end Salg forbliver på samme fane i stedet for at hoppe tilbage til
  // startsiden - det var netop det, der irriterede.
  const navigateTo = (key) => {
    setPage(key);
    setSelectedId(null);
    if (pageFromHash() !== key) window.location.hash = key;
  };

  // Ved FØRSTE indlæsning af en profil (login, rolle- eller butiksskift):
  // brug et gyldigt hash fra URL'en hvis der er ét (fx efter et refresh),
  // ellers den fornuftige standardfane for rollen. Afhænger bevidst kun af
  // de PRIMITIVE felter (id/butikId/rolle/erSystemadmin), ikke selve
  // profile-objektet - det undgår at nulstille fanen ved hver eneste
  // baggrunds-token-fornyelse (som giver et NYT profile-objekt med samme
  // indhold), kun ved reelle ændringer.
  useEffect(() => {
    if (!profile) return;
    const hashPage = pageFromHash();
    if (hashPage && allowedPages.includes(hashPage)) {
      setPage(hashPage);
    } else if (profile.butikId) {
      setPage(allowedPages[0]);
    } else if (profile.erSystemadmin) {
      setPage("systemadmin");
    }
    if (profile.butikId && profile.rolle === "montor") setSelectedTechnicianId(profile.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.butikId, profile?.rolle, profile?.erSystemadmin]);

  // Reagerer på browserens tilbage/frem-knapper og manuelle hash-ændringer
  // (ikke selve navigateTo-kald herfra i appen, som allerede opdaterer
  // "page" direkte - denne fanger de tilfælde hvor URL'en ændrer sig UDEN
  // om et almindeligt fane-klik).
  useEffect(() => {
    const onHashChange = () => {
      if (!profile) return;
      const h = pageFromHash();
      if (h && allowedPages.includes(h)) { setPage(h); setSelectedId(null); }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.rolle, profile?.butikId, profile?.erSystemadmin]);

  // Ryd valgt sag ved log ud (session forsvinder -> profile bliver null).
  useEffect(() => {
    if (!profile) setSelectedId(null);
  }, [profile]);

  // "Teknikere" er ikke længere en selvstændig ting i databasen — det er
  // brugere/profiler med rolle "montor". Vi udleder listen her, i samme form
  // som resten af appen altid har forventet ({ id, navn, bil, bilId }) -
  // krydser BÅDE users og vehicles, derfor hører den til i App.jsx
  // (kompositionslaget) og ikke i én enkelt hook.
  const technicians = users
    .filter((b) => b.rolle === "montor")
    .map((b) => {
      const linkedVehicle = vehicles.find((v) => v.id === b.bilId);
      return { id: b.id, navn: b.navn, bilId: b.bilId || null, bil: linkedVehicle ? linkedVehicle.nummerplade : "" };
    });

  const refresh = async () => {
    if (!profile?.butikId) return;
    await Promise.all([ordersStore.reload(), catalog.reload(), vehiclesStore.reload(), timeOffStore.reload(), usersStore.reload()]);
  };
  const [refreshing, setRefreshing] = useState(false);
  const refreshWithSpinner = async () => { setRefreshing(true); await refresh(); setRefreshing(false); };

  // Sletning af en bil kræver en bekræftelse hvis den er tildelt en montør
  // - det tjek krydser vehicles OG users (technicians), og hører derfor
  // hjemme her i App.jsx, ikke inde i selve useVehicles-hooken.
  const deleteVehicleWithConfirm = (id) => {
    if (technicians.some((m) => m.bilId === id) && !window.confirm("Denne bil er tildelt en montør. Slet alligevel?")) return;
    vehiclesStore.deleteVehicle(id);
  };

  // Skifter hvilken bil en tekniker (bruger med rolle "montor") er tilknyttet.
  const updateTechnicianVehicle = (technicianId, vehicleId) => usersStore.updateUser(technicianId, { bilId: vehicleId || null });

  const selected = orders.find((s) => s.id === selectedId);

  // Dupliker/opfølgning - se OrderView.jsx. Åbner den nyoprettede sag med
  // det samme, så dato/montør kan vælges - selve oprettelsen sker i
  // useOrders-hooken, men hvilken sag der er "åben" (selectedId) er
  // UI-state der hører hjemme her i App.jsx.
  const duplicateOrder = async (sourceOrder, selectedLineItems) => {
    const newId = await ordersStore.duplicateOrder(sourceOrder, selectedLineItems);
    if (newId) setSelectedId(newId);
  };

  const technician = technicians.find((m) => m.id === selectedTechnicianId);
  const narrowPage = page === "montor" || !!selected;

  if (loading) {
    return <div className="min-h-screen w-full flex items-center justify-center bg-paper"><p className="text-sm text-muted">Indlæser...</p></div>;
  }

  if (!session) {
    return <LoginPage />;
  }

  if (!profile) {
    return <div className="min-h-screen w-full flex items-center justify-center bg-paper"><p className="text-sm text-muted">Indlæser profil...</p></div>;
  }

  if (!profile.butikId) {
    if (profile.erSystemadmin) {
      return (
        <div className="min-h-screen w-full bg-paper">
          <div className="max-w-2xl mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-4">
              <p className="font-mono text-[11px] tracking-widest uppercase text-brand">Systemadministration</p>
              <button onClick={logOut} className="text-xs text-muted hover:text-brand underline">Log ud</button>
            </div>
            <SystemAdminPage />
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen w-full flex items-center justify-center px-4 bg-paper">
        <div className="max-w-sm rounded-xl border border-line bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-ink">
            Din bruger er oprettet, men er endnu ikke koblet til en butik. Bed en administrator om at give dig adgang.
          </p>
          <button onClick={logOut} className="mt-4 text-xs text-muted hover:text-brand underline">Log ud</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-paper" style={{ fontFamily: "Inter, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        .font-mono { font-family: 'JetBrains Mono', monospace; }
      `}</style>

      <TopNav page={page} onChange={navigateTo} user={profile} onLogOut={logOut} />

      <div className={`${narrowPage ? "max-w-2xl" : "max-w-6xl"} mx-auto px-4 pb-10`}>
        {selected ? (
          <OrderView
            order={selected}
            technicians={technicians}
            onBack={() => setSelectedId(null)}
            addNote={(t) => ordersStore.addNote(selected.id, t)}
            addPhoto={(p) => ordersStore.addPhoto(selected.id, p)}
            addReport={(t, x) => ordersStore.addReport(selected.id, t, x)}
            onCycleStatus={ordersStore.cycleStatus}
            onClockIn={() => ordersStore.clockIn(selected.id)}
            onClockOut={() => ordersStore.clockOut(selected.id)}
            onToggleAddOn={(lineItemId, addOnId) => ordersStore.toggleAddOn(selected.id, lineItemId, addOnId)}
            onAddAddOn={(lineItemId, navn) => ordersStore.addAddOn(selected.id, lineItemId, navn)}
            onRemoveAddOn={(lineItemId, addOnId) => ordersStore.removeAddOn(selected.id, lineItemId, addOnId)}
            onUpdateBooking={(fields) => ordersStore.updateBooking(selected.id, fields)}
            onSaveSignature={(payload) => ordersStore.saveSignature(selected.id, payload)}
            onDuplicate={(selectedLineItems) => duplicateOrder(selected, selectedLineItems)}
          />
        ) : page === "salg" ? (
          <SalesPage orders={orders} technicians={technicians} productTypes={catalog.productTypes} productCategories={catalog.productCategories} primaryServices={catalog.primaryServices} addOnServices={catalog.addOnServices} selectedDate={selectedDate} onDateChange={setSelectedDate} onOpen={setSelectedId} onAdd={ordersStore.addOrder} onImport={ordersStore.importOrders} storeFocus={store?.lat && store?.lon ? { lat: store.lat, lon: store.lon } : null} />
        ) : page === "planlaegning" ? (
          <PlanningPage
            orders={orders} technicians={technicians} vehicles={vehicles} timeOff={timeOff}
            store={store}
            selectedDate={selectedDate} onDateChange={setSelectedDate}
            onOpen={setSelectedId} onCycleStatus={ordersStore.cycleStatus} onAssign={ordersStore.assignTechnician} onReorder={ordersStore.reorderOrder}
            onUpdateTechnician={(technicianId, fields) => updateTechnicianVehicle(technicianId, fields.bilId)}
            onRefresh={refreshWithSpinner} refreshing={refreshing}
          />
        ) : page === "montor" ? (
          profile.rolle === "montor" ? (
            technician ? <TechnicianRouteView orders={orders} technician={technician} selectedDate={selectedDate} onDateChange={setSelectedDate} onOpen={setSelectedId} onCycleStatus={ordersStore.cycleStatus} onReorder={ordersStore.reorderOrder} onRefresh={refreshWithSpinner} refreshing={refreshing} /> : <p className="text-sm text-muted">Din bruger er ikke koblet til en montør/bil-profil endnu — kontakt en administrator.</p>
          ) : technician ? (
            <TechnicianRouteView orders={orders} technician={technician} selectedDate={selectedDate} onDateChange={setSelectedDate} onOpen={setSelectedId} onCycleStatus={ordersStore.cycleStatus} onReorder={ordersStore.reorderOrder} onChangeTechnician={() => setSelectedTechnicianId(null)} onRefresh={refreshWithSpinner} refreshing={refreshing} />
          ) : (
            <TechnicianPicker technicians={technicians} onSelect={setSelectedTechnicianId} />
          )
        ) : page === "lager" ? (
          <WarehousePage orders={orders} technicians={technicians} vehicles={vehicles} selectedDate={selectedDate} onDateChange={setSelectedDate} onToggleLineItemPicked={ordersStore.toggleLineItemPicked} onOpen={setSelectedId} />
        ) : page === "arkiv" ? (
          <ArchivePage orders={orders} technicians={technicians} onOpen={setSelectedId} />
        ) : page === "systemadmin" ? (
          <SystemAdminPage />
        ) : (
          <AdminPage
            technicians={technicians} vehicles={vehicles} users={users} timeOff={timeOff} currentUserId={profile.id}
            productTypes={catalog.productTypes} productCategories={catalog.productCategories} primaryServices={catalog.primaryServices} addOnServices={catalog.addOnServices}
            onUpdateTechnicianVehicle={updateTechnicianVehicle} onAddVehicle={vehiclesStore.addVehicle} onUpdateVehicle={vehiclesStore.updateVehicle} onDeleteVehicle={deleteVehicleWithConfirm} onToggleVehicleClosed={vehiclesStore.toggleVehicleClosed}
            onAddUser={usersStore.addUser} onUpdateUser={usersStore.updateUser} onDeleteUser={usersStore.deleteUser} onResetPassword={usersStore.resetPassword}
            onAddProductCategory={catalog.addProductCategory} onUpdateProductCategory={catalog.updateProductCategory} onDeleteProductCategory={catalog.deleteProductCategory}
            onAddProductType={catalog.addProductType} onUpdateProductType={catalog.updateProductType} onDeleteProductType={catalog.deleteProductType}
            onAddPrimaryService={catalog.addPrimaryService} onUpdatePrimaryService={catalog.updatePrimaryService} onDeletePrimaryService={catalog.deletePrimaryService}
            onAddAddOnService={catalog.addAddOnService} onUpdateAddOnService={catalog.updateAddOnService} onDeleteAddOnService={catalog.deleteAddOnService}
            onAddTimeOff={timeOffStore.addTimeOff} onDeleteTimeOff={timeOffStore.deleteTimeOff}
          />
        )}
      </div>
    </div>
  );
}
