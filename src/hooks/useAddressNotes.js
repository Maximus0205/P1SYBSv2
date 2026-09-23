import { useState, useEffect, useCallback } from "react";
import { getAddressNotes, addAddressNote as addAddressNoteApi, deleteAddressNote as deleteAddressNoteApi } from "../lib/dataStore";
import { buildingKey } from "../data/domain";

// FASE-mønsteret fra hooks/useCatalog.js og hooks/useTimeOff.js: al state
// og CRUD for adresse-noter (vidensdeling, se dataStore.js:
// address_notes) samlet ét sted.
//
// addAddressNote har ikke en optimistisk lokal opdatering - genindlæser
// hele listen efter skrivning, ligesom useTimeOff.addTimeOff. Det sker
// sjældent nok (en montør/sælger flager en adresse), at den lille
// ventetid ikke er noget problem, og det undgår at skulle gætte databasens
// tildelte id og created_at lokalt.
export function useAddressNotes(storeId) {
  const [addressNotes, setAddressNotes] = useState([]);

  const load = useCallback(async (id) => {
    if (!id) { setAddressNotes([]); return; }
    setAddressNotes(await getAddressNotes(id));
  }, []);

  useEffect(() => { load(storeId); }, [storeId, load]);

  // address: den RÅ, tastede adresse - address_key beregnes her (samme
  // buildingKey som resten af appen bruger til at genkende "samme
  // opgang"), så kaldende kode aldrig selv skal huske at normalisere.
  const addAddressNote = async (address, note, createdBy) => {
    if (!storeId) return { ok: false, fejl: "Ingen butik valgt" };
    const key = buildingKey(address);
    if (!key) return { ok: false, fejl: "Ingen adresse at knytte noten til" };
    const result = await addAddressNoteApi(storeId, { addressKey: key, addressDisplay: address, note, createdBy });
    if (result.ok) await load(storeId);
    return result;
  };

  const deleteAddressNote = async (id) => {
    if (!storeId) return;
    await deleteAddressNoteApi(id);
    await load(storeId);
  };

  return { addressNotes, addAddressNote, deleteAddressNote, reload: () => load(storeId) };
}
