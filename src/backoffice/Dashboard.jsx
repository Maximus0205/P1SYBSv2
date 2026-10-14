import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Table2, BarChart3 } from "lucide-react";
import { hentDashboard, kr, datoTekst, indevaerendeMaaned } from "../lib/billing";
import { maanedKort, maanedMedAar, maanedLang, paenAkse, noegletal, grafMax, soejleSti } from "../lib/dashboardHelpers";

// Dashboard: det vigtigste først (månedlig omsætning), så indtægter mod udgifter, så det der kræver handling.
// Alle tal kommer fra databasen (billing_dashboard) - her tegnes de kun.
// Farver: blå = indtægt, orange = udgift (første to pladser i den validerede datafarve-palet). Tekst er altid i tekstfarve, aldrig i seriens farve.
const FARVER = { ind: "#2a78d6", udg: "#eb6834", grid: "#e3e7ec", akse: "#5c6670", tekst: "#1a1a1a" };
const knapSek = "min-h-[44px] px-4 rounded-lg text-sm font-semibold text-ink border border-line bg-white hover:border-bo hover:text-bo focus:outline-none focus:ring-2 focus:ring-bo transition-colors inline-flex items-center justify-center gap-1.5";
const tal = (n) => Number(n || 0).toLocaleString("da-DK", { maximumFractionDigits: 0 });

function Soejlegraf({ maaneder, forventetOre, nu }) {
  const [aktiv, setAktiv] = useState(null);
  const scrollRef = useRef(null);
  const W = 640; const H = 290; const ml = 60; const mr = 8; const mt = 14; const mb = 32;
  const pw = W - ml - mr; const ph = H - mt - mb;
  const n = Math.max(maaneder.length, 1);
  const akse = paenAkse(grafMax(maaneder, forventetOre, nu));
  const y = (kroner) => mt + ph * (1 - kroner / akse.max);
  const slot = pw / n;
  const bw = Math.min(20, slot * 0.34);
  const gruppe = bw * 2 + 2;

  useEffect(() => { const el = scrollRef.current; if (el) el.scrollLeft = el.scrollWidth; }, [maaneder.length]);

  const raekker = maaneder.map((m, i) => {
    const forventet = m.maaned === nu && !(Number(m.indtaegt_ore) > 0);
    const ind = forventet ? Number(forventetOre) || 0 : Number(m.indtaegt_ore) || 0;
    const udg = Number(m.udgift_ore) || 0;
    const x0 = ml + i * slot + (slot - gruppe) / 2;
    return { m, i, forventet, ind, udg, x0, midt: ml + i * slot + slot / 2 };
  });
  const tom = raekker.every((r) => r.ind === 0 && r.udg === 0);
  const tip = aktiv !== null ? raekker[aktiv] : null;

  return (
    <div ref={scrollRef} className="overflow-x-auto -mx-1 px-1">
      <div className="relative min-w-[560px]">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="group" aria-label="Indtægter og udgifter pr. måned">
          {akse.ticks.map((t) => (
            <g key={t}>
              <line x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} stroke={FARVER.grid} strokeWidth="1" />
              <text x={ml - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill={FARVER.akse}>{tal(t)}</text>
            </g>
          ))}
          {raekker.map((r) => (
            <g key={r.m.maaned}>
              {r.ind > 0 && <path d={soejleSti(r.x0, y(r.ind / 100), bw, y(0))} fill={FARVER.ind} fillOpacity={r.forventet ? 0.35 : 1} />}
              {r.udg > 0 && <path d={soejleSti(r.x0 + bw + 2, y(r.udg / 100), bw, y(0))} fill={FARVER.udg} />}
              <text x={r.midt} y={H - 10} textAnchor="middle" fontSize="11" fill={FARVER.akse}>{maanedKort(r.m.maaned)}</text>
              {/* stor, usynlig trykflade pr. måned - bruges af mus, tastatur og touch */}
              <rect x={ml + r.i * slot} y={mt} width={slot} height={ph + mb} fill="transparent" tabIndex={0} role="img" style={{ outline: "none" }}
                aria-label={`${maanedLang(r.m.maaned)}: ${r.forventet ? "forventet indtægt" : "indtægt"} ${kr(r.ind)}, udgift ${kr(r.udg)}`}
                onMouseEnter={() => setAktiv(r.i)} onMouseLeave={() => setAktiv(null)} onFocus={() => setAktiv(r.i)} onBlur={() => setAktiv(null)}
                onClick={() => setAktiv(aktiv === r.i ? null : r.i)} />
              {aktiv === r.i && <rect x={ml + r.i * slot + 2} y={mt} width={slot - 4} height={ph} fill="#1f4e79" fillOpacity="0.06" rx="4" pointerEvents="none" />}
            </g>
          ))}
          <line x1={ml} x2={W - mr} y1={y(0)} y2={y(0)} stroke={FARVER.akse} strokeOpacity="0.5" strokeWidth="1" />
        </svg>
        {tom && <p className="absolute inset-x-0 top-1/3 text-center text-sm text-muted px-8">Ingen tal endnu. Indtægterne dukker op, når den første faktura er udstedt, og udgifterne, når du har tilføjet dem under Udgifter.</p>}
        {tip && (
          <div role="status" className="pointer-events-none absolute z-10 rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-md" style={{ left: `${Math.min(Math.max((tip.midt / W) * 100, 16), 84)}%`, top: 0, transform: "translateX(-50%)" }}>
            <p className="font-semibold text-ink mb-1">{maanedLang(tip.m.maaned)}</p>
            <p className="flex items-center gap-1.5 text-ink"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: FARVER.ind, opacity: tip.forventet ? 0.35 : 1 }} aria-hidden="true" /> {tip.forventet ? "Forventet indtægt" : "Indtægt"}: <strong>{kr(tip.ind)}</strong></p>
            <p className="flex items-center gap-1.5 text-ink"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: FARVER.udg }} aria-hidden="true" /> Udgift: <strong>{kr(tip.udg)}</strong></p>
            {(Number(tip.m.sms_udgift_ore) > 0 || Number(tip.m.manuel_udgift_ore) > 0) && <p className="text-muted mt-1">heraf SMS {kr(tip.m.sms_udgift_ore)}, øvrige {kr(tip.m.manuel_udgift_ore)}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function Tabel({ maaneder, forventetOre, nu }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[420px]">
        <caption className="sr-only">Indtægter og udgifter pr. måned</caption>
        <thead><tr className="border-b border-line text-left text-xs text-muted"><th scope="col" className="py-2 pr-2 font-semibold">Måned</th><th scope="col" className="py-2 px-2 text-right font-semibold">Indtægt</th><th scope="col" className="py-2 px-2 text-right font-semibold">Udgift</th><th scope="col" className="py-2 pl-2 text-right font-semibold">Resultat</th></tr></thead>
        <tbody className="[font-variant-numeric:tabular-nums]">
          {[...maaneder].reverse().map((m) => {
            const forv = m.maaned === nu && !(Number(m.indtaegt_ore) > 0);
            const ind = forv ? Number(forventetOre) || 0 : Number(m.indtaegt_ore) || 0;
            const res = ind - (Number(m.udgift_ore) || 0);
            return (
              <tr key={m.maaned} className="border-b border-divider">
                <th scope="row" className="py-2 pr-2 text-left font-normal text-ink">{maanedMedAar(m.maaned)}{forv && <span className="text-muted"> (forventet)</span>}</th>
                <td className="py-2 px-2 text-right">{kr(ind)}</td>
                <td className="py-2 px-2 text-right">{kr(m.udgift_ore)}</td>
                <td className={`py-2 pl-2 text-right ${res < 0 ? "text-danger" : "text-ink"}`}>{kr(res)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Dashboard({ naviger }) {
  const [d, setD] = useState(null);
  const [fejl, setFejl] = useState("");
  const [tabel, setTabel] = useState(false);
  const nu = indevaerendeMaaned();

  const hent = useCallback(async () => {
    setFejl(""); setD(null);
    const r = await hentDashboard(12);
    if (!r.ok) { setFejl(r.fejl); return; }
    setD(r.data);
  }, []);
  useEffect(() => { hent(); }, [hent]);

  if (fejl) return <div><p role="alert" className="text-sm text-danger flex items-start gap-1.5 mb-3"><AlertCircle size={15} className="shrink-0 mt-0.5" aria-hidden="true" /> {fejl}</p><button onClick={hent} className={knapSek}><RefreshCw size={15} aria-hidden="true" /> Prøv igen</button></div>;
  if (!d) return <p className="text-sm text-muted flex items-center gap-2"><Loader2 size={15} className="animate-spin" aria-hidden="true" /> Henter tal...</p>;

  const nt = noegletal(d, nu);
  const maaneder = d.maaneder || [];
  const resPositiv = nt.resultat >= 0;
  const handlinger = (d.forfaldne?.length || 0) + (d.mangler_faktura?.length || 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section aria-labelledby="hero-l" className="rounded-xl border border-line bg-white p-5 sm:p-7 shadow-sm">
          <p id="hero-l" className="text-sm text-muted">Fast månedlig omsætning</p>
          <p className="mt-2 text-[44px] sm:text-[60px] leading-none font-semibold tracking-tight text-ink break-words">{kr(d.mrr_ore)}</p>
          <p className="mt-3 text-sm text-muted">fra {d.aktive} {d.aktive === 1 ? "aktiv kunde" : "aktive kunder"}, før moms og før forbrug.</p>
          <p className="mt-1 text-sm text-ink">Forventet fakturering for {maanedLang(nu)} inkl. forbrug indtil nu: <strong>{kr(d.forventet_ore)}</strong></p>
        </section>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
          <section className="rounded-xl border border-line bg-white p-5 shadow-sm" aria-labelledby="udest-l">
            <p id="udest-l" className="text-sm text-muted">Udestående hos kunderne</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{kr(d.udestaaende_ore)}</p>
            {nt.forfaldne > 0
              ? <p className="mt-1 text-xs text-danger flex items-center gap-1.5"><AlertTriangle size={13} aria-hidden="true" /> {nt.forfaldne} {nt.forfaldne === 1 ? "faktura er forfalden" : "fakturaer er forfaldne"}</p>
              : <p className="mt-1 text-xs text-muted">Ingen forfaldne fakturaer.</p>}
          </section>
          <section className="rounded-xl border border-line bg-white p-5 shadow-sm" aria-labelledby="res-l">
            <p id="res-l" className="text-sm text-muted">Resultat, {nt.antal} afsluttede {nt.antal === 1 ? "måned" : "måneder"}</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{kr(nt.resultat)}</p>
            <p className={`mt-1 text-xs flex items-center gap-1.5 ${resPositiv ? "text-success" : "text-danger"}`}>{resPositiv ? <TrendingUp size={13} aria-hidden="true" /> : <TrendingDown size={13} aria-hidden="true" />} {nt.antal === 0 ? "Ingen afsluttede måneder endnu" : resPositiv ? "Overskud" : "Underskud"}</p>
          </section>
        </div>
      </div>

      <section aria-labelledby="graf-h" className="rounded-xl border border-line bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
          <div>
            <h2 id="graf-h" className="text-base font-semibold text-ink">Indtægter og udgifter</h2>
            <p className="text-xs text-muted mt-0.5">Seneste 12 måneder, kr. før moms. Udgifter er jeres SMS-omkostning (beregnet) plus det, I selv har tilføjet.</p>
          </div>
          <button onClick={() => setTabel((v) => !v)} className={knapSek} aria-pressed={tabel}>{tabel ? <BarChart3 size={15} aria-hidden="true" /> : <Table2 size={15} aria-hidden="true" />} {tabel ? "Vis graf" : "Vis som tabel"}</button>
        </div>
        <div className="flex items-center gap-4 flex-wrap text-xs text-ink my-3" aria-label="Forklaring">
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: FARVER.ind }} aria-hidden="true" /> Indtægt</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: FARVER.udg }} aria-hidden="true" /> Udgift</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: FARVER.ind, opacity: 0.35 }} aria-hidden="true" /> Forventet (igangværende måned)</span>
        </div>
        {nt.sidste && <p className="text-sm text-ink mb-2">{maanedMedAar(nt.sidste.maaned)}: indtægt <strong>{kr(nt.sidste.indtaegt_ore)}</strong>, udgift <strong>{kr(nt.sidste.udgift_ore)}</strong>.</p>}
        {tabel ? <Tabel maaneder={maaneder} forventetOre={d.forventet_ore} nu={nu} /> : <Soejlegraf maaneder={maaneder} forventetOre={d.forventet_ore} nu={nu} />}
      </section>

      <section aria-labelledby="hand-h" className="rounded-xl border border-line bg-white p-5 sm:p-6 shadow-sm">
        <h2 id="hand-h" className="text-base font-semibold text-ink mb-3">Kræver handling</h2>
        {handlinger === 0 && <p className="text-sm text-muted flex items-center gap-1.5"><CheckCircle2 size={15} className="text-success" aria-hidden="true" /> Alt er ajour: ingen forfaldne fakturaer, og alle aktive kunder er faktureret for {maanedLang(d.forrige_maaned)}.</p>}
        {d.forfaldne?.length > 0 && (
          <div className="mb-4">
            <p className="text-sm font-semibold text-ink mb-1">Forfaldne fakturaer</p>
            <ul className="divide-y divide-divider">
              {d.forfaldne.map((f) => (
                <li key={f.id} className="py-2 flex items-center justify-between gap-3 flex-wrap text-sm">
                  <span className="min-w-0 break-words">{f.fakturanr} · {f.kunde} <span className="text-danger">· forfaldt {datoTekst(f.forfaldsdato)}</span></span>
                  <span className="font-semibold [font-variant-numeric:tabular-nums]">{kr(f.total_ore)}</span>
                </li>
              ))}
            </ul>
            <button onClick={() => naviger("fakturaer")} className={knapSek + " mt-2"}>Gå til fakturaer</button>
          </div>
        )}
        {d.mangler_faktura?.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-ink mb-1">Ikke faktureret for {maanedLang(d.forrige_maaned)}</p>
            <ul className="text-sm text-ink list-disc pl-5">{d.mangler_faktura.map((k) => <li key={k.store_id}>{k.navn}</li>)}</ul>
            <button onClick={() => naviger("fakturaer")} className={knapSek + " mt-2"}>Opret kladde under fakturaer</button>
          </div>
        )}
      </section>
    </div>
  );
}
