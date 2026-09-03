import React, { useEffect, useMemo, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from "react-router-dom";

import { todayISO, computeNotifications, DEFAULT_DASHBOARD_WIDGETS } from "./data/domain";
import { useSession } from "./hooks/useSession";
import { useCatalog } from "./hooks/useCatalog";
import { useVehicles } from "./hooks/useVehicles";
import { useTimeOff } from "./hooks/useTimeOff";
import { useUsers } from "./hooks/useUsers";
import { useOrders } from "./hooks/useOrders";
import { getAllStores, getStore, updateDashboardWidgets } from "./lib/dataStore";

import { TopNav } from "./components/TopNav";
import { LoginPage } from "./components/LoginPage";
import { OrderView } from "./components/OrderView";

import { DashboardPage } from "./pages/DashboardPage";
import { SalesPage } from "./pages/SalesPage";
import { PlanningPage } from "./pages/PlanningPage";
import { TechnicianRouteView, TechnicianOrderDetail } from "./pages/TechnicianPage";
import { WarehousePage } from "./pages/WarehousePage";
import { ArchivePage } from "./pages/ArchivePage";
import { AdminPage } from "./pages/AdminPage";
import { SystemAdminPage } from "./pages/SystemAdminPage";

// ---------------------------------------------------------------------------
// App.jsx's ansvar er: kalde hooks, definere rute-opsætningen, og komponere
// sider. Al domænelogik ligger i hooks/-mappen (useSession, useCatalog,
// useVehicles, useTimeOff, useUsers, useOrders). Navigation er en rigtig
// URL via react-router-dom (HashRouter - se main.jsx for hvorfor hash).
// ---------------------------------------------------------------------------

// KØRER DENNE PERSON SELV? (september 2026)
//
// Rollen 'montor' gør en bruger til montør som hidtil. can_drive gør det
// samme for alle ANDRE roller, uden at ændre hvad de ellers må: en sælger
// eller admin, der tager en rute en gang imellem, skal ikke have en ekstra
// brugerkonto. To konti for samme menneske spreder sagerne over to navne
// og sender notifikationer til den forkerte af dem.
//
// Bruges to steder, og det er vigtigt at det er DEN SAMME regel begge
// steder: til at afgøre hvem der kan tildeles sager (technicians-listen),
// og til at afgøre hvem der ser Montør-fanen. Faldt de to fra hinanden,
// ville nogen kunne blive tildelt sager, de ikke selv kunne se.
const koererSelv = (bruger) => bruger?.rolle === "montor" || bruger?.kanKoere === true;

function Gate({ allowed, page, children }) {
  if (!allowed.includes(page)) return <Navigate to={`/${allowed[0] || "dashboard"}`} replace />;
  return children;
}

function OrderRoute({ profile, orders, technicians, ordersStore, duplicateOrder, permissions, catalog }) {
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
    // BEMÆRK: "manglendeVarer" står bevidst IKKE på listen. Den er ikke en
    // besked, der er set, men en uafklaret tilstand - at åbne sagen løser
    // ikke, at varen mangler. Den forsvinder først, når sagen får en ny
    // dato, varen ændres, eller lageret fjerner markeringen (se
    // isMissingActive i domain.js).
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
    onToggleAddOn: (lineItemId, addOnId) => ordersStore.toggleAddOn(order.id, lineItemId, addOnId),
    onAddAddOn: (lineItemId, navn) => ordersStore.addAddOn(order.id, lineItemId, navn),
    onRemoveAddOn: (lineItemId, addOnId) => ordersStore.removeAddOn(order.id, lineItemId, addOnId),
    onUpdateBooking: (fields) => ordersStore.updateBooking(order.id, fields),
    onDuplicate: (selectedLineItems) => duplicateOrder(order, selectedLineItems),
    onAddMaterial: (fields) => ordersStore.addMaterial(order.id, fields),
    onRemoveMaterial: (materialId) => ordersStore.removeMaterial(order.id, materialId),
    onMarkProblem: (note) => ordersStore.markProblem(order.id, note),
    onClearProblem: () => ordersStore.clearProblem(order.id),
    onOpenOrder: (targetId) => navigate(`/sag/${targetId}`),
    followUpOrder, originalOrder,

    // ---- Start / færdigmelding (september 2026) ----
    // Erstatter status-skifteren. Status er nu en KONSEKVENS af to
    // handlinger, montøren foretager alligevel - og de to tidsstempler er
    // samtidig grundlaget for tidsestimaterne (se data/estimates.js).
    onStartOrder: () => ordersStore.startOrder(order.id),
    onFinishOrder: () => ordersStore.finishOrder(order.id),
    onReopenOrder: () => ordersStore.reopenOrder(order.id),

    // ---- Varelinjer på en eksisterende sag (august 2026) ----
    // Kataloget sendes med, fordi varelinje-editoren skal kunne tilbyde de
    // samme varetyper/ydelser som ved oprettelsen - ellers ville man kunne
    // rette en sag til noget, butikken ikke udfører.
    catalog,
    onUpdateLineItem: (lineItemId, fields) => ordersStore.updateLineItem(order.id, lineItemId, fields),
    onAddLineItem: (lineItem) => ordersStore.addLineItem(order.id, lineItem),
    onRemoveLineItem: (lineItemId) => ordersStore.removeLineItem(order.id, lineItemId),
    onSetLineItems: (varelinjer) => ordersStore.setLineItems(order.id, varelinjer),

    // Sælgeren kan fjerne en manglende-vare-markering direkte, hvis sagen
    // er afklaret med kunden på anden vis end at ombooke eller skifte
    // varen. Selve MELDINGEN kan kun lageret oprette - se WarehousePage.
    onClearMissingItem: (lineItemId) => ordersStore.clearMissingItem(order.id, lineItemId),

    // Sletning navigerer væk BAGEFTER og kun hvis det lykkedes - ellers
    // ville man ende på en tom side, mens sagen stadig lå i databasen.
    onDeleteOrder: async () => {
      const ok = await ordersStore.deleteOrder(order.id);
      if (ok) navigate("/planlaegning", { replace: true });
      return ok;
    },
  };

  // Montørvisningen af en sag er den, der har Start/Færdigmeld. Den vises
  // til ALLE der selv kører - ikke kun til rollen 'montor'. En sælger med
  // dobbeltrolle skal have præcis samme arbejdsskærm i bilen som en
  // montør; det er den samme opgave, der skal udføres.
  return koererSelv(profile) ? <TechnicianOrderDetail {...sharedProps} /> : <OrderView {...sharedProps} />;
}

// Montørvisningen er ARBEJDSSKÆRMEN for den, der sidder i bilen - ikke et
// overblik over andres ruter. Derfor vises den KUN til folk, der selv
// kører (se allowedPages nedenfor), og den viser altid ÉN persons tur:
// din egen.
//
// FJERNET (september 2026): montør-VÆLGEREN, hvor en sælger eller admin
// kunne bladre gennem alle montørers ruter. Den slags overblik hører
// hjemme i Planlægning, hvor hele ugen kan ses på én gang - og efter at
// sælgere og systemadmins ikke længere har fanen, var vælgeren kun en
// omvej for de få, der havde den. Skal man se en andens dag, gør man det
// i Planlægning.
function MontorRoute({ profile, orders, technicians, ordersStore, refresh, refreshing, selectedDate, onDateChange, onOpen }) {
  const own = technicians.find((m) => m.id === profile.id);
  if (!own) {
    return (
      <p className="text-sm text-muted">
        Din bruger er ikke koblet til en bil endnu — bed en administrator om at tildele dig en under Admin → Montører.
      </p>
    );
  }
  return (
    <TechnicianRouteView
      orders={orders} technician={own} selectedDate={selectedDate} onDateChange={onDateChange}
      onOpen={onOpen} onReorder={ordersStore.reorderOrder}
      onRefresh={refresh} refreshing={refreshing}
    />
  );
}

// Faste side-nøgler der har ét-til-ét-navn med en "side"-rettighed af
// samme navn. "admin" er en undtagelse - den er en PARAPLY over 5 finere
// admin_*-rettigheder (AdminPage viser/skjuler selv sine faner ud fra
// dem); har man BLOT ÉN af dem, skal man kunne se Admin-fanen.
//
// "montor" står bevidst IKKE på listen. Den fane afhænger ikke af en
// rettighed, men af om man FAKTISK KØRER - se allowedPages nedenfor.
const PAGE_PERMISSION_KEYS = ["salg", "planlaegning", "lager", "arkiv"];

export default function App() {
  const { loading, session, profile, permissions, logOut, reloadPermissions } = useSession();

  // BUTIKS-SKIFT: activeStoreId er den butik, hvis data der vises lige nu.
  // For de fleste er det altid deres egen (profile.butikId) - men en
  // SYSTEMADMIN kan skifte til en anden butik for at hjælpe den, uden at
  // det ændrer deres egen brugerkonto. Ren UI-tilstand.
  // undefined = "endnu ikke initialiseret fra profilen" (adskilt fra null
  // = "bevidst ingen butik"), så øjeblikket mellem profil-indlæsning og
  // initialisering kan vises som loading i stedet for "ingen butik".
  const [activeStoreId, setActiveStoreId] = useState(undefined);
  const [allStores, setAllStores] = useState([]);
  const [activeStore, setActiveStore] = useState(null);

  useEffect(() => {
    if (profile && activeStoreId === undefined) setActiveStoreId(profile.butikId || null);
  }, [profile, activeStoreId]);

  useEffect(() => {
    if (profile?.erSystemadmin) getAllStores().then(setAllStores);
  }, [profile?.erSystemadmin]);

  useEffect(() => {
    if (!activeStoreId) { setActiveStore(null); return; }
    getStore(activeStoreId).then(setActiveStore);
  }, [activeStoreId]);

  const catalog = useCatalog(activeStoreId || null);
  const vehiclesStore = useVehicles(activeStoreId || null);
  const timeOffStore = useTimeOff(activeStoreId || null);
  const usersStore = useUsers(activeStoreId || null);
  const ordersStore = useOrders(activeStoreId || null);
  const { vehicles } = vehiclesStore;
  const { timeOff } = timeOffStore;
  const { users } = usersStore;
  const { orders } = ordersStore;

  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [refreshing, setRefreshing] = useState(false);
  // Sygemeldingsvinduet kan rettes af butikkens admin og hentes ikke
  // automatisk igen bagefter, så vi holder en lokal override her.
  const [sickLeaveWindowOverride, setSickLeaveWindowOverride] = useState(null);
  const effectiveStore = activeStore ? { ...activeStore, sygemeldingVindueTimer: sickLeaveWindowOverride ?? activeStore.sygemeldingVindueTimer } : activeStore;

  const switchStore = (storeId) => { setSickLeaveWindowOverride(null); setActiveStoreId(storeId); };
  const exitStoreView = () => { setSickLeaveWindowOverride(null); setActiveStoreId(null); };

  const navigate = useNavigate();
  const location = useLocation();

  // Hvem kan tildeles sager? Alle der selv kører - se koererSelv ovenfor.
  // Tidligere var det udelukkende rollen 'montor', og det var derfor
  // umuligt at give en sælger en rute uden at oprette en ekstra bruger.
  const technicians = users
    .filter(koererSelv)
    .map((b) => {
      const linkedVehicle = vehicles.find((v) => v.id === b.bilId);
      return { id: b.id, navn: b.navn, bilId: b.bilId || null, bil: linkedVehicle ? linkedVehicle.nummerplade : "" };
    });

  const notifications = useMemo(() => computeNotifications(orders, profile?.id), [orders, profile?.id]);

  const refresh = async () => {
    if (!activeStoreId) return;
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

  // MANGLENDE VARER: lageret melder, at en vare ikke kan findes ved pluk.
  // Hvem der meldte den gemmes med - en melding uden afsender er svær at
  // handle på, når man står med kunden i telefonen.
  const reportMissingItem = (orderId, lineItemId, note) =>
    ordersStore.reportMissingItem(orderId, lineItemId, note, profile ? { id: profile.id, navn: profile.navn } : null);

  const updateDashboardWidgetsFor = async (keys) => {
    if (!profile) return;
    await updateDashboardWidgets(profile.id, keys);
    reloadPermissions();
  };

  if (loading) {
    return <div className="min-h-screen w-full flex items-center justify-center bg-paper"><p className="text-sm text-muted">Indlæser...</p></div>;
  }

  if (!session) {
    return <LoginPage />;
  }

  if (!profile || activeStoreId === undefined) {
    return <div className="min-h-screen w-full flex items-center justify-center bg-paper"><p className="text-sm text-muted">Indlæser profil...</p></div>;
  }

  if (!activeStoreId) {
    if (profile.erSystemadmin) {
      return (
        <div className="min-h-screen w-full bg-paper">
          <div className="max-w-2xl mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-4">
              <p className="font-mono text-[11px] tracking-widest uppercase text-brand">Systemadministration</p>
              <button onClick={logOut} className="text-xs text-muted hover:text-brand underline">Log ud</button>
            </div>
            {allStores.length > 0 && (
              <div className="mb-6 rounded-xl border border-line bg-white p-4 shadow-sm">
                <label className="text-xs text-muted block mb-1.5">Se og hjælp en specifik butik</label>
                <select
                  defaultValue=""
                  onChange={(e) => e.target.value && switchStore(e.target.value)}
                  className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
                >
                  <option value="">Vælg en butik...</option>
                  {allStores.map((s) => <option key={s.id} value={s.id}>{s.navn}</option>)}
                </select>
              </div>
            )}
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

  // Faneadgang styres af brugerens FAKTISKE, håndhævede rettigheder
  // (hentet via my_effective_permissions() i databasen). En systemadmin
  // ser altid alt - de går allerede udenom de tilsvarende databasetjek.
  // "dashboard" er altid først og altid tilgængelig.
  //
  // MONTØR-FANEN ER EN UNDTAGELSE (september 2026): den afhænger ikke af
  // rettigheder eller af systemadmin-status, men af om man FAKTISK KØRER.
  // Montørvisningen er arbejdsskærmen for den, der sidder i bilen - den
  // har ingen værdi for en sælger på kontoret eller en systemadmin, der
  // kigger ind i en butik. Skal en funktion fremvises eller testes,
  // oprettes en demobruger, der rent faktisk har en rute.
  const kanKoereRute = koererSelv(profile);
  const allowedPages = profile.erSystemadmin
    ? ["dashboard", ...PAGE_PERMISSION_KEYS, ...(kanKoereRute ? ["montor"] : []), "admin"]
    : [
        "dashboard",
        ...PAGE_PERMISSION_KEYS.filter((k) => permissions.includes(k)),
        ...(kanKoereRute ? ["montor"] : []),
        ...(permissions.some((p) => p.startsWith("admin_")) ? ["admin"] : []),
      ];
  // Sendes videre til sider der låser ENKELTE felter/knapper efter
  // finkornede sags-rettigheder. null for en systemadmin = "ubegrænset"
  // (se canDo() i domain.js).
  const effectivePermissions = profile.erSystemadmin ? null : permissions;
  const dashboardWidgets = profile.dashboardWidgets || DEFAULT_DASHBOARD_WIDGETS[profile.rolle] || [];
  const currentPage = location.pathname.replace(/^\//, "").split("/")[0] || allowedPages[0];
  const narrowPage = currentPage === "montor" || currentPage === "sag";
  // Topmenuen skjules, mens en KØRENDE person har en sag åben - skærmen
  // skal bruges på opgaven, ikke på navigation. Gælder nu alle der kører,
  // ikke kun rollen 'montor'.
  const hideTopNav = currentPage === "sag" && kanKoereRute;

  return (
    <div className="min-h-screen w-full bg-paper" style={{ fontFamily: "Inter, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        .font-mono { font-family: 'JetBrains Mono', monospace; }
      `}</style>

      {!hideTopNav && (
        <TopNav
          page={currentPage} onChange={(key) => navigate(`/${key}`)} user={profile} onLogOut={logOut}
          notifications={notifications} onOpenOrder={onOpen} allowedPages={allowedPages}
          store={effectiveStore} allStores={allStores} onSwitchStore={switchStore}
          onExitStoreView={profile.erSystemadmin ? exitStoreView : undefined}
        />
      )}

      <div className={`${narrowPage ? "max-w-2xl" : "max-w-6xl"} mx-auto px-4 pb-10 ${hideTopNav ? "pt-4" : ""}`}>
        <Routes>
          <Route path="/dashboard" element={
            <DashboardPage
              profile={profile} permissions={effectivePermissions}
              orders={orders} technicians={technicians} vehicles={vehicles} timeOff={timeOff} store={effectiveStore}
              notifications={notifications} onOpen={onOpen}
              onNavigate={(key) => navigate(`/${key}`)}
              dashboardWidgets={dashboardWidgets} onUpdateWidgets={updateDashboardWidgetsFor}
            />
          } />

          <Route path="/sag/:id" element={<OrderRoute profile={profile} orders={orders} technicians={technicians} ordersStore={ordersStore} duplicateOrder={duplicateOrder} permissions={effectivePermissions} catalog={catalog} />} />

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
                onOpen={onOpen} onAssign={ordersStore.assignTechnician} onReorder={ordersStore.reorderOrder} onSetVisitOrder={ordersStore.setVisitOrder}
                onUpdateBooking={ordersStore.updateBooking} onClearProblem={ordersStore.clearProblem}
                onUpdateTechnician={(technicianId, fields) => updateTechnicianVehicle(technicianId, fields.bilId)}
                onRefresh={refresh} refreshing={refreshing}
              />
            </Gate>
          } />

          {/* Kun én montør-rute: din egen. Den gamle /montor/:technicianId
              (montør-vælgeren) er fjernet - se noten ved MontorRoute. */}
          <Route path="/montor" element={
            <Gate allowed={allowedPages} page="montor">
              <MontorRoute profile={profile} orders={orders} technicians={technicians} ordersStore={ordersStore} refresh={refresh} refreshing={refreshing} selectedDate={selectedDate} onDateChange={setSelectedDate} onOpen={onOpen} />
            </Gate>
          } />

          <Route path="/lager" element={
            <Gate allowed={allowedPages} page="lager">
              <WarehousePage
                orders={orders} technicians={technicians} vehicles={vehicles}
                selectedDate={selectedDate} onDateChange={setSelectedDate}
                onToggleLineItemPicked={ordersStore.toggleLineItemPicked}
                onReportMissingItem={reportMissingItem}
                onClearMissingItem={ordersStore.clearMissingItem}
                onOpen={onOpen} permissions={effectivePermissions}
              />
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
              allowedPages (som kun kender de almindelige butiks-rettigheder).
              Dækker den bruger, der er BÅDE systemadmin OG koblet til sin egen
              butik - uden denne rute var "System"-fanen et dødt link for dem.
              Systemadmins UDEN egen butik rammer aldrig ruten; de får
              SystemAdminPage vist direkte i "!activeStoreId"-grenen ovenfor. */}
          <Route path="/systemadmin" element={
            profile.erSystemadmin ? <SystemAdminPage /> : <Navigate to={`/${allowedPages[0]}`} replace />
          } />

          <Route path="*" element={<Navigate to={`/${allowedPages[0]}`} replace />} />
        </Routes>
      </div>
    </div>
  );
}
