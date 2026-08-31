import { useState, useEffect, useCallback, useRef } from "react";
import { getOrders, saveOrder, saveOrderResult, deleteOrder as deleteOrderRow, getFreshOrder } from "../lib/dataStore";
import { uid, dailyOrderCompare, lineItemFingerprint } from "../data/domain";
import { enqueueOrder, flushQueue, queueLength, subscribeQueue } from "../lib/offlineQueue";
import { reportSaveFailure } from "../lib/saveStatus";

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
//
// TILBAGERULNING VED FEJLET SKRIVNING (august 2026): alle ændringer her
// er OPTIMISTISKE - de vises med det samme, og skrivningen til Supabase
// sker bagefter. Fejler den skrivning, blev ændringen tidligere stående
// på skærmen, som om alt var gået godt; først ved næste genindlæsning
// opdagede man, at noten/statussen/plukket aldrig var blevet gemt.
// saveOneOrder ruller derfor ændringen tilbage til den version, der står
// i databasen - MEDMINDRE fejlen skyldes netværket, se nedenfor.
//
// OFFLINE-KØ (august 2026): en montør i en kælder eller elevator har
// intet netværk. At rulle ændringen tilbage dér er teknisk korrekt, men
// praktisk ubrugeligt: arbejdet ER udført, og montøren skal ikke huske at
// gøre det hele igen senere. I praksis fører det til, at folk falder
// tilbage på papir - og så er systemet ikke længere sandheden om, hvad
// der er sket. Ved en NETVÆRKSFEJL beholdes ændringen derfor på skærmen
// og lægges i kø (se lib/offlineQueue.js), og den sendes automatisk, når
// forbindelsen er tilbage.
//
// Skelnen er afgørende: kun NETVÆRKSFEJL køes. En AFVIST skrivning
// (manglende rettighed, RLS, ugyldige data) rulles stadig tilbage og
// vises for brugeren - den ville fejle igen uanset hvor mange gange vi
// prøvede, og at køe den ville genskabe præcis den tavse fejl, hele
// tilbagerulningen blev bygget for at fjerne.
//
// Selve skelnen sker i dataStore (saveOrderResult -> { ok, netvaerk }),
// IKKE her. Det er med vilje: supabase-js kaster ikke ved netværksfejl,
// men returnerer den i { error } præcis som en afvisning, så forskellen
// kan kun aflæses dér, hvor fejlobjektet findes.
//
// DATO ER VALGFRI (august 2026): en sag kan oprettes/duplikeres UDEN dato
// (og dermed uden tidsrum/montør) - den lander så i "Skal planlægges" i
// PlanningPage.jsx (se needsPlanning i domain.js), som kan foreslå BÅDE
// dato og montør for den.
export function useOrders(storeId) {
  const [orders, setOrders] = useState([]);
  const [queuedCount, setQueuedCount] = useState(0);
  // Forhindrer to samtidige tømninger af køen (fx hvis "online" fyrer
  // samtidig med det periodiske forsøg) - to på én gang ville sende de
  // samme sager to gange.
  const flushingRef = useRef(false);

  const load = useCallback(async (id) => {
    if (!id) { setOrders([]); return; }
    setOrders(await getOrders(id));
  }, []);

  useEffect(() => { load(storeId); }, [storeId, load]);

  useEffect(() => subscribeQueue((k) => setQueuedCount(k.length)), []);

  // Sender køen. Kaldes når browseren melder "online" igen, ved opstart,
  // og med jævne mellemrum - "online"-hændelsen er notorisk upålidelig på
  // mobil (telefonen kan melde forbindelse, længe før der reelt er hul
  // igennem), så den må ikke stå alene.
  const flush = useCallback(async () => {
    if (flushingRef.current || queueLength() === 0) return;
    flushingRef.current = true;
    try {
      const r = await flushQueue(saveOrder, {
        onDropped: (post) =>
          reportSaveFailure(
            `En ændring på sag ${post.order?.nr || post.id} kunne ikke gemmes efter flere forsøg og er nu fjernet fra køen. Åbn sagen og indtast ændringen igen.`
          ),
      });
      if (r.sendt > 0 && storeId) await load(storeId);
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
  //   ok            -> færdig, intet mere at gøre
  //   netvaerk      -> behold ændringen på skærmen, læg den i kø
  //   afvist        -> rul tilbage (dataStore har allerede vist fejlen)
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

  // Opretter en ny ordre med et midlertidigt sagsnummer (vises med det
  // samme), og henter den friske, database-tildelte version bagefter (se
  // assign_order_number-triggeren) - så det ENDELIGE, garanteret unikke
  // sagsnummer altid vises korrekt, uden gæt fra browseren.
  //
  // BEVIDST IKKE KØET: sagsnummeret tildeles af databasen, og en køet
  // oprettelse ville stå med "..." som nummer i timevis.
  const addOrder = async ({ kunde, koeber, noegle, dato, tidsrumId, start, slut, montorId, varelinjer, ordrenummer, createdBy }) => {
    if (!storeId) return;
    const newOrder = {
      id: uid(), nr: "...", ordrenummer: ordrenummer?.trim() || "",
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

  // SLETTER en sag permanent (august 2026). Kræver rettigheden sag_slet,
  // håndhævet af RLS-policyen "delete orders with permission" i databasen
  // - admin og sælger har den, montør og lager ikke.
  //
  // BEVIDST IKKE KØET OFFLINE, i modsætning til almindelige ændringer: en
  // sletning er uigenkaldelig, og at udføre den timer senere - når
  // brugeren for længst har glemt den, og en kollega måske har arbejdet
  // videre på sagen i mellemtiden - er ikke en tjeneste. Uden forbindelse
  // fejler den ærligt, og sagen bliver stående.
  //
  // Returnerer true/false, så den kaldende komponent ved, om den skal
  // navigere væk fra en sag, der ikke længere findes.
  const deleteOrder = async (orderId) => {
    if (!storeId) return false;
    const previous = findOrder(orders, orderId);
    if (!previous) return false;
    setOrders((prev) => prev.filter((s) => s.id !== orderId));
    const ok = await deleteOrderRow(storeId, orderId);
    if (!ok) {
      // Læg den tilbage. dataStore har allerede vist fejlen for brugeren.
      setOrders((prev) => (prev.some((s) => s.id === orderId) ? prev : [...prev, previous]));
      return false;
    }
    return true;
  };

  // Opretter en ny sag ud fra en EKSISTERENDE (dupliker/opfølgning).
  // Datoen, tidsrummet og montøren NULSTILLES bevidst til INTET SAT -
  // opfølgningen lander i "Skal planlægges" og kan derfra få et rigtigt
  // forslag til dato+montør, i stedet for at gætte på dags dato.
  //
  // Fejler selve oprettelsen af den nye sag, røres kilde-sagen slet ikke:
  // ellers ville den stå med et harOpfoelgning-link til en sag, der ikke
  // findes, og en notifikation om en opfølgning, der aldrig blev lavet.
  const duplicateOrder = async (sourceOrder, selectedLineItems, createdBy) => {
    if (!storeId || !selectedLineItems || selectedLineItems.length === 0) return null;
    const clonedLineItems = selectedLineItems.map((v) => ({
      ...v,
      id: uid(),
      plukket: false,
      // En manglende-vare-markering hører til den OPRINDELIGE sag og må
      // ikke følge med over på opfølgningen - den nye sag er jo netop
      // forsøget på at løse problemet.
      mangler: null,
      tillaeg: (v.tillaeg || []).map((y) => ({ ...y, udfoert: false })),
    }));
    const newOrder = {
      id: uid(), nr: "...", ordrenummer: "",
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

  // Hurtig-redigering af en booket ordre (dato/tidsrum/montør/adresse).
  const updateBooking = (id, fields) => { const s = findOrder(orders, id); if (s) saveOneOrder({ ...s, ...fields }); };

  const importOrders = (newOrders) => newOrders.forEach((s) => saveOneOrder(s));

  const assignTechnician = (orderId, technicianId) => { const s = findOrder(orders, orderId); if (s) saveOneOrder({ ...s, montorId: technicianId }); };
  const updateTimeSlot = (orderId, timeSlotId) => { const s = findOrder(orders, orderId); if (s) saveOneOrder({ ...s, tidsrumId: timeSlotId }); };

  // ---------------- Varelinjer på en EKSISTERENDE sag (august 2026) ----------------
  // Indtil nu kunne varelinjerne kun sættes ved oprettelsen af sagen. I
  // praksis sker der løbende ændringer: kunden ombestemmer sig, en vare
  // er oversolgt og erstattes af en tilsvarende model, eller der skal en
  // ekstra ting med. Kræver rettigheden sag_feltarbejde (se
  // orders_guard_field_groups i databasen), som sælger, montør og admin
  // har - men lageret bevidst ikke: de må melde en vare manglende, ikke
  // omskrive hvad der er solgt.
  //
  // Ordrens afledte "plukket"-flag genberegnes ved hver ændring: fjerner
  // man den ene uplukkede linje, ER resten af sagen jo færdigplukket, og
  // så skal lagerlisten også vise det.
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

  // Fjerner ÉN varelinje. Den kaldende komponent er ansvarlig for at
  // bekræfte handlingen først - det er en ændring af, hvad kunden har
  // købt, ikke en visningsdetalje.
  const removeLineItem = (orderId, lineItemId) => {
    const s = findOrder(orders, orderId);
    if (!s) return;
    setLineItems(orderId, (s.varelinjer || []).filter((v) => v.id !== lineItemId));
  };

  // ---------------- Manglende varer (august 2026) ----------------
  // Lageret melder ved pluk, at en vare ikke kan findes - oversolgt, eller
  // en leverance der ikke er kommet. Sælgeren, der har booket sagen, får
  // besked, så kunden kan kontaktes FØR montøren kører forgæves.
  //
  // meldtVedDato og meldtForVare er selve mekanikken bag, at
  // notifikationen forsvinder AF SIG SELV, når problemet er håndteret -
  // se isMissingActive i domain.js. Vi gemmer sagens dato og et
  // fingeraftryk af varen, som den så ud PÅ MELDINGSTIDSPUNKTET; ændrer
  // sælgeren enten dato eller vare, matcher det ikke længere, og
  // meldingen er dermed besvaret.
  //
  // Bemærk at der IKKE røres ved notifikationSet her. Det er med vilje:
  // det felt er beskyttet af sag_feltarbejde, som lageret ikke har - se
  // migrationen "allow_warehouse_to_report_missing_items", der giver dem
  // adgang til præcis 'plukket' og 'mangler' på en varelinje og intet
  // andet.
  const reportMissingItem = (orderId, lineItemId, note, reporter) => {
    const s = findOrder(orders, orderId);
    if (!s) return;
    const linje = (s.varelinjer || []).find((v) => v.id === lineItemId);
    if (!linje) return;
    updateLineItem(orderId, lineItemId, {
      // En vare, der ikke kan findes, kan pr. definition ikke være plukket.
      plukket: false,
      mangler: {
        note: (note || "").trim() || "Varen kan ikke findes på lageret",
        tid: new Date().toLocaleString("da-DK"),
        meldtAf: reporter || null,
        meldtVedDato: s.dato || null,
        meldtForVare: lineItemFingerprint(linje),
      },
    });
  };

  // Varen dukkede op alligevel. Fjerner markeringen helt frem for at
  // sætte et "løst"-flag: der er ikke noget at gemme på, og en tom
  // markering ville bare ligge og forvirre næste gang nogen kigger.
  const clearMissingItem = (orderId, lineItemId) => updateLineItem(orderId, lineItemId, { mangler: null });

  // Ændrer besøgs-RÆKKEFØLGEN for sager hos samme montør, samme dag.
  // Direction er -1 (flyt op/tidligere) eller +1 (flyt ned/senere).
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

  // Sætter besøgs-RÆKKEFØLGEN for en montørs dag i ÉT hug - bruges af
  // "Foreslå bedste rækkefølge" (se lib/geocoding.js: optimalVisitOrder).
  const setVisitOrder = (technicianId, date, orderedIds) => {
    orderedIds.forEach((id, i) => {
      const o = findOrder(orders, id);
      if (o && o.montorId === technicianId && o.dato === date && o.raekkefolge !== i) {
        saveOneOrder({ ...o, raekkefolge: i });
      }
    });
  };

  // Slår plukket til/fra for ÉN varelinje (se WarehousePage.jsx: dér er 1
  // varelinje = 1 punkt på pluklisten).
  const toggleLineItemPicked = (orderId, lineItemId) => {
    const s = findOrder(orders, orderId);
    if (!s) return;
    const varelinjer = s.varelinjer.map((v) => (v.id === lineItemId ? { ...v, plukket: !v.plukket } : v));
    const allPicked = varelinjer.length > 0 && varelinjer.every((v) => v.plukket);
    saveOneOrder({ ...s, varelinjer, plukket: allPicked });
  };

  // Cirkulerer status planlagt -> i gang -> afsluttet -> planlagt.
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

  // Kundeunderskrift ved aflevering.
  const saveSignature = (orderId, { navn, data }) => {
    const s = findOrder(orders, orderId);
    if (s) saveOneOrder({ ...s, underskrift: { navn, data, tid: new Date().toLocaleString("da-DK") } });
  };

  // Materialeforbrug UD OVER det oprindeligt planlagte. Nulstiller
  // notifikationen til "ulæst" hver gang - så sælgeren får besked igen,
  // selv hvis de allerede havde set et TIDLIGERE materiale på samme sag.
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

  // Markerer en sag som "afsluttet med et problem". Bevidst UAFHÆNGIG af
  // status-cyklussen - "problem" er en selvstændig markering, ikke en
  // fjerde status.
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

  // Markerer notifikationstyper som SET (læst) for en given sag - kaldes
  // automatisk når sagens EGEN opretter åbner den.
  //
  // BEMÆRK at "manglendeVarer" IKKE kan afvises her. Den er ikke en
  // besked, men en uafklaret tilstand: at have set den løser ingenting,
  // kunden står stadig til at få en montør uden varen. Den forsvinder
  // først, når sagen får en ny dato, varen ændres, eller lageret fjerner
  // markeringen - se isMissingActive i domain.js.
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
    assignTechnician, updateTimeSlot, reorderOrder, setVisitOrder, toggleLineItemPicked, cycleStatus,
    setLineItems, updateLineItem, addLineItem, removeLineItem,
    reportMissingItem, clearMissingItem,
    addNote, addPhoto, addReport, clockIn, clockOut,
    toggleAddOn, addAddOn, removeAddOn, saveSignature,
    addMaterial, removeMaterial,
    markProblem, clearProblem, dismissNotifications,
    queuedCount,
    reload: () => load(storeId),
  };
}
