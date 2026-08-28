import React, { useEffect, useMemo, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from "react-router-dom";

import { todayISO, computeNotifications } from "./data/domain";
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
// stedet for kun React-state. App.jsx's tilbageværende ansvar er nu: kalde
// hooks, definere rute-opsætningen, og komponere sider.
// ---------------------------------------------------------------------------

function Gate({ allowed, page, children }) {
  if (!allowed.includes(page)) return <Navigate to={`/${allowed[0] || "salg"}`} replace />;
  return children;
}

function OrderRoute({ profile, orders, technicians, ordersStore, duplicateOrder, permissions }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const order = orders.find((o) => o.id === id);

  useEffect(() => {
    if (!order || order.oprettetAf?.id !== profile.id) return;
    const kinds = [];
    if ((order.materialer || []).length > 0 && !order.notifikationSet?.materialer) kinds.push("materialer");
    if (order.problem && !order.notifikationSet?.problem) kinds.push("problem");
    if (order.harOpfoelgning && !order.notifikationSet?.opfoelgning) kinds.push("opfoelgning");
    if (kinds.length > 0) ordersStore.dismissNotifications(order.id, kinds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.materialer?.length, order?.problem, order?.harOpfoelgning, order?.notifikationSet]);

  if (!order) {
    return (
      <div>
        <p className="text-sm text-muted mb-3">Sagen blev ikke fundet — den er muligvis slettet, eller linket er forkert.</p>
        <button onClick={() => navigate(-1)} className="text-sm text-brand hover:underline">← Tilbage</button>
      </div>
    );
  }

  const followUpOrder = order.harOpfoelgning ? orders.find((o) => o.id === order.harOpfoelgning) : null;
  const originalOrder = order.opfoelgningAf ? orders.find((o) => o.id === order.opfoelgningAf) : null;

  const sharedProps = {
    order,
    technicians,
    permissions,
    onBack: () => navigate(-1),
    addNote: (t) => ordersStore.addNote(order.id, t, { id: profile.id, navn: profile.navn }),
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
    onAddMaterial: (fields) => ordersStore.addMaterial(order.id, fields),
    onRemoveMaterial: (materialId) => ordersStore.removeMaterial(order.id, materialId),
    onMarkProblem: (note) => ordersStore.markProblem(order.id, note),
    onClearProblem: () => ordersStore.clearProblem(order.id),
    onOpenOrder: (targetId) => navigate(`/sag/${targetId}`),
    followUpOrder, originalOrder,
  };

  return profile.rolle === "montor" ? <TechnicianOrderDetail {...sharedProps} /> : <OrderView {...sharedProps} />;
}

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

// Faste side-nøgler der har ét-til-ét-navn med en "side"-rettighed af
// samme navn (se permissions-kataloget i databasen). "admin" er en
// undtagelse - den er en PARAPLY over 5 finere admin_*-rettigheder (se
// AdminPage.jsx, som selv viser/skjuler sine egne faner ud fra dem); har
// man BLOT ÉN af dem, skal man kunne se Admin-fanen overhovedet.
const PAGE_PERMISSION_KEYS = ["salg", "planlaegning", "montor", "lager", "arkiv"];

export default function App() {
  const { loading, session, profile, store, permissions, logOut } = useSession();

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
  // Sygemeldingsvinduet (timer) kan rettes af butikkens admin (se
  // AdminPage/SickLeaveWindowSetting) - useSession genindlæser ikke
  // automatisk butikken efter det, så vi holder en lokal override her, der
  // vinder over den oprindeligt indlæste værdi, indtil næste login/refresh.
  const [sickLeaveWindowOverride, setSickLeaveWindowOverride] = useState(null);
  const effectiveStore = store ? { ...store, sygemeldingVindueTimer: sickLeaveWindowOverride ?? store.sygemeldingVindueTimer } : store;

  const navigate = useNavigate();
  const location = useLocation();

  const technicians = users
    .filter((b) => b.rolle === "montor")
    .map((b) => {
      const linkedVehicle = vehicles.find((v) => v.id === b.bilId);
      return { id: b.id, navn: b.navn, bilId: b.bilId || null, bil: linkedVehicle ? linkedVehicle.nummerplade : "" };
    });

  const notifications = useMemo(() => computeNotifications(orders, profile?.id), [orders, profile?.id]);

  const refresh = async () => {
    if (!profile?.butikId) return;
    setRefreshing(true);
    await Promise.all([ordersStore.reload(), catalog.reload(), vehiclesStore.reload(), timeOffStore.reload(), usersStore.reload()]);
    setRefreshing(false);
  };

  const deleteVehicleWithConfirm = (id) => {
    if (technicians.some((m) => m.bilId === id) && !window.confirm("Denne bil er tildelt en montør. Slet alligevel?")) return;
    vehiclesStore.deleteVehicle(id);
  };

  const updateTechnicianVehicle = (technicianId, vehicleId) => usersStore.updateUser(technicianId, { bilId: vehicleId || null });

  const addOrder = (fields) => ordersStore.addOrder({ ...fields, createdBy: profile ? { id: profile.id, navn: profile.navn } : null });

  const duplicateOrder = async (sourceOrder, selectedLineItems) => {
    const createdBy = profile ? { id: profile.id, navn: profile.navn } : null;
    const newId = await ordersStore.duplicateOrder(sourceOrder, selectedLineItems, createdBy);
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

  // RETTET (august 2026): faneadgang styres nu af brugerens FAKTISKE,
  // håndhævede rettigheder (permissions, hentet i useSession via
  // my_effective_permissions() i databasen) i stedet for en fast
  // PAGES_FOR_ROLE[rolle]-opslagstabel. En systemadmin ser altid alt (de
  // går allerede udenom alle tilsvarende databasetjek, se
  // orders_guard_field_groups/profiles_guard_privileged_fields-triggerne),
  // uafhængigt af hvilke rettigheder deres egen butiks-profil måtte have.
  const allowedPages = profile.erSystemadmin
    ? [...PAGE_PERMISSION_KEYS, "admin"]
    : [
        ...PAGE_PERMISSION_KEYS.filter((k) => permissions.includes(k)),
        ...(permissions.some((p) => p.startsWith("admin_")) ? ["admin"] : []),
      ];
  // Sendes videre til sider der låser ENKELTE felter/knapper efter
  // finkornede sags-rettigheder (sag_kunde/sag_planlaegning/sag_pluk/
  // sag_feltarbejde/sag_opret - se OrderView.jsx/WarehousePage.jsx). null
  // for en systemadmin = "ubegrænset" (se canDo() i domain.js), ligesom
  // for Admin-sidens egne faner ovenfor.
  const effectivePermissions = profile.erSystemadmin ? null : permissions;
  const currentPage = location.pathname.replace(/^\//, "").split("/")[0] || allowedPages[0];
  const narrowPage = currentPage === "montor" || currentPage === "sag";
  const hideTopNav = currentPage === "sag" && profile.rolle === "montor";

  return (
    <div className="min-h-screen w-full bg-paper" style={{ fontFamily: "Inter, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        .font-mono { font-family: 'JetBrains Mono', monospace; }
      `}</style>

      {!hideTopNav && <TopNav page={currentPage} onChange={(key) => navigate(`/${key}`)} user={profile} onLogOut={logOut} notifications={notifications} onOpenOrder={onOpen} allowedPages={allowedPages} />}

      <div className={`${narrowPage ? "max-w-2xl" : "max-w-6xl"} mx-auto px-4 pb-10 ${hideTopNav ? "pt-4" : ""}`}>
        <Routes>
          <Route path="/sag/:id" element={<OrderRoute profile={profile} orders={orders} technicians={technicians} ordersStore={ordersStore} duplicateOrder={duplicateOrder} permissions={effectivePermissions} />} />

          <Route path="/salg" element={
            <Gate allowed={allowedPages} page="salg">
              <SalesPage orders={orders} technicians={technicians} productTypes={catalog.productTypes} productCategories={catalog.productCategories} primaryServices={catalog.primaryServices} addOnServices={catalog.addOnServices} selectedDate={selectedDate} onDateChange={setSelectedDate} onOpen={onOpen} onAdd={addOrder} onImport={ordersStore.importOrders} storeFocus={effectiveStore?.lat && effectiveStore?.lon ? { lat: effectiveStore.lat, lon: effectiveStore.lon } : null} />
            </Gate>
          } />

          <Route path="/planlaegning" element={
            <Gate allowed={allowedPages} page="planlaegning">
              <PlanningPage
                orders={orders} technicians={technicians} vehicles={vehicles} timeOff={timeOff}
                store={effectiveStore}
                selectedDate={selectedDate} onDateChange={setSelectedDate}
                onOpen={onOpen} onCycleStatus={ordersStore.cycleStatus} onAssign={ordersStore.assignTechnician} onReorder={ordersStore.reorderOrder} onSetVisitOrder={ordersStore.setVisitOrder}
                onUpdateBooking={ordersStore.updateBooking} onClearProblem={ordersStore.clearProblem}
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
              <WarehousePage orders={orders} technicians={technicians} vehicles={vehicles} selectedDate={selectedDate} onDateChange={setSelectedDate} onToggleLineItemPicked={ordersStore.toggleLineItemPicked} onOpen={onOpen} permissions={effectivePermissions} />
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
                technicians={technicians} vehicles={vehicles} users={users} timeOff={timeOff} currentUserId={profile.id} store={effectiveStore}
                productTypes={catalog.productTypes} productCategories={catalog.productCategories} primaryServices={catalog.primaryServices} addOnServices={catalog.addOnServices}
                permissions={effectivePermissions}
                onUpdateTechnicianVehicle={updateTechnicianVehicle} onAddVehicle={vehiclesStore.addVehicle} onUpdateVehicle={vehiclesStore.updateVehicle} onDeleteVehicle={deleteVehicleWithConfirm} onToggleVehicleClosed={vehiclesStore.toggleVehicleClosed}
                onAddUser={usersStore.addUser} onUpdateUser={usersStore.updateUser} onDeleteUser={usersStore.deleteUser} onResetPassword={usersStore.resetPassword} onUpdatePermissions={usersStore.updatePermissions}
                onAddProductCategory={catalog.addProductCategory} onUpdateProductCategory={catalog.updateProductCategory} onDeleteProductCategory={catalog.deleteProductCategory}
                onAddProductType={catalog.addProductType} onUpdateProductType={catalog.updateProductType} onDeleteProductType={catalog.deleteProductType}
                onAddPrimaryService={catalog.addPrimaryService} onUpdatePrimaryService={catalog.updatePrimaryService} onDeletePrimaryService={catalog.deletePrimaryService}
                onAddAddOnService={catalog.addAddOnService} onUpdateAddOnService={catalog.updateAddOnService} onDeleteAddOnService={catalog.deleteAddOnService}
                onAddTimeOff={timeOffStore.addTimeOff} onDeleteTimeOff={timeOffStore.deleteTimeOff}
                onSygemeld={timeOffStore.sygemeld} onRaskmeld={timeOffStore.raskmeld} onSickLeaveWindowUpdated={setSickLeaveWindowOverride}
              />
            </Gate>
          } />

          {/* Systemadministration: styret af profiles.is_system_admin, IKKE af
              PAGE_PERMISSION_KEYS/allowedPages (som kun kender de almindelige
              butiks-rettigheder). Dækker den bruger, der er BÅDE systemadmin OG
              koblet til sin egen butik - uden denne rute var "System"-fanen i
              TopNav et dødt link for dem (RETTET august 2026, fejl fundet ved
              test - se rapport 26. august 2026). Systemadmins UDEN egen butik
              rammer aldrig denne rute, de får SystemAdminPage vist direkte
              ovenfor (se "!profile.butikId"-grenen), før Routes overhovedet når at blive nået. */}
          <Route path="/systemadmin" element={
            profile.erSystemadmin ? <SystemAdminPage /> : <Navigate to={`/${allowedPages[0]}`} replace />
          } />

          <Route path="*" element={<Navigate to={`/${allowedPages[0]}`} replace />} />
        </Routes>
      </div>
    </div>
  );
}
