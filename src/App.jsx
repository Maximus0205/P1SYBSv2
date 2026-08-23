import React, { useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from "react-router-dom";

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
import { TechnicianPicker, TechnicianRouteView, TechnicianOrderDetail } from "./pages/TechnicianPage";
import { WarehousePage } from "./pages/WarehousePage";
import { ArchivePage } from "./pages/ArchivePage";
import { AdminPage } from "./pages/AdminPage";
import { SystemAdminPage } from "./pages/SystemAdminPage";

// ---------------------------------------------------------------------------
// ARKITEKTUR-OPRYDNING FULDFØRT (august 2026, 4 faser) + RIGTIG URL-ROUTING
// (samme måned): App.jsx var ved at blive for stor og blande for mange
// ansvarsområder (se rapport 22. august 2026). Al domænelogik er udtrukket
// til dedikerede hooks (se hooks/-mappen: useSession, useCatalog,
// useVehicles, useTimeOff, useUsers, useOrders). Navigation er nu en RIGTIG
// URL (via react-router-dom, HashRouter - se main.jsx for hvorfor hash), i
// stedet for kun React-state - det var den håndrullede hash-parsing
// FØRSTE forsøg på at løse, men en rigtig routing-løsning håndterer det
// robust for hele appen på én gang: fane-refresh, en åben sags egen URL
// (/sag/:id), browser-historik (tilbage/frem), og rolle-baseret adgang -
// i stedet for at hver ny slags "hvad skal huskes" skal håndkodes for sig.
// App.jsx's tilbageværende ansvar er nu: kalde hooks, definere rute-
// opsætningen, og komponere sider.
// ---------------------------------------------------------------------------

// Beskytter en rute mod roller der ikke må se den - sender videre til
// brugerens egen standardfane i stedet for at vise noget forkert. Dette er
// UI-bekvemmelighed, IKKE selve sikkerhedsgrænsen - den reelle beskyttelse
// ligger i Supabase RLS, ligesom resten af appen.
function Gate({ allowed, page, children }) {
  if (!allowed.includes(page)) return <Navigate to={`/${allowed[0] || "salg"}`} replace />;
  return children;
}

// Egen rute pr. sag (/sag/:id) - løser netop det problem der udløste hele
// denne omlægning: et refresh mens en specifik sag var åben, mistede
// tidligere hvilken sag man kiggede på. "Tilbage" bruger browserens egen
// historik (navigate(-1)), så man vender tilbage til PRÆCIS den fane man
// kom fra, uanset hvilken det var.
//
// VIGTIGT: montør-rollen ser en HELT ANDEN, dedikeret sagsdetalje
// (TechnicianOrderDetail i TechnicianPage.jsx) end admin/sælger (OrderView
// i components/OrderView.jsx) - bevidst holdt isoleret, så en ombygning af
// montør-visningen aldrig kan påvirke de andre roller. Selve dataene og
// handlerne (props) er identiske til begge - kun HVILKEN komponent der
// rammes afhænger af rollen.
function OrderRoute({ profile, orders, technicians, ordersStore, duplicateOrder }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const order = orders.find((o) => o.id === id);

  if (!order) {
    return (
      <div>
        <p className="text-sm text-muted mb-3">Sagen blev ikke fundet — den er muligvis slettet, eller linket er forkert.</p>
        <button onClick={() => navigate(-1)} className="text-sm text-brand hover:underline">← Tilbage</button>
      </div>
    );
  }

  const sharedProps = {
    order,
    technicians,
    onBack: () => navigate(-1),
    addNote: (t) => ordersStore.addNote(order.id, t),
    addPhoto: (p) => ordersStore.addPhoto(order.id, p),
    addReport: (t, x) => ordersStore.addReport(order.id, t, x),
    onCycleStatus: ordersStore.cycleStatus,
    onClockIn: () => ordersStore.clockIn(order.id),
    onClockOut: () => ordersStore.clockOut(order.id),
    onToggleAddOn: (lineItemId, addOnId) => ordersStore.toggleAddOn(order.id, lineItemId, addOnId),
    onAddAddOn: (lineItemId, navn) => ordersStore.addAddOn(order.id, lineItemId, navn),
    onRemoveAddOn: (lineItemId, addOnId) => ordersStore.removeAddOn(order.id, lineItemId, addOnId),
    onUpdateBooking: (fields) => ordersStore.updateBooking(order.id, fields),
    onSaveSignature: (payload) => ordersStore.saveSignature(order.id, payload),
    onDuplicate: (selectedLineItems) => duplicateOrder(order, selectedLineItems),
  };

  return profile.rolle === "montor" ? <TechnicianOrderDetail {...sharedProps} /> : <OrderView {...sharedProps} />;
}

// Montør-fanen: montører ser altid deres EGEN rute (ingen valg nødvendigt).
// Admin/sælger vælger en montør at se - valget ligger nu i URL'en
// (/montor/:technicianId), så det heller ikke går tabt ved et refresh.
function MontorRoute({ profile, orders, technicians, ordersStore, refresh, refreshing, selectedDate, onDateChange, onOpen }) {
  const { technicianId } = useParams();
  const navigate = useNavigate();

  if (profile.rolle === "montor") {
    const own = technicians.find((m) => m.id === profile.id);
    if (!own) return <p className="text-sm text-muted">Din bruger er ikke koblet til en montør/bil-profil endnu — kontakt en administrator.</p>;
    return (
      <TechnicianRouteView
        orders={orders} technician={own} selectedDate={selectedDate} onDateChange={onDateChange}
        onOpen={onOpen} onCycleStatus={ordersStore.cycleStatus} onReorder={ordersStore.reorderOrder}
        onRefresh={refresh} refreshing={refreshing}
      />
    );
  }

  const technician = technicians.find((m) => m.id === technicianId);
  if (!technician) {
    return <TechnicianPicker technicians={technicians} onSelect={(id) => navigate(`/montor/${id}`)} />;
  }
  return (
    <TechnicianRouteView
      orders={orders} technician={technician} selectedDate={selectedDate} onDateChange={onDateChange}
      onOpen={onOpen} onCycleStatus={ordersStore.cycleStatus} onReorder={ordersStore.reorderOrder}
      onChangeTechnician={() => navigate("/montor")} onRefresh={refresh} refreshing={refreshing}
    />
  );
}

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

  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [refreshing, setRefreshing] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

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
    setRefreshing(true);
    await Promise.all([ordersStore.reload(), catalog.reload(), vehiclesStore.reload(), timeOffStore.reload(), usersStore.reload()]);
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
  const updateTechnicianVehicle = (technicianId, vehicleId) => usersStore.updateUser(technicianId, { bilId: vehicleId || null });

  // Dupliker/opfølgning - se OrderRoute ovenfor. Åbner den nyoprettede sag
  // med det samme (rigtig navigation til dens egen URL), så dato/montør
  // kan vælges.
  const duplicateOrder = async (sourceOrder, selectedLineItems) => {
    const newId = await ordersStore.duplicateOrder(sourceOrder, selectedLineItems);
    if (newId) navigate(`/sag/${newId}`);
  };

  const onOpen = (id) => navigate(`/sag/${id}`);

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

  // De sider den indloggede bruger reelt må se, ud fra rolle - se Gate ovenfor.
  const allowedPages = PAGES_FOR_ROLE[profile.rolle] || ["salg"];
  const currentPage = location.pathname.replace(/^\//, "").split("/")[0] || allowedPages[0];
  const narrowPage = currentPage === "montor" || currentPage === "sag";

  return (
    <div className="min-h-screen w-full bg-paper" style={{ fontFamily: "Inter, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        .font-mono { font-family: 'JetBrains Mono', monospace; }
      `}</style>

      <TopNav page={currentPage} onChange={(key) => navigate(`/${key}`)} user={profile} onLogOut={logOut} />

      <div className={`${narrowPage ? "max-w-2xl" : "max-w-6xl"} mx-auto px-4 pb-10`}>
        <Routes>
          <Route path="/sag/:id" element={<OrderRoute profile={profile} orders={orders} technicians={technicians} ordersStore={ordersStore} duplicateOrder={duplicateOrder} />} />

          <Route path="/salg" element={
            <Gate allowed={allowedPages} page="salg">
              <SalesPage orders={orders} technicians={technicians} productTypes={catalog.productTypes} productCategories={catalog.productCategories} primaryServices={catalog.primaryServices} addOnServices={catalog.addOnServices} selectedDate={selectedDate} onDateChange={setSelectedDate} onOpen={onOpen} onAdd={ordersStore.addOrder} onImport={ordersStore.importOrders} storeFocus={store?.lat && store?.lon ? { lat: store.lat, lon: store.lon } : null} />
            </Gate>
          } />

          <Route path="/planlaegning" element={
            <Gate allowed={allowedPages} page="planlaegning">
              <PlanningPage
                orders={orders} technicians={technicians} vehicles={vehicles} timeOff={timeOff}
                store={store}
                selectedDate={selectedDate} onDateChange={setSelectedDate}
                onOpen={onOpen} onCycleStatus={ordersStore.cycleStatus} onAssign={ordersStore.assignTechnician} onReorder={ordersStore.reorderOrder}
                onUpdateTechnician={(technicianId, fields) => updateTechnicianVehicle(technicianId, fields.bilId)}
                onRefresh={refresh} refreshing={refreshing}
              />
            </Gate>
          } />

          <Route path="/montor" element={
            <Gate allowed={allowedPages} page="montor">
              <MontorRoute profile={profile} orders={orders} technicians={technicians} ordersStore={ordersStore} refresh={refresh} refreshing={refreshing} selectedDate={selectedDate} onDateChange={setSelectedDate} onOpen={onOpen} />
            </Gate>
          } />
          <Route path="/montor/:technicianId" element={
            <Gate allowed={allowedPages} page="montor">
              <MontorRoute profile={profile} orders={orders} technicians={technicians} ordersStore={ordersStore} refresh={refresh} refreshing={refreshing} selectedDate={selectedDate} onDateChange={setSelectedDate} onOpen={onOpen} />
            </Gate>
          } />

          <Route path="/lager" element={
            <Gate allowed={allowedPages} page="lager">
              <WarehousePage orders={orders} technicians={technicians} vehicles={vehicles} selectedDate={selectedDate} onDateChange={setSelectedDate} onToggleLineItemPicked={ordersStore.toggleLineItemPicked} onOpen={onOpen} />
            </Gate>
          } />

          <Route path="/arkiv" element={
            <Gate allowed={allowedPages} page="arkiv">
              <ArchivePage orders={orders} technicians={technicians} onOpen={onOpen} />
            </Gate>
          } />

          <Route path="/admin" element={
            <Gate allowed={allowedPages} page="admin">
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
            </Gate>
          } />

          {/* Ukendte/manglende ruter (inkl. "/" ved første besøg) sendes til
              brugerens egen standardfane - ikke nogen "404-side", da hele
              app'en jo kun har det her faste sæt fritstående faner. */}
          <Route path="*" element={<Navigate to={`/${allowedPages[0]}`} replace />} />
        </Routes>
      </div>
    </div>
  );
}
