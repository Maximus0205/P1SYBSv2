import React, { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { Plus, Trash2, Pencil, Check, X, AlertCircle, Loader2, Search, Upload } from "lucide-react";
import { useButikVarer } from "../hooks/useButikVarer";
import { normaliserModel, raekkerTilVarer, vareFejl } from "../lib/butikVarer";

// Admin -> Varer & ydelser -> Butikkens varer: butikkens EGEN, kuraterede varedatabase til varer der ikke findes på punkt1.dk
// (fx Gram og Silverline). Bookingen slår modelnumre op her, når punkt1.dk ikke kender dem, og foreslår "mente du ..." ved
// tastefejl. Kun admin (admin_katalog) kan oprette, rette og slette - databasens RLS håndhæver det, og alle andre i butikken
// kan kun søge. Databasen lærer bevidst IKKE af bookinger: så ville en tastefejl ende på listen som en "rigtig" model.
const felt = "rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand min-h-[44px]";
const knap = "min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-brand flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none";
const VIS_MAKS = 200;

function VareRaekke({ vare, productTypes, onOpdater, onSlet }) {
  const [redigerer, setRedigerer] = useState(false);
  const [brand, setBrand] = useState(vare.brand);
  const [model, setModel] = useState(vare.model);
  const [varetypeId, setVaretypeId] = useState(vare.varetypeId || "");
  const [bekraeftSlet, setBekraeftSlet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fejl, setFejl] = useState("");
  const typeNavn = (productTypes || []).find((t) => t.id === vare.varetypeId)?.navn;

  const gem = async () => {
    const f = vareFejl({ brand, model });
    if (f) return setFejl(f);
    setBusy(true); setFejl("");
    const r = await onOpdater(vare.id, { brand, model, varetypeId });
    setBusy(false);
    if (!r.ok) return setFejl(r.fejl);
    setRedigerer(false);
  };
  const slet = async () => {
    setBusy(true); setFejl("");
    const r = await onSlet(vare.id);
    setBusy(false);
    if (!r.ok) { setFejl(r.fejl); setBekraeftSlet(false); }
  };

  if (redigerer) {
    return (
      <li className="rounded-xl bg-white border border-brand p-3 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs text-muted">Mærke
            <input value={brand} maxLength={80} onChange={(e) => setBrand(e.target.value)} className={`${felt} w-full mt-1`} />
          </label>
          <label className="text-xs text-muted">Modelnummer
            <input value={model} maxLength={80} onChange={(e) => setModel(e.target.value)} className={`${felt} w-full mt-1 font-mono`} />
          </label>
          <label className="text-xs text-muted">Varetype (valgfri)
            <select value={varetypeId} onChange={(e) => setVaretypeId(e.target.value)} className={`${felt} w-full mt-1`}>
              <option value="">Ingen</option>
              {(productTypes || []).map((t) => <option key={t.id} value={t.id}>{t.navn}</option>)}
            </select>
          </label>
        </div>
        {fejl && <p role="alert" className="text-xs text-danger mt-2 flex items-center gap-1.5"><AlertCircle size={13} className="shrink-0" aria-hidden="true" /> {fejl}</p>}
        <div className="flex gap-2 mt-3">
          <button type="button" onClick={gem} disabled={busy} className={`${knap} text-white bg-brand hover:bg-brand-dark`}>{busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Check size={14} aria-hidden="true" />} Gem</button>
          <button type="button" onClick={() => { setRedigerer(false); setBrand(vare.brand); setModel(vare.model); setVaretypeId(vare.varetypeId || ""); setFejl(""); }} disabled={busy} className={`${knap} text-muted border border-line hover:border-muted`}><X size={14} aria-hidden="true" /> Annuller</button>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-xl bg-white border border-line p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink truncate"><span className="font-semibold">{vare.brand}</span> <span className="font-mono">{vare.model}</span></p>
          {typeNavn && <p className="text-[11px] text-muted truncate">{typeNavn}</p>}
        </div>
        {bekraeftSlet ? (
          <>
            <button type="button" onClick={slet} disabled={busy} className={`${knap} text-white bg-danger hover:bg-ink`}>{busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null} Slet</button>
            <button type="button" onClick={() => setBekraeftSlet(false)} disabled={busy} className={`${knap} text-muted border border-line`}>Behold</button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setRedigerer(true)} aria-label={`Redigér ${vare.brand} ${vare.model}`} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-line text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand"><Pencil size={15} aria-hidden="true" /></button>
            <button type="button" onClick={() => setBekraeftSlet(true)} aria-label={`Slet ${vare.brand} ${vare.model}`} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-line text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger"><Trash2 size={15} aria-hidden="true" /></button>
          </>
        )}
      </div>
      {fejl && <p role="alert" className="text-xs text-danger mt-2 flex items-center gap-1.5"><AlertCircle size={13} className="shrink-0" aria-hidden="true" /> {fejl}</p>}
    </li>
  );
}

function ButikVarerAdmin({ productTypes }) {
  const { varer, indlaest, fejl: hentFejl, opret, opdater, slet, importer } = useButikVarer();
  const [soeg, setSoeg] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [varetypeId, setVaretypeId] = useState("");
  const [fejl, setFejl] = useState("");
  const [besked, setBesked] = useState("");
  const [busy, setBusy] = useState(false);
  const [forhaand, setForhaand] = useState(null); // { varer, afvist, dubletter, ukendteEksisterende }
  const [importerer, setImporterer] = useState(false);
  const filRef = useRef(null);

  const filtreret = useMemo(() => {
    const t = soeg.trim().toLowerCase();
    const n = normaliserModel(soeg);
    if (!t) return varer;
    return varer.filter((v) => v.brand.toLowerCase().includes(t) || v.model.toLowerCase().includes(t) || (n && normaliserModel(v.model).includes(n)));
  }, [varer, soeg]);

  const tilfoej = async (e) => {
    e.preventDefault();
    const f = vareFejl({ brand, model });
    if (f) return setFejl(f);
    setBusy(true); setFejl(""); setBesked("");
    const r = await opret({ brand, model, varetypeId });
    setBusy(false);
    if (!r.ok) return setFejl(r.fejl);
    setBrand(""); setModel(""); setBesked(`${brand.trim()} ${model.trim()} er oprettet.`);
  };

  const laesFil = (fil) => {
    setFejl(""); setBesked(""); setForhaand(null);
    Papa.parse(fil, {
      skipEmptyLines: true,
      complete: (res) => {
        const r = raekkerTilVarer(res.data);
        const kendte = new Set(varer.map((v) => normaliserModel(v.model)));
        const nye = r.varer.filter((v) => !kendte.has(normaliserModel(v.model)));
        setForhaand({ varer: nye, afvist: r.afvist, dubletter: r.dubletter, findesAllerede: r.varer.length - nye.length });
      },
      error: (err) => setFejl(`Filen kunne ikke læses: ${err.message}`),
    });
    if (filRef.current) filRef.current.value = "";
  };

  const koerImport = async () => {
    if (!forhaand || forhaand.varer.length === 0) return;
    setImporterer(true); setFejl(""); setBesked("");
    const r = await importer(forhaand.varer);
    setImporterer(false);
    if (!r.ok) return setFejl(r.fejl);
    setForhaand(null);
    setBesked(`${r.oprettet} ${r.oprettet === 1 ? "vare" : "varer"} oprettet${r.sprunget ? `, ${r.sprunget} fandtes allerede` : ""}.`);
  };

  return (
    <div>
      <p className="text-xs text-muted mb-4">
        Butikkens egen liste over varer, som ikke findes på punkt1.dk, fx Gram og Silverline. Når en sælger skriver et modelnummer, der ikke findes på punkt1.dk,
        slås det op her, og ved en tastefejl foreslås en lignende model. Kun admin kan oprette og rette. En model, der ikke findes nogen steder, kan stadig bookes, og
        varetypen "Andet" har altid frit modelnummer.
      </p>

      <form onSubmit={tilfoej} className="rounded-xl bg-white border border-line p-4 shadow-sm mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-3">Opret vare</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs text-muted">Mærke
            <input value={brand} maxLength={80} onChange={(e) => setBrand(e.target.value)} placeholder="fx Gram" className={`${felt} w-full mt-1`} />
          </label>
          <label className="text-xs text-muted">Modelnummer
            <input value={model} maxLength={80} onChange={(e) => setModel(e.target.value)} placeholder="fx KS 3135-3" className={`${felt} w-full mt-1 font-mono`} />
          </label>
          <label className="text-xs text-muted">Varetype (valgfri)
            <select value={varetypeId} onChange={(e) => setVaretypeId(e.target.value)} className={`${felt} w-full mt-1`}>
              <option value="">Ingen</option>
              {(productTypes || []).map((t) => <option key={t.id} value={t.id}>{t.navn}</option>)}
            </select>
          </label>
        </div>
        <button type="submit" disabled={busy} className={`${knap} mt-3 text-white bg-brand hover:bg-brand-dark`}>{busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />} Opret vare</button>
      </form>

      <div className="rounded-xl bg-white border border-line p-4 shadow-sm mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1">Importér fra CSV</h3>
        <p className="text-xs text-muted mb-3">En fil med mærke i første kolonne og modelnummer i anden (en overskriftsrække med fx "Mærke" og "Modelnummer" er valgfri). Modeller, der allerede findes, springes over og overskrives ikke.</p>
        <button type="button" onClick={() => filRef.current?.click()} disabled={importerer} className={`${knap} text-ink border border-line hover:bg-panel`}><Upload size={14} aria-hidden="true" /> Vælg CSV-fil</button>
        <input ref={filRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" aria-label="Vælg CSV-fil med varer" onChange={(e) => e.target.files?.[0] && laesFil(e.target.files[0])} />
        {forhaand && (
          <div className="mt-3 rounded-lg bg-panel border border-line p-3" role="status">
            <p className="text-sm text-ink font-semibold">{forhaand.varer.length} {forhaand.varer.length === 1 ? "ny vare" : "nye varer"} klar til import</p>
            <p className="text-xs text-muted mt-0.5">
              {forhaand.findesAllerede > 0 && `${forhaand.findesAllerede} findes allerede. `}
              {forhaand.dubletter > 0 && `${forhaand.dubletter} dubletter i filen springes over. `}
              {forhaand.afvist.length > 0 && `${forhaand.afvist.length} rækker kan ikke bruges.`}
            </p>
            {forhaand.afvist.length > 0 && (
              <ul className="text-xs text-danger mt-1 list-disc pl-4">
                {forhaand.afvist.slice(0, 5).map((a) => <li key={a.linje}>Linje {a.linje}: {a.aarsag}</li>)}
                {forhaand.afvist.length > 5 && <li>… og {forhaand.afvist.length - 5} flere</li>}
              </ul>
            )}
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={koerImport} disabled={importerer || forhaand.varer.length === 0} className={`${knap} text-white bg-brand hover:bg-brand-dark`}>{importerer && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} Importér {forhaand.varer.length}</button>
              <button type="button" onClick={() => setForhaand(null)} disabled={importerer} className={`${knap} text-muted border border-line`}>Annuller</button>
            </div>
          </div>
        )}
      </div>

      {fejl && <p role="alert" className="text-xs text-danger mb-3 flex items-center gap-1.5"><AlertCircle size={13} className="shrink-0" aria-hidden="true" /> {fejl}</p>}
      {besked && <p role="status" className="text-xs text-success mb-3 flex items-center gap-1.5"><Check size={13} className="shrink-0" aria-hidden="true" /> {besked}</p>}

      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input value={soeg} onChange={(e) => setSoeg(e.target.value)} placeholder="Søg i mærke eller modelnummer" aria-label="Søg i butikkens varer" className={`${felt} w-full pl-9`} />
        </div>
        <p className="text-xs text-muted shrink-0">{filtreret.length} af {varer.length}</p>
      </div>

      {hentFejl && <p role="alert" className="text-xs text-danger mb-3">Listen kunne ikke hentes: {hentFejl}</p>}
      {!indlaest && !hentFejl && <p className="text-sm text-muted flex items-center gap-1.5"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Henter varer…</p>}
      {indlaest && !hentFejl && varer.length === 0 && <p className="text-sm text-muted italic">Der er ingen varer i butikkens varedatabase endnu. Opret den første ovenfor, eller importér en CSV-fil.</p>}
      {indlaest && varer.length > 0 && filtreret.length === 0 && <p className="text-sm text-muted italic">Ingen varer matcher søgningen.</p>}
      <ul className="space-y-2">
        {filtreret.slice(0, VIS_MAKS).map((v) => <VareRaekke key={v.id} vare={v} productTypes={productTypes} onOpdater={opdater} onSlet={slet} />)}
      </ul>
      {filtreret.length > VIS_MAKS && <p className="text-xs text-muted mt-2">Viser de første {VIS_MAKS}. Brug søgningen for at finde resten.</p>}
    </div>
  );
}

export { ButikVarerAdmin };
