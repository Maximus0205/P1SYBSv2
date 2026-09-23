// ---------------------------------------------------------------------------
// PARALLELT FORSØG (september 2026): Klimadatastyrelsens Adressevælger
// (adressevaelger.dk) - den officielle, statslige erstatning for DAWA's
// autocomplete. DAWA lukker permanent 1. oktober 2026.
//
// Dette modul er BEVIDST ADSKILT fra lib/geocoding.js (den eksisterende,
// levende tjeneste via OpenRouteService/ors-proxy) - ingen af appens rigtige
// adressefelter (AddressInput.jsx m.fl.) bruger dette endnu. Det er kun
// koblet til den isolerede test-side, se components/AdressevaelgerTest.jsx
// under Admin -> Integrationer, hvor det kan afprøves og sammenlignes uden
// nogen risiko for det, der allerede virker i produktion.
//
// Se supabase/functions/adressevaelger-proxy for selve proxy-kaldet
// (kræver login, ligesom ors-proxy) og noten om token dér.
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
// Fonetisk søgning (autocomplete). postnummer er en RIGTIG, struktureret
// parameter her - Adressevælgeren garanterer selv, at "postnummeret sikrer
// vejnavnets og adressernes entydighed" (deres egen dokumentation). Det er
// præcis det, ORS/Pelias IKKE kan (se den kendte, bekræftede fejl i
// lib/geocoding.js) - "Fuglebakken" + postnummer 5750 bør her give Ringe
// direkte, uden gæt eller heuristik.
//
// GIVER BEVIDST INGEN KOORDINATER her - fonetisk søgning returnerer kun
// tekst-felter (type, titel, vejnavn, postnr...). Koordinater kræver et
// ekstra opslag pr. id, se lookupAdressevaelgerCoordinates nedenfor - kaldes
// derfor kun for DEN adresse, brugeren rent faktisk vælger, ikke for hele
// listen af forslag (ville ellers kræve ét ekstra kald pr. vist forslag).
export async function searchAdressevaelger(tekst, { postnummer } = {}) {
  const data = await callProxy({ handling: "soeg-adresser", tekst, postnummer, maksimum: 10 });
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
