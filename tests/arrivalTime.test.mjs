// Regressionstest til tid og tekst for ankomst-SMS (src/lib/arrivalTime.js).
// Kør med:  node tests/arrivalTime.test.mjs
import { varighedTekst, ankomstFrase, intervalKnapTekst, tolkAnkomst, ENKELT_TIDER, INTERVALLER, MAKS_MINUTTER } from "../src/lib/arrivalTime.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

// --- sætningerne skal være identiske med serverens (se funktionens tests, punkt 12)
eq("1 min ental", varighedTekst(1), "1 minut");
eq("45 min", varighedTekst(45), "45 minutter");
eq("59 min", varighedTekst(59), "59 minutter");
eq("60 = 1 time", varighedTekst(60), "1 time");
eq("90 = 1 time og 30 minutter", varighedTekst(90), "1 time og 30 minutter");
eq("61 = 1 time og 1 minut", varighedTekst(61), "1 time og 1 minut");
eq("120 = 2 timer", varighedTekst(120), "2 timer");
eq("240 = 4 timer", varighedTekst(240), "4 timer");

eq("enkelt 15", ankomstFrase(15, null), "om ca. 15 minutter");
eq("enkelt 15 uden til", ankomstFrase(15), "om ca. 15 minutter");
eq("enkelt 60", ankomstFrase(60, null), "om ca. 1 time");
eq("enkelt 90", ankomstFrase(90, null), "om ca. 1 time og 30 minutter");
eq("interval 30-60", ankomstFrase(30, 60), "om mellem 30 og 60 minutter");
eq("interval 60-120 hele timer", ankomstFrase(60, 120), "om mellem 1 og 2 timer");
eq("interval 45-90", ankomstFrase(45, 90), "om mellem 45 og 90 minutter");
eq("interval 90-180 i minutter", ankomstFrase(90, 180), "om mellem 90 og 180 minutter");
eq("interval 30-240", ankomstFrase(30, 240), "om mellem 30 og 240 minutter");
eq("interval 1-2", ankomstFrase(1, 2), "om mellem 1 og 2 minutter");
eq("interval 60-90 er ikke hele timer", ankomstFrase(60, 90), "om mellem 60 og 90 minutter");

eq("knaptekst minutter", intervalKnapTekst(30, 60), "30–60 min");
eq("knaptekst timer", intervalKnapTekst(60, 120), "1–2 timer");

// --- hurtigknapperne er gyldige og sorterede
eq("alle enkelte tider er gyldige", ENKELT_TIDER.every((m) => tolkAnkomst(String(m), "").ok), true);
eq("alle intervaller er gyldige", INTERVALLER.every(([a, b]) => tolkAnkomst(String(a), String(b)).ok), true);

// --- tolkning af indtastning
eq("tomt: ingen fejl at vise", tolkAnkomst("", ""), { ok: false, tom: true });
eq("kun mellemrum er tomt", tolkAnkomst("  ", " "), { ok: false, tom: true });
eq("kun fra", tolkAnkomst("20", ""), { ok: true, fra: 20, til: null });
eq("kun fra, undefined til", tolkAnkomst("20"), { ok: true, fra: 20, til: null });
eq("fra og til", tolkAnkomst("30", "60"), { ok: true, fra: 30, til: 60 });
eq("mellemrum trimmes", tolkAnkomst(" 45 ", " 90 "), { ok: true, fra: 45, til: 90 });
eq("foranstillet nul", tolkAnkomst("030", "060"), { ok: true, fra: 30, til: 60 });
eq("præcis 240", tolkAnkomst("240", ""), { ok: true, fra: 240, til: null });
eq("til = 240", tolkAnkomst("30", "240"), { ok: true, fra: 30, til: 240 });
eq("1 er tilladt", tolkAnkomst("1", ""), { ok: true, fra: 1, til: null });
eq("kun til uden fra", tolkAnkomst("", "60").ok, false);
eq("kun til uden fra: besked", typeof tolkAnkomst("", "60").fejl, "string");
for (const [f, t, hvorfor] of [["0", "", "nul"], ["241", "", "over max"], ["999", "", "tre cifre over max"], ["1.5", "", "decimal"], ["1,5", "", "komma"], ["abc", "", "tekst"], ["-5", "", "negativ"], ["1e2", "", "videnskabelig"], ["30", "30", "til = fra"], ["30", "20", "til < fra"], ["30", "241", "til over max"], ["30", "abc", "til tekst"], ["30", "4.5", "til decimal"], ["1000", "", "fire cifre"], ["30", "1000", "til fire cifre"]]) {
  const r = tolkAnkomst(f, t);
  eq(`afvist (${hvorfor}): ${f}/${t}`, [r.ok, typeof r.fejl], [false, "string"]);
}
eq("grænsen er 240", MAKS_MINUTTER, 240);

console.log(`\n${pass} bestået, ${fail} fejlet`);
process.exit(fail ? 1 : 0);
