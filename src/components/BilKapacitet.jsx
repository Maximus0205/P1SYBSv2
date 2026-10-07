import React, { useState } from "react";
import { Check, AlertCircle } from "lucide-react";

// Admin -> Biler (oktober 2026): bilens nyttelast, værktøjsvægt og lasterum. Kapacitetsmotoren bruger dem til at afgøre, om varerne kan
// være på bilen (vægt og plads). Er et felt tomt, springer motoren den del over for bilen - intet gættes. Tallene tastes fra bilens
// papirer og kassens datablad. Personers vægt regnes automatisk (fast standardværdi) og skal ikke tastes her.
const tekst = (v) => (v === null || v === undefined ? "" : String(v));
const fraBil = (b) => ({ nyttelastKg: tekst(b.nyttelastKg), vaerktoejKg: tekst(b.vaerktoejKg), l: tekst(b.lasterum?.laengdeCm), b: tekst(b.lasterum?.breddeCm), h: tekst(b.lasterum?.hoejdeCm) });
const num = (v) => (String(v).trim() === "" ? null : Number(String(v).replace(",", ".")));

function BilRaekke({ bil, onUpdate }) {
  const [d, setD] = useState(() => fraBil(bil));
  const [fejl, setFejl] = useState("");
  const [besked, setBesked] = useState("");
  const aendret = JSON.stringify(d) !== JSON.stringify(fraBil(bil));
  const sæt = (k, v) => { setD((p) => ({ ...p, [k]: v })); setBesked(""); setFejl(""); };

  const gem = () => {
    const nytte = num(d.nyttelastKg); const vaerk = num(d.vaerktoejKg); const mål = [num(d.l), num(d.b), num(d.h)];
    if (nytte !== null && !(nytte > 0 && nytte <= 5000)) return setFejl("Nyttelasten skal være mellem 1 og 5000 kg.");
    if (vaerk !== null && !(vaerk >= 0 && vaerk <= 1000)) return setFejl("Værktøjsvægten skal være mellem 0 og 1000 kg.");
    const udfyldt = mål.filter((x) => x !== null).length;
    if (udfyldt !== 0 && udfyldt !== 3) return setFejl("Udfyld alle tre mål på lasterummet (længde, bredde og højde), eller ingen af dem.");
    if (udfyldt === 3 && !mål.every((x) => x > 0 && x <= 1000)) return setFejl("Lasterummets mål skal være mellem 1 og 1000 cm.");
    onUpdate(bil.id, { nyttelastKg: nytte, vaerktoejKg: vaerk, lasterum: udfyldt === 3 ? { laengdeCm: mål[0], breddeCm: mål[1], hoejdeCm: mål[2] } : null });
    setBesked("Gemt.");
  };
  const felt = "w-24 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink font-mono focus:outline-none focus:border-brand";
  const id = (s) => `bil-${bil.id}-${s}`;
  return (
    <div className="rounded-xl bg-white border border-line p-4 shadow-sm">
      <p className="text-sm font-semibold text-ink mb-3">{bil.navn} <span className="font-mono text-xs text-muted">{bil.nummerplade}</span></p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor={id("nytte")} className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Nyttelast</label><div className="flex items-center gap-2"><input id={id("nytte")} type="number" inputMode="decimal" value={d.nyttelastKg} onChange={(e) => sæt("nyttelastKg", e.target.value)} className={felt} /><span className="text-sm text-muted">kg</span></div></div>
        <div><label htmlFor={id("vaerk")} className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Værktøj og fast last</label><div className="flex items-center gap-2"><input id={id("vaerk")} type="number" inputMode="decimal" value={d.vaerktoejKg} onChange={(e) => sæt("vaerktoejKg", e.target.value)} className={felt} /><span className="text-sm text-muted">kg</span></div></div>
      </div>
      <fieldset className="mt-3">
        <legend className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Lasterum, indvendige mål</legend>
        <div className="flex items-center gap-2 flex-wrap">
          {[["l", "Længde"], ["b", "Bredde"], ["h", "Højde"]].map(([k, navn]) => (
            <span key={k} className="flex items-center gap-1.5"><label htmlFor={id(k)} className="text-xs text-muted">{navn}</label><input id={id(k)} type="number" inputMode="decimal" value={d[k]} onChange={(e) => sæt(k, e.target.value)} className={felt} /></span>
          ))}
          <span className="text-sm text-muted">cm</span>
        </div>
      </fieldset>
      {fejl && <p role="alert" className="text-xs text-danger mt-2 flex items-center gap-1.5"><AlertCircle size={13} className="shrink-0" aria-hidden="true" /> {fejl}</p>}
      {besked && !aendret && <p role="status" className="text-xs text-success mt-2 flex items-center gap-1.5"><Check size={13} className="shrink-0" aria-hidden="true" /> {besked}</p>}
      <button onClick={gem} disabled={!aendret} className="mt-3 min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors disabled:opacity-50 disabled:pointer-events-none">Gem {bil.navn}</button>
    </div>
  );
}

function BilKapacitet({ vehicles, onUpdate }) {
  if (!vehicles || vehicles.length === 0) return null;
  return (
    <div className="mt-8">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1">Nyttelast og lasterum</h3>
      <p className="text-xs text-muted mb-3">Bruges af planlægningen til at sikre, at bilen ikke overlæsses, og at varerne er der plads til. Står et felt tomt, springer planlægningen den del over for den bil. Personerne i bilen regnes automatisk med en fast standardvægt.</p>
      <div className="space-y-2">{vehicles.map((b) => <BilRaekke key={b.id} bil={b} onUpdate={onUpdate} />)}</div>
    </div>
  );
}

export { BilKapacitet };
