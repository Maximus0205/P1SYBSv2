import { useState, useEffect, useCallback } from "react";
import { getStoreUsers, createUserAsAdmin, updateProfile, resetPasswordAsAdmin, updateUserPermissions, deleteUserAsAdmin } from "../lib/dataStore";

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

  // RETTET (august 2026): sender nu ALTID butikId (= den butik hooket er
  // parameteriseret med - den butik der lige nu vises, se App.jsx's
  // butiks-skifter for systemadmins) eksplicit med. For en almindelig
  // admin ignorerer edge functionen (admin-opret-bruger) den alligevel og
  // bruger deres egen butik - men for en SYSTEMADMIN, der lige nu er
  // skiftet over til at se en anden butik end deres egen, er det
  // afgørende: uden det ville edge functionen (som for systemadmins
  // eksplicit stoler på et medsendt butikId) ende med at oprette brugeren
  // UDEN nogen butik overhovedet.
  const addUser = async (fields) => {
    const result = await createUserAsAdmin({ ...fields, butikId: storeId });
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

  // SLETTER brugeren PERMANENT - både Auth-login og profil (august 2026).
  //
  // ÆNDRET: tidligere fjernede denne blot butikstilknytningen
  // (store_id = null, rolle = saelger). Brugeren beholdt sit login og lå
  // tilbage som en forældreløs konto, ingen kunne se i nogen butik - og
  // som stadig kunne logge ind. Det var hverken sletning eller en tydelig
  // handling. Skal en medarbejder flytte butik, er DET en systemadmin-
  // opgave (de har overblikket over alle butikker og kan sætte
  // butikstilknytningen direkte, se updateProfile/butik_id og
  // SystemAdminPage). Butikkens egen admin kan oprette og slette i sin
  // egen butik - ikke flytte folk rundt i kæden.
  //
  // Henter FØRST konsekvenserne (tjekKun) og viser dem i bekræftelsen.
  // Det er ikke en formalitet: fravær og sygemeldinger slettes med
  // brugeren (CASCADE), og kommende sager tildelt personen bliver
  // liggende og dukker op i Planlægning under "Montørproblem". At slette
  // en montør midt i en uge med 12 sager i kalenderen skal man vide, at
  // man gør.
  //
  // Selve rettighedstjekket og de to spærringer - man kan ikke slette sig
  // selv, og man kan ikke slette butikkens sidste admin - ligger i edge
  // functionen admin-slet-bruger, ikke her. UI'et er ikke
  // sikkerhedsgrænsen.
  const deleteUser = async (id) => {
    const tjek = await deleteUserAsAdmin(id, { tjekKun: true });
    if (!tjek.ok) {
      window.alert(tjek.fejl || "Kunne ikke slette brugeren.");
      return { ok: false, fejl: tjek.fejl };
    }

    const k = tjek.konsekvenser || {};
    const linjer = [
      `Slet ${k.navn || "brugeren"} permanent?`,
      "",
      "Loginet og profilen slettes og kan ikke gendannes.",
    ];
    if (k.fravaersperioder > 0) {
      linjer.push(`· ${k.fravaersperioder} ${k.fravaersperioder === 1 ? "registreret fravær/sygemelding slettes" : "registrerede fravær/sygemeldinger slettes"} med.`);
    }
    if (k.kommendeSager > 0) {
      linjer.push(`· ${k.kommendeSager} ${k.kommendeSager === 1 ? "kommende sag er" : "kommende sager er"} tildelt personen. ${k.kommendeSager === 1 ? "Den" : "De"} slettes IKKE, men skal tildeles en anden montør - se Planlægning under "Montørproblem".`);
    }
    if (!window.confirm(linjer.join("\n"))) return { ok: false, annulleret: true };

    const result = await deleteUserAsAdmin(id);
    if (!result.ok) {
      window.alert(result.fejl || "Kunne ikke slette brugeren.");
      return result;
    }
    if (storeId) await load(storeId);
    return result;
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
