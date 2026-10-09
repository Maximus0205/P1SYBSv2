import React, { useEffect, useState } from "react";
import { Check, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { hentButiksRegler, gemButiksRegler, hentBrugerReglerForButik, gemBrugerRegler } from "../lib/kapacitetStore";
import { REGLER, NIVEAUER } from "../engine/kapacitet/indstillinger";

// Systemadmin -> Kapacitetsmotor -> "Hvilke regler styrer planlægningen?" (flyttet fra Admin, oktober 2026).
// Butikkens standard + individuel overstyring pr. bruger. Kun systemadmin kan ændre (databasen håndhæver det). Retten til at OVERRULE
// motoren (booke trods blokerende regler) gives separat under Brugere -> rettigheder ("Overrule kapacitetsmotoren").
const NIVEAU_TEKST = { fra: "Fra", raadgivende: "Rådgivende (advarsel)", krav: "Krav (blokerer)" };
const vaelger = "rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink min-h-[44px] focus:outline-none focus:border-brand";
const kort = "rounded-xl border border-line bg-white p-5 shadow-sm mb-4 max-w-2xl";
const overskrift = "text-sm font-semibold uppercase tracking-wide text-ink mb-3";

function Status({ fejl, besked }) {
  return (
    <>
      {fejl && <p role="alert" className="text-xs text-danger mt-3 flex items-center gap-1.5"><AlertCircle size={13} className="shrink-0" aria-hidden="true" /> {fejl}</p>}
      {besked && <p role="status" className="text-xs text-success mt-3 flex items-center gap-1.5"><Check size={13} className="shrink-0" aria-hidden="true" /> {besked}</p>}
    </>
  );
}
const knap = "mt-4 min-h-[44px] px-5 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none";

function KapacitetsRegler({ stores = [] }) {
  const [butik, setButik] = useState(stores[0]?.id || "");
  const [standard, setStandard] = useState(null);
  const [gemtStandard, setGemtStandard] = useState("");
  const [brugere, setBrugere] = useState([]);
  const [overstyringer, setOverstyringer] = useState({});
  const [bruger, setBruger] = useState("");
  const [udkast, setUdkast] = useState({});
  const [busy, setBusy] = useState("");
  const [fejl, setFejl] = useState("");
  const [besked, setBesked] = useState("");
  const [indlaesFejl, setIndlaesFejl] = useState(false);

  useEffect(() => { if (!butik && stores[0]?.id) setButik(stores[0].id); }, [stores]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!butik) return undefined;
    let levende = true;
    setStandard(null); setBrugere([]); setOverstyringer({}); setBruger(""); setUdkast({}); setFejl(""); setBesked(""); setIndlaesFejl(false);
    Promise.all([
      hentButiksRegler(butik),
      hentBrugerReglerForButik(butik),
      supabase.from("profiles").select("id, name, role, username").eq("store_id", butik).order("name"),
    ]).then(([r, o, p]) => {
      if (!levende) return;
      if (!r || o === null || p.error) { setIndlaesFejl(true); return; }
      setStandard(r); setGemtStandard(JSON.stringify(r)); setOverstyringer(o); setBrugere(p.data || []);
    });
    return () => { levende = false; };
  }, [butik]);

  const vaelgBruger = (id) => { setBruger(id); setUdkast({ ...(overstyringer[id] || {}) }); setFejl(""); setBesked(""); };

  const gemStandard = async () => {
    setBusy("standard"); setFejl(""); setBesked("");
    const r = await gemButiksRegler(butik, standard);
    setBusy("");
    if (!r.ok) return setFejl(r.fejl || "Reglerne blev ikke gemt.");
    setGemtStandard(JSON.stringify(standard)); setBesked("Butikkens standard er gemt.");
  };

  const gemBruger = async () => {
    setBusy("bruger"); setFejl(""); setBesked("");
    const r = await gemBrugerRegler({ userId: bruger, storeId: butik, regler: udkast });
    setBusy("");
    if (!r.ok) return setFejl(r.fejl || "Reglerne blev ikke gemt.");
    const rent = Object.fromEntries(Object.entries(udkast).filter(([k, v]) => k in REGLER && NIVEAUER.includes(v)));
    setOverstyringer((p) => { const n = { ...p }; if (Object.keys(rent).length) n[bruger] = rent; else delete n[bruger]; return n; });
    setBesked(Object.keys(rent).length ? "Individuelle regler er gemt." : "Brugeren følger nu butikkens standard.");
  };

  if (stores.length === 0) return null;
  const valgtBruger = brugere.find((b) => b.id === bruger);
  const udkastGemt = JSON.stringify(Object.fromEntries(Object.entries(overstyringer[bruger] || {}).sort()));
  const udkastNu = JSON.stringify(Object.fromEntries(Object.entries(udkast).filter(([, v]) => NIVEAUER.includes(v)).sort()));

  return (
    <section aria-labelledby="kap-regler-h" className="mb-8">
      <h2 id="kap-regler-h" className="text-base font-semibold text-ink mb-1">Hvilke regler styrer planlægningen?</h2>
      <p className="text-xs text-muted mb-4 max-w-2xl"><strong>Krav</strong> blokerer en booking, der bryder reglen. <strong>Rådgivende</strong> advarer, men blokerer ikke. <strong>Fra</strong> ignorerer reglen. Butikkens standard gælder alle; her kan du give enkelte brugere andre niveauer. At kunne <em>overrule</em> motoren gives separat under Admin &rarr; Brugere &rarr; rettigheder.</p>

      {stores.length > 1 && (
        <div className="mb-4">
          <label htmlFor="regler-butik" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Butik</label>
          <select id="regler-butik" value={butik} onChange={(e) => setButik(e.target.value)} className={vaelger}>{stores.map((b) => <option key={b.id} value={b.id}>{b.navn || b.name || b.id}</option>)}</select>
        </div>
      )}

      {indlaesFejl && <p className="text-xs text-danger flex items-center gap-1.5"><AlertCircle size={13} aria-hidden="true" /> Reglerne kunne ikke hentes. Tjek forbindelsen og prøv igen.</p>}
      {!indlaesFejl && !standard && <p className="text-xs text-muted flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" aria-hidden="true" /> Henter...</p>}

      {standard && (
        <>
          <div className={kort}>
            <h3 className={overskrift}>Butikkens standard</h3>
            <div className="space-y-3">
              {Object.entries(REGLER).map(([k, tekst]) => (
                <div key={k} className="flex items-center justify-between gap-3 flex-wrap">
                  <label htmlFor={`std-${k}`} className="text-sm text-ink flex-1 min-w-[200px]">{tekst}</label>
                  <select id={`std-${k}`} value={standard[k]} onChange={(e) => { setStandard((p) => ({ ...p, [k]: e.target.value })); setBesked(""); }} className={vaelger}>
                    {NIVEAUER.map((n) => <option key={n} value={n}>{NIVEAU_TEKST[n]}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <button onClick={gemStandard} disabled={busy !== "" || JSON.stringify(standard) === gemtStandard} className={knap}>{busy === "standard" && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} Gem butikkens standard</button>
          </div>

          <div className={kort}>
            <h3 className={overskrift}>Individuelt pr. bruger</h3>
            <label htmlFor="regler-bruger" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Bruger</label>
            <select id="regler-bruger" value={bruger} onChange={(e) => vaelgBruger(e.target.value)} className={`${vaelger} w-full max-w-sm`}>
              <option value="">Vælg bruger...</option>
              {brugere.map((b) => <option key={b.id} value={b.id}>{b.name || b.username || b.id}{b.role ? ` (${b.role})` : ""}{overstyringer[b.id] ? " · egne regler" : ""}</option>)}
            </select>
            {valgtBruger && (
              <>
                <div className="space-y-3 mt-4">
                  {Object.entries(REGLER).map(([k, tekst]) => (
                    <div key={k} className="flex items-center justify-between gap-3 flex-wrap">
                      <label htmlFor={`bru-${k}`} className="text-sm text-ink flex-1 min-w-[200px]">{tekst}</label>
                      <select id={`bru-${k}`} value={udkast[k] || ""} onChange={(e) => { const v = e.target.value; setUdkast((p) => { const n = { ...p }; if (v) n[k] = v; else delete n[k]; return n; }); setBesked(""); }} className={vaelger}>
                        <option value="">Følger butikken ({NIVEAU_TEKST[standard[k]]})</option>
                        {NIVEAUER.map((n) => <option key={n} value={n}>{NIVEAU_TEKST[n]}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <button onClick={gemBruger} disabled={busy !== "" || udkastGemt === udkastNu} className={knap}>{busy === "bruger" && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} Gem for {valgtBruger.name || valgtBruger.username}</button>
              </>
            )}
          </div>
          <Status fejl={fejl} besked={besked} />
        </>
      )}
    </section>
  );
}

export { KapacitetsRegler };
