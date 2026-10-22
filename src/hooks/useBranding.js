import { useCallback, useEffect, useRef, useState } from "react";
import { applyBrandingColors, fetchHostBranding, fetchStoreBranding, readCachedBranding, writeCachedBranding } from "../lib/branding";

// Den effektive branding for det, brugeren ser lige nu:
//   - uden butik (login-siden, systemadmin uden valgt butik): kædens
//     branding ud fra domænet
//   - med butik: kædens branding med butikkens egne felter øverst
//
// Starter fra cachen (sidst viste branding på denne enhed), så der ikke
// blinker et standardudseende. Fejler et opslag (netværk, eller databasen
// mangler endnu migrationen), beholdes det, der allerede vises.
export function useBranding(storeId) {
  const [branding, setBranding] = useState(readCachedBranding);
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++requestRef.current;
    const next = storeId ? await fetchStoreBranding(storeId) : await fetchHostBranding(window.location.hostname);
    if (!next || requestId !== requestRef.current) return;
    setBranding(next);
    // Kun domænets (kædens) branding caches - det er den, login-siden skal
    // vise næste gang. En butiks egen branding hører til efter login.
    if (!storeId) writeCachedBranding(next);
  }, [storeId]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { applyBrandingColors(branding.colors); }, [branding.colors]);

  return { branding, reload };
}
