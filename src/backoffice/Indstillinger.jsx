import React, { useEffect, useState } from "react";
import { Loader2, Check } from "lucide-react";
import { taalFraTekst, hentIndstillinger, gemIndstillinger } from "../lib/billing";
import { felt, kort, overskrift, knapPrim, Meddelelse, Indlaeser, Felt } from "./ui";

// Indstillinger: jeres egne afsenderoplysninger og fakturaregler. Priser på SMS m.m. ligger på produktets målepunkter (siden Produkter & priser).
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

