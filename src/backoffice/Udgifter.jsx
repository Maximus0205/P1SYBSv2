import React, { useCallback, useEffect, useState } from "react";
import { Loader2, AlertCircle, Check, Plus, Pencil, Trash2 } from "lucide-react";
import { hentUdgifter, gemUdgift, sletUdgift, kr, krTilFelt, oreFraKr, datoTekst } from "../lib/billing";

// Udgifter: det I selv betaler for at drive løsningen (Supabase, domæne, andre tjenester). Gentagende udgifter (fx månedligt abonnement) tæller med hver måned i dashboardet.
// SMS-omkostningen kommer ikke herfra - den beregnes automatisk ud fra antal sendte SMS og SMS-indkøbsprisen under Indstillinger.
const felt = "w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink min-h-[44px] focus:outline-none focus:border-bo";
const label = "block text-xs font-semibold text-muted mb-1";
const knapPrim = "min-h-[44px] px-4 rounded-lg text-sm font-semibold text-white bg-bo hover:bg-bo-dark focus:outline-none focus:ring-2 focus:ring-bo transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none";
const knapSek = "min-h-[44px] px-4 rounded-lg text-sm font-semibold text-ink border border-line hover:border-bo hover:text-bo focus:outline-none focus:ring-2 focus:ring-bo transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none";
const iDag = () => new Date().toISOString().slice(0, 10);
const TOM = { id: null, dato: iDag(), tekst: "", kategori: "", beloeb: "", gentag: false, slut_dato: "" };

export function UdgifterSektion() {
  const [liste, setListe] = useState(null);
  const [f, setF] = useState(null); // null = formularen er lukket
  const [fejl, setFejl] = useState("");
  const [besked, setBesked] = useState("");
  const [busy, setBusy] = useState(false);

  const hent = useCallback(async () => { const r = await hentUdgifter(); if (!r.ok) { setFejl(r.fejl); setListe([]); return; } setListe(r.data || []); }, []);
  useEffect(() => { hent(); }, [hent]);

  const gem = async (e) => {
    e.preventDefault(); setFejl(""); setBesked("");
    const ore = oreFraKr(f.beloeb);
    if (!f.tekst.trim()) return setFejl("Skriv, hvad udgiften er.");
    if (ore === null) return setFejl("Beløbet skal være et tal i kr. (fx 250 eller 249,50).");
    if (!f.dato) return setFejl("Vælg en dato.");
    if (f.gentag && f.slut_dato && f.slut_dato < f.dato) return setFejl("Slutdatoen kan ikke være før startdatoen.");
    setBusy(true);
    const r = await gemUdgift({ id: f.id, dato: f.dato, tekst: f.tekst.trim(), kategori: f.kategori.trim(), beloeb_ore: ore, gentag: f.gentag, slut_dato: f.slut_dato });
    setBusy(false);
    if (!r.ok) return setFejl(r.fejl);
    setBesked("Udgiften er gemt."); setF(null); hent();
  };
  const slet = async (u) => {
    if (!window.confirm(`Slet "${u.tekst}"? Det kan ikke fortrydes.`)) return;
    setFejl(""); setBesked("");
    const r = await sletUdgift(u.id);
    if (!r.ok) return setFejl(r.fejl);
    setBesked("Udgiften er slettet."); hent();
  };
  const saet = (k, v) => setF((p) => ({ ...p, [k]: v }));

  return (
    <div className="max-w-3xl">
      {fejl && <p role="alert" className="text-xs text-danger mb-3 flex items-start gap-1.5"><AlertCircle size={13} className="shrink-0 mt-0.5" aria-hidden="true" /> {fejl}</p>}
      {besked && <p role="status" className="text-xs text-success mb-3 flex items-start gap-1.5"><Check size={13} className="shrink-0 mt-0.5" aria-hidden="true" /> {besked}</p>}

      {f ? (
        <form onSubmit={gem} className="rounded-xl border border-line bg-white p-5 shadow-sm mb-5" aria-label={f.id ? "Redigér udgift" : "Ny udgift"}>
          <h3 className="text-sm font-semibold text-ink mb-3">{f.id ? "Redigér udgift" : "Ny udgift"}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><label htmlFor="u-tekst" className={label}>Hvad er det?</label><input id="u-tekst" value={f.tekst} onChange={(e) => saet("tekst", e.target.value)} className={felt} placeholder="fx Supabase Pro" /></div>
            <div><label htmlFor="u-bel" className={label}>Beløb (kr., før moms)</label><input id="u-bel" inputMode="decimal" value={f.beloeb} onChange={(e) => saet("beloeb", e.target.value)} className={felt} /></div>
            <div><label htmlFor="u-kat" className={label}>Kategori (valgfri)</label><input id="u-kat" value={f.kategori} onChange={(e) => saet("kategori", e.target.value)} className={felt} placeholder="fx Drift" /></div>
            <div><label htmlFor="u-dato" className={label}>{f.gentag ? "Første gang" : "Dato"}</label><input id="u-dato" type="date" value={f.dato} onChange={(e) => saet("dato", e.target.value)} className={felt} /></div>
            {f.gentag && <div><label htmlFor="u-slut" className={label}>Stopper (valgfri)</label><input id="u-slut" type="date" value={f.slut_dato} onChange={(e) => saet("slut_dato", e.target.value)} className={felt} /></div>}
          </div>
          <label className="flex items-center gap-2 text-sm text-ink min-h-[44px] mt-2"><input type="checkbox" checked={f.gentag} onChange={(e) => saet("gentag", e.target.checked)} className="h-4 w-4" /> Gentages hver måned</label>
          <div className="flex gap-2 mt-3 flex-wrap">
            <button type="submit" disabled={busy} className={knapPrim}>{busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />} Gem udgift</button>
            <button type="button" onClick={() => { setF(null); setFejl(""); }} className={knapSek}>Annullér</button>
          </div>
        </form>
      ) : (
        <button onClick={() => { setF({ ...TOM, dato: iDag() }); setBesked(""); }} className={knapPrim + " mb-5"}><Plus size={15} aria-hidden="true" /> Tilføj udgift</button>
      )}

      {liste === null && <p className="text-sm text-muted flex items-center gap-2"><Loader2 size={15} className="animate-spin" aria-hidden="true" /> Henter...</p>}
      {liste && liste.length === 0 && <p className="text-sm text-muted">Ingen udgifter tilføjet endnu. Tilføj fx jeres Supabase-abonnement og domæne som gentagende udgifter, så dashboardet viser det rigtige resultat.</p>}
      {liste && liste.length > 0 && (
        <ul className="space-y-2">
          {liste.map((u) => (
            <li key={u.id} className="rounded-xl border border-line bg-white p-4 shadow-sm flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink break-words">{u.tekst}</p>
                <p className="text-xs text-muted mt-0.5">{u.kategori ? `${u.kategori} · ` : ""}{u.gentag ? `hver måned fra ${datoTekst(u.dato)}${u.slut_dato ? ` til ${datoTekst(u.slut_dato)}` : ""}` : datoTekst(u.dato)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-ink [font-variant-numeric:tabular-nums]">{kr(u.beloeb_ore)}{u.gentag ? " / md." : ""}</span>
                <button onClick={() => { setF({ id: u.id, dato: u.dato, tekst: u.tekst, kategori: u.kategori || "", beloeb: krTilFelt(u.beloeb_ore), gentag: u.gentag, slut_dato: u.slut_dato || "" }); setBesked(""); setFejl(""); window.scrollTo({ top: 0 }); }} className={knapSek + " !px-3"} aria-label={`Redigér ${u.tekst}`}><Pencil size={15} aria-hidden="true" /></button>
                <button onClick={() => slet(u)} className={knapSek + " !px-3"} aria-label={`Slet ${u.tekst}`}><Trash2 size={15} aria-hidden="true" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
