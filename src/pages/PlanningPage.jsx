import React, { useMemo, useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, ChevronDown, Gauge, PlayCircle, Search, Sparkles, UserX, X, Users, RefreshCw, Pencil, KeyRound, Clock } from "lucide-react";
import { orderExpectedMinutes, todayISO, weekDays, vehicleLabel, vehicleBlockedByTimeOff, buildTitle, isToday, formatLongDate, formatDuration, technicianColor, areaKey, STATUS_META, timeSlotText } from "../data/domain";
import { getAiRouteSuggestion } from "../lib/dataStore";
import { DateSelector } from "../components/common";
import { OrderCardCompact } from "../components/OrderCardCompact";

// ---------------------------------------------------------------------------
// Planlægning + Kørsel er fusioneret til ÉN fane (august 2026). Begrundelse:
// de to sider dækkede reelt samme arbejdsopgave (holde styr på dagens/ugens
// sager og montører) fra to forskellige vinkler, og krævede at man sprang
// frem og tilbage mellem faner for at få det fulde billede. Siden er bygget
// om fra bunden med ÉT primært formål for øje: gøre det hurtigt at
// OMFORDELE sager, når en montør bliver syg, eller et besøg var forgæves -
// det er den hyppigste, mest tidskritiske opgave i den daglige planlægning,
// og har derfor sit eget værktøj øverst (se QuickReassign), i stedet for at
// drukne blandt alt det andet på siden.
// ---------------------------------------------------------------------------

function daysLate(dato, today) {
  const d1 = new Date(dato + "T00:00:00");
  const d2 = new Date(today + "T00:00:00");
  return Math.round((d2 - d1) / 86400000);
}

// En sag kan kræve handling af FLERE grunde nu, ikke kun "ikke tildelt"
// eller "forsinket": tildeles en montør der er markeret fraværende (ferie/
// sygdom) på sagens dato, eller hvis montørens nuværende bil er ude af
// drift, kan sagen reelt ikke gennemføres som planlagt - og skal opdages
// HER, ikke først når montøren alligevel ikke dukker op.
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

  // Mest presserende først: montør-problem eller forsinket+utildelt vejer
  // tungest (kan ikke gennemføres som planlagt), derefter ren forsinkelse,
  // derefter bare ikke tildelt endnu.
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

const WORKDAY_MINUTES = 450;
function hoursLabel(minutes) {
  if (minutes === 0) return "–";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}t${m}m` : `${h}t`;
}

function WeeklyCapacity({ orders, technicians }) {
  const [open, setOpen] = useState(false);
  const today = todayISO();
  const week = weekDays(today);
  const dayName = (d) => new Date(d + "T00:00:00").toLocaleDateString("da-DK", { weekday: "short" });
  const rows = [...technicians, { id: null, navn: "Ikke tildelt" }];

  const cellFor = (technicianId, day) => {
    const dayOrders = orders.filter((o) => o.montorId === technicianId && o.dato === day && o.status !== "afsluttet");
    const minutes = dayOrders.reduce((sum, o) => sum + orderExpectedMinutes(o), 0);
    return { count: dayOrders.length, minutes };
  };

  return (
    <div className="rounded-xl border border-line bg-white mb-4 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full p-3 flex items-center gap-2 text-left">
        <Gauge size={15} className="text-muted shrink-0" />
        <span className="text-sm font-semibold uppercase tracking-wide text-ink flex-1">Ugens kapacitet</span>
        <ChevronDown size={16} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3 pb-3">
          <p className="text-[11px] text-muted mb-2">Bookede timer pr. montør, dag for dag. Rødt = mere end en arbejdsdag booket ({hoursLabel(WORKDAY_MINUTES)}).</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line">
                  <th className="text-left p-1.5 text-muted font-semibold uppercase tracking-wide">Montør</th>
                  {week.map((d) => (
                    <th key={d} className={`text-center p-1.5 font-semibold uppercase tracking-wide ${d === today ? "text-brand" : "text-muted"}`}>{dayName(d)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id || "utildelt"} className="border-b border-divider last:border-b-0">
                    <td className="p-1.5 text-ink font-medium whitespace-nowrap">{r.navn}</td>
                    {week.map((d) => {
                      const { count, minutes } = cellFor(r.id, d);
                      const overloaded = minutes > WORKDAY_MINUTES;
                      return (
                        <td key={d} className="p-1.5 text-center">
                          {count === 0 ? <span className="text-line">–</span> : (
                            <span className={`inline-flex flex-col items-center px-1.5 py-0.5 rounded-lg ${overloaded ? "bg-danger text-white" : "bg-panel text-ink"}`} title={`${count} ${count === 1 ? "sag" : "sager"} · ${hoursLabel(minutes)}`}>
                              <span className="font-semibold">{hoursLabel(minutes)}</span>
                              <span className="text-[9px] opacity-80">{count} {count === 1 ? "sag" : "sager"}</span>
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Omfordel hurtigt (sygdom / forgæves besøg) ----------------
// Det primære værktøj på siden: vælg en montør + dato (typisk i dag), se
// alle deres sager den dag, og flyt hver enkelt til en anden montør med ét
// tryk - uden at skulle åbne sagerne én for én. Dækker BÅDE "montøren er
// syg i dag" (flyt hele dagen) og "ét bestemt besøg var forgæves" (flyt kun
// den ene sag). Fraværsmarkering (ferie/sygdom) vises som et tydeligt
// varsel, hvis den valgte montør allerede er registreret fraværende denne
// dag (se Admin -> Montører for selve registreringen).
function QuickReassign({ orders, technicians, timeOff, selectedDate, onAssign, onOpen }) {
  const [technicianId, setTechnicianId] = useState("");
  const technician = technicians.find((m) => m.id === technicianId);
  const dayOrders = orders
    .filter((o) => o.montorId === technicianId && o.dato === selectedDate && o.status !== "afsluttet")
    .sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  const onLeave = technicianId && (timeOff || []).some((f) => f.montorId === technicianId && selectedDate >= f.startDato && selectedDate <= f.slutDato);

  return (
    <div className="rounded-xl border border-brand bg-brand/5 p-4 mb-4">
      <p className="text-sm font-semibold text-ink mb-1 flex items-center gap-1.5"><Users size={15} className="text-brand" /> Omfordel hurtigt</p>
      <p className="text-xs text-muted mb-3">Ved sygdom eller et forgæves besøg — vælg montøren, se deres sager for {isToday(selectedDate) ? "i dag" : formatLongDate(selectedDate)}, og flyt dem videre med det samme.</p>
      <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} className="w-full sm:w-64 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand mb-3">
        <option value="">Vælg montør...</option>
        {technicians.map((m) => <option key={m.id} value={m.id}>{m.navn}</option>)}
      </select>

      {onLeave && (
        <p className="text-xs text-danger font-semibold mb-2 flex items-center gap-1.5"><AlertCircle size={13} /> {technician?.navn} er registreret fraværende denne dag.</p>
      )}

      {technicianId && (
        dayOrders.length === 0 ? (
          <p className="text-xs text-muted italic">Ingen sager for {technician?.navn} denne dag.</p>
        ) : (
          <div className="space-y-2">
            {dayOrders.map((o) => (
              <div key={o.id} className="flex items-center gap-2 rounded-lg bg-white border border-line p-2.5 flex-wrap">
                <div onClick={() => onOpen(o.id)} className="min-w-0 flex-1 cursor-pointer">
                  <p className="text-xs font-mono text-muted">{o.start}–{o.slut}</p>
                  <p className="text-sm font-semibold text-ink truncate">{buildTitle(o.varelinjer)}</p>
                  <p className="text-xs text-muted truncate">{o.kunde.navn} · {o.kunde.adresse}</p>
                </div>
                <select
                  onChange={(e) => onAssign(o.id, e.target.value || null)}
                  defaultValue=""
                  className="rounded-lg border border-brand text-brand font-semibold px-2 py-1.5 text-xs focus:outline-none shrink-0"
                >
                  <option value="" disabled>Flyt til...</option>
                  <option value="">Ikke tildelt</option>
                  {technicians.filter((m) => m.id !== technicianId).map((m) => <option key={m.id} value={m.id}>{m.navn}</option>)}
                </select>
              </div>
            ))}
          </div>
        )
      )}
      <p className="text-[10px] text-muted mt-3">Skal en sag flyttes til en ANDEN dato (ikke bare en anden montør), åbn sagen og redigér bookingen der.</p>
    </div>
  );
}

// ---------------- Dagens tidslinje (flyttet ind fra Kørsel) ----------------

const toMinutes = (hhmm) => {
  if (!/^\d{2}:\d{2}$/.test(hhmm || "")) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

function TimelineRowHeader({ r, loadMinutes, vehicles, technicians, timeOff, selectedDate, onUpdateTechnician }) {
  const [editing, setEditing] = useState(false);
  const [vehicleId, setVehicleId] = useState(r.bilId || "");
  const linkedVehicle = vehicles.find((b) => b.id === r.bilId);
  const timeOffBlock = vehicleBlockedByTimeOff(r.bilId, selectedDate, technicians, timeOff);

  if (!r.id) {
    return <div className="min-w-0"><p className="text-xs font-semibold text-ink truncate">{r.navn}</p></div>;
  }

  const save = (newVehicleId) => { onUpdateTechnician(r.id, { bilId: newVehicleId || null }); setEditing(false); };

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
      {loadMinutes > 0 && <p className="text-[10px] text-brand font-semibold flex items-center gap-1"><Clock size={9} /> {formatDuration(loadMinutes)} planlagt</p>}
      {linkedVehicle?.lukket && <p className="text-[10px] text-danger font-semibold flex items-center gap-1"><AlertCircle size={9} /> Bil lukket ({linkedVehicle.lukketAarsag || "værksted"})</p>}
      {!linkedVehicle?.lukket && timeOffBlock && <p className="text-[10px] text-danger font-semibold flex items-center gap-1"><AlertCircle size={9} /> {timeOffBlock.montor.navn} holder ferie</p>}
    </div>
  );
}

function DailyTimeline({ orders, technicians, vehicles, timeOff, selectedDate, onOpen, onUpdateTechnician }) {
  const [open, setOpen] = useState(true);
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

  return (
    <div className="rounded-xl border border-line bg-white mb-4 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full p-3 flex items-center gap-2 text-left">
        <Clock size={15} className="text-muted shrink-0" />
        <span className="text-sm font-semibold uppercase tracking-wide text-ink flex-1">Dagens tidslinje</span>
        <ChevronDown size={16} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
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
              return (
                <div key={r.id || "utildelt"} className="flex border-b border-divider">
                  <div className="w-[140px] shrink-0 border-r border-line p-2 flex items-center gap-2 bg-panel">
                    {r.id ? <span className="w-2 h-2 rounded-full shrink-0" style={{ background: technicianColor(r.id, technicians) }} /> : <span className="w-2 h-2 rounded-full shrink-0 border border-brand" />}
                    <TimelineRowHeader r={r} loadMinutes={loadMinutes} vehicles={vehicles} technicians={technicians} timeOff={timeOff} selectedDate={selectedDate} onUpdateTechnician={onUpdateTechnician} />
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
      )}
    </div>
  );
}

// ---------------- Ugens områdefordeling + AI-ruteforslag (flyttet ind fra Kørsel) ----------------

function WeeklyAreas({ orders, technicians, selectedDate }) {
  const [open, setOpen] = useState(false);
  const [aiAnswer, setAiAnswer] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);

  const week = weekDays(selectedDate);
  const weekOrders = orders.filter((s) => week.includes(s.dato) && s.kunde?.adresse);
  const areas = {};
  weekOrders.forEach((s) => {
    const key = areaKey(s.kunde.adresse);
    if (!key) return;
    if (!areas[key]) areas[key] = {};
    if (!areas[key][s.dato]) areas[key][s.dato] = [];
    areas[key][s.dato].push(s);
  });
  const areaNames = Object.keys(areas).sort();
  const technicianName = (id) => technicians.find((m) => m.id === id)?.navn;

  const isProblem = (key) => {
    const doubleCovered = week.some((d) => new Set((areas[key]?.[d] || []).filter((s) => s.montorId).map((s) => s.montorId)).size > 1);
    const spread = week.filter((d) => (areas[key]?.[d] || []).length > 0).length >= 2;
    return doubleCovered || spread;
  };

  const askAI = async () => {
    setAiLoading(true); setAiError(null); setAiAnswer(null);
    const basis = weekOrders.map((s) => ({
      sag: s.nr, dato: s.dato, tidsrum: timeSlotText(s.tidsrumId), adresse: s.kunde.adresse,
      bil: technicianName(s.montorId) || "ikke tildelt", forventetVarighed: formatDuration(orderExpectedMinutes(s)),
    }));
    const technicianText = technicians.map((m) => `${m.navn} (${m.bil})`).join(", ");
    const result = await getAiRouteSuggestion({ grundlag: basis, montorTekst: technicianText, valgtDato: selectedDate });
    setAiLoading(false);
    if (!result.ok) { setAiError(result.fejl || "Kunne ikke hente AI-forslag lige nu. Prøv igen om lidt."); return; }
    setAiAnswer(result.tekst);
  };

  if (areaNames.length === 0) return null;

  return (
    <div className="rounded-xl border border-line bg-white mb-4 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full p-3 flex items-center gap-2 text-left">
        <AlertCircle size={15} className="text-muted shrink-0" />
        <span className="text-sm font-semibold uppercase tracking-wide text-ink flex-1">Ugens områdefordeling</span>
        <ChevronDown size={16} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-line pt-3">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <p className="text-xs text-muted">Grupperet på postnummer/by. Bruges til at opdage dobbeltkørsel og spredte besøg — ikke reel kørselsafstand.</p>
            <button onClick={askAI} disabled={aiLoading} className="text-xs font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors px-3 py-1.5 rounded-lg disabled:opacity-50 shrink-0">
              {aiLoading ? "Analyserer..." : "Bed AI om ruteforslag"}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line">
                  <th className="text-left p-2 text-muted font-semibold uppercase tracking-wide">Område</th>
                  {week.map((d) => (
                    <th key={d} className={`text-center p-2 font-semibold uppercase tracking-wide ${isToday(d) ? "text-brand" : "text-muted"}`}>{new Date(d + "T00:00:00").toLocaleDateString("da-DK", { weekday: "short" })}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {areaNames.map((key) => (
                  <tr key={key} className="border-b border-divider">
                    <td className="p-2 text-ink font-medium whitespace-nowrap">{key}{isProblem(key) && <AlertCircle size={11} className="inline ml-1 -mt-0.5 text-brand" />}</td>
                    {week.map((d) => {
                      const here = areas[key]?.[d] || [];
                      const uniqueVehicles = new Set(here.filter((s) => s.montorId).map((s) => s.montorId));
                      const problem = here.length > 0 && uniqueVehicles.size > 1;
                      return (
                        <td key={d} className="p-2 text-center">
                          {here.length > 0 && (
                            <span className={`inline-flex items-center justify-center min-w-[20px] px-1 rounded-md text-[10px] font-semibold ${problem ? "bg-danger text-white" : "bg-panel text-ink"}`} title={here.map((s) => `${s.kunde.navn} — ${technicianName(s.montorId) || "ikke tildelt"}`).join(" · ")}>{here.length}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted mt-2">Rødt tal = flere biler i samme område samme dag. ⚠ = dobbeltdækket eller besøgt spredt over ugen.</p>
          {aiError && <p className="text-xs text-danger mt-2">{aiError}</p>}
          {aiAnswer && (
            <div className="mt-3 rounded-xl border border-ink bg-panel p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink mb-1.5">AI-forslag til bedre ruteplanlægning</p>
              <div className="text-sm text-ink whitespace-pre-wrap">{aiAnswer}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlanningPage({ orders, technicians, vehicles, timeOff, selectedDate, onDateChange, onOpen, onCycleStatus, onAssign, onUpdateTechnician, onRefresh, refreshing }) {
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
          <QuickReassign orders={orders} technicians={technicians} timeOff={timeOff} selectedDate={selectedDate} onAssign={onAssign} onOpen={onOpen} />

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
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {needsAction.map((s) => (
                    <OrderCardCompact key={s.id} order={s} technicians={technicians} onOpen={onOpen} onCycleStatus={onCycleStatus} onAssign={onAssign} reason={<ReasonLine order={s} />} accent={actionReason(s).color} />
                  ))}
                </div>
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

          <DailyTimeline orders={orders} technicians={technicians} vehicles={vehicles} timeOff={timeOff} selectedDate={selectedDate} onOpen={onOpen} onUpdateTechnician={onUpdateTechnician} />
          <WeeklyAreas orders={orders} technicians={technicians} selectedDate={selectedDate} />
          <WeeklyCapacity orders={orders} technicians={technicians} />

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
