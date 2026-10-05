// ADRESSEVÆLGER-ADAPTER (Klimadatastyrelsens Adressevælger, adressevaelger.dk) - oktober 2026.
//
// Den officielle, statslige erstatning for DAWA's autocomplete (DAWA lukker 1. oktober 2026). Kaldet sker
// i Edge Functionen adressevaelger-proxy (kræver login).
//
// UAFHÆNGIG AF APPEN: ingen imports. Transport og advarsels-funktion gives udefra. Se README.md.

// KOORDINATSYSTEM: Adressevælgeren svarer i ETRS89/UTM zone 32N (EPSG:25832), IKKE WGS84 lat/lon, som resten
// af appen bruger. Uden omregningen ville koordinaterne pege helt forkerte steder på et kort.
//
// OMREGNINGEN er Krüger-rækken (4. orden): nøjagtig til under en millimeter hele Danmark igennem, også på
// Sjælland og Bornholm, som ligger langt fra zonens midterlinje (9° Ø). Den tidligere formel (en afkortet
// række) var nøjagtig til under en halv meter på Fyn og i Jylland, men afveg ca. 14 m ved København og ca. 90 m
// på Bornholm. GRS80 og WGS84 adskiller sig under en millimeter, så de to behandles som samme ellipsoide.
export function utm32ToWgs84(easting, northing) {
  const a = 6378137.0;
  const f = 1 / 298.257222101;
  const k0 = 0.9996;
  const lon0 = 9; // zone 32: centralmeridian 9° Ø
  const n = f / (2 - f);
  const A = (a / (1 + n)) * (1 + (n * n) / 4 + n ** 4 / 64);

  const beta = [
    n / 2 - (2 * n * n) / 3 + (37 * n ** 3) / 96 - n ** 4 / 360,
    n * n / 48 + n ** 3 / 15 - (437 * n ** 4) / 1440,
    (17 * n ** 3) / 480 - (37 * n ** 4) / 840,
    (4397 * n ** 4) / 161280,
  ];
  const delta = [
    2 * n - (2 * n * n) / 3 - 2 * n ** 3 + (116 * n ** 4) / 45,
    (7 * n * n) / 3 - (8 * n ** 3) / 5 - (227 * n ** 4) / 45,
    (56 * n ** 3) / 15 - (136 * n ** 4) / 35,
    (4279 * n ** 4) / 630,
  ];

  const xi = northing / (k0 * A);
  const eta = (easting - 500000) / (k0 * A);

  let xiP = xi;
  let etaP = eta;
  for (let j = 1; j <= 4; j++) {
    xiP -= beta[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    etaP -= beta[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }

  const chi = Math.asin(Math.sin(xiP) / Math.cosh(etaP));
  let phi = chi;
  for (let j = 1; j <= 4; j++) phi += delta[j - 1] * Math.sin(2 * j * chi);
  const lam = Math.atan2(Math.sinh(etaP), Math.cos(xiP));

  return { lat: (phi * 180) / Math.PI, lon: lon0 + (lam * 180) / Math.PI };
}

// Deler en tastet adresse op i vejnavn, husnummer og postnummer (Adressevælgeren vil have dem som adskilte,
// strukturerede felter). Husnummeret er det FØRSTE tal-token EFTER vejnavnet; alt bagved (etage, dør, bydel)
// ignoreres. Postnummeret er FIRE CIFRE et sted i teksten; alt fra og med det klippes væk. En rigtig adresse
// slutter sjældent på husnummeret: "Odensevej 115, Hjallese, 5260 Odense S".
export function parseQuery(raa) {
  let s = (raa || "").trim().replace(/,/g, " ").replace(/\s+/g, " ").trim();
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

  if (!s) return { tekst: raa.trim() };
  return { vejnavn: s, husnummer, postnummer };
}

// Adressevælgeren sorterer i ren stigende postnummer ved lige godt match og har ingen sortering efter nærhed,
// så man må hente FLERE resultater, end listen skal vise, og selv vælge de bedste. Hvor højt maksimum kan
// sættes, vides ikke: 100 prøves først, så 50, så 10. Det første gyldige svar bruges og erindres, så et for
// højt tal ikke koster et fejlkald hver gang.
const MAKSIMUM_TRIN = [100, 50, 10];

export function opretAdressevaelgerAdapter({ transport, advar } = {}) {
  if (!transport || typeof transport.kald !== "function") throw new Error("opretAdressevaelgerAdapter: transport mangler");
  const advarsel = typeof advar === "function" ? advar : () => {};
  let bekraeftetMaksimum = null;

  async function kaldProxy(body) {
    const r = await transport.kald("adressevaelger-proxy", body, { logFejl: false, standardFejl: "adressevaelger-proxy fejlede" });
    if (!r.ok) { try { advarsel("adressevaelger:proxy", r.fejl); } catch (_) { /* som i ors */ } return null; }
    return r.data;
  }

  async function soegMedMaksimum(body, oensketMaksimum) {
    let trin = MAKSIMUM_TRIN.filter((m) => m <= Math.max(oensketMaksimum, 10));
    if (bekraeftetMaksimum != null) trin = trin.filter((m) => m <= bekraeftetMaksimum);
    if (trin.length === 0) trin = [10];
    let data = null;
    for (const m of trin) {
      data = await kaldProxy({ ...body, maksimum: m });
      if (data && data.status === "ok") {
        if (m > 10) bekraeftetMaksimum = m;
        return data;
      }
      if (m <= 10) break;
    }
    return data;
  }

  const adapter = {
    // Fonetisk søgning (autocomplete). Giver bevidst INGEN koordinater: de kræver et ekstra opslag pr. id (se
    // opslagKoordinater).
    //   handling              "soeg-adresser" (kan give etage/dør) eller "soeg-husnumre" (selve forslagslisten)
    //   standardPostnummer    bruges KUN, hvis den tastede tekst ikke selv har et postnummer
    //   maksimum              hvor mange resultater man ØNSKER (op til 100)
    async soeg(raa, kommunekode, handling = "soeg-adresser", standardPostnummer, maksimum = 10) {
      const query = parseQuery(raa);
      if (!query.postnummer && standardPostnummer) query.postnummer = standardPostnummer;
      const data = await soegMedMaksimum({ handling, kommunekode, ...query }, maksimum);
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
    },

    // Koordinater (WGS84) for ÉT valgt husnummer/adresse-id. type skal være det samme som i søgeresultatet.
    async opslagKoordinater(id, type) {
      const data = type === "husnummer"
        ? await kaldProxy({ handling: "opslag-husnummer", ider: [id] })
        : await kaldProxy({ handling: "opslag-adresser", ider: [id] });
      if (!data || data.status !== "ok") return null;
      const adgangspunkt = data.husnummer?.adgangspunkt || data.adresser?.[0]?.husnummer?.adgangspunkt || data.adresse?.husnummer?.adgangspunkt;
      const k = adgangspunkt?.geometri?.coordinates;
      if (!k) return null;
      return utm32ToWgs84(k[0], k[1]);
    },

    // Kommunekoden for en adresse, i to trin: (1) find et husnummer-id via en almindelig søgning, (2) hent
    // husnummerets detaljer. Kommunekoden står IKKE i et søgeresultat; den ligger først i detaljeopslaget,
    // indlejret: husnummer.navngivenvejkommunedel.kommune.
    async findKommunekode(adresse) {
      if (!adresse || !adresse.trim()) return null;
      const r = await adapter.soeg(adresse, undefined, "soeg-husnumre");
      if (!r.ok || r.fund.length === 0) return null;
      const traef = r.fund.find((f) => f.type === "husnummer") || r.fund[0];
      if (!traef?.id) return null;
      const data = await kaldProxy({ handling: "opslag-husnummer", ider: [traef.id] });
      if (!data || data.status !== "ok") return null;
      return data.husnummer?.navngivenvejkommunedel?.kommune || null;
    },
  };
  return adapter;
}
