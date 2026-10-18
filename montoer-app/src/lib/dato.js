// Datohjælpere. Datoer er tekst på formen "2026-10-19" (samme som i webappen) og regnes i telefonens lokale tid.
const UGEDAGE = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
const UGEDAGE_KORT = ["Søn", "Man", "Tirs", "Ons", "Tors", "Fre", "Lør"];
const MAANEDER = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

const to2 = (n) => String(n).padStart(2, "0");

export function tilISO(d) {
  return `${d.getFullYear()}-${to2(d.getMonth() + 1)}-${to2(d.getDate())}`;
}

// Middag undgår at sommertid flytter datoen.
export function fraISO(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

export const idag = (nu = new Date()) => tilISO(nu);

export function laegDage(iso, n) {
  const d = fraISO(iso);
  d.setDate(d.getDate() + n);
  return tilISO(d);
}

export const erIdag = (iso, nu = new Date()) => iso === idag(nu);

// Ugens syv dage, mandag først.
export function ugensDage(iso) {
  const d = fraISO(iso);
  const dagIUgen = (d.getDay() + 6) % 7; // mandag = 0
  const mandag = laegDage(iso, -dagIUgen);
  return Array.from({ length: 7 }, (_, i) => laegDage(mandag, i));
}

export const ugedagKort = (iso) => UGEDAGE_KORT[fraISO(iso).getDay()];
export const dagITal = (iso) => fraISO(iso).getDate();

export function langDato(iso) {
  const d = fraISO(iso);
  return `${UGEDAGE[d.getDay()]} ${d.getDate()}. ${MAANEDER[d.getMonth()]}`;
}

export function overskriftDato(iso, nu = new Date()) {
  if (iso === idag(nu)) return "I dag";
  if (iso === laegDage(idag(nu), 1)) return "I morgen";
  if (iso === laegDage(idag(nu), -1)) return "I går";
  return langDato(iso);
}
