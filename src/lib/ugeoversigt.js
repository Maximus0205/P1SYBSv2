// PRINTBAR UGEOVERSIGT (oktober 2026): hvilke sager kører hvilken bil hvilken dag. Ren logik (tests/ugeoversigt.test.mjs); visning ligger i components/UdskriftDokumenter.jsx.
// Rækkerne er bilerne (lukkede biler kun hvis de har sager i ugen), nederst "Ikke tildelt". Afsluttede sager tæller med og er markeret.
// tidTekst(order) -> "Formiddag" / "kl. 10:30"; hold(bil, dato) -> "Mette, Jens" (valgfri); dagensRaekkefoelge er domain.dailyOrderCompare.
export function ugeOversigt({ orders, biler, dage, tidTekst = () => "", hold = () => "", sortering }) {
  const sorter = (l) => (sortering ? [...l].sort(sortering) : l);
  const sag = (o) => ({ id: o.id, nr: o.nr, tid: tidTekst(o), kunde: o.kunde?.navn || "Ukendt kunde", adresse: o.kunde?.adresse || "", afsluttet: o.status === "afsluttet", toMand: !!o.toMand });
  const celler = (bilId) => dage.map((dato) => ({ dato, sager: sorter((orders || []).filter((o) => o && o.dato === dato && (o.bilId || null) === bilId)).map(sag) }));
  const raekker = [];
  for (const b of biler || []) {
    const c = celler(b.id);
    const harSager = c.some((x) => x.sager.length > 0);
    if (b.lukket && !harSager) continue;
    raekker.push({ id: b.id, navn: b.navn, lukket: !!b.lukket, hold: dage.map((d) => hold(b, d)), celler: c });
  }
  const udenBil = celler(null);
  if (udenBil.some((x) => x.sager.length > 0)) raekker.push({ id: null, navn: "Ikke tildelt", lukket: false, hold: dage.map(() => ""), celler: udenBil });
  const antal = raekker.reduce((s, r) => s + r.celler.reduce((t, c) => t + c.sager.length, 0), 0);
  return { dage, raekker, antal };
}
