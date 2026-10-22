// Gemte adressekoordinater på en sag (kunde.adresseKoordinater).
//
// Koordinaterne kommer fra Adressevælgeren (Datafordeleren) i det øjeblik, man vælger et forslag i AddressInput, og gemmes skjult på sagen.
// De bruges KUN af systemet (køretidsberegning/planlægning) og må ALDRIG vises i brugerfladen, SMS, eksport eller sendes til AI.
// ORS bruges derefter kun til selve rute-/matrixberegningen - ikke til at slå adressen op igen.
//
// Form: { lat, lon, adresseId, type, tekst }
//   tekst = den adressetekst, koordinaterne hører til. Hører teksten ikke længere sammen med sagens adresse (adressen er rettet i hånden),
//   er koordinaterne forældede og ignoreres - så en rettet adresse aldrig kører med den gamle placering.

export function normaliserAdresse(tekst) {
  return String(tekst || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Grov sanity-check: Danmark inkl. Bornholm/Færøerne er ikke relevant her - kun Danmark ca. (54.4-57.9 N, 7.9-15.3 E).
function erDanskKoordinat(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= 54.4 && lat <= 57.9 && lon >= 7.9 && lon <= 15.3;
}

// Returnerer { lat, lon } hvis koordinaterne er gyldige OG hører til adressen, ellers null.
export function gyldigeKoordinater(koord, adresseTekst) {
  if (!koord || typeof koord !== "object") return null;
  const lat = Number(koord.lat);
  const lon = Number(koord.lon);
  if (!erDanskKoordinat(lat, lon)) return null;
  if (normaliserAdresse(koord.tekst) !== normaliserAdresse(adresseTekst)) return null;
  return { lat, lon };
}

// Til en sags kunde-objekt: de brugbare koordinater, eller null.
export function koordinaterForKunde(kunde) {
  if (!kunde) return null;
  return gyldigeKoordinater(kunde.adresseKoordinater, kunde.adresse);
}

// Bygger det objekt der gemmes på sagen - kun hvis koordinaterne passer til adressen. Ellers undefined (feltet udelades).
export function koordinaterTilSag(koord, adresseTekst) {
  if (!gyldigeKoordinater(koord, adresseTekst)) return undefined;
  return { lat: Number(koord.lat), lon: Number(koord.lon), adresseId: koord.adresseId || null, type: koord.type || null, tekst: String(adresseTekst).trim() };
}

// Passer en TASTET adresse (evt. med etage/dør, fx "Vej 39, 4. 1, 8000 Aarhus C") til et husnummer-forslag fra Adressevælgeren (fx vejnavn "Vej", husnummer "39",
// titel "Vej 39, 8000 Aarhus C")? Så er det SAMME bygning, og husnummerets koordinater kan bruges til køretiden - etage/dør ændrer ikke på hvor bilen skal hen.
// Strengt: vejnavn + husnummer skal være en hel-ord-start på teksten ("39" matcher ikke "39A"), og et tastet postnummer skal være det samme.
export function erSammeHusnummer(tastet, forslag) {
  if (!forslag || !forslag.vejnavn || !forslag.husnummer) return false;
  const norm = (t) => String(t || "").toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  const t = norm(tastet);
  const start = `${norm(forslag.vejnavn)} ${norm(forslag.husnummer)}`;
  if (t !== start && !t.startsWith(`${start} `)) return false;
  const postnr = (x) => (String(x || "").match(/\b(\d{4})\b/) || [])[1] || null;
  const tastetPostnr = postnr(tastet);
  return !tastetPostnr || tastetPostnr === postnr(forslag.titel);
}

// Etage/dør-delen af en adressetekst: det, der står mellem "vejnavn husnummer" og postnummeret.
// "Vej 39, 4. 1, 8000 Aarhus C" med forslag {vejnavn:"Vej", husnummer:"39"} -> ["4","1"].
// Ordet "sal" ignoreres ("4. sal" -> ["4"]). Er teksten ikke samme husnummer, gives [].
export function etageDoerTokens(tekst, forslag) {
  if (!erSammeHusnummer(tekst, forslag)) return [];
  const norm = (t) => String(t || "").toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  let rest = norm(tekst).slice(`${norm(forslag.vejnavn)} ${norm(forslag.husnummer)}`.length).trim();
  rest = rest.replace(/\b\d{4}\b.*$/, "").trim();
  return rest.split(" ").filter((t) => t && t !== "sal");
}

// Snævrer en liste af adresser (etage/dør-niveau) ind efter det, brugeren har tastet efter husnummeret: tastes "4", vises kun adresser
// med "4" som etage eller dør. Finder det intet, vises alle - hellere for mange forslag end ingen. Kun adresser i SAMME bygning medtages.
// Sorteres naturligt (st, 1, 2, ... 10).
export function etageDoerForslag(tastet, husnummerForslag, adresser) {
  const iBygningen = (adresser || []).filter((a) => a?.type === "adresse" && erSammeHusnummer(a.titel, husnummerForslag));
  // st. først, dernæst 1., 2., ... 10. (talmæssigt), dernæst dør.
  const etageRang = (a) => { const e = etageDoerTokens(a.titel, husnummerForslag)[0]; return e === "st" ? 0 : Number.isFinite(Number(e)) ? Number(e) : 999; };
  const sorteret = [...iBygningen].sort((a, b) => etageRang(a) - etageRang(b) || String(a.titel).localeCompare(String(b.titel), "da", { numeric: true }));
  const kraevet = etageDoerTokens(tastet, husnummerForslag);
  if (kraevet.length === 0) return sorteret;
  const snaevret = sorteret.filter((a) => {
    const har = etageDoerTokens(a.titel, husnummerForslag);
    return kraevet.every((t) => har.includes(t));
  });
  return snaevret.length > 0 ? snaevret : sorteret;
}
