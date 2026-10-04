// Regressionstest til tid og tekst for ankomst-SMS (src/lib/arrivalTime.js).
// Kør med:  node tests/arrivalTime.test.mjs
import { varighedTekst, ankomstFrase, intervalKnapTekst, tolkAnkomst, ENKELT_TIDER, INTERVALLER, MAKS_MINUTTER, MAKS_ENKELTE, MAKS_INTERVALLER, STANDARD_SKABELON_ENKELT, STANDARD_SKABELON_INTERVAL, fornavnFra, tidDel, udfyldSkabelon, skabelonFejl, byggBesked, knapperFejl, afsenderFejl, smsAntal } from "../src/lib/arrivalTime.js";

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

// --- SKABELONER: samme sætninger som serverens (se funktionens tests, punkt 16-19)
eq("standard, én tid", byggBesked(STANDARD_SKABELON_ENKELT, "Karen Hansen-Møller", 15), "Hej Karen, vi forventer at ankomme hos dig om ca. 15 minutter.");
eq("standard, interval", byggBesked(STANDARD_SKABELON_INTERVAL, "Karen", 30, 60), "Hej Karen, vi forventer at ankomme hos dig om mellem 30 og 60 minutter.");
eq("standard, hele timer", byggBesked(STANDARD_SKABELON_INTERVAL, "Karen", 60, 120), "Hej Karen, vi forventer at ankomme hos dig om mellem 1 og 2 timer.");
eq("standard, 60 min = 1 time", byggBesked(STANDARD_SKABELON_ENKELT, "Karen", 60), "Hej Karen, vi forventer at ankomme hos dig om ca. 1 time.");
eq("uden navn: intet mellemrum før komma", byggBesked("Hej {fornavn}, vi kommer {tid}.", "", 15), "Hej, vi kommer 15 minutter.");
eq("pladsholdere flere gange og i andet rækkefølge", byggBesked("{tid} - hilsen {fornavn}. {tid}.", "Karen", 10), "10 minutter - hilsen Karen. 10 minutter.");
eq("egen tekst", byggBesked("Hej {fornavn}! Montøren er hos dig om {tid}. Mvh Power", "Karen", 15), "Hej Karen! Montøren er hos dig om 15 minutter. Mvh Power");
eq("kundens navn renses (tegn og pladsholdere)", byggBesked("Hej {fornavn}, vi kommer {tid}.", "<b>Klik http://x.dk</b> Jensen", 10), "Hej bKlik, vi kommer 10 minutter.");
eq("navn med {tid} kan ikke snyde", fornavnFra("{tid} Hansen"), "tid");
eq("ugyldig skabelon -> standard", byggBesked("Hej uden pladsholder", "Karen", 15), "Hej Karen, vi forventer at ankomme hos dig om ca. 15 minutter.");
eq("ugyldig skabelon (interval) -> standard", byggBesked("ødelagt", "Karen", 30, 60), "Hej Karen, vi forventer at ankomme hos dig om mellem 30 og 60 minutter.");
eq("tidDel én tid", tidDel(90), "1 time og 30 minutter");
eq("tidDel interval", tidDel(45, 90), "45 og 90 minutter");
eq("udfyld bruger ikke $-mønstre", udfyldSkabelon("{fornavn} {tid}", "A$&B", "10 minutter"), "A$&B 10 minutter");

// --- skabelonFejl: samme regler og tekster som databasen
eq("skabelon: standardtekster er gyldige", [skabelonFejl(STANDARD_SKABELON_ENKELT), skabelonFejl(STANDARD_SKABELON_INTERVAL)], [null, null]);
for (const [navn, tekst, del] of [["uden {tid}", "Hej {fornavn}, vi kommer snart.", "{tid}"], ["for kort", "{tid}", "10 tegn"], ["tom", "", "10 tegn"], ["ikke tekst", 42, "10 tegn"], ["for lang", "a".repeat(330) + " {tid}", "320"], ["linjeskift", "Hej\n{fornavn} {tid} nu.", "specialtegn"], ["ukendt pladsholder", "Hej {navn}, vi kommer {tid}.", "fornavn"], ["http", "Hej, se http://x.nu {tid}.", "links"], ["www", "Hej, www.x.nu {tid}.", "links"], [".dk", "Hej, powerdk.dk {tid}.", "links"], [".com", "Hej, power.com {tid}.", "links"]]) {
  const f = skabelonFejl(tekst);
  eq(`skabelon afvises: ${navn}`, typeof f === "string" && f.includes(del), true);
}
eq("skabelon: {tid} to gange er ok", skabelonFejl("Hej {fornavn}, {tid}. Altså {tid}."), null);
eq("skabelon: præcis 320 er ok", skabelonFejl("a".repeat(314) + " {tid}"), null);
eq("skabelon: 321 afvises", typeof skabelonFejl("a".repeat(315) + " {tid}"), "string");
eq("skabelon: punktum i sætning er ikke et link", skabelonFejl("Hej {fornavn}. Vi kommer {tid}. Mvh Power."), null);

// --- knapperFejl
eq("knapper: standard er gyldige", knapperFejl(ENKELT_TIDER, INTERVALLER), null);
eq("knapper: tomme lister er tilladt", knapperFejl([], []), null);
eq("knapper: 8 + 6 er ok", knapperFejl([1, 2, 3, 4, 5, 6, 7, 240], [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 240]]), null);
for (const [navn, e, i, del] of [["9 enkelte", [1, 2, 3, 4, 5, 6, 7, 8, 9], [], "Højst 8"], ["0", [0], [], "mellem 1 og 240"], ["241", [241], [], "mellem 1 og 240"], ["decimal", [1.5], [], "mellem 1 og 240"], ["dublet", [5, 5], [], "flere gange"], ["slut=start", [5], [[30, 30]], "større end"], ["slut<start", [5], [[30, 20]], "større end"], ["interval 241", [5], [[30, 241]], "mellem 1 og 240"], ["interval 0", [5], [[0, 10]], "mellem 1 og 240"], ["7 intervaller", [5], [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8]], "Højst 6"], ["tre tal", [5], [[1, 2, 3]], "to hele tal"], ["decimal-interval", [5], [[1.5, 3]], "to hele tal"], ["samme interval", [5], [[30, 60], [30, 60]], "flere gange"]]) {
  const f = knapperFejl(e, i);
  eq(`knapper afvises: ${navn}`, typeof f === "string" && f.includes(del), true);
}
eq("grænser", [MAKS_ENKELTE, MAKS_INTERVALLER], [8, 6]);

// --- afsender
for (const v of ["", "  ", "PowerOdense", "Power Odens", "12345678", "4512345678", "123456789012345", "A", "a1"]) eq(`afsender ok: "${v}"`, afsenderFejl(v), null);
for (const v of ["Skat!", "123456789012345678", "FireOgTyveBogstaver", "Power Odense", "Bøgholm", "12345 678", "Åbent", "***"]) eq(`afsender afvises: "${v}"`, typeof afsenderFejl(v), "string");

// --- SMS-længde
eq("160 almindelige tegn = 1 SMS", smsAntal("a".repeat(160)), { tegn: 160, gsm: true, segmenter: 1 });
eq("161 tegn = 2 SMS", smsAntal("a".repeat(161)).segmenter, 2);
eq("306 tegn = 2 SMS", smsAntal("a".repeat(306)).segmenter, 2);
eq("307 tegn = 3 SMS", smsAntal("a".repeat(307)).segmenter, 3);
eq("æøå er almindelige tegn", smsAntal("Hej, vi kommer før æøå ÆØÅ").gsm, true);
eq("tankestreg gør beskeden dyrere", smsAntal("Hej – vi kommer").gsm, false);
eq("emoji gør beskeden dyrere", smsAntal("Hej 😀").gsm, false);
eq("dyr besked: 70 tegn = 1 SMS", smsAntal("–".repeat(70)).segmenter, 1);
eq("dyr besked: 71 tegn = 2 SMS", smsAntal("–".repeat(71)).segmenter, 2);
eq("tom tekst = 0 SMS", smsAntal("").segmenter, 0);
eq("standardteksterne med længste tid er under 160 tegn", [byggBesked(STANDARD_SKABELON_INTERVAL, "A".repeat(20), 90, 240), byggBesked(STANDARD_SKABELON_ENKELT, "A".repeat(20), 239)].every((x) => smsAntal(x).segmenter === 1), true);

console.log(`\n${pass} bestået, ${fail} fejlet`);
process.exit(fail ? 1 : 0);
