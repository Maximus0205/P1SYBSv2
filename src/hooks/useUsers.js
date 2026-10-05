import { useState, useEffect, useCallback } from "react";
import { getStoreUsers, createUserAsAdmin, updateProfile, resetPasswordAsAdmin, updateUserPermissions, deleteUserAsAdmin } from "../lib/dataStore";
import { sletBruger } from "../lib/sletBruger";

// Al state og CRUD for BRUGERE (som "montører" udledes af, se koererSelv
// i App.jsx) er samlet her.
//
// Brugere oprettes rigtigt (Supabase Auth) via en edge function, som selv
// tjekker at kalderen er admin. updateUser/addUser/deleteUser genindlæser
// hele listen efter en ændring - brugerlisten ændrer sig sjældent nok til
// at det ikke er en performance-bekymring, og det undgår at holde
// profil-normaliseringen synkron to steder.
export function useUsers(storeId) {
  const [users, setUsers] = useState([]);

  const load = useCallback(async (id) => {
    if (!id) { setUsers([]); return; }
    setUsers(await getStoreUsers(id));
  }, []);

  useEffect(() => { load(storeId); }, [storeId, load]);

  // Sender ALTID butikId (= den butik hooket er parameteriseret med)
  // eksplicit med. For en almindelig admin ignorerer edge functionen den
  // og bruger deres egen butik - men for en SYSTEMADMIN, der er skiftet
  // over til en anden butik, er det afgørende: uden det ville brugeren
  // blive oprettet UDEN nogen butik overhovedet.
  const addUser = async (fields) => {
    const result = await createUserAsAdmin({ ...fields, butikId: storeId });
    if (result.ok && storeId) await load(storeId);
    return result;
  };

  // RETTET (september 2026): felterne videresendes EKSPLICIT, ét ad
  // gangen - og "kanKoere" manglede på listen. Konsekvensen var, at
  // "Kører rute"-knappen i Admin så ud til at virke (den kaldte videre og
  // fejlede ikke), men feltet blev filtreret fra her og nåede aldrig
  // databasen. Der var ingen fejlmeddelelse; knappen skiftede bare aldrig
  // udseende.
  //
  // Det er anden gang, denne slags hvidliste har tabt et nyt felt tavst.
  // Grunden til at listen bevares frem for at sende alt videre er, at
  // updateProfile også kan sætte butik_id og rolle - felter en
  // ubetænksom kalder ikke skal kunne komme til at ændre ved et uheld.
  // Prisen er, at et nyt felt skal tilføjes BEGGE steder; det er værd at
  // huske, næste gang profilen udvides.
  const updateUser = async (id, fields) => {
    const dbFields = {};
    if ("rolle" in fields) dbFields.rolle = fields.rolle;
    if ("bilId" in fields) dbFields.bilId = fields.bilId;
    if ("navn" in fields) dbFields.navn = fields.navn;
    if ("kanKoere" in fields) dbFields.kanKoere = fields.kanKoere;
    const ok = await updateProfile(id, dbFields);
    if (ok && storeId) await load(storeId);
    return ok;
  };

  // SLETTER brugeren PERMANENT - både Auth-login og profil.
  //
  // Tidligere fjernede denne blot butikstilknytningen. Brugeren beholdt
  // sit login og lå tilbage som en forældreløs konto, ingen kunne se i
  // nogen butik - og som stadig kunne logge ind. Skal en medarbejder
  // flytte butik, er DET en systemadmin-opgave.
  //
  // Henter FØRST konsekvenserne (tjekKun) og viser dem i bekræftelsen.
  // Det er ikke en formalitet: fravær og sygemeldinger slettes med
  // brugeren (CASCADE), og kommende sager tildelt personen bliver
  // liggende og dukker op under "Sygemelding / feriefridag". At slette en
  // montør midt i en uge med 12 sager i kalenderen skal man vide, at man gør.
  //
  // Selve flowet (tjek, bekræftelse, sletning) ligger siden oktober 2026 i lib/sletBruger.js, så Admin og
  // Systemadmin bruger det SAMME. Rettighedstjekket og de to spærringer - man kan ikke slette sig selv, og man kan
  // ikke slette butikkens sidste admin - ligger i edge functionen, ikke her. UI'et er ikke sikkerhedsgrænsen.
  const deleteUser = async (id) => {
    const result = await sletBruger(id, { slet: deleteUserAsAdmin, bekraeft: (t) => window.confirm(t), advar: (t) => window.alert(t) });
    if (result.ok && storeId) await load(storeId);
    return result;
  };

  const resetPassword = (userId, newPassword) => resetPasswordAsAdmin(userId, newPassword);

  // Individuelle rettigheds-til-/fravalg. Håndhæves også i databasen (se
  // profiles_guard_privileged_fields), så dette kald ikke kan bruges til
  // at give nogen flere rettigheder end man selv har lov til.
  const updatePermissions = async (userId, { extraPermissions, revokedPermissions }) => {
    const result = await updateUserPermissions(userId, { extraPermissions, revokedPermissions });
    if (result.ok && storeId) await load(storeId);
    return result;
  };

  return { users, addUser, updateUser, deleteUser, resetPassword, updatePermissions, reload: () => load(storeId) };
}
