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
