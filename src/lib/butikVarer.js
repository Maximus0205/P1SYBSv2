// Butikkens egen varedatabase (tabellen store_products): rene hjælpefunktioner til opslag og import.
// Ingen netværk og ingen React her, så det kan testes direkte (tests/butikVarer.test.mjs).
//
// Databasen er KURATERET: kun admin opretter varer. Den lærer bevidst ikke af bookinger, for så ville en tastefejl
// ende på listen som en "rigtig" model og låse fejlen fast. Opslaget BLOKERER heller aldrig en booking: findes modellen
// hverken på punkt1.dk eller her, kan den stadig bookes - sælgeren får bare en påmindelse om at tjekke stavningen.

export const MAKS_FELTLAENGDE = 80;

// Samme regel som databasens model_norm: store bogstaver, kun A-Z og 0-9. "km 3105-1" og "KM3105/1" er samme model.
export const normaliserModel = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// Ét præcist match på det tastede modelnummer, ellers null.
export function findButikVare(varer, term) {
  const n = normaliserModel(term);
  if (n.length < 3) return null;
  return (varer || []).find((v) => normaliserModel(v.model) === n) || null;
}

// Redigeringsafstand hvor ombytning af to nabotegn tæller som ÉN fejl (en almindelig tastefejl).
export function afstand(a, b) {
  const la = a.length, lb = b.length;
  if (!la) return lb;
  if (!lb) return la;
  const d = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) d[i][0] = i;
  for (let j = 0; j <= lb; j++) d[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const pris = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + pris);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[la][lb];
}

// Modeller der LIGNER det tastede, men ikke er det: enten starter de med det (sælgeren er ved at skrive),
// eller de er højst 1 tastefejl væk (2 ved lange modelnumre). Et præcist match er ikke et forslag. Bedst først.
export function lignendeButikVarer(varer, term, max = 3) {
  const n = normaliserModel(term);
  if (n.length < 3) return [];
  const tilladt = n.length >= 8 ? 2 : 1;
  const fundet = [];
  for (const v of varer || []) {
    const vn = normaliserModel(v.model);
    if (!vn || vn === n) continue;
    const prefix = vn.startsWith(n);
    const d = afstand(n, vn);
    if (prefix || d <= tilladt) fundet.push({ vare: v, prefix, d });
  }
  fundet.sort((x, y) => (x.d - y.d) || (Number(y.prefix) - Number(x.prefix)) || x.vare.model.localeCompare(y.vare.model, "da"));
  return fundet.slice(0, max).map((f) => f.vare);
}

const MAERKE_NAVNE = ["maerke", "mærke", "brand", "producent", "fabrikat"];
const MODEL_NAVNE = ["model", "modelnummer", "modelnr", "varenummer", "type"];
const celle = (s) => String(s ?? "").trim();

// Rækker fra en CSV (liste af lister, fx fra PapaParse) -> godkendte varer + afviste rækker.
// Første række tages som overskrift, hvis den indeholder et kendt kolonnenavn (mærke/brand, model/modelnummer);
// ellers er kolonne 1 mærke og kolonne 2 modelnummer. Dubletter (samme model) beholdes kun første gang.
export function raekkerTilVarer(raekker) {
  const rene = (raekker || []).filter((r) => Array.isArray(r) && r.some((c) => celle(c) !== ""));
  const resultat = { varer: [], afvist: [], dubletter: 0 };
  if (rene.length === 0) return resultat;

  let maerkeKol = 0, modelKol = 1, start = 0;
  const overskrift = rene[0].map((c) => celle(c).toLowerCase());
  const m = overskrift.findIndex((c) => MAERKE_NAVNE.includes(c));
  const mo = overskrift.findIndex((c) => MODEL_NAVNE.includes(c));
  if (m >= 0 || mo >= 0) {
    if (m < 0 || mo < 0) { resultat.afvist.push({ linje: 1, aarsag: "Overskriften skal have både en mærke- og en modelkolonne" }); return resultat; }
    maerkeKol = m; modelKol = mo; start = 1;
  }

  const set = new Set();
  rene.slice(start).forEach((r, i) => {
    const linje = i + start + 1;
    const brand = celle(r[maerkeKol]);
    const model = celle(r[modelKol]);
    if (!brand || !model) { resultat.afvist.push({ linje, aarsag: "Mærke eller model mangler" }); return; }
    if (brand.length > MAKS_FELTLAENGDE || model.length > MAKS_FELTLAENGDE) { resultat.afvist.push({ linje, aarsag: `Mærke og model må højst være ${MAKS_FELTLAENGDE} tegn` }); return; }
    const n = normaliserModel(model);
    if (n.length < 3) { resultat.afvist.push({ linje, aarsag: "Modelnummeret er for kort (mindst 3 bogstaver/tal)" }); return; }
    if (set.has(n)) { resultat.dubletter++; return; }
    set.add(n);
    resultat.varer.push({ brand, model });
  });
  return resultat;
}

// Validering ved oprettelse/redigering af ÉN vare i admin. Returnerer en fejltekst eller null.
export function vareFejl({ brand, model }) {
  const b = celle(brand), mo = celle(model);
  if (!b) return "Skriv mærket";
  if (!mo) return "Skriv modelnummeret";
  if (b.length > MAKS_FELTLAENGDE || mo.length > MAKS_FELTLAENGDE) return `Mærke og model må højst være ${MAKS_FELTLAENGDE} tegn`;
  if (normaliserModel(mo).length < 3) return "Modelnummeret er for kort (mindst 3 bogstaver/tal)";
  return null;
}
