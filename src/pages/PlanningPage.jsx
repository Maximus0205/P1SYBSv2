import React, { useMemo, useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, PlayCircle, Search, Sparkles, UserX, X, Users, RefreshCw, Pencil, KeyRound, Clock, Check } from "lucide-react";
import { orderExpectedMinutes, todayISO, addDays, weekDays, vehicleLabel, vehicleBlockedByTimeOff, buildTitle, isToday, formatLongDate, formatDuration, technicianColor, STATUS_META } from "../data/domain";
import { getAiRouteSuggestion } from "../lib/dataStore";
import { DateSelector } from "../components/common";
import { OrderCardCompact } from "../components/OrderCardCompact";

// ---------------------------------------------------------------------------
// Planlægning + Kørsel er fusioneret til ÉN fane (august 2026). Siden er
// bygget med ÉT primært formål for øje: gøre det hurtigt at OMFORDELE
// sager, når en montør bliver syg, eller et besøg var forgæves - den
// hyppigste, mest tidskritiske opgave i den daglige planlægning. Se
// QuickReassign, som kombinerer en bladbar uge-kalender (kapacitetsoverblik
// pr. montør/dag) med selve omfordelingen ét sted.
//
// "Ugens områdefordeling" (postnummer-baseret dobbeltkørsels-tjek) er
// fjernet igen - vurderet overflødig oven på QuickReassigns ugevisning og
// Kræver-handling-sektionen.
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
// Foreslår, PR. SAG i listen, hvilken montør der bedst kan tage den - ud fra
// ledig kapacitet og geografisk naerhed til andre allerede bookede sager
// (samme underliggende edge function som booking-flowets AI-forslag, se
// ai-ruteforslag: kraeverHandling-feltet giver ét svar pr. sag i stedet for
// bare ét svar i alt). Rådgivende, ikke automatisk: hvert forslag skal
// trykkes "Tildel" for at blive anvendt. Retter KUN montør - forsinkede
// sager kan stadig kraeve at datoen ogsaa rettes manuelt (aabn sagen).

// Loftet er sat ud fra Gemini's output-token-graense (se ai-ruteforslag i
// Supabase): hver sag koster ca. 60-80 tokens at faa et struktureret svar
// for, og modellen kan reelt kun levere op til ca. 8000 tokens tilbage pr.
// kald. Sendes flere sager end det, bliver AI-svaret afskaaret midt i
// JSON'en og kan slet ikke laeses (det var den oprindelige 503/502-fejl).
// needsAction er allerede sorteret efter alvorlighed i classify() ovenfor,
// saa de vigtigste sager er altid dem der rent faktisk faar et forslag.
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
    // Bred kontekst (kapacitet/geografi) - alle ikke-afsluttede, allerede
    // TILDELTE sager de kommende to uger, så AI'en kan se hvem der har plads.
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

  const visible = (solutions || []).filter((s) => !applied[s.sag]);

  return (
    <div className="rounded-xl border border-ink bg-panel p-3 mb-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink flex items-center gap-1.5"><Sparkles size={13} /> AI-forslag til løsning</p>
        <button onClick={ask} disabled={loading} className="text-xs font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors px-3 py-1.5 rounded-lg disabled:opacity-50">
          {loading ? "Analyserer..." : "Bed AI om forslag"}
        </button>
      </div>

      {!solutions && !error && !loading && (
        <p className="text-[11px] text-muted mt-1.5">Foreslår en montør til hver sag nedenfor, ud fra ledig kapacitet og geografisk nærhed. Rådgivende — retter kun montør; forsinkede sager kan stadig kræve, du selv retter datoen (åbn sagen).{truncated ? ` Kun de ${AI_BATCH_LIMIT} mest kritiske sager (ud af ${needsAction.length}) sendes til AI'en ad gangen.` : ""}</p>
      )}
      {error && <p className="text-xs text-danger mt-2">{error}</p>}

      {solutions && (
        visible.length === 0 ? (
          <p className="text-xs text-success mt-2 flex items-center gap-1.5"><Check size={13} /> Alle forslag er anvendt.</p>
        ) : (
          <div className="space-y-1.5 mt-2">
            {truncated && (
              <p className="text-[11px] text-muted">Kun de {AI_BATCH_LIMIT} mest kritiske sager (ud af {needsAction.length}) fik et forslag denne omgang - kør igen bagefter for de næste.</p>
            )}
            {visible.map((s) => {
              const order = aiTargets.find((o) => o.nr === s.sag);
              const technician = technicians.find((m) => m.navn === s.montorNavn);
              if (!order) return null;
              return (
                <div key={s.sag} className="flex items-center gap-2 rounded-lg bg-white border border-line p-2.5 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-mono text-muted">#{s.sag}</p>
                    <p className="text-sm text-ink">{technician ? <span className="font-semibold">{technician.navn}</span> : <span className="text-muted italic">Intet klart forslag</span>}</p>
                    {s.begrundelse && <p className="text-[11px] text-muted">{s.begrundelse}</p>}
                  </div>
                  {technician && (
                    <button onClick={() => apply(s.sag, order.id, technician.id)} className="text-xs font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors px-3 py-1.5 rounded-lg shrink-0">
                      Tildel
                    </button>
                  )}
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

// ---------------- Omfordel hurtigt: bladbar ugekalender + omfordeling ----------------
function QuickReassign({ orders, technicians, timeOff, onAssign, onOpen }) {
  const [weekAnchor, setWeekAnchor] = useState(todayISO());
  const [selected, setSelected] = useState(null); // { technicianId, date } | null
  const week = weekDays(weekAnchor);
  const today = todayISO();
  const rows = [...technicians, { id: null, navn: "Ikke tildelt" }];

  const cellFor = (technicianId, day) => {
    const dayOrders = (orders || []).filter((o) => o.montorId === technicianId && o.dato === day && o.status !== "afsluttet");
    const minutes = dayOrders.reduce((sum, o) => sum + orderExpectedMinutes(o), 0);
    return { count: dayOrders.length, minutes };
  };

  const selectedTechnician = selected && technicians.find((m) => m.id === selected.technicianId);
  const selectedOrders = selected
    ? orders.filter((o) => o.montorId === selected.technicianId && o.dato === selected.date && o.status !== "afsluttet").sort((a, b) => (a.start || "").localeCompare(b.start || ""))
    : [];
  const onLeave = selected && (timeOff || []).some((f) => f.montorId === selected.technicianId && selected.date >= f.startDato && selected.date <= f.slutDato);

  return (
    <div className="rounded-xl border border-brand bg-brand/5 p-4 mb-4">
      <p className="text-sm font-semibold text-ink mb-1 flex items-center gap-1.5"><Users size={15} className="text-brand" /> Omfordel hurtigt</p>
      <p className="text-xs text-muted mb-3">Bookede timer pr. montør, dag for dag — klik en dag for at se og omfordele sagerne, fx ved sygdom eller et forgæves besøg.</p>

      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setWeekAnchor((w) => addDays(w, -7))} className="p-1.5 rounded-lg text-muted hover:text-brand border border-line hover:border-brand transition-colors bg-white" title="Forrige uge">
          <ChevronLeft size={14} />
        </button>
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink">{shortDateLabel(week[0])} – {shortDateLabel(week[6])}</p>
          {weekAnchor !== today && <button onClick={() => setWeekAnchor(today)} className="text-[10px] font-semibold uppercase tracking-wide text-brand hover:underline">Gå til denne uge</button>}
        </div>
        <button onClick={() => setWeekAnchor((w) => addDays(w, 7))} className="p-1.5 rounded-lg text-muted hover:text-brand border border-line hover:border-brand transition-colors bg-white" title="Næste uge">
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line">
              <th className="text-left p-1.5 text-muted font-semibold uppercase tracking-wide">Montør</th>
              {week.map((d) => (
                <th key={d} className={`text-center p-1.5 font-semibold uppercase tracking-wide ${d === today ? "text-brand" : "text-muted"}`}>{shortDayLabel(d)}</th>
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
                  const isSel = selected && selected.technicianId === r.id && selected.date === d;
                  return (
                    <td key={d} className="p-1">
                      <button
                        onClick={() => r.id && setSelected(isSel ? null : { technicianId: r.id, date: d })}
                        disabled={!r.id}
                        title={`${r.navn} · ${shortDateLabel(d)}${count > 0 ? ` · ${count} ${count === 1 ? "sag" : "sager"}, ${hoursLabel(minutes)}` : ", ledig"}`}
                        className={`w-full flex items-center justify-center py-1.5 rounded-lg border transition-colors ${isSel ? "border-brand bg-brand/10" : "border-transparent hover:border-line"} ${!r.id ? "cursor-default" : ""}`}
                      >
                        {count === 0 ? (
                          <span className="text-line">–</span>
                        ) : (
                          <span className={`px-1.5 py-0.5 rounded-md font-semibold ${overloaded ? "bg-danger text-white" : "bg-panel text-ink"}`}>{hoursLabel(minutes)}</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted mt-2">Rødt = mere end en arbejdsdag booket ({hoursLabel(WORKDAY_MINUTES)}). Klik en montørs dag for at omfordele.</p>

      {selected && (
        <div className="mt-3 pt-3 border-t border-line">
          <p className="text-sm font-semibold text-ink mb-2">{selectedTechnician?.navn} — {formatLongDate(selected.date)}</p>
          {onLeave && <p className="text-xs text-danger font-semibold mb-2 flex items-center gap-1.5"><AlertCircle size={13} /> Registreret fraværende denne dag.</p>}
          {selectedOrders.length === 0 ? (
            <p className="text-xs text-muted italic">Ingen sager denne dag.</p>
          ) : (
            <div className="space-y-2">
              {selectedOrders.map((o) => (
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
                    {technicians.filter((m) => m.id !== selected.technicianId).map((m) => <option key={m.id} value={m.id}>{m.navn}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-muted mt-2">Skal en sag flyttes til en ANDEN dato (ikke bare en anden montør), åbn sagen og redigér bookingen der.</p>
        </div>
      )}
    </div>
  );
}

// ---------------- Dagens tidslinje ----------------

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
          <QuickReassign orders={orders} technicians={technicians} timeOff={timeOff} onAssign={onAssign} onOpen={onOpen} />

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

          <DailyTimeline orders={orders} technicians={technicians} vehicles={vehicles} timeOff={timeOff} selectedDate={selectedDate} onOpen={onOpen} onUpdateTechnician={onUpdateTechnician} />

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
