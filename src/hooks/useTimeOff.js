import { useState, useEffect, useCallback } from "react";
import { getTimeOff, addTimeOff as addTimeOffApi, deleteTimeOff as deleteTimeOffApi, beginSickLeave as beginSickLeaveApi, endSickLeave as endSickLeaveApi } from "../lib/dataStore";

// FASE 2 af arkitektur-oprydningen (august 2026) - se hooks/useCatalog.js
// for den fulde begrundelse. Al state og CRUD for FRAVÆR (ferie/sygdom pr.
// montør) er samlet her.
//
// addTimeOff/deleteTimeOff har ikke en optimistisk lokal opdatering (i
// modsætning til fx biler/varekatalog) - de venter på svaret fra databasen
// og genindlæser derefter hele listen. Det er bevidst bevaret fra den
// oprindelige implementering i App.jsx: addTimeOffApi returnerer ikke den
// oprettede rækkes database-tildelte id, så en lokal optimistisk tilføjelse
// ville kræve at GÆTTE et id, som senere skal erstattes - det er den slags
// kompleksitet der ikke er værd at indføre for en handling, der sker
// sjældent.
//
// sygemeld/raskmeld (august 2026) genbruger BEVIDST samme underliggende
// data/tabel som ferie (se dataStore.js: type "ferie"/"sygdom") - kun
// selve ARBEJDSGANGEN er forskellig: sygemeld starter en ÅBEN periode fra
// i dag uden kendt slutdato, raskmeld lukker den igen. Se
// AdminParts.jsx (TechnicianRow) for selve knapperne.
export function useTimeOff(storeId) {
  const [timeOff, setTimeOff] = useState([]);

  const load = useCallback(async (id) => {
    if (!id) { setTimeOff([]); return; }
    setTimeOff(await getTimeOff(id));
  }, []);

  useEffect(() => { load(storeId); }, [storeId, load]);

  const addTimeOff = async (fields) => { if (!storeId) return; await addTimeOffApi(storeId, fields); await load(storeId); };
  const deleteTimeOff = async (id) => { if (!storeId) return; await deleteTimeOffApi(id); await load(storeId); };
  const sygemeld = async (montorId, note) => { if (!storeId) return; await beginSickLeaveApi(storeId, montorId, note); await load(storeId); };
  const raskmeld = async (timeOffId) => { if (!storeId) return; await endSickLeaveApi(timeOffId); await load(storeId); };

  return { timeOff, addTimeOff, deleteTimeOff, sygemeld, raskmeld, reload: () => load(storeId) };
}
