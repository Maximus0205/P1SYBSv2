import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { KONTO_STATUS_KORT, kr, maanedPeriode, indevaerendeMaaned, graenseStatus, hentOverblik, hentAlleGraenser, hentProdukter } from "../lib/billing";
import { felt, kort, knapSek, Chip, Meddelelse, Indlaeser, Felt, Maaler } from "./ui";

// Forbrug: hvad hvert abonnement har brugt i måneden, hvor meget det har til rådighed, hvad det giver af indtægt og hvad det koster os.
export function ForbrugSektion({ onAabnKunde }) {
  const [maaned, setMaaned] = useState(indevaerendeMaaned());
  const [produktFilter, setProduktFilter] = useState("");
  const [raekker, setRaekker] = useState(null);
  const [graenser, setGraenser] = useState([]);
  const [produkter, setProdukter] = useState([]);
  const [fejl, setFejl] = useState("");

  const hent = useCallback(async () => {
    const p = maanedPeriode(maaned);
    if (!p) return;
    setRaekker(null); setFejl("");
    const [o, g, pr] = await Promise.all([hentOverblik(p.fra, p.til), hentAlleGraenser(), hentProdukter()]);
    if (!o.ok) { setFejl(o.fejl); setRaekker([]); return; }
    setRaekker(o.data || []); setGraenser(g.ok ? g.data || [] : []); setProdukter(pr.ok ? pr.data || [] : []);
  }, [maaned]);
  useEffect(() => { hent(); }, [hent]);

  const iDag = maaned === indevaerendeMaaned();
  const synlige = useMemo(() => (raekker || []).filter((r) => !produktFilter || r.produkt_id === produktFilter), [raekker, produktFilter]);
  const sum = useMemo(() => synlige.reduce((s, r) => s + (Number(r.netto_ore) || 0), 0), [synlige]);
  const kost = useMemo(() => synlige.reduce((s, r) => s + (Number(r.kost_ore) || 0), 0), [synlige]);
  const maalepunkt = (produktId, kode) => produkter.find((p) => p.id === produktId)?.maalepunkter.find((m) => m.kode === kode);

  return (
    <div className="max-w-4xl">
      <div className="flex items-end gap-3 flex-wrap mb-4">
        <Felt id="bill-maaned" titel="Måned"><input id="bill-maaned" type="month" value={maaned} onChange={(e) => e.target.value && setMaaned(e.target.value)} className={`${felt} w-auto`} /></Felt>
        <Felt id="bill-prod" titel="Produkt"><select id="bill-prod" value={produktFilter} onChange={(e) => setProduktFilter(e.target.value)} className={`${felt} w-auto`}><option value="">Alle</option>{produkter.map((p) => <option key={p.id} value={p.id}>{p.navn}</option>)}</select></Felt>
        <button onClick={hent} className={knapSek} aria-label="Opdater overblik"><RefreshCw size={15} aria-hidden="true" /> Opdater</button>
      </div>
      <Meddelelse fejl={fejl} />
      {raekker === null && <Indlaeser />}
      {raekker && synlige.length === 0 && !fejl && <p className="text-sm text-muted">Ingen abonnementer at vise.</p>}
      {synlige.length > 0 && (
        <>
          <p className="text-xs text-muted mb-3">{iDag ? "Måneden er i gang - beløbene er forventede og ændrer sig, indtil måneden er slut." : "Afsluttet måned."} Samlet {iDag ? "forventet " : ""}beløb før moms: <strong className="text-ink">{kr(sum)}</strong> · vores udgift: <strong className="text-ink">{kr(kost)}</strong> · dækningsbidrag: <strong className="text-ink">{kr(sum - kost)}</strong></p>
          <div className="space-y-3">
            {synlige.map((r) => {
              const forbrug = r.forbrug || {}; const maal = r.maalinger || {};
              const gs = iDag ? graenseStatus(graenser.filter((g) => g.subscription_id === r.abonnement_id), forbrug) : {};
              return (
                <div key={r.abonnement_id} className={kort + " !mb-0"}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink break-words">{r.tenant || r.kunde}<span className="text-muted font-normal"> · {r.produkt}</span></p>
                      <p className="text-xs text-muted mt-0.5 flex items-center gap-2 flex-wrap">
                        <button onClick={() => onAabnKunde?.(r.kunde_id)} className="underline hover:no-underline text-bo">{r.kunde}</button>
                        <Chip id={r.status} tekst={KONTO_STATUS_KORT[r.status] || r.status} />
                        {r.plan ? <span>{r.plan}</span> : <span className="text-danger">Ingen prisplan</span>}
                        {r.spaerret && <span className="text-danger font-semibold">Spærret</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-ink">{r.status === "aktiv" && !r.fejl ? kr(r.netto_ore) : "–"}</p>
                      <p className="text-[11px] text-muted">før moms{r.status === "aktiv" && !r.fejl ? ` · udgift ${kr(r.kost_ore)}` : ""}</p>
                    </div>
                  </div>
                  {r.fejl && <p className="text-xs text-danger mt-2">{r.fejl}</p>}
                  {(Object.keys(forbrug).length > 0 || Object.keys(maal).length > 0) && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                      {Object.entries(forbrug).map(([kode, antal]) => (
                        <dl key={kode} className="rounded-lg bg-panel px-3 py-2">
                          <dt className="text-[11px] text-muted">{maalepunkt(r.produkt_id, kode)?.navn || kode}</dt>
                          <dd className="text-sm text-ink font-semibold">{Number(antal || 0).toLocaleString("da-DK")}
                            {gs[kode] === "spaerret" && <span className="ml-1.5 text-[11px] text-danger font-semibold">Spærret</span>}
                            {gs[kode] === "advarsel" && <span className="ml-1.5 text-[11px] text-bo font-semibold">Advarsel</span>}
                          </dd>
                        </dl>
                      ))}
                      {Object.entries(maal).map(([kode, v]) => {
                        const m = maalepunkt(r.produkt_id, kode);
                        const til = v.til_raadighed;
                        return <Maaler key={kode} titel={m?.navn || kode} brugt={v.maalt} til={til} enhed={m?.enhed === "stk." ? "" : m?.enhed || ""}
                          detalje={til !== null && til !== undefined && (v.koebt !== undefined) ? `${Number(v.inkluderet) || 0} inkluderet + ${Number(v.koebt) || 0} × ${Number(v.stoerrelse) || 1} købt` : undefined} />;
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
