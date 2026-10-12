// Regressionstest til bookingoversigten (src/lib/bookingOversigt.js).
// Kør med:  node tests/bookingOversigt.test.mjs
import { bookedeVarer, grupperPrDato, normaliserInterval, opsummerVaretyper, saelgereIOrdrer } from "../src/lib/bookingOversigt.js";

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

console.log(`${pass} bestået, ${fail} fejlet`);
if (fail > 0) process.exit(1);
