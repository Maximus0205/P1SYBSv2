import React, { useMemo, useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, ChevronDown, PlayCircle, Search, Sparkles, UserX, X } from "lucide-react";
import { todayISO } from "../data/domain";
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

// Lille mærke ovenpå kortet der forklarer PRÆCIS hvorfor sagen kræver
// handling - så man ikke skal regne det ud selv.
function ReasonBadge({ order }) {
  if (order._unassigned && order._overdue) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 bg-[#B3261E] text-white">
        <UserX size={11} /> Ikke tildelt · {order._daysLate} {order._daysLate === 1 ? "dag" : "dage"} forsinket
      </span>
    );
  }
  if (order._unassigned) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 bg-[#E2621B] text-white">
        <UserX size={11} /> Ikke tildelt montør
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 bg-[#B3261E] text-white">
      <AlertCircle size={11} /> {order._daysLate} {order._daysLate === 1 ? "dag" : "dage"} forsinket
    </span>
  );
}

// Sammenklappelig sektion til det, der IKKE kræver handling lige nu -
// holdt ude af syne som udgangspunkt, så mobilskærmen ikke fyldes med
// sager der allerede er under kontrol.
function CollapsibleSection({ title, icon: Icon, color, items, technicians, onOpen, onCycleStatus, emptyText }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[#D8D0BE] bg-white">
      <button onClick={() => setOpen((v) => !v)} className="w-full p-3 flex items-center gap-2 text-left">
        <Icon size={15} style={{ color }} className="shrink-0" />
        <span className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] flex-1">{title}</span>
        <span className="text-xs font-mono px-1.5 py-0.5 border border-[#D8D0BE] text-[#52697E]">{items.length}</span>
        <ChevronDown size={16} className={`text-[#52697E] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="p-3 pt-0 grid gap-2 sm:grid-cols-2">
          {items.length === 0 ? (
            <p className="text-xs text-[#52697E] italic pt-2">{emptyText}</p>
          ) : (
            items.map((s) => <OrderCardCompact key={s.id} order={s} technicians={technicians} onOpen={onOpen} onCycleStatus={onCycleStatus} />)
          )}
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
      <p className="font-mono text-[11px] tracking-widest uppercase text-[#E2621B] mb-1">Overblik</p>
      <h1 className="font-['Barlow_Condensed'] text-4xl uppercase tracking-tight text-[#1C232E] mb-1">Planlægning</h1>
      <p className="text-sm text-[#52697E] mb-4">Sager der kræver handling — ikke tildelt en montør, eller forsinkede uden at være afsluttet.</p>

      <div className="relative mb-6">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#52697E]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Søg efter sagsnr., ordre-/fakturanr., telefon, adresse eller kundenavn..."
          className="w-full border border-[#D8D0BE] bg-white pl-9 pr-9 py-2.5 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#52697E] hover:text-[#E2621B]">
            <X size={16} />
          </button>
        )}
      </div>

      {searchResults ? (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">
            {searchResults.length} {searchResults.length === 1 ? "match" : "matches"} på "{search}"
          </h2>
          {searchResults.length === 0 ? (
            <p className="text-sm text-[#52697E] italic">Ingen sager matcher søgningen — tjek stavning, eller søg på et andet felt (sagsnr., ordrenr., telefon, adresse, kundenavn).</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {searchResults.map((s) => <OrderCardCompact key={s.id} order={s} technicians={technicians} onOpen={onOpen} onCycleStatus={onCycleStatus} />)}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Hovedfokus: sager der kræver handling - altid åben, øverst, aldrig gemt væk */}
          <div className="border-2 border-[#B3261E] bg-[#B3261E08] mb-4">
            <div className="p-3 border-b border-[#B3261E]/30 flex items-center gap-2">
              <AlertCircle size={17} className="text-[#B3261E] shrink-0" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] flex-1">Kræver handling</h2>
              <span className="text-xs font-mono px-1.5 py-0.5 bg-[#B3261E] text-white">{needsAction.length}</span>
            </div>
            <div className="p-3">
              {needsAction.length === 0 ? (
                <p className="text-sm text-[#3D7A5C] font-medium flex items-center gap-2 py-2">
                  <Sparkles size={16} /> Intet hænger — alle sager er enten tildelt en montør eller afsluttet til tiden.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {needsAction.map((s) => (
                    <div key={s.id} className="space-y-1.5">
                      <ReasonBadge order={s} />
                      <OrderCardCompact order={s} technicians={technicians} onOpen={onOpen} onCycleStatus={onCycleStatus} onAssign={onAssign} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {inProgressToday.length > 0 && (
            <div className="border border-[#1C7C8C] bg-white mb-4">
              <div className="p-3 border-b border-[#D8D0BE] flex items-center gap-2">
                <PlayCircle size={15} className="text-[#1C7C8C] shrink-0" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] flex-1">I gang i dag</h2>
                <span className="text-xs font-mono px-1.5 py-0.5 border border-[#D8D0BE] text-[#52697E]">{inProgressToday.length}</span>
              </div>
              <div className="p-3 grid gap-2 sm:grid-cols-2">
                {inProgressToday.map((s) => <OrderCardCompact key={s.id} order={s} technicians={technicians} onOpen={onOpen} onCycleStatus={onCycleStatus} />)}
              </div>
            </div>
          )}

          {/* Under kontrol - klap sammen som udgangspunkt, især vigtigt på mobil */}
          <div className="space-y-2">
            <CollapsibleSection title="Planlagt fremad" icon={CalendarClock} color="#52697E" items={upcoming} technicians={technicians} onOpen={onOpen} onCycleStatus={onCycleStatus} emptyText="Ingen kommende planlagte sager." />
            <CollapsibleSection title="Afsluttet" icon={CheckCircle2} color="#3D7A5C" items={done} technicians={technicians} onOpen={onOpen} onCycleStatus={onCycleStatus} emptyText="Ingen afsluttede sager endnu." />
          </div>
        </>
      )}
    </div>
  );
}

export { PlanningPage };
