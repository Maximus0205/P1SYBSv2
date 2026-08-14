import React, { useMemo, useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, ChevronDown, Gauge, PlayCircle, Search, Sparkles, UserX, X } from "lucide-react";
import { orderExpectedMinutes, todayISO, weekDays } from "../data/domain";
import { OrderCardCompact } from "../components/OrderCardCompact";

// Kernen i denne side: find de sager der kræver handling NU, så ingen
// kunde bliver glemt. En sag kræver handling hvis:
//  - den ikke har en montør tildelt endnu (uanset dato), ELLER
//  - dens dato er passeret uden at den er markeret afsluttet (den er
//    "hængt" - enten glemt planlagt, eller startet men aldrig færdiggjort).
// Alt andet (planlagt fremad i tiden, i gang i dag, allerede afsluttet) er
// bevidst underprioriteret i visningen - det er ikke der, opmærksomheden
// skal være.
function daysLate(dato, today) {
  const d1 = new Date(dato + "T00:00:00");
  const d2 = new Date(today + "T00:00:00");
  return Math.round((d2 - d1) / 86400000);
}

function classify(orders) {
  const today = todayISO();
  const needsAction = [];
  const inProgressToday = [];
  const upcoming = [];
  const done = [];

  for (const s of orders) {
    if (s.status === "afsluttet") { done.push(s); continue; }
    const unassigned = !s.montorId;
    const overdue = s.dato < today;
    if (unassigned || overdue) {
      needsAction.push({ ...s, _unassigned: unassigned, _overdue: overdue, _daysLate: overdue ? daysLate(s.dato, today) : 0 });
      continue;
    }
    if (s.status === "igang" && s.dato === today) { inProgressToday.push(s); continue; }
    upcoming.push(s);
  }

  // Mest presserende først: både ikke tildelt OG forsinket vejer tungest,
  // derefter ren forsinkelse (flest dage forsinket øverst), derefter bare
  // ikke tildelt endnu (sorteret efter dato, snarest først).
  needsAction.sort((a, b) => {
    const score = (x) => (x._unassigned ? 1 : 0) + (x._overdue ? 1 : 0);
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

// Søger på tværs af ALLE ordrer (uanset status/dato) i sagsnummer,
// ordrenummer, telefon, adresse og kundenavn - til sporbarhed, fx når en
// kunde ringer ind og kun kan oplyse sit telefonnummer eller fakturanummer.
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

// Farverne her hentes fra det centrale tema (tailwind.config.js), så
// "reason"-mærket i kortet (se OrderCardCompact) altid matcher brand-temaet.
const ACTION_RED = "#B3261E";
const ACTION_BRAND = "#C8232E";

// Hvad kortet skal vise (farve + tekst) - beregnet én gang, brugt til
// BÅDE kantfarven og teksten, så de altid stemmer overens.
function actionReason(order) {
  if (order._unassigned && order._overdue) return { color: ACTION_RED, text: `Ikke tildelt · ${order._daysLate} ${order._daysLate === 1 ? "dag" : "dage"} forsinket` };
  if (order._unassigned) return { color: ACTION_BRAND, text: "Ikke tildelt montør" };
  return { color: ACTION_RED, text: `${order._daysLate} ${order._daysLate === 1 ? "dag" : "dage"} forsinket` };
}

// Lille tekstlinje der forklarer PRÆCIS hvorfor sagen kræver handling -
// vises INDE i selve kortet (via OrderCardCompacts reason-prop), ikke som
// en løsrevet boks ovenpå.
function ReasonLine({ order }) {
  const { color, text } = actionReason(order);
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1" style={{ color }}>
      <UserX size={12} /> {text}
    </p>
  );
}

// Sammenklappelig sektion til det, der IKKE kræver handling lige nu -
// holdt ude af syne som udgangspunkt, så mobilskærmen ikke fyldes med
// sager der allerede er under kontrol.
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

// En arbejdsdag regnes her som ca. 7,5 time (450 min) - en dag med mere
// booket end det flages som overbooket, så man kan se det FØR flere sager
// lægges oveni, i stedet for at opdage det for sent på selve dagen.
const WORKDAY_MINUTES = 450;

function hoursLabel(minutes) {
  if (minutes === 0) return "–";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}t${m}m` : `${h}t`;
}

// Ugekapacitetsoverblik: hvor meget er hver montør booket til, dag for
// dag, resten af ugen - så man kan se hvem der er ved at blive
// overbooket, INDEN man lægger endnu en sag oven i en allerede fuld dag.
// Tæller kun sager der ikke allerede er afsluttet (afsluttet arbejde
// belaster ikke den fremadrettede kapacitet).
function WeeklyCapacity({ orders, technicians }) {
  const [open, setOpen] = useState(true);
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
          <p className="text-[11px] text-muted mb-2">Bookede timer pr. montør, dag for dag. Rødt = mere end en arbejdsdag booket ({hoursLabel(WORKDAY_MINUTES)}) - overvej at flytte noget, før der lægges mere oveni.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line">
                  <th className="text-left p-1.5 text-muted font-semibold uppercase tracking-wide">Montør</th>
                  {week.map((d) => (
                    <th key={d} className={`text-center p-1.5 font-semibold uppercase tracking-wide ${d === today ? "text-brand" : "text-muted"}`}>
                      {dayName(d)}
                    </th>
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
                          {count === 0 ? (
                            <span className="text-line">–</span>
                          ) : (
                            <span
                              className={`inline-flex flex-col items-center px-1.5 py-0.5 rounded-lg ${overloaded ? "bg-danger text-white" : "bg-panel text-ink"}`}
                              title={`${count} ${count === 1 ? "sag" : "sager"} · ${hoursLabel(minutes)}`}
                            >
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

function PlanningPage({ orders, technicians, onOpen, onCycleStatus, onAssign }) {
  const [search, setSearch] = useState("");
  const { needsAction, inProgressToday, upcoming, done } = useMemo(() => classify(orders), [orders]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    return [...orders].filter((s) => matchesSearch(s, search)).sort((a, b) => (b.dato + b.start).localeCompare(a.dato + a.start));
  }, [orders, search]);

  return (
    <div>
      <p className="font-mono text-[11px] tracking-widest uppercase text-brand mb-1">Overblik</p>
      <h1 className="font-display text-4xl uppercase tracking-tight text-ink mb-1">Planlægning</h1>
      <p className="text-sm text-muted mb-4">Sager der kræver handling — ikke tildelt en montør, eller forsinkede uden at være afsluttet.</p>

      <div className="relative mb-6">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Søg efter sagsnr., ordre-/fakturanr., telefon, adresse eller kundenavn..."
          className="w-full rounded-lg border border-line bg-white pl-9 pr-9 py-2.5 text-sm text-ink focus:outline-none focus:border-brand"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-brand">
            <X size={16} />
          </button>
        )}
      </div>

      {searchResults ? (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink mb-3">
            {searchResults.length} {searchResults.length === 1 ? "match" : "matches"} på "{search}"
          </h2>
          {searchResults.length === 0 ? (
            <p className="text-sm text-muted italic">Ingen sager matcher søgningen — tjek stavning, eller søg på et andet felt (sagsnr., ordrenr., telefon, adresse, kundenavn).</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {searchResults.map((s) => <OrderCardCompact key={s.id} order={s} technicians={technicians} onOpen={onOpen} onCycleStatus={onCycleStatus} />)}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Hovedfokus: sager der kræver handling - altid åben, øverst, aldrig gemt væk.
              Ren hvid kortoverflade med en rød topkant som eneste "alarm"-signal,
              i stedet for en gennemgående farvet baggrund - renere på en smal skærm. */}
          <div className="rounded-xl bg-white border border-line mb-4 overflow-hidden" style={{ borderTopWidth: 4, borderTopColor: ACTION_RED }}>
            <div className="p-3 border-b border-line flex items-center gap-2">
              <AlertCircle size={17} className="text-danger shrink-0" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink flex-1">Kræver handling</h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-danger text-white">{needsAction.length}</span>
            </div>
            <div className="p-3">
              {needsAction.length === 0 ? (
                <p className="text-sm text-success font-medium flex items-center gap-2 py-2">
                  <Sparkles size={16} /> Intet hænger — alle sager er enten tildelt en montør eller afsluttet til tiden.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {needsAction.map((s) => (
                    <OrderCardCompact
                      key={s.id}
                      order={s}
                      technicians={technicians}
                      onOpen={onOpen}
                      onCycleStatus={onCycleStatus}
                      onAssign={onAssign}
                      reason={<ReasonLine order={s} />}
                      accent={actionReason(s).color}
                    />
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

          <WeeklyCapacity orders={orders} technicians={technicians} />

          {/* Under kontrol - klap sammen som udgangspunkt, især vigtigt på mobil */}
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
