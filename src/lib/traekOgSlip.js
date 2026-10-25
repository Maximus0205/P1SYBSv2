// TRÆK OG SLIP I PLANLÆGNING - de rene regler (ingen DOM/React), afprøvet i tests/traekOgSlip.test.mjs.
//
// Hvad et træk kan: (1) ændre rækkefølgen af en bils sager samme dag, (2) flytte en sag til en ANDEN bil samme
// dag (eller til "Ikke tildelt"). Et træk til en anden DAG er bevidst ikke tilladt: en ny dag kræver et
// kapacitetstjek og en bevidst bekræftelse (se booking), ikke en tilfældig slip.
//
// Handlingerne udføres af de eksisterende, versionsstyrede funktioner (useOrders.setVisitOrder / assignVehicle),
// så konflikter med andres ændringer håndteres som altid - træk er kun en ny måde at udløse dem på.

// Placeringen blandt kortene: antal kort, hvis midtpunkt ligger OVER markøren (0 = før første, n = efter sidste).
export function indsaetIndex(midtpunkter, y) {
  let n = 0;
  for (const m of midtpunkter) if (m < y) n++;
  return n;
}

// fra: { orderId, rowId (bilens id eller null), day, ids: de åbne sagers id'er i deres nuværende rækkefølge }
// til: { rowId, day, index } eller null (uden for alle zoner)
// Svarer { type: "ingen" } | { type: "omraekker", rowId, day, ids } | { type: "tildel", orderId, vehicleId }.
export function afledHandling(fra, til) {
  if (!fra || !til || til.day !== fra.day) return { type: "ingen" };
  const tilBil = til.rowId || null;
  const fraBil = fra.rowId || null;

  if (tilBil !== fraBil) return { type: "tildel", orderId: fra.orderId, vehicleId: tilBil };

  // Samme bil: kun hvis den har en rækkefølge at ændre (ikke "Ikke tildelt"), og placeringen faktisk ændrer noget.
  if (!fraBil) return { type: "ingen" };
  const ids = Array.isArray(fra.ids) ? fra.ids : [];
  const fraIdx = ids.indexOf(fra.orderId);
  if (fraIdx === -1) return { type: "ingen" };
  let slot = Math.max(0, Math.min(Number.isFinite(til.index) ? til.index : ids.length, ids.length));
  if (slot > fraIdx) slot -= 1;                     // kortet fjernes først, så pladserne efter det rykker ét ned
  if (slot === fraIdx) return { type: "ingen" };
  const nye = ids.filter((id) => id !== fra.orderId);
  nye.splice(slot, 0, fra.orderId);
  return { type: "omraekker", rowId: fraBil, day: fra.day, ids: nye };
}

// Må et kort slippes i denne zone? (Bruges til at vise, om målet er gyldigt, mens man trækker.)
export const erGyldigtMaal = (fra, til) => !!fra && !!til && til.day === fra.day;

// Tekst til skærmlæser/besked efter slip.
export function beskedEfterSlip(handling, { kundeNavn, bilNavn } = {}) {
  const navn = kundeNavn || "Sagen";
  if (handling.type === "omraekker") return `${navn} er flyttet i rækkefølgen.`;
  if (handling.type === "tildel") return handling.vehicleId ? `${navn} er flyttet til ${bilNavn || "en anden bil"}.` : `${navn} er ikke længere tildelt en bil.`;
  return "";
}
