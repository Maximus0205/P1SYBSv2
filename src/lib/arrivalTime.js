// Tid og tekst til ankomst-SMS'en (oktober 2026). Ren logik uden afhængigheder,
// så den kan testes i Node (tests/arrivalTime.test.mjs).
//
// SAMME REGLER SOM SERVEREN: sætningerne herunder skal være identiske med
// byggTekst/varighedTekst i supabase/functions/send-ankomst-sms/index.ts. Det er
// serveren, der bygger den SMS kunden får; her bruges de kun til at vise
// montøren, hvad kunden kommer til at få, før der trykkes. Testen tjekker begge
// de samme eksempler, så de ikke glider fra hinanden.

export const MAKS_MINUTTER = 240;

// Hurtigknapper. En enkelt tid, eller et interval [fra, til].
export const ENKELT_TIDER = [5, 10, 15, 30, 60];
export const INTERVALLER = [[15, 30], [30, 60], [60, 120]];

// "45 minutter", "1 minut", "1 time", "2 timer", "1 time og 30 minutter".
export function varighedTekst(min) {
  if (min < 60) return `${min} ${min === 1 ? "minut" : "minutter"}`;
  const t = Math.floor(min / 60);
  const r = min % 60;
  const timer = `${t} ${t === 1 ? "time" : "timer"}`;
  return r === 0 ? timer : `${timer} og ${r} ${r === 1 ? "minut" : "minutter"}`;
}

// "om ca. 15 minutter"  /  "om mellem 30 og 60 minutter"  /  "om mellem 1 og 2 timer"
export function ankomstFrase(fra, til) {
  if (til === undefined || til === null) return `om ca. ${varighedTekst(fra)}`;
  const heleTimer = fra >= 60 && fra % 60 === 0 && til % 60 === 0;
  return heleTimer ? `om mellem ${fra / 60} og ${til / 60} timer` : `om mellem ${fra} og ${til} minutter`;
}

// Kort tekst til en knap: "30–60 min", "1–2 timer".
export function intervalKnapTekst(fra, til) {
  const heleTimer = fra >= 60 && fra % 60 === 0 && til % 60 === 0;
  return heleTimer ? `${fra / 60}–${til / 60} timer` : `${fra}–${til} min`;
}

// Tolker det, brugeren har skrevet i felterne "fra" og "til (valgfri)".
//   { ok: true, fra, til }   til = null, når feltet er tomt (en enkelt tid)
//   { ok: false, tom: true } intet skrevet endnu (ingen fejlbesked at vise)
//   { ok: false, fejl }      noget er forkert (besked på dansk)
export function tolkAnkomst(fraTekst, tilTekst) {
  const f = String(fraTekst ?? "").trim();
  const t = String(tilTekst ?? "").trim();
  if (f === "" && t === "") return { ok: false, tom: true };
  if (f === "") return { ok: false, fejl: "Skriv, hvor mange minutter der går mindst." };
  const helt = /^\d{1,3}$/;
  if (!helt.test(f)) return { ok: false, fejl: "Skriv antal minutter som et helt tal." };
  const fra = Number(f);
  if (fra < 1 || fra > MAKS_MINUTTER) return { ok: false, fejl: `Minutter skal være mellem 1 og ${MAKS_MINUTTER}.` };
  if (t === "") return { ok: true, fra, til: null };
  if (!helt.test(t)) return { ok: false, fejl: "Skriv antal minutter som et helt tal." };
  const til = Number(t);
  if (til > MAKS_MINUTTER) return { ok: false, fejl: `Minutter skal være mellem 1 og ${MAKS_MINUTTER}.` };
  if (til <= fra) return { ok: false, fejl: "“Til” skal være større end “fra”." };
  return { ok: true, fra, til };
}
