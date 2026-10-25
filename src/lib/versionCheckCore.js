// Rene regler for "er der en ny udgivelse?" (ingen DOM/fetch/import.meta), så de
// kan afprøves direkte med node (tests/versionCheck.test.mjs).
//
// bootBuild  = den udgivelse, den KODE der kører lige nu blev bygget som.
//              Skal være indbygget i selve koden ved bygning (se vite.config.js).
//              Hentes den i stedet fra serveren ved opstart, får en telefon med
//              en gammel, cachet index.html alligevel den NYESTE id og tror, den
//              er opdateret - og beskeden vises aldrig.
// latestSeen = den nyeste udgivelse, serveren oplyser (version.json).
//
// Kun når begge er kendte og forskellige, er der en ny udgave. Mangler en af
// dem (lokal udvikling, version.json ikke udgivet endnu, netværksfejl), vises
// intet - hellere ingen besked end en falsk.
export function erNyUdgave(bootBuild, latestSeen) {
  return typeof bootBuild === "string" && bootBuild !== "" &&
    typeof latestSeen === "string" && latestSeen !== "" &&
    bootBuild !== latestSeen;
}
