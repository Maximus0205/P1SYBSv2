// Test af reglerne bag de automatiske kunde-SMS'er (supabase/functions/sms-automatik/logik.js). Kør:  node tests/sms-automatik.test.mjs
import { readFileSync } from "node:fs";
import {
  skabelonFejl, STANDARD_TEKSTER, udfyld, datoTekst, tidsrumTekst, plusDage, danskNummer, fornavnFra, butikTekst, kobenhavn, planlaeg,
  NY_SAG_RO_MS, GENFORSOEG_EFTER_MS, bookingNoegle,
} from "../supabase/functions/sms-automatik/logik.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

// ---- klientkopien er identisk med serverkopien
eq("logik-kopi identisk", readFileSync("src/lib/smsAutomationLogik.js", "utf8") === readFileSync("supabase/functions/sms-automatik/logik.js", "utf8"), true);

// ---- skabeloner
for (const [k, t] of Object.entries(STANDARD_TEKSTER)) eq(`standardtekst ${k} gyldig`, skabelonFejl(t), null);
eq("ukendt pladsholder", skabelonFejl("Hej {fornavn}, {pris} kr.").includes("{pris}"), true);
eq("link afvises", skabelonFejl("Se mere på www.eksempel.dk om leveringen") !== null, true);
eq("http afvises", skabelonFejl("Se https://x.y om leveringen i dag") !== null, true);
eq("for kort", skabelonFejl("Hej") !== null, true);
eq("for lang", skabelonFejl("a".repeat(321)) !== null, true);
eq("løs tuborg", skabelonFejl("Hej {fornavn}, leveres } i dag til dig") !== null, true);
eq("linjeskift", skabelonFejl("Hej {fornavn}\nleveres i dag") !== null, true);
eq("ikke tekst", skabelonFejl(null) !== null, true);
eq("uden pladsholdere er ok", skabelonFejl("Vi leverer hos dig i morgen, mvh butikken"), null);

// ---- dato, tidsrum, udfyldning
eq("datoTekst", datoTekst("2026-10-16"), "fredag den 16. oktober");
eq("datoTekst ugyldig", datoTekst("16-10-2026"), "");
eq("plusDage over månedsskifte", plusDage("2026-10-31", 1), "2026-11-01");
eq("tidsrum", tidsrumTekst("08:00", "12:00"), "08:00-12:00");
eq("tidsrum omvendt", tidsrumTekst("12:00", "08:00"), "");
eq("tidsrum ugyldigt", tidsrumTekst("8:00", "12:00"), "");
eq("udfyld", udfyld(STANDARD_TEKSTER.morgen, { fornavn: "Anna", dato: "x", tidsrum: "08:00-12:00", butik: "Power Odense" }), "Hej Anna, i dag leverer vi hos dig i tidsrummet 08:00-12:00. Mvh Power Odense");
eq("udfyld uden fornavn", udfyld("Hej {fornavn}, vi kommer i dag", { fornavn: "", dato: "", tidsrum: "", butik: "" }), "Hej, vi kommer i dag");
eq("fornavn", fornavnFra("  Anna-Marie Hansen"), "Anna-Marie");
eq("fornavn renses", fornavnFra("A<b>nna"), "Abnna");
eq("butik renses", butikTekst("Power <Odense> https://x"), "Power Odense httpsx");
eq("dansk nummer", danskNummer("+45 22 33 44 55"), "22334455");
eq("ikke dansk nummer", danskNummer("0123"), null);

// ---- Københavns tid (sommer-/vintertid)
eq("sommertid", kobenhavn(Date.parse("2026-07-01T10:00:00Z")), { dato: "2026-07-01", minutter: 12 * 60 });
eq("vintertid", kobenhavn(Date.parse("2026-12-01T10:00:00Z")), { dato: "2026-12-01", minutter: 11 * 60 });
eq("dagsskifte i DK", kobenhavn(Date.parse("2026-10-10T22:30:00Z")), { dato: "2026-10-11", minutter: 0 * 60 + 30 + 0 });

// ---- planlægning
const NU = Date.parse("2026-10-11T16:30:00Z"); // 18:30 dansk tid, søndag 11/10
const ro = NU - NY_SAG_RO_MS - 1000;
const alle = { bekraeftelse: true, aendring: true, aften: true, morgen: true, aftenMin: 18 * 60, morgenMin: 7 * 60 + 30 };
const ingen = { bekraeftelse: false, aendring: false, aften: false, morgen: false, aftenMin: 18 * 60, morgenMin: 450 };
const o = (id, dato, extra = {}) => ({ id, dato, tidsrumId: "formiddag", start: "08:00", slut: "12:00", telefon: "22334455", status: "planlagt", opdateretMs: ro, ...extra });
const kinds = (r) => r.send.map((s) => `${s.ordreId}:${s.kind}`).sort();

eq("ny booking -> bekræftelse", kinds(planlaeg({ ordrer: [o("a", "2026-10-20")], tilstand: [], indst: alle, nu: NU })), ["a:bekraeftelse"]);
eq("alt slået fra -> intet", planlaeg({ ordrer: [o("a", "2026-10-12")], tilstand: [], indst: { ...ingen }, nu: NU }).send, []);
eq("alt slået fra -> bekræftelse noteres som sprunget", planlaeg({ ordrer: [o("a", "2026-10-20")], tilstand: [], indst: ingen, nu: NU }).registrer.map((r) => r.kind), ["bekraeftelse"]);
eq("sag redigeret for nylig venter", planlaeg({ ordrer: [o("a", "2026-10-20", { opdateretMs: NU - 60_000 })], tilstand: [], indst: alle, nu: NU }).send, []);
eq("uden telefon", planlaeg({ ordrer: [o("a", "2026-10-20", { telefon: "" })], tilstand: [], indst: alle, nu: NU }).send, []);
eq("afsluttet", planlaeg({ ordrer: [o("a", "2026-10-20", { status: "afsluttet" })], tilstand: [], indst: alle, nu: NU }).send, []);
eq("dato i fortiden", planlaeg({ ordrer: [o("a", "2026-10-10")], tilstand: [], indst: alle, nu: NU }).send, []);
eq("ugyldig dato", planlaeg({ ordrer: [o("a", "i morgen")], tilstand: [], indst: alle, nu: NU }).send, []);

const rk = (ordreId, kind, noegle, status, oprettetMs = ro - 3600_000 * 6, extra = {}) => ({ ordreId, kind, noegle, status, forsoeg: 1, oprettetMs, opdateretMs: oprettetMs, id: "x" + ordreId + kind, ...extra });
const nk = (dato, slot = "formiddag") => `${dato}|${slot}`;
eq("allerede bekræftet -> intet", planlaeg({ ordrer: [o("a", "2026-10-20")], tilstand: [rk("a", "bekraeftelse", nk("2026-10-20"), "sendt")], indst: alle, nu: NU }).send, []);
eq("baseline tæller som kendt", planlaeg({ ordrer: [o("a", "2026-10-20")], tilstand: [rk("a", "bekraeftelse", nk("2026-10-20"), "baseline")], indst: alle, nu: NU }).send, []);
eq("flyttet dato -> ændring", kinds(planlaeg({ ordrer: [o("a", "2026-10-22")], tilstand: [rk("a", "bekraeftelse", nk("2026-10-20"), "sendt")], indst: alle, nu: NU })), ["a:aendring"]);
eq("flyttet tidsrum -> ændring", kinds(planlaeg({ ordrer: [o("a", "2026-10-20", { tidsrumId: "eftermiddag" })], tilstand: [rk("a", "bekraeftelse", nk("2026-10-20"), "sendt")], indst: alle, nu: NU })), ["a:aendring"]);
eq("ændring slået fra -> noteres, sendes ikke", (() => { const r = planlaeg({ ordrer: [o("a", "2026-10-22")], tilstand: [rk("a", "bekraeftelse", nk("2026-10-20"), "sendt")], indst: { ...alle, aendring: false }, nu: NU }); return [r.send, r.registrer.map((x) => x.kind)]; })(), [[], ["aendring"]]);
eq("flyttet tilbage -> ny ændring (seneste afgør)", kinds(planlaeg({ ordrer: [o("a", "2026-10-20")], tilstand: [rk("a", "bekraeftelse", nk("2026-10-20"), "sendt", ro - 9e6), rk("a", "aendring", nk("2026-10-22"), "sendt", ro - 3e6)], indst: alle, nu: NU })), ["a:aendring"]);
eq("bil-skift alene giver ingen SMS", planlaeg({ ordrer: [o("a", "2026-10-20", { bilId: "v2" })], tilstand: [rk("a", "bekraeftelse", nk("2026-10-20"), "sendt")], indst: alle, nu: NU }).send, []);
eq("noegle", bookingNoegle({ dato: "2026-10-20" }), "2026-10-20|heldag");

// påmindelse aftenen før: i morgen = 2026-10-12, klokken 18:30 >= 18:00
eq("aften-påmindelse", kinds(planlaeg({ ordrer: [o("a", "2026-10-12")], tilstand: [rk("a", "bekraeftelse", nk("2026-10-12"), "sendt")], indst: alle, nu: NU })), ["a:paamindelse_aften"]);
eq("aften før kl.", planlaeg({ ordrer: [o("a", "2026-10-12")], tilstand: [rk("a", "bekraeftelse", nk("2026-10-12"), "sendt")], indst: { ...alle, aftenMin: 19 * 60 }, nu: NU }).send, []);
eq("aften efter kl. 22", planlaeg({ ordrer: [o("a", "2026-10-12")], tilstand: [rk("a", "bekraeftelse", nk("2026-10-12"), "sendt")], indst: alle, nu: Date.parse("2026-10-11T20:30:00Z") }).send, []); // 22:30 dansk
eq("aften sendes kun én gang", planlaeg({ ordrer: [o("a", "2026-10-12")], tilstand: [rk("a", "bekraeftelse", nk("2026-10-12"), "sendt"), rk("a", "paamindelse_aften", nk("2026-10-12"), "sendt")], indst: alle, nu: NU }).send, []);
eq("usikker aften sendes aldrig igen", planlaeg({ ordrer: [o("a", "2026-10-12")], tilstand: [rk("a", "bekraeftelse", nk("2026-10-12"), "sendt"), rk("a", "paamindelse_aften", nk("2026-10-12"), "usikker")], indst: alle, nu: NU }).send, []);
eq("ikke i morgen -> ingen aften-påmindelse", planlaeg({ ordrer: [o("a", "2026-10-13")], tilstand: [rk("a", "bekraeftelse", nk("2026-10-13"), "sendt")], indst: alle, nu: NU }).send, []);
eq("ny aftenpåmindelse efter flytning", kinds(planlaeg({ ordrer: [o("a", "2026-10-12")], tilstand: [rk("a", "bekraeftelse", nk("2026-10-10"), "sendt", ro - 9e8), rk("a", "aendring", nk("2026-10-12"), "sendt", ro - 9e7), rk("a", "paamindelse_aften", nk("2026-10-10"), "sendt", ro - 8e8)], indst: alle, nu: NU })), ["a:paamindelse_aften"]);
eq("lige bekræftet -> påmindelse springes over", (() => { const r = planlaeg({ ordrer: [o("a", "2026-10-12")], tilstand: [rk("a", "bekraeftelse", nk("2026-10-12"), "sendt", NU - 3600_000)], indst: alle, nu: NU }); return [r.send, r.registrer.map((x) => x.kind)]; })(), [[], ["paamindelse_aften"]]);
eq("ny booking til i morgen: kun bekræftelse", (() => { const r = planlaeg({ ordrer: [o("a", "2026-10-12")], tilstand: [], indst: alle, nu: NU }); return [kinds(r), r.registrer.map((x) => x.kind)]; })(), [["a:bekraeftelse"], ["paamindelse_aften"]]);

// påmindelse om morgenen: 2026-10-12 klokken 07:45 dansk = 05:45Z
const MORGEN = Date.parse("2026-10-12T05:45:00Z");
const ro2 = MORGEN - 4 * 3600_000;
const o2 = (id, extra = {}) => o(id, "2026-10-12", { opdateretMs: ro2, ...extra });
const gammelBek = (id) => rk(id, "bekraeftelse", nk("2026-10-12"), "sendt", MORGEN - 86400_000);
eq("morgen-påmindelse", kinds(planlaeg({ ordrer: [o2("a")], tilstand: [gammelBek("a")], indst: alle, nu: MORGEN })), ["a:paamindelse_morgen"]);
eq("morgen før kl.", planlaeg({ ordrer: [o2("a")], tilstand: [gammelBek("a")], indst: alle, nu: Date.parse("2026-10-12T04:00:00Z") }).send, []); // 06:00
eq("morgen efter tidsrummet er begyndt", planlaeg({ ordrer: [o2("a")], tilstand: [gammelBek("a")], indst: { ...alle, morgenMin: 6 * 60 }, nu: Date.parse("2026-10-12T06:30:00Z") }).send, []); // 08:30, start 08:00
eq("morgen for eftermiddagssag kan sendes senere", kinds(planlaeg({ ordrer: [o2("a", { tidsrumId: "eftermiddag", start: "12:00", slut: "16:00" })], tilstand: [rk("a", "bekraeftelse", nk("2026-10-12", "eftermiddag"), "sendt", MORGEN - 86400_000)], indst: alle, nu: Date.parse("2026-10-12T08:30:00Z") })), ["a:paamindelse_morgen"]); // 10:30, start 12:00
eq("morgen slået fra", planlaeg({ ordrer: [o2("a")], tilstand: [gammelBek("a")], indst: { ...alle, morgen: false }, nu: MORGEN }).send, []);

// genforsøg
const fejlet = (status, forsoeg, alder) => rk("a", "bekraeftelse", nk("2026-10-20"), status, NU - 5e6, { forsoeg, opdateretMs: NU - alder });
eq("genforsøg efter fejl", planlaeg({ ordrer: [o("a", "2026-10-20")], tilstand: [fejlet("fejl", 1, GENFORSOEG_EFTER_MS + 1000)], indst: alle, nu: NU }).send, [{ ordreId: "a", kind: "bekraeftelse", noegle: nk("2026-10-20"), genforsoeg: true }]);
eq("for tidligt til genforsøg", planlaeg({ ordrer: [o("a", "2026-10-20")], tilstand: [fejlet("fejl", 1, 60_000)], indst: alle, nu: NU }).send, []);
eq("højst 3 forsøg", planlaeg({ ordrer: [o("a", "2026-10-20")], tilstand: [fejlet("fejl", 3, 9e6)], indst: alle, nu: NU }).send, []);
eq("usikker genforsøges aldrig", planlaeg({ ordrer: [o("a", "2026-10-20")], tilstand: [fejlet("usikker", 1, 9e6)], indst: alle, nu: NU }).send, []);

// ---- filer: migration og funktion hænger sammen
const mig = readFileSync("supabase/migrations/20261011_sms_automatik.sql", "utf8");
eq("migration: RLS på tilstandstabel", /alter table public\.sms_automation_state enable row level security/.test(mig), true);
eq("migration: kun tilladte pladsholdere", /'fornavn','dato','tidsrum','butik'/.test(mig), true);
eq("migration: ingen hemmelighed i klartekst", /sms_cron_secret'\s*,\s*'[A-Za-z0-9]{20,}/.test(mig), false);
const fn = readFileSync("supabase/functions/sms-automatik/index.ts", "utf8");
eq("funktion: validerer cron-hemmelighed før noget andet", fn.indexOf("sms_cron_ok") < fn.indexOf("store_sms_automation"), true);
eq("funktion: ingen mål/vægt", /punkt1|brutto|kapacitet/i.test(fn), false);

console.log(`${pass} bestået, ${fail} fejlet`);
process.exit(fail ? 1 : 0);
