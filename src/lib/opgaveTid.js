// TID PÅ EN IGANGVÆRENDE OPGAVE (oktober 2026). Ren logik uden afhængigheder (tests/opgaveTid.test.mjs).
//
// En opgaves tid består af afsluttede ARBEJDSPERIODER (order.logs) plus den periode, der kører lige nu
// (order.stemplerInd = hvornår den blev startet). Bliver opgaven markeret "kom ikke i mål", sættes
// tiden på PAUSE: den kørende periode lukkes og lægges i logs, og stemplerInd nulstilles. Genoptages
// opgaven, starter en ny periode. Pausen tæller derfor ikke med - og de målte tider, tidsestimaterne
// bygger på (data/estimates.js: summen af logs), forbliver rene arbejdstider.

// Én arbejdsperiode i millisekunder. Er både start og slut gemt, bruges de (så tælleren ikke "hopper",
// når en kørende periode lukkes og afrundes til hele minutter); ellers bruges minutterne.
export function logMs(l) {
  const ind = Date.parse(l?.ind);
  const ud = Date.parse(l?.ud);
  if (Number.isFinite(ind) && Number.isFinite(ud)) return Math.max(0, ud - ind);
  return Math.max(0, (Number(l?.minutter) || 0) * 60000);
}

export const afsluttetMs = (order) => (order?.logs || []).reduce((sum, l) => sum + logMs(l), 0);

export function koerendeMs(order, nu) {
  const ind = Date.parse(order?.stemplerInd);
  return Number.isFinite(ind) ? Math.max(0, nu - ind) : 0;
}

export const samletMs = (order, nu) => afsluttetMs(order) + koerendeMs(order, nu);

// Er opgaven i gang, men sat på pause (ingen kørende periode)?
export const erPauset = (order) => order?.status === "igang" && !order?.stemplerInd;

// "0:42:10" - timer:minutter:sekunder.
export function formaterTid(ms) {
  const s = Math.floor(Math.max(0, Number(ms) || 0) / 1000);
  const t = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sek = s % 60;
  return `${t}:${String(m).padStart(2, "0")}:${String(sek).padStart(2, "0")}`;
}

// De felter, der skal ændres på sagen for at sætte tiden på pause. Tomt, hvis intet kører.
export function pausePatch(order, nuIso, nyId) {
  if (!order?.stemplerInd) return {};
  const ms = Math.max(0, Date.parse(nuIso) - Date.parse(order.stemplerInd));
  const minutter = Math.max(1, Math.round(ms / 60000));
  return { logs: [...(order.logs || []), { id: nyId, ind: order.stemplerInd, ud: nuIso, minutter }], stemplerInd: null };
}
