// ERSTATNING AF MANGLENDE VARE (oktober 2026): ren beregning, ingen netværk.
//
// Når lageret melder en vare "kan ikke findes", skal sælgeren hurtigt kunne se, hvad et ALTERNATIV
// koster - for kunden og for butikkens avance - FØR der ringes til kunden. Denne fil regner kun; selve
// varelisten kommer fra POS-adapteren (adapters/pos, handlingen "alternatives").
//
// FORUDSÆTNING (skal bekræftes, når Flow Retails API er kendt): udsalgspris er INKL. moms (det kunden
// betaler), indkøbspris er EKSKL. moms (det butikken betaler). Avance regnes derfor på udsalgspris uden
// moms. Er det omvendt i API'et, rettes det ÉT sted: i POS-edge-funktionen, som skal aflevere priserne
// i denne form - ikke her.
//
// To scenarier, fordi det er sælgerens valg, ikke systemets:
//   "behold"  - kunden beholder sin oprindelige pris; butikken tager forskellen i indkøb
//   "fuld"    - kunden betaler det nye produkts udsalgspris (efterbetaler / får penge tilbage)

export const MOMS = 0.25;

const tal = (x) => {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

// Nulstiller alt uden for forventet form, så UI'et aldrig viser "NaN kr".
export function normaliserVare(v) {
  if (!v || typeof v !== "object") return null;
  const lager = tal(v.lager);
  return {
    varenummer: v.varenummer != null ? String(v.varenummer) : "",
    navn: typeof v.navn === "string" ? v.navn : "",
    maerke: typeof v.maerke === "string" ? v.maerke : "",
    model: typeof v.model === "string" ? v.model : "",
    udsalgspris: tal(v.udsalgspris),
    indkoebspris: tal(v.indkoebspris),
    lager: lager === null ? null : Math.max(0, Math.floor(lager)),
    forskelle: Array.isArray(v.forskelle) ? v.forskelle.filter((x) => typeof x === "string" && x).slice(0, 6) : [],
  };
}

const eksMoms = (pris, moms) => (pris === null ? null : pris / (1 + moms));
const rund = (x) => (x === null ? null : Math.round(x * 100) / 100);

// Avance i kr (ekskl. moms) og i % af omsætningen. null hvis en af priserne mangler.
export function avance(udsalgspris, indkoebspris, moms = MOMS) {
  const u = eksMoms(tal(udsalgspris), moms);
  const i = tal(indkoebspris);
  if (u === null || i === null) return { kr: null, procent: null };
  return { kr: rund(u - i), procent: u > 0 ? rund(((u - i) / u) * 100) : null };
}

export function beregnKonsekvens(original, alternativ, moms = MOMS) {
  const o = normaliserVare(original);
  const a = normaliserVare(alternativ);
  if (!o || !a) return null;

  const oAv = avance(o.udsalgspris, o.indkoebspris, moms);
  const aAv = avance(a.udsalgspris, a.indkoebspris, moms);
  const diff = (x, y) => (x === null || y === null ? null : rund(x - y));

  // "behold": kunden betaler det samme som før, butikken bærer indkøbsforskellen.
  const beholdAv = avance(o.udsalgspris, a.indkoebspris, moms);

  return {
    paaLager: a.lager !== null && a.lager > 0,
    udsalgsForskel: diff(a.udsalgspris, o.udsalgspris), // + = nyt produkt er dyrere for kunden
    indkoebForskel: diff(a.indkoebspris, o.indkoebspris), // + = butikken betaler mere
    behold: { avanceKr: beholdAv.kr, avanceProcent: beholdAv.procent, avanceForskelKr: diff(beholdAv.kr, oAv.kr), kundePris: o.udsalgspris },
    fuld: { avanceKr: aAv.kr, avanceProcent: aAv.procent, avanceForskelKr: diff(aAv.kr, oAv.kr), kundeForskel: diff(a.udsalgspris, o.udsalgspris), kundePris: a.udsalgspris },
  };
}

// Sorterer alternativer: på lager først, derefter tættest på det oprindelige produkts udsalgspris
// (så kunden mærker mindst muligt), derefter navn. Fjerner dubletter på varenummer og selve originalen.
export function rangerAlternativer(original, liste) {
  const o = normaliserVare(original);
  const set = new Set();
  const ud = [];
  for (const raa of Array.isArray(liste) ? liste : []) {
    const a = normaliserVare(raa);
    if (!a || !(a.varenummer || a.model)) continue;
    const noegle = a.varenummer || `${a.maerke}|${a.model}`.toLowerCase();
    if (set.has(noegle)) continue;
    if (o && ((o.varenummer && o.varenummer === a.varenummer) || (!o.varenummer && o.model && o.model.toLowerCase() === a.model.toLowerCase()))) continue;
    set.add(noegle);
    ud.push(a);
  }
  const afstand = (a) => (o?.udsalgspris == null || a.udsalgspris == null ? Infinity : Math.abs(a.udsalgspris - o.udsalgspris));
  return ud.sort((x, y) => (Number(y.lager > 0) - Number(x.lager > 0)) || (afstand(x) - afstand(y)) || (x.navn || x.model).localeCompare(y.navn || y.model, "da"));
}

export const kr = (n) => (n === null || n === undefined ? "–" : `${Math.round(n).toLocaleString("da-DK")} kr`);
export const krMedFortegn = (n) => (n === null || n === undefined ? "–" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n)).toLocaleString("da-DK")} kr`);
