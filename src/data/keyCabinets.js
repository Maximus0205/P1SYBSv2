// ---------------------------------------------------------------------------
// NØGLESKAB-MATCHNING (september 2026)
//
// Kobler en sags adresse til det nøgleskab (key_cabinets), der dækker den -
// så montøren får vist "hent nøglen i skab X" uden selv at skulle bladre i
// Adresser-fanen.
//
// BEVIDST INGEN SPROGMODEL HER. Opgaven ligner et "AI"-problem (fri tekst
// som "Parkvej 1-7 & 8-26 samt Odensevej 9A-F"), men den har en fast,
// begrænset grammatik (vejnavn + husnummerintervaller), og en ren
// algoritme er her BÅDE hurtigere (ingen netværkskald, virker offline i
// bilen), gratis, forudsigelig og kan testes præcist - en sprogmodel kan
// svare forskelligt på samme adresse to dage i træk, og det er netop det,
// man ikke vil have ved "hvor er nøglen".
//
// TRE NIVEAUER - fordi en FORKERT tryghed er værre end ingen hjælp:
//   "sikker" - vejnavn OG husnummer stemmer med et punkt i skabets område.
//   "mulig"  - vejnavnet står i skabets område, men husnummeret kunne ikke
//              bekræftes (fx "9" mod "9A-F", eller en tekst vi ikke kunne
//              tolke). Vises tydeligt som et "tjek selv".
//   null     - intet at vise. Står vejen i skabets område med KLARE tal,
//              og adressen ligger udenfor dem (fx Parkvej 40 mod 1-26), er
//              det et rigtigt "nej", ikke et "måske" - ellers ville
//              montøren blive vist skabe, der ikke har med adressen at gøre.
//
// Ingen regex-lookbehind her (bevidst): ældre iOS Safari (før 16.4) kan
// ikke parse det, og en enkelt syntaksfejl ville tage HELE appen ned.

const clean = (s) => (s || "").toLowerCase().replace(/é/g, "e").replace(/[–—]/g, "-");

// Vejnavn til SAMMENLIGNING: uden mellemrum/punktum/bindestreg, så
// "H.C. Andersens Vej" og "hc andersens vej" er det samme.
export const streetKey = (s) => clean(s).replace(/[\s.\-'’]/g, "");

// Deler en adresse op i vej + husnummer + evt. bogstav. Tager det FØRSTE
// tal-token efter vejnavnet ("Parkvej 5, 2. th" -> 5, ikke etagen).
export function parseAddress(addr) {
  const cleaned = clean(addr).replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const tokens = cleaned.split(" ");
  for (let i = 1; i < tokens.length; i++) {
    const m = tokens[i].match(/^(\d+)([a-zæøå])?$/);
    if (m) {
      let letter = m[2] || "";
      // "Parkvej 5 A" - ét enkelt bogstav for sig. Kun ÉT bogstav: "st",
      // "th", "tv" (etage/side) er to og må ikke tolkes som opgangsbogstav.
      if (!letter && tokens[i + 1] && /^[a-zæøå]$/.test(tokens[i + 1])) letter = tokens[i + 1];
      return { street: tokens.slice(0, i).join(" "), number: parseInt(m[1], 10), letter };
    }
  }
  return null;
}

const NOISE = /\b(ulige|lige|numre|nummer|nr|husnr|husnummer|hus|fra|afd|afdeling)\b\.?/g;
const HELE_VEJEN = /\b(hele vejen|alle numre|alle husnumre|samtlige numre)\b/g;

// Tolker skabets "område"-tekst til en liste af punkter. Kendte former:
//   Parkvej 1-7 & 8-26 samt Odensevej 9A-F      (intervaller, bogstavsinterval)
//   Parkvej 2-20 lige / Parkvej 1-19 ulige      (lige/ulige numre)
//   Parkvej 1, 3, 5 og 7                        (enkelte numre)
//   Parkvej 1 til 7 / 1 t/m 7                   (til / t/m)
//   Nørrebrogade hele vejen                     (hele vejen)
// Et segment uden vejnavn arver det forrige ("8-26" efter "Parkvej 1-7").
export function parseCoverage(text) {
  const t = clean(text)
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+(?:til og med|t\.o\.m\.?|t\/m|til)\s+/g, "-")
    .replace(/\s(?:og|samt|plus)\s/g, ";")
    .replace(/[&+,\/\n]/g, ";");

  const entries = [];
  let street = "";

  for (const seg of t.split(";").map((s) => s.trim()).filter(Boolean)) {
    const parity = /\bulige\b/.test(seg) ? "ulige" : /\blige\b/.test(seg) ? "lige" : null;
    const explicitWhole = new RegExp(HELE_VEJEN.source).test(seg);
    const firstDigit = seg.search(/\d/);
    const head = firstDigit === -1 ? seg : seg.slice(0, firstDigit);
    const tail = firstDigit === -1 ? "" : seg.slice(firstDigit);

    const streetText = head
      .replace(HELE_VEJEN, " ")
      .replace(NOISE, " ")
      .replace(/[():]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (/[a-zæøå]/.test(streetText)) street = streetKey(streetText);
    if (!street) continue;

    if (firstDigit === -1) {
      entries.push({ street, kind: "whole", explicit: explicitWhole });
      continue;
    }

    const re = /(\d+)([a-zæøå])?(?:(-)(\d+)?([a-zæøå])?)?/g;
    let m;
    while ((m = re.exec(tail))) {
      const n1 = parseInt(m[1], 10);
      const l1 = m[2] || "";
      if (!m[3]) { entries.push({ street, kind: "single", n: n1, l: l1 }); continue; }
      const n2 = m[4] !== undefined ? parseInt(m[4], 10) : null;
      const l2 = m[5] || "";
      if (n2 === null || n2 === n1) {
        // "9A-F" / "9A-9F": bogstavsinterval på ét husnummer.
        if (l2) entries.push({ street, kind: "letters", n: n1, from: l1 || "a", to: l2 });
        else entries.push({ street, kind: "single", n: n1, l: l1 });
      } else {
        const lo = Math.min(n1, n2);
        const hi = Math.max(n1, n2);
        entries.push({ street, kind: "range", n1: lo, l1: n1 <= n2 ? l1 : l2, n2: hi, l2: n1 <= n2 ? l2 : l1, parity });
      }
    }
  }
  return entries;
}

function matchEntry(e, a) {
  switch (e.kind) {
    case "whole":
      return e.explicit ? "sikker" : "mulig";
    case "single":
      if (a.number !== e.n) return null;
      if (e.l && a.letter && a.letter !== e.l) return null;
      if (e.l && !a.letter) return "mulig";
      return "sikker";
    case "letters":
      if (a.number !== e.n) return null;
      if (!a.letter) return "mulig";
      return a.letter >= e.from && a.letter <= e.to ? "sikker" : null;
    case "range":
      if (a.number < e.n1 || a.number > e.n2) return null;
      if (e.parity === "lige" && a.number % 2 !== 0) return null;
      if (e.parity === "ulige" && a.number % 2 !== 1) return null;
      if (a.number === e.n1 && e.l1 && a.letter && a.letter < e.l1) return null;
      if (a.number === e.n2 && e.l2 && a.letter && a.letter > e.l2) return null;
      return "sikker";
    default:
      return null;
  }
}

function matchCabinet(parsed, rawAddress, cabinet) {
  const compactArea = streetKey(cabinet.omraade);
  if (parsed) {
    const key = streetKey(parsed.street);
    const sameStreet = parseCoverage(cabinet.omraade).filter((e) => e.street === key);
    if (sameStreet.length > 0) {
      let best = null;
      for (const e of sameStreet) {
        const r = matchEntry(e, parsed);
        if (r === "sikker") return "sikker";
        if (r === "mulig") best = "mulig";
      }
      return best; // null = vejen findes, men adressen ligger uden for de angivne numre
    }
    // Ingen tolkede punkter for vejen - står navnet alligevel i teksten?
    return key.length >= 4 && compactArea.includes(key) ? "mulig" : null;
  }
  // Adressen kunne ikke deles op (fx kun et vejnavn) - sidste udvej.
  const k = streetKey((rawAddress || "").split(",")[0].replace(/\d.*$/, ""));
  return k.length >= 4 && compactArea.includes(k) ? "mulig" : null;
}

// Alle skabe, der (måske) dækker adressen - "sikker" først.
export function findKeyCabinets(address, cabinets) {
  if (!address || !address.trim() || !cabinets || cabinets.length === 0) return [];
  const parsed = parseAddress(address);
  const out = [];
  for (const cabinet of cabinets) {
    if (!cabinet?.omraade) continue;
    const niveau = matchCabinet(parsed, address, cabinet);
    if (niveau) out.push({ cabinet, niveau });
  }
  return out.sort((x, y) => (x.niveau === "sikker" ? 0 : 1) - (y.niveau === "sikker" ? 0 : 1));
}

// Søgestreng til Google Maps for SELVE SKABET. skabPlacering er fri tekst
// ("Ved ejendomsmesterkontor, Jacob Hansens vej 18H") - vi tager den del,
// der ligner en adresse (indeholder et tal), og sætter postnr./by fra
// sagens egen adresse bag på, så Maps ikke gætter på en anden by.
export function cabinetMapsQuery(cabinet, orderAddress) {
  const parts = (cabinet?.skabPlacering || "").split(",").map((s) => s.trim()).filter(Boolean);
  const base = [...parts].reverse().find((p) => /\d/.test(p)) || cabinet?.skabPlacering || "";
  const city = (orderAddress || "").match(/(\d{4}\s+[^,]+?)\s*$/);
  return city ? `${base}, ${city[1]}` : base;
}
