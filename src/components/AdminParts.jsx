import React, { useState } from "react";
import { Trash2, X, Plus, Pencil, UserPlus, PalmtreeIcon, CalendarOff, KeyRound, Stethoscope, HeartPulse, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";
import { vehicleLabel, technicianColor, todayISO, activeSickLeave } from "../data/domain";
import { suggestUsername, isValidUsername } from "../lib/username";
import { updateSickLeaveWindow } from "../lib/dataStore";

// En "tekniker" er en bruger med rolle montor — man opretter dem ikke separat
// (det sker under fanen Brugere). Her kan man kun styre hvilken bil teknikeren
// kører i lige nu, og registrere fraværsperioder for vedkommende (ferie ELLER
// sygdom - se Sygemeld/Raskmeld nedenfor, august 2026).
function TechnicianRow({ technician, vehicles, timeOff, onUpdateVehicle, onAddTimeOff, onDeleteTimeOff, onSygemeld, onRaskmeld }) {
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
          <p className="text-xs text-muted truncate">{linkedVehicle ? vehicleLabel(linkedVehicle) : "Ingen bil tilknyttet"}</p>
        </div>
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
            <button onClick={createTimeOff} className="px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1"><Plus size={13} aria-hidden="true" /> Tilføj</button>
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
          {linkedVehicle && <p className="text-[10px] text-muted mt-2">Bilen ({vehicleLabel(linkedVehicle)}) vises automatisk som blokeret i kørselsoverblikket i disse perioder — flytter teknikeren til en anden bil, følger blokeringen med.</p>}
        </div>
      )}
    </div>
  );
}

// Butiksindstilling (august 2026): hvor mange timer frem en sygemeldt
// montørs sager vises i "Sygemelding"-fanen i Planlægning, mens
// sygemeldingen er aktiv. Kalder en snævert afgrænset databasefunktion
// (se dataStore.js: updateSickLeaveWindow) - almindelige butiks-admins har
// IKKE generel skriveadgang til butikkens øvrige indstillinger, kun denne
// ene, bevidst afgrænsede indstilling. RETTET (august 2026): sender nu
// eksplicit store.id med - ellers ville en systemadmin, der er skiftet
// til at se en ANDEN butik end deres egen, ramme deres egen butik i
// stedet (se App.jsx: butiks-skifteren).
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
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors disabled:opacity-60">
          {saving ? "Gemmer..." : "Gem"}
        </button>
        {saved && <span className="text-xs text-success font-semibold">Gemt.</span>}
      </div>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
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

// Rettigheds-editor for ÉN bruger (august 2026). En bruger har altid en
// ROLLE (giver et fast sæt standardrettigheder, se role_default_
// permissions i databasen) - denne editor lader en admin (med
// admin_brugere-rettighed) TILFØJE noget ud over rollens standard, eller
// FRATAGE noget rollen ellers ville give, for netop denne ene person. En
// rettighed der kommer fra rollen vises med et "standard"-mærke; klikker
// man den fra, lander den i revokedPermissions - klikker man en IKKE-
// standard rettighed til, lander den i extraPermissions. Håndhæves også i
// selve databasen (kan altså ikke omgås ved at redigere UI'et), se
// migrationerne "profile_individual_permission_overrides" og
// "enforce_permissions_on_writes".
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
      // Slå fra: hvis den kommer fra rollen, skal den eksplicit fratages;
      // ellers er den bare en individuel tilføjelse der fjernes igen.
      nextExtra = extra.filter((k) => k !== key);
      nextRevoked = isFromRole(key) ? [...revoked.filter((k) => k !== key), key] : revoked;
    } else {
      // Slå til: fjern en evt. fratagelse, og tilføj den (kun nødvendigt
      // hvis den ikke allerede kommer fra rollen).
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
    <div className="border-t border-divider p-3 bg-panel space-y-3">
      {permissionsCatalog.length === 0 ? (
        <p className="text-xs text-muted italic">Indlæser rettighedskatalog...</p>
      ) : (
        Object.entries(byCategory).map(([category, perms]) => (
          <div key={category}>
            <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">{PERMISSION_CATEGORY_LABEL[category] || category}</p>
            <div className="flex flex-wrap gap-1.5">
              {perms.map((p) => {
                const checked = isChecked(p.key);
                const fromRole = isFromRole(p.key);
                return (
                  <button
                    key={p.key}
                    disabled={busy}
                    onClick={() => toggle(p.key)}
                    aria-pressed={checked}
                    title={p.label}
                    className={`text-xs px-2.5 py-2 rounded-lg border transition-colors flex items-center gap-1 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-brand ${
                      checked ? "border-success bg-success/10 text-success" : "border-line text-muted hover:border-brand hover:text-brand"
                    }`}
                  >
                    {p.label}
                    {checked && fromRole && <span className="text-[9px] uppercase tracking-wide opacity-70">· standard</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}
      <p className="text-[10px] text-muted">Rettigheder mærket "standard" kommer fra brugerens rolle. Klik for at tilføje eller fratage en rettighed for præcis denne bruger - ændringer gemmes med det samme.</p>
    </div>
  );
}

function UserRow({ user, vehicle, currentUserId, onUpdate, onDelete, onResetPassword, permissionsCatalog, roleDefaults, onUpdatePermissions }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.navn);
  const [showReset, setShowReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);

  const reset = async () => {
    if (newPassword.length < 6) { setResetMessage("Mindst 6 tegn."); return; }
    setBusy(true);
    const result = await onResetPassword(user.id, newPassword);
    setBusy(false);
    if (!result?.ok) { setResetMessage(result?.fejl || "Kunne ikke nulstille."); return; }
    setResetMessage("Adgangskode nulstillet.");
    setNewPassword("");
    setTimeout(() => { setShowReset(false); setResetMessage(""); }, 1500);
  };

  const canEditPermissions = user.id !== currentUserId && onUpdatePermissions && permissionsCatalog;

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
            {user.brugernavn && <span> · logger ind som "{user.brugernavn}"</span>}
            {user.rolle === "montor" ? ` · ${vehicle ? vehicleLabel(vehicle) : "ingen bil endnu"}` : ""}
            {(user.extraPermissions?.length > 0 || user.revokedPermissions?.length > 0) && <span> · individuelt tilpasset</span>}
          </p>
        </div>
        <select value={user.rolle} onChange={(e) => onUpdate(user.id, { rolle: e.target.value })} aria-label={`Rolle for ${user.navn}`} className="rounded-lg border border-line bg-panel px-2 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-brand">
          {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {canEditPermissions && (
          <button onClick={() => setShowPermissions((v) => !v)} aria-expanded={showPermissions} aria-label={`Rettigheder for ${user.navn}`} className="w-10 h-10 flex items-center justify-center rounded-lg text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand" title="Rettigheder">
            <ShieldCheck size={15} aria-hidden="true" />
          </button>
        )}
        {!editing && <button onClick={() => { setName(user.navn); setEditing(true); }} aria-label={`Ret navn på ${user.navn}`} className="w-10 h-10 flex items-center justify-center rounded-lg text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand" title="Ret navn"><Pencil size={15} aria-hidden="true" /></button>}
        {onResetPassword && <button onClick={() => setShowReset((v) => !v)} aria-expanded={showReset} aria-label={`Nulstil adgangskode for ${user.navn}`} className="w-10 h-10 flex items-center justify-center rounded-lg text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand" title="Nulstil adgangskode"><KeyRound size={15} aria-hidden="true" /></button>}
        {/* RETTET (august 2026): tooltip'en sagde "Fjern adgang", fordi
            knappen dengang blot fjernede butikstilknytningen. Den SLETTER
            nu brugeren permanent (login og profil), og en knap må ikke
            beskrive sig selv mildere end den handler - det er præcis den
            slags misforståelse, der koster en medarbejderkonto. Selve
            bekræftelsen, med konsekvenserne hentet fra serveren, ligger i
            useUsers.js. */}
        {user.id !== currentUserId && (
          <button onClick={() => onDelete(user.id)} aria-label={`Slet brugeren ${user.navn} permanent`} className="w-10 h-10 flex items-center justify-center rounded-lg text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger" title="Slet bruger permanent">
            <Trash2 size={15} aria-hidden="true" />
          </button>
        )}
      </div>
      {showReset && (
        <div className="px-3 pb-3 flex items-center gap-2 flex-wrap">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Ny adgangskode (mindst 6 tegn)"
            aria-label="Ny adgangskode"
            className="flex-1 min-w-[160px] rounded-lg border border-line bg-panel px-2 py-2 text-xs text-ink focus:outline-none focus:border-brand"
          />
          <button onClick={reset} disabled={busy} className="px-3 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors disabled:opacity-60">
            {busy ? "..." : "Sæt ny adgangskode"}
          </button>
          {resetMessage && <span className={`text-[11px] ${resetMessage.includes("nulstillet") ? "text-success" : "text-danger"}`}>{resetMessage}</span>}
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

function NewUserForm({ onAdd }) {
  const [loginType, setLoginType] = useState("brugernavn");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("saelger");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const changeName = (val) => {
    setName(val);
    if (!usernameEdited) setUsername(suggestUsername(val));
  };

  const create = async () => {
    setError("");
    if (!name.trim() || !password.trim()) { setError("Udfyld navn og adgangskode."); return; }
    if (loginType === "brugernavn" && !isValidUsername(username)) { setError("Brugernavn skal være 2-40 tegn (a-z, tal, punktum eller bindestreg)."); return; }
    if (loginType === "email" && !email.trim()) { setError("Udfyld e-mail."); return; }
    setBusy(true);
    const result = await onAdd({ navn: name.trim(), loginType, email: email.trim(), brugernavn: username.trim().toLowerCase(), adgangskode: password, rolle: role });
    setBusy(false);
    if (!result.ok) { setError(result.fejl || "Kunne ikke oprette brugeren."); return; }
    setName(""); setUsername(""); setUsernameEdited(false); setEmail(""); setPassword(""); setRole("saelger");
  };

  return (
    <div className="rounded-xl border border-line bg-white p-5 mb-6 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-3">Opret ny bruger</h3>
      <div className="flex rounded-lg border border-line mb-3 text-xs font-semibold uppercase tracking-wide w-fit overflow-hidden">
        <button onClick={() => setLoginType("brugernavn")} aria-pressed={loginType === "brugernavn"} className={`px-3 py-2 transition-colors ${loginType === "brugernavn" ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>Brugernavn</button>
        <button onClick={() => setLoginType("email")} aria-pressed={loginType === "email"} className={`px-3 py-2 transition-colors ${loginType === "email" ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>E-mail</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input value={name} onChange={(e) => changeName(e.target.value)} placeholder="Navn" aria-label="Navn" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
        {loginType === "brugernavn" ? (
          <input value={username} onChange={(e) => { setUsername(e.target.value); setUsernameEdited(true); }} placeholder="Brugernavn (foreslået, kan rettes)" aria-label="Brugernavn" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink font-mono focus:outline-none focus:border-brand" />
        ) : (
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="E-mail" aria-label="E-mail" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
        )}
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Adgangskode (mindst 6 tegn)" aria-label="Adgangskode" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Rolle" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand">
          <option value="saelger">Sælger (Salg, Planlægning, Kørsel, Montør, Lager)</option>
          <option value="montor">Montør (kun sin egen rute)</option>
          <option value="lager">Lager (kun Lager-siden)</option>
          <option value="admin">Administrator (alt, inkl. Opsætning)</option>
        </select>
      </div>
      {role === "montor" && <p className="text-[11px] text-muted mt-2">Bil tilknyttes bagefter under fanen "Montører".</p>}
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
      <button onClick={create} disabled={busy} className="mt-3 px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5 disabled:opacity-60">
        <UserPlus size={15} aria-hidden="true" /> {busy ? "Opretter..." : "Opret bruger"}
      </button>
    </div>
  );
}

const ROLE_LABEL = { admin: "Administrator", saelger: "Sælger", montor: "Montør", lager: "Lager" };

// ---------- Varekategorier ----------

function ProductCategoryAdmin({ productCategories, onAdd, onUpdate, onDelete }) {
  const [newName, setNewName] = useState("");
  return (
    <div>
      <div className="rounded-xl border border-line bg-white p-5 mb-4 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-3">Opret ny varekategori</h3>
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Fx 'Hvidevare'" aria-label="Navn på varekategori" className="flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
          <button onClick={() => { if (!newName.trim()) return; onAdd(newName.trim()); setNewName(""); }} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5"><Plus size={15} aria-hidden="true" /> Opret</button>
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
          <button onClick={() => { if (!newName.trim()) return; onAdd(newName.trim(), newCategoryId || null); setNewName(""); setNewCategoryId(""); }} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5"><Plus size={15} aria-hidden="true" /> Opret</button>
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
// Bevidst uden tidsestimat her - tidsforbrug tastes udelukkende manuelt for
// den enkelte booking i sælgerens flow (se SagFormFields.jsx), da det varierer
// for meget fra opgave til opgave til at et fast tal pr. ydelsestype giver
// mening. Det ændrer sig når der er nok historik til automatiske estimater.

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
          <button onClick={() => { if (!newName.trim()) return; onAdd(newName.trim()); setNewName(""); }} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5"><Plus size={15} aria-hidden="true" /> Opret</button>
        </div>
      </div>
      <p className="text-[11px] text-muted mb-2">Hvilke tillægsydelser der er tilgængelige under en given primær ydelse styres under fanen "Tillægsydelser". Tidsforbrug sættes ikke her — det tastes manuelt af sælgeren for hver enkelt booking.</p>
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
// gælder under (påkrævet), og valgfrit hvilke specifikke varetyper den er
// begrænset til (tomt = gælder for alle varetyper). Heller ikke her sættes
// et tidsestimat - det tastes manuelt pr. booking, se note ovenfor.

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
      extraContent={
        <div className="mt-3 pt-3 border-t border-divider space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">Vises kun ved disse primære ydelser (påkrævet)</p>
            <div className="flex flex-wrap gap-1.5">
              {primaryServices.length === 0 ? (
                <p className="text-xs text-muted italic">Opret først en primær ydelse.</p>
              ) : (
                primaryServices.map((p) => {
                  const selected = (service.primaerYdelser || []).includes(p.id);
                  return (
                    <button key={p.id} onClick={() => togglePrimary(p.id)} aria-pressed={selected} className={`text-xs px-2.5 py-2 rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-brand ${selected ? "border-success bg-success/10 text-success" : "border-line text-muted hover:border-brand hover:text-brand"}`}>
                      {p.navn}
                    </button>
                  );
                })
              )}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">
              Begræns til bestemte varetyper <span className="normal-case text-muted/70">({isUniversal ? "gælder lige nu for alle varetyper" : "kun de markerede"})</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {productTypes.map((v) => {
                const selected = (service.varetyper || []).includes(v.id);
                return (
                  <button key={v.id} onClick={() => toggleProductType(v.id)} aria-pressed={selected} className={`text-xs px-2.5 py-2 rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-brand ${selected ? "border-brand bg-brand/10 text-brand" : "border-line text-muted hover:border-brand hover:text-brand"}`}>
                    {v.navn}
                  </button>
                );
              })}
            </div>
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
          <button onClick={() => { if (!newName.trim()) return; onAdd(newName.trim()); setNewName(""); }} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5"><Plus size={15} aria-hidden="true" /> Opret</button>
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

export { TechnicianRow, SickLeaveWindowSetting, VehicleRow, UserRow, NewUserForm, ROLE_LABEL, ProductCategoryAdmin, ProductTypeAdmin, PrimaryServiceAdmin, AddOnServiceAdmin };
