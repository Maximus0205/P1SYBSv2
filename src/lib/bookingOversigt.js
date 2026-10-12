// Bookingoversigt (oktober 2026): hvilke VARER er booket i et valgt tidsrum?
//
// Ren logik uden React/Supabase, så den kan testes direkte (se
// tests/bookingOversigt.test.mjs).
//
// "BOOKET I TIDSRUMMET" = sagens dato (order.dato, dagen varen skal leveres/
// monteres) ligger i intervallet, begge ender inklusive. Sager uden dato er
// endnu ikke booket til en dag og indgår derfor ikke. En sag med senestDato
// (tomgang med frist) men uden fast dato er heller ikke booket til en dag.
//
// "KUN DE VARER MAN SELV HAR BOOKET" = sagens oprettetAf.id er den indloggede
// bruger - samme definition som notifikationerne bruger (computeNotifications
// i data/domain.js). Det er en VISNINGSAFGRÆNSNING, ikke en sikkerhedsgrænse:
// databasens RLS giver alle i butikken læseadgang til butikkens sager (det er
// nødvendigt for fx Planlægning og Lager). Adgangen til selve fanen styres af
// rettighederne 'disponent' (se alt) og 'salg' (se egne).

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const erGyldigDato = (s) => typeof s === "string" && ISO.test(s);

// Normaliserer intervallet: manglende/ugyldig ende -> ingen grænse på den
// side; byttede ender rettes, så en bruger der taster dem omvendt stadig får
// et svar i stedet for en tom liste. `byttet` fortæller UI'et, at det skete.
function normaliserInterval(fra, til) {
  let f = erGyldigDato(fra) ? fra : null;
  let t = erGyldigDato(til) ? til : null;
  let byttet = false;
  if (f && t && f > t) { [f, t] = [t, f]; byttet = true; }
  return { fra: f, til: t, byttet };
}

// Én række pr. VARELINJE (varen er det, der spørges om), med nok sagsdata til
// at kunne genkende og åbne sagen.
//
// valg.sælgerId: kun sager oprettet af dette id (sælgerens egen visning, eller
//   disponentens filter på en bestemt sælger).
// Sager uden dato, eller uden for intervallet, udelades.
function bookedeVarer(orders, { fra, til, saelgerId } = {}) {
  const iv = normaliserInterval(fra, til);
  const rows = [];
  for (const o of orders || []) {
    if (!o || !erGyldigDato(o.dato)) continue;
    if (iv.fra && o.dato < iv.fra) continue;
    if (iv.til && o.dato > iv.til) continue;
    if (saelgerId && o.oprettetAf?.id !== saelgerId) continue;
    const linjer = Array.isArray(o.varelinjer) ? o.varelinjer : [];
    for (const v of linjer) {
      rows.push({
        key: `${o.id}:${v.id ?? rows.length}`,
        orderId: o.id,
        nr: o.nr || "",
        dato: o.dato,
        start: o.start || "",
        slut: o.slut || "",
        status: o.status || "planlagt",
        bilId: o.bilId || null,
        kundeNavn: o.kunde?.navn || "",
        kundeAdresse: o.kunde?.adresse || "",
        oprettetAf: o.oprettetAf ? { id: o.oprettetAf.id || null, navn: o.oprettetAf.navn || "Ukendt" } : null,
        linje: v,
      });
    }
  }
  rows.sort((a, b) => a.dato.localeCompare(b.dato) || a.start.localeCompare(b.start) || a.nr.localeCompare(b.nr, "da", { numeric: true }));
  return rows;
}

// Grupperer allerede sorterede rækker pr. dato (rækkefølgen bevares).
function grupperPrDato(rows) {
  const out = [];
  for (const r of rows) {
    const sidste = out[out.length - 1];
    if (sidste && sidste.dato === r.dato) sidste.rows.push(r);
    else out.push({ dato: r.dato, rows: [r] });
  }
  return out;
}

// Antal pr. varetype (til oversigten øverst), størst først.
// Varer af typen "andet" tælles under deres egen fritekst, hvis den findes.
function opsummerVaretyper(rows) {
  const m = new Map();
  for (const r of rows) {
    const l = r.linje || {};
    const navn = (l.varetypeId === "andet" ? l.varetypeTekst : l.varetypeNavn) || l.varetypeNavn || "Ukendt vare";
    m.set(navn, (m.get(navn) || 0) + 1);
  }
  return [...m.entries()].map(([navn, antal]) => ({ navn, antal })).sort((a, b) => b.antal - a.antal || a.navn.localeCompare(b.navn, "da"));
}

// De sælgere, der optræder på sagerne i intervallet - til disponentens filter.
// Udledt af selve sagerne (oprettetAf), ikke af brugerlisten: en sælger der er
// slettet siden, skal stadig kunne vælges, så længe deres bookinger findes.
function saelgereIOrdrer(orders) {
  const m = new Map();
  for (const o of orders || []) {
    const s = o?.oprettetAf;
    if (s?.id && !m.has(s.id)) m.set(s.id, s.navn || "Ukendt");
  }
  return [...m.entries()].map(([id, navn]) => ({ id, navn })).sort((a, b) => a.navn.localeCompare(b.navn, "da"));
}

// ---------------- Søgning på varenummer (oktober 2026) ----------------
// Formål: holde styr på lager og bestilling - "hvor mange af denne vare kører i
// perioden?". Én varelinje = én vare (varelinjer har intet antal-felt).
//
// Varenummeret er varelinjens punkt1Id (Punkt1-produkt-id). Søgningen matcher
// som "indeholder" på varenummer, og desuden på mærke, model og varetype, så
// "4003281", "4003" og "Miele WWG" alle virker. Store/små bogstaver ignoreres.
const norm = (s) => (s ?? "").toString().toLowerCase().trim();

const varenavn = (l) => [l?.maerke, l?.model].filter(Boolean).join(" ").trim() || l?.varetypeNavn || "Ukendt vare";

function raekkeMatcher(r, soeg) {
  const q = norm(soeg);
  if (!q) return true;
  const l = r.linje || {};
  return [l.punkt1Id, l.maerke, l.model, l.varetypeNavn, l.varetypeTekst, `${l.maerke || ""} ${l.model || ""}`].some((f) => norm(f).includes(q));
}

function filtrerPaaVare(rows, soeg) {
  return norm(soeg) ? (rows || []).filter((r) => raekkeMatcher(r, soeg)) : rows || [];
}

// Antal pr. VARE - til disponering: "30 x PODW5620W, 10 x POWM58MKA" i stedet for
// 40 sagskort. Én varelinje = én vare (varelinjer har intet antal-felt).
//
// VARENUMMER = MODELKODEN (fx PODW5620W), som det bruges i butikken. Punkt1-id'et
// (punkt1Id) mangler ofte, og samme model optræder både med og uden - derfor
// samles på modellen (store/små bogstaver og mellemrum ignoreres), og punkt1Id
// vises blot som ekstra oplysning, når mindst én af varelinjerne har det. Uden
// model samles på punkt1Id, og uden begge på mærke+varetype.
//
// "kommende" = sagen er ikke afsluttet endnu (varen skal stadig ud, så den er
// stadig behov for lageret); "leveret" = sagen er afsluttet.
// "sager" = de rækker, optællingen bygger på (til at folde ud og se, hvad den hører til).
function antalPrVare(rows) {
  const m = new Map();
  for (const r of rows || []) {
    const l = r.linje || {};
    const model = (l.model ?? "").toString().trim();
    const nr = (l.punkt1Id ?? "").toString().trim();
    const noegle = model ? `model:${norm(model).replace(/\s+/g, " ")}` : nr ? `nr:${nr}` : `uden:${norm(l.maerke)}|${norm(l.varetypeNavn)}`;
    let e = m.get(noegle);
    if (!e) {
      e = { noegle, model: model || null, maerke: (l.maerke ?? "").toString().trim() || null, varetype: l.varetypeNavn || null, navn: varenavn(l), varenr: null, antal: 0, kommende: 0, leveret: 0, sager: [], stavemaader: new Map() };
      m.set(noegle, e);
    }
    if (!e.varenr && nr) e.varenr = nr;
    if (model) e.stavemaader.set(model, (e.stavemaader.get(model) || 0) + 1);
    e.antal += 1;
    if (r.status === "afsluttet") e.leveret += 1; else e.kommende += 1;
    e.sager.push(r);
  }
  // Skrives samme model på flere måder (" podw5620w" / "PODW5620W"), vises den hyppigste.
  for (const e of m.values()) {
    if (e.stavemaader.size > 0) {
      const [bedste] = [...e.stavemaader.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      e.model = bedste;
      e.navn = [e.maerke, bedste].filter(Boolean).join(" ");
    }
    delete e.stavemaader;
  }
  return [...m.values()].sort((a, b) => b.antal - a.antal || a.navn.localeCompare(b.navn, "da"));
}

export { erGyldigDato, normaliserInterval, bookedeVarer, grupperPrDato, opsummerVaretyper, saelgereIOrdrer, varenavn, filtrerPaaVare, antalPrVare };
