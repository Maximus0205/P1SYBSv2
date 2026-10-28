// TAL TIL FORSIDEN (oktober 2026). Rene funktioner uden React (tests/forsideTal.test.mjs); selve kasserne ligger i pages/DashboardPage.jsx.
// Forsiden skal svare på tre spørgsmål: hvordan ser dagen ud, hvor langt er bilerne, og hvad haster?
import { dageTil } from "./frist.js";
import { bilTure } from "./plukPrBil.js";
import { rmaLinjer } from "./rma.js";

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

// Dagens nøgletal (oktober 2026, ryddet op efter at "sager i dag" og "afsluttet" var to kasser med det samme tal): ÉN kasse for dagens fremdrift
// (x af y afsluttet), sagerne i morgen, og - for dem, der planlægger - hvor mange der mangler dato/bil. "Haster" er en DEL af "skal planlægges", så det er
// en underlinje på samme kasse (udeladt, hvis forsiden i forvejen har Haster-kassen: skjulHaster). Pluk-tal ligger i Pluk pr. bil, ikke her.
export function dagensTal({ orders, idag, imorgen = null, skalPlanlaegges, kanPlan, skjulHaster = false }) {
  const idagSager = (orders || []).filter((o) => o.dato === idag);
  const faerdige = idagSager.filter((o) => !aaben(o)).length;
  const tal = [{ id: "i-dag", label: "Afsluttet i dag", vaerdi: faerdige, af: idagSager.length, side: null }];
  if (imorgen) tal.push({ id: "i-morgen", label: "Sager i morgen", vaerdi: (orders || []).filter((o) => o.dato === imorgen && aaben(o)).length, side: kanPlan ? "planlaegning" : null });
  if (kanPlan) {
    const antalHaster = haster({ orders, idag, skalPlanlaegges }).length;
    tal.push({
      id: "planlaegges", label: "Skal planlægges", vaerdi: (orders || []).filter((o) => aaben(o) && skalPlanlaegges(o)).length, side: "planlaegning",
      under: !skjulHaster && antalHaster > 0 ? `heraf ${antalHaster} haster` : null, advarsel: !skjulHaster && antalHaster > 0,
    });
  }
  return tal;
}

const plusDage = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const lokalDato = (ts) => {
  const t = ts ? new Date(ts) : null;
  if (!t || Number.isNaN(t.getTime())) return null;
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};

// UGEN FORAN: for hver af de næste `dage` dage - antal sager, booket tid og belægning i forhold til bilerne. Kapaciteten er "en hel dag" pr. åben bil
// (minutterPrBil, 480 = hel dag 08-16 som i tidsrummene) - et groft mål, der viser de tomme og de fyldte dage, ikke en garanti.
// minutter(order) sendes ind (orderExpectedMinutes i domain.js). Afsluttede sager tæller med på dagen, de lå på.
export function ugenForan({ orders, vehicles, idag, dage = 7, minutter, minutterPrBil = 480 }) {
  const aabne = (vehicles || []).filter((v) => !v.lukket).length;
  const kapacitet = aabne * minutterPrBil;
  const ud = [];
  for (let i = 0; i < dage; i++) {
    const dato = plusDage(idag, i);
    const sager = (orders || []).filter((o) => o.dato === dato);
    const min = sager.reduce((sum, o) => sum + (Number(minutter ? minutter(o) : 0) || 0), 0);
    ud.push({ dato, antal: sager.length, minutter: min, kapacitet, pct: kapacitet > 0 ? Math.round((min / kapacitet) * 100) : null });
  }
  return ud;
}

// TEMPO: sager afsluttet pr. dag de seneste `dage` dage (idag er sidst), og samlet for de `dage` dage før - så man kan se, om det går hurtigere eller langsommere.
export function afsluttetPrDag({ orders, idag, dage = 7 }) {
  const taeller = new Map();
  for (const o of orders || []) {
    if (o.status !== "afsluttet") continue;
    const d = lokalDato(o.afsluttetTidspunkt);
    if (d) taeller.set(d, (taeller.get(d) || 0) + 1);
  }
  const dagene = [];
  for (let i = dage - 1; i >= 0; i--) { const dato = plusDage(idag, -i); dagene.push({ dato, antal: taeller.get(dato) || 0 }); }
  let foer = 0;
  for (let i = dage; i < dage * 2; i++) foer += taeller.get(plusDage(idag, -i)) || 0;
  const samlet = dagene.reduce((x, d) => x + d.antal, 0);
  return { dage: dagene, samlet, foer };
}

// RMA-VARER: alle åbne RMA-markeringer (se lib/rma.js), ældste først (dem der har ventet længst), og antal pr. status.
export function rmaOversigt(orders) {
  const liste = [];
  for (const order of orders || []) for (const linje of rmaLinjer(order)) if (linje.rma.status !== "afsluttet") liste.push({ order, linje, rma: linje.rma });
  liste.sort((a, b) => String(a.rma.oprettet || "").localeCompare(String(b.rma.oprettet || "")));
  const prStatus = {};
  for (const x of liste) prStatus[x.rma.status] = (prStatus[x.rma.status] || 0) + 1;
  return { liste, antal: liste.length, prStatus };
}

// Hvem sidder i bilen på en bestemt dag? (oktober 2026)
//  - montoerer: bilens faste folk (personnel.bilId === bilen), dog ikke en person, der den dag er sat som 2. mand på en ANDEN bil.
//  - andenMand: dagens 2. mand på bilen (crew.helpers) - en medhjælper eller en montør, der kører med herfra.
// Fraværende personer (ferie, sygdom, fridag) udelades og tælles i `fravaer`, så kortet ikke påstår, at nogen sidder i bilen, som ikke er der.
// erMedhjaelper(rolle) sendes ind (rollen ligger som data); fraværende(personId, dato) sendes ind (domain.isTechnicianAbsent).
export function holdForBil({ bilId, dato, personnel, helpers, erMedhjaelper, fraværende }) {
  const p = personnel || [], h = helpers || [];
  const borte = new Set(h.filter((x) => x.dato === dato && x.vehicleId !== bilId).map((x) => String(x.personId)));
  const fastBil = p.filter((x) => x.bilId === bilId && !erMedhjaelper?.(x.rolle) && !borte.has(String(x.id)));
  const fastIds = new Set(fastBil.map((x) => String(x.id)));
  const hjaelpere = h.filter((x) => x.dato === dato && x.vehicleId === bilId)
    .map((x) => p.find((y) => String(y.id) === String(x.personId)))
    .filter((x) => x && !fastIds.has(String(x.id)));
  const til = (liste) => liste.filter((x) => !fraværende?.(x.id, dato)).map((x) => x.navn || "Person");
  const montoerer = til(fastBil), andenMand = til(hjaelpere);
  return { montoerer, andenMand, fravaer: fastBil.length + hjaelpere.length - montoerer.length - andenMand.length };
}

// Bilens navn uden parentesen med montørerne ("Bil 2 (Mette, Jens)" -> "Bil 2"), når holdet vises for sig.
export const bilNavnUdenHold = (navn) => String(navn || "").replace(/\s*\([^)]*\)\s*$/, "") || String(navn || "");
