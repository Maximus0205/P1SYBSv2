// ---------------------------------------------------------------------------
// LIVE (september 2026): Klimadatastyrelsens Adressevælger (adressevaelger.dk)
// - den officielle, statslige erstatning for DAWA's autocomplete. DAWA
// lukker permanent 1. oktober 2026. Bruges nu direkte af AddressInput.jsx
// (den gamle OpenRouteService-baserede løsning i lib/geocoding.js er
// udkommenteret, ikke fjernet - se AddressInput.jsx).
//
// Se supabase/functions/adressevaelger-proxy for selve proxy-kaldet
// (kræver login) og noten om token dér.
import { supabase } from "./supabaseClient";

async function callProxy(body) {
  const { data, error } = await supabase.functions.invoke("adressevaelger-proxy", { body });
  if (error) {
    console.error("adressevaelger-proxy failed:", error.message);
    return null;
  }
  return data;
}

// ---------------------------------------------------------------------------
// KOORDINATSYSTEM: Adressevælgeren svarer i ETRS89/UTM zone 32N (EPSG:25832)
// - IKKE WGS84 lat/lon, som resten af appen (og ORS) bruger alle vegne
// (kort, afstandsberegning, butikkens gemte koordinater). Uden denne
// omregning ville koordinaterne pege helt forkerte steder på et kort, der
// forventer lat/lon.
//
// Standard invers UTM-formel (Snyder/Karney-stil, samme som fx det udbredte
// npm-modul "utm-latlng" bruger) - AFPRØVET (september 2026) mod tre kendte
// adresser fra Adressevælgerens egen dokumentation (Kolding, Aarhus C,
// København N): alle tre landede inden for få meter af det korrekte sted.
export function utm32ToWgs84(easting, northing) {
  const A = 6378137.0; // GRS80/WGS84 storaksen - praktisk talt identisk for begge ellipsoider
  const F = 1 / 298.257222101; // GRS80 fladtrykning
  const E = Math.sqrt(F * (2 - F));
  const E1SQ = (E * E) / (1 - E * E);
  const K0 = 0.9996;
  const ZONE = 32; // Danmark ligger (for adresseformål) entydigt i UTM zone 32N

  const arc = northing / K0;
  const mu = arc / (A * (1 - Math.pow(E, 2) / 4.0 - 3 * Math.pow(E, 4) / 64.0 - 5 * Math.pow(E, 6) / 256.0));
  const ei = (1 - Math.pow(1 - E * E, 0.5)) / (1 + Math.pow(1 - E * E, 0.5));
  const ca = (3 * ei) / 2 - (27 * Math.pow(ei, 3)) / 32.0;
  const cb = (21 * Math.pow(ei, 2)) / 16 - (55 * Math.pow(ei, 4)) / 32;
  const cc = (151 * Math.pow(ei, 3)) / 96;
  const cd = (1097 * Math.pow(ei, 4)) / 512;
  const phi1 = mu + ca * Math.sin(2 * mu) + cb * Math.sin(4 * mu) + cc * Math.sin(6 * mu) + cd * Math.sin(8 * mu);

  const n0 = A / Math.pow(1 - Math.pow(E * Math.sin(phi1), 2), 0.5);
  const r0 = (A * (1 - E * E)) / Math.pow(1 - Math.pow(E * Math.sin(phi1), 2), 1.5);
  const fact1 = (n0 * Math.tan(phi1)) / r0;

  const _a1 = 500000 - easting;
  const dd0 = _a1 / (n0 * K0);
  const fact2 = (dd0 * dd0) / 2;

  const t0 = Math.pow(Math.tan(phi1), 2);
  const Q0 = E1SQ * Math.pow(Math.cos(phi1), 2);
  const fact3 = ((5 + 3 * t0 + 10 * Q0 - 4 * Q0 * Q0 - 9 * E1SQ) * Math.pow(dd0, 4)) / 24;
  const fact4 = ((61 + 90 * t0 + 298 * Q0 + 45 * t0 * t0 - 252 * E1SQ - 3 * Q0 * Q0) * Math.pow(dd0, 6)) / 720;

  const lof1 = _a1 / (n0 * K0);
  const lof2 = ((1 + 2 * t0 + Q0) * Math.pow(dd0, 3)) / 6.0;
  const lof3 = ((5 - 2 * Q0 + 28 * t0 - 3 * Math.pow(Q0, 2) + 8 * E1SQ + 24 * Math.pow(t0, 2)) * Math.pow(dd0, 5)) / 120;
  const _a2 = (lof1 - lof2 + lof3) / Math.cos(phi1);
  const _a3 = (_a2 * 180) / Math.PI;

  const lat = (180 * (phi1 - fact1 * (fact2 + fact3 + fact4))) / Math.PI;
  const lon = 6 * ZONE - 183.0 - _a3;
  return { lat, lon };
}

// ---------------------------------------------------------------------------
// RETTET: den forrige udgave sendte "tekst" OG "postnummer" i SAMME kald.
// Det virkede ikke, fordi Adressevælgerens egen dokumentation siger det
// eksplicit: "Der ses bort fra disse parametre [vejnavn/husnummer/
// postnummer] hvis tekst er angivet som parameter" - postnummeret blev
// altså stille og roligt IGNORERET, præcis som hos ORS, blot af en helt
// anden årsag (parameter-forrang, ikke en tolkningsfejl).
//
// Det korrekte mønster (som Adressevælgeren selv viser i deres
// dokumentation: "vejnavn=sankt keld&postnummer=2100") er at sende
// gadenavn og postnummer som ADSKILTE, strukturerede felter i stedet for
// at blande dem i "tekst". Denne funktion splitter derfor selv søgeteksten
// op, når der er et postnummer at finde: et afsluttende 4-cifret tal i
// postnummer-intervallet bliver til `postnummer`, og et evt. resterende
// afsluttende tal (husnummer, med eller uden bogstav) bliver til
// `husnummer` - resten sendes som `vejnavn`, ALDRIG sammen med `tekst`.
function parseQuery(raw) {
  const trimmed = (raw || "").trim();
  const postalMatch = trimmed.match(/^(.*\S)\s+(\d{4})$/);
  if (!postalMatch) return { tekst: trimmed };
  const postnr = Number(postalMatch[2]);
  if (postnr < 1000 || postnr > 9990) return { tekst: trimmed };

  const rest = postalMatch[1];
  const houseMatch = rest.match(/^(.*\S)\s+(\d+[a-zA-Z]?)$/);
  if (houseMatch) {
    return { vejnavn: houseMatch[1], husnummer: houseMatch[2], postnummer: postalMatch[2] };
  }
  return { vejnavn: rest, postnummer: postalMatch[2] };
}

// ---------------------------------------------------------------------------
// Fonetisk søgning (autocomplete). Se parseQuery ovenfor for hvorfor et
// postnummer sendes som sin egen parameter, ikke blandet ind i "tekst".
//
// GIVER BEVIDST INGEN KOORDINATER her - fonetisk søgning returnerer kun
// tekst-felter (type, titel, vejnavn, postnr...). Koordinater kræver et
// ekstra opslag pr. id, se lookupAdressevaelgerCoordinates nedenfor - kaldes
// derfor kun for DEN adresse, brugeren rent faktisk vælger, ikke for hele
// listen af forslag (ville ellers kræve ét ekstra kald pr. vist forslag).
export async function searchAdressevaelger(raw) {
  const query = parseQuery(raw);
  const data = await callProxy({ handling: "soeg-adresser", maksimum: 10, ...query });
  if (!data || data.status !== "ok") return { ok: false, fejl: data?.beskrivelse || "Kunne ikke søge lige nu.", fund: [] };
  return {
    ok: true,
    fund: (data.fund || []).map((f) => ({
      type: f.type, // "husnummer" | "adresse" | "vejnavn" | "navngivenvejpostnummer"
      id: f.id,
      titel: f.titel,
      vejnavn: f.vejnavn,
      husnummer: f.husnummer,
      postnr: f.postnr,
      postdistrikt: f.postdistrikt,
      antalHusnumre: f.antal_husnumre,
    })),
  };
}

// Slår koordinater op for ÉT valgt husnummer/adresse-id - se noten ovenfor.
// type skal være den samme "type", forslaget havde i søgeresultatet.
export async function lookupAdressevaelgerCoordinates(id, type) {
  const data =
    type === "husnummer"
      ? await callProxy({ handling: "opslag-husnummer", ider: [id] })
      : await callProxy({ handling: "opslag-adresser", ider: [id] });
  if (!data || data.status !== "ok") return null;
  const adgangspunkt = data.husnummer?.adgangspunkt || data.adresser?.[0]?.husnummer?.adgangspunkt || data.adresse?.husnummer?.adgangspunkt;
  const coords = adgangspunkt?.geometri?.coordinates;
  if (!coords) return null;
  return utm32ToWgs84(coords[0], coords[1]);
}
