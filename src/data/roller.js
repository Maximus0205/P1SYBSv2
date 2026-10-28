// ROLLER SOM DATA (oktober 2026).
//
// ALLE roller ligger i databasen (tabellen roles) og vedligeholdes af systemadministratoren i System-siden -
// ingen kodeændring kræves for at oprette, rette eller slette en rolle, og ingen rolle er særlig. En rolle er FÆLLES
// for alle butikker, men hver butik TILVÆLGER de roller, den vil bruge (tabellen store_roles). Rollens rettigheder
// ligger i role_default_permissions.
//
// En rolles ADFÆRD (kolonnen adfaerd) styrer det, koden før afgjorde ud fra rollens navn:
//   'standard'    = en almindelig rolle (adgang kommer udelukkende fra rollens rettigheder)
//   'montor'      = kører selv og kan have en fast bil
//   'medhjaelper' = kører med som 2. mand uden fast bil (bilen sættes pr. dag i Planlægning)
//
// Modulet holder den senest indlæste rolleliste, så rene funktioner (fx dagsplan) kan slå adfærd op uden at få
// listen sendt med. NØDLISTEN (FALLBACK_ROLLER) bruges kun, hvis databasen ikke kunne svare, så appen stadig kan vise
// rollenavne og kende montør/medhjælper. Den er ikke et sted at rette roller.

export const FALLBACK_ROLLER = [
  { key: "admin", label: "Administrator", beskrivelse: "", adfaerd: "standard", sortering: 10, nyButikStandard: true, forside: null },
  { key: "saelger", label: "Sælger", beskrivelse: "", adfaerd: "standard", sortering: 20, nyButikStandard: true, forside: null },
  { key: "montor", label: "Montør", beskrivelse: "", adfaerd: "montor", sortering: 30, nyButikStandard: true, forside: null },
  { key: "medhjaelper", label: "Medhjælper", beskrivelse: "", adfaerd: "medhjaelper", sortering: 40, nyButikStandard: true, forside: null },
  { key: "lager", label: "Lager", beskrivelse: "", adfaerd: "standard", sortering: 50, nyButikStandard: true, forside: null },
];

export const ADFAERD_VALG = [
  { id: "standard", label: "Almindelig", hjaelp: "Adgangen kommer kun fra rollens rettigheder." },
  { id: "montor", label: "Kører selv (som montør)", hjaelp: "Kan tildeles sager og en fast bil." },
  { id: "medhjaelper", label: "Medhjælper (2. mand)", hjaelp: "Kører med en montør, uden fast bil." },
];

let aktuelle = FALLBACK_ROLLER;

export function normaliserRoller(raekker) {
  if (!Array.isArray(raekker) || raekker.length === 0) return FALLBACK_ROLLER;
  return raekker
    .filter((r) => r && typeof r.key === "string")
    .map((r) => ({
      key: r.key,
      label: r.label || r.key,
      beskrivelse: r.beskrivelse || "",
      adfaerd: ["montor", "medhjaelper"].includes(r.adfaerd) ? r.adfaerd : "standard",
      sortering: Number.isFinite(r.sortering) ? r.sortering : 100,
      nyButikStandard: r.ny_butik_standard ?? r.nyButikStandard ?? false,
      forside: Array.isArray(r.forside_widgets ?? r.forside) ? (r.forside_widgets ?? r.forside) : null,
    }))
    .sort((a, b) => a.sortering - b.sortering || a.label.localeCompare(b.label, "da"));
}

export function saetRoller(raekker) { aktuelle = normaliserRoller(raekker); }
export const alleRoller = () => aktuelle;
export const findRolle = (key) => aktuelle.find((r) => r.key === key) || null;
export const rolleLabel = (key) => findRolle(key)?.label || key || "";
export const rolleAdfaerd = (key) => findRolle(key)?.adfaerd || "standard";
export const erMontorRolle = (key) => rolleAdfaerd(key) === "montor";
export const erMedhjaelperRolle = (key) => rolleAdfaerd(key) === "medhjaelper";

// Roller en butik kan give sine brugere: dem butikken har tilvalgt. En brugers nuværende rolle tages altid med, så en
// rolle, der senere er fravalgt, ikke forsvinder fra vedkommendes række.
export function rollerForButik(tilvalgteKeys, nuvaerendeKey = null) {
  const tilvalgt = new Set(tilvalgteKeys || []);
  return aktuelle.filter((r) => tilvalgt.has(r.key) || r.key === nuvaerendeKey);
}

// Widgets på forsiden for en rolle, indtil brugeren selv tilpasser den. Rollens egen liste (sat i Roller-fanen) bruges,
// men kun widgets brugeren har rettighed til og som findes i kataloget. Har rollen ingen liste, afledes den af
// rettighederne i en fast rækkefølge.
const WIDGET_RAEKKEFOELGE = ["dagen_i_tal", "quick_booking", "needs_action", "today_route", "pluk_biler", "upcoming_today", "notifications"];

// Kasser, der er slået sammen eller fjernet i en oprydning af forsiden (oktober 2026), så gemte forsider og rolle-lister fortsat virker:
// "Dagens pluk" blev til "Pluk pr. bil", og "Mine sager" blev dækket af "Haster". Dubletter fjernes, rækkefølgen bevares.
export const WIDGET_ALIAS = { pick_list: "pluk_biler", mine_sager: "haster" };
export function normaliserWidgetNoegler(noegler) {
  const set = new Set();
  const ud = [];
  for (const k of Array.isArray(noegler) ? noegler : []) {
    const n = WIDGET_ALIAS[k] || k;
    if (typeof n === "string" && !set.has(n)) { set.add(n); ud.push(n); }
  }
  return ud;
}
// Forside pr. rolle (oktober 2026), når rollen ikke selv har en liste (sættes under System -> Roller): de tre indbyggede roller får hver deres,
// alle andre roller får den almindelige rækkefølge ovenfor. Kun kasser, brugeren har rettighed til, vises (se standardWidgets).
const STANDARD_PR_ROLLE = {
  admin: ["dagen_i_tal", "bil_status", "uge_foran", "haster", "needs_action", "pluk_biler", "rma_varer", "tempo", "notifications", "quick_booking"],
  saelger: ["dagen_i_tal", "haster", "uge_foran", "quick_booking", "notifications"],
  lager: ["dagen_i_tal", "pluk_biler", "rma_varer", "upcoming_today", "notifications"],
};
export function standardWidgets(rolle, rettigheder, katalog) {
  const har = new Set(rettigheder || []);
  // rettigheder === null betyder "ubegrænset" (systemadministrator), jf. canDo() i domain.js.
  const tilladt = new Map((katalog || []).filter((w) => w.requires === null || rettigheder === null || har.has(w.requires)).map((w) => [w.key, w]));
  const egen = findRolle(rolle)?.forside;
  if (egen) return normaliserWidgetNoegler(egen).filter((k) => tilladt.has(k));
  return normaliserWidgetNoegler(STANDARD_PR_ROLLE[rolle] || WIDGET_RAEKKEFOELGE).filter((k) => tilladt.has(k));
}

// Teknisk nøgle ud fra et rollenavn ("Tømrer-svend" -> "toemrer_svend"). Nøglen kan ikke rettes bagefter (brugere og rettigheder peger på den).
export function lavRolleNoegle(label) {
  const base = String(label || "").toLowerCase()
    .replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const medBogstav = /^[a-z]/.test(base) ? base : (base ? `r_${base}` : "");
  return medBogstav.slice(0, 30).replace(/_+$/g, "");
}
