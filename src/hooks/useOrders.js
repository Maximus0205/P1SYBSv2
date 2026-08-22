import { useState, useEffect, useCallback } from "react";
import { getOrders, saveOrder, getFreshOrder } from "../lib/dataStore";
import { uid, todayISO, dailyOrderCompare, timeSlotById } from "../data/domain";

// FASE 3 af arkitektur-oprydningen (august 2026) - se hooks/useCatalog.js
// for den fulde begrundelse. Al state og CRUD for ORDRER - den suverænt
// største og mest centrale del af appen (booking, status, pluk, besøgs-
// rækkefølge, dupliker/opfølgning, noter/billeder/rapporter/tid/
// underskrift) - er samlet her.
//
// VIGTIGT (uændret fra da denne logik boede i App.jsx): saveOneOrder
// gemmer/opdaterer ALTID ét enkelt element ad gangen, aldrig "gem hele
// listen og slet resten" - se den oprindelige forklaring i dataStore.js
// om hvorfor det er vigtigt ved flere samtidige brugere.
export function useOrders(storeId) {
  const [orders, setOrders] = useState([]);

  const load = useCallback(async (id) => {
    if (!id) { setOrders([]); return; }
    setOrders(await getOrders(id));
  }, []);

  useEffect(() => { load(storeId); }, [storeId, load]);

  const saveOneOrder = (order) => {
    setOrders((prev) => (prev.some((s) => s.id === order.id) ? prev.map((s) => (s.id === order.id ? order : s)) : [...prev, order]));
    if (storeId) saveOrder(storeId, order);
  };

  // Opretter en ny ordre med et midlertidigt sagsnummer (vises med det
  // samme), og henter den friske, database-tildelte version bagefter (se
  // assign_order_number-triggeren) - så det ENDELIGE, garanteret unikke
  // sagsnummer altid vises korrekt, uden gæt fra browseren.
  const addOrder = async ({ kunde, koeber, noegle, dato, tidsrumId, start, slut, montorId, varelinjer, ordrenummer }) => {
    if (!storeId) return;
    const newOrder = {
      id: uid(), nr: "...", ordrenummer: ordrenummer?.trim() || "",
      kunde, koeber: koeber || null, noegle: noegle || {}, dato: dato || todayISO(), tidsrumId, start, slut, montorId,
      status: "planlagt", plukket: false, varelinjer, noter: [], billeder: [], rapporter: [], stemplerInd: null, logs: [],
    };
    setOrders((prev) => [...prev, newOrder]);
    await saveOrder(storeId, newOrder);
    const fresh = await getFreshOrder(storeId, newOrder.id);
    if (fresh) setOrders((prev) => prev.map((s) => (s.id === fresh.id ? fresh : s)));
    return newOrder.id;
  };

  // Opretter en ny sag ud fra en EKSISTERENDE (dupliker/opfølgning) - se
  // "Dupliker / Opfølgning" i OrderView.jsx. Kunde/køber/nøgleoplysninger
  // og adresse kopieres, men datoen, tidsrummet og montøren NULSTILLES
  // bevidst - det er jo netop noget nyt der skal planlægges. Sagsnummer,
  // status, noter, billeder, rapporter, tidsregistrering og plukket-status
  // starter alle helt friske. Returnerer det nye sags-id, så den kaldende
  // side kan åbne den nyoprettede sag med det samme.
  const duplicateOrder = async (sourceOrder, selectedLineItems) => {
    if (!storeId || !selectedLineItems || selectedLineItems.length === 0) return null;
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
    await saveOrder(storeId, newOrder);
    const fresh = await getFreshOrder(storeId, newOrder.id);
    if (fresh) { setOrders((prev) => prev.map((s) => (s.id === fresh.id ? fresh : s))); return fresh.id; }
    return newOrder.id;
  };

  const findOrder = (orders_, id) => orders_.find((x) => x.id === id);

  // Hurtig-redigering af en booket ordre (dato/tidsrum/montør/adresse) - se
  // BookingEditor i OrderView.jsx.
  const updateBooking = (id, fields) => { const s = findOrder(orders, id); if (s) saveOneOrder({ ...s, ...fields }); };

  const importOrders = (newOrders) => newOrders.forEach((s) => saveOneOrder(s));

  const assignTechnician = (orderId, technicianId) => { const s = findOrder(orders, orderId); if (s) saveOneOrder({ ...s, montorId: technicianId }); };
  const updateTimeSlot = (orderId, timeSlotId) => { const s = findOrder(orders, orderId); if (s) saveOneOrder({ ...s, tidsrumId: timeSlotId }); };

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
  // afledt "alle varelinjer på ordren er plukket"-flag.
  const toggleLineItemPicked = (orderId, lineItemId) => {
    const s = findOrder(orders, orderId);
    if (!s) return;
    const varelinjer = s.varelinjer.map((v) => (v.id === lineItemId ? { ...v, plukket: !v.plukket } : v));
    const allPicked = varelinjer.length > 0 && varelinjer.every((v) => v.plukket);
    saveOneOrder({ ...s, varelinjer, plukket: allPicked });
  };

  // Cirkulerer status planlagt -> i gang -> afsluttet -> planlagt. Sætter
  // (eller nulstiller) afsluttetTidspunkt sammen med selve status-skiftet,
  // så sagskort kan vise HVORNÅR en sag reelt blev afsluttet.
  const cycleStatus = (id) => {
    const s = findOrder(orders, id);
    if (!s) return;
    const order = ["planlagt", "igang", "afsluttet"];
    const newStatus = order[(order.indexOf(s.status) + 1) % order.length];
    const extra = {};
    if (newStatus === "afsluttet") extra.afsluttetTidspunkt = new Date().toISOString();
    else if (s.status === "afsluttet") extra.afsluttetTidspunkt = null;
    saveOneOrder({ ...s, status: newStatus, ...extra });
  };

  const addNote = (id, text) => { const s = findOrder(orders, id); if (s) saveOneOrder({ ...s, noter: [...s.noter, { id: uid(), tekst: text, tid: new Date().toLocaleString("da-DK") }] }); };
  const addPhoto = (id, { src, navn }) => { const s = findOrder(orders, id); if (s) saveOneOrder({ ...s, billeder: [...s.billeder, { id: uid(), src, navn }] }); };
  const addReport = (id, title, text) => { const s = findOrder(orders, id); if (s) saveOneOrder({ ...s, rapporter: [...s.rapporter, { id: uid(), titel: title, tekst: text, tid: new Date().toLocaleString("da-DK") }] }); };

  const clockIn = (id) => { const s = findOrder(orders, id); if (s) saveOneOrder({ ...s, stemplerInd: new Date().toISOString(), status: s.status === "planlagt" ? "igang" : s.status }); };
  const clockOut = (id) => {
    const s = findOrder(orders, id);
    if (!s || !s.stemplerInd) return;
    const in_ = s.stemplerInd, out = new Date().toISOString();
    const minutes = Math.max(1, Math.round((new Date(out) - new Date(in_)) / 60000));
    saveOneOrder({ ...s, stemplerInd: null, logs: [...s.logs, { id: uid(), ind: in_, ud: out, minutter: minutes }] });
  };

  const toggleAddOn = (orderId, lineItemId, addOnId) => {
    const s = findOrder(orders, orderId);
    if (s) saveOneOrder({ ...s, varelinjer: s.varelinjer.map((v) => (v.id === lineItemId ? { ...v, tillaeg: v.tillaeg.map((y) => (y.id === addOnId ? { ...y, udfoert: !y.udfoert } : y)) } : v)) });
  };
  const addAddOn = (orderId, lineItemId, navn) => {
    const s = findOrder(orders, orderId);
    if (s) saveOneOrder({ ...s, varelinjer: s.varelinjer.map((v) => (v.id === lineItemId ? { ...v, tillaeg: [...v.tillaeg, { id: uid(), navn: navn.trim(), minutter: 15, udfoert: false }] } : v)) });
  };
  const removeAddOn = (orderId, lineItemId, addOnId) => {
    const s = findOrder(orders, orderId);
    if (s) saveOneOrder({ ...s, varelinjer: s.varelinjer.map((v) => (v.id === lineItemId ? { ...v, tillaeg: v.tillaeg.filter((y) => y.id !== addOnId) } : v)) });
  };

  // Kundeunderskrift ved aflevering - se Signature-komponenten i
  // OrderParts.jsx. Gemmes som ét felt på ordren (navn + billeddata +
  // tidspunkt), ligesom noter/billeder/rapporter.
  const saveSignature = (orderId, { navn, data }) => {
    const s = findOrder(orders, orderId);
    if (s) saveOneOrder({ ...s, underskrift: { navn, data, tid: new Date().toLocaleString("da-DK") } });
  };

  return {
    orders,
    addOrder, duplicateOrder, updateBooking, importOrders,
    assignTechnician, updateTimeSlot, reorderOrder, toggleLineItemPicked, cycleStatus,
    addNote, addPhoto, addReport, clockIn, clockOut,
    toggleAddOn, addAddOn, removeAddOn, saveSignature,
    reload: () => load(storeId),
  };
}
