import React, { useMemo, useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, Circle, PlayCircle, Search, X } from "lucide-react";
import { todayISO } from "../data/domain";
import { SagKortKompakt } from "../components/SagKortKompakt";

// Grupperer sager i faste lister, så det er nemt at se på ét blik hvad der
// mangler at ske: skal bookes, skal genbookes (var planlagt, men datoen er
// passeret uden at blive afsluttet), planlagt, i gang, afsluttet.
function grupperSager(sager) {
  const idag = todayISO();
  const grupper = { ikkeBooket: [], skalGenbookes: [], planlagt: [], igang: [], afsluttet: [] };
  for (const s of sager) {
    if (s.status === "afsluttet") { grupper.afsluttet.push(s); continue; }
    if (s.status === "igang") { grupper.igang.push(s); continue; }
    if (!s.montorId) { grupper.ikkeBooket.push(s); continue; }
    if (s.dato < idag) { grupper.skalGenbookes.push(s); continue; }
    grupper.planlagt.push(s);
  }
  const sortDato = (a, b) => (a.dato + a.start).localeCompare(b.dato + b.start);
  Object.values(grupper).forEach((liste) => liste.sort(sortDato));
  return grupper;
}

const LISTER = [
  { key: "ikkeBooket", label: "Skal bookes", icon: Circle, farve: "#B3261E", beskrivelse: "Ingen montør tildelt endnu." },
  { key: "skalGenbookes", label: "Skal genbookes", icon: AlertCircle, farve: "#E2621B", beskrivelse: "Datoen er passeret, men sagen er ikke afsluttet." },
  { key: "planlagt", label: "Planlagt", icon: CalendarClock, farve: "#52697E", beskrivelse: "Booket og venter på sin dato." },
  { key: "igang", label: "I gang", icon: PlayCircle, farve: "#1C7C8C", beskrivelse: "Montøren er i gang hos kunden." },
  { key: "afsluttet", label: "Afsluttet", icon: CheckCircle2, farve: "#3D7A5C", beskrivelse: "Færdige sager." },
];

// Søger på tværs af ALLE sager (uanset status/dato) i sagsnummer,
// ordrenummer, telefon, adresse og kundenavn - til sporbarhed, fx når en
// kunde ringer ind og kun kan oplyse sit telefonnummer eller fakturanummer.
const NORMER = (s) => (s || "").toString().toLowerCase();
function matcherSoegning(sag, soegning) {
  const s = NORMER(soegning);
  if (!s) return true;
  return (
    NORMER(sag.nr).includes(s) ||
    NORMER(sag.ordrenummer).includes(s) ||
    NORMER(sag.kunde?.navn).includes(s) ||
    NORMER(sag.kunde?.telefon).replace(/\s/g, "").includes(s.replace(/\s/g, "")) ||
    NORMER(sag.kunde?.adresse).includes(s)
  );
}

function PlanlaegningSide({ sager, montorer, onOpen, onCycleStatus }) {
  const [visAfsluttet, setVisAfsluttet] = useState(false);
  const [soegning, setSoegning] = useState("");
  const grupper = grupperSager(sager);

  const soegeresultater = useMemo(() => {
    if (!soegning.trim()) return null;
    return [...sager].filter((s) => matcherSoegning(s, soegning)).sort((a, b) => (b.dato + b.start).localeCompare(a.dato + a.start));
  }, [sager, soegning]);

  return (
    <div>
      <p className="font-mono text-[11px] tracking-widest uppercase text-[#E2621B] mb-1">Overblik</p>
      <h1 className="font-['Barlow_Condensed'] text-4xl uppercase tracking-tight text-[#1C232E] mb-1">Planlægning</h1>
      <p className="text-sm text-[#52697E] mb-4">Alle sager grupperet efter status — se hurtigt hvad der mangler at blive booket eller genbooket.</p>

      <div className="relative mb-6 max-w-lg">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#52697E]" />
        <input
          value={soegning}
          onChange={(e) => setSoegning(e.target.value)}
          placeholder="Søg efter sagsnr., ordre-/fakturanr., telefon, adresse eller kundenavn..."
          className="w-full border border-[#D8D0BE] bg-white pl-9 pr-9 py-2.5 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]"
        />
        {soegning && (
          <button onClick={() => setSoegning("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#52697E] hover:text-[#E2621B]">
            <X size={16} />
          </button>
        )}
      </div>

      {soegeresultater ? (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">
            {soegeresultater.length} {soegeresultater.length === 1 ? "match" : "matches"} på "{soegning}"
          </h2>
          {soegeresultater.length === 0 ? (
            <p className="text-sm text-[#52697E] italic">Ingen sager matcher søgningen — tjek stavning, eller søg på et andet felt (sagsnr., ordrenr., telefon, adresse, kundenavn).</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {soegeresultater.map((s) => <SagKortKompakt key={s.id} sag={s} montorer={montorer} onOpen={onOpen} onCycleStatus={onCycleStatus} />)}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            {LISTER.filter((l) => l.key !== "afsluttet" || visAfsluttet).map(({ key, label, icon: Icon, farve, beskrivelse }) => {
              const liste = grupper[key];
              return (
                <div key={key} className="border border-[#D8D0BE] bg-[#FCFAF4] flex flex-col min-h-[120px]">
                  <div className="p-3 border-b border-[#D8D0BE] flex items-center gap-2">
                    <Icon size={15} style={{ color: farve }} className="shrink-0" />
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] flex-1">{label}</h2>
                    <span className="text-xs font-mono px-1.5 py-0.5 border border-[#D8D0BE] text-[#52697E]">{liste.length}</span>
                  </div>
                  <p className="text-[11px] text-[#52697E] px-3 pt-2">{beskrivelse}</p>
                  <div className="p-3 flex flex-col gap-2 flex-1">
                    {liste.length === 0 ? (
                      <p className="text-xs text-[#52697E] italic">Ingen sager her lige nu.</p>
                    ) : (
                      liste.map((s) => <SagKortKompakt key={s.id} sag={s} montorer={montorer} onOpen={onOpen} onCycleStatus={onCycleStatus} />)
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {!visAfsluttet && (
            <button onClick={() => setVisAfsluttet(true)} className="mt-5 text-xs font-semibold uppercase tracking-wide text-[#52697E] hover:text-[#E2621B] underline">
              Vis også afsluttede sager ({grupper.afsluttet.length})
            </button>
          )}
        </>
      )}
    </div>
  );
}

export { PlanlaegningSide };
