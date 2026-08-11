import React from "react";
import { ChevronLeft, ChevronRight, Calendar, KeyRound } from "lucide-react";
import { isToday, addDays, keyAccessText, STATUS_META, todayISO, lineItemLabel, serviceIcon } from "../data/domain";

// NB: den underliggende JSON-data (order.kunde, order.varelinjer osv.) er
// IKKE omdøbt i denne omgang - kun kodens egne variabel-/prop-/komponentnavne.
// Det ville kræve en separat datamigration af alt eksisterende data.

function StatusBadge({ status }) {
  const m = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase px-2 py-0.5" style={{ color: m.color, border: `1px solid ${m.color}` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

function AddOnPill({ addOn }) {
  const Icon = serviceIcon(addOn.navn);
  return (
    <span
      className="inline-flex items-center text-[11px] px-2 py-0.5 gap-1 border font-medium"
      style={{
        borderColor: addOn.udfoert ? "#3D7A5C" : "#E2621B",
        color: addOn.udfoert ? "#3D7A5C" : "#E2621B",
        background: addOn.udfoert ? "#3D7A5C10" : "#E2621B10",
        textDecoration: addOn.udfoert ? "line-through" : "none",
      }}
    >
      <Icon size={11} strokeWidth={2.5} />
      {addOn.navn}
    </span>
  );
}

function KeyAccessPill({ keyAccess }) {
  if (!keyAccess || !keyAccess.kraeves) return null;
  return (
    <span className="inline-flex items-center text-[11px] px-2 py-0.5 gap-1 border font-semibold border-[#E2621B] text-[#E2621B] bg-[#E2621B10]">
      <KeyRound size={11} strokeWidth={2.5} />
      {keyAccessText(keyAccess)}
    </span>
  );
}

function LineItemPills({ order }) {
  if (!order.varelinjer || order.varelinjer.length === 0) return null;
  return (
    <div className="space-y-1">
      {order.noegle?.kraeves && (
        <div className="flex flex-wrap items-center gap-1.5"><KeyAccessPill keyAccess={order.noegle} /></div>
      )}
      {order.varelinjer.map((v) => (
        <div key={v.id} className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 border border-[#52697E] text-[#52697E]">{lineItemLabel(v)}</span>
          {(v.tillaeg || []).map((y) => <AddOnPill key={y.id} addOn={y} />)}
        </div>
      ))}
    </div>
  );
}

function DateSelector({ date, onChange }) {
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={() => onChange(addDays(date, -1))} className="p-1.5 text-[#52697E] hover:text-[#E2621B] border border-[#D8D0BE] hover:border-[#E2621B] transition-colors" title="Forrige dag">
        <ChevronLeft size={15} />
      </button>
      <div className="relative">
        <Calendar size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#52697E] pointer-events-none" />
        <input type="date" value={date} onChange={(e) => e.target.value && onChange(e.target.value)} className="border border-[#D8D0BE] bg-white pl-7 pr-2 py-1.5 text-sm text-[#1C232E] font-mono focus:outline-none focus:border-[#E2621B]" />
      </div>
      <button onClick={() => onChange(addDays(date, 1))} className="p-1.5 text-[#52697E] hover:text-[#E2621B] border border-[#D8D0BE] hover:border-[#E2621B] transition-colors" title="Næste dag">
        <ChevronRight size={15} />
      </button>
      {!isToday(date) && (
        <button onClick={() => onChange(todayISO())} className="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#E2621B] border border-[#E2621B] hover:bg-[#E2621B] hover:text-white transition-colors">
          I dag
        </button>
      )}
    </div>
  );
}

export { StatusBadge, AddOnPill, KeyAccessPill, LineItemPills, DateSelector };
