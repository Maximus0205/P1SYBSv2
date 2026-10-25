// ADGANGSFORHOLD PÅ ADRESSEN (oktober 2026): etage og besværlig parkering.
//
// Registreres ved booking som VALGFRIE oplysninger. To formål:
//   1. Montøren ser dem på sagen og ved, hvad der venter (3. sal uden at have hørt om det, eller en bil der ikke kan holde tæt på).
//   2. De bygger grundlaget for senere at kunne regne en tid, der passer til netop denne adresse: tiden for en montering på 3. sal
//      adskiller sig fra en i stuen, og det kan systemet først lære, når det er registreret på de afsluttede sager.
//      (Endnu bruges de IKKE i tidsforslaget - se data/estimates.js.)
//
// Felterne ligger flade på sagen (etage, parkeringBesvaerlig), så sammenfletning af samtidige rettelser
// (lib/orderMerge.js) virker felt for felt. Sager uden felterne er helt almindelige: "ikke oplyst".

export const ETAGER = [
  { id: "stue", label: "Stue" },
  { id: "1", label: "1. sal" },
  { id: "2", label: "2. sal" },
  { id: "3", label: "3. sal" },
  { id: "4+", label: "4. sal eller højere" },
];

export const etageLabel = (id) => ETAGER.find((e) => e.id === id)?.label || null;

// En gyldig etage-værdi, ellers null (så en ukendt eller tom værdi aldrig gemmes).
export const gyldigEtage = (id) => (ETAGER.some((e) => e.id === id) ? id : null);

// De felter, der skal på en sag, når de er oplyst. Tom = ingenting at gemme (feltet udelades helt).
export function adgangsFelter(kilde) {
  const etage = gyldigEtage(kilde?.etage);
  return {
    ...(etage ? { etage } : {}),
    ...(kilde?.parkeringBesvaerlig === true ? { parkeringBesvaerlig: true } : {}),
  };
}

// Kort tekst til visning ("3. sal · Besværlig parkering"), eller tom streng, når intet er oplyst.
export function adgangTekst(sag) {
  const dele = [];
  const e = etageLabel(sag?.etage);
  if (e) dele.push(e);
  if (sag?.parkeringBesvaerlig === true) dele.push("Besværlig parkering");
  return dele.join(" · ");
}
