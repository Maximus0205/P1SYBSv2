// Tynd klient til openrouteservice.org (ORS): geokodning af adresser og
// beregning af reelle køreafstande mellem dem.
//
// Bruges til at foreslå bookingtider tæt på allerede planlagte sager, så vi
// undgår at sende to biler ind i samme område på forskellige dage.
//
// ORS er gratis op til 2.500 kald/dag / 40.000/md, kræver ingen kreditkort,
// og er bygget på OpenStreetMap-data (god dækning i Danmark). Se
// https://openrouteservice.org/dev/#/signup for en gratis nøgle.
//
// OPSÆTNING:
//   1. Opret en gratis konto/nøgle på openrouteservice.org
//   2. Lav en fil ".env" i projektets rod (samme sted som package.json) med:
//        VITE_ORS_API_KEY=din-nøgle-her
//   3. Genstart "npm run dev"
// ".env" ligger allerede i .gitignore, så nøglen havner ikke i git.
//
// Hvis nøglen mangler, fejler funktionerne nedenfor stille (returnerer null/
// tomt array) i stedet for at kaste fejl — resten af appen skal virke fint
// uden denne funktion, den er et "nice to have"-lag ovenpå.
//
// NB: Tjek altid ORS' egen dokumentation (https://openrouteservice.org/dev/#/api-docs)
// hvis kaldene begynder at fejle — auth-header/format for et gratis, community-drevet
// API kan ændre sig over tid.

const ORS_BASE = "https://api.openrouteservice.org";
const ORS_KEY = import.meta.env.VITE_ORS_API_KEY;

export const harOrsNoegle = () => Boolean(ORS_KEY);

// In-memory cache: adressetekst -> koordinater (eller null hvis ikke fundet).
// Holder kun i den enkelte browser-session, men det er nok til at undgå at
// geokode de samme adresser igen og igen, mens man arbejder i appen.
const geokodeCache = new Map();

const normaliser = (adr) => (adr || "").trim().toLowerCase();

// Slår én adresse op og returnerer { lon, lat } eller null (ikke fundet,
// nøgle mangler, eller kaldet fejlede).
export async function geokodAdresse(adresse) {
  const noegle = normaliser(adresse);
  if (!noegle || noegle.length < 5) return null;
  if (!ORS_KEY) return null;
  if (geokodeCache.has(noegle)) return geokodeCache.get(noegle);

  try {
    const url = `${ORS_BASE}/geocode/search?api_key=${encodeURIComponent(ORS_KEY)}&text=${encodeURIComponent(adresse)}&boundary.country=DK&size=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Geokodning fejlede (${res.status})`);
    const data = await res.json();
    const koordinater = data?.features?.[0]?.geometry?.coordinates; // [lon, lat]
    const resultat = koordinater ? { lon: koordinater[0], lat: koordinater[1] } : null;
    geokodeCache.set(noegle, resultat);
    return resultat;
  } catch (e) {
    // Cacher ikke fejl (kan skyldes midlertidigt netværksproblem) — prøv igen næste gang.
    return null;
  }
}

// Geokoder en liste af adresser (dedupliceret) og returnerer et Map fra
// normaliseret adressetekst -> koordinater. Adresser der ikke kunne findes,
// er ikke med i resultatet.
export async function geokodAdresser(adresser) {
  const unikke = [...new Set((adresser || []).map(normaliser).filter((a) => a.length >= 5))];
  const par = await Promise.all(unikke.map(async (a) => [a, await geokodAdresse(a)]));
  const map = new Map();
  par.forEach(([a, koord]) => { if (koord) map.set(a, koord); });
  return map;
}

// Beregner køreafstand (i meter) fra ét udgangspunkt til flere destinationer
// via ORS' Matrix-API. destinationer er en liste af { lon, lat }.
// Returnerer et array af afstande i samme rækkefølge som destinationer
// (eller null pr. destination hvis den enkelte afstand ikke kunne beregnes).
export async function koereafstande(kilde, destinationer) {
  if (!ORS_KEY || !kilde || !destinationer || destinationer.length === 0) return [];
  try {
    const locations = [[kilde.lon, kilde.lat], ...destinationer.map((d) => [d.lon, d.lat])];
    const res = await fetch(`${ORS_BASE}/v2/matrix/driving-car`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: ORS_KEY },
      body: JSON.stringify({
        locations,
        sources: [0],
        destinations: locations.map((_, i) => i).filter((i) => i !== 0),
        metrics: ["distance"],
      }),
    });
    if (!res.ok) throw new Error(`Afstandsberegning fejlede (${res.status})`);
    const data = await res.json();
    return data?.distances?.[0] || [];
  } catch (e) {
    return [];
  }
}
