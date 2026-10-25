// ROLLER SOM DATA (oktober 2026).
//
// Rollerne ligger i databasen (tabellen roles) og vedligeholdes af systemadministratoren i System-siden -
// ingen kodeændring kræves for at oprette eller rette en rolle. En rolle er FÆLLES for alle butikker, men
// den enkelte butik TILVÆLGER de roller, den vil bruge (tabellen store_roles). De fem indbyggede roller er
// altid tilgængelige.
//
// En rolles ADFÆRD (kolonnen adfaerd) styrer det, koden før afgjorde ud fra rollens navn:
//   'standard'    = en almindelig rolle (adgang kommer udelukkende fra rollens rettigheder)
//   'montor'      = kører selv og kan have en fast bil
//   'medhjaelper' = kører med som 2. mand uden fast bil (bilen sættes pr. dag i Planlægning)
//
// Modulet holder den senest indlæste rolleliste, så rene funktioner (fx dagsplan) kan slå adfærd op uden at få
// listen sendt med. Indtil databasen har svaret, bruges de indbyggede roller - så intet ændrer sig, hvis
// indlæsningen fejler.

export const INDBYGGEDE_ROLLER = [
  { key: "admin", label: "Administrator", beskrivelse: "Fuld adgang til butikkens indstillinger og brugere", adfaerd: "standard", indbygget: true, sortering: 10 },
  { key: "saelger", label: "Sælger", beskrivelse: "Sælger og booker sager", adfaerd: "standard", indbygget: true, sortering: 20 },
  { key: "montor", label: "Montør", beskrivelse: "Kører selv ud og har sin egen bil", adfaerd: "montor", indbygget: true, sortering: 30 },
  { key: "medhjaelper", label: "Medhjælper", beskrivelse: "Hjælper montører uden fast bil", adfaerd: "medhjaelper", indbygget: true, sortering: 40 },
  { key: "lager", label: "Lager", beskrivelse: "Plukker og pakker varer", adfaerd: "standard", indbygget: true, sortering: 50 },
];

export const ADFAERD_VALG = [
  { id: "standard", label: "Almindelig", hjaelp: "Adgangen kommer kun fra rollens rettigheder." },
  { id: "montor", label: "Kører selv (som montør)", hjaelp: "Kan tildeles sager og en fast bil." },
  { id: "medhjaelper", label: "Medhjælper (2. mand)", hjaelp: "Kører med en montør, uden fast bil." },
];

let aktuelle = INDBYGGEDE_ROLLER;

export function normaliserRoller(raekker) {
  if (!Array.isArray(raekker) || raekker.length === 0) return INDBYGGEDE_ROLLER;
  return raekker
    .filter((r) => r && typeof r.key === "string")
    .map((r) => ({
      key: r.key,
      label: r.label || r.key,
      beskrivelse: r.beskrivelse || "",
      adfaerd: ["montor", "medhjaelper"].includes(r.adfaerd) ? r.adfaerd : "standard",
      indbygget: !!r.indbygget,
      sortering: Number.isFinite(r.sortering) ? r.sortering : 100,
    }))
    .sort((a, b) => a.sortering - b.sortering || a.label.localeCompare(b.label, "da"));
}

export function saetRoller(raekker) { aktuelle = normaliserRoller(raekker); }
export const alleRoller = () => aktuelle;
export const findRolle = (key) => aktuelle.find((r) => r.key === key) || INDBYGGEDE_ROLLER.find((r) => r.key === key) || null;
export const rolleLabel = (key) => findRolle(key)?.label || key || "";
export const rolleAdfaerd = (key) => findRolle(key)?.adfaerd || "standard";
export const erMontorRolle = (key) => rolleAdfaerd(key) === "montor";
export const erMedhjaelperRolle = (key) => rolleAdfaerd(key) === "medhjaelper";

// Roller en butik kan give sine brugere: de indbyggede + de tilvalgte. En brugers nuværende rolle tages altid med,
// så en rolle, der senere er fravalgt, ikke forsvinder fra vedkommendes række.
export function rollerForButik(tilvalgteKeys, nuvaerendeKey = null) {
  const tilvalgt = new Set(tilvalgteKeys || []);
  return aktuelle.filter((r) => r.indbygget || tilvalgt.has(r.key) || r.key === nuvaerendeKey);
}

// Standard-widgets på forsiden for en rolle, indtil brugeren selv tilpasser den. Indbyggede roller har faste lister
// (defaults); andre roller får de widgets, deres rettigheder giver adgang til (katalog), i en fast rækkefølge.
const WIDGET_RAEKKEFOELGE = ["quick_booking", "needs_action", "today_route", "pick_list", "upcoming_today", "notifications"];
export function standardWidgets(rolle, rettigheder, defaults, katalog) {
  if (defaults?.[rolle]) return defaults[rolle];
  const adfaerd = rolleAdfaerd(rolle);
  if (adfaerd === "montor" || adfaerd === "medhjaelper") return defaults?.[adfaerd] || ["today_route", "notifications"];
  const har = new Set(rettigheder || []);
  const synlige = (katalog || []).filter((w) => w.requires === null || har.has(w.requires)).map((w) => w.key);
  return WIDGET_RAEKKEFOELGE.filter((k) => synlige.includes(k));
}

// Teknisk nøgle ud fra et rollenavn ("Tømrer-svend" -> "toemrer_svend"). Nøglen kan ikke rettes bagefter (brugere og rettigheder peger på den).
export function lavRolleNoegle(label) {
  const base = String(label || "").toLowerCase()
    .replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const medBogstav = /^[a-z]/.test(base) ? base : (base ? `r_${base}` : "");
  return medBogstav.slice(0, 30).replace(/_+$/g, "");
}
