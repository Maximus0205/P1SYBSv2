// LISTER TIL OFFLINE (oktober 2026): biler, nøgleskabe og hold hentes som en liste pr. butik. Uden net skal sidst hentede
// udgave vises, ellers kan montørsiden ikke engang finde montørens bil ("Din bil kunne ikke findes").
// Rene regler (ingen IndexedDB/Supabase - alt gives udefra), afprøvet i tests/listeCache.test.mjs. Se laeseCache.js for
// cachens regler: den LÆSES kun ved en netværksfejl, skrives aldrig til, ryddes ved logud og er højst 14 dage gammel.
//
// hentMedStatus: async () => { ok, netvaerk, vaerdi }. Svarer
//   { vaerdi, fraCache: null }          databasen svarede (og er gemt til næste gang)
//   { vaerdi, fraCache: <gemt-tid> }    ingen forbindelse - viser det sidst hentede
//   null                                intet at vise (afvist af serveren, eller ingen gemt kopi): kalderen beholder det, den har
export async function hentListeMedCache({ noegle, hentMedStatus, cache, ejer, saetVis, kilde }) {
  const r = await hentMedStatus();
  if (r.ok) {
    saetVis?.(kilde, null);
    const id = await ejer();
    if (id) cache.gem(noegle(id), { vaerdi: r.vaerdi });   // bevidst uden await: en langsom cache må ikke forsinke visningen
    return { vaerdi: r.vaerdi, fraCache: null };
  }
  if (!r.netvaerk) return null;
  const id = await ejer();
  if (!id) return null;
  const gemt = await cache.hent(noegle(id));
  if (!gemt || gemt.vaerdi?.vaerdi === undefined) return null;
  saetVis?.(kilde, gemt.gemt);
  return { vaerdi: gemt.vaerdi.vaerdi, fraCache: gemt.gemt };
}

export const listeNoegle = (navn, butikId) => (ejerId) => `liste:${navn}:${ejerId}:${butikId}`;
