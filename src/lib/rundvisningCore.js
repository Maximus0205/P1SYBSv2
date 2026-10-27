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
    omraade: "Start her",
    automatisk: true,            // vises af sig selv første gang
    side: null,
    ikkeRoller: ["montor", "medhjaelper"],
    trin: [
      { id: "velkommen", titel: "Velkommen til P1SYBS", tekst: "Her er en kort rundtur i systemet. Den tager under to minutter. Du kan altid starte den igen under Hjælp-knappen øverst.", maal: null,
        tekstPrRolle: {
          admin: "Som administrator kan du både planlægge, følge lageret og sætte butikken op. Her er en kort rundtur (under to minutter). Du kan altid starte den igen under Hjælp-knappen øverst.",
          saelger: "Som sælger booker du sager og følger dem, til de er kørt. Her er en kort rundtur (under to minutter). Du kan altid starte den igen under Hjælp-knappen øverst.",
          lager: "Som lager plukker du varerne til dagens biler og melder, hvis noget ikke kan findes. Her er en kort rundtur (under to minutter). Du kan altid starte den igen under Hjælp-knappen øverst.",
        } },
      { id: "menu", titel: "Menuen", tekst: "Her skifter du mellem systemets sider. Du ser kun de sider, din rolle har adgang til.", maal: "menu" },
      { id: "forside", titel: "Forsiden", tekst: "Forsiden er dit overblik: hvad der kræver handling, og hvad der skal ske i dag. Her finder du også knappen Bookede varer.", maal: "fane-dashboard", kraeverSide: "dashboard" },
      { id: "planlaegning", titel: "Planlægning", tekst: "Her ser du ugen, hvem der kører hvor, og fordeler sager på biler. Du kan trække en sag over på en anden bil.", maal: "fane-planlaegning", kraeverSide: "planlaegning" },
      { id: "lager", titel: "Lager", tekst: "Her plukker og kontrollerer lageret varerne til dagens sager.", maal: "fane-lager", kraeverSide: "lager" },
      { id: "arkiv", titel: "Arkiv", tekst: "Her finder du afsluttede sager, hvis du skal slå noget op bagefter.", maal: "fane-arkiv", kraeverSide: "arkiv" },
      { id: "viden", titel: "Viden", tekst: "Her finder du adresse-viden (fx smal opgang eller nøgle i skab) og nøgleskabe.", maal: "fane-adresser", kraeverSide: "adresser" },
      { id: "admin", titel: "Admin", tekst: "Her sætter du butikken op: brugere, biler, montører, varer og ydelser.", maal: "fane-admin", kraeverSide: "admin" },
      { id: "klokke", titel: "Notifikationer", tekst: "Klokken viser, hvad der er nyt på dine egne sager, fx en manglende vare eller et problem, montøren har meldt.", maal: "klokke" },
      { id: "konto", titel: "Din konto", tekst: "Her sætter du PIN eller Face ID op, så du kan logge hurtigt ind.", maal: "konto" },
      { id: "hjaelp", titel: "Hjælp", tekst: "Her finder du rundturene igen, når du får brug for dem. Hver side og hver større funktion har sin egen korte rundtur, og du får tilbudt den første gang, du besøger siden.", maal: "hjaelp" },
    ],
  },
  {
    id: "forside",
    titel: "Forsiden",
    beskrivelse: "Dit overblik, og hvordan du sætter forsiden op.",
    omraade: "Sider",
    tilbyd: true,
    side: "dashboard",
    kraeverSide: "dashboard",
    trin: [
      { id: "overblik", titel: "Dit overblik", tekst: "Forsiden samler det, du skal bruge i dag: sager, der kræver handling, dagens rute og pluk, nye notifikationer og kommende sager.", maal: "forside-top" },
      { id: "knapper", titel: "Knapper øverst", tekst: "Bookede varer viser alle bookinger, Papirkurv henter slettede sager tilbage (kun med rettighed), og Tilpas lader dig vælge, hvilke kasser forsiden viser.", maal: "forside-knapper" },
      { id: "kasser", titel: "Kasserne", tekst: "Hver kasse er en genvej. Tryk på overskriften for at gå til den side, kassen hører til. Du ser kun de kasser, din rolle må bruge.", maal: "forside-kasser" },
    ],
  },
  {
    id: "opret-sag",
    titel: "Opret en ny sag",
    beskrivelse: "Sådan booker du en sag trin for trin.",
    omraade: "Funktioner",
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
  {
    id: "planlaegning",
    titel: "Planlægning",
    beskrivelse: "Ugen, bilerne og sager, der skal planlægges.",
    omraade: "Sider",
    tilbyd: true,
    side: "planlaegning",
    kraeverSide: "planlaegning",
    trin: [
      { id: "overblik", titel: "Planlægning", tekst: "Her fordeler du sager på dage og biler. Tallet under overskriften viser, hvor mange sager der kræver handling. Dato-vælgeren skifter dag.", maal: "plan-top" },
      { id: "soeg", titel: "Find en sag", tekst: "Søg på sagsnummer, ordre- eller fakturanummer, telefon, adresse eller kundenavn. Resultaterne erstatter ugen, indtil du rydder søgningen.", maal: "plan-soeg" },
      { id: "uge", titel: "Ugen", tekst: "Her ser du hver bil og dag. Åbn en dag for at se turen, flytte en sag til en anden bil eller ændre rækkefølgen med pilene. Rækkefølgen er den, montøren kører, og den, lageret læsser bilen efter.", maal: "plan-uge" },
      { id: "handling", titel: "Kræver handling", tekst: "Sager, der ikke kan køre som planlagt: sygemelding eller feriefridag, sager uden dato eller bil, og sager med fejl. Tryk på en kasse for at åbne den.", maal: "plan-handling" },
      { id: "skal-planlaegges", titel: "Skal planlægges", tekst: "Åbn kassen. På hvert kort får du et forslag til bil og dag, og med to eller flere sager uden dato kan du trykke Foreslå plan. Du ser hele planen, før noget gemmes, og sager med en aftalt dato flyttes aldrig.", maal: "plan-skal-planlaegges" },
    ],
  },
  {
    id: "lager",
    titel: "Lager og pluk",
    beskrivelse: "Pluk pr. bil i læsserækkefølge, og hvis noget mangler.",
    omraade: "Sider",
    tilbyd: true,
    side: "lager",
    kraeverSide: "lager",
    trin: [
      { id: "overblik", titel: "Dagens pluk", tekst: "Her ser du varerne til den valgte dag. En sag vises først, når den har en bil, der kører. Skift dag med dato-vælgeren.", maal: "lager-top" },
      { id: "visning", titel: "Pr. bil eller alle varer", tekst: "Pr. bil viser hver bil for sig med stoppene i den rækkefølge, bilen læsses: det sidste stop på ruten først, fordi det skal stå længst inde. Alle varer er den flade liste.", maal: "lager-visning" },
      { id: "stop", titel: "Et stop ad gangen", tekst: "Hvert stop viser, hvornår det læsses, og hvornår det kører. Afkryds varerne, efterhånden som de er plukket og stillet i bilen.", maal: "lager-stop" },
      { id: "pile", titel: "Arranger turen", tekst: "Pilene flytter stoppet i bilen. Husk, at det også ændrer montørens rækkefølge for dagen.", maal: "lager-pile" },
      { id: "mangler", titel: "Kan en vare ikke findes?", tekst: "Tryk på advarselstrekanten ved varen og vælg en grund. Sælgeren får besked med det samme, og varen står under Kan ikke findes, til den er fundet eller skiftet.", maal: null },
    ],
  },
  {
    id: "viden",
    titel: "Viden",
    beskrivelse: "Adresse-viden og nøgleskabe.",
    omraade: "Sider",
    tilbyd: true,
    side: "adresser",
    kraeverSide: "adresser",
    trin: [
      { id: "overblik", titel: "Viden om adresser", tekst: "Her samler butikken det, man ellers kun ved af erfaring: smal opgang, nøgle i skab, behov for to mand. Viden, du lægger ind her, vises på sagerne med den adresse.", maal: "viden-top" },
      { id: "skabe", titel: "Nøgleskabe", tekst: "Nøgleskabe til boligforeninger: hvilket område skabet dækker, og hvor det sidder. Søg efter område eller navn.", maal: "viden-skabe" },
    ],
  },
  {
    id: "admin",
    titel: "Opsætning",
    beskrivelse: "Brugere, biler, montører, varer og ydelser.",
    omraade: "Sider",
    tilbyd: true,
    side: "admin",
    kraeverSide: "admin",
    trin: [
      { id: "overblik", titel: "Opsætning", tekst: "Her tilpasser du butikken. Du ser kun de faner, du har rettighed til.", maal: "admin-top" },
      { id: "faner", titel: "Fanerne", tekst: "Hver fane er ét emne: fx Brugere (opret og giv rettigheder), Biler, Montører (bil, ferie, sygemelding) samt varer og ydelser. Ændringer gælder med det samme for hele butikken.", maal: "admin-faner" },
    ],
  },
  {
    id: "montor",
    titel: "Din dag som montør",
    beskrivelse: "Dagens rute, og hvordan du starter og færdigmelder en sag.",
    omraade: "Start her",
    automatisk: true,
    tilbyd: false,
    side: "montor",
    kraeverSide: "montor",
    roller: ["montor", "medhjaelper"],
    trin: [
      { id: "velkommen", titel: "Velkommen til P1SYBS", tekst: "Her er en kort rundtur i din dag: ruten, og hvad du gør ved hver sag. Den tager et minut. Du kan altid se den igen under Hjælp-knappen øverst.", maal: null },
      { id: "rute", titel: "Dagens rute", tekst: "Her ser du dagens sager på din bil. Dato-vælgeren skifter dag, så du kan kigge frem i tiden.", maal: "montor-top" },
      { id: "stop", titel: "Stoppene", tekst: "Sagerne ligger i den rækkefølge, du skal køre dem. Tryk på et stop for at åbne sagen. Med pilene på et kort kan du flytte stoppet, hvis turen skal ændres.", maal: "montor-stop" },
      { id: "sagen", titel: "Når du er hos kunden", tekst: "Åbn sagen, start den, skriv noter, tag billeder og tilføj materialer. Er der et problem, melder du det på sagen. Til sidst trykker du Færdigmeld.", maal: null },
      { id: "klokke", titel: "Notifikationer", tekst: "Klokken viser, hvad der er nyt.", maal: "klokke" },
      { id: "konto", titel: "Din konto", tekst: "Her sætter du PIN eller Face ID op, så du kan logge hurtigt ind.", maal: "konto" },
    ],
  },
];

// Guides en bruger kan se. brugerdata: { rolle, erSystemadmin, tilladteSider: [..], kanOpretteSager }.
//   roller / ikkeRoller på en guide begrænser den til bestemte roller (systemadmin ser dem alle).
//   Trin, der peger på en side, brugeren ikke har adgang til, udelades, så rundturen aldrig viser noget, man ikke kan bruge.
//   tekstPrRolle på et trin giver en tekst tilpasset rollen.
// En guide, der er automatisk for en bestemt rolle, starter ikke af sig selv for en systemadmin med en anden rolle.
export function guidesForBruger({ rolle, erSystemadmin = false, tilladteSider = [], kanOpretteSager = false } = {}) {
  const passerRolle = (g) => (!g.roller || g.roller.includes(rolle)) && !(g.ikkeRoller || []).includes(rolle);
  return GUIDES
    .filter((g) => erSystemadmin || passerRolle(g))
    .filter((g) => g.kraever !== "opret" || kanOpretteSager)
    .filter((g) => !g.kraeverSide || tilladteSider.includes(g.kraeverSide))
    .map((g) => ({
      ...g,
      automatisk: !!g.automatisk && passerRolle(g),
      trin: g.trin
        .filter((t) => !t.kraeverSide || tilladteSider.includes(t.kraeverSide))
        .map((t) => ({ ...t, tekst: (t.tekstPrRolle && t.tekstPrRolle[rolle]) || t.tekst })),
    }))
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

// Rækkefølgen af områder i Hjælp-menuen.
export const OMRAADE_RAEKKEFOELGE = ["Start her", "Sider", "Funktioner"];
export function grupperGuides(guides) {
  const grupper = [];
  for (const navn of OMRAADE_RAEKKEFOELGE) {
    const liste = guides.filter((g) => (g.omraade || "Funktioner") === navn);
    if (liste.length) grupper.push({ navn, guides: liste });
  }
  return grupper;
}

// Guiden for den side, brugeren står på (til "Til denne side" i Hjælp-menuen).
export const guideForSide = (guides, side) => (side ? (guides || []).find((g) => g.side === side) || null : null);

// Den rundtur, der tilbydes (ikke tvinges), første gang brugeren besøger en side: kun hvis ingen anden rundtur starter af sig selv,
// guiden ikke er set, og siden er en af dem, der har sin egen guide.
// Et tilbud vises højst ÉN gang pr. guide: er det først vist (nøgle "tilbud:<id>" i set), kommer det ikke igen, selv om brugeren ikke trykker på det.
// Rundturen findes stadig i Hjælp-menuen, som længe den ikke er set.
export const tilbudNoegle = (guideId) => `tilbud:${guideId}`;
export function tilbudForSide(guides, set, side) {
  const g = guideForSide(guides, side);
  return g && g.tilbyd && !set?.[g.id] && !set?.[tilbudNoegle(g.id)] ? g : null;
}
