// Test af lib/adresseOpslag.js. Kør med: node tests/adresseOpslag.test.mjs
import { vaelgHusnummerId, slaaKoordinaterOp, postnrFra } from "../src/lib/adresseOpslag.js";
import { parseQuery } from "../src/adapters/adressevaelger/index.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

const fund = [
  { type: "husnummer", id: "a1", titel: "Vejen 5, 5000 Odense C", vejnavn: "Vejen", husnummer: "5" },
  { type: "husnummer", id: "a2", titel: "Vejen 5, 8700 Horsens", vejnavn: "Vejen", husnummer: "5" },
  { type: "adresse", id: "a3", titel: "Vejen 5, 1. th, 5000 Odense C", vejnavn: "Vejen", husnummer: "5" },
];
eq("postnr fra titel når feltet mangler", [postnrFra(fund[0]), postnrFra({ postnr: 5260 })], ["5000", "5260"]);
eq("match med postnummer vælger den rigtige by", vaelgHusnummerId(fund, { vejnavn: "Vejen", husnummer: "5", postnummer: "8700" }), "a2");
eq("uden postnummer og flere byer: intet gæt", vaelgHusnummerId(fund, { vejnavn: "Vejen", husnummer: "5" }), null);
eq("forkert husnummer: intet match", vaelgHusnummerId(fund, { vejnavn: "Vejen", husnummer: "7", postnummer: "5000" }), null);
eq("kun husnummer-typer tæller", vaelgHusnummerId([fund[2]], { vejnavn: "Vejen", husnummer: "5", postnummer: "5000" }), null);

const deps = { parse: parseQuery, soeg: async () => ({ ok: true, fund }), opslag: async () => ({ lat: 55.4, lon: 10.4 }) };
eq("opslag: koordinater + id + tekst præcis som adressen", await slaaKoordinaterOp("Vejen 5, 5000 Odense C", deps), { lat: 55.4, lon: 10.4, adresseId: "a1", type: "husnummer", tekst: "Vejen 5, 5000 Odense C" });
eq("opslag: uden sikkert match -> null", await slaaKoordinaterOp("Vejen 5", deps), null);
eq("opslag: søgning fejler -> null", await slaaKoordinaterOp("Vejen 5, 5000 Odense C", { ...deps, soeg: async () => ({ ok: false, fund: [] }) }), null);
eq("opslag: opslag kaster -> null", await slaaKoordinaterOp("Vejen 5, 5000 Odense C", { ...deps, opslag: async () => { throw new Error("x"); } }), null);
eq("opslag: tom/for kort adresse -> null", [await slaaKoordinaterOp("", deps), await slaaKoordinaterOp("ab", deps)], [null, null]);

console.log(`${pass} bestået, ${fail} fejlet`);
if (fail) process.exit(1);
