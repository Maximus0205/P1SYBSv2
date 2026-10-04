import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { hentKladder, subscribeKladder } from "../lib/orderDrafts";

// Den indloggede brugers parkerede kladder i den aktuelle butik (se
// lib/orderDrafts.js). Brugerens id læses fra den lokale session - ingen
// netværkskald - og bruges til, at kladder aldrig vises for en anden bruger
// på samme computer.
export function useKladder(storeId) {
  const [userId, setUserId] = useState(null);
  const [kladder, setKladder] = useState([]);

  useEffect(() => {
    let levende = true;
    supabase.auth.getSession()
      .then(({ data }) => { if (levende) setUserId(data?.session?.user?.id || null); })
      .catch(() => { /* uden bruger-id gemmes og vises ingen kladder */ });
    return () => { levende = false; };
  }, []);

  useEffect(() => {
    if (!storeId || !userId) { setKladder([]); return undefined; }
    return subscribeKladder(() => setKladder(hentKladder(storeId, userId)));
  }, [storeId, userId]);

  return { userId, kladder };
}
