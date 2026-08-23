import React from "react";
import { ChevronLeft, ChevronRight, Calendar, KeyRound } from "lucide-react";
import { isToday, addDays, keyAccessText, STATUS_META, todayISO, lineItemLabel, serviceIcon } from "../data/domain";

// NB: den underliggende JSON-data (order.kunde, order.varelinjer osv.) er
// IKKE omdøbt i denne omgang - kun kodens egne variabel-/prop-/komponentnavne.
// Det ville kræve en separat datamigration af alt eksisterende data.
//
// Farver her kommer fra STATUS_META (domain.js), som er uafhængig af
// brand-temaet (status skal ikke skifte farve hvis vi rebrander) - resten
// af filen bruger de centrale semantiske temaklasser fra tailwind.config.js.
//
// Boble-knap-temaet (rounded-full) er RETTET (august 2026) til samme
// afrundet-firkantede stil (rounded-lg) som resten af appens knapper og
// kort, konsekvent i hele systemet - kun de helt små farvede prik-
// indikatorer (fx statuspunktet inde i StatusBadge) er bevidst bevaret
// runde, da de er indikatorer, ikke klikbare/valgbare knapper.

function StatusBadge({ status }) {
  const m = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase px-2.5 py-1 rounded-lg" style={{ color: m.color, border: `1.5px solid ${m.color}` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

function AddOnPill({ addOn }) {
  const Icon = serviceIcon(addOn.navn);
  return (
    <span className={`inline-flex items-center text-[11px] px-2.5 py-1 gap-1 border rounded-lg font-medium ${addOn.udfoert ? "border-success text-success bg-success/10 line-through" : "border-brand text-brand bg-brand/10"}`}>
      <Icon size={11} strokeWidth={2.5} />
      {addOn.navn}
    </span>
  );
}

function KeyAccessPill({ keyAccess }) {
  if (!keyAccess || !keyAccess.kraeves) return null;
  return (
    <span className="inline-flex items-center text-[11px] px-2.5 py-1 gap-1 rounded-lg border font-semibold border-brand text-brand bg-brand/10">
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
          {showLineLabel && <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-lg border border-muted text-muted">{lineItemLabel(v)}</span>}
          {(v.tillaeg || []).map((y) => <AddOnPill key={y.id} addOn={y} />)}
        </div>
      ))}
    </div>
  );
}

function DateSelector({ date, onChange }) {
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={() => onChange(addDays(date, -1))} className="p-1.5 rounded-lg text-muted hover:text-brand border border-line hover:border-brand transition-colors" title="Forrige dag">
        <ChevronLeft size={15} />
      </button>
      <div className="relative">
        <Calendar size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input type="date" value={date} onChange={(e) => e.target.value && onChange(e.target.value)} className="rounded-lg border border-line bg-white pl-7 pr-2 py-1.5 text-sm text-ink font-mono focus:outline-none focus:border-brand" />
      </div>
      <button onClick={() => onChange(addDays(date, 1))} className="p-1.5 rounded-lg text-muted hover:text-brand border border-line hover:border-brand transition-colors" title="Næste dag">
        <ChevronRight size={15} />
      </button>
      {!isToday(date) && (
        <button onClick={() => onChange(todayISO())} className="px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide text-brand border border-brand hover:bg-brand hover:text-white transition-colors">
          I dag
        </button>
      )}
    </div>
  );
}

export { StatusBadge, AddOnPill, KeyAccessPill, LineItemPills, DateSelector };
