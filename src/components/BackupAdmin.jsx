import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Archive, Download, AlertCircle, Check, RefreshCw, ShieldCheck } from "lucide-react";
import { getBackupRuns, getBackupHentninger, startBackup, hentBackupDownload, tjekBackupGendannelse, gendanFraBackup } from "../lib/dataStore";
import { backupAdvarsel, hentningAdvarsel, formatBytes, varighed } from "../data/backup";

// SYSTEMADMIN: backup. Selve backup'en kører automatisk to gange i døgnet (se databasens cron-job "backup-planlagt").
// Her ses historikken, en backup kan startes med det samme, filer kan hentes, og manglende rækker i en butik kan
// gendannes fra en valgt backup. Gendannelsen indsætter KUN rækker, der mangler - eksisterende rækker røres aldrig.
const STATUS = {
  koerer: { tekst: "Kører", klasse: "text-ink bg-bg border-line" },
  ok: { tekst: "Gennemført", klasse: "text-emerald-800 bg-emerald-50 border-emerald-200" },
  delvis: { tekst: "Delvist", klasse: "text-amber-800 bg-amber-50 border-amber-200" },
  fejl: { tekst: "Fejlede", klasse: "text-red-800 bg-red-50 border-red-200" },
};
const dato = (iso) => iso ? new Date(iso).toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short" }) : "";

function Gendannelse({ run, stores }) {
  const butikFiler = (run.detaljer?.filer || []).filter((f) => f.store_id);
  const [butik, setButik] = useState(butikFiler[0]?.store_id || "");
  const [travl, setTravl] = useState(false);
  const [svar, setSvar] = useState(null);
  const [fejl, setFejl] = useState("");
  const [bekraeft, setBekraeft] = useState(false);
  const navn = (id) => stores.find((s) => s.id === id)?.name || butikFiler.find((f) => f.store_id === id)?.navn || id;

  const koer = async (toer) => {
    setTravl(true); setFejl(""); setSvar(null);
    const r = await (toer ? tjekBackupGendannelse : gendanFraBackup)(run.id, butik);
    setTravl(false); setBekraeft(false);
    if (!r.ok) { setFejl(r.fejl || "Det mislykkedes."); return; }
    setSvar(r);
  };

  if (!butikFiler.length) return <p className="text-sm text-muted">Denne backup indeholder ingen butiksfiler.</p>;
  return (
    <div className="mt-3 border-t border-line pt-3 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="block text-xs text-muted mb-1">Butik</span>
          <select value={butik} onChange={(e) => { setButik(e.target.value); setSvar(null); setBekraeft(false); }} className="border border-line rounded px-2 py-2 text-sm bg-white min-h-[44px]">
            {butikFiler.map((f) => <option key={f.store_id} value={f.store_id}>{navn(f.store_id)}</option>)}
          </select>
        </label>
        <button type="button" disabled={travl || !butik} onClick={() => koer(true)} className="min-h-[44px] px-4 text-sm font-semibold border border-line rounded hover:bg-bg disabled:opacity-50">
          Tjek hvad der mangler
        </button>
      </div>
      {travl && <p className="text-sm text-muted flex items-center gap-2" role="status"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Arbejder…</p>}
      {fejl && <p className="text-sm text-red-700 flex items-center gap-2" role="alert"><AlertCircle size={14} aria-hidden="true" /> {fejl}</p>}
      {svar && (
        <div className="text-sm space-y-2" role="status">
          <p className="font-semibold">
            {svar.toer
              ? (svar.i_alt === 0 ? "Intet mangler – alt fra backup'en findes allerede i databasen." : `${svar.i_alt} række(r) fra backup'en mangler i databasen.`)
              : `${svar.i_alt} række(r) blev gendannet.`}
          </p>
          {Object.entries(svar.tabeller).filter(([, v]) => v.mangler > 0).map(([t, v]) => (
            <p key={t} className="text-muted">{t}: {v.mangler}</p>
          ))}
          {svar.fejlTabeller?.length > 0 && (
            <div className="text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
              <p className="font-semibold">Kunne ikke behandles{svar.toer ? " (kan skyldes, at rækker de afhænger af først mangler – det afklares ved selve gendannelsen)" : ""}:</p>
              {svar.fejlTabeller.map((f) => <p key={f.tabel}>{f.tabel}: {f.fejl}</p>)}
            </div>
          )}
          {svar.toer && svar.i_alt > 0 && (
            <div>
              {!bekraeft
                ? <button type="button" onClick={() => setBekraeft(true)} className="min-h-[44px] px-4 text-sm font-semibold bg-brand text-white rounded">Gendan de manglende rækker…</button>
                : (
                  <div className="border border-line rounded p-3 space-y-2">
                    <p>Indsætter kun de rækker, der mangler i <strong>{navn(butik)}</strong>, fra backup'en fra {dato(svar.taget)}. Eksisterende data ændres ikke. Er du sikker?</p>
                    <div className="flex gap-2">
                      <button type="button" disabled={travl} onClick={() => koer(false)} className="min-h-[44px] px-4 text-sm font-semibold bg-brand text-white rounded disabled:opacity-50">Ja, gendan</button>
                      <button type="button" onClick={() => setBekraeft(false)} className="min-h-[44px] px-4 text-sm font-semibold border border-line rounded">Annullér</button>
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-muted">Sagsbilleder og -filer gendannes ikke herfra. De ligger i lageret "backups" under "filer/", og kan kopieres tilbage derfra.</p>
    </div>
  );
}

function BackupAdmin({ stores = [] }) {
  const [runs, setRuns] = useState(null);
  const [hentninger, setHentninger] = useState(null);
  const [indlaesFejl, setIndlaesFejl] = useState("");
  const [starter, setStarter] = useState(false);
  const [fejl, setFejl] = useState("");
  const [aaben, setAaben] = useState(null);
  const timer = useRef(null);

  const hent = useCallback(async () => {
    const [r, h] = await Promise.all([getBackupRuns(), getBackupHentninger()]);
    setHentninger(h.fejl ? null : h.hentninger);
    setIndlaesFejl(r.fejl || "");
    setRuns(r.runs);
    return r.runs;
  }, []);

  useEffect(() => { hent(); return () => clearTimeout(timer.current); }, [hent]);

  // Så længe en backup kører, spørges der hvert 4. sekund om status.
  useEffect(() => {
    clearTimeout(timer.current);
    if (runs?.some((r) => r.status === "koerer")) timer.current = setTimeout(hent, 4000);
    return () => clearTimeout(timer.current);
  }, [runs, hent]);

  const start = async () => {
    setStarter(true); setFejl("");
    const r = await startBackup();
    setStarter(false);
    if (!r.ok) { setFejl(r.fejl || "Backup kunne ikke startes."); return; }
    hent();
  };

  const hentFil = async (sti) => {
    setFejl("");
    const r = await hentBackupDownload(sti);
    if (!r.ok) { setFejl(r.fejl || "Filen kunne ikke hentes."); return; }
    window.location.assign(r.url);
  };

  if (runs === null) return <p className="text-sm text-muted flex items-center gap-2" role="status"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Henter backups…</p>;
  const advarsel = indlaesFejl ? null : backupAdvarsel(runs);
  const hentAdv = hentninger ? hentningAdvarsel(hentninger) : null;
  const sidsteHentning = hentninger?.find((h) => !h.fejl);
  const igang = runs.some((r) => r.status === "koerer");

  return (
    <section aria-labelledby="backup-titel" className="space-y-4 max-w-4xl">
      <div>
        <h2 id="backup-titel" className="text-lg font-bold flex items-center gap-2"><Archive size={18} aria-hidden="true" /> Backup</h2>
        <p className="text-sm text-muted mt-1">
          Tages automatisk to gange i døgnet (ca. kl. 4 og 14) og gemmes i 30 dage. Hver backup har én fil pr. butik plus en fælles fil.
          Nye sagsbilleder og -filer kopieres med. En ekstern computer henter backup'en til sig selv; her ses, hvornår det sidst skete.
        </p>
      </div>

      {indlaesFejl && <p className="text-sm text-red-700 flex items-center gap-2" role="alert"><AlertCircle size={14} aria-hidden="true" /> Kunne ikke hente backup-oversigten: {indlaesFejl}</p>}
      {advarsel && (
        <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded p-3 flex items-center gap-2" role="alert">
          <AlertCircle size={16} aria-hidden="true" /> {advarsel}
        </p>
      )}
      {!indlaesFejl && !advarsel && (
        <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded p-3 flex items-center gap-2" role="status">
          <ShieldCheck size={16} aria-hidden="true" /> Seneste backup: {dato(runs.find((r) => r.status === "ok" || r.status === "delvis")?.faerdig_at)}.
        </p>
      )}

      {hentninger && (hentAdv ? (
        <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded p-3 flex items-center gap-2" role="alert">
          <AlertCircle size={16} aria-hidden="true" /> {hentAdv}
        </p>
      ) : (
        <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded p-3 flex items-center gap-2" role="status">
          <ShieldCheck size={16} aria-hidden="true" /> Hentet til ekstern computer: {dato(sidsteHentning?.hentet_at)}{sidsteHentning?.klient ? ` (${sidsteHentning.klient})` : ""}.
        </p>
      ))}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={start} disabled={starter || igang} className="min-h-[44px] px-4 text-sm font-semibold bg-brand text-white rounded disabled:opacity-50 flex items-center gap-2">
          {(starter || igang) ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Archive size={14} aria-hidden="true" />}
          {igang ? "Backup kører…" : "Tag backup nu"}
        </button>
        <button type="button" onClick={hent} className="min-h-[44px] px-4 text-sm font-semibold border border-line rounded hover:bg-bg flex items-center gap-2">
          <RefreshCw size={14} aria-hidden="true" /> Opdatér
        </button>
      </div>
      {fejl && <p className="text-sm text-red-700 flex items-center gap-2" role="alert"><AlertCircle size={14} aria-hidden="true" /> {fejl}</p>}

      {runs.length === 0 && !indlaesFejl && <p className="text-sm text-muted">Ingen backups endnu.</p>}
      <ul className="space-y-2">
        {runs.map((r) => {
          const s = STATUS[r.status] || STATUS.koerer;
          const filer = r.detaljer?.filer || [];
          const erAaben = aaben === r.id;
          return (
            <li key={r.id} className="border border-line rounded bg-white p-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${s.klasse}`}>{s.tekst}</span>
                <span className="text-sm font-semibold">{dato(r.startet_at)}</span>
                <span className="text-xs text-muted">{r.type === "manuel" ? "Manuel" : "Planlagt"}</span>
                <span className="text-xs text-muted">{r.raekker} rækker · {r.filer_kopieret} nye filer · {formatBytes(r.bytes)}{varighed(r) ? ` · ${varighed(r)}` : ""}</span>
                {(r.status === "ok" || r.status === "delvis") && (
                  <button type="button" onClick={() => setAaben(erAaben ? null : r.id)} aria-expanded={erAaben} className="ml-auto min-h-[44px] px-3 text-sm font-semibold border border-line rounded hover:bg-bg">
                    {erAaben ? "Skjul" : "Filer og gendannelse"}
                  </button>
                )}
              </div>
              {r.fejl && <p className="text-sm text-red-700 mt-1">{r.fejl}</p>}
              {(r.detaljer?.fejl || []).map((f, i) => <p key={i} className="text-sm text-amber-800 mt-1">{f}</p>)}
              {erAaben && (
                <div className="mt-3 border-t border-line pt-3">
                  <ul className="space-y-1">
                    {filer.map((f) => (
                      <li key={f.sti} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold">{f.navn}</span>
                        <span className="text-xs text-muted">{f.raekker} rækker · {formatBytes(f.bytes)}</span>
                        <button type="button" onClick={() => hentFil(f.sti)} className="ml-auto min-h-[44px] px-3 text-sm font-semibold border border-line rounded hover:bg-bg flex items-center gap-2">
                          <Download size={14} aria-hidden="true" /> Hent
                        </button>
                      </li>
                    ))}
                  </ul>
                  <Gendannelse run={r} stores={stores} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export { BackupAdmin };
