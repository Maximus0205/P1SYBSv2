// OPDAGER NYE UDGIVELSER UDEN MANUEL CACHE-RYDNING (september 2026)
//
// BAGGRUND: GitHub Pages tillader ikke tilpassede cache-headers pr. fil
// (ingen "_headers"-fil som fx Netlify/Vercel understøtter) - derfor kan
// index.html blive liggende i browserens/mobilens egen cache længe efter
// en ny udgivelse, og appen bliver ved med at vise den GAMLE version,
// indtil nogen manuelt rydder browserdata. Det gælder især Safari på
// iPhone, som cacher aggressivt.
//
// LØSNINGEN kan ikke styre browserens cache-adfærd direkte (det er netop
// begrænsningen) - i stedet opdager appen SELV, at der findes en nyere
// udgivelse, og gør brugeren opmærksom på det med en synlig, ikke-
// påtrængende besked (se UpdateAvailableBanner.jsx), i stedet for at
// lade ændringer forsvinde stille.
//
// version.json genereres FRISK ved hver udgivelse (se
// .github/workflows/deploy.yml, som skriver github.sha ind i filen EFTER
// selve build-trinnet) - dens indhold ændrer sig derfor ved hver eneste
// udgivelse, uanset om noget i selve app-koden også ændrede sig.
// Hentningen sker ALTID med { cache: "no-store" } + et tilfældigt
// forespørgselsparameter - dobbelt sikring mod, at netop DENNE ene lille
// fil selv bliver cachet væk.
const VERSION_URL = `${import.meta.env.BASE_URL}version.json`;
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutter

let bootBuild = null; // den udgivelse, DENNE side blev indlæst med
let latestSeen = null; // den nyeste udgivelse, vi har set på serveren
const listeners = new Set();

async function fetchBuild() {
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.build || null;
  } catch (_) {
    return null; // netværksfejl, forsøg igen ved næste tjek - ikke en fejl brugeren skal se
  }
}

function notify() {
  // Kun vis beskeden, hvis vi rent faktisk KENDER begge værdier og de er
  // FORSKELLIGE - ellers ville en manglende/endnu-ikke-udgivet
  // version.json (fx lige efter denne funktion selv er udgivet) blive
  // fejltolket som "der er en ny version".
  const nyVersionKlar = bootBuild != null && latestSeen != null && latestSeen !== bootBuild;
  listeners.forEach((fn) => {
    try {
      fn(nyVersionKlar);
    } catch (_) {
      // Se samme begrundelse som i lib/saveStatus.js - en fejlende lytter
      // må ikke vælte selve tjekket.
    }
  });
}

// Kaldes ÉN gang, fra main.jsx, uden for React - starter periodisk tjek
// (hvert 5. minut) samt et ekstra tjek, hver gang appen kommer tilbage i
// fokus (fx montøren skifter tilbage fra Kort-appen efter en navigation) -
// det er ofte HER, en opdatering reelt bliver synlig, ikke først efter
// et helt 5-minutters interval.
export function startVersionCheck() {
  fetchBuild().then((build) => {
    bootBuild = build;
  });

  const check = async () => {
    const build = await fetchBuild();
    if (build) {
      latestSeen = build;
      notify();
    }
  };

  setInterval(check, CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
  window.addEventListener("focus", check);
}

export function subscribeNewVersion(fn) {
  listeners.add(fn);
  fn(bootBuild != null && latestSeen != null && latestSeen !== bootBuild);
  return () => listeners.delete(fn);
}
