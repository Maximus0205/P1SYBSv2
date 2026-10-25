import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { hentButikVarer, opretButikVare, opdaterButikVare, sletButikVare, importerButikVarer } from "../lib/butikVarerStore";

// Butikkens egen varedatabase (store_products) til hele appen: opslaget i bookingen læser listen, admin-siden redigerer den.
// Hentes én gang pr. butik og genindlæses efter hver ændring. Fejler hentningen, er listen bare tom: en manglende liste må
// aldrig stoppe en booking (modeller der ikke kan slås op, kan stadig bookes).
const ikkeTilgaengelig = async () => ({ ok: false, fejl: "Varedatabasen er ikke tilgængelig" });
const TOM = { varer: [], indlaest: false, fejl: null, reload: async () => {}, opret: ikkeTilgaengelig, opdater: ikkeTilgaengelig, slet: ikkeTilgaengelig, importer: ikkeTilgaengelig };
const ButikVarerContext = createContext(TOM);

export function ButikVarerProvider({ storeId, children }) {
  const [varer, setVarer] = useState([]);
  const [indlaest, setIndlaest] = useState(false);
  const [fejl, setFejl] = useState(null);
  const reqRef = useRef(0);

  const reload = useCallback(async () => {
    const id = ++reqRef.current;
    if (!storeId) { setVarer([]); setFejl(null); setIndlaest(true); return; }
    const res = await hentButikVarer(storeId);
    if (id !== reqRef.current) return; // et nyere opslag (eller en anden butik) har overtaget
    if (res.ok) { setVarer(res.varer); setFejl(null); } else setFejl(res.fejl);
    setIndlaest(true);
  }, [storeId]);

  useEffect(() => { setVarer([]); setIndlaest(false); setFejl(null); reload(); }, [reload]);

  const value = useMemo(() => {
    const efterSkrivning = (skriv) => async (...args) => {
      if (!storeId) return { ok: false, fejl: "Ingen butik valgt" };
      const r = await skriv(...args);
      if (r.ok) await reload();
      return r;
    };
    return {
      varer, indlaest, fejl, reload,
      opret: efterSkrivning((felter) => opretButikVare(storeId, felter)),
      opdater: efterSkrivning((id, felter) => opdaterButikVare(id, felter)),
      slet: efterSkrivning((id) => sletButikVare(id)),
      importer: efterSkrivning((liste) => importerButikVarer(storeId, liste)),
    };
  }, [varer, indlaest, fejl, reload, storeId]);

  return <ButikVarerContext.Provider value={value}>{children}</ButikVarerContext.Provider>;
}

export const useButikVarer = () => useContext(ButikVarerContext);
