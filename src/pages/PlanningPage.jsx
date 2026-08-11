import React, { useMemo, useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, Circle, PlayCircle, Search, X } from "lucide-react";
import { todayISO } from "../data/domain";
import { OrderCardCompact } from "../components/OrderCardCompact";

// Grupperer ordrer i faste lister, så det er nemt at se på ét blik hvad der
// mangler at ske: skal bookes, skal genbookes (var planlagt, men datoen er
// passeret uden at blive afsluttet), planlagt, i gang, afsluttet.
function groupOrders(orders) {
  const today = todayISO();
  const groups = { unbooked: [], toRebook: [], planned: [], inProgress: [], done: [] };
  for (const s of orders) {
    if (s.status === "afsluttet") { groups.done.push(s); continue; }
    if (s.status === "igang") { groups.inProgress.push(s); continue; }
    if (!s.montorId) { groups.unbooked.push(s); continue; }
    if (s.dato < today) { groups.toRebook.push(s); continue; }
    groups.planned.push(s);
  }
  const sortByDate = (a, b) => (a.dato + a.start).localeCompare(b.dato + b.start);
  Object.values(groups).forEach((list) => list.sort(sortByDate));
  return groups;
}

const LISTS = [
  { key: "unbooked", label: "Skal bookes", icon: Circle, color: "#B3261E", description: "Ingen montør tildelt endnu." },
  { key: "toRebook", label: "Skal genbookes", icon: AlertCircle, color: "#E2621B", description: "Datoen er passeret, men sagen er ikke afsluttet." },
  { key: "planned", label: "Planlagt", icon: CalendarClock, color: "#52697E", description: "Booket og venter på sin dato." },
  { key: "inProgress", label: "I gang", icon: PlayCircle, color: "#1C7C8C", description: "Montøren er i gang hos kunden." },
  { key: "done", label: "Afsluttet", icon: CheckCircle2, color: "#3D7A5C", description: "Færdige sager." },
];

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

function PlanningPage({ orders, technicians, onOpen, onCycleStatus }) {
  const [showDone, setShowDone] = useState(false);
  const [search, setSearch] = useState("");
  const groups = groupOrders(orders);

  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    return [...orders].filter((s) => matchesSearch(s, search)).sort((a, b) => (b.dato + b.start).localeCompare(a.dato + a.start));
  }, [orders, search]);

  return (
    <div>
      <p className="font-mono text-[11px] tracking-widest uppercase text-[#E2621B] mb-1">Overblik</p>
      <h1 className="font-['Barlow_Condensed'] text-4xl uppercase tracking-tight text-[#1C232E] mb-1">Planlægning</h1>
      <p className="text-sm text-[#52697E] mb-4">Alle sager grupperet efter status — se hurtigt hvad der mangler at blive booket eller genbooket.</p>

      <div className="relative mb-6 max-w-lg">
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
          <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            {LISTS.filter((l) => l.key !== "done" || showDone).map(({ key, label, icon: Icon, color, description }) => {
              const list = groups[key];
              return (
                <div key={key} className="border border-[#D8D0BE] bg-[#FCFAF4] flex flex-col min-h-[120px]">
                  <div className="p-3 border-b border-[#D8D0BE] flex items-center gap-2">
                    <Icon size={15} style={{ color }} className="shrink-0" />
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] flex-1">{label}</h2>
                    <span className="text-xs font-mono px-1.5 py-0.5 border border-[#D8D0BE] text-[#52697E]">{list.length}</span>
                  </div>
                  <p className="text-[11px] text-[#52697E] px-3 pt-2">{description}</p>
                  <div className="p-3 flex flex-col gap-2 flex-1">
                    {list.length === 0 ? (
                      <p className="text-xs text-[#52697E] italic">Ingen sager her lige nu.</p>
                    ) : (
                      list.map((s) => <OrderCardCompact key={s.id} order={s} technicians={technicians} onOpen={onOpen} onCycleStatus={onCycleStatus} />)
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {!showDone && (
            <button onClick={() => setShowDone(true)} className="mt-5 text-xs font-semibold uppercase tracking-wide text-[#52697E] hover:text-[#E2621B] underline">
              Vis også afsluttede sager ({groups.done.length})
            </button>
          )}
        </>
      )}
    </div>
  );
}

export { PlanningPage };
