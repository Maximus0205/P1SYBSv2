// KØRSELSOMRÅDE OG FORRANG (kapacitetsmotoren, oktober 2026). Ren logik uden afhængigheder.
//
// En bil kan være "fast Jylland" (bil.omraade === "jylland"). Det UDELUKKER ikke noget: bilen kan stadig tage sager på Fyn og på vejen til og
// fra Jylland, og de andre biler må stadig tage sager i Jylland. Den faste Jylland-bil har kun FORRANG, når en sag ligger i Jylland: kan både den og en
// anden bil tage sagen samme dag (og er vurderingen lige god, ok mod advarsel), vælges Jylland-bilen.
//
// Områderne opretter butikkens admin selv (Admin -> Biler): et navn og de postnumre, området dækker (fx "6000-8304, 5000"). Bilen peger på et område med
// bil.omraade = områdets id. Det gamle faste valg "jylland" virker stadig som et indbygget område, hvis admin ikke har oprettet et med det id.
// Hvilket område en sag ligger i, afgøres ud fra postnummeret i adressen. Ingen postnummer i adressen = ingen forrang (der gættes aldrig).

export const OMRAADE_JYLLAND = "jylland";

// Sidste firecifrede tal i adressen, der efterfølges af et bynavn ("Vej 12, 8000 Aarhus C"). Et husnummer på fire cifre efterfølges ikke af et bynavn.
export function postnrFraAdresse(adresse) {
  const tekst = String(adresse ?? "");
  let sidste = null;
  for (const m of tekst.matchAll(/(?:^|[,\s])(\d{4})\s+[A-Za-zÆØÅæøåÉé]/g)) sidste = m[1];
  return sidste;
}

const OER_UDEN_BRO = new Set(["8305", "8592", "9940", "9941"]); // Samsø, Anholt, Læsø

export function erJyllandPostnr(postnr) {
  const p = String(postnr ?? "").trim();
  if (!/^\d{4}$/.test(p)) return false;
  const n = Number(p);
  return n >= 6000 && n <= 9999 && !OER_UDEN_BRO.has(p);
}

export const erJyllandAdresse = (adresse) => erJyllandPostnr(postnrFraAdresse(adresse));

// Postnumre som tekst: "6000-8304, 5000" -> [[6000,8304],[5000,5000]]. Ugyldige dele springes over.
export function parsPostnumre(spec) {
  const ud = [];
  for (const del of String(spec ?? "").split(/[,;\s]+/)) {
    const m = /^(\d{4})(?:-(\d{4}))?$/.exec(del.trim());
    if (!m) continue;
    const fra = Number(m[1]); const til = m[2] ? Number(m[2]) : fra;
    if (fra >= 1000 && til >= fra && til <= 9999) ud.push([fra, til]);
  }
  return ud;
}

// Renset tekst til lagring (kun gyldige dele, højst 300 tegn).
export const renPostnumre = (spec) => parsPostnumre(spec).map(([a, b]) => (a === b ? String(a) : `${a}-${b}`)).join(", ").slice(0, 300);

export const postnrIOmraade = (postnr, spec) => {
  const p = String(postnr ?? "").trim();
  if (!/^\d{4}$/.test(p)) return false;
  const n = Number(p);
  return parsPostnumre(spec).some(([a, b]) => n >= a && n <= b);
};

// Jylland uden øerne uden fast forbindelse (Samsø 8305, Anholt 8592, Læsø 9940-9941).
export const JYLLAND_POSTNUMRE = "6000-8304, 8306-8591, 8593-9939, 9942-9999";

export const erFastJylland = (bil) => bil?.omraade === OMRAADE_JYLLAND;

// Bilens faste område ({ id, navn, postnumre }) ud fra butikkens oprettede områder, eller null. "jylland" er indbygget, hvis det ikke er oprettet.
export function omraadeForBil(bil, omraader) {
  const id = typeof bil?.omraade === "string" ? bil.omraade : "";
  if (!id) return null;
  const fundet = (Array.isArray(omraader) ? omraader : []).find((o) => o?.id === id);
  if (fundet) return fundet;
  return id === OMRAADE_JYLLAND ? { id, navn: "Jylland", postnumre: JYLLAND_POSTNUMRE } : null;
}

// Har denne bil forrang på denne sag? (Bilen har et fast område, og sagens postnummer ligger i det.)
export function harForrang(bil, adresse, omraader) {
  const o = omraadeForBil(bil, omraader);
  return !!o && postnrIOmraade(postnrFraAdresse(adresse), o.postnumre);
}
export const harJyllandForrang = harForrang; // gammelt navn, bevaret for kald der endnu bruger det
