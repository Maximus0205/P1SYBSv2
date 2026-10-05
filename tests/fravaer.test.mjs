// Regressionstest til sygemelding/feriefridag i planlægningen (src/lib/fravaer.js).
// Kør med:  node tests/fravaer.test.mjs
import { fravaersAarsag, samlFravaer } from "../src/lib/fravaer.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};
const syg = (navn) => ({ person: { navn }, fravaer: { type: "sygdom" } });
const fer = (navn) => ({ person: { navn }, fravaer: { type: "ferie" } });

eq("én syg", fravaersAarsag([syg("Karen")]), "Sygemeldt: Karen");
eq("to syge", fravaersAarsag([syg("Karen"), syg("Bent")]), "Sygemeldt: Karen, Bent");
eq("én på ferie", fravaersAarsag([fer("Karen")]), "Ferie/fridag: Karen");
eq("syg og på ferie på samme bil", fravaersAarsag([syg("Karen"), fer("Bent")]), "Sygemeldt/ferie: Karen, Bent");
eq("uden navne", fravaersAarsag([{ fravaer: { type: "sygdom" } }]), "Sygemeldt");
eq("tom/ukendt liste", [fravaersAarsag([]), fravaersAarsag(null), fravaersAarsag(undefined)], ["Ferie/fridag", "Ferie/fridag", "Ferie/fridag"]);
eq("en person uden fravær (dækket) tæller ikke som syg", fravaersAarsag([{ person: { navn: "A" }, fravaer: null }, syg("B")]), "Sygemeldt: A, B");

const sort = (a, b) => (a.dato || "9999").localeCompare(b.dato || "9999");
const m = [{ id: "m1", dato: "2026-10-09", _issue: "Bilen er ude af drift" }, { id: "m2", dato: "2026-10-06", _issue: "Ingen montør er tilknyttet bilen" }];
const s = [{ id: "s1", dato: "2026-10-07", _fravaer: [syg("Karen")] }, { id: "s2", dato: "2026-10-05", _fravaer: [fer("Bent")] }];
const alle = samlFravaer(m, s, sort);
eq("de to lister lægges sammen og sorteres efter dato", alle.map((x) => x.id), ["s2", "m2", "s1", "m1"]);
eq("en sygemelding får sin årsag", alle.find((x) => x.id === "s1")._issue, "Sygemeldt: Karen");
eq("fravær/ferie får sin årsag", alle.find((x) => x.id === "s2")._issue, "Ferie/fridag: Bent");
eq("et montørproblem beholder sin egen årsag", alle.find((x) => x.id === "m1")._issue, "Bilen er ude af drift");
eq("en årsag, der allerede er sat, overskrives ikke", samlFravaer([], [{ id: "x", dato: "1", _issue: "Egen tekst", _fravaer: [syg("A")] }], sort)[0]._issue, "Egen tekst");
eq("tomme lister", [samlFravaer([], [], sort), samlFravaer(null, null, sort)], [[], []]);
eq("inputtet ændres ikke", [m.length, s[0]._issue], [2, undefined]);

console.log(`\n${pass} bestået, ${fail} fejlet`);
process.exit(fail ? 1 : 0);
