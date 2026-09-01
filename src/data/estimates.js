// Tidsestimater baseret på MÅLT tid (september 2026).
//
// BAGGRUNDEN: sælgeren taster i dag manuelt, hvor lang tid en opgave
// forventes at tage - hver gang, under tidspres, med kunden i telefonen.
// Det er et gæt, og skæve dage i planlægningen stammer sjældent fra dårlig
// planlægning, men fra et forkert udgangspunkt. Samtidig MÅLER systemet
// allerede den faktiske tid og bruger den til ingenting.
//
// Dette modul vender det om: har vi målt den samme slags opgave nok
// gange, foreslår vi den målte tid. Har vi ikke, siger vi det ligeud, og
// sælgeren taster som hidtil. Forslaget er netop et FORSLAG - det
// overskriver aldrig noget af sig selv, og sælgeren kan altid rette det.
// De kender den konkrete kunde og adresse; vi kender kun gennemsnittet.
//
// ---------------------------------------------------------------------
// TRE VALG DER ER VÆRD AT KENDE
// ---------------------------------------------------------------------
//
// 1. GRUNDESTIMATET bruger kun sager med ÉN varelinje. Tiden måles pr.
//    SAG, ikke pr. varelinje - så har en sag tre varer, ved vi kun at de
//    tilsammen tog 2 timer, ikke hvordan de fordelte sig. Man kunne
//    fordele tiden proportionalt efter det PLANLAGTE forbrug, men så
//    lærte vi af netop det gæt, vi forsøger at erstatte. Hellere færre og
//    rene observationer. (Flerlinje-sagerne går i stedet ind i
//    klyngemodellen nedenfor, hvor de hører hjemme.)
//
// 2. MEDIAN, IKKE GENNEMSNIT. Den hyppigste datafejl her er en glemt
//    udstempling: én sag på 400 minutter, fordi montøren gik til frokost.
//    Et gennemsnit ville flytte sig markant af sådan én; medianen står
//    næsten stille. Målinger over 10 timer kasseres helt - de er
//    per definition en fejlregistrering, ikke en lang arbejdsdag.
//
// 3. MINDST 3 OBSERVATIONER. To målinger er en anekdote. Er der færre,
//    returneres intet estimat, og UI'et falder tilbage på manuel
//    indtastning. Et dårligt tal, der ser autoritativt ud, er værre end
//    intet tal - sælgeren stoler på det og opdager først fejlen, når
//    montøren står og mangler en time.

import { buildingKey } from "./domain";

const MIN_OBSERVATIONER = 3;
const MAKS_MINUTTER = 10 * 60;
// Klynger større end dette behandles som én kategori. Forskellen mellem 6
// og 9 enheder i samme opgang er lille sammenlignet med springet fra 1 til
// 4, og at splitte dem yderligere ville bare gøre hver kategori for lille
// til at nå op på MIN_OBSERVATIONER.
const MAKS_KLYNGE = 6;

// Hvor lang tid tog sagen FAKTISK?
//
// Stemplingerne (logs) er den præcise kilde, når montøren har brugt dem.
// Ellers udledes tiden af, hvornår sagen blev startet og færdigmeldt - se
// startOrder/finishOrder i useOrders.js. Uden den fallback ville vi i
// praksis aldrig få data nok: af de første 410 sager i systemet havde 3
// en stempling.
export function measuredMinutes(order) {
  const fraLogs = (order?.logs || []).reduce((sum, l) => sum + (Number(l.minutter) || 0), 0);
  if (fraLogs > 0) return fraLogs;
  if (order?.startetTidspunkt && order?.afsluttetTidspunkt) {
    const min = Math.round((new Date(order.afsluttetTidspunkt) - new Date(order.startetTidspunkt)) / 60000);
    return min > 0 ? min : null;
  }
  return null;
}

function tillaegNoegle(v) {
  return (v?.tillaeg || [])
    .map((t) => (t.navn || "").toLowerCase().trim())
    .filter(Boolean)
    .sort()
    .join("+");
}

// Tre nøgler pr. varelinje, fra mest til mindst præcis. Slår vi op i
// rækkefølge, får vi altid det bedste tilgængelige grundlag.
//
// Niveau 1 medtager ALTID tillægs-nøglen - også når der ingen tillæg er
// ("ingen"). RETTET under test: uden det faldt en montering UDEN tillæg
// direkte ned på niveau 2, hvor den blev blandet med de samme monteringer
// MED dørvending, og arvede deres ekstra tid - 75 minutter i stedet for
// 55. En opgave uden tillæg er sin egen, veldefinerede kombination, ikke
// en upræcis udgave af de andre.
export function signatures(v) {
  const vare = v?.varetypeId || "";
  const ydelse = v?.primaerYdelse?.id || "";
  const till = tillaegNoegle(v);
  return [
    `1|${vare}|${ydelse}|${till || "ingen"}`,
    `2|${vare}|${ydelse}`,
    `3|${ydelse}`,
  ];
}

function median(tal) {
  const s = [...tal].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

// Bygger opslagstabellen én gang ud fra butikkens afsluttede sager.
// Beregnes i en useMemo hos den kaldende komponent - den er billig, men
// skal ikke køre ved hvert tastetryk i en formular.
export function buildEstimateIndex(orders) {
  const buckets = new Map();
  for (const o of orders || []) {
    if (o.status !== "afsluttet") continue;
    const linjer = o.varelinjer || [];
    if (linjer.length !== 1) continue; // se valg 1 ovenfor
    const minutter = measuredMinutes(o);
    if (minutter == null || minutter < 1 || minutter > MAKS_MINUTTER) continue;
    for (const sig of signatures(linjer[0])) {
      if (!buckets.has(sig)) buckets.set(sig, []);
      buckets.get(sig).push(minutter);
    }
  }
  const index = new Map();
  for (const [sig, tal] of buckets) {
    if (tal.length < MIN_OBSERVATIONER) continue;
    index.set(sig, { minutter: median(tal), antal: tal.length });
  }
  return index;
}

// Menneskelig forklaring på, HVOR præcist grundlaget er. Vises sammen med
// forslaget: "55 min · 12 tidligere af samme vare og ydelse". Uden det
// ville sælgeren ikke kunne se forskel på et solidt tal og et løst gæt,
// og så er tilliden til alle tal lige stor - hvilket i praksis betyder
// lige lille.
const GRUNDLAG_TEKST = {
  "1": "af samme vare, ydelse og tillæg",
  "2": "af samme vare og ydelse",
  "3": "med samme ydelse",
};

// Returnerer { minutter, antal, grundlag } eller NULL, hvis der ikke er
// data nok. null betyder eksplicit "tast selv" - se noten om valg 3.
export function estimateForLineItem(index, lineItem) {
  if (!index || index.size === 0) return null;
  for (const sig of signatures(lineItem)) {
    const traf = index.get(sig);
    if (traf) return { minutter: traf.minutter, antal: traf.antal, grundlag: GRUNDLAG_TEKST[sig[0]] };
  }
  return null;
}

// ---------------------------------------------------------------------
// KLYNGER: stordrift på samme adresse (september 2026)
// ---------------------------------------------------------------------
// Fire enheder i samme lejlighed, eller seks lejligheder i samme opgang,
// tager markant mindre tid PR. ENHED end fire enkeltmonteringer på fire
// forskellige adresser. Bilen skal pakkes ud én gang, værktøjet stilles op
// én gang, og montøren skal ikke køre imellem.
//
// Grundestimatet ovenfor kan aldrig selv opdage det: det ser kun på
// varetype og ydelse, og det bygger oven i købet KUN på sager med én
// varelinje - altså præcis de sager, hvor stordriften IKKE er i spil.
// Klyngefaktoren er derfor et selvstændigt lag ovenpå.
//
// SÅDAN LÆRES DEN: for hver gruppe af sager samme dag, samme opgang, samme
// montør sammenlignes den FAKTISKE samlede tid med summen af
// grundestimaterne. Tog fire enheder tilsammen 150 minutter, hvor
// grundestimatet siger 4 × 60 = 240, er faktoren 0,63. Faktoren læres pr.
// klyngestørrelse, fordi besparelsen ikke er lineær - springet fra 1 til 2
// enheder er større end fra 5 til 6.
//
// ER DER IKKE MÅLT NOK KLYNGER, gives INGEN rabat (faktor 1,0), og det
// siges eksplicit. Et opdigtet stordriftsfradrag ville sende montøren ud
// med for lidt tid, og det er en dårligere fejl end at afsætte for meget:
// en dag der slutter tidligt er en god dag, en dag der skrider er en
// kunde, der ikke fik besøg.
export function buildClusterIndex(orders, baseIndex) {
  const grupper = new Map();
  for (const o of orders || []) {
    if (o.status !== "afsluttet") continue;
    const noegle = buildingKey(o.kunde?.adresse || "");
    if (!noegle || !o.dato) continue;
    // Samme dag + samme opgang + samme montør. Uden montøren i nøglen
    // ville to montører, der arbejdede i hver sin ende af samme opgang,
    // se ud som én lang klynge og give en helt forkert faktor.
    const k = `${o.dato}|${noegle}|${o.montorId || ""}`;
    if (!grupper.has(k)) grupper.set(k, []);
    grupper.get(k).push(o);
  }

  const buckets = new Map();
  for (const [, sager] of grupper) {
    const enheder = sager.reduce((sum, o) => sum + (o.varelinjer || []).length, 0);
    if (enheder < 2) continue;

    let faktisk = 0;
    let forventet = 0;
    let komplet = true;
    for (const o of sager) {
      const m = measuredMinutes(o);
      if (m == null) { komplet = false; break; }
      faktisk += m;
      for (const v of o.varelinjer || []) {
        const e = estimateForLineItem(baseIndex, v);
        // Kender vi ikke grundtiden for bare én af enhederne, kan vi ikke
        // regne et forhold ud - så udelades HELE gruppen. Et delvist
        // grundlag ville give en faktor, der lignede en besparelse, men
        // reelt bare var manglende viden.
        if (!e) { komplet = false; break; }
        forventet += e.minutter;
      }
      if (!komplet) break;
    }
    if (!komplet || forventet <= 0 || faktisk <= 0 || faktisk > MAKS_MINUTTER * 3) continue;

    const stoerrelse = Math.min(enheder, MAKS_KLYNGE);
    if (!buckets.has(stoerrelse)) buckets.set(stoerrelse, []);
    buckets.get(stoerrelse).push(faktisk / forventet);
  }

  const index = new Map();
  for (const [n, faktorer] of buckets) {
    if (faktorer.length < MIN_OBSERVATIONER) continue;
    const s = [...faktorer].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    const raa = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    index.set(n, { faktor: Math.round(raa * 100) / 100, antal: faktorer.length });
  }
  return index;
}

// Estimat for en HEL klynge - fx alle varelinjer på én sag, eller alle
// enheder planlagt til samme opgang samme dag.
//
// Returnerer null, hvis bare én af enhederne mangler et grundestimat:
// et halvt tal er værre end intet, fordi det ser komplet ud.
// maaltKlynge: false betyder "summen af enkelttider, ingen målt
// stordriftsrabat" - UI'et bør sige det, så planlæggeren ved, at tallet
// er konservativt og formentlig for højt.
export function estimateForCluster(baseIndex, clusterIndex, lineItems) {
  const grund = (lineItems || []).map((v) => estimateForLineItem(baseIndex, v));
  if (grund.length === 0 || grund.some((e) => !e)) return null;
  const sum = grund.reduce((s, e) => s + e.minutter, 0);
  const n = Math.min(grund.length, MAKS_KLYNGE);
  const k = clusterIndex?.get(n);
  if (!k) return { minutter: sum, faktor: 1, maaltKlynge: false, enheder: grund.length };
  return {
    minutter: Math.round(sum * k.faktor),
    faktor: k.faktor,
    maaltKlynge: true,
    antal: k.antal,
    enheder: grund.length,
  };
}
