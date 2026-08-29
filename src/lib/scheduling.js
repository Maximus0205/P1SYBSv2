// Ren, forklarlig planlægningslogik - INGEN AI. Én samlet forslagsmotor
// (suggestPlan) bruges til BÅDE nye bookinger og omlægning af eksisterende
// sager (montørproblem/sygemelding/skal planlægges) - den søger altid på
// tværs af BÅDE dato og montør samtidig, aldrig kun "find en anden montør
// samme dag". Det betyder, systemet frit kan foreslå at rykke en sag et
// par dage, hvis det giver en bedre plan (fx samler den med en
// nærliggende sag, eller undgår en overbooket dag) - vigtigt fordi
// butikken ikke har en dedikeret planlægger til manuelt at gennemgå
// ruterne, så systemet skal kunne planlægge så meget som muligt selv
// (aftalt eksplicit august 2026).

import { orderExpectedMinutes, isTechnicianAbsent, addDays } from "../data/domain";

const WORKDAY_MINUTES = 450; // ~7,5 time

// Luftlinje-afstand (km) mellem to koordinater (Haversine) - bruges KUN
// til at RANGERE kandidater indbyrdes (er sag A tættere på end sag B),
// ikke til at vise en præcis køreafstand til brugeren. Ingen ekstra
// netværkskald nødvendigt - ren matematik, øjeblikkelig.
function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

function daysBetween(isoA, isoB) {
  const a = new Date(isoA + "T00:00:00");
  const b = new Date(isoB + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

// Lørdag (6) eller søndag (0). Samme lokale dato-parsning som resten af
// filen (isoDato + "T00:00:00"), så en dato aldrig tolkes en dag forkert
// pga. tidszone.
function isWeekend(iso) {
  if (!iso) return false;
  const day = new Date(iso + "T00:00:00").getDay();
  return day === 0 || day === 6;
}

// Genererer en simpel liste af "days" fortløbende datoer fra startIso -
// bekvemmelighed for den kaldende komponent, som selv skal geokode
// adresser for datoerne i vinduet (se sameBuildingDates/nearbyDates).
export function planningWindow(startIso, days) {
  return Array.from({ length: days }, (_, i) => addDays(startIso, i));
}

// Den samlede forslagsmotor. Scorer hver (dato, montør)-kombination inden
// for det givne vindue af dates, ud fra:
//  1. Samme opgang/bygning som en anden sag samme dag (stærkeste signal)
//  2. Køreafstand til andre sager samme dag (forudberegnet af den
//     kaldende komponent - se sameBuildingDates/nearbyDates)
//  3. Ledig kapacitet den dag (undgå at overbooke en montør)
//  4. Hvis originalDate er angivet: en MILD bias mod at blive tæt på den
//     (så en triviel, ligegyldig flytning ikke sker uden grund) - men
//     IKKE en hård begrænsning, en meget bedre kombination et par dage
//     væk kan sagtens vinde over "uændret dato".
//
// WEEKENDER FRASORTERES (RETTET august 2026): begge kaldere sendte
// weekender med i vinduet - booking-flowet via weekDays() (mandag-søndag)
// og "Kræver handling"-fliserne via planningWindow(i dag, 14). Da lørdag
// og søndag i praksis altid er helt tomme, gav de den HØJESTE
// ledig-kapacitet-score ("Helt ledig dag") og lå derfor typisk ØVERST i
// forslagslisten. Oveni forsvandt en sag, der blev booket på et sådant
// forslag, ud af ugeoverblikket i PlanningPage, som bevidst kun viser
// mandag-fredag. Filtreringen ligger HER (ét sted), ikke hos de to
// kaldere, så en fremtidig tredje kalder ikke falder i samme hul.
// Bemærk: dette begrænser kun hvad systemet SELV foreslår - vælger man
// manuelt en lørdag i InteractiveWeekPicker (som stadig viser alle syv
// dage), er det uændret muligt.
//
// excludeTechnicianIds udelukker specifikke montører helt fra kandidat-
// listen (fx den sygemeldte/defekte montør selv - der er jo netop
// PROBLEMET, ikke løsningen). Springer fraværende montører og allerede
// overbelastede dage over.
//
// requireTechnician (RETTET august 2026, fejl fundet ved test): når true,
// udelader "ikke tildelt" HELT fra kandidatlisten - et forslag der ikke
// rent faktisk tildeler en montør er ikke en løsning på "kræver handling",
// det er bare en dato sat på en stadig utildelt sag, som blot ville blive
// liggende i en ANDEN kræver-handling-kategori efter "Brug forslag" var
// trykket. Bruges af ReplanTile i PlanningPage.jsx (montørproblem/
// sygemelding/skal planlægges) - hvis INGEN rigtig montør kan tage sagen
// inden for vinduet, returneres der nu ærligt INTET forslag, i stedet for
// et der ser ud til at løse noget, men reelt ikke gør. Booking-flowets
// egne datoforslag (SuggestedDates) beholder standardværdien false, da
// "ikke tildelt" der er et legitimt, midlertidigt valg ved en ny booking.
export function suggestPlan({ dates, orders, technicians, timeOff, sameBuildingDates, nearbyDates, excludeTechnicianIds, originalDate, requireTechnician }) {
  const nearbyByDate = new Map();
  (nearbyDates || []).forEach(({ dato, km }) => {
    if (!nearbyByDate.has(dato) || nearbyByDate.get(dato) > km) nearbyByDate.set(dato, km);
  });
  const exclude = new Set(excludeTechnicianIds || []);
  const rows = [
    ...(technicians || []).filter((t) => !exclude.has(t.id)),
    ...(requireTechnician ? [] : [{ id: null, navn: "" }]),
  ];

  const candidates = [];
  for (const dato of dates || []) {
    if (isWeekend(dato)) continue; // se noten om weekender ovenfor
    const dayOrders = (orders || []).filter((o) => o.dato === dato && o.status !== "afsluttet");
    for (const t of rows) {
      if (t.id && isTechnicianAbsent(t.id, dato, timeOff)) continue;
      const loadMinutes = dayOrders.filter((o) => o.montorId === t.id).reduce((sum, o) => sum + orderExpectedMinutes(o), 0);
      if (loadMinutes > WORKDAY_MINUTES) continue; // allerede en fyldt dag - ikke et godt forslag

      let score = Math.max(0, (WORKDAY_MINUTES - loadMinutes) / 30); // ledig kapacitet, svag baggrundsfaktor
      let begrundelse = loadMinutes === 0 ? "Helt ledig dag" : `Kun ${Math.round((loadMinutes / 60) * 10) / 10}t booket i forvejen`;
      if (!t.id) score -= 20; // "ikke tildelt" er en sidste udvej, ikke et reelt forslag

      if ((sameBuildingDates || []).includes(dato)) {
        score += 100;
        begrundelse = "Samme opgang/bygning som en anden sag denne dag";
      } else if (nearbyByDate.has(dato)) {
        const km = nearbyByDate.get(dato);
        score += Math.max(0, 40 - km * 6);
        begrundelse = `~${Math.round(km * 10) / 10} km fra en anden sag denne dag`;
      }

      if (originalDate) {
        const moved = daysBetween(originalDate, dato);
        score -= Math.abs(moved) * 3; // mild bias - ikke en hård grænse
        if (moved === 0) begrundelse += " · uændret dato";
        else if (moved > 0) begrundelse += ` · ${moved} ${moved === 1 ? "dag" : "dage"} senere`;
      }

      candidates.push({ dato, montorId: t.id, montorNavn: t.navn, score, begrundelse });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const seenDates = new Set();
  const top = [];
  for (const c of candidates) {
    if (seenDates.has(c.dato)) continue;
    seenDates.add(c.dato);
    top.push(c);
    if (top.length >= 3) break;
  }
  return top;
}

// Tynd, bekvem indgang til suggestPlan for BOOKING-flowet (SuggestedDates i
// OrderFormFields.jsx) - som ikke har brug for timeOff/excludeTechnicianIds/
// originalDate/requireTechnician (en ny booking må gerne foreslås "ikke
// tildelt", se requireTechnician-kommentaren på suggestPlan ovenfor).
// Kalder blot suggestPlan med "week" omdøbt til "dates".
export function suggestBookingDates({ week, orders, technicians, sameBuildingDates, nearbyDates }) {
  return suggestPlan({ dates: week, orders, technicians, sameBuildingDates, nearbyDates });
}

export { haversineKm, isWeekend, WORKDAY_MINUTES };
