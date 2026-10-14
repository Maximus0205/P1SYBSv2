// Test af lib/billingHelpers.js (rene hjælpere til backoffice). Kør med: node tests/billing.test.mjs
import { maanedPeriode, forrigeMaaned, indevaerendeMaaned, kr, krEnhed, taalFraTekst, oreFraKr, enhedsOreFraKr, krTilFelt, datoTekst, graenseStatus } from "../src/lib/billingHelpers.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

eq("måned: september", maanedPeriode("2026-09"), { fra: "2026-09-01", til: "2026-09-30" });
eq("måned: februar skudår", maanedPeriode("2028-02"), { fra: "2028-02-01", til: "2028-02-29" });
eq("måned: februar", maanedPeriode("2026-02"), { fra: "2026-02-01", til: "2026-02-28" });
eq("måned: december", maanedPeriode("2026-12"), { fra: "2026-12-01", til: "2026-12-31" });
eq("måned: ugyldig", [maanedPeriode("2026-13"), maanedPeriode(""), maanedPeriode("x")], [null, null, null]);
eq("forrige måned: januar -> december", forrigeMaaned(new Date(2027, 0, 15)), "2026-12");
eq("indeværende måned", indevaerendeMaaned(new Date(2026, 9, 14)), "2026-10");

eq("kr: 123,45", kr(12345).replace(/ /g, " "), "123,45 kr.");
eq("kr: tusindtal", kr(123456789).replace(/ /g, " "), "1.234.567,89 kr.");
eq("kr: ugyldig -> 0", kr(undefined).replace(/ /g, " "), "0,00 kr.");
eq("krEnhed: 35,5 øre", krEnhed(35.5), "0,355 kr.");
eq("krEnhed: 2 øre", krEnhed(2), "0,02 kr.");

eq("tal: dansk format", taalFraTekst("1.234,50"), 1234.5);
eq("tal: punktum-decimal", taalFraTekst("1234.5"), 1234.5);
eq("tal: tomt/ugyldigt/negativt", [taalFraTekst(""), taalFraTekst("abc"), taalFraTekst("-5"), taalFraTekst("1,2,3")], [null, null, null, null]);
eq("kr -> øre", [oreFraKr("999"), oreFraKr("0,01"), oreFraKr("19,99"), oreFraKr("")], [99900, 1, 1999, null]);
eq("enhedspris: 0,355 kr = 35,5 øre", enhedsOreFraKr("0,355"), 35.5);
eq("enhedspris: 0,02 kr = 2 øre", enhedsOreFraKr("0,02"), 2);
eq("øre -> felt", [krTilFelt(99900), krTilFelt(1999), krTilFelt(null), krTilFelt(0)], ["999", "19,99", "", "0"]);
eq("dato", datoTekst("2026-10-14"), "14.10.2026");
eq("dato: tom/ugyldig", [datoTekst(""), datoTekst("x")], ["", ""]);

const gr = [{ metric: "sms", advarsel_ved: 80, spaerr_ved: 100 }, { metric: "sager", advarsel_ved: 500, spaerr_ved: null }, { metric: "ors_matrix", advarsel_ved: null, spaerr_ved: null }];
eq("grænse: under", graenseStatus(gr, { sms: 79, sager: 10 }), {});
eq("grænse: advarsel", graenseStatus(gr, { sms: 80 }), { sms: "advarsel" });
eq("grænse: spærret ved præcis grænsen", graenseStatus(gr, { sms: 100 }), { sms: "spaerret" });
eq("grænse: sager kan kun advare", graenseStatus(gr, { sager: 9999 }), { sager: "advarsel" });
eq("grænse: uden forbrug/grænser", [graenseStatus([], { sms: 5 }), graenseStatus(gr, undefined)], [{}, {}]);

console.log(`${pass} bestået, ${fail} fejlet`);
if (fail) process.exit(1);
