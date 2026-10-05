// SYGEMELDING/FERIEFRIDAG I PLANLÆGNINGEN (oktober 2026). Ren logik (tests/fravaer.test.mjs).
//
// "Montørproblem" og "Sygemelding" var to flader for næsten det samme: en sag, der ikke kan køres, fordi
// bilen ikke har nogen til at køre den. De er lagt sammen til én: "Sygemelding/feriefridag". Hver sag viser
// stadig SIN årsag, for "bilen er ude af drift" og "montøren er syg" kræver forskellige beslutninger.

// Årsagen for en sag, hvor ALLE på bilen har fravær: sygdom eller ferie/fridag, med navne.
export function fravaersAarsag(fravaer) {
  const liste = Array.isArray(fravaer) ? fravaer : [];
  const navne = liste.map((a) => a?.person?.navn).filter(Boolean).join(", ");
  const harSygdom = liste.some((a) => a?.fravaer?.type === "sygdom");
  const harFerie = liste.some((a) => a?.fravaer && a.fravaer.type !== "sygdom");
  const hvad = harSygdom && harFerie ? "Sygemeldt/ferie" : harSygdom ? "Sygemeldt" : "Ferie/fridag";
  return navne ? `${hvad}: ${navne}` : hvad;
}

// Lægger de to lister sammen, sorteret efter dato og starttid. Hver sag får sin årsag i _issue.
export function samlFravaer(montoerproblemer, sygemeldinger, sorter) {
  const syge = (sygemeldinger || []).map((s) => ({ ...s, _issue: s._issue || fravaersAarsag(s._fravaer) }));
  return [...(montoerproblemer || []), ...syge].sort(sorter);
}
