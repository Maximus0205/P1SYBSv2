// Faste makkerpar og "kører alene" (oktober 2026) - bruges af forslaget til dagens hold (lib/holdForslag.js).
import React from "react";
import { Users, User } from "lucide-react";

export function HoldIndstillinger({ montoerer, medhjaelpere, crew, onSetPair, onSetSolo }) {
  const [fejl, setFejl] = React.useState("");
  const [optaget, setOptaget] = React.useState(null);
  const fast = new Map(crew.pairs.map((p) => [p.montorId, p.helperId]));
  const soloSet = new Set(crew.solo);
  const navn = (id) => [...montoerer, ...medhjaelpere].find((p) => p.id === id)?.navn || "Ukendt";

  const kør = async (id, fn) => {
    setFejl(""); setOptaget(id);
    const ok = await fn();
    setOptaget(null);
    if (ok === false) setFejl("Ændringen blev ikke gemt. Prøv igen.");
  };

  if (montoerer.length === 0) return null;
  return (
    <div className="rounded-xl border border-line bg-white p-4 mb-6 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1 flex items-center gap-1.5"><Users size={14} aria-hidden="true" /> Makkere og kørsel alene</h3>
      <p className="text-xs text-muted mb-3">
        Bruges, når systemet foreslår dagens hold til ture med to-mands-opgaver. Et fast makkerpar sættes sammen først, når begge er på arbejde. En montør der kører alene får aldrig en medhjælper foreslået.
      </p>
      {medhjaelpere.length === 0 && <p className="text-xs text-muted italic mb-3">Ingen medhjælpere endnu. Opret en bruger med rollen "Medhjælper" under fanen "Brugere".</p>}
      <div className="space-y-2">
        {montoerer.map((m) => {
          const alene = soloSet.has(m.id);
          const makker = fast.get(m.id) || "";
          const optagetAfAndre = new Set([...fast.entries()].filter(([mid]) => mid !== m.id).map(([, hid]) => hid));
          return (
            <div key={m.id} className="flex items-center gap-2 flex-wrap rounded-lg bg-panel border border-line px-3 py-2">
              <span className="text-sm font-semibold text-ink min-w-[7rem] flex-1 truncate">{m.navn}</span>
              <button
                onClick={() => kør(m.id, () => onSetSolo(m.id, !alene))}
                disabled={optaget === m.id}
                aria-pressed={alene}
                className={`h-10 px-3 flex items-center gap-1.5 rounded-lg border text-xs font-semibold uppercase tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-60 ${alene ? "border-brand bg-brand/10 text-brand" : "border-line text-muted hover:border-brand hover:text-brand"}`}
              >
                <User size={13} aria-hidden="true" /> Kører alene
              </button>
              <select
                value={makker}
                onChange={(e) => kør(m.id, () => onSetPair(m.id, e.target.value || null))}
                disabled={alene || optaget === m.id}
                aria-label={`Fast makker for ${m.navn}`}
                className="h-10 rounded-lg border border-line bg-white px-2 text-xs text-ink focus:outline-none focus:border-brand disabled:opacity-50"
              >
                <option value="">Ingen fast makker</option>
                {medhjaelpere.map((h) => (
                  <option key={h.id} value={h.id} disabled={optagetAfAndre.has(h.id)}>{h.navn}{optagetAfAndre.has(h.id) ? ` (makker med ${navn([...fast.entries()].find(([, hid]) => hid === h.id)?.[0])})` : ""}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      {fejl && <p role="alert" className="text-xs text-danger mt-2">{fejl}</p>}
    </div>
  );
}
