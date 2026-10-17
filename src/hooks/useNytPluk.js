import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { todayISO } from "../data/domain";
import { nyeNoegler } from "../lib/nytPlukLogik";

// "Nyt på dagens pluk" (oktober 2026) til lageret: hvilke varer er kommet på pluklisten for I DAG, siden denne bruger sidst
// trykkede "Forstået". Se lib/nytPlukLogik.js for reglen.
//
// HVOR GEMMES DET: kun "hvad har jeg set" gemmes, i browserens localStorage pr. bruger og dag. Selve pluklisten kommer som før fra
// databasen. Konsekvens: "set" følger ikke med mellem enheder - åbner du listen på en anden telefon, regnes den dag som ny dér.
// Fordelen er, at ingen delt forretningsdata er afhængig af browseren, og at to lagermænd ikke kvitterer for hinanden.
//
// aktiv: skal være false, mens sagerne endnu ikke er hentet (ellers ville en tom liste blive husket som "set", og alt dukke op som nyt),
// og false for andre datoer end i dag. Flere komponenter kan bruge hooken samtidig; de holdes ens via en vindues-hændelse.

const PREFIX = "p1sybs:nytpluk:";
const HAENDELSE = "p1sybs-nytpluk";

function laes(noegle) {
  try {
    const r = window.localStorage.getItem(noegle);
    if (!r) return null;
    const v = JSON.parse(r);
    return Array.isArray(v?.ids) ? new Set(v.ids) : null;
  } catch (_) { return null; }
}

function gem(noegle, ids) {
  try { window.localStorage.setItem(noegle, JSON.stringify({ ids: [...ids], t: Date.now() })); return true; } catch (_) { return false; }
}

// Fjern gamle dage, så lageret ikke vokser.
function ryd(dato) {
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX) && !k.endsWith(`:${dato}`)) window.localStorage.removeItem(k);
    }
  } catch (_) { /* ingen lagring tilgængelig - så vises intet som nyt */ }
}

export function useNytPluk(noegler, aktiv = true) {
  const [userId, setUserId] = useState(null);
  const [version, setVersion] = useState(0);
  const dato = todayISO();
  const liste = noegler || [];
  const noeglerStreng = liste.join("|");
  const lsNoegle = userId ? `${PREFIX}${userId}:${dato}` : null;

  useEffect(() => {
    let live = true;
    supabase.auth.getSession().then(({ data }) => { if (live) setUserId(data?.session?.user?.id || null); }).catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const h = () => setVersion((v) => v + 1);
    window.addEventListener(HAENDELSE, h);
    return () => window.removeEventListener(HAENDELSE, h);
  }, []);

  // Første gang dagen ses: gør det nuværende til det kendte, uden at melde noget som nyt.
  useEffect(() => {
    if (!aktiv || !lsNoegle) return;
    if (laes(lsNoegle)) return;
    ryd(dato);
    if (gem(lsNoegle, liste)) setVersion((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiv, lsNoegle, dato]);

  const nye = useMemo(() => {
    if (!aktiv || !lsNoegle) return new Set();
    return new Set(nyeNoegler(liste, laes(lsNoegle)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiv, lsNoegle, noeglerStreng, version]);

  // "Forstået": alt, der er på listen nu, er set.
  const markerSet = useCallback(() => {
    if (!lsNoegle) return;
    if (gem(lsNoegle, liste)) window.dispatchEvent(new Event(HAENDELSE));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lsNoegle, noeglerStreng]);

  return { nye, markerSet };
}
