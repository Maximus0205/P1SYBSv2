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
    <div className="bg-white border border-[#D8D0BE]">
      <div className="p-3 flex items-center gap-3 flex-wrap">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: technicianColor(technician.id, [technician]) }} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-[#1C232E] truncate">{technician.navn}</p>
          <p className="text-xs text-[#52697E] truncate">{linkedVehicle ? vehicleLabel(linkedVehicle) : "Ingen bil tilknyttet"}</p>
        </div>
        <select
          value={technician.bilId || ""}
          onChange={(e) => onUpdateVehicle(technician.id, e.target.value || null)}
          className="border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1.5 text-xs text-[#1C232E] focus:outline-none focus:border-[#E2621B]"
        >
          <option value="">Ingen bil</option>
          {vehicles.map((b) => (
            <option key={b.id} value={b.id} disabled={b.lukket && b.id !== technician.bilId}>
              {vehicleLabel(b)}{b.lukket ? " (lukket)" : ""}
            </option>
          ))}
        </select>
        <button onClick={() => setShowTimeOff((v) => !v)} className="p-1.5 text-[#52697E] hover:text-[#E2621B] flex items-center gap-1 text-xs font-semibold uppercase tracking-wide" title="Ferie">
          <PalmtreeIcon size={15} /> Ferie{myTimeOff.length > 0 ? ` (${myTimeOff.length})` : ""}
        </button>
      </div>

      {showTimeOff && (
        <div className="border-t border-[#F0EBDD] p-3 bg-[#FCFAF4]">
          <div className="flex gap-2 flex-wrap items-end mb-3">
            <label className="text-[11px] text-[#52697E]">Fra
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="block border border-[#D8D0BE] bg-white px-2 py-1 text-xs text-[#1C232E] mt-0.5" />
            </label>
            <label className="text-[11px] text-[#52697E]">Til
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="block border border-[#D8D0BE] bg-white px-2 py-1 text-xs text-[#1C232E] mt-0.5" />
            </label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (valgfri)" className="flex-1 min-w-[120px] border border-[#D8D0BE] bg-white px-2 py-1.5 text-xs text-[#1C232E]" />
            <button onClick={createTimeOff} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors flex items-center gap-1"><Plus size={13} /> Tilføj</button>
          </div>
          {myTimeOff.length === 0 ? (
            <p className="text-xs text-[#52697E] italic">Ingen ferieperioder registreret.</p>
          ) : (
            <div className="space-y-1.5">
              {myTimeOff.map((f) => (
                <div key={f.id} className="flex items-center gap-2 text-xs bg-white border border-[#D8D0BE] px-2 py-1.5">
                  <CalendarOff size={12} className="text-[#E2621B] shrink-0" />
                  <span className="text-[#1C232E]">{f.startDato} – {f.slutDato}</span>
                  {f.note && <span className="text-[#52697E] truncate flex-1">{f.note}</span>}
                  <button onClick={() => onDeleteTimeOff(f.id)} className="ml-auto text-[#52697E] hover:text-[#B3261E]"><X size={13} /></button>
                </div>
              ))}
            </div>
          )}
          {linkedVehicle && <p className="text-[10px] text-[#52697E] mt-2">Bilen ({vehicleLabel(linkedVehicle)}) vises automatisk som blokeret i kørselsoverblikket i disse perioder — flytter teknikeren til en anden bil, følger blokeringen med.</p>}
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
      <div className="bg-white border border-[#D8D0BE] p-2.5 flex items-center gap-2 flex-wrap">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Navn/tag, fx 'Bil 1'" className="flex-1 min-w-[120px] border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        <input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="Nummerplade" className="flex-1 min-w-[120px] border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        <button onClick={() => { onUpdate({ navn: name.trim() || vehicle.navn, nummerplade: plate.trim() || vehicle.nummerplade }); setEditing(false); }} className="text-xs text-[#3D7A5C] font-semibold uppercase">Gem</button>
        <button onClick={() => { setName(vehicle.navn); setPlate(vehicle.nummerplade); setEditing(false); }} className="text-xs text-[#52697E] font-semibold uppercase">Fortryd</button>
      </div>
    );
  }
  return (
    <div className={`bg-white border p-2.5 flex items-center gap-2 flex-wrap ${vehicle.lukket ? "border-[#E2621B] opacity-70" : "border-[#D8D0BE]"}`}>
      <p className="text-sm text-[#1C232E] flex-1 truncate min-w-[80px]">{vehicleLabel(vehicle)}</p>
      {vehicle.lukket && <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 border border-[#E2621B] text-[#E2621B] shrink-0">Lukket{vehicle.lukketAarsag ? ` · ${vehicle.lukketAarsag}` : ""}</span>}
      {usedBy && <span className="text-[10px] text-[#52697E] shrink-0">kører af {usedBy}</span>}
      {showCloseReason ? (
        <div className="flex items-center gap-1 shrink-0">
          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Årsag (fx værksted)" className="w-32 border border-[#D8D0BE] bg-[#F3EFE6] px-1.5 py-1 text-[10px] text-[#1C232E]" />
          <button onClick={() => { onToggleClosed(vehicle.id, reason.trim() || "Værksted"); setShowCloseReason(false); }} className="text-[10px] font-semibold uppercase text-white bg-[#E2621B] px-2 py-1">Luk</button>
          <button onClick={() => setShowCloseReason(false)} className="text-[10px] text-[#52697E]">Fortryd</button>
        </div>
      ) : (
        <button onClick={() => (vehicle.lukket ? onToggleClosed(vehicle.id) : setShowCloseReason(true))} className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-1 border shrink-0 ${vehicle.lukket ? "border-[#3D7A5C] text-[#3D7A5C] hover:bg-[#3D7A5C] hover:text-white" : "border-[#E2621B] text-[#E2621B] hover:bg-[#E2621B] hover:text-white"} transition-colors`}>
          {vehicle.lukket ? "Åbn igen" : "Blokér (fx værksted)"}
        </button>
      )}
      <button onClick={() => setEditing(true)} className="p-1 text-[#52697E] hover:text-[#E2621B] shrink-0" title="Ret navn/nummerplade"><Pencil size={13} /></button>
      <button onClick={onDelete} className="p-1 text-[#52697E] hover:text-[#B3261E] shrink-0" title="Slet"><Trash2 size={13} /></button>
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
    <div className="bg-white border border-[#D8D0BE] p-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-1.5">
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
              <button onClick={() => { onUpdate(user.id, { navn: name.trim() || user.navn }); setEditing(false); }} className="text-xs text-[#3D7A5C] font-semibold uppercase">Gem</button>
              <button onClick={() => { setName(user.navn); setEditing(false); }} className="text-xs text-[#52697E] font-semibold uppercase">Fortryd</button>
            </div>
          ) : (
            <p className="font-semibold text-sm text-[#1C232E] truncate">{user.navn}</p>
          )}
          <p className="text-xs text-[#52697E] truncate">
            {ROLE_LABEL[user.rolle] || user.rolle}
            {user.brugernavn && <span> · logger ind som "{user.brugernavn}"</span>}
            {user.rolle === "montor" ? ` · ${vehicle ? vehicleLabel(vehicle) : "ingen bil endnu"}` : ""}
          </p>
        </div>
        <select value={user.rolle} onChange={(e) => onUpdate(user.id, { rolle: e.target.value })} className="border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1.5 text-xs text-[#1C232E]">
          {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {!editing && <button onClick={() => { setName(user.navn); setEditing(true); }} className="p-1.5 text-[#52697E] hover:text-[#E2621B]" title="Ret navn"><Pencil size={15} /></button>}
        {onResetPassword && <button onClick={() => setShowReset((v) => !v)} className="p-1.5 text-[#52697E] hover:text-[#E2621B]" title="Nulstil adgangskode"><KeyRound size={15} /></button>}
        {user.id !== currentUserId && <button onClick={() => onDelete(user.id)} className="p-1.5 text-[#52697E] hover:text-[#B3261E]" title="Fjern adgang"><Trash2 size={15} /></button>}
      </div>
      {showReset && (
        <div className="mt-2.5 pt-2.5 border-t border-[#F0EBDD] flex items-center gap-2 flex-wrap">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Ny adgangskode (mindst 6 tegn)"
            className="flex-1 min-w-[160px] border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1.5 text-xs text-[#1C232E] focus:outline-none focus:border-[#E2621B]"
          />
          <button onClick={reset} disabled={busy} className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors disabled:opacity-60">
            {busy ? "..." : "Sæt ny adgangskode"}
          </button>
          {resetMessage && <span className={`text-[11px] ${resetMessage.includes("nulstillet") ? "text-[#3D7A5C]" : "text-[#B3261E]"}`}>{resetMessage}</span>}
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
    <div className="border border-[#D8D0BE] bg-white p-5 mb-6">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Opret ny bruger</h3>
      <div className="flex border border-[#D8D0BE] mb-3 text-xs font-semibold uppercase tracking-wide w-fit">
        <button onClick={() => setLoginType("brugernavn")} className={`px-3 py-1.5 transition-colors ${loginType === "brugernavn" ? "bg-[#1C232E] text-white" : "text-[#52697E] hover:text-[#1C232E]"}`}>Brugernavn</button>
        <button onClick={() => setLoginType("email")} className={`px-3 py-1.5 transition-colors ${loginType === "email" ? "bg-[#1C232E] text-white" : "text-[#52697E] hover:text-[#1C232E]"}`}>E-mail</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input value={name} onChange={(e) => changeName(e.target.value)} placeholder="Navn" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        {loginType === "brugernavn" ? (
          <input value={username} onChange={(e) => { setUsername(e.target.value); setUsernameEdited(true); }} placeholder="Brugernavn (foreslået, kan rettes)" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] font-mono focus:outline-none focus:border-[#E2621B]" />
        ) : (
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="E-mail" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        )}
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Adgangskode (mindst 6 tegn)" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]">
          <option value="saelger">Sælger (Salg, Planlægning, Kørsel, Montør, Lager)</option>
          <option value="montor">Montør (kun sin egen rute)</option>
          <option value="admin">Administrator (alt, inkl. Opsætning)</option>
        </select>
      </div>
      {role === "montor" && <p className="text-[11px] text-[#52697E] mt-2">Bil tilknyttes bagefter under fanen "Montører".</p>}
      {error && <p className="text-xs text-[#B3261E] mt-2">{error}</p>}
      <button onClick={create} disabled={busy} className="mt-3 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors flex items-center gap-1.5 disabled:opacity-60">
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
      <div className="border border-[#D8D0BE] bg-white p-5 mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Opret ny varekategori</h3>
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Fx 'Hvidevare'" className="flex-1 border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <button onClick={() => { if (!newName.trim()) return; onAdd(newName.trim()); setNewName(""); }} className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors flex items-center gap-1.5"><Plus size={15} /> Opret</button>
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
    <div className="bg-white border border-[#D8D0BE] p-3">
      <div className="flex items-center gap-2 flex-wrap">
        {editing ? (
          <>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="flex-1 min-w-[140px] border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
            <button onClick={() => { onUpdate(name.trim() || item.navn); setEditing(false); }} className="text-xs text-[#3D7A5C] font-semibold uppercase">Gem</button>
            <button onClick={() => { setName(item.navn); setEditing(false); }} className="text-xs text-[#52697E] font-semibold uppercase">Fortryd</button>
          </>
        ) : (
          <>
            <p className="font-semibold text-sm text-[#1C232E] flex-1">{item.navn}</p>
            {extra}
            <button onClick={() => setEditing(true)} className="p-1.5 text-[#52697E] hover:text-[#E2621B]"><Pencil size={14} /></button>
            <button onClick={onDelete} className="p-1.5 text-[#52697E] hover:text-[#B3261E]"><Trash2 size={14} /></button>
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
    <div className="border border-[#D8D0BE] bg-white p-3 flex items-center gap-2 flex-wrap">
      {editingName ? (
        <div className="flex items-center gap-2 flex-1 min-w-[160px]">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="flex-1 border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <button onClick={() => { onUpdate(productType.id, { navn: name.trim() || productType.navn }); setEditingName(false); }} className="text-xs text-[#3D7A5C] font-semibold uppercase">Gem</button>
          <button onClick={() => { setName(productType.navn); setEditingName(false); }} className="text-xs text-[#52697E] font-semibold uppercase">Fortryd</button>
        </div>
      ) : (
        <p className="font-semibold text-sm text-[#1C232E] flex-1">{productType.navn}</p>
      )}
      <select value={productType.kategoriId || ""} onChange={(e) => onUpdate(productType.id, { kategoriId: e.target.value || null })} className="border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1.5 text-xs text-[#1C232E] shrink-0">
        <option value="">Ingen kategori</option>
        {productCategories.map((k) => <option key={k.id} value={k.id}>{k.navn}</option>)}
      </select>
      {!editingName && <button onClick={() => setEditingName(true)} className="p-1.5 text-[#52697E] hover:text-[#E2621B] shrink-0"><Pencil size={14} /></button>}
      <button onClick={() => onDelete(productType.id)} className="p-1.5 text-[#52697E] hover:text-[#B3261E] shrink-0"><Trash2 size={14} /></button>
    </div>
  );
}

function ProductTypeAdmin({ productTypes, productCategories, onAdd, onUpdate, onDelete }) {
  const [newName, setNewName] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  return (
    <div>
      <div className="border border-[#D8D0BE] bg-white p-5 mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Opret ny varetype</h3>
        <div className="flex gap-2 flex-wrap">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Fx 'Kaffemaskine'" className="flex-1 min-w-[160px] border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <select value={newCategoryId} onChange={(e) => setNewCategoryId(e.target.value)} className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E]">
            <option value="">Ingen kategori</option>
            {productCategories.map((k) => <option key={k.id} value={k.id}>{k.navn}</option>)}
          </select>
          <button onClick={() => { if (!newName.trim()) return; onAdd(newName.trim(), newCategoryId || null); setNewName(""); setNewCategoryId(""); }} className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors flex items-center gap-1.5"><Plus size={15} /> Opret</button>
        </div>
      </div>
      <p className="text-[11px] text-[#52697E] mb-2">Hvilke tillægsydelser der er relevante for en varetype styres under fanen "Tillægsydelser" - vælg der hvilke varetyper hver tillægsydelse gælder for.</p>
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
    <div className="border border-[#D8D0BE] bg-white p-3 flex items-center gap-2 flex-wrap">
      {editingName ? (
        <div className="flex items-center gap-2 flex-1 min-w-[160px]">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="flex-1 border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <button onClick={() => { onUpdate(service.id, { navn: name.trim() || service.navn }); setEditingName(false); }} className="text-xs text-[#3D7A5C] font-semibold uppercase">Gem</button>
          <button onClick={() => { setName(service.navn); setEditingName(false); }} className="text-xs text-[#52697E] font-semibold uppercase">Fortryd</button>
        </div>
      ) : (
        <p className="font-semibold text-sm text-[#1C232E] flex-1">{service.navn}</p>
      )}
      {!editingName && <button onClick={() => setEditingName(true)} className="p-1.5 text-[#52697E] hover:text-[#E2621B] shrink-0"><Pencil size={14} /></button>}
      <button onClick={() => onDelete(service.id)} className="p-1.5 text-[#52697E] hover:text-[#B3261E] shrink-0"><Trash2 size={14} /></button>
    </div>
  );
}

function PrimaryServiceAdmin({ primaryServices, onAdd, onUpdate, onDelete }) {
  const [newName, setNewName] = useState("");
  return (
    <div>
      <div className="border border-[#D8D0BE] bg-white p-5 mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Opret ny primær ydelse</h3>
        <div className="flex gap-2 flex-wrap">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Fx 'Montering'" className="flex-1 min-w-[160px] border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <button onClick={() => { if (!newName.trim()) return; onAdd(newName.trim()); setNewName(""); }} className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors flex items-center gap-1.5"><Plus size={15} /> Opret</button>
        </div>
      </div>
      <p className="text-[11px] text-[#52697E] mb-2">Hvilke tillægsydelser der er tilgængelige under en given primær ydelse styres under fanen "Tillægsydelser". Tidsforbrug sættes ikke her — det tastes manuelt af sælgeren for hver enkelt booking.</p>
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
        <div className="mt-3 pt-3 border-t border-[#F0EBDD] space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#52697E] mb-1.5">Vises kun ved disse primære ydelser (påkrævet)</p>
            <div className="flex flex-wrap gap-1.5">
              {primaryServices.length === 0 ? (
                <p className="text-xs text-[#52697E] italic">Opret først en primær ydelse.</p>
              ) : (
                primaryServices.map((p) => {
                  const selected = (service.primaerYdelser || []).includes(p.id);
                  return (
                    <button key={p.id} onClick={() => togglePrimary(p.id)} className={`text-xs px-2 py-1 border transition-colors ${selected ? "border-[#3D7A5C] bg-[#3D7A5C10] text-[#3D7A5C]" : "border-[#D8D0BE] text-[#52697E] hover:border-[#E2621B] hover:text-[#E2621B]"}`}>
                      {p.navn}
                    </button>
                  );
                })
              )}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#52697E] mb-1.5">
              Begræns til bestemte varetyper <span className="normal-case text-[#52697E]/70">({isUniversal ? "gælder lige nu for alle varetyper" : "kun de markerede"})</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {productTypes.map((v) => {
                const selected = (service.varetyper || []).includes(v.id);
                return (
                  <button key={v.id} onClick={() => toggleProductType(v.id)} className={`text-xs px-2 py-1 border transition-colors ${selected ? "border-[#E2621B] bg-[#E2621B10] text-[#E2621B]" : "border-[#D8D0BE] text-[#52697E] hover:border-[#E2621B] hover:text-[#E2621B]"}`}>
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
      <div className="border border-[#D8D0BE] bg-white p-5 mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Opret ny tillægsydelse</h3>
        <div className="flex gap-2 flex-wrap">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Fx 'Dørvending'" className="flex-1 min-w-[160px] border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <button onClick={() => { if (!newName.trim()) return; onAdd(newName.trim()); setNewName(""); }} className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors flex items-center gap-1.5"><Plus size={15} /> Opret</button>
        </div>
        <p className="text-[11px] text-[#52697E] mt-2">Efter oprettelse skal du sætte hvilke primære ydelser den gælder under (nedenfor på hver række) — ellers vises den aldrig i booking-flowet.</p>
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
