// DELVIST AFSLUTTET (oktober 2026). Ren logik uden React/Supabase (tests/delvisAfsluttet.test.mjs).
//
// Montøren har udført en del af varerne, men resten skal ud en anden dag (fx en vare manglede, eller
// opgaven var større end tiden). I stedet for at oprette en NY sag (som Dupliker/opfølgning gør)
// bliver SAMME sag liggende, og:
//   - de udførte varelinjer markeres `udfoert` (så de ikke tælles som kommende behov og ikke skal
//     ud igen),
//   - sagen mister dato/tid/bil og lander derfor i Planlægning under "Skal planlægges" (needsPlanning),
//   - sælgeren, der har booket sagen, får en notifikation,
//   - en hændelse gemmes i order.delvisAfsluttet (liste), inkl. hvilken bil og hvilke montører der
//     kørte den - så de ikke "forsvinder" fra sagen, hvis en anden montør tager resten, og man kan
//     spørge den første.
//
// Samme mønster som order.problem: en markering OVENPÅ status, ikke en ny status.

const tekst = (s) => (s ?? "").toString().trim();

// Varelinjer, der stadig mangler at blive udført.
export const resterendeLinjer = (order) => (Array.isArray(order?.varelinjer) ? order.varelinjer : []).filter((v) => !v?.udfoert);
export const udfoerteLinjer = (order) => (Array.isArray(order?.varelinjer) ? order.varelinjer : []).filter((v) => v?.udfoert);

export const delvisHistorik = (order) => (Array.isArray(order?.delvisAfsluttet) ? order.delvisAfsluttet : []);
export const seneste = (order) => { const h = delvisHistorik(order); return h.length ? h[h.length - 1] : null; };
export const harDelvis = (order) => delvisHistorik(order).length > 0;

// Kan sagen meldes delvist afsluttet? Den skal være i gang eller planlagt (ikke afsluttet) og have mindst
// to resterende linjer (én der udføres, én der bliver tilbage).
export const kanMeldesDelvist = (order) => !!order && order.status !== "afsluttet" && resterendeLinjer(order).length >= 2;

// Navnene vi viser: "Bil 2 (Jens, Mette)". Montørerne er dem, der kører bilen NU - se hændelsen.
export function koertAfTekst(h) {
  if (!h) return "";
  const navne = (h.montoerer || []).map((m) => tekst(m?.navn)).filter(Boolean);
  const bil = tekst(h.bilNavn);
  if (bil && navne.length) return `${bil} (${navne.join(", ")})`;
  return bil || navne.join(", ");
}

// Opbygger de felter, der skal ændres på sagen. Returnerer null, hvis input er ugyldigt (så UI/hook
// ikke kan efterlade en halv ændring): note mangler, ingen linjer valgt, ukendt/allerede udført linje
// valgt, eller ALLE resterende linjer valgt (så skal sagen færdigmeldes, ikke delvist afsluttes).
//
// ctx: { udfoerteLinjeIds, note, nuIso, id, af:{id,navn}, bilNavn, montoerer:[{id,navn}] }
export function delvisPatch(order, ctx) {
  if (!kanMeldesDelvist(order)) return null;
  const note = tekst(ctx?.note);
  const ids = [...new Set(ctx?.udfoerteLinjeIds || [])];
  if (!note || ids.length === 0 || !ctx?.nuIso || !ctx?.id) return null;
  const rest = resterendeLinjer(order);
  const restIds = new Set(rest.map((v) => v.id));
  if (!ids.every((i) => restIds.has(i))) return null;
  if (ids.length >= rest.length) return null;

  const idSet = new Set(ids);
  const haendelse = {
    id: ctx.id,
    tid: ctx.nuIso,
    note,
    udfoerteLinjer: ids,
    bilId: order.bilId || null,
    bilNavn: tekst(ctx.bilNavn) || null,
    montoerer: (ctx.montoerer || []).filter((m) => m?.id).map((m) => ({ id: m.id, navn: tekst(m.navn) || "Ukendt" })),
    af: ctx.af?.id ? { id: ctx.af.id, navn: tekst(ctx.af.navn) || "Ukendt" } : null,
    tidligereDato: order.dato || null,
  };
  return {
    varelinjer: order.varelinjer.map((v) => (idSet.has(v.id) ? { ...v, udfoert: true, udfoertTid: ctx.nuIso } : v)),
    status: "planlagt",
    dato: null, tidsrumId: null, start: null, slut: null, bilId: null,
    problem: null,
    delvisAfsluttet: [...delvisHistorik(order), haendelse],
    notifikationSet: { ...(order.notifikationSet || {}), delvist: false },
  };
}

// Sælgerens notifikation: sagen har en delvis afslutning, der ikke er set, og venter stadig på ny dato.
export const harUlaestDelvis = (order) => harDelvis(order) && !order.notifikationSet?.delvist;
