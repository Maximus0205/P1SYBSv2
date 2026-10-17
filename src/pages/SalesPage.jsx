import React, { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { isToday, formatLongDate, todayISO } from "../data/domain";
import { DateSelector } from "../components/common";
import { NewOrderForm } from "../components/NewOrderForm";
import { CsvImport } from "../components/CsvImport";
import { OrderCardCompact } from "../components/OrderCardCompact";
import { useKladder } from "../hooks/useKladder";
import { nyKladdeId, hentGenoptagelse } from "../lib/orderDrafts";

const norm = (s) => (s || "").toString().toLowerCase();
const normPhone = (s) => (s || "").replace(/\D/g, "");

// Maks. antal sager der vises ved en søgning på tværs af alle dage - så en meget kort søgning
// (fx "a") ikke render hundredvis af kort på én gang. Overskydende nævnes under listen.
const MAX_SOEGERESULTATER = 50;

// Søger i ALLE butikkens sager - på tværs af alle dage (adresse, telefonnummer,
// kundenavn eller sagsnummer) - til hurtigt at finde en sag, når en kunde ringer
// ind ("jeg har en tid hos jer" / "jeg bor på Skovvej" / "mit nummer er ...").
// Tidligere søgte feltet kun i den valgte dag, så sælgeren måtte forbi Arkivet.
// Kortene viser selv datoen, så man kan se, hvilken dag sagen ligger på.
function matchesSearch(order, search) {
  const q = search.trim();
  if (!q) return true;
  const addressMatch = norm(order.kunde?.adresse).includes(norm(q));
  const nameMatch = norm(order.kunde?.navn).includes(norm(q));
  const qDigits = normPhone(q);
  const phoneMatch = qDigits.length >= 2 && normPhone(order.kunde?.telefon).includes(qDigits);
  const nrMatch = norm(order.nr).includes(norm(q.replace(/^#/, "")));
  return addressMatch || nameMatch || phoneMatch || nrMatch;
}

// Kommende sager (i dag og frem) først, tidligste først - det er dem, kunden typisk ringer om.
// Derefter tidligere sager, nyeste først.
function sortSoegeresultater(a, b, today) {
  const aFremad = (a.dato || "") >= today;
  const bFremad = (b.dato || "") >= today;
  if (aFremad !== bFremad) return aFremad ? -1 : 1;
  const d = (a.dato || "").localeCompare(b.dato || "");
  const tid = (a.start || "").localeCompare(b.start || "");
  if (aFremad) return d || tid;
  return -d || tid;
}

// personnel/timeOff (september 2026): videresendes til NewOrderForm, som
// selv videresender til SuggestedDates - så et nyt bookings-forslag kan
// tjekke DÆKNING pr. bil (er der nogen til at køre den den dag) i stedet
// for at antage alle biler altid er i spil. Se vehicleHasCoverage i
// data/domain.js.
//
// storeId (september 2026): videresendes til NewOrderForm, som bruger den
// til "Hent fra POS"-opslaget (se lib/dataStore.js: lookupPosOrder) - uden
// den kan Edge Function-kaldet ikke vide, hvilken butiks POS-forbindelse
// der skal bruges.
//
// defaultTimeEstimates (september 2026): videresendes til NewOrderForm,
// som bruger den til at foreslå en starttid, når en ny varelinje
// oprettes - se domain.js: getDefaultEstimateMinutes/createLineItem.
//
// addressNotes (september 2026): videresendes til NewOrderForm, som viser
// en ADVARSEL under adressefeltet på levering-trinnet, hvis adressen
// allerede er flagget - se components/AddressNotes.jsx. Man kan bevidst
// IKKE oprette et nyt flag under selve bookingen (kun se en advarsel om et
// eksisterende), så der er ingen tilsvarende "onAdd"-funktion at sende med
// her - selve flagningen sker på den bookede sag bagefter.
//
// keyCabinets (september 2026): videresendes til NewOrderForm, som ved en
// TOMGANG viser, hvilket nøgleskab adressen hører til - se
// components/KeyCabinetAlert.jsx.
//
// storeKommuneKode/storePostnr (september 2026): videresendes til
// NewOrderForm's adressefelt, så adressesøgningen prioriterer butikkens
// eget kommuneområde og postnummer - se lib/geocodingAdressevaelger.js,
// components/AddressInput.jsx og App.jsx.
//
// KLADDER (oktober 2026): en ufærdig booking gemmes løbende som en kladde på
// denne enhed (se lib/orderDrafts.js). De PARKEREDE bookinger vises i "Opret sag"-widgetten på
// Forsiden (components/ParkeredeSager.jsx), ikke her - denne side er blot selve formularen. Trykker
// man "Fortsæt" dér, husker widgetten kladdens id (bedOmGenoptagelse), og siden åbner den præcis,
// hvor man slap. seed er den booking, formularen viser: et nyt id til en tom booking, eller en gemt
// kladde ved genoptagelse. Lukkes formularen (eller forlader man siden) med indtastet data, bliver
// kladden stående - intet tabes.
//
// PAPIRKURV (oktober 2026): slettede sager kan hentes tilbage fra knappen "Papirkurv"
// på Forsiden (pages/DashboardPage.jsx) - se components/TrashPanel.jsx.
function SalesPage({ storeId, orders, technicians, personnel, timeOff, vehicles, crew, store, productTypes, productCategories, primaryServices, addOnServices, defaultTimeEstimates, addressNotes, keyCabinets, selectedDate, onDateChange, onOpen, onAdd, onImport, storeFocus, storeKommuneKode, storePostnr }) {
  const [panel, setPanel] = useState("ny");
  const [search, setSearch] = useState("");
  const { userId, kladder, klar } = useKladder(storeId);
  const [seed, setSeed] = useState(() => ({ id: nyKladdeId(), draft: null }));
  // Kladden, der skal genoptages fra Forsiden. Læses ÉN gang ved åbning. Kladderne hentes først, når
  // brugerens id er læst fra sessionen, så vi venter, til listen er KLAR (ikke blot til id'et er
  // kendt - i det render er listen stadig tom); findes kladden så ikke (udløbet, kasseret, eller
  // tilhører en anden bruger), starter en tom booking i stedet.
  const [afventer, setAfventer] = useState(() => hentGenoptagelse());
  useEffect(() => {
    if (!afventer || !klar) return;
    const k = kladder.find((x) => x.id === afventer);
    if (k) { setSeed({ id: k.id, draft: k }); setPanel("ny"); }
    setAfventer(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [afventer, klar, kladder]);
  const sortFn = (a, b) => (a.start || "").localeCompare(b.start || "");
  const todaysOrders = useMemo(() => orders.filter((s) => s.dato === selectedDate).sort(sortFn), [orders, selectedDate]);
  const soeger = search.trim().length > 0;
  // Uden søgning: den valgte dags sager. Med søgning: ALLE sager der matcher, på tværs af dage.
  const soegeresultater = useMemo(() => {
    if (!soeger) return [];
    const today = todayISO();
    return orders.filter((s) => matchesSearch(s, search)).sort((a, b) => sortSoegeresultater(a, b, today));
  }, [orders, search, soeger]);
  const visibleOrders = soeger ? soegeresultater.slice(0, MAX_SOEGERESULTATER) : todaysOrders;

  const startNy = () => { setSeed({ id: nyKladdeId(), draft: null }); setPanel("ny"); };

  return (
    <div>
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-widest uppercase text-brand mb-1">{formatLongDate(selectedDate)}</p>
          <h1 className="font-display text-4xl uppercase tracking-tight text-ink">Salg &amp; ordrebooking</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-muted">{todaysOrders.length} sager</p>
            <DateSelector date={selectedDate} onChange={onDateChange} />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setPanel(panel === "import" ? null : "import")} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-ink border border-ink hover:border-brand hover:text-brand transition-colors">
            Importér CSV
          </button>
          <button onClick={() => (panel === "ny" ? setPanel(null) : startNy())} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-brand hover:bg-brand-dark transition-colors">
            + Book sag
          </button>
        </div>
      </div>

      {panel === "ny" && <div className="mb-6"><NewOrderForm key={seed.id} draftId={seed.id} draft={seed.draft} userId={userId} storeId={storeId} technicians={technicians} personnel={personnel} timeOff={timeOff} vehicles={vehicles} crew={crew} store={store} productTypes={productTypes} productCategories={productCategories} primaryServices={primaryServices} addOnServices={addOnServices} defaultTimeEstimates={defaultTimeEstimates} addressNotes={addressNotes} keyCabinets={keyCabinets} orders={orders} selectedDate={selectedDate} onAdd={onAdd} onClose={() => setPanel(null)} onOpen={onOpen} storeFocus={storeFocus} storeKommuneKode={storeKommuneKode} storePostnr={storePostnr} /></div>}
      {panel === "import" && <div className="mb-6"><CsvImport technicians={technicians} productTypes={productTypes} primaryServices={primaryServices} onImport={onImport} onClose={() => setPanel(null)} /></div>}

      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">
          {soeger ? "Søgeresultat · alle dage" : `Sager ${isToday(selectedDate) ? "i dag" : `d. ${selectedDate}`}`}
        </h2>
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Søg i alle dage: navn, adresse, telefon, sagsnr."
            aria-label="Søg i alle sager på tværs af dage: navn, adresse, telefon eller sagsnummer"
            className="w-full rounded-lg border border-line bg-white pl-8 pr-8 py-2 text-sm text-ink focus:outline-none focus:border-brand"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label="Ryd søgning" className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-muted hover:text-brand">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {soeger ? (
        soegeresultater.length === 0 ? (
          <p className="text-sm text-muted italic">Ingen sager på tværs af alle dage matcher "{search}".</p>
        ) : (
          <>
            <p className="text-xs text-muted mb-2">
              {soegeresultater.length} {soegeresultater.length === 1 ? "sag" : "sager"} fundet · kommende først, derefter tidligere
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {visibleOrders.map((s) => (
                <OrderCardCompact key={s.id} order={s} technicians={technicians} onOpen={onOpen} minimal />
              ))}
            </div>
            {soegeresultater.length > MAX_SOEGERESULTATER && (
              <p className="text-xs text-muted italic mt-2">Viser de første {MAX_SOEGERESULTATER}. Skriv mere i søgefeltet for at indsnævre.</p>
            )}
          </>
        )
      ) : todaysOrders.length === 0 ? (
        <p className="text-sm text-muted italic">Ingen sager booket på denne dato endnu.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2">
          {visibleOrders.map((s) => (
            <OrderCardCompact key={s.id} order={s} technicians={technicians} onOpen={onOpen} minimal />
          ))}
        </div>
      )}
    </div>
  );
}

export { SalesPage };
