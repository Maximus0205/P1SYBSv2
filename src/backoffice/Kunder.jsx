import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Check, Plus, ChevronLeft, Search, AlertCircle } from "lucide-react";
import {
  KONTO_STATUS, KONTO_STATUS_KORT, FAKTURA_STATUS, kr, krTilFelt, oreFraKr, taalFraTekst, datoTekst,
  hentKunder, gemKunde, hentAbonnementer, gemAbonnement, hentProdukter, hentPlaner, hentGraenser, gemGraense, hentFakturaer, hentUdenAbonnement,
} from "../lib/billing";
import { felt, kort, overskrift, knapPrim, knapSek, Chip, Meddelelse, Indlaeser, Felt } from "./ui";

// Kunder: én side pr. kunde (fakturamodtager) med dens abonnementer (ét pr. produkt/butik) og fakturaer.
// En kunde kan være en enkelt butik eller en kæde/organisation (overordnet kunde). Kæder og butikker kan begge være kunder.
const TOM_KUNDE = { id: null, navn: "", parent_id: "", firma_navn: "", cvr: "", adresse: "", postnr_by: "", att: "", faktura_email: "", ean: "", betalingsfrist_dage: "", noter: "" };
const kundeTilFelter = (k) => ({ ...TOM_KUNDE, ...Object.fromEntries(Object.entries(k || {}).map(([a, b]) => [a, b ?? ""])), betalingsfrist_dage: k?.betalingsfrist_dage ?? "" });

export function KunderSektion({ stores, onAabnFaktura, aabenKunde }) {
  const [kunder, setKunder] = useState(null);
  const [abos, setAbos] = useState([]);
  const [produkter, setProdukter] = useState([]);
  const [planer, setPlaner] = useState([]);
  const [udenAbo, setUdenAbo] = useState([]);
  const [fejl, setFejl] = useState("");
  const [sog, setSog] = useState("");
  const [valgt, setValgt] = useState(aabenKunde ? { id: aabenKunde } : null); // { id|null, forslag? }

  const hent = useCallback(async () => {
    const [k, a, p, pl, u] = await Promise.all([hentKunder(), hentAbonnementer(), hentProdukter(), hentPlaner(), hentUdenAbonnement()]);
    const f = [k, a, p, pl].find((x) => !x.ok);
    if (f) setFejl(f.fejl);
    setKunder(k.ok ? k.data || [] : []); setAbos(a.ok ? a.data || [] : []); setProdukter(p.ok ? p.data || [] : []); setPlaner(pl.ok ? pl.data || [] : []); setUdenAbo(u.ok ? u.data || [] : []);
  }, []);
  useEffect(() => { hent(); }, [hent]);

  const raekker = useMemo(() => {
    const q = sog.trim().toLowerCase();
    const alle = kunder || [];
    const passer = (k) => !q || `${k.navn} ${k.firma_navn || ""} ${k.cvr || ""}`.toLowerCase().includes(q);
    const boern = (id) => alle.filter((k) => k.parent_id === id);
    const ider = new Set(alle.map((k) => k.id));
    const toppe = alle.filter((k) => !k.parent_id || !ider.has(k.parent_id));
    const ud = [];
    for (const t of toppe) {
      const bs = boern(t.id);
      if (passer(t) || bs.some(passer)) { ud.push({ k: t, niveau: 0 }); for (const b of bs) if (passer(b) || passer(t)) ud.push({ k: b, niveau: 1 }); }
    }
    return ud;
  }, [kunder, sog]);

  if (valgt) {
    const kunde = valgt.id ? (kunder || []).find((k) => k.id === valgt.id) : null;
    return <KundeSide key={valgt.id || "ny"} kunde={kunde} forslag={valgt.forslag} kunder={kunder || []} abos={abos.filter((a) => a.customer_id === valgt.id)} produkter={produkter} planer={planer} stores={stores} onAabnFaktura={onAabnFaktura}
      onTilbage={() => { setValgt(null); hent(); }} onGemt={hent} onOprettet={(id) => { hent().then(() => setValgt((v) => ({ ...v, id }))); }} />;
  }
  const antalAbo = (id) => abos.filter((a) => a.customer_id === id && a.status === "aktiv").length;
  return (
    <div className="max-w-4xl">
      {udenAbo.length > 0 && (
        <div className="rounded-xl border border-bo bg-bo/5 p-4 mb-4" role="status">
          <p className="text-sm font-semibold text-ink flex items-center gap-1.5"><AlertCircle size={15} className="text-bo" aria-hidden="true" /> {udenAbo.length} P1SYBSv2-butik{udenAbo.length === 1 ? "" : "ker"} uden abonnement</p>
          <p className="text-xs text-muted mt-1">De bruger systemet, men bliver ikke faktureret. Opret en kunde for at komme i gang:</p>
          <div className="flex flex-wrap gap-2 mt-2">{udenAbo.map((s) => <button key={s.store_id} onClick={() => setValgt({ id: null, forslag: { navn: s.navn, storeId: s.store_id } })} className={knapSek + " !min-h-[44px] text-xs"}>{s.navn}</button>)}</div>
        </div>
      )}
      <div className="flex items-end gap-3 flex-wrap mb-4">
        <div className="flex-1 min-w-[12rem]">
          <label htmlFor="k-sog" className="block text-xs font-semibold text-muted mb-1">Søg kunde</label>
          <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" /><input id="k-sog" value={sog} onChange={(e) => setSog(e.target.value)} placeholder="Navn, firma eller CVR" className={felt + " pl-9"} /></div>
        </div>
        <button onClick={() => setValgt({ id: null })} className={knapPrim}><Plus size={15} aria-hidden="true" /> Ny kunde</button>
      </div>
      <Meddelelse fejl={fejl} />
      {kunder === null && <Indlaeser />}
      {kunder && kunder.length === 0 && !fejl && <p className="text-sm text-muted">Ingen kunder endnu. Opret den første med "Ny kunde".</p>}
      {kunder && kunder.length > 0 && raekker.length === 0 && <p className="text-sm text-muted">Ingen kunder matcher søgningen.</p>}
      <div className="space-y-2">
        {raekker.map(({ k, niveau }) => (
          <button key={k.id} onClick={() => setValgt({ id: k.id })} className={`w-full text-left rounded-xl border border-line bg-white p-4 shadow-sm hover:border-bo transition-colors ${niveau ? "ml-4 sm:ml-8 !w-[calc(100%-1rem)] sm:!w-[calc(100%-2rem)]" : ""}`}>
            <span className="flex items-start justify-between gap-3 flex-wrap">
              <span className="min-w-0"><span className="block text-sm font-semibold text-ink break-words">{k.navn}{(kunder || []).some((x) => x.parent_id === k.id) && <span className="ml-2 text-[11px] text-bo font-semibold">Kæde</span>}</span>
                <span className="block text-xs text-muted mt-0.5 break-words">{[k.firma_navn, k.cvr && `CVR ${k.cvr}`].filter(Boolean).join(" · ") || "Fakturaoplysninger mangler"}</span></span>
              <span className="text-xs text-muted">{antalAbo(k.id)} aktive abonnementer</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- Kundeside -----------------------------------------------------------------------------------------------------------------------
function KundeSide({ kunde, forslag, kunder, abos, produkter, planer, stores, onAabnFaktura, onTilbage, onGemt, onOprettet }) {
  const [f, setF] = useState(() => kunde ? kundeTilFelter(kunde) : { ...TOM_KUNDE, navn: forslag?.navn || "", firma_navn: forslag?.navn || "" });
  const [fejl, setFejl] = useState("");
  const [besked, setBesked] = useState("");
  const [busy, setBusy] = useState(false);
  const [aboValgt, setAboValgt] = useState(forslag ? "ny" : null); // abo-id | "ny" | null
  const [fakturaer, setFakturaer] = useState(null);

  useEffect(() => {
    if (!kunde) return;
    hentFakturaer().then((r) => setFakturaer(r.ok ? (r.data || []).filter((x) => x.customer_id === kunde.id) : []));
  }, [kunde]);

  const saet = (k, v) => { setF((p) => ({ ...p, [k]: v })); setBesked(""); };
  const gem = async () => {
    setFejl(""); setBesked("");
    if (!f.navn.trim()) return setFejl("Skriv et navn på kunden.");
    const frist = f.betalingsfrist_dage === "" ? null : Number(f.betalingsfrist_dage);
    if (frist !== null && (!Number.isInteger(frist) || frist < 0 || frist > 180)) return setFejl("Betalingsfrist skal være et helt antal dage (0-180) eller tom for standard.");
    if (f.parent_id && f.parent_id === f.id) return setFejl("En kunde kan ikke være sin egen kæde.");
    setBusy(true);
    const r = await gemKunde({ id: f.id, navn: f.navn.trim(), parent_id: f.parent_id || null, firma_navn: f.firma_navn.trim(), cvr: f.cvr.trim(), adresse: f.adresse.trim(), postnr_by: f.postnr_by.trim(), att: f.att.trim(), faktura_email: f.faktura_email.trim(), ean: f.ean.trim(), betalingsfrist_dage: frist, noter: f.noter });
    setBusy(false);
    if (!r.ok) return setFejl(r.fejl);
    setBesked("Kunden er gemt.");
    if (!kunde) onOprettet(r.data.id); else onGemt();
  };

  const mulige = kunder.filter((k) => k.id !== kunde?.id && !k.parent_id); // kun ét niveau: kæde -> butik
  const kanOpretteAbo = !!kunde;
  return (
    <div className="max-w-4xl">
      <button onClick={onTilbage} className="text-xs text-muted hover:text-ink flex items-center gap-1 mb-3 min-h-[44px]"><ChevronLeft size={14} aria-hidden="true" /> Alle kunder</button>
      <div className={kort}>
        <h3 className={overskrift}>{kunde ? kunde.navn : "Ny kunde"}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Felt id="k-navn" titel="Kundens navn (internt)"><input id="k-navn" value={f.navn} onChange={(e) => saet("navn", e.target.value)} className={felt} /></Felt>
          <Felt id="k-parent" titel="Hører til kæde/organisation" hjaelp="Vælg kun, hvis kunden er en del af en kæde, I har oprettet som kunde. Butikken betaler stadig selv."><select id="k-parent" value={f.parent_id} onChange={(e) => saet("parent_id", e.target.value)} className={felt}><option value="">Ingen</option>{mulige.map((k) => <option key={k.id} value={k.id}>{k.navn}</option>)}</select></Felt>
          <Felt id="k-firma" titel="Firmanavn på faktura"><input id="k-firma" value={f.firma_navn} onChange={(e) => saet("firma_navn", e.target.value)} className={felt} /></Felt>
          <Felt id="k-cvr" titel="CVR"><input id="k-cvr" inputMode="numeric" value={f.cvr} onChange={(e) => saet("cvr", e.target.value)} className={felt} /></Felt>
          <Felt id="k-adr" titel="Adresse"><input id="k-adr" value={f.adresse} onChange={(e) => saet("adresse", e.target.value)} className={felt} /></Felt>
          <Felt id="k-post" titel="Postnr. og by"><input id="k-post" value={f.postnr_by} onChange={(e) => saet("postnr_by", e.target.value)} className={felt} /></Felt>
          <Felt id="k-att" titel="Att."><input id="k-att" value={f.att} onChange={(e) => saet("att", e.target.value)} className={felt} /></Felt>
          <Felt id="k-mail" titel="Faktura-e-mail"><input id="k-mail" type="email" value={f.faktura_email} onChange={(e) => saet("faktura_email", e.target.value)} className={felt} /></Felt>
          <Felt id="k-ean" titel="EAN (valgfri)"><input id="k-ean" inputMode="numeric" value={f.ean} onChange={(e) => saet("ean", e.target.value)} className={felt} /></Felt>
          <Felt id="k-frist" titel="Betalingsfrist (dage)" hjaelp="Tom = standard fra Indstillinger."><input id="k-frist" inputMode="numeric" value={f.betalingsfrist_dage} onChange={(e) => saet("betalingsfrist_dage", e.target.value.replace(/\D/g, ""))} className={felt} /></Felt>
        </div>
        <div className="mt-3"><Felt id="k-noter" titel="Interne noter"><textarea id="k-noter" rows={2} value={f.noter} onChange={(e) => saet("noter", e.target.value)} className={felt + " min-h-[66px]"} /></Felt></div>
        <button onClick={gem} disabled={busy} className={knapPrim + " mt-4"}>{busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />} Gem kunde</button>
        <Meddelelse fejl={fejl} besked={besked} />
      </div>

      {kanOpretteAbo ? (
        <div className="mb-4">
          <div className="flex items-center justify-between gap-3 mb-2"><h3 className="text-sm font-semibold text-ink">Abonnementer</h3>{!aboValgt && <button onClick={() => setAboValgt("ny")} className={knapSek}><Plus size={15} aria-hidden="true" /> Nyt abonnement</button>}</div>
          {aboValgt ? (
            <AboEditor key={aboValgt} abo={aboValgt === "ny" ? null : abos.find((a) => a.id === aboValgt)} kundeId={kunde.id} produkter={produkter} planer={planer} stores={stores} forvalgtButik={forslag?.storeId}
              onTilbage={() => setAboValgt(null)} onGemt={onGemt} />
          ) : (
            <>
              {abos.length === 0 && <p className="text-sm text-muted">Ingen abonnementer endnu.</p>}
              <div className="space-y-2">
                {abos.map((a) => {
                  const p = produkter.find((x) => x.id === a.product_id); const pl = planer.find((x) => x.id === a.plan_id);
                  return (
                    <button key={a.id} onClick={() => setAboValgt(a.id)} className="w-full text-left rounded-xl border border-line bg-white p-4 shadow-sm hover:border-bo transition-colors">
                      <span className="flex items-start justify-between gap-3 flex-wrap">
                        <span className="min-w-0"><span className="block text-sm font-semibold text-ink break-words">{p?.navn || "Produkt"} · {aboTenantNavn(a, stores)}</span><span className="block text-xs text-muted mt-0.5">{pl ? pl.navn : <span className="text-danger">Ingen prisplan</span>} {a.spaerret && <span className="text-danger font-semibold">· Spærret</span>}</span></span>
                        <Chip id={a.status} tekst={KONTO_STATUS_KORT[a.status] || a.status} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : <p className="text-xs text-muted mb-4">Gem kunden først - derefter kan du oprette abonnementer.</p>}

      {kunde && (
        <div className={kort}>
          <h3 className={overskrift}>Fakturaer</h3>
          {fakturaer === null && <Indlaeser />}
          {fakturaer && fakturaer.length === 0 && <p className="text-sm text-muted">Ingen fakturaer endnu.</p>}
          <div className="divide-y divide-divider">
            {(fakturaer || []).map((x) => (
              <button key={x.id} onClick={() => onAabnFaktura?.(x.id)} className="w-full text-left py-2.5 min-h-[44px] flex items-center justify-between gap-3 hover:text-bo">
                <span className="text-sm">{x.fakturanr || "Kladde"} <span className="text-xs text-muted">· {datoTekst(x.periode_fra)} – {datoTekst(x.periode_til)}</span> <Chip id={x.status} tekst={FAKTURA_STATUS[x.status]} /></span>
                <span className="text-sm font-semibold">{kr(x.total_ore)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function aboTenantNavn(a, stores) {
  const s = (stores || []).find((x) => x.id === a.tenant_ref);
  return s?.navn || a.tenant_navn || a.tenant_ref || "uden tilknytning";
}

// ---- Abonnement ----------------------------------------------------------------------------------------------------------------------
function AboEditor({ abo, kundeId, produkter, planer, stores, forvalgtButik, onTilbage, onGemt }) {
  const [f, setF] = useState(() => ({
    product_id: abo?.product_id || produkter.find((p) => p.aktiv)?.id || "",
    tenant_ref: abo?.tenant_ref || forvalgtButik || "", tenant_navn: abo?.tenant_navn || "",
    plan_id: abo?.plan_id || "", status: abo?.status || "proeve", start_dato: abo?.start_dato || "",
    pris_override: krTilFelt(abo?.pris_override_ore), rabat_pct: String(abo?.rabat_pct ?? 0).replace(".", ","),
    spaerret: !!abo?.spaerret, spaerret_aarsag: abo?.spaerret_aarsag || "", noter: abo?.noter || "",
    koebt: Object.fromEntries(Object.entries(abo?.koebt || {}).map(([k, v]) => [k, String(v)])),
  }));
  const [graenser, setGraenser] = useState({}); // metric -> { advarsel, spaerr }
  const [fejl, setFejl] = useState("");
  const [besked, setBesked] = useState("");
  const [busy, setBusy] = useState(false);

  const produkt = produkter.find((p) => p.id === f.product_id);
  const erP1 = produkt?.kode === "p1sybsv2";
  const produktPlaner = planer.filter((p) => p.product_id === f.product_id && (p.aktiv || p.id === abo?.plan_id));
  const plan = planer.find((p) => p.id === f.plan_id);
  const koebteMetrics = (produkt?.maalepunkter || []).filter((m) => m.art === "koebt");
  const spaerbare = (produkt?.maalepunkter || []).filter((m) => m.spaerbar);

  useEffect(() => {
    if (!abo) return;
    hentGraenser(abo.id).then((r) => { if (r.ok) setGraenser(Object.fromEntries((r.data || []).map((g) => [g.metric, { advarsel: g.advarsel_ved ?? "", spaerr: g.spaerr_ved ?? "" }]))); });
  }, [abo]);

  const saet = (k, v) => { setF((p) => ({ ...p, [k]: v })); setBesked(""); };
  const tal = (t) => (t === "" || t === undefined ? null : Number(t));

  const gem = async () => {
    setFejl(""); setBesked("");
    if (!f.product_id) return setFejl("Vælg et produkt.");
    if (erP1 && !f.tenant_ref) return setFejl("Vælg, hvilken butik abonnementet gælder.");
    if (f.status === "aktiv" && !f.plan_id) return setFejl("Et aktivt abonnement skal have en prisplan.");
    if (f.status === "aktiv" && !f.start_dato) return setFejl("Et aktivt abonnement skal have en startdato.");
    const ov = f.pris_override === "" ? null : oreFraKr(f.pris_override);
    if (f.pris_override !== "" && ov === null) return setFejl("Aftalt månedspris skal være et beløb i kr. (eller tom).");
    const rabat = taalFraTekst(f.rabat_pct === "" ? "0" : f.rabat_pct);
    if (rabat === null || rabat > 100) return setFejl("Rabat skal være et tal mellem 0 og 100.");
    const koebt = {};
    for (const m of koebteMetrics) {
      const v = f.koebt[m.kode];
      if (v === undefined || v === "") continue;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0) return setFejl(`${m.navn}: antal købte enheder skal være et helt tal (0 eller mere).`);
      if (n > 0) koebt[m.kode] = n;
    }
    const gr = [];
    for (const m of spaerbare) {
      const g = graenser[m.kode] || {};
      const a = tal(g.advarsel); const s = tal(g.spaerr);
      for (const v of [a, s]) if (v !== null && (!Number.isInteger(v) || v < 0)) return setFejl(`Grænser for ${m.navn} skal være hele tal (eller tomme).`);
      if (a !== null && s !== null && a > s) return setFejl(`${m.navn}: advarslen skal ligge under spærringen.`);
      gr.push({ metric: m.kode, a, s });
    }
    if (f.spaerret && !window.confirm("Spærre abonnementet? Kunden mister adgang til forbrugsfunktioner, der kan spærres.")) return;
    setBusy(true);
    const r = await gemAbonnement({
      id: abo?.id, customer_id: kundeId, product_id: f.product_id, tenant_ref: f.tenant_ref || null, tenant_navn: erP1 ? (stores.find((s) => s.id === f.tenant_ref)?.navn || null) : (f.tenant_navn.trim() || null),
      plan_id: f.plan_id || null, status: f.status, start_dato: f.start_dato || null, pris_override_ore: ov, rabat_pct: rabat,
      spaerret: f.spaerret, spaerret_aarsag: f.spaerret ? f.spaerret_aarsag : null, koebt, noter: f.noter,
    });
    if (!r.ok) { setBusy(false); return setFejl(r.fejl); }
    const id = r.data.id;
    for (const g of gr) {
      const u = await gemGraense(id, g.metric, g.a, g.s);
      if (!u.ok) { setBusy(false); return setFejl(`Abonnementet er gemt, men grænsen for ${g.metric} fejlede: ${u.fejl}`); }
    }
    setBusy(false);
    setBesked("Abonnementet er gemt.");
    onGemt();
    if (!abo) onTilbage();
  };

  return (
    <div className={kort}>
      <h3 className={overskrift}>{abo ? "Redigér abonnement" : "Nyt abonnement"}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Felt id="a-prod" titel="Produkt"><select id="a-prod" value={f.product_id} disabled={!!abo} onChange={(e) => setF((p) => ({ ...p, product_id: e.target.value, plan_id: "", koebt: {}, tenant_ref: "" }))} className={felt}>{produkter.map((p) => <option key={p.id} value={p.id}>{p.navn}</option>)}</select></Felt>
        {erP1
          ? <Felt id="a-butik" titel="Butik i systemet"><select id="a-butik" value={f.tenant_ref} disabled={!!abo} onChange={(e) => saet("tenant_ref", e.target.value)} className={felt}><option value="">Vælg butik...</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.navn}</option>)}</select></Felt>
          : <Felt id="a-ref" titel="Reference i produktet" hjaelp="Id eller navn, som produktet bruger, når det indrapporterer forbrug."><input id="a-ref" value={f.tenant_ref} onChange={(e) => saet("tenant_ref", e.target.value)} className={felt} /></Felt>}
        {!erP1 && <Felt id="a-tnavn" titel="Visningsnavn"><input id="a-tnavn" value={f.tenant_navn} onChange={(e) => saet("tenant_navn", e.target.value)} className={felt} /></Felt>}
        <Felt id="a-plan" titel="Prisplan"><select id="a-plan" value={f.plan_id} onChange={(e) => saet("plan_id", e.target.value)} className={felt}><option value="">Ingen plan</option>{produktPlaner.map((p) => <option key={p.id} value={p.id}>{p.navn} ({kr(p.maanedspris_ore)} pr. md.)</option>)}</select></Felt>
        <Felt id="a-status" titel="Status" hjaelp="Kun aktive abonnementer faktureres."><select id="a-status" value={f.status} onChange={(e) => saet("status", e.target.value)} className={felt}>{Object.entries(KONTO_STATUS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Felt>
        <Felt id="a-start" titel="Startdato" hjaelp="Fakturering og forholdsmæssig beregning starter her."><input id="a-start" type="date" value={f.start_dato} onChange={(e) => saet("start_dato", e.target.value)} className={felt} /></Felt>
        <Felt id="a-ov" titel="Aftalt månedspris (kr.)" hjaelp="Tom = planens pris."><input id="a-ov" inputMode="decimal" value={f.pris_override} onChange={(e) => saet("pris_override", e.target.value)} className={felt} /></Felt>
        <Felt id="a-rabat" titel="Rabat (%)" hjaelp="Gælder abonnement og købte enheder, ikke forbrug."><input id="a-rabat" inputMode="decimal" value={f.rabat_pct} onChange={(e) => saet("rabat_pct", e.target.value)} className={felt} /></Felt>
      </div>

      {koebteMetrics.length > 0 && (
        <>
          <h4 className="text-xs font-semibold text-muted mt-4 mb-2">Købte enheder</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {koebteMetrics.map((m) => {
              const pp = plan?.priser?.find((x) => x.metric === m.kode);
              const antal = Number(f.koebt[m.kode]) || 0;
              const stor = Number(pp?.enhed_stoerrelse) || 1;
              const total = pp ? (Number(pp.inkluderet) || 0) + antal * stor : null;
              return (
                <Felt key={m.kode} id={`a-k-${m.kode}`} titel={`${m.navn}: antal ekstra købt`} hjaelp={!plan ? "Vælg en plan for at se, hvad kunden har til rådighed." : !pp ? "Planen indeholder ikke dette målepunkt." : `Til rådighed: ${Number(pp.inkluderet) || 0} inkluderet + ${antal} × ${stor} = ${total} ${m.enhed}`}>
                  <input id={`a-k-${m.kode}`} inputMode="numeric" value={f.koebt[m.kode] ?? ""} onChange={(e) => setF((p) => ({ ...p, koebt: { ...p.koebt, [m.kode]: e.target.value.replace(/\D/g, "") } }))} className={felt} />
                </Felt>
              );
            })}
          </div>
          <p className="text-[11px] text-muted mt-1">Ændringer midt i en måned afregnes forholdsmæssigt pr. dag.</p>
        </>
      )}

      {spaerbare.length > 0 && (
        <>
          <h4 className="text-xs font-semibold text-muted mt-4 mb-2">Grænser pr. måned (valgfri)</h4>
          {!abo && <p className="text-[11px] text-muted mb-2">Grænserne gemmes sammen med abonnementet.</p>}
          <div className="space-y-2">
            {spaerbare.map((m) => (
              <div key={m.kode} className="grid gap-3 sm:grid-cols-3 items-end">
                <p className="text-sm font-semibold text-ink pb-3">{m.navn}</p>
                <Felt id={`g-a-${m.kode}`} titel="Advarsel ved"><input id={`g-a-${m.kode}`} inputMode="numeric" value={graenser[m.kode]?.advarsel ?? ""} onChange={(e) => setGraenser((p) => ({ ...p, [m.kode]: { ...p[m.kode], advarsel: e.target.value.replace(/\D/g, "") } }))} className={felt} /></Felt>
                <Felt id={`g-s-${m.kode}`} titel="Spærres ved"><input id={`g-s-${m.kode}`} inputMode="numeric" value={graenser[m.kode]?.spaerr ?? ""} onChange={(e) => setGraenser((p) => ({ ...p, [m.kode]: { ...p[m.kode], spaerr: e.target.value.replace(/\D/g, "") } }))} className={felt} /></Felt>
              </div>
            ))}
          </div>
        </>
      )}

      <label className="mt-4 flex items-center gap-2 text-sm min-h-[44px]"><input type="checkbox" checked={f.spaerret} onChange={(e) => saet("spaerret", e.target.checked)} className="h-5 w-5" /> Spærret manuelt</label>
      {f.spaerret && <Felt id="a-aarsag" titel="Årsag til spærring"><input id="a-aarsag" value={f.spaerret_aarsag} onChange={(e) => saet("spaerret_aarsag", e.target.value)} className={felt} /></Felt>}
      <div className="mt-3"><Felt id="a-noter" titel="Noter"><textarea id="a-noter" rows={2} value={f.noter} onChange={(e) => saet("noter", e.target.value)} className={felt + " min-h-[66px]"} /></Felt></div>

      <div className="flex gap-2 flex-wrap mt-4">
        <button onClick={gem} disabled={busy} className={knapPrim}>{busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />} Gem abonnement</button>
        <button onClick={onTilbage} className={knapSek}>Luk</button>
      </div>
      <Meddelelse fejl={fejl} besked={besked} />
    </div>
  );
}
