// Regressionstest til forslag om dagens hold (src/lib/holdForslag.js). Kør: node tests/holdForslag.test.mjs
import { foreslaaHold } from "../src/lib/holdForslag.js";
let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};
const bil = (id, montoerIds, stop, toMandStop) => ({ id, navn: id, montoerIds, stop, toMandStop });
const hj = (id) => ({ id, navn: id });
const pr = (r) => r.tildelinger.map((t) => `${t.personId}>${t.vehicleId}:${t.aarsag}`).sort();

// Grundcase: kun biler med to-mands-stop får en medhjælper
let r = foreslaaHold({ biler: [bil("b1", ["m1"], 3, 1), bil("b2", ["m2"], 4, 0)], hjaelpere: [hj("h1")] });
eq("kun bil med to-mands-stop", pr(r), ["h1>b1:forslag"]);
eq("ingen mangler", r.mangler, []);

// Fast makkerpar går først - også på bil uden to-mands-stop (har stop)
r = foreslaaHold({ biler: [bil("b1", ["m1"], 3, 1), bil("b2", ["m2"], 2, 0)], hjaelpere: [hj("h1"), hj("h2")], faste: [{ montorId: "m2", helperId: "h2" }] });
eq("fast par bevares, den anden får to-mands-bilen", pr(r), ["h1>b1:forslag", "h2>b2:fast"]);

// Fast par: bil uden stop -> ingen
r = foreslaaHold({ biler: [bil("b2", ["m2"], 0, 0)], hjaelpere: [hj("h2")], faste: [{ montorId: "m2", helperId: "h2" }] });
eq("fast par ikke på tom bil", [pr(r), r.ledige], [[], ["h2"]]);

// Fast pars medhjælper er syg (ikke i listen) -> bilen får en anden til sit to-mands-stop
r = foreslaaHold({ biler: [bil("b2", ["m2"], 2, 1)], hjaelpere: [hj("h3")], faste: [{ montorId: "m2", helperId: "h2" }] });
eq("fast makker fraværende -> anden hjælper", pr(r), ["h3>b2:forslag"]);

// Kører alene: får ingen, og to-mands-stop meldes
r = foreslaaHold({ biler: [bil("b1", ["m1"], 3, 2)], hjaelpere: [hj("h1")], alene: ["m1"] });
eq("alene får ingen", [pr(r), r.mangler, r.ledige], [[], [{ vehicleId: "b1", aarsag: "alene" }], ["h1"]]);
r = foreslaaHold({ biler: [bil("b1", ["m1"], 3, 0)], hjaelpere: [hj("h1")], alene: ["m1"] });
eq("alene uden to-mands-stop: ingen mangler", r.mangler, []);

// For få medhjælpere: den bil med flest to-mands-stop vælges først
r = foreslaaHold({ biler: [bil("b1", ["m1"], 3, 1), bil("b2", ["m2"], 3, 3)], hjaelpere: [hj("h1")] });
eq("flest to-mands-stop først", [pr(r), r.mangler], [["h1>b2:forslag"], [{ vehicleId: "b1", aarsag: "ingen-ledig" }]]);

// Bil med to montører har allerede nok hænder
r = foreslaaHold({ biler: [bil("b1", ["m1", "m9"], 3, 2)], hjaelpere: [hj("h1")] });
eq("to montører = dækket", [pr(r), r.mangler], [[], []]);

// Retfærdighed: variation på bil
const hist = [{ dato: "2026-10-01", helperId: "h1", vehicleId: "b1" }, { dato: "2026-10-02", helperId: "h1", vehicleId: "b1" }, { dato: "2026-10-01", helperId: "h2", vehicleId: "b2" }];
r = foreslaaHold({ biler: [bil("b1", ["m1"], 3, 1), bil("b2", ["m2"], 3, 1)], hjaelpere: [hj("h1"), hj("h2")], historik: hist });
eq("variation: h1 har kørt meget med b1 -> skifter", pr(r), ["h1>b2:forslag", "h2>b1:forslag"]);

// Retfærdighed: flere hjælpere end biler -> den med flest dage står over
r = foreslaaHold({ biler: [bil("b1", ["m1"], 3, 1)], hjaelpere: [hj("h1"), hj("h2")], historik: [{ dato: "d", helperId: "h1", vehicleId: "bx" }, { dato: "d2", helperId: "h1", vehicleId: "bx" }] });
eq("færrest dage vælges", [pr(r), r.ledige], [["h2>b1:forslag"], ["h1"]]);

// Godkendt (låst) bevares, og samme person bruges ikke to gange
r = foreslaaHold({ biler: [bil("b1", ["m1"], 3, 1), bil("b2", ["m2"], 3, 1)], hjaelpere: [hj("h1"), hj("h2")], laast: [{ personId: "h1", vehicleId: "b2" }] });
eq("låst bevares, ingen dobbelt", pr(r), ["h1>b2:laast", "h2>b1:forslag"]);

// Stabil/deterministisk
eq("deterministisk", JSON.stringify(foreslaaHold({ biler: [bil("b1", ["m1"], 3, 1), bil("b2", ["m2"], 3, 1)], hjaelpere: [hj("h2"), hj("h1")] })), JSON.stringify(foreslaaHold({ biler: [bil("b2", ["m2"], 3, 1), bil("b1", ["m1"], 3, 1)], hjaelpere: [hj("h1"), hj("h2")] })));

// Tomme input
eq("tom", foreslaaHold(), { tildelinger: [], mangler: [], ledige: [] });
// 2. MAND (oktober 2026): montører kan være 2. mand - men først når der ikke er en rigtig medhjælper
const mt = (id) => ({ id, navn: id, reserve: true });
r = foreslaaHold({ biler: [bil("b1", ["m1"], 3, 1)], hjaelpere: [mt("m2"), hj("h1")] });
eq("montør er reserve: rigtig medhjælper vælges først", pr(r), ["h1>b1:forslag"]);
r = foreslaaHold({ biler: [bil("b1", ["m1"], 3, 1)], hjaelpere: [mt("m2")] });
eq("montør kan være 2. mand, når der ingen medhjælper er", pr(r), ["m2>b1:forslag"]);
r = foreslaaHold({ biler: [bil("b1", ["m1"], 3, 1)], hjaelpere: [mt("m1")] });
eq("montør kan aldrig være 2. mand på sin egen bil", [pr(r), r.mangler], [[], [{ vehicleId: "b1", aarsag: "ingen-ledig" }]]);
r = foreslaaHold({ biler: [bil("b1", ["m1"], 3, 1), bil("b2", ["m2"], 0, 0)], hjaelpere: [mt("m2")], faste: [{ montorId: "m1", helperId: "m2" }] });
eq("fast makker kan være en anden montør", pr(r), ["m2>b1:fast"]);

console.log(`${pass} bestået, ${fail} fejlet`);
if (fail > 0) process.exit(1);
