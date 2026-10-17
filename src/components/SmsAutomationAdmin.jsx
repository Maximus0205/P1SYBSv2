import React from "react";
import { Loader2, Check, RotateCcw } from "lucide-react";
import { getSmsAutomation, saveSmsAutomation, automationFejl, minTilKl, klTilMin, STANDARD_AUTO_TEKSTER } from "../lib/smsAutomation";
import { MAKS_SKABELON, skabelonFejl, udfyld, datoTekst, plusDage } from "../lib/smsAutomationLogik";
import { smsAntal } from "../lib/arrivalTime";
import { todayISO } from "../data/domain";

// Hovedpunkt 2 i Admin -> SMS: Advisering af kunder (oktober 2026).
// HOVEDKONTAKT til/fra. Er den slået fra, sendes intet. Når den tændes, er standarden en påmindelse aftenen før (kl. 18) med
// instruks til afbestilling; bekræftelse, besked ved flytning og morgen-påmindelse kan tændes ved siden af. Hver besked har sin
// egen tekst og (for påmindelserne) sit eget tidspunkt. Serveren sender (Edge Function sms-automatik), også når ingen er logget ind.
// Tekster kan kun bruge pladsholderne {fornavn}, {dato}, {tidsrum}, {butik} og {telefon} - ingen links.

const kort = "rounded-xl border border-line bg-white p-5 mb-5 shadow-sm";
const overskrift = "text-sm font-semibold uppercase tracking-wide text-ink mb-1";
const hjaelp = "text-xs text-muted mb-3";
const felt = "w-full min-h-[44px] rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand";
const sekundaer = "min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide text-ink border border-line hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors disabled:opacity-50";
const primaer = "min-h-[44px] px-5 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-brand hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand transition-colors disabled:opacity-40";

const PLADSHOLDERE = [["{fornavn}", "Fornavn"], ["{dato}", "Dato"], ["{tidsrum}", "Tidsrum"], ["{butik}", "Butik"], ["{telefon}", "Telefon"]];

const REGLER = [
  { nok: "aften", tpl: "tplAften", std: "aften", id: "auto-aften", titel: "Påmindelse aftenen før", dagEksempel: 1, hjaelp: "Sendes dagen før leveringen, fra det valgte klokkeslæt (dog ikke efter kl. 22). Standard: kl. 18.", tid: "aftenMin", tidLabel: "Send fra kl.", min: "12:00", max: "21:30" },
  { nok: "morgen", tpl: "tplMorgen", std: "morgen", id: "auto-morgen", titel: "Påmindelse om morgenen", dagEksempel: 0, hjaelp: "Sendes på leveringsdagen fra det valgte klokkeslæt, men aldrig efter at tidsrummet er begyndt.", tid: "morgenMin", tidLabel: "Send fra kl.", min: "06:00", max: "11:00" },
  { nok: "bekraeftelse", tpl: "tplBekraeftelse", std: "bekraeftelse", id: "auto-bekraeftelse", titel: "Bekræftelse ved booking", dagEksempel: 3, hjaelp: "Sendes kort efter, at en sag er booket med dato og tidsrum." },
  { nok: "aendring", tpl: "tplAendring", std: "aendring", id: "auto-aendring", titel: "Besked når sagen flyttes", dagEksempel: 5, hjaelp: "Sendes, når dato eller tidsrum på en booket sag ændres (fx ved ombooking)." },
];

function eksempelTekst(skabelon, dagePlus, telefon) {
  const dato = datoTekst(plusDage(todayISO(), dagePlus));
  const medTelefon = String(skabelon).split("{telefon}").join(telefon || "12 34 56 78");
  return udfyld(medTelefon, { fornavn: "Anna", dato, tidsrum: "08:00-12:00", butik: "Power Odense" });
}

// Gyldig uden {telefon}-pladsholderen (den kender den delte regel ikke) - samme trick som i lib/smsAutomation.js
const tekstFejlFor = (t) => skabelonFejl(String(t ?? "").split("{telefon}").join("12345678"));

function SmsAutomationAdmin({ storeId }) {
  const [last, setLast] = React.useState({ state: "loading" });
  const [form, setForm] = React.useState(null);
  const [orig, setOrig] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [besked, setBesked] = React.useState(null);
  const refs = React.useRef({});

  const hent = React.useCallback(async (stille) => {
    if (!stille) setLast({ state: "loading" });
    const r = await getSmsAutomation(storeId);
    if (!r.ok) { setLast({ state: "error", fejl: r.fejl }); return; }
    setForm(r.settings); setOrig(r.settings); setLast({ state: "ok" });
  }, [storeId]);
  React.useEffect(() => { hent(false); }, [hent]);

  if (last.state === "loading") {
    return <p className="text-sm text-muted flex items-center gap-1.5 mb-5"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Henter SMS-advisering af kunder...</p>;
  }
  if (last.state === "error") {
    return (
      <div className={kort}>
        <h3 className={overskrift}>2 · SMS-advisering af kunder</h3>
        <p role="alert" className="text-sm text-danger mb-3">Indstillingerne kunne ikke hentes. {last.fejl}</p>
        <button type="button" onClick={() => hent(false)} className={sekundaer}>Prøv igen</button>
      </div>
    );
  }

  const fejl = automationFejl(form);
  const aendret = JSON.stringify(form) !== JSON.stringify(orig);
  const ingenValgt = form.enabled && !form.bekraeftelse && !form.aendring && !form.aften && !form.morgen;
  const sæt = (felter) => { setForm((f) => ({ ...f, ...felter })); setBesked(null); };
  const indsaet = (tpl, tekst) => {
    const el = refs.current[tpl];
    const v = form[tpl];
    const a = el?.selectionStart ?? v.length;
    const b = el?.selectionEnd ?? v.length;
    sæt({ [tpl]: v.slice(0, a) + tekst + v.slice(b) });
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(a + tekst.length, a + tekst.length); } });
  };
  const gem = async () => {
    if (fejl || saving) return;
    setSaving(true); setBesked(null);
    const r = await saveSmsAutomation(storeId, form);
    setSaving(false);
    if (!r.ok) { setBesked({ type: "fejl", tekst: `Indstillingerne blev ikke gemt. ${r.fejl || ""}`.trim() }); return; }
    await hent(true);
    setBesked({ type: "ok", tekst: "Gemt. Serveren bruger de nye regler ved næste kørsel (højst fem minutter)." });
  };
  const nyTændt = form.enabled && !orig.enabled;

  return (
    <div>
      <div className={kort}>
        <h3 className={overskrift}>2 · SMS-advisering af kunder</h3>
        <label className="flex items-start gap-3 cursor-pointer min-h-[44px] py-1">
          <input type="checkbox" checked={form.enabled} onChange={(e) => sæt({ enabled: e.target.checked })} className="w-5 h-5 mt-0.5 accent-ink shrink-0" />
          <span className="text-sm text-ink">Kunden får automatisk en SMS om sin aftale. Serveren sender, også når ingen er logget ind.</span>
        </label>
        {!form.enabled && <p className="text-xs text-muted mt-1">Slået fra: der sendes ingen automatiske SMS'er til kunder.</p>}
      </div>

      {form.enabled && (
        <>
          <div className={kort}>
            <p className={hjaelp}>
              Som standard sendes en påmindelse dagen før kl. 18 med besked om, hvordan kunden aflyser eller flytter. Du kan tilføje flere beskeder nedenfor og rette tekster og tidspunkter.
              Der sendes kun til sager med et gyldigt dansk telefonnummer, aldrig til afsluttede sager, og højst 5 SMS'er pr. nummer i døgnet. Hver SMS koster, ligesom ankomst-SMS.
            </p>
            <label htmlFor="auto-telefon" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Butikkens telefonnummer (til afbestilling)</label>
            <input
              id="auto-telefon" type="tel" inputMode="tel" autoComplete="off" maxLength={16} value={form.kontaktTelefon}
              onChange={(e) => sæt({ kontaktTelefon: e.target.value.replace(/[^0-9 +]/g, "") })}
              placeholder="Fx 66 12 34 56" className={`${felt} sm:w-64 font-mono`}
            />
            <p className="text-[11px] text-muted mt-1">Bruges, hvor teksten har <span className="font-mono">{"{telefon}"}</span>. Skal udfyldes, hvis en tændt tekst indeholder den.</p>
            <p className="text-xs text-muted mt-3">Pladsholdere: <span className="font-mono">{"{fornavn}"}</span> kundens fornavn · <span className="font-mono">{"{dato}"}</span> fx “fredag den 16. oktober” · <span className="font-mono">{"{tidsrum}"}</span> fx “08:00-12:00” · <span className="font-mono">{"{butik}"}</span> butikkens navn · <span className="font-mono">{"{telefon}"}</span> butikkens nummer. Links er ikke tilladt.</p>
          </div>

          {REGLER.map((r) => {
            const tekstFejl = tekstFejlFor(form[r.tpl]);
            const eks = tekstFejl ? "" : eksempelTekst(form[r.tpl], r.dagEksempel, form.kontaktTelefon);
            const antal = smsAntal(eks);
            return (
              <div key={r.nok} className={kort}>
                <label className="flex items-start gap-3 cursor-pointer min-h-[44px] py-1">
                  <input type="checkbox" checked={form[r.nok]} onChange={(e) => sæt({ [r.nok]: e.target.checked })} className="w-5 h-5 mt-0.5 accent-ink shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold text-ink">{r.titel}</span>
                    <span className="block text-xs text-muted">{r.hjaelp}</span>
                  </span>
                </label>
                {form[r.nok] && (
                  <>
                    {r.tid && (
                      <div className="mt-2">
                        <label htmlFor={`${r.id}-tid`} className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">{r.tidLabel}</label>
                        <input
                          id={`${r.id}-tid`} type="time" min={r.min} max={r.max} value={minTilKl(form[r.tid])} step={900}
                          onChange={(e) => { const m = klTilMin(e.target.value); if (m !== null) sæt({ [r.tid]: m }); }}
                          className={`${felt} w-36 font-mono`}
                        />
                      </div>
                    )}
                    <div className="mt-3">
                      <label htmlFor={r.id} className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Tekst</label>
                      <textarea
                        id={r.id} ref={(el) => { refs.current[r.tpl] = el; }} value={form[r.tpl]} rows={3} maxLength={MAKS_SKABELON + 40}
                        onChange={(e) => sæt({ [r.tpl]: e.target.value.replace(/[\r\n]+/g, " ") })}
                        aria-invalid={tekstFejl ? "true" : "false"} aria-describedby={`${r.id}-info`} className={`${felt} font-sans`}
                      />
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {PLADSHOLDERE.map(([ph, navn]) => <button key={ph} type="button" onClick={() => indsaet(r.tpl, ph)} className={sekundaer}>+ {navn}</button>)}
                        <button type="button" onClick={() => sæt({ [r.tpl]: STANDARD_AUTO_TEKSTER[r.std] })} className={`${sekundaer} flex items-center gap-1.5`}><RotateCcw size={13} aria-hidden="true" /> Standardtekst</button>
                      </div>
                      <div id={`${r.id}-info`} className="mt-2 min-h-[20px]" aria-live="polite">
                        {tekstFejl ? <p role="alert" className="text-xs text-danger">{tekstFejl}</p> : (
                          <>
                            <p className="text-xs text-ink">Eksempel: <span className="font-semibold">“{eks}”</span></p>
                            <p className={`text-[11px] mt-0.5 ${antal.segmenter > 1 || !antal.gsm ? "text-danger" : "text-muted"}`}>
                              {antal.tegn} tegn · {antal.segmenter} SMS (med et kort navn)
                              {antal.segmenter > 1 && " — hver SMS koster, og en lang tekst sendes som flere."}
                              {!antal.gsm && " — teksten indeholder et tegn (fx tankestreg eller emoji), som gør SMS'en dyrere: kun 70 tegn pr. SMS."}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {ingenValgt && <p role="status" className="text-xs text-danger mb-3">Ingen beskeder er tændt, så der sendes ikke noget. Vælg mindst én ovenfor.</p>}
        </>
      )}

      {nyTændt && <p role="status" className="text-xs text-ink mb-3">Eksisterende bookinger får ikke en bekræftelse. Kun sager, der bookes eller flyttes efter, at du gemmer, får en bekræftelse. Påmindelser sendes til alle kommende sager, når tiden er inde.</p>}
      <div className="flex items-center gap-3 flex-wrap mb-8">
        <button type="button" onClick={gem} disabled={!aendret || !!fejl || saving} className={`${primaer} flex items-center gap-1.5`}>
          {saving ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />} {saving ? "Gemmer..." : "Gem advisering af kunder"}
        </button>
        {aendret && !saving && <span className="text-xs text-muted">Der er ændringer, som ikke er gemt.</span>}
        {fejl && aendret && <span role="alert" className="text-xs text-danger">{fejl}</span>}
        {besked && <span role={besked.type === "fejl" ? "alert" : "status"} className={`text-xs ${besked.type === "fejl" ? "text-danger font-semibold" : "text-success font-semibold"}`}>{besked.tekst}</span>}
      </div>
    </div>
  );
}

export { SmsAutomationAdmin };
