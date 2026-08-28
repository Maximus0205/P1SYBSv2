import { useState, useEffect, useCallback } from "react";
import { getStoreUsers, createUserAsAdmin, updateProfile, resetPasswordAsAdmin, updateUserPermissions } from "../lib/dataStore";

// FASE 2 af arkitektur-oprydningen (august 2026) - se hooks/useCatalog.js
// for den fulde begrundelse. Al state og CRUD for BRUGERE (som "montører"
// jo er udledt af, se App.jsx) er samlet her.
//
// Brugere oprettes rigtigt (Supabase Auth) via en edge function, som selv
// tjekker at kalderen er admin - se admin-opret-bruger i dataStore.js.
// updateUser/addUser/deleteUser genindlæser hele listen efter en ændring
// (samme mønster som useTimeOff) - brugerlisten ændrer sig sjældent nok
// til at det ikke er en performance-bekymring, og det undgår at skulle
// holde profil-normaliseringen (rolle/bilId/navn) synkron to steder.
export function useUsers(storeId) {
  const [users, setUsers] = useState([]);

  const load = useCallback(async (id) => {
    if (!id) { setUsers([]); return; }
    setUsers(await getStoreUsers(id));
  }, []);

  useEffect(() => { load(storeId); }, [storeId, load]);

  const addUser = async (fields) => {
    const result = await createUserAsAdmin(fields);
    if (result.ok && storeId) await load(storeId);
    return result;
  };

  const updateUser = async (id, fields) => {
    const dbFields = {};
    if ("rolle" in fields) dbFields.rolle = fields.rolle;
    if ("bilId" in fields) dbFields.bil_id = fields.bilId;
    if ("navn" in fields) dbFields.navn = fields.navn;
    const ok = await updateProfile(id, dbFields);
    if (ok && storeId) await load(storeId);
    return ok;
  };

  const deleteUser = async (id) => {
    if (!window.confirm("Fjern denne brugers adgang til butikken?")) return;
    await updateProfile(id, { butik_id: null, rolle: "saelger" });
    if (storeId) await load(storeId);
  };

  const resetPassword = (userId, newPassword) => resetPasswordAsAdmin(userId, newPassword);

  // Individuelle rettigheds-til-/fravalg (august 2026) - se
  // AdminParts.jsx: UserRow's rettigheds-editor. Håndhæves også i
  // databasen (se profiles_guard_privileged_fields-triggeren), dette kald
  // kan altså ikke bruges til at give sig selv/nogen flere rettigheder end
  // man selv har lov til.
  const updatePermissions = async (userId, { extraPermissions, revokedPermissions }) => {
    const result = await updateUserPermissions(userId, { extraPermissions, revokedPermissions });
    if (result.ok && storeId) await load(storeId);
    return result;
  };

  return { users, addUser, updateUser, deleteUser, resetPassword, updatePermissions, reload: () => load(storeId) };
}
