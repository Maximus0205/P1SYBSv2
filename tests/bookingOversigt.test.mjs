// Regressionstest til bookingoversigten (src/lib/bookingOversigt.js).
// Kør med:  node tests/bookingOversigt.test.mjs
import { bookedeVarer, grupperPrDato, normaliserInterval, opsummerVaretyper, saelgereIOrdrer, filtrerPaaVare, antalPrVare, varenavn } from "../src/lib/bookingOversigt.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

const A = { id: "a", navn: "Anna" }, B = { id: "b", navn: "Bo" };
const linje = (id, typeId, typeNavn) => ({ id, varetypeId: typeId, varetypeNavn: typeNavn });
const sag = (id, nr, dato, start, oprettetAf, varelinjer) => ({ id, nr, dato, start, slut: "16:00", status: "planlagt", oprettetAf, varelinjer, kunde: { navn: "K", adresse: "Vej 1" } });

const orders = [
  sag("o1", "26-1", "2026-10-12", "08:00", A, [linje("l1", "vt7", "Vaskemaskine"), linje("l2", "vt1", "Køleskab")]),
  sag("o2", "26-2", "2026-10-14", "12:00", B, [linje("l3", "vt7", "Vaskemaskine")]),
  sag("o3", "26-3", "2026-10-18", "08:00", A, [linje("l4", "vt10", "Opvaskemaskine")]),
  sag("o4", "26-4", null, null, A, [linje("l5", "vt7", "Vaskemaskine")]),
  sag("o5", "26-5", "2026-10-12", "07:00", null, [linje("l6", "vt11", "Ovn")]),
];

// --- tidsrum
eq("begge ender er inklusive", bookedeVarer(orders, { fra: "2026-10-12", til: "2026-10-18" }).map((r) => r.linje.id), ["l6", "l1", "l2", "l3", "l4"]);
eq("kun én dag", bookedeVarer(orders, { fra: "2026-10-14", til: "2026-10-14" }).map((r) => r.linje.id), ["l3"]);
eq("uden for tidsrummet", bookedeVarer(orders, { fra: "2026-11-01", til: "2026-11-30" }), []);
eq("sag uden dato er ikke booket", bookedeVarer(orders, { fra: "2026-01-01", til: "2026-12-31" }).some((r) => r.orderId === "o4"), false);
eq("omvendte datoer rettes", bookedeVarer(orders, { fra: "2026-10-18", til: "2026-10-14" }).map((r) => r.linje.id), ["l3", "l4"]);
eq("normalisering melder bytning", normaliserInterval("2026-10-18", "2026-10-14"), { fra: "2026-10-14", til: "2026-10-18", byttet: true });
eq("ugyldig dato = ingen grænse på den side", normaliserInterval("", "xx"), { fra: null, til: null, byttet: false });
eq("kun fra-dato", bookedeVarer(orders, { fra: "2026-10-15" }).map((r) => r.linje.id), ["l4"]);

// --- sælger ser kun egne
eq("sælger A ser kun egne", bookedeVarer(orders, { fra: "2026-10-12", til: "2026-10-18", saelgerId: "a" }).map((r) => r.linje.id), ["l1", "l2", "l4"]);
eq("sælger B ser kun egne", bookedeVarer(orders, { fra: "2026-10-12", til: "2026-10-18", saelgerId: "b" }).map((r) => r.linje.id), ["l3"]);
eq("sag uden oprettetAf tilhører ingen sælger", bookedeVarer(orders, { fra: "2026-10-12", til: "2026-10-12", saelgerId: "a" }).map((r) => r.linje.id), ["l1", "l2"]);
eq("ukendt sælger-id giver intet", bookedeVarer(orders, { fra: "2026-10-12", til: "2026-10-18", saelgerId: "zzz" }), []);

// --- robusthed
eq("tom/ugyldig liste", [bookedeVarer(null, {}), bookedeVarer(undefined, {}), bookedeVarer([null, {}], {})], [[], [], []]);
eq("sag uden varelinjer giver ingen rækker", bookedeVarer([sag("x", "1", "2026-10-12", "08:00", A, undefined)], {}), []);

// --- gruppering og opsummering
const rows = bookedeVarer(orders, { fra: "2026-10-12", til: "2026-10-18" });
eq("gruppering pr. dato", grupperPrDato(rows).map((g) => [g.dato, g.rows.length]), [["2026-10-12", 3], ["2026-10-14", 1], ["2026-10-18", 1]]);
eq("opsummering pr. varetype, største først", opsummerVaretyper(rows).slice(0, 2), [{ navn: "Vaskemaskine", antal: 2 }, { navn: "Køleskab", antal: 1 }]);
eq("andet-varer tælles under deres fritekst", opsummerVaretyper([{ linje: { varetypeId: "andet", varetypeNavn: "Andet (skriv selv)", varetypeTekst: "Soundbar" } }]), [{ navn: "Soundbar", antal: 1 }]);
eq("sælgerliste til filter", saelgereIOrdrer(orders), [{ id: "a", navn: "Anna" }, { id: "b", navn: "Bo" }]);

// --- søgning på varenummer / antal pr. vare
const vl = (id, nr, maerke, model, typeNavn) => ({ id, punkt1Id: nr, maerke, model, varetypeId: "vt7", varetypeNavn: typeNavn });
const lager = [
  { ...sag("p1", "26-10", "2026-10-12", "08:00", A, [vl("a1", "4003281", "Miele", "WWG888", "Vaskemaskine"), vl("a2", "3827083", "Point", "POWM58MKA", "Vaskemaskine")]) },
  { ...sag("p2", "26-11", "2026-10-13", "08:00", B, [vl("a3", "4003281", "Miele", "WWG888", "Vaskemaskine")]), status: "afsluttet" },
  { ...sag("p3", "26-12", "2026-10-14", "08:00", B, [vl("a4", "4003281", "Miele", "WWG888", "Vaskemaskine")]) },
  { ...sag("p4", "26-13", "2026-10-30", "08:00", B, [vl("a5", "4003281", "Miele", "WWG888", "Vaskemaskine")]) },
  { ...sag("p5", "26-14", "2026-10-14", "08:00", A, [vl("a6", undefined, "Samsung", "QE55", "TV")]) },
];
const lagerRows = bookedeVarer(lager, { fra: "2026-10-12", til: "2026-10-20" });
eq("søg på fuldt varenummer", filtrerPaaVare(lagerRows, "4003281").map((r) => r.linje.id), ["a1", "a3", "a4"]);
eq("søg på del af varenummer", filtrerPaaVare(lagerRows, "40032").length, 3);
eq("søg på model, uanset store/små bogstaver og mellemrum", filtrerPaaVare(lagerRows, "  wwg888 ").length, 3);
eq("søg på mærke+model", filtrerPaaVare(lagerRows, "point powm").map((r) => r.linje.id), ["a2"]);
eq("tom søgning giver alle", filtrerPaaVare(lagerRows, "  ").length, lagerRows.length);
eq("ingen match", filtrerPaaVare(lagerRows, "999"), []);
eq("antal pr. vare i perioden (a5 ligger uden for perioden)", antalPrVare(filtrerPaaVare(lagerRows, "4003281")), [{ noegle: "4003281", varenr: "4003281", navn: "Miele WWG888", antal: 3, kommende: 2, leveret: 1 }]);
eq("perioden afgrænser antallet", antalPrVare(filtrerPaaVare(bookedeVarer(lager, { fra: "2026-10-12", til: "2026-10-31" }), "4003281"))[0].antal, 4);
eq("sælger ser kun eget antal", antalPrVare(filtrerPaaVare(bookedeVarer(lager, { fra: "2026-10-12", til: "2026-10-31", saelgerId: "a" }), "4003281"))[0].antal, 1);
eq("samme vare samles, forskellige varenumre holdes adskilt", antalPrVare(lagerRows).map((v) => [v.varenr, v.antal]), [["4003281", 3], ["3827083", 1], [null, 1]]);
eq("vare uden varenummer samles på mærke+model", antalPrVare(filtrerPaaVare(lagerRows, "samsung")).map((v) => [v.navn, v.antal]), [["Samsung QE55", 1]]);
eq("varenavn falder tilbage på varetype", varenavn({ varetypeNavn: "Ovn" }), "Ovn");
eq("tomme/ugyldige rækker", [antalPrVare(null), filtrerPaaVare(null, "x")], [[], []]);

console.log(`${pass} bestået, ${fail} fejlet`);
if (fail > 0) process.exit(1);
