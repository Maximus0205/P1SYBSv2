// Regressionstest til tid på en igangværende opgave (src/lib/opgaveTid.js).
// Kør med:  node tests/opgaveTid.test.mjs
import { logMs, afsluttetMs, koerendeMs, samletMs, erPauset, formaterTid, pausePatch } from "../src/lib/opgaveTid.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};
const T0 = Date.parse("2026-10-05T08:00:00Z");
const iso = (ms) => new Date(ms).toISOString();

// --- formatering
eq("0 sekunder", formaterTid(0), "0:00:00");
eq("42 min 10 sek", formaterTid((42 * 60 + 10) * 1000), "0:42:10");
eq("1 time 5 min 9 sek", formaterTid((3600 + 5 * 60 + 9) * 1000), "1:05:09");
eq("over 10 timer", formaterTid(10 * 3600 * 1000), "10:00:00");
eq("ugyldig/negativ giver 0", [formaterTid(-5), formaterTid(NaN), formaterTid(undefined), formaterTid(null)], ["0:00:00", "0:00:00", "0:00:00", "0:00:00"]);
eq("brøkdele af sekunder rundes ned", formaterTid(59999), "0:00:59");

// --- én periode
eq("periode med start og slut bruger dem (ikke de afrundede minutter)", logMs({ ind: iso(T0), ud: iso(T0 + 150000), minutter: 3 }), 150000);
eq("periode uden tidspunkter bruger minutterne", logMs({ minutter: 5 }), 300000);
eq("ødelagt tidspunkt falder tilbage på minutter", logMs({ ind: "x", ud: "y", minutter: 2 }), 120000);
eq("slut før start giver 0, ikke negativ", logMs({ ind: iso(T0 + 5000), ud: iso(T0) }), 0);
eq("tom/ukendt periode", [logMs(null), logMs({}), logMs(undefined)], [0, 0, 0]);

// --- samlet tid
const o1 = { status: "igang", stemplerInd: iso(T0), logs: [] };
eq("kørende opgave: tid siden start", samletMs(o1, T0 + 125000), 125000);
eq("før start er der ingen tid", koerendeMs({}, T0), 0);
eq("ur der går baglæns giver ikke negativ tid", koerendeMs(o1, T0 - 5000), 0);
const o2 = { status: "igang", stemplerInd: iso(T0 + 600000), logs: [{ ind: iso(T0), ud: iso(T0 + 300000), minutter: 5 }] };
eq("tidligere periode + kørende periode lægges sammen", samletMs(o2, T0 + 660000), 300000 + 60000);
eq("afsluttede perioder alene", afsluttetMs(o2), 300000);
eq("ingen logs", afsluttetMs({}), 0);

// --- pause
eq("kørende opgave er ikke pauset", erPauset(o1), false);
eq("igang uden kørende periode ER pauset", erPauset({ status: "igang", stemplerInd: null, logs: [] }), true);
eq("planlagt (ikke startet) er ikke pauset", erPauset({ status: "planlagt", stemplerInd: null }), false);
eq("afsluttet er ikke pauset", erPauset({ status: "afsluttet", stemplerInd: null }), false);

const p = pausePatch(o1, iso(T0 + 125000), "L1");
eq("pause lukker den kørende periode og nulstiller stemplingen", [p.stemplerInd, p.logs.length, p.logs[0].id, p.logs[0].ind, p.logs[0].ud, p.logs[0].minutter], [null, 1, "L1", iso(T0), iso(T0 + 125000), 2]);
eq("pause bevarer tidligere perioder", pausePatch(o2, iso(T0 + 660000), "L2").logs.length, 2);
eq("pause uden kørende periode ændrer intet", pausePatch({ status: "igang", stemplerInd: null, logs: [] }, iso(T0), "x"), {});
eq("en pause under 30 sek. tæller mindst 1 minut (som færdigmelding)", pausePatch(o1, iso(T0 + 10000), "L3").logs[0].minutter, 1);

// --- tælleren hopper ikke ved pause
const foer = samletMs(o1, T0 + 125000);
const paused = { ...o1, ...pausePatch(o1, iso(T0 + 125000), "L1") };
eq("tiden er den samme lige før og lige efter pause", samletMs(paused, T0 + 125000), foer);
eq("og står stille, mens opgaven er pauset", samletMs(paused, T0 + 999999999), foer);
const genoptaget = { ...paused, stemplerInd: iso(T0 + 3600000) };
eq("genoptaget: pausen tæller ikke med, ny periode lægges til", samletMs(genoptaget, T0 + 3600000 + 60000), foer + 60000);
eq("estimaterne ser kun arbejdstid (summen af logs i hele minutter)", paused.logs.reduce((s, l) => s + l.minutter, 0), 2);

console.log(`\n${pass} bestået, ${fail} fejlet`);
process.exit(fail ? 1 : 0);
