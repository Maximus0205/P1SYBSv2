import { RotateCw, Trash2, Cable, Wifi, Wrench, Tag, ShoppingCart, Route, Truck, Package, Settings2, Building2, Archive, Home, Bell, AlertCircle, CalendarClock, MapPin } from "lucide-react";

// Core domain helpers and default data for the app. Function/constant names
// are English (part of the codebase's English rename); the actual STRING
// VALUES shown in the UI (labels, statuses, product names) stay Danish,
// since the people using the app are Danish shop staff.

// RETTET (august 2026): uid() var tidligere
// Math.random().toString(36).slice(2, 10) - otte tegn, ca. 41 bits.
// Det er IKKE nok her, fordi id'et bruges som en sags PRIMÆRNØGLE, og
// dataStore.saveRow gemmer med UPSERT: to sager der tilfældigvis fik
// samme id, ville ikke give en fejl - den ene ville stille og roligt
// OVERSKRIVE den anden. Tavst datatab er den værste udgang, og
// Math.random er hverken kollisionssikker eller garanteret ensartet på
// tværs af browsere.
//
// crypto.randomUUID() giver 122 tilfældige bits fra styresystemets egen
// kryptografiske kilde. Findes i alle browsere, appen understøtter, men
// KUN over HTTPS/localhost (window.crypto er ikke tilgængelig på en
// usikker oprindelse) - derfor faldback nedenfor, så en udvikler på en
// http-adresse ikke får en app, der går ned ved oprettelse af en sag.
//
// Eksisterende, korte id'er i databasen er upåvirkede: de bliver stående
// som de er, og nye lange id'er kan ikke kollidere med dem.
const uid = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
};

const now = () =>
  new Date().toLocaleString("da-DK", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const addDays = (iso, days) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// formatLongDate/formatShortDate/isToday accepterer bevidst et TOMT
// (null/undefined) dato-felt uden at gå ned - en sag kan oprettes/
// duplikeres UDEN dato (se "Skal planlægges" i PlanningPage.jsx), og disse
// funktioner bruges alle vegne en sags dato vises.
const formatLongDate = (iso) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long" }) : "Ingen dato sat";
const formatShortDate = (iso) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("da-DK", { day: "numeric", month: "short" }) : "Ingen dato";
const isToday = (iso) => !!iso && iso === todayISO();

const formatDuration = (min) => {
  if (min < 1) return "< 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}t ${m}m` : `${h}t`;
};

const formatTime = (iso) => new Date(iso).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
const totalMinutes = (order) => order.logs.reduce((sum, l) => sum + l.minutter, 0);

const serviceIcon = (name) => {
  const n = (name || "").toLowerCase();
  if (n.includes("dørvend")) return RotateCw;
  if (n.includes("bortskaf") || n.includes("gammel")) return Trash2;
  if (n.includes("kabel") || n.includes("slange") || n.includes("aftræk")) return Cable;
  if (n.includes("netværk") || n.includes("wifi") || n.includes("data") || n.includes("kanal")) return Wifi;
  if (n.includes("monter") || n.includes("indbyg") || n.includes("panel") || n.includes("ophæng") || n.includes("el")) return Wrench;
  return Tag;
};

const DEFAULT_SERVICE_MINUTES = 15;
const createAddOn = (name, minutes = DEFAULT_SERVICE_MINUTES) => ({ id: uid(), navn: name.trim(), minutter: Number(minutes) || 0, udfoert: false });

const OTHER_PRODUCT_TYPE_ID = "andet";
const OTHER_PRODUCT_TYPE = "Andet (skriv selv)";

// ---------------- Products & services ----------------
// Struktur: varekategori -> varetype (hører til én kategori) -> en sag
// vælger, pr. varelinje: varetype, mærke/model, én PRIMÆR ydelse, og
// valgfrit TILLÆGSYDELSER. Relationerne (hvilke tillæg der gælder under
// hvilke primære ydelser/varetyper) ligger udelukkende på selve tillægget.
//
// STANDARDTIDER (september 2026): Admin kan sætte et UDGANGSPUNKT for
// tiden på en ny varelinje - se getDefaultEstimateMinutes/createLineItem
// nedenfor og lib/dataStore.js: default_time_estimates. Matrixen dækker
// BÅDE primære ydelser og tillægsydelser (samme opslagsfunktion, samme
// tabel - "ydelseId" kan være id'et på begge slags). Det erstatter IKKE
// det MÅLTE estimat fra afsluttede sager (data/estimates.js), som stadig
// vises som et separat, opdateret forslag, når der er nok historik - det
// admin-satte tal er blot et fornuftigt sted at starte, især for en helt
// ny butik eller en helt ny varetype uden historik endnu. Tallet tastes
// stadig frit for den enkelte booking bagefter, ligesom hidtil.

const DEFAULT_PRODUCT_CATEGORIES = [
  { id: "vk1", navn: "Hvidevare" },
  { id: "vk2", navn: "Brunvare" },
];

const DEFAULT_PRIMARY_SERVICES = [
  { id: "p1", navn: "Kantstenslevering" },
  { id: "p2", navn: "Levering med indbæring" },
  { id: "p3", navn: "Montering" },
];

const DOOR_ITEMS = ["Køleskab", "Fryseskab", "Kølefryseskab", "Amerikanerskab", "Vinkøleskab"];
const DEFAULT_PRODUCT_TYPES = [
  { id: "vt1", navn: "Køleskab", kategoriId: "vk1" },
  { id: "vt2", navn: "Fryseskab", kategoriId: "vk1" },
  { id: "vt3", navn: "Kølefryseskab", kategoriId: "vk1" },
  { id: "vt4", navn: "Amerikanerskab", kategoriId: "vk1" },
  { id: "vt5", navn: "Vinkøleskab", kategoriId: "vk1" },
  { id: "vt6", navn: "Kummefryser", kategoriId: "vk1" },
  { id: "vt7", navn: "Vaskemaskine", kategoriId: "vk1" },
  { id: "vt8", navn: "Tørretumbler", kategoriId: "vk1" },
  { id: "vt9", navn: "Vaske-tørremaskine", kategoriId: "vk1" },
  { id: "vt10", navn: "Opvaskemaskine", kategoriId: "vk1" },
  { id: "vt11", navn: "Ovn", kategoriId: "vk1" },
  { id: "vt12", navn: "Kompakt ovn", kategoriId: "vk1" },
  { id: "vt13", navn: "Kogeplade", kategoriId: "vk1" },
  { id: "vt14", navn: "Komfur", kategoriId: "vk1" },
  { id: "vt15", navn: "Emhætte", kategoriId: "vk1" },
  { id: "vt16", navn: "TV", kategoriId: "vk2" },
  { id: "vt17", navn: "Lydanlæg", kategoriId: "vk2" },
];

const DOOR_ITEM_IDS = DEFAULT_PRODUCT_TYPES.filter((v) => DOOR_ITEMS.includes(v.navn)).map((v) => v.id);

const DEFAULT_ADD_ON_SERVICES = [
  { id: "t1", navn: "Udpakning", primaerYdelser: ["p2", "p3"], varetyper: [] },
  { id: "t2", navn: "Dørvending", primaerYdelser: ["p3"], varetyper: DOOR_ITEM_IDS },
  { id: "t3", navn: "Bortskaffelse af gammelt produkt", primaerYdelser: ["p2", "p3"], varetyper: [] },
];

const availableAddOns = (productTypeId, primaryServiceId, addOnServices) => {
  return (addOnServices || []).filter((t) => {
    const appliesToPrimary = (t.primaerYdelser || []).includes(primaryServiceId);
    const noProductTypeRestriction = !t.varetyper || t.varetyper.length === 0;
    const appliesToProductType = productTypeId === OTHER_PRODUCT_TYPE_ID ? noProductTypeRestriction : (noProductTypeRestriction || t.varetyper.includes(productTypeId));
    return appliesToPrimary && appliesToProductType;
  });
};

// Slår en admin-sat standardtid op for en (varetype, ydelse)-kombination -
// eller null, hvis der ikke er sat nogen. "ydelse" er bevidst generisk:
// funktionen bruges BÅDE til en primær ydelse (se createLineItem) og til
// en tillægsydelse (se toggleAddOn i OrderFormFields.jsx) - id'et er blot
// en opslagsnøgle, og begge slags ydelser har hver deres egen, unikke id.
// defaultTimeEstimates er den flade liste fra lib/dataStore.js:
// getDefaultTimeEstimates.
const getDefaultEstimateMinutes = (defaultTimeEstimates, varetypeId, ydelseId) => {
  const entry = (defaultTimeEstimates || []).find((e) => e.varetypeId === varetypeId && e.primaerYdelseId === ydelseId);
  return entry ? entry.minutter : null;
};

// NB: "plukket" (afkrydset på lager) sidder HER, pr. varelinje - se
// WarehousePage.jsx, hvor 1 varelinje = 1 punkt på pluklisten. Bevidst
// forskelligt fra order.plukket, som blot er et afledt "hele ordren er
// samlet"-flag.
//
// defaultTimeEstimates (september 2026, valgfrit 5. argument): bruges KUN
// til at foreslå en START-værdi for varelinjens tid, når den oprettes -
// se noten ved getDefaultEstimateMinutes. Ændrer sælgeren siden hen
// varetype eller ydelse på linjen, opdateres tiden IKKE automatisk igen -
// det ville kunne overskrive et tal, sælgeren bevidst har rettet, uden at
// blive spurgt (samme rådgivende, ikke-automatiske princip som det MÅLTE
// estimat i EstimateSuggestion, se OrderFormFields.jsx).
const createLineItem = (productTypes, primaryServices, productTypeId, text = "", defaultTimeEstimates = []) => {
  const firstProductType = productTypes[0];
  const id = productTypeId || (firstProductType ? firstProductType.id : OTHER_PRODUCT_TYPE_ID);
  const productType = productTypes.find((v) => v.id === id);
  const primaryService = primaryServices[0];
  const defaultMinutes = primaryService ? getDefaultEstimateMinutes(defaultTimeEstimates, id, primaryService.id) : null;
  return {
    id: uid(),
    varetypeId: id,
    varetypeNavn: productType ? productType.navn : OTHER_PRODUCT_TYPE,
    varetypeTekst: text,
    maerke: "",
    model: "",
    primaerYdelse: primaryService ? { id: primaryService.id, navn: primaryService.navn, minutter: defaultMinutes ?? 0 } : null,
    tillaeg: [],
    plukket: false,
  };
};

const lineItemLabel = (v) => {
  const base = v.varetypeId === OTHER_PRODUCT_TYPE_ID ? (v.varetypeTekst || "Speciel opgave") : (v.varetypeNavn || "Ukendt vare");
  const detail = [v.maerke, v.model].filter(Boolean).join(" ");
  return detail ? `${base} – ${detail}` : base;
};

const lineItemMinutes = (line) => (Number(line.primaerYdelse?.minutter) || 0) + (line.tillaeg || []).reduce((sum, y) => sum + (Number(y.minutter) || 0), 0);
const orderExpectedMinutes = (order) => (order.varelinjer || []).reduce((sum, l) => sum + lineItemMinutes(l), 0);

// ---------------- Manglende varer (august 2026) ----------------
// Lageret kan ved pluk melde, at en vare IKKE kan findes - typisk fordi
// den er oversolgt, eller fordi en leverance ikke er kommet til tiden.
// Markeringen sidder på den enkelte VARELINJE, fordi en sag ofte har flere
// varer, og det kun er den ene der mangler. ÉN manglende vare = ÉN
// notifikation til den sælger, der har booket sagen.
//
// NOTIFIKATIONEN ER UDLEDT, IKKE AFKRYDSET. De øvrige notifikationstyper
// er BESKEDER: de er set, når sælgeren har åbnet sagen. En manglende vare
// er derimod en UAFKLARET TILSTAND - at have set beskeden løser ingenting,
// kunden står stadig til at få en montør på besøg uden varen. Markeringen
// bliver derfor stående, indtil problemet reelt er håndteret, og der er
// præcis tre måder:
//
//   1. Sagen bookes til en NY DATO (afventer næste leverance)
//   2. Den manglende VARE ændres til en anden (fx tilsvarende model)
//   3. Lageret fjerner markeringen igen (varen dukkede op alligevel)
//
// De to første registreres ved at gemme sagens dato OG et fingeraftryk af
// varen på meldingstidspunktet. Ændrer nogen af delene sig, forsvinder
// notifikationen af sig selv - uden at nogen skal rydde op efter sig.
//
// Fingeraftrykket dækker bevidst KUN hvilken VARE der er tale om - ikke
// ydelse, minutter eller tillæg. Retter sælgeren monteringstiden fra 60
// til 90 minutter, er varen jo stadig den samme og mangler stadig.
const lineItemFingerprint = (v) =>
  [v?.varetypeId || "", v?.varetypeTekst || "", v?.maerke || "", v?.model || ""]
    .join("|").toLowerCase().trim();

const isMissingActive = (order, v) => {
  const m = v?.mangler;
  if (!m || !m.note) return false;
  if ((m.meldtVedDato || null) !== (order?.dato || null)) return false;
  // meldtForVare kan mangle på ældre markeringer; så falder vi tilbage på
  // kun dato-tjekket frem for at erklære dem håndterede uden grund.
  if (m.meldtForVare && m.meldtForVare !== lineItemFingerprint(v)) return false;
  return true;
};

const missingLineItems = (order) => (order?.varelinjer || []).filter((v) => isMissingActive(order, v));
const orderHasMissingItems = (order) => missingLineItems(order).length > 0;

const normalizeAddress = (addr) => (addr || "").toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
const buildingKey = (addr) => {
  const n = normalizeAddress(addr);
  if (!n) return "";
  const match = n.match(/^([a-zæøå '-]+?\s\d+[a-z]?)\b/);
  return match ? match[1].trim() : n;
};

const areaKey = (addr) => {
  const n = normalizeAddress(addr);
  if (!n) return "";
  const match = n.match(/\b(\d{4})\s+([a-zæøå]+(?:\s[a-zæøå]+)?)\b/);
  return match ? `${match[1]} ${match[2]}`.trim() : "";
};

// ---------------- Adresse-noter / vidensdeling (september 2026) ----------------
// Finder de gemte adresse-noter, der gælder for EN GIVEN adresse - samme
// buildingKey-matchning som resten af appen bruger til "samme opgang" (se
// SuggestedDates i OrderFormFields.jsx og CustomerHistoryLookup). Det
// betyder bevidst, at en note om "Skovvej 12" også dukker op for "Skovvej
// 12, 2. th" og omvendt - viden om en BYGNING er som regel relevant for
// hele bygningen, ikke kun præcis den skrivemåde, den blev noteret med.
const matchingAddressNotes = (addressNotes, address) => {
  const key = buildingKey(address);
  if (!key) return [];
  return (addressNotes || []).filter((n) => n.addressKey === key);
};

const weekDays = (iso) => {
  const d = new Date(iso + "T00:00:00");
  const dow = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    return `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}-${String(dd.getDate()).padStart(2, "0")}`;
  });
};

// Sagsoverskrift til lister: viser YDELSE + VAREKATEGORI + evt.
// TILLÆGSYDELSER pr. varelinje, så man kan danne sig et overblik over
// selve ARBEJDET uden at åbne sagen. Mærke/model hører til varelinje-
// detaljerne (se lineItemLabel) og gentages bevidst ikke her.
const buildTitle = (lineItems) => {
  if (!lineItems || lineItems.length === 0) return "Ny opgave";
  const parts = lineItems
    .map((v) => {
      const category = v.varetypeId === OTHER_PRODUCT_TYPE_ID ? (v.varetypeTekst || "Speciel opgave") : (v.varetypeNavn || "Ukendt vare");
      const service = v.primaerYdelse?.navn;
      const addOns = (v.tillaeg || []).map((y) => y.navn).filter(Boolean);
      let text = service ? `${service} – ${category}` : category;
      if (addOns.length > 0) text += ` (+ ${addOns.join(", ")})`;
      return text;
    })
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" + ") : "Ny opgave";
};

const keyAccessText = (n) => {
  if (!n || !n.kraeves) return "";
  const parts = [n.type || "Nøgle/adgang"];
  if (n.placering) parts.push(n.placering);
  return parts.join(" — ");
};

const TIME_SLOTS = [
  { id: "heldag", label: "Hel dag", start: "08:00", slut: "16:00" },
  { id: "formiddag", label: "Formiddag", start: "08:00", slut: "12:00" },
  { id: "eftermiddag", label: "Eftermiddag", start: "12:00", slut: "16:00" },
];
const timeSlotById = (id) => TIME_SLOTS.find((t) => t.id === id) || TIME_SLOTS[0];
const timeSlotText = (id) => {
  const t = timeSlotById(id);
  return `${t.label} (${t.start}–${t.slut})`;
};

const KEY_ACCESS_TYPES = ["Nøgle udleveres af kunde", "Nøgleboks", "Kode/alarm", "Afhentes på kontoret", "Andet"];

const TECHNICIAN_COLORS = ["#E2621B", "#3D7A5C", "#52697E", "#8B5E3C", "#6B5B95", "#1C7C8C"];
const technicianColor = (id, technicians) => {
  const idx = technicians.findIndex((m) => m.id === id);
  return idx >= 0 ? TECHNICIAN_COLORS[idx % TECHNICIAN_COLORS.length] : "#D8D0BE";
};

const DEFAULT_VEHICLES = [
  { id: "b1", navn: "Bil 1", nummerplade: "AB 12 345", lukket: false, lukketAarsag: "" },
  { id: "b2", navn: "Bil 2", nummerplade: "CD 67 890", lukket: false, lukketAarsag: "" },
  { id: "b3", navn: "Bil 3", nummerplade: "EF 22 111", lukket: false, lukketAarsag: "" },
];

const vehicleLabel = (vehicle) => (vehicle ? `${vehicle.navn || "(uden navn)"} · ${vehicle.nummerplade || "ingen nummerplade"}` : "Ingen bil");

// RETTET (august 2026): en sygemelding kan have slutDato === null (åben,
// endnu ikke raskmeldt) - den oprindelige `date <= f.slutDato` ville have
// været FALSK for enhver dato, når slutDato er null, og en bil under en
// AKTIV sygemelding ville derfor fejlagtigt IKKE være vist som blokeret.
const vehicleBlockedByTimeOff = (vehicleId, date, technicians, timeOff) => {
  const onThisVehicle = technicians.filter((m) => m.bilId === vehicleId);
  if (onThisVehicle.length === 0) return null;
  const entry = (timeOff || []).find((f) => onThisVehicle.some((m) => m.id === f.montorId) && date >= f.startDato && (!f.slutDato || date <= f.slutDato));
  if (!entry) return null;
  const technician = onThisVehicle.find((m) => m.id === entry.montorId);
  return { ferie: entry, montor: technician };
};

// Er montøren fraværende (ferie ELLER sygdom) på en given dato - bruges
// bl.a. til at undgå at foreslå en fraværende montør i planlægningen.
const isTechnicianAbsent = (technicianId, date, timeOff) =>
  (timeOff || []).some((f) => f.montorId === technicianId && date >= f.startDato && (!f.slutDato || date <= f.slutDato));

// Er montøren AKTIVT sygemeldt lige nu? Kun type "sygdom" tæller her -
// almindelig ferie fanges under "Montørproblem", se PlanningPage.jsx.
const activeSickLeave = (technicianId, timeOff) => {
  const today = todayISO();
  return (timeOff || []).find((f) => f.montorId === technicianId && f.type === "sygdom" && f.startDato <= today && (!f.slutDato || f.slutDato >= today)) || null;
};

// ---------------- Bil-dækning (september 2026) ----------------
// Sager tildeles nu en BIL, ikke en PERSON (se rebind_orders_to_vehicle_
// instead_of_person-migreringen) - flere personer kan dele én bil, siden
// "kan køre rute" blev indført. Fravær/sygdom forbliver en PERSON-
// egenskab (et menneske er sygt, ikke en bil), så spørgsmålet "er der et
// problem med denne sag" bliver til "har bilen mindst én person tilknyttet,
// der ikke er fraværende i dag" - IKKE "er DEN SPECIFIKKE person fraværende".
//
// Er der to montører på en bil, og den ene bliver syg, er bilen stadig
// AKTIV: den anden kører den. Er der derimod INGEN tilknyttet bilen
// overhovedet, er det et problem uafhængigt af dato - der er ingen at
// spørge, om de er fraværende.
//
// personnel: array af { id, bilId } - de mennesker der kan køre en rute
// (rolle montor eller kanKoere), UAFHÆNGIGT af hvilke "technicians"-rækker
// (nu bil-rækker, se App.jsx) der bruges til selve tildelingen.
const vehicleAbsences = (vehicleId, date, personnel, timeOff) => {
  const drivers = (personnel || []).filter((p) => p.bilId === vehicleId);
  return drivers.map((p) => ({
    person: p,
    fravaer: (timeOff || []).find((f) => f.montorId === p.id && date >= f.startDato && (!f.slutDato || date <= f.slutDato)) || null,
  }));
};

// Har bilen mindst én person tilknyttet, der er til rådighed (ikke
// fraværende) på den givne dato? Ingen personer tilknyttet overhovedet =
// ingen dækning, uanset dato.
const vehicleHasCoverage = (vehicleId, date, personnel, timeOff) => {
  const abs = vehicleAbsences(vehicleId, date, personnel, timeOff);
  if (abs.length === 0) return false;
  return abs.some((a) => !a.fravaer);
};

// ---------------- Tempo pr. BIL (september 2026, rettet) ----------------
// En procentsats (100 = normalt tempo) der justerer de FORVENTEDE tider i
// kapacitets-/overbelastningsberegningen i Planlægning - fx en bil der for
// tiden primært køres af nogen under oplæring (måske 130%, dvs. tager 30%
// længere tid), uden at røre selve varelinjens tidsestimat (det tal
// gælder ALLE biler der eventuelt får sagen, og er samtidig det, en
// sælger kan justere ved oprettelse).
//
// SAT PÅ SELVE BILEN (vehicle.tempo, en almindelig del af bilens gemte
// data - se lib/dataStore.js: saveVehicle), IKKE på personen. Første
// udgave forsøgte pr.-person med et gennemsnit, hvis flere delte samme
// bil - men appens egen arkitektur er allerede entydigt bil-centreret
// (sager tildeles en BIL, ikke en person, se vehicleHasCoverage ovenfor),
// og at koble tempoet til bilen i stedet undgår helt spørgsmålet "hvem af
// de to kører den præcis i dag" - der er kun ét tal at forholde sig til,
// uanset hvem der sidder bag rattet. Skriverettighed til vehicles kræver i
// forvejen admin_biler, håndhævet i databasens RLS - en sælger kan derfor
// ikke justere det, uanset hvad UI'et tillader.
const vehiclePaceFactor = (vehicleId, vehicleRows) => {
  const row = (vehicleRows || []).find((v) => v.id === vehicleId);
  return (Number(row?.tempo) || 100) / 100;
};

const emptyCustomer = () => ({ navn: "", telefon: "", email: "", adresse: "", leveringsnote: "" });
const emptyKeyAccess = () => ({ kraeves: false, type: "", detaljer: "", placering: "" });

const STATUS_META = {
  planlagt: { label: "Planlagt", color: "#52697E" },
  igang: { label: "I gang", color: "#E2621B" },
  afsluttet: { label: "Afsluttet", color: "#3D7A5C" },
};

// Rækkefølge for sager hos SAMME bil SAMME dag. Bookinger sker kun med
// grove tidsrum (hel dag/formiddag/eftermiddag), så flere sager har ofte
// identisk start/slut-tid, og rækkefølgen ville uden dette felt reelt være
// tilfældig. `raekkefolge` sættes KUN når nogen aktivt har omfordelt - før
// det sorteres efter tidsrummets starttid.
//
// RETTET (september 2026, fejl fanget af tester): kun at kigge på "har A
// en raekkefolge, har B en raekkefolge" var util-strækkeligt. Et enkelt
// tryk på op/ned-pilene, eller "Foreslå bedste besøgsrækkefølge", sætter
// raekkefolge på ALLE sager, der findes for den bil/dag PÅ DET TIDSPUNKT.
// Enhver sag der bookes ind BAGEFTER mangler stadig sin egen raekkefolge -
// og den gamle logik ("har den ene raekkefolge, kommer den altid først")
// betød, at en helt ny sag ALTID endte sidst i listen, uanset dens eget
// tidsrum. En 8-12-sag booket efter en manuel omrokering kunne dermed
// havne under en 12-16-sag, som tilfældigvis allerede havde en
// raekkefolge - præcis det testeren så.
//
// Nu bruges raekkefolge KUN, når BEGGE sager har fået sat den (dvs. begge
// var med i samme bevidste omrokering, og deres indbyrdes rækkefølge er
// derfor et bevidst valg). Har kun den ene en raekkefolge - eller ingen af
// dem - afgøres rækkefølgen af starttidspunktet, ligesom for helt
// upåvirkede dage.
const dailyOrderCompare = (a, b) => {
  const ar = typeof a.raekkefolge === "number" ? a.raekkefolge : null;
  const br = typeof b.raekkefolge === "number" ? b.raekkefolge : null;
  if (ar !== null && br !== null) return ar - br;
  return (a.start || "").localeCompare(b.start || "");
};

// En sag "MANGLER PLANLÆGNING", hvis den ikke har dato ELLER bil (og ikke
// er afsluttet). Bevidst IKKE inklusiv "dato passeret" - er datoen
// passeret uden et markeret problem, antages sagen gennemført.
//
// bilId (september 2026) erstatter montorId - se noten ved
// vehicleHasCoverage ovenfor.
const needsPlanning = (order) => order.status !== "afsluttet" && (!order.dato || !order.bilId);

// RETTIGHEDER: fælles UI-hjælper til "må denne bruger X?". Den
// AUTORITATIVE håndhævelse ligger i databasen (RLS + triggere) - denne
// bruges KUN til at style UI'et. permissions === null = "ubegrænset"
// (systemadmins).
const canDo = (permissions, key) => permissions === null || (permissions || []).includes(key);

// DASHBOARD-WIDGETS: kataloget over widgets forsiden kan sammensættes af,
// og hvad hver især kræver af rettighed (null = altid relevant).
//
// "quick_booking" kræver salg-rettigheden. Den er nu den PRIMÆRE indgang
// til at oprette sager, efter at Salg-fanen er fjernet fra menuen - se
// noten ved PAGES nedenfor.
const DASHBOARD_WIDGET_CATALOG = [
  { key: "needs_action", label: "Kræver handling", icon: AlertCircle, requires: "planlaegning" },
  { key: "today_route", label: "Dagens rute", icon: Route, requires: "montor" },
  { key: "pick_list", label: "Dagens pluk", icon: Package, requires: "lager" },
  { key: "quick_booking", label: "Opret sag", icon: ShoppingCart, requires: "salg" },
  { key: "notifications", label: "Notifikationer", icon: Bell, requires: null },
  { key: "upcoming_today", label: "Sager i dag", icon: CalendarClock, requires: null },
];

// Standard-widgets pr. rolle, indtil brugeren selv tilpasser sin forside.
// "quick_booking" står højt for sælgere og admins: det er den handling,
// de oftest kommer for.
const DEFAULT_DASHBOARD_WIDGETS = {
  admin: ["needs_action", "quick_booking", "upcoming_today", "notifications"],
  saelger: ["quick_booking", "needs_action", "upcoming_today", "notifications"],
  montor: ["today_route", "notifications"],
  lager: ["pick_list"],
};

export {
  uid, now, todayISO, addDays, formatLongDate, formatShortDate, isToday, formatDuration, formatTime, totalMinutes, serviceIcon,
  DEFAULT_SERVICE_MINUTES, createAddOn, OTHER_PRODUCT_TYPE, OTHER_PRODUCT_TYPE_ID,
  DEFAULT_PRODUCT_CATEGORIES, DEFAULT_PRODUCT_TYPES, DEFAULT_PRIMARY_SERVICES, DEFAULT_ADD_ON_SERVICES, availableAddOns,
  createLineItem, getDefaultEstimateMinutes, lineItemLabel, lineItemMinutes, orderExpectedMinutes, normalizeAddress, buildingKey, areaKey,
  matchingAddressNotes,
  lineItemFingerprint, isMissingActive, missingLineItems, orderHasMissingItems,
  weekDays, buildTitle, keyAccessText, TIME_SLOTS, timeSlotById, timeSlotText, KEY_ACCESS_TYPES, TECHNICIAN_COLORS, technicianColor,
  DEFAULT_VEHICLES, vehicleLabel, vehicleBlockedByTimeOff, isTechnicianAbsent, activeSickLeave, vehicleAbsences, vehicleHasCoverage, vehiclePaceFactor,
  emptyCustomer, emptyKeyAccess, STATUS_META,
  dailyOrderCompare, needsPlanning, computeNotifications, PAGES, PAGES_FOR_ROLE, canDo, DASHBOARD_WIDGET_CATALOG, DEFAULT_DASHBOARD_WIDGETS,
};

// Beregner, for en given bruger, hvilke af DERES EGNE bookede sager der
// har en ULÆST notifikation. Kun sagens EGEN opretter tæller med - en
// admin, der blot kigger på andres sager, udløser ingen notifikationer.
//
// De tre første markeres LÆST, når opretteren åbner sagen (se
// dismissNotifications). manglendeVarer gør IKKE - den er udledt af
// varelinjernes tilstand og forsvinder først, når varen er håndteret. Se
// noten ved isMissingActive ovenfor.
function computeNotifications(orders, profileId) {
  if (!profileId) return { materialer: [], problemer: [], opfoelgninger: [], manglendeVarer: [] };
  const mine = (orders || []).filter((o) => o.oprettetAf?.id === profileId);
  return {
    materialer: mine.filter((o) => (o.materialer || []).length > 0 && !o.notifikationSet?.materialer),
    problemer: mine.filter((o) => o.problem && !o.notifikationSet?.problem),
    opfoelgninger: mine.filter((o) => o.harOpfoelgning && !o.notifikationSet?.opfoelgning),
    manglendeVarer: mine.filter((o) => o.status !== "afsluttet" && orderHasMissingItems(o)),
  };
}

// FANER I MENUEN.
//
// "koersel" blev fusioneret ind i Planlægning (august 2026) - de to sider
// dækkede reelt samme arbejdsopgave.
//
// "salg" ER FJERNET FRA MENUEN (september 2026). At oprette en sag er en
// HANDLING, man foretager et par gange om dagen - ikke et sted, man
// opholder sig. En hel fane til to knapper og en formular var et
// navigationspunkt, folk skulle igennem for at komme videre. Oprettelsen
// sker nu fra forsidens "Opret sag"-widget (se DASHBOARD_WIDGET_CATALOG
// ovenfor), som fører direkte ind i formularen.
//
// BEMÆRK at "salg" stadig findes som RETTIGHED og som rute i App.jsx -
// det er kun MENUPUNKTET, der er væk. Rettigheden styrer fortsat, hvem der
// må oprette sager (og dermed hvem der ser widgeten), og ruten er dét,
// widgetens knapper navigerer til. Fjernes rettigheden også, mister
// sælgere adgangen til at oprette overhovedet.
//
// "adresser" (september 2026): selvstændig fane til adresse-viden
// (nøgleboks, adgangsforhold, "smal opgang, kræver 2 mand") - se
// pages/AddressesPage.jsx. IKKE styret af en admin_*-rettighed som de
// øvrige i PAGE_PERMISSION_KEYS, men af sag_feltarbejde ELLER sag_opret
// (samme grænse RLS'en på address_notes håndhæver) - se allowedPages i
// App.jsx, samme særtilfælde-mønster som "montor".
//
// "dashboard" er forsiden - ikke rettighedsstyret som de øvrige (alle med
// en butik har en forside), derfor tilføjet direkte i allowedPages i
// App.jsx.
const PAGES = [
  { key: "dashboard", label: "Forside", icon: Home },
  { key: "planlaegning", label: "Planlægning", icon: Route },
  { key: "montor", label: "Montør", icon: Truck },
  { key: "lager", label: "Lager", icon: Package },
  { key: "arkiv", label: "Arkiv", icon: Archive },
  { key: "adresser", label: "Adresser", icon: MapPin },
  { key: "admin", label: "Admin", icon: Settings2 },
  { key: "systemadmin", label: "System", icon: Building2 },
];
// FORÆLDET: faneadgang styres nu af brugerens faktiske rettigheder, se
// allowedPages i App.jsx. Beholdes indtil videre, da den stadig bruges som
// opslag enkelte steder.
const PAGES_FOR_ROLE = {
  admin: ["salg", "planlaegning", "montor", "lager", "arkiv", "admin"],
  saelger: ["salg", "planlaegning", "montor", "lager", "arkiv"],
  montor: ["montor"],
  lager: ["lager"],
};
