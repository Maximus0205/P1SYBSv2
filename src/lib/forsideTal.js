// TAL TIL FORSIDEN (oktober 2026). Rene funktioner uden React (tests/forsideTal.test.mjs); selve kasserne ligger i pages/DashboardPage.jsx.
// Forsiden skal svare på tre spørgsmål: hvordan ser dagen ud, hvor langt er bilerne, og hvad haster?
import { dageTil } from "./frist.js";
import { bilTure } from "./plukPrBil.js";

const aaben = (o) => o.status !== "afsluttet";

// Sager, der skal være kørt inden for `dage` dage, men endnu ikke er planlagt (mangler dato eller bil). Datoen, der tæller, er fristen (tomgang),
// ellers den aftalte dato. Mest presserende først; overskredne øverst. needsPlanning sendes ind (samme regel som Planlægning).
export function haster({ orders, idag, dage = 7, skalPlanlaegges }) {
  return (orders || [])
    .filter((o) => aaben(o) && skalPlanlaegges(o))
    .map((o) => {
      const nøgle = o.senestDato || o.dato || null;
      return nøgle ? { order: o, dato: nøgle, dage: dageTil(nøgle, idag) } : null;
    })
    .filter((x) => x && x.dage <= dage)
    .sort((a, b) => a.dage - b.dage || String(a.order.nr || a.order.id).localeCompare(String(b.order.nr || b.order.id)))
    .map((x) => ({ ...x, niveau: x.dage < 0 ? "overskredet" : x.dage <= 3 ? "snart" : "ok" }));
}

// Fremdrift pr. bil i dag: antal sager, færdige, den næste ikke-færdige sag (i kørselsrækkefølge) og om noget er galt.
export function bilFremdrift({ orders, biler, dato, sammenlign, erManglende }) {
  const ud = [];
  for (const bil of biler || []) {
    if (bil.lukket) continue;
    const dem = (orders || []).filter((o) => o.bilId === bil.id && o.dato === dato).sort(sammenlign);
    if (dem.length === 0) continue;
    const aabne = dem.filter(aaben);
    ud.push({
      bil, total: dem.length, faerdige: dem.length - aabne.length, igang: dem.filter((o) => o.status === "igang").length,
      naeste: aabne[0] || null,
      problemer: aabne.filter((o) => !!o.problem).length,
      manglende: aabne.filter((o) => (o.varelinjer || []).some((l) => erManglende?.(o, l))).length,
    });
  }
  return ud;
}

// Pluk pr. bil i dag (samme regler som pluklisten på Lager-siden, via bilTure).
export function plukFremdrift({ orders, points, vehicles, dato, sammenlign, erManglende }) {
  return bilTure({ orders, points, vehicles, dato, sammenlign, erManglende })
    .map((t) => ({ bil: t.bil, linjer: t.antalLinjer, plukket: t.antalPlukket, manglende: t.stops.reduce((s, x) => s + x.antalManglende, 0), stop: t.antalStop }))
    .filter((x) => x.linjer > 0);
}

// En sælgers egne åbne sager, delt i "venter på dato/bil" og "planlagt". Planlagte sorteres efter dato, og dem i fortiden (ikke afsluttet) først.
export function mineSager({ orders, profilId, skalPlanlaegges }) {
  const mine = (orders || []).filter((o) => o.oprettetAf?.id === profilId && aaben(o));
  const venter = mine.filter(skalPlanlaegges);
  const planlagte = mine.filter((o) => !skalPlanlaegges(o)).sort((a, b) => (a.dato || "").localeCompare(b.dato || "") || (a.start || "").localeCompare(b.start || ""));
  return { venter, planlagte, alle: mine.length };
}

// Tal til "Dagen i tal": kun de felter, brugeren har adgang til, afgør hvilke tal der vises (kanPlan, kanLager).
export function dagensTal({ orders, idag, skalPlanlaegges, kanPlan, kanLager, pluk }) {
  const idagSager = (orders || []).filter((o) => o.dato === idag);
  const faerdige = idagSager.filter((o) => !aaben(o)).length;
  const tal = [{ id: "sager", label: "Sager i dag", vaerdi: idagSager.length, side: kanPlan ? "planlaegning" : null }, { id: "faerdige", label: "Afsluttet", vaerdi: faerdige, af: idagSager.length, side: null }];
  if (kanPlan) {
    tal.push({ id: "planlaegges", label: "Skal planlægges", vaerdi: (orders || []).filter((o) => aaben(o) && skalPlanlaegges(o)).length, side: "planlaegning" });
    tal.push({ id: "haster", label: "Haster (7 dage)", vaerdi: haster({ orders, idag, skalPlanlaegges }).length, side: "planlaegning", advarsel: true });
  }
  if (kanLager && pluk) {
    tal.push({ id: "pluk", label: "Mangler pluk", vaerdi: pluk.mangler, side: "lager" });
    if (pluk.kanIkkeFindes > 0) tal.push({ id: "findes-ikke", label: "Kan ikke findes", vaerdi: pluk.kanIkkeFindes, side: "lager", advarsel: true });
  }
  return tal;
}
