// PAKKELISTE TIL UDSKRIFT (oktober 2026): pluklisten pr. bil i læsserækkefølge, med hold (montør og 2. mand) og de RMA-varer, der skal hentes retur.
// Bruger de samme regler som Lager-siden og forsiden (bilTure, holdForBil), så papiret aldrig siger noget andet end skærmen. Ren logik (tests/pakkeliste.test.mjs).
import { bilTure } from "./plukPrBil.js";
import { holdForBil } from "./forsideTal.js";
import { rmaLinjer } from "./rma.js";

// orders: alle sager. points: [{ order, lineItem }] = varelinjerne der skal plukkes (efter ydelsesreglen, uden RMA-linjer).
// bilId: kun denne bil (null = alle). kunMangler: udelad varer, der allerede er plukket (manglende varer vises altid).
// Returnerer [{ bil, hold, stops: [{ order, laesNr, koerselNr, linjer, rma }], antalLinjer, antalPlukket, antalRma }] - stoppene i LÆSSERÆKKEFØLGE.
export function pakkelisteData({ orders, points, vehicles, dato, bilId = null, kunMangler = false, sammenlign, erManglende, personnel, helpers, erMedhjaelper, fraværende }) {
  const ture = bilTure({ orders, points, vehicles, dato, sammenlign, erManglende }).filter((t) => !bilId || t.bil.id === bilId);
  return ture.map((t) => {
    const stops = t.stops.map((s) => {
      const linjer = kunMangler ? s.linjer.filter((l) => !l.plukket || erManglende?.(s.order, l)) : s.linjer;
      return { order: s.order, laesNr: s.laesNr, koerselNr: s.koerselNr, linjer, rma: rmaLinjer(s.order).filter((l) => l.rma.status !== "afsluttet") };
    });
    return {
      bil: t.bil, stops, antalStop: t.antalStop,
      hold: holdForBil({ bilId: t.bil.id, dato, personnel, helpers, erMedhjaelper, fraværende }),
      antalLinjer: t.antalLinjer, antalPlukket: t.antalPlukket,
      antalRma: stops.reduce((n, s) => n + s.rma.length, 0),
    };
  });
}

// De sager, en bil kører den dag - til RMA-labels på turen (labels til alle åbne RMA-varer på bilens sager).
export const sagerPaaTuren = (data) => data.flatMap((t) => t.stops.map((s) => s.order));
