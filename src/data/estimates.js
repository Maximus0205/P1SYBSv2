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
// 1. KUN SAGER MED ÉN VARELINJE tæller med. Tiden måles pr. SAG, ikke pr.
//    varelinje - så har en sag tre varer, ved vi kun at de tilsammen tog
//    2 timer, ikke hvordan de fordelte sig. Man kunne fordele tiden
//    proportionalt efter det PLANLAGTE tidsforbrug, men det ville betyde,
//    at vi lærte af selve det gæt, vi forsøger at erstatte. Hellere færre
//    og rene observationer.
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

const MIN_OBSERVATIONER = 3;
const MAKS_MINUTTER = 10 * 60;

// Hvor lang tid tog sagen FAKTISK?
//
// Stemplingerne (logs) er den præcise kilde, når montøren har brugt dem.
// Ellers udledes tiden af, hvornår sagen blev startet og afsluttet - se
// noten i useOrders om at gøre målingen uafhængig af, at nogen husker at
// trykke to ekstra gange. Uden den fallback ville vi i praksis aldrig få
// data nok: af de første 410 sager i systemet havde 3 en stempling.
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
