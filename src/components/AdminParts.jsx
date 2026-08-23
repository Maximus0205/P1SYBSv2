import React, { useState } from "react";
import { Trash2, X, Plus, Pencil, UserPlus, PalmtreeIcon, CalendarOff, KeyRound } from "lucide-react";
import { vehicleLabel, technicianColor, todayISO } from "../data/domain";
import { suggestUsername, isValidUsername } from "../lib/username";

// En "tekniker" er en bruger med rolle montor — man opretter dem ikke separat
// (det sker under fanen Brugere). Her kan man kun styre hvilken bil teknikeren
// kører i lige nu, og registrere fraværsperioder for vedkommende.
function TechnicianRow({ technician, vehicles, timeOff, onUpdateVehicle, onAddTimeOff, onDeleteTimeOff }) {
  const [showTimeOff, setShowTimeOff] = useState(false);
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(todayISO());
  const [note, setNote] = useState("");
  const linkedVehicle = vehicles.find((b) => b.id === technician.bilId);
  const myTimeOff = timeOff.filter((f) => f.montorId === technician.id).sort((a, b) => a.startDato.localeCompare(b.startDato));

  const createTimeOff = () => {
    if (!start || !end || end < start) return;
    onAddTimeOff({ montorId: technician.id, startDato: start, slutDato: end, note: note.trim() });
    setNote("");
  };

  return (
    <div className="rounded-xl bg-white border border-line overflow-hidden shadow-sm">
      <div className="p-3 flex items-center gap-3 flex-wrap">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: technicianColor(technician.id, [technician]) }} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-ink truncate">{technician.navn}</p>
          <p className="text-xs text-muted truncate">{linkedVehicle ? vehicleLabel(linkedVehicle) : "Ingen bil tilknyttet"}</p>
        </div>
        <select
          value={technician.bilId || ""}
          onChange={(e) => onUpdateVehicle(technician.id, e.target.value || null)}
          className="rounded-lg border border-line bg-panel px-2 py-1.5 text-xs text-ink focus:outline-none focus:border-brand"
        >
          <option value="">Ingen bil</option>
          {vehicles.map((b) => (
            <option key={b.id} value={b.id} disabled={b.lukket && b.id !== technician.bilId}>
              {vehicleLabel(b)}{b.lukket ? " (lukket)" : ""}
            </option>
          ))}
        </select>
        <button onClick={() => setShowTimeOff((v) => !v)} className="p-1.5 text-muted hover:text-brand flex items-center gap-1 text-xs font-semibold uppercase tracking-wide" title="Ferie">
          <PalmtreeIcon size={15} /> Ferie{myTimeOff.length > 0 ? ` (${myTimeOff.length})` : ""}
        </button>
      </div>

      {showTimeOff && (
        <div className="border-t border-divider p-3 bg-panel">
          <div className="flex gap-2 flex-wrap items-end mb-3">
            <label className="text-[11px] text-muted">Fra
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="block rounded-lg border border-line bg-white px-2 py-1 text-xs text-ink mt-0.5" />
            </label>
            <label className="text-[11px] text-muted">Til
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="block rounded-lg border border-line bg-white px-2 py-1 text-xs text-ink mt-0.5" />
            </label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (valgfri)" className="flex-1 min-w-[120px] rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-ink" />
            <button onClick={createTimeOff} className="px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors flex items-center gap-1"><Plus size={13} /> Tilføj</button>
          </div>
          {myTimeOff.length === 0 ? (
            <p className="text-xs text-muted italic">Ingen ferieperioder registreret.</p>
          ) : (
            <div className="space-y-1.5">
              {myTimeOff.map((f) => (
                <div key={f.id} className="flex items-center gap-2 text-xs rounded-lg bg-white border border-line px-2 py-1.5">
                  <CalendarOff size={12} className="text-brand shrink-0" />
                  <span className="text-ink">{f.startDato} – {f.slutDato}</span>
                  {f.note && <span className="text-muted truncate flex-1">{f.note}</span>}
                  <button onClick={() => onDeleteTimeOff(f.id)} className="ml-auto text-muted hover:text-danger"><X size={13} /></button>
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

function VehicleRow({ vehicle, usedBy, onUpdate, onDelete, onToggleClosed }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(vehicle.navn);
  const [plate, setPlate] = useState(vehicle.nummerplade);
  const [showCloseReason, setShowCloseReason] = useState(false);
  const [reason, setReason] = useState("Værksted");

  if (editing) {
    return (
      <div className="rounded-xl bg-white border border-line p-2.5 flex items-center gap-2 flex-wrap shadow-sm">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Navn/tag, fx 'Bil 1'" className="flex-1 min-w-[120px] rounded-lg border border-line bg-panel px-2 py-1 text-sm text-ink focus:outline-none focus:border-brand" />
        <input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="Nummerplade" className="flex-1 min-w-[120px] rounded-lg border border-line bg-panel px-2 py-1 text-sm text-ink focus:outline-none focus:border-brand" />
        <button onClick={() => { onUpdate({ navn: name.trim() || vehicle.navn, nummerplade: plate.trim() || vehicle.nummerplade }); setEditing(false); }} className="text-xs text-success font-semibold uppercase">Gem</button>
        <button onClick={() => { setName(vehicle.navn); setPlate(vehicle.nummerplade); setEditing(false); }} className="text-xs text-muted font-semibold uppercase">Fortryd</button>
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
          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Årsag (fx værksted)" className="w-32 rounded-lg border border-line bg-panel px-1.5 py-1 text-[10px] text-ink" />
          <button onClick={() => { onToggleClosed(vehicle.id, reason.trim() || "Værksted"); setShowCloseReason(false); }} className="text-[10px] font-semibold uppercase text-white bg-brand rounded-lg px-2 py-1">Luk</button>
          <button onClick={() => setShowCloseReason(false)} className="text-[10px] text-muted">Fortryd</button>
        </div>
      ) : (
        <button onClick={() => (vehicle.lukket ? onToggleClosed(vehicle.id) : setShowCloseReason(true))} className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border shrink-0 ${vehicle.lukket ? "border-success text-success hover:bg-success hover:text-white" : "border-brand text-brand hover:bg-brand hover:text-white"} transition-colors`}>
          {vehicle.lukket ? "Åbn igen" : "Blokér (fx værksted)"}
        </button>
      )}
      <button onClick={() => setEditing(true)} className="p-1 text-muted hover:text-brand shrink-0" title="Ret navn/nummerplade"><Pencil size={13} /></button>
      <button onClick={onDelete} className="p-1 text-muted hover:text-danger shrink-0" title="Slet"><Trash2 size={13} /></button>
    </div>
  );
}

function UserRow({ user, vehicle, currentUserId, onUpdate, onDelete, onResetPassword }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.navn);
  const [showReset, setShowReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="rounded-xl bg-white border border-line p-3 shadow-sm">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-1.5">
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border border-line bg-panel px-2 py-1 text-sm text-ink focus:outline-none focus:border-brand" />
              <button onClick={() => { onUpdate(user.id, { navn: name.trim() || user.navn }); setEditing(false); }} className="text-xs text-success font-semibold uppercase">Gem</button>
              <button onClick={() => { setName(user.navn); setEditing(false); }} className="text-xs text-muted font-semibold uppercase">Fortryd</button>
            </div>
          ) : (
            <p className="font-semibold text-sm text-ink truncate">{user.navn}</p>
          )}
          <p className="text-xs text-muted truncate">
            {ROLE_LABEL[user.rolle] || user.rolle}
            {user.brugernavn && <span> · logger ind som "{user.brugernavn}"</span>}
            {user.rolle === "montor" ? ` · ${vehicle ? vehicleLabel(vehicle) : "ingen bil endnu"}` : ""}
          </p>
        </div>
        <select value={user.rolle} onChange={(e) => onUpdate(user.id, { rolle: e.target.value })} className="rounded-lg border border-line bg-panel px-2 py-1.5 text-xs text-ink">
          {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {!editing && <button onClick={() => { setName(user.navn); setEditing(true); }} className="p-1.5 text-muted hover:text-brand" title="Ret navn"><Pencil size={15} /></button>}
        {onResetPassword && <button onClick={() => setShowReset((v) => !v)} className="p-1.5 text-muted hover:text-brand" title="Nulstil adgangskode"><KeyRound size={15} /></button>}
        {user.id !== currentUserId && <button onClick={() => onDelete(user.id)} className="p-1.5 text-muted hover:text-danger" title="Fjern adgang"><Trash2 size={15} /></button>}
      </div>
      {showReset && (
        <div className="mt-2.5 pt-2.5 border-t border-divider flex items-center gap-2 flex-wrap">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Ny adgangskode (mindst 6 tegn)"
            className="flex-1 min-w-[160px] rounded-lg border border-line bg-panel px-2 py-1.5 text-xs text-ink focus:outline-none focus:border-brand"
          />
          <button onClick={reset} disabled={busy} className="px-3 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors disabled:opacity-60">
            {busy ? "..." : "Sæt ny adgangskode"}
          </button>
          {resetMessage && <span className={`text-[11px] ${resetMessage.includes("nulstillet") ? "text-success" : "text-danger"}`}>{resetMessage}</span>}
        </div>
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
        <button onClick={() => setLoginType("brugernavn")} className={`px-3 py-1.5 transition-colors ${loginType === "brugernavn" ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>Brugernavn</button>
        <button onClick={() => setLoginType("email")} className={`px-3 py-1.5 transition-colors ${loginType === "email" ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>E-mail</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input value={name} onChange={(e) => changeName(e.target.value)} placeholder="Navn" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
        {loginType === "brugernavn" ? (
          <input value={username} onChange={(e) => { setUsername(e.target.value); setUsernameEdited(true); }} placeholder="Brugernavn (foreslået, kan rettes)" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink font-mono focus:outline-none focus:border-brand" />
        ) : (
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="E-mail" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
        )}
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Adgangskode (mindst 6 tegn)" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand">
          <option value="saelger">Sælger (Salg, Planlægning, Kørsel, Montør, Lager)</option>
          <option value="montor">Montør (kun sin egen rute)</option>
          <option value="admin">Administrator (alt, inkl. Opsætning)</option>
        </select>
      </div>
      {role === "montor" && <p className="text-[11px] text-muted mt-2">Bil tilknyttes bagefter under fanen "Montører".</p>}
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
      <button onClick={create} disabled={busy} className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors flex items-center gap-1.5 disabled:opacity-60">
        <UserPlus size={15} /> {busy ? "Opretter..." : "Opret bruger"}
      </button>
    </div>
  );
}

const ROLE_LABEL = { admin: "Administrator", saelger: "Sælger", montor: "Montør" };

// ---------- Varekategorier ----------

function ProductCategoryAdmin({ productCategories, onAdd, onUpdate, onDelete }) {
  const [newName, setNewName] = useState("");
  return (
    <div>
      <div className="rounded-xl border border-line bg-white p-5 mb-4 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-3">Opret ny varekategori</h3>
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Fx 'Hvidevare'" className="flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
          <button onClick={() => { if (!newName.trim()) return; onAdd(newName.trim()); setNewName(""); }} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors flex items-center gap-1.5"><Plus size={15} /> Opret</button>
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
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="flex-1 min-w-[140px] rounded-lg border border-line bg-panel px-2 py-1 text-sm text-ink focus:outline-none focus:border-brand" />
            <button onClick={() => { onUpdate(name.trim() || item.navn); setEditing(false); }} className="text-xs text-success font-semibold uppercase">Gem</button>
            <button onClick={() => { setName(item.navn); setEditing(false); }} className="text-xs text-muted font-semibold uppercase">Fortryd</button>
          </>
        ) : (
          <>
            <p className="font-semibold text-sm text-ink flex-1">{item.navn}</p>
            {extra}
            <button onClick={() => setEditing(true)} className="p-1.5 text-muted hover:text-brand"><Pencil size={14} /></button>
            <button onClick={onDelete} className="p-1.5 text-muted hover:text-danger"><Trash2 size={14} /></button>
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
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="flex-1 rounded-lg border border-line bg-panel px-2 py-1 text-sm text-ink focus:outline-none focus:border-brand" />
          <button onClick={() => { onUpdate(productType.id, { navn: name.trim() || productType.navn }); setEditingName(false); }} className="text-xs text-success font-semibold uppercase">Gem</button>
          <button onClick={() => { setName(productType.navn); setEditingName(false); }} className="text-xs text-muted font-semibold uppercase">Fortryd</button>
        </div>
      ) : (
        <p className="font-semibold text-sm text-ink flex-1">{productType.navn}</p>
      )}
      <select value={productType.kategoriId || ""} onChange={(e) => onUpdate(productType.id, { kategoriId: e.target.value || null })} className="rounded-lg border border-line bg-panel px-2 py-1.5 text-xs text-ink shrink-0">
        <option value="">Ingen kategori</option>
        {productCategories.map((k) => <option key={k.id} value={k.id}>{k.navn}</option>)}
      </select>
      {!editingName && <button onClick={() => setEditingName(true)} className="p-1.5 text-muted hover:text-brand shrink-0"><Pencil size={14} /></button>}
      <button onClick={() => onDelete(productType.id)} className="p-1.5 text-muted hover:text-danger shrink-0"><Trash2 size={14} /></button>
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
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Fx 'Kaffemaskine'" className="flex-1 min-w-[160px] rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
          <select value={newCategoryId} onChange={(e) => setNewCategoryId(e.target.value)} className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink">
            <option value="">Ingen kategori</option>
            {productCategories.map((k) => <option key={k.id} value={k.id}>{k.navn}</option>)}
          </select>
          <button onClick={() => { if (!newName.trim()) return; onAdd(newName.trim(), newCategoryId || null); setNewName(""); setNewCategoryId(""); }} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors flex items-center gap-1.5"><Plus size={15} /> Opret</button>
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
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="flex-1 rounded-lg border border-line bg-panel px-2 py-1 text-sm text-ink focus:outline-none focus:border-brand" />
          <button onClick={() => { onUpdate(service.id, { navn: name.trim() || service.navn }); setEditingName(false); }} className="text-xs text-success font-semibold uppercase">Gem</button>
          <button onClick={() => { setName(service.navn); setEditingName(false); }} className="text-xs text-muted font-semibold uppercase">Fortryd</button>
        </div>
      ) : (
        <p className="font-semibold text-sm text-ink flex-1">{service.navn}</p>
      )}
      {!editingName && <button onClick={() => setEditingName(true)} className="p-1.5 text-muted hover:text-brand shrink-0"><Pencil size={14} /></button>}
      <button onClick={() => onDelete(service.id)} className="p-1.5 text-muted hover:text-danger shrink-0"><Trash2 size={14} /></button>
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
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Fx 'Montering'" className="flex-1 min-w-[160px] rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
          <button onClick={() => { if (!newName.trim()) return; onAdd(newName.trim()); setNewName(""); }} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors flex items-center gap-1.5"><Plus size={15} /> Opret</button>
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
//
// Valg-mærkerne (primær ydelse / varetype) er RETTET (august 2026) fra
// fuldt runde "boble"-knapper (rounded-full) til samme afrundet-firkantede
// stil (rounded-lg) som resten af appens knapper og kort - det runde
// boble-udseende var bevidst fjernet konsekvent i hele systemet.

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
                    <button key={p.id} onClick={() => togglePrimary(p.id)} className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${selected ? "border-success bg-success/10 text-success" : "border-line text-muted hover:border-brand hover:text-brand"}`}>
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
                  <button key={v.id} onClick={() => toggleProductType(v.id)} className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${selected ? "border-brand bg-brand/10 text-brand" : "border-line text-muted hover:border-brand hover:text-brand"}`}>
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
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Fx 'Dørvending'" className="flex-1 min-w-[160px] rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
          <button onClick={() => { if (!newName.trim()) return; onAdd(newName.trim()); setNewName(""); }} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors flex items-center gap-1.5"><Plus size={15} /> Opret</button>
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

export { TechnicianRow, VehicleRow, UserRow, NewUserForm, ROLE_LABEL, ProductCategoryAdmin, ProductTypeAdmin, PrimaryServiceAdmin, AddOnServiceAdmin };
