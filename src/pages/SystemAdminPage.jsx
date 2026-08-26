import React, { useEffect, useState } from "react";
import { Building2, Loader2, AlertCircle, Check, Pencil, Users, Search, KeyRound, Trash2, UserPlus, X, Bug, RefreshCw } from "lucide-react";
import { getAllStores, createStoreAsSystemAdmin, updateStoreAsSystemAdmin, deleteStoreAsSystemAdmin, getAllUsersAsSystemAdmin, updateProfile, resetPasswordAsAdmin, createUserAsAdmin, getErrorLogs, deleteErrorLog, clearErrorLogs } from "../lib/dataStore";
import { geocodeAddresses } from "../lib/geocoding";
import { suggestUsername, isValidUsername } from "../lib/username";
import { AddressInput } from "../components/AddressInput";

const ROLE_LABEL = { admin: "Administrator", saelger: "Sælger", montor: "Montør" };

// Kun synlig for brugere med profiles.is_system_admin = true. To faner:
// "Butikker" (opret/redigér/slet butikker, opret/koble brugere - som før)
// og "Fejl-log" (august 2026, ny) - automatisk opsamlede fejl fra hele
// systemet, se lib/errorLog.js for selve indsamlingen.
function SystemAdminPage() {
  const [tab, setTab] = useState("butikker");
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);

  const reloadStores = () => { setLoading(true); getAllStores().then((b) => { setStores(b); setLoading(false); }); };
  useEffect(() => { reloadStores(); }, []);

  return (
    <div>
      <div className="flex border-b border-line mb-6">
        <button onClick={() => setTab("butikker")} className={`px-4 py-2 text-sm font-semibold uppercase tracking-wide transition-colors flex items-center gap-1.5 ${tab === "butikker" ? "text-ink border-b-2 border-brand" : "text-muted hover:text-ink"}`}>
          <Building2 size={15} /> Butikker
        </button>
        <button onClick={() => setTab("fejl")} className={`px-4 py-2 text-sm font-semibold uppercase tracking-wide transition-colors flex items-center gap-1.5 ${tab === "fejl" ? "text-ink border-b-2 border-brand" : "text-muted hover:text-ink"}`}>
          <Bug size={15} /> Fejl-log
        </button>
      </div>

      {tab === "butikker" ? (
        <StoresTab stores={stores} loading={loading} reload={reloadStores} />
      ) : (
        <ErrorLogTab stores={stores} />
      )}
    </div>
  );
}

// Al den oprindelige butiks-/bruger-administration, uændret - kun flyttet
// ind under sin egen fane (var tidligere hele SystemAdminPage's indhold).
function StoresTab({ stores, loading, reload }) {
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
      <div className="rounded-xl border border-line bg-white p-5 mb-6 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1 flex items-center gap-2"><Building2 size={16} /> Opret ny butik</h3>
        <p className="text-xs text-muted mb-3">Butikkens adresse geokodes automatisk - resten af butikkens system (adresseforslag ved booking) tager udgangspunkt i den, så en butik på Fyn ikke primært får forslag fra København.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Butiksnavn" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
          <input value={storeNumber} onChange={(e) => setStoreNumber(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Butiksnummer (4 cifre, valgfrit)" inputMode="numeric" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink font-mono focus:outline-none focus:border-brand" />
          <div className="sm:col-span-2">
            <AddressInput value={address} onChange={setAddress} placeholder="Butikkens adresse" onValidationChange={setAddressStatus} />
          </div>
        </div>

        <p className="text-xs font-semibold uppercase tracking-wide text-muted mt-4 mb-2">Butikkens første admin</p>
        <div className="flex rounded-full border border-line mb-3 text-xs font-semibold uppercase tracking-wide w-fit overflow-hidden">
          <button onClick={() => setAdminLoginType("brugernavn")} className={`px-3 py-1.5 transition-colors ${adminLoginType === "brugernavn" ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>Brugernavn</button>
          <button onClick={() => setAdminLoginType("email")} className={`px-3 py-1.5 transition-colors ${adminLoginType === "email" ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>E-mail</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={adminName} onChange={(e) => changeAdminName(e.target.value)} placeholder="Navn på butikkens første admin" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
          {adminLoginType === "brugernavn" ? (
            <input value={adminUsername} onChange={(e) => { setAdminUsername(e.target.value); setAdminUsernameEdited(true); }} placeholder="Brugernavn (foreslået, kan rettes)" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink font-mono focus:outline-none focus:border-brand" />
          ) : (
            <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="Admin e-mail" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
          )}
          <input value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="Admin adgangskode (mindst 6 tegn)" className="sm:col-span-2 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
        </div>
        {error && <p className="text-xs text-danger mt-2 flex items-center gap-1.5"><AlertCircle size={13} /> {error}</p>}
        {message && <p className="text-xs text-success mt-2 flex items-center gap-1.5"><Check size={13} /> {message}</p>}
        <button onClick={create} disabled={busy} className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors flex items-center gap-1.5 disabled:opacity-60">
          {busy && <Loader2 size={14} className="animate-spin" />} {busy ? "Opretter..." : "Opret butik"}
        </button>
      </div>

      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-3">Alle butikker ({stores.length})</h3>
      {loading ? (
        <p className="text-sm text-muted">Indlæser...</p>
      ) : (
        <div className="space-y-2 mb-8">
          {stores.map((b) =>
            editingId === b.id ? (
              <StoreEditor key={b.id} store={b} onDone={() => { setEditingId(null); reload(); }} onCancel={() => setEditingId(null)} />
            ) : deletingId === b.id ? (
              <div key={b.id} className="rounded-xl bg-white border border-danger p-3 shadow-sm">
                <p className="text-sm text-danger font-semibold flex items-center gap-1.5 mb-1"><AlertCircle size={14} /> Slet "{b.navn}" permanent?</p>
                <p className="text-xs text-muted mb-2">Alle butikkens sager, biler, varetyper m.m. slettes for altid. Brugernes login bevares, de mister blot adgangen til denne butik. Skriv butikkens navn for at bekræfte.</p>
                <div className="flex gap-2 flex-wrap items-center">
                  <input autoFocus value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder={b.navn} className="flex-1 min-w-[160px] rounded-lg border border-danger bg-panel px-2 py-1.5 text-sm text-ink" />
                  <button onClick={() => confirmDelete(b)} disabled={deleteBusy} className="px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-danger hover:bg-ink transition-colors disabled:opacity-60 flex items-center gap-1.5">
                    {deleteBusy && <Loader2 size={12} className="animate-spin" />} Slet permanent
                  </button>
                  <button onClick={() => setDeletingId(null)} className="px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide text-muted border border-line">Fortryd</button>
                </div>
                {deleteError && <p className="text-xs text-danger mt-2">{deleteError}</p>}
              </div>
            ) : (
              <div key={b.id} className="rounded-xl bg-white border border-line p-3 flex items-center gap-3 flex-wrap shadow-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-ink">
                    {b.navn}
                    {b.butiksnummer && <span className="ml-2 font-mono text-xs text-muted">#{b.butiksnummer}</span>}
                  </p>
                  <p className="text-xs text-muted truncate">{b.adresse}</p>
                </div>
                <button onClick={() => setEditingId(b.id)} className="p-1.5 text-muted hover:text-brand shrink-0" title="Redigér"><Pencil size={15} /></button>
                <button onClick={() => startDelete(b.id)} className="p-1.5 text-muted hover:text-danger shrink-0" title="Slet butik"><Trash2 size={15} /></button>
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

// Ny fane (august 2026): fejl fanget automatisk fra HELE systemet (både
// uventede JS-fejl/crashes OG mislykkede Supabase-kald der ellers kun stod
// i browserens konsol) - se lib/errorLog.js for selve indsamlingen. Nyeste
// øverst. Kan foldes ud pr. post for at se stack trace/kontekst/URL/enhed.
function ErrorLogTab({ stores }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const reload = () => { setLoading(true); getErrorLogs(200).then((l) => { setLogs(l); setLoading(false); }); };
  useEffect(() => { reload(); }, []);

  const clearAll = async () => {
    if (!window.confirm("Ryd hele fejl-loggen? Kan ikke fortrydes.")) return;
    await clearErrorLogs();
    reload();
  };

  const removeOne = async (id) => {
    await deleteErrorLog(id);
    reload();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink flex items-center gap-2"><Bug size={16} /> Fejl-log</h3>
          <p className="text-xs text-muted">Uventede fejl og mislykkede kald, fanget automatisk fra hele systemet — nyeste øverst.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={reload} className="p-2 rounded-lg text-ink border border-line hover:border-brand hover:text-brand transition-colors" title="Opdater"><RefreshCw size={15} /></button>
          {logs.length > 0 && (
            <button onClick={clearAll} className="px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-danger border border-danger hover:bg-danger hover:text-white transition-colors">Ryd log</button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Indlæser...</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-success italic flex items-center gap-1.5"><Check size={14} /> Ingen fejl registreret.</p>
      ) : (
        <div className="space-y-2">
          {logs.map((l) => {
            const store = stores.find((s) => s.id === l.butikId);
            const open = expandedId === l.id;
            return (
              <div key={l.id} className="rounded-xl bg-white border border-line shadow-sm overflow-hidden">
                <button onClick={() => setExpandedId(open ? null : l.id)} className="w-full text-left p-3 flex items-start gap-3">
                  <AlertCircle size={15} className="text-danger shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink truncate">{l.besked}</p>
                    <p className="text-[11px] text-muted mt-0.5">
                      {new Date(l.tid).toLocaleString("da-DK")} · {l.kilde}
                      {store ? ` · ${store.navn}` : ""}{l.rolle ? ` · ${l.rolle}` : ""}
                    </p>
                  </div>
                </button>
                {open && (
                  <div className="border-t border-divider p-3 bg-panel text-xs space-y-2">
                    {l.url && <p className="text-muted break-all"><span className="font-semibold text-ink">URL:</span> {l.url}</p>}
                    {l.brugerAgent && <p className="text-muted break-all"><span className="font-semibold text-ink">Enhed:</span> {l.brugerAgent}</p>}
                    {l.kontekst && (
                      <pre className="text-muted whitespace-pre-wrap break-all bg-white border border-line rounded-lg p-2 max-h-48 overflow-y-auto">{JSON.stringify(l.kontekst, null, 2)}</pre>
                    )}
                    {l.stack && (
                      <pre className="text-muted whitespace-pre-wrap break-all bg-white border border-line rounded-lg p-2 max-h-48 overflow-y-auto">{l.stack}</pre>
                    )}
                    <button onClick={() => removeOne(l.id)} className="text-danger underline hover:no-underline">Fjern denne post</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
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
    <div className="rounded-xl bg-white border border-brand p-3 shadow-sm">
      <div className="grid gap-2 sm:grid-cols-2 mb-2">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Butiksnavn" className="rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-brand" />
        <input value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Butiksnummer (4 cifre)" inputMode="numeric" className="rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink font-mono focus:outline-none focus:border-brand" />
        <div className="sm:col-span-2">
          <AddressInput value={address} onChange={setAddress} placeholder="Adresse" />
        </div>
      </div>
      {error && <p className="text-xs text-danger mb-2 flex items-center gap-1.5"><AlertCircle size={12} /> {error}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors disabled:opacity-60 flex items-center gap-1.5">
          {busy && <Loader2 size={12} className="animate-spin" />} Gem
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide text-muted border border-line">Fortryd</button>
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
    <div className="rounded-xl border border-line bg-white p-5 mb-8 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1 flex items-center gap-2"><UserPlus size={16} /> Opret bruger direkte til en butik</h3>
      <p className="text-xs text-muted mb-3">Til at oprette en ekstra bruger i en butik, der allerede findes — uden at skulle oprette en ny butik.</p>
      <div className="flex rounded-full border border-line mb-3 text-xs font-semibold uppercase tracking-wide w-fit overflow-hidden">
        <button onClick={() => setLoginType("brugernavn")} className={`px-3 py-1.5 transition-colors ${loginType === "brugernavn" ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>Brugernavn</button>
        <button onClick={() => setLoginType("email")} className={`px-3 py-1.5 transition-colors ${loginType === "email" ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>E-mail</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="sm:col-span-2 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand">
          <option value="">Vælg butik...</option>
          {stores.map((b) => <option key={b.id} value={b.id}>{b.navn}{b.butiksnummer ? ` #${b.butiksnummer}` : ""}</option>)}
        </select>
        <input value={name} onChange={(e) => changeName(e.target.value)} placeholder="Navn" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
        {loginType === "brugernavn" ? (
          <input value={username} onChange={(e) => { setUsername(e.target.value); setUsernameEdited(true); }} placeholder="Brugernavn (foreslået, kan rettes)" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink font-mono focus:outline-none focus:border-brand" />
        ) : (
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
        )}
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink">
          <option value="saelger">Sælger</option>
          <option value="montor">Montør</option>
          <option value="admin">Administrator</option>
        </select>
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Adgangskode (mindst 6 tegn)" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
      </div>
      {error && <p className="text-xs text-danger mt-2 flex items-center gap-1.5"><AlertCircle size={13} /> {error}</p>}
      {message && <p className="text-xs text-success mt-2 flex items-center gap-1.5"><Check size={13} /> {message}</p>}
      <button onClick={create} disabled={busy} className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors flex items-center gap-1.5 disabled:opacity-60">
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
    <div className="rounded-xl bg-white border border-line p-3 shadow-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[160px]">
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border border-line bg-panel px-2 py-1 text-sm text-ink focus:outline-none focus:border-brand" />
              <button onClick={saveName} className="text-xs text-success font-semibold uppercase">Gem</button>
              <button onClick={() => { setName(user.navn); setEditingName(false); }} className="text-xs text-muted font-semibold uppercase">Fortryd</button>
            </div>
          ) : (
            <p className="text-sm text-ink truncate">{user.navn}</p>
          )}
          <p className="text-[11px] text-muted truncate">
            {user.brugernavn ? `brugernavn: ${user.brugernavn}` : "login via e-mail"}
            {store ? ` · ${store.navn}` : " · ingen butik"}
          </p>
        </div>
        <select value={user.rolle} onChange={(e) => updateField({ rolle: e.target.value })} disabled={busy} className="rounded-lg border border-line bg-panel px-2 py-1.5 text-xs text-ink">
          {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={user.butikId || ""} onChange={(e) => updateField({ butik_id: e.target.value || null })} disabled={busy} className="rounded-lg border border-line bg-panel px-2 py-1.5 text-xs text-ink min-w-[160px]">
          <option value="">Ingen butik</option>
          {stores.map((bu) => <option key={bu.id} value={bu.id}>{bu.navn}{bu.butiksnummer ? ` #${bu.butiksnummer}` : ""}</option>)}
        </select>
        {!editingName && <button onClick={() => setEditingName(true)} className="p-1.5 text-muted hover:text-brand" title="Ret navn"><Pencil size={15} /></button>}
        <button onClick={() => { setShowReset((v) => !v); setResetMessage(""); setNewPassword(""); }} className="p-1.5 text-muted hover:text-brand" title="Nulstil adgangskode"><KeyRound size={15} /></button>
        {busy && <Loader2 size={14} className="animate-spin text-muted" />}
      </div>
      {showReset && (
        <div className="mt-2.5 pt-2.5 border-t border-divider flex items-center gap-2 flex-wrap">
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Ny adgangskode (mindst 6 tegn)" className="flex-1 min-w-[160px] rounded-lg border border-line bg-panel px-2 py-1.5 text-xs text-ink focus:outline-none focus:border-brand" />
          <button onClick={reset} disabled={busy} className="px-3 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors disabled:opacity-60">Sæt ny adgangskode</button>
          {resetMessage && <span className={`text-[11px] ${resetMessage === "Nulstillet." ? "text-success" : "text-danger"}`}>{resetMessage}</span>}
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
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1 flex items-center gap-2"><Users size={16} /> Alle brugere</h3>
      <p className="text-xs text-muted mb-3">Se, redigér og kobl enhver bruger i hele kæden til en butik, eller nulstil deres adgangskode. Uden "Vis alle" vises kun brugere der endnu ikke er koblet til nogen butik.</p>

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && reload(search, showAll)}
            placeholder="Søg på navn eller brugernavn..."
            className="w-full rounded-lg border border-line bg-panel pl-8 pr-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
          />
        </div>
        <button
          onClick={toggleShowAll}
          className={`px-3 py-2 rounded-full text-xs font-semibold uppercase tracking-wide border transition-colors ${showAll ? "bg-ink text-white border-ink" : "text-muted border-line hover:border-brand hover:text-brand"}`}
        >
          {showAll ? "Viser alle" : "Vis alle brugere"}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Indlæser...</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-muted italic">{search ? "Ingen brugere matcher søgningen." : showAll ? "Ingen brugere i systemet endnu." : "Ingen ukoblede brugere lige nu."}</p>
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
