import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { STORE_FEATURES, featureStandard } from "../data/storeFeatures";
import { estimateDataStatus } from "../data/estimates";
import { getStoreFeatures, setStoreFeature } from "../lib/storeFeatures";
import { fetchAllOrders } from "../lib/orderStore";
import { useReloadFeatures } from "../hooks/useStoreFeatures";

// Systemadmin: slå funktioner til/fra pr. butik. Det meste er TIL som standard; tid-funktionerne
// er FRA. "Tidsforslag" kan kun slås TIL, når butikken har målt nok (estimateDataStatus) - og
// ikke før. Den kontrol er en rådgivende spærre for administratoren, ikke en sikkerhedsgrænse. Ændringen gemmes
// med det samme, og databasen håndhæver den (se migrationen store_features) - skjulte faner
// kan altså ikke bruges via API'et alligevel.
function StoreFeaturesAdmin({ stores }) {
  const [storeId, setStoreId] = useState("");
  const [features, setFeatures] = useState({});
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState(null);
  const [fejl, setFejl] = useState("");
  const [dataStatus, setDataStatus] = useState(null); // estimateDataStatus for den valgte butik
  const reloadOwn = useReloadFeatures();
  const valgtRef = useRef("");
  valgtRef.current = storeId;

  const load = useCallback(async (id) => {
    if (!id) { setFeatures({}); setDataStatus(null); return; }
    setLoading(true); setFejl(""); setDataStatus(null);
    const [res, sager] = await Promise.all([getStoreFeatures(id), fetchAllOrders(id)]);
    // Ignorér svaret, hvis der er valgt en anden butik imens.
    if (valgtRef.current === id) {
      if (res.ok) setFeatures(res.features); else setFejl(res.fejl);
      // Kan sagerne ikke hentes, kendes datagrundlaget ikke - så kan forslaget ikke slås til.
      // (Hentes højst 1000 sager ad gangen; det er rigeligt til at vise, at der er nok.)
      setDataStatus(sager.ok ? estimateDataStatus(sager.rows.map((r) => ({ ...r.data, id: r.id }))) : { fejl: true });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(storeId); }, [storeId, load]);

  const toggle = async (noegle, taendt) => {
    setBusyKey(noegle); setFejl("");
    const res = await setStoreFeature(storeId, noegle, taendt);
    if (!res.ok) setFejl(res.fejl);
    await load(storeId); // vis altid det, databasen faktisk har
    reloadOwn();
    setBusyKey(null);
  };

  const grupper = [...new Set(STORE_FEATURES.map((f) => f.gruppe))];

  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
      <h2 className="font-display text-xl uppercase tracking-wide text-ink mb-1">Funktioner pr. butik</h2>
      <p className="text-sm text-muted mb-4">Slå funktioner til eller fra for en enkelt butik. Det meste er slået til som standard; tid-funktionerne er slået fra. Allerede gemte data bliver stående, også hvis en funktion slås fra.</p>

      <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1" htmlFor="features-store">Butik</label>
      <select id="features-store" value={storeId} onChange={(e) => setStoreId(e.target.value)} className="w-full sm:w-80 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand mb-4">
        <option value="">Vælg butik…</option>
        {stores.map((b) => <option key={b.id} value={b.id}>{b.navn || b.name}</option>)}
      </select>

      {fejl && <p role="alert" className="text-sm text-danger flex items-center gap-1.5 mb-3"><AlertCircle size={14} className="shrink-0" aria-hidden="true" /> {fejl}</p>}
      {loading && <p className="text-sm text-muted flex items-center gap-1.5"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Henter…</p>}

      {storeId && !loading && grupper.map((g) => (
        <div key={g} className="mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{g}</h3>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {STORE_FEATURES.filter((f) => f.gruppe === g).map((f) => {
              const taendt = typeof features[f.noegle] === "boolean" ? features[f.noegle] : featureStandard(f.noegle);
              // Tidsforslag: må kun slås TIL med nok data. Slå fra er altid tilladt.
              const erForslag = f.noegle === "tid_forslag";
              const mangelData = erForslag && !taendt && !dataStatus?.tilstraekkeligt;
              return (
                <li key={f.noegle}>
                  <label className="flex items-center justify-between gap-3 px-3 py-3 min-h-[52px] cursor-pointer">
                    <span>
                      <span className="block text-sm font-semibold text-ink">{f.navn}</span>
                      <span className="block text-xs text-muted">{f.beskrivelse}</span>
                      {erForslag && dataStatus && (
                        <span className={`block text-xs mt-1 ${dataStatus.tilstraekkeligt ? "text-success" : "text-danger"}`} role="status">
                          {dataStatus.fejl
                            ? "Datagrundlaget kunne ikke hentes - kan ikke slås til nu."
                            : `Målt: ${dataStatus.antalMaalt} af ${dataStatus.kraevetMaalinger} rene sager (kræver også mindst ${dataStatus.kraevetPrKombination} af samme vare og ydelse: ${dataStatus.antalKombinationer} kombination${dataStatus.antalKombinationer === 1 ? "" : "er"} klar).${dataStatus.tilstraekkeligt ? " Klar til at blive slået til." : " Kan ikke slås til endnu."}`}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted w-8 text-right">{taendt ? "Til" : "Fra"}</span>
                      <input type="checkbox" role="switch" checked={taendt} disabled={busyKey !== null || mangelData} onChange={(e) => toggle(f.noegle, e.target.checked)} aria-label={`${f.navn} for denne butik`} className="w-6 h-6 accent-brand disabled:opacity-50" />
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export { StoreFeaturesAdmin };
