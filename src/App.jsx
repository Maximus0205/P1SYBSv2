import React, { useState, useEffect } from "react";

import { supabase } from "./lib/supabaseClient";
import {
  getOrders, saveOrder, deleteOrder, getFreshOrder,
  getVehicles, saveVehicle, deleteVehicle, seedDefaultVehicles,
  getOwnProfile, getStoreUsers, updateProfile,
  createUserAsAdmin, resetPasswordAsAdmin,
  getTimeOff, addTimeOff as addTimeOffApi, deleteTimeOff as deleteTimeOffApi,
  getStore,
} from "./lib/dataStore";
import {
  uid, todayISO, dailyOrderCompare, timeSlotById,
  DEFAULT_VEHICLES,
  PAGES_FOR_ROLE,
} from "./data/domain";
import { useCatalog } from "./hooks/useCatalog";

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
  const [orders, setOrders] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [users, setUsers] = useState([]);
  const [timeOff, setTimeOff] = useState([]);
  const [page, setPage] = useState("salg");
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [selectedTechnicianId, setSelectedTechnicianId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  // FASE 1 af arkitektur-oprydningen (august 2026): varekataloget (varetyper,
  // kategorier, primære ydelser, tillægsydelser) er udtrukket til sin egen
  // hook - se hooks/useCatalog.js for selve state/CRUD-logikken og
  // begrundelsen. App.jsx kalder den blot og videregiver dens data/
  // funktioner, ligesom resten af siderne allerede modtager alt andet.
  const catalog = useCatalog(profile?.butikId);

  // "Teknikere" er ikke længere en selvstændig ting i databasen — det er
  // brugere/profiler med rolle "montor". Vi udleder listen her, i samme form
  // som resten af appen altid har forventet ({ id, navn, bil, bilId }).
  const technicians = users
    .filter((b) => b.rolle === "montor")
    .map((b) => {
      const linkedVehicle = vehicles.find((v) => v.id === b.bilId);
      return { id: b.id, navn: b.navn, bilId: b.bilId || null, bil: linkedVehicle ? linkedVehicle.nummerplade : "" };
    });

  // Henter det, der (indtil videre) stadig ligger direkte i App.jsx: ordrer,
  // biler, brugere og fravær. Varekataloget håndteres nu af useCatalog
  // ovenfor, og hentes/genindlæses automatisk uafhængigt af dette kald.
  const loadAll = async (storeId) => {
    if (!storeId) { setOrders([]); setVehicles([]); setUsers([]); setTimeOff([]); return; }
    const [o, v, u, t] = await Promise.all([
      getOrders(storeId),
      getVehicles(storeId),
      getStoreUsers(storeId),
      getTimeOff(storeId),
    ]);
    // Første gang butikken bruges, er bil-listen tom - sæt fornuftige standarder.
    const finalVehicles = v.length > 0 ? v : DEFAULT_VEHICLES;
    if (v.length === 0) seedDefaultVehicles(storeId, finalVehicles);
    setOrders(o); setVehicles(finalVehicles); setUsers(u); setTimeOff(t);
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
        setOrders([]); setVehicles([]); setUsers([]); setTimeOff([]);
        setSelectedId(null);
      }
    });

    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => { setRefreshing(true); if (profile?.butikId) await Promise.all([loadAll(profile.butikId), catalog.reload()]); setRefreshing(false); };

  // ---------- Generiske hjælpere: gem/slet ÉT element lokalt + i databasen ----------
  // (Hver liste har sin egen sky-funktion, men mønsteret er ens: opdatér
  // React-state for præcis dét element, og send KUN det element videre til
  // databasen - se den vigtige note øverst i dataStore.js om hvorfor.)
  const saveOneOrder = (order) => { setOrders((prev) => (prev.some((s) => s.id === order.id) ? prev.map((s) => (s.id === order.id ? order : s)) : [...prev, order])); if (profile?.butikId) saveOrder(profile.butikId, order); };

  const saveOneVehicle = (vehicle) => { setVehicles((prev) => (prev.some((b) => b.id === vehicle.id) ? prev.map((b) => (b.id === vehicle.id ? vehicle : b)) : [...prev, vehicle])); if (profile?.butikId) saveVehicle(profile.butikId, vehicle); };
  const removeOneVehicle = (id) => { setVehicles((prev) => prev.filter((b) => b.id !== id)); if (profile?.butikId) deleteVehicle(profile.butikId, id); };

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

  // Opretter en ny sag ud fra en EKSISTERENDE (dupliker/opfølgning) - se
  // "Dupliker / Opfølgning" i OrderView.jsx. Bruges fx til service-/
  // reklamationsbesøg efter en montering, eller når en levering skal deles
  // op i flere separate besøg. Kunde/køber/nøgleoplysninger og adresse
  // kopieres, men datoen, tidsrummet og montøren NULSTILLES bevidst - det
  // er jo netop noget nyt der skal planlægges, ikke en kopi af den gamle
  // booking. Sagsnummer, status, noter, billeder, rapporter, tidsregistrering
  // og plukket-status starter alle helt friske - denne sag er reelt ny og
  // adskilt fra kilden, ikke bare en reference til den. Varelinjerne der
  // vælges med, klones med NYE id'er (og nulstillet plukket/udført-status),
  // så de to sager aldrig deler tilstand.
  const duplicateOrder = async (sourceOrder, selectedLineItems) => {
    if (!profile?.butikId || !selectedLineItems || selectedLineItems.length === 0) return;
    const t = timeSlotById("heldag");
    const clonedLineItems = selectedLineItems.map((v) => ({
      ...v,
      id: uid(),
      plukket: false,
      tillaeg: (v.tillaeg || []).map((y) => ({ ...y, udfoert: false })),
    }));
    const newOrder = {
      id: uid(), nr: "...", ordrenummer: "",
      kunde: { ...sourceOrder.kunde },
      koeber: sourceOrder.koeber ? { ...sourceOrder.koeber } : null,
      noegle: sourceOrder.noegle ? { ...sourceOrder.noegle } : {},
      dato: todayISO(), tidsrumId: "heldag", start: t.start, slut: t.slut, montorId: null,
      status: "planlagt", plukket: false, varelinjer: clonedLineItems,
      noter: [], billeder: [], rapporter: [], stemplerInd: null, logs: [],
    };
    setOrders((prev) => [...prev, newOrder]);
    await saveOrder(profile.butikId, newOrder);
    const fresh = await getFreshOrder(profile.butikId, newOrder.id);
    if (fresh) { setOrders((prev) => prev.map((s) => (s.id === fresh.id ? fresh : s))); setSelectedId(fresh.id); }
    else setSelectedId(newOrder.id);
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

  const assignTechnician = (orderId, technicianId) => { const s = orders.find((x) => x.id === orderId); if (s) saveOneOrder({ ...s, montorId: technicianId }); };
  const updateTimeSlot = (orderId, timeSlotId) => { const s = orders.find((x) => x.id === orderId); if (s) saveOneOrder({ ...s, tidsrumId: timeSlotId }); };

  // Ændrer besøgs-RÆKKEFØLGEN for sager hos samme montør, samme dag (fx ved
  // sygdom, forgæves besøg, eller bare fordi en anden rute giver mere
  // mening). Direction er -1 (flyt op/tidligere) eller +1 (flyt ned/senere).
  // Normaliserer HELE dagens gruppe for den montør til fortløbende tal
  // (0,1,2...) hver gang - se dailyOrderCompare i domain.js for hvorfor.
  // Kun de sager hvis raekkefolge rent faktisk ændrer sig bliver gemt.
  const reorderOrder = (technicianId, date, orderId, direction) => {
    const group = orders
      .filter((o) => o.montorId === technicianId && o.dato === date && o.status !== "afsluttet")
      .sort(dailyOrderCompare);
    const currentIndex = group.findIndex((o) => o.id === orderId);
    if (currentIndex === -1) return;
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= group.length) return;
    const reordered = [...group];
    [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];
    reordered.forEach((o, i) => {
      if (o.raekkefolge !== i) saveOneOrder({ ...o, raekkefolge: i });
    });
  };

  // Slår plukket til/fra for ÉN varelinje (se WarehousePage.jsx: dér er 1
  // varelinje = 1 pluk-punkt på lagerlisten, i stedet for 1 punkt pr. hele
  // ordren). Ordrens samlede "plukket"-flag holdes synkroniseret som et
  // afledt "alle varelinjer på ordren er plukket"-flag, til brug de steder i
  // appen der stadig kigger på hele ordren under ét.
  const toggleLineItemPicked = (orderId, lineItemId) => {
    const s = orders.find((x) => x.id === orderId);
    if (!s) return;
    const varelinjer = s.varelinjer.map((v) => (v.id === lineItemId ? { ...v, plukket: !v.plukket } : v));
    const allPicked = varelinjer.length > 0 && varelinjer.every((v) => v.plukket);
    saveOneOrder({ ...s, varelinjer, plukket: allPicked });
  };

  // Cirkulerer status planlagt -> i gang -> afsluttet -> planlagt. Sætter
  // (eller nulstiller) afsluttetTidspunkt sammen med selve status-skiftet,
  // så sagskort kan vise HVORNÅR en sag reelt blev afsluttet, ikke kun AT
  // den er det - se OrderCardCompact.jsx.
  const cycleStatus = (id) => {
    const s = orders.find((x) => x.id === id);
    if (!s) return;
    const order = ["planlagt", "igang", "afsluttet"];
    const newStatus = order[(order.indexOf(s.status) + 1) % order.length];
    const extra = {};
    if (newStatus === "afsluttet") extra.afsluttetTidspunkt = new Date().toISOString();
    else if (s.status === "afsluttet") extra.afsluttetTidspunkt = null;
    saveOneOrder({ ...s, status: newStatus, ...extra });
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

  // Kundeunderskrift ved aflevering - se Signature-komponenten i
  // OrderParts.jsx. Gemmes som ét felt på ordren (navn + billeddata +
  // tidspunkt), ligesom noter/billeder/rapporter.
  const saveSignature = (orderId, { navn, data }) => {
    const s = orders.find((x) => x.id === orderId);
    if (s) saveOneOrder({ ...s, underskrift: { navn, data, tid: new Date().toLocaleString("da-DK") } });
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
            onSaveSignature={(payload) => saveSignature(selected.id, payload)}
            onDuplicate={(selectedLineItems) => duplicateOrder(selected, selectedLineItems)}
          />
        ) : page === "salg" ? (
          <SalesPage orders={orders} technicians={technicians} productTypes={catalog.productTypes} productCategories={catalog.productCategories} primaryServices={catalog.primaryServices} addOnServices={catalog.addOnServices} selectedDate={selectedDate} onDateChange={setSelectedDate} onOpen={setSelectedId} onAdd={addOrder} onImport={importOrders} storeFocus={store?.lat && store?.lon ? { lat: store.lat, lon: store.lon } : null} />
        ) : page === "planlaegning" ? (
          <PlanningPage
            orders={orders} technicians={technicians} vehicles={vehicles} timeOff={timeOff}
            store={store}
            selectedDate={selectedDate} onDateChange={setSelectedDate}
            onOpen={setSelectedId} onCycleStatus={cycleStatus} onAssign={assignTechnician} onReorder={reorderOrder}
            onUpdateTechnician={(technicianId, fields) => updateTechnicianVehicle(technicianId, fields.bilId)}
            onRefresh={refresh} refreshing={refreshing}
          />
        ) : page === "montor" ? (
          profile.rolle === "montor" ? (
            technician ? <TechnicianRouteView orders={orders} technician={technician} selectedDate={selectedDate} onDateChange={setSelectedDate} onOpen={setSelectedId} onCycleStatus={cycleStatus} onReorder={reorderOrder} onRefresh={refresh} refreshing={refreshing} /> : <p className="text-sm text-muted">Din bruger er ikke koblet til en montør/bil-profil endnu — kontakt en administrator.</p>
          ) : technician ? (
            <TechnicianRouteView orders={orders} technician={technician} selectedDate={selectedDate} onDateChange={setSelectedDate} onOpen={setSelectedId} onCycleStatus={cycleStatus} onReorder={reorderOrder} onChangeTechnician={() => setSelectedTechnicianId(null)} onRefresh={refresh} refreshing={refreshing} />
          ) : (
            <TechnicianPicker technicians={technicians} onSelect={setSelectedTechnicianId} />
          )
        ) : page === "lager" ? (
          <WarehousePage orders={orders} technicians={technicians} vehicles={vehicles} selectedDate={selectedDate} onDateChange={setSelectedDate} onToggleLineItemPicked={toggleLineItemPicked} onOpen={setSelectedId} />
        ) : page === "arkiv" ? (
          <ArchivePage orders={orders} technicians={technicians} onOpen={setSelectedId} />
        ) : page === "systemadmin" ? (
          <SystemAdminPage />
        ) : (
          <AdminPage
            technicians={technicians} vehicles={vehicles} users={users} timeOff={timeOff} currentUserId={profile.id}
            productTypes={catalog.productTypes} productCategories={catalog.productCategories} primaryServices={catalog.primaryServices} addOnServices={catalog.addOnServices}
            onUpdateTechnicianVehicle={updateTechnicianVehicle} onAddVehicle={addVehicle} onUpdateVehicle={updateVehicle} onDeleteVehicle={deleteVehicleWithConfirm} onToggleVehicleClosed={toggleVehicleClosed}
            onAddUser={addUser} onUpdateUser={updateUser} onDeleteUser={deleteUser} onResetPassword={resetPassword}
            onAddProductCategory={catalog.addProductCategory} onUpdateProductCategory={catalog.updateProductCategory} onDeleteProductCategory={catalog.deleteProductCategory}
            onAddProductType={catalog.addProductType} onUpdateProductType={catalog.updateProductType} onDeleteProductType={catalog.deleteProductType}
            onAddPrimaryService={catalog.addPrimaryService} onUpdatePrimaryService={catalog.updatePrimaryService} onDeletePrimaryService={catalog.deletePrimaryService}
            onAddAddOnService={catalog.addAddOnService} onUpdateAddOnService={catalog.updateAddOnService} onDeleteAddOnService={catalog.deleteAddOnService}
            onAddTimeOff={addTimeOff} onDeleteTimeOff={deleteTimeOff}
          />
        )}
      </div>
    </div>
  );
}
