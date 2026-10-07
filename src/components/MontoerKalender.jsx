import React, { useEffect, useState } from "react";
import { AlertCircle, Loader2, Trash2 } from "lucide-react";
import { hentArbejdstider, gemArbejdstid, nulstilArbejdstid, hentUaendringer, tilfoejUaendring, sletUaendring, hentKapacitetsIndstillinger } from "../lib/kapacitetStore";
import { tilMin, tilHHMM } from "../engine/kapacitet";
import { todayISO } from "../data/domain";

// Admin -> Montører -> Kalender (oktober 2026): montørens normale arbejdstid pr. ugedag og ændringer på bestemte datoer ("møder først kl. 10",
// "går kl. 15", "væk 12-13"). Kapacitetsmotoren regner bilens tid ud fra dem. Der gemmes BEVIDST ingen årsag til en ændring: en årsag
// som "læge" er en helbredsoplysning om en medarbejder, og planlægningen har kun brug for tidsrummet. Kræver rettigheden admin_kalender.
const DAGE = [[1, "Mandag"], [2, "Tirsdag"], [3, "Onsdag"], [4, "Torsdag"], [5, "Fredag"], [6, "Lørdag"], [7, "Søndag"]];
const felt = "rounded-lg border border-line bg-panel px-2 py-2 text-sm text-ink font-mono focus:outline-none focus:border-brand";
const knap = "min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-brand transition-colors";

function tekstFor(u) {
  if (u.from_min === 0) return `Møder først kl. ${tilHHMM(u.to_min)}`;
  if (u.to_min >= 1440) return `Går kl. ${tilHHMM(u.from_min)}`;
  return `Væk ${tilHHMM(u.from_min)}–${tilHHMM(u.to_min)}`;
}

function DagRaekke({ navn, dag, raekke, std, onGem, onNulstil, disabled }) {
  const udgangspunkt = raekke ? { arbejder: raekke.arbejder, start: tilHHMM(raekke.start_min), slut: tilHHMM(raekke.end_min), pause: String(raekke.pause_min) }
    : { arbejder: std.arbejdsdage.includes(dag), start: std.standardStart, slut: std.standardSlut, pause: String(std.standardPauseMin) };
  const [d, setD] = useState(udgangspunkt);
  const [fejl, setFejl] = useState("");
  useEffect(() => { setD(udgangspunkt); setFejl(""); }, [raekke?.start_min, raekke?.end_min, raekke?.pause_min, raekke?.arbejder]); // eslint-disable-line react-hooks/exhaustive-deps
  const aendret = JSON.stringify(d) !== JSON.stringify(udgangspunkt);
  const id = (s) => `kal-${dag}-${s}`;
  const gem = () => {
    const a = tilMin(d.start); const b = tilMin(d.slut); const p = Number(d.pause);
    if (d.arbejder && (a === null || b === null || b <= a)) return setFejl("Slut skal være efter start.");
    if (!Number.isFinite(p) || p < 0 || p > 240 || (d.arbejder && p >= b - a)) return setFejl("Pausen skal være mellem 0 og 240 min og kortere end arbejdsdagen.");
    setFejl("");
    onGem({ weekday: dag, arbejder: d.arbejder, startMin: a ?? 480, endMin: b ?? 960, pauseMin: p });
  };
  return (
    <div className="flex items-center gap-2 flex-wrap py-2 border-b border-divider last:border-0">
      <label className="flex items-center gap-2 w-28 min-h-[44px] text-sm text-ink cursor-pointer">
        <input type="checkbox" checked={d.arbejder} disabled={disabled} onChange={(e) => setD((p) => ({ ...p, arbejder: e.target.checked }))} className="w-5 h-5 accent-brand" aria-label={`${navn}: arbejder`} /> {navn}
      </label>
      <input id={id("start")} aria-label={`${navn} start`} type="time" value={d.start} disabled={disabled || !d.arbejder} onChange={(e) => setD((p) => ({ ...p, start: e.target.value }))} className={felt} />
      <span className="text-muted">–</span>
      <input id={id("slut")} aria-label={`${navn} slut`} type="time" value={d.slut} disabled={disabled || !d.arbejder} onChange={(e) => setD((p) => ({ ...p, slut: e.target.value }))} className={felt} />
      <input id={id("pause")} aria-label={`${navn} pause i minutter`} type="number" inputMode="numeric" value={d.pause} disabled={disabled || !d.arbejder} onChange={(e) => setD((p) => ({ ...p, pause: e.target.value }))} className={`${felt} w-20`} />
      <span className="text-xs text-muted">min pause</span>
      {!disabled && aendret && <button onClick={gem} className={`${knap} text-white bg-ink hover:bg-brand`}>Gem</button>}
      {!disabled && raekke && <button onClick={() => onNulstil(dag)} className={`${knap} text-muted border border-line hover:border-brand`}>Brug standard</button>}
      {!raekke && <span className="text-[11px] text-muted">standard</span>}
      {fejl && <span role="alert" className="text-xs text-danger w-full">{fejl}</span>}
    </div>
  );
}

function MontoerKalender({ storeId, personer, maaRedigere = true }) {
  const [valgt, setValgt] = useState(personer?.[0]?.id || "");
  const [raekker, setRaekker] = useState([]);
  const [uaendringer, setUaendringer] = useState([]);
  const [std, setStd] = useState(null);
  const [fejl, setFejl] = useState("");
  const [form, setForm] = useState({ dato: "", type: "foerst", fra: "10:00", til: "13:00" });
  const [busy, setBusy] = useState(false);

  const hent = async () => {
    const [r, u, s] = await Promise.all([hentArbejdstider(storeId), hentUaendringer(storeId, todayISO()), hentKapacitetsIndstillinger(storeId)]);
    setRaekker(r); setUaendringer(u); setStd((s || {}).tider ? s.tider : null);
  };
  useEffect(() => { if (storeId) hent(); }, [storeId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!valgt && personer?.[0]) setValgt(personer[0].id); }, [personer]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!personer || personer.length === 0) return null;
  if (!std) return <p className="text-xs text-muted flex items-center gap-1.5 mt-6"><Loader2 size={13} className="animate-spin" aria-hidden="true" /> Henter kalender...</p>;

  const raekkerFor = (dag) => raekker.find((r) => r.person_id === valgt && r.weekday === dag);
  const mine = uaendringer.filter((u) => u.person_id === valgt);
  const svar = async (p) => { const r = await p; if (!r.ok) setFejl(r.fejl || "Ændringen blev ikke gemt."); else setFejl(""); await hent(); };

  const tilfoej = async () => {
    setFejl("");
    if (!form.dato) return setFejl("Vælg en dato.");
    let fra; let til;
    if (form.type === "foerst") { fra = 0; til = tilMin(form.fra); }          // "møder først kl. X" = ikke tilgængelig 00:00-X
    else if (form.type === "gaar") { fra = tilMin(form.fra); til = 1440; }    // "går kl. X" = ikke tilgængelig X-24:00
    else { fra = tilMin(form.fra); til = tilMin(form.til); }                  // "væk fra-til"
    if (fra === null || til === null || til <= fra) return setFejl("Tidsrummet er ugyldigt: slut skal være efter start.");
    setBusy(true);
    const r = await tilfoejUaendring({ storeId, personId: valgt, dato: form.dato, fraMin: fra, tilMin: til });
    setBusy(false);
    if (!r.ok) return setFejl(r.fejl || "Ændringen blev ikke gemt.");
    await hent();
    setForm((p) => ({ ...p, dato: "" }));
  };

  return (
    <div className="mt-8">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1">Kalender pr. montør</h3>
      <p className="text-xs text-muted mb-3">Bilens tid regnes ud fra montørens arbejdstid. Sæt en normal arbejdsdag pr. ugedag, og læg ændringer på bestemte datoer ind frem i tiden. Der gemmes ingen årsag til en ændring, kun tidsrummet.{!maaRedigere && " Du kan se kalenderen, men ikke ændre den."}</p>
      <label htmlFor="kal-person" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Montør</label>
      <select id="kal-person" value={valgt} onChange={(e) => setValgt(e.target.value)} className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink min-h-[44px] mb-4 focus:outline-none focus:border-brand">
        {personer.map((p) => <option key={p.id} value={p.id}>{p.navn}</option>)}
      </select>

      <div className="rounded-xl border border-line bg-white p-4 shadow-sm mb-4 max-w-2xl">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Normal arbejdstid</h4>
        {DAGE.map(([n, navn]) => (
          <DagRaekke key={`${valgt}-${n}`} navn={navn} dag={n} raekke={raekkerFor(n)} std={std} disabled={!maaRedigere}
            onGem={(v) => svar(gemArbejdstid({ storeId, personId: valgt, ...v }))} onNulstil={(dag) => svar(nulstilArbejdstid(valgt, dag))} />
        ))}
      </div>

      <div className="rounded-xl border border-line bg-white p-4 shadow-sm max-w-2xl">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Ændringer på bestemte datoer</h4>
        {mine.length === 0 ? <p className="text-sm text-muted italic mb-3">Ingen kommende ændringer.</p> : (
          <ul className="mb-3 divide-y divide-divider">
            {mine.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2 py-2">
                <span className="text-sm text-ink"><span className="font-mono">{new Date(`${u.dato}T00:00:00`).toLocaleDateString("da-DK", { weekday: "short", day: "numeric", month: "short" })}</span> · {tekstFor(u)}</span>
                {maaRedigere && <button onClick={() => svar(sletUaendring(u.id))} aria-label={`Fjern ændring ${u.dato}`} className="w-11 h-11 flex items-center justify-center rounded-lg text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger"><Trash2 size={15} aria-hidden="true" /></button>}
              </li>
            ))}
          </ul>
        )}
        {maaRedigere && (
          <div className="flex items-end gap-2 flex-wrap">
            <div><label htmlFor="kal-dato" className="block text-[11px] text-muted mb-1">Dato</label><input id="kal-dato" type="date" min={todayISO()} value={form.dato} onChange={(e) => setForm((p) => ({ ...p, dato: e.target.value }))} className={felt} /></div>
            <div><label htmlFor="kal-type" className="block text-[11px] text-muted mb-1">Hvad</label>
              <select id="kal-type" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))} className={`${felt} font-sans`}>
                <option value="foerst">Møder først kl.</option><option value="gaar">Går kl.</option><option value="vaek">Væk i tidsrum</option>
              </select></div>
            <div><label htmlFor="kal-fra" className="block text-[11px] text-muted mb-1">{form.type === "vaek" ? "Fra" : "Kl."}</label><input id="kal-fra" type="time" value={form.fra} onChange={(e) => setForm((p) => ({ ...p, fra: e.target.value }))} className={felt} /></div>
            {form.type === "vaek" && <div><label htmlFor="kal-til" className="block text-[11px] text-muted mb-1">Til</label><input id="kal-til" type="time" value={form.til} onChange={(e) => setForm((p) => ({ ...p, til: e.target.value }))} className={felt} /></div>}
            <button onClick={tilfoej} disabled={busy} className={`${knap} text-white bg-ink hover:bg-brand disabled:opacity-50`}>Tilføj</button>
          </div>
        )}
      </div>
      {fejl && <p role="alert" className="text-xs text-danger mt-3 flex items-center gap-1.5"><AlertCircle size={13} className="shrink-0" aria-hidden="true" /> {fejl}</p>}
    </div>
  );
}

export { MontoerKalender };
