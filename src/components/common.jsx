import React from "react";
import { ChevronLeft, ChevronRight, Calendar, KeyRound } from "lucide-react";
import { isToday, addDays, keyAccessText, STATUS_META, todayISO, lineItemLabel, serviceIcon } from "../data/domain";

// NB: den underliggende JSON-data (order.kunde, order.varelinjer osv.) er
// IKKE omdøbt i denne omgang - kun kodens egne variabel-/prop-/komponentnavne.
// Det ville kræve en separat datamigration af alt eksisterende data.

function StatusBadge({ status }) {
  const m = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase px-2.5 py-1 rounded-full" style={{ color: m.color, border: `1.5px solid ${m.color}` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

function AddOnPill({ addOn }) {
  const Icon = serviceIcon(addOn.navn);
  return (
    <span
      className="inline-flex items-center text-[11px] px-2.5 py-1 gap-1 border rounded-full font-medium"
      style={{
        borderColor: addOn.udfoert ? "#3D7A5C" : "#C8232E",
        color: addOn.udfoert ? "#3D7A5C" : "#C8232E",
        background: addOn.udfoert ? "#3D7A5C10" : "#C8232E10",
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
    <span className="inline-flex items-center text-[11px] px-2.5 py-1 gap-1 rounded-full border font-semibold border-[#C8232E] text-[#C8232E] bg-[#C8232E10]">
      <KeyRound size={11} strokeWidth={2.5} />
      {keyAccessText(keyAccess)}
    </span>
  );
}

// Varetypen står allerede i sagens overskrift (se buildTitle) - kun ved
// FLERE varelinjer giver et separat mærke pr. linje reel ekstra klarhed (så
// man kan se hvilke tillæg der hører til hvilken vare). Ved én enkelt linje
// er mærket ren gentagelse af overskriften og udelades derfor.
function LineItemPills({ order }) {
  if (!order.varelinjer || order.varelinjer.length === 0) return null;
  const showLineLabel = order.varelinjer.length > 1;
  return (
    <div className="space-y-1">
      {order.noegle?.kraeves && (
        <div className="flex flex-wrap items-center gap-1.5"><KeyAccessPill keyAccess={order.noegle} /></div>
      )}
      {order.varelinjer.map((v) => (
        <div key={v.id} className="flex flex-wrap items-center gap-1.5">
          {showLineLabel && <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border border-[#5C5C5C] text-[#5C5C5C]">{lineItemLabel(v)}</span>}
          {(v.tillaeg || []).map((y) => <AddOnPill key={y.id} addOn={y} />)}
        </div>
      ))}
    </div>
  );
}

function DateSelector({ date, onChange }) {
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={() => onChange(addDays(date, -1))} className="p-1.5 rounded-lg text-[#5C5C5C] hover:text-[#C8232E] border border-[#DDDDDD] hover:border-[#C8232E] transition-colors" title="Forrige dag">
        <ChevronLeft size={15} />
      </button>
      <div className="relative">
        <Calendar size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#5C5C5C] pointer-events-none" />
        <input type="date" value={date} onChange={(e) => e.target.value && onChange(e.target.value)} className="rounded-lg border border-[#DDDDDD] bg-white pl-7 pr-2 py-1.5 text-sm text-[#1A1A1A] font-mono focus:outline-none focus:border-[#C8232E]" />
      </div>
      <button onClick={() => onChange(addDays(date, 1))} className="p-1.5 rounded-lg text-[#5C5C5C] hover:text-[#C8232E] border border-[#DDDDDD] hover:border-[#C8232E] transition-colors" title="Næste dag">
        <ChevronRight size={15} />
      </button>
      {!isToday(date) && (
        <button onClick={() => onChange(todayISO())} className="px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide text-[#C8232E] border border-[#C8232E] hover:bg-[#C8232E] hover:text-white transition-colors">
          I dag
        </button>
      )}
    </div>
  );
}

export { StatusBadge, AddOnPill, KeyAccessPill, LineItemPills, DateSelector };
