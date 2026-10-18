// KØRSELSOMRÅDE OG FORRANG (kapacitetsmotoren, oktober 2026). Ren logik uden afhængigheder.
//
// En bil kan være "fast Jylland" (bil.omraade === "jylland"). Det UDELUKKER ikke noget: bilen kan stadig tage sager på Fyn og på vejen til og
// fra Jylland, og de andre biler må stadig tage sager i Jylland. Den faste Jylland-bil har kun FORRANG, når en sag ligger i Jylland: kan både den og en
// anden bil tage sagen samme dag (og er vurderingen lige god, ok mod advarsel), vælges Jylland-bilen.
//
// Jylland afgøres ud fra postnummeret i adressen (6000-9999; Fyn er 5xxx, Sjælland 1000-4999). Øer uden fast forbindelse (Samsø, Anholt, Læsø) regnes ikke
// med. Ingen postnummer i adressen = ingen forrang (der gættes aldrig).

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

export const erFastJylland = (bil) => bil?.omraade === OMRAADE_JYLLAND;

// Har denne bil forrang på denne sag? (Jylland-bil + Jylland-adresse.)
export const harJyllandForrang = (bil, adresse) => erFastJylland(bil) && erJyllandAdresse(adresse);
