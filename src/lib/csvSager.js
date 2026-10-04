// CSV-IMPORT AF SAGER: kolonnenavne, skabelon og hjælpere (oktober 2026).
// Ren logik uden afhængigheder, så den kan testes i Node (tests/csvSager.test.mjs).
//
// Importen (components/CsvImport.jsx) genkender kolonner ud fra ALIAS herunder -
// store/små bogstaver er ligegyldigt, og æ/ø/å må stå som ae/oe/aa. SKABELONEN
// bygges ud fra de samme kolonner, og testen sikrer, at hver kolonne i skabelonen
// faktisk genkendes af importen. Så skabelon og import kan ikke glide fra hinanden.

export const norm = (s) => (s ?? "").toString().trim().toLowerCase();

export const ALIAS = {
  sagsnr: ["sagsnr", "nr", "sag", "sagsnummer"],
  kunde: ["kunde", "kundenavn"],
  telefon: ["telefon", "tlf"],
  email: ["email", "e-mail"],
  adresse: ["adresse"],
  leveringsnote: ["leveringsnote", "note"],
  koeber: ["køber", "koeber", "buyer"],
  koeberTelefon: ["købertelefon", "koebertelefon"],
  koeberMail: ["købermail", "koebermail"],
  koeberAdresse: ["køberadresse", "koeberadresse"],
  noegle: ["nøgle", "noegle"],
  noegleType: ["nøgletype", "noegletype"],
  noegleDetaljer: ["nøgledetaljer", "noegledetaljer"],
  noeglePlacering: ["nøgleplacering", "noegleplacering"],
  dato: ["dato", "date"],
  tidsrum: ["tidsrum", "tid", "periode"],
  bil: ["montor", "montør", "bil", "installatoer"],
  varetype: ["varetype", "produkttype", "vare"],
  ydelser: ["ydelser", "opgaver", "opmærksomhedspunkter"],
};

// Kolonnerne i skabelonen, i den rækkefølge de står i filen. "Montør" hedder det,
// selvom det reelt er en BIL (se noten i CsvImport.jsx) - de fleste regneark bruger
// allerede det ord.
export const SKABELON_KOLONNER = [
  ["Sagsnr", "sagsnr"], ["Kunde", "kunde"], ["Telefon", "telefon"], ["Email", "email"], ["Adresse", "adresse"],
  ["Leveringsnote", "leveringsnote"], ["Køber", "koeber"], ["Nøgle", "noegle"], ["Nøgletype", "noegleType"],
  ["Nøgleplacering", "noeglePlacering"], ["Dato", "dato"], ["Tidsrum", "tidsrum"], ["Montør", "bil"],
  ["Varetype", "varetype"], ["Ydelser", "ydelser"],
];
export const TIDSRUM_VAERDIER = ["Formiddag", "Eftermiddag", "Heldag"];

// Første værdi i en række, hvis kolonnenavn er et af aliasserne.
export function pick(row, aliaser) {
  for (const k of Object.keys(row)) if (aliaser.includes(norm(k))) return (row[k] ?? "").toString().trim();
  return "";
}

// Finder bilen ud fra navn eller nummerplade. En TOM celle matcher aldrig en bil -
// ellers ville "".includes("") give den første bil til alle rækker uden "Montør".
export function matchBil(biler, raaNavn) {
  const n = norm(raaNavn);
  if (!n) return null;
  return biler.find((m) => norm(m.navn) === n || norm(m.bil).includes(n)) || null;
}

// Eksempelrækken i skabelonen står som "EKSEMPEL (slet rækken)" i Kunde-kolonnen.
// Glemmer man at slette den, springer importen den over i stedet for at oprette en
// falsk sag.
export const EKSEMPEL_KUNDE = "EKSEMPEL (slet rækken)";
export const erEksempelraekke = (kundeNavn) => /^eksempel\s*\(slet/i.test(String(kundeNavn ?? "").trim());

export const danskDato = (d) => `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;

export function naesteHverdag(fra = new Date()) {
  const d = new Date(fra.getFullYear(), fra.getMonth(), fra.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

// En celle i semikolon-CSV: sættes i citationstegn, hvis den indeholder skilletegn,
// citationstegn eller linjeskift (eller starter/slutter med mellemrum).
export function csvCelle(v) {
  const s = String(v ?? "");
  return /[;"\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

// Skabelonen som tekst: UTF-8 med BOM og SEMIKOLON som skilletegn - det er det,
// dansk Excel forventer (med komma ender alt i én kolonne). Importen finder selv
// skilletegnet, så filen kan også gemmes tilbage fra Excel som CSV.
export function skabelonCsv({ varetyper = [], biler = [], nu = new Date() } = {}) {
  const eksempel = {
    sagsnr: "", kunde: EKSEMPEL_KUNDE, telefon: "12345678", email: "kunde@eksempel.dk", adresse: "Eksempelvej 1, 5000 Odense C",
    leveringsnote: "Ring før ankomst", koeber: "", noegle: "Nej", noegleType: "", noeglePlacering: "",
    dato: danskDato(naesteHverdag(nu)), tidsrum: TIDSRUM_VAERDIER[0], bil: biler[0] || "", varetype: varetyper[0] || "", ydelser: "",
  };
  const linjer = [
    SKABELON_KOLONNER.map(([navn]) => csvCelle(navn)).join(";"),
    SKABELON_KOLONNER.map(([, nøgle]) => csvCelle(eksempel[nøgle])).join(";"),
  ];
  return "\uFEFF" + linjer.join("\r\n") + "\r\n";
}
