// Registrerer service workeren (sw/sw.template.js), så appen kan åbnes uden net (oktober 2026).
//
// Kun i en udgivet app (ikke under lokal udvikling, hvor Vite selv leverer filerne) og kun hvis browseren
// kan. Fejler registreringen (fx privat vindue, eller siden ikke kører på https), virker appen præcis som
// før - bare uden at kunne åbnes uden net. Der genindlæses aldrig automatisk (se UpdateAvailableBanner.jsx).
export function registrerOfflineSkal() {
  if (!import.meta.env.PROD || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const base = import.meta.env.BASE_URL;
  const registrer = () => {
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch((e) => {
      console.warn("Offline-skal kunne ikke registreres:", e?.message || e);
    });
  };
  // Efter første visning: registreringen må ikke konkurrere med selve indlæsningen af appen.
  if (document.readyState === "complete") registrer();
  else window.addEventListener("load", registrer, { once: true });
}
