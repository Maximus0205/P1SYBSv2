import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, AlertCircle, Check, Printer, RefreshCw, ChevronLeft, FilePlus } from "lucide-react";
import {
  METRICS, FORBRUG_METRICS, PRIS_METRICS, SPAERRE_METRICS, KONTO_STATUS, FAKTURA_STATUS,
  kr, krEnhed, oreFraKr, enhedsOreFraKr, krTilFelt, taalFraTekst, datoTekst, maanedPeriode, forrigeMaaned, indevaerendeMaaned, graenseStatus,
  hentOverblik, hentAlleGraenser, hentIndstillinger, gemIndstillinger, hentPlaner, gemPlan, hentKonto, gemKonto, hentGraenser, gemGraense,
  hentFakturaer, hentFaktura, opretKladde, udstedFaktura, saetFakturaStatus, hentKreditnotaer, hentKreditnota, opretKreditnota,
  opretOrgKladde, hentOrganisationer, gemOrganisation, hentMedlemmer,
} from "../lib/billing";

// BACKOFFICE (kun systemadmin, oktober 2026): overblik over kunder (butikker) og forbrug, abonnement og grænser pr. butik, prisplaner, fakturaer
// og afsenderoplysninger. Beregning, fakturanumre og låsning af udstedte fakturaer sker i databasen (billing_*-funktioner) - her er kun visning
// og indtastning. Udskrift/PDF sker via browserens "Udskriv" (vælg "Gem som PDF").
const felt = "w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink min-h-[44px] focus:outline-none focus:border-bo";
const label = "block text-xs font-semibold text-muted mb-1";
const kort = "rounded-xl border border-line bg-white p-4 sm:p-5 shadow-sm mb-4";
const overskrift = "text-sm font-semibold text-ink mb-3";
const knapPrim = "min-h-[44px] px-4 rounded-lg text-sm font-semibold text-white bg-bo hover:bg-bo-dark focus:outline-none focus:ring-2 focus:ring-bo transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none";
const knapSek = "min-h-[44px] px-4 rounded-lg text-sm font-semibold text-ink border border-line hover:border-bo hover:text-bo focus:outline-none focus:ring-2 focus:ring-bo transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none";
const knapFare = "min-h-[44px] px-4 rounded-lg text-sm font-semibold text-danger border border-danger hover:bg-danger hover:text-white focus:outline-none focus:ring-2 focus:ring-danger transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none";

const STATUS_FARVE = {
  proeve: "bg-info/10 text-info", aktiv: "bg-success/10 text-success", pause: "bg-faint/30 text-muted", opsagt: "bg-danger/10 text-danger",
  kladde: "bg-faint/30 text-muted", udstedt: "bg-info/10 text-info", betalt: "bg-success/10 text-success", annulleret: "bg-danger/10 text-danger",
};
function Chip({ id, tekst }) { return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_FARVE[id] || "bg-faint/30 text-muted"}`}>{tekst}</span>; }

function Meddelelse({ fejl, besked }) {
  return (
    <>
      {fejl && <p role="alert" className="text-xs text-danger mt-3 flex items-start gap-1.5"><AlertCircle size={13} className="shrink-0 mt-0.5" aria-hidden="true" /> {fejl}</p>}
      {besked && <p role="status" className="text-xs text-success mt-3 flex items-start gap-1.5"><Check size={13} className="shrink-0 mt-0.5" aria-hidden="true" /> {besked}</p>}
    </>
  );
}
const Indlaeser = ({ tekst = "Henter..." }) => <p className="text-xs text-muted flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" aria-hidden="true" /> {tekst}</p>;

function Felt({ id, titel, children, hjaelp }) {
  return (
    <div>
      <label htmlFor={id} className={label}>{titel}</label>
      {children}
      {hjaelp && <p className="text-[11px] text-muted mt-1">{hjaelp}</p>}
    </div>
  );
}

// ---- Overblik -----------------------------------------------------------------------------------------------------------------------
export function ForbrugSektion({ onVaelgButik }) {
  const [maaned, setMaaned] = useState(indevaerendeMaaned());
  const [raekker, setRaekker] = useState(null);
  const [graenser, setGraenser] = useState([]);
  const [fejl, setFejl] = useState("");

  const hent = useCallback(async () => {
    const p = maanedPeriode(maaned);
    if (!p) return;
    setRaekker(null); setFejl("");
    const [o, g] = await Promise.all([hentOverblik(p.fra, p.til), hentAlleGraenser()]);
    if (!o.ok) { setFejl(o.fejl); setRaekker([]); return; }
    setRaekker(o.data || []); setGraenser(g.ok ? g.data || [] : []);
  }, [maaned]);
  useEffect(() => { hent(); }, [hent]);

  const iDag = maaned === indevaerendeMaaned();
  const sum = useMemo(() => (raekker || []).reduce((s, r) => s + (Number(r.beregning?.netto_ore) || 0), 0), [raekker]);

  return (
    <div>
      <div className="flex items-end gap-3 flex-wrap mb-4">
        <Felt id="bill-maaned" titel="Måned"><input id="bill-maaned" type="month" value={maaned} onChange={(e) => e.target.value && setMaaned(e.target.value)} className={`${felt} w-auto`} /></Felt>
        <button onClick={hent} className={knapSek} aria-label="Opdater overblik"><RefreshCw size={15} aria-hidden="true" /> Opdater</button>
      </div>
      <Meddelelse fejl={fejl} />
      {raekker === null && <Indlaeser />}
      {raekker && raekker.length === 0 && !fejl && <p className="text-sm text-muted">Ingen butikker endnu.</p>}
      {raekker && raekker.length > 0 && (
        <>
          <p className="text-xs text-muted mb-3">{iDag ? "Måneden er i gang - beløbene er forventede og ændrer sig, indtil måneden er slut." : "Afsluttet måned."} Samlet {iDag ? "forventet " : ""}beløb før moms: <strong className="text-ink">{kr(sum)}</strong></p>
          <div className="space-y-3">
            {raekker.map((r) => {
              const gs = iDag ? graenseStatus(graenser.filter((g) => g.store_id === r.store_id), r.forbrug) : {};
              return (
                <div key={r.store_id} className={kort + " !mb-0"}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink break-words">{r.navn}{r.butiksnummer ? <span className="text-muted font-normal"> · {r.butiksnummer}</span> : null}</p>
                      <p className="text-xs text-muted mt-0.5 flex items-center gap-2 flex-wrap">
                        {r.har_abonnement ? <><Chip id={r.status} tekst={KONTO_STATUS[r.status] || r.status} /> {r.beregning?.plan ? <span>{r.beregning.plan}</span> : <span className="text-danger">Ingen prisplan</span>}{r.beregning?.biler !== undefined ? <span className={r.beregning.biler > r.beregning.biler_koebt ? "text-danger font-semibold" : ""}>· {r.beregning.biler} af {r.beregning.biler_koebt} biler</span> : null}{r.beregning?.brugere !== undefined ? <span>· {r.beregning.brugere} brugere</span> : null}</> : <span className="text-danger">Intet abonnement</span>}
                        {r.spaerret && <span className="text-danger font-semibold">· Spærret</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-ink">{r.beregning && !r.beregning.fejl ? kr(r.beregning.netto_ore) : "–"}</p>
                      <p className="text-[11px] text-muted">før moms</p>
                    </div>
                  </div>
                  {r.beregning?.fejl && <p className="text-xs text-danger mt-2">{r.beregning.fejl}</p>}
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                    {FORBRUG_METRICS.map((m) => (
                      <div key={m} className="rounded-lg bg-panel px-3 py-2">
                        <dt className="text-[11px] text-muted">{METRICS[m].navn}</dt>
                        <dd className="text-sm text-ink font-semibold">
                          {Number(r.forbrug?.[m] || 0).toLocaleString("da-DK")}
                          {gs[m] === "spaerret" && <span className="ml-1.5 text-[11px] text-danger font-semibold">Spærret</span>}
                          {gs[m] === "advarsel" && <span className="ml-1.5 text-[11px] text-bo font-semibold">Advarsel</span>}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {r.lager && (() => {
                    const brugt = Number(r.lager.brugt_gb) || 0; const til = r.lager.til_raadighed_gb === null || r.lager.til_raadighed_gb === undefined ? null : Number(r.lager.til_raadighed_gb);
                    const pct = til && til > 0 ? Math.min(100, Math.round((brugt / til) * 100)) : null;
                    const fyldt = til !== null && brugt >= til;
                    return (
                      <div className="mt-3 rounded-lg bg-panel px-3 py-2">
                        <p className="text-[11px] text-muted">Lagerplads</p>
                        <p className="text-sm text-ink font-semibold">{brugt.toLocaleString("da-DK", { maximumFractionDigits: 2 })} GB brugt{til !== null ? ` af ${til.toLocaleString("da-DK", { maximumFractionDigits: 2 })} GB` : ""}{fyldt && <span className="ml-1.5 text-[11px] text-danger font-semibold">Fuldt</span>}</p>
                        {pct !== null && <div className="mt-1.5 h-1.5 rounded-full bg-line overflow-hidden" role="img" aria-label={`${pct} procent af lagerpladsen er brugt`}><div className={`h-full ${pct >= 90 ? "bg-danger" : "bg-bo"}`} style={{ width: `${pct}%` }} /></div>}
                        {til !== null && <p className="text-[11px] text-muted mt-1">{Number(r.lager.inkl_gb)} GB inkluderet + {r.lager.pakker} × {Number(r.lager.pakke_gb)} GB købt</p>}
                      </div>
                    );
                  })()}
                  <button onClick={onVaelgButik} className="mt-3 text-xs text-bo underline hover:no-underline">Gå til Kunder for at redigere</button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ---- Kunder (abonnement + grænser pr. butik) -----------------------------------------------------------------------------------------
const TOM_KONTO = { plan_id: "", status: "proeve", start_dato: "", pris_override: "", ekstra_biler: "0", lager_pakker: "0", rabat_pct: "0", organisation_id: "", kaedepris: false, firma_navn: "", cvr: "", adresse: "", postnr_by: "", att: "", faktura_email: "", ean: "", betalingsfrist_dage: "", spaerret: false, spaerret_aarsag: "", noter: "" };

function kontoTilFelter(k) {
  if (!k) return { ...TOM_KONTO };
  return {
    plan_id: k.plan_id || "", status: k.status, start_dato: k.start_dato || "", pris_override: krTilFelt(k.pris_override_ore), ekstra_biler: String(k.ekstra_biler ?? 0), lager_pakker: String(k.lager_pakker ?? 0), rabat_pct: String(k.rabat_pct ?? 0).replace(".", ","), organisation_id: k.organisation_id || "", kaedepris: !!k.kaedepris,
    firma_navn: k.firma_navn, cvr: k.cvr, adresse: k.adresse, postnr_by: k.postnr_by, att: k.att, faktura_email: k.faktura_email, ean: k.ean,
    betalingsfrist_dage: k.betalingsfrist_dage === null || k.betalingsfrist_dage === undefined ? "" : String(k.betalingsfrist_dage), spaerret: !!k.spaerret, spaerret_aarsag: k.spaerret_aarsag || "", noter: k.noter || "",
  };
}

export function KunderSektion({ stores }) {
  const [butik, setButik] = useState(stores[0]?.id || "");
  const [planer, setPlaner] = useState([]);
  const [organisationer, setOrganisationer] = useState([]);
  const [f, setF] = useState(null);
  const [harKonto, setHarKonto] = useState(false);
  const [graenser, setGraenser] = useState({});
  const [busy, setBusy] = useState(false);
  const [fejl, setFejl] = useState("");
  const [besked, setBesked] = useState("");

  useEffect(() => { if (!butik && stores[0]?.id) setButik(stores[0].id); }, [stores]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { hentPlaner().then((r) => r.ok && setPlaner(r.data)); hentOrganisationer().then((r) => r.ok && setOrganisationer(r.data || [])); }, []);

  useEffect(() => {
    if (!butik) return undefined;
    let levende = true;
    setF(null); setFejl(""); setBesked("");
    Promise.all([hentKonto(butik), hentGraenser(butik)]).then(([k, g]) => {
      if (!levende) return;
      if (!k.ok) { setFejl(k.fejl); return; }
      setHarKonto(!!k.data); setF(kontoTilFelter(k.data));
      const m = {};
      for (const x of g.ok ? g.data || [] : []) m[x.metric] = { advarsel: x.advarsel_ved === null ? "" : String(x.advarsel_ved), spaerr: x.spaerr_ved === null ? "" : String(x.spaerr_ved) };
      setGraenser(m);
    });
    return () => { levende = false; };
  }, [butik]);

  const saet = (k, v) => { setF((p) => ({ ...p, [k]: v })); setBesked(""); };

  const gem = async () => {
    setFejl(""); setBesked("");
    const override = f.pris_override.trim() === "" ? null : oreFraKr(f.pris_override);
    if (f.pris_override.trim() !== "" && override === null) return setFejl("Aftalt månedspris skal være et beløb i kr. (eller tom).");
    const rabat = taalFraTekst(f.rabat_pct === "" ? "0" : f.rabat_pct);
    if (rabat === null || rabat > 100) return setFejl("Rabat skal være et tal mellem 0 og 100.");
    const frist = f.betalingsfrist_dage.trim() === "" ? null : Number(f.betalingsfrist_dage);
    if (frist !== null && (!Number.isInteger(frist) || frist < 0 || frist > 180)) return setFejl("Betalingsfrist skal være et helt antal dage (0-180) eller tom.");
    const ekstraBiler = Number(f.ekstra_biler === "" ? "0" : f.ekstra_biler);
    if (!Number.isInteger(ekstraBiler) || ekstraBiler < 0 || ekstraBiler > 999) return setFejl("Ekstra biler skal være et helt antal (0 eller flere).");
    const lagerPakker = Number(f.lager_pakker === "" ? "0" : f.lager_pakker);
    if (!Number.isInteger(lagerPakker) || lagerPakker < 0 || lagerPakker > 9999) return setFejl("Lagerpakker skal være et helt antal (0 eller flere).");
    setBusy(true);
    const r = await gemKonto({
      store_id: butik, ekstra_biler: ekstraBiler, lager_pakker: lagerPakker, organisation_id: f.organisation_id || null, kaedepris: !!f.organisation_id && f.kaedepris, plan_id: f.plan_id || null, status: f.status, start_dato: f.start_dato || null, pris_override_ore: override, rabat_pct: rabat,
      firma_navn: f.firma_navn.trim(), cvr: f.cvr.trim(), adresse: f.adresse.trim(), postnr_by: f.postnr_by.trim(), att: f.att.trim(), faktura_email: f.faktura_email.trim(), ean: f.ean.trim(),
      betalingsfrist_dage: frist, spaerret: f.spaerret, spaerret_aarsag: f.spaerret_aarsag.trim(), noter: f.noter,
    });
    setBusy(false);
    if (!r.ok) return setFejl(r.fejl);
    setHarKonto(true); setBesked("Abonnementet er gemt.");
  };

  const gemEnGraense = async (metric) => {
    setFejl(""); setBesked("");
    const g = graenser[metric] || { advarsel: "", spaerr: "" };
    const adv = g.advarsel.trim() === "" ? null : taalFraTekst(g.advarsel);
    const sp = g.spaerr.trim() === "" ? null : taalFraTekst(g.spaerr);
    if ((g.advarsel.trim() !== "" && (adv === null || !Number.isInteger(adv))) || (g.spaerr.trim() !== "" && (sp === null || !Number.isInteger(sp)))) return setFejl("Grænser skal være hele tal (eller tomme).");
    if (adv !== null && sp !== null && adv > sp) return setFejl("Advarselsgrænsen må ikke være højere end spærregrænsen.");
    setBusy(true);
    const r = await gemGraense(butik, metric, adv, sp);
    setBusy(false);
    if (!r.ok) return setFejl(r.fejl);
    setBesked(`Grænsen for ${METRICS[metric].navn.toLowerCase()} er gemt.`);
  };

  if (stores.length === 0) return <p className="text-sm text-muted">Ingen butikker endnu.</p>;
  return (
    <div className="max-w-3xl">
      <div className="mb-4">
        <label htmlFor="bill-butik" className={label}>Butik</label>
        <select id="bill-butik" value={butik} onChange={(e) => setButik(e.target.value)} className={felt}>{stores.map((b) => <option key={b.id} value={b.id}>{b.navn}{b.butiksnummer ? ` (${b.butiksnummer})` : ""}</option>)}</select>
      </div>
      {!f && !fejl && <Indlaeser />}
      <Meddelelse fejl={fejl} besked={besked} />
      {f && (
        <>
          {!harKonto && <p className="text-xs text-muted mb-3">Butikken har intet abonnement endnu. Udfyld og gem for at oprette det.</p>}
          <div className={kort}>
            <h3 className={overskrift}>Abonnement</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Felt id="k-plan" titel="Prisplan"><select id="k-plan" value={f.plan_id} onChange={(e) => saet("plan_id", e.target.value)} className={felt}><option value="">Vælg prisplan...</option>{planer.filter((p) => p.aktiv || p.id === f.plan_id).map((p) => <option key={p.id} value={p.id}>{p.navn}</option>)}</select></Felt>
              <Felt id="k-status" titel="Status"><select id="k-status" value={f.status} onChange={(e) => saet("status", e.target.value)} className={felt}>{Object.entries(KONTO_STATUS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Felt>
              <Felt id="k-start" titel="Startdato"><input id="k-start" type="date" value={f.start_dato} onChange={(e) => saet("start_dato", e.target.value)} className={felt} /></Felt>
              <Felt id="k-frist" titel="Betalingsfrist (dage)" hjaelp="Tom = standard fra Indstillinger."><input id="k-frist" inputMode="numeric" value={f.betalingsfrist_dage} onChange={(e) => saet("betalingsfrist_dage", e.target.value.replace(/\D/g, ""))} className={felt} /></Felt>
              <Felt id="k-biler" titel="Ekstra biler (købt ud over pakken)" hjaelp={(() => { const p = planer.find((x) => x.id === f.plan_id); return p ? `Pakken indeholder ${p.inkl_biler} bil(er); ekstra bil koster ${kr(p.pris_ekstra_bil_ore)} pr. md. Butikken kan ikke selv oprette flere biler end det, der er købt (du kan som administrator).` : "Vælg en prisplan for at se pakkens biler."; })()}><input id="k-biler" inputMode="numeric" value={f.ekstra_biler} onChange={(e) => saet("ekstra_biler", e.target.value.replace(/\D/g, ""))} className={felt} /></Felt>
              <Felt id="k-lager" titel="Lagerpakker (ud over det inkluderede)" hjaelp={(() => { const p = planer.find((x) => x.id === f.plan_id); return p ? `Pakken har ${Number(p.inkl_lager_gb)} GB inkluderet; hver lagerpakke er ${Number(p.lager_pakke_gb)} GB og koster ${kr(p.pris_lager_pakke_ore)} pr. md. Ændringer afregnes forholdsmæssigt pr. dag fra i dag.` : "Vælg en prisplan for at se lagerpriser."; })()}><input id="k-lager" inputMode="numeric" value={f.lager_pakker} onChange={(e) => saet("lager_pakker", e.target.value.replace(/\D/g, ""))} className={felt} /></Felt>
              <Felt id="k-override" titel="Aftalt månedspris (kr., før moms)" hjaelp="Tom = prisplanens pris."><input id="k-override" inputMode="decimal" value={f.pris_override} onChange={(e) => saet("pris_override", e.target.value)} className={felt} /></Felt>
              <Felt id="k-rabat" titel="Rabat på abonnement (%)"><input id="k-rabat" inputMode="decimal" value={f.rabat_pct} onChange={(e) => saet("rabat_pct", e.target.value)} className={felt} /></Felt>
            </div>
          </div>

          <div className={kort}>
            <h3 className={overskrift}>Kæde / organisation</h3>
            <Felt id="k-org" titel="Tilhører organisation (valgfri)" hjaelp="Butikken betaler stadig selv. Organisationen bruges til kædeaftaler.">
              <select id="k-org" value={f.organisation_id} onChange={(e) => { saet("organisation_id", e.target.value); if (!e.target.value) saet("kaedepris", false); }} className={felt}><option value="">Ingen</option>{organisationer.map((o) => <option key={o.id} value={o.id}>{o.navn}</option>)}</select>
            </Felt>
            {f.organisation_id && (
              <label className="flex items-start gap-2 text-sm text-ink min-h-[44px] mt-2">
                <input type="checkbox" checked={f.kaedepris} onChange={(e) => saet("kaedepris", e.target.checked)} className="mt-1 h-4 w-4" />
                <span>Brug organisationens prisplan (kædepris) til denne butik. Butikkens egen aftalte pris og rabat gælder stadig, hvis de er udfyldt.</span>
              </label>
            )}
          </div>

          <div className={kort}>
            <h3 className={overskrift}>Fakturaoplysninger</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Felt id="k-firma" titel="Firmanavn"><input id="k-firma" value={f.firma_navn} onChange={(e) => saet("firma_navn", e.target.value)} className={felt} /></Felt>
              <Felt id="k-cvr" titel="CVR"><input id="k-cvr" inputMode="numeric" value={f.cvr} onChange={(e) => saet("cvr", e.target.value)} className={felt} /></Felt>
              <Felt id="k-adr" titel="Adresse"><input id="k-adr" value={f.adresse} onChange={(e) => saet("adresse", e.target.value)} className={felt} /></Felt>
              <Felt id="k-post" titel="Postnr. og by"><input id="k-post" value={f.postnr_by} onChange={(e) => saet("postnr_by", e.target.value)} className={felt} /></Felt>
              <Felt id="k-att" titel="Att."><input id="k-att" value={f.att} onChange={(e) => saet("att", e.target.value)} className={felt} /></Felt>
              <Felt id="k-mail" titel="Faktura-e-mail"><input id="k-mail" type="email" value={f.faktura_email} onChange={(e) => saet("faktura_email", e.target.value)} className={felt} /></Felt>
              <Felt id="k-ean" titel="EAN (valgfri)"><input id="k-ean" inputMode="numeric" value={f.ean} onChange={(e) => saet("ean", e.target.value)} className={felt} /></Felt>
            </div>
            <p className="text-[11px] text-muted mt-2">Oplysningerne kopieres ind på hver faktura, når kladden oprettes - senere ændringer rammer ikke fakturaer, der allerede er oprettet.</p>
          </div>

          <div className={kort}>
            <h3 className={overskrift}>Spærring</h3>
            <label className="flex items-start gap-2 text-sm text-ink min-h-[44px]">
              <input type="checkbox" checked={f.spaerret} onChange={(e) => saet("spaerret", e.target.checked)} className="mt-1 h-4 w-4" />
              <span>Spær butikkens brug af betalte tjenester (SMS og ruteberegning). Resten af systemet virker som normalt.</span>
            </label>
            <div className="mt-2"><Felt id="k-sp-aarsag" titel="Besked til butikken (valgfri)"><input id="k-sp-aarsag" value={f.spaerret_aarsag} onChange={(e) => saet("spaerret_aarsag", e.target.value)} className={felt} /></Felt></div>
          </div>

          <div className={kort}>
            <h3 className={overskrift}>Noter (kun intern)</h3>
            <textarea aria-label="Interne noter" rows={3} value={f.noter} onChange={(e) => saet("noter", e.target.value)} className={felt + " min-h-[88px]"} />
          </div>
          <button onClick={gem} disabled={busy} className={knapPrim}>{busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />} Gem abonnement</button>

          <div className={kort + " mt-6"}>
            <h3 className={overskrift}>Månedlige grænser</h3>
            <p className="text-xs text-muted mb-3">Tæller kalendermåneden. <strong>Advarsel</strong> vises i Overblik. <strong>Spær</strong> stopper tjenesten på serveren, når grænsen er nået (kun SMS og ruteberegning). Tom = ingen grænse. Kræver, at abonnementet er gemt først.</p>
            <div className="space-y-3">
              {FORBRUG_METRICS.map((m) => {
                const g = graenser[m] || { advarsel: "", spaerr: "" };
                const kanSpaerres = SPAERRE_METRICS.includes(m);
                return (
                  <div key={m} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                    <p className="col-span-2 sm:col-span-1 text-sm text-ink font-semibold self-center">{METRICS[m].navn}</p>
                    <Felt id={`g-adv-${m}`} titel="Advarsel ved"><input id={`g-adv-${m}`} inputMode="numeric" value={g.advarsel} onChange={(e) => setGraenser((p) => ({ ...p, [m]: { ...g, advarsel: e.target.value.replace(/\D/g, "") } }))} className={felt} /></Felt>
                    <Felt id={`g-sp-${m}`} titel="Spær ved"><input id={`g-sp-${m}`} inputMode="numeric" disabled={!kanSpaerres} value={kanSpaerres ? g.spaerr : ""} onChange={(e) => setGraenser((p) => ({ ...p, [m]: { ...g, spaerr: e.target.value.replace(/\D/g, "") } }))} className={felt + " disabled:opacity-50"} placeholder={kanSpaerres ? "" : "–"} /></Felt>
                    <button onClick={() => gemEnGraense(m)} disabled={busy || !harKonto} className={knapSek + " col-span-2 sm:col-span-1"}>Gem</button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Organisationer (kæder med egen aftale) ------------------------------------------------------------------------------------------
const ORG_STATUS = { proeve: "Prøve", aktiv: "Aktiv", pause: "Pause", opsagt: "Opsagt" };
const TOM_ORG = { id: null, navn: "", plan_id: "", status: "proeve", start_dato: "", pris_override: "", rabat_pct: "0", firma_navn: "", cvr: "", adresse: "", postnr_by: "", att: "", faktura_email: "", ean: "", betalingsfrist_dage: "", noter: "" };
function orgTilFelter(o) {
  return { id: o.id, navn: o.navn, plan_id: o.plan_id || "", status: o.status, start_dato: o.start_dato || "", pris_override: krTilFelt(o.pris_override_ore), rabat_pct: String(o.rabat_pct ?? 0).replace(".", ","),
    firma_navn: o.firma_navn || "", cvr: o.cvr || "", adresse: o.adresse || "", postnr_by: o.postnr_by || "", att: o.att || "", faktura_email: o.faktura_email || "", ean: o.ean || "",
    betalingsfrist_dage: o.betalingsfrist_dage === null || o.betalingsfrist_dage === undefined ? "" : String(o.betalingsfrist_dage), noter: o.noter || "" };
}

export function OrganisationerSektion({ stores }) {
  const [liste, setListe] = useState(null);
  const [planer, setPlaner] = useState([]);
  const [f, setF] = useState(null);
  const [medlemmer, setMedlemmer] = useState([]);
  const [busy, setBusy] = useState(false);
  const [fejl, setFejl] = useState("");
  const [besked, setBesked] = useState("");

  const hent = useCallback(async () => { const r = await hentOrganisationer(); if (!r.ok) { setFejl(r.fejl); setListe([]); return; } setListe(r.data || []); }, []);
  useEffect(() => { hent(); hentPlaner().then((r) => r.ok && setPlaner(r.data)); }, [hent]);
  useEffect(() => {
    setMedlemmer([]);
    if (!f?.id) return undefined;
    let levende = true;
    hentMedlemmer(f.id).then((r) => { if (levende && r.ok) setMedlemmer(r.data || []); });
    return () => { levende = false; };
  }, [f?.id]);

  const saet = (k, v) => { setF((p) => ({ ...p, [k]: v })); setBesked(""); };
  const gem = async () => {
    setFejl(""); setBesked("");
    if (!f.navn.trim()) return setFejl("Skriv organisationens navn.");
    const override = f.pris_override.trim() === "" ? null : oreFraKr(f.pris_override);
    if (f.pris_override.trim() !== "" && override === null) return setFejl("Aftalt månedspris skal være et beløb i kr. (eller tom).");
    const rabat = taalFraTekst(f.rabat_pct === "" ? "0" : f.rabat_pct);
    if (rabat === null || rabat > 100) return setFejl("Rabat skal være et tal mellem 0 og 100.");
    const frist = f.betalingsfrist_dage.trim() === "" ? null : Number(f.betalingsfrist_dage);
    if (frist !== null && (!Number.isInteger(frist) || frist < 0 || frist > 180)) return setFejl("Betalingsfrist skal være et helt antal dage (0-180) eller tom.");
    setBusy(true);
    const r = await gemOrganisation({
      id: f.id, navn: f.navn.trim(), plan_id: f.plan_id || null, status: f.status, start_dato: f.start_dato || null, pris_override_ore: override, rabat_pct: rabat,
      firma_navn: f.firma_navn.trim(), cvr: f.cvr.trim(), adresse: f.adresse.trim(), postnr_by: f.postnr_by.trim(), att: f.att.trim(), faktura_email: f.faktura_email.trim(), ean: f.ean.trim(),
      betalingsfrist_dage: frist, noter: f.noter,
    });
    setBusy(false);
    if (!r.ok) return setFejl(r.fejl);
    setBesked("Organisationen er gemt.");
    if (!f.id && r.data?.id) setF((p) => ({ ...p, id: r.data.id }));
    hent();
  };

  if (f) {
    const butikNavn = (id) => stores.find((b) => b.id === id)?.navn || "Ukendt butik";
    return (
      <div className="max-w-3xl">
        <button onClick={() => { setF(null); setFejl(""); setBesked(""); }} className={knapSek + " mb-4"}><ChevronLeft size={15} aria-hidden="true" /> Alle organisationer</button>
        <Meddelelse fejl={fejl} besked={besked} />
        <div className={kort}>
          <h3 className={overskrift}>Aftale</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Felt id="o-navn" titel="Navn"><input id="o-navn" value={f.navn} onChange={(e) => saet("navn", e.target.value)} className={felt} /></Felt>
            <Felt id="o-status" titel="Status"><select id="o-status" value={f.status} onChange={(e) => saet("status", e.target.value)} className={felt}>{Object.entries(ORG_STATUS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Felt>
            <Felt id="o-plan" titel="Prisplan (kædeaftale)" hjaelp="Bruges til organisationens eget abonnement og som kædepris for de butikker, der er sat til det."><select id="o-plan" value={f.plan_id} onChange={(e) => saet("plan_id", e.target.value)} className={felt}><option value="">Vælg prisplan...</option>{planer.filter((p) => p.aktiv || p.id === f.plan_id).map((p) => <option key={p.id} value={p.id}>{p.navn}</option>)}</select></Felt>
            <Felt id="o-start" titel="Startdato"><input id="o-start" type="date" value={f.start_dato} onChange={(e) => saet("start_dato", e.target.value)} className={felt} /></Felt>
            <Felt id="o-override" titel="Aftalt månedspris for organisationen (kr., før moms)" hjaelp="Tom = prisplanens pris. 0 kr. er tilladt, hvis kæden kun skal give butikkerne kædepris."><input id="o-override" inputMode="decimal" value={f.pris_override} onChange={(e) => saet("pris_override", e.target.value)} className={felt} /></Felt>
            <Felt id="o-rabat" titel="Rabat (%)"><input id="o-rabat" inputMode="decimal" value={f.rabat_pct} onChange={(e) => saet("rabat_pct", e.target.value)} className={felt} /></Felt>
            <Felt id="o-frist" titel="Betalingsfrist (dage)" hjaelp="Tom = standard fra Indstillinger."><input id="o-frist" inputMode="numeric" value={f.betalingsfrist_dage} onChange={(e) => saet("betalingsfrist_dage", e.target.value.replace(/\D/g, ""))} className={felt} /></Felt>
          </div>
        </div>
        <div className={kort}>
          <h3 className={overskrift}>Fakturaoplysninger</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Felt id="o-firma" titel="Firmanavn"><input id="o-firma" value={f.firma_navn} onChange={(e) => saet("firma_navn", e.target.value)} className={felt} /></Felt>
            <Felt id="o-cvr" titel="CVR"><input id="o-cvr" inputMode="numeric" value={f.cvr} onChange={(e) => saet("cvr", e.target.value)} className={felt} /></Felt>
            <Felt id="o-adr" titel="Adresse"><input id="o-adr" value={f.adresse} onChange={(e) => saet("adresse", e.target.value)} className={felt} /></Felt>
            <Felt id="o-post" titel="Postnr. og by"><input id="o-post" value={f.postnr_by} onChange={(e) => saet("postnr_by", e.target.value)} className={felt} /></Felt>
            <Felt id="o-att" titel="Att."><input id="o-att" value={f.att} onChange={(e) => saet("att", e.target.value)} className={felt} /></Felt>
            <Felt id="o-mail" titel="Faktura-e-mail"><input id="o-mail" type="email" value={f.faktura_email} onChange={(e) => saet("faktura_email", e.target.value)} className={felt} /></Felt>
            <Felt id="o-ean" titel="EAN (valgfri)"><input id="o-ean" inputMode="numeric" value={f.ean} onChange={(e) => saet("ean", e.target.value)} className={felt} /></Felt>
          </div>
        </div>
        <div className={kort}>
          <h3 className={overskrift}>Noter (kun intern)</h3>
          <textarea aria-label="Interne noter" rows={3} value={f.noter} onChange={(e) => saet("noter", e.target.value)} className={felt + " min-h-[88px]"} />
        </div>
        <button onClick={gem} disabled={busy} className={knapPrim}>{busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />} Gem organisation</button>
        <div className={kort + " mt-6"}>
          <h3 className={overskrift}>Butikker i organisationen</h3>
          {!f.id && <p className="text-xs text-muted">Gem organisationen først. Derefter knytter du butikker til den under Kunder.</p>}
          {f.id && medlemmer.length === 0 && <p className="text-xs text-muted">Ingen butikker endnu. Vælg organisationen på butikkens side under Kunder.</p>}
          {medlemmer.length > 0 && <ul className="text-sm text-ink space-y-1">{medlemmer.map((m) => <li key={m.store_id}>{butikNavn(m.store_id)} <span className="text-xs text-muted">· {m.kaedepris ? "kædepris" : "egen pris"}</span></li>)}</ul>}
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-3xl">
      <p className="text-xs text-muted mb-3">En organisation er fx et kædekontor. Butikkerne betaler stadig selv, men kæden kan have sin egen prisplan (kædepris) og eventuelt et eget abonnement.</p>
      <button onClick={() => { setF({ ...TOM_ORG }); setFejl(""); setBesked(""); }} className={knapPrim + " mb-4"}><FilePlus size={15} aria-hidden="true" /> Ny organisation</button>
      <Meddelelse fejl={fejl} besked={besked} />
      {liste === null && <Indlaeser />}
      {liste && liste.length === 0 && <p className="text-sm text-muted">Ingen organisationer endnu.</p>}
      {liste && liste.length > 0 && (
        <div className="space-y-2">
          {liste.map((o) => (
            <button key={o.id} onClick={() => { setF(orgTilFelter(o)); setFejl(""); setBesked(""); }} className="w-full text-left rounded-xl border border-line bg-white p-4 shadow-sm hover:border-bo transition-colors">
              <span className="flex items-center justify-between gap-3 flex-wrap"><span className="text-sm font-semibold text-ink">{o.navn}</span><span className="text-xs text-muted">{ORG_STATUS[o.status] || o.status}{planer.find((p) => p.id === o.plan_id) ? ` · ${planer.find((p) => p.id === o.plan_id).navn}` : ""}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Prisplaner ---------------------------------------------------------------------------------------------------------------------
function planTilFelter(p) {
  const priser = {};
  for (const m of PRIS_METRICS) {
    const x = (p?.priser || []).find((q) => q.metric === m);
    priser[m] = { inkluderet: x ? String(Number(x.inkluderet)).replace(".", ",") : "", pris: x ? krTilFelt(x.enhedspris_ore) : "" };
  }
  return { id: p?.id || null, navn: p?.navn || "", beskrivelse: p?.beskrivelse || "", maanedspris: krTilFelt(p?.maanedspris_ore ?? 0), inkl_brugere: String(p?.inkl_brugere ?? 0), inkl_biler: String(p?.inkl_biler ?? 1), ekstra_bil: krTilFelt(p?.pris_ekstra_bil_ore ?? 0), ekstra_bruger: krTilFelt(p?.pris_ekstra_bruger_ore ?? 0), inkl_lager: String(Number(p?.inkl_lager_gb ?? 0)).replace(".", ","), lager_pakke: String(Number(p?.lager_pakke_gb ?? 10)).replace(".", ","), pris_lager_pakke: krTilFelt(p?.pris_lager_pakke_ore ?? 0), aktiv: p ? p.aktiv : true, priser };
}

export function PlanerSektion() {
  const [planer, setPlaner] = useState(null);
  const [valgt, setValgt] = useState(null);
  const [fejl, setFejl] = useState("");
  const [besked, setBesked] = useState("");
  const [busy, setBusy] = useState(false);

  const hent = useCallback(async () => { const r = await hentPlaner(); if (!r.ok) { setFejl(r.fejl); setPlaner([]); return; } setPlaner(r.data); }, []);
  useEffect(() => { hent(); }, [hent]);

  const gem = async () => {
    setFejl(""); setBesked("");
    const navn = valgt.navn.trim();
    if (!navn) return setFejl("Giv prisplanen et navn.");
    const mdr = oreFraKr(valgt.maanedspris === "" ? "0" : valgt.maanedspris);
    const ekstra = oreFraKr(valgt.ekstra_bruger === "" ? "0" : valgt.ekstra_bruger);
    const inkl = Number(valgt.inkl_brugere === "" ? "0" : valgt.inkl_brugere);
    const inklBiler = Number(valgt.inkl_biler === "" ? "0" : valgt.inkl_biler);
    const ekstraBil = oreFraKr(valgt.ekstra_bil === "" ? "0" : valgt.ekstra_bil);
    const inklLager = taalFraTekst(valgt.inkl_lager === "" ? "0" : valgt.inkl_lager);
    const pakkeGb = taalFraTekst(valgt.lager_pakke === "" ? "0" : valgt.lager_pakke);
    const prisPakke = oreFraKr(valgt.pris_lager_pakke === "" ? "0" : valgt.pris_lager_pakke);
    if (inklLager === null || pakkeGb === null || pakkeGb <= 0 || prisPakke === null) return setFejl("Tjek lagerfelterne: GB skal være tal (pakkestørrelsen over 0), og prisen et beløb i kr.");
    if (mdr === null || ekstra === null || ekstraBil === null) return setFejl("Priser skal være beløb i kr.");
    if (!Number.isInteger(inkl) || inkl < 0 || !Number.isInteger(inklBiler) || inklBiler < 0) return setFejl("Inkluderede brugere og biler skal være hele tal.");
    const priser = [];
    for (const m of PRIS_METRICS) {
      const x = valgt.priser[m];
      const ink = x.inkluderet.trim() === "" ? 0 : taalFraTekst(x.inkluderet);
      const pris = x.pris.trim() === "" ? 0 : enhedsOreFraKr(x.pris);
      if (ink === null || pris === null) return setFejl(`Tjek tallene for ${METRICS[m].navn.toLowerCase()}.`);
      priser.push({ metric: m, inkluderet: ink, enhedspris_ore: pris });
    }
    setBusy(true);
    const r = await gemPlan({ id: valgt.id, navn, beskrivelse: valgt.beskrivelse, maanedspris_ore: mdr, inkl_brugere: inkl, inkl_biler: inklBiler, pris_ekstra_bil_ore: ekstraBil, pris_ekstra_bruger_ore: ekstra, inkl_lager_gb: inklLager, lager_pakke_gb: pakkeGb, pris_lager_pakke_ore: prisPakke, aktiv: valgt.aktiv }, priser);
    setBusy(false);
    if (!r.ok) return setFejl(r.fejl);
    setBesked("Prisplanen er gemt. Nye priser gælder kommende fakturaer og forventede beløb - udstedte fakturaer ændres aldrig.");
    setValgt((p) => ({ ...p, id: r.id }));
    hent();
  };

  if (planer === null) return <Indlaeser />;
  if (valgt) {
    const setP = (k, v) => { setValgt((p) => ({ ...p, [k]: v })); setBesked(""); };
    return (
      <div className="max-w-3xl">
        <button onClick={() => { setValgt(null); setFejl(""); setBesked(""); }} className="text-xs text-muted hover:text-ink flex items-center gap-1 mb-3 min-h-[44px]"><ChevronLeft size={14} aria-hidden="true" /> Alle prisplaner</button>
        <div className={kort}>
          <h3 className={overskrift}>{valgt.id ? "Redigér prisplan" : "Ny prisplan"}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Felt id="p-navn" titel="Navn"><input id="p-navn" value={valgt.navn} onChange={(e) => setP("navn", e.target.value)} className={felt} /></Felt>
            <Felt id="p-mdr" titel="Månedspris (kr., før moms)"><input id="p-mdr" inputMode="decimal" value={valgt.maanedspris} onChange={(e) => setP("maanedspris", e.target.value)} className={felt} /></Felt>
            <Felt id="p-bil" titel="Biler i pakken" hjaelp="Butikkens kapacitet - det er den, prisen primært følger."><input id="p-bil" inputMode="numeric" value={valgt.inkl_biler} onChange={(e) => setP("inkl_biler", e.target.value.replace(/\D/g, ""))} className={felt} /></Felt>
            <Felt id="p-ekstrabil" titel="Pris pr. ekstra bil pr. md. (kr.)"><input id="p-ekstrabil" inputMode="decimal" value={valgt.ekstra_bil} onChange={(e) => setP("ekstra_bil", e.target.value)} className={felt} /></Felt>
            <Felt id="p-inkl" titel="Inkluderede brugere"><input id="p-inkl" inputMode="numeric" value={valgt.inkl_brugere} onChange={(e) => setP("inkl_brugere", e.target.value.replace(/\D/g, ""))} className={felt} /></Felt>
            <Felt id="p-ekstra" titel="Pris pr. ekstra bruger pr. md. (kr.)"><input id="p-ekstra" inputMode="decimal" value={valgt.ekstra_bruger} onChange={(e) => setP("ekstra_bruger", e.target.value)} className={felt} /></Felt>
          </div>
          <h4 className="text-xs font-semibold text-ink mt-4 mb-2">Lagerplads (fillager)</h4>
          <div className="grid gap-3 sm:grid-cols-3">
            <Felt id="p-lager-inkl" titel="Inkluderet lager (GB)"><input id="p-lager-inkl" inputMode="decimal" value={valgt.inkl_lager} onChange={(e) => setP("inkl_lager", e.target.value)} className={felt} /></Felt>
            <Felt id="p-lager-gb" titel="GB pr. lagerpakke"><input id="p-lager-gb" inputMode="decimal" value={valgt.lager_pakke} onChange={(e) => setP("lager_pakke", e.target.value)} className={felt} /></Felt>
            <Felt id="p-lager-pris" titel="Pris pr. pakke pr. md. (kr.)"><input id="p-lager-pris" inputMode="decimal" value={valgt.pris_lager_pakke} onChange={(e) => setP("pris_lager_pakke", e.target.value)} className={felt} /></Felt>
          </div>
          <p className="text-[11px] text-muted mt-1">Lager købes i pakker med fast månedspris, ikke efter forbrug. Ændres antallet midt i en måned, afregnes pakkerne forholdsmæssigt pr. dag.</p>
          <div className="mt-3"><Felt id="p-besk" titel="Beskrivelse (intern)"><input id="p-besk" value={valgt.beskrivelse} onChange={(e) => setP("beskrivelse", e.target.value)} className={felt} /></Felt></div>
          <label className="flex items-center gap-2 text-sm text-ink min-h-[44px] mt-2"><input type="checkbox" checked={valgt.aktiv} onChange={(e) => setP("aktiv", e.target.checked)} className="h-4 w-4" /> Kan vælges på nye abonnementer</label>
        </div>
        <div className={kort}>
          <h3 className={overskrift}>Forbrug ud over det inkluderede</h3>
          <p className="text-xs text-muted mb-3">Inkluderet pr. måned, og pris pr. enhed derudover (kr., fx 0,35 for en SMS). Tomme felter = gratis / ikke afregnet.</p>
          <div className="space-y-3">
            {PRIS_METRICS.map((m) => (
              <div key={m} className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-end">
                <p className="col-span-2 sm:col-span-1 text-sm text-ink font-semibold self-center">{METRICS[m].navn}</p>
                <Felt id={`pm-ink-${m}`} titel={`Inkl. pr. md. (${METRICS[m].enhed})`}><input id={`pm-ink-${m}`} inputMode="decimal" value={valgt.priser[m].inkluderet} onChange={(e) => setValgt((p) => ({ ...p, priser: { ...p.priser, [m]: { ...p.priser[m], inkluderet: e.target.value } } }))} className={felt} /></Felt>
                <Felt id={`pm-pris-${m}`} titel={`Pris pr. ${METRICS[m].enhed} (kr.)`}><input id={`pm-pris-${m}`} inputMode="decimal" value={valgt.priser[m].pris} onChange={(e) => setValgt((p) => ({ ...p, priser: { ...p.priser, [m]: { ...p.priser[m], pris: e.target.value } } }))} className={felt} /></Felt>
              </div>
            ))}
          </div>
        </div>
        <button onClick={gem} disabled={busy} className={knapPrim}>{busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />} Gem prisplan</button>
        <Meddelelse fejl={fejl} besked={besked} />
      </div>
    );
  }
  return (
    <div className="max-w-3xl">
      <Meddelelse fejl={fejl} />
      <div className="space-y-2 mb-4">
        {planer.length === 0 && <p className="text-sm text-muted">Ingen prisplaner endnu.</p>}
        {planer.map((p) => (
          <button key={p.id} onClick={() => { setValgt(planTilFelter(p)); setFejl(""); setBesked(""); }} className="w-full text-left rounded-xl border border-line bg-white p-4 shadow-sm hover:border-bo transition-colors min-h-[44px]">
            <span className="flex items-start justify-between gap-3 flex-wrap">
              <span className="text-sm font-semibold text-ink">{p.navn}{!p.aktiv && <span className="ml-2 text-[11px] text-muted font-normal">(ikke aktiv)</span>}</span>
              <span className="text-sm text-ink">{kr(p.maanedspris_ore)} / md. · {p.inkl_biler} bil(er)</span>
            </span>
            {p.beskrivelse && <span className="block text-xs text-muted mt-0.5">{p.beskrivelse}</span>}
          </button>
        ))}
      </div>
      <button onClick={() => setValgt(planTilFelter(null))} className={knapPrim}><FilePlus size={15} aria-hidden="true" /> Ny prisplan</button>
    </div>
  );
}

// ---- Fakturaer ----------------------------------------------------------------------------------------------------------------------
export function FakturaerSektion({ stores }) {
  const [liste, setListe] = useState(null);
  const [fejl, setFejl] = useState("");
  const [besked, setBesked] = useState("");
  const [kreditnotaer, setKreditnotaer] = useState([]);
  const [valgt, setValgt] = useState(null); // { id, kredit }
  const [nyType, setNyType] = useState("butik");
  const [organisationer, setOrganisationer] = useState([]);
  const [nyOrg, setNyOrg] = useState("");
  const [nyButik, setNyButik] = useState(stores[0]?.id || "");
  const [nyMaaned, setNyMaaned] = useState(forrigeMaaned());
  const [busy, setBusy] = useState(false);

  const hent = useCallback(async () => {
    const [r, k] = await Promise.all([hentFakturaer(), hentKreditnotaer()]);
    if (!r.ok) { setFejl(r.fejl); setListe([]); return; }
    if (!k.ok) setFejl(k.fejl);
    setListe(r.data || []); setKreditnotaer(k.ok ? k.data || [] : []);
  }, []);
  useEffect(() => { hent(); }, [hent]);
  useEffect(() => { if (!nyButik && stores[0]?.id) setNyButik(stores[0].id); }, [stores]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { hentOrganisationer().then((r) => { if (r.ok) { setOrganisationer(r.data || []); setNyOrg((v) => v || r.data?.[0]?.id || ""); } }); }, []);

  const opret = async () => {
    setFejl(""); setBesked("");
    const p = maanedPeriode(nyMaaned);
    const kundeId = nyType === "butik" ? nyButik : nyOrg;
    if (!p || !kundeId) return setFejl("Vælg kunde og måned.");
    setBusy(true);
    const r = nyType === "butik" ? await opretKladde(kundeId, p.fra, p.til) : await opretOrgKladde(kundeId, p.fra, p.til);
    setBusy(false);
    if (!r.ok) return setFejl(r.fejl);
    await hent();
    setValgt({ id: r.data, kredit: false });
  };

  if (valgt) return <FakturaVisning key={valgt.id} id={valgt.id} kredit={valgt.kredit} onTilbage={() => { setValgt(null); hent(); }} onKrediteret={(nr) => { setValgt(null); setBesked(`Kreditnota ${nr} er oprettet. Fakturaen er krediteret, og perioden kan faktureres på ny.`); hent(); }} />;
  const kreditAf = new Map(kreditnotaer.map((c) => [c.invoice_id, c.kreditnr]));
  const nrPaaFaktura = new Map((liste || []).map((i) => [i.id, i.fakturanr]));
  const raekker = [
    ...(liste || []).map((i) => ({ type: "faktura", id: i.id, tid: i.created_at, i })),
    ...kreditnotaer.map((c) => ({ type: "kredit", id: c.id, tid: c.created_at, c })),
  ].sort((x, y) => String(y.tid).localeCompare(String(x.tid)));
  return (
    <div>
      <div className={kort + " max-w-3xl"}>
        <h3 className={overskrift}>Opret faktura-kladde</h3>
        <p className="text-xs text-muted mb-3">Beregner abonnement og forbrug for en afsluttet måned ud fra kundens prisplan (en organisation faktureres kun for sin kædeaftale; butikkerne faktureres hver for sig). Kladden kan gennemses, før den udstedes og får fakturanummer.</p>
        <div className="flex items-end gap-3 flex-wrap">
          <Felt id="f-type" titel="Kundetype"><select id="f-type" value={nyType} onChange={(e) => setNyType(e.target.value)} className={felt}><option value="butik">Butik</option><option value="org">Organisation</option></select></Felt>
          {nyType === "butik"
            ? <Felt id="f-butik" titel="Butik"><select id="f-butik" value={nyButik} onChange={(e) => setNyButik(e.target.value)} className={felt}>{stores.map((b) => <option key={b.id} value={b.id}>{b.navn}</option>)}</select></Felt>
            : <Felt id="f-org" titel="Organisation"><select id="f-org" value={nyOrg} onChange={(e) => setNyOrg(e.target.value)} className={felt}>{organisationer.length === 0 && <option value="">Ingen organisationer</option>}{organisationer.map((o) => <option key={o.id} value={o.id}>{o.navn}</option>)}</select></Felt>}
          <Felt id="f-maaned" titel="Måned"><input id="f-maaned" type="month" max={forrigeMaaned()} value={nyMaaned} onChange={(e) => e.target.value && setNyMaaned(e.target.value)} className={felt} /></Felt>
          <button onClick={opret} disabled={busy} className={knapPrim}>{busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <FilePlus size={15} aria-hidden="true" />} Opret kladde</button>
        </div>
        <Meddelelse fejl={fejl} besked={besked} />
      </div>

      {liste === null && <Indlaeser />}
      {liste && raekker.length === 0 && <p className="text-sm text-muted">Ingen fakturaer endnu.</p>}
      {liste && raekker.length > 0 && (
        <div className="space-y-2 max-w-3xl">
          {raekker.map((x) => x.type === "faktura" ? (
            <button key={x.id} onClick={() => setValgt({ id: x.id, kredit: false })} className="w-full text-left rounded-xl border border-line bg-white p-4 shadow-sm hover:border-bo transition-colors">
              <span className="flex items-start justify-between gap-3 flex-wrap">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{x.i.fakturanr || "Kladde"} {kreditAf.has(x.id) ? <Chip id="annulleret" tekst={`Krediteret (${kreditAf.get(x.id)})`} /> : <Chip id={x.i.status} tekst={FAKTURA_STATUS[x.i.status]} />}</span>
                  <span className="block text-xs text-muted mt-0.5 break-words">{x.i.kunde?.firma_navn || x.i.kunde?.butik || "–"} · {datoTekst(x.i.periode_fra)} – {datoTekst(x.i.periode_til)}</span>
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
                  <span className="block text-xs text-muted mt-0.5 break-words">{x.c.kunde?.firma_navn || x.c.kunde?.butik || "–"} · krediterer {nrPaaFaktura.get(x.c.invoice_id) || "faktura"} · {datoTekst(x.c.udstedt_dato)}</span>
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
          <p className="font-semibold">{k.firma_navn || "(kunde mangler)"}</p>
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

// ---- Indstillinger (afsender) -------------------------------------------------------------------------------------------------------
export function IndstillingerSektion() {
  const [f, setF] = useState(null);
  const [naeste, setNaeste] = useState(null);
  const [fejl, setFejl] = useState("");
  const [besked, setBesked] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    hentIndstillinger().then((r) => {
      if (!r.ok || !r.data) { setFejl(r.fejl || "Indstillingerne kunne ikke hentes."); return; }
      const d = r.data;
      setNaeste(d.naeste_fakturanr);
      setF({ firma_navn: d.firma_navn, cvr: d.cvr, adresse: d.adresse, postnr_by: d.postnr_by, email: d.email, telefon: d.telefon, bank_reg: d.bank_reg, bank_konto: d.bank_konto, iban: d.iban, faktura_prefix: d.faktura_prefix, moms_pct: String(d.moms_pct).replace(".", ","), betalingsfrist_dage: String(d.betalingsfrist_dage), faktura_fodtekst: d.faktura_fodtekst });
    });
  }, []);

  const saet = (k, v) => { setF((p) => ({ ...p, [k]: v })); setBesked(""); };
  const gem = async () => {
    setFejl(""); setBesked("");
    const moms = taalFraTekst(f.moms_pct);
    const frist = Number(f.betalingsfrist_dage);
    if (moms === null || moms > 100) return setFejl("Moms skal være et tal mellem 0 og 100.");
    if (!Number.isInteger(frist) || frist < 0 || frist > 180) return setFejl("Betalingsfrist skal være et helt antal dage (0-180).");
    if (!/^[A-Za-z0-9-]{0,6}$/.test(f.faktura_prefix)) return setFejl("Præfikset må højst være 6 tegn (bogstaver, tal eller bindestreg).");
    setBusy(true);
    const r = await gemIndstillinger({ firma_navn: f.firma_navn.trim(), cvr: f.cvr.trim(), adresse: f.adresse.trim(), postnr_by: f.postnr_by.trim(), email: f.email.trim(), telefon: f.telefon.trim(), bank_reg: f.bank_reg.trim(), bank_konto: f.bank_konto.trim(), iban: f.iban.trim(), faktura_prefix: f.faktura_prefix.trim(), moms_pct: moms, betalingsfrist_dage: frist, faktura_fodtekst: f.faktura_fodtekst });
    setBusy(false);
    if (!r.ok) return setFejl(r.fejl);
    setBesked("Indstillingerne er gemt.");
  };

  if (!f) return fejl ? <Meddelelse fejl={fejl} /> : <Indlaeser />;
  return (
    <div className="max-w-3xl">
      <div className={kort}>
        <h3 className={overskrift}>Afsender (jer)</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Felt id="i-firma" titel="Firmanavn"><input id="i-firma" value={f.firma_navn} onChange={(e) => saet("firma_navn", e.target.value)} className={felt} /></Felt>
          <Felt id="i-cvr" titel="CVR"><input id="i-cvr" inputMode="numeric" value={f.cvr} onChange={(e) => saet("cvr", e.target.value)} className={felt} /></Felt>
          <Felt id="i-adr" titel="Adresse"><input id="i-adr" value={f.adresse} onChange={(e) => saet("adresse", e.target.value)} className={felt} /></Felt>
          <Felt id="i-post" titel="Postnr. og by"><input id="i-post" value={f.postnr_by} onChange={(e) => saet("postnr_by", e.target.value)} className={felt} /></Felt>
          <Felt id="i-mail" titel="E-mail"><input id="i-mail" type="email" value={f.email} onChange={(e) => saet("email", e.target.value)} className={felt} /></Felt>
          <Felt id="i-tlf" titel="Telefon"><input id="i-tlf" inputMode="tel" value={f.telefon} onChange={(e) => saet("telefon", e.target.value)} className={felt} /></Felt>
          <Felt id="i-reg" titel="Bank reg.nr."><input id="i-reg" inputMode="numeric" value={f.bank_reg} onChange={(e) => saet("bank_reg", e.target.value)} className={felt} /></Felt>
          <Felt id="i-konto" titel="Bank kontonr."><input id="i-konto" inputMode="numeric" value={f.bank_konto} onChange={(e) => saet("bank_konto", e.target.value)} className={felt} /></Felt>
          <Felt id="i-iban" titel="IBAN (valgfri)"><input id="i-iban" value={f.iban} onChange={(e) => saet("iban", e.target.value)} className={felt} /></Felt>
        </div>
      </div>
      <div className={kort}>
        <h3 className={overskrift}>Fakturaer</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Felt id="i-pre" titel="Fakturanummer-præfiks" hjaelp={`Næste fakturanummer: ${f.faktura_prefix}${String(naeste ?? 1).padStart(5, "0")}`}><input id="i-pre" value={f.faktura_prefix} onChange={(e) => saet("faktura_prefix", e.target.value)} className={felt} /></Felt>
          <Felt id="i-moms" titel="Moms (%)"><input id="i-moms" inputMode="decimal" value={f.moms_pct} onChange={(e) => saet("moms_pct", e.target.value)} className={felt} /></Felt>
          <Felt id="i-frist" titel="Standard betalingsfrist (dage)"><input id="i-frist" inputMode="numeric" value={f.betalingsfrist_dage} onChange={(e) => saet("betalingsfrist_dage", e.target.value.replace(/\D/g, ""))} className={felt} /></Felt>
        </div>
        <div className="mt-3"><Felt id="i-fod" titel="Fodtekst på fakturaen (valgfri)"><textarea id="i-fod" rows={3} value={f.faktura_fodtekst} onChange={(e) => saet("faktura_fodtekst", e.target.value)} className={felt + " min-h-[88px]"} /></Felt></div>
        <p className="text-[11px] text-muted mt-2">Fakturanumre tildeles fortløbende af databasen, når en faktura udstedes - de kan ikke redigeres.</p>
      </div>
      <button onClick={gem} disabled={busy} className={knapPrim}>{busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />} Gem indstillinger</button>
      <Meddelelse fejl={fejl} besked={besked} />
    </div>
  );
}
