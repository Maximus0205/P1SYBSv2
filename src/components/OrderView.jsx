import React, { useState } from "react";
import { KeyRound, Building2, Hash, Pencil, X, Check, Copy, AlertTriangle, User } from "lucide-react";
import { TIME_SLOTS, buildTitle, keyAccessText, timeSlotById, timeSlotText, lineItemLabel } from "../data/domain";
import { StatusBadge } from "../components/common";
import { LineItemDetails, Notes, Photos, Reports, TimeLog, ClockWidget, Signature } from "../components/OrderParts";
import { AddressInput } from "../components/AddressInput";

// Hurtig-redigering af en booket sag: dato, tidsrum, montør og
// leveringsadresse - de felter der oftest skal justeres efter oprettelse
// (fx kunden ringer og vil rykke datoen). Resten af sagen (varelinjer,
// kunde-/købernavn osv.) redigeres ikke her - det er bevidst holdt til de
// hyppigste ændringer, for at redigeringen forbliver hurtig og overskuelig.
function BookingEditor({ order, technicians, onSave, onCancel }) {
  const [date, setDate] = useState(order.dato);
  const [timeSlotId, setTimeSlotId] = useState(order.tidsrumId);
  const [technicianId, setTechnicianId] = useState(order.montorId || "");
  const [address, setAddress] = useState(order.kunde.adresse);

  const save = () => {
    const t = timeSlotById(timeSlotId);
    onSave({
      dato: date, tidsrumId: timeSlotId, start: t.start, slut: t.slut,
      montorId: technicianId || null,
      kunde: { ...order.kunde, adresse: address.trim() },
    });
  };

  return (
    <div className="rounded-xl bg-white border border-brand p-4 mb-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-3">Redigér booking</h3>
      <div className="grid gap-3 sm:grid-cols-2 mb-3">
        <label className="text-xs text-muted">
          Dato
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full mt-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink font-mono focus:outline-none focus:border-brand" />
        </label>
        <label className="text-xs text-muted">
          Tidsrum
          <select value={timeSlotId} onChange={(e) => setTimeSlotId(e.target.value)} className="w-full mt-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand">
            {TIME_SLOTS.map((t) => <option key={t.id} value={t.id}>{timeSlotText(t.id)}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted sm:col-span-2">
          Montør/bil
          <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} className="w-full mt-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand">
            <option value="">Ikke tildelt</option>
            {technicians.map((m) => <option key={m.id} value={m.id}>{m.navn} — {m.bil}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted sm:col-span-2">
          Leveringsadresse
          <div className="mt-1"><AddressInput value={address} onChange={setAddress} placeholder="Leveringsadresse" /></div>
        </label>
      </div>
      <div className="flex gap-2">
        <button onClick={save} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors flex items-center gap-1.5"><Check size={14} /> Gem ændringer</button>
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-muted transition-colors flex items-center gap-1.5"><X size={14} /> Annuller</button>
      </div>
    </div>
  );
}

// Opretter en NY sag ud fra denne (dupliker/opfølgning) - fx et service-/
// reklamationsbesøg efter en montering, eller når en levering skal deles
// op i flere separate besøg. Kunde, adresse og nøgleoplysninger følger
// automatisk med til den nye sag; dato og montør skal derimod vælges på
// ny (det er jo netop en ny planlægning) - det gøres normalt bagefter, ved
// at åbne den nyoprettede sag og redigere bookingen. Man vælger selv,
// hvilke varelinjer der skal med - fx kun én af flere ved et enkelt
// service-besøg, eller alle ved en ren kopi/opdeling af en levering.
function DuplicatePanel({ order, onDuplicate, onCancel }) {
  const [selected, setSelected] = useState(() => new Set(order.varelinjer.map((v) => v.id)));
  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const submit = () => {
    const chosen = order.varelinjer.filter((v) => selected.has(v.id));
    if (chosen.length === 0) return;
    onDuplicate(chosen);
  };

  return (
    <div className="rounded-xl bg-white border border-brand p-4 mb-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1 flex items-center gap-1.5"><Copy size={14} /> Dupliker / opret opfølgning</h3>
      <p className="text-xs text-muted mb-3">Opretter en ny sag med samme kunde, adresse og nøgleoplysninger — dato og montør er ikke sat endnu og skal vælges bagefter. Vælg hvilke varelinjer der skal med.</p>
      <div className="space-y-1.5 mb-3">
        {order.varelinjer.map((v) => (
          <label key={v.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 cursor-pointer hover:border-brand transition-colors">
            <input type="checkbox" checked={selected.has(v.id)} onChange={() => toggle(v.id)} className="w-4 h-4 accent-brand shrink-0" />
            <span className="text-sm text-ink">{lineItemLabel(v)}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={submit} disabled={selected.size === 0} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none">
          <Copy size={14} /> Opret ny sag
        </button>
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-muted transition-colors flex items-center gap-1.5"><X size={14} /> Annuller</button>
      </div>
    </div>
  );
}

function OrderView({ order, technicians, onBack, addNote, addPhoto, addReport, onCycleStatus, onClockIn, onClockOut, onToggleAddOn, onAddAddOn, onRemoveAddOn, onUpdateBooking, onSaveSignature, onDuplicate, onClearProblem, onOpenOrder, followUpOrder, originalOrder }) {
  const [tab, setTab] = useState("noter");
  const [editing, setEditing] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const technician = technicians.find((m) => m.id === order.montorId);
  const tabs = [
    { key: "noter", label: "Noter", count: order.noter.length },
    { key: "materialer", label: "Materialer", count: (order.materialer || []).length },
    { key: "billeder", label: "Billeder", count: order.billeder.length },
    { key: "rapporter", label: "Rapporter", count: order.rapporter.length },
    { key: "tid", label: "Tid", count: order.logs.length },
    { key: "underskrift", label: "Underskrift", count: order.underskrift ? 1 : 0 },
  ];

  return (
    <div>
      <button onClick={onBack} className="text-sm text-muted hover:text-brand mb-4 flex items-center gap-1">← Tilbage</button>

      {editing ? (
        <BookingEditor
          order={order}
          technicians={technicians}
          onCancel={() => setEditing(false)}
          onSave={(fields) => { onUpdateBooking(fields); setEditing(false); }}
        />
      ) : duplicating ? (
        <DuplicatePanel
          order={order}
          onCancel={() => setDuplicating(false)}
          onDuplicate={(selectedLineItems) => { onDuplicate?.(selectedLineItems); setDuplicating(false); }}
        />
      ) : (
        <div className="rounded-xl bg-white border border-line p-5 mb-5 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="font-mono text-xs text-muted mb-1">
                #{order.nr} · {order.dato} · {order.start}–{order.slut}{technician ? ` · ${technician.navn}` : " · ikke tildelt"}
                {order.ordrenummer && <span className="ml-2 inline-flex items-center gap-0.5"><Hash size={10} /> {order.ordrenummer}</span>}
              </p>
              {order.oprettetAf?.navn && (
                <p className="text-xs text-muted mb-1 flex items-center gap-1"><User size={11} className="shrink-0" /> Booket af {order.oprettetAf.navn}</p>
              )}
              <h1 className="font-display text-3xl uppercase tracking-tight text-ink leading-none">{buildTitle(order.varelinjer)}</h1>

              {order.problem && (
                <div className="mt-2.5 rounded-lg bg-danger/10 border border-danger px-3 py-2">
                  <p className="text-sm font-semibold text-danger flex items-center gap-1.5"><AlertTriangle size={14} className="shrink-0" /> Sagen kom ikke i mål</p>
                  <p className="text-xs text-danger mt-0.5">{order.problem.note} · {order.problem.tid}</p>
                  {onClearProblem && <button onClick={onClearProblem} className="text-[11px] text-danger underline hover:no-underline mt-1">Ryd markering</button>}
                </div>
              )}
              {followUpOrder && onOpenOrder && (
                <button onClick={() => onOpenOrder(followUpOrder.id)} className="text-xs text-brand hover:underline mt-2 flex items-center gap-1"><Copy size={12} className="shrink-0" /> Opfølgning oprettet: sag #{followUpOrder.nr}</button>
              )}
              {originalOrder && onOpenOrder && (
                <button onClick={() => onOpenOrder(originalOrder.id)} className="text-xs text-muted hover:text-brand mt-2 flex items-center gap-1"><Copy size={12} className="shrink-0" /> Opfølgning på sag #{originalOrder.nr}</button>
              )}

              <p className="text-sm text-muted mt-2 font-semibold">Kunde (modtager)</p>
              <p className="text-sm text-muted">{order.kunde.navn}{order.kunde.telefon ? ` · ${order.kunde.telefon}` : ""}{order.kunde.email ? ` · ${order.kunde.email}` : ""}</p>
              <p className="text-sm text-muted">{order.kunde.adresse}</p>
              {order.kunde.leveringsnote && <p className="text-sm text-brand font-medium mt-1">⚠ {order.kunde.leveringsnote}</p>}
              {order.koeber && (
                <div className="mt-3 pt-3 border-t border-divider">
                  <p className="text-sm text-muted font-semibold flex items-center gap-1.5"><Building2 size={13} /> Køber (afviger fra kunden)</p>
                  <p className="text-sm text-muted">{order.koeber.navn}{order.koeber.telefon ? ` · ${order.koeber.telefon}` : ""}{order.koeber.email ? ` · ${order.koeber.email}` : ""}</p>
                  {order.koeber.adresse && <p className="text-sm text-muted">{order.koeber.adresse}</p>}
                </div>
              )}
              {order.noegle?.kraeves && (
                <p className="text-sm text-brand font-semibold mt-2 flex items-center gap-1.5"><KeyRound size={14} /> {keyAccessText(order.noegle)}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <button onClick={() => onCycleStatus(order.id)}><StatusBadge status={order.status} /></button>
              <button onClick={() => setEditing(true)} className="text-xs font-semibold uppercase tracking-wide text-muted hover:text-brand flex items-center gap-1"><Pencil size={13} /> Redigér booking</button>
              {onDuplicate && (
                <button onClick={() => setDuplicating(true)} className="text-xs font-semibold uppercase tracking-wide text-muted hover:text-brand flex items-center gap-1"><Copy size={13} /> Dupliker / opfølgning</button>
              )}
            </div>
          </div>
        </div>
      )}

      <LineItemDetails order={order} onToggleAddOn={onToggleAddOn} onAddAddOn={onAddAddOn} onRemoveAddOn={onRemoveAddOn} />
      <ClockWidget order={order} onClockIn={onClockIn} onClockOut={onClockOut} />
      <div className="flex border-b border-line mb-5 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 text-sm font-semibold uppercase tracking-wide transition-colors shrink-0 ${tab === t.key ? "text-ink border-b-2 border-brand" : "text-muted hover:text-ink"}`}>
            {t.label} <span className="font-mono text-xs">({t.count})</span>
          </button>
        ))}
      </div>
      {tab === "noter" && <Notes order={order} onAdd={addNote} />}
      {tab === "materialer" && (
        (order.materialer || []).length === 0 ? (
          <p className="text-sm text-muted italic">Intet ekstra materialeforbrug registreret for denne sag.</p>
        ) : (
          <div className="space-y-2">
            {[...order.materialer].reverse().map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border-l-2 border-brand bg-white border border-line px-3 py-2 shadow-sm">
                <p className="text-sm text-ink">{m.antal > 1 ? `${m.antal}× ` : ""}{m.navn}</p>
                <p className="font-mono text-[11px] text-muted shrink-0">{m.tid}</p>
              </div>
            ))}
          </div>
        )
      )}
      {tab === "billeder" && <Photos order={order} onAdd={addPhoto} />}
      {tab === "rapporter" && <Reports order={order} onAdd={addReport} />}
      {tab === "tid" && <TimeLog order={order} />}
      {tab === "underskrift" && <Signature order={order} onSave={onSaveSignature} />}
    </div>
  );
}

export { OrderView, BookingEditor, DuplicatePanel };
