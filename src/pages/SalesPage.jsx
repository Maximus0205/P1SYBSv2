import React, { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { isToday, formatLongDate } from "../data/domain";
import { DateSelector } from "../components/common";
import { NewOrderForm } from "../components/NewOrderForm";
import { CsvImport } from "../components/CsvImport";
import { OrderCardCompact } from "../components/OrderCardCompact";
import { OrderDrafts } from "../components/OrderDrafts";
import { useKladder } from "../hooks/useKladder";
import { nyKladdeId, fjernKladde } from "../lib/orderDrafts";

const norm = (s) => (s || "").toString().toLowerCase();
const normPhone = (s) => (s || "").replace(/\D/g, "");

// Søger KUN i dagens allerede viste sager (adresse eller telefonnummer) -
// til hurtigt at finde en sag, når en kunde ringer ind samme dag ("jeg
// bor på Skovvej" / "mit nummer er ..."). Til opslag på tværs af ALLE
// dage og datoer findes det bredere Arkiv i stedet.
function matchesSearch(order, search) {
  const q = search.trim();
  if (!q) return true;
  const addressMatch = norm(order.kunde?.adresse).includes(norm(q));
  const qDigits = normPhone(q);
  const phoneMatch = qDigits.length >= 2 && normPhone(order.kunde?.telefon).includes(qDigits);
  return addressMatch || phoneMatch;
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
// allerede er flaget - se components/AddressNotes.jsx. Man kan bevidst
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
// denne enhed (se lib/orderDrafts.js) og vises her under "Parkerede
// bookinger", så man kan fortsætte, hvor man slap, hvis man blev afbrudt.
// seed er den booking, formularen viser: et nyt id til en tom booking, eller
// en gemt kladde ved genoptagelse. Lukkes formularen (eller forlader man siden)
// med indtastet data, bliver kladden stående - intet tabes.
//
// PAPIRKURV (oktober 2026): slettede sager kan hentes tilbage fra knappen "Papirkurv"
// på Forsiden (pages/DashboardPage.jsx) - se components/TrashPanel.jsx.
function SalesPage({ storeId, orders, technicians, personnel, timeOff, productTypes, productCategories, primaryServices, addOnServices, defaultTimeEstimates, addressNotes, keyCabinets, selectedDate, onDateChange, onOpen, onAdd, onImport, storeFocus, storeKommuneKode, storePostnr }) {
  const [panel, setPanel] = useState("ny");
  const [search, setSearch] = useState("");
  const { userId, kladder } = useKladder(storeId);
  const [seed, setSeed] = useState(() => ({ id: nyKladdeId(), draft: null }));
  const sortFn = (a, b) => (a.start || "").localeCompare(b.start || "");
  const todaysOrders = orders.filter((s) => s.dato === selectedDate).sort(sortFn);
  const visibleOrders = useMemo(() => todaysOrders.filter((s) => matchesSearch(s, search)), [todaysOrders, search]);

  // Den kladde, formularen netop viser, hører ikke til på listen over parkerede.
  const parkerede = kladder.filter((k) => panel !== "ny" || k.id !== seed.id);

  const startNy = () => { setSeed({ id: nyKladdeId(), draft: null }); setPanel("ny"); };
  const genoptag = (k) => { setSeed({ id: k.id, draft: k }); setPanel("ny"); };

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
          <button onClick={() => (panel === "ny" ? setPanel(null) : startNy())} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors">
            + Book sag
          </button>
        </div>
      </div>

      <OrderDrafts kladder={parkerede} onResume={genoptag} onDiscard={(k) => fjernKladde(k.id)} />

      {panel === "ny" && <div className="mb-6"><NewOrderForm key={seed.id} draftId={seed.id} draft={seed.draft} userId={userId} storeId={storeId} technicians={technicians} personnel={personnel} timeOff={timeOff} productTypes={productTypes} productCategories={productCategories} primaryServices={primaryServices} addOnServices={addOnServices} defaultTimeEstimates={defaultTimeEstimates} addressNotes={addressNotes} keyCabinets={keyCabinets} orders={orders} selectedDate={selectedDate} onAdd={onAdd} onClose={() => setPanel(null)} onOpen={onOpen} storeFocus={storeFocus} storeKommuneKode={storeKommuneKode} storePostnr={storePostnr} /></div>}
      {panel === "import" && <div className="mb-6"><CsvImport technicians={technicians} productTypes={productTypes} primaryServices={primaryServices} onImport={onImport} onClose={() => setPanel(null)} /></div>}

      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">Sager {isToday(selectedDate) ? "i dag" : `d. ${selectedDate}`}</h2>
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Søg adresse eller telefon..."
            className="w-full rounded-lg border border-line bg-white pl-8 pr-8 py-1.5 text-sm text-ink focus:outline-none focus:border-brand"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-brand">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {todaysOrders.length === 0 ? (
        <p className="text-sm text-muted italic">Ingen sager booket på denne dato endnu.</p>
      ) : visibleOrders.length === 0 ? (
        <p className="text-sm text-muted italic">Ingen af dagens sager matcher "{search}".</p>
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
