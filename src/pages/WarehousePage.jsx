import React from "react";
import { Check, KeyRound } from "lucide-react";
import { lineItemLabel, formatLongDate } from "../data/domain";
import { DateSelector } from "../components/common";

// Lagersiden viser ét pluk-PUNKT pr. varelinje - IKKE ét punkt pr. ordre.
// En ordre med 3 varelinjer giver altså 3 selvstændige rækker her, som hver
// kan afkrydses uafhængigt af hinanden (fx "køleskabet er hentet, men
// vaskemaskinen mangler stadig"). Se onToggleLineItemPicked i App.jsx, som
// også opdaterer ordrens samlede plukket-flag, når ALLE dens varelinjer er
// plukket.
function WarehousePage({ orders, technicians, selectedDate, onDateChange, onToggleLineItemPicked, onOpen }) {
  const todaysOrders = orders.filter((s) => s.dato === selectedDate);

  // Flad liste af { order, lineItem } - ét element pr. varelinje på tværs
  // af dagens ordrer.
  const points = todaysOrders.flatMap((order) => (order.varelinjer || []).map((lineItem) => ({ order, lineItem })));
  const sortFn = (a, b) => (a.order.start || "").localeCompare(b.order.start || "");
  const missing = points.filter((p) => !p.lineItem.plukket).sort(sortFn);
  const ready = points.filter((p) => p.lineItem.plukket).sort(sortFn);

  const Row = ({ order, lineItem }) => {
    const technician = technicians.find((m) => m.id === order.montorId);
    return (
      <div className="rounded-xl bg-white border border-[#ECECEC] shadow-sm p-3 flex items-center gap-3">
        <button
          onClick={() => onToggleLineItemPicked(order.id, lineItem.id)}
          className={`w-6 h-6 shrink-0 rounded-md border-2 flex items-center justify-center transition-colors ${lineItem.plukket ? "border-success bg-success" : "border-line bg-white"}`}
          title={lineItem.plukket ? "Marker som ikke plukket" : "Marker som plukket"}
        >
          {lineItem.plukket && <Check size={14} color="white" strokeWidth={3} />}
        </button>
        <div onClick={() => onOpen(order.id)} className="min-w-0 flex-1 cursor-pointer">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm text-ink truncate">{lineItemLabel(lineItem)}</p>
            <span className="font-mono text-[10px] text-faint">#{order.nr}</span>
            {order.noegle?.kraeves && <KeyRound size={12} className="text-brand shrink-0" />}
          </div>
          <p className="text-xs text-muted truncate">{order.kunde.navn} · {order.start}–{order.slut}{technician ? ` · ${technician.navn}` : " · ikke tildelt bil"}</p>
        </div>
      </div>
    );
  };

  return (
    <div>
      <p className="font-mono text-[11px] tracking-widest uppercase text-brand mb-1">{formatLongDate(selectedDate)}</p>
      <h1 className="font-display text-4xl uppercase tracking-tight text-ink mb-1">Lager & ordrepluk</h1>
      <div className="flex items-center gap-3 mb-6">
        <p className="text-sm text-muted">{missing.length} varer mangler at blive plukket · {ready.length} klar til afhentning</p>
        <DateSelector date={selectedDate} onChange={onDateChange} />
      </div>

      <h2 className="text-sm font-semibold uppercase tracking-wide text-brand mb-3 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-brand" /> Mangler pluk ({missing.length})
      </h2>
      {missing.length === 0 ? <p className="text-sm text-muted italic mb-8">Alt er plukket til denne dags ture.</p> : <div className="space-y-2 mb-8">{missing.map((p) => <Row key={p.lineItem.id} order={p.order} lineItem={p.lineItem} />)}</div>}

      <h2 className="text-sm font-semibold uppercase tracking-wide text-success mb-3 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-success" /> Klar til afhentning ({ready.length})
      </h2>
      {ready.length === 0 ? <p className="text-sm text-muted italic">Ingen endnu.</p> : <div className="space-y-2">{ready.map((p) => <Row key={p.lineItem.id} order={p.order} lineItem={p.lineItem} />)}</div>}
    </div>
  );
}

export { WarehousePage };
