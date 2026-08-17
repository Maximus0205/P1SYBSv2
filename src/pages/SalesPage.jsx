import React, { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { isToday, formatLongDate } from "../data/domain";
import { DateSelector } from "../components/common";
import { NewOrderForm } from "../components/NewOrderForm";
import { CsvImport } from "../components/CsvImport";
import { OrderCardCompact } from "../components/OrderCardCompact";

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

function SalesPage({ orders, technicians, productTypes, productCategories, primaryServices, addOnServices, selectedDate, onDateChange, onOpen, onAdd, onImport, storeFocus }) {
  const [panel, setPanel] = useState("ny");
  const [search, setSearch] = useState("");
  const sortFn = (a, b) => (a.start || "").localeCompare(b.start || "");
  const todaysOrders = orders.filter((s) => s.dato === selectedDate).sort(sortFn);
  const visibleOrders = useMemo(() => todaysOrders.filter((s) => matchesSearch(s, search)), [todaysOrders, search]);

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
        <div className="flex gap-2">
          <button onClick={() => setPanel(panel === "import" ? null : "import")} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-ink border border-ink hover:border-brand hover:text-brand transition-colors">
            Importér CSV
          </button>
          <button onClick={() => setPanel(panel === "ny" ? null : "ny")} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors">
            + Book sag
          </button>
        </div>
      </div>

      {panel === "ny" && <div className="mb-6"><NewOrderForm technicians={technicians} productTypes={productTypes} productCategories={productCategories} primaryServices={primaryServices} addOnServices={addOnServices} orders={orders} selectedDate={selectedDate} onAdd={onAdd} onClose={() => setPanel(null)} onOpen={onOpen} storeFocus={storeFocus} /></div>}
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
            <OrderCardCompact key={s.id} order={s} technicians={technicians} onOpen={onOpen} onCycleStatus={() => {}} minimal />
          ))}
        </div>
      )}
    </div>
  );
}

export { SalesPage };
