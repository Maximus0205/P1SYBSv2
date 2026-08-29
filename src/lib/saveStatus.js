// Kanal for "en skrivning til databasen mislykkedes" (august 2026).
//
// BAGGRUNDEN: appen opdaterer optimistisk - ændringen vises med det samme
// i UI'et, og skrivningen til Supabase sker bagefter. Fejlede den
// skrivning (fx fordi rettighedstriggeren på orders afviste den med
// 'Mangler rettigheden "Feltarbejde"', eller fordi mobilen mistede
// forbindelsen midt i et besøg), blev fejlen kun logget - brugeren så
// stadig sin ændring på skærmen og gik derfra i god tro om, at den var
// gemt. Det er den værste slags fejl i et system som dette: den ser ud
// som om alt gik godt.
//
// Bevidst holdt så simpelt som overhovedet muligt - et Set af lyttere,
// ingen ny dependency, ingen context-provider gennem hele App.jsx. Den
// eneste forbruger er SaveErrorBanner.jsx, som er monteret én gang i
// main.jsx, uden for React Router, så banneret overlever navigation.
//
// Kun den SENESTE fejl huskes. Fejler fx en CSV-import med 30 sager,
// hjælper det ingen at få 30 bannere - det er den samme årsag, og
// brugeren skal have ÉN klar besked og en vej videre (prøv igen / hent
// friske data).

const listeners = new Set();
let current = null; // { besked, tidspunkt } | null

// En fejl i en lytter må ALDRIG vælte den handling, der udløste den -
// fejlrapportering er det sidste sted, hvor det giver mening at kaste
// videre. Kaldes både fra notify() og fra den første, umiddelbare
// levering i subscribeSaveFailure (RETTET august 2026: den sidste stod
// tidligere uden for beskyttelsen, så en lytter der kastede, væltede
// selve tilmeldingen - fundet af testen af dette modul).
function deliver(fn) {
  try {
    fn(current);
  } catch (_) {
    // Bevidst stille - se ovenfor.
  }
}

function notify() {
  listeners.forEach(deliver);
}

// Kaldes fra data-laget, når en skrivning IKKE gik igennem. besked bør
// være noget, en butiksmedarbejder kan handle på - databasens egne
// rettighedsfejl er allerede skrevet på dansk (se
// orders_guard_field_groups i Supabase), så de kan vises direkte.
export function reportSaveFailure(besked) {
  current = { besked: besked || "Ændringen blev ikke gemt.", tidspunkt: Date.now() };
  notify();
}

export function clearSaveFailure() {
  if (!current) return;
  current = null;
  notify();
}

export function subscribeSaveFailure(fn) {
  listeners.add(fn);
  deliver(fn); // giv den nye lytter den aktuelle tilstand med det samme
  return () => listeners.delete(fn);
}
