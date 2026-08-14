import React, { useMemo, useState } from "react";
import { Search, X, MapPin, Phone, Calendar, User } from "lucide-react";
import { OrderCardCompact } from "../components/OrderCardCompact";

const norm = (s) => (s || "").toString().toLowerCase();
const normPhone = (s) => (s || "").replace(/\D/g, "");

function matchesFilters(order, { text, address, phone, technicianId, fromDate, toDate }) {
  if (text.trim()) {
    const t = norm(text);
    const hit = norm(order.nr).includes(t) || norm(order.ordrenummer).includes(t) || norm(order.kunde?.navn).includes(t);
    if (!hit) return false;
  }
  if (address.trim() && !norm(order.kunde?.adresse).includes(norm(address))) return false;
  if (phone.trim() && !normPhone(order.kunde?.telefon).includes(normPhone(phone))) return false;
  if (technicianId === "unassigned" && order.montorId) return false;
  if (technicianId && technicianId !== "unassigned" && order.montorId !== technicianId) return false;
  if (fromDate && order.dato < fromDate) return false;
  if (toDate && order.dato > toDate) return false;
  return true;
}

// Arkivet viser BEVIDST ingen sager, før man rent faktisk har angivet et
// søgekriterie - med potentielt tusindvis af gamle sager over tid ville en
// standardliste (som Kunder-udgaven havde) hverken være hurtig at bruge
// eller rar at scrolle på mobil. I stedet er det en ren søgeflade: dato,
// adresse, telefon og montør kombineres med OG-logik, og fritekst dækker
// kundenavn/sagsnr./ordrenr. ovenpå det.
function ArchivePage({ orders, technicians, onOpen }) {
  const [text, setText] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [visibleCount, setVisibleCount] = useState(30);

  const hasFilter = !!(text.trim() || address.trim() || phone.trim() || technicianId || fromDate || toDate);

  const results = useMemo(() => {
    if (!hasFilter) return [];
    return [...orders]
      .filter((o) => matchesFilters(o, { text, address, phone, technicianId, fromDate, toDate }))
      .sort((a, b) => (b.dato + b.start).localeCompare(a.dato + a.start));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, text, address, phone, technicianId, fromDate, toDate, hasFilter]);

  const changeAndReset = (setter) => (val) => { setter(val); setVisibleCount(30); };
  const clearAll = () => { setText(""); setAddress(""); setPhone(""); setTechnicianId(""); setFromDate(""); setToDate(""); setVisibleCount(30); };

  return (
    <div>
      <p className="font-mono text-[11px] tracking-widest uppercase text-brand mb-1">Overblik</p>
      <h1 className="font-display text-4xl uppercase tracking-tight text-ink mb-1">Arkiv</h1>
      <p className="text-sm text-muted mb-4">Slå gamle sager op på dato, adresse, telefonnummer eller montør.</p>

      <div className="rounded-xl border border-line bg-white p-4 mb-6 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted">
            Fritekst (navn, sagsnr., ordrenr.)
            <div className="relative mt-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input value={text} onChange={(e) => changeAndReset(setText)(e.target.value)} placeholder="Fx kundenavn eller sagsnr." className="w-full rounded-lg border border-line bg-panel pl-8 pr-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
            </div>
          </label>
          <label className="text-xs text-muted">
            Adresse
            <div className="relative mt-1">
              <MapPin size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input value={address} onChange={(e) => changeAndReset(setAddress)(e.target.value)} placeholder="Fx gadenavn eller by" className="w-full rounded-lg border border-line bg-panel pl-8 pr-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
            </div>
          </label>
          <label className="text-xs text-muted">
            Telefonnummer
            <div className="relative mt-1">
              <Phone size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input value={phone} onChange={(e) => changeAndReset(setPhone)(e.target.value)} placeholder="Fx 12345678" className="w-full rounded-lg border border-line bg-panel pl-8 pr-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
            </div>
          </label>
          <label className="text-xs text-muted">
            Montør
            <div className="relative mt-1">
              <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <select value={technicianId} onChange={(e) => changeAndReset(setTechnicianId)(e.target.value)} className="w-full rounded-lg border border-line bg-panel pl-8 pr-3 py-2 text-sm text-ink focus:outline-none focus:border-brand">
                <option value="">Alle montører</option>
                <option value="unassigned">Ikke tildelt</option>
                {technicians.map((m) => <option key={m.id} value={m.id}>{m.navn}</option>)}
              </select>
            </div>
          </label>
          <label className="text-xs text-muted">
            Fra dato
            <div className="relative mt-1">
              <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input type="date" value={fromDate} onChange={(e) => changeAndReset(setFromDate)(e.target.value)} className="w-full rounded-lg border border-line bg-panel pl-8 pr-3 py-2 text-sm text-ink font-mono focus:outline-none focus:border-brand" />
            </div>
          </label>
          <label className="text-xs text-muted">
            Til dato
            <div className="relative mt-1">
              <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input type="date" value={toDate} onChange={(e) => changeAndReset(setToDate)(e.target.value)} className="w-full rounded-lg border border-line bg-panel pl-8 pr-3 py-2 text-sm text-ink font-mono focus:outline-none focus:border-brand" />
            </div>
          </label>
        </div>
        {hasFilter && (
          <button onClick={clearAll} className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted hover:text-brand flex items-center gap-1">
            <X size={13} /> Ryd søgning
          </button>
        )}
      </div>

      {!hasFilter ? (
        <p className="text-sm text-muted italic">Angiv mindst ét søgekriterie ovenfor for at slå sager op.</p>
      ) : (
        <div>
          <p className="text-xs text-muted mb-3">{results.length} {results.length === 1 ? "sag" : "sager"} matcher, nyeste først</p>
          {results.length === 0 ? (
            <p className="text-sm text-muted italic">Ingen sager matcher søgningen.</p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                {results.slice(0, visibleCount).map((o) => <OrderCardCompact key={o.id} order={o} technicians={technicians} onOpen={onOpen} onCycleStatus={() => {}} />)}
              </div>
              {results.length > visibleCount && (
                <button onClick={() => setVisibleCount((v) => v + 30)} className="mt-4 w-full py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wide text-ink border border-line hover:border-brand hover:text-brand transition-colors">
                  Vis flere ({results.length - visibleCount} tilbage)
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export { ArchivePage };
