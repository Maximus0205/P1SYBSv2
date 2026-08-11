import React, { useEffect, useState } from "react";
import { Building2, Loader2, AlertCircle, Check, Pencil, Users, Search, KeyRound, Trash2, UserPlus, X } from "lucide-react";
import { getAllStores, createStoreAsSystemAdmin, updateStoreAsSystemAdmin, deleteStoreAsSystemAdmin, getAllUsersAsSystemAdmin, updateProfile, resetPasswordAsAdmin, createUserAsAdmin } from "../lib/dataStore";
import { geocodeAddresses } from "../lib/geocoding";
import { suggestUsername, isValidUsername } from "../lib/username";
import { AddressInput } from "../components/AddressInput";

const ROLE_LABEL = { admin: "Administrator", saelger: "Sælger", montor: "Montør" };

// Kun synlig for brugere med profiles.is_system_admin = true. Bruges til at
// oprette/redigere/slette butikker, oprette brugere direkte til en
// vilkårlig butik, og se/redigere/koble eksisterende brugere.
function SystemAdminPage() {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [storeName, setStoreName] = useState("");
  const [storeNumber, setStoreNumber] = useState("");
  const [address, setAddress] = useState("");
  const [addressStatus, setAddressStatus] = useState("tom");
  const [adminLoginType, setAdminLoginType] = useState("brugernavn");
  const [adminName, setAdminName] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminUsernameEdited, setAdminUsernameEdited] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const reload = () => { setLoading(true); getAllStores().then((b) => { setStores(b); setLoading(false); }); };
  useEffect(() => { reload(); }, []);

  const changeAdminName = (val) => {
    setAdminName(val);
    if (!adminUsernameEdited) setAdminUsername(suggestUsername(val));
  };

  const create = async () => {
    setError(""); setMessage("");
    if (!storeName.trim() || !address.trim() || adminPassword.length < 6) {
      setError("Udfyld butiksnavn, adresse og en adgangskode på mindst 6 tegn.");
      return;
    }
    if (storeNumber.trim() && !/^\d{4}$/.test(storeNumber.trim())) {
      setError("Butiksnummer skal være præcis 4 cifre.");
      return;
    }
    if (adminLoginType === "brugernavn" && !isValidUsername(adminUsername)) {
      setError("Brugernavn skal være 2-40 tegn (a-z, tal, punktum eller bindestreg).");
      return;
    }
    if (adminLoginType === "email" && !adminEmail.trim()) {
      setError("Udfyld admin e-mail.");
      return;
    }
    setBusy(true);
    const result = await createStoreAsSystemAdmin({
      butiksNavn: storeName.trim(), adresse: address.trim(), butiksnummer: storeNumber.trim() || null,
      adminNavn: adminName.trim(), adminLoginType, adminEmail: adminEmail.trim(), adminBrugernavn: adminUsername.trim().toLowerCase(), adminAdgangskode: adminPassword,
    });
    setBusy(false);
    if (!result.ok) { setError(result.fejl); return; }
    setMessage(`Butikken "${storeName}" er oprettet, med ${adminLoginType === "brugernavn" ? `brugernavnet "${adminUsername}"` : adminEmail} som admin.`);
    setStoreName(""); setStoreNumber(""); setAddress(""); setAdminName(""); setAdminUsername(""); setAdminUsernameEdited(false); setAdminEmail(""); setAdminPassword("");
    reload();
  };

  const startDelete = (id) => { setDeletingId(id); setDeleteConfirm(""); setDeleteError(""); };
  const confirmDelete = async (store) => {
    if (deleteConfirm.trim() !== store.navn) { setDeleteError(`Skriv butikkens navn ("${store.navn}") for at bekræfte.`); return; }
    setDeleteBusy(true);
    const result = await deleteStoreAsSystemAdmin(store.id);
    setDeleteBusy(false);
    if (!result.ok) { setDeleteError(result.fejl || "Kunne ikke slette butikken."); return; }
    setDeletingId(null);
    reload();
  };

  return (
    <div>
      <div className="border border-[#D8D0BE] bg-white p-5 mb-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-1 flex items-center gap-2"><Building2 size={16} /> Opret ny butik</h3>
        <p className="text-xs text-[#52697E] mb-3">Butikkens adresse geokodes automatisk - resten af butikkens system (adresseforslag ved booking) tager udgangspunkt i den, så en butik på Fyn ikke primært får forslag fra København.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Butiksnavn" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <input value={storeNumber} onChange={(e) => setStoreNumber(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Butiksnummer (4 cifre, valgfrit)" inputMode="numeric" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] font-mono focus:outline-none focus:border-[#E2621B]" />
          <div className="sm:col-span-2">
            <AddressInput value={address} onChange={setAddress} placeholder="Butikkens adresse" onValidationChange={setAddressStatus} />
          </div>
        </div>

        <p className="text-xs font-semibold uppercase tracking-wide text-[#52697E] mt-4 mb-2">Butikkens første admin</p>
        <div className="flex border border-[#D8D0BE] mb-3 text-xs font-semibold uppercase tracking-wide w-fit">
          <button onClick={() => setAdminLoginType("brugernavn")} className={`px-3 py-1.5 transition-colors ${adminLoginType === "brugernavn" ? "bg-[#1C232E] text-white" : "text-[#52697E] hover:text-[#1C232E]"}`}>Brugernavn</button>
          <button onClick={() => setAdminLoginType("email")} className={`px-3 py-1.5 transition-colors ${adminLoginType === "email" ? "bg-[#1C232E] text-white" : "text-[#52697E] hover:text-[#1C232E]"}`}>E-mail</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={adminName} onChange={(e) => changeAdminName(e.target.value)} placeholder="Navn på butikkens første admin" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          {adminLoginType === "brugernavn" ? (
            <input value={adminUsername} onChange={(e) => { setAdminUsername(e.target.value); setAdminUsernameEdited(true); }} placeholder="Brugernavn (foreslået, kan rettes)" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] font-mono focus:outline-none focus:border-[#E2621B]" />
          ) : (
            <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="Admin e-mail" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          )}
          <input value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="Admin adgangskode (mindst 6 tegn)" className="sm:col-span-2 border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        </div>
        {error && <p className="text-xs text-[#B3261E] mt-2 flex items-center gap-1.5"><AlertCircle size={13} /> {error}</p>}
        {message && <p className="text-xs text-[#3D7A5C] mt-2 flex items-center gap-1.5"><Check size={13} /> {message}</p>}
        <button onClick={create} disabled={busy} className="mt-3 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors flex items-center gap-1.5 disabled:opacity-60">
          {busy && <Loader2 size={14} className="animate-spin" />} {busy ? "Opretter..." : "Opret butik"}
        </button>
      </div>

      <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Alle butikker ({stores.length})</h3>
      {loading ? (
        <p className="text-sm text-[#52697E]">Indlæser...</p>
      ) : (
        <div className="space-y-2 mb-8">
          {stores.map((b) =>
            editingId === b.id ? (
              <StoreEditor key={b.id} store={b} onDone={() => { setEditingId(null); reload(); }} onCancel={() => setEditingId(null)} />
            ) : deletingId === b.id ? (
              <div key={b.id} className="bg-white border border-[#B3261E] p-3">
                <p className="text-sm text-[#B3261E] font-semibold flex items-center gap-1.5 mb-1"><AlertCircle size={14} /> Slet "{b.navn}" permanent?</p>
                <p className="text-xs text-[#52697E] mb-2">Alle butikkens sager, biler, varetyper m.m. slettes for altid. Brugernes login bevares, de mister blot adgangen til denne butik. Skriv butikkens navn for at bekræfte.</p>
                <div className="flex gap-2 flex-wrap items-center">
                  <input autoFocus value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder={b.navn} className="flex-1 min-w-[160px] border border-[#B3261E] bg-[#F3EFE6] px-2 py-1.5 text-sm text-[#1C232E]" />
                  <button onClick={() => confirmDelete(b)} disabled={deleteBusy} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white bg-[#B3261E] hover:bg-[#1C232E] transition-colors disabled:opacity-60 flex items-center gap-1.5">
                    {deleteBusy && <Loader2 size={12} className="animate-spin" />} Slet permanent
                  </button>
                  <button onClick={() => setDeletingId(null)} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#52697E] border border-[#D8D0BE]">Fortryd</button>
                </div>
                {deleteError && <p className="text-xs text-[#B3261E] mt-2">{deleteError}</p>}
              </div>
            ) : (
              <div key={b.id} className="bg-white border border-[#D8D0BE] p-3 flex items-center gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-[#1C232E]">
                    {b.navn}
                    {b.butiksnummer && <span className="ml-2 font-mono text-xs text-[#52697E]">#{b.butiksnummer}</span>}
                  </p>
                  <p className="text-xs text-[#52697E] truncate">{b.adresse}</p>
                </div>
                <button onClick={() => setEditingId(b.id)} className="p-1.5 text-[#52697E] hover:text-[#E2621B] shrink-0" title="Redigér"><Pencil size={15} /></button>
                <button onClick={() => startDelete(b.id)} className="p-1.5 text-[#52697E] hover:text-[#B3261E] shrink-0" title="Slet butik"><Trash2 size={15} /></button>
              </div>
            )
          )}
        </div>
      )}

      <CreateUserDirect stores={stores} />
      <AllUsers stores={stores} />
    </div>
  );
}

// Redigering af én eksisterende butik: navn, butiksnummer og adresse
// (geokoder på ny, hvis adressen ændres, så adresse-fokuspunktet forbliver
// korrekt). Bruger geocodeAddresses (batch-funktionen, tager en liste og
// returnerer et Map nøglet på normaliseret adressetekst) - der findes ikke
// nogen ental-udgave i geocoding.js, så et enkelt-element-kald pakkes ind
// som en liste med ét element.
function StoreEditor({ store, onDone, onCancel }) {
  const [name, setName] = useState(store.navn);
  const [number, setNumber] = useState(store.butiksnummer || "");
  const [address, setAddress] = useState(store.adresse || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setError("");
    if (!name.trim() || !address.trim()) { setError("Navn og adresse er påkrævet."); return; }
    if (number.trim() && !/^\d{4}$/.test(number.trim())) { setError("Butiksnummer skal være præcis 4 cifre."); return; }
    setBusy(true);

    const fields = { navn: name.trim(), butiksnummer: number.trim() || null, adresse: address.trim() };
    const cleanAddress = address.trim();
    if (cleanAddress !== store.adresse) {
      const coordMap = await geocodeAddresses([cleanAddress]);
      const coord = coordMap.get(cleanAddress.toLowerCase());
      if (coord) { fields.lat = coord.lat; fields.lon = coord.lon; }
    }

    const result = await updateStoreAsSystemAdmin(store.id, fields);
    setBusy(false);
    if (!result.ok) {
      setError(result.fejl?.includes("store_number") ? "Butiksnummeret er allerede i brug af en anden butik." : result.fejl);
      return;
    }
    onDone();
  };

  return (
    <div className="bg-white border border-[#E2621B] p-3">
      <div className="grid gap-2 sm:grid-cols-2 mb-2">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Butiksnavn" className="border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1.5 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        <input value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Butiksnummer (4 cifre)" inputMode="numeric" className="border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1.5 text-sm text-[#1C232E] font-mono focus:outline-none focus:border-[#E2621B]" />
        <div className="sm:col-span-2">
          <AddressInput value={address} onChange={setAddress} placeholder="Adresse" />
        </div>
      </div>
      {error && <p className="text-xs text-[#B3261E] mb-2 flex items-center gap-1.5"><AlertCircle size={12} /> {error}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors disabled:opacity-60 flex items-center gap-1.5">
          {busy && <Loader2 size={12} className="animate-spin" />} Gem
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#52697E] border border-[#D8D0BE]">Fortryd</button>
      </div>
    </div>
  );
}

// Systemadmin opretter en bruger direkte til en VALGFRI butik, uden om
// "opret ny butik"-flowet - fx til en butik der allerede findes.
function CreateUserDirect({ stores }) {
  const [storeId, setStoreId] = useState("");
  const [loginType, setLoginType] = useState("brugernavn");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("saelger");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const changeName = (val) => {
    setName(val);
    if (!usernameEdited) setUsername(suggestUsername(val));
  };

  const create = async () => {
    setError(""); setMessage("");
    if (!storeId) { setError("Vælg hvilken butik brugeren skal høre til."); return; }
    if (!name.trim() || !password.trim()) { setError("Udfyld navn og adgangskode."); return; }
    if (loginType === "brugernavn" && !isValidUsername(username)) { setError("Brugernavn skal være 2-40 tegn (a-z, tal, punktum eller bindestreg)."); return; }
    if (loginType === "email" && !email.trim()) { setError("Udfyld e-mail."); return; }
    setBusy(true);
    const result = await createUserAsAdmin({ navn: name.trim(), loginType, email: email.trim(), brugernavn: username.trim().toLowerCase(), adgangskode: password, rolle: role, butikId: storeId });
    setBusy(false);
    if (!result.ok) { setError(result.fejl || "Kunne ikke oprette brugeren."); return; }
    setMessage(`Bruger oprettet i valgt butik.`);
    setName(""); setUsername(""); setUsernameEdited(false); setEmail(""); setPassword(""); setRole("saelger");
  };

  return (
    <div className="border border-[#D8D0BE] bg-white p-5 mb-8">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-1 flex items-center gap-2"><UserPlus size={16} /> Opret bruger direkte til en butik</h3>
      <p className="text-xs text-[#52697E] mb-3">Til at oprette en ekstra bruger i en butik, der allerede findes — uden at skulle oprette en ny butik.</p>
      <div className="flex border border-[#D8D0BE] mb-3 text-xs font-semibold uppercase tracking-wide w-fit">
        <button onClick={() => setLoginType("brugernavn")} className={`px-3 py-1.5 transition-colors ${loginType === "brugernavn" ? "bg-[#1C232E] text-white" : "text-[#52697E] hover:text-[#1C232E]"}`}>Brugernavn</button>
        <button onClick={() => setLoginType("email")} className={`px-3 py-1.5 transition-colors ${loginType === "email" ? "bg-[#1C232E] text-white" : "text-[#52697E] hover:text-[#1C232E]"}`}>E-mail</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="sm:col-span-2 border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]">
          <option value="">Vælg butik...</option>
          {stores.map((b) => <option key={b.id} value={b.id}>{b.navn}{b.butiksnummer ? ` #${b.butiksnummer}` : ""}</option>)}
        </select>
        <input value={name} onChange={(e) => changeName(e.target.value)} placeholder="Navn" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        {loginType === "brugernavn" ? (
          <input value={username} onChange={(e) => { setUsername(e.target.value); setUsernameEdited(true); }} placeholder="Brugernavn (foreslået, kan rettes)" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] font-mono focus:outline-none focus:border-[#E2621B]" />
        ) : (
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        )}
        <select value={role} onChange={(e) => setRole(e.target.value)} className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E]">
          <option value="saelger">Sælger</option>
          <option value="montor">Montør</option>
          <option value="admin">Administrator</option>
        </select>
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Adgangskode (mindst 6 tegn)" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
      </div>
      {error && <p className="text-xs text-[#B3261E] mt-2 flex items-center gap-1.5"><AlertCircle size={13} /> {error}</p>}
      {message && <p className="text-xs text-[#3D7A5C] mt-2 flex items-center gap-1.5"><Check size={13} /> {message}</p>}
      <button onClick={create} disabled={busy} className="mt-3 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors flex items-center gap-1.5 disabled:opacity-60">
        {busy && <Loader2 size={14} className="animate-spin" />} {busy ? "Opretter..." : "Opret bruger"}
      </button>
    </div>
  );
}

// Én bruger-række med redigerbart navn, rolle, butik-kobling og
// adgangskode-nulstilling. Bruges i "Alle brugere"-visningen.
function SystemAdminUserRow({ user, stores, onUpdated }) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(user.navn);
  const [showReset, setShowReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const store = stores.find((bu) => bu.id === user.butikId);

  const saveName = async () => {
    setBusy(true);
    await updateProfile(user.id, { navn: name.trim() || user.navn });
    setBusy(false);
    setEditingName(false);
    onUpdated();
  };

  const updateField = async (fields) => {
    setBusy(true);
    await updateProfile(user.id, fields);
    setBusy(false);
    onUpdated();
  };

  const reset = async () => {
    if (newPassword.length < 6) { setResetMessage("Mindst 6 tegn."); return; }
    setBusy(true);
    const result = await resetPasswordAsAdmin(user.id, newPassword);
    setBusy(false);
    if (!result.ok) { setResetMessage(result.fejl || "Kunne ikke nulstille."); return; }
    setResetMessage("Nulstillet.");
    setNewPassword("");
    setTimeout(() => { setShowReset(false); setResetMessage(""); }, 1200);
  };

  return (
    <div className="bg-white border border-[#D8D0BE] p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[160px]">
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
              <button onClick={saveName} className="text-xs text-[#3D7A5C] font-semibold uppercase">Gem</button>
              <button onClick={() => { setName(user.navn); setEditingName(false); }} className="text-xs text-[#52697E] font-semibold uppercase">Fortryd</button>
            </div>
          ) : (
            <p className="text-sm text-[#1C232E] truncate">{user.navn}</p>
          )}
          <p className="text-[11px] text-[#52697E] truncate">
            {user.brugernavn ? `brugernavn: ${user.brugernavn}` : "login via e-mail"}
            {store ? ` · ${store.navn}` : " · ingen butik"}
          </p>
        </div>
        <select value={user.rolle} onChange={(e) => updateField({ rolle: e.target.value })} disabled={busy} className="border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1.5 text-xs text-[#1C232E]">
          {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={user.butikId || ""} onChange={(e) => updateField({ butik_id: e.target.value || null })} disabled={busy} className="border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1.5 text-xs text-[#1C232E] min-w-[160px]">
          <option value="">Ingen butik</option>
          {stores.map((bu) => <option key={bu.id} value={bu.id}>{bu.navn}{bu.butiksnummer ? ` #${bu.butiksnummer}` : ""}</option>)}
        </select>
        {!editingName && <button onClick={() => setEditingName(true)} className="p-1.5 text-[#52697E] hover:text-[#E2621B]" title="Ret navn"><Pencil size={15} /></button>}
        <button onClick={() => { setShowReset((v) => !v); setResetMessage(""); setNewPassword(""); }} className="p-1.5 text-[#52697E] hover:text-[#E2621B]" title="Nulstil adgangskode"><KeyRound size={15} /></button>
        {busy && <Loader2 size={14} className="animate-spin text-[#52697E]" />}
      </div>
      {showReset && (
        <div className="mt-2.5 pt-2.5 border-t border-[#F0EBDD] flex items-center gap-2 flex-wrap">
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Ny adgangskode (mindst 6 tegn)" className="flex-1 min-w-[160px] border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1.5 text-xs text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <button onClick={reset} disabled={busy} className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors disabled:opacity-60">Sæt ny adgangskode</button>
          {resetMessage && <span className={`text-[11px] ${resetMessage === "Nulstillet." ? "text-[#3D7A5C]" : "text-[#B3261E]"}`}>{resetMessage}</span>}
        </div>
      )}
    </div>
  );
}

// Se og redigere ALLE brugere i hele kæden (navn, rolle, butik-kobling,
// adgangskode) - med en "vis alle"-knap, så man ikke skal søge for at få
// et fuldt overblik. Uden "vis alle" vises kun ukoblede brugere, med mindre
// der søges (samme opførsel som før, bevaret for hurtigt at kunne finde
// nyoprettede/ventende brugere).
function AllUsers({ stores }) {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = (text, all) => {
    setLoading(true);
    getAllUsersAsSystemAdmin(text, all).then((b) => { setUsers(b); setLoading(false); });
  };
  useEffect(() => { reload("", false); }, []);

  const toggleShowAll = () => { const next = !showAll; setShowAll(next); reload(search, next); };

  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-1 flex items-center gap-2"><Users size={16} /> Alle brugere</h3>
      <p className="text-xs text-[#52697E] mb-3">Se, redigér og kobl enhver bruger i hele kæden til en butik, eller nulstil deres adgangskode. Uden "Vis alle" vises kun brugere der endnu ikke er koblet til nogen butik.</p>

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#52697E]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && reload(search, showAll)}
            placeholder="Søg på navn eller brugernavn..."
            className="w-full border border-[#D8D0BE] bg-[#F3EFE6] pl-8 pr-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]"
          />
        </div>
        <button
          onClick={toggleShowAll}
          className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide border transition-colors ${showAll ? "bg-[#1C232E] text-white border-[#1C232E]" : "text-[#52697E] border-[#D8D0BE] hover:border-[#E2621B] hover:text-[#E2621B]"}`}
        >
          {showAll ? "Viser alle" : "Vis alle brugere"}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-[#52697E]">Indlæser...</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-[#52697E] italic">{search ? "Ingen brugere matcher søgningen." : showAll ? "Ingen brugere i systemet endnu." : "Ingen ukoblede brugere lige nu."}</p>
      ) : (
        <div className="space-y-2">
          {users.map((b) => (
            <SystemAdminUserRow key={b.id} user={b} stores={stores} onUpdated={() => reload(search, showAll)} />
          ))}
        </div>
      )}
    </div>
  );
}

export { SystemAdminPage };
