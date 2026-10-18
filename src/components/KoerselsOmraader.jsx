import React, { useEffect, useState } from "react";
import { Check, AlertCircle, Plus, Trash2, Loader2 } from "lucide-react";
import { hentKapacitetsIndstillinger, gemKapacitetsIndstillinger } from "../lib/kapacitetStore";
import { parsPostnumre, renPostnumre, JYLLAND_POSTNUMRE } from "../engine/kapacitet/omraade";

// Admin -> Biler: butikkens kørselsområder (oktober 2026). Et område er et navn og de postnumre, det dækker. En bil kan få et fast område
// (se BilKapacitet) og har så forrang på sager i området - den udelukkes ikke fra andet, og andre biler må stadig køre i området.
// Områderne gemmes i butikkens kapacitetsindstillinger (stores.capacity_settings.omraader); kun butikkens admin kan gemme (databasen håndhæver det).
const nytId = () => `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const delGyldig = (t) => parsPostnumre(t).length === 1;
const specGyldig = (spec) => { const dele = String(spec ?? "").split(/[,;\s]+/).filter(Boolean); return dele.length > 0 && dele.every(delGyldig); };
const felt = "rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand min-h-[44px]";

function KoerselsOmraader({ storeId, omraader, vehicles, onGemt }) {
  const [raekker, setRaekker] = useState(omraader || []);
  const [busy, setBusy] = useState(false);
  const [fejl, setFejl] = useState("");
  const [besked, setBesked] = useState("");
  useEffect(() => { setRaekker(omraader || []); }, [omraader]);

  const aendret = JSON.stringify(raekker) !== JSON.stringify(omraader || []);
  const sæt = (id, felter) => { setRaekker((p) => p.map((r) => (r.id === id ? { ...r, ...felter } : r))); setBesked(""); setFejl(""); };
  const antalBiler = (id) => (vehicles || []).filter((v) => v.omraade === id).length;
  const fjern = (r) => {
    const n = antalBiler(r.id);
    if (n > 0) return setFejl(`${r.navn || "Området"} bruges af ${n} ${n === 1 ? "bil" : "biler"}. Vælg et andet område (eller "Ingen fast område") på bilen først.`);
    setRaekker((p) => p.filter((x) => x.id !== r.id)); setBesked(""); setFejl("");
  };

  const gem = async () => {
    setFejl(""); setBesked("");
    for (const r of raekker) {
      if (!r.navn.trim()) return setFejl("Alle områder skal have et navn.");
      if (!specGyldig(r.postnumre)) return setFejl(`${r.navn.trim()}: skriv postnumre som fx "6000-8304, 5000" (fire cifre, intervaller med bindestreg).`);
    }
    const navne = raekker.map((r) => r.navn.trim().toLowerCase());
    if (new Set(navne).size !== navne.length) return setFejl("To områder må ikke hedde det samme.");
    setBusy(true);
    // Hent butikkens nyeste indstillinger lige før gem, så andre indstillinger ikke overskrives med forældede værdier.
    const frisk = await hentKapacitetsIndstillinger(storeId);
    if (!frisk) { setBusy(false); return setFejl("Butikkens indstillinger kunne ikke hentes, så der er ikke gemt noget. Prøv igen."); }
    const nye = raekker.map((r) => ({ id: r.id, navn: r.navn.trim(), postnumre: renPostnumre(r.postnumre) }));
    const r = await gemKapacitetsIndstillinger(storeId, { ...frisk, omraader: nye });
    setBusy(false);
    if (!r.ok) return setFejl(`Kunne ikke gemme: ${r.fejl}`);
    onGemt(nye);
    setBesked("Gemt.");
  };

  return (
    <div className="mt-8">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1">Kørselsområder</h3>
      <p className="text-xs text-muted mb-3">Opret de områder, en bil kan køre fast i, fx "Jylland" eller "Sjælland", med postnumre. Vælg bagefter området på den enkelte bil.</p>
      <div className="space-y-2">
        {raekker.length === 0 && <p className="text-sm text-muted italic">Ingen områder oprettet endnu.</p>}
        {raekker.map((r) => (
          <div key={r.id} className="rounded-xl bg-white border border-line p-3 shadow-sm flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[140px]">
              <label htmlFor={`om-${r.id}-navn`} className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Navn</label>
              <input id={`om-${r.id}-navn`} value={r.navn} maxLength={60} onChange={(e) => sæt(r.id, { navn: e.target.value })} className={`${felt} w-full`} />
            </div>
            <div className="flex-[2] min-w-[200px]">
              <label htmlFor={`om-${r.id}-post`} className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Postnumre</label>
              <input id={`om-${r.id}-post`} value={r.postnumre} maxLength={300} onChange={(e) => sæt(r.id, { postnumre: e.target.value })} placeholder="fx 6000-8304, 8306-9999" className={`${felt} w-full font-mono`} />
            </div>
            <button type="button" onClick={() => fjern(r)} aria-label={`Fjern område ${r.navn || ""}`} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-line text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-brand"><Trash2 size={16} aria-hidden="true" /></button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <button type="button" onClick={() => { setRaekker((p) => [...p, { id: nytId(), navn: "", postnumre: "" }]); setBesked(""); setFejl(""); }} disabled={raekker.length >= 20} className="min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide border border-line text-ink hover:bg-panel focus:outline-none focus:ring-2 focus:ring-brand flex items-center gap-1.5 disabled:opacity-50"><Plus size={14} aria-hidden="true" /> Nyt område</button>
        {!raekker.some((r) => r.navn.trim().toLowerCase() === "jylland") && (
          <button type="button" onClick={() => { setRaekker((p) => [...p, { id: "jylland", navn: "Jylland", postnumre: JYLLAND_POSTNUMRE }]); setBesked(""); setFejl(""); }} className="min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide border border-line text-ink hover:bg-panel focus:outline-none focus:ring-2 focus:ring-brand">Tilføj Jylland</button>
        )}
        <button type="button" onClick={gem} disabled={!aendret || busy} className="min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-brand hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1.5">{busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} Gem kørselsområder</button>
      </div>
      {fejl && <p role="alert" className="text-xs text-danger mt-2 flex items-center gap-1.5"><AlertCircle size={13} className="shrink-0" aria-hidden="true" /> {fejl}</p>}
      {besked && !aendret && <p role="status" className="text-xs text-success mt-2 flex items-center gap-1.5"><Check size={13} className="shrink-0" aria-hidden="true" /> {besked}</p>}
    </div>
  );
}

export { KoerselsOmraader };
