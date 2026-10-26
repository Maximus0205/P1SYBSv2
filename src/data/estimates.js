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
// 3. MINDST 5 OBSERVATIONER (oktober 2026, før 3). Få målinger er en anekdote. Er der færre,
//    returneres intet estimat, og UI'et falder tilbage på manuel
//    indtastning. Et dårligt tal, der ser autoritativt ud, er værre end
//    intet tal - sælgeren stoler på det og opdager først fejlen, når
//    montøren står og mangler en time.
//
// 4. ALTID SAMME VARETYPE (RETTET oktober 2026). Tidligere fandtes et
//    tredje, løsere niveau, der kun så på YDELSEN. Det gav fx "6 min med
//    samme ydelse" på en opvaskemaskine, fordi grundlaget var et køleskab,
//    et kølefryseskab og en vaskemaskine, der alle var monteret. Montering
//    af en opvaskemaskine og af et køleskab er ikke den samme opgave, så et
//    sådant tal er netop det autoritativt udseende, forkerte tal, valg 3
//    skal forhindre. Uden mindst 3 målinger af SAMME varetype og ydelse
//    gives intet forslag. "Andet (skriv selv)" er ikke én varetype: dér er
//    den fritekst, sælgeren skrev, en del af nøglen.

import { buildingKey, orderExpectedMinutes } from "./domain";
import { caseType, SAGSTYPE_KUNDE } from "./caseTypes";

// Samme værdi som OTHER_PRODUCT_TYPE_ID i domain.js ("Andet (skriv selv)").
const ANDET_ID = "andet";

// Oktober 2026: hævet fra 3 til 5 og med en nedre grænse. Tre målinger er stadig en anekdote,
// og en "måling" på under 5 minutter er næsten altid en sag, der blev trykket i gang og
// færdigmeldt i ét hug (fx en test), ikke en rigtig opgave.
const MIN_OBSERVATIONER = 5;
const MIN_MINUTTER = 5;
const MAKS_MINUTTER = 10 * 60;
// Hvor mange rene målinger butikken samlet skal have, før systemadmin kan slå forslaget til.
export const MIN_MAALINGER_TIL_FORSLAG = 20;
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
//
// RENE MÅLINGER (oktober 2026): montøren kan ved færdigmelding rette tiden (maaltKorrigeret, hele minutter) eller
// lade sagen udgå af læringen (maaltUdelad). En rettelse går forud for den målte tid, fordi den er et menneskes
// svar på "tog det virkelig så lang tid?" - uret ved ikke, om der blev glemt at starte eller stoppe.
export function measuredMinutes(order) {
  if (order?.maaltUdelad) return null;
  const rettet = Math.round(Number(order?.maaltKorrigeret));
  if (Number.isFinite(rettet) && rettet > 0) return rettet;
  const fraLogs = (order?.logs || []).reduce((sum, l) => sum + (Number(l.minutter) || 0), 0);
  if (fraLogs > 0) return fraLogs;
  if (order?.startetTidspunkt && order?.afsluttetTidspunkt) {
    const min = Math.round((new Date(order.afsluttetTidspunkt) - new Date(order.startetTidspunkt)) / 60000);
    return min > 0 ? min : null;
  }
  return null;
}

// Må sagen overhovedet lære systemet noget? Returnerer null, hvis ja, ellers årsagen som tekst.
// Kun almindelige kundesager lærer: tomgang (ingen kunde), servicetur og specialtur (anden slags opgave, specialturens tid er sat
// manuelt) og opfølgninger (reklamation m.m. er fejlfinding, ikke en montering) ville ellers trække tallene skævt for de
// almindelige monteringer, som forslaget er til. Systemadmin kan desuden udelukke enkelte sager (udenForLaering), fx testsager.
export function laeringsAarsag(order) {
  if (order?.udenForLaering) return "udelukket fra læring";
  if (order?.maaltUdelad) return "tæller ikke med (valgt ved færdigmelding)";
  if (caseType(order) !== SAGSTYPE_KUNDE) return "ikke en almindelig kundesag";
  if (order?.opfoelgningsType) return "opfølgning";
  return null;
}

// Ser den målte tid forkert ud? Bruges ved færdigmelding til at spørge montøren, mens vedkommende stadig kan svare.
// Tid i minutter, målt som measuredMinutes vil gøre det, hvis sagen blev færdigmeldt NU. Mistænkelig er en tid, der
// er urealistisk kort/lang i sig selv, eller langt fra den planlagte (mindre end en fjerdedel eller over tre gange så lang,
// og med en forskel på mindst 15 / 60 minutter, så en kort opgave ikke giver falsk alarm).
export function maaltTidVurdering(order, nu = new Date()) {
  const slut = nu instanceof Date ? nu : new Date(nu);
  const fraLogs = (order?.logs || []).reduce((sum, l) => sum + (Number(l.minutter) || 0), 0);
  const aaben = order?.stemplerInd ? Math.max(0, Math.round((slut - new Date(order.stemplerInd)) / 60000)) : 0;
  let maalt = fraLogs + aaben;
  if (maalt <= 0 && order?.startetTidspunkt) maalt = Math.round((slut - new Date(order.startetTidspunkt)) / 60000);
  if (!Number.isFinite(maalt) || maalt <= 0) return { maalt: null, planlagt: null, mistaenkelig: false, retning: null };
  const planlagt = orderExpectedMinutes(order) || 0;
  let retning = null;
  if (maalt < MIN_MINUTTER) retning = "kort";
  else if (maalt > MAKS_MINUTTER) retning = "lang";
  else if (planlagt > 0 && maalt < planlagt * 0.25 && planlagt - maalt >= 15) retning = "kort";
  else if (planlagt > 0 && maalt > planlagt * 3 && maalt - planlagt >= 60) retning = "lang";
  return { maalt, planlagt: planlagt || null, mistaenkelig: retning !== null, retning };
}

function tillaegNoegle(v) {
  return (v?.tillaeg || [])
    .map((t) => (t.navn || "").toLowerCase().trim())
    .filter(Boolean)
    .sort()
    .join("+");
}

// To nøgler pr. varelinje, fra mest til mindst præcis. (Oktober 2026: den tredje, "kun ydelse",
// er fjernet. Den blandede fx opvaskemaskiner med vaskemaskiner og tørretumblere under samme
// ydelse "Montering" og gav et tal, der så målt ud, men ikke var det for DEN vare.) Slår vi op i
// rækkefølge, får vi altid det bedste tilgængelige grundlag.
//
// Niveau 1 medtager ALTID tillægs-nøglen - også når der ingen tillæg er
// ("ingen"). RETTET under test: uden det faldt en montering UDEN tillæg
// direkte ned på niveau 2, hvor den blev blandet med de samme monteringer
// MED dørvending, og arvede deres ekstra tid - 75 minutter i stedet for
// 55. En opgave uden tillæg er sin egen, veldefinerede kombination, ikke
// en upræcis udgave af de andre.
function vareNoegle(v) {
  const id = v?.varetypeId || "";
  if (id !== ANDET_ID) return id;
  const tekst = (v?.varetypeTekst || "").toLowerCase().trim().replace(/\s+/g, " ");
  return tekst ? `${ANDET_ID}:${tekst}` : "";
}

export function signatures(v) {
  const vare = vareNoegle(v);
  const ydelse = v?.primaerYdelse?.id || "";
  if (!vare || !ydelse) return [];
  const till = tillaegNoegle(v);
  return [
    `1|${vare}|${ydelse}|${till || "ingen"}`,
    `2|${vare}|${ydelse}`,
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
    if (o.status !== "afsluttet" || laeringsAarsag(o)) continue;
    const linjer = o.varelinjer || [];
    if (linjer.length !== 1) continue; // se valg 1 ovenfor
    const minutter = measuredMinutes(o);
    if (minutter == null || minutter < MIN_MINUTTER || minutter > MAKS_MINUTTER) continue;
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
};

// Status for systemadmin: er der målt nok til, at forslaget må slås til? Tæller de samme rene
// sager som buildEstimateIndex (én varelinje, afsluttet, 5 min - 10 timer) og kræver både et
// samlet minimum og mindst én vare/ydelse med nok målinger til selv at give et forslag.
export function estimateDataStatus(orders) {
  let antalMaalt = 0;
  for (const o of orders || []) {
    if (o.status !== "afsluttet" || laeringsAarsag(o) || (o.varelinjer || []).length !== 1) continue;
    const m = measuredMinutes(o);
    if (m != null && m >= MIN_MINUTTER && m <= MAKS_MINUTTER) antalMaalt++;
  }
  const antalKombinationer = [...buildEstimateIndex(orders).keys()].filter((k) => k.startsWith("2|")).length;
  return {
    antalMaalt,
    antalKombinationer,
    kraevetMaalinger: MIN_MAALINGER_TIL_FORSLAG,
    kraevetPrKombination: MIN_OBSERVATIONER,
    tilstraekkeligt: antalMaalt >= MIN_MAALINGER_TIL_FORSLAG && antalKombinationer > 0,
  };
}

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
// BIL sammenlignes den FAKTISKE samlede tid med summen af
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
    if (o.status !== "afsluttet" || laeringsAarsag(o)) continue;
    const noegle = buildingKey(o.kunde?.adresse || "");
    if (!noegle || !o.dato) continue;
    // Samme dag + samme opgang + samme BIL (september 2026: sager
    // tildeles nu en bil, ikke en person - se
    // rebind_orders_to_vehicle_instead_of_person-migreringen). Uden bilen
    // i nøglen ville to biler, der arbejdede i hver sin ende af samme
    // opgang, se ud som én lang klynge og give en helt forkert faktor.
    const k = `${o.dato}|${noegle}|${o.bilId || ""}`;
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

// ---------------------------------------------------------------------
// MÅLINGSOVERSIGT (systemadmin, oktober 2026)
// ---------------------------------------------------------------------
// Én række pr. afsluttet sag med årsagen til, at den indgår i forslaget eller ej, så man kan kontrollere regnestykket
// med øjnene før forslaget slås til. Bruger de samme grænser som buildEstimateIndex.
//
// SAGER MED FLERE VARELINJER tæller nu med (oktober 2026): tiden måles pr. sag, så de bruges ikke til grundtiderne, men til STORDRIFTSFAKTOREN
// (faktisk tid / summen af grundtiderne, se buildClusterIndex). De tæller kun med, hvis grundtiden er kendt for ALLE varerne på sagen - ellers
// er der ingen sum at sammenligne med, og sagen markeres "mangler grundtid".
export function maalingsRaekker(orders) {
  const rows = [];
  const grundIndeks = buildEstimateIndex(orders);
  for (const o of orders || []) {
    if (o.status !== "afsluttet") continue;
    const linjer = o.varelinjer || [];
    const minutter = measuredMinutes(o);
    const rettet = Math.round(Number(o.maaltKorrigeret)) > 0;
    const kilde = rettet ? "rettet af montør" : (o.logs || []).some((l) => Number(l.minutter) > 0) ? "stempling" : o.startetTidspunkt && o.afsluttetTidspunkt ? "start/slut" : "ingen";
    let aarsag = laeringsAarsag(o);
    let faktor = null;
    if (aarsag) { /* udelukket: årsagen står allerede */ }
    else if (linjer.length === 0) aarsag = "ingen varelinje";
    else if (minutter == null) aarsag = "ingen måling";
    else if (minutter < MIN_MINUTTER) aarsag = `under ${MIN_MINUTTER} min`;
    else if (minutter > MAKS_MINUTTER) aarsag = "over 10 timer";
    else if (linjer.length > 1) {
      const grund = linjer.map((v) => estimateForLineItem(grundIndeks, v));
      if (grund.some((e) => !e)) aarsag = "mangler grundtid for en af varerne";
      else faktor = Math.round((minutter / grund.reduce((s, e) => s + e.minutter, 0)) * 100) / 100;
    }
    rows.push({ order: o, minutter, kilde, aarsag, indgaar: !aarsag, flere: linjer.length > 1, faktor, noegle: linjer.length === 1 ? signatures(linjer[0])[1] : null });
  }
  return rows;
}

// Pr. vare/ydelse-kombination (niveau 2): antal, median, laveste/højeste og om der er nok til et forslag.
export function maalingsGrupper(rows) {
  const g = new Map();
  for (const r of rows) {
    if (!r.indgaar || !r.noegle) continue;
    if (!g.has(r.noegle)) g.set(r.noegle, []);
    g.get(r.noegle).push(r.minutter);
  }
  return [...g].map(([noegle, tal]) => ({
    noegle, antal: tal.length, median: median(tal), min: Math.min(...tal), max: Math.max(...tal), klar: tal.length >= MIN_OBSERVATIONER,
  })).sort((a, b) => b.antal - a.antal);
}

// Overblik over selve indsamlingen: hvor mange afsluttede sager, hvor mange tæller med, hvorfor resten ikke gør, og tempoet pr. uge
// (mandagens dato). Sager uden dato springes over i ugetallene.
export function maalingsOverblik(rows) {
  const aarsager = new Map();
  const uger = new Map();
  let indgaar = 0;
  for (const r of rows) {
    if (r.indgaar) indgaar++; else aarsager.set(r.aarsag, (aarsager.get(r.aarsag) || 0) + 1);
    const d = r.order.dato ? new Date(`${r.order.dato}T12:00:00Z`) : null;
    if (!d || Number.isNaN(d.getTime())) continue;
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const uge = d.toISOString().slice(0, 10);
    const u = uger.get(uge) || { uge, ialt: 0, indgaar: 0 };
    u.ialt++; if (r.indgaar) u.indgaar++;
    uger.set(uge, u);
  }
  return {
    afsluttet: rows.length,
    indgaar,
    aarsager: [...aarsager].map(([aarsag, antal]) => ({ aarsag, antal })).sort((a, b) => b.antal - a.antal),
    uger: [...uger.values()].sort((a, b) => b.uge.localeCompare(a.uge)).slice(0, 8),
  };
}

// Prøv forslaget på historien ("leave-one-out"): for hver sag, der tæller med, laves forslaget kun ud fra ALLE ANDRE sager og sammenlignes med den
// faktisk målte tid - og med den planlagte tid (planlagtFn(order)), som er det, forslaget skal slå. Giver ingen forslag, når der ikke er nok andre
// målinger (det er netop det, forslaget ville gøre i virkeligheden).
export function proeveForslag(orders, planlagtFn) {
  const rows = maalingsRaekker(orders).filter((r) => r.indgaar);
  const res = rows.map((r) => {
    const andre = (orders || []).filter((o) => o.id !== r.order.id);
    const grund = buildEstimateIndex(andre);
    let forslag = null;
    if (r.flere) {
      // Som i bookingformularen: kun med en MÅLT stordriftsfaktor for den størrelse (ellers vises intet forslag).
      const e = estimateForCluster(grund, buildClusterIndex(andre, grund), r.order.varelinjer);
      forslag = e && e.maaltKlynge ? e.minutter : null;
    } else {
      const f = estimateForLineItem(grund, r.order.varelinjer[0]);
      forslag = f ? f.minutter : null;
    }
    const planlagt = planlagtFn ? planlagtFn(r.order) : null;
    return { order: r.order, flere: r.flere, maalt: r.minutter, forslag, planlagt };
  });
  const snit = (liste, fn) => (liste.length ? Math.round(liste.reduce((s, x) => s + fn(x), 0) / liste.length) : null);
  const enkelt = res.filter((x) => !x.flere); // sager med én varelinje; flere-linje-sager opgøres for sig nedenfor
  const medForslag = enkelt.filter((x) => x.forslag != null);
  const medPlan = enkelt.filter((x) => x.planlagt > 0);
  const medBegge = medForslag.filter((x) => x.planlagt > 0);
  const flere = res.filter((x) => x.flere);
  const flereBegge = flere.filter((x) => x.forslag != null && x.planlagt > 0);
  return {
    rows: res,
    antalFlere: flere.length,
    antalFlereMedForslag: flere.filter((x) => x.forslag != null).length,
    flereForslagFejl: snit(flereBegge, (x) => Math.abs(x.forslag - x.maalt)),
    flerePlanFejl: snit(flereBegge, (x) => Math.abs(x.planlagt - x.maalt)),
    antal: enkelt.length,
    antalMedForslag: medForslag.length,
    forslagFejl: snit(medForslag, (x) => Math.abs(x.forslag - x.maalt)),
    // Samme sager som forslaget dækker, så de to tal kan sammenlignes ligeud.
    forslagFejlSammeSager: snit(medBegge, (x) => Math.abs(x.forslag - x.maalt)),
    planFejlSammeSager: snit(medBegge, (x) => Math.abs(x.planlagt - x.maalt)),
    planFejl: snit(medPlan, (x) => Math.abs(x.planlagt - x.maalt)),
  };
}

// Lærte stordriftsfaktorer pr. antal enheder, til oversigten: [{ enheder, faktor, antal }]. Kun størrelser med nok målinger.
export function stordriftsOversigt(orders) {
  const grund = buildEstimateIndex(orders);
  return [...buildClusterIndex(orders, grund)].map(([enheder, k]) => ({ enheder, faktor: k.faktor, antal: k.antal })).sort((a, b) => a.enheder - b.enheder);
}
