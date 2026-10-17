// Ren logik til "nyt på dagens pluk" (oktober 2026). Ingen browser, ingen database - kun reglerne, så de kan testes
// (tests/nytPluk.test.mjs). Hooken hooks/useNytPluk.js står for lagringen.
//
// Princip: hver bruger har pr. dag et "kendt" sæt af pluk-punkter (en nøgle pr. varelinje). Et punkt, der er på pluklisten nu,
// men ikke i det kendte sæt, er NYT siden sidst. Første gang dagen ses (intet kendt sæt endnu) er der intet nyt - ellers ville
// hele dagens liste blive meldt som ny. Brugeren trykker "Forstået", så bliver alt nuværende kendt.

export const nytPlukNoegle = (orderId, lineItemId) => `${orderId}:${lineItemId}`;

// noegler: pluk-punkter lige nu. kendt: Set/array af nøgler brugeren har set, eller null/undefined, hvis dagen ikke er set endnu.
export function nyeNoegler(noegler, kendt) {
  if (!kendt) return [];
  const set = kendt instanceof Set ? kendt : new Set(kendt);
  return (noegler || []).filter((n) => !set.has(n));
}
