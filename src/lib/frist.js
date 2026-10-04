// FRIST PÅ TOMGANG (oktober 2026). Ren logik uden afhængigheder (tests/frist.test.mjs).
//
// En tomgangskørsel har ingen kunde, der venter, og derfor sjældent en bestemt dag - kun en
// SENESTE dag, hvor den skal være udført (typisk en indflytning). Sagen har feltet
// `senestDato` (åååå-mm-dd). Planlæggeren kan så lægge den frit, hvor der er plads, og
// forslagsmotoren leder kun efter dage til og med fristen, i stedet for at behandle den som en
// privatkunde, der er bundet til én aftalt dag. En sag uden senestDato opfører sig som før.

import { plusDage } from "./arbejdsuge.js";

const MS_PR_DAG = 86400000;
const dag = (s) => new Date(`${s}T00:00:00`);

export const dageTil = (s, idag) => Math.round((dag(s) - dag(idag)) / MS_PR_DAG);

// Datoerne, forslagsmotoren må foreslå for en sag, regnet fra idag:
//  * uden frist: de næste 14 dage (som før)
//  * med frist: fra i dag til og med fristen, dog højst 42 dage frem
//  * frist i fortiden: ingen datoer - der findes ingen gyldig dag, og det skal siges ærligt
export function forslagsDatoer(order, idag, standardDage = 14, maksDage = 42) {
  const frist = order?.senestDato;
  if (!frist) return Array.from({ length: standardDage }, (_, i) => plusDage(idag, i));
  const antal = dageTil(frist, idag) + 1;
  if (antal < 1) return [];
  return Array.from({ length: Math.min(antal, maksDage) }, (_, i) => plusDage(idag, i));
}

// Hvor hastende er fristen? null = ingen frist.
//   "overskredet": fristen er passeret
//   "snart":       i dag eller inden for de næste 3 dage
//   "ok":          længere ude
export function fristStatus(order, idag) {
  const frist = order?.senestDato;
  if (!frist) return null;
  const d = dageTil(frist, idag);
  return { niveau: d < 0 ? "overskredet" : d <= 3 ? "snart" : "ok", dage: d };
}

// Sorteringsnøgle til "Skal planlægges": den mest presserende frist først, så en tomgang med
// frist i morgen ikke ender bag en sag uden dato. Sager uden både frist og dato kommer sidst.
export const urgensNoegle = (o) => o?.senestDato || o?.dato || "9999-12-31";

// Hvorfor kan denne dato/frist-kombination ikke bruges? (null = i orden) Bruges af
// bookingformularen. fleksibel = ingen fast dato, kun en frist.
export function fristFejl({ erTomgang, fleksibel, senestDato, dato, idag }) {
  if (!erTomgang) return null;
  if (fleksibel && !senestDato) return "Vælg, hvornår tomgangen senest skal være udført.";
  if (senestDato && senestDato < idag) return "Fristen ligger i fortiden.";
  if (!fleksibel && senestDato && dato && dato > senestDato) return "Den valgte dato ligger efter fristen.";
  return null;
}
