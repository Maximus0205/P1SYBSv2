import { useState, useEffect, useCallback } from "react";
import { getCrew, setCrewPair, setCrewSolo, saveDayHelpers } from "../lib/dataStore";

// HOLD (oktober 2026): faste makkerpar, montører der kører alene, og dagens medhjælpere pr. bil. Databasen er sandheden
// (alle enheder skal se samme hold), derfor ingen lokal gætte-opdatering: hver ændring gemmes og listen genindlæses.
// Funktionerne returnerer true/false, så UI'et kan vise, om det lykkedes.
export function useCrew(storeId) {
  const [crew, setCrew] = useState({ pairs: [], solo: [], helpers: [] });

  const load = useCallback(async (id) => {
    if (!id) { setCrew({ pairs: [], solo: [], helpers: [] }); return; }
    setCrew(await getCrew(id));
  }, []);
  useEffect(() => { load(storeId); }, [storeId, load]);

  const run = async (fn) => { if (!storeId) return false; const ok = await fn(); await load(storeId); return ok; };
  const setPair = (montorId, helperId) => run(() => setCrewPair(storeId, montorId, helperId));
  const setSolo = (personId, alene) => run(() => setCrewSolo(storeId, personId, alene));
  const saveDay = (dato, tildelinger, createdBy) => run(() => saveDayHelpers(storeId, dato, tildelinger, createdBy));

  return { crew, setPair, setSolo, saveDay, reload: () => load(storeId) };
}
