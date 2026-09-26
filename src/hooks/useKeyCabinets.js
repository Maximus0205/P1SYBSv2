import { useState, useEffect, useCallback } from "react";
import { getKeyCabinets, addKeyCabinet as addKeyCabinetApi, updateKeyCabinet as updateKeyCabinetApi, deleteKeyCabinet as deleteKeyCabinetApi } from "../lib/dataStore";

// Samme mønster som hooks/useAddressNotes.js: al state og CRUD for
// nøgleskabe (se dataStore.js: key_cabinets) samlet ét sted.
//
// Ingen optimistisk lokal opdatering ved add/update - genindlæser hele
// listen efter skrivning, ligesom useAddressNotes/useTimeOff. Nøgleskabe
// oprettes/rettes sjældent (det er faste, fysiske skabe, ikke noget der
// ændrer sig dagligt), så den lille ventetid er uden betydning, og det
// undgår at skulle gætte databasens tildelte id og created_at lokalt.
export function useKeyCabinets(storeId) {
  const [keyCabinets, setKeyCabinets] = useState([]);

  const load = useCallback(async (id) => {
    if (!id) { setKeyCabinets([]); return; }
    setKeyCabinets(await getKeyCabinets(id));
  }, []);

  useEffect(() => { load(storeId); }, [storeId, load]);

  const addKeyCabinet = async (fields, createdBy) => {
    if (!storeId) return { ok: false, fejl: "Ingen butik valgt" };
    const result = await addKeyCabinetApi(storeId, { ...fields, createdBy });
    if (result.ok) await load(storeId);
    return result;
  };

  const updateKeyCabinet = async (id, fields) => {
    const ok = await updateKeyCabinetApi(id, fields);
    if (ok && storeId) await load(storeId);
    return ok;
  };

  const deleteKeyCabinet = async (id) => {
    if (!storeId) return;
    await deleteKeyCabinetApi(id);
    await load(storeId);
  };

  return { keyCabinets, addKeyCabinet, updateKeyCabinet, deleteKeyCabinet, reload: () => load(storeId) };
}
