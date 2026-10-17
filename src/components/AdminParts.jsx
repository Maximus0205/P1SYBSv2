import React, { useState, useEffect } from "react";
import { Trash2, X, Plus, Pencil, UserPlus, PalmtreeIcon, CalendarOff, KeyRound, Stethoscope, HeartPulse, ShieldCheck, Truck, Clock, Gauge, TimerReset } from "lucide-react";
import { vehicleLabel, technicianColor, todayISO, activeSickLeave } from "../data/domain";
import { updateSickLeaveWindow, updatePasswordPolicy, updateLoginPolicy } from "../lib/dataStore";
import { MinutesInput } from "../components/common";

// ---------------------------------------------------------------------------
// FÆLLES AFKRYDSNINGSLISTE (september 2026)
//
// Erstatter de "piller", til-/fravalg tidligere blev vist som overalt på
// Admin-siden. Formatet er lavet til korte ord i en flydende blok, og det
// var galt af to grunde: rettighedsnavnene er hele sætninger, som blev
// centreret midt i ovaler og brød over flere linjer - og selv for de korte
// navne var det svært at se, hvad der var slået til, fordi til/fra kun
// blev vist med farve.
//
// Et afkrydsningsfelt siger det samme uden at man skal lære en konvention.
// Rigtige <input type="checkbox"> frem for knapper med aria-pressed: det
// ER afkrydsningsfelter, og så virker tastatur og skærmlæser af sig selv,
// uden at vi skal efterligne noget.
//
// columns=2 bruges, hvor der er mange korte punkter (fx 17 varetyper) - en
// enkelt lang søjle ville fylde en hel skærm for en indstilling, man
// sjældent rører.
function CheckboxList({ items, columns = 1, disabled }) {
  return (
    <div className={`rounded-lg border border-line bg-white overflow-hidden ${columns === 2 ? "grid sm:grid-cols-2" : "divide-y divide-divider"}`}>
      {items.map((item, i) => (
        <label
          key={item.key}
          className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors ${disabled ? "opacity-50 pointer-events-none" : "hover:bg-panel"} ${
            columns === 2 ? "border-b border-divider" : ""
          }`}
        >
          <input
            type="checkbox"
            checked={item.checked}
            disabled={disabled}
            onChange={item.onChange}
            className="w-5 h-5 mt-0.5 shrink-0 accent-brand rounded focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <span className="min-w-0 flex-1">
            <span className={`block text-sm leading-snug ${item.checked ? "text-ink" : "text-muted"}`}>{item.label}</span>
            {item.note && (
              <span className={`block text-[10px] uppercase tracking-wide mt-0.5 ${item.noteTone === "danger" ? "text-danger" : "text-success"}`}>
                {item.note}
              </span>
            )}
          </span>
        </label>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TIL/FRA-KONTAKT (september 2026)
//
// En rigtig switch, ikke en afkrydsningskasse - bruges hvor til/fra er en
// STØRRE, mere vidtrækkende beslutning end et almindeligt afkrydsningsfelt
// (fx "sluk hele login-metoden for butikken"), og hvor et glidende visuelt
// udtryk (tydeligt grøn=til, grå=fra) gør konsekvensen lettere at se på et
// øjeblik end en lille kasse med flueben gør.
function Toggle({ checked, onChange, label, ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel || label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1 ${checked ? "bg-success" : "bg-line"}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

// Bruges af BÅDE NewUserForm og UserRow's nulstillings-felt, så de to
// vurderer "indeholder bogstaver og tal" på nøjagtig samme måde som
// edge-funktionerne, der reelt håndhæver kravet (admin-opret-bruger og
// admin-nulstil-adgangskode) - se noten ved LoginPolicySetting nedenfor.
const opfylderBlandingskrav = (adgangskode) => /[a-zA-ZæøåÆØÅ]/.test(adgangskode || "") && /[0-9]/.test(adgangskode || "");

// En "montør" er ikke længere en ROLLE, men alle der KØRER: rollen montor,
// eller enhver anden bruger, der har fået slået "kan køre rute" til (se
// UserRow nedenfor og koererSelv i App.jsx). Her på Montør-fanen styres
// hvilken bil personen kører i lige nu, og deres fraværsperioder.
//
// Selve TIL-/FRAVALGET af, om nogen kan køre, ligger bevidst på fanen
// Brugere - ikke her. Denne fane viser kun folk, der ALLEREDE er montører,
// så lå kontakten her, kunne man aldrig tilføje den første.
//
// TEMPO ER IKKE HER (september 2026, rettet efter tilbagemelding): det
// blev først forsøgt sat pr. person her, men appens arkitektur er allerede
// bil-centreret (sager tildeles en BIL, ikke en person), og deler flere
// personer en bil, var det uklart hvis tempo der reelt gjaldt. Tempo sidder
// nu i stedet på selve bilen, se VehicleRow nedenfor.
function TechnicianRow({ technician, vehicles, timeOff, onUpdateVehicle, onAddTimeOff, onDeleteTimeOff, onSygemeld, onRaskmeld, utenBil = false }) {
  const [showTimeOff, setShowTimeOff] = useState(false);
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(todayISO());
  const [note, setNote] = useState("");
  const [sygemelding, setSygemelding] = useState(false);
  const [sygeNote, setSygeNote] = useState("");
  const linkedVehicle = vehicles.find((b) => b.id === technician.bilId);
  const myTimeOff = timeOff.filter((f) => f.montorId === technician.id).sort((a, b) => a.startDato.localeCompare(b.startDato));
  const activeSick = activeSickLeave(technician.id, timeOff);

  const createTimeOff = () => {
    if (!start || !end || end < start) return;
    onAddTimeOff({ montorId: technician.id, startDato: start, slutDato: end, note: note.trim(), type: "ferie" });
    setNote("");
  };

  const confirmSygemeld = () => {
    onSygemeld(technician.id, sygeNote.trim());
    setSygeNote("");
    setSygemelding(false);
  };

  return (
    <div className={`rounded-xl bg-white border overflow-hidden shadow-sm ${activeSick ? "border-danger" : "border-line"}`}>
      <div className="p-3 flex items-center gap-3 flex-wrap">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: technicianColor(technician.id, [technician]) }} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-ink truncate">{technician.navn}</p>
          <p className="text-xs text-muted truncate">{utenBil ? "Medhjælper — bil sættes pr. dag i Planlægning" : linkedVehicle ? vehicleLabel(linkedVehicle) : "Ingen bil tilknyttet"}</p>
        </div>
        {!utenBil && (
          <select
            value={technician.bilId || ""}
            onChange={(e) => onUpdateVehicle(technician.id, e.target.value || null)}
            aria-label={`Bil for ${technician.navn}`}
            className="rounded-lg border border-line bg-panel px-2 py-2 text-xs text-ink focus:outline-none focus:border-brand"
          >
            <option value="">Ingen bil</option>
            {vehicles.map((b) => (
              <option key={b.id} value={b.id} disabled={b.lukket && b.id !== technician.bilId}>
                {vehicleLabel(b)}{b.lukket ? " (lukket)" : ""}
              </option>
            ))}
          </select>
        )}
        <button onClick={() => setShowTimeOff((v) => !v)} aria-expanded={showTimeOff} className="p-2 text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand rounded-lg flex items-center gap-1 text-xs font-semibold uppercase tracking-wide" title="Ferie">
          <PalmtreeIcon size={15} aria-hidden="true" /> Ferie{myTimeOff.filter((f) => f.type !== "sygdom").length > 0 ? ` (${myTimeOff.filter((f) => f.type !== "sygdom").length})` : ""}
        </button>
        {activeSick ? (
          <button onClick={() => onRaskmeld(activeSick.id)} className="px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-danger hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ink transition-opacity flex items-center gap-1.5" title="Raskmeld">
            <HeartPulse size={14} aria-hidden="true" /> Sygemeldt — Raskmeld
          </button>
        ) : (
          <button onClick={() => setSygemelding((v) => !v)} className="px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-danger border border-danger hover:bg-danger hover:text-white focus:outline-none focus:ring-2 focus:ring-danger transition-colors flex items-center gap-1.5" title="Sygemeld">
            <Stethoscope size={14} aria-hidden="true" /> Sygemeld
          </button>
        )}
      </div>

      {sygemelding && (
        <div className="border-t border-divider p-3 bg-danger/5">
          <p className="text-xs text-muted mb-2">Starter en sygemelding fra i dag — ingen slutdato endnu. Sagerne rykkes til "Sygemelding"-fanen i Planlægning, og montøren raskmeldes igen når de er tilbage.</p>
          <div className="flex gap-2 flex-wrap">
            <input value={sygeNote} onChange={(e) => setSygeNote(e.target.value)} placeholder="Note (valgfri)" aria-label="Note til sygemelding" className="flex-1 min-w-[140px] rounded-lg border border-line bg-white px-2 py-2 text-xs text-ink" />
            <button onClick={confirmSygemeld} className="px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-danger hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ink transition-opacity">Bekræft sygemelding</button>
            <button onClick={() => setSygemelding(false)} className="text-xs text-muted font-semibold uppercase px-2 py-2">Fortryd</button>
          </div>
        </div>
      )}

      {showTimeOff && (
        <div className="border-t border-divider p-3 bg-panel">
          <div className="flex gap-2 flex-wrap items-end mb-3">
            <label className="text-[11px] text-muted">Fra
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="block rounded-lg border border-line bg-white px-2 py-2 text-xs text-ink mt-0.5" />
            </label>
            <label className="text-[11px] text-muted">Til
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="block rounded-lg border border-line bg-white px-2 py-2 text-xs text-ink mt-0.5" />
            </label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (valgfri)" aria-label="Note til fravær" className="flex-1 min-w-[120px] rounded-lg border border-line bg-white px-2 py-2 text-xs text-ink" />
            <button onClick={createTimeOff} className="px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-brand hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1"><Plus size={13} aria-hidden="true" /> Tilføj</button>
          </div>
          {myTimeOff.length === 0 ? (
            <p className="text-xs text-muted italic">Ingen fraværsperioder registreret.</p>
          ) : (
            <div className="space-y-1.5">
              {myTimeOff.map((f) => (
                <div key={f.id} className={`flex items-center gap-2 text-xs rounded-lg bg-white border px-2 py-1.5 ${f.type === "sygdom" ? "border-danger" : "border-line"}`}>
                  {f.type === "sygdom" ? <Stethoscope size={12} className="text-danger shrink-0" aria-hidden="true" /> : <CalendarOff size={12} className="text-brand shrink-0" aria-hidden="true" />}
                  <span className="text-ink">{f.startDato} – {f.slutDato || "igangværende"}</span>
                  {f.note && <span className="text-muted truncate flex-1">{f.note}</span>}
                  <button onClick={() => onDeleteTimeOff(f.id)} aria-label={`Slet fravær ${f.startDato}`} className="ml-auto w-9 h-9 -my-1.5 flex items-center justify-center rounded-lg text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger"><X size={13} aria-hidden="true" /></button>
                </div>
              ))}
            </div>
          )}
          {linkedVehicle && <p className="text-[10px] text-muted mt-2">Bilen ({vehicleLabel(linkedVehicle)}) vises automatisk som blokeret i kørselsoverblikket i disse perioder — flytter montøren til en anden bil, følger blokeringen med.</p>}
        </div>
      )}
    </div>
  );
}

// Butiksindstilling: hvor mange timer frem en sygemeldt montørs sager
// vises i "Sygemelding"-fanen i Planlægning. Kalder en snævert afgrænset
// databasefunktion - IKKE et almindeligt tabelkald, fordi butiks-admins i
// øvrigt ikke har skriveadgang til stores-tabellen.
function SickLeaveWindowSetting({ store, onUpdated }) {
  const [hours, setHours] = useState(store?.sygemeldingVindueTimer ?? 48);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true); setError(""); setSaved(false);
    const result = await updateSickLeaveWindow(Number(hours), store?.id);
    setSaving(false);
    if (!result.ok) { setError(result.fejl || "Kunne ikke gemme."); return; }
    setSaved(true);
    onUpdated?.(Number(hours));
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="rounded-xl border border-line bg-white p-4 mb-4 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1 flex items-center gap-1.5"><Stethoscope size={15} className="text-danger" aria-hidden="true" /> Sygemelding — visningsvindue</h3>
      <p className="text-xs text-muted mb-3">Hvor mange timer frem skal en sygemeldt montørs sager vises i "Sygemelding"-oversigten i Planlægning, mens sygemeldingen er aktiv?</p>
      <div className="flex items-center gap-2 flex-wrap">
        <input type="number" min="1" max="720" value={hours} onChange={(e) => setHours(e.target.value)} aria-label="Antal timer" className="w-24 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
        <span className="text-sm text-muted">timer</span>
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-brand hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand transition-colors disabled:opacity-60">
          {saving ? "Gemmer..." : "Gem"}
        </button>
        {saved && <span className="text-xs text-success font-semibold">Gemt.</span>}
      </div>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LOGIN-KRAV
//
// Butikkens admin bestemmer kravene til den kode, brugerne vælger selv
// (stores.password_min_length - aldrig under 4 - og password_require_mixed).
// Det håndhæves server-side i login-with-pin (første login) og set-login-pin
// (Skift kode); UI'et her gemmer kun ønsket via update_password_policy.
// Midlertidige koder fra admin er altid 4 cifre og skal skiftes med det samme.
//
// Kontakten for Face ID/fingeraftryk (simple_login_enabled) gælder KUN det
// biometriske supplement - selve koden kan ikke slås fra.
function LoginPolicySetting({ store, onPasswordUpdated, onLoginPolicyUpdated }) {
  const [passwordMinLength, setPasswordMinLength] = useState(store?.adgangskodeMinLaengde ?? 6);
  const [requireMixed, setRequireMixed] = useState(store?.adgangskodeKraeverBlanding ?? false);
  const [simpleLoginEnabled, setSimpleLoginEnabled] = useState(store?.simpelLoginAktiveret !== false);
  const [idleMinutes, setIdleMinutes] = useState(store?.sessionIdleMinutter ?? 480);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    const pwN = Math.min(64, Math.max(4, Math.round(Number(passwordMinLength)) || 4));
    const idleN = Math.min(10080, Math.max(5, Math.round(Number(idleMinutes)) || 480));
    setPasswordMinLength(pwN); setIdleMinutes(idleN);
    setSaving(true); setError(""); setSaved(false);
    const [pwResult, loginResult] = await Promise.all([
      updatePasswordPolicy({ minLaengde: pwN, kraeverBlanding: requireMixed, storeId: store?.id }),
      updateLoginPolicy({ simpelLoginAktiveret: simpleLoginEnabled, sessionIdleMinutter: idleN, storeId: store?.id }),
    ]);
    setSaving(false);
    if (!pwResult.ok || !loginResult.ok) { setError(pwResult.fejl || loginResult.fejl || "Kunne ikke gemme."); return; }
    setSaved(true);
    onPasswordUpdated?.({ minLength: pwN, requireMixed });
    onLoginPolicyUpdated?.({ simpleLoginEnabled, sessionIdleMinutes: idleN });
    setTimeout(() => setSaved(false), 1500);
  };

  const timeoutTekst = idleMinutes >= 60 ? `${(idleMinutes / 60).toFixed(idleMinutes % 60 === 0 ? 0 : 1)} timer` : `${idleMinutes} minutter`;

  return (
    <div className="rounded-xl border border-line bg-white p-4 mb-4 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1 flex items-center gap-1.5"><KeyRound size={15} className="text-brand" aria-hidden="true" /> Login-krav</h3>
      <p className="text-xs text-muted mb-4">Gælder nye koder fremover - eksisterende koder kan stadig bruges.</p>

      <div className="rounded-lg bg-panel p-3 mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-2">Kode til login</p>
        <label className="flex items-center gap-2 text-sm text-ink mb-2">
          Mindst
          <input type="number" min="4" max="64" value={passwordMinLength} onChange={(e) => setPasswordMinLength(e.target.value)} aria-label="Minimum antal tegn i koden" className="w-16 rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink text-center focus:outline-none focus:border-brand" />
          tegn
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={requireMixed} onChange={(e) => setRequireMixed(e.target.checked)} className="w-4 h-4 accent-brand" />
          <span className="text-sm text-ink">Kræver både bogstaver og tal</span>
        </label>
        <p className="text-[10px] text-muted mt-2">Koden kan aldrig være kortere end 4 tegn. Kravet gælder, når en bruger vælger sin egen kode (første login og "Skift kode"). Midlertidige koder fra admin er altid 4 cifre og skal skiftes med det samme.</p>
      </div>

      <div className="rounded-lg bg-panel p-3 mb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">Face ID/fingeraftryk</p>
            <p className="text-[11px] text-muted mt-0.5">Brugerne logger ind med butiksnummer, brugernavn (initialer) og kode. Face ID/fingeraftryk er et valgfrit supplement, hver bruger sætter op under "Din konto". Sluk kontakten for at forbyde det i butikken.</p>
          </div>
          <Toggle checked={simpleLoginEnabled} onChange={setSimpleLoginEnabled} ariaLabel="Tillad biometrisk login (Face ID/fingeraftryk)" />
        </div>
      </div>

      <div className="rounded-lg bg-panel p-3 mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-2">Automatisk log ud</p>
        <label className="flex items-center gap-2 text-sm text-ink flex-wrap">
          <TimerReset size={14} className="text-muted shrink-0" aria-hidden="true" /> Log ud efter
          <input type="number" min="5" max="10080" value={idleMinutes} onChange={(e) => setIdleMinutes(e.target.value)} aria-label="Minutters inaktivitet før automatisk log ud" className="w-20 rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink text-center focus:outline-none focus:border-brand" />
          minutters inaktivitet
        </label>
        <p className="text-[10px] text-muted mt-2">Nu sat til {timeoutTekst}. Klik/tastetryk/berøring nulstiller tælleren - kun reel inaktivitet tæller.</p>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-brand hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand transition-colors disabled:opacity-60">
          {saving ? "Gemmer..." : "Gem"}
        </button>
        {saved && <span className="text-xs text-success font-semibold">Gemt.</span>}
      </div>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TEMPO PR. BIL (september 2026, rettet - flyttet hertil fra Montører)
//
// Procent af normalt tempo (100 = normalt) - bruges UDELUKKENDE til at
// justere kapacitets-/overbelastningsberegningen i Planlægnings-fanens
// "Overblik" (se domain.js: vehiclePaceFactor). Rører IKKE selve sagens
// tidsestimat - det tal en sælger ser og eventuelt retter ved oprettelse,
// og som gælder for HVEM SOM HELST der får sagen.
//
// EN SLIDER, IKKE ET FRIT TALFELT: et almindeligt tal-input kunne (indtil
// blur-tjekket nåede at rette det) vise et absurd tal som 900% undervejs.
// En slider kan slet ikke antage en værdi uden for sit min/max - der er
// intet at rette i efterhånden, feltet er født begrænset.
//
// SAT PÅ SELVE BILEN, IKKE MONTØREN (se noten ved TechnicianRow ovenfor og
// vehiclePaceFactor i domain.js for hvorfor) - beskyttet af admin_biler i
// databasens RLS, en sælger kan ikke ændre det.
function TempoSlider({ value, onCommit }) {
  const clamp = (n) => Math.min(200, Math.max(50, Math.round(n) || 100));
  const [local, setLocal] = useState(clamp(value ?? 100));
  useEffect(() => { setLocal(clamp(value ?? 100)); }, [value]);
  const commit = () => { if (local !== value) onCommit(local); };
  return (
    <div className="flex items-center gap-2 min-w-[150px]" title="Tempo: justerer KUN kapacitetsberegningen i Planlægning (100% = normalt) - ændrer ikke selve sagens tidsestimat.">
      <Gauge size={13} className="text-muted shrink-0" aria-hidden="true" />
      <input
        type="range"
        min={50}
        max={200}
        step={5}
        value={local}
        onChange={(e) => setLocal(Number(e.target.value))}
        onMouseUp={commit}
        onTouchEnd={commit}
        onKeyUp={commit}
        aria-label="Tempo i procent af normalt"
        className="flex-1 accent-brand"
      />
      <span className="text-xs font-mono text-ink w-9 text-right shrink-0">{local}%</span>
    </div>
  );
}

function VehicleRow({ vehicle, usedBy, onUpdate, onDelete, onToggleClosed }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(vehicle.navn);
  const [plate, setPlate] = useState(vehicle.nummerplade);
  const [showCloseReason, setShowCloseReason] = useState(false);
  const [reason, setReason] = useState("Værksted");

  if (editing) {
    return (
      <div className="rounded-xl bg-white border border-line p-2.5 flex items-center gap-2 flex-wrap shadow-sm">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Navn/tag, fx 'Bil 1'" aria-label="Bilens navn" className="flex-1 min-w-[120px] rounded-lg border border-line bg-panel px-2 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
        <input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="Nummerplade" aria-label="Nummerplade" className="flex-1 min-w-[120px] rounded-lg border border-line bg-panel px-2 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
        <button onClick={() => { onUpdate({ navn: name.trim() || vehicle.navn, nummerplade: plate.trim() || vehicle.nummerplade }); setEditing(false); }} className="text-xs text-success font-semibold uppercase px-2 py-2">Gem</button>
        <button onClick={() => { setName(vehicle.navn); setPlate(vehicle.nummerplade); setEditing(false); }} className="text-xs text-muted font-semibold uppercase px-2 py-2">Fortryd</button>
      </div>
    );
  }
  return (
    <div className={`rounded-xl bg-white border p-2.5 flex items-center gap-2 flex-wrap shadow-sm ${vehicle.lukket ? "border-brand opacity-70" : "border-line"}`}>
      <p className="text-sm text-ink flex-1 truncate min-w-[80px]">{vehicleLabel(vehicle)}</p>
      {vehicle.lukket && <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md border border-brand text-brand shrink-0">Lukket{vehicle.lukketAarsag ? ` · ${vehicle.lukketAarsag}` : ""}</span>}
      {usedBy && <span className="text-[10px] text-muted shrink-0">kører af {usedBy}</span>}
      <TempoSlider value={vehicle.tempo} onCommit={(n) => onUpdate({ tempo: n })} />
      {showCloseReason ? (
        <div className="flex items-center gap-1 shrink-0">
          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Årsag (fx værksted)" aria-label="Årsag til blokering" className="w-32 rounded-lg border border-line bg-panel px-1.5 py-2 text-[10px] text-ink" />
          <button onClick={() => { onToggleClosed(vehicle.id, reason.trim() || "Værksted"); setShowCloseReason(false); }} className="text-[10px] font-semibold uppercase text-white bg-brand rounded-lg px-2 py-2">Luk</button>
          <button onClick={() => setShowCloseReason(false)} className="text-[10px] text-muted px-2 py-2">Fortryd</button>
        </div>
      ) : (
        <button onClick={() => (vehicle.lukket ? onToggleClosed(vehicle.id) : setShowCloseReason(true))} className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-2 rounded-md border shrink-0 focus:outline-none focus:ring-2 focus:ring-brand ${vehicle.lukket ? "border-success text-success hover:bg-success hover:text-white" : "border-brand text-brand hover:bg-brand hover:text-white"} transition-colors`}>
          {vehicle.lukket ? "Åbn igen" : "Blokér (fx værksted)"}
        </button>
      )}
      <button onClick={() => setEditing(true)} aria-label={`Ret navn og nummerplade for ${vehicle.navn}`} className="w-9 h-9 flex items-center justify-center rounded-lg text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand shrink-0" title="Ret navn/nummerplade"><Pencil size={13} aria-hidden="true" /></button>
      <button onClick={onDelete} aria-label={`Slet ${vehicle.navn}`} className="w-9 h-9 flex items-center justify-center rounded-lg text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger shrink-0" title="Slet"><Trash2 size={13} aria-hidden="true" /></button>
    </div>
  );
}

const PERMISSION_CATEGORY_LABEL = { side: "Faner/sider", sag: "Redigering på sager" };

// Rettigheds-editor for ÉN bruger. En bruger har altid en ROLLE (et fast
// sæt standardrettigheder) - denne editor lader en admin med
// admin_brugere TILFØJE noget ud over standarden, eller FRATAGE noget
// rollen ellers ville give, for netop denne person. Håndhæves også i
// databasen, så det ikke kan omgås ved at redigere UI'et.
function PermissionsEditor({ user, permissionsCatalog, roleDefaults, onUpdatePermissions }) {
  const [busy, setBusy] = useState(false);
  const roleDefaultSet = new Set(roleDefaults[user.rolle] || []);
  const extra = user.extraPermissions || [];
  const revoked = user.revokedPermissions || [];

  const isChecked = (key) => (roleDefaultSet.has(key) || extra.includes(key)) && !revoked.includes(key);
  const isFromRole = (key) => roleDefaultSet.has(key);

  const toggle = async (key) => {
    const checked = isChecked(key);
    let nextExtra = extra;
    let nextRevoked = revoked;
    if (checked) {
      // Slå fra: kommer den fra rollen, skal den eksplicit fratages;
      // ellers er den bare en individuel tilføjelse, der fjernes igen.
      nextExtra = extra.filter((k) => k !== key);
      nextRevoked = isFromRole(key) ? [...revoked.filter((k) => k !== key), key] : revoked;
    } else {
      nextRevoked = revoked.filter((k) => k !== key);
      nextExtra = isFromRole(key) ? extra : [...extra.filter((k) => k !== key), key];
    }
    setBusy(true);
    await onUpdatePermissions(user.id, { extraPermissions: nextExtra, revokedPermissions: nextRevoked });
    setBusy(false);
  };

  const byCategory = {};
  permissionsCatalog.forEach((p) => { (byCategory[p.category] ||= []).push(p); });

  return (
    <div className="border-t border-divider p-3 bg-panel space-y-4">
      {permissionsCatalog.length === 0 ? (
        <p className="text-xs text-muted italic">Indlæser rettighedskatalog...</p>
      ) : (
        Object.entries(byCategory).map(([category, perms]) => (
          <div key={category}>
            <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">{PERMISSION_CATEGORY_LABEL[category] || category}</p>
            <CheckboxList
              disabled={busy}
              items={perms.map((p) => {
                const checked = isChecked(p.key);
                const fromRole = isFromRole(p.key);
                // Kun de rettigheder, der AFVIGER fra rollens standard, får
                // en mærkat. Stod der "standard" ved hver eneste afkrydsede
                // linje, ville netop de individuelle ændringer - dem man
                // skal kunne få øje på - drukne i gentagelser.
                const afviger = fromRole !== checked;
                return {
                  key: p.key,
                  label: p.label,
                  checked,
                  onChange: () => toggle(p.key),
                  note: afviger
                    ? (checked ? "Tilføjet ud over rollen" : `Frataget (rollen ${ROLE_LABEL[user.rolle] || user.rolle} har den normalt)`)
                    : null,
                  noteTone: checked ? "success" : "danger",
                };
              })}
            />
          </div>
        ))
      )}
      <p className="text-[10px] text-muted">
        Uden mærkat følger rettigheden rollens standard. Ændringer gemmes med det samme og gælder kun denne bruger.
      </p>
    </div>
  );
}

function UserRow({ user, vehicle, currentUserId, onUpdate, onDelete, onResetPin, permissionsCatalog, roleDefaults, onUpdatePermissions }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.navn);
  const [pinInfo, setPinInfo] = useState(null); // { pin } | { fejl }
  const [busy, setBusy] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);

  // Nulstiller PIN til en tilfældig, midlertidig kode. Den vises KUN her, én gang -
  // admin giver den videre, og brugeren vælger selv en ny ved næste login.
  const resetPin = async () => {
    if (!window.confirm(`Nulstil PIN-koden for ${user.navn}?\n\nDen nuværende PIN holder op med at virke, og du får en ny midlertidig PIN, som du giver videre til ${user.navn}.`)) return;
    setBusy(true);
    const result = await onResetPin(user.id);
    setBusy(false);
    setPinInfo(result?.ok ? { pin: result.pin } : { fejl: result?.fejl || "Kunne ikke nulstille PIN-koden." });
  };

  const canEditPermissions = user.id !== currentUserId && onUpdatePermissions && permissionsCatalog;

  // KAN KØRE RUTE. Rollen 'montor' kører altid - for dem er der intet at
  // slå til eller fra, og knappen vises derfor ikke. For alle andre roller
  // er det et valg: en sælger eller admin, der tager en rute en gang
  // imellem, skal ikke have en ekstra brugerkonto. To konti for samme
  // menneske spreder sagerne over to navne og sender notifikationer til
  // den forkerte af dem.
  // MEDHJÆLPER (oktober 2026): ekstra bemanding. Kører altid med (ser dagens tur), men har ingen fast bil - den sættes pr. dag i
  // Planlægning. Derfor ingen "Kører rute"-knap og ingen "mangler bil"-advarsel.
  const erMedhjaelper = user.rolle === "medhjaelper";
  const erFastMontor = user.rolle === "montor" || erMedhjaelper;
  const koerer = erFastMontor || user.kanKoere === true;

  return (
    <div className="rounded-xl bg-white border border-line overflow-hidden shadow-sm">
      <div className="p-3 flex items-center gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-1.5">
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Brugerens navn" className="rounded-lg border border-line bg-panel px-2 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
              <button onClick={() => { onUpdate(user.id, { navn: name.trim() || user.navn }); setEditing(false); }} className="text-xs text-success font-semibold uppercase px-2 py-2">Gem</button>
              <button onClick={() => { setName(user.navn); setEditing(false); }} className="text-xs text-muted font-semibold uppercase px-2 py-2">Fortryd</button>
            </div>
          ) : (
            <p className="font-semibold text-sm text-ink truncate">{user.navn}</p>
          )}
          <p className="text-xs text-muted truncate">
            {ROLE_LABEL[user.rolle] || user.rolle}
            {user.brugernavn && <span> · brugernavn "{user.brugernavn}"</span>}
            {erMedhjaelper ? <span> · bil sættes pr. dag i Planlægning</span> : koerer && <span> · {vehicle ? vehicleLabel(vehicle) : "kører rute, ingen bil endnu"}</span>}
            {(user.extraPermissions?.length > 0 || user.revokedPermissions?.length > 0) && <span> · rettigheder tilpasset</span>}
          </p>
        </div>
        <select value={user.rolle} onChange={(e) => onUpdate(user.id, { rolle: e.target.value })} aria-label={`Rolle for ${user.navn}`} className="rounded-lg border border-line bg-panel px-2 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-brand">
          {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {!erFastMontor && (
          <button
            onClick={() => onUpdate(user.id, { kanKoere: !user.kanKoere })}
            aria-pressed={!!user.kanKoere}
            aria-label={`${user.kanKoere ? "Fjern" : "Giv"} ${user.navn} mulighed for at køre montørrute`}
            title={user.kanKoere ? "Kører rute — klik for at fjerne" : "Kan ikke køre rute — klik for at tilføje"}
            className={`h-10 px-3 flex items-center gap-1.5 rounded-lg border text-xs font-semibold uppercase tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-brand ${
              user.kanKoere ? "border-success bg-success/10 text-success" : "border-line text-muted hover:border-brand hover:text-brand"
            }`}
          >
            <Truck size={14} aria-hidden="true" /> Kører rute
          </button>
        )}
        {canEditPermissions && (
          <button onClick={() => setShowPermissions((v) => !v)} aria-expanded={showPermissions} aria-label={`Rettigheder for ${user.navn}`} className="w-10 h-10 flex items-center justify-center rounded-lg text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand" title="Rettigheder">
            <ShieldCheck size={15} aria-hidden="true" />
          </button>
        )}
        {!editing && <button onClick={() => { setName(user.navn); setEditing(true); }} aria-label={`Ret navn på ${user.navn}`} className="w-10 h-10 flex items-center justify-center rounded-lg text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand" title="Ret navn"><Pencil size={15} aria-hidden="true" /></button>}
        {onResetPin && user.id !== currentUserId && <button onClick={resetPin} disabled={busy} aria-label={`Nulstil PIN for ${user.navn}`} className="w-10 h-10 flex items-center justify-center rounded-lg text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-60" title="Nulstil PIN"><KeyRound size={15} aria-hidden="true" /></button>}
        {/* Tooltip'en sagde tidligere "Fjern adgang", fordi knappen dengang
            blot fjernede butikstilknytningen. Den SLETTER nu brugeren
            permanent, og en knap må ikke beskrive sig selv mildere end den
            handler. Bekræftelsen ligger i useUsers.js. */}
        {user.id !== currentUserId && (
          <button onClick={() => onDelete(user.id)} aria-label={`Slet brugeren ${user.navn} permanent`} className="w-10 h-10 flex items-center justify-center rounded-lg text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger" title="Slet bruger permanent">
            <Trash2 size={15} aria-hidden="true" />
          </button>
        )}
      </div>
      {!erFastMontor && user.kanKoere && !vehicle && (
        <p className="px-3 pb-2 text-[11px] text-brand">Tildel en bil under fanen "Montører", før personen kan få sager.</p>
      )}
      {pinInfo && (
        <div className="px-3 pb-3" role="status">
          {pinInfo.pin ? (
            <div className="rounded-lg border border-success bg-success/5 p-3 flex items-center gap-3 flex-wrap">
              <p className="text-sm text-ink flex-1 min-w-[200px]">Midlertidig PIN for {user.navn}: <span className="font-mono text-lg font-bold tracking-[0.3em] ml-1">{pinInfo.pin}</span>
                <span className="block text-[11px] text-muted mt-0.5">Vises kun nu. {user.navn} vælger selv en ny PIN ved næste login.</span></p>
              <button onClick={() => setPinInfo(null)} className="px-3 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-wide text-ink border border-line hover:border-brand">Luk</button>
            </div>
          ) : (
            <p className="text-xs text-danger">{pinInfo.fejl} <button onClick={() => setPinInfo(null)} className="underline ml-1">Luk</button></p>
          )}
        </div>
      )}
      {showPermissions && canEditPermissions && (
        <PermissionsEditor user={user} permissionsCatalog={permissionsCatalog} roleDefaults={roleDefaults} onUpdatePermissions={onUpdatePermissions} />
      )}
      {user.id === currentUserId && (
        <p className="px-3 pb-2 text-[10px] text-muted italic">Du kan ikke ændre dine egne rettigheder eller rolle - og heller ikke slette din egen bruger. Bed en anden administrator om det.</p>
      )}
    </div>
  );
}

// Foreslår initialer ud fra et navn: "Magnus Andersen" -> "ma" (første bogstav i hvert ord, max 5).
// Er der kun ét ord, bruges de to første bogstaver. Kan altid rettes af admin.
const foreslaaInitialer = (navn) => {
  const ord = (navn || "").trim().toLowerCase().replace(/æ/g, "a").replace(/ø/g, "o").replace(/å/g, "a").replace(/[^a-z\s]/g, "").split(/\s+/).filter(Boolean);
  if (ord.length === 0) return "";
  if (ord.length === 1) return ord[0].slice(0, 2);
  return ord.map((o) => o[0]).join("").slice(0, 5);
};
const erGyldigeInitialer = (v) => /^[a-z]{2,5}$/.test((v || "").trim().toLowerCase());

function NewUserForm({ onAdd, butiksnummer }) {
  const [name, setName] = useState("");
  const [initials, setInitials] = useState("");
  const [initialsEdited, setInitialsEdited] = useState(false);
  const [role, setRole] = useState("saelger");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [oprettet, setOprettet] = useState(null); // { navn, brugernavn, pin, butiksnummer }

  const changeName = (val) => {
    setName(val);
    if (!initialsEdited) setInitials(foreslaaInitialer(val));
  };

  const create = async () => {
    setError("");
    if (!name.trim()) { setError("Udfyld navn."); return; }
    if (!erGyldigeInitialer(initials)) { setError("Initialer skal være 2-5 bogstaver (a-z, uden æøå og mellemrum)."); return; }
    setBusy(true);
    const brugernavn = initials.trim().toLowerCase();
    const result = await onAdd({ navn: name.trim(), loginType: "pin", brugernavn, rolle: role });
    setBusy(false);
    if (!result.ok) { setError(result.fejl || "Kunne ikke oprette brugeren."); return; }
    setOprettet({ navn: name.trim(), brugernavn, pin: result.midlertidigPin, butiksnummer: result.butiksnummer || butiksnummer });
    setName(""); setInitials(""); setInitialsEdited(false); setRole("saelger");
  };

  return (
    <div className="rounded-xl border border-line bg-white p-5 mb-6 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1">Opret ny bruger</h3>
      <p className="text-xs text-muted mb-3">Brugeren logger ind med butiksnummer{butiksnummer ? ` (${butiksnummer})` : ""}, brugernavn (initialer) og en kode. Du får en midlertidig kode, som brugeren selv skifter ved første login.</p>
      {oprettet && (
        <div className="rounded-lg border border-success bg-success/5 p-3 mb-4" role="status">
          <p className="text-sm font-semibold text-ink mb-1">{oprettet.navn} er oprettet. Giv personen disse loginoplysninger:</p>
          <dl className="text-sm text-ink grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5">
            <dt className="text-muted">Butiksnummer</dt><dd className="font-mono">{oprettet.butiksnummer || "—"}</dd>
            <dt className="text-muted">Brugernavn</dt><dd className="font-mono">{oprettet.brugernavn}</dd>
            <dt className="text-muted">Midlertidig PIN</dt><dd className="font-mono text-lg font-bold tracking-[0.3em]">{oprettet.pin}</dd>
          </dl>
          <p className="text-[11px] text-muted mt-2">PIN'en vises kun nu. Mister du den, kan du nulstille den på brugeren i listen nedenfor.</p>
          <button onClick={() => setOprettet(null)} className="mt-2 px-3 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-wide text-ink border border-line hover:border-brand">Luk</button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <input value={name} onChange={(e) => changeName(e.target.value)} placeholder="Navn" aria-label="Navn" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
        <input value={initials} onChange={(e) => { setInitials(e.target.value.toLowerCase().replace(/[^a-z]/g, "").slice(0, 5)); setInitialsEdited(true); }} placeholder="Initialer (foreslået, kan rettes)" aria-label="Brugernavn (initialer)" autoCapitalize="off" autoCorrect="off" spellCheck={false} className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink font-mono focus:outline-none focus:border-brand" />
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Rolle" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand sm:col-span-2">
          <option value="saelger">Sælger (opret sager, Planlægning, Lager, Arkiv)</option>
          <option value="montor">Montør (kun sin egen rute)</option>
          <option value="medhjaelper">Medhjælper (løfter og pakker ud, ser dagens tur)</option>
          <option value="lager">Lager (kun Lager-siden)</option>
          <option value="admin">Administrator (alt, inkl. Opsætning)</option>
        </select>
      </div>
      {role === "montor" && <p className="text-[11px] text-muted mt-2">Bil tilknyttes bagefter under fanen "Montører".</p>}
      {role === "medhjaelper" && <p className="text-[11px] text-muted mt-2">En medhjælper har ingen fast bil — hvem der kører med hvilken bil, sættes pr. dag i Planlægning (systemet kan foreslå det).</p>}
      {role !== "montor" && role !== "medhjaelper" && (
        <p className="text-[11px] text-muted mt-2">
          Skal personen også kunne køre en rute en gang imellem, slås "Kører rute" til på brugeren i listen nedenfor — det kræver ikke en ekstra konto.
        </p>
      )}
      {error && <p role="alert" className="text-xs text-danger mt-2">{error}</p>}
      <button onClick={create} disabled={busy} className="mt-3 px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-brand hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5 disabled:opacity-60">
        <UserPlus size={15} aria-hidden="true" /> {busy ? "Opretter..." : "Opret bruger"}
      </button>
    </div>
  );
}

const ROLE_LABEL = { admin: "Administrator", saelger: "Sælger", montor: "Montør", lager: "Lager", medhjaelper: "Medhjælper" };

// ---------- Varekategorier ----------

function ProductCategoryAdmin({ productCategories, onAdd, onUpdate, onDelete }) {
  const [newName, setNewName] = useState("");
  return (
    <div>
      <div className="rounded-xl border border-line bg-white p-5 mb-4 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-3">Opret ny varekategori</h3>
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Fx 'Hvidevare'" aria-label="Navn på varekategori" className="flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
          <button onClick={() => { if (!newName.trim()) return; onAdd(newName.trim()); setNewName(""); }} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-brand hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5"><Plus size={15} aria-hidden="true" /> Opret</button>
        </div>
      </div>
      <div className="space-y-2">
        {productCategories.map((k) => <EditableNameRow key={k.id} item={k} onUpdate={(navn) => onUpdate(k.id, navn)} onDelete={() => onDelete(k.id)} />)}
      </div>
    </div>
  );
}

function EditableNameRow({ item, onUpdate, onDelete, extra, extraContent }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.navn);
  return (
    <div className="rounded-xl bg-white border border-line p-3 shadow-sm">
      <div className="flex items-center gap-2 flex-wrap">
        {editing ? (
          <>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Navn" className="flex-1 min-w-[140px] rounded-lg border border-line bg-panel px-2 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
            <button onClick={() => { onUpdate(name.trim() || item.navn); setEditing(false); }} className="text-xs text-success font-semibold uppercase px-2 py-2">Gem</button>
            <button onClick={() => { setName(item.navn); setEditing(false); }} className="text-xs text-muted font-semibold uppercase px-2 py-2">Fortryd</button>
          </>
        ) : (
          <>
            <p className="font-semibold text-sm text-ink flex-1">{item.navn}</p>
            {extra}
            <button onClick={() => setEditing(true)} aria-label={`Ret ${item.navn}`} className="w-9 h-9 flex items-center justify-center rounded-lg text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand"><Pencil size={14} aria-hidden="true" /></button>
            <button onClick={onDelete} aria-label={`Slet ${item.navn}`} className="w-9 h-9 flex items-center justify-center rounded-lg text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger"><Trash2 size={14} aria-hidden="true" /></button>
          </>
        )}
      </div>
      {extraContent}
    </div>
  );
}

// ---------- Varetyper ----------

function ProductTypeRow({ productType, productCategories, onUpdate, onDelete }) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(productType.navn);

  return (
    <div className="rounded-xl border border-line bg-white p-3 flex items-center gap-2 flex-wrap shadow-sm">
      {editingName ? (
        <div className="flex items-center gap-2 flex-1 min-w-[160px]">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Varetypens navn" className="flex-1 rounded-lg border border-line bg-panel px-2 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
          <button onClick={() => { onUpdate(productType.id, { navn: name.trim() || productType.navn }); setEditingName(false); }} className="text-xs text-success font-semibold uppercase px-2 py-2">Gem</button>
          <button onClick={() => { setName(productType.navn); setEditingName(false); }} className="text-xs text-muted font-semibold uppercase px-2 py-2">Fortryd</button>
        </div>
      ) : (
        <p className="font-semibold text-sm text-ink flex-1">{productType.navn}</p>
      )}
      <select value={productType.kategoriId || ""} onChange={(e) => onUpdate(productType.id, { kategoriId: e.target.value || null })} aria-label={`Kategori for ${productType.navn}`} className="rounded-lg border border-line bg-panel px-2 py-2 text-xs text-ink shrink-0">
        <option value="">Ingen kategori</option>
        {productCategories.map((k) => <option key={k.id} value={k.id}>{k.navn}</option>)}
      </select>
      {!editingName && <button onClick={() => setEditingName(true)} aria-label={`Ret ${productType.navn}`} className="w-9 h-9 flex items-center justify-center rounded-lg text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand shrink-0"><Pencil size={14} aria-hidden="true" /></button>}
      <button onClick={() => onDelete(productType.id)} aria-label={`Slet ${productType.navn}`} className="w-9 h-9 flex items-center justify-center rounded-lg text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger shrink-0"><Trash2 size={14} aria-hidden="true" /></button>
    </div>
  );
}

function ProductTypeAdmin({ productTypes, productCategories, onAdd, onUpdate, onDelete }) {
  const [newName, setNewName] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  return (
    <div>
      <div className="rounded-xl border border-line bg-white p-5 mb-4 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-3">Opret ny varetype</h3>
        <div className="flex gap-2 flex-wrap">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Fx 'Kaffemaskine'" aria-label="Navn på varetype" className="flex-1 min-w-[160px] rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
          <select value={newCategoryId} onChange={(e) => setNewCategoryId(e.target.value)} aria-label="Kategori" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink">
            <option value="">Ingen kategori</option>
            {productCategories.map((k) => <option key={k.id} value={k.id}>{k.navn}</option>)}
          </select>
          <button onClick={() => { if (!newName.trim()) return; onAdd(newName.trim(), newCategoryId || null); setNewName(""); setNewCategoryId(""); }} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-brand hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5"><Plus size={15} aria-hidden="true" /> Opret</button>
        </div>
      </div>
      <p className="text-[11px] text-muted mb-2">Hvilke tillægsydelser der er relevante for en varetype styres under fanen "Tillægsydelser" - vælg der hvilke varetyper hver tillægsydelse gælder for.</p>
      <div className="grid sm:grid-cols-2 gap-2">
        {productTypes.map((v) => (
          <ProductTypeRow key={v.id} productType={v} productCategories={productCategories} onUpdate={onUpdate} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

// ---------- Primære ydelser ----------
// INTET fast tidsestimat sidder direkte på den primære ydelse selv - tiden
// afhænger nemlig også af HVILKEN VARETYPE den bruges på (montering af et
// TV og montering af et køleskab er ikke samme opgave). Standardtiden
// sættes derfor i sin egen fane ("Standardtider"), som en matrix af
// varetype × primær ydelse - se DefaultTimeEstimateAdmin nedenfor.

function PrimaryServiceRow({ service, onUpdate, onDelete }) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(service.navn);
  return (
    <div className="rounded-xl border border-line bg-white p-3 flex items-center gap-2 flex-wrap shadow-sm">
      {editingName ? (
        <div className="flex items-center gap-2 flex-1 min-w-[160px]">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Ydelsens navn" className="flex-1 rounded-lg border border-line bg-panel px-2 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
          <button onClick={() => { onUpdate(service.id, { navn: name.trim() || service.navn }); setEditingName(false); }} className="text-xs text-success font-semibold uppercase px-2 py-2">Gem</button>
          <button onClick={() => { setName(service.navn); setEditingName(false); }} className="text-xs text-muted font-semibold uppercase px-2 py-2">Fortryd</button>
        </div>
      ) : (
        <p className="font-semibold text-sm text-ink flex-1">{service.navn}</p>
      )}
      {!editingName && <button onClick={() => setEditingName(true)} aria-label={`Ret ${service.navn}`} className="w-9 h-9 flex items-center justify-center rounded-lg text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand shrink-0"><Pencil size={14} aria-hidden="true" /></button>}
      <button onClick={() => onDelete(service.id)} aria-label={`Slet ${service.navn}`} className="w-9 h-9 flex items-center justify-center rounded-lg text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger shrink-0"><Trash2 size={14} aria-hidden="true" /></button>
    </div>
  );
}

function PrimaryServiceAdmin({ primaryServices, onAdd, onUpdate, onDelete }) {
  const [newName, setNewName] = useState("");
  return (
    <div>
      <div className="rounded-xl border border-line bg-white p-5 mb-4 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-3">Opret ny primær ydelse</h3>
        <div className="flex gap-2 flex-wrap">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Fx 'Montering'" aria-label="Navn på primær ydelse" className="flex-1 min-w-[160px] rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
          <button onClick={() => { if (!newName.trim()) return; onAdd(newName.trim()); setNewName(""); }} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-brand hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5"><Plus size={15} aria-hidden="true" /> Opret</button>
        </div>
      </div>
      <p className="text-[11px] text-muted mb-2">Hvilke tillægsydelser der er tilgængelige under en given primær ydelse styres under fanen "Tillægsydelser". Standardtid pr. varetype sættes under fanen "Standardtider".</p>
      <div className="space-y-2">
        {primaryServices.map((p) => (
          <PrimaryServiceRow key={p.id} service={p} onUpdate={onUpdate} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

// ---------- Tillægsydelser ----------
// Her styres relationerne ét sted: hvilke primære ydelser en tillægsydelse
// gælder under (påkrævet), og valgfrit hvilke varetyper den er begrænset
// til (tomt = gælder alle).
//
// Også her er pillerne væk. Varetyperne står i TO KOLONNER, så de 17
// punkter ikke bliver til en meterlang søjle for en indstilling, man
// sjældent rører - se CheckboxList øverst i filen.
//
// STANDARDTID (september 2026, udvidet): tallet her er et FLADT
// UDGANGSPUNKT, der gælder alle varetyper ("dørvending tager cirka det
// samme uanset køleskabsmærke") - bruges når tillægget vælges på en
// varelinje, hvis der IKKE er sat en mere præcis tid for netop den
// varetype i "Standardtider"-matrixen (se DefaultTimeEstimateAdmin
// nedenfor, og getDefaultEstimateMinutes i domain.js: matrixen har
// forrang, dette tal er faldbacken).
function AddOnServiceRow({ service, productTypes, primaryServices, onUpdate, onDelete }) {
  const togglePrimary = (pId) => {
    const has = (service.primaerYdelser || []).includes(pId);
    onUpdate(service.id, { primaerYdelser: has ? service.primaerYdelser.filter((x) => x !== pId) : [...(service.primaerYdelser || []), pId] });
  };
  const toggleProductType = (vId) => {
    const has = (service.varetyper || []).includes(vId);
    onUpdate(service.id, { varetyper: has ? service.varetyper.filter((x) => x !== vId) : [...(service.varetyper || []), vId] });
  };
  const isUniversal = !service.varetyper || service.varetyper.length === 0;

  return (
    <EditableNameRow
      item={service}
      onUpdate={(navn) => onUpdate(service.id, { navn })}
      onDelete={() => onDelete(service.id)}
      extra={
        <label className="flex items-center gap-1.5 text-xs text-muted shrink-0" title="Standardtid, foreslås når tillægget vælges - kan overstyres pr. varetype under fanen 'Standardtider'">
          <Clock size={13} className="shrink-0" aria-hidden="true" />
          <MinutesInput
            value={service.minutter ?? 0}
            onChange={(min) => onUpdate(service.id, { minutter: min })}
            aria-label={`Standardtid for ${service.navn} (minutter)`}
            className="w-14 rounded-lg border border-line bg-panel px-1.5 py-1.5 text-center text-xs text-ink focus:outline-none focus:border-brand"
          />
          <span className="text-[10px]">min</span>
        </label>
      }
      extraContent={
        <div className="mt-3 pt-3 border-t border-divider space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">Vises kun ved disse primære ydelser (påkrævet)</p>
            {primaryServices.length === 0 ? (
              <p className="text-xs text-muted italic">Opret først en primær ydelse.</p>
            ) : (
              <CheckboxList
                items={primaryServices.map((p) => ({
                  key: p.id,
                  label: p.navn,
                  checked: (service.primaerYdelser || []).includes(p.id),
                  onChange: () => togglePrimary(p.id),
                }))}
              />
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">
              Begræns til bestemte varetyper <span className="normal-case text-muted/70">({isUniversal ? "ingen markeret = gælder alle varetyper" : "kun de markerede"})</span>
            </p>
            <CheckboxList
              columns={2}
              items={productTypes.map((v) => ({
                key: v.id,
                label: v.navn,
                checked: (service.varetyper || []).includes(v.id),
                onChange: () => toggleProductType(v.id),
              }))}
            />
          </div>
        </div>
      }
    />
  );
}

function AddOnServiceAdmin({ addOnServices, productTypes, primaryServices, onAdd, onUpdate, onDelete }) {
  const [newName, setNewName] = useState("");
  return (
    <div>
      <div className="rounded-xl border border-line bg-white p-5 mb-4 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-3">Opret ny tillægsydelse</h3>
        <div className="flex gap-2 flex-wrap">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Fx 'Dørvending'" aria-label="Navn på tillægsydelse" className="flex-1 min-w-[160px] rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
          <button onClick={() => { if (!newName.trim()) return; onAdd(newName.trim()); setNewName(""); }} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-brand hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5"><Plus size={15} aria-hidden="true" /> Opret</button>
        </div>
        <p className="text-[11px] text-muted mt-2">Efter oprettelse skal du sætte hvilke primære ydelser den gælder under (nedenfor på hver række) — ellers vises den aldrig i booking-flowet.</p>
      </div>
      <div className="space-y-2">
        {addOnServices.map((t) => (
          <AddOnServiceRow key={t.id} service={t} productTypes={productTypes} primaryServices={primaryServices} onUpdate={onUpdate} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

// ---------- Standardtider (varetype × ydelse - primær ELLER tillæg) ----------
// Matrix-visning: rækker = varetyper, kolonner = ALLE ydelser (både primære
// ydelser og tillægsydelser, adskilt af en tykkere kantlinje mellem de to
// grupper). Hver celle er et frit tal (minutter), gemt på blur (ikke pr.
// tastetryk - se TimeEstimateCell) frem for en ekstra "Gem"-knap pr.
// celle, som ville være uoverkommeligt med op til 17 varetyper × (3
// ydelser + N tillæg) felter.
//
// Tomt felt = intet admin-sat estimat for netop den kombination. For en
// primær ydelse betyder det, at sælgeren taster tiden manuelt, som hidtil.
// For et tillæg betyder det, at tillæggets egen FLADE standardtid bruges
// i stedet (sat under fanen "Tillægsydelser") - matrixen er kun til at
// OVERSTYRE for specifikke varetyper, ikke et krav om at udfylde alt. Se
// getDefaultEstimateMinutes/createLineItem i domain.js og toggleAddOn i
// OrderFormFields.jsx for hvordan et sat tal bruges.
function TimeEstimateCell({ value, onCommit, label }) {
  const [local, setLocal] = useState(value ?? "");
  useEffect(() => { setLocal(value ?? ""); }, [value]);
  const commit = () => {
    if (String(local) === String(value ?? "")) return;
    onCommit(local === "" ? null : local);
  };
  return (
    <input
      type="number" min="0" inputMode="numeric"
      value={local}
      placeholder="—"
      aria-label={label}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
      className="w-16 rounded-lg border border-line bg-panel px-1.5 py-1.5 text-center text-sm text-ink focus:outline-none focus:border-brand"
    />
  );
}

function DefaultTimeEstimateAdmin({ productTypes, primaryServices, addOnServices, defaultTimeEstimates, onSetEstimate }) {
  if (productTypes.length === 0 || primaryServices.length === 0) {
    return <p className="text-sm text-muted italic">Opret først mindst én varetype og én primær ydelse, under de andre faner ovenfor.</p>;
  }
  const addOns = addOnServices || [];
  const lookup = (varetypeId, ydelseId) => defaultTimeEstimates.find((e) => e.varetypeId === varetypeId && e.primaerYdelseId === ydelseId)?.minutter ?? null;

  return (
    <div>
      <p className="text-xs text-muted mb-4">
        Et udgangspunkt for tiden, når en sælger opretter en ny varelinje eller vælger en tillægsydelse med denne kombination af varetype og ydelse - tastes stadig frit for den enkelte booking bagefter. Tomt felt under en primær ydelse = intet forslag, sælgeren taster selv. Tomt felt under et tillæg = tillæggets egen standardtid (fanen "Tillægsydelser") bruges i stedet. Erstatter ikke det målte estimat fra tidligere afsluttede sager, som stadig vises som et separat forslag, når der er nok historik.
      </p>
      <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-divider bg-panel">
              <th rowSpan={2} className="text-left p-2.5 text-xs font-semibold uppercase tracking-wide text-muted whitespace-nowrap align-bottom">Varetype</th>
              <th colSpan={primaryServices.length} className="p-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted text-center">Primære ydelser</th>
              {addOns.length > 0 && (
                <th colSpan={addOns.length} className="p-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted text-center border-l-2 border-line">Tillægsydelser</th>
              )}
            </tr>
            <tr className="border-b border-line bg-panel">
              {primaryServices.map((p) => (
                <th key={p.id} className="p-2.5 text-xs font-semibold uppercase tracking-wide text-muted text-center min-w-[110px]">{p.navn}</th>
              ))}
              {addOns.map((t, i) => (
                <th key={t.id} className={`p-2.5 text-xs font-semibold uppercase tracking-wide text-muted text-center min-w-[110px] ${i === 0 ? "border-l-2 border-line" : ""}`}>{t.navn}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {productTypes.map((v) => (
              <tr key={v.id} className="border-b border-divider last:border-b-0">
                <td className="p-2.5 text-ink font-medium whitespace-nowrap">{v.navn}</td>
                {primaryServices.map((p) => (
                  <td key={p.id} className="p-1.5 text-center">
                    <TimeEstimateCell
                      value={lookup(v.id, p.id)}
                      onCommit={(val) => onSetEstimate(v.id, p.id, val)}
                      label={`Standardtid for ${v.navn} · ${p.navn} (minutter)`}
                    />
                  </td>
                ))}
                {addOns.map((t, i) => (
                  <td key={t.id} className={`p-1.5 text-center ${i === 0 ? "border-l-2 border-line" : ""}`}>
                    <TimeEstimateCell
                      value={lookup(v.id, t.id)}
                      onCommit={(val) => onSetEstimate(v.id, t.id, val)}
                      label={`Standardtid for ${v.navn} · ${t.navn} (tillæg, minutter)`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted mt-2">Gemmes automatisk, når du forlader feltet.</p>
    </div>
  );
}

export { TechnicianRow, SickLeaveWindowSetting, LoginPolicySetting, VehicleRow, UserRow, NewUserForm, ROLE_LABEL, ProductCategoryAdmin, ProductTypeAdmin, PrimaryServiceAdmin, AddOnServiceAdmin, DefaultTimeEstimateAdmin };
