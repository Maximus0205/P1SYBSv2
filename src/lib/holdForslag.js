// FORSLAG TIL DAGENS HOLD (oktober 2026): hvilken medhjælper kører med hvilken bil? Ren logik uden React/Supabase
// (tests/holdForslag.test.mjs). Forslaget er RÅDGIVENDE - UI'et viser det, og en planlægger godkender eller retter, før
// noget gemmes (tabellen day_helpers).
//
// Begreber:
//  - Bil: en bil med en eller flere montører, der arbejder den dag. En medhjælper kører med en BIL (som motoren regner den
//    anden person på bilen, se lib/dagsplan.js).
//  - "To-mands-stop": en sag med order.toMand (kræver to mand). Kun biler med mindst ét sådant stop FÅR et forslag, medmindre
//    der er et fast makkerpar (se nedenfor).
//  - Fast makkerpar: montør + medhjælper der altid kører sammen. De sættes sammen først, når begge arbejder, og bilen har
//    mindst ét stop den dag (ellers ville medhjælperen stå på en tom bil).
//  - Kører alene: en montør der aldrig får en (ikke-fast) medhjælper. Har bilen alligevel et to-mands-stop, meldes det som
//    "mangler" - systemet vælger ikke bare en medhjælper alligevel.
//  - Retfærdighed: er der flere medhjælpere end biler der skal have en, står dem med flest dage på det seneste over. Derefter
//    foretrækkes den medhjælper, der har kørt FÆRREST gange på netop denne bil (variation), og endelig dem med færrest dage.
//  - Fravær/arbejdstid: kalderen sender KUN medhjælpere der arbejder den dag (se UI'et), og kun de montører der arbejder.

const antal = (m, k) => m.get(k) || 0;
const nøgle = (a, b) => `${a}|${b}`;

// biler: [{ id, navn, montoerIds: [personId...] (dem der arbejder), stop: n, toMandStop: n }]
// hjaelpere: [{ id, navn }]   (kun ledige: arbejder den dag)
// faste: [{ montorId, helperId }]
// alene: [montorId...]
// historik: [{ dato, helperId, vehicleId }]  (tidligere dages hold, til retfærdighed)
// laast: [{ personId, vehicleId }]           (allerede godkendt - bevares uændret)
export function foreslaaHold({ biler = [], hjaelpere = [], faste = [], alene = [], historik = [], laast = [] } = {}) {
  const tildelinger = [];
  const mangler = [];
  const brugt = new Set(); // medhjælpere der er sat på en bil
  const dækket = new Set(); // biler der allerede har en medhjælper (eller to montører)
  const hjMap = new Map(hjaelpere.map((h) => [h.id, h]));
  const aleneSet = new Set(alene);
  const bilMap = new Map(biler.map((b) => [b.id, b]));

  // 1) Allerede godkendt bevares - også hvis personen ikke længere er "ledig" (planlæggeren har valgt det).
  for (const l of laast) {
    if (!l?.personId || !bilMap.has(l.vehicleId) || brugt.has(l.personId)) continue;
    brugt.add(l.personId); dækket.add(l.vehicleId);
    tildelinger.push({ personId: l.personId, vehicleId: l.vehicleId, aarsag: "laast" });
  }

  // 2) Faste makkerpar.
  for (const f of faste) {
    const h = hjMap.get(f.helperId);
    if (!h || brugt.has(h.id)) continue;
    const bil = biler.find((b) => !dækket.has(b.id) && b.stop > 0 && b.montoerIds.includes(f.montorId));
    if (!bil || b2alene(bil, aleneSet)) continue;
    brugt.add(h.id); dækket.add(bil.id);
    tildelinger.push({ personId: h.id, vehicleId: bil.id, aarsag: "fast" });
  }

  // 3) Biler med to-mands-stop der stadig mangler en medhjælper.
  const brug = biler
    .filter((b) => b.toMandStop > 0 && b.montoerIds.length >= 1 && !dækket.has(b.id) && b.montoerIds.length < 2)
    .sort((a, b) => b.toMandStop - a.toMandStop || String(a.id).localeCompare(String(b.id)));
  const alleneBiler = brug.filter((b) => b2alene(b, aleneSet));
  for (const b of alleneBiler) mangler.push({ vehicleId: b.id, aarsag: "alene" });
  const kandidater = brug.filter((b) => !b2alene(b, aleneSet));

  const total = new Map();
  const paaBil = new Map();
  for (const r of historik) {
    total.set(r.helperId, antal(total, r.helperId) + 1);
    paaBil.set(nøgle(r.helperId, r.vehicleId), antal(paaBil, nøgle(r.helperId, r.vehicleId)) + 1);
  }

  let pulje = hjaelpere.filter((h) => !brugt.has(h.id));
  // Flere medhjælpere end biler: de med flest dage står over.
  if (pulje.length > kandidater.length) {
    pulje = [...pulje].sort((a, b) => antal(total, a.id) - antal(total, b.id) || a.navn.localeCompare(b.navn, "da") || String(a.id).localeCompare(String(b.id))).slice(0, kandidater.length);
  }
  for (const bil of kandidater) {
    if (pulje.length === 0) { mangler.push({ vehicleId: bil.id, aarsag: "ingen-ledig" }); continue; }
    pulje.sort((a, b) =>
      antal(paaBil, nøgle(a.id, bil.id)) - antal(paaBil, nøgle(b.id, bil.id))
      || antal(total, a.id) - antal(total, b.id)
      || a.navn.localeCompare(b.navn, "da") || String(a.id).localeCompare(String(b.id)));
    const valgt = pulje.shift();
    brugt.add(valgt.id); dækket.add(bil.id);
    tildelinger.push({ personId: valgt.id, vehicleId: bil.id, aarsag: "forslag" });
  }

  const ledige = hjaelpere.filter((h) => !brugt.has(h.id)).map((h) => h.id);
  return { tildelinger, mangler, ledige };
}

const b2alene = (bil, aleneSet) => bil.montoerIds.some((id) => aleneSet.has(id));

// Teksten til UI'et ud for en "mangler"-linje.
export const manglerTekst = (aarsag) => (aarsag === "alene"
  ? "Montøren kører alene, men bilen har et to-mands-stop"
  : "Ingen ledig medhjælper til et to-mands-stop");
