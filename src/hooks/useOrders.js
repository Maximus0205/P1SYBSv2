import { useState, useEffect, useCallback, useRef } from "react";
import { getOrders, saveOrder, saveOrderResult, deleteOrder as deleteOrderRow, getFreshOrder } from "../lib/dataStore";
import { uid, dailyOrderCompare, lineItemFingerprint } from "../data/domain";
import { SAGSTYPE_KUNDE } from "../data/caseTypes";
import { enqueueOrder, flushQueue, queueLength, subscribeQueue } from "../lib/offlineQueue";
import { reportSaveFailure } from "../lib/saveStatus";

// Al state og CRUD for ORDRER - den suverænt største og mest centrale del
// af appen.
//
// VIGTIGT: saveOneOrder gemmer/opdaterer ALTID ét enkelt element ad
// gangen, aldrig "gem hele listen og slet resten" - se den oprindelige
// forklaring i dataStore.js om hvorfor det er vigtigt ved flere samtidige
// brugere.
//
// TILBAGERULNING VED FEJLET SKRIVNING (august 2026): alle ændringer her
// er OPTIMISTISKE. Fejler skrivningen, blev ændringen tidligere stående
// på skærmen, som om alt var gået godt. saveOneOrder ruller derfor
// ændringen tilbage - MEDMINDRE fejlen skyldes netværket, se nedenfor.
//
// OFFLINE-KØ (august 2026): en montør i en kælder har intet netværk. At
// rulle ændringen tilbage dér er teknisk korrekt, men praktisk
// ubrugeligt: arbejdet ER udført. Ved NETVÆRKSFEJL beholdes ændringen
// derfor på skærmen og lægges i kø. Kun netværksfejl køes - en AFVIST
// skrivning (manglende rettighed, RLS) rulles stadig tilbage, da den
// ville fejle igen uanset hvad.
//
// Selve skelnen sker i dataStore (saveOrderResult -> { ok, netvaerk }),
// IKKE her: supabase-js kaster ikke ved netværksfejl, men returnerer den
// i { error } præcis som en afvisning, så forskellen kan kun aflæses dér,
// hvor fejlobjektet findes.
export function useOrders(storeId) {
  const [orders, setOrders] = useState([]);
  const [queuedCount, setQueuedCount] = useState(0);
  const flushingRef = useRef(false);

  const load = useCallback(async (id) => {
    if (!id) { setOrders([]); return; }
    setOrders(await getOrders(id));
  }, []);

  useEffect(() => { load(storeId); }, [storeId, load]);

  useEffect(() => subscribeQueue((k) => setQueuedCount(k.length)), []);

  // Sender køen. Kaldes ved "online", ved opstart, og hvert 30. sekund -
  // "online"-hændelsen er notorisk upålidelig på mobil, hvor telefonen kan
  // melde forbindelse længe før der reelt er hul igennem.
  const flush = useCallback(async () => {
    if (flushingRef.current || queueLength() === 0) return;
    flushingRef.current = true;
    try {
      const resultat = await flushQueue(saveOrder, {
        onDropped: (post) =>
          reportSaveFailure(
            `En ændring på sag ${post.order?.nr || post.id} kunne ikke gemmes efter flere forsøg og er nu fjernet fra køen. Åbn sagen og indtast ændringen igen.`
          ),
      });
      // Hent friske data, hvis noget rent faktisk kom afsted - så skærmen
      // viser det, der nu står i databasen, inkl. hvad andre har ændret
      // imens.
      if (resultat.sendt > 0 && storeId) await load(storeId);
    } finally {
      flushingRef.current = false;
    }
  }, [storeId, load]);

  useEffect(() => {
    flush();
    window.addEventListener("online", flush);
    const iv = setInterval(flush, 30000);
    return () => { window.removeEventListener("online", flush); clearInterval(iv); };
  }, [flush]);

  // Gemmer ÉN ordre.
  //   ok       -> færdig
  //   netvaerk -> behold ændringen på skærmen, læg den i kø
  //   afvist   -> rul tilbage (dataStore har allerede vist fejlen)
  const saveOneOrder = (order) => {
    const previous = orders.find((s) => s.id === order.id) || null;
    setOrders((prev) => (prev.some((s) => s.id === order.id) ? prev.map((s) => (s.id === order.id ? order : s)) : [...prev, order]));
    if (!storeId) return;

    const rulTilbage = () => setOrders((prev) => (previous
      ? prev.map((s) => (s.id === order.id ? previous : s))
      : prev.filter((s) => s.id !== order.id)));

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      enqueueOrder(storeId, order);
      return;
    }

    saveOrderResult(storeId, order)
      .then((r) => {
        if (r.ok) return;
        if (r.netvaerk) { enqueueOrder(storeId, order); return; }
        rulTilbage();
      })
      .catch((e) => {
        rulTilbage();
        reportSaveFailure(e?.message || "Ændringen blev ikke gemt.");
      });
  };

  // Opretter en ny ordre med et midlertidigt sagsnummer, og henter den
  // friske, database-tildelte version bagefter (se assign_order_number-
  // triggeren) - så det ENDELIGE, garanteret unikke sagsnummer vises
  // korrekt, uden gæt fra browseren.
  //
  // BEVIDST IKKE KØET: sagsnummeret tildeles af databasen, og en køet
  // oprettelse ville stå med "..." som nummer i timevis.
  //
  // sagstype (september 2026): "kunde" eller "tomgang" - se
  // data/caseTypes.js. Felterne destruktureres EKSPLICIT her, så et felt
  // der ikke står på listen bliver tavst droppet; sagstype blev derfor
  // tilføjet både her OG i newOrder nedenfor. Standardværdien sikrer, at
  // sager oprettet ad andre veje (CSV-import) også har en type.
  const addOrder = async ({ sagstype, kunde, koeber, noegle, dato, tidsrumId, start, slut, montorId, varelinjer, ordrenummer, createdBy }) => {
    if (!storeId) return;
    const newOrder = {
      id: uid(), nr: "...", ordrenummer: ordrenummer?.trim() || "",
      sagstype: sagstype || SAGSTYPE_KUNDE,
      kunde, koeber: koeber || null, noegle: noegle || {},
      dato: dato || null, tidsrumId: dato ? tidsrumId : null, start: dato ? start : null, slut: dato ? slut : null,
      montorId: montorId || null,
      status: "planlagt", plukket: false, varelinjer, noter: [], billeder: [], rapporter: [], materialer: [], stemplerInd: null, logs: [],
      oprettetAf: createdBy || null,
    };
    setOrders((prev) => [...prev, newOrder]);
    const ok = await saveOrder(storeId, newOrder);
    if (!ok) {
      setOrders((prev) => prev.filter((s) => s.id !== newOrder.id));
      return null;
    }
    const fresh = await getFreshOrder(storeId, newOrder.id);
    if (fresh) setOrders((prev) => prev.map((s) => (s.id === fresh.id ? fresh : s)));
    return newOrder.id;
  };

  const findOrder = (orders_, id) => orders_.find((x) => x.id === id);

  // SLETTER en sag permanent. Kræver sag_slet (admin og sælger har den).
  // BEVIDST IKKE KØET OFFLINE: en sletning er uigenkaldelig, og at udføre
  // den timer senere - hvor brugeren for længst har glemt den, og en
  // kollega måske har arbejdet videre på sagen - er ikke en tjeneste.
  const deleteOrder = async (orderId) => {
    if (!storeId) return false;
    const previous = findOrder(orders, orderId);
    if (!previous) return false;
    setOrders((prev) => prev.filter((s) => s.id !== orderId));
    const ok = await deleteOrderRow(storeId, orderId);
    if (!ok) {
      setOrders((prev) => (prev.some((s) => s.id === orderId) ? prev : [...prev, previous]));
      return false;
    }
    return true;
  };

  // Opretter en ny sag ud fra en EKSISTERENDE (dupliker/opfølgning).
  // Dato, tidsrum og montør nulstilles bevidst - opfølgningen lander i
  // "Skal planlægges" og kan derfra få et rigtigt forslag.
  //
  // SAGSTYPEN FØLGER MED: en opfølgning på en tomgangskørsel er også en
  // tomgangskørsel - lejemålet er stadig tomt, og nøglen skal stadig
  // bruges. Uden dette ville opfølgningen stille og roligt blive til en
  // kundesag, og montøren ville stå uden adgang.
  const duplicateOrder = async (sourceOrder, selectedLineItems, createdBy) => {
    if (!storeId || !selectedLineItems || selectedLineItems.length === 0) return null;
    const clonedLineItems = selectedLineItems.map((v) => ({
      ...v,
      id: uid(),
      plukket: false,
      // En manglende-vare-markering hører til den OPRINDELIGE sag - den
      // nye sag er jo netop forsøget på at løse problemet.
      mangler: null,
      tillaeg: (v.tillaeg || []).map((y) => ({ ...y, udfoert: false })),
    }));
    const newOrder = {
      id: uid(), nr: "...", ordrenummer: "",
      sagstype: sourceOrder.sagstype || SAGSTYPE_KUNDE,
      kunde: { ...sourceOrder.kunde },
      koeber: sourceOrder.koeber ? { ...sourceOrder.koeber } : null,
      noegle: sourceOrder.noegle ? { ...sourceOrder.noegle } : {},
      dato: null, tidsrumId: null, start: null, slut: null, montorId: null,
      status: "planlagt", plukket: false, varelinjer: clonedLineItems,
      noter: [], billeder: [], rapporter: [], materialer: [], stemplerInd: null, logs: [],
      oprettetAf: createdBy || null,
      opfoelgningAf: sourceOrder.id,
    };
    setOrders((prev) => [...prev, newOrder]);
    const ok = await saveOrder(storeId, newOrder);
    if (!ok) {
      setOrders((prev) => prev.filter((s) => s.id !== newOrder.id));
      return null;
    }

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

  const updateBooking = (id, fields) => { const s = findOrder(orders, id); if (s) saveOneOrder({ ...s, ...fields }); };

  const importOrders = (newOrders) => newOrders.forEach((s) => saveOneOrder(s));

  const assignTechnician = (orderId, technicianId) => { const s = findOrder(orders, orderId); if (s) saveOneOrder({ ...s, montorId: technicianId }); };
  const updateTimeSlot = (orderId, timeSlotId) => { const s = findOrder(orders, orderId); if (s) saveOneOrder({ ...s, tidsrumId: timeSlotId }); };

  // ---------------- Varelinjer på en EKSISTERENDE sag ----------------
  // Kræver sag_feltarbejde. Lageret har den bevidst ikke: de må melde en
  // vare manglende, ikke omskrive hvad kunden har købt.
  //
  // Ordrens afledte "plukket"-flag genberegnes ved hver ændring: fjerner
  // man den ene uplukkede linje, ER resten jo færdigplukket.
  const setLineItems = (orderId, varelinjer) => {
    const s = findOrder(orders, orderId);
    if (!s) return;
    const liste = varelinjer || [];
    const allPicked = liste.length > 0 && liste.every((v) => v.plukket);
    saveOneOrder({ ...s, varelinjer: liste, plukket: allPicked });
  };

  const updateLineItem = (orderId, lineItemId, fields) => {
    const s = findOrder(orders, orderId);
    if (!s) return;
    setLineItems(orderId, s.varelinjer.map((v) => (v.id === lineItemId ? { ...v, ...fields } : v)));
  };

  const addLineItem = (orderId, lineItem) => {
    const s = findOrder(orders, orderId);
    if (!s || !lineItem) return;
    setLineItems(orderId, [...(s.varelinjer || []), { ...lineItem, id: lineItem.id || uid() }]);
  };

  const removeLineItem = (orderId, lineItemId) => {
    const s = findOrder(orders, orderId);
    if (!s) return;
    setLineItems(orderId, (s.varelinjer || []).filter((v) => v.id !== lineItemId));
  };

  // ---------------- Manglende varer ----------------
  // meldtVedDato og meldtForVare er mekanikken bag, at notifikationen
  // forsvinder AF SIG SELV, når problemet er håndteret - se
  // isMissingActive i domain.js.
  const reportMissingItem = (orderId, lineItemId, note, reporter) => {
    const s = findOrder(orders, orderId);
    if (!s) return;
    const linje = (s.varelinjer || []).find((v) => v.id === lineItemId);
    if (!linje) return;
    updateLineItem(orderId, lineItemId, {
      plukket: false, // en vare der ikke kan findes, kan ikke være plukket
      mangler: {
        note: (note || "").trim() || "Varen kan ikke findes på lageret",
        tid: new Date().toLocaleString("da-DK"),
        meldtAf: reporter || null,
        meldtVedDato: s.dato || null,
        meldtForVare: lineItemFingerprint(linje),
      },
    });
  };

  const clearMissingItem = (orderId, lineItemId) => updateLineItem(orderId, lineItemId, { mangler: null });

  // ---------------- Start og færdigmelding (september 2026) ----------------
  // ERSTATTER status-skifteren. Status er nu en KONSEKVENS af to konkrete
  // handlinger, montøren foretager alligevel.
  //
  // Det løser samtidig et problem, der ikke lignede et UI-problem: uden
  // pålidelige tidsstempler kan systemet aldrig lære, hvor lang tid en
  // opgave FAKTISK tager (se data/estimates.js). Manuel stempling var
  // frivillig og blev brugt 3 gange ud af 410 sager.
  //
  // startetTidspunkt sættes KUN første gang. Bliver en montør afbrudt og
  // starter igen, er den rigtige samlede varighed stadig fra første start
  // til færdigmelding - ikke fra genoptagelsen.
  const startOrder = (orderId) => {
    const s = findOrder(orders, orderId);
    if (!s) return;
    const nu = new Date().toISOString();
    saveOneOrder({
      ...s,
      status: "igang",
      startetTidspunkt: s.startetTidspunkt || nu,
      stemplerInd: s.stemplerInd || nu,
      afsluttetTidspunkt: null,
    });
  };

  // Færdigmelder sagen: lukker en eventuel åben stempling, sætter
  // sluttidspunktet og markerer sagen afsluttet (= arkiveret).
  //
  // Selve PÅMINDELSEN om dokumentation ligger i UI'et (montørvisningen),
  // ikke her - den skal vises FØR handlingen, mens montøren stadig står
  // hos kunden og kan nå at tage billedet.
  //
  // Har sagen aldrig været startet, sættes startetTidspunkt IKKE
  // bagudrettet til noget opfundet. Så står sagen uden varighed og indgår
  // ikke i estimaterne - bedre end at fodre modellen med et gæt.
  const finishOrder = (orderId) => {
    const s = findOrder(orders, orderId);
    if (!s) return;
    const nu = new Date().toISOString();
    const logs = [...(s.logs || [])];
    if (s.stemplerInd) {
      const minutter = Math.max(1, Math.round((new Date(nu) - new Date(s.stemplerInd)) / 60000));
      logs.push({ id: uid(), ind: s.stemplerInd, ud: nu, minutter });
    }
    saveOneOrder({ ...s, status: "afsluttet", afsluttetTidspunkt: nu, stemplerInd: null, logs });
  };

  // Fortryd færdigmelding. Rydder sluttidspunktet, så en genåbnet sag ikke
  // bidrager med en falsk varighed til estimaterne.
  const reopenOrder = (orderId) => {
    const s = findOrder(orders, orderId);
    if (!s) return;
    saveOneOrder({ ...s, status: "igang", afsluttetTidspunkt: null });
  };

  // Ændrer besøgs-RÆKKEFØLGEN for sager hos samme montør, samme dag.
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

  const setVisitOrder = (technicianId, date, orderedIds) => {
    orderedIds.forEach((id, i) => {
      const o = findOrder(orders, id);
      if (o && o.montorId === technicianId && o.dato === date && o.raekkefolge !== i) {
        saveOneOrder({ ...o, raekkefolge: i });
      }
    });
  };

  // Slår plukket til/fra for ÉN varelinje (1 varelinje = 1 punkt på
  // lagerlisten, se WarehousePage.jsx).
  const toggleLineItemPicked = (orderId, lineItemId) => {
    const s = findOrder(orders, orderId);
    if (!s) return;
    const varelinjer = s.varelinjer.map((v) => (v.id === lineItemId ? { ...v, plukket: !v.plukket } : v));
    const allPicked = varelinjer.length > 0 && varelinjer.every((v) => v.plukket);
    saveOneOrder({ ...s, varelinjer, plukket: allPicked });
  };

  const addNote = (id, text, author) => { const s = findOrder(orders, id); if (s) saveOneOrder({ ...s, noter: [...s.noter, { id: uid(), tekst: text, tid: new Date().toLocaleString("da-DK"), forfatter: author || null }] }); };
  const addPhoto = (id, { src, navn }) => { const s = findOrder(orders, id); if (s) saveOneOrder({ ...s, billeder: [...s.billeder, { id: uid(), src, navn }] }); };
  const addReport = (id, title, text) => { const s = findOrder(orders, id); if (s) saveOneOrder({ ...s, rapporter: [...s.rapporter, { id: uid(), titel: title, tekst: text, tid: new Date().toLocaleString("da-DK") }] }); };

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

  // Materialeforbrug UD OVER det planlagte. Nulstiller notifikationen til
  // "ulæst" hver gang - så sælgeren får besked igen, selv hvis de allerede
  // havde set et TIDLIGERE materiale på samme sag.
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

  // "Problem" er en selvstændig markering oveni status, ikke en fjerde
  // status - montøren kan sagtens færdigmelde en sag, der ikke kom i mål
  // som planlagt, og markeringen fortæller sælgeren hvorfor.
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

  // BEMÆRK at "manglendeVarer" IKKE kan afvises her. Den er ikke en
  // besked, men en uafklaret tilstand: at have set den løser ingenting.
  const dismissNotifications = (orderId, kinds) => {
    const s = findOrder(orders, orderId);
    if (!s || !kinds || kinds.length === 0) return;
    const relevante = kinds.filter((k) => k !== "manglendeVarer");
    if (relevante.length === 0) return;
    const current = s.notifikationSet || {};
    const hasChange = relevante.some((k) => !current[k]);
    if (!hasChange) return;
    const next = { ...current };
    relevante.forEach((k) => { next[k] = true; });
    saveOneOrder({ ...s, notifikationSet: next });
  };

  return {
    orders,
    addOrder, duplicateOrder, deleteOrder, updateBooking, importOrders,
    assignTechnician, updateTimeSlot, reorderOrder, setVisitOrder, toggleLineItemPicked,
    startOrder, finishOrder, reopenOrder,
    setLineItems, updateLineItem, addLineItem, removeLineItem,
    reportMissingItem, clearMissingItem,
    addNote, addPhoto, addReport,
    toggleAddOn, addAddOn, removeAddOn,
    addMaterial, removeMaterial,
    markProblem, clearProblem, dismissNotifications,
    queuedCount,
    reload: () => load(storeId),
  };
}
