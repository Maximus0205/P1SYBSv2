// ANTAL BILLEDER PÅ EN SAG (oktober 2026). Fanerne ("Billeder (3)"), færdigmeldingens påmindelse og sletningens oversigt talte før kun
// sagens gamle base64-billeder (order.billeder). Nye billeder ligger i fillageret og er ikke en del af sagen - derfor stod der 0 ved en
// sag med tre billeder, og færdigmeldingen advarede om "Ingen billeder på sagen".
//
// Her samles tallet ét sted: gamle billeder + billeder i fillageret + billeder på enheden, der endnu ikke er sendt (billedkøen).
// antal er null, når fillageret ikke kunne spørges (fx uden net) og tallet derfor ikke kendes - så vises kun de gamle, og
// advarsler om manglende billeder udebliver i stedet for at påstå noget forkert.
import { useEffect, useState, useSyncExternalStore } from "react";
import { getAttachmentsResult } from "./attachments";
import { billedKoe } from "./billedKoe";

const kendt = new Map();            // orderId -> antal billeder i fillageret (kun bekræftede svar)
const lyttere = new Set();
const underveje = new Map();        // orderId -> igangværende hentning (så flere komponenter ikke henter samtidig)
let version = 0;

const giv = () => { version++; lyttere.forEach((fn) => { try { fn(); } catch (_) { /* en lytter må ikke vælte noget */ } }); };

// Kaldes af den, der alligevel har hentet sagens vedhæftninger (Photos), så tallet er friskt uden en ekstra hentning.
export function meldBilledAntal(orderId, antal) {
  const id = String(orderId);
  if (kendt.get(id) === antal) return;
  kendt.set(id, antal);
  giv();
}

async function hent(orderId) {
  const id = String(orderId);
  if (underveje.has(id)) return underveje.get(id);
  const l = (async () => {
    try {
      const r = await getAttachmentsResult(id);
      if (r.ok) meldBilledAntal(id, r.rows.filter((a) => a.kind === "billede").length);
    } catch (_) { /* tallet forbliver ukendt */ }
    finally { underveje.delete(id); }
  })();
  underveje.set(id, l);
  return l;
}

const abonner = (fn) => { lyttere.add(fn); return () => lyttere.delete(fn); };

// { antal, kendt }: antal = alle billeder, vi ved af; kendt = om fillagerets tal er bekræftet (ellers er antal kun et minimum).
export function useBilledAntal(order) {
  const orderId = order?.id;
  useSyncExternalStore(abonner, () => version);
  const [ventende, setVentende] = useState(0);
  useEffect(() => {
    if (!orderId) return undefined;
    if (!kendt.has(String(orderId))) hent(orderId);
    if (!billedKoe) return undefined;
    return billedKoe.abonner((v) => setVentende(v.filter((p) => p.orderId === String(orderId) && p.kind === "billede").length));
  }, [orderId]);
  const gamle = (order?.billeder || []).length;
  const iLager = orderId ? kendt.get(String(orderId)) : undefined;
  return { antal: gamle + (iLager ?? 0) + ventende, kendt: iLager !== undefined };
}
