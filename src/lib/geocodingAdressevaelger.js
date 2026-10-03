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
// RETTET (september 2026, fjerde gang): parseQuery tog tidligere HUSNUMMERET
// som det sidste tal-token i teksten ("^(.*\S)\s+(\d+[a-zA-Z]?)$"). Det
// virker kun, hvis adressen slutter på husnummeret. En rigtig adresse
// gør det sjældent: efter husnummeret kommer etage/dør ("st. 70"), et
// bydelsnavn ("Hjallese") og først DEREFTER postnummer og by. Efter at
// postnummer + by var klippet væk, stod der fx "Odensevej 115 Hjallese" -
// intet tal til sidst, intet husnummer fundet, og HELE resten blev sendt
// som ét "vejnavn", som aldrig kan findes.
//
// Det var den reelle grund til, at butikkens kommunekode ALDRIG blev
// gemt (butikkens adresse er "Odensevej 115, Hjallese, 5260 Odense S"), og
// dermed til at adresseforslag ikke blev afgrænset til butikkens område.
//
// Nu er husnummeret det FØRSTE tal-token EFTER vejnavnet (samme princip
// som parseAddress i data/keyCabinets.js); alt bagved - etage, dør,
// bydel - ignoreres, da Adressevælgeren selv finder det ud fra vejnavn +
// husnummer + postnummer.
//
// Postnummeret findes ved at lede efter FIRE CIFRE EFTERFULGT AF EN
// ORDGRÆNSE et sted i teksten (ikke nødvendigvis til sidst) - alt FRA og
// MED det postnummer (postnummer + et eventuelt bynavn bagved) klippes
// væk, så kun "vejnavn husnummer ..." er tilbage til næste trin.
function parseQuery(raw) {
  let s = (raw || "").trim().replace(/,/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return { tekst: "" };

  let postnummer;
  const postalMatch = s.match(/^(.*\S)\s+(\d{4})\b.*$/);
  if (postalMatch) {
    const num = Number(postalMatch[2]);
    if (num >= 1000 && num <= 9990) {
      postnummer = postalMatch[2];
      s = postalMatch[1];
    }
  }

  let husnummer;
  const houseMatch = s.match(/^(.*?\S)\s+(\d+[a-zA-Z]?)(?:\s.*)?$/);
  if (houseMatch) {
    husnummer = houseMatch[2];
    s = houseMatch[1];
  }

  if (!s) return { tekst: raw.trim() }; // usandsynligt (kun tal tastet) - fald sikkert tilbage
  return { vejnavn: s, husnummer, postnummer };
}

// ---------------------------------------------------------------------------
// Fonetisk søgning (autocomplete). Se parseQuery ovenfor for hvorfor
// gadenavn/husnummer/postnummer altid sendes som adskilte, strukturerede
// felter frem for én sammenhængende tekst.
//
// GIVER BEVIDST INGEN KOORDINATER her - fonetisk søgning returnerer kun
// tekst-felter (type, titel, vejnavn, postnr...). Koordinater kræver et
// ekstra opslag pr. id, se lookupAdressevaelgerCoordinates nedenfor.
//
// ENDPOINT (september 2026, RETTET): kan vælges pr. kald - se handling
// nedenfor. Standard er stadig "soeg-adresser" (/adresser/soeg), som er
// den ENESTE af de to, der kan returnere type "adresse" med etage/dør -
// se noten ovenfor. "soeg-husnumre" (/husnumre/soeg) bruges i stedet, når
// et kommunekode-filter skal respekteres (se kommunekode-noten nedenfor),
// og mister derfor etage/dør-niveauet for DEN søgning - det er en bevidst
// afvejning: AddressInput.jsx's egen opfølgning (klik på et husnummer ->
// strukturere søgning efter netop den adresse) rammer altid
// "soeg-adresser" uanset dette valg, så etage/dør er stadig ét klik væk,
// ikke tabt.
//
// standardPostnummer (september 2026, tilføjet): bruges KUN, hvis den tastede
// tekst ikke selv indeholder et postnummer. AddressInput bruger det til at
// søge i butikkens eget postnummer FØRST - Adressevælgeren sorterer ellers
// i ren stigende postnummer og returnerer kun de første 10, så en søgning
// efter fx "Parkvej 1" uden postnummer fyldte hele listen med Sjælland, og
// Odense kom aldrig med.
export async function searchAdressevaelger(raw, kommunekode, handling = "soeg-adresser", standardPostnummer) {
  const query = parseQuery(raw);
  if (!query.postnummer && standardPostnummer) query.postnummer = standardPostnummer;
  const data = await callProxy({ handling, maksimum: 10, kommunekode, ...query });
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

// ---------------------------------------------------------------------------
// To tidligere selvstændige fejl rettet (september 2026), fundet ved at
// kalde den RIGTIGE API direkte og se det faktiske svar, i stedet for at
// gætte ud fra dokumentationsfragmenter:
//
//   1. "kommunekode" findes IKKE som et felt i et søgeresultat - hverken
//      fra /adresser/soeg eller /husnumre/soeg. De flade søgeresultater
//      indeholder kun {type, id, titel, vejnavn, husnummer, postnr,
//      postdistrikt, antal_husnumre} - INGEN kommune-oplysning. Kommunekoden
//      findes først ved et DETALJE-opslag på én bestemt adresse
//      (/husnumre/{id}), og selv dér ligger den indlejret, ikke som et
//      fladt felt: husnummer.navngivenvejkommunedel.kommune.
//
//   2. parseQuery (se ovenfor) kunne ikke tolke en gemt butiksadresse med
//      bynavn ("Odensevej 115, 5260 Odense") - kun uden ("Odensevej 115
//      5260"), og siden heller ikke med bydel imellem ("Odensevej 115,
//      Hjallese, 5260 Odense S"). Den fejl ramte NETOP denne funktion, fordi
//      det er butikkens egen, FULDE gemte adressetekst, der sendes ind her.
//
// Rettelsen slår derfor op i TO TRIN, ligesom lookupAdressevaelgerCoordinates
// ovenfor gør for koordinater: (1) find et husnummer-id for adressen via en
// almindelig søgning, (2) hent husnummerets fulde detaljer og læs
// kommunekoden ud af den rigtige, indlejrede sti.
export async function resolveStoreKommuneKode(address) {
  if (!address || !address.trim()) return null;
  const result = await searchAdressevaelger(address, undefined, "soeg-husnumre");
  if (!result.ok || result.fund.length === 0) return null;
  const hit = result.fund.find((f) => f.type === "husnummer") || result.fund[0];
  if (!hit?.id) return null;

  const data = await callProxy({ handling: "opslag-husnummer", ider: [hit.id] });
  if (!data || data.status !== "ok") return null;
  return data.husnummer?.navngivenvejkommunedel?.kommune || null;
}
