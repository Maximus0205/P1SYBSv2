// SELVHELBREDELSE (oktober 2026) - den del af den, der ligger i appen. Selve helbredelsen ligger som et lille script i index.html (så den
// virker, selv når appens egne filer er i stykker): se dér. Her er kun
//   * meldAppStartet(): fortæller scriptet, at appen er kommet op (ellers fjerner det offline-skallen efter 20 sekunder),
//   * helbredVedFejl(): kaldes af ErrorBoundary, når appen går ned - fjerner skallen og genindlæser (højst hvert 10. minut),
//   * meldTidligereHelbredelse(): skriver ÉN gang til fejl-loggen, at en helbredelse skete, så systemadmin kan se det.
import { logError } from "./errorLog";

const NOEGLE = "p1sybs-helbredt";

export function meldAppStartet() {
  if (typeof window !== "undefined") window.__p1Startet = true;
}

// Svarer true, hvis en helbredelse er sat i gang (siden genindlæses om et øjeblik).
export function helbredVedFejl(fejl) {
  try {
    return typeof window !== "undefined" && typeof window.__p1Helbred === "function"
      ? window.__p1Helbred(`Appen gik ned: ${fejl?.message || fejl || "ukendt fejl"}`)
      : false;
  } catch (_) { return false; }
}

export function meldTidligereHelbredelse() {
  try {
    const raw = localStorage.getItem(NOEGLE);
    if (!raw) return;
    const o = JSON.parse(raw);
    if (!o || o.logget) return;
    localStorage.setItem(NOEGLE, JSON.stringify({ ...o, logget: true }));
    logError("selvhelbredelse", `Offline-skallen blev fjernet automatisk: ${o.grund || "ukendt grund"}`, { tid: o.tid });
  } catch (_) { /* en helbredelses-melding må aldrig vælte noget */ }
}
