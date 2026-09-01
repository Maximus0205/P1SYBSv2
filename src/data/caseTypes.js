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

export const SAGSTYPE_KUNDE = "kunde";
export const SAGSTYPE_TOMGANG = "tomgang";

// Sager oprettet FØR typen blev indført har ingen sagstype-værdi. De
// behandles som almindelige kundesager - hvilket de også var. Derfor
// bruges en fallback overalt frem for at migrere gammel data: en
// migrering ville skulle gætte, og gættet ville være det samme som
// fallbacken.
export const caseType = (order) => order?.sagstype || SAGSTYPE_KUNDE;
export const isTomgang = (order) => caseType(order) === SAGSTYPE_TOMGANG;

export const CASE_TYPES = [
  {
    id: SAGSTYPE_KUNDE,
    label: "Kundesag",
    kort: "Kunde",
    beskrivelse: "Kunden er hjemme og tager imod montøren.",
  },
  {
    id: SAGSTYPE_TOMGANG,
    label: "Tomgang (tomt lejemål)",
    kort: "Tomgang",
    beskrivelse: "Tomt lejemål — montøren lukker sig selv ind med nøgle. Ingen er til stede.",
  },
];

export const caseTypeLabel = (order) => CASE_TYPES.find((t) => t.id === caseType(order))?.kort || "Kunde";

// Farve til markeringen i lister og på sagskort. Tomgang får en anden
// farve end brandfarven, så den kan skelnes fra "nøgle kræves" på en
// almindelig sag - de to ligner hinanden, men betyder noget forskelligt.
export const TOMGANG_COLOR = "#6B5B95";

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
