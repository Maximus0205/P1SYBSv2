import { useState, useEffect, useCallback, useRef } from "react";
import { pos } from "../adapters";
import { pausePatch } from "../lib/opgaveTid";
import { fetchAllOrders, fetchOrderVersions, fetchOrdersByIds, saveOrderVersioned, trashOrder, ORDERS_CHANGED_EVENT, MAKS_RAEKKER } from "../lib/orderStore";
import { uid, dailyOrderCompare, lineItemFingerprint } from "../data/domain";
import { SAGSTYPE_KUNDE } from "../data/caseTypes";
import { enqueueOrder, flushQueue, queueLength, subscribeQueue, getQueuedPost, removeFromQueue } from "../lib/offlineQueue";
import { reportSaveFailure } from "../lib/saveStatus";
import { mergeOrder, applyMine, deepEqual } from "../lib/orderMerge";
import { addConflict, getConflicts, removeConflict, updateConflict, subscribeResolve } from "../lib/conflictStore";

// Al state og CRUD for ORDRER - den suverænt største og mest centrale del
// af appen.
//
// VIGTIGT: saveOneOrder gemmer/opdaterer ALTID ét enkelt element ad
// gangen, aldrig "gem hele listen og slet resten" - se den oprindelige
// forklaring i dataStore.js om hvorfor det er vigtigt ved flere samtidige
// brugere.
//
// ---------------------------------------------------------------------
// SAMTIDIGE RETTELSER (oktober 2026)
// ---------------------------------------------------------------------
// Hver sag har et VERSIONSNUMMER i databasen. Vi husker, hvilken version
// (og hvilken udgave - "base") hver sag havde, da vi sidst så den. En
// skrivning sendes med det nummer, og databasen (funktionen save_order)
// afviser den, hvis nogen har ændret sagen siden. Så kan en ændring
// ALDRIG overskrive en andens arbejde stille. I stedet:
//
//   1. Rørte I forskellige felter, flettes begge ændringer automatisk
//      (lib/orderMerge.js) og gemmes oven på den nyeste udgave.
//   2. Rørte I SAMME felt til forskellige værdier, gættes der ikke:
//      brugerens ændring PARKERES (lib/conflictStore.js) og en tydelig
//      besked beder om et valg (components/ConflictBanner.jsx). Intet
//      forsvinder, og intet overskrives uden et bevidst valg.
//
// For at konflikter bliver sjældne, henter appen løbende andres ændringer
// (refresh): hvert 20. sekund, og når appen kommer i fokus igen. Kun
// sager hvis versionsnummer er ændret hentes.
//
// Skrivninger på SAMME sag udføres i rækkefølge (runSerial), så to hurtige
// tryk ikke konkurrerer med sig selv om versionsnummeret.
//
// ---------------------------------------------------------------------
// ØVRIGT
// ---------------------------------------------------------------------
// TILBAGERULNING VED FEJLET SKRIVNING (august 2026): alle ændringer her
// er OPTIMISTISKE. Afvises skrivningen, rulles ændringen tilbage på
// skærmen og brugeren får besked.
//
// OFFLINE-KØ (august 2026): ved NETVÆRKSFEJL beholdes ændringen på
// skærmen og lægges i kø (lib/offlineQueue.js). Køen husker, hvilken
// udgave ændringen byggede på, så en forsinket skrivning også fletter
// eller beder om et valg i stedet for at overskrive.
export function useOrders(storeId) {
  const [orders, setOrders] = useState([]);
  const [queuedCount, setQueuedCount] = useState(0);
  const flushingRef = useRef(false);
  const refreshingRef = useRef(false);

  // sagsId -> version / udgave, som vi sidst så den i databasen.
  const versionsRef = useRef(new Map());
  const baseRef = useRef(new Map());
  // sagsId -> antal igangværende skrivninger (så opdatering ikke overskriver dem).
  const pendingRef = useRef(new Map());
  // sagsId -> kæde af skrivninger, der udføres efter hinanden.
  const chainRef = useRef(new Map());
  const storeRef = useRef(storeId);
  storeRef.current = storeId;
  // Den SENESTE kendte liste. To ændringer i samme øjeblik (fx to hurtige
  // tryk, før skærmen er tegnet igen) skal bygge oven på hinanden i stedet
  // for begge at tage udgangspunkt i den samme, forældede skærmkopi - ellers
  // overskriver den anden den første, også uden nogen anden bruger involveret.
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  // ---------------- Små hjælpere ----------------

  // Har sagen en ændring, der endnu ikke er sikkert i databasen?
  const isPending = useCallback(
    (id) => (pendingRef.current.get(id) || 0) > 0 || !!getQueuedPost(id, storeRef.current),
    []
  );

  const replaceLocal = useCallback((order) => {
    setOrders((prev) => (prev.some((s) => s.id === order.id) ? prev.map((s) => (s.id === order.id ? order : s)) : [...prev, order]));
  }, []);

  const removeLocal = useCallback((id) => {
    versionsRef.current.delete(id);
    baseRef.current.delete(id);
    setOrders((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // Skærmen og vores "base" følger databasens udgave.
  const adoptServer = useCallback((id, version, data) => {
    versionsRef.current.set(id, version);
    baseRef.current.set(id, data);
    replaceLocal(data);
  }, [replaceLocal]);

  const runSerial = useCallback((id, fn) => {
    pendingRef.current.set(id, (pendingRef.current.get(id) || 0) + 1);
    const prev = chainRef.current.get(id) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn).finally(() => {
      const n = (pendingRef.current.get(id) || 1) - 1;
      if (n <= 0) pendingRef.current.delete(id); else pendingRef.current.set(id, n);
    });
    chainRef.current.set(id, next);
    next.catch(() => {}).finally(() => { if (chainRef.current.get(id) === next) chainRef.current.delete(id); });
    return next;
  }, []);

  // ---------------- Hentning ----------------

  const load = useCallback(async (id) => {
    if (!id) {
      versionsRef.current.clear();
      baseRef.current.clear();
      setOrders([]);
      return;
    }
    const res = await fetchAllOrders(id);
    // Kunne vi ikke hente, beholder vi det vi har - en tom skærm ved en
    // netværksfejl ville se ud som om alle sager var væk. Fejlen er logget,
    // og den løbende opdatering prøver igen.
    if (!res.ok || storeRef.current !== id) return;
    res.rows.forEach((r) => {
      if (pendingRef.current.get(r.id) > 0) return;
      versionsRef.current.set(r.id, r.version);
      baseRef.current.set(r.id, r.data);
    });
    setOrders((prev) => {
      const lokale = new Map(prev.map((o) => [o.id, o]));
      const ventende = (oid) => (pendingRef.current.get(oid) || 0) > 0 || !!getQueuedPost(oid, id);
      const next = res.rows.map((r) => (ventende(r.id) && lokale.has(r.id) ? lokale.get(r.id) : r.data));
      prev.forEach((o) => {
        if (ventende(o.id) && !res.rows.some((r) => r.id === o.id)) next.push(o);
      });
      return next;
    });
  }, []);

  useEffect(() => {
    versionsRef.current.clear();
    baseRef.current.clear();
    load(storeId);
  }, [storeId, load]);

  // Henter ANDRES ændringer løbende, uden at hente hele sagsbasen: først en
  // let liste (id + version), derefter kun de sager hvis version er ændret.
  // Sager med en ændring på vej (isPending) røres ikke.
  const refresh = useCallback(async () => {
    const sid = storeRef.current;
    if (!sid || refreshingRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    refreshingRef.current = true;
    try {
      const v = await fetchOrderVersions(sid);
      if (!v.ok || storeRef.current !== sid) return;
      const serverIds = new Set(v.rows.map((r) => r.id));
      const skalHentes = v.rows
        .filter((r) => !isPending(r.id) && versionsRef.current.get(r.id) !== r.version)
        .map((r) => r.id);
      // "Mangler i svaret" tolkes kun som "slettet", når svaret ikke er afkortet.
      const fjernede = v.rows.length >= MAKS_RAEKKER
        ? []
        : [...versionsRef.current.keys()].filter((id) => !serverIds.has(id));

      let nye = [];
      if (skalHentes.length > 0) {
        const f = await fetchOrdersByIds(sid, skalHentes);
        if (!f.ok || storeRef.current !== sid) return;
        nye = f.rows.filter((r) => !isPending(r.id));
      }
      const fjernSet = new Set(fjernede.filter((id) => !isPending(id)));
      if (nye.length === 0 && fjernSet.size === 0) return;

      nye.forEach((r) => { versionsRef.current.set(r.id, r.version); baseRef.current.set(r.id, r.data); });
      fjernSet.forEach((id) => { versionsRef.current.delete(id); baseRef.current.delete(id); });
      const nyMap = new Map(nye.map((r) => [r.id, r.data]));
      setOrders((prev) => {
        const next = prev.filter((o) => !fjernSet.has(o.id)).map((o) => (nyMap.has(o.id) ? nyMap.get(o.id) : o));
        nyMap.forEach((data, id) => { if (!next.some((o) => o.id === id)) next.push(data); });
        return next;
      });
    } finally {
      refreshingRef.current = false;
    }
  }, [isPending]);

  useEffect(() => {
    if (!storeId) return undefined;
    const iv = setInterval(refresh, 20000);
    const vedFokus = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", vedFokus);
    window.addEventListener("focus", refresh);
    // En sag gendannet fra papirkurven skal vises straks (se components/TrashPanel.jsx).
    window.addEventListener(ORDERS_CHANGED_EVENT, refresh);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", vedFokus);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(ORDERS_CHANGED_EVENT, refresh);
    };
  }, [storeId, refresh]);

  useEffect(() => subscribeQueue((k) => setQueuedCount(k.length)), []);

  // ---------------- Konflikter og sammenfletning ----------------

  // Parkerer brugerens ændring (den bevares) og lader skærmen følge
  // databasen. Brugeren får en tydelig besked via ConflictBanner.
  const parkConflict = useCallback((sid, order, base, serverVersion, serverData, keys, mineKeys) => {
    addConflict({
      storeId: sid, orderId: order.id, nr: serverData?.nr || order.nr || "",
      base, mine: order, theirs: serverData, theirsVersion: serverVersion, keys, mineKeys,
    });
    adoptServer(order.id, serverVersion, serverData);
  }, [adoptServer]);

  // Fletter vores ændring ind i databasens nyeste udgave og gemmer den.
  // Returnerer "saved" | "parked" | "queued" | "gone" | "error".
  const tryMergeAndSave = useCallback(async (sid, order, base, serverVersion, serverData, attempt = 0) => {
    const id = order.id;
    const { merged, conflicts, mineKeys } = mergeOrder(base, order, serverData);

    if (conflicts.length > 0) {
      parkConflict(sid, order, base, serverVersion, serverData, conflicts, mineKeys);
      return "parked";
    }
    // Intet at gemme, eller databasen har allerede præcis det samme.
    if (mineKeys.length === 0 || deepEqual(merged, serverData)) {
      adoptServer(id, serverVersion, serverData);
      return "saved";
    }

    const r = await saveOrderVersioned(sid, merged, serverVersion);
    if (r.status === "ok") {
      versionsRef.current.set(id, r.version);
      baseRef.current.set(id, merged);
      replaceLocal(merged);
      return "saved";
    }
    if (r.status === "conflict") {
      // Sagen blev ændret igen, mens vi fletter - prøv på ny mod den nyeste.
      if (attempt < 3) return tryMergeAndSave(sid, order, base, r.version, r.data, attempt + 1);
      parkConflict(sid, order, base, r.version, r.data, mineKeys, mineKeys);
      return "parked";
    }
    if (r.status === "network") {
      // Forbindelsen røg midt i det hele: behold den flettede udgave og læg den i kø.
      versionsRef.current.set(id, serverVersion);
      baseRef.current.set(id, serverData);
      const ok = enqueueOrder(sid, merged, { base: serverData, baseVersion: serverVersion, rebase: true });
      replaceLocal(merged);
      if (!ok) {
        reportSaveFailure("Ingen forbindelse, og ændringen kunne ikke gemmes midlertidigt på enheden. Prøv igen, når du har forbindelse.");
      }
      return "queued";
    }
    if (r.status === "not_found") {
      removeLocal(id);
      reportSaveFailure(`${serverData?.nr || order.nr ? `Sag ${serverData?.nr || order.nr}` : "Sagen"} findes ikke længere (den kan være slettet af en anden), så din ændring blev ikke gemt.`);
      return "gone";
    }
    adoptServer(id, serverVersion, serverData);
    reportSaveFailure(`Kunne ikke gemme ændringen: ${r.fejl || ""}`.trim());
    return "error";
  }, [parkConflict, adoptServer, replaceLocal, removeLocal]);

  // Gemmer ÉN sag mod databasen (kaldes altid via runSerial).
  const persist = useCallback(async (order, previous) => {
    const sid = storeRef.current;
    const id = order.id;
    const known = versionsRef.current.has(id);
    const expected = known ? versionsRef.current.get(id) : null;
    const base = baseRef.current.get(id) ?? null;
    const rulTilbage = () => (previous ? replaceLocal(previous) : removeLocal(id));

    const laegIKoe = () => {
      const ok = enqueueOrder(sid, order, { base, baseVersion: expected });
      if (!ok) {
        rulTilbage();
        reportSaveFailure("Ingen forbindelse, og ændringen kunne ikke gemmes midlertidigt på enheden. Prøv igen, når du har forbindelse.");
      }
    };

    // Ligger der allerede en ventende ændring på sagen, skal rækkefølgen bevares.
    if (getQueuedPost(id, sid) || (typeof navigator !== "undefined" && navigator.onLine === false)) {
      laegIKoe();
      return;
    }

    const r = await saveOrderVersioned(sid, order, expected);
    switch (r.status) {
      case "ok":
        versionsRef.current.set(id, r.version);
        baseRef.current.set(id, r.data || order);
        if (r.data) replaceLocal(r.data);
        return;
      case "network":
        laegIKoe();
        return;
      case "conflict":
        await tryMergeAndSave(sid, order, base, r.version, r.data, 0);
        return;
      case "exists": {
        const f = await fetchOrdersByIds(sid, [id]);
        const row = f.rows[0];
        if (row) await tryMergeAndSave(sid, order, null, row.version, row.data, 0);
        else { rulTilbage(); reportSaveFailure("Kunne ikke oprette sagen. Prøv igen."); }
        return;
      }
      case "not_found":
        removeLocal(id);
        reportSaveFailure(`${order.nr ? `Sag ${order.nr}` : "Sagen"} findes ikke længere (den kan være slettet af en anden), så din ændring blev ikke gemt.`);
        return;
      default:
        rulTilbage();
        reportSaveFailure(`Kunne ikke gemme ændringen: ${r.fejl || ""}`.trim());
    }
  }, [tryMergeAndSave, replaceLocal, removeLocal]);

  // Brugerens valg i ConflictBanner.
  //   "theirs": behold den andens version - vores parkerede ændring kasseres.
  //   "mine":   læg vores ændrede felter oven på den NYESTE udgave. Felter vi ikke
  //             rørte, forbliver som andre har sat dem.
  const resolveParked = useCallback((kid, valg) => {
    const c = getConflicts().find((x) => x.kid === kid);
    if (!c || c.storeId !== storeRef.current) return;
    if (valg === "theirs") { removeConflict(kid); return; }

    runSerial(c.orderId, async () => {
      const f = await fetchOrdersByIds(c.storeId, [c.orderId]);
      if (!f.ok) {
        reportSaveFailure("Ingen forbindelse – din ændring er ikke gemt endnu, men den ligger stadig og venter. Prøv igen, når du har forbindelse.");
        return;
      }
      let row = f.rows[0];
      if (!row) {
        reportSaveFailure(`Sag ${c.nr} findes ikke længere, så din ændring kan ikke gemmes. Du kan vælge at kassere den.`);
        return;
      }
      for (let forsoeg = 0; forsoeg < 3; forsoeg++) {
        const ud = applyMine(c.mine, row.data, c.mineKeys);
        const r = await saveOrderVersioned(c.storeId, ud, row.version);
        if (r.status === "ok") {
          removeConflict(kid);
          versionsRef.current.set(c.orderId, r.version);
          baseRef.current.set(c.orderId, ud);
          replaceLocal(ud);
          return;
        }
        if (r.status === "conflict") { row = { version: r.version, data: r.data }; continue; }
        reportSaveFailure(
          r.status === "network"
            ? "Ingen forbindelse – din ændring er ikke gemt endnu, men den ligger stadig og venter. Prøv igen, når du har forbindelse."
            : `Kunne ikke gemme ændringen: ${r.fejl || ""}`.trim()
        );
        return;
      }
      // Sagen blev ændret igen og igen, mens vi forsøgte. Vis de nyeste forskelle.
      updateConflict(kid, { theirs: row.data, theirsVersion: row.version, keys: mergeOrder(c.base, c.mine, row.data).conflicts });
      adoptServer(c.orderId, row.version, row.data);
      reportSaveFailure("Sagen blev ændret igen, mens du valgte. Se forskellene og vælg igen.");
    });
  }, [runSerial, replaceLocal, adoptServer]);

  useEffect(() => subscribeResolve(resolveParked), [resolveParked]);

  // ---------------- Offline-kø ----------------

  // Sender ÉN ventende ændring. Udføres i samme rækkefølge som brugerens egne
  // skrivninger på sagen (runSerial), og slår altid den NYESTE ventende post op.
  const processQueued = useCallback((snap) => runSerial(snap.id, async () => {
    const sid = storeRef.current;
    const post = getQueuedPost(snap.id, snap.storeId);
    if (!post || post.storeId !== sid) return "skip";
    if (typeof navigator !== "undefined" && navigator.onLine === false) return "network";

    const id = post.id;
    const fjern = () => removeFromQueue(id, post.storeId);
    const base = post.base ?? null;

    // Ældre post fra før versionering: vi ved ikke, hvilken udgave den byggede på.
    // Så sammenlignes med databasen, og enhver forskel parkeres frem for at overskrive.
    let expected = post.baseVersion;
    if (expected === undefined) {
      const f = await fetchOrdersByIds(sid, [id]);
      if (!f.ok) return f.netvaerk ? "network" : "error";
      const row = f.rows[0];
      if (row) {
        const udfald = await tryMergeAndSave(sid, post.order, null, row.version, row.data, 0);
        if (udfald === "queued") return "network";
        fjern();
        return "handled";
      }
      expected = null;
    }

    const r = await saveOrderVersioned(sid, post.order, expected);
    switch (r.status) {
      case "ok":
        fjern();
        versionsRef.current.set(id, r.version);
        baseRef.current.set(id, r.data || post.order);
        if (r.data) replaceLocal(r.data);
        return "ok";
      case "conflict": {
        const udfald = await tryMergeAndSave(sid, post.order, base, r.version, r.data, 0);
        if (udfald === "queued") return "network";
        fjern();
        return "handled";
      }
      case "exists": {
        const f = await fetchOrdersByIds(sid, [id]);
        const row = f.rows[0];
        if (!f.ok) return f.netvaerk ? "network" : "error";
        if (!row) return "error";
        const udfald = await tryMergeAndSave(sid, post.order, null, row.version, row.data, 0);
        if (udfald === "queued") return "network";
        fjern();
        return "handled";
      }
      case "not_found":
        fjern();
        removeLocal(id);
        reportSaveFailure(`En ændring på sag ${post.order?.nr || id} kunne ikke gemmes, fordi sagen ikke findes længere.`);
        return "handled";
      case "network":
        return "network";
      default:
        return "error";
    }
  }), [runSerial, tryMergeAndSave, replaceLocal, removeLocal]);

  // Sender køen. Kaldes ved "online", ved opstart, og hvert 30. sekund -
  // "online"-hændelsen er notorisk upålidelig på mobil, hvor telefonen kan
  // melde forbindelse længe før der reelt er hul igennem.
  const flush = useCallback(async () => {
    if (flushingRef.current || queueLength() === 0) return;
    flushingRef.current = true;
    try {
      const resultat = await flushQueue(processQueued, {
        onDropped: (post) =>
          reportSaveFailure(
            `En ændring på sag ${post.order?.nr || post.id} blev afvist af serveren flere gange og kunne ikke gemmes. Åbn sagen og indtast ændringen igen.`
          ),
      });
      // Hent andres ændringer, så skærmen viser det, der nu står i databasen.
      if (resultat.sendt > 0) await refresh();
    } finally {
      flushingRef.current = false;
    }
  }, [processQueued, refresh]);

  useEffect(() => {
    flush();
    window.addEventListener("online", flush);
    const iv = setInterval(flush, 30000);
    return () => { window.removeEventListener("online", flush); clearInterval(iv); };
  }, [flush]);

  // ---------------- Skrivninger ----------------

  // Gemmer ÉN ordre.
  //   ok       -> færdig
  //   netvaerk -> behold ændringen på skærmen, læg den i kø
  //   konflikt -> flet, eller park og spørg brugeren
  //   afvist   -> rul tilbage og fortæl hvorfor
  const saveOneOrder = (order) => {
    const previous = ordersRef.current.find((s) => s.id === order.id) || null;
    ordersRef.current = ordersRef.current.some((s) => s.id === order.id)
      ? ordersRef.current.map((s) => (s.id === order.id ? order : s))
      : [...ordersRef.current, order];
    setOrders((prev) => (prev.some((s) => s.id === order.id) ? prev.map((s) => (s.id === order.id ? order : s)) : [...prev, order]));
    if (!storeId) return;

    runSerial(order.id, () => persist(order, previous)).catch((e) => {
      if (previous) replaceLocal(previous); else removeLocal(order.id);
      reportSaveFailure(e?.message || "Ændringen blev ikke gemt.");
    });
  };

  const meldOprettelseFejlet = (r) => {
    reportSaveFailure(
      r.status === "network"
        ? "Ingen forbindelse – sagen blev ikke oprettet. Prøv igen, når du har forbindelse."
        : `Sagen blev ikke oprettet. ${r.fejl || ""}`.trim()
    );
  };

  // Opretter en ny ordre med et midlertidigt sagsnummer. Databasen tildeler
  // det ENDELIGE, garanteret unikke sagsnummer (assign_order_number-
  // triggeren), og save_order returnerer sagen med nummeret med det samme.
  //
  // BEVIDST IKKE KØET: sagsnummeret tildeles af databasen, og en køet
  // oprettelse ville stå med "..." som nummer i timevis.
  //
  // sagstype (september 2026): "kunde" eller "tomgang" - se
  // data/caseTypes.js. Felterne destruktureres EKSPLICIT her, så et felt
  // der ikke står på listen bliver tavst droppet; sagstype blev derfor
  // tilføjet både her OG i newOrder nedenfor. Standardværdien sikrer, at
  // sager oprettet ad andre veje (CSV-import) også har en type.
  //
  // bilId (september 2026) erstatter montorId - en sag tildeles nu en
  // BIL, ikke en person, se rebind_orders_to_vehicle_instead_of_person.
  //
  // senestDato (oktober 2026): en TOMGANG kan have en frist - den seneste dag, hvor den skal
  // være udført - i stedet for (eller ud over) en fast dato. Se lib/frist.js.
  const addOrder = async ({ sagstype, kunde, koeber, noegle, dato, tidsrumId, start, slut, bilId, senestDato, varelinjer, ordrenummer, createdBy }) => {
    if (!storeId) return;
    const newOrder = {
      id: uid(), nr: "...", ordrenummer: ordrenummer?.trim() || "",
      sagstype: sagstype || SAGSTYPE_KUNDE,
      kunde, koeber: koeber || null, noegle: noegle || {},
      dato: dato || null, tidsrumId: dato ? tidsrumId : null, start: dato ? start : null, slut: dato ? slut : null,
      bilId: bilId || null,
      senestDato: senestDato || null,
      status: "planlagt", plukket: false, varelinjer, noter: [], billeder: [], rapporter: [], materialer: [], stemplerInd: null, logs: [],
      oprettetAf: createdBy || null,
    };
    setOrders((prev) => [...prev, newOrder]);
    const r = await runSerial(newOrder.id, () => saveOrderVersioned(storeId, newOrder, null));
    if (r.status !== "ok") {
      setOrders((prev) => prev.filter((s) => s.id !== newOrder.id));
      meldOprettelseFejlet(r);
      return null;
    }
    const gemt = r.data || newOrder;
    versionsRef.current.set(newOrder.id, r.version);
    baseRef.current.set(newOrder.id, gemt);
    replaceLocal(gemt);
    return newOrder.id;
  };

  // Slår op i den seneste kendte liste (se ordersRef) - første parameter
  // bevares, så alle eksisterende kald fungerer uændret.
  const findOrder = (_orders, id) => ordersRef.current.find((x) => x.id === id);

  // SLETTER en sag - flytter den til PAPIRKURVEN (oktober 2026), så den kan
  // gendannes med noter, billeder og tid (se components/TrashPanel.jsx og
  // supabase/migrations/20261004_order_trash.sql). Kræver sag_slet (admin og
  // sælger har den) - håndhævet af databasen.
  // BEVIDST IKKE KØET OFFLINE: en sletning udført timer senere, hvor brugeren
  // for længst har glemt den, og en kollega måske har arbejdet videre på sagen,
  // er ikke en tjeneste.
  // Udføres efter evt. igangværende gem af samme sag (runSerial), så en rettelse
  // på vej ikke løber ind i en allerede slettet sag.
  const deleteOrder = async (orderId) => {
    if (!storeId) return false;
    const previous = findOrder(orders, orderId);
    if (!previous) return false;
    setOrders((prev) => prev.filter((s) => s.id !== orderId));
    const r = await runSerial(orderId, () => trashOrder(storeId, orderId));
    // "not_found": den er allerede væk (slettet af en anden) - samme resultat som ønsket.
    if (r.status !== "ok" && r.status !== "not_found") {
      setOrders((prev) => (prev.some((s) => s.id === orderId) ? prev : [...prev, previous]));
      reportSaveFailure(
        r.status === "network"
          ? "Ingen forbindelse – sagen blev ikke slettet. Prøv igen, når du har forbindelse."
          : `Sagen blev ikke slettet. ${r.fejl || ""}`.trim()
      );
      return false;
    }
    // En ventende offline-ændring på en slettet sag er ikke længere relevant.
    removeFromQueue(orderId, storeId);
    versionsRef.current.delete(orderId);
    baseRef.current.delete(orderId);
    return true;
  };

  // Opretter en ny sag ud fra en EKSISTERENDE (dupliker/opfølgning).
  // Dato, tidsrum og bil nulstilles bevidst - opfølgningen lander i
  // "Skal planlægges" og kan derfra få et rigtigt forslag.
  //
  // SAGSTYPEN FØLGER MED: en opfølgning på en tomgangskørsel er også en
  // tomgangskørsel - lejemålet er stadig tomt, og nøglen skal stadig
  // bruges. Uden dette ville opfølgningen stille og roligt blive til en
  // kundesag, og montøren ville stå uden adgang.
  //
  // OPFØLGNINGSTYPE (september 2026): special/reklamation/service - se
  // data/caseTypes.js. UAFHÆNGIG af sagstypen ovenfor (en reklamation kan
  // sagtens også være en tomgangskørsel). Valgt af brugeren i
  // DuplicatePanel (OrderView.jsx) - ikke sat på den oprindelige sag, kun
  // på den NYE opfølgningssag, for den beskriver netop DENNE returtur.
  const duplicateOrder = async (sourceOrder, selectedLineItems, createdBy, followUpType) => {
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
      opfoelgningsType: followUpType || null,
      kunde: { ...sourceOrder.kunde },
      koeber: sourceOrder.koeber ? { ...sourceOrder.koeber } : null,
      noegle: sourceOrder.noegle ? { ...sourceOrder.noegle } : {},
      dato: null, tidsrumId: null, start: null, slut: null, bilId: null,
      status: "planlagt", plukket: false, varelinjer: clonedLineItems,
      noter: [], billeder: [], rapporter: [], materialer: [], stemplerInd: null, logs: [],
      oprettetAf: createdBy || null,
      opfoelgningAf: sourceOrder.id,
    };
    setOrders((prev) => [...prev, newOrder]);
    const r = await runSerial(newOrder.id, () => saveOrderVersioned(storeId, newOrder, null));
    if (r.status !== "ok") {
      setOrders((prev) => prev.filter((s) => s.id !== newOrder.id));
      meldOprettelseFejlet(r);
      return null;
    }
    const gemt = r.data || newOrder;
    versionsRef.current.set(newOrder.id, r.version);
    baseRef.current.set(newOrder.id, gemt);
    replaceLocal(gemt);

    const freshSource = findOrder(orders, sourceOrder.id) || sourceOrder;
    saveOneOrder({
      ...freshSource,
      harOpfoelgning: newOrder.id,
      notifikationSet: { ...(freshSource.notifikationSet || {}), opfoelgning: false },
    });

    return newOrder.id;
  };

  const updateBooking = (id, fields) => { const s = findOrder(orders, id); if (s) saveOneOrder({ ...s, ...fields }); };

  const importOrders = (newOrders) => newOrders.forEach((s) => saveOneOrder(s));

  // Tildeler sagen til en BIL (september 2026, erstatter assignTechnician/
  // montorId - se rebind_orders_to_vehicle_instead_of_person). Navnet på
  // funktionen er ændret for at gøre det tydeligt i resten af kodebasen,
  // at det er en bil, der tildeles, ikke en bestemt person.
  const assignVehicle = (orderId, vehicleId) => { const s = findOrder(orders, orderId); if (s) saveOneOrder({ ...s, bilId: vehicleId }); };
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

  // ---------------- POS-synkronisering ved færdigmelding (september 2026) ----------------
  // Fakturering + lagerudlevering hos Flow Retail, hvis integrationen er
  // sat op for butikken (se pos-integration Edge Function og
  // lib/dataStore.js: syncPosOnFinish). Skriver ALTID sit resultat (også
  // en fejl) på sagens posStatus-felt - direkte i databasen fra Edge
  // Function'en - og vi henter samme resultat her, så en evt. fejl-banner
  // (se OrderView.jsx) kan vises med det samme uden at vente på en
  // side-genindlæsning.
  //
  // BEVIDST ASYNKRON I FORHOLD TIL FÆRDIGMELDINGEN: selve montørarbejdet
  // (status -> afsluttet) må ALDRIG blokeres eller rulles tilbage af en
  // POS-fejl - montøren har rent faktisk udført opgaven, uanset om
  // fakturaen går igennem. Fejlen skal være synlig og handles separat,
  // ikke forhindre, at sagen kan færdigmeldes.
  //
  // Funktionen skriver posStatus direkte i databasen, hvilket tæller
  // sagens versionsnummer op. Derfor hentes de nyeste versioner bagefter
  // (refresh), så vores næste gem ikke bygger på en forældet udgave.
  //
  // SLÅET FRA (oktober 2026): POS-synkroniseringen er endnu ikke en aktiv del af integrationen (Flow
  // Retails API er ikke koblet på), så den kører ikke ved færdigmelding. Adapteren (adapters/pos) laver
  // da intet kald og skriver ingen status - og sagen får hverken en fejl-banner eller en tom
  // posStatus. Slås til ét sted: kapabiliteter.synkVedAfslutning i adapters/index.js.
  const runPosSync = (orderId) => {
    if (!storeId) return;
    pos.synkVedAfslutning({ storeId, orderId }).then((result) => {
      if (result.sprunget) return;
      if (result.posStatus) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, posStatus: result.posStatus } : o)));
      } else if (!result.ok) {
        reportSaveFailure(`POS-synkroniseringen ved færdigmelding kunne ikke gennemføres: ${result.fejl || ""}`.trim());
      }
      refresh();
    });
  };

  // Kan kaldes igen manuelt fra en fejl-banner (se OrderView.jsx), uden at
  // skulle genåbne/genfærdigmelde sagen - fejlen kan jo rette sig af sig
  // selv (fx nøglen bliver sat, eller Flow Retail er tilbage), og det skal
  // ikke kræve en tur gennem "Genåbn sag" og "Færdigmeld" igen.
  const retryPosSync = (orderId) => runPosSync(orderId);

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
    runPosSync(orderId);
  };

  // Fortryd færdigmelding. Rydder sluttidspunktet, så en genåbnet sag ikke
  // bidrager med en falsk varighed til estimaterne.
  const reopenOrder = (orderId) => {
    const s = findOrder(orders, orderId);
    if (!s) return;
    saveOneOrder({ ...s, status: "igang", afsluttetTidspunkt: null });
  };

  // Ændrer besøgs-RÆKKEFØLGEN for sager hos samme BIL, samme dag.
  const reorderOrder = (vehicleId, date, orderId, direction) => {
    const group = orders
      .filter((o) => o.bilId === vehicleId && o.dato === date && o.status !== "afsluttet")
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

  const setVisitOrder = (vehicleId, date, orderedIds) => {
    orderedIds.forEach((id, i) => {
      const o = findOrder(orders, id);
      if (o && o.bilId === vehicleId && o.dato === date && o.raekkefolge !== i) {
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
    // TIDEN SÆTTES PÅ PAUSE (oktober 2026): kører opgaven, lukkes den kørende periode, så tiden ikke
    // fortsætter, mens opgaven ikke kommer i mål. Genoptages den (Start/Genoptag), starter en ny
    // periode. Se lib/opgaveTid.js.
    saveOneOrder({
      ...s,
      ...pausePatch(s, new Date().toISOString(), uid()),
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
    assignVehicle, updateTimeSlot, reorderOrder, setVisitOrder, toggleLineItemPicked,
    startOrder, finishOrder, reopenOrder, retryPosSync,
    setLineItems, updateLineItem, addLineItem, removeLineItem,
    reportMissingItem, clearMissingItem,
    addNote, addPhoto, addReport,
    toggleAddOn, addAddOn, removeAddOn,
    addMaterial, removeMaterial,
    markProblem, clearProblem, dismissNotifications,
    queuedCount,
    reload: () => load(storeId),
    refresh,
  };
}
