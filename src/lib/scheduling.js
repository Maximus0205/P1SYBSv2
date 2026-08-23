// Ren, forklarlig planlægningslogik - INGEN AI. Erstatter de tidligere
// Gemini-kald til datoforslag og "kræver handling"-omfordeling. Grundene
// er praktiske, ikke principielle: en scoring-algoritme, der regner
// direkte på ægte køreafstande/kapacitet, er hurtigere, gratis (intet
// API-forbrug pr. booking), fejler aldrig fordi en sprogmodel er
// overbelastet eller udfaset, og giver et FORUDSIGELIGT resultat - samme
// input giver altid samme forslag, og "hvorfor" kan altid vises præcist
// (ikke en AI-genereret sætning der kan være opdigtet).
//
// Bruges af:
//  - SuggestedDates (OrderFormFields.jsx) - datoforslag i bookingflowet
//  - AiActionSuggestions (PlanningPage.jsx) - omfordeling i "Kræver handling"

import { orderExpectedMinutes } from "../data/domain";

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

// Foreslår 1-3 dato/montør-kombinationer til en NY sag, ud fra tre
// faktorer, vægtet efter hvor stærkt et signal de er:
//  1. Samme opgang/bygning som en anden sag samme dag (stærkeste signal -
//     kan spare en hel tur)
//  2. Køreafstand til andre sager samme dag (allerede beregnet af den
//     kaldende komponent via ORS, se sameBuildingDates/nearbyDates)
//  3. Ledig kapacitet den dag (undgå at overbooke en montør)
// Springer fraværende montører og allerede overbelastede dage over.
// Foreslår højst ÉN kombination pr. dato (den bedst scorende), så
// forslagene ikke bare er "samme dato, forskellig montør" tre gange.
export function suggestBookingDates({ week, orders, technicians, timeOff, sameBuildingDates, nearbyDates }) {
  const nearbyByDate = new Map();
  (nearbyDates || []).forEach(({ dato, km }) => {
    if (!nearbyByDate.has(dato) || nearbyByDate.get(dato) > km) nearbyByDate.set(dato, km);
  });

  const rows = [...(technicians || []), { id: null, navn: "" }];
  const candidates = [];

  for (const dato of week || []) {
    const dayOrders = (orders || []).filter((o) => o.dato === dato && o.status !== "afsluttet");
    for (const t of rows) {
      const onLeave = t.id && (timeOff || []).some((f) => f.montorId === t.id && dato >= f.startDato && dato <= f.slutDato);
      if (onLeave) continue;
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

// Foreslår, for HVER sag i "kræver handling", hvilken montør der bedst kan
// tage den - ud fra ledig kapacitet den dag og (hvis koordinater kendes)
// afstand til montørens øvrige sager samme dag. `coordMap` skal være
// forudberegnet af den kaldende komponent (geocodeAddresses) - denne
// funktion foretager INGEN netværkskald selv, kun ren beregning, og kan
// derfor køre synkront og øjeblikkeligt, hver gang "kræver handling"-
// listen ændrer sig.
export function suggestReassignments({ needsAction, orders, technicians, timeOff, coordMap }) {
  const normalize = (a) => (a || "").trim().toLowerCase();
  const coordFor = (adresse) => (adresse ? coordMap?.get(normalize(adresse)) : null);

  return (needsAction || []).map((s) => {
    const dato = s.dato;
    const sagCoord = coordFor(s.kunde?.adresse);
    const dayOrders = (orders || []).filter((o) => o.dato === dato && o.status !== "afsluttet" && o.id !== s.id);

    let best = null;
    let bestScore = -Infinity;
    for (const t of technicians || []) {
      const onLeave = (timeOff || []).some((f) => f.montorId === t.id && dato >= f.startDato && dato <= f.slutDato);
      if (onLeave) continue;
      const techOrders = dayOrders.filter((o) => o.montorId === t.id);
      const loadMinutes = techOrders.reduce((sum, o) => sum + orderExpectedMinutes(o), 0);
      if (loadMinutes > WORKDAY_MINUTES) continue;

      let score = Math.max(0, (WORKDAY_MINUTES - loadMinutes) / 30);
      let begrundelse = loadMinutes === 0 ? "Ledig denne dag" : `${Math.round((loadMinutes / 60) * 10) / 10}t booket denne dag`;

      if (sagCoord && techOrders.length > 0) {
        const distances = techOrders
          .map((o) => coordFor(o.kunde?.adresse))
          .filter(Boolean)
          .map((c) => haversineKm(sagCoord, c));
        if (distances.length > 0) {
          const minKm = Math.min(...distances);
          score += Math.max(0, 30 - minKm * 5);
          begrundelse = `~${Math.round(minKm * 10) / 10} km fra en anden sag samme dag`;
        }
      }

      if (score > bestScore) { bestScore = score; best = { montorNavn: t.navn, begrundelse }; }
    }

    return { sag: s.nr, montorNavn: best?.montorNavn || "", begrundelse: best?.begrundelse || "Ingen ledig kandidat fundet" };
  });
}

export { haversineKm, WORKDAY_MINUTES };
