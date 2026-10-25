import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Check, AlertCircle, ChevronUp, ChevronDown } from "lucide-react";
import { DASHBOARD_WIDGET_CATALOG } from "../data/domain";
import {
  getRoles, getPermissionsCatalog, getRoleDefaultPermissions, getStoreIdsForRole,
  createRole, updateRole, setRolePermissions, deleteRole, setStoreRole,
} from "../lib/dataStore";
import { saetRoller, normaliserRoller, ADFAERD_VALG, lavRolleNoegle } from "../data/roller";

// SYSTEMADMIN: roller uden kodeændringer (oktober 2026).
// Roller er FÆLLES for alle butikker. Her oprettes og rettes de (navn, beskrivelse, rettigheder, adfærd), og her ses/styres
// hvilke butikker der har dem tilvalgt - butikkens egen administrator kan også selv tilvælge dem (se ButikRollerValg).
// ALLE roller behandles ens: de kan rettes og slettes (når ingen bruger dem). Alle ændringer går gennem databasefunktioner,
// der kun tillader systemadministrator, og databasen sørger for, at en butik aldrig står uden nogen med "Administrer brugere".
const KATEGORI_TITEL = { side: "Sider og områder", sag: "Hvad man må på en sag" };

function RollerAdmin({ stores }) {
  const [roller, setRoller] = useState(null);
  const [katalog, setKatalog] = useState([]);
  const [standarder, setStandarder] = useState({});
  const [valgt, setValgt] = useState(null);
  const [fejl, setFejl] = useState("");
  const [besked, setBesked] = useState("");
  const [indlaeserFejl, setIndlaeserFejl] = useState(false);

  const hent = useCallback(async () => {
    const [r, k, d] = await Promise.all([getRoles(), getPermissionsCatalog(), getRoleDefaultPermissions()]);
    if (r.length === 0) { setIndlaeserFejl(true); return; }
    setIndlaeserFejl(false);
    saetRoller(r); // så også resten af appen (denne session) bruger de rettede navne
    setRoller(normaliserRoller(r)); setKatalog(k); setStandarder(d);
  }, []);
  useEffect(() => { hent(); }, [hent]);

  const meld = (res, okTekst) => {
    if (res.ok) { setFejl(""); setBesked(okTekst); return true; }
    setBesked(""); setFejl(res.fejl || "Det lykkedes ikke."); return false;
  };

  if (indlaeserFejl) return <p role="alert" className="text-sm text-danger flex items-center gap-1.5"><AlertCircle size={15} aria-hidden="true" /> Rollerne kunne ikke hentes. Prøv at genindlæse siden.</p>;
  if (!roller) return <p className="text-sm text-muted flex items-center gap-2"><Loader2 size={15} className="animate-spin" aria-hidden="true" /> Henter roller...</p>;

  const aktiv = roller.find((r) => r.key === valgt) || null;

  return (
    <div>
      <p className="text-xs text-muted mb-4 max-w-2xl">
        Roller er fælles for alle butikker. Opret en rolle her, giv den de rettigheder den skal have, og lad butikkerne vælge den til - du behøver ikke kode noget.
        Ændrer du en rolles rettigheder, gælder det med det samme alle brugere med rollen. Enkelte brugere kan stadig få ekstra rettigheder eller fratages dem under Admin.
      </p>
      {(fejl || besked) && (
        <p role={fejl ? "alert" : "status"} className={`text-xs mb-3 flex items-center gap-1.5 ${fejl ? "text-danger" : "text-success"}`}>
          {fejl ? <AlertCircle size={13} aria-hidden="true" /> : <Check size={13} aria-hidden="true" />} {fejl || besked}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div>
          <ul className="space-y-1.5 mb-4">
            {roller.map((r) => (
              <li key={r.key}>
                <button
                  type="button" onClick={() => { setValgt(r.key); setFejl(""); setBesked(""); }}
                  aria-pressed={valgt === r.key}
                  className={`w-full text-left min-h-[44px] px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-brand ${valgt === r.key ? "bg-ink text-white border-ink" : "bg-white text-ink border-line hover:border-brand"}`}
                >
                  <span className="font-semibold">{r.label}</span>
                  <span className={`block text-[11px] ${valgt === r.key ? "text-white/80" : "text-muted"}`}>
                    {ADFAERD_VALG.find((a) => a.id === r.adfaerd)?.label} · {(standarder[r.key] || []).length} rettigheder
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <NyRolle roller={roller} onCreated={async (key, res) => { if (meld(res, "Rollen er oprettet.")) { await hent(); setValgt(key); } }} />
        </div>
        <div>
          {aktiv
            ? <RolleEditor
                key={aktiv.key} rolle={aktiv} katalog={katalog} rettigheder={standarder[aktiv.key] || []} stores={stores}
                meld={meld} onChanged={hent} onDeleted={() => setValgt(null)}
              />
            : <p className="text-sm text-muted">Vælg en rolle for at se og rette den, eller opret en ny.</p>}
        </div>
      </div>
    </div>
  );
}

function NyRolle({ roller, onCreated }) {
  const [label, setLabel] = useState("");
  const [beskrivelse, setBeskrivelse] = useState("");
  const [adfaerd, setAdfaerd] = useState("standard");
  const [kopierFra, setKopierFra] = useState("saelger");
  const [busy, setBusy] = useState(false);
  const [lokalFejl, setLokalFejl] = useState("");
  const noegle = lavRolleNoegle(label);

  const opret = async () => {
    setLokalFejl("");
    if (!label.trim()) { setLokalFejl("Skriv et navn til rollen."); return; }
    if (noegle.length < 2) { setLokalFejl("Navnet skal indeholde mindst to bogstaver eller tal."); return; }
    if (roller.some((r) => r.key === noegle)) { setLokalFejl("Der findes allerede en rolle med det navn."); return; }
    setBusy(true);
    const res = await createRole({ key: noegle, label: label.trim(), beskrivelse: beskrivelse.trim(), adfaerd, kopierFra: kopierFra || null });
    setBusy(false);
    if (res.ok) { setLabel(""); setBeskrivelse(""); setAdfaerd("standard"); }
    onCreated(noegle, res);
  };

  const felt = "w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand";
  return (
    <fieldset className="rounded-xl border border-line bg-white p-3 shadow-sm">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink">Ny rolle</legend>
      <div className="space-y-2">
        <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder="Navn, fx Tømrer" aria-label="Rollens navn" className={felt} />
        <input value={beskrivelse} onChange={(e) => setBeskrivelse(e.target.value)} maxLength={300} placeholder="Kort beskrivelse (valgfri)" aria-label="Beskrivelse" className={felt} />
        <label className="block text-xs text-muted">
          Hvordan opfører rollen sig?
          <select value={adfaerd} onChange={(e) => setAdfaerd(e.target.value)} className={`${felt} mt-1`}>
            {ADFAERD_VALG.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          <span className="block mt-1">{ADFAERD_VALG.find((a) => a.id === adfaerd)?.hjaelp} Kan ikke ændres bagefter.</span>
        </label>
        <label className="block text-xs text-muted">
          Start med samme rettigheder som
          <select value={kopierFra} onChange={(e) => setKopierFra(e.target.value)} className={`${felt} mt-1`}>
            <option value="">Ingen rettigheder</option>
            {roller.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
        {lokalFejl && <p role="alert" className="text-xs text-danger">{lokalFejl}</p>}
        <button type="button" onClick={opret} disabled={busy} className="min-h-[44px] w-full px-3 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-brand hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand flex items-center justify-center gap-1.5 disabled:opacity-60">
          <Plus size={14} aria-hidden="true" /> {busy ? "Opretter..." : "Opret rolle"}
        </button>
      </div>
    </fieldset>
  );
}

function RolleEditor({ rolle, katalog, rettigheder, stores, meld, onChanged, onDeleted }) {
  const [label, setLabel] = useState(rolle.label);
  const [beskrivelse, setBeskrivelse] = useState(rolle.beskrivelse);
  const [adfaerd, setAdfaerd] = useState(rolle.adfaerd);
  const [nyButikStandard, setNyButikStandard] = useState(!!rolle.nyButikStandard);
  const [autoForside, setAutoForside] = useState(rolle.forside === null);
  const [widgets, setWidgets] = useState(rolle.forside || []);
  const [valgte, setValgte] = useState(() => new Set(rettigheder));
  const [busy, setBusy] = useState("");
  const [bekraeftSlet, setBekraeftSlet] = useState(false);
  const [butikIds, setButikIds] = useState(null);

  const hentButikker = useCallback(() => { getStoreIdsForRole(rolle.key).then(setButikIds); }, [rolle.key]);
  useEffect(() => { hentButikker(); }, [hentButikker]);

  const grupper = useMemo(() => {
    const g = {};
    katalog.forEach((p) => { (g[p.category] ||= []).push(p); });
    return g;
  }, [katalog]);

  const aendretRettigheder = useMemo(() => {
    const gemt = new Set(rettigheder);
    return gemt.size !== valgte.size || [...valgte].some((k) => !gemt.has(k));
  }, [rettigheder, valgte]);
  const forsideNu = autoForside ? null : widgets;
  const aendretIndstillinger = label.trim() !== rolle.label || beskrivelse.trim() !== rolle.beskrivelse || adfaerd !== rolle.adfaerd
    || nyButikStandard !== !!rolle.nyButikStandard || JSON.stringify(forsideNu) !== JSON.stringify(rolle.forside);

  const toggle = (key) => setValgte((nu) => { const n = new Set(nu); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const toggleWidget = (key) => setWidgets((nu) => (nu.includes(key) ? nu.filter((k) => k !== key) : [...nu, key]));
  const flytWidget = (key, retning) => setWidgets((nu) => {
    const i = nu.indexOf(key); const j = i + retning;
    if (i < 0 || j < 0 || j >= nu.length) return nu;
    const n = [...nu]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });

  const gemIndstillinger = async () => {
    if (!label.trim()) { meld({ ok: false, fejl: "Rollen skal have et navn." }); return; }
    setBusy("navn");
    const res = await updateRole(rolle.key, { label: label.trim(), beskrivelse: beskrivelse.trim(), adfaerd, nyButikStandard, forside: forsideNu });
    setBusy("");
    if (meld(res, "Indstillingerne er gemt.")) onChanged();
  };
  const gemRettigheder = async () => {
    setBusy("rettigheder");
    const res = await setRolePermissions(rolle.key, [...valgte]);
    setBusy("");
    if (meld(res, "Rettighederne er gemt og gælder nu alle med rollen.")) onChanged();
  };
  const slet = async () => {
    setBusy("slet");
    const res = await deleteRole(rolle.key);
    setBusy(""); setBekraeftSlet(false);
    if (meld(res, "Rollen er slettet.")) { await onChanged(); onDeleted(); }
  };
  const skiftButik = async (storeId, aktiv) => {
    setBusy(`butik-${storeId}`);
    const res = await setStoreRole(storeId, rolle.key, aktiv);
    setBusy("");
    meld(res, aktiv ? "Rollen er tilvalgt i butikken." : "Rollen er fravalgt i butikken.");
    hentButikker();
  };

  const felt = "w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand";
  const knap = "min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-brand hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50";

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-line bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-2">{rolle.label}</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-muted">Navn
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} className={`${felt} mt-1`} />
          </label>
          <label className="text-xs text-muted">Beskrivelse
            <input value={beskrivelse} onChange={(e) => setBeskrivelse(e.target.value)} maxLength={300} className={`${felt} mt-1`} />
          </label>
          <label className="text-xs text-muted sm:col-span-2">Hvordan opfører rollen sig?
            <select value={adfaerd} onChange={(e) => setAdfaerd(e.target.value)} className={`${felt} mt-1`}>
              {ADFAERD_VALG.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
            <span className="block mt-1">{ADFAERD_VALG.find((a) => a.id === adfaerd)?.hjaelp} Ændringen gælder med det samme alle med rollen.</span>
          </label>
        </div>
        <label className="flex items-start gap-2 min-h-[44px] py-2 cursor-pointer">
          <input type="checkbox" checked={nyButikStandard} onChange={(e) => setNyButikStandard(e.target.checked)} className="w-4 h-4 mt-0.5 accent-brand shrink-0" />
          <span className="text-sm text-ink">Tilvælges automatisk i nye butikker
            <span className="block text-xs text-muted">Mindst én rolle med rettigheden "Administrer brugere" skal være slået til, ellers kan en ny butik ikke få sin første administrator.</span>
          </span>
        </label>

        <fieldset className="mt-1">
          <legend className="text-xs font-semibold text-muted mb-1">Forsiden for denne rolle</legend>
          <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
            <input type="checkbox" checked={autoForside} onChange={(e) => setAutoForside(e.target.checked)} className="w-4 h-4 accent-brand shrink-0" />
            <span className="text-sm text-ink">Vælg automatisk ud fra rettighederne</span>
          </label>
          {!autoForside && (
            <ul className="space-y-1 mt-1">
              {DASHBOARD_WIDGET_CATALOG.map((w) => {
                const pos = widgets.indexOf(w.key);
                const med = pos >= 0;
                return (
                  <li key={w.key} className="flex items-center gap-2 min-h-[44px]">
                    <label className="flex items-center gap-2 flex-1 cursor-pointer">
                      <input type="checkbox" checked={med} onChange={() => toggleWidget(w.key)} className="w-4 h-4 accent-brand shrink-0" />
                      <span className="text-sm text-ink">{w.label}</span>
                    </label>
                    {med && (
                      <span className="flex gap-1">
                        <button type="button" onClick={() => flytWidget(w.key, -1)} disabled={pos === 0} aria-label={`Flyt ${w.label} op`} className="min-h-[44px] min-w-[44px] rounded-lg border border-line text-ink disabled:opacity-30"><ChevronUp size={16} className="mx-auto" aria-hidden="true" /></button>
                        <button type="button" onClick={() => flytWidget(w.key, 1)} disabled={pos === widgets.length - 1} aria-label={`Flyt ${w.label} ned`} className="min-h-[44px] min-w-[44px] rounded-lg border border-line text-ink disabled:opacity-30"><ChevronDown size={16} className="mx-auto" aria-hidden="true" /></button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-[11px] text-muted mt-1">En widget vises kun, hvis brugeren har rettigheden til den. Brugeren kan selv tilpasse sin forside bagefter.</p>
        </fieldset>

        <p className="text-[11px] text-muted mt-2">Nøgle: <span className="font-mono">{rolle.key}</span> (kan ikke ændres)</p>
        <button type="button" onClick={gemIndstillinger} disabled={!aendretIndstillinger || busy === "navn"} className={`mt-2 ${knap}`}>
          {busy === "navn" ? "Gemmer..." : "Gem indstillinger"}
        </button>
      </section>

      <section className="rounded-xl border border-line bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1">Rettigheder</h3>
        <p className="text-[11px] text-muted mb-2">Databasen forhindrer, at en butik står uden nogen med "Administrer brugere". Fjerner du den fra en rolle, der ville efterlade en butik uden, afvises ændringen med en forklaring.</p>
        {["side", "sag"].filter((k) => grupper[k]).map((k) => (
          <fieldset key={k} className="mb-3">
            <legend className="text-xs font-semibold text-muted mb-1">{KATEGORI_TITEL[k] || k}</legend>
            <div className="grid gap-x-4 sm:grid-cols-2">
              {grupper[k].map((p) => (
                <label key={p.key} className="flex items-start gap-2 min-h-[44px] py-1.5 cursor-pointer">
                  <input type="checkbox" checked={valgte.has(p.key)} onChange={() => toggle(p.key)} className="w-4 h-4 mt-0.5 accent-brand shrink-0" />
                  <span className="text-sm text-ink">{p.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <button type="button" onClick={gemRettigheder} disabled={!aendretRettigheder || busy === "rettigheder"} className={knap}>
          {busy === "rettigheder" ? "Gemmer..." : "Gem rettigheder"}
        </button>
      </section>

      <section className="rounded-xl border border-line bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1">Butikker der har rollen</h3>
        <p className="text-xs text-muted mb-2">Butikkerne kan også selv tilvælge rollen under Admin → Brugere. En rolle, som brugere i en butik har, kan ikke fravælges dér.</p>
        {butikIds === null ? <p className="text-xs text-muted">Henter...</p> : (
          <div className="grid gap-x-4 sm:grid-cols-2">
            {(stores || []).map((b) => (
              <label key={b.id} className="flex items-center gap-2 min-h-[44px] cursor-pointer">
                <input type="checkbox" checked={butikIds.includes(b.id)} disabled={busy === `butik-${b.id}`} onChange={(e) => skiftButik(b.id, e.target.checked)} className="w-4 h-4 accent-brand shrink-0" />
                <span className="text-sm text-ink">{b.navn}{b.butiksnummer ? ` #${b.butiksnummer}` : ""}</span>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-line bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1">Slet rolle</h3>
        <p className="text-xs text-muted mb-2">En rolle kan kun slettes, når ingen brugere har den. Flyt dem først til en anden rolle.</p>
        {bekraeftSlet ? (
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={slet} disabled={busy === "slet"} className="min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-danger disabled:opacity-60">Ja, slet rollen</button>
            <button type="button" onClick={() => setBekraeftSlet(false)} className="min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide text-ink border border-line">Fortryd</button>
          </div>
        ) : (
          <button type="button" onClick={() => setBekraeftSlet(true)} className="min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide text-danger border border-line hover:border-danger flex items-center gap-1.5">
            <Trash2 size={14} aria-hidden="true" /> Slet rollen
          </button>
        )}
      </section>
    </div>
  );
}

export { RollerAdmin };
