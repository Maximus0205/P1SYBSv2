// ORS-ADAPTER (OpenRouteService: adresseopslag, afstande og køretid) - oktober 2026.
//
// Alt, appen ved om OpenRouteService, går gennem denne adapter. Selve kaldet sker i Edge Functionen
// ors-proxy, så ORS-nøglen kun findes server-side og aldrig i den offentlige kode.
//
// UAFHÆNGIG AF APPEN: ingen imports. Transport og advarsels-funktion gives udefra. Se README.md.
//
// CACHE: kun VELLYKKEDE kald gemmes (pr. adapter-instans). Fejler et kald (fx ORS' hastighedsgrænse),
// skal det kunne prøves igen senere - ellers sidder en adresse fast som "ikke fundet" resten af sessionen,
// længe efter tjenesten er kommet sig. "Ikke fundet" (tomt svar) er derimod et ægte svar og gemmes.
//
// POSTNUMMER: ORS' søgning (Pelias) ignorerer postnummeret, uanset hvordan det sendes (kendt fejl,
// GIScience/openrouteservice #1003). Komma-omskrivningen "Vej 5750" -> "Vej, 5750" er beholdt (harmløs), men
// den egentlige rettelse er at kunne GØRE OPMÆRKSOM på begrænsningen: udtagPostnummerHint giver postnummeret,
// så formularen kan vise et tip om at skrive bynavnet i stedet.

export const normaliser = (adresse) => (adresse || "").trim().toLowerCase();

// "Fuglebakken 5750" -> "5750". Kun et rigtigt dansk postnummer (1000-9990) til sidst i teksten.
export function udtagPostnummerHint(tekst) {
  const m = (tekst || "").trim().match(/^(.*\S)\s+(\d{4})$/);
  if (!m) return null;
  const postnr = Number(m[2]);
  if (postnr < 1000 || postnr > 9990) return null;
  return m[2];
}

function delPostnummerHint(tekst) {
  const postnr = udtagPostnummerHint(tekst);
  if (!postnr) return { query: tekst, postnr: null };
  const udenKode = tekst.trim().slice(0, tekst.trim().length - postnr.length).trim().replace(/,$/, "");
  return { query: `${udenKode}, ${postnr}`, postnr };
}

// Luftlinjeafstand i meter (Haversine). Bruges KUN til at sortere forslag efter nærhed til et fokuspunkt;
// reelle køreafstande kommer fra matrix-kaldet.
export function luftlinjeMeter(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// "11A" -> { num: 11, letter: "A" }, så en liste kan sorteres i den rækkefølge, man går ned ad en gade i.
export function parseHusnummer(raa) {
  const m = (raa || "").trim().match(/^(\d+)\s*([a-zA-Z]?)/);
  if (!m) return { num: Infinity, letter: "" };
  return { num: Number(m[1]), letter: (m[2] || "").toUpperCase() };
}

const BATCH_STOERRELSE = 4;
const MAKS_ADRESSER = 40;

export function opretOrsAdapter({ transport, advar, pauseMs = 300 } = {}) {
  if (!transport || typeof transport.kald !== "function") throw new Error("opretOrsAdapter: transport mangler");
  const advarsel = typeof advar === "function" ? advar : () => {};
  const geokodeCache = new Map();
  const forslagCache = new Map();

  // null = selve kaldet fejlede (netværk/429/500) - IKKE "ingen resultater".
  async function kaldProxy(body) {
    const r = await transport.kald("ors-proxy", body, { logFejl: false, standardFejl: "ors-proxy fejlede" });
    if (!r.ok) { try { advarsel("ors:proxy", r.fejl); } catch (_) { /* en advarsel må ikke vælte kaldet */ } return null; }
    return r.data;
  }

  // Bedste træf med ORS' egen sikkerhedsscore (0-1). Deles af geokod og valider.
  async function bedsteTraef(adresse, fokus) {
    const noegle = normaliser(adresse) + (fokus ? `|${fokus.lat},${fokus.lon}` : "");
    if (!noegle || noegle.length < 5) return null;
    if (geokodeCache.has(noegle)) return geokodeCache.get(noegle);

    const { query } = delPostnummerHint(adresse);
    const data = await kaldProxy({ handling: "soeg", tekst: query, fokus });
    if (data === null) return null; // kaldet fejlede - IKKE gemt, prøv igen senere

    const features = data?.features || [];
    const feature = features.find((f) => f.properties?.housenumber) || features[0];
    const k = feature?.geometry?.coordinates; // [lon, lat]
    const resultat = k
      ? { lon: k[0], lat: k[1], label: feature.properties?.label || adresse, confidence: feature.properties?.confidence ?? 0 }
      : null; // ægte "ikke fundet" - sikkert at gemme
    geokodeCache.set(noegle, resultat);
    return resultat;
  }

  return {
    // { lon, lat } eller null (ikke fundet, eller kaldet fejlede).
    async geokod(adresse, fokus) {
      const t = await bedsteTraef(adresse, fokus);
      return t ? { lon: t.lon, lat: t.lat } : null;
    },

    // Fanger tastefejl og ikke-eksisterende adresser, før en sag oprettes. gyldig = ORS fandt et træf med
    // rimelig sikkerhed (>= 0,6).
    async valider(adresse, fokus) {
      const t = await bedsteTraef(adresse, fokus);
      if (!t) return { gyldig: false, label: null, koordinater: null, confidence: 0 };
      return { gyldig: t.confidence >= 0.6, label: t.label, koordinater: { lon: t.lon, lat: t.lat }, confidence: t.confidence };
    },

    // Op til 10 adresseforslag, mens der skrives. Tre forbedringer oven på ORS' rå relevans-liste:
    //  1. postnummer-hint: findes mindst ét forslag med det skrevne postnummer, vises kun dem
    //  2. afstand til fokuspunktet (typisk butikken): de nærmeste først (under 50 m forskel er støj)
    //  3. husnumre sorteres NUMERISK ("5, 7, 9, 11, 11A, 13") frem for ORS' egen rækkefølge
    async adresseforslag(delvisAdresse, fokus) {
      const noegle = normaliser(delvisAdresse) + (fokus ? `|${fokus.lat},${fokus.lon}` : "");
      if (!noegle || noegle.length < 3) return [];
      if (forslagCache.has(noegle)) return forslagCache.get(noegle);

      const { query, postnr } = delPostnummerHint(delvisAdresse);
      const data = await kaldProxy({ handling: "autocomplete", tekst: query, fokus });
      if (data === null) return []; // kaldet fejlede - ikke gemt, feltet viser blot ingen forslag

      let forslag = (data?.features || []).map((f) => {
        const p = f.properties || {};
        const hovedtekst = [p.street, p.housenumber].filter(Boolean).join(" ") || p.name || p.label || "";
        const undertekst = [p.postalcode, p.locality || p.county].filter(Boolean).join(" ");
        return {
          label: undertekst ? `${hovedtekst}, ${undertekst}` : (p.label || hovedtekst),
          hovedtekst,
          undertekst,
          harHusnummer: !!p.housenumber,
          husnummer: parseHusnummer(p.housenumber),
          postnummer: p.postalcode || null,
          lon: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
        };
      });

      if (postnr) {
        const matcher = forslag.filter((s) => s.postnummer === postnr);
        if (matcher.length > 0) forslag = matcher;
      }

      forslag.sort((a, b) => {
        if (fokus) {
          const da = luftlinjeMeter(fokus, a);
          const db = luftlinjeMeter(fokus, b);
          if (Math.abs(da - db) > 50) return da - db;
        }
        if (a.harHusnummer !== b.harHusnummer) return a.harHusnummer ? -1 : 1;
        if (a.husnummer.num !== b.husnummer.num) return a.husnummer.num - b.husnummer.num;
        return a.husnummer.letter.localeCompare(b.husnummer.letter);
      });

      const resultat = forslag.slice(0, 10);
      forslagCache.set(noegle, resultat);
      return resultat;
    },

    // Slår en liste adresser op (fjerner dubletter, højst 40) i små puljer med en kort pause imellem. Uden det
    // kunne en travl uge sende hundredvis af kald i samme øjeblik og udløse ORS' hastighedsgrænse (429).
    async geokodListe(adresser) {
      const unikke = [...new Set((adresser || []).map(normaliser).filter((a) => a.length >= 5))].slice(0, MAKS_ADRESSER);
      const kort = new Map();
      for (let i = 0; i < unikke.length; i += BATCH_STOERRELSE) {
        const pulje = unikke.slice(i, i + BATCH_STOERRELSE);
        const svar = await Promise.all(pulje.map(async (a) => [a, await this.geokod(a)]));
        svar.forEach(([a, k]) => { if (k) kort.set(a, k); });
        if (pauseMs > 0 && i + BATCH_STOERRELSE < unikke.length) await new Promise((r) => setTimeout(r, pauseMs));
      }
      return kort;
    },

    // Køreafstand (meter) fra ÉT udgangspunkt til flere destinationer.
    async koerselsafstande(kilde, destinationer) {
      if (!kilde || !destinationer || destinationer.length === 0) return [];
      const data = await kaldProxy({ handling: "matrix", kilde, destinationer });
      return data?.distances?.[0] || [];
    },

    // Forventet samlet køretid (minutter) gennem punkterne I DEN GIVNE RÆKKEFØLGE - til "arbejde + kørsel" pr.
    // bil. null = kaldet fejlede (så kalderen kan vise "kunne ikke beregnes" i stedet for 0).
    async koerselstid(punkterIRaekkefoelge) {
      const gyldige = (punkterIRaekkefoelge || []).filter((p) => p && p.lat != null && p.lon != null);
      if (gyldige.length < 2) return 0;
      const data = await kaldProxy({ handling: "matrix", punkter: gyldige });
      const varigheder = data?.durations;
      if (!varigheder) return null;
      let sekunder = 0;
      for (let i = 0; i < gyldige.length - 1; i++) {
        const ben = varigheder[i]?.[i + 1];
        if (ben == null) return null;
        sekunder += ben;
      }
      return Math.round(sekunder / 60);
    },

    // Fuld matrix mellem alle punkter (minutter og km) til kapacitetsmotoren (src/engine/kapacitet). punkter: [{ id, lat, lon }].
    // Svarer { ids, minutter, km } (km er null, hvis proxyen kun gav køretid), eller null hvis kaldet fejlede. Punkter uden
    // koordinater udelades (de kommer ikke med i ids), så motoren falder tilbage på et skøn for dem.
    async koerselsmatrix(punkter) {
      const gyldige = (punkter || []).filter((p) => p && p.id !== undefined && p.lat != null && p.lon != null);
      if (gyldige.length < 2) return null;
      const data = await kaldProxy({ handling: "matrix", punkter: gyldige.map((p) => ({ lat: p.lat, lon: p.lon })) });
      const d = data?.durations;
      if (!Array.isArray(d)) return null;
      const k = data?.distances;
      return {
        ids: gyldige.map((p) => p.id),
        minutter: d.map((raekke) => raekke.map((x) => (x == null ? null : x / 60))),
        km: Array.isArray(k) ? k.map((raekke) => raekke.map((x) => (x == null ? null : x / 1000))) : null,
      };
    },

    // Bedste besøgsrækkefølge, med punkter[0] som FAST udgangspunkt (typisk butikken). Hele afstandsmatricen
    // hentes i ÉT kald, og derefter vælges lokalt altid det nærmeste ubesøgte punkt ("nærmeste nabo"). Ikke
    // bevist optimalt for mange stop, men et solidt, hurtigt og forklarligt forslag for de 2-8 stop på en dag.
    // Svarer med INDEKSER i den foreslåede rækkefølge (starter altid med 0), eller null hvis kaldet fejlede.
    async bedsteRaekkefoelge(punkter) {
      const gyldige = (punkter || []).filter((p) => p && p.lat != null && p.lon != null);
      if (gyldige.length < 3) return gyldige.map((_, i) => i);
      const data = await kaldProxy({ handling: "matrix", punkter: gyldige });
      const varigheder = data?.durations;
      if (!varigheder) return null;

      const n = gyldige.length;
      const besoegt = new Array(n).fill(false);
      besoegt[0] = true;
      const raekkefoelge = [0];
      let nu = 0;
      for (let trin = 1; trin < n; trin++) {
        let bedst = -1;
        let bedstTid = Infinity;
        for (let j = 1; j < n; j++) {
          if (besoegt[j]) continue;
          const t = varigheder[nu]?.[j];
          if (t != null && t < bedstTid) { bedstTid = t; bedst = j; }
        }
        if (bedst === -1) break; // data mangler for resten - det, vi har, er stadig gyldigt
        besoegt[bedst] = true;
        raekkefoelge.push(bedst);
        nu = bedst;
      }
      return raekkefoelge;
    },
  };
}
