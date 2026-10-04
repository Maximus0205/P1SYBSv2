import React from "react";
import { Loader2, Check, X, Plus, RotateCcw } from "lucide-react";
import { getSmsSettings, saveSmsSettings, setSmsSender, standardIndstillinger } from "../lib/smsSettings";
import { MAKS_ENKELTE, MAKS_INTERVALLER, MAKS_MINUTTER, MAKS_SKABELON, STANDARD_SKABELON_ENKELT, STANDARD_SKABELON_INTERVAL, afsenderFejl, byggBesked, intervalKnapTekst, knapperFejl, skabelonFejl, smsAntal } from "../lib/arrivalTime";

// Fanen "SMS" på Admin-siden (oktober 2026).
//   * Butikkens admin (admin_butik): slå ankomst-SMS til/fra, redigere de to tekster
//     og de hurtigknapper, montøren ser, når der sendes en SMS.
//   * Afsenderen (navn/nummer) sættes KUN af en systemadmin - butikkens admin ser den,
//     men kan ikke ændre den. Et frit valgt afsendernavn kunne udgive sig for en bank,
//     og det er kæden, der hæfter for, hvad der sendes fra GatewayAPI-kontoen.
// Databasen validerer og håndhæver det hele (supabase/migrations/20261004_sms_settings.sql).
// Beskeden udfyldes og sendes af serveren (Edge Function send-ankomst-sms).

const kort = "rounded-xl border border-line bg-white p-5 mb-5 shadow-sm";
const overskrift = "text-sm font-semibold uppercase tracking-wide text-ink mb-1";
const hjaelp = "text-xs text-muted mb-3";
const felt = "w-full min-h-[44px] rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand";
const sekundaer = "min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide text-ink border border-line hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors disabled:opacity-50";
const primaer = "min-h-[44px] px-5 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors disabled:opacity-40";

const tilForm = (s) => ({
  enabled: s.enabled,
  templateSingle: s.templateSingle,
  templateInterval: s.templateInterval,
  quickSingles: [...s.quickSingles],
  quickIntervals: s.quickIntervals.map((p) => [...p]),
});

function Chip({ tekst, onRemove, label }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-panel pl-3 pr-1 min-h-[36px] text-sm font-mono text-ink">
      {tekst}
      <button type="button" onClick={onRemove} aria-label={label} className="w-9 h-9 flex items-center justify-center rounded-full text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger">
        <X size={14} aria-hidden="true" />
      </button>
    </span>
  );
}

function TekstFelt({ id, label, vaerdi, onChange, standard, fejl, eksempel, tidEksempel, refEl, onIndsaet }) {
  const antal = smsAntal(eksempel || "");
  return (
    <div className="mb-5">
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">{label}</label>
      <textarea
        id={id}
        ref={refEl}
        value={vaerdi}
        onChange={(e) => onChange(e.target.value.replace(/[\r\n]+/g, " "))}
        rows={3}
        maxLength={MAKS_SKABELON + 40}
        aria-invalid={fejl ? "true" : "false"}
        aria-describedby={`${id}-info`}
        className={`${felt} font-sans`}
      />
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <button type="button" onClick={() => onIndsaet("{fornavn}")} className={sekundaer}>+ Fornavn</button>
        <button type="button" onClick={() => onIndsaet("{tid}")} className={sekundaer}>+ Tid</button>
        <button type="button" onClick={() => onChange(standard)} className={`${sekundaer} flex items-center gap-1.5`}><RotateCcw size={13} aria-hidden="true" /> Standardtekst</button>
      </div>
      <div id={`${id}-info`} className="mt-2 min-h-[20px]" aria-live="polite">
        {fejl ? (
          <p role="alert" className="text-xs text-danger">{fejl}</p>
        ) : (
          <>
            <p className="text-xs text-ink">Eksempel: <span className="font-semibold">“{eksempel}”</span></p>
            <p className={`text-[11px] mt-0.5 ${antal.segmenter > 1 || !antal.gsm ? "text-danger" : "text-muted"}`}>
              {antal.tegn} tegn · {antal.segmenter} SMS{tidEksempel ? ` (med ${tidEksempel})` : ""}
              {antal.segmenter > 1 && " — hver SMS koster, og en lang tekst sendes som flere."}
              {!antal.gsm && " — teksten indeholder et tegn (fx tankestreg eller emoji), som gør SMS'en dyrere: kun 70 tegn pr. SMS."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function SmsSettingsAdmin({ storeId, isSystemAdmin }) {
  const [last, setLast] = React.useState({ state: "loading" });
  const [form, setForm] = React.useState(null);
  const [orig, setOrig] = React.useState(null);
  const [afsender, setAfsender] = React.useState("");
  const [origAfsender, setOrigAfsender] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [savingSender, setSavingSender] = React.useState(false);
  const [besked, setBesked] = React.useState(null);
  const [afsenderBesked, setAfsenderBesked] = React.useState(null);
  const [nyEnkelt, setNyEnkelt] = React.useState("");
  const [nyFra, setNyFra] = React.useState("");
  const [nyTil, setNyTil] = React.useState("");
  const [knapFejl, setKnapFejl] = React.useState(null);
  const refEnkelt = React.useRef(null);
  const refInterval = React.useRef(null);

  const hent = React.useCallback(async (stille) => {
    if (!stille) setLast({ state: "loading" });
    const r = await getSmsSettings(storeId);
    if (!r.ok) { setLast({ state: "error", fejl: r.fejl }); return; }
    const f = tilForm(r.settings);
    setForm(f); setOrig(f);
    setAfsender(r.settings.sender || ""); setOrigAfsender(r.settings.sender || "");
    setLast({ state: "ok" });
  }, [storeId]);
  React.useEffect(() => { hent(false); }, [hent]);

  if (last.state === "loading") {
    return <p className="text-sm text-muted flex items-center gap-1.5"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Henter SMS-indstillinger...</p>;
  }
  if (last.state === "error") {
    return (
      <div className={kort}>
        <p role="alert" className="text-sm text-danger mb-3">SMS-indstillingerne kunne ikke hentes. {last.fejl}</p>
        <button type="button" onClick={() => hent(false)} className={sekundaer}>Prøv igen</button>
      </div>
    );
  }

  const std = standardIndstillinger();
  const fejlEnkelt = skabelonFejl(form.templateSingle);
  const fejlInterval = skabelonFejl(form.templateInterval);
  const fejlKnapper = knapperFejl(form.quickSingles, form.quickIntervals);
  const gyldig = !fejlEnkelt && !fejlInterval && !fejlKnapper;
  const aendret = JSON.stringify(form) !== JSON.stringify(orig);
  const eksEnkelt = fejlEnkelt ? "" : byggBesked(form.templateSingle, "Anna Hansen", 15);
  const eksInterval = fejlInterval ? "" : byggBesked(form.templateInterval, "Anna Hansen", 30, 60);
  const afsenderAendret = afsender.trim() !== origAfsender;
  const afsenderErr = afsenderFejl(afsender);

  const sæt = (felter) => { setForm((f) => ({ ...f, ...felter })); setBesked(null); };

  const indsaet = (feltNavn, ref, tekst) => {
    const el = ref.current;
    const v = form[feltNavn];
    const a = el?.selectionStart ?? v.length;
    const b = el?.selectionEnd ?? v.length;
    sæt({ [feltNavn]: v.slice(0, a) + tekst + v.slice(b) });
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(a + tekst.length, a + tekst.length); } });
  };

  const tilfoejEnkelt = () => {
    const t = nyEnkelt.trim();
    if (!/^\d{1,3}$/.test(t)) { setKnapFejl("Skriv antal minutter som et helt tal."); return; }
    const n = Number(t);
    const ny = [...form.quickSingles, n].sort((x, y) => x - y);
    const f = knapperFejl(ny, form.quickIntervals);
    if (f) { setKnapFejl(f); return; }
    sæt({ quickSingles: ny }); setNyEnkelt(""); setKnapFejl(null);
  };
  const tilfoejInterval = () => {
    const a = nyFra.trim(), b = nyTil.trim();
    if (!/^\d{1,3}$/.test(a) || !/^\d{1,3}$/.test(b)) { setKnapFejl("Skriv begge ender af intervallet som hele tal."); return; }
    const ny = [...form.quickIntervals, [Number(a), Number(b)]].sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const f = knapperFejl(form.quickSingles, ny);
    if (f) { setKnapFejl(f); return; }
    sæt({ quickIntervals: ny }); setNyFra(""); setNyTil(""); setKnapFejl(null);
  };

  const gem = async () => {
    if (!gyldig || saving) return;
    setSaving(true); setBesked(null);
    const r = await saveSmsSettings(storeId, form);
    setSaving(false);
    if (!r.ok) { setBesked({ type: "fejl", tekst: `Indstillingerne blev ikke gemt. ${r.fejl || ""}`.trim() }); return; }
    await hent(true);
    setBesked({ type: "ok", tekst: "Gemt. Ændringerne gælder med det samme for hele butikken." });
  };

  const gemAfsender = async () => {
    if (afsenderErr || savingSender) return;
    setSavingSender(true); setAfsenderBesked(null);
    const r = await setSmsSender(storeId, afsender);
    setSavingSender(false);
    if (!r.ok) { setAfsenderBesked({ type: "fejl", tekst: `Afsenderen blev ikke gemt. ${r.fejl || ""}`.trim() }); return; }
    setOrigAfsender(afsender.trim());
    setAfsender(afsender.trim());
    setAfsenderBesked({ type: "ok", tekst: afsender.trim() ? "Afsenderen er gemt." : "Afsenderen er fjernet — den fælles afsender bruges." });
  };

  return (
    <div>
      <div className={kort}>
        <h3 className={overskrift}>Afsender</h3>
        {isSystemAdmin ? (
          <>
            <p className={hjaelp}>
              Det kunden ser som afsender. Et navn på højst 11 bogstaver/tal (fx butikkens navn, uden æ, ø, å) eller et nummer på højst 15 cifre. Tomt = den fælles afsender, der er sat op på serveren. Kunden kan ikke svare på en SMS fra et navn. Navnet skal passe til, hvad GatewayAPI tillader på jeres konto, og bør være butikkens eget.
            </p>
            <label htmlFor="sms-afsender" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Afsendernavn eller -nummer</label>
            <div className="flex gap-2 flex-wrap">
              <input
                id="sms-afsender" value={afsender} maxLength={15}
                onChange={(e) => { setAfsender(e.target.value); setAfsenderBesked(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); gemAfsender(); } }}
                placeholder="Fx PowerOdense" aria-invalid={afsenderErr ? "true" : "false"}
                className={`${felt} flex-1 min-w-[180px]`}
              />
              <button type="button" onClick={gemAfsender} disabled={!afsenderAendret || !!afsenderErr || savingSender} className={primaer}>
                {savingSender ? "Gemmer..." : "Gem afsender"}
              </button>
            </div>
            {afsenderErr && <p role="alert" className="text-xs text-danger mt-2">{afsenderErr}</p>}
            {afsenderBesked && <p role={afsenderBesked.type === "fejl" ? "alert" : "status"} className={`text-xs mt-2 ${afsenderBesked.type === "fejl" ? "text-danger" : "text-success"}`}>{afsenderBesked.tekst}</p>}
          </>
        ) : (
          <>
            <p className="text-sm text-ink font-mono">{origAfsender || "Den fælles afsender"}</p>
            <p className="text-xs text-muted mt-1">Afsenderen sættes af systemadministratoren. Kontakt vedkommende, hvis den skal ændres.</p>
          </>
        )}
      </div>

      <div className={kort}>
        <h3 className={overskrift}>Ankomst-SMS til kunder</h3>
        <label className="flex items-start gap-3 cursor-pointer min-h-[44px] py-1">
          <input type="checkbox" checked={form.enabled} onChange={(e) => sæt({ enabled: e.target.checked })} className="w-5 h-5 mt-0.5 accent-ink shrink-0" />
          <span className="text-sm text-ink">Montører og sælgere kan sende kunden en SMS om forventet ankomst.</span>
        </label>
        {!form.enabled && <p className="text-xs text-danger mt-1">Slået fra: SMS-knappen virker ikke, og intet sendes, før det slås til igen.</p>}
      </div>

      <div className={kort}>
        <h3 className={overskrift}>Tekster</h3>
        <p className={hjaelp}>
          Brug <span className="font-mono">{"{fornavn}"}</span> til kundens fornavn og <span className="font-mono">{"{tid}"}</span> til tiden (fx “15 minutter”, “1 time” eller ved et interval “30 og 60 minutter”). {"{tid}"} skal være med. Links er ikke tilladt. Højst {MAKS_SKABELON} tegn, men hold den under 160, så den kun koster én SMS.
        </p>
        <TekstFelt
          id="sms-tekst-enkelt" label="Tekst ved én tid" vaerdi={form.templateSingle} refEl={refEnkelt}
          onChange={(v) => sæt({ templateSingle: v })} standard={STANDARD_SKABELON_ENKELT}
          fejl={fejlEnkelt} eksempel={eksEnkelt} tidEksempel="15 minutter"
          onIndsaet={(t) => indsaet("templateSingle", refEnkelt, t)}
        />
        <TekstFelt
          id="sms-tekst-interval" label="Tekst ved interval" vaerdi={form.templateInterval} refEl={refInterval}
          onChange={(v) => sæt({ templateInterval: v })} standard={STANDARD_SKABELON_INTERVAL}
          fejl={fejlInterval} eksempel={eksInterval} tidEksempel="30 og 60 minutter"
          onIndsaet={(t) => indsaet("templateInterval", refInterval, t)}
        />
      </div>

      <div className={kort}>
        <h3 className={overskrift}>Hurtigknapper</h3>
        <p className={hjaelp}>De knapper montøren ser, når der sendes en SMS. En knap sender med det samme. Montøren kan altid skrive en anden tid selv.</p>

        <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Én tid ({form.quickSingles.length} af {MAKS_ENKELTE})</p>
        <div className="flex flex-wrap gap-2 mb-3 min-h-[36px]">
          {form.quickSingles.length === 0 && <span className="text-xs text-muted italic self-center">Ingen knapper</span>}
          {form.quickSingles.map((m) => <Chip key={m} tekst={`${m} min`} label={`Fjern knappen ${m} minutter`} onRemove={() => sæt({ quickSingles: form.quickSingles.filter((x) => x !== m) })} />)}
        </div>
        <div className="flex gap-2 items-end mb-5">
          <label className="text-[11px] text-muted w-28">
            Minutter
            <input value={nyEnkelt} onChange={(e) => setNyEnkelt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); tilfoejEnkelt(); } }} inputMode="numeric" pattern="[0-9]*" maxLength={3} placeholder="20" aria-label="Ny knap: minutter" className={`${felt} mt-1 text-center font-mono`} />
          </label>
          <button type="button" onClick={tilfoejEnkelt} disabled={form.quickSingles.length >= MAKS_ENKELTE} className={`${sekundaer} flex items-center gap-1.5`}><Plus size={14} aria-hidden="true" /> Tilføj</button>
        </div>

        <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Interval ({form.quickIntervals.length} af {MAKS_INTERVALLER})</p>
        <div className="flex flex-wrap gap-2 mb-3 min-h-[36px]">
          {form.quickIntervals.length === 0 && <span className="text-xs text-muted italic self-center">Ingen knapper</span>}
          {form.quickIntervals.map(([a, b]) => <Chip key={`${a}-${b}`} tekst={intervalKnapTekst(a, b)} label={`Fjern intervallet ${a} til ${b} minutter`} onRemove={() => sæt({ quickIntervals: form.quickIntervals.filter(([x, y]) => !(x === a && y === b)) })} />)}
        </div>
        <div className="flex gap-2 items-end flex-wrap">
          <label className="text-[11px] text-muted w-24">
            Fra (min)
            <input value={nyFra} onChange={(e) => setNyFra(e.target.value)} inputMode="numeric" pattern="[0-9]*" maxLength={3} placeholder="30" aria-label="Nyt interval: fra minutter" className={`${felt} mt-1 text-center font-mono`} />
          </label>
          <span className="pb-3 text-muted" aria-hidden="true">–</span>
          <label className="text-[11px] text-muted w-24">
            Til (min)
            <input value={nyTil} onChange={(e) => setNyTil(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); tilfoejInterval(); } }} inputMode="numeric" pattern="[0-9]*" maxLength={3} placeholder="45" aria-label="Nyt interval: til minutter" className={`${felt} mt-1 text-center font-mono`} />
          </label>
          <button type="button" onClick={tilfoejInterval} disabled={form.quickIntervals.length >= MAKS_INTERVALLER} className={`${sekundaer} flex items-center gap-1.5`}><Plus size={14} aria-hidden="true" /> Tilføj</button>
        </div>
        <p className="text-[11px] text-muted mt-2">Tal mellem 1 og {MAKS_MINUTTER} minutter. 60 skrives i teksten som “1 time”.</p>
        {(knapFejl || fejlKnapper) && <p role="alert" className="text-xs text-danger mt-2">{knapFejl || fejlKnapper}</p>}
        <div className="mt-4">
          <button type="button" onClick={() => { sæt({ quickSingles: [...std.quickSingles], quickIntervals: std.quickIntervals.map((p) => [...p]) }); setKnapFejl(null); }} className={`${sekundaer} flex items-center gap-1.5`}><RotateCcw size={13} aria-hidden="true" /> Standardknapper</button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={gem} disabled={!aendret || !gyldig || saving} className={`${primaer} flex items-center gap-1.5`}>
          {saving ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />} {saving ? "Gemmer..." : "Gem ændringer"}
        </button>
        {aendret && !saving && <span className="text-xs text-muted">Der er ændringer, som ikke er gemt.</span>}
        {besked && <span role={besked.type === "fejl" ? "alert" : "status"} className={`text-xs ${besked.type === "fejl" ? "text-danger font-semibold" : "text-success font-semibold"}`}>{besked.tekst}</span>}
      </div>
    </div>
  );
}

export { SmsSettingsAdmin };
