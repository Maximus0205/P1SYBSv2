// SAGSTYPER (september 2026): almindelig kundesag vs. TOMGANG.
//
// "Tomgang" er en kørsel til et TOMT LEJEMÅL - typisk en udlejer eller
// administrator, der har bestilt arbejde udført, inden en ny lejer flytter
// ind. Montøren lukker sig selv ind med en udleveret nøgle, og der er
// INGEN til stede på adressen.
//
// Det lyder som en detalje, men det ændrer flere ting i arbejdsgangen på
// én gang, og derfor er det en rigtig type frem for blot et flueben:
//
//   * NØGLEN ER IKKE VALGFRI. På en almindelig sag er nøgle/adgang en
//     undtagelse; her er den forudsætningen for overhovedet at komme ind.
//     Mangler den, kan montøren køre forgæves - det er den vigtigste
//     enkeltoplysning på hele sagen.
//   * INGEN KONTAKT PÅ ADRESSEN. Ankomst-SMS og "ring til kunden" giver
//     ikke mening - der er ingen at ringe til, og en SMS om at montøren er
//     der om 20 minutter er i bedste fald forvirrende for en udlejer, der
//     sidder et helt andet sted. Kontaktpersonen (rekvirenten) findes
//     stadig, men skal kontaktes om SAGEN, ikke om ankomsten.
//   * DOKUMENTATIONEN ER DEN ENESTE KVITTERING. Der er ingen til at
//     bekræfte, at arbejdet blev udført, eller hvordan lejemålet så ud, da
//     montøren kom og gik. Billederne er beviset - både for os og over for
//     rekvirenten, hvis der senere kommer en indsigelse.
//
// Bevidst holdt som en LILLE, selvstændig fil frem for endnu et lag i
// domain.js: typen er et tværgående begreb, som både oprettelsen,
// montørvisningen og planlægningen skal kunne spørge om, og den skal være
// let at finde og udvide, hvis der senere kommer flere typer til (fx
// serviceopgaver eller reklamationer).
//
// FIRE SAGSTYPER (oktober 2026): Kundesag, Tomgang, Servicetur og Specialtur.
// Typerne svarer på HVEM der tager imod og HVAD slags tur det er. REKLAMATION er
// bevidst IKKE en sagstype: en reklamation oprettes som en opfølgning direkte på
// den oprindelige sag (se opfølgningstyperne nederst), så den er linket til sagen
// og kan spores tilbage.
//
//   * SERVICETUR: kunden er hjemme og varen står der allerede (eftersyn, tjek,
//     mindre fejl). Der er ofte intet nyt at pakke ud, og modelnummeret er ikke
//     altid kendt - det er derfor ikke påkrævet. Bruges sammen med en ydelse med
//     opgavebeskrivelse (se lib/ydelser.js), hvor sælgeren skriver, hvad der skal gøres.
//   * SPECIALTUR: en særopgave, som ikke alle montører nødvendigvis kan (fx en
//     lofthængt emhætte). Tiden for HELE turen sættes manuelt (manuelTid), der er en
//     fri beskrivelse af opgaven (specialBeskrivelse, grundlag for senere
//     sammenligning med tidligere specialture) og et valgfrit krav til montøren
//     (specialKrav). Der er ingen automatisk kompetencestyring - kravet er en tekst,
//     som planlæggeren og montøren kan se.

export const SAGSTYPE_KUNDE = "kunde";
export const SAGSTYPE_TOMGANG = "tomgang";
export const SAGSTYPE_SERVICETUR = "servicetur";
export const SAGSTYPE_SPECIALTUR = "specialtur";

// Sager oprettet FØR typen blev indført har ingen sagstype-værdi. De
// behandles som almindelige kundesager - hvilket de også var. Derfor
// bruges en fallback overalt frem for at migrere gammel data: en
// migrering ville skulle gætte, og gættet ville være det samme som
// fallbacken.
export const caseType = (order) => order?.sagstype || SAGSTYPE_KUNDE;
export const isTomgang = (order) => caseType(order) === SAGSTYPE_TOMGANG;
export const isServicetur = (order) => caseType(order) === SAGSTYPE_SERVICETUR;
export const isSpecialtur = (order) => caseType(order) === SAGSTYPE_SPECIALTUR;

// Farve til markeringen i lister og på sagskort. Tomgang får en anden
// farve end brandfarven, så den kan skelnes fra "nøgle kræves" på en
// almindelig sag - de to ligner hinanden, men betyder noget forskelligt.
// Servicetur og specialtur har hver deres farve af samme grund. Alle tre har
// tilstrækkelig kontrast mod hvid til lille tekst, og typen står altid også som
// tekst - farven er aldrig det eneste tegn.
export const KUNDE_COLOR = "#E2621B";
export const TOMGANG_COLOR = "#6B5B95";
export const SERVICETUR_COLOR = "#1F7A8C";
export const SPECIALTUR_COLOR = "#9A5B00";

export const CASE_TYPES = [
  {
    id: SAGSTYPE_KUNDE,
    label: "Kundesag",
    kort: "Kunde",
    beskrivelse: "Kunden er hjemme og tager imod montøren.",
    farve: KUNDE_COLOR,
  },
  {
    id: SAGSTYPE_TOMGANG,
    label: "Tomgang (tomt lejemål)",
    kort: "Tomgang",
    beskrivelse: "Tomt lejemål — montøren lukker sig selv ind med nøgle. Ingen er til stede.",
    farve: TOMGANG_COLOR,
  },
  {
    id: SAGSTYPE_SERVICETUR,
    label: "Servicetur",
    kort: "Servicetur",
    beskrivelse: "Kunden er hjemme, og varen står allerede der. Eftersyn, tjek eller mindre fejl.",
    farve: SERVICETUR_COLOR,
  },
  {
    id: SAGSTYPE_SPECIALTUR,
    label: "Specialtur",
    kort: "Specialtur",
    beskrivelse: "Særopgave, som ikke alle montører kan. Tiden sættes manuelt.",
    farve: SPECIALTUR_COLOR,
  },
];

export const caseTypeLabel = (order) => CASE_TYPES.find((t) => t.id === caseType(order))?.kort || "Kunde";
export const caseTypeColor = (order) => CASE_TYPES.find((t) => t.id === caseType(order))?.farve || KUNDE_COLOR;

// Skal hver varelinje have et modelnummer, før sagen kan bookes? Ja på alle typer undtagen
// servicetur: dér står varen allerede hos kunden, og modelnummeret er ikke altid kendt, når
// turen bookes. Et angivet modelnummer bruges stadig som før. Tager en sag eller blot
// { sagstype }, så formularen kan spørge, før sagen findes.
export const kraeverModelnummer = (order) => caseType(order) !== SAGSTYPE_SERVICETUR;

// ---------------------------------------------------------------------------
// SPECIALTUR: manuel tid, beskrivelse og krav til montør.
//
// manuelTid er den forventede tid for HELE turen i minutter og erstatter summen af
// varelinjernes tider (se orderExpectedMinutes i domain.js), så kapacitetstjek, forslag og
// planlægning regner med den. Felterne er flade på sagen (ikke et indlejret objekt), så
// sammenfletning af samtidige rettelser (lib/orderMerge.js) virker felt for felt.
export const SPECIAL_MAKS_MINUTTER = 24 * 60;

// Den manuelle tid i hele minutter, eller null når sagen ikke er en specialtur, eller tiden
// ikke er sat til noget brugbart (tom, 0, negativ eller ikke et tal). Så falder
// beregningen tilbage på varelinjerne, i stedet for at en tom værdi giver en tur på 0 minutter.
export function specialMinutter(order) {
  if (!isSpecialtur(order)) return null;
  const raa = order?.manuelTid;
  if (raa === null || raa === undefined || raa === "") return null;
  const m = Math.round(Number(raa));
  return Number.isFinite(m) && m > 0 ? m : null;
}

// Hvad mangler der på en specialtur? Tom liste = i orden (og altid tom for andre typer).
// Bruges som krav i oprettelsen og i redigeringen: uden beskrivelse og tid giver en specialtur
// ingen mening, og beskrivelsen er netop det, senere forslag til tid skal kunne bygge på.
export function specialturFejl(order) {
  if (!isSpecialtur(order)) return [];
  const fejl = [];
  if (!(order?.specialBeskrivelse ?? "").toString().trim()) {
    fejl.push("Beskriv opgaven, så montøren og senere forslag til tid ved, hvad der skal gøres.");
  }
  const raa = order?.manuelTid;
  const tom = raa === null || raa === undefined || raa === "";
  const tal = Number(raa);
  if (tom || !Number.isFinite(tal) || tal <= 0) {
    fejl.push("Angiv den forventede tid for hele turen i minutter.");
  } else if (tal > SPECIAL_MAKS_MINUTTER) {
    fejl.push("Tiden kan højst være 24 timer (1440 minutter).");
  }
  return fejl;
}

// Skal der kunne sendes ankomst-SMS og ringes til kunden fra sagen?
// Nej ved tomgang: der er ingen på adressen. Rekvirentens nummer står
// stadig på sagen og kan bruges, men det er en anden slags opkald - om
// sagen, ikke om at montøren er på vej.
export const showsArrivalContact = (order) => !isTomgang(order);

// Hvad mangler der, før en tomgangssag er forsvarligt oprettet? Bruges
// som en BLØD advarsel i oprettelsen - ikke en spærring. Der findes
// virkelige tilfælde, hvor nøgleaftalen først falder på plads dagen efter
// bestillingen, og at blokere oprettelsen ville bare få folk til at
// skrive "afklares" i feltet for at komme videre. Så hellere en synlig
// påmindelse, der kan handles på.
export function tomgangWarnings(order) {
  if (!isTomgang(order)) return [];
  const mangler = [];
  if (!order?.noegle?.kraeves) {
    mangler.push("Ingen nøgle/adgang er registreret — montøren kan ikke komme ind.");
  } else if (!order?.noegle?.placering && !order?.noegle?.detaljer) {
    mangler.push("Nøglen er markeret som påkrævet, men det står ikke hvor den findes.");
  }
  return mangler;
}

// ---------------------------------------------------------------------------
// OPFØLGNINGSTYPE (september 2026)
//
// Uafhængig af SAGSTYPE ovenfor - en opfølgning kan sagtens være en
// tomgangskørsel OG en reklamation på samme tid. Denne type svarer i
// stedet på "HVORFOR skal montøren tilbage?", ikke "hvem tager imod".
//
// Bevidst KUN valgfri ved oprettelse af en OPFØLGNING (se DuplicatePanel i
// OrderView.jsx) - en helt almindelig, førstegangsbooking har ingen
// "hvorfor tilbage", så feltet giver ikke mening der og forbliver tomt
// (null) på almindelige sager, ligesom ældre sager oprettet før feltet
// fandtes.
export const FOLLOWUP_TYPE_SPECIAL = "special";
export const FOLLOWUP_TYPE_REKLAMATION = "reklamation";
export const FOLLOWUP_TYPE_SERVICE = "service";

export const FOLLOWUP_TYPES = [
  { id: FOLLOWUP_TYPE_SPECIAL, label: "Specialtur", beskrivelse: "En særskilt, aftalt tur uden for det normale forløb." },
  { id: FOLLOWUP_TYPE_REKLAMATION, label: "Reklamation", beskrivelse: "Noget er galt med det oprindelige arbejde eller produktet." },
  { id: FOLLOWUP_TYPE_SERVICE, label: "Servicetur", beskrivelse: "Planlagt eftersyn eller service, intet er nødvendigvis galt." },
];

export const followUpTypeLabel = (order) => FOLLOWUP_TYPES.find((t) => t.id === order?.opfoelgningsType)?.label || null;
