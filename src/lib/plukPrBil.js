// PLUKLISTE PR. BIL I LÆSSERÆKKEFØLGE (oktober 2026).
//
// En bil læsses omvendt af, hvordan den kører: det SIDSTE stop skal stå længst inde, så det læsses FØRST, og det første stop står nærmest døren og
// læsses SIDST. Pluklisten kan derfor vises pr. bil med stoppene i læsserækkefølge, så lageret plukker og stabler varerne i den rækkefølge, de skal
// ligge på bilen. KØRSELSRÆKKEFØLGEN er den samme som montørens tur (sagens felt raekkefolge, ellers starttidspunktet - samme regel som dailyOrderCompare i
// data/domain.js, som sendes ind som `sammenlign`, så reglen kun findes ét sted). Ren logik, testet i tests/plukPrBil.test.mjs.
//
// orders: alle sager; points: [{ order, lineItem }] = de varelinjer, der skal plukkes (efter ydelsesreglen); vehicles: biler.
// Returnerer [{ bil, stops: [{ order, koerselNr, laesNr, linjer, antalPlukket, antalManglende }], antalLinjer, antalPlukket, antalStop }] - stoppene i LÆSSERÆKKEFØLGE.
export function bilTure({ orders, points, vehicles, dato, sammenlign, erManglende }) {
  const aktive = (vehicles || []).filter((v) => !v.lukket);
  const pr = new Map();
  for (const o of orders || []) {
    if (o.dato !== dato || !o.bilId || o.status === "afsluttet") continue;
    if (!aktive.some((v) => v.id === o.bilId)) continue;
    if (!pr.has(o.bilId)) pr.set(o.bilId, []);
    pr.get(o.bilId).push(o);
  }
  const ture = [];
  for (const bil of aktive) {
    const liste = pr.get(bil.id);
    if (!liste || liste.length === 0) continue;
    const kørsel = [...liste].sort(sammenlign);
    const n = kørsel.length;
    const stops = kørsel.map((order, i) => {
      const linjer = (points || []).filter((p) => p.order.id === order.id).map((p) => p.lineItem);
      const mangler = (l) => !!erManglende?.(order, l);
      return {
        order, koerselNr: i + 1, laesNr: n - i, linjer,
        antalPlukket: linjer.filter((l) => l.plukket && !mangler(l)).length,
        antalManglende: linjer.filter(mangler).length,
      };
    }).sort((a, b) => a.laesNr - b.laesNr);
    ture.push({
      bil, stops, antalStop: n,
      antalLinjer: stops.reduce((s, x) => s + x.linjer.length, 0),
      antalPlukket: stops.reduce((s, x) => s + x.antalPlukket, 0),
    });
  }
  return ture;
}
