import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, PlayCircle, Search, Sparkles, UserX, X, RefreshCw, KeyRound, Clock, Check, CheckCheck, Car, Loader2, Building2, LayoutGrid, MapPin, Phone, Route, Stethoscope, CalendarX2, AlertTriangle } from "lucide-react";
import { orderExpectedMinutes, todayISO, addDays, weekDays, buildTitle, isToday, formatLongDate, formatShortDate, formatDuration, technicianColor, dailyOrderCompare, needsPlanning, activeSickLeave, buildingKey, timeSlotById } from "../data/domain";
import { geocodeAddress, geocodeAddresses, drivingDistances, routeDrivingTime, optimalVisitOrder } from "../lib/geocoding";
import { suggestPlan, planningWindow, WORKDAY_MINUTES } from "../lib/scheduling";
import { DateSelector } from "../components/common";
import { OrderCardCompact } from "../components/OrderCardCompact";

// ---------------------------------------------------------------------------
// Planlægning + Kørsel er fusioneret til ÉN fane (august 2026). Siden er
// bygget med ÉT primært formål for øje: gøre det hurtigt at få OVERBLIK
// over ugen og OMFORDELE sager, når en montør bliver syg, eller et besøg
// var forgæves.
//
// OVERBLIKKET ER OMBYGGET (august 2026, efter direkte feedback fra test):
// KOLONNER = ugedage (mandag-fredag - bevidst ikke lørdag/søndag, se
// WeekOverview), og INDEN I hver dag-kolonne er sagerne grupperet pr.
// montør/bil, tydeligt visuelt adskilt (farvet venstre-kant + navn), i den
// rækkefølge sagerne reelt ligger i montørens rute (dailyOrderCompare).
// Det er den modsatte akse af den oprindelige udgave (montør som RÆKKE,
// dag som KOLONNE), som viste sig uoverskuelig i praksis.
//
// "KRÆVER HANDLING" ER FIRE "dashboard-fliser" - kun ÉN kan være foldet ud
// ad gangen:
//   1. Montørproblem  - montøren findes ikke længere, bilen er blokeret,
//                        eller montøren har fravær/ferie den dag
//   2. Sygemelding     - sager for en AKTIVT sygemeldt montør, inden for
//                        butikkens eget tidsvindue (se Admin)
//   3. Skal planlægges - mangler dato ELLER montør (IKKE "dato passeret" -
//                        er den passeret uden et markeret problem, antages
//                        sagen gennemført, se needsPlanning i domain.js)
//   4. Uafsluttet/fejl - sagen er markeret med et PROBLEM af montøren,
//                        uafhængigt af selve status-tagget
// Tile 1-3 bruger ALLE samme forslagsmotor (suggestPlan, lib/scheduling.js)
// - INGEN AI. RETTET (august 2026, fejl fundet ved test): forslagsmotoren
// kunne tidligere "foreslå" ingen montør overhovedet, hvilket ikke løser
// noget - se requireTechnician i scheduling.js. Tile 4 har bevidst intet
// forslag - det kræver en menneskelig opfølgning.
// ---------------------------------------------------------------------------

// RETTET (august 2026): FERIE blev slet ikke fanget her. En sag tildelt en
// montør, der holder ferie den pågældende dag, landede i INGEN af
// "kræver handling"-fliserne - den blev kun vist med et lille
// "Fraværende"-mærke i ugeoverblikket, hvis nogen huskede at kigge.
// Sygdom var dækket (egen flise), bilen ude af drift var dækket, men
// ferie - den ENESTE af de tre, man kender uger i forvejen og derfor
// burde kunne planlægge sig ud af i god tid - faldt igennem.
//
// Sygdom holdes bevidst UDE her: den har sin egen flise med sit eget
// tidsvindue, og en sag skal ikke optræde to steder.
function technicianIssue(order, technicians, vehicles, timeOff) {
  if (!order.montorId) return null;
  const technician = technicians.find((m) => m.id === order.montorId);
  if (!technician) return "Montøren findes ikke længere";
  if (technician.bilId) {
    const vehicle = (vehicles || []).find((v) => v.id === technician.bilId);
    if (vehicle?.lukket) return "Montørens bil er ude af drift";
  }
  if (order.dato) {
    const fravaer = (timeOff || []).find((f) =>
      f.montorId === order.montorId &&
      (f.type || "ferie") !== "sygdom" &&
      order.dato >= f.startDato &&
      (!f.slutDato || order.dato <= f.slutDato)
    );
    if (fravaer) return "Montøren har fravær/ferie denne dag";
  }
  return null;
}

// Fordeler sagerne i de fire (gensidigt udelukkende, prioriteret i denne
// rækkefølge) kategorier + de almindelige lister (i gang i dag/planlagt
// fremad/afsluttet). "Uafsluttet/fejlrapporter" er IKKE gensidigt
// udelukkende med de øvrige - en sag kan sagtens optræde der OG i fx
// "Skal planlægges" samtidig, da problem-markeringen er uafhængig af
// resten (se domain.js). Eksporteres (august 2026) så DashboardPage kan
// genbruge samme klassificering til "Kræver handling"-widgeten.
function classify(orders, technicians, vehicles, timeOff, windowHours) {
  const today = todayISO();
  const windowDays = Math.max(1, Math.ceil((windowHours || 48) / 24));
  const windowEnd = addDays(today, windowDays);

  const technicianProblem = [];
  const sickLeave = [];
  const needsPlan = [];
  const inProgressToday = [];
  const upcoming = [];
  const done = [];
  const unresolved = orders.filter((s) => !!s.problem);

  for (const s of orders) {
    if (s.status === "afsluttet") { done.push(s); continue; }

    // Sygdom tjekkes FØR de øvrige montørproblemer: den har sin egen
    // flise med butikkens eget tidsvindue, og skal ikke opsluges af den
    // bredere "montørproblem"-kategori.
    if (s.montorId && s.dato) {
      const sick = activeSickLeave(s.montorId, timeOff);
      if (sick && s.dato <= windowEnd) { sickLeave.push({ ...s, _sygemelding: sick }); continue; }
    }

    const issue = s.montorId ? technicianIssue(s, technicians, vehicles, timeOff) : null;
    if (issue) { technicianProblem.push({ ...s, _issue: issue }); continue; }

    if (needsPlanning(s)) { needsPlan.push(s); continue; }

    if (s.status === "igang" && s.dato === today) { inProgressToday.push(s); continue; }
    upcoming.push(s);
  }

  const sortByDate = (a, b) => (a.dato || "9999").localeCompare(b.dato || "9999") || (a.start || "").localeCompare(b.start || "");
  technicianProblem.sort(sortByDate);
  sickLeave.sort(sortByDate);
  needsPlan.sort(sortByDate);
  inProgressToday.sort(sortByDate);
  upcoming.sort(sortByDate);
  unresolved.sort((a, b) => (b.problem?.tid || "").localeCompare(a.problem?.tid || ""));
  done.sort((a, b) => (b.dato || "").localeCompare(a.dato || ""));

  return { technicianProblem, sickLeave, needsPlan, unresolved, inProgressToday, upcoming, done };
}

const norm = (s) => (s || "").toString().toLowerCase();
function matchesSearch(order, search) {
  const s = norm(search);
  if (!s) return true;
  return (
    norm(order.nr).includes(s) ||
    norm(order.ordrenummer).includes(s) ||
    norm(order.kunde?.navn).includes(s) ||
    norm(order.kunde?.telefon).replace(/\s/g, "").includes(s.replace(/\s/g, "")) ||
    norm(order.kunde?.adresse).includes(s)
  );
}

// ---------------- Ét kort pr. sag i en "skal handles"-flise ----------------
// Viser ALTID de manuelle dato/montør-vælgere (fuld kontrol bevaret), PLUS
// et automatisk beregnet forslag (hvis der er ét), som kan anvendes med ét
// klik. Forslaget beregnes af den kaldende flise (ReplanTile), ikke her.
//
// Årsagen til at sagen er havnet her (_issue) vises nu eksplicit: en
// planlægger, der åbner "Montørproblem", skal kunne se HVILKET problem
// hver enkelt sag har - "bilen er ude af drift" og "montøren har ferie"
// kræver forskellige beslutninger.
function ReplanCard({ order, technicians, suggestion, loadingSuggestion, onApplySuggestion, onManualChange, onOpen }) {
  return (
    <div className="rounded-lg bg-white border border-line p-3 mb-2 last:mb-0 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <button onClick={() => onOpen(order.id)} className="text-left min-w-0 flex-1 hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-brand rounded">
          <p className="text-sm font-semibold text-ink truncate">{order.kunde?.navn || "Ukendt kunde"} <span className="font-mono text-[11px] text-muted">#{order.nr}</span></p>
          <p className="text-xs text-muted truncate">{buildTitle(order.varelinjer)}</p>
        </button>
        <span className="text-[11px] font-mono text-muted shrink-0 pt-0.5">{order.dato ? formatShortDate(order.dato) : "ingen dato"}</span>
      </div>

      {order._issue && (
        <p className="text-[11px] text-danger flex items-center gap-1 mb-1.5"><AlertCircle size={11} className="shrink-0" aria-hidden="true" /> {order._issue}</p>
      )}

      {loadingSuggestion ? (
        <p className="text-[11px] text-muted flex items-center gap-1.5 mb-2"><Loader2 size={11} className="animate-spin shrink-0" aria-hidden="true" /> Beregner forslag...</p>
      ) : suggestion ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-panel px-2.5 py-1.5 mb-2">
          <p className="text-xs text-ink min-w-0 truncate">
            <span className="font-semibold">{formatShortDate(suggestion.dato)}</span>
            {suggestion.montorNavn && ` · ${suggestion.montorNavn}`}
            <span className="text-muted"> — {suggestion.begrundelse}</span>
          </p>
          <button onClick={() => onApplySuggestion(order, suggestion)} className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors rounded-lg px-3 py-2 flex items-center gap-1"><Check size={11} aria-hidden="true" /> Brug</button>
        </div>
      ) : (
        <p className="text-[11px] text-muted italic mb-2">Intet forslag med en ledig montør fundet inden for de næste 14 dage — tildel manuelt nedenfor.</p>
      )}

      <div className="flex gap-1.5 flex-wrap">
        <input
          type="date"
          value={order.dato || ""}
          onChange={(e) => onManualChange(order.id, { dato: e.target.value || null })}
          aria-label={`Dato for sag ${order.nr}`}
          className="rounded-lg border border-line bg-panel px-2 py-2 text-xs text-ink font-mono focus:outline-none focus:border-brand"
        />
        <select
          value={order.montorId || ""}
          onChange={(e) => onManualChange(order.id, { montorId: e.target.value || null })}
          aria-label={`Montør for sag ${order.nr}`}
          className="flex-1 min-w-[100px] rounded-lg border border-line bg-panel px-2 py-2 text-xs text-ink focus:outline-none focus:border-brand"
        >
          <option value="">Ikke tildelt</option>
          {technicians.map((m) => <option key={m.id} value={m.id}>{m.navn}</option>)}
        </select>
      </div>
    </div>
  );
}

// ---------------- Fliens indhold: liste + automatisk beregnede forslag ----------------
// excludeTechnicianIds: enten et fast array, eller en funktion pr. sag
// (fx "udeluk den montør DENNE sag selv er ramt af problemet med").
function ReplanTile({ items, orders, technicians, timeOff, excludeTechnicianIds, onUpdateBooking, onOpen }) {
  const [suggestions, setSuggestions] = useState({});
  const [loading, setLoading] = useState(false);
  const key = items.map((o) => o.id).join(",");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (items.length === 0) { setSuggestions({}); return; }
      setLoading(true);
      const dates = planningWindow(todayISO(), 14);
      const results = {};
      for (const order of items) {
        if (!order.kunde?.adresse) continue;
        const windowOrders = orders.filter((o) => o.id !== order.id && dates.includes(o.dato) && o.kunde?.adresse);
        const bkey = buildingKey(order.kunde.adresse);
        const sameBuildingDates = bkey ? [...new Set(windowOrders.filter((o) => buildingKey(o.kunde.adresse) === bkey).map((o) => o.dato))] : [];
        let nearbyDates = [];
        try {
          const source = await geocodeAddress(order.kunde.adresse);
          if (source && windowOrders.length > 0) {
            const coordMap = await geocodeAddresses(windowOrders.map((o) => o.kunde.adresse));
            const withCoords = windowOrders
              .map((o) => ({ o, coord: coordMap.get(o.kunde.adresse.trim().toLowerCase()) }))
              .filter((x) => x.coord);
            if (withCoords.length > 0) {
              const distances = await drivingDistances(source, withCoords.map((x) => x.coord));
              nearbyDates = withCoords
                .map((x, i) => ({ dato: x.o.dato, km: distances[i] != null ? distances[i] / 1000 : null }))
                .filter((x) => x.km != null && x.km <= 5)
                .map((x) => ({ dato: x.dato, km: Math.round(x.km * 10) / 10 }));
            }
          }
        } catch (_) { /* stille - resten af forslaget bygger stadig på kapacitet/samme opgang */ }

        const exclude = typeof excludeTechnicianIds === "function" ? excludeTechnicianIds(order) : excludeTechnicianIds;
        // requireTechnician: true - se scheduling.js. Et forslag der ikke
        // rent faktisk tildeler en montør er ikke en løsning her.
        //
        // orderMinutes (august 2026): sagens EGEN forventede varighed
        // sendes med, så en dag der allerede har 7 timer booket ikke
        // foreslås til en 5-timers opgave. Uden den så motoren kun på
        // hvad der lå der i forvejen, og kunne fylde en dag langt over
        // arbejdsdagens længde.
        const plan = suggestPlan({ dates, orders, technicians, timeOff, sameBuildingDates, nearbyDates, excludeTechnicianIds: exclude, originalDate: order.dato || null, requireTechnician: true, orderMinutes: orderExpectedMinutes(order) });
        if (plan[0] && !cancelled) results[order.id] = plan[0];
      }
      if (!cancelled) { setSuggestions(results); setLoading(false); }
    };
    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const applySuggestion = (order, s) => {
    const t = timeSlotById("heldag");
    onUpdateBooking(order.id, { dato: s.dato, tidsrumId: order.tidsrumId || "heldag", start: order.start || t.start, slut: order.slut || t.slut, montorId: s.montorId });
  };

  return (
    <div>
      {items.map((o) => (
        <ReplanCard
          key={o.id}
          order={o}
          technicians={technicians}
          suggestion={suggestions[o.id]}
          loadingSuggestion={loading && !suggestions[o.id]}
          onApplySuggestion={applySuggestion}
          onManualChange={onUpdateBooking}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

// ---------------- Flise 4: Uafsluttet / fejlrapporter - ingen forslag ----------------
function UnresolvedTile({ items, onClearProblem, onOpen }) {
  return (
    <div>
      {items.map((o) => (
        <div key={o.id} className="rounded-lg bg-white border border-danger p-3 mb-2 last:mb-0 shadow-sm">
          <div className="flex items-start justify-between gap-2 mb-1">
            <button onClick={() => onOpen(o.id)} className="text-left min-w-0 flex-1 hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-brand rounded">
              <p className="text-sm font-semibold text-ink truncate">{o.kunde?.navn || "Ukendt kunde"} <span className="font-mono text-[11px] text-muted">#{o.nr}</span></p>
              <p className="text-xs text-muted truncate">{buildTitle(o.varelinjer)}</p>
            </button>
            <span className="text-[11px] font-mono text-muted shrink-0 pt-0.5">{o.dato ? formatShortDate(o.dato) : "ingen dato"}</span>
          </div>
          <p className="text-xs text-danger flex items-start gap-1.5 mb-2"><AlertTriangle size={13} className="shrink-0 mt-0.5" aria-hidden="true" /> {o.problem?.note} <span className="text-muted shrink-0">· {o.problem?.tid}</span></p>
          <button onClick={() => onClearProblem(o.id)} className="text-[11px] font-semibold uppercase tracking-wide text-danger underline hover:no-underline focus:outline-none focus:ring-2 focus:ring-danger rounded px-1 py-2">Marker som løst</button>
        </div>
      ))}
    </div>
  );
}

// ---------------- Selve flise-knappen (lukket tilstand) ----------------
function TileButton({ icon: Icon, color, count, label, selected, onClick }) {
  return (
    <button onClick={onClick} aria-pressed={selected} className="rounded-xl border-2 p-3 text-left transition-colors bg-white hover:bg-panel focus:outline-none focus:ring-2 focus:ring-brand" style={{ borderColor: selected ? color : "#ECECEC" }}>
      <div className="flex items-center justify-between mb-1.5">
        <Icon size={16} style={{ color }} className="shrink-0" aria-hidden="true" />
        <span className="text-2xl font-display leading-none" style={{ color: count > 0 ? color : "#C9C2AE" }}>{count}</span>
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink leading-tight">{label}</p>
    </button>
  );
}

function CollapsibleSection({ title, icon: Icon, colorClass, items, technicians, onOpen, onCycleStatus, emptyText }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-line bg-white overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full p-3 flex items-center gap-2 text-left focus:outline-none focus:ring-2 focus:ring-brand">
        <Icon size={15} className={`shrink-0 ${colorClass}`} aria-hidden="true" />
        <span className="text-sm font-semibold uppercase tracking-wide text-ink flex-1">{title}</span>
        <span className="text-xs font-mono px-1.5 py-0.5 rounded-full border border-line text-muted">{items.length}</span>
        <ChevronDown size={16} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="p-3 pt-0 grid gap-2 sm:grid-cols-2">
          {items.length === 0 ? (
            <p className="text-xs text-muted italic pt-2">{emptyText}</p>
          ) : (
            items.map((s) => <OrderCardCompact key={s.id} order={s} technicians={technicians} onOpen={onOpen} onCycleStatus={onCycleStatus} />)
          )}
        </div>
      )}
    </div>
  );
}

// WORKDAY_MINUTES importeres nu fra lib/scheduling.js (rettet august
// 2026). Den var defineret HER OGSÅ, med samme værdi - så en ændring af
// arbejdsdagens længde ét sted ville give en app, hvor forslagsmotoren og
// overbelastnings-markeringen var uenige om, hvornår en dag er fuld.
function hoursLabel(minutes) {
  if (minutes === 0) return "–";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}t${m}m` : `${h}t`;
}
function shortDayLabel(iso) { return new Date(iso + "T00:00:00").toLocaleDateString("da-DK", { weekday: "short" }); }
function shortDateLabel(iso) { return new Date(iso + "T00:00:00").toLocaleDateString("da-DK", { day: "numeric", month: "short" }); }

// ---------------- Overblik: ugekalender med kort og omfordeling ----------------
// RETTET (august 2026): selve sagskortet var et <div onClick>. Det kan
// ikke nås med tastatur, får ingen fokusmarkering, og en skærmlæser
// fortæller ikke, at det kan trykkes. Det er nu en rigtig <button> med
// venstrestillet tekst - samme udseende, men brugbar uden mus.
function MiniOrderCard({ order, onOpen, onAssign, technicians, currentTechnicianId, color, onLeave, onMoveUp, onMoveDown, canMoveUp, canMoveDown }) {
  return (
    <div
      className="rounded-lg bg-white border border-line hover:shadow-sm transition-shadow px-2.5 py-2 mb-1.5 last:mb-0"
      style={{ borderLeftWidth: 3, borderLeftColor: color }}
    >
      <div className="flex items-start gap-1.5">
        {(onMoveUp || onMoveDown) && (
          <div className="flex flex-col shrink-0 -ml-1 -mt-0.5">
            <button onClick={(e) => { e.stopPropagation(); onMoveUp(); }} disabled={!canMoveUp} aria-label="Flyt tidligere i ruten" className="p-2 rounded text-muted hover:text-brand disabled:opacity-20 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-brand" title="Flyt tidligere i ruten">
              <ChevronUp size={14} aria-hidden="true" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onMoveDown(); }} disabled={!canMoveDown} aria-label="Flyt senere i ruten" className="p-2 rounded text-muted hover:text-brand disabled:opacity-20 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-brand" title="Flyt senere i ruten">
              <ChevronDown size={14} aria-hidden="true" />
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => onOpen(order.id)}
          className="text-left min-w-0 flex-1 focus:outline-none focus:ring-2 focus:ring-brand rounded"
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-mono text-muted">{order.start}–{order.slut}</span>
            {order.noegle?.kraeves && <KeyRound size={10} className="text-brand shrink-0" aria-label="Nøgle/adgang kræves" />}
          </div>
          <p className="text-sm font-semibold text-ink truncate">{order.kunde?.navn}</p>
          <p className="text-xs text-muted truncate">{buildTitle(order.varelinjer)}</p>
          {order.kunde?.adresse && (
            <p className="text-[11px] text-muted truncate flex items-center gap-1">
              <MapPin size={10} className="shrink-0" aria-hidden="true" /> {order.kunde.adresse}
            </p>
          )}
          {order.kunde?.telefon && (
            <p className="text-[11px] text-muted truncate flex items-center gap-1">
              <Phone size={10} className="shrink-0" aria-hidden="true" /> {order.kunde.telefon}
            </p>
          )}
        </button>
      </div>
      <select
        value={currentTechnicianId || ""}
        onChange={(e) => onAssign(order.id, e.target.value || null)}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Montør for ${order.kunde?.navn || "sagen"}`}
        className={`w-full mt-1.5 rounded-md border px-1.5 py-2 text-[11px] focus:outline-none focus:ring-2 focus:ring-brand ${onLeave ? "border-danger text-danger font-semibold" : "border-line bg-panel text-muted focus:border-brand"}`}
      >
        <option value="">Ikke tildelt</option>
        {technicians.map((m) => <option key={m.id} value={m.id}>{m.navn}</option>)}
      </select>
    </div>
  );
}

function DayTimeBadge({ minutes, overloaded, loading }) {
  return (
    <span className={`text-[11px] font-bold rounded-md px-2 py-0.5 flex items-center gap-1 shrink-0 ${overloaded ? "bg-danger text-white" : "bg-panel text-ink"}`}>
      {loading ? <Loader2 size={11} className="animate-spin shrink-0" aria-hidden="true" /> : null}
      {loading ? "beregner..." : hoursLabel(minutes)}
    </span>
  );
}

// ÉT teknikersegment inden for én dag-kolonne: farvet venstre-kant + navn
// tydeligt adskiller det fra næste montørs sager i samme kolonne. Bruges
// BÅDE i mobil- og pc-udgaven (kun selve kolonne-strukturen omkring det er
// forskellig).
function TechnicianDaySection({ row, day, dayOrders, technicians, onOpen, onAssign, onReorder, onSetVisitOrder, isOnLeave, timeInfo, optimizing, onOptimize }) {
  const color = row.id ? technicianColor(row.id, technicians) : "#C8232E";
  const optKey = `${row.id}|${day}`;
  return (
    <div style={{ borderLeft: `3px solid ${color}` }} className="pl-2">
      <div className="flex items-center justify-between gap-1 mb-1">
        <p className="text-xs font-semibold truncate min-w-0" style={{ color }}>{row.navn}</p>
        <div className="flex items-center gap-1 shrink-0">
          {row.id && dayOrders.length >= 2 && onSetVisitOrder && (
            <button onClick={() => onOptimize(row.id, day, dayOrders)} disabled={optimizing[optKey]} aria-label={`Foreslå bedste besøgsrækkefølge for ${row.navn}`} className="p-2 rounded text-muted hover:text-brand disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-brand" title="Foreslå bedste besøgsrækkefølge">
              {optimizing[optKey] ? <Loader2 size={11} className="animate-spin" aria-hidden="true" /> : <Route size={11} aria-hidden="true" />}
            </button>
          )}
          {row.id && timeInfo.loadMinutes > 0 && <DayTimeBadge minutes={timeInfo.total} overloaded={timeInfo.overloaded} loading={timeInfo.stillLoading} />}
        </div>
      </div>
      {isOnLeave && <p className="text-[10px] font-semibold uppercase tracking-wide text-danger mb-1 flex items-center gap-0.5"><AlertCircle size={9} aria-hidden="true" /> Fraværende</p>}
      {dayOrders.map((o, i) => (
        <MiniOrderCard
          key={o.id}
          order={o}
          onOpen={onOpen}
          onAssign={onAssign}
          technicians={technicians}
          currentTechnicianId={row.id}
          color={color}
          onLeave={isOnLeave}
          onMoveUp={row.id && onReorder ? () => onReorder(row.id, day, o.id, -1) : undefined}
          onMoveDown={row.id && onReorder ? () => onReorder(row.id, day, o.id, 1) : undefined}
          canMoveUp={i > 0}
          canMoveDown={i < dayOrders.length - 1}
        />
      ))}
    </div>
  );
}

// KOLONNER = ugedage (mandag-fredag, bevidst IKKE lørdag/søndag - de
// fleste sager ligger på hverdage, og fem faste kolonner giver et
// forudsigeligt, roligt layout uden vagt "6-7 kolonner afhængig af uge").
// INDEN I hver dag-kolonne grupperes sagerne pr. montør/bil (TekniskerDay-
// Section ovenfor), i deres rigtige rækkefølge (dailyOrderCompare) - det
// er den akse, der rent faktisk giver overblik: "hvad sker der på tirsdag"
// er et langt hyppigere spørgsmål end "hvad laver Jens hele ugen".
//
// MOBIL har sin egen udgave: dag-faner øverst + montør-sektionerne stablet
// under hinanden. Fem kolonner ved siden af hinanden på en telefonskærm
// ville give kort på under 70 px bredde - ulæselige og umulige at ramme.
function WeekOverview({ orders, technicians, timeOff, store, onAssign, onReorder, onSetVisitOrder, onOpen }) {
  const [open, setOpen] = useState(true);
  const [weekAnchor, setWeekAnchor] = useState(todayISO());
  const [selectedDay, setSelectedDay] = useState(todayISO());
  const [driveMinutes, setDriveMinutes] = useState({});
  const [driveLoading, setDriveLoading] = useState(false);
  const [optimizing, setOptimizing] = useState({});

  const weekdays5 = weekDays(weekAnchor).slice(0, 5); // mandag-fredag
  const today = todayISO();
  const rows = [...technicians, { id: null, navn: "Ikke tildelt" }];

  useEffect(() => {
    if (!weekdays5.includes(selectedDay)) setSelectedDay(weekdays5[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekAnchor]);

  const weekOrders = orders.filter((o) => weekdays5.includes(o.dato) && o.status !== "afsluttet");
  const unassignedThisWeek = weekOrders.filter((o) => !o.montorId).length;

  const ordersFor = (technicianId, day) =>
    orders.filter((o) => o.montorId === technicianId && o.dato === day && o.status !== "afsluttet").sort(dailyOrderCompare);

  const isOnLeave = (technicianId, day) => !!technicianId && (timeOff || []).some((f) => f.montorId === technicianId && day >= f.startDato && (!f.slutDato || day <= f.slutDato));

  const storeCoord = store?.lat != null && store?.lon != null ? { lat: store.lat, lon: store.lon } : null;
  const minStopsForEstimate = storeCoord ? 1 : 2;

  const dayGroups = useMemo(() => {
    const map = {};
    technicians.forEach((m) => {
      weekDays(weekAnchor).slice(0, 5).forEach((d) => {
        map[`${m.id}|${d}`] = orders.filter((o) => o.montorId === m.id && o.dato === d && o.status !== "afsluttet").sort(dailyOrderCompare);
      });
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, technicians, weekAnchor]);

  const signature = Object.entries(dayGroups)
    .map(([key, list]) => `${key}:${list.map((o) => `${o.id}|${o.kunde?.adresse || ""}`).join(",")}`)
    .join(";") + `|firma:${storeCoord ? `${storeCoord.lat},${storeCoord.lon}` : "ukendt"}`;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const relevantKeys = Object.keys(dayGroups).filter((k) => dayGroups[k].length >= minStopsForEstimate);
      if (relevantKeys.length === 0) { setDriveMinutes({}); return; }
      setDriveLoading(true);
      const entries = await Promise.all(relevantKeys.map(async (key) => {
        const list = dayGroups[key];
        const addresses = list.map((o) => o.kunde?.adresse).filter(Boolean);
        if (addresses.length === 0) return [key, null];
        const coordMap = await geocodeAddresses(addresses);
        const stopPoints = addresses.map((a) => coordMap.get(a.trim().toLowerCase())).filter(Boolean);
        const points = storeCoord ? [storeCoord, ...stopPoints] : stopPoints;
        const minutes = points.length >= 2 ? await routeDrivingTime(points) : null;
        return [key, minutes];
      }));
      if (!cancelled) { setDriveMinutes(Object.fromEntries(entries)); setDriveLoading(false); }
    };
    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const timeFor = (technicianId, day, dayOrdersForCell) => {
    const key = `${technicianId}|${day}`;
    const loadMinutes = dayOrdersForCell.reduce((sum, o) => sum + orderExpectedMinutes(o), 0);
    const drive = technicianId ? driveMinutes[key] : undefined;
    const total = loadMinutes + (drive || 0);
    const overloaded = total > WORKDAY_MINUTES;
    const stillLoading = !!technicianId && driveLoading && dayOrdersForCell.length >= minStopsForEstimate && drive === undefined;
    return { loadMinutes, total, overloaded, stillLoading };
  };

  const optimizeDay = async (technicianId, day, dayOrders) => {
    if (!onSetVisitOrder || dayOrders.length < 2) return;
    const key = `${technicianId}|${day}`;
    setOptimizing((prev) => ({ ...prev, [key]: true }));
    const addresses = dayOrders.map((o) => o.kunde?.adresse).filter(Boolean);
    const coordMap = await geocodeAddresses(addresses);
    const withCoords = dayOrders
      .map((o) => ({ id: o.id, coord: o.kunde?.adresse ? coordMap.get(o.kunde.adresse.trim().toLowerCase()) : null }))
      .filter((x) => x.coord);
    if (withCoords.length >= 2) {
      const points = storeCoord ? [storeCoord, ...withCoords.map((x) => x.coord)] : withCoords.map((x) => x.coord);
      const order = await optimalVisitOrder(points);
      if (order && order.length > 1) {
        const offset = storeCoord ? 1 : 0;
        const orderedIds = order.filter((idx) => idx >= offset).map((idx) => withCoords[idx - offset].id);
        const withoutCoordIds = dayOrders.filter((o) => !withCoords.some((x) => x.id === o.id)).map((o) => o.id);
        onSetVisitOrder(technicianId, day, [...orderedIds, ...withoutCoordIds]);
      }
    }
    setOptimizing((prev) => ({ ...prev, [key]: false }));
  };

  return (
    <div className="rounded-xl border border-brand bg-white mb-4 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full p-3 flex items-center gap-2 text-left focus:outline-none focus:ring-2 focus:ring-brand">
        <LayoutGrid size={15} className="text-brand shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold uppercase tracking-wide text-ink">Overblik</span>
          <span className="text-xs text-muted ml-2">{weekOrders.length} sager denne uge{unassignedThisWeek > 0 ? ` · ${unassignedThisWeek} ikke tildelt` : ""}</span>
        </div>
        <ChevronDown size={16} className={`text-muted transition-transform shrink-0 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="border-t border-line">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-divider">
            <button onClick={() => setWeekAnchor((w) => addDays(w, -7))} aria-label="Forrige uge" className="p-2.5 rounded-lg border border-line text-muted hover:text-brand hover:border-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors" title="Forrige uge">
              <ChevronLeft size={15} aria-hidden="true" />
            </button>
            <div className="text-center">
              <p className="text-sm font-semibold text-ink">{shortDateLabel(weekdays5[0])} – {shortDateLabel(weekdays5[4])}</p>
              {weekAnchor !== today && <button onClick={() => setWeekAnchor(today)} className="text-[10px] font-semibold uppercase tracking-wide text-brand hover:underline focus:outline-none focus:ring-2 focus:ring-brand rounded px-1">Gå til denne uge</button>}
            </div>
            <button onClick={() => setWeekAnchor((w) => addDays(w, 7))} aria-label="Næste uge" className="p-2.5 rounded-lg border border-line text-muted hover:text-brand hover:border-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors" title="Næste uge">
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>

          <p className="text-[11px] text-muted px-3 py-2 flex items-center gap-1.5 border-b border-divider">
            {storeCoord ? <Building2 size={11} className="shrink-0" aria-hidden="true" /> : <Car size={11} className="shrink-0" aria-hidden="true" />}
            <span className="hidden sm:inline">
              {storeCoord
                ? "Tidstal inkluderer kørsel fra firmaets adresse og mellem dagens stop, samt arbejdstid. Rute-ikonet foreslår bedste besøgsrækkefølge."
                : "Tidstal inkluderer kørsel mellem dagens stop og arbejdstid (sæt butikkens adresse op under Admin for turen ud fra firmaet)."}
            </span>
            <span className="sm:hidden">Tal = arbejde + estimeret kørsel.</span>
          </p>

          {/* ------- MOBIL: dag-faner (man-fre) + stak af montør-sektioner ------- */}
          <div className="md:hidden">
            <div className="flex gap-1.5 overflow-x-auto px-3 py-2 border-b border-divider" role="tablist" aria-label="Vælg ugedag">
              {weekdays5.map((d) => {
                const antal = rows.reduce((sum, r) => sum + ordersFor(r.id, d).length, 0);
                return (
                  <button
                    key={d}
                    role="tab"
                    aria-selected={d === selectedDay}
                    onClick={() => setSelectedDay(d)}
                    className={`shrink-0 flex flex-col items-center px-3 py-2 rounded-lg text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand ${d === selectedDay ? "bg-brand text-white" : d === today ? "bg-panel text-brand" : "text-muted hover:bg-panel"}`}
                  >
                    <span className="text-[9px] uppercase">{shortDayLabel(d)}</span>
                    <span>{new Date(d + "T00:00:00").getDate()}</span>
                    {/* Antal sager pr. dag, så man kan se hvor der er travlt
                        UDEN at skulle klikke sig gennem alle fem faner. */}
                    <span className={`text-[9px] font-mono ${d === selectedDay ? "text-white/80" : "text-muted"}`}>{antal || "–"}</span>
                  </button>
                );
              })}
            </div>

            <div className="p-3 space-y-4">
              {rows.map((r) => {
                const dayOrders = ordersFor(r.id, selectedDay);
                if (dayOrders.length === 0) return null;
                return (
                  <TechnicianDaySection
                    key={r.id || "utildelt"}
                    row={r} day={selectedDay} dayOrders={dayOrders} technicians={technicians}
                    onOpen={onOpen} onAssign={onAssign} onReorder={onReorder} onSetVisitOrder={onSetVisitOrder}
                    isOnLeave={isOnLeave(r.id, selectedDay)} timeInfo={timeFor(r.id, selectedDay, dayOrders)}
                    optimizing={optimizing} onOptimize={optimizeDay}
                  />
                );
              })}
              {rows.every((r) => ordersFor(r.id, selectedDay).length === 0) && (
                <p className="text-sm text-muted italic text-center py-6">Ingen sager denne dag.</p>
              )}
            </div>
          </div>

          {/* ------- PC/TABLET: fem dag-KOLONNER (md og bredere), montører grupperet inden i hver ------- */}
          <div className="hidden md:grid gap-3 p-3" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
            {weekdays5.map((d) => {
              const dayRows = rows.filter((r) => ordersFor(r.id, d).length > 0);
              return (
                <div key={d} className={`rounded-xl border overflow-hidden ${d === today ? "border-brand" : "border-line"}`}>
                  <div className={`p-2 text-center border-b ${d === today ? "bg-brand/10 border-brand" : "bg-panel border-line"}`}>
                    <p className={`text-[10px] font-semibold uppercase tracking-wide ${d === today ? "text-brand" : "text-muted"}`}>{shortDayLabel(d)}</p>
                    <p className={`text-sm font-semibold ${d === today ? "text-brand" : "text-ink"}`}>{shortDateLabel(d)}</p>
                  </div>
                  <div className="p-2 space-y-3 max-h-[75vh] overflow-y-auto">
                    {dayRows.length === 0 ? (
                      <p className="text-[11px] text-line text-center py-8">Ingen sager</p>
                    ) : (
                      dayRows.map((r) => (
                        <TechnicianDaySection
                          key={r.id || "utildelt"}
                          row={r} day={d} dayOrders={ordersFor(r.id, d)} technicians={technicians}
                          onOpen={onOpen} onAssign={onAssign} onReorder={onReorder} onSetVisitOrder={onSetVisitOrder}
                          isOnLeave={isOnLeave(r.id, d)} timeInfo={timeFor(r.id, d, ordersFor(r.id, d))}
                          optimizing={optimizing} onOptimize={optimizeDay}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PlanningPage({ orders, technicians, vehicles, timeOff, store, selectedDate, onDateChange, onOpen, onCycleStatus, onAssign, onReorder, onSetVisitOrder, onUpdateBooking, onClearProblem, onUpdateTechnician, onRefresh, refreshing }) {
  const [search, setSearch] = useState("");
  const [openTile, setOpenTile] = useState(null);
  const { technicianProblem, sickLeave, needsPlan, unresolved, inProgressToday, upcoming, done } = useMemo(
    () => classify(orders, technicians, vehicles, timeOff, store?.sygemeldingVindueTimer),
    [orders, technicians, vehicles, timeOff, store?.sygemeldingVindueTimer]
  );

  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    return [...orders].filter((s) => matchesSearch(s, search)).sort((a, b) => (b.dato + b.start).localeCompare(a.dato + a.start));
  }, [orders, search]);

  const totalNeedsAction = technicianProblem.length + sickLeave.length + needsPlan.length + unresolved.length;

  return (
    <div>
      <div className="flex items-end justify-between mb-4 flex-wrap gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-widest uppercase text-brand mb-1">Overblik</p>
          <h1 className="font-display text-4xl uppercase tracking-tight text-ink">Planlægning</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-muted">{totalNeedsAction} kræver handling</p>
            <DateSelector date={selectedDate} onChange={onDateChange} />
          </div>
        </div>
        <button onClick={onRefresh} aria-label="Opdater" className="p-2.5 rounded-lg text-ink border border-line hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors" title="Opdater">
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Søg efter sagsnr., ordre-/fakturanr., telefon, adresse eller kundenavn..."
          aria-label="Søg i sager"
          className="w-full rounded-lg border border-line bg-white pl-9 pr-9 py-2.5 text-sm text-ink focus:outline-none focus:border-brand"
        />
        {search && (
          <button onClick={() => setSearch("")} aria-label="Ryd søgning" className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand"><X size={16} aria-hidden="true" /></button>
        )}
      </div>

      {searchResults ? (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink mb-3">{searchResults.length} {searchResults.length === 1 ? "match" : "matches"} på "{search}"</h2>
          {searchResults.length === 0 ? (
            <p className="text-sm text-muted italic">Ingen sager matcher søgningen.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {searchResults.map((s) => <OrderCardCompact key={s.id} order={s} technicians={technicians} onOpen={onOpen} onCycleStatus={onCycleStatus} />)}
            </div>
          )}
        </div>
      ) : (
        <>
          <WeekOverview orders={orders} technicians={technicians} timeOff={timeOff} store={store} onAssign={onAssign} onReorder={onReorder} onSetVisitOrder={onSetVisitOrder} onOpen={onOpen} />

          <div className="mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink mb-2 flex items-center gap-1.5"><AlertCircle size={15} className="text-danger" aria-hidden="true" /> Kræver handling</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <TileButton icon={UserX} color="#B3261E" count={technicianProblem.length} label="Montørproblem" selected={openTile === "problem"} onClick={() => setOpenTile(openTile === "problem" ? null : "problem")} />
              <TileButton icon={Stethoscope} color="#C8232E" count={sickLeave.length} label="Sygemelding" selected={openTile === "sygdom"} onClick={() => setOpenTile(openTile === "sygdom" ? null : "sygdom")} />
              <TileButton icon={CalendarX2} color="#B36B1E" count={needsPlan.length} label="Skal planlægges" selected={openTile === "planlaeg"} onClick={() => setOpenTile(openTile === "planlaeg" ? null : "planlaeg")} />
              <TileButton icon={AlertTriangle} color="#8B5E3C" count={unresolved.length} label="Uafsluttet / fejl" selected={openTile === "problemer"} onClick={() => setOpenTile(openTile === "problemer" ? null : "problemer")} />
            </div>

            {openTile && (
              <div className="rounded-xl bg-panel border border-line p-3">
                {openTile === "problem" && (
                  technicianProblem.length === 0 ? <p className="text-sm text-muted italic">Ingen montørproblemer lige nu.</p> : (
                    <ReplanTile
                      items={technicianProblem} orders={orders} technicians={technicians} timeOff={timeOff}
                      excludeTechnicianIds={(o) => [o.montorId]} onUpdateBooking={onUpdateBooking} onOpen={onOpen}
                    />
                  )
                )}
                {openTile === "sygdom" && (
                  sickLeave.length === 0 ? <p className="text-sm text-muted italic">Ingen sager berørt af sygemelding lige nu.</p> : (
                    <ReplanTile
                      items={sickLeave} orders={orders} technicians={technicians} timeOff={timeOff}
                      excludeTechnicianIds={(o) => [o.montorId]} onUpdateBooking={onUpdateBooking} onOpen={onOpen}
                    />
                  )
                )}
                {openTile === "planlaeg" && (
                  needsPlan.length === 0 ? <p className="text-sm text-success italic flex items-center gap-1.5"><Sparkles size={14} aria-hidden="true" /> Alle sager er planlagt.</p> : (
                    <ReplanTile
                      items={needsPlan} orders={orders} technicians={technicians} timeOff={timeOff}
                      excludeTechnicianIds={[]} onUpdateBooking={onUpdateBooking} onOpen={onOpen}
                    />
                  )
                )}
                {openTile === "problemer" && (
                  unresolved.length === 0 ? <p className="text-sm text-success italic flex items-center gap-1.5"><Sparkles size={14} aria-hidden="true" /> Ingen uafsluttede/fejlmarkerede sager.</p> : (
                    <UnresolvedTile items={unresolved} onClearProblem={onClearProblem} onOpen={onOpen} />
                  )
                )}
              </div>
            )}
          </div>

          {inProgressToday.length > 0 && (
            <div className="rounded-xl border border-info bg-white mb-4 overflow-hidden">
              <div className="p-3 border-b border-line flex items-center gap-2">
                <PlayCircle size={15} className="text-info shrink-0" aria-hidden="true" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-ink flex-1">I gang i dag</h2>
                <span className="text-xs font-mono px-1.5 py-0.5 rounded-full border border-line text-muted">{inProgressToday.length}</span>
              </div>
              <div className="p-3 grid gap-2 sm:grid-cols-2">
                {inProgressToday.map((s) => <OrderCardCompact key={s.id} order={s} technicians={technicians} onOpen={onOpen} onCycleStatus={onCycleStatus} />)}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <CollapsibleSection title="Planlagt fremad" icon={CalendarClock} colorClass="text-muted" items={upcoming} technicians={technicians} onOpen={onOpen} onCycleStatus={onCycleStatus} emptyText="Ingen kommende planlagte sager." />
            <CollapsibleSection title="Afsluttet" icon={CheckCircle2} colorClass="text-success" items={done} technicians={technicians} onOpen={onOpen} onCycleStatus={onCycleStatus} emptyText="Ingen afsluttede sager endnu." />
          </div>
        </>
      )}
    </div>
  );
}

export { PlanningPage, classify };
