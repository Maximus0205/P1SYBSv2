import React, { useState, useEffect } from "react";
import { Plug, Check, X, Loader2, AlertTriangle, KeyRound, ShieldCheck } from "lucide-react";
import { getPosIntegration, setPosIntegrationKey, testPosIntegration } from "../lib/dataStore";

// ---------------------------------------------------------------------------
// POS-INTEGRATION (Flow Retail) - september 2026
//
// Forbereder appen til det kommende POS-system, uden at det kræver en
// kodeændring at slå til, når Flow Retail er klar: en admin sætter
// forbindelsen op HERFRA, én gang, og selve synkroniseringen (opslag ved
// oprettelse, fakturering + lagerudlevering ved afslutning) begynder at
// virke automatisk, når de fire "IKKE IMPLEMENTERET"-steder i
// supabase/functions/pos-integration er udfyldt med rigtige HTTP-kald.
//
// SIKKERHED: API-nøglen tastes her, men VISES ALDRIG IGEN - hverken til
// denne admin eller nogen anden. Feltet viser kun "Nøgle sat" eller
// "Ingen nøgle sat endnu". Selve værdien går direkte til Supabase Vault
// via en Edge Function; den ligger aldrig i en tabel, klienten kan læse.
//
// FEJL GÅR ALDRIG STILLE FORBI: en forbindelsestest gemmer ALTID sit
// resultat (også en fejl) på raekken i databasen - se getPosIntegration -
// så status er synlig for enhver, der åbner siden, ikke kun den der
// trykkede testknappen.
function PosIntegrationAdmin({ storeId, storeLabel }) {
  const [loading, setLoading] = useState(true);
  const [aktiveret, setAktiveret] = useState(false);
  const [tenantId, setTenantId] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [harNoegle, setHarNoegle] = useState(false);
  const [nyNoegle, setNyNoegle] = useState("");
  const [sidstTestet, setSidstTestet] = useState(null);
  const [sidstTestetOk, setSidstTestetOk] = useState(null);
  const [sidstTestetNote, setSidstTestetNote] = useState("");

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [besked, setBesked] = useState(null); // { type: "success"|"error", tekst }

  const load = () => {
    if (!storeId) return;
    setLoading(true);
    getPosIntegration(storeId).then((r) => {
      if (r) {
        setAktiveret(r.aktiveret);
        setTenantId(r.tenantId);
        setBaseUrl(r.baseUrl);
        setHarNoegle(r.harNoegle);
        setSidstTestet(r.sidstTestet);
        setSidstTestetOk(r.sidstTestetOk);
        setSidstTestetNote(r.sidstTestetNote);
      }
      setLoading(false);
    });
  };
  useEffect(load, [storeId]);

  const gem = async () => {
    setSaving(true); setBesked(null);
    const felter = { storeId, tenantId: tenantId.trim(), baseUrl: baseUrl.trim(), enabled: aktiveret };
    if (nyNoegle.trim()) felter.apiKey = nyNoegle.trim();
    const result = await setPosIntegrationKey(felter);
    setSaving(false);
    if (!result.ok) { setBesked({ type: "error", tekst: result.fejl || "Kunne ikke gemme indstillingerne." }); return; }
    setNyNoegle("");
    setBesked({ type: "success", tekst: "Gemt." });
    load();
  };

  const test = async () => {
    setTesting(true); setBesked(null);
    const result = await testPosIntegration(storeId);
    setTesting(false);
    if (!result.ok) setBesked({ type: "error", tekst: result.fejl || "Forbindelsestesten fejlede." });
    load(); // henter det gemte testresultat, uanset udfald
  };

  if (loading) return <p className="text-sm text-muted italic">Indlæser...</p>;

  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <Plug size={16} className="text-brand shrink-0" aria-hidden="true" />
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink">Flow Retail (POS)</h3>
      </div>
      <p className="text-xs text-muted mb-4">
        {storeLabel ? `Forbindelse for ${storeLabel}.` : "Forbindelse for denne butik."} Bruges til at hente kundedata og varenummer ved oprettelse af en sag, og til automatisk fakturering + lagerudlevering, når en sag afsluttes.
      </p>

      <label className="flex items-center gap-2 cursor-pointer mb-4">
        <input type="checkbox" checked={aktiveret} onChange={(e) => setAktiveret(e.target.checked)} className="w-5 h-5 accent-brand" />
        <span className="text-sm text-ink font-medium">Aktivér POS-integration for denne butik</span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2 mb-3">
        <label className="text-xs text-muted">
          Butiks-/tenant-id hos Flow Retail
          <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="Fx butikkens id i Flow Retail" className="w-full mt-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
        </label>
        <label className="text-xs text-muted">
          API-adresse (valgfri — kun hvis Flow Retail bruger flere miljøer)
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.flowretail.com/..." className="w-full mt-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink font-mono focus:outline-none focus:border-brand" />
        </label>
      </div>

      <label className="text-xs text-muted block mb-1">
        API-nøgle
        <div className="relative mt-1">
          <KeyRound size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="password"
            value={nyNoegle}
            onChange={(e) => setNyNoegle(e.target.value)}
            placeholder={harNoegle ? "•••• sat — indtast for at skifte den" : "Ingen nøgle sat endnu"}
            className="w-full rounded-lg border border-line bg-panel pl-8 pr-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
          />
        </div>
      </label>
      <p className="text-[11px] text-muted flex items-start gap-1.5 mb-4">
        <ShieldCheck size={12} className="shrink-0 mt-0.5" aria-hidden="true" />
        Nøglen vises aldrig igen, når den er gemt — kun om den er sat. Den opbevares krypteret og forlader aldrig serveren.
      </p>

      {besked && (
        <p className={`text-xs mb-3 flex items-center gap-1.5 ${besked.type === "error" ? "text-danger" : "text-success"}`}>
          {besked.type === "error" ? <X size={13} className="shrink-0" aria-hidden="true" /> : <Check size={13} className="shrink-0" aria-hidden="true" />}
          {besked.tekst}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={gem} disabled={saving} className="px-4 py-2.5 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors disabled:opacity-60">
          {saving ? "Gemmer..." : "Gem"}
        </button>
        <button onClick={test} disabled={testing || !harNoegle} title={!harNoegle ? "Sæt en API-nøgle først" : "Test forbindelsen"} className="px-4 py-2.5 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors disabled:opacity-40 flex items-center gap-1.5">
          {testing ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null} Test forbindelse
        </button>
      </div>

      {sidstTestet && (
        <div className={`mt-3 pt-3 border-t border-divider text-xs flex items-start gap-1.5 ${sidstTestetOk ? "text-success" : "text-danger"}`}>
          {sidstTestetOk ? <Check size={13} className="shrink-0 mt-0.5" aria-hidden="true" /> : <AlertTriangle size={13} className="shrink-0 mt-0.5" aria-hidden="true" />}
          <span>
            Sidst testet {new Date(sidstTestet).toLocaleString("da-DK")}: {sidstTestetOk ? "forbindelsen virker" : sidstTestetNote}
          </span>
        </div>
      )}
    </div>
  );
}

export { PosIntegrationAdmin };
