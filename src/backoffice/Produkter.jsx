import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Check, Plus, ChevronLeft, Package } from "lucide-react";
import {
  MAALEPUNKT_ART, kr, krEnhed, oreFraKr, enhedsOreFraKr, krTilFelt, taalFraTekst,
  hentProdukter, gemProdukt, gemMaalepunkt, hentPlaner, gemPlan,
} from "../lib/billing";
import { felt, kort, overskrift, knapPrim, knapSek, Chip, Meddelelse, Indlaeser, Felt } from "./ui";

// Produkter & priser: hvert produkt (P1SYBSv2 og kommende SaaS-løsninger) har sine egne målepunkter og prisplaner.
// Et målepunkt er enten forbrug (afregnes pr. brugt enhed), købt (fast pris pr. enhed pr. måned - biler, lager, tilkøb) eller kun måling (vises, men koster ikke noget).
const talTekst = (n) => (n === null || n === undefined || n === "" ? "" : String(Number(n)).replace(".", ","));
const kodeOk = (k) => /^[a-z][a-z0-9_]{1,30}$/.test(k);

export function ProdukterSektion() {
  const [produkter, setProdukter] = useState(null);
  const [valgtId, setValgtId] = useState(null);
  const [fejl, setFejl] = useState("");
  const [nyt, setNyt] = useState(false);

  const hent = useCallback(async () => {
    const r = await hentProdukter();
    if (!r.ok) { setFejl(r.fejl); setProdukter([]); return; }
    setProdukter(r.data || []);
  }, []);
  useEffect(() => { hent(); }, [hent]);

  const valgt = (produkter || []).find((p) => p.id === valgtId);
  if (valgt) return <ProduktSide key={valgt.id} produkt={valgt} onTilbage={() => setValgtId(null)} onGemt={hent} />;
  return (
    <div className="max-w-3xl">
      <p className="text-xs text-muted mb-4">Her sættes hver løsning op med sine egne målepunkter (hvad der måles og afregnes) og prisplaner. Nye løsninger oprettes her - de behøver ikke ændringer i selve backoffice.</p>
      <Meddelelse fejl={fejl} />
      {produkter === null && <Indlaeser />}
      <div className="space-y-2">
        {(produkter || []).map((p) => (
          <button key={p.id} onClick={() => setValgtId(p.id)} className="w-full text-left rounded-xl border border-line bg-white p-4 shadow-sm hover:border-bo transition-colors">
            <span className="flex items-start justify-between gap-3 flex-wrap">
              <span className="min-w-0"><span className="block text-sm font-semibold text-ink">{p.navn} {!p.aktiv && <Chip id="pause" tekst="Inaktiv" />}</span><span className="block text-xs text-muted mt-0.5 break-words">{p.beskrivelse || "Ingen beskrivelse"}</span></span>
              <span className="text-xs text-muted">{p.maalepunkter.length} målepunkter</span>
            </span>
          </button>
        ))}
      </div>
      {produkter && produkter.length === 0 && !fejl && <p className="text-sm text-muted">Ingen produkter endnu.</p>}
      <div className="mt-4">
        {nyt ? <NytProdukt onAnnuller={() => setNyt(false)} onOprettet={(id) => { setNyt(false); hent().then(() => setValgtId(id)); }} /> : <button onClick={() => setNyt(true)} className={knapSek}><Plus size={15} aria-hidden="true" /> Nyt produkt</button>}
      </div>
    </div>
  );
}

function NytProdukt({ onAnnuller, onOprettet }) {
  const [navn, setNavn] = useState("");
  const [kode, setKode] = useState("");
  const [fejl, setFejl] = useState("");
  const [busy, setBusy] = useState(false);
  const opret = async () => {
    setFejl("");
    if (!navn.trim()) return setFejl("Skriv et navn.");
    if (!kodeOk(kode)) return setFejl("Koden skal være 2-31 tegn: små bogstaver, tal eller _ (starter med bogstav). Den kan ikke ændres senere.");
    setBusy(true);
    const r = await gemProdukt({ navn: navn.trim(), kode });
    setBusy(false);
    if (!r.ok) return setFejl(r.fejl);
    onOprettet(r.data.id);
  };
  return (
    <div className={kort}>
      <h3 className={overskrift}>Nyt produkt</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Felt id="np-navn" titel="Navn"><input id="np-navn" value={navn} onChange={(e) => setNavn(e.target.value)} className={felt} /></Felt>
        <Felt id="np-kode" titel="Kode" hjaelp="Bruges af systemer, der indrapporterer forbrug. Kan ikke ændres."><input id="np-kode" value={kode} onChange={(e) => setKode(e.target.value.toLowerCase())} className={felt} /></Felt>
      </div>
      <div className="flex gap-2 mt-4"><button onClick={opret} disabled={busy} className={knapPrim}>{busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />} Opret</button><button onClick={onAnnuller} className={knapSek}>Annullér</button></div>
      <Meddelelse fejl={fejl} />
    </div>
  );
}

function ProduktSide({ produkt, onTilbage, onGemt }) {
  const [fane, setFane] = useState("maalepunkter");
  const [navn, setNavn] = useState(produkt.navn);
  const [beskr, setBeskr] = useState(produkt.beskrivelse || "");
  const [aktiv, setAktiv] = useState(produkt.aktiv);
  const [fejl, setFejl] = useState("");
  const [besked, setBesked] = useState("");
  const gem = async () => {
    setFejl(""); setBesked("");
    if (!navn.trim()) return setFejl("Skriv et navn.");
    const r = await gemProdukt({ id: produkt.id, navn: navn.trim(), beskrivelse: beskr, aktiv });
    if (!r.ok) return setFejl(r.fejl);
    setBesked("Produktet er gemt."); onGemt();
  };
  return (
    <div className="max-w-4xl">
      <button onClick={onTilbage} className="text-xs text-muted hover:text-ink flex items-center gap-1 mb-3 min-h-[44px]"><ChevronLeft size={14} aria-hidden="true" /> Alle produkter</button>
      <div className={kort}>
        <h3 className={overskrift}><Package size={14} className="inline mr-1.5 -mt-0.5" aria-hidden="true" />{produkt.navn} <span className="text-muted font-normal">· kode {produkt.kode}</span></h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Felt id="pr-navn" titel="Navn"><input id="pr-navn" value={navn} onChange={(e) => setNavn(e.target.value)} className={felt} /></Felt>
          <Felt id="pr-beskr" titel="Beskrivelse"><input id="pr-beskr" value={beskr} onChange={(e) => setBeskr(e.target.value)} className={felt} /></Felt>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm min-h-[44px]"><input type="checkbox" checked={aktiv} onChange={(e) => setAktiv(e.target.checked)} className="h-5 w-5" /> Aktivt (kan få nye abonnementer)</label>
        <button onClick={gem} className={knapSek + " mt-2"}><Check size={15} aria-hidden="true" /> Gem produkt</button>
        <Meddelelse fejl={fejl} besked={besked} />
      </div>
      <div className="flex gap-2 mb-4" role="tablist" aria-label="Produktindstillinger">
        {[["maalepunkter", "Målepunkter og indkøbspriser"], ["planer", "Prisplaner"]].map(([id, t]) => (
          <button key={id} role="tab" aria-selected={fane === id} onClick={() => setFane(id)} className={`min-h-[44px] px-4 rounded-lg text-sm font-semibold border transition-colors ${fane === id ? "bg-bo text-white border-bo" : "border-line bg-white text-ink hover:border-bo"}`}>{t}</button>
        ))}
      </div>
      {fane === "maalepunkter" ? <Maalepunkter produkt={produkt} onGemt={onGemt} /> : <Planer produkt={produkt} />}
    </div>
  );
}

// ---- Målepunkter ---------------------------------------------------------------------------------------------------------------------
const tomtMaal = { kode: "", navn: "", enhed: "stk.", art: "forbrug", indkoeb: "", paaslag: "", spaerbar: false, ny: true };
const maalTilFelter = (m) => ({ kode: m.kode, navn: m.navn, enhed: m.enhed, art: m.art, indkoeb: krTilFelt(m.indkoeb_ore), paaslag: krTilFelt(m.paaslag_ore), spaerbar: !!m.spaerbar, raekkefoelge: m.raekkefoelge, ny: false });

function Maalepunkter({ produkt, onGemt }) {
  const [rk, setRk] = useState(() => produkt.maalepunkter.map(maalTilFelter));
  const [busy, setBusy] = useState(false);
  const [fejl, setFejl] = useState("");
  const [besked, setBesked] = useState("");
  const saet = (i, k, v) => { setRk((p) => p.map((x, j) => (j === i ? { ...x, [k]: v } : x))); setBesked(""); };

  const gem = async () => {
    setFejl(""); setBesked("");
    const ud = [];
    for (const m of rk) {
      if (!m.navn.trim()) return setFejl("Alle målepunkter skal have et navn.");
      if (!kodeOk(m.kode)) return setFejl(`Koden "${m.kode}" er ugyldig: 2-31 tegn, små bogstaver, tal eller _ (starter med bogstav).`);
      const ind = m.art === "info" ? 0 : enhedsOreFraKr(m.indkoeb === "" ? "0" : m.indkoeb);
      const paa = m.art === "info" ? 0 : enhedsOreFraKr(m.paaslag === "" ? "0" : m.paaslag);
      if (ind === null || paa === null) return setFejl(`Priserne for "${m.navn}" skal være beløb i kr. (0 eller mere).`);
      ud.push({ kode: m.kode, navn: m.navn.trim(), enhed: m.enhed.trim() || "stk.", art: m.art, indkoeb_ore: ind, paaslag_ore: paa, spaerbar: m.spaerbar, raekkefoelge: m.ny ? rk.indexOf(m) + 1 : m.raekkefoelge });
    }
    if (new Set(ud.map((x) => x.kode)).size !== ud.length) return setFejl("To målepunkter har samme kode.");
    setBusy(true);
    for (const m of ud) {
      const r = await gemMaalepunkt(produkt.id, m);
      if (!r.ok) { setBusy(false); return setFejl(`${m.navn}: ${r.fejl}`); }
    }
    setBusy(false);
    setBesked("Målepunkterne er gemt. Nye priser gælder kommende fakturaer.");
    setRk((p) => p.map((x) => ({ ...x, ny: false })));
    onGemt();
  };

  return (
    <div>
      <p className="text-xs text-muted mb-3">Indkøbspris er det, det koster jer. Påslaget er jeres margin. Kunden betaler indkøb + påslag (medmindre planen sætter en egen pris), og kun indkøbsprisen tæller som udgift i dashboardet.</p>
      <div className="space-y-3">
        {rk.map((m, i) => (
          <div key={i} className={kort + " !mb-0"}>
            <div className="grid gap-3 sm:grid-cols-4">
              <Felt id={`mp-navn-${i}`} titel="Navn"><input id={`mp-navn-${i}`} value={m.navn} onChange={(e) => saet(i, "navn", e.target.value)} className={felt} /></Felt>
              <Felt id={`mp-kode-${i}`} titel="Kode" hjaelp={m.ny ? "Kan ikke ændres bagefter." : undefined}><input id={`mp-kode-${i}`} value={m.kode} disabled={!m.ny} onChange={(e) => saet(i, "kode", e.target.value.toLowerCase())} className={felt + (m.ny ? "" : " opacity-60")} /></Felt>
              <Felt id={`mp-enhed-${i}`} titel="Enhed"><input id={`mp-enhed-${i}`} value={m.enhed} onChange={(e) => saet(i, "enhed", e.target.value)} className={felt} /></Felt>
              <Felt id={`mp-art-${i}`} titel="Type"><select id={`mp-art-${i}`} value={m.art} onChange={(e) => saet(i, "art", e.target.value)} className={felt}>{Object.entries(MAALEPUNKT_ART).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Felt>
            </div>
            {m.art !== "info" && (
              <div className="grid gap-3 sm:grid-cols-3 mt-3">
                <Felt id={`mp-ind-${i}`} titel={`Indkøb pr. ${m.enhed || "enhed"}${m.art === "koebt" ? " pr. md." : ""} (kr.)`}><input id={`mp-ind-${i}`} inputMode="decimal" value={m.indkoeb} onChange={(e) => saet(i, "indkoeb", e.target.value)} className={felt} /></Felt>
                <Felt id={`mp-paa-${i}`} titel="Jeres påslag (kr.)"><input id={`mp-paa-${i}`} inputMode="decimal" value={m.paaslag} onChange={(e) => saet(i, "paaslag", e.target.value)} className={felt} /></Felt>
                <div className="text-xs text-muted self-end pb-3">Kunden betaler som standard: <strong className="text-ink">{krEnhed((enhedsOreFraKr(m.indkoeb || "0") || 0) + (enhedsOreFraKr(m.paaslag || "0") || 0))}</strong></div>
              </div>
            )}
            {m.art === "forbrug" && <label className="mt-2 flex items-center gap-2 text-sm min-h-[44px]"><input type="checkbox" checked={m.spaerbar} onChange={(e) => saet(i, "spaerbar", e.target.checked)} className="h-5 w-5" /> Kan spærres ved grænse (fx stop for SMS, når grænsen nås)</label>}
          </div>
        ))}
      </div>
      <div className="flex gap-2 flex-wrap mt-4">
        <button onClick={() => setRk((p) => [...p, { ...tomtMaal }])} className={knapSek}><Plus size={15} aria-hidden="true" /> Tilføj målepunkt</button>
        <button onClick={gem} disabled={busy} className={knapPrim}>{busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />} Gem målepunkter</button>
      </div>
      <Meddelelse fejl={fejl} besked={besked} />
    </div>
  );
}

// ---- Prisplaner ----------------------------------------------------------------------------------------------------------------------
function planFelter(p, metrics) {
  const priser = {};
  for (const m of metrics) {
    const x = (p?.priser || []).find((q) => q.metric === m.kode);
    priser[m.kode] = { med: !!x, inkluderet: x ? talTekst(x.inkluderet) : "", pris: x ? krTilFelt(x.enhedspris_ore) : "", stoerrelse: x ? talTekst(x.enhed_stoerrelse) : "1" };
  }
  return { id: p?.id || null, navn: p?.navn || "", beskrivelse: p?.beskrivelse || "", maanedspris: krTilFelt(p?.maanedspris_ore ?? 0), aktiv: p ? p.aktiv : true, priser };
}

function Planer({ produkt }) {
  const metrics = produkt.maalepunkter.filter((m) => m.art !== "info");
  const [planer, setPlaner] = useState(null);
  const [valgt, setValgt] = useState(null);
  const [fejl, setFejl] = useState("");
  const [besked, setBesked] = useState("");
  const [busy, setBusy] = useState(false);

  const hent = useCallback(async () => {
    const r = await hentPlaner();
    if (!r.ok) { setFejl(r.fejl); setPlaner([]); return; }
    setPlaner((r.data || []).filter((p) => p.product_id === produkt.id));
  }, [produkt.id]);
  useEffect(() => { hent(); }, [hent]);
  const saet = (k, v) => { setValgt((p) => ({ ...p, [k]: v })); setBesked(""); };
  const saetPris = (m, k, v) => { setValgt((p) => ({ ...p, priser: { ...p.priser, [m]: { ...p.priser[m], [k]: v } } })); setBesked(""); };

  const gem = async () => {
    setFejl(""); setBesked("");
    if (!valgt.navn.trim()) return setFejl("Skriv et navn til planen.");
    const md = oreFraKr(valgt.maanedspris === "" ? "0" : valgt.maanedspris);
    if (md === null) return setFejl("Månedsprisen skal være et beløb i kr.");
    const priser = [];
    for (const m of metrics) {
      const x = valgt.priser[m.kode];
      if (!x.med) continue;
      const ink = x.inkluderet === "" ? 0 : taalFraTekst(x.inkluderet);
      const stor = m.art === "koebt" ? taalFraTekst(x.stoerrelse === "" ? "1" : x.stoerrelse) : 1;
      const pris = x.pris === "" ? null : enhedsOreFraKr(x.pris);
      if (ink === null) return setFejl(`Inkluderet antal for ${m.navn} skal være et tal.`);
      if (stor === null || stor <= 0) return setFejl(`Størrelse pr. enhed for ${m.navn} skal være et tal over 0.`);
      if (x.pris !== "" && pris === null) return setFejl(`Prisen for ${m.navn} skal være et beløb i kr. (eller tom for standardpris).`);
      priser.push({ metric: m.kode, inkluderet: ink, enhedspris_ore: pris, enhed_stoerrelse: stor });
    }
    setBusy(true);
    const r = await gemPlan({ id: valgt.id, product_id: produkt.id, navn: valgt.navn.trim(), beskrivelse: valgt.beskrivelse, maanedspris_ore: md, aktiv: valgt.aktiv }, priser, metrics.map((m) => m.kode));
    setBusy(false);
    if (!r.ok) return setFejl(r.fejl);
    setBesked("Planen er gemt. Ændringer gælder kommende fakturaer - allerede udstedte fakturaer ændres ikke.");
    setValgt((p) => ({ ...p, id: r.id }));
    hent();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr] items-start">
      <div>
        {planer === null && <Indlaeser />}
        <div className="space-y-2">
          {(planer || []).map((p) => (
            <button key={p.id} onClick={() => { setValgt(planFelter(p, metrics)); setFejl(""); setBesked(""); }} className={`w-full text-left rounded-xl border bg-white p-3 shadow-sm hover:border-bo transition-colors ${valgt?.id === p.id ? "border-bo" : "border-line"}`}>
              <span className="block text-sm font-semibold text-ink">{p.navn} {!p.aktiv && <Chip id="pause" tekst="Inaktiv" />}</span>
              <span className="block text-xs text-muted">{kr(p.maanedspris_ore)} pr. md.</span>
            </button>
          ))}
        </div>
        {planer && planer.length === 0 && <p className="text-sm text-muted">Ingen planer endnu.</p>}
        <button onClick={() => { setValgt(planFelter(null, metrics)); setFejl(""); setBesked(""); }} className={knapSek + " mt-3"}><Plus size={15} aria-hidden="true" /> Ny plan</button>
      </div>
      {valgt ? (
        <div className={kort + " !mb-0"}>
          <h3 className={overskrift}>{valgt.id ? "Redigér plan" : "Ny plan"}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Felt id="pl-navn" titel="Navn"><input id="pl-navn" value={valgt.navn} onChange={(e) => saet("navn", e.target.value)} className={felt} /></Felt>
            <Felt id="pl-md" titel="Fast månedspris (kr.)" hjaelp="Grundpris pr. måned, før købte enheder og forbrug."><input id="pl-md" inputMode="decimal" value={valgt.maanedspris} onChange={(e) => saet("maanedspris", e.target.value)} className={felt} /></Felt>
          </div>
          <div className="mt-3"><Felt id="pl-beskr" titel="Beskrivelse"><input id="pl-beskr" value={valgt.beskrivelse} onChange={(e) => saet("beskrivelse", e.target.value)} className={felt} /></Felt></div>
          <label className="mt-2 flex items-center gap-2 text-sm min-h-[44px]"><input type="checkbox" checked={valgt.aktiv} onChange={(e) => saet("aktiv", e.target.checked)} className="h-5 w-5" /> Aktiv (kan vælges på nye abonnementer)</label>

          <h4 className="text-xs font-semibold text-muted mt-3 mb-2">Målepunkter i planen</h4>
          {metrics.length === 0 && <p className="text-xs text-muted">Produktet har ingen målepunkter med pris. Tilføj dem under fanen Målepunkter.</p>}
          <div className="space-y-3">
            {metrics.map((m) => {
              const x = valgt.priser[m.kode];
              return (
                <div key={m.kode} className="rounded-lg bg-panel p-3">
                  <label className="flex items-center gap-2 text-sm font-semibold min-h-[44px]"><input type="checkbox" checked={x.med} onChange={(e) => saetPris(m.kode, "med", e.target.checked)} className="h-5 w-5" /> {m.navn} <span className="text-xs text-muted font-normal">({m.art === "koebt" ? "købes pr. md." : "forbrug"}, {m.enhed})</span></label>
                  {x.med && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Felt id={`pp-ink-${m.kode}`} titel={`Inkluderet (${m.enhed})`} hjaelp={m.art === "koebt" ? "Følger med planen uden ekstra pris." : "Gratis forbrug pr. måned."}><input id={`pp-ink-${m.kode}`} inputMode="decimal" value={x.inkluderet} onChange={(e) => saetPris(m.kode, "inkluderet", e.target.value)} className={felt} /></Felt>
                      <Felt id={`pp-pris-${m.kode}`} titel={`Pris pr. ${m.art === "koebt" ? "købt enhed pr. md." : m.enhed} (kr.)`} hjaelp={`Tom = standardpris ${krEnhed((Number(m.indkoeb_ore) || 0) + (Number(m.paaslag_ore) || 0))}`}><input id={`pp-pris-${m.kode}`} inputMode="decimal" value={x.pris} onChange={(e) => saetPris(m.kode, "pris", e.target.value)} className={felt} /></Felt>
                      {m.art === "koebt" && <Felt id={`pp-stor-${m.kode}`} titel={`${m.enhed} pr. købt enhed`} hjaelp="Fx 10, hvis lager købes i pakker á 10 GB."><input id={`pp-stor-${m.kode}`} inputMode="decimal" value={x.stoerrelse} onChange={(e) => saetPris(m.kode, "stoerrelse", e.target.value)} className={felt} /></Felt>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button onClick={gem} disabled={busy} className={knapPrim + " mt-4"}>{busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />} Gem plan</button>
          <Meddelelse fejl={fejl} besked={besked} />
        </div>
      ) : <p className="text-sm text-muted">Vælg en plan eller opret en ny.{fejl && <Meddelelse fejl={fejl} />}</p>}
    </div>
  );
}
