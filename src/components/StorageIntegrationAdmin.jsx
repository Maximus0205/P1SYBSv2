import React, { useState, useEffect } from "react";
import { HardDrive, Check, X, Loader2, AlertTriangle, KeyRound, ShieldCheck, Info } from "lucide-react";
import { getStorageIntegration, setStorageIntegrationKey, testStorageIntegration } from "../lib/dataStore";
import { getStorageUsage, formatBytes } from "../lib/attachments";

// ---------------------------------------------------------------------------
// EGET LAGER (S3-KOMPATIBELT NAS) - september 2026
//
// Sagsdokumentation (billeder, underskrifter mv.) ligger som udgangspunkt
// i vores egen, fælles Supabase Storage-bøtte. Her kan en butik i stedet
// pege sit EGET lager - typisk et NAS derhjemme, der kører en
// S3-kompatibel tjeneste (fx MinIO, som findes som en simpel, installérbar
// pakke til både Synology og QNAP) - uden at ændre noget andet i appen.
//
// HVORFOR "S3" OG IKKE "NAS" SOM PROTOKOL: der findes ingen fælles
// "NAS-protokol". S3 er den protokol, langt de fleste NAS-producenter i
// dag understøtter som en installérbar pakke, OG det er den samme
// protokol, vores egen Supabase Storage allerede taler - så SAMME kode
// (server-side signering) dækker begge tilfælde.
//
// SIKKERHED: den hemmelige nøgle vises ALDRIG igen, når den er gemt -
// kun om den er sat. Selve nøgleværdien går direkte til Supabase Vault
// via en Edge Function (storage-integration); den ligger aldrig i en
// tabel, klienten kan læse.
//
// NETVÆRK - VIGTIGT AT VIDE FØR OPSÆTNING: Appen kører i skyen og skal
// kunne NÅ NAS'et over internettet. NAS'et skal derfor have en adresse,
// der virker udefra (fx via Synologys eget QuickConnect/reverse-proxy),
// OG selve S3-tjenesten på NAS'et skal have CORS slået til for appens
// adresse - ellers afviser NAS'et browserens upload, selvom nøglerne er
// korrekte. Det er butikkens eget NAS-setup, ikke noget denne side kan
// gøre for dem.
function StorageIntegrationAdmin({ storeId, storeLabel }) {
  const [loading, setLoading] = useState(true);
  const [aktiveret, setAktiveret] = useState(false);
  const [endpointUrl, setEndpointUrl] = useState("");
  const [bucket, setBucket] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [pathStyle, setPathStyle] = useState(true);
  const [accessKeyId, setAccessKeyId] = useState("");
  const [harHemmeligNoegle, setHarHemmeligNoegle] = useState(false);
  const [nyHemmeligNoegle, setNyHemmeligNoegle] = useState("");
  const [sidstTestet, setSidstTestet] = useState(null);
  const [sidstTestetOk, setSidstTestetOk] = useState(null);
  const [sidstTestetNote, setSidstTestetNote] = useState("");
  const [forbrug, setForbrug] = useState(null);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [besked, setBesked] = useState(null); // { type: "success"|"error", tekst }

  const load = () => {
    if (!storeId) return;
    setLoading(true);
    Promise.all([getStorageIntegration(storeId), getStorageUsage(storeId)]).then(([r, brug]) => {
      if (r) {
        setAktiveret(r.aktiveret);
        setEndpointUrl(r.endpointUrl);
        setBucket(r.bucket);
        setRegion(r.region);
        setPathStyle(r.pathStyle);
        setAccessKeyId(r.accessKeyId);
        setHarHemmeligNoegle(r.harHemmeligNoegle);
        setSidstTestet(r.sidstTestet);
        setSidstTestetOk(r.sidstTestetOk);
        setSidstTestetNote(r.sidstTestetNote);
      }
      setForbrug(brug?.[0] || null);
      setLoading(false);
    });
  };
  useEffect(load, [storeId]);

  const gem = async () => {
    setSaving(true); setBesked(null);
    const felter = {
      storeId, provider: aktiveret ? "s3_compatible" : "supabase",
      endpointUrl: endpointUrl.trim(), bucket: bucket.trim(), region: region.trim() || "us-east-1", pathStyle,
      accessKeyId: accessKeyId.trim(),
    };
    if (nyHemmeligNoegle.trim()) felter.secretAccessKey = nyHemmeligNoegle.trim();
    const result = await setStorageIntegrationKey(felter);
    setSaving(false);
    if (!result.ok) { setBesked({ type: "error", tekst: result.fejl || "Kunne ikke gemme indstillingerne." }); return; }
    setNyHemmeligNoegle("");
    setBesked({ type: "success", tekst: "Gemt." });
    load();
  };

  const test = async () => {
    setTesting(true); setBesked(null);
    const result = await testStorageIntegration(storeId);
    setTesting(false);
    if (!result.ok) setBesked({ type: "error", tekst: result.fejl || "Forbindelsestesten fejlede." });
    load(); // henter det gemte testresultat, uanset udfald
  };

  if (loading) return <p className="text-sm text-muted italic">Indlæser...</p>;

  const kanTeste = aktiveret && endpointUrl.trim() && bucket.trim() && accessKeyId.trim() && harHemmeligNoegle;

  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <HardDrive size={16} className="text-brand shrink-0" aria-hidden="true" />
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink">Eget lager (NAS)</h3>
      </div>
      <p className="text-xs text-muted mb-4">
        {storeLabel ? `Hvor ${storeLabel} gemmer sagsdokumentation (billeder, underskrifter mv.).` : "Hvor denne butik gemmer sagsdokumentation (billeder, underskrifter mv.)."} Som standard hos os, i en fælles, sikkert adskilt bøtte. Slå til for i stedet at pege på jeres eget NAS - kræver at NAS'et kører en S3-kompatibel tjeneste (fx MinIO, findes som en simpel pakke til Synology/QNAP).
      </p>

      <label className="flex items-center gap-2 cursor-pointer mb-4">
        <input type="checkbox" checked={aktiveret} onChange={(e) => setAktiveret(e.target.checked)} className="w-5 h-5 accent-brand" />
        <span className="text-sm text-ink font-medium">Brug eget lager for denne butik</span>
      </label>

      {aktiveret && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 mb-3">
            <label className="text-xs text-muted sm:col-span-2">
              Adresse (endpoint)
              <input value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} placeholder="https://dit-nas-navn.direct.quickconnect.to:9000" className="w-full mt-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink font-mono focus:outline-none focus:border-brand" />
            </label>
            <label className="text-xs text-muted">
              Bøtte (bucket)
              <input value={bucket} onChange={(e) => setBucket(e.target.value)} placeholder="fx sagsdokumentation" className="w-full mt-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink font-mono focus:outline-none focus:border-brand" />
            </label>
            <label className="text-xs text-muted">
              Region
              <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="us-east-1" className="w-full mt-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink font-mono focus:outline-none focus:border-brand" />
            </label>
            <label className="text-xs text-muted">
              Adgangsnøgle-id (access key id)
              <input value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} className="w-full mt-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink font-mono focus:outline-none focus:border-brand" />
            </label>
            <label className="text-xs text-muted">
              Hemmelig nøgle (secret access key)
              <div className="relative mt-1">
                <KeyRound size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
                <input
                  type="password"
                  value={nyHemmeligNoegle}
                  onChange={(e) => setNyHemmeligNoegle(e.target.value)}
                  placeholder={harHemmeligNoegle ? "•••• sat — indtast for at skifte den" : "Ingen nøgle sat endnu"}
                  className="w-full rounded-lg border border-line bg-panel pl-8 pr-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
                />
              </div>
            </label>
          </div>
          <label className="flex items-center gap-2 cursor-pointer mb-3">
            <input type="checkbox" checked={pathStyle} onChange={(e) => setPathStyle(e.target.checked)} className="w-4 h-4 accent-brand" />
            <span className="text-xs text-ink">Sti-baseret adressering (path-style) — de fleste NAS/MinIO-opsætninger kræver dette, lad stå til med mindre andet er oplyst</span>
          </label>
          <p className="text-[11px] text-muted flex items-start gap-1.5 mb-4">
            <ShieldCheck size={12} className="shrink-0 mt-0.5" aria-hidden="true" />
            Den hemmelige nøgle vises aldrig igen, når den er gemt — kun om den er sat. Den opbevares krypteret og forlader aldrig serveren.
          </p>
          <p className="text-[11px] text-info flex items-start gap-1.5 mb-4">
            <Info size={12} className="shrink-0 mt-0.5" aria-hidden="true" />
            NAS'et skal kunne nås fra internettet (fx via Synologys eget QuickConnect), og selve S3-tjenesten skal have CORS slået til for appens adresse — ellers afvises uploads fra browseren, selvom nøglerne er korrekte. Dette sættes op på NAS'et, ikke her.
          </p>
        </>
      )}

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
        {aktiveret && (
          <button onClick={test} disabled={testing || !kanTeste} title={!kanTeste ? "Udfyld adresse, bøtte, adgangsnøgle-id og hemmelig nøgle først" : "Test forbindelsen"} className="px-4 py-2.5 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors disabled:opacity-40 flex items-center gap-1.5">
            {testing ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null} Test forbindelse
          </button>
        )}
      </div>

      {sidstTestet && (
        <div className={`mt-3 pt-3 border-t border-divider text-xs flex items-start gap-1.5 ${sidstTestetOk ? "text-success" : "text-danger"}`}>
          {sidstTestetOk ? <Check size={13} className="shrink-0 mt-0.5" aria-hidden="true" /> : <AlertTriangle size={13} className="shrink-0 mt-0.5" aria-hidden="true" />}
          <span>
            Sidst testet {new Date(sidstTestet).toLocaleString("da-DK")}: {sidstTestetOk ? "forbindelsen virker" : sidstTestetNote}
          </span>
        </div>
      )}

      {forbrug && (
        <div className="mt-3 pt-3 border-t border-divider text-xs text-muted">
          <span className="font-semibold text-ink">{formatBytes(forbrug.brugt_bytes)}</span> brugt
          {forbrug.kvote_bytes != null ? ` af ${formatBytes(forbrug.kvote_bytes)} (${forbrug.pct_brugt ?? 0}%)` : " (eget lager — ingen kvote hos os)"}
          {forbrug.antal_filer != null && ` · ${forbrug.antal_filer} filer`}
        </div>
      )}
    </div>
  );
}

export { StorageIntegrationAdmin };
