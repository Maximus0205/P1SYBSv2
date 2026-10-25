import React from "react";
import { Loader2, Check } from "lucide-react";
import { getStaffSmsSettings, saveStaffSmsSettings, staffSmsOverview, personaleFejl } from "../lib/smsPersonale";
import { minTilKl, klTilMin } from "../lib/smsAutomation";
import { rolleLabel } from "../data/roller";

// Hovedpunkt 3 i Admin -> SMS: Advisering af personale (oktober 2026).
// Butikkens admin tænder funktionen og vælger, hvilke typer der KAN sendes. Hver medarbejder tilmelder sig selv med eget
// mobilnummer under "Din konto" (ikonet ved log ud) og vælger, hvilke af de tændte typer vedkommende vil have. Her ses kun,
// hvem der er tilmeldt (nummeret er maskeret). Serveren sender (Edge Function sms-automatik).

const kort = "rounded-xl border border-line bg-white p-5 mb-5 shadow-sm";
const overskrift = "text-sm font-semibold uppercase tracking-wide text-ink mb-1";
const hjaelp = "text-xs text-muted mb-3";
const felt = "w-full min-h-[44px] rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand";
const sekundaer = "min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide text-ink border border-line hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors disabled:opacity-50";
const primaer = "min-h-[44px] px-5 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-brand hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand transition-colors disabled:opacity-40";


const TYPER = [
  { nok: "manglendeVare", titel: "Manglende vare", hjaelp: "Lageret melder, at en vare ikke kan findes. Sendes til den sælger, der har booket sagen." },
  { nok: "problem", titel: "Problem markeret", hjaelp: "Montøren markerer et problem på en sag. Sendes til den sælger, der har booket sagen." },
  { nok: "nytPluk", titel: "Nyt pluk samme dag", hjaelp: "En sag kommer til (eller får nye varer) på pluklisten for i dag, efter at dagen er gået i gang. Sendes til de tilmeldte, typisk lageret." },
];

function SmsPersonaleAdmin({ storeId }) {
  const [last, setLast] = React.useState({ state: "loading" });
  const [form, setForm] = React.useState(null);
  const [orig, setOrig] = React.useState(null);
  const [liste, setListe] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [besked, setBesked] = React.useState(null);

  const hent = React.useCallback(async (stille) => {
    if (!stille) setLast({ state: "loading" });
    const [r, o] = await Promise.all([getStaffSmsSettings(storeId), staffSmsOverview(storeId)]);
    if (!r.ok) { setLast({ state: "error", fejl: r.fejl }); return; }
    setForm(r.settings); setOrig(r.settings);
    setListe(o.ok ? o.liste : null);
    setLast({ state: "ok" });
  }, [storeId]);
  React.useEffect(() => { hent(false); }, [hent]);

  if (last.state === "loading") {
    return <p className="text-sm text-muted flex items-center gap-1.5 mb-5"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Henter SMS-advisering af personale...</p>;
  }
  if (last.state === "error") {
    return (
      <div className={kort}>
        <h3 className={overskrift}>3 · SMS-advisering af personale</h3>
        <p role="alert" className="text-sm text-danger mb-3">Indstillingerne kunne ikke hentes. {last.fejl}</p>
        <button type="button" onClick={() => hent(false)} className={sekundaer}>Prøv igen</button>
      </div>
    );
  }

  const fejl = personaleFejl(form);
  const aendret = JSON.stringify(form) !== JSON.stringify(orig);
  const ingenValgt = form.enabled && !form.manglendeVare && !form.problem && !form.nytPluk;
  const sæt = (felter) => { setForm((f) => ({ ...f, ...felter })); setBesked(null); };
  const gem = async () => {
    if (fejl || saving) return;
    setSaving(true); setBesked(null);
    const r = await saveStaffSmsSettings(storeId, form);
    setSaving(false);
    if (!r.ok) { setBesked({ type: "fejl", tekst: `Indstillingerne blev ikke gemt. ${r.fejl || ""}`.trim() }); return; }
    await hent(true);
    setBesked({ type: "ok", tekst: "Gemt. Serveren bruger de nye regler ved næste kørsel (højst fem minutter)." });
  };
  const nyTændt = form.enabled && !orig.enabled;

  return (
    <div>
      <div className={kort}>
        <h3 className={overskrift}>3 · SMS-advisering af personale</h3>
        <label className="flex items-start gap-3 cursor-pointer min-h-[44px] py-1">
          <input type="checkbox" checked={form.enabled} onChange={(e) => sæt({ enabled: e.target.checked })} className="w-5 h-5 mt-0.5 accent-ink shrink-0" />
          <span className="text-sm text-ink">Medarbejdere kan få en SMS, når noget kræver handling, ud over beskeden i appen.</span>
        </label>
        {!form.enabled && <p className="text-xs text-muted mt-1">Slået fra: ingen SMS'er sendes til personale. Beskederne i appen virker som før.</p>}
      </div>

      {form.enabled && (
        <>
          <div className={kort}>
            <p className={hjaelp}>
              Vælg, hvilke hændelser der kan give en SMS. Hver medarbejder tilmelder sig selv med eget mobilnummer under “Din konto” (ikonet ved log ud) og vælger, hvilke af disse vedkommende vil have. Ingen får SMS uden selv at have tilmeldt sig.
              Flere hændelser til samme person samles i én SMS. Hver SMS koster, ligesom ankomst-SMS.
            </p>
            {TYPER.map((t) => (
              <label key={t.nok} className="flex items-start gap-3 cursor-pointer min-h-[44px] py-2 border-t border-line first:border-t-0">
                <input type="checkbox" checked={form[t.nok]} onChange={(e) => sæt({ [t.nok]: e.target.checked })} className="w-5 h-5 mt-0.5 accent-ink shrink-0" />
                <span>
                  <span className="block text-sm font-semibold text-ink">{t.titel}</span>
                  <span className="block text-xs text-muted">{t.hjaelp}</span>
                </span>
              </label>
            ))}
            {form.nytPluk && (
              <div className="mt-3">
                <label htmlFor="staff-pluk-tid" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Nyt pluk gælder fra kl.</label>
                <input
                  id="staff-pluk-tid" type="time" min="04:00" max="20:00" step={900} value={minTilKl(form.nytPlukEfterMin)}
                  onChange={(e) => { const m = klTilMin(e.target.value); if (m !== null) sæt({ nytPlukEfterMin: m }); }}
                  className={`${felt} w-36 font-mono`}
                />
                <p className="text-[11px] text-muted mt-1">Før dette tidspunkt regnes ændringer som en del af dagens planlagte pluk og giver ingen SMS. Standard: kl. 06:00.</p>
              </div>
            )}
            {ingenValgt && <p role="status" className="text-xs text-danger mt-3">Ingen typer er tændt, så der sendes ikke noget. Vælg mindst én.</p>}
          </div>

          <div className={kort}>
            <h3 className={overskrift}>Tilmeldte</h3>
            {liste === null ? (
              <p className="text-xs text-muted">Oversigten kunne ikke hentes.</p>
            ) : liste.length === 0 ? (
              <p className="text-xs text-muted">Ingen er tilmeldt endnu. Bed medarbejderne om at åbne “Din konto” og tilføje deres mobilnummer.</p>
            ) : (
              <ul className="divide-y divide-line">
                {liste.map((p, i) => (
                  <li key={i} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-semibold text-ink">{p.navn}</span>
                    <span className="text-xs text-muted">{rolleLabel(p.rolle)}</span>
                    <span className="text-xs font-mono text-muted">{p.nummer}</span>
                    <span className="text-xs text-ink">
                      {[p.manglendeVare && "Manglende vare", p.problem && "Problem", p.nytPluk && "Nyt pluk"].filter(Boolean).join(" · ") || "Ingen typer valgt"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-muted mt-2">Numrene er maskeret. Kun medarbejderen selv kan se og rette sit eget nummer.</p>
          </div>
        </>
      )}

      {nyTændt && <p role="status" className="text-xs text-ink mb-3">Hændelser, der allerede findes, når du gemmer, giver ikke en SMS bagefter. Kun nye hændelser gør.</p>}
      <div className="flex items-center gap-3 flex-wrap mb-8">
        <button type="button" onClick={gem} disabled={!aendret || !!fejl || saving} className={`${primaer} flex items-center gap-1.5`}>
          {saving ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />} {saving ? "Gemmer..." : "Gem advisering af personale"}
        </button>
        {aendret && !saving && <span className="text-xs text-muted">Der er ændringer, som ikke er gemt.</span>}
        {fejl && aendret && <span role="alert" className="text-xs text-danger">{fejl}</span>}
        {besked && <span role={besked.type === "fejl" ? "alert" : "status"} className={`text-xs ${besked.type === "fejl" ? "text-danger font-semibold" : "text-success font-semibold"}`}>{besked.tekst}</span>}
      </div>
    </div>
  );
}

export { SmsPersonaleAdmin };
