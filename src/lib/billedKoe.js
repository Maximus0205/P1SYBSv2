// BILLEDKØ - sammensætningen til appen (oktober 2026). Reglerne ligger i billedKoeCore.js, lageret
// (IndexedDB) i billedKoeStore.js; her kobles de til upload-adapteren, den indloggede bruger og
// browserens begivenheder (nettet kommer tilbage, appen får fokus).
//
// billedKoe er null, hvis enheden ikke har IndexedDB (fx visse private vinduer). Kalderen sender
// da billedet direkte som før - uden offline-beskyttelse, men uden at noget går i stykker.
import { lager } from "../adapters";
import { supabase } from "./supabaseClient";
import { reportSaveFailure } from "./saveStatus";
import { opretBilledKoe } from "./billedKoeCore";
import { opretIndexedDbStore } from "./billedKoeStore";

const INTERVAL_MS = 30 * 1000; // et ekstra forsøg hvert halve minut - også uden at nettet "melder" sig

export async function hentEjerId() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id || null;
  } catch (_) {
    return null;
  }
}

// Kun én fane sender ad gangen. Web Locks findes i alle nyere browsere; mangler de, kører vi uden lås
// (to faner kan så i værste fald sende samme billede - to ens billeder, men ingen tab).
function laas(fn) {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request("p1sybs-billedkoe", { ifAvailable: true }, (lock) => (lock ? fn() : undefined));
  }
  return fn();
}

const store = opretIndexedDbStore();

export const billedKoe = store
  ? opretBilledKoe({
      store,
      upload: (a) => lager.upload({
        orderId: a.orderId,
        file: new File([a.blob], a.navn, { type: a.mimeType }),
        kind: a.kind,
        genoptag: a.genoptag,
      }),
      erOnline: () => typeof navigator === "undefined" || navigator.onLine !== false,
      ejer: hentEjerId,
      laas,
    })
  : null;

// Beder browseren om at lade billederne blive liggende, også når lageret på enheden er ved at løbe
// tør. Uden dette KAN browseren (især Safari på iPhone) rydde dem. Svaret er kun vejledende.
export function bedOmPermanentLager() {
  try { navigator.storage?.persist?.(); } catch (_) { /* kun en anmodning */ }
}

// Kaldes ÉN gang, fra main.jsx.
export function startBilledKoe() {
  if (!billedKoe) return;
  const proev = () => { billedKoe.proev().catch(() => {}); };

  proev();
  setInterval(proev, INTERVAL_MS);
  window.addEventListener("online", proev);
  window.addEventListener("focus", proev);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") proev(); });

  // Et billede, serveren afviser gang på gang, må ikke gå i stilhed: giv brugeren besked ÉN gang.
  let sidstMeldt = null;
  billedKoe.abonner(() => {
    const a = billedKoe.sidsteAfvisning();
    if (!a || a.id === sidstMeldt) return;
    sidstMeldt = a.id;
    reportSaveFailure(`Et billede kunne ikke sendes til sagen (${a.besked}). Det ligger sikkert på enheden - tryk "Prøv igen" under billederne på sagen.`);
  });
}
