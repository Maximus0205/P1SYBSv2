import React, { useState, useEffect } from "react";

import { supabase } from "./lib/supabaseClient";
import {
  getOrders, saveOrder, deleteOrder, getFreshOrder,
  getVehicles, saveVehicle, deleteVehicle, seedDefaultVehicles,
  getProductTypes, saveProductType, deleteProductType, seedDefaultProductTypes,
  getProductCategories, saveProductCategory, deleteProductCategory, seedDefaultProductCategories,
  getPrimaryServices, savePrimaryService, deletePrimaryService, seedDefaultPrimaryServices,
  getAddOnServices, saveAddOnService, deleteAddOnService, seedDefaultAddOnServices,
  getOwnProfile, getStoreUsers, updateProfile,
  createUserAsAdmin, resetPasswordAsAdmin,
  getTimeOff, addTimeOff as addTimeOffApi, deleteTimeOff as deleteTimeOffApi,
  getStore,
} from "./lib/dataStore";
import {
  uid, todayISO,
  DEFAULT_PRODUCT_TYPES, DEFAULT_PRODUCT_CATEGORIES,
  DEFAULT_PRIMARY_SERVICES, DEFAULT_ADD_ON_SERVICES,
  DEFAULT_VEHICLES,
  PAGES_FOR_ROLE,
} from "./data/domain";

import { TopNav } from "./components/TopNav";
import { LoginPage } from "./components/LoginPage";
import { OrderView } from "./components/OrderView";

import { SalesPage } from "./pages/SalesPage";
import { PlanningPage } from "./pages/PlanningPage";
import { DrivingPage } from "./pages/DrivingPage";
import { TechnicianPicker, TechnicianRouteView } from "./pages/TechnicianPage";
import { WarehousePage } from "./pages/WarehousePage";
import { AdminPage } from "./pages/AdminPage";
import { SystemAdminPage } from "./pages/SystemAdminPage";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [session, setSession] = useState(null); // Supabase Auth-session (null = ikke logget ind)
  const [profile, setProfile] = useState(null); // { id, navn, rolle, bilId, butikId, erSystemadmin }
  const [store, setStore] = useState(null); // { id, navn, adresse, lat, lon } - egen butiks koordinater
  const [orders, setOrders] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [users, setUsers] = useState([]);
  const [timeOff, setTimeOff] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [productCategories, setProductCategories] = useState([]);
  const [primaryServices, setPrimaryServices] = useState([]);
  const [addOnServices, setAddOnServices] = useState([]);
  const [page, setPage] = useState("salg");
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [selectedTechnicianId, setSelectedTechnicianId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  // "Teknikere" er ikke længere en selvstændig ting i databasen — det er
  // brugere/profiler med rolle "montor". Vi udleder listen her, i samme form
  // som resten af appen altid har forventet ({ id, navn, bil, bilId }).
  const technicians = users
    .filter((b) => b.rolle === "montor")
    .map((b) => {
      const linkedVehicle = vehicles.find((v) => v.id === b.bilId);
      return { id: b.id, navn: b.navn, bilId: b.bilId || null, bil: linkedVehicle ? linkedVehicle.nummerplade : "" };
    });

  // Henter alt for den butik den indloggede bruger hører til.
  const loadAll = async (storeId) => {
    if (!storeId) { setOrders([]); setVehicles([]); setProductTypes([]); setProductCategories([]); setPrimaryServices([]); setAddOnServices([]); setUsers([]); setTimeOff([]); return; }
    const [o, v, pt, pc, ps, aos, u, t] = await Promise.all([
      getOrders(storeId),
      getVehicles(storeId),
      getProductTypes(storeId),
      getProductCategories(storeId),
      getPrimaryServices(storeId),
      getAddOnServices(storeId),
      getStoreUsers(storeId),
      getTimeOff(storeId),
    ]);
    // Første gang butikken bruges, er listerne tomme - sæt fornuftige standarder.
    const finalVehicles = v.length > 0 ? v : DEFAULT_VEHICLES;
    const finalCategories = pc.length > 0 ? pc : DEFAULT_PRODUCT_CATEGORIES;
    const finalProductTypes = pt.length > 0 ? pt : DEFAULT_PRODUCT_TYPES;
    const finalPrimaryServices = ps.length > 0 ? ps : DEFAULT_PRIMARY_SERVICES;
    const finalAddOnServices = aos.length > 0 ? aos : DEFAULT_ADD_ON_SERVICES;
    if (v.length === 0) seedDefaultVehicles(storeId, finalVehicles);
    if (pc.length === 0) seedDefaultProductCategories(storeId, finalCategories);
    if (pt.length === 0) seedDefaultProductTypes(storeId, finalProductTypes);
    if (ps.length === 0) seedDefaultPrimaryServices(storeId, finalPrimaryServices);
    if (aos.length === 0) seedDefaultAddOnServices(storeId, finalAddOnServices);
    setOrders(o); setVehicles(finalVehicles); setProductCategories(finalCategories); setProductTypes(finalProductTypes);
    setPrimaryServices(finalPrimaryServices); setAddOnServices(finalAddOnServices); setUsers(u); setTimeOff(t);
  };

  const reloadProfile = async (userId) => {
    const p = await getOwnProfile(userId);
    if (!p) { setProfile(null); return null; }
    const normalized = { id: p.id, navn: p.navn, rolle: p.rolle, bilId: p.bil_id, butikId: p.butik_id, erSystemadmin: !!p.er_systemadmin };
    setProfile(normalized);
    if (normalized.butikId) {
      setPage((PAGES_FOR_ROLE[normalized.rolle] || ["salg"])[0]);
      if (normalized.rolle === "montor") setSelectedTechnicianId(normalized.id);
      await loadAll(normalized.butikId);
      const storeData = await getStore(normalized.butikId);
      setStore(storeData);
    } else if (normalized.erSystemadmin) {
      setPage("systemadmin");
    }
    return normalized;
  };

  const addTimeOff = async (fields) => { if (profile?.butikId) { await addTimeOffApi(profile.butikId, fields); await loadAll(profile.butikId); } };
  const deleteTimeOff = async (id) => { if (profile?.butikId) { await deleteTimeOffApi(id); await loadAll(profile.butikId); } };

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
        setOrders([]); setVehicles([]); setProductTypes([]); setProductCategories([]); setPrimaryServices([]); setAddOnServices([]); setUsers([]); setTimeOff([]);
        setSelectedId(null);
      }
    });

    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => { setRefreshing(true); if (profile?.butikId) await loadAll(profile.butikId); setRefreshing(false); };

  // ---------- Generiske hjælpere: gem/slet ÉT element lokalt + i databasen ----------
  // (Hver liste har sin egen sky-funktion, men mønsteret er ens: opdatér
  // React-state for præcis dét element, og send KUN det element videre til
  // databasen - se den vigtige note øverst i dataStore.js om hvorfor.)
  const saveOneOrder = (order) => { setOrders((prev) => (prev.some((s) => s.id === order.id) ? prev.map((s) => (s.id === order.id ? order : s)) : [...prev, order])); if (profile?.butikId) saveOrder(profile.butikId, order); };

  const saveOneVehicle = (vehicle) => { setVehicles((prev) => (prev.some((b) => b.id === vehicle.id) ? prev.map((b) => (b.id === vehicle.id ? vehicle : b)) : [...prev, vehicle])); if (profile?.butikId) saveVehicle(profile.butikId, vehicle); };
  const removeOneVehicle = (id) => { setVehicles((prev) => prev.filter((b) => b.id !== id)); if (profile?.butikId) deleteVehicle(profile.butikId, id); };

  const saveOneProductCategory = (k) => { setProductCategories((prev) => (prev.some((x) => x.id === k.id) ? prev.map((x) => (x.id === k.id ? k : x)) : [...prev, k])); if (profile?.butikId) saveProductCategory(profile.butikId, k); };
  const removeOneProductCategory = (id) => { setProductCategories((prev) => prev.filter((x) => x.id !== id)); if (profile?.butikId) deleteProductCategory(profile.butikId, id); };

  const saveOneProductType = (v) => { setProductTypes((prev) => (prev.some((x) => x.id === v.id) ? prev.map((x) => (x.id === v.id ? v : x)) : [...prev, v])); if (profile?.butikId) saveProductType(profile.butikId, v); };
  const removeOneProductType = (id) => { setProductTypes((prev) => prev.filter((x) => x.id !== id)); if (profile?.butikId) deleteProductType(profile.butikId, id); };

  const saveOnePrimaryService = (p) => { setPrimaryServices((prev) => (prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p])); if (profile?.butikId) savePrimaryService(profile.butikId, p); };
  const removeOnePrimaryService = (id) => { setPrimaryServices((prev) => prev.filter((x) => x.id !== id)); if (profile?.butikId) deletePrimaryService(profile.butikId, id); };

  const saveOneAddOnService = (t) => { setAddOnServices((prev) => (prev.some((x) => x.id === t.id) ? prev.map((x) => (x.id === t.id ? t : x)) : [...prev, t])); if (profile?.butikId) saveAddOnService(profile.butikId, t); };
  const removeOneAddOnService = (id) => { setAddOnServices((prev) => prev.filter((x) => x.id !== id)); if (profile?.butikId) deleteAddOnService(profile.butikId, id); };

  const addVehicle = (navn, nummerplade) => saveOneVehicle({ id: uid(), navn, nummerplade, lukket: false, lukketAarsag: "" });
  const updateVehicle = (id, fields) => { const b = vehicles.find((x) => x.id === id); if (b) saveOneVehicle({ ...b, ...fields }); };
  const toggleVehicleClosed = (id, reason) => {
    const b = vehicles.find((x) => x.id === id);
    if (b) saveOneVehicle({ ...b, lukket: !b.lukket, lukketAarsag: !b.lukket ? (reason || "Værksted") : "" });
  };
  const deleteVehicleWithConfirm = (id) => {
    if (technicians.some((m) => m.bilId === id) && !window.confirm("Denne bil er tildelt en montør. Slet alligevel?")) return;
    removeOneVehicle(id);
  };

  // Skifter hvilken bil en tekniker (bruger med rolle "montor") er tilknyttet.
  // Fraværsperioder flytter automatisk med, fordi blokeringen beregnes ud fra
  // denne tilknytning i stedet for at blive gemt fast på selve bilen.
  const updateTechnicianVehicle = (technicianId, vehicleId) => updateUser(technicianId, { bilId: vehicleId || null });

  const logOut = async () => { await supabase.auth.signOut(); };

  const selected = orders.find((s) => s.id === selectedId);

  // Opretter en ny ordre med et midlertidigt sagsnummer (vises med det
  // samme), og henter den friske, database-tildelte version bagefter (se
  // assign_order_number-triggeren) - så det ENDELIGE, garanteret unikke
  // sagsnummer altid vises korrekt, uden gæt fra browseren.
  const addOrder = async ({ kunde, koeber, noegle, dato, tidsrumId, start, slut, montorId, varelinjer, ordrenummer }) => {
    if (!profile?.butikId) return;
    const newOrder = {
      id: uid(), nr: "...", ordrenummer: ordrenummer?.trim() || "",
      kunde, koeber: koeber || null, noegle: noegle || {}, dato: dato || todayISO(), tidsrumId, start, slut, montorId,
      status: "planlagt", plukket: false, varelinjer, noter: [], billeder: [], rapporter: [], stemplerInd: null, logs: [],
    };
    setOrders((prev) => [...prev, newOrder]);
    await saveOrder(profile.butikId, newOrder);
    const fresh = await getFreshOrder(profile.butikId, newOrder.id);
    if (fresh) setOrders((prev) => prev.map((s) => (s.id === fresh.id ? fresh : s)));
  };

  // Hurtig-redigering af en booket ordre (dato/tidsrum/montør/adresse) - se
  // BookingEditor i OrderView.jsx.
  const updateBooking = (id, fields) => { const s = orders.find((x) => x.id === id); if (s) saveOneOrder({ ...s, ...fields }); };

  const importOrders = (newOrders) => newOrders.forEach((s) => saveOneOrder(s));

  // Brugere oprettes rigtigt (Supabase Auth) via en edge function, som selv
  // tjekker at kalderen er admin (eller systemadmin, som skal angive
  // butikId eksplicit) - se admin-opret-bruger.
  const addUser = async (fields) => {
    const result = await createUserAsAdmin(fields);
    if (result.ok && profile?.butikId) await loadAll(profile.butikId);
    return result;
  };
  const updateUser = async (id, fields) => {
    const dbFields = {};
    if ("rolle" in fields) dbFields.rolle = fields.rolle;
    if ("bilId" in fields) dbFields.bil_id = fields.bilId;
    if ("navn" in fields) dbFields.navn = fields.navn;
    const ok = await updateProfile(id, dbFields);
    if (ok && profile?.butikId) await loadAll(profile.butikId);
  };
  const deleteUser = async (id) => {
    if (!window.confirm("Fjern denne brugers adgang til butikken?")) return;
    await updateProfile(id, { butik_id: null, rolle: "saelger" });
    if (profile?.butikId) await loadAll(profile.butikId);
  };
  const resetPassword = (userId, newPassword) => resetPasswordAsAdmin(userId, newPassword);

  // ---------- Varer & ydelser ----------
  // Relationerne (hvilke tillægsydelser der gælder for hvilke varetyper/
  // primære ydelser) ligger udelukkende på addOnServices selv (se
  // domain.js) - derfor rydder vi op i addOnServices, når en varetype eller
  // primær ydelse slettes, så der ikke bliver hængende referencer til noget
  // der ikke findes mere. Der sættes IKKE noget tidsestimat her - det tastes
  // udelukkende manuelt for den enkelte booking i sælgerens flow.
  const addProductCategory = (navn) => saveOneProductCategory({ id: uid(), navn });
  const updateProductCategory = (id, navn) => { const k = productCategories.find((x) => x.id === id); if (k) saveOneProductCategory({ ...k, navn }); };
  const deleteProductCategory = (id) => {
    const inUse = productTypes.filter((v) => v.kategoriId === id).length;
    if (inUse > 0 && !window.confirm(`${inUse} varetype(r) hører til denne kategori. Slet alligevel? (Varetyperne beholdes, men mister kategori-tilknytningen.)`)) return;
    removeOneProductCategory(id);
  };

  const addProductType = (navn, kategoriId) => saveOneProductType({ id: uid(), navn, kategoriId: kategoriId || null });
  const updateProductType = (id, fields) => { const v = productTypes.find((x) => x.id === id); if (v) saveOneProductType({ ...v, ...fields }); };
  const deleteProductType = (id) => {
    if (!window.confirm("Slet denne varetype? Allerede bookede sager beholder deres oplysninger uændret.")) return;
    removeOneProductType(id);
    addOnServices.filter((t) => (t.varetyper || []).includes(id)).forEach((t) => saveOneAddOnService({ ...t, varetyper: t.varetyper.filter((vid) => vid !== id) }));
  };

  const addPrimaryService = (navn) => saveOnePrimaryService({ id: uid(), navn });
  const updatePrimaryService = (id, fields) => { const p = primaryServices.find((x) => x.id === id); if (p) saveOnePrimaryService({ ...p, ...fields }); };
  const deletePrimaryService = (id) => {
    if (!window.confirm("Slet denne primære ydelse? Allerede bookede sager beholder deres oplysninger uændret.")) return;
    removeOnePrimaryService(id);
    addOnServices.filter((t) => (t.primaerYdelser || []).includes(id)).forEach((t) => saveOneAddOnService({ ...t, primaerYdelser: t.primaerYdelser.filter((pid) => pid !== id) }));
  };

  const addAddOnService = (navn) => saveOneAddOnService({ id: uid(), navn, primaerYdelser: [], varetyper: [] });
  const updateAddOnService = (id, fields) => { const t = addOnServices.find((x) => x.id === id); if (t) saveOneAddOnService({ ...t, ...fields }); };
  const deleteAddOnService = (id) => {
    if (!window.confirm("Slet denne tillægsydelse? Allerede bookede sager beholder deres oplysninger uændret.")) return;
    removeOneAddOnService(id);
  };

  const assignTechnician = (orderId, technicianId) => { const s = orders.find((x) => x.id === orderId); if (s) saveOneOrder({ ...s, montorId: technicianId }); };
  const updateTimeSlot = (orderId, timeSlotId) => { const s = orders.find((x) => x.id === orderId); if (s) saveOneOrder({ ...s, tidsrumId: timeSlotId }); };
  const togglePicked = (orderId) => { const s = orders.find((x) => x.id === orderId); if (s) saveOneOrder({ ...s, plukket: !s.plukket }); };

  const cycleStatus = (id) => {
    const s = orders.find((x) => x.id === id);
    if (!s) return;
    const order = ["planlagt", "igang", "afsluttet"];
    saveOneOrder({ ...s, status: order[(order.indexOf(s.status) + 1) % order.length] });
  };

  const addNote = (id, text) => { const s = orders.find((x) => x.id === id); if (s) saveOneOrder({ ...s, noter: [...s.noter, { id: uid(), tekst: text, tid: new Date().toLocaleString("da-DK") }] }); };
  const addPhoto = (id, { src, navn }) => { const s = orders.find((x) => x.id === id); if (s) saveOneOrder({ ...s, billeder: [...s.billeder, { id: uid(), src, navn }] }); };
  const addReport = (id, title, text) => { const s = orders.find((x) => x.id === id); if (s) saveOneOrder({ ...s, rapporter: [...s.rapporter, { id: uid(), titel: title, tekst: text, tid: new Date().toLocaleString("da-DK") }] }); };

  const clockIn = (id) => { const s = orders.find((x) => x.id === id); if (s) saveOneOrder({ ...s, stemplerInd: new Date().toISOString(), status: s.status === "planlagt" ? "igang" : s.status }); };
  const clockOut = (id) => {
    const s = orders.find((x) => x.id === id);
    if (!s || !s.stemplerInd) return;
    const in_ = s.stemplerInd, out = new Date().toISOString();
    const minutes = Math.max(1, Math.round((new Date(out) - new Date(in_)) / 60000));
    saveOneOrder({ ...s, stemplerInd: null, logs: [...s.logs, { id: uid(), ind: in_, ud: out, minutter: minutes }] });
  };

  const toggleAddOn = (orderId, lineItemId, addOnId) => {
    const s = orders.find((x) => x.id === orderId);
    if (s) saveOneOrder({ ...s, varelinjer: s.varelinjer.map((v) => (v.id === lineItemId ? { ...v, tillaeg: v.tillaeg.map((y) => (y.id === addOnId ? { ...y, udfoert: !y.udfoert } : y)) } : v)) });
  };
  const addAddOn = (orderId, lineItemId, navn) => {
    const s = orders.find((x) => x.id === orderId);
    if (s) saveOneOrder({ ...s, varelinjer: s.varelinjer.map((v) => (v.id === lineItemId ? { ...v, tillaeg: [...v.tillaeg, { id: uid(), navn: navn.trim(), minutter: 15, udfoert: false }] } : v)) });
  };
  const removeAddOn = (orderId, lineItemId, addOnId) => {
    const s = orders.find((x) => x.id === orderId);
    if (s) saveOneOrder({ ...s, varelinjer: s.varelinjer.map((v) => (v.id === lineItemId ? { ...v, tillaeg: v.tillaeg.filter((y) => y.id !== addOnId) } : v)) });
  };

  const technician = technicians.find((m) => m.id === selectedTechnicianId);
  const narrowPage = page === "montor" || !!selected;

  if (loading) {
    return <div className="min-h-screen w-full flex items-center justify-center" style={{ background: "#F3EFE6" }}><p className="text-sm text-[#52697E]">Indlæser...</p></div>;
  }

  if (!session) {
    return <LoginPage />;
  }

  if (!profile) {
    return <div className="min-h-screen w-full flex items-center justify-center" style={{ background: "#F3EFE6" }}><p className="text-sm text-[#52697E]">Indlæser profil...</p></div>;
  }

  if (!profile.butikId) {
    if (profile.erSystemadmin) {
      return (
        <div className="min-h-screen w-full" style={{ background: "#F3EFE6" }}>
          <div className="max-w-2xl mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-4">
              <p className="font-mono text-[11px] tracking-widest uppercase text-[#E2621B]">Systemadministration</p>
              <button onClick={logOut} className="text-xs text-[#52697E] hover:text-[#E2621B] underline">Log ud</button>
            </div>
            <SystemAdminPage />
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen w-full flex items-center justify-center px-4" style={{ background: "#F3EFE6" }}>
        <div className="max-w-sm border border-[#D8D0BE] bg-white p-6 text-center">
          <p className="text-sm text-[#1C232E]">
            Din bruger er oprettet, men er endnu ikke koblet til en butik. Bed en administrator om at give dig adgang.
          </p>
          <button onClick={logOut} className="mt-4 text-xs text-[#52697E] hover:text-[#E2621B] underline">Log ud</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full" style={{ background: "#F3EFE6", fontFamily: "Inter, sans-serif" }}>
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
            addNote={(t) => addNote(selected.id, t)}
            addPhoto={(p) => addPhoto(selected.id, p)}
            addReport={(t, x) => addReport(selected.id, t, x)}
            onCycleStatus={cycleStatus}
            onClockIn={() => clockIn(selected.id)}
            onClockOut={() => clockOut(selected.id)}
            onToggleAddOn={(lineItemId, addOnId) => toggleAddOn(selected.id, lineItemId, addOnId)}
            onAddAddOn={(lineItemId, navn) => addAddOn(selected.id, lineItemId, navn)}
            onRemoveAddOn={(lineItemId, addOnId) => removeAddOn(selected.id, lineItemId, addOnId)}
            onUpdateBooking={(fields) => updateBooking(selected.id, fields)}
          />
        ) : page === "salg" ? (
          <SalesPage orders={orders} technicians={technicians} productTypes={productTypes} productCategories={productCategories} primaryServices={primaryServices} addOnServices={addOnServices} selectedDate={selectedDate} onDateChange={setSelectedDate} onOpen={setSelectedId} onAdd={addOrder} onImport={importOrders} storeFocus={store?.lat && store?.lon ? { lat: store.lat, lon: store.lon } : null} />
        ) : page === "planlaegning" ? (
          <PlanningPage orders={orders} technicians={technicians} onOpen={setSelectedId} onCycleStatus={cycleStatus} onAssign={assignTechnician} />
        ) : page === "koersel" ? (
          <DrivingPage orders={orders} technicians={technicians} vehicles={vehicles} timeOff={timeOff} selectedDate={selectedDate} onDateChange={setSelectedDate} onOpen={setSelectedId} onCycleStatus={cycleStatus} onAssign={assignTechnician} onUpdateTimeSlot={updateTimeSlot} onUpdateTechnician={(technicianId, fields) => updateTechnicianVehicle(technicianId, fields.bilId)} onRefresh={refresh} refreshing={refreshing} />
        ) : page === "montor" ? (
          profile.rolle === "montor" ? (
            technician ? <TechnicianRouteView orders={orders} technician={technician} selectedDate={selectedDate} onDateChange={setSelectedDate} onOpen={setSelectedId} onCycleStatus={cycleStatus} onRefresh={refresh} refreshing={refreshing} /> : <p className="text-sm text-[#52697E]">Din bruger er ikke koblet til en montør/bil-profil endnu — kontakt en administrator.</p>
          ) : technician ? (
            <TechnicianRouteView orders={orders} technician={technician} selectedDate={selectedDate} onDateChange={setSelectedDate} onOpen={setSelectedId} onCycleStatus={cycleStatus} onChangeTechnician={() => setSelectedTechnicianId(null)} onRefresh={refresh} refreshing={refreshing} />
          ) : (
            <TechnicianPicker technicians={technicians} onSelect={setSelectedTechnicianId} />
          )
        ) : page === "lager" ? (
          <WarehousePage orders={orders} technicians={technicians} selectedDate={selectedDate} onDateChange={setSelectedDate} onTogglePicked={togglePicked} onOpen={setSelectedId} />
        ) : page === "systemadmin" ? (
          <SystemAdminPage />
        ) : (
          <AdminPage
            technicians={technicians} vehicles={vehicles} users={users} timeOff={timeOff} currentUserId={profile.id}
            productTypes={productTypes} productCategories={productCategories} primaryServices={primaryServices} addOnServices={addOnServices}
            onUpdateTechnicianVehicle={updateTechnicianVehicle} onAddVehicle={addVehicle} onUpdateVehicle={updateVehicle} onDeleteVehicle={deleteVehicleWithConfirm} onToggleVehicleClosed={toggleVehicleClosed}
            onAddUser={addUser} onUpdateUser={updateUser} onDeleteUser={deleteUser} onResetPassword={resetPassword}
            onAddProductCategory={addProductCategory} onUpdateProductCategory={updateProductCategory} onDeleteProductCategory={deleteProductCategory}
            onAddProductType={addProductType} onUpdateProductType={updateProductType} onDeleteProductType={deleteProductType}
            onAddPrimaryService={addPrimaryService} onUpdatePrimaryService={updatePrimaryService} onDeletePrimaryService={deletePrimaryService}
            onAddAddOnService={addAddOnService} onUpdateAddOnService={updateAddOnService} onDeleteAddOnService={deleteAddOnService}
            onAddTimeOff={addTimeOff} onDeleteTimeOff={deleteTimeOff}
          />
        )}
      </div>
    </div>
  );
}
