import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Check, Printer, ChevronLeft, FilePlus, Layers } from "lucide-react";
import {
  FAKTURA_STATUS, kr, krEnhed, datoTekst, maanedPeriode, forrigeMaaned,
  hentKunder, hentFakturaer, hentFaktura, opretKladde, opretAlleKladder, udstedFaktura, saetFakturaStatus, hentKreditnotaer, hentKreditnota, opretKreditnota,
} from "../lib/billing";
import { felt, kort, overskrift, knapPrim, knapSek, knapFare, Chip, Meddelelse, Indlaeser, Felt } from "./ui";

// Fakturaer: kladder pr. kunde (eller for alle kunder på én gang), udstedelse, betaling og kreditnotaer.
export function FakturaerSektion({ aaben, onAabnet }) {
  const [kunder, setKunder] = useState([]);
  useEffect(() => { hentKunder().then((r) => { if (r.ok) setKunder(r.data || []); }); }, []);
  const [liste, setListe] = useState(null);
  const [fejl, setFejl] = useState("");
  const [besked, setBesked] = useState("");
  const [kreditnotaer, setKreditnotaer] = useState([]);
  const [valgt, setValgt] = useState(null); // { id, kredit }
  const [nyKunde, setNyKunde] = useState("");
  const [nyMaaned, setNyMaaned] = useState(forrigeMaaned());
  const [filter, setFilter] = useState("alle");
  const [busy, setBusy] = useState(false);

  const hent = useCallback(async () => {
    const [r, k] = await Promise.all([hentFakturaer(), hentKreditnotaer()]);
    if (!r.ok) { setFejl(r.fejl); setListe([]); return; }
    if (!k.ok) setFejl(k.fejl);
    setListe(r.data || []); setKreditnotaer(k.ok ? k.data || [] : []);
  }, []);
  useEffect(() => { hent(); }, [hent]);
  useEffect(() => { if (!nyKunde && kunder[0]?.id) setNyKunde(kunder[0].id); }, [kunder]); // eslint-disable-line react-hooks/exhaustive-deps
  // Åbn en bestemt faktura udefra (fx fra en kundeside)
  useEffect(() => { if (aaben) { setValgt({ id: aaben, kredit: false }); onAabnet?.(); } }, [aaben]); // eslint-disable-line react-hooks/exhaustive-deps

  const opret = async () => {
    setFejl(""); setBesked("");
    const p = maanedPeriode(nyMaaned);
    if (!p || !nyKunde) return setFejl("Vælg kunde og måned.");
    setBusy(true);
    const r = await opretKladde(nyKunde, p.fra, p.til);
    setBusy(false);
    if (!r.ok) return setFejl(r.fejl);
    await hent();
    setValgt({ id: r.data, kredit: false });
  };
  const opretAlle = async () => {
    setFejl(""); setBesked("");
    const p = maanedPeriode(nyMaaned);
    if (!p) return setFejl("Vælg en måned.");
    if (!window.confirm(`Opret kladder for alle kunder med aktive abonnementer for ${nyMaaned}? Kunder, der allerede er faktureret for måneden, springes over. Kladderne udstedes først, når du selv gør det.`)) return;
    setBusy(true);
    const r = await opretAlleKladder(p.fra, p.til);
    setBusy(false);
    if (!r.ok) return setFejl(r.fejl);
    const d = r.data || {};
    const fejlede = (d.fejl || []).map((x) => `${x.kunde}: ${x.fejl}`);
    setBesked(`${d.oprettet || 0} kladder oprettet, ${d.allerede_faktureret || 0} var allerede faktureret.`);
    if (fejlede.length) setFejl(`Kunne ikke oprette for: ${fejlede.join(" · ")}`);
    hent();
  };

  if (valgt) return <FakturaVisning key={valgt.id} id={valgt.id} kredit={valgt.kredit} onTilbage={() => { setValgt(null); hent(); }} onKrediteret={(nr) => { setValgt(null); setBesked(`Kreditnota ${nr} er oprettet. Fakturaen er krediteret, og perioden kan faktureres på ny.`); hent(); }} />;
  const kreditAf = new Map(kreditnotaer.map((c) => [c.invoice_id, c.kreditnr]));
  const nrPaaFaktura = new Map((liste || []).map((i) => [i.id, i.fakturanr]));
  const raekker = [
    ...(liste || []).filter((i) => filter === "alle" || (filter === "krediteret" ? kreditAf.has(i.id) : i.status === filter && !kreditAf.has(i.id))).map((i) => ({ type: "faktura", id: i.id, tid: i.created_at, i })),
    ...(filter === "alle" || filter === "kreditnota" ? kreditnotaer : []).map((c) => ({ type: "kredit", id: c.id, tid: c.created_at, c })),
  ].sort((x, y) => String(y.tid).localeCompare(String(x.tid)));
  return (
    <div>
      <div className={kort + " max-w-3xl"}>
        <h3 className={overskrift}>Opret fakturakladder</h3>
        <p className="text-xs text-muted mb-3">Beregner abonnementer og forbrug for en afsluttet måned ud fra kundens prisplaner. Én faktura pr. kunde med en linjegruppe pr. abonnement. Kladden kan gennemses, før den udstedes og får fakturanummer.</p>
        <div className="flex items-end gap-3 flex-wrap">
          <Felt id="f-maaned" titel="Måned"><input id="f-maaned" type="month" max={forrigeMaaned()} value={nyMaaned} onChange={(e) => e.target.value && setNyMaaned(e.target.value)} className={felt} /></Felt>
          <button onClick={opretAlle} disabled={busy} className={knapPrim}>{busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Layers size={15} aria-hidden="true" />} Opret kladder for alle</button>
        </div>
        <div className="flex items-end gap-3 flex-wrap mt-4 pt-4 border-t border-divider">
          <Felt id="f-kunde" titel="Eller kun én kunde"><select id="f-kunde" value={nyKunde} onChange={(e) => setNyKunde(e.target.value)} className={felt}>{kunder.length === 0 && <option value="">Ingen kunder</option>}{kunder.map((k) => <option key={k.id} value={k.id}>{k.navn}</option>)}</select></Felt>
          <button onClick={opret} disabled={busy || !nyKunde} className={knapSek}><FilePlus size={15} aria-hidden="true" /> Opret kladde</button>
        </div>
        <Meddelelse fejl={fejl} besked={besked} />
      </div>

      <div className="flex gap-2 flex-wrap mb-3" role="group" aria-label="Filtrér fakturaer">
        {[["alle", "Alle"], ["kladde", "Kladder"], ["udstedt", "Udstedt"], ["betalt", "Betalt"], ["krediteret", "Krediteret"], ["kreditnota", "Kreditnotaer"]].map(([id, navn]) => (
          <button key={id} onClick={() => setFilter(id)} aria-pressed={filter === id} className={`min-h-[44px] px-3 rounded-lg text-xs font-semibold border transition-colors ${filter === id ? "bg-bo text-white border-bo" : "border-line bg-white text-ink hover:border-bo"}`}>{navn}</button>
        ))}
      </div>

      {liste === null && <Indlaeser />}
      {liste && raekker.length === 0 && <p className="text-sm text-muted">Ingen fakturaer her.</p>}
      {liste && raekker.length > 0 && (
        <div className="space-y-2 max-w-3xl">
          {raekker.map((x) => x.type === "faktura" ? (
            <button key={x.id} onClick={() => setValgt({ id: x.id, kredit: false })} className="w-full text-left rounded-xl border border-line bg-white p-4 shadow-sm hover:border-bo transition-colors">
              <span className="flex items-start justify-between gap-3 flex-wrap">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{x.i.fakturanr || "Kladde"} {kreditAf.has(x.id) ? <Chip id="annulleret" tekst={`Krediteret (${kreditAf.get(x.id)})`} /> : <Chip id={x.i.status} tekst={FAKTURA_STATUS[x.i.status]} />}</span>
                  <span className="block text-xs text-muted mt-0.5 break-words">{x.i.kunde?.butik || x.i.kunde?.firma_navn || "–"} · {datoTekst(x.i.periode_fra)} – {datoTekst(x.i.periode_til)}</span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-semibold text-ink">{kr(x.i.total_ore)}</span>
                  {x.i.forfaldsdato && x.i.status === "udstedt" && <span className="block text-[11px] text-muted">forfald {datoTekst(x.i.forfaldsdato)}</span>}
                </span>
              </span>
            </button>
          ) : (
            <button key={x.id} onClick={() => setValgt({ id: x.id, kredit: true })} className="w-full text-left rounded-xl border border-line bg-white p-4 shadow-sm hover:border-bo transition-colors">
              <span className="flex items-start justify-between gap-3 flex-wrap">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{x.c.kreditnr} <Chip id="udstedt" tekst="Kreditnota" /></span>
                  <span className="block text-xs text-muted mt-0.5 break-words">{x.c.kunde?.butik || x.c.kunde?.firma_navn || "–"} · krediterer {nrPaaFaktura.get(x.c.invoice_id) || "faktura"} · {datoTekst(x.c.udstedt_dato)}</span>
                </span>
                <span className="block text-sm font-semibold text-ink">{kr(x.c.total_ore)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FakturaVisning({ id, kredit = false, onTilbage, onKrediteret }) {
  const [fak, setFak] = useState(null);
  const [fejl, setFejl] = useState("");
  const [besked, setBesked] = useState("");
  const [busy, setBusy] = useState(false);

  const hent = useCallback(async () => { const r = kredit ? await hentKreditnota(id) : await hentFaktura(id); if (!r.ok) { setFejl(r.fejl); return; } setFak(r.data); }, [id, kredit]);
  useEffect(() => { hent(); }, [hent]);

  const handl = async (fn, ok, bekraeft) => {
    if (bekraeft && !window.confirm(bekraeft)) return;
    setBusy(true); setFejl(""); setBesked("");
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setFejl(r.fejl);
    setBesked(ok(r));
    hent();
  };

  const krediter = async () => {
    const aarsag = window.prompt("Hvorfor krediteres fakturaen? Årsagen står på kreditnotaen.");
    if (aarsag === null) return;
    if (!aarsag.trim()) return setFejl("Skriv en årsag til kreditnotaen.");
    const advarsel = fak.status === "betalt" ? " Fakturaen er markeret betalt - husk at tilbagebetale beløbet." : "";
    if (!window.confirm(`Opret en kreditnota på hele fakturaen (${kr(fak.total_ore)})? Fakturaen annulleres, og det kan ikke fortrydes.${advarsel}`)) return;
    setBusy(true); setFejl(""); setBesked("");
    const r = await opretKreditnota(id, aarsag.trim());
    setBusy(false);
    if (!r.ok) return setFejl(r.fejl);
    onKrediteret(r.data);
  };

  if (!fak) return <div><button onClick={onTilbage} className="text-xs text-muted hover:text-ink flex items-center gap-1 mb-3 min-h-[44px]"><ChevronLeft size={14} aria-hidden="true" /> Alle fakturaer</button>{fejl ? <Meddelelse fejl={fejl} /> : <Indlaeser />}</div>;
  const a = fak.afsender || {}; const k = fak.kunde || {};
  return (
    <div>
      <div className="no-print">
        <button onClick={onTilbage} className="text-xs text-muted hover:text-ink flex items-center gap-1 mb-3 min-h-[44px]"><ChevronLeft size={14} aria-hidden="true" /> Alle fakturaer</button>
        <div className="flex gap-2 flex-wrap mb-2">
          {fak.status === "kladde" && <>
            <button disabled={busy} onClick={() => handl(() => udstedFaktura(id), (r) => `Fakturaen er udstedt som ${r.data}.`, "Udsted fakturaen? Den får et fakturanummer og kan derefter ikke ændres.")} className={knapPrim}><Check size={15} aria-hidden="true" /> Udsted</button>
            <button disabled={busy} onClick={() => handl(() => saetFakturaStatus(id, "annulleret"), () => "Kladden er annulleret.", "Annullér kladden? Perioden kan derefter faktureres på ny.")} className={knapFare}>Annullér kladde</button>
          </>}
          {fak.status === "udstedt" && <>
            <button disabled={busy} onClick={() => handl(() => saetFakturaStatus(id, "betalt"), () => "Markeret som betalt i dag.")} className={knapPrim}><Check size={15} aria-hidden="true" /> Markér betalt</button>
            <button disabled={busy} onClick={krediter} className={knapFare}>Kreditér...</button>
          </>}
          {fak.status === "betalt" && <>
            <button disabled={busy} onClick={() => handl(() => saetFakturaStatus(id, "udstedt"), () => "Betalingen er fortrudt.", "Fortryd betalingen?")} className={knapSek}>Fortryd betaling</button>
            <button disabled={busy} onClick={krediter} className={knapFare}>Kreditér...</button>
          </>}
          {(kredit || (fak.status !== "kladde" && fak.status !== "annulleret")) && <button onClick={() => window.print()} className={knapSek}><Printer size={15} aria-hidden="true" /> Udskriv / gem som PDF</button>}
        </div>
        <Meddelelse fejl={fejl} besked={besked} />
      </div>

      <article className="faktura-print relative mt-4 max-w-3xl rounded-xl border border-line bg-white p-5 sm:p-8 shadow-sm text-ink" aria-label={kredit ? `Kreditnota ${fak.kreditnr}` : `Faktura ${fak.fakturanr || "kladde"}`}>
        {fak.status === "kladde" && <p className="absolute right-4 top-3 text-2xl font-display font-bold text-faint tracking-widest select-none">KLADDE</p>}
        {fak.status === "annulleret" && <p className="absolute right-4 top-3 text-2xl font-display font-bold text-danger tracking-widest select-none">ANNULLERET</p>}
        <div className="flex justify-between gap-6 flex-wrap">
          <div className="text-sm">
            <p className="font-semibold">{a.firma_navn || "(afsender mangler)"}</p>
            {a.adresse && <p>{a.adresse}</p>}{a.postnr_by && <p>{a.postnr_by}</p>}
            {a.cvr && <p>CVR: {a.cvr}</p>}{a.email && <p>{a.email}</p>}{a.telefon && <p>{a.telefon}</p>}
          </div>
          <div className="text-sm sm:text-right">
            <p className="text-lg font-display font-bold">{kredit ? "Kreditnota" : "Faktura"}</p>
            <p>{kredit ? "Kreditnota nr." : "Fakturanr."}: <strong>{(kredit ? fak.kreditnr : fak.fakturanr) || "–"}</strong></p>
            {kredit && <p>Krediterer faktura: <strong>{fak.original_nr || "–"}</strong></p>}
            {fak.udstedt_dato && <p>Dato: {datoTekst(fak.udstedt_dato)}</p>}
            {fak.forfaldsdato && <p>Forfald: <strong>{datoTekst(fak.forfaldsdato)}</strong></p>}
          </div>
        </div>
        <div className="mt-6 text-sm">
          <p className="text-xs text-muted">Til</p>
          <p className="font-semibold">{k.firma_navn || k.butik || "(kunde mangler)"}</p>
          {k.att && <p>Att.: {k.att}</p>}{k.adresse && <p>{k.adresse}</p>}{k.postnr_by && <p>{k.postnr_by}</p>}
          {k.cvr && <p>CVR: {k.cvr}</p>}{k.ean && <p>EAN: {k.ean}</p>}
        </div>
        {kredit && <p className="mt-5 text-sm">Årsag: {fak.aarsag}</p>}
        <p className="mt-5 text-sm">Periode: {datoTekst(fak.periode_fra)} – {datoTekst(fak.periode_til)}{k.butik ? ` · ${k.butik}` : ""}</p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="py-2 pr-2 font-semibold">Beskrivelse</th><th className="py-2 px-2 text-right font-semibold">Antal</th><th className="py-2 px-2 text-right font-semibold">Pris</th><th className="py-2 pl-2 text-right font-semibold">Beløb</th></tr></thead>
            <tbody>
              {fak.linjer.map((l) => (
                <tr key={l.id} className="border-b border-divider align-top">
                  <td className="py-2 pr-2">{l.beskrivelse}</td>
                  <td className="py-2 px-2 text-right whitespace-nowrap">{Number(l.antal).toLocaleString("da-DK")} {l.enhed}</td>
                  <td className="py-2 px-2 text-right whitespace-nowrap">{krEnhed(l.enhedspris_ore)}</td>
                  <td className="py-2 pl-2 text-right whitespace-nowrap">{kr(l.beloeb_ore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="mt-4 ml-auto max-w-xs text-sm space-y-1">
          <div className="flex justify-between"><dt>Beløb ekskl. moms</dt><dd>{kr(fak.netto_ore)}</dd></div>
          <div className="flex justify-between"><dt>Moms {Number(fak.moms_pct).toLocaleString("da-DK")} %</dt><dd>{kr(fak.moms_ore)}</dd></div>
          <div className="flex justify-between border-t border-line pt-1 font-semibold text-base"><dt>{kredit ? "I alt til gode" : "I alt at betale"}</dt><dd>{kr(fak.total_ore)}</dd></div>
        </dl>
        {!kredit && (a.bank_reg || a.iban) && (
          <p className="mt-6 text-sm">Betaling til: {a.bank_reg ? `Reg.nr. ${a.bank_reg}, kontonr. ${a.bank_konto || ""}` : ""}{a.iban ? ` · IBAN ${a.iban}` : ""}. Angiv fakturanummer ved betaling.</p>
        )}
        {a.fodtekst && <p className="mt-3 text-xs text-muted whitespace-pre-line">{a.fodtekst}</p>}
      </article>
    </div>
  );
}

