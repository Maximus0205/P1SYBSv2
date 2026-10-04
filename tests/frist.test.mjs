// Regressionstest til frist på tomgang (src/lib/frist.js).
// Kør med:  node tests/frist.test.mjs
import { dageTil, forslagsDatoer, fristStatus, urgensNoegle, fristFejl } from "../src/lib/frist.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};
const I = "2026-10-07"; // onsdag

eq("dageTil i dag", dageTil("2026-10-07", I), 0);
eq("dageTil i morgen", dageTil("2026-10-08", I), 1);
eq("dageTil i går", dageTil("2026-10-06", I), -1);
eq("dageTil over sommertid-skiftet (25. okt)", dageTil("2026-10-26", "2026-10-24"), 2);
eq("dageTil over årsskifte", dageTil("2027-01-01", "2026-12-30"), 2);

// --- forslagsDatoer
const udenFrist = forslagsDatoer({}, I);
eq("uden frist: 14 dage som før", [udenFrist.length, udenFrist[0], udenFrist[13]], [14, "2026-10-07", "2026-10-20"]);
eq("null/undefined ordre: som uden frist", [forslagsDatoer(null, I).length, forslagsDatoer(undefined, I).length], [14, 14]);
const iDag = forslagsDatoer({ senestDato: "2026-10-07" }, I);
eq("frist i dag: kun i dag", iDag, ["2026-10-07"]);
const fredag = forslagsDatoer({ senestDato: "2026-10-09" }, I);
eq("frist fredag: i dag til og med fredag", fredag, ["2026-10-07", "2026-10-08", "2026-10-09"]);
eq("frist i fortiden: ingen datoer", forslagsDatoer({ senestDato: "2026-10-06" }, I), []);
const lang = forslagsDatoer({ senestDato: "2026-11-04" }, I);
eq("frist om 28 dage: hele vejen til fristen, ud over de 14", [lang.length, lang[0], lang.at(-1)], [29, "2026-10-07", "2026-11-04"]);
eq("frist langt ude: højst 42 dage", forslagsDatoer({ senestDato: "2027-06-01" }, I).length, 42);
eq("fristen er ikke med efter fristen", fredag.includes("2026-10-10"), false);
eq("tom frist-streng regnes som ingen frist", forslagsDatoer({ senestDato: "" }, I).length, 14);

// --- fristStatus
eq("ingen frist", fristStatus({}, I), null);
eq("overskredet", fristStatus({ senestDato: "2026-10-06" }, I), { niveau: "overskredet", dage: -1 });
eq("i dag er 'snart'", fristStatus({ senestDato: "2026-10-07" }, I), { niveau: "snart", dage: 0 });
eq("om 3 dage er 'snart'", fristStatus({ senestDato: "2026-10-10" }, I).niveau, "snart");
eq("om 4 dage er 'ok'", fristStatus({ senestDato: "2026-10-11" }, I).niveau, "ok");

// --- sortering: mest presserende først
const sager = [{ id: "a" }, { id: "b", dato: "2026-10-20" }, { id: "c", senestDato: "2026-10-09" }, { id: "d", senestDato: "2026-10-15", dato: "2026-10-30" }];
eq("frist vejer tungere end dato; uden begge sidst", [...sager].sort((x, y) => urgensNoegle(x).localeCompare(urgensNoegle(y))).map((s) => s.id), ["c", "d", "b", "a"]);

// --- formularens kontrol
const k = (o) => fristFejl({ idag: I, ...o });
eq("kundesag: aldrig en fristfejl", k({ erTomgang: false, fleksibel: true, senestDato: "" }), null);
eq("fleksibel uden frist", typeof k({ erTomgang: true, fleksibel: true, senestDato: "" }), "string");
eq("fleksibel med frist er ok", k({ erTomgang: true, fleksibel: true, senestDato: "2026-10-20" }), null);
eq("frist i fortiden", k({ erTomgang: true, fleksibel: true, senestDato: "2026-10-06" }), "Fristen ligger i fortiden.");
eq("frist i dag er ok", k({ erTomgang: true, fleksibel: true, senestDato: "2026-10-07" }), null);
eq("fast dato uden frist er ok (fristen er valgfri)", k({ erTomgang: true, fleksibel: false, senestDato: "", dato: "2026-10-09" }), null);
eq("fast dato efter frist afvises", k({ erTomgang: true, fleksibel: false, senestDato: "2026-10-09", dato: "2026-10-12" }), "Den valgte dato ligger efter fristen.");
eq("fast dato på fristen er ok", k({ erTomgang: true, fleksibel: false, senestDato: "2026-10-09", dato: "2026-10-09" }), null);
eq("fast dato før frist er ok", k({ erTomgang: true, fleksibel: false, senestDato: "2026-10-09", dato: "2026-10-08" }), null);
eq("fleksibel ignorerer en gammel fast dato", k({ erTomgang: true, fleksibel: true, senestDato: "2026-10-09", dato: "2026-10-12" }), null);

console.log(`\n${pass} bestået, ${fail} fejlet`);
process.exit(fail ? 1 : 0);
