import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, PlayCircle, Search, Sparkles, UserX, X, Users, RefreshCw, KeyRound, Clock, Check, CheckCheck, Car, Loader2, Building2, LayoutGrid, MapPin, Phone } from "lucide-react";
import { orderExpectedMinutes, todayISO, addDays, weekDays, buildTitle, isToday, formatLongDate, formatDuration, technicianColor, dailyOrderCompare } from "../data/domain";
import { getAiRouteSuggestion } from "../lib/dataStore";
import { geocodeAddresses, routeDrivingTime } from "../lib/geocoding";
import { DateSelector } from "../components/common";
import { OrderCardCompact } from "../components/OrderCardCompact";

// ---------------------------------------------------------------------------
// Planlægning + Kørsel er fusioneret til ÉN fane (august 2026). Siden er
// bygget med ÉT primært formål for øje: gøre det hurtigt at få OVERBLIK
// over ugen og OMFORDELE sager, når en montør bliver syg, eller et besøg
// var forgæves. Se WeekOverview - RESPONSIVT: en dag-for-dag-liste i fuld
// bredde på smalle skærme (mobil), og et rigtigt ugegitter (montør ×
// ugedag) på brede skærme (pc/tablet) - samme data, to layout, valgt
// automatisk ud fra skærmbredde via CSS-breakpoints (Tailwinds `md:`),
// IKKE ved at gætte på enhedstype. Det betyder det tilpasser sig korrekt
// også ved fx rotation eller et smalt browservindue på en bærbar.
// ---------------------------------------------------------------------------

function daysLate(dato, today) {
  const d1 = new Date(dato + "T00:00:00");
  const d2 = new Date(today + "T00:00:00");
  return Math.round((d2 - d1) / 86400000);
}

function technicianIssue(order, technicians, vehicles, timeOff) {
  if (!order.montorId) return null;
  const technician = technicians.find((m) => m.id === order.montorId);
  if (!technician) return "Montøren findes ikke længere";
  const onLeave = (timeOff || []).some((f) => f.montorId === order.montorId && order.dato >= f.startDato && order.dato <= f.slutDato);
  if (onLeave) return "Montør fraværende denne dag";
  if (technician.bilId) {
    const vehicle = (vehicles || []).find((v) => v.id === technician.bilId);
    if (vehicle?.lukket) return "Montørens bil er ude af drift";
  }
  return null;
}

function classify(orders, technicians, vehicles, timeOff) {
  const today = todayISO();
  const needsAction = [];
  const inProgressToday = [];
  const upcoming = [];
  const done = [];

  for (const s of orders) {
    if (s.status === "afsluttet") { done.push(s); continue; }
    const unassigned = !s.montorId;
    const overdue = s.dato < today;
    const issue = !unassigned ? technicianIssue(s, technicians, vehicles, timeOff) : null;
    if (unassigned || overdue || issue) {
      needsAction.push({ ...s, _unassigned: unassigned, _overdue: overdue, _issue: issue, _daysLate: overdue ? daysLate(s.dato, today) : 0 });
      continue;
    }
    if (s.status === "igang" && s.dato === today) { inProgressToday.push(s); continue; }
    upcoming.push(s);
  }

  needsAction.sort((a, b) => {
    const score = (x) => (x._issue ? 2 : 0) + (x._unassigned ? 1 : 0) + (x._overdue ? 1 : 0);
    if (score(b) !== score(a)) return score(b) - score(a);
    if (b._daysLate !== a._daysLate) return b._daysLate - a._daysLate;
    return (a.dato + a.start).localeCompare(b.dato + b.start);
  });
  const sortByDate = (a, b) => (a.dato + a.start).localeCompare(b.dato + b.start);
  inProgressToday.sort(sortByDate);
  upcoming.sort(sortByDate);
  done.sort((a, b) => (b.dato + b.start).localeCompare(a.dato + a.start));

  return { needsAction, inProgressToday, upcoming, done };
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

const ACTION_RED = "#B3261E";
const ACTION_BRAND = "#C8232E";

function actionReason(order) {
  if (order._issue) return { color: ACTION_RED, text: order._issue };
  if (order._unassigned && order._overdue) return { color: ACTION_RED, text: `Ikke tildelt · ${order._daysLate} ${order._daysLate === 1 ? "dag" : "dage"} forsinket` };
  if (order._unassigned) return { color: ACTION_BRAND, text: "Ikke tildelt montør" };
  return { color: ACTION_RED, text: `${order._daysLate} ${order._daysLate === 1 ? "dag" : "dage"} forsinket` };
}

function ReasonLine({ order }) {
  const { color, text } = actionReason(order);
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1" style={{ color }}>
      <UserX size={12} /> {text}
    </p>
  );
}

// ---------------- AI-forslag til løsning på "Kræver handling" ----------------
const AI_BATCH_LIMIT = 80;

function AiActionSuggestions({ needsAction, orders, technicians, onAssign }) {
  const [loading, setLoading] = useState(false);
  const [solutions, setSolutions] = useState(null);
  const [error, setError] = useState(null);
  const [applied, setApplied] = useState({});

  if (needsAction.length === 0) return null;

  const aiTargets = needsAction.slice(0, AI_BATCH_LIMIT);
  const truncated = needsAction.length > AI_BATCH_LIMIT;

  const ask = async () => {
    setLoading(true); setError(null); setSolutions(null); setApplied({});
    const kraeverHandling = aiTargets.map((s) => ({
      sag: s.nr,
      dato: s.dato,
      adresse: s.kunde?.adresse || "",
      aarsag: actionReason(s).text,
      forventetVarighed: formatDuration(orderExpectedMinutes(s)),
    }));
    const today = todayISO();
    const horizon = addDays(today, 14);
    const grundlag = orders
      .filter((o) => o.status !== "afsluttet" && o.montorId && o.dato >= today && o.dato <= horizon)
      .map((s) => ({ sag: s.nr, dato: s.dato, adresse: s.kunde?.adresse || "", bil: technicians.find((m) => m.id === s.montorId)?.navn || "ikke tildelt" }));
    const montorTekst = technicians.map((m) => `${m.navn} (${m.bil})`).join(", ");

    const result = await getAiRouteSuggestion({ grundlag, montorTekst, valgtDato: today, kraeverHandling });
    setLoading(false);
    if (!result.ok) { setError(result.fejl || "Kunne ikke hente forslag lige nu."); return; }
    setSolutions(result.loesninger || []);
  };

  const apply = (sagNr, orderId, technicianId) => {
    onAssign(orderId, technicianId);
    setApplied((prev) => ({ ...prev, [sagNr]: true }));
  };
  const applyGroup = (items, technicianId) => {
    items.forEach((s) => {
      const order = aiTargets.find((o) => o.nr === s.sag);
      if (order) onAssign(order.id, technicianId);
    });
    setApplied((prev) => {
      const next = { ...prev };
      items.forEach((s) => { next[s.sag] = true; });
      return next;
    });
  };

  const visible = (solutions || []).filter((s) => !applied[s.sag]);
  const groups = [];
  if (visible.length > 0) {
    const byName = new Map();
    for (const s of visible) {
      const key = s.montorNavn && technicians.some((m) => m.navn === s.montorNavn) ? s.montorNavn : "";
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(s);
    }
    for (const [navn, items] of byName) if (navn) groups.push({ navn, items });
    groups.sort((a, b) => b.items.length - a.items.length);
    const none = byName.get("");
    if (none && none.length > 0) groups.push({ navn: "", items: none });
  }

  return (
    <div className="rounded-xl border border-ink bg-panel p-3 mb-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink flex items-center gap-1.5"><Sparkles size={13} /> AI-forslag til løsning</p>
        <button onClick={ask} disabled={loading} className="text-xs font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors px-3 py-1.5 rounded-lg disabled:opacity-50">
          {loading ? "Analyserer..." : "Bed AI om forslag"}
        </button>
      </div>

      {!solutions && !error && !loading && (
        <p className="text-[11px] text-muted mt-1.5">Foreslår en montør til hver sag, grupperet så du kan se og tildele en hel gruppe ad gangen. Rådgivende — retter kun montør; forsinkede sager kan stadig kræve, du selv retter datoen.{truncated ? ` Kun de ${AI_BATCH_LIMIT} mest kritiske sager (ud af ${needsAction.length}) sendes ad gangen.` : ""}</p>
      )}
      {error && <p className="text-xs text-danger mt-2">{error}</p>}

      {solutions && (
        groups.length === 0 ? (
          <p className="text-xs text-success mt-2 flex items-center gap-1.5"><Check size={13} /> Alle forslag er anvendt.</p>
        ) : (
          <div className="space-y-2 mt-2">
            {truncated && (
              <p className="text-[11px] text-muted">Kun de {AI_BATCH_LIMIT} mest kritiske sager (ud af {needsAction.length}) fik et forslag denne omgang - kør igen bagefter for de næste.</p>
            )}
            {groups.map((g) => {
              const technician = g.navn && technicians.find((m) => m.navn === g.navn);
              return (
                <div key={g.navn || "__none__"} className="rounded-lg bg-white border border-line p-2.5">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="text-xs font-semibold text-ink flex items-center gap-1.5">
                      {technician && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: technicianColor(technician.id, technicians) }} />}
                      {g.navn || "Intet klart forslag"} <span className="font-mono text-muted">({g.items.length})</span>
                    </p>
                    {technician && (
                      <button onClick={() => applyGroup(g.items, technician.id)} className="text-[10px] font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors px-2.5 py-1 rounded-lg flex items-center gap-1 shrink-0">
                        <CheckCheck size={12} /> Tildel alle
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {g.items.map((s) => {
                      const order = aiTargets.find((o) => o.nr === s.sag);
                      if (!order) return null;
                      return (
                        <div key={s.sag} title={s.begrundelse || ""} className="flex items-center gap-1 rounded-full border border-line bg-panel pl-2 pr-1 py-0.5 text-[10px]">
                          <span className="font-mono text-muted">#{s.sag}</span>
                          {technician && (
                            <button onClick={() => apply(s.sag, order.id, technician.id)} className="text-success hover:text-brand p-0.5" title="Tildel denne ene"><Check size={11} /></button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

function CollapsibleSection({ title, icon: Icon, colorClass, items, technicians, onOpen, onCycleStatus, emptyText }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-line bg-white overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full p-3 flex items-center gap-2 text-left">
        <Icon size={15} className={`shrink-0 ${colorClass}`} />
        <span className="text-sm font-semibold uppercase tracking-wide text-ink flex-1">{title}</span>
        <span className="text-xs font-mono px-1.5 py-0.5 rounded-full border border-line text-muted">{items.length}</span>
        <ChevronDown size={16} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
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

const WORKDAY_MINUTES = 450; // ~7,5 time
function hoursLabel(minutes) {
  if (minutes === 0) return "–";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}t${m}m` : `${h}t`;
}
function shortDayLabel(iso) { return new Date(iso + "T00:00:00").toLocaleDateString("da-DK", { weekday: "short" }); }
function shortDateLabel(iso) { return new Date(iso + "T00:00:00").toLocaleDateString("da-DK", { day: "numeric", month: "short" }); }

// ---------------- Overblik: responsiv ugekalender med tid, kort og omfordeling ----------------
// Bruges i BEGGE layout (mobil-liste og pc-gitter) - lidt større tekst/
// touch-mål end den oprindelige udgave, som var tunet for smalle 150px-
// gitterkolonner og derfor virkede for spinkel/uoverskuelig generelt.
function MiniOrderCard({ order, onOpen, onAssign, technicians, currentTechnicianId, color, onLeave, onMoveUp, onMoveDown, canMoveUp, canMoveDown }) {
  return (
    <div
      className="rounded-lg bg-white border border-line hover:shadow-sm transition-shadow px-2.5 py-2 mb-1.5 last:mb-0"
      style={{ borderLeftWidth: 3, borderLeftColor: color }}
    >
      <div className="flex items-start gap-1.5">
        {(onMoveUp || onMoveDown) && (
          <div className="flex flex-col shrink-0 -ml-1 -mt-0.5">
            <button onClick={(e) => { e.stopPropagation(); onMoveUp(); }} disabled={!canMoveUp} className="p-1 rounded text-muted hover:text-brand disabled:opacity-20 disabled:pointer-events-none" title="Flyt tidligere i ruten">
              <ChevronUp size={14} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onMoveDown(); }} disabled={!canMoveDown} className="p-1 rounded text-muted hover:text-brand disabled:opacity-20 disabled:pointer-events-none" title="Flyt senere i ruten">
              <ChevronDown size={14} />
            </button>
          </div>
        )}
        <div onClick={() => onOpen(order.id)} className="cursor-pointer min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-mono text-muted">{order.start}–{order.slut}</span>
            {order.noegle?.kraeves && <KeyRound size={10} className="text-brand shrink-0" />}
          </div>
          <p className="text-sm font-semibold text-ink truncate">{order.kunde?.navn}</p>
          <p className="text-xs text-muted truncate">{buildTitle(order.varelinjer)}</p>
          {order.kunde?.adresse && (
            <p className="text-[11px] text-muted truncate flex items-center gap-1">
              <MapPin size={10} className="shrink-0" /> {order.kunde.adresse}
            </p>
          )}
          {order.kunde?.telefon && (
            <p className="text-[11px] text-muted truncate flex items-center gap-1">
              <Phone size={10} className="shrink-0" /> {order.kunde.telefon}
            </p>
          )}
        </div>
      </div>
      <select
        value={currentTechnicianId || ""}
        onChange={(e) => onAssign(order.id, e.target.value || null)}
        onClick={(e) => e.stopPropagation()}
        className={`w-full mt-1.5 rounded-md border px-1.5 py-1 text-[11px] focus:outline-none ${onLeave ? "border-danger text-danger font-semibold" : "border-line bg-panel text-muted focus:border-brand"}`}
      >
        <option value="">Ikke tildelt</option>
        {technicians.map((m) => <option key={m.id} value={m.id}>{m.navn}</option>)}
      </select>
    </div>
  );
}

// Lille badge til dag/montør-tidstotal (arbejde+kørsel) - genbruges i begge
// layout så visningen af belastning er ens uanset skærmbredde.
function DayTimeBadge({ minutes, overloaded, loading }) {
  return (
    <span className={`text-[11px] font-bold rounded-md px-2 py-0.5 flex items-center gap-1 shrink-0 ${overloaded ? "bg-danger text-white" : "bg-panel text-ink"}`}>
      {loading ? <Loader2 size={11} className="animate-spin shrink-0" /> : null}
      {loading ? "beregner..." : hoursLabel(minutes)}
    </span>
  );
}

// Erstatter BÅDE den tidligere "Dagens tidslinje" OG "Omfordel hurtigt"-
// modalen: ÉT altid-synligt ugeoverblik, der starter UDFOLDET (kan
// minimeres med pilen i headeren). RESPONSIVT (se filens toppo-kommentar):
// på smalle skærme vises dagene ét ad gangen som en fuld-bredde liste
// (dag-faner øverst); på brede skærme vises hele ugen som et gitter
// (montør × ugedag). Samme underliggende data og tidsberegning i begge.
function WeekOverview({ orders, technicians, timeOff, store, onAssign, onReorder, onOpen }) {
  const [open, setOpen] = useState(true); // starter UDFOLDET
  const [weekAnchor, setWeekAnchor] = useState(todayISO());
  const [selectedDay, setSelectedDay] = useState(todayISO()); // kun brugt i mobil-layoutet
  const [driveMinutes, setDriveMinutes] = useState({}); // { "montorId|dato": minutter | null }
  const [driveLoading, setDriveLoading] = useState(false);

  const week = weekDays(weekAnchor);
  const today = todayISO();
  const rows = [...technicians, { id: null, navn: "Ikke tildelt" }];

  // Hold den valgte mobil-dag inden for den aktuelt viste uge, når man
  // blader til en anden uge.
  useEffect(() => {
    if (!week.includes(selectedDay)) setSelectedDay(week[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekAnchor]);

  const weekOrders = orders.filter((o) => week.includes(o.dato) && o.status !== "afsluttet");
  const unassignedThisWeek = weekOrders.filter((o) => !o.montorId).length;

  const ordersFor = (technicianId, day) =>
    orders.filter((o) => o.montorId === technicianId && o.dato === day && o.status !== "afsluttet").sort(dailyOrderCompare);

  const isOnLeave = (technicianId, day) => !!technicianId && (timeOff || []).some((f) => f.montorId === technicianId && day >= f.startDato && day <= f.slutDato);

  // Firmaets adresse (allerede geokodet, se App.jsx/getStore) bruges som
  // FAST STARTPUNKT for hver montørs rute hver dag.
  const storeCoord = store?.lat != null && store?.lon != null ? { lat: store.lat, lon: store.lon } : null;
  const minStopsForEstimate = storeCoord ? 1 : 2;

  const dayGroups = useMemo(() => {
    const map = {};
    technicians.forEach((m) => {
      weekDays(weekAnchor).forEach((d) => {
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

  return (
    <div className="rounded-xl border border-brand bg-white mb-4 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full p-3 flex items-center gap-2 text-left">
        <LayoutGrid size={15} className="text-brand shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold uppercase tracking-wide text-ink">Overblik</span>
          <span className="text-xs text-muted ml-2">{weekOrders.length} sager denne uge{unassignedThisWeek > 0 ? ` · ${unassignedThisWeek} ikke tildelt` : ""}</span>
        </div>
        <ChevronDown size={16} className={`text-muted transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-line">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-divider">
            <button onClick={() => setWeekAnchor((w) => addDays(w, -7))} className="p-1.5 rounded-lg border border-line text-muted hover:text-brand hover:border-brand transition-colors" title="Forrige uge">
              <ChevronLeft size={15} />
            </button>
            <div className="text-center">
              <p className="text-sm font-semibold text-ink">{shortDateLabel(week[0])} – {shortDateLabel(week[6])}</p>
              {weekAnchor !== today && <button onClick={() => setWeekAnchor(today)} className="text-[10px] font-semibold uppercase tracking-wide text-brand hover:underline">Gå til denne uge</button>}
            </div>
            <button onClick={() => setWeekAnchor((w) => addDays(w, 7))} className="p-1.5 rounded-lg border border-line text-muted hover:text-brand hover:border-brand transition-colors" title="Næste uge">
              <ChevronRight size={15} />
            </button>
          </div>

          <p className="text-[11px] text-muted px-3 py-2 flex items-center gap-1.5 border-b border-divider">
            {storeCoord ? <Building2 size={11} className="shrink-0" /> : <Car size={11} className="shrink-0" />}
            <span className="hidden sm:inline">
              {storeCoord
                ? "Tidstal inkluderer kørsel fra firmaets adresse og mellem dagens stop, samt arbejdstid."
                : "Tidstal inkluderer kørsel mellem dagens stop og arbejdstid (sæt butikkens adresse op under Admin for turen ud fra firmaet)."}
            </span>
            <span className="sm:hidden">Tal = arbejde + estimeret kørsel.</span>
          </p>

          {/* ------- MOBIL: dag-faner + fuld-bredde liste (< md) ------- */}
          <div className="md:hidden">
            <div className="flex gap-1.5 overflow-x-auto px-3 py-2 border-b border-divider">
              {week.map((d) => (
                <button
                  key={d}
                  onClick={() => setSelectedDay(d)}
                  className={`shrink-0 flex flex-col items-center px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${d === selectedDay ? "bg-brand text-white" : d === today ? "bg-panel text-brand" : "text-muted hover:bg-panel"}`}
                >
                  <span className="text-[9px] uppercase">{shortDayLabel(d)}</span>
                  <span>{new Date(d + "T00:00:00").getDate()}</span>
                </button>
              ))}
            </div>

            <div className="p-3 space-y-4">
              {rows.map((r) => {
                const dayOrders = ordersFor(r.id, selectedDay);
                if (dayOrders.length === 0) return null;
                const onLeave = isOnLeave(r.id, selectedDay);
                const { loadMinutes, total, overloaded, stillLoading } = timeFor(r.id, selectedDay, dayOrders);
                return (
                  <div key={r.id || "utildelt"}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <p className="text-sm font-semibold text-ink flex items-center gap-1.5 min-w-0 truncate">
                        {r.id && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: technicianColor(r.id, technicians) }} />}
                        {r.navn}
                      </p>
                      {r.id && loadMinutes > 0 && <DayTimeBadge minutes={total} overloaded={overloaded} loading={stillLoading} />}
                    </div>
                    {onLeave && <p className="text-[11px] font-semibold uppercase tracking-wide text-danger mb-1.5 flex items-center gap-1"><AlertCircle size={11} /> Fraværende denne dag</p>}
                    {dayOrders.map((o, i) => (
                      <MiniOrderCard
                        key={o.id}
                        order={o}
                        onOpen={onOpen}
                        onAssign={onAssign}
                        technicians={technicians}
                        currentTechnicianId={r.id}
                        color={r.id ? technicianColor(r.id, technicians) : "#C8232E"}
                        onLeave={onLeave}
                        onMoveUp={r.id && onReorder ? () => onReorder(r.id, selectedDay, o.id, -1) : undefined}
                        onMoveDown={r.id && onReorder ? () => onReorder(r.id, selectedDay, o.id, 1) : undefined}
                        canMoveUp={i > 0}
                        canMoveDown={i < dayOrders.length - 1}
                      />
                    ))}
                  </div>
                );
              })}
              {rows.every((r) => ordersFor(r.id, selectedDay).length === 0) && (
                <p className="text-sm text-muted italic text-center py-6">Ingen sager denne dag.</p>
              )}
            </div>
          </div>

          {/* ------- PC/TABLET: ugegitter (md og bredere) ------- */}
          <div className="hidden md:block overflow-x-auto">
            <div style={{ minWidth: 150 + 152 * 7 }}>
              <div className="grid sticky top-0 z-20 bg-panel border-b border-line" style={{ gridTemplateColumns: "150px repeat(7, minmax(150px, 1fr))" }}>
                <div className="p-2 text-[10px] font-semibold uppercase tracking-wide text-muted sticky left-0 bg-panel z-10 border-r border-line">Montør</div>
                {week.map((d) => (
                  <div key={d} className={`p-2 text-center border-l border-divider ${d === today ? "bg-brand/10" : ""}`}>
                    <p className={`text-[10px] font-semibold uppercase tracking-wide ${d === today ? "text-brand" : "text-muted"}`}>{shortDayLabel(d)}</p>
                    <p className={`text-sm font-semibold ${d === today ? "text-brand" : "text-ink"}`}>{new Date(d + "T00:00:00").getDate()}</p>
                  </div>
                ))}
              </div>

              {rows.map((r) => (
                <div key={r.id || "utildelt"} className="grid border-b border-divider">
                  <div className="p-2 sticky left-0 bg-white z-10 border-r border-line flex items-center gap-1.5">
                    {r.id && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: technicianColor(r.id, technicians) }} />}
                    <span className="text-xs font-semibold text-ink truncate">{r.navn}</span>
                  </div>
                  {week.map((d) => {
                    const dayOrders = ordersFor(r.id, d);
                    const onLeave = isOnLeave(r.id, d);
                    const { loadMinutes, total, overloaded, stillLoading } = timeFor(r.id, d, dayOrders);
                    return (
                      <div key={d} className={`p-1.5 border-l border-divider min-h-[64px] ${d === today ? "bg-brand/5" : ""}`}>
                        {r.id && loadMinutes > 0 && (
                          <div className="mb-1 flex justify-center">
                            <DayTimeBadge minutes={total} overloaded={overloaded} loading={stillLoading} />
                          </div>
                        )}
                        {onLeave && <p className="text-[9px] font-semibold uppercase tracking-wide text-danger mb-1 flex items-center gap-0.5"><AlertCircle size={9} /> Fraværende</p>}
                        {dayOrders.length === 0 ? (
                          <p className="text-[10px] text-line text-center pt-2">–</p>
                        ) : (
                          dayOrders.map((o, i) => (
                            <MiniOrderCard
                              key={o.id}
                              order={o}
                              onOpen={onOpen}
                              onAssign={onAssign}
                              technicians={technicians}
                              currentTechnicianId={r.id}
                              color={r.id ? technicianColor(r.id, technicians) : "#C8232E"}
                              onLeave={onLeave}
                              onMoveUp={r.id && onReorder ? () => onReorder(r.id, d, o.id, -1) : undefined}
                              onMoveDown={r.id && onReorder ? () => onReorder(r.id, d, o.id, 1) : undefined}
                              canMoveUp={i > 0}
                              canMoveDown={i < dayOrders.length - 1}
                            />
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanningPage({ orders, technicians, vehicles, timeOff, store, selectedDate, onDateChange, onOpen, onCycleStatus, onAssign, onReorder, onUpdateTechnician, onRefresh, refreshing }) {
  const [search, setSearch] = useState("");
  const { needsAction, inProgressToday, upcoming, done } = useMemo(() => classify(orders, technicians, vehicles, timeOff), [orders, technicians, vehicles, timeOff]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    return [...orders].filter((s) => matchesSearch(s, search)).sort((a, b) => (b.dato + b.start).localeCompare(a.dato + a.start));
  }, [orders, search]);

  return (
    <div>
      <div className="flex items-end justify-between mb-4 flex-wrap gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-widest uppercase text-brand mb-1">Overblik</p>
          <h1 className="font-display text-4xl uppercase tracking-tight text-ink">Planlægning</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-muted">{needsAction.length} kræver handling</p>
            <DateSelector date={selectedDate} onChange={onDateChange} />
          </div>
        </div>
        <button onClick={onRefresh} className="p-2 rounded-lg text-ink border border-line hover:border-brand hover:text-brand transition-colors" title="Opdater">
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Søg efter sagsnr., ordre-/fakturanr., telefon, adresse eller kundenavn..."
          className="w-full rounded-lg border border-line bg-white pl-9 pr-9 py-2.5 text-sm text-ink focus:outline-none focus:border-brand"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-brand"><X size={16} /></button>
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
          <WeekOverview orders={orders} technicians={technicians} timeOff={timeOff} store={store} onAssign={onAssign} onReorder={onReorder} onOpen={onOpen} />

          <div className="rounded-xl bg-white border border-line mb-4 overflow-hidden" style={{ borderTopWidth: 4, borderTopColor: ACTION_RED }}>
            <div className="p-3 border-b border-line flex items-center gap-2">
              <AlertCircle size={17} className="text-danger shrink-0" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink flex-1">Kræver handling</h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-danger text-white">{needsAction.length}</span>
            </div>
            <div className="p-3">
              {needsAction.length === 0 ? (
                <p className="text-sm text-success font-medium flex items-center gap-2 py-2"><Sparkles size={16} /> Intet hænger — alle sager er tildelt, gennemførbare og afsluttet til tiden.</p>
              ) : (
                <>
                  <AiActionSuggestions needsAction={needsAction} orders={orders} technicians={technicians} onAssign={onAssign} />
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {needsAction.map((s) => (
                      <OrderCardCompact key={s.id} order={s} technicians={technicians} onOpen={onOpen} onCycleStatus={onCycleStatus} onAssign={onAssign} reason={<ReasonLine order={s} />} accent={actionReason(s).color} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {inProgressToday.length > 0 && (
            <div className="rounded-xl border border-info bg-white mb-4 overflow-hidden">
              <div className="p-3 border-b border-line flex items-center gap-2">
                <PlayCircle size={15} className="text-info shrink-0" />
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

export { PlanningPage };
