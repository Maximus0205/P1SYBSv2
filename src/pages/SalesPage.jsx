import React, { useState } from "react";
import { isToday, formatLongDate } from "../data/domain";
import { DateSelector } from "../components/common";
import { NewOrderForm } from "../components/NewOrderForm";
import { CsvImport } from "../components/CsvImport";
import { OrderCardCompact } from "../components/OrderCardCompact";

function SalesPage({ orders, technicians, productTypes, productCategories, primaryServices, addOnServices, selectedDate, onDateChange, onOpen, onAdd, onImport, storeFocus }) {
  const [panel, setPanel] = useState("ny");
  const sortFn = (a, b) => (a.start || "").localeCompare(b.start || "");
  const todaysOrders = orders.filter((s) => s.dato === selectedDate).sort(sortFn);

  return (
    <div>
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-widest uppercase text-[#E2621B] mb-1">{formatLongDate(selectedDate)}</p>
          <h1 className="font-['Barlow_Condensed'] text-4xl uppercase tracking-tight text-[#1C232E]">Salg &amp; ordrebooking</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-[#52697E]">{todaysOrders.length} sager</p>
            <DateSelector date={selectedDate} onChange={onDateChange} />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setPanel(panel === "import" ? null : "import")} className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-[#1C232E] border border-[#1C232E] hover:border-[#E2621B] hover:text-[#E2621B] transition-colors">
            Importér CSV
          </button>
          <button onClick={() => setPanel(panel === "ny" ? null : "ny")} className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors">
            + Book sag
          </button>
        </div>
      </div>

      {panel === "ny" && <div className="mb-6"><NewOrderForm technicians={technicians} productTypes={productTypes} productCategories={productCategories} primaryServices={primaryServices} addOnServices={addOnServices} orders={orders} selectedDate={selectedDate} onAdd={onAdd} onClose={() => setPanel(null)} onOpen={onOpen} storeFocus={storeFocus} /></div>}
      {panel === "import" && <div className="mb-6"><CsvImport technicians={technicians} productTypes={productTypes} primaryServices={primaryServices} onImport={onImport} onClose={() => setPanel(null)} /></div>}

      <h2 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Sager {isToday(selectedDate) ? "i dag" : `d. ${selectedDate}`}</h2>
      {todaysOrders.length === 0 ? (
        <p className="text-sm text-[#52697E] italic">Ingen sager booket på denne dato endnu.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2">
          {todaysOrders.map((s) => (
            <OrderCardCompact key={s.id} order={s} technicians={technicians} onOpen={onOpen} onCycleStatus={() => {}} />
          ))}
        </div>
      )}
    </div>
  );
}

export { SalesPage };
