import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, PlayCircle, Search, Sparkles, UserX, X, Users, RefreshCw, Pencil, KeyRound, Clock, Check, Maximize2, CheckCheck, Car, Loader2, Building2 } from "lucide-react";
import { orderExpectedMinutes, todayISO, addDays, weekDays, vehicleLabel, vehicleBlockedByTimeOff, buildTitle, isToday, formatLongDate, formatDuration, technicianColor, STATUS_META, dailyOrderCompare } from "../data/domain";
import { getAiRouteSuggestion } from "../lib/dataStore";
import { geocodeAddresses, routeDrivingTime } from "../lib/geocoding";
import { DateSelector } from "../components/common";
import { OrderCardCompact } from "../components/OrderCardCompact";

// ---------------------------------------------------------------------------
// Planlægning + Kørsel er fusioneret til ÉN fane (august 2026). Siden er
// bygget med ÉT primært formål for øje: gøre det hurtigt at OMFORDELE
// sager, når en montør bliver syg, eller et besøg var forgæves - den
// hyppigste, mest tidskritiske opgave i den daglige planlægning. Se
// WeekBoardModal, en fuldskærms ugekalender med alle sager som kort,
// grupperet på montør, med indbygget omfordeling OG besøgsrækkefølge.
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
// Foreslår, PR. SAG i listen, hvilken montør der bedst kan tage den. Grupperet
// PR. FORESLÅET MONTØR (i stedet for en flad liste) - med op til 80 sager i
// spil på én gang giver en flad liste intet overblik; grupperingen gør det
// muligt at se "Peter får 12 sager, Anne får 8" på ét blik, og tildele hele
// gruppen på én gang med "Tildel alle".
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

// ---------------- Ugekalender (fuldskærm): alle sager som kort, pr. montør, pr. dag ----------------
function MiniOrderCard({ order, onOpen, onAssign, technicians, currentTechnicianId, color, onLeave, onMoveUp, onMoveDown, canMoveUp, canMoveDown }) {
  return (
    <div
      className="rounded-lg bg-white border border-line hover:shadow-sm transition-shadow px-2 py-1.5 mb-1.5 last:mb-0"
      style={{ borderLeftWidth: 3, borderLeftColor: color }}
    >
      <div className="flex items-start gap-1">
        {(onMoveUp || onMoveDown) && (
          <div className="flex flex-col shrink-0 -ml-0.5 -mt-0.5">
            <button onClick={(e) => { e.stopPropagation(); onMoveUp(); }} disabled={!canMoveUp} className="p-0.5 rounded text-muted hover:text-brand disabled:opacity-20 disabled:pointer-events-none" title="Flyt tidligere i ruten">
              <ChevronUp size={12} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onMoveDown(); }} disabled={!canMoveDown} className="p-0.5 rounded text-muted hover:text-brand disabled:opacity-20 disabled:pointer-events-none" title="Flyt senere i ruten">
              <ChevronDown size={12} />
            </button>
          </div>
        )}
        <div onClick={() => onOpen(order.id)} className="cursor-pointer min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-mono text-muted">{order.start}–{order.slut}</span>
            {order.noegle?.kraeves && <KeyRound size={9} className="text-brand shrink-0" />}
          </div>
          <p className="text-xs font-semibold text-ink truncate">{order.kunde?.navn}</p>
          <p className="text-[10px] text-muted truncate">{buildTitle(order.varelinjer)}</p>
        </div>
      </div>
      <select
        value={currentTechnicianId || ""}
        onChange={(e) => onAssign(order.id, e.target.value || null)}
        onClick={(e) => e.stopPropagation()}
        className={`w-full mt-1 rounded-md border px-1 py-0.5 text-[9px] focus:outline-none ${onLeave ? "border-danger text-danger font-semibold" : "border-line bg-panel text-muted focus:border-brand"}`}
      >
        <option value="">Ikke tildelt</option>
        {technicians.map((m) => <option key={m.id} value={m.id}>{m.navn}</option>)}
      </select>
    </div>
  );
}

function WeekBoardModal({ orders, technicians, timeOff, onAssign, onReorder, onOpen, onClose }) {
  const [weekAnchor, setWeekAnchor] = useState(todayISO());
  const week = weekDays(weekAnchor);
  const today = todayISO();
  const rows = [...technicians, { id: null, navn: "Ikke tildelt" }];

  const ordersFor = (technicianId, day) =>
    orders.filter((o) => o.montorId === technicianId && o.dato === day && o.status !== "afsluttet")
      .sort(dailyOrderCompare);

  const isOnLeave = (technicianId, day) => !!technicianId && (timeOff || []).some((f) => f.montorId === technicianId && day >= f.startDato && day <= f.slutDato);

  const openAndClose = (id) => { onClose(); onOpen(id); };

  return (
    <div className="fixed inset-0 z-50 bg-paper flex flex-col">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-line bg-white shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekAnchor((w) => addDays(w, -7))} className="p-1.5 rounded-lg border border-line text-muted hover:text-brand hover:border-brand transition-colors" title="Forrige uge">
            <ChevronLeft size={16} />
          </button>
          <div className="text-center min-w-[130px]">
            <p className="text-sm font-semibold text-ink">{shortDateLabel(week[0])} – {shortDateLabel(week[6])}</p>
            {weekAnchor !== today && <button onClick={() => setWeekAnchor(today)} className="text-[10px] font-semibold uppercase tracking-wide text-brand hover:underline">Gå til denne uge</button>}
          </div>
          <button onClick={() => setWeekAnchor((w) => addDays(w, 7))} className="p-1.5 rounded-lg border border-line text-muted hover:text-brand hover:border-brand transition-colors" title="Næste uge">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted hidden md:block">Pilene ændrer besøgsrækkefølgen — vælgeren omfordeler til en anden montør — klik kortet åbner sagen.</p>
          <button onClick={onClose} className="p-2 rounded-lg text-muted hover:text-brand hover:bg-panel transition-colors" title="Luk"><X size={20} /></button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
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
            <div key={r.id || "utildelt"} className="grid border-b border-divider" style={{ gridTemplateColumns: "150px repeat(7, minmax(150px, 1fr))" }}>
              <div className="p-2 sticky left-0 bg-white z-10 border-r border-line flex items-center gap-1.5">
                {r.id && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: technicianColor(r.id, technicians) }} />}
                <span className="text-xs font-semibold text-ink truncate">{r.navn}</span>
              </div>
              {week.map((d) => {
                const dayOrders = ordersFor(r.id, d);
                const onLeave = isOnLeave(r.id, d);
                return (
                  <div key={d} className={`p-1.5 border-l border-divider min-h-[64px] ${d === today ? "bg-brand/5" : ""}`}>
                    {onLeave && <p className="text-[9px] font-semibold uppercase tracking-wide text-danger mb-1 flex items-center gap-0.5"><AlertCircle size={9} /> Fraværende</p>}
                    {dayOrders.length === 0 ? (
                      <p className="text-[10px] text-line text-center pt-2">–</p>
                    ) : (
                      dayOrders.map((o, i) => (
                        <MiniOrderCard
                          key={o.id}
                          order={o}
                          onOpen={openAndClose}
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
  );
}

function QuickReassign({ orders, technicians, timeOff, onAssign, onReorder, onOpen }) {
  const [boardOpen, setBoardOpen] = useState(false);
  const week = weekDays(todayISO());
  const weekOrders = orders.filter((o) => week.includes(o.dato) && o.status !== "afsluttet");
  const unassignedThisWeek = weekOrders.filter((o) => !o.montorId).length;

  return (
    <>
      <button
        onClick={() => setBoardOpen(true)}
        className="w-full text-left rounded-xl border border-brand bg-brand/5 hover:bg-brand/10 transition-colors p-4 mb-4 flex items-center justify-between gap-3"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink flex items-center gap-1.5"><Users size={15} className="text-brand shrink-0" /> Omfordel hurtigt</p>
          <p className="text-xs text-muted mt-0.5">{weekOrders.length} sager denne uge{unassignedThisWeek > 0 ? ` · ${unassignedThisWeek} ikke tildelt` : ""} — åbn ugekalenderen for at se fordelingen, omfordele og justere besøgsrækkefølgen.</p>
        </div>
        <span className="shrink-0 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white bg-ink group-hover:bg-brand px-3 py-2 rounded-lg">
          <Maximize2 size={13} /> Åbn ugekalender
        </span>
      </button>
      {boardOpen && (
        <WeekBoardModal orders={orders} technicians={technicians} timeOff={timeOff} onAssign={onAssign} onReorder={onReorder} onOpen={onOpen} onClose={() => setBoardOpen(false)} />
      )}
    </>
  );
}

// ---------------- Dagens tidslinje ----------------

const toMinutes = (hhmm) => {
  if (!/^\d{2}:\d{2}$/.test(hhmm || "")) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// Rækkehovedet viser forventet arbejdstid (varelinjer) + estimeret KØRETID
// - nu inklusive strækningen FRA FIRMAET og ud til første stop (ikke kun
// mellem stoppene undervejs), da montøren jo altid kører ud hjemmefra
// firmaet, ikke fra det første kundebesøg. Køretiden beregnes langs dagens
// BESØGSRÆKKEFØLGE (samme rækkefølge man kan justere med op/ned-pilene
// andre steder i appen) via ORS' distance-matrix.
function TimelineRowHeader({ r, loadMinutes, driveMinutes, driveLoading, vehicles, technicians, timeOff, selectedDate, onUpdateTechnician }) {
  const [editing, setEditing] = useState(false);
  const [vehicleId, setVehicleId] = useState(r.bilId || "");
  const linkedVehicle = vehicles.find((b) => b.id === r.bilId);
  const timeOffBlock = vehicleBlockedByTimeOff(r.bilId, selectedDate, technicians, timeOff);

  if (!r.id) {
    return <div className="min-w-0"><p className="text-xs font-semibold text-ink truncate">{r.navn}</p></div>;
  }

  const save = (newVehicleId) => { onUpdateTechnician(r.id, { bilId: newVehicleId || null }); setEditing(false); };
  const total = loadMinutes + (driveMinutes || 0);
  const overloaded = total > WORKDAY_MINUTES;

  return (
    <div className="min-w-0 flex-1">
      <p className="text-xs font-semibold text-ink truncate">{r.navn}</p>
      {editing ? (
        <select
          autoFocus value={vehicleId}
          onChange={(e) => { setVehicleId(e.target.value); save(e.target.value); }}
          onBlur={() => setEditing(false)}
          className="w-full min-w-0 rounded-md border border-line bg-white px-1 py-0.5 text-[10px] text-ink focus:outline-none focus:border-brand mt-0.5"
        >
          <option value="">Ingen bil</option>
          {vehicles.map((b) => (
            <option key={b.id} value={b.id} disabled={b.lukket && b.id !== r.bilId}>{vehicleLabel(b)}{b.lukket ? " (lukket)" : ""}</option>
          ))}
        </select>
      ) : (
        <button onClick={() => { setVehicleId(r.bilId || ""); setEditing(true); }} className="flex items-center gap-1 text-[10px] text-muted hover:text-brand border-b border-dashed border-line hover:border-brand w-fit" title="Klik for at skifte bil">
          <span className="truncate">{linkedVehicle ? vehicleLabel(linkedVehicle) : "Ingen bil"}</span>
          <Pencil size={9} className="shrink-0" />
        </button>
      )}
      {loadMinutes > 0 && (
        <div className="mt-0.5">
          <p className="text-[10px] text-muted flex items-center gap-1"><Clock size={9} className="shrink-0" /> {formatDuration(loadMinutes)} arbejde</p>
          {driveLoading ? (
            <p className="text-[10px] text-muted flex items-center gap-1"><Loader2 size={9} className="shrink-0 animate-spin" /> beregner kørsel...</p>
          ) : driveMinutes != null ? (
            <>
              <p className="text-[10px] text-muted flex items-center gap-1"><Car size={9} className="shrink-0" /> ~{formatDuration(driveMinutes)} kørsel</p>
              <p className={`text-[10px] font-bold flex items-center gap-1 ${overloaded ? "text-danger" : "text-brand"}`}>
                I alt: ~{formatDuration(total)}{overloaded && <AlertCircle size={9} className="shrink-0" />}
              </p>
            </>
          ) : null}
        </div>
      )}
      {linkedVehicle?.lukket && <p className="text-[10px] text-danger font-semibold flex items-center gap-1"><AlertCircle size={9} /> Bil lukket ({linkedVehicle.lukketAarsag || "værksted"})</p>}
      {!linkedVehicle?.lukket && timeOffBlock && <p className="text-[10px] text-danger font-semibold flex items-center gap-1"><AlertCircle size={9} /> {timeOffBlock.montor.navn} holder ferie</p>}
    </div>
  );
}

function DailyTimeline({ orders, technicians, vehicles, timeOff, store, selectedDate, onOpen, onUpdateTechnician }) {
  const [open, setOpen] = useState(true);
  const [driveMinutesByTechnician, setDriveMinutesByTechnician] = useState({}); // { technicianId: minutes | null }
  const [driveLoading, setDriveLoading] = useState(false);
  const dayStart = 7 * 60 + 30;
  const dayEnd = 16 * 60 + 30;
  const PX_PER_MIN = 3.6;
  const width = (dayEnd - dayStart) * PX_PER_MIN;
  const todaysOrders = orders.filter((s) => s.dato === selectedDate);
  const validOrders = todaysOrders.filter((s) => toMinutes(s.start) !== null && toMinutes(s.slut) !== null);
  const hourMarks = [];
  for (let t = Math.ceil(dayStart / 60) * 60; t <= dayEnd; t += 60) hourMarks.push(t);
  const rows = [{ id: null, navn: "Ikke tildelt", bil: "" }, ...technicians];
  const overlaps = (a, b) => toMinutes(a.start) < toMinutes(b.slut) && toMinutes(b.start) < toMinutes(a.slut);

  // Firmaets adresse (allerede geokodet - se App.jsx/getStore) bruges som
  // FAST STARTPUNKT for hver montørs rute, siden dagen jo altid begynder
  // med at køre ud fra firmaet, ikke fra den første kundeadresse.
  const storeCoord = store?.lat != null && store?.lon != null ? { lat: store.lat, lon: store.lon } : null;
  // Uden en kendt firmaadresse kræves stadig mindst 2 stop for overhovedet
  // at kunne regne noget (kørsel MELLEM stop) - med en kendt firmaadresse
  // kan selv ÉT stop få et estimat (kørsel firma -> det ene stop).
  const minStopsForEstimate = storeCoord ? 1 : 2;

  // Dagens rute PR. MONTØR, i besøgsrækkefølge (dailyOrderCompare - samme
  // rækkefølge man kan justere med op/ned-pilene andre steder i appen).
  const technicianDayOrders = useMemo(
    () => technicians.map((m) => ({
      id: m.id,
      orders: orders.filter((o) => o.montorId === m.id && o.dato === selectedDate && o.status !== "afsluttet").sort(dailyOrderCompare),
    })),
    [orders, technicians, selectedDate]
  );

  // Genberegnes kun når selve INDHOLDET reelt ændrer sig (hvilke sager, i
  // hvilken rækkefølge, med hvilke adresser, eller firmaets koordinater
  // ændrer sig) - ikke ved hvert eneste render.
  const signature = technicianDayOrders
    .map((g) => `${g.id}:${g.orders.map((o) => `${o.id}|${o.kunde?.adresse || ""}`).join(",")}`)
    .join(";") + `|firma:${storeCoord ? `${storeCoord.lat},${storeCoord.lon}` : "ukendt"}`;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const relevant = technicianDayOrders.filter((g) => g.orders.length >= minStopsForEstimate);
      if (relevant.length === 0) { setDriveMinutesByTechnician({}); return; }
      setDriveLoading(true);
      const results = {};
      for (const g of relevant) {
        const addresses = g.orders.map((o) => o.kunde?.adresse).filter(Boolean);
        if (addresses.length === 0) { results[g.id] = null; continue; }
        const coordMap = await geocodeAddresses(addresses);
        const stopPoints = addresses.map((a) => coordMap.get(a.trim().toLowerCase())).filter(Boolean);
        const points = storeCoord ? [storeCoord, ...stopPoints] : stopPoints;
        results[g.id] = points.length >= 2 ? await routeDrivingTime(points) : null;
      }
      if (!cancelled) { setDriveMinutesByTechnician(results); setDriveLoading(false); }
    };
    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return (
    <div className="rounded-xl border border-line bg-white mb-4 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full p-3 flex items-center gap-2 text-left">
        <Clock size={15} className="text-muted shrink-0" />
        <span className="text-sm font-semibold uppercase tracking-wide text-ink flex-1">Dagens tidslinje</span>
        <ChevronDown size={16} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <p className="text-[11px] text-muted px-3 pb-2 flex items-center gap-1.5">
            {storeCoord ? <Building2 size={11} className="shrink-0" /> : <Car size={11} className="shrink-0" />}
            {storeCoord
              ? "\"I alt\" inkluderer kørsel fra firmaets adresse og ud til første stop, samt kørsel mellem dagens øvrige stop."
              : "\"I alt\" inkluderer kørsel mellem dagens stop. Sæt butikkens adresse op under Admin for også at medregne turen ud fra firmaet."}
          </p>
          <div className="border-t border-line overflow-x-auto">
            <div style={{ width: width + 160, minWidth: "100%" }}>
              <div className="flex sticky top-0 bg-white z-10 border-b border-line">
                <div className="w-[140px] shrink-0 border-r border-line" />
                <div className="relative" style={{ width, height: 24 }}>
                  {hourMarks.map((t) => (
                    <div key={t} className="absolute top-0 bottom-0 border-l border-divider text-[10px] font-mono text-muted pl-1 pt-1" style={{ left: (t - dayStart) * PX_PER_MIN }}>
                      {String(Math.floor(t / 60)).padStart(2, "0")}
                    </div>
                  ))}
                </div>
              </div>
              {rows.map((r) => {
                const myOrders = validOrders.filter((s) => s.montorId === r.id);
                const loadMinutes = myOrders.reduce((sum, s) => sum + orderExpectedMinutes(s), 0);
                const stopCount = technicianDayOrders.find((g) => g.id === r.id)?.orders.length || 0;
                return (
                  <div key={r.id || "utildelt"} className="flex border-b border-divider">
                    <div className="w-[140px] shrink-0 border-r border-line p-2 flex items-center gap-2 bg-panel">
                      {r.id ? <span className="w-2 h-2 rounded-full shrink-0" style={{ background: technicianColor(r.id, technicians) }} /> : <span className="w-2 h-2 rounded-full shrink-0 border border-brand" />}
                      <TimelineRowHeader
                        r={r}
                        loadMinutes={loadMinutes}
                        driveMinutes={driveMinutesByTechnician[r.id]}
                        driveLoading={driveLoading && stopCount >= minStopsForEstimate && driveMinutesByTechnician[r.id] === undefined}
                        vehicles={vehicles}
                        technicians={technicians}
                        timeOff={timeOff}
                        selectedDate={selectedDate}
                        onUpdateTechnician={onUpdateTechnician}
                      />
                    </div>
                    <div className="relative" style={{ width, height: 64 }}>
                      {hourMarks.map((t) => <div key={t} className="absolute top-0 bottom-0 border-l border-divider" style={{ left: (t - dayStart) * PX_PER_MIN }} />)}
                      {myOrders.map((s) => {
                        const left = (toMinutes(s.start) - dayStart) * PX_PER_MIN;
                        const w = (toMinutes(s.slut) - toMinutes(s.start)) * PX_PER_MIN;
                        const conflict = r.id && myOrders.some((a) => a.id !== s.id && overlaps(a, s));
                        return (
                          <div
                            key={s.id} onClick={() => onOpen(s.id)}
                            className="absolute top-1.5 bottom-1.5 px-2 py-1 rounded-md cursor-pointer overflow-hidden bg-white hover:z-10 hover:shadow-md transition-shadow"
                            style={{ left, width: w, border: conflict ? "1px solid #B3261E" : "1px solid #DDDDDD", borderLeftWidth: 3, borderLeftColor: STATUS_META[s.status].color }}
                            title={conflict ? "Overlapper med en anden sag på samme bil" : ""}
                          >
                            <p className="text-[10px] font-mono text-muted truncate">{s.start}–{s.slut}</p>
                            <p className="text-xs font-semibold text-ink truncate">{buildTitle(s.varelinjer)}</p>
                            <p className="text-[10px] text-muted truncate">{s.kunde.navn}</p>
                            {s.noegle?.kraeves && <p className="text-[10px] text-brand truncate flex items-center gap-0.5"><KeyRound size={9} /> nøgle</p>}
                            {conflict && <p className="text-[10px] text-danger font-semibold">Overlap!</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
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
          <QuickReassign orders={orders} technicians={technicians} timeOff={timeOff} onAssign={onAssign} onReorder={onReorder} onOpen={onOpen} />

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

          <DailyTimeline orders={orders} technicians={technicians} vehicles={vehicles} timeOff={timeOff} store={store} selectedDate={selectedDate} onOpen={onOpen} onUpdateTechnician={onUpdateTechnician} />

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
