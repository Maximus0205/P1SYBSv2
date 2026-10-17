import React from "react";
import { Loader2, Check, AlertCircle, MessageSquare } from "lucide-react";
import { getStaffSmsSettings, getMyStaffSms, saveMyStaffSms, deleteMyStaffSms } from "../lib/smsPersonale";

// "Din konto" -> SMS-advisering (oktober 2026). Medarbejderen tilmelder sig SELV med eget mobilnummer og vælger, hvilke af de typer,
// butikkens admin har tændt, vedkommende vil have. Vises kun, hvis butikken har tændt advisering af personale - eller hvis
// medarbejderen allerede er tilmeldt (så nummeret altid kan fjernes). Nummeret bruges kun til beskeder fra butikken.

const TYPER = [
  { nok: "manglendeVare", butik: "manglendeVare", titel: "Manglende vare på mine sager" },
  { nok: "problem", butik: "problem", titel: "Problem markeret på mine sager" },
  { nok: "nytPluk", butik: "nytPluk", titel: "Nyt pluk samme dag (lager)" },
];

function MinSmsAdvisering() {
  const [state, setState] = React.useState("loading");
  const [butik, setButik] = React.useState(null);
  const [tilmeldt, setTilmeldt] = React.useState(false);
  const [form, setForm] = React.useState({ telefon: "", manglendeVare: true, problem: true, nytPluk: false });
  const [busy, setBusy] = React.useState(false);
  const [fejl, setFejl] = React.useState("");
  const [ok, setOk] = React.useState("");

  React.useEffect(() => {
    let live = true;
    (async () => {
      const [b, m] = await Promise.all([getStaffSmsSettings(null), getMyStaffSms()]);
      if (!live) return;
      if (!b.ok || !m.ok) { setState("fejl"); return; }
      setButik(b.settings);
      if (m.tilmelding) { setTilmeldt(true); setForm({ ...m.tilmelding }); }
      setState("ok");
    })();
    return () => { live = false; };
  }, []);

  if (state === "loading" || state === "fejl") return null;
  if (!butik?.enabled && !tilmeldt) return null;

  const sæt = (felter) => { setForm((f) => ({ ...f, ...felter })); setOk(""); setFejl(""); };
  const gem = async () => {
    setBusy(true); setFejl(""); setOk("");
    const r = await saveMyStaffSms(form);
    setBusy(false);
    if (!r.ok) { setFejl(r.fejl || "Kunne ikke gemme."); return; }
    setTilmeldt(true); setOk("Gemt.");
  };
  const fjern = async () => {
    setBusy(true); setFejl(""); setOk("");
    const r = await deleteMyStaffSms();
    setBusy(false);
    if (!r.ok) { setFejl(r.fejl || "Kunne ikke fjerne."); return; }
    setTilmeldt(false); setForm({ telefon: "", manglendeVare: true, problem: true, nytPluk: false }); setOk("Dit nummer er fjernet.");
  };

  return (
    <div className="mb-5 pb-5 border-b border-divider">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1.5 flex items-center gap-1.5"><MessageSquare size={15} className="text-brand" aria-hidden="true" /> SMS-advisering</h3>
      {!butik?.enabled && <p className="text-xs text-muted mb-3">Butikken har slået SMS-advisering af personale fra, så du får ingen SMS lige nu. Du kan fjerne dit nummer herunder.</p>}
      {butik?.enabled && <p className="text-xs text-muted mb-3">Få en SMS, når noget kræver handling. Vælg selv hvad, og skriv dit mobilnummer. Nummeret bruges kun til beskeder fra butikken.</p>}

      <label htmlFor="min-sms-tlf" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Dit mobilnummer</label>
      <input
        id="min-sms-tlf" type="tel" inputMode="tel" autoComplete="tel" maxLength={16} value={form.telefon}
        onChange={(e) => sæt({ telefon: e.target.value.replace(/[^0-9 +]/g, "") })}
        placeholder="Fx 12 34 56 78"
        className="w-full min-h-[44px] rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink font-mono focus:outline-none focus:border-brand mb-3"
      />
      {butik?.enabled && (
        <div className="mb-3">
          {TYPER.filter((t) => butik[t.butik]).map((t) => (
            <label key={t.nok} className="flex items-center gap-3 cursor-pointer min-h-[44px] py-1">
              <input type="checkbox" checked={!!form[t.nok]} onChange={(e) => sæt({ [t.nok]: e.target.checked })} className="w-5 h-5 accent-ink shrink-0" />
              <span className="text-sm text-ink">{t.titel}</span>
            </label>
          ))}
        </div>
      )}
      {fejl && <p role="alert" className="text-xs text-danger mb-2 flex items-center gap-1.5"><AlertCircle size={13} className="shrink-0" aria-hidden="true" /> {fejl}</p>}
      {ok && <p role="status" className="text-xs text-success mb-2 flex items-center gap-1.5"><Check size={13} className="shrink-0" aria-hidden="true" /> {ok}</p>}
      <div className="flex gap-2 flex-wrap">
        {butik?.enabled && (
          <button type="button" onClick={gem} disabled={busy || form.telefon.replace(/\D/g, "").length < 8} className="min-h-[44px] px-4 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-brand hover:bg-brand-dark transition-colors disabled:opacity-50 flex items-center gap-2">
            {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} {tilmeldt ? "Gem" : "Tilmeld mig"}
          </button>
        )}
        {tilmeldt && (
          <button type="button" onClick={fjern} disabled={busy} className="min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide text-ink border border-line hover:border-brand hover:text-brand transition-colors disabled:opacity-50">
            Fjern mit nummer
          </button>
        )}
      </div>
    </div>
  );
}

export { MinSmsAdvisering };
