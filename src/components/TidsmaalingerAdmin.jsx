import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { fetchAllOrders } from "../lib/orderStore";
import { maalingsRaekker, maalingsGrupper, maalingsOverblik, estimateDataStatus, buildEstimateIndex, estimateForLineItem, proeveForslag, signatures, stordriftsOversigt, buildClusterIndex, estimateForCluster } from "../data/estimates";
import { lineItemLabel, orderExpectedMinutes, formatDuration } from "../data/domain";

// Systemadmin: kontrollér de målte tider, før tidsforslaget slås til. Viser pr. afsluttet sag, hvad der er målt, hvor tiden stammer fra,
// og om (og hvorfor ikke) sagen tæller med - samt pr. vare/ydelse det median-tal, forslaget ville give. Tiderne ses kun her.
// Bemærk: forslaget ser KUN på vare, ydelse og tillæg - ikke antal enheder, etage, adgangsforhold, afstand eller montør.
function TidsmaalingerAdmin({ stores }) {
  const [storeId, setStoreId] = useState("");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fejl, setFejl] = useState("");
  const [kunIndgaar, setKunIndgaar] = useState(false);
  const [proeveNoegle, setProeveNoegle] = useState("");
  const valgtRef = useRef("");
  valgtRef.current = storeId;

  useEffect(() => {
    if (!storeId) { setOrders([]); return; }
    let aktiv = true;
    setLoading(true); setFejl("");
    fetchAllOrders(storeId).then((res) => {
      if (!aktiv || valgtRef.current !== storeId) return;
      if (res.ok) setOrders(res.rows.map((r) => ({ ...r.data, id: r.id }))); else setFejl("Sagerne kunne ikke hentes.");
      setLoading(false);
    });
    return () => { aktiv = false; };
  }, [storeId]);

  const rows = useMemo(() => maalingsRaekker(orders).sort((a, b) => String(b.order.dato || "").localeCompare(String(a.order.dato || ""))), [orders]);
  const grupper = useMemo(() => maalingsGrupper(rows), [rows]);
  const overblik = useMemo(() => maalingsOverblik(rows), [rows]);
  const status = useMemo(() => estimateDataStatus(orders), [orders]);
  const medianFor = useMemo(() => new Map(grupper.map((g) => [g.noegle, g])), [grupper]);
  // Test af forslagene: vælg en vare/ydelse/tillæg-kombination fra butikkens egne sager og se, hvad forslaget ville være - uden at røre
  // nogen sag. Backtesten sammenligner forslag og planlagt tid med den faktisk målte, sag for sag.
  const kombinationer = useMemo(() => {
    const m = new Map();
    for (const o of orders) for (const v of o.varelinjer || []) {
      const k = signatures(v)[0];
      if (!m.has(k)) m.set(k, { v, antal: 0 });
      m.get(k).antal++;
    }
    return [...m].map(([k, x]) => ({ k, v: x.v, antal: x.antal, tekst: [lineItemLabel(x.v), (x.v.tillaeg || []).map((t) => t.navn).join(" + ")].filter(Boolean).join(" + ") })).sort((a, b) => b.antal - a.antal);
  }, [orders]);
  const indeks = useMemo(() => buildEstimateIndex(orders), [orders]);
  const valgt = kombinationer.find((c) => c.k === proeveNoegle);
  const proeveResultat = valgt ? estimateForLineItem(indeks, valgt.v) : null;
  const stordrift = useMemo(() => stordriftsOversigt(orders), [orders]);
  const klyngeIndeks = useMemo(() => buildClusterIndex(orders, indeks), [orders, indeks]);
  const flereSager = useMemo(() => orders.filter((o) => (o.varelinjer || []).length > 1 && o.status === "afsluttet"), [orders]);
  const [flereId, setFlereId] = useState("");
  const flereValgt = flereSager.find((o) => o.id === flereId);
  const flereEst = flereValgt ? estimateForCluster(indeks, klyngeIndeks, flereValgt.varelinjer) : null;
  const backtest = useMemo(() => proeveForslag(orders, orderExpectedMinutes), [orders]);
  const synlige = kunIndgaar ? rows.filter((r) => r.indgaar) : rows;

  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
      <h2 className="font-display text-xl uppercase tracking-wide text-ink mb-1">Tidsmålinger</h2>
      <p className="text-sm text-muted mb-4">Kontrollér de målte tider pr. sag, før tidsforslaget slås til. Kun systemadmin kan se tallene. Forslaget ser kun på vare, ydelse og tillæg - ikke på antal enheder, etage, adgangsforhold, afstand eller montør.</p>

      <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1" htmlFor="tid-store">Butik</label>
      <select id="tid-store" value={storeId} onChange={(e) => setStoreId(e.target.value)} className="w-full sm:w-80 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand mb-4">
        <option value="">Vælg butik…</option>
        {stores.map((b) => <option key={b.id} value={b.id}>{b.navn || b.name}</option>)}
      </select>

      {fejl && <p role="alert" className="text-sm text-danger flex items-center gap-1.5 mb-3"><AlertCircle size={14} className="shrink-0" aria-hidden="true" /> {fejl}</p>}
      {loading && <p className="text-sm text-muted flex items-center gap-1.5"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Henter…</p>}

      {storeId && !loading && !fejl && (
        <>
          <p className="text-sm text-ink mb-4" role="status">
            {status.antalMaalt} rene enkeltmålinger af {status.kraevetMaalinger} krævet · {status.antalKombinationer} vare/ydelse-kombination{status.antalKombinationer === 1 ? "" : "er"} med mindst {status.kraevetPrKombination} · {status.tilstraekkeligt ? "klar til at slå forslaget til" : "ikke nok data endnu"}
          </p>

          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Overblik over indsamlingen</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div className="rounded-lg border border-line p-3"><p className="text-xs text-muted">Afsluttede sager</p><p className="font-mono text-2xl text-ink">{overblik.afsluttet}</p></div>
            <div className="rounded-lg border border-line p-3"><p className="text-xs text-muted">Tæller med</p><p className="font-mono text-2xl text-success">{overblik.indgaar}</p></div>
            <div className="rounded-lg border border-line p-3"><p className="text-xs text-muted">Tæller ikke med</p><p className="font-mono text-2xl text-ink">{overblik.afsluttet - overblik.indgaar}</p></div>
          </div>
          <div className="mb-4" role="img" aria-label={`${status.antalMaalt} af ${status.kraevetMaalinger} målinger`}>
            <div className="h-2 rounded-full bg-panel overflow-hidden"><div className="h-full bg-brand" style={{ width: `${Math.min(100, Math.round((status.antalMaalt / status.kraevetMaalinger) * 100))}%` }} /></div>
            <p className="text-xs text-muted mt-1">{status.antalMaalt} af {status.kraevetMaalinger} enkeltmålinger (sager med én varelinje) til at slå forslaget til</p>
          </div>
          {overblik.aarsager.length > 0 && (
            <p className="text-sm text-muted mb-4">Tæller ikke med: {overblik.aarsager.map((a) => `${a.aarsag} (${a.antal})`).join(" · ")}</p>
          )}
          {overblik.uger.length > 0 && (
            <div className="overflow-x-auto mb-5">
              <table className="w-full text-sm min-w-[320px]">
                <thead><tr className="text-left text-xs uppercase tracking-wide text-muted border-b border-line"><th className="py-1.5 pr-3">Uge fra</th><th className="py-1.5 pr-3 text-right">Afsluttet</th><th className="py-1.5 text-right">Tæller med</th></tr></thead>
                <tbody>{overblik.uger.map((u) => (<tr key={u.uge} className="border-b border-line/60"><td className="py-1.5 pr-3 font-mono text-xs">{u.uge}</td><td className="py-1.5 pr-3 text-right">{u.ialt}</td><td className="py-1.5 text-right">{u.indgaar}</td></tr>))}</tbody>
              </table>
            </div>
          )}

          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Test forslagene</h3>
          <div className="rounded-lg border border-line p-3 mb-5">
            <label className="block text-xs text-muted mb-1" htmlFor="tid-proeve">Vælg en vare med ydelse og tillæg fra butikkens sager</label>
            <select id="tid-proeve" value={proeveNoegle} onChange={(e) => setProeveNoegle(e.target.value)} className="w-full sm:w-96 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand mb-2">
              <option value="">Vælg…</option>
              {kombinationer.map((c) => <option key={c.k} value={c.k}>{c.tekst} ({c.antal} sager)</option>)}
            </select>
            {valgt && (
              <p className="text-sm text-ink" role="status">
                {proeveResultat
                  ? `Forslaget ville være ${proeveResultat.minutter} min, ${proeveResultat.grundlag} (${proeveResultat.antal} sager). Planlagt standard: ${formatDuration(orderExpectedMinutes({ varelinjer: [valgt.v] }))}.`
                  : "Intet forslag: der er under 5 rene målinger af denne kombination (og af vare + ydelse uden tillæg). Sælgeren taster som hidtil."}
              </p>
            )}
            <p className="text-sm text-muted mt-3">
              Prøvet på historien (sager med én varelinje, hver mod alle de andre): {backtest.antalMedForslag} af {backtest.antal} sager ville have fået et forslag.
              {backtest.forslagFejlSammeSager != null
                ? ` På de sager var forslaget i snit ${backtest.forslagFejlSammeSager} min fra den målte tid, mod ${backtest.planFejlSammeSager} min for den planlagte tid.`
                : " Der er endnu ikke nok data til en sammenligning."}
            </p>
          </div>

          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Flere varelinjer på én sag</h3>
          <div className="rounded-lg border border-line p-3 mb-5">
            <p className="text-sm text-muted mb-2">Tiden måles pr. sag. Grundtiderne læres af sager med én varelinje; sager med flere varelinjer bruges til at lære stordriften (faktisk tid ÷ summen af grundtiderne). Forslaget til en sag med flere linjer = summen af grundtiderne × den målte faktor for den størrelse, og vises først, når faktoren er målt mindst {status.kraevetPrKombination} gange.</p>
            {stordrift.length === 0 ? <p className="text-sm text-muted mb-2">Ingen målt stordrift endnu - sager med flere linjer får derfor intet forslag.</p> : (
              <ul className="text-sm text-ink mb-2">{stordrift.map((s) => <li key={s.enheder}>{s.enheder >= 6 ? "6+" : s.enheder} enheder: faktor {s.faktor.toLocaleString("da-DK")} ({s.antal} målinger, {s.faktor < 1 ? `${Math.round((1 - s.faktor) * 100)}% hurtigere` : `${Math.round((s.faktor - 1) * 100)}% langsommere`} end enkeltvis)</li>)}</ul>
            )}
            {backtest.antalFlere > 0 && (
              <p className="text-sm text-muted mb-2">Prøvet på historien: {backtest.antalFlereMedForslag} af {backtest.antalFlere} sager med flere linjer ville have fået et forslag.{backtest.flereForslagFejl != null ? ` På dem var forslaget i snit ${backtest.flereForslagFejl} min fra målt tid, mod ${backtest.flerePlanFejl} min for den planlagte tid.` : ""}</p>
            )}
            <label className="block text-xs text-muted mb-1" htmlFor="tid-flere">Se forslaget for en afsluttet sag med flere varelinjer</label>
            <select id="tid-flere" value={flereId} onChange={(e) => setFlereId(e.target.value)} className="w-full sm:w-96 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand mb-2">
              <option value="">Vælg…</option>
              {flereSager.map((o) => <option key={o.id} value={o.id}>#{o.nr} · {(o.varelinjer || []).map((v) => lineItemLabel(v)).join(" + ")}</option>)}
            </select>
            {flereValgt && (
              <p className="text-sm text-ink" role="status">
                {!flereEst ? "Intet forslag: grundtiden mangler for mindst én af varerne."
                  : flereEst.maaltKlynge ? `Forslag: ${flereEst.minutter} min (summen ${Math.round(flereEst.minutter / flereEst.faktor)} min × faktor ${flereEst.faktor}).`
                  : `Intet forslag: summen af grundtiderne er ${flereEst.minutter} min, men stordriften er ikke målt nok for ${flereEst.enheder} enheder.`}
                {` Planlagt: ${formatDuration(orderExpectedMinutes(flereValgt))}.`}
              </p>
            )}
          </div>

          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Pr. vare og ydelse</h3>
          {grupper.length === 0 ? <p className="text-sm text-muted mb-5">Ingen rene målinger endnu.</p> : (
            <div className="overflow-x-auto mb-5">
              <table className="w-full text-sm min-w-[520px]">
                <thead><tr className="text-left text-xs uppercase tracking-wide text-muted border-b border-line"><th className="py-1.5 pr-3">Vare / ydelse</th><th className="py-1.5 pr-3 text-right">Antal</th><th className="py-1.5 pr-3 text-right">Median</th><th className="py-1.5 pr-3 text-right">Laveste</th><th className="py-1.5 pr-3 text-right">Højeste</th><th className="py-1.5">Forslag</th></tr></thead>
                <tbody>
                  {grupper.map((g) => (
                    <tr key={g.noegle} className="border-b border-line/60">
                      <td className="py-1.5 pr-3 font-mono text-xs">{g.noegle.replace(/^2\|/, "").replace("|", " / ")}</td>
                      <td className="py-1.5 pr-3 text-right">{g.antal}</td>
                      <td className="py-1.5 pr-3 text-right font-mono">{g.median} min</td>
                      <td className="py-1.5 pr-3 text-right font-mono">{g.min}</td>
                      <td className="py-1.5 pr-3 text-right font-mono">{g.max}</td>
                      <td className={`py-1.5 ${g.klar ? "text-success" : "text-muted"}`}>{g.klar ? "Ville blive givet" : `Mangler ${5 - g.antal}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Afsluttede sager ({synlige.length})</h3>
            <label className="text-xs text-muted flex items-center gap-1.5 cursor-pointer min-h-[32px]"><input type="checkbox" checked={kunIndgaar} onChange={(e) => setKunIndgaar(e.target.checked)} className="w-4 h-4 accent-brand" /> Kun sager, der tæller med</label>
          </div>
          {synlige.length === 0 ? <p className="text-sm text-muted">Ingen afsluttede sager.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead><tr className="text-left text-xs uppercase tracking-wide text-muted border-b border-line"><th className="py-1.5 pr-3">Sag</th><th className="py-1.5 pr-3">Dato</th><th className="py-1.5 pr-3">Vare / ydelse</th><th className="py-1.5 pr-3 text-right">Planlagt</th><th className="py-1.5 pr-3 text-right">Målt</th><th className="py-1.5 pr-3">Kilde</th><th className="py-1.5 pr-3 text-right">Forslag</th><th className="py-1.5">Tæller med?</th></tr></thead>
                <tbody>
                  {synlige.map((r) => {
                    const o = r.order;
                    const g = r.noegle ? medianFor.get(r.noegle) : null;
                    return (
                      <tr key={o.id} className={`border-b border-line/60 ${r.indgaar ? "" : "text-muted"}`}>
                        <td className="py-1.5 pr-3 font-mono text-xs">#{o.nr}</td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">{o.dato || "–"}</td>
                        <td className="py-1.5 pr-3">{(o.varelinjer || []).map((v) => lineItemLabel(v)).join(", ") || "–"}</td>
                        <td className="py-1.5 pr-3 text-right font-mono">{formatDuration(orderExpectedMinutes(o))}</td>
                        <td className="py-1.5 pr-3 text-right font-mono">{r.minutter != null ? `${r.minutter} min` : "–"}</td>
                        <td className="py-1.5 pr-3">{r.kilde}</td>
                        <td className="py-1.5 pr-3 text-right font-mono">{g && g.klar ? `${g.median} min` : "–"}</td>
                        <td className={`py-1.5 ${r.indgaar ? "text-success" : ""}`}>{r.indgaar ? (r.flere ? `Ja (stordrift ×${r.faktor})` : "Ja") : `Nej: ${r.aarsag}`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export { TidsmaalingerAdmin };
