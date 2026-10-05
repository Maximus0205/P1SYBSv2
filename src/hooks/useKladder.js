import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { hentKladder, subscribeKladder } from "../lib/orderDrafts";
import { startSync } from "../lib/draftSync";

// Den indloggede brugers parkerede kladder i den aktuelle butik (se
// lib/orderDrafts.js). Brugerens id læses fra den lokale session - ingen
// netværkskald - og bruges til, at kladder aldrig vises for en anden bruger
// på samme computer.
//
// SYNKRONISERING (oktober 2026): så længe hooken bruges, holdes kladderne synkroniseret med databasen
// (se lib/draftSync.js), så de også kan åbnes fra brugerens andre enheder. Flere steder kan bruge hooken
// samtidig (Forsiden og bookingsiden); de deler én synkronisering.
//
// klar (oktober 2026): true, når listen er hentet for den aktuelle bruger og butik. Uden den kan en
// bruger af hooken ikke skelne "ingen kladder" fra "listen er ikke hentet endnu" - se
// pages/SalesPage.jsx, der skal vente på listen, før en kladde fra Forsiden kan genoptages.
export function useKladder(storeId) {
  const [userId, setUserId] = useState(null);
  const [kladder, setKladder] = useState([]);
  const [klar, setKlar] = useState(false);

  useEffect(() => {
    let levende = true;
    supabase.auth.getSession()
      .then(({ data }) => { if (levende) setUserId(data?.session?.user?.id || null); })
      .catch(() => { /* uden bruger-id gemmes og vises ingen kladder */ });
    return () => { levende = false; };
  }, []);

  useEffect(() => {
    if (!storeId || !userId) { setKladder([]); setKlar(false); return undefined; }
    return subscribeKladder(() => { setKladder(hentKladder(storeId, userId)); setKlar(true); });
  }, [storeId, userId]);

  useEffect(() => {
    if (!storeId || !userId) return undefined;
    return startSync(supabase, storeId, userId);
  }, [storeId, userId]);

  return { userId, kladder, klar };
}
