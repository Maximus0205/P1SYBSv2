// RUNDVISNING (oktober 2026): guidede rundture i appen for dem, der arbejder ved skrivebordet (sælger, admin, lager).
// Rene regler uden React/DOM (afprøvet i tests/rundvisning.test.mjs): hvilke guides en bruger kan se, hvad der er set, og hvor
// kortet placeres. Selve visningen er components/Rundvisning.jsx.
//
// Et trin peger på et element via data-rundvisning="<maal>" (maal = null: et kort midt på skærmen uden fremhævning).
// Peger trinnet på en knap, brugeren selv skal trykke på, har det fortsaetNaar = navnet på det element, der dukker op, når
// brugeren har gjort det - så fortsætter rundturen af sig selv.

export const GUIDES = [
  {
    id: "kom-i-gang",
    titel: "Kom i gang",
    beskrivelse: "En kort rundtur i menuen og de vigtigste knapper.",
    automatisk: true,            // vises af sig selv første gang
    side: null,
    trin: [
      { id: "velkommen", titel: "Velkommen til P1SYBS", tekst: "Her er en kort rundtur i systemet. Den tager under to minutter. Du kan altid starte den igen under Hjælp-knappen øverst.", maal: null },
      { id: "menu", titel: "Menuen", tekst: "Her skifter du mellem systemets sider. Du ser kun de sider, din rolle har adgang til.", maal: "menu" },
      { id: "forside", titel: "Forsiden", tekst: "Forsiden er dit overblik: hvad der kræver handling, og hvad der skal ske i dag. Her finder du også knappen Bookede varer.", maal: "fane-dashboard", kraeverSide: "dashboard" },
      { id: "planlaegning", titel: "Planlægning", tekst: "Her ser du ugen, hvem der kører hvor, og fordeler sager på biler. Du kan trække en sag over på en anden bil.", maal: "fane-planlaegning", kraeverSide: "planlaegning" },
      { id: "lager", titel: "Lager", tekst: "Her plukker og kontrollerer lageret varerne til dagens sager.", maal: "fane-lager", kraeverSide: "lager" },
      { id: "arkiv", titel: "Arkiv", tekst: "Her finder du afsluttede sager, hvis du skal slå noget op bagefter.", maal: "fane-arkiv", kraeverSide: "arkiv" },
      { id: "klokke", titel: "Notifikationer", tekst: "Klokken viser, hvad der er nyt på dine egne sager, fx en manglende vare eller et problem, montøren har meldt.", maal: "klokke" },
      { id: "konto", titel: "Din konto", tekst: "Her sætter du PIN eller Face ID op, så du kan logge hurtigt ind.", maal: "konto" },
      { id: "hjaelp", titel: "Hjælp", tekst: "Her finder du rundturene igen, når du får brug for dem.", maal: "hjaelp" },
    ],
  },
  {
    id: "opret-sag",
    titel: "Opret en ny sag",
    beskrivelse: "Sådan booker du en sag trin for trin.",
    automatisk: false,
    side: "salg",                // rundturen starter på denne side
    kraever: "opret",            // kun for dem, der må oprette sager
    trin: [
      { id: "knap", titel: "Start en booking", tekst: "Tryk på Book sag. Rundturen fortsætter, når formularen er åben.", maal: "book-sag", fortsaetNaar: "ny-sag" },
      { id: "trin", titel: "Fire trin", tekst: "Bookingen går gennem fire trin: kunde, levering, varer og ydelser, og til sidst tidspunkt og bil. Linjen viser, hvor langt du er.", maal: "ny-sag-trin" },
      { id: "kunde", titel: "Start med kunden", tekst: "Vælg først, hvilken slags sag det er. Det ændrer resten af formularen. Udfyld derefter kundens navn, telefon og adresse.", maal: "ny-sag-type" },
      { id: "knapper", titel: "Næste og Tilbage", tekst: "Gå frem med Næste, og tilbage med Tilbage. Det, du har skrevet, bliver stående. Til sidst bliver Næste til Book sag.", maal: "ny-sag-knapper" },
      { id: "kladde", titel: "Du kan altid lukke", tekst: "Lukker du formularen midt i en booking, gemmes den som kladde på denne enhed, og du kan fortsætte senere.", maal: "ny-sag-luk" },
    ],
  },
];

const ROLLER_UDEN_RUNDVISNING = new Set(["montor", "medhjaelper"]);

// Guides en bruger kan se. brugerdata: { rolle, erSystemadmin, tilladteSider: [..], kanOpretteSager }.
// Montører og medhjælpere får ingen (de får en instruktion af butikken). Trin, der peger på en side, brugeren ikke har adgang til,
// udelades, så rundturen aldrig viser noget, man ikke kan bruge.
export function guidesForBruger({ rolle, erSystemadmin = false, tilladteSider = [], kanOpretteSager = false } = {}) {
  if (!erSystemadmin && ROLLER_UDEN_RUNDVISNING.has(rolle)) return [];
  return GUIDES
    .filter((g) => g.kraever !== "opret" || kanOpretteSager)
    .map((g) => ({ ...g, trin: g.trin.filter((t) => !t.kraeverSide || tilladteSider.includes(t.kraeverSide)) }))
    .filter((g) => g.trin.length > 0);
}

// ---- Hvad er set? Gemmes pr. bruger i browseren (ingen ændring i databasen); se components/Rundvisning.jsx.
const noegle = (brugerId) => `p1sybs-rundvisning:${brugerId}`;

export function laesSet(lager, brugerId) {
  try {
    const o = JSON.parse(lager.getItem(noegle(brugerId)) || "null");
    return o && typeof o === "object" && o.set && typeof o.set === "object" ? o.set : {};
  } catch (_) { return {}; }
}

export function markerSet(lager, brugerId, guideId, nu = Date.now()) {
  try {
    const set = { ...laesSet(lager, brugerId), [guideId]: nu };
    lager.setItem(noegle(brugerId), JSON.stringify({ set }));
    return true;
  } catch (_) { return false; }   // blokeret lager: rundturen vises bare igen næste gang - ikke kritisk
}

// Den guide, der skal starte af sig selv: den første automatiske, brugeren endnu ikke har set.
export function skalStarteAutomatisk(guides, set) {
  return (guides || []).find((g) => g.automatisk && !set?.[g.id]) || null;
}

export const naesteIndex = (i, antal) => Math.min(i + 1, antal - 1);
export const forrigeIndex = (i) => Math.max(i - 1, 0);
export const erSidsteTrin = (i, antal) => i >= antal - 1;

// ---- Placering af kortet. rect: { top, left, width, height } for det fremhævede element (eller null), vindue: { b, h }.
// Brede skærme: kortet ligger under elementet, eller over det, hvis der ikke er plads under; vandret holdes det inde i vinduet.
// Smalle skærme (under 640 px): kortet er forankret nederst, og skarpt = true betyder, at elementet skal rulles op over kortet.
export function placerKort({ rect, vindue, kort = { b: 340, h: 200 }, margen = 12 }) {
  const smal = vindue.b < 640;
  if (smal) {
    const kortTop = vindue.h - kort.h - margen;
    return { type: "bund", top: kortTop, left: margen, bredde: vindue.b - 2 * margen, skalRulles: !!rect && rect.top + rect.height + margen > kortTop };
  }
  const bredde = Math.min(kort.b, vindue.b - 2 * margen);
  if (!rect) return { type: "midt", top: Math.max(margen, Math.round((vindue.h - kort.h) / 2)), left: Math.round((vindue.b - bredde) / 2), bredde, skalRulles: false };
  const underPlads = vindue.h - (rect.top + rect.height) - margen;
  const overPlads = rect.top - margen;
  const under = underPlads >= kort.h || underPlads >= overPlads;
  const top = under ? rect.top + rect.height + margen : Math.max(margen, rect.top - kort.h - margen);
  const left = Math.min(Math.max(margen, rect.left + rect.width / 2 - bredde / 2), vindue.b - bredde - margen);
  return { type: under ? "under" : "over", top: Math.round(top), left: Math.round(left), bredde, skalRulles: false };
}
