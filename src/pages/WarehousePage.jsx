import React from "react";
import { Check, KeyRound } from "lucide-react";
import { buildTitle, formatLongDate } from "../data/domain";
import { DateSelector } from "../components/common";

function WarehousePage({ orders, technicians, selectedDate, onDateChange, onTogglePicked, onOpen }) {
  const sortFn = (a, b) => (a.start || "").localeCompare(b.start || "");
  const todaysOrders = orders.filter((s) => s.dato === selectedDate);
  const missing = todaysOrders.filter((s) => !s.plukket).sort(sortFn);
  const ready = todaysOrders.filter((s) => s.plukket).sort(sortFn);

  const Row = ({ s }) => {
    const technician = technicians.find((m) => m.id === s.montorId);
    return (
      <div className="rounded-xl bg-white border border-[#ECECEC] shadow-sm p-3 flex items-center gap-3">
        <button
          onClick={() => onTogglePicked(s.id)}
          className={`w-6 h-6 shrink-0 rounded-md border-2 flex items-center justify-center transition-colors ${s.plukket ? "border-success bg-success" : "border-line bg-white"}`}
          title={s.plukket ? "Marker som ikke plukket" : "Marker som plukket"}
        >
          {s.plukket && <Check size={14} color="white" strokeWidth={3} />}
        </button>
        <div onClick={() => onOpen(s.id)} className="min-w-0 flex-1 cursor-pointer">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm text-ink truncate">{buildTitle(s.varelinjer)}</p>
            <span className="font-mono text-[10px] text-faint">#{s.nr}</span>
            {s.noegle?.kraeves && <KeyRound size={12} className="text-brand shrink-0" />}
          </div>
          <p className="text-xs text-muted truncate">{s.kunde.navn} · {s.start}–{s.slut}{technician ? ` · ${technician.navn}` : " · ikke tildelt bil"}</p>
        </div>
      </div>
    );
  };

  return (
    <div>
      <p className="font-mono text-[11px] tracking-widest uppercase text-brand mb-1">{formatLongDate(selectedDate)}</p>
      <h1 className="font-display text-4xl uppercase tracking-tight text-ink mb-1">Lager & ordrepluk</h1>
      <div className="flex items-center gap-3 mb-6">
        <p className="text-sm text-muted">{missing.length} mangler at blive plukket · {ready.length} klar til afhentning</p>
        <DateSelector date={selectedDate} onChange={onDateChange} />
      </div>

      <h2 className="text-sm font-semibold uppercase tracking-wide text-brand mb-3 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-brand" /> Mangler pluk ({missing.length})
      </h2>
      {missing.length === 0 ? <p className="text-sm text-muted italic mb-8">Alt er plukket til denne dags ture.</p> : <div className="space-y-2 mb-8">{missing.map((s) => <Row key={s.id} s={s} />)}</div>}

      <h2 className="text-sm font-semibold uppercase tracking-wide text-success mb-3 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-success" /> Klar til afhentning ({ready.length})
      </h2>
      {ready.length === 0 ? <p className="text-sm text-muted italic">Ingen endnu.</p> : <div className="space-y-2">{ready.map((s) => <Row key={s.id} s={s} />)}</div>}
    </div>
  );
}

export { WarehousePage };
