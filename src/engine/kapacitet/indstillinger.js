// BUTIKKENS KAPACITETSINDSTILLINGER (kapacitetsmotoren, oktober 2026). Ren logik uden afhængigheder.
//
// Indstillingerne gemmes som ét JSON-objekt pr. butik (stores.capacity_settings). rensIndstillinger() er den ENESTE vej ind i
// motoren: den lægger det gemte oven på standarderne, retter alt til noget gyldigt og kasserer ukendte felter, så et ødelagt
// eller manipuleret objekt aldrig kan vælte en beregning.
//
// FASTE FAKTORER, som IKKE kan ændres (hverken her eller af admin): PERSONVAEGT_KG. Én person regnes altid som 86,5 kg. Der
// registreres aldrig en enkelt medarbejders vægt (GDPR), og tallet står derfor kun i koden.

import { tilMin } from "./tid.js";

export const PERSONVAEGT_KG = 86.5;

export const NIVEAUER = ["fra", "raadgivende", "krav"];

// Regler, admin kan sætte til Fra / Rådgivende (advarsel) / Krav (blokerer).
export const REGLER = {
  arbejdstid: "Montørens arbejdstid og kalender (inkl. hjemme til sluttid)",
  tidsrum: "Kundens tidsrum (formiddag/eftermiddag)",
  toMand: "Opgaver, der kræver to mand",
  nyttelast: "Bilens nyttelast",
  plads: "Plads i lasterummet",
  ukendtData: "Varer uden kendt vægt eller mål",
  frist: "Fristen på tomgangssager (bruges af forslag ved booking)",
  samling: "Samling af kørsel i samme område (bruges af forslag ved booking)",
};

export const STANDARD = Object.freeze({
  lager: { adresse: "", lat: null, lon: null }, // tom = butikkens adresse
  tider: {
    omlastningMin: 15,       // ekstra lager-stop midt på dagen (aflæs skrot, læs nyt)
    morgenLaesningMin: 15,   // læsning af bilen om morgenen
    dagsafslutningMin: 15,   // tømning af bilen ved dagens slutning
    stopBufferMin: 5,        // parkering, gå ind, afslutte hos kunden - pr. stop
    pauseEfterMin: 210,      // pausen lægges tidligst så mange minutter efter dagens start (08:00 + 3,5 t = 11:30)
    tilladtOvertidMin: 0,    // hvor langt over sluttid en dag må strække sig
    standardStart: "08:00",
    standardSlut: "16:00",
    standardPauseMin: 30,
    arbejdsdage: [1, 2, 3, 4, 5], // 1 = mandag ... 7 = søndag
  },
  koersel: { trafikTillaegPct: 15 }, // ORS kender ikke live-trafik
  oekonomi: { timeprisKr: 350, kmprisKr: 3 }, // bruges KUN til at vælge billigste rute
  pakning: { emballageMarginCm: 3 },          // lægges til hver side af varens mål
  nyttelast: { sikkerhedsmarginPct: 5 },
  samling: { maksEkstraVentetidDage: 3 },
  regler: {
    arbejdstid: "krav", tidsrum: "krav", toMand: "krav", nyttelast: "krav", plads: "krav",
    ukendtData: "raadgivende", frist: "krav", samling: "raadgivende",
  },
});

const tal = (v, min, max, std) => {
  if (v === null || v === undefined || v === "") return std;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : std;
};
const heltal = (v, min, max, std) => Math.round(tal(v, min, max, std));
const hhmm = (v, std) => (tilMin(v) !== null ? String(v).trim() : std);

export function rensIndstillinger(raa) {
  const r = raa && typeof raa === "object" && !Array.isArray(raa) ? raa : {};
  const g = (k) => (r[k] && typeof r[k] === "object" && !Array.isArray(r[k]) ? r[k] : {});
  const S = STANDARD;

  const t = g("tider");
  let start = hhmm(t.standardStart, S.tider.standardStart);
  let slut = hhmm(t.standardSlut, S.tider.standardSlut);
  if (tilMin(slut) <= tilMin(start)) { start = S.tider.standardStart; slut = S.tider.standardSlut; }
  const dage = Array.isArray(t.arbejdsdage)
    ? [...new Set(t.arbejdsdage.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort()
    : S.tider.arbejdsdage;

  const l = g("lager");
  const lat = Number(l.lat);
  const lon = Number(l.lon);
  const harKoordinater = l.lat !== null && l.lon !== null && l.lat !== "" && l.lon !== "" && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

  const reg = g("regler");
  const regler = {};
  for (const k of Object.keys(REGLER)) regler[k] = NIVEAUER.includes(reg[k]) ? reg[k] : S.regler[k];

  return {
    lager: { adresse: typeof l.adresse === "string" ? l.adresse.trim().slice(0, 200) : "", lat: harKoordinater ? lat : null, lon: harKoordinater ? lon : null },
    tider: {
      omlastningMin: heltal(t.omlastningMin, 0, 120, S.tider.omlastningMin),
      morgenLaesningMin: heltal(t.morgenLaesningMin, 0, 120, S.tider.morgenLaesningMin),
      dagsafslutningMin: heltal(t.dagsafslutningMin, 0, 120, S.tider.dagsafslutningMin),
      stopBufferMin: heltal(t.stopBufferMin, 0, 60, S.tider.stopBufferMin),
      pauseEfterMin: heltal(t.pauseEfterMin, 0, 480, S.tider.pauseEfterMin),
      tilladtOvertidMin: heltal(t.tilladtOvertidMin, 0, 240, S.tider.tilladtOvertidMin),
      standardStart: start,
      standardSlut: slut,
      standardPauseMin: heltal(t.standardPauseMin, 0, 240, S.tider.standardPauseMin),
      arbejdsdage: dage,
    },
    koersel: { trafikTillaegPct: tal(g("koersel").trafikTillaegPct, 0, 100, S.koersel.trafikTillaegPct) },
    oekonomi: { timeprisKr: tal(g("oekonomi").timeprisKr, 0, 5000, S.oekonomi.timeprisKr), kmprisKr: tal(g("oekonomi").kmprisKr, 0, 50, S.oekonomi.kmprisKr) },
    pakning: { emballageMarginCm: tal(g("pakning").emballageMarginCm, 0, 20, S.pakning.emballageMarginCm) },
    nyttelast: { sikkerhedsmarginPct: tal(g("nyttelast").sikkerhedsmarginPct, 0, 50, S.nyttelast.sikkerhedsmarginPct) },
    samling: { maksEkstraVentetidDage: heltal(g("samling").maksEkstraVentetidDage, 0, 30, S.samling.maksEkstraVentetidDage) },
    regler,
  };
}

export const niveau = (ind, regel) => ind?.regler?.[regel] || "fra";
