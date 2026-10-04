// Arbejdsuge og forslagsvindue til bookingens trin "Tidspunkt & bil" (oktober 2026).
// Ren logik uden afhængigheder (tests/arbejdsuge.test.mjs).
//
// WEEKEND = NÆSTE UGE: bookes der en lørdag eller søndag, giver det ingen mening at
// vise den uge, der næsten er slut. Ugevisningen og standarddatoen springer derfor
// til mandag i den kommende uge, så man kan booke med det samme.
//
// FORSLAG UD OVER DEN NUVÆRENDE UGE: forslagsmotoren (lib/scheduling.js) fik før kun
// ugen omkring den valgte dato og kunne derfor kun foreslå dage inden for den uge.
// Vinduet er nu tre uger frem, så den tidligste LEDIGE dag findes, også når denne uge
// er fuld.

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dato = (s) => new Date(`${s}T00:00:00`);

export const plusDage = (s, n) => { const d = dato(s); d.setDate(d.getDate() + n); return iso(d); };
export const erWeekend = (s) => { if (!s) return false; const dag = dato(s).getDay(); return dag === 0 || dag === 6; };

// Samme dag, hvis den er en hverdag - ellers den følgende mandag.
export function foersteArbejdsdagFra(s) {
  let d = s;
  while (erWeekend(d)) d = plusDage(d, 1);
  return d;
}

// Mandag-søndag for den uge, datoen ligger i (samme som weekDays i data/domain.js).
export function ugeFor(s) {
  const d = dato(s);
  const mandag = new Date(d);
  mandag.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(mandag); x.setDate(mandag.getDate() + i); return iso(x); });
}

// Datoerne, forslagsmotoren leder i: fra første arbejdsdag (i dag, eller mandag hvis
// det er weekend) og `dage` dage frem. Er den valgte dato langt ude i fremtiden (mere
// end 14 dage), startes ved den, så forslagene følger den, man kigger på.
export function forslagsVindue({ idag, valgtDato, dage = 21 }) {
  const start = foersteArbejdsdagFra(valgtDato && valgtDato > plusDage(idag, 14) ? valgtDato : idag);
  return Array.from({ length: dage }, (_, i) => plusDage(start, i));
}
