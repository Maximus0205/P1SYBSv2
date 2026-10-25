// SERVICE WORKER - gør, at appen kan ÅBNES uden net (oktober 2026).
//
// Skabelon: vite.config.js skriver filen til dist/sw.js ved hver bygning og erstatter BUILD-konstanten
// nedenfor med udgivelsens id. Dermed ændrer sw.js sig ved HVER udgivelse, og browseren henter den nye service worker.
//
// HVAD DEN GØR - og IKKE gør:
//   * Gemmer selve appen (index.html + de filer, den peger på), så den kan startes i en kælder.
//   * Rører ALDRIG data: kun filer fra appens egen adresse. Kald til Supabase (anden adresse) går
//     uberørt forbi og caches ikke - sagsdata kommer fra databasen, aldrig fra denne cache.
//   * version.json og sw.js hentes altid direkte fra nettet (ny-udgave-besked, se lib/versionCheck.js).
//   * Siden hentes NET-FØRST: med dækning får brugeren altid den nyeste udgave. Svarer nettet ikke
//     inden 4 sekunder (dårlig dækning), vises den gemte udgave i stedet - appen venter ikke i minutter.
//   * Filerne under assets/ har indholdsbestemte navne og kan aldrig ændre sig: de hentes CACHE-FØRST.
//   * Ingen automatisk genindlæsning: en montør kan stå midt i en rapport (se UpdateAvailableBanner.jsx).

const BUILD = "__BUILD__";
const PRAEFIKS = "p1sybs-skal-";
const CACHE = PRAEFIKS + BUILD;
const BASE = new URL(self.registration.scope);   // fx https://vært/P1SYBSv2/
const INDEX = BASE.href;
const NAVIGATION_TIMEOUT_MS = 4000;
const STATISK = ["manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

const iBase = (u) => u.origin === BASE.origin && u.pathname.startsWith(BASE.pathname);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const side = await fetch(INDEX, { cache: "reload" });
    if (!side.ok) throw new Error(`index.html: ${side.status}`);
    const html = await side.clone().text();
    await cache.put(INDEX, side);

    // Alt, index.html peger på (script, stilark, ikoner). Filerne under assets/ SKAL med - mangler en, afbrydes
    // installationen, så en halv udgave aldrig aktiveres. Resten (ikoner m.m.) er "så godt det kan lade sig gøre".
    const krav = new Set(), valgfri = new Set();
    for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      let u; try { u = new URL(m[1], INDEX); } catch (_) { continue; }
      if (!iBase(u) || u.href === INDEX) continue;
      (u.pathname.slice(BASE.pathname.length).startsWith("assets/") ? krav : valgfri).add(u.href);
    }
    for (const f of STATISK) valgfri.add(new URL(f, INDEX).href);

    await Promise.all([...krav].map(async (u) => {
      const r = await fetch(u, { cache: "reload" });
      if (!r.ok) throw new Error(`${u}: ${r.status}`);
      await cache.put(u, r);
    }));
    await Promise.all([...valgfri].filter((u) => !krav.has(u)).map(async (u) => {
      try { const r = await fetch(u, { cache: "reload" }); if (r.ok) await cache.put(u, r); } catch (_) { /* valgfri */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Appen er ét samlet script (ingen senere indlæsning af dele), så ældre udgavers filer ikke skal bruges igen.
    for (const navn of await caches.keys()) if (navn.startsWith(PRAEFIKS) && navn !== CACHE) await caches.delete(navn);
    await self.clients.claim();
  })());
});

async function navigation(event) {
  const cache = await caches.open(CACHE);
  // cache: "no-cache" = spørg ALTID serveren, om siden er ændret (billig 304, hvis ikke). Uden det kan
  // browserens egen HTTP-cache (GitHub Pages: 10 minutter) levere en gammel side, selv om vi går net-først.
  const net = fetch(event.request.url, { cache: "no-cache" }).then((res) => {
    if (res.ok) cache.put(INDEX, res.clone());       // næste gang uden net: nyeste udgave
    return res;
  });
  event.waitUntil(net.catch(() => {}));              // lad opdateringen af den gemte side gøre sig færdig
  const gemt = await cache.match(INDEX);
  if (!gemt) return net;                             // intet at falde tilbage på (første besøg)
  const timeout = new Promise((resolve) => setTimeout(() => resolve(gemt), NAVIGATION_TIMEOUT_MS));
  return Promise.race([net.catch(() => gemt), timeout]);
}

async function cacheFoerst(request) {
  const cache = await caches.open(CACHE);
  const gemt = await cache.match(request);
  if (gemt) return gemt;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function netFoerst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const gemt = await cache.match(request);
    if (gemt) return gemt;
    throw e;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!iBase(url)) return;                           // Supabase m.fl.: aldrig vores sag
  const sti = url.pathname.slice(BASE.pathname.length);
  if (sti === "version.json" || sti === "sw.js") return;
  if (req.mode === "navigate") {
    if (sti !== "" && sti !== "index.html") return;  // fx backoffice/ - egen side, ikke denne
    event.respondWith(navigation(event));
    return;
  }
  event.respondWith(sti.startsWith("assets/") ? cacheFoerst(req) : netFoerst(req));
});
