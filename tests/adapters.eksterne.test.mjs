// Regressionstest til adaptere for ORS, Adressevælgeren og lager (src/adapters/ors, adressevaelger, lager).
// Kør med:  node tests/adapters.eksterne.test.mjs
// Ingen netværk: klienten er en attrap.
import { opretEdgeTransport } from "../src/adapters/core/edgeTransport.js";
import { opretOrsAdapter, udtagPostnummerHint, parseHusnummer, luftlinjeMeter } from "../src/adapters/ors/index.js";
import { opretAdressevaelgerAdapter, utm32ToWgs84, parseQuery } from "../src/adapters/adressevaelger/index.js";
import { opretLagerAdapter, formatBytes } from "../src/adapters/lager/index.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};
const tæt = (a, b, tol) => Math.abs(a - b) <= tol;

// ---------- attrap-klient: functions.invoke styres af en funktion pr. test
const kald = [];
let handler = () => ({ data: {}, error: null });
const klient = {
  functions: { invoke: async (navn, { body }) => { kald.push({ navn, body }); return handler(navn, body); } },
};
const t = opretEdgeTransport({ klient });
const logget = [];
const advar = (k, b) => logget.push([k, b]);
const nulstil = () => { kald.length = 0; logget.length = 0; };
const fejl = { data: null, error: { message: "429 too many requests" } };

// =====================================================================================================
// ORS
// =====================================================================================================
eq("postnummer-hint: gyldigt", udtagPostnummerHint("Fuglebakken 5750"), "5750");
eq("postnummer-hint: for lavt/højt/ingen", [udtagPostnummerHint("Vej 0999"), udtagPostnummerHint("Vej 9999"), udtagPostnummerHint("Fuglebakken 5"), udtagPostnummerHint("")], [null, null, null, null]);
eq("postnummer-hint: kun 4 cifre alene er intet hint (ingen vej før)", udtagPostnummerHint("5750"), null);
eq("husnummer: 11A", parseHusnummer("11A"), { num: 11, letter: "A" });
eq("husnummer: uden tal sorteres sidst", parseHusnummer("").num, Infinity);
eq("luftlinje: 0 m til sig selv, ca. 111 km pr. breddegrad", [luftlinjeMeter({ lat: 55, lon: 10 }, { lat: 55, lon: 10 }), Math.round(luftlinjeMeter({ lat: 55, lon: 10 }, { lat: 56, lon: 10 }) / 1000)], [0, 111]);

// --- geokod og cache
let ors = opretOrsAdapter({ transport: t, advar, pauseMs: 0 });
nulstil();
handler = () => ({ data: { features: [{ geometry: { coordinates: [10.4, 55.4] }, properties: { housenumber: "5", label: "Skovvej 5", confidence: 0.9 } }] }, error: null });
eq("geokod: lon/lat", await ors.geokod("Skovvej 5, Odense"), { lon: 10.4, lat: 55.4 });
await ors.geokod("  SKOVVEJ 5, ODENSE  ");
eq("geokod: samme adresse (uanset store/små bogstaver og mellemrum) slås kun op én gang", kald.length, 1);
await ors.geokod("Skovvej 5, Odense", { lat: 55, lon: 10 });
eq("geokod: et andet fokuspunkt er et nyt opslag", kald.length, 2);
eq("geokod: sender handling soeg og teksten", kald[0].body, { handling: "soeg", tekst: "Skovvej 5, Odense", fokus: undefined });
nulstil();
eq("geokod: for kort adresse giver null uden kald", [await ors.geokod("Vej"), await ors.geokod(""), await ors.geokod(null), kald.length], [null, null, null, 0]);

nulstil(); ors = opretOrsAdapter({ transport: t, advar, pauseMs: 0 });
handler = () => fejl;
eq("geokod: et mislykket kald giver null", await ors.geokod("Skovvej 5, Odense"), null);
eq("geokod: og skrives som advarsel, ikke som fejl", logget.length, 1);
handler = () => ({ data: { features: [{ geometry: { coordinates: [10.4, 55.4] }, properties: { confidence: 1 } }] }, error: null });
eq("geokod: et mislykket kald gemmes IKKE - det lykkes næste gang", await ors.geokod("Skovvej 5, Odense"), { lon: 10.4, lat: 55.4 });
nulstil(); ors = opretOrsAdapter({ transport: t, advar, pauseMs: 0 });
handler = () => ({ data: { features: [] }, error: null });
await ors.geokod("Findes ikke 99"); await ors.geokod("Findes ikke 99");
eq("geokod: 'ikke fundet' er et ægte svar og gemmes (kun ét kald)", kald.length, 1);
nulstil(); ors = opretOrsAdapter({ transport: t, advar, pauseMs: 0 });
handler = () => ({ data: { fejl: "ORS-nøglen mangler" }, error: null });
eq("geokod: et svar med { fejl } er en fejl, ikke 'ikke fundet' (gemmes ikke)", [await ors.geokod("Skovvej 5, Odense"), (await ors.geokod("Skovvej 5, Odense")), kald.length], [null, null, 2]);
nulstil(); ors = opretOrsAdapter({ transport: t, advar, pauseMs: 0 });
handler = () => ({ data: { features: [{ geometry: { coordinates: [1, 2] }, properties: { label: "Uden nr" } }, { geometry: { coordinates: [3, 4] }, properties: { housenumber: "7", label: "Med nr" } }] }, error: null });
eq("geokod: foretrækker et træf med husnummer", await ors.geokod("Vej 7, By"), { lon: 3, lat: 4 });
nulstil(); ors = opretOrsAdapter({ transport: t, advar, pauseMs: 0 });
await ors.geokod("Fuglebakken 5750");
eq("geokod: postnummer til sidst omskrives med komma", kald[0].body.tekst, "Fuglebakken, 5750");

// --- valider
nulstil(); ors = opretOrsAdapter({ transport: t, advar, pauseMs: 0 });
const med = (c) => () => ({ data: { features: [{ geometry: { coordinates: [10, 55] }, properties: { label: "L", confidence: c } }] }, error: null });
handler = med(0.59);
eq("valider: 0,59 er ikke gyldig", (await ors.valider("Skovvej 5, Odense")).gyldig, false);
ors = opretOrsAdapter({ transport: t, advar, pauseMs: 0 }); handler = med(0.6);
eq("valider: 0,6 er gyldig", await ors.valider("Skovvej 5, Odense"), { gyldig: true, label: "L", koordinater: { lon: 10, lat: 55 }, confidence: 0.6 });
ors = opretOrsAdapter({ transport: t, advar, pauseMs: 0 }); handler = () => ({ data: { features: [] }, error: null });
eq("valider: ikke fundet", await ors.valider("Findes ikke 99"), { gyldig: false, label: null, koordinater: null, confidence: 0 });

// --- adresseforslag
const f = (street, nr, post, by, lon = 10, lat = 55) => ({ geometry: { coordinates: [lon, lat] }, properties: { street, housenumber: nr, postalcode: post, locality: by, label: `${street} ${nr}` } });
nulstil(); ors = opretOrsAdapter({ transport: t, advar, pauseMs: 0 });
handler = () => ({ data: { features: [f("Kløvervej", "11A", "5000", "Odense"), f("Kløvervej", "9", "5000", "Odense"), f("Kløvervej", "11", "5000", "Odense"), f("Kløvervej", "13", "5000", "Odense"), f("Kløvervej", "7", "5000", "Odense"), f("Kløvervej", undefined, "5000", "Odense")] }, error: null });
const lst = await ors.adresseforslag("Kløvervej");
eq("forslag: husnumre sorteres numerisk, vej uden nummer sidst", lst.map((s) => s.husnummer.num + s.husnummer.letter), ["7", "9", "11", "11A", "13", "Infinity"].map((x) => (x === "Infinity" ? "Infinity" : x)).map((x) => x));
eq("forslag: visning i to linjer", [lst[0].hovedtekst, lst[0].undertekst, lst[0].label], ["Kløvervej 7", "5000 Odense", "Kløvervej 7, 5000 Odense"]);
await ors.adresseforslag("Kløvervej");
eq("forslag: gemmes (ét kald)", kald.length, 1);
nulstil();
eq("forslag: under 3 tegn giver [] uden kald", [await ors.adresseforslag("Kl"), kald.length], [[], 0]);
nulstil(); ors = opretOrsAdapter({ transport: t, advar, pauseMs: 0 });
handler = () => fejl;
eq("forslag: et mislykket kald giver [] og gemmes ikke", [await ors.adresseforslag("Kløvervej"), logget.length], [[], 1]);
handler = () => ({ data: { features: [f("Kløvervej", "1", "5000", "Odense")] }, error: null });
eq("forslag: næste kald prøver igen", (await ors.adresseforslag("Kløvervej")).length, 1);

nulstil(); ors = opretOrsAdapter({ transport: t, advar, pauseMs: 0 });
handler = () => ({ data: { features: [f("Fuglebakken", "5", "5750", "Ringe"), f("Fuglebakken", "6", "2000", "Frederiksberg"), f("Fuglebakken", "7", "5750", "Ringe")] }, error: null });
eq("forslag: postnummer-hint indsnævrer til det skrevne postnummer", (await ors.adresseforslag("Fuglebakken 5750")).map((s) => s.postnummer), ["5750", "5750"]);
nulstil(); ors = opretOrsAdapter({ transport: t, advar, pauseMs: 0 });
handler = () => ({ data: { features: [f("Fuglebakken", "5", "2000", "Frederiksberg")] }, error: null });
eq("forslag: findes intet med det postnummer, bevares listen (ORS ignorerer postnumre)", (await ors.adresseforslag("Fuglebakken 5750")).length, 1);

nulstil(); ors = opretOrsAdapter({ transport: t, advar, pauseMs: 0 });
handler = () => ({ data: { features: [f("Vej", "1", "2000", "Langt væk", 12.5, 55.7), f("Vej", "2", "5000", "Tæt på", 10.4, 55.4)] }, error: null });
eq("forslag: det nærmeste til fokuspunktet kommer først", (await ors.adresseforslag("Vej", { lat: 55.4, lon: 10.4 })).map((s) => s.undertekst), ["5000 Tæt på", "2000 Langt væk"]);
nulstil(); ors = opretOrsAdapter({ transport: t, advar, pauseMs: 0 });
handler = () => ({ data: { features: [f("Vej", "5", "5000", "Odense", 10.4001, 55.4), f("Vej", "3", "5000", "Odense", 10.4, 55.4)] }, error: null });
eq("forslag: under 50 meters forskel er støj - husnummeret afgør", (await ors.adresseforslag("Vej", { lat: 55.4, lon: 10.4 })).map((s) => s.husnummer.num), [3, 5]);
nulstil(); ors = opretOrsAdapter({ transport: t, advar, pauseMs: 0 });
handler = () => ({ data: { features: Array.from({ length: 25 }, (_, i) => f("Vej", String(i + 1), "5000", "Odense")) }, error: null });
eq("forslag: højst 10", (await ors.adresseforslag("Vej")).length, 10);

// --- geokodListe
nulstil(); ors = opretOrsAdapter({ transport: t, advar, pauseMs: 0 });
let samtidige = 0, maks = 0;
klient.functions.invoke = async (navn, { body }) => { kald.push({ navn, body }); samtidige++; maks = Math.max(maks, samtidige); await new Promise((r) => setTimeout(r, 5)); samtidige--; return { data: { features: [{ geometry: { coordinates: [10, 55] }, properties: { confidence: 1 } }] }, error: null }; };
const adrs = Array.from({ length: 50 }, (_, i) => `Vejen ${i + 10}, Byen`);
const kort = await ors.geokodListe([...adrs, adrs[0].toUpperCase(), "kort", "", null]);
eq("geokodListe: dubletter, for korte og tomme udelades, højst 40", [kort.size, kald.length], [40, 40]);
eq("geokodListe: højst 4 kald ad gangen", maks <= 4, true);
klient.functions.invoke = async (navn, { body }) => { kald.push({ navn, body }); return handler(navn, body); };
nulstil(); ors = opretOrsAdapter({ transport: t, advar, pauseMs: 0 });
handler = (n, b) => (b.tekst.includes("fejl") ? fejl : { data: { features: [{ geometry: { coordinates: [10, 55] }, properties: { confidence: 1 } }] }, error: null });
eq("geokodListe: en adresse, der fejler, udelades; resten kommer med", [...(await ors.geokodListe(["Vejen 1, God", "Vejen fejl, Dårlig"])).keys()], ["vejen 1, god"]);

// --- afstande og køretid
const A = { lat: 55.4, lon: 10.4 }, B = { lat: 55.5, lon: 10.5 }, C = { lat: 55.6, lon: 10.6 };
nulstil(); ors = opretOrsAdapter({ transport: t, advar, pauseMs: 0 });
handler = () => ({ data: { distances: [[0, 1200, 3400]] }, error: null });
eq("koerselsafstande: første række", await ors.koerselsafstande(A, [B, C]), [0, 1200, 3400]);
eq("koerselsafstande: sender matrix med kilde og destinationer", kald[0].body, { handling: "matrix", kilde: A, destinationer: [B, C] });
nulstil();
eq("koerselsafstande: uden kilde eller destinationer intet kald", [await ors.koerselsafstande(null, [B]), await ors.koerselsafstande(A, []), kald.length], [[], [], 0]);
handler = () => fejl;
eq("koerselsafstande: fejl giver []", await ors.koerselsafstande(A, [B]), []);

handler = () => ({ data: { durations: [[0, 600, 1500], [600, 0, 900], [1500, 900, 0]] }, error: null });
eq("koerselstid: ben A-B + B-C = 600 + 900 sek. = 25 min", await ors.koerselstid([A, B, C]), 25);
nulstil();
eq("koerselstid: under 2 gyldige punkter er 0 uden kald", [await ors.koerselstid([A]), await ors.koerselstid([A, null, { lat: null, lon: 1 }]), await ors.koerselstid([]), kald.length], [0, 0, 0, 0]);
handler = () => fejl;
eq("koerselstid: et mislykket kald giver null (ikke 0)", await ors.koerselstid([A, B]), null);
handler = () => ({ data: { durations: [[0, null], [null, 0]] }, error: null });
eq("koerselstid: et manglende ben giver null", await ors.koerselstid([A, B]), null);

// --- bedste rækkefølge (nærmeste nabo, punkt 0 er fast)
handler = () => ({ data: { durations: [[0, 900, 100, 500], [900, 0, 200, 300], [100, 200, 0, 800], [500, 300, 800, 0]] }, error: null });
eq("bedsteRaekkefoelge: starter ved 0, så altid det nærmeste ubesøgte (0 -> 2 -> 1 -> 3)", await ors.bedsteRaekkefoelge([A, B, C, { lat: 55.7, lon: 10.7 }]), [0, 2, 1, 3]);
nulstil();
eq("bedsteRaekkefoelge: under 3 punkter er allerede i rækkefølge, uden kald", [await ors.bedsteRaekkefoelge([A, B]), await ors.bedsteRaekkefoelge([A]), await ors.bedsteRaekkefoelge([]), kald.length], [[0, 1], [0], [], 0]);
handler = () => fejl;
eq("bedsteRaekkefoelge: et mislykket kald giver null", await ors.bedsteRaekkefoelge([A, B, C]), null);
handler = () => ({ data: { durations: [[0, 100, null], [100, 0, null], [null, null, 0]] }, error: null });
eq("bedsteRaekkefoelge: manglende data for resten - behold det gyldige (0, 1)", await ors.bedsteRaekkefoelge([A, B, C]), [0, 1]);
eq("bedsteRaekkefoelge: ugyldige punkter springes over", (await ors.bedsteRaekkefoelge([A, null, B])).length, 2);

// =====================================================================================================
// ADRESSEVÆLGER
// =====================================================================================================
// UTM zone 32 har sin centralmeridian ved 9° Ø: easting 500000 giver præcis lon 9, uanset northing.
const m1 = utm32ToWgs84(500000, 6200000);
eq("utm: easting 500000 giver præcis centralmeridianen (9° Ø)", tæt(m1.lon, 9, 1e-9), true);
eq("utm: northing 6.200.000 giver ca. 55,9° N", m1.lat > 55.7 && m1.lat < 56.0, true);
// To UAFHÆNGIGE frem-omregninger som kontrol (Snyder-rækken og Krüger-rækken), så testen ikke blot måler
// omregningen mod sin egen spejlformel.
function fremSnyder(latD, lonD) {
  const A_ = 6378137.0, F = 1 / 298.257222101, e2 = F * (2 - F), ep2 = e2 / (1 - e2), k0 = 0.9996;
  const phi = (latD * Math.PI) / 180, lam = (lonD * Math.PI) / 180, lam0 = (9 * Math.PI) / 180;
  const N = A_ / Math.sqrt(1 - e2 * Math.sin(phi) ** 2), T = Math.tan(phi) ** 2, C_ = ep2 * Math.cos(phi) ** 2, Aa = Math.cos(phi) * (lam - lam0);
  const M = A_ * ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * phi - ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi) + ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi) - ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi));
  return {
    e: k0 * N * (Aa + ((1 - T + C_) * Aa ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C_ - 58 * ep2) * Aa ** 5) / 120) + 500000,
    n: k0 * (M + N * Math.tan(phi) * ((Aa * Aa) / 2 + ((5 - T + 9 * C_ + 4 * C_ * C_) * Aa ** 4) / 24 + ((61 - 58 * T + T * T + 600 * C_ - 330 * ep2) * Aa ** 6) / 720)),
  };
}
function fremKruger(latD, lonD) {
  const a = 6378137.0, f = 1 / 298.257222101, k0 = 0.9996;
  const n = f / (2 - f), A = (a / (1 + n)) * (1 + n * n / 4 + n ** 4 / 64);
  const al = [n / 2 - 2 * n * n / 3 + 5 * n ** 3 / 16 + 41 * n ** 4 / 180, 13 * n * n / 48 - 3 * n ** 3 / 5 + 557 * n ** 4 / 1440, 61 * n ** 3 / 240 - 103 * n ** 4 / 140, 49561 * n ** 4 / 161280];
  const phi = latD * Math.PI / 180, lam = (lonD - 9) * Math.PI / 180;
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - (2 * Math.sqrt(n) / (1 + n)) * Math.atanh((2 * Math.sqrt(n) / (1 + n)) * Math.sin(phi)));
  const xi = Math.atan2(t, Math.cos(lam)), eta = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
  let E = eta, N = xi;
  for (let j = 1; j <= 4; j++) { E += al[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); N += al[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); }
  return { e: 500000 + k0 * A * E, n: k0 * A * N };
}
const meter = (dLat, dLon, lat) => Math.hypot(dLat * 111320, dLon * 111320 * Math.cos((lat * Math.PI) / 180));
const byer = [["Odense", 55.4038, 10.4024], ["Aarhus", 56.1572, 10.2107], ["Aalborg", 57.0488, 9.9217], ["Esbjerg", 55.4765, 8.4594], ["Kolding", 55.4904, 9.4722], ["København", 55.676, 12.568], ["Rønne (Bornholm)", 55.1037, 14.7066], ["Skagen", 57.7209, 10.5839]];
for (const [navn, lat, lon] of byer) {
  const k = fremKruger(lat, lon);
  const r = utm32ToWgs84(k.e, k.n);
  eq(`utm: ${navn} tur-retur inden for 1 centimeter`, meter(r.lat - lat, r.lon - lon, lat) < 0.01, true);
}
// kontrol af, at de to frem-formler er enige tæt på zonens midte (så konventionerne - ellipsoide, k0, midterlinje - er rigtige)
const s_ = fremSnyder(55.4038, 10.4024), k_ = fremKruger(55.4038, 10.4024);
eq("utm: Snyder og Krüger er enige om Odense inden for 1 meter (samme konventioner)", Math.hypot(s_.e - k_.e, s_.n - k_.n) < 1, true);
eq("utm: omregningen er nøjagtig på Bornholm, hvor den gamle afkortede række afveg ca. 90 m", (() => { const k = fremKruger(55.1037, 14.7066); const r = utm32ToWgs84(k.e, k.n); return meter(r.lat - 55.1037, r.lon - 14.7066, 55.1037) < 0.01; })(), true);
eq("utm: syd for og nord for ækvator-tæt søjle: lat vokser med northing", utm32ToWgs84(500000, 6300000).lat > utm32ToWgs84(500000, 6200000).lat, true);
eq("utm: vest for centralmeridianen giver lon under 9, øst for giver lon over 9", [utm32ToWgs84(400000, 6200000).lon < 9, utm32ToWgs84(600000, 6200000).lon > 9], [true, true]);

// --- parseQuery
eq("parse: fuld adresse med bydel og postnummer", parseQuery("Odensevej 115, Hjallese, 5260 Odense S"), { vejnavn: "Odensevej", husnummer: "115", postnummer: "5260" });
eq("parse: husnummer med bogstav og etage/dør efter", parseQuery("Skovvej 12A st. 70"), { vejnavn: "Skovvej", husnummer: "12A", postnummer: undefined });
eq("parse: kun vejnavn", parseQuery("Kløvervej"), { vejnavn: "Kløvervej", husnummer: undefined, postnummer: undefined });
eq("parse: vejnavn med flere ord", parseQuery("Sankt Knuds Vej 5 1903"), { vejnavn: "Sankt Knuds Vej", husnummer: "5", postnummer: "1903" });
eq("parse: tom tekst", parseQuery(""), { tekst: "" });
eq("parse: ugyldigt postnummer (under 1000) er ikke et postnummer", parseQuery("Vej 12 0999").postnummer, undefined);
eq("parse: kommaer behandles som mellemrum", parseQuery("Vej 5,5000 Odense"), { vejnavn: "Vej", husnummer: "5", postnummer: "5000" });

// --- søgning og maksimum-trin
const av = () => opretAdressevaelgerAdapter({ transport: t, advar });
const ok = (fund = []) => ({ data: { status: "ok", fund }, error: null });
nulstil(); let adr = av();
handler = () => ok([{ type: "husnummer", id: "h1", titel: "Odensevej 115", vejnavn: "Odensevej", husnummer: "115", postnr: "5260", postdistrikt: "Odense S", antal_husnumre: 3 }]);
const s1 = await adr.soeg("Odensevej 115 5260", "0461");
eq("soeg: felterne oversættes", s1, { ok: true, fund: [{ type: "husnummer", id: "h1", titel: "Odensevej 115", vejnavn: "Odensevej", husnummer: "115", postnr: "5260", postdistrikt: "Odense S", antalHusnumre: 3 }] });
eq("soeg: handling, kommunekode og strukturerede felter sendes, og først med maksimum 10 som ønsket", kald[0].body, { handling: "soeg-adresser", kommunekode: "0461", vejnavn: "Odensevej", husnummer: "115", postnummer: "5260", maksimum: 10 });
nulstil(); adr = av();
await adr.soeg("Odensevej 115", undefined, "soeg-husnumre", "5260");
eq("soeg: standardpostnummer bruges, når teksten ikke har et", [kald[0].body.postnummer, kald[0].body.handling], ["5260", "soeg-husnumre"]);
nulstil(); adr = av();
await adr.soeg("Odensevej 115 5000", undefined, "soeg-adresser", "5260");
eq("soeg: standardpostnummer slår IKKE et tastet postnummer", kald[0].body.postnummer, "5000");

nulstil(); adr = av();
handler = (n, b) => (b.maksimum > 50 ? { data: { status: "fejl" }, error: null } : ok([]));
await adr.soeg("Kløvervej", undefined, "soeg-husnumre", undefined, 100);
eq("maksimum: 100 afvises, 50 virker (prøver 100, så 50)", kald.map((k) => k.body.maksimum), [100, 50]);
nulstil();
await adr.soeg("Kløvervej", undefined, "soeg-husnumre", undefined, 100);
eq("maksimum: det bekræftede maksimum erindres - næste søgning starter direkte ved 50", kald.map((k) => k.body.maksimum), [50]);
nulstil(); adr = av();
handler = (n, b) => (b.maksimum > 10 ? { data: { status: "fejl" }, error: null } : ok([]));
const sMin = await adr.soeg("Kløvervej", undefined, "soeg-husnumre", undefined, 100);
eq("maksimum: kun 10 virker (100, 50, 10), og søgningen lykkes", [kald.map((k) => k.body.maksimum), sMin.ok], [[100, 50, 10], true]);
nulstil(); adr = av();
handler = () => ({ data: { status: "fejl", beskrivelse: "Ugyldig forespørgsel" }, error: null });
eq("soeg: en afvisning giver { ok:false, fejl } - og prøver ikke i det uendelige", [await adr.soeg("X", undefined, "soeg-adresser", undefined, 10), kald.length], [{ ok: false, fejl: "Ugyldig forespørgsel", fund: [] }, 1]);
handler = () => fejl;
eq("soeg: et mislykket kald giver { ok:false } med standardbesked", (await adr.soeg("Kløvervej", undefined, "soeg-adresser", undefined, 10)).fejl, "Kunne ikke søge lige nu.");

// --- koordinater
nulstil(); adr = av();
handler = () => ({ data: { status: "ok", husnummer: { adgangspunkt: { geometri: { coordinates: [500000, 6200000] } } } }, error: null });
const k1 = await adr.opslagKoordinater("h1", "husnummer");
eq("opslagKoordinater: husnummer bruger opslag-husnummer og omregner til lat/lon", [kald[0].body, tæt(k1.lon, 9, 1e-9)], [{ handling: "opslag-husnummer", ider: ["h1"] }, true]);
nulstil();
handler = () => ({ data: { status: "ok", adresser: [{ husnummer: { adgangspunkt: { geometri: { coordinates: [500000, 6200000] } } } }] }, error: null });
eq("opslagKoordinater: adresse bruger opslag-adresser og finder koordinaterne i listen", [(await adr.opslagKoordinater("a1", "adresse")) !== null, kald[0].body.handling], [true, "opslag-adresser"]);
handler = () => ({ data: { status: "ok", husnummer: {} }, error: null });
eq("opslagKoordinater: uden adgangspunkt giver null", await adr.opslagKoordinater("h1", "husnummer"), null);
handler = () => fejl;
eq("opslagKoordinater: mislykket kald giver null", await adr.opslagKoordinater("h1", "husnummer"), null);

// --- kommunekode i to trin
nulstil(); adr = av();
handler = (n, b) => (b.handling === "soeg-husnumre"
  ? ok([{ type: "vejnavn", id: "v1" }, { type: "husnummer", id: "h9", vejnavn: "Odensevej" }])
  : { data: { status: "ok", husnummer: { navngivenvejkommunedel: { kommune: "0461" } } }, error: null });
eq("findKommunekode: finder husnummer-id'et og læser den indlejrede kommunekode", [await adr.findKommunekode("Odensevej 115, Hjallese, 5260 Odense S"), kald.map((k) => k.body.handling), kald[1].body.ider], ["0461", ["soeg-husnumre", "opslag-husnummer"], ["h9"]]);
eq("findKommunekode: uden adresse intet kald", [await adr.findKommunekode(""), await adr.findKommunekode("   "), await adr.findKommunekode(null)], [null, null, null]);
nulstil(); handler = () => ok([]);
eq("findKommunekode: intet fundet giver null", await adr.findKommunekode("Findes ikke 99"), null);
handler = (n, b) => (b.handling === "soeg-husnumre" ? ok([{ type: "husnummer" }]) : ok());
eq("findKommunekode: fund uden id giver null", await adr.findKommunekode("Vej 1"), null);

// =====================================================================================================
// LAGER
// =====================================================================================================
eq("formatBytes", [formatBytes(null), formatBytes(undefined), formatBytes(500), formatBytes(1024), formatBytes(5242880), formatBytes(1536), formatBytes(3 * 1024 ** 4)], ["-", "-", "500 B", "1,0 KB", "5,0 MB", "1,5 KB", "3,0 TB"]);

// attrap til databasen: kæde-builder, der kan afvente
let dbSvar = { data: [], error: null };
const dbKald = [];
const bygger = (tabel) => {
  const q = { _tabel: tabel };
  for (const m of ["select", "eq", "order", "update"]) q[m] = (...a) => { dbKald.push([tabel, m, ...a]); return q; };
  q.maybeSingle = async () => dbSvar;
  q.then = (res, rej) => Promise.resolve(dbSvar).then(res, rej);
  return q;
};
const opladt = [];
let storageSvar = { error: null };
const lagerKlient = {
  from: bygger,
  storage: { from: (b) => ({ uploadToSignedUrl: async (...a) => { opladt.push([b, ...a]); return storageSvar; } }) },
};
let hentSvar = async () => ({ ok: true, status: 200 });
const hentKald = [];
const hent = async (url, opt) => { hentKald.push([url, opt]); return hentSvar(url, opt); };
const mk = () => opretLagerAdapter({ transport: t, klient: lagerKlient, log: advar, hent });
const fil = { name: "bevis.jpg", type: "image/jpeg" };

nulstil(); dbKald.length = 0; let lg = mk();
dbSvar = { data: [{ id: "a1" }, { id: "a2" }], error: null };
eq("hentVedhaeftninger: kun aktive, sorteret, og afgrænset til butikken når den gives", [(await lg.hentVedhaeftninger(77, "s1")).length, dbKald.filter((k) => k[1] === "eq").map((k) => k.slice(2)), dbKald.some((k) => k[1] === "order")], [2, [["order_id", "77"], ["status", "active"], ["store_id", "s1"]], true]);
dbKald.length = 0;
await lg.hentVedhaeftninger("77");
eq("hentVedhaeftninger: uden butik afgrænses der ikke ekstra (rækkesikkerheden klarer det)", dbKald.filter((k) => k[1] === "eq").length, 2);
eq("hentVedhaeftninger: uden sag intet kald", [await lg.hentVedhaeftninger(""), await lg.hentVedhaeftninger(null)], [[], []]);
dbSvar = { data: null, error: { message: "rls" } };
eq("hentVedhaeftninger: fejl giver [] og logges", [await lg.hentVedhaeftninger("77"), logget.length], [[], 1]);

nulstil();
handler = () => ({ data: { url: "https://signeret/x", navn: "bevis.jpg", mimeType: "image/jpeg" }, error: null });
eq("hentUrl: { ok:true, ...data }", await lg.hentUrl("a1"), { ok: true, url: "https://signeret/x", navn: "bevis.jpg", mimeType: "image/jpeg" });
eq("hentUrl: sender hent-url", kald[0], { navn: "sagsdokumentation", body: { handling: "hent-url", vedhaeftningId: "a1" } });
nulstil();
eq("hentUrls: tom liste giver ok uden kald", [await lg.hentUrls([]), await lg.hentUrls(null), kald.length], [{ ok: true, urls: {} }, { ok: true, urls: {} }, 0]);
handler = () => ({ data: { urls: { a1: { url: "u1" } } }, error: null });
eq("hentUrls: ét kald for alle", [(await lg.hentUrls(["a1", "a2"])).urls.a1.url, kald.length, kald[0].body], ["u1", 1, { handling: "hent-urls", vedhaeftningIder: ["a1", "a2"] }]);
handler = () => ({ data: { fejl: "Ingen adgang til filen" }, error: null });
eq("hentUrl: afvisning giver { ok:false, fejl }", await lg.hentUrl("a1"), { ok: false, fejl: "Ingen adgang til filen" });

// --- upload, Supabase-lager
const svarForHandling = (map) => (n, b) => map[b.handling]();
nulstil(); opladt.length = 0; hentKald.length = 0; lg = mk();
const trin = [];
handler = svarForHandling({
  "start-upload": () => ({ data: { vedhaeftningId: "v1", lagerNoegle: "s1/o/v1.jpg", token: "tok", pladsAdvarsel: "Næsten fuld" }, error: null }),
  "bekraeft-upload": () => ({ data: { bytes: 2048 }, error: null }),
});
const u1 = await lg.upload({ orderId: 5, file: fil, kind: "billede", onProgress: (p) => trin.push(p) });
eq("upload (Supabase-lager): resultat", u1, { ok: true, id: "v1", bytes: 2048, pladsAdvarsel: "Næsten fuld" });
eq("upload: faser i rækkefølge", trin, ["starter", "sender", "bekraefter"]);
eq("upload: start-upload sender sag, filnavn, mimetype og art", kald[0].body, { handling: "start-upload", sagId: "5", filnavn: "bevis.jpg", mimeType: "image/jpeg", kind: "billede" });
eq("upload: Supabase Storage får nøgle, token, fil og indholdstype - ikke en almindelig fetch", [opladt[0], hentKald.length], [["sagsdokumentation", "s1/o/v1.jpg", "tok", fil, { contentType: "image/jpeg" }], 0]);
eq("upload: bekraeft-upload med vedhæftningens id", kald[1].body, { handling: "bekraeft-upload", vedhaeftningId: "v1" });
nulstil();
eq("upload: uden sag eller fil intet kald", [await lg.upload({ orderId: "", file: fil }), await lg.upload({ orderId: 1, file: null }), kald.length], [{ ok: false, fejl: "Mangler sag eller fil" }, { ok: false, fejl: "Mangler sag eller fil" }, 0]);
handler = svarForHandling({ "start-upload": () => ({ data: { vedhaeftningId: "v2", lagerNoegle: "k", token: "t" }, error: null }), "bekraeft-upload": () => ({ data: {}, error: null }) });
eq("upload: uden art bruges 'billede', og uden pladsadvarsel er den null", [(await lg.upload({ orderId: 1, file: { name: "x" } })).pladsAdvarsel, kald[0].body.kind], [null, "billede"]);
nulstil(); opladt.length = 0;
handler = svarForHandling({ "start-upload": () => ({ data: { fejl: "Butikkens lager er fuldt" }, error: null }) });
eq("upload: start afvist -> ok:false, intet sendt og intet bekræftet", [await lg.upload({ orderId: 1, file: fil }), opladt.length, kald.length], [{ ok: false, fejl: "Butikkens lager er fuldt" }, 0, 1]);
nulstil(); storageSvar = { error: { message: "Signaturen er udløbet" } };
handler = svarForHandling({ "start-upload": () => ({ data: { vedhaeftningId: "v3", lagerNoegle: "k", token: "t" }, error: null }) });
eq("upload: selve overførslen fejler -> ok:false, logges, og der bekræftes IKKE (sagen peger aldrig på en manglende fil)", [await lg.upload({ orderId: 1, file: fil }), logget.length, kald.some((k) => k.body.handling === "bekraeft-upload")], [{ ok: false, fejl: "Signaturen er udløbet" }, 1, false]);
storageSvar = { error: null }; nulstil();
handler = svarForHandling({ "start-upload": () => ({ data: { vedhaeftningId: "v4", lagerNoegle: "k", token: "t" }, error: null }), "bekraeft-upload": () => ({ data: { fejl: "Filen kom ikke frem" }, error: null }) });
eq("upload: bekræftelsen fejler -> ok:false med serverens besked", await lg.upload({ orderId: 1, file: fil }), { ok: false, fejl: "Filen kom ikke frem" });

// --- upload, eget lager (almindelig PUT)
nulstil(); opladt.length = 0; hentKald.length = 0; hentSvar = async () => ({ ok: true, status: 200 });
handler = svarForHandling({ "start-upload": () => ({ data: { vedhaeftningId: "v5", egetLager: true, uploadUrl: "https://nas.example/s1/v5?X-Amz-Signature=abc" }, error: null }), "bekraeft-upload": () => ({ data: { bytes: 99 }, error: null }) });
const u5 = await lg.upload({ orderId: 1, file: fil });
eq("upload (eget lager): ok, og en almindelig PUT med indholdstype - Supabase Storage røres ikke", [u5, hentKald[0][0], hentKald[0][1].method, hentKald[0][1].headers, hentKald[0][1].body === fil, opladt.length], [{ ok: true, id: "v5", bytes: 99, pladsAdvarsel: null }, "https://nas.example/s1/v5?X-Amz-Signature=abc", "PUT", { "Content-Type": "image/jpeg" }, true, 0]);
nulstil(); hentKald.length = 0;
await lg.upload({ orderId: 1, file: { name: "x.bin", type: "" } });
eq("upload (eget lager): uden mimetype bruges application/octet-stream", hentKald[0][1].headers["Content-Type"], "application/octet-stream");
nulstil(); hentSvar = async () => ({ ok: false, status: 403 });
eq("upload (eget lager): lageret afviser -> besked med status, og der bekræftes ikke", [await lg.upload({ orderId: 1, file: fil }), kald.some((k) => k.body.handling === "bekraeft-upload"), logget.length], [{ ok: false, fejl: "Lageret svarede med status 403" }, false, 1]);
nulstil(); hentSvar = async () => { throw new Error("Failed to fetch"); };
eq("upload (eget lager): netværksfejl -> ok:false med fejlen, intet oprydningskald og ingen bekræftelse", [await lg.upload({ orderId: 1, file: fil }), kald.map((k) => k.body.handling)], [{ ok: false, fejl: "Failed to fetch" }, ["start-upload"]]);
hentSvar = async () => ({ ok: true, status: 200 });

// --- sletning og forbrug
nulstil(); dbKald.length = 0; dbSvar = { data: null, error: null };
eq("markerTilSletning: sætter status deleting og rører ikke rækken ellers", [await lg.markerTilSletning("a1"), dbKald.find((k) => k[1] === "update")[2], dbKald.some((k) => k[1] === "eq" && k[2] === "id" && k[3] === "a1")], [{ ok: true }, { status: "deleting" }, true]);
dbSvar = { data: null, error: { message: "ingen ret" } };
eq("markerTilSletning: fejl giver { ok:false, fejl } og logges", [await lg.markerTilSletning("a1"), logget.length], [{ ok: false, fejl: "ingen ret" }, 1]);
dbKald.length = 0; dbSvar = { data: [{ store_id: "s1", brugt_bytes: 10, kvote_bytes: null }], error: null };
eq("hentForbrug: kvote null bevares (eget lager har ingen 'ledig plads')", [(await lg.hentForbrug("s1"))[0].kvote_bytes, dbKald.some((k) => k[1] === "eq" && k[2] === "store_id")], [null, true]);
dbKald.length = 0; await lg.hentForbrug();
eq("hentForbrug: uden butik hentes alle (systemadmin)", dbKald.some((k) => k[1] === "eq"), false);
dbSvar = { data: null, error: { message: "x" } };
eq("hentForbrug: fejl giver []", await lg.hentForbrug("s1"), []);

// --- opsætning af eget lager
nulstil(); dbSvar = { data: null, error: null };
eq("opsætning: intet gemt giver en tom, slået-fra opsætning med standardregion", [(await lg.hentOpsaetning("s1")).aktiveret, (await lg.hentOpsaetning("s1")).region, (await lg.hentOpsaetning("s1")).pathStyle], [false, "us-east-1", true]);
dbSvar = { data: { provider: "s3_compatible", endpoint_url: "https://nas", bucket: "b", region: null, path_style: false, access_key_id: "AK", secret_access_key_secret_id: "sec", last_test_ok: true }, error: null };
eq("opsætning: oversættes, og den hemmelige nøgle røbes aldrig - kun at den findes", await lg.hentOpsaetning("s1"), { aktiveret: true, endpointUrl: "https://nas", bucket: "b", region: "us-east-1", pathStyle: false, accessKeyId: "AK", harHemmeligNoegle: true, sidstTestet: undefined, sidstTestetOk: true, sidstTestetNote: "" });
eq("opsætning: uden butik intet opslag", await lg.hentOpsaetning(""), null);
dbSvar = { data: [{ store_id: "s1", provider: "supabase", bucket: null, secret_access_key_secret_id: null }], error: null };
eq("opsætning: overblik over alle butikker", await lg.hentAlleOpsaetninger(), [{ butikId: "s1", aktiveret: false, bucket: "", harHemmeligNoegle: false, sidstTestet: undefined, sidstTestetOk: undefined, sidstTestetNote: "" }]);
nulstil(); handler = () => ({ data: { ok: true }, error: null });
await lg.gemNoegle({ storeId: "s1", provider: "s3_compatible", endpointUrl: "u", bucket: "b", region: "r", pathStyle: true, accessKeyId: "AK", secretAccessKey: "hemmelig" });
eq("opsætning: gem sender action set-key til storage-integration", [kald[0].navn, kald[0].body.action, kald[0].body.secretAccessKey], ["storage-integration", "set-key", "hemmelig"]);
nulstil(); await lg.test("s1");
eq("opsætning: test sender action test", [kald[0].navn, kald[0].body], ["storage-integration", { action: "test", storeId: "s1" }]);
handler = () => ({ data: { fejl: "Forbindelsen blev afvist" }, error: null });
eq("opsætning: test afvist giver { ok:false, fejl }", await lg.test("s1"), { ok: false, fejl: "Forbindelsen blev afvist" });

console.log(`\n${pass} bestået, ${fail} fejlet`);
process.exit(fail ? 1 : 0);
