import React, { useState, useEffect } from "react";

import { supabase } from "./lib/supabaseClient";
import { getOwnProfile, getStore } from "./lib/dataStore";
import { todayISO, PAGES_FOR_ROLE } from "./data/domain";
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

export default function App() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [session, setSession] = useState(null); // Supabase Auth-session (null = ikke logget ind)
  const [profile, setProfile] = useState(null); // { id, navn, rolle, bilId, butikId, erSystemadmin }
  const [store, setStore] = useState(null); // { id, navn, adresse, lat, lon } - egen butiks koordinater
  const [page, setPage] = useState("salg");
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [selectedTechnicianId, setSelectedTechnicianId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  // FASE 1-3 af arkitektur-oprydningen (august 2026): varekatalog, biler,
  // fravær, brugere og nu ORDRER (den suverænt største og mest centrale
  // del) er alle udtrukket til hver sin hook - se hooks/-mappen for selve
  // state/CRUD-logikken og begrundelsen. App.jsx kalder dem blot og
  // videregiver deres data/funktioner. Kun SESSION/BUTIK-laget ligger
  // tilbage direkte i App.jsx, som fase 4 (sidste) af samme oprydning -
  // den flyttes for sig, da den indeholder den kendte, følsomme fælde med
  // onAuthStateChange (se kommentar nedenfor).
  const catalog = useCatalog(profile?.butikId);
  const vehiclesStore = useVehicles(profile?.butikId);
  const timeOffStore = useTimeOff(profile?.butikId);
  const usersStore = useUsers(profile?.butikId);
  const ordersStore = useOrders(profile?.butikId);
  const { vehicles } = vehiclesStore;
  const { timeOff } = timeOffStore;
  const { users } = usersStore;
  const { orders } = ordersStore;

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

  const reloadProfile = async (userId) => {
    const p = await getOwnProfile(userId);
    if (!p) { setProfile(null); return null; }
    const normalized = { id: p.id, navn: p.navn, rolle: p.rolle, bilId: p.bil_id, butikId: p.butik_id, erSystemadmin: !!p.er_systemadmin };
    setProfile(normalized);
    if (normalized.butikId) {
      setPage((PAGES_FOR_ROLE[normalized.rolle] || ["salg"])[0]);
      if (normalized.rolle === "montor") setSelectedTechnicianId(normalized.id);
      const storeData = await getStore(normalized.butikId);
      setStore(storeData);
      // Ordrer/biler/fravær/brugere/varekatalog hentes automatisk af deres
      // respektive hooks, når profile.butikId (deres storeId-parameter)
      // sættes ovenfor og komponenten genrenderer - intet ekstra load-kald
      // nødvendigt her længere.
    } else if (normalized.erSystemadmin) {
      setPage("systemadmin");
    }
    return normalized;
  };

  useEffect(() => {
    // Første indlæsning: tjek om der allerede er en session.
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await reloadProfile(data.session.user.id);
      setLoading(false);
    });

    // Lyt løbende på login/logout (fra denne eller andre faner).
    //
    // VIGTIGT: denne callback må ikke selv "await"'e andre Supabase-kald
    // (som fx reloadProfile -> supabase.from(...)). Supabase-auth-klienten
    // holder en intern lås mens callbacken kører, så et synkront await her
    // på et andet Supabase-kald fryser hele klienten (kendt supabase-js-
    // fælde). setTimeout(..., 0) skubber arbejdet til næste "tick", uden for
    // låsen, så login rent faktisk kan fuldføre.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        setTimeout(() => { reloadProfile(newSession.user.id); }, 0);
      } else {
        setProfile(null);
        setStore(null);
        // Ordrer/biler/fravær/brugere/varekatalog rydder sig selv, når
        // deres storeId (afledt af profile?.butikId) bliver null - se de
        // enkelte hooks' egne useEffect.
        setSelectedId(null);
      }
    });

    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    if (profile?.butikId) {
      await Promise.all([ordersStore.reload(), catalog.reload(), vehiclesStore.reload(), timeOffStore.reload(), usersStore.reload()]);
    }
    setRefreshing(false);
  };

  // Sletning af en bil kræver en bekræftelse hvis den er tildelt en montør
  // - det tjek krydser vehicles OG users (technicians), og hører derfor
  // hjemme her i App.jsx, ikke inde i selve useVehicles-hooken.
  const deleteVehicleWithConfirm = (id) => {
    if (technicians.some((m) => m.bilId === id) && !window.confirm("Denne bil er tildelt en montør. Slet alligevel?")) return;
    vehiclesStore.deleteVehicle(id);
  };

  // Skifter hvilken bil en tekniker (bruger med rolle "montor") er tilknyttet.
  // Fraværsperioder flytter automatisk med, fordi blokeringen beregnes ud fra
  // denne tilknytning i stedet for at blive gemt fast på selve bilen.
  const updateTechnicianVehicle = (technicianId, vehicleId) => usersStore.updateUser(technicianId, { bilId: vehicleId || null });

  const logOut = async () => { await supabase.auth.signOut(); };

  const selected = orders.find((s) => s.id === selectedId);

  // Dupliker/opfølgning - se OrderView.jsx. Åbner den nyoprettede sag med
  // det samme, så dato/montør kan vælges (det er jo netop DET en
  // opfølgning drejer sig om) - selve oprettelsen sker i useOrders-hooken,
  // men hvilken sag der er "åben" (selectedId) er UI-state der hører
  // hjemme her i App.jsx.
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

      <TopNav page={page} onChange={(k) => { setPage(k); setSelectedId(null); }} user={profile} onLogOut={logOut} />

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
            onRefresh={refresh} refreshing={refreshing}
          />
        ) : page === "montor" ? (
          profile.rolle === "montor" ? (
            technician ? <TechnicianRouteView orders={orders} technician={technician} selectedDate={selectedDate} onDateChange={setSelectedDate} onOpen={setSelectedId} onCycleStatus={ordersStore.cycleStatus} onReorder={ordersStore.reorderOrder} onRefresh={refresh} refreshing={refreshing} /> : <p className="text-sm text-muted">Din bruger er ikke koblet til en montør/bil-profil endnu — kontakt en administrator.</p>
          ) : technician ? (
            <TechnicianRouteView orders={orders} technician={technician} selectedDate={selectedDate} onDateChange={setSelectedDate} onOpen={setSelectedId} onCycleStatus={ordersStore.cycleStatus} onReorder={ordersStore.reorderOrder} onChangeTechnician={() => setSelectedTechnicianId(null)} onRefresh={refresh} refreshing={refreshing} />
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
