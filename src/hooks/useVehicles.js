import { useState, useEffect, useCallback } from "react";
import { getVehicles, saveVehicle, deleteVehicle as deleteVehicleApi } from "../lib/dataStore";
import { uid } from "../data/domain";

// FASE 2 af arkitektur-oprydningen (august 2026) - se hooks/useCatalog.js
// for den fulde begrundelse. Al state og CRUD for BILER er samlet her.
//
// VIGTIGT om "slet med bekræftelse hvis tildelt en montør": den tjekker
// mod `technicians` (afledt af BÅDE users og vehicles), som ikke findes
// isoleret her - den slags krydsafhængighed hører hjemme i App.jsx
// (kompositionslaget), ikke i den enkelte hook. Denne hook eksponerer
// derfor et "råt" deleteVehicle uden bekræftelse; selve bekræftelsen
// (deleteVehicleWithConfirm) bliver i App.jsx.
//
// RETTET (august 2026): der seedes IKKE længere 3 standardbiler
// automatisk, første gang en ny butik bruges. En butiks vognpark er
// specifik for netop den butik (antal biler, mærke/model, nummerplader) -
// tre opdigtede biler ("Bil 1"/"AB 12 345" osv.) er ikke retvisende
// standarddata, og skal ikke skulle ryddes manuelt væk igen af en admin
// der opretter en ny butik. En ny butik starter derfor med en tom
// billiste, og admin opretter selv de biler, butikken faktisk har (se
// AdminParts.jsx).
export function useVehicles(storeId) {
  const [vehicles, setVehicles] = useState([]);

  const load = useCallback(async (id) => {
    if (!id) { setVehicles([]); return; }
    const v = await getVehicles(id);
    setVehicles(v);
  }, []);

  useEffect(() => { load(storeId); }, [storeId, load]);

  const saveOneVehicle = (vehicle) => { setVehicles((prev) => (prev.some((b) => b.id === vehicle.id) ? prev.map((b) => (b.id === vehicle.id ? vehicle : b)) : [...prev, vehicle])); if (storeId) saveVehicle(storeId, vehicle); };
  const removeOneVehicle = (id) => { setVehicles((prev) => prev.filter((b) => b.id !== id)); if (storeId) deleteVehicleApi(storeId, id); };

  const addVehicle = (navn, nummerplade) => saveOneVehicle({ id: uid(), navn, nummerplade, lukket: false, lukketAarsag: "" });
  const updateVehicle = (id, fields) => { const b = vehicles.find((x) => x.id === id); if (b) saveOneVehicle({ ...b, ...fields }); };
  const toggleVehicleClosed = (id, reason) => {
    const b = vehicles.find((x) => x.id === id);
    if (b) saveOneVehicle({ ...b, lukket: !b.lukket, lukketAarsag: !b.lukket ? (reason || "Værksted") : "" });
  };

  return { vehicles, addVehicle, updateVehicle, toggleVehicleClosed, deleteVehicle: removeOneVehicle, reload: () => load(storeId) };
}
