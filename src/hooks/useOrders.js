import { useState, useEffect, useCallback } from "react";
import { getOrders, saveOrder, getFreshOrder } from "../lib/dataStore";
import { uid, todayISO, dailyOrderCompare, timeSlotById } from "../data/domain";

// FASE 3 af arkitektur-oprydningen (august 2026) - se hooks/useCatalog.js
// for den fulde begrundelse. Al state og CRUD for ORDRER - den suverænt
// største og mest centrale del af appen (booking, status, pluk, besøgs-
// rækkefølge, dupliker/opfølgning, noter/billeder/rapporter/tid/
// underskrift/materialeforbrug/problem-markering/notifikationer) - er
// samlet her.
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
  //
  // createdBy ({id, navn} for den indloggede bruger, eller null) gemmes
  // som oprettetAf - så det altid er synligt, HVEM der har booket sagen
  // (savnet funktion, se OrderView.jsx), og bruges desuden som grundlag
  // for notifikationssystemet (kun sagens EGEN opretter får besked om
  // materialeforbrug/problemer/opfølgninger på den, se dismissNotifications
  // nedenfor).
  const addOrder = async ({ kunde, koeber, noegle, dato, tidsrumId, start, slut, montorId, varelinjer, ordrenummer, createdBy }) => {
    if (!storeId) return;
    const newOrder = {
      id: uid(), nr: "...", ordrenummer: ordrenummer?.trim() || "",
      kunde, koeber: koeber || null, noegle: noegle || {}, dato: dato || todayISO(), tidsrumId, start, slut, montorId,
      status: "planlagt", plukket: false, varelinjer, noter: [], billeder: [], rapporter: [], materialer: [], stemplerInd: null, logs: [],
      oprettetAf: createdBy || null,
    };
    setOrders((prev) => [...prev, newOrder]);
    await saveOrder(storeId, newOrder);
    const fresh = await getFreshOrder(storeId, newOrder.id);
    if (fresh) setOrders((prev) => prev.map((s) => (s.id === fresh.id ? fresh : s)));
    return newOrder.id;
  };

  const findOrder = (orders_, id) => orders_.find((x) => x.id === id);

  // Opretter en ny sag ud fra en EKSISTERENDE (dupliker/opfølgning) - se
  // "Dupliker / Opfølgning" i OrderView.jsx. Kunde/køber/nøgleoplysninger
  // og adresse kopieres, men datoen, tidsrummet og montøren NULSTILLES
  // bevidst - det er jo netop noget nyt der skal planlægges. Sagsnummer,
  // status, noter, billeder, rapporter, tidsregistrering, materialeforbrug
  // og plukket-status starter alle helt friske. Returnerer det nye sags-id.
  //
  // Markerer desuden den OPRINDELIGE sag med harOpfoelgning (den nye sags
  // id) og nulstiller dens opfølgnings-notifikation til "ulæst" - det er
  // grundlaget for at kunne fortælle den oprindelige sags opretter "der er
  // lavet en opfølgning på en af dine sager", se dismissNotifications.
  const duplicateOrder = async (sourceOrder, selectedLineItems, createdBy) => {
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
      noter: [], billeder: [], rapporter: [], materialer: [], stemplerInd: null, logs: [],
      oprettetAf: createdBy || null,
      opfoelgningAf: sourceOrder.id,
    };
    setOrders((prev) => [...prev, newOrder]);
    await saveOrder(storeId, newOrder);

    // Markér kilde-sagen med et forward-link + ulæst opfølgnings-notifikation.
    const freshSource = findOrder(orders, sourceOrder.id) || sourceOrder;
    saveOneOrder({
      ...freshSource,
      harOpfoelgning: newOrder.id,
      notifikationSet: { ...(freshSource.notifikationSet || {}), opfoelgning: false },
    });

    const fresh = await getFreshOrder(storeId, newOrder.id);
    if (fresh) { setOrders((prev) => prev.map((s) => (s.id === fresh.id ? fresh : s))); return fresh.id; }
    return newOrder.id;
  };

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

  // Sætter besøgs-RÆKKEFØLGEN for en montørs dag i ÉT hug, ud fra en
  // færdigberegnet liste af sags-id'er i den ønskede rækkefølge - bruges af
  // "Foreslå bedste rækkefølge" (se lib/geocoding.js: optimalVisitOrder,
  // og PlanningPage.jsx), som beregner en hel ny rækkefølge på én gang, i
  // modsætning til reorderOrder ovenfor, der kun flytter ÉT trin ad gangen.
  // Kun de sager hvis raekkefolge rent faktisk ændrer sig bliver gemt.
  const setVisitOrder = (technicianId, date, orderedIds) => {
    orderedIds.forEach((id, i) => {
      const o = findOrder(orders, id);
      if (o && o.montorId === technicianId && o.dato === date && o.raekkefolge !== i) {
        saveOneOrder({ ...o, raekkefolge: i });
      }
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

  // "author" ({id, navn} for den, der SKRIVER noten, eller null) gemmes som
  // forfatter på selve note-posten - så det altid er synligt, HVEM der har
  // noteret hvad, når flere forskellige personer (sælger OG montør) kan
  // skrive noter på samme sag. Se Notes-komponenten i OrderParts.jsx.
  const addNote = (id, text, author) => { const s = findOrder(orders, id); if (s) saveOneOrder({ ...s, noter: [...s.noter, { id: uid(), tekst: text, tid: new Date().toLocaleString("da-DK"), forfatter: author || null }] }); };
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

  // Materialeforbrug UD OVER det oprindeligt planlagte - fx "vi skulle
  // bruge en længere vandslange" opdaget hos kunden. Adskilt fra noter
  // (fri tekst) og varelinjer (det der blev SOLGT/booket) - dette er en
  // logget liste over ekstra ting brugt undervejs, til senere brug ved
  // evt. fakturering/lageropfølgning. Nulstiller notifikationen til
  // "ulæst" hver gang - så sælgeren får besked igen, selv hvis de allerede
  // havde set og afvist et TIDLIGERE materiale på samme sag.
  const addMaterial = (orderId, { navn, antal }) => {
    const s = findOrder(orders, orderId);
    if (!s || !navn?.trim()) return;
    saveOneOrder({
      ...s,
      materialer: [...(s.materialer || []), { id: uid(), navn: navn.trim(), antal: Number(antal) || 1, tid: new Date().toLocaleString("da-DK") }],
      notifikationSet: { ...(s.notifikationSet || {}), materialer: false },
    });
  };
  const removeMaterial = (orderId, materialId) => {
    const s = findOrder(orders, orderId);
    if (s) saveOneOrder({ ...s, materialer: (s.materialer || []).filter((m) => m.id !== materialId) });
  };

  // Markerer en sag som "afsluttet med et problem" - fx kunden var ikke
  // hjemme, mangler dele, adgangsproblem osv. Bevidst UAFHÆNGIG af selve
  // status-cyklussen (planlagt/i gang/afsluttet) - montøren kan stadig
  // frit bruge status som normalt, "problem" er en selvstændig markering
  // oveni, ikke en fjerde status. Nulstiller notifikationen til "ulæst".
  const markProblem = (orderId, note) => {
    const s = findOrder(orders, orderId);
    if (!s || !note?.trim()) return;
    saveOneOrder({
      ...s,
      problem: { note: note.trim(), tid: new Date().toLocaleString("da-DK") },
      notifikationSet: { ...(s.notifikationSet || {}), problem: false },
    });
  };
  const clearProblem = (orderId) => {
    const s = findOrder(orders, orderId);
    if (s) saveOneOrder({ ...s, problem: null });
  };

  // Markerer én eller flere notifikationstyper ("materialer", "problem",
  // "opfoelgning") som SET (læst/afvist) for en given sag - se App.jsx,
  // som kalder dette automatisk når sagens EGEN opretter åbner den. Se
  // domain.js: computeNotifications for selve beregningen af, hvad der
  // reelt vises som ulæst.
  const dismissNotifications = (orderId, kinds) => {
    const s = findOrder(orders, orderId);
    if (!s || !kinds || kinds.length === 0) return;
    const current = s.notifikationSet || {};
    const hasChange = kinds.some((k) => !current[k]);
    if (!hasChange) return;
    const next = { ...current };
    kinds.forEach((k) => { next[k] = true; });
    saveOneOrder({ ...s, notifikationSet: next });
  };

  return {
    orders,
    addOrder, duplicateOrder, updateBooking, importOrders,
    assignTechnician, updateTimeSlot, reorderOrder, setVisitOrder, toggleLineItemPicked, cycleStatus,
    addNote, addPhoto, addReport, clockIn, clockOut,
    toggleAddOn, addAddOn, removeAddOn, saveSignature,
    addMaterial, removeMaterial,
    markProblem, clearProblem, dismissNotifications,
    reload: () => load(storeId),
  };
}
