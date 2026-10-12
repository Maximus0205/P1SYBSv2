// Regressionstest til "delvist afsluttet" (src/lib/delvisAfsluttet.js).
// Kør med:  node tests/delvisAfsluttet.test.mjs
import { delvisPatch, kanMeldesDelvist, resterendeLinjer, udfoerteLinjer, seneste, harDelvis, koertAfTekst, harUlaestDelvis } from "../src/lib/delvisAfsluttet.js";
import { bookedeVarer } from "../src/lib/bookingOversigt.js";
// domain.js importerer lucide-react (ikke tilgængelig i ren node) - reglen er en enlinjer, spejlet her
// fra needsPlanning i src/data/domain.js.
const needsPlanning = (o) => o.status !== "afsluttet" && (!o.dato || !o.bilId);

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

const sag = (over = {}) => ({
  id: "o1", nr: "26-1", status: "igang", dato: "2026-10-14", tidsrumId: "t1", start: "08:00", slut: "12:00", bilId: "bil2",
  oprettetAf: { id: "a", navn: "Anna" }, problem: { note: "x" }, notifikationSet: { materialer: true },
  varelinjer: [{ id: "l1", model: "WWG1" }, { id: "l2", model: "KS2" }, { id: "l3", model: "OV3" }],
  ...over,
});
const ctx = (over = {}) => ({ udfoerteLinjeIds: ["l1"], note: " Mangler ovn ", nuIso: "2026-10-14T10:00:00.000Z", id: "h1", af: { id: "m", navn: "Mette" }, bilNavn: "Bil 2", montoerer: [{ id: "m", navn: "Mette" }, { id: "j", navn: "Jens" }], ...over });

const p = delvisPatch(sag(), ctx());
eq("gyldigt patch findes", !!p, true);
eq("udført linje markeret", p.varelinjer.map((v) => !!v.udfoert), [true, false, false]);
eq("udførtTid sat kun på udført", [p.varelinjer[0].udfoertTid, p.varelinjer[1].udfoertTid], ["2026-10-14T10:00:00.000Z", undefined]);
eq("dato/tid/bil ryddes", [p.dato, p.tidsrumId, p.start, p.slut, p.bilId], [null, null, null, null, null]);
eq("status planlagt, problem ryddet", [p.status, p.problem], ["planlagt", null]);
eq("notifikation nulstilles, øvrige bevares", p.notifikationSet, { materialer: true, delvist: false });
const h = p.delvisAfsluttet[0];
eq("hændelse: bil + montører bevares", [h.bilId, h.bilNavn, h.montoerer.map((m) => m.navn), h.tidligereDato, h.note, h.udfoerteLinjer], ["bil2", "Bil 2", ["Mette", "Jens"], "2026-10-14", "Mangler ovn", ["l1"]]);
eq("koertAfTekst", koertAfTekst(h), "Bil 2 (Mette, Jens)");
eq("koertAfTekst uden montører", koertAfTekst({ bilNavn: "Bil 2", montoerer: [] }), "Bil 2");

const efter = { ...sag(), ...p };
eq("sagen skal planlægges", needsPlanning(efter), true);
eq("resterende/udførte", [resterendeLinjer(efter).length, udfoerteLinjer(efter).length], [2, 1]);
eq("harDelvis/seneste/ulæst", [harDelvis(efter), seneste(efter).id, harUlaestDelvis(efter)], [true, "h1", true]);
eq("ulæst forsvinder når set", harUlaestDelvis({ ...efter, notifikationSet: { delvist: true } }), false);

// anden runde: historikken bevares (ny bil)
const p2 = delvisPatch({ ...efter, status: "igang", dato: "2026-10-20", bilId: "bil3" }, ctx({ udfoerteLinjeIds: ["l2"], id: "h2", bilNavn: "Bil 3", montoerer: [{ id: "k", navn: "Karl" }] }));
eq("historik akkumuleres", p2.delvisAfsluttet.map((x) => [x.id, x.bilId]), [["h1", "bil2"], ["h2", "bil3"]]);

// afvisninger
eq("tom note afvises", delvisPatch(sag(), ctx({ note: "  " })), null);
eq("ingen linjer afvises", delvisPatch(sag(), ctx({ udfoerteLinjeIds: [] })), null);
eq("ukendt linje afvises", delvisPatch(sag(), ctx({ udfoerteLinjeIds: ["xx"] })), null);
eq("alle linjer afvises (skal færdigmeldes)", delvisPatch(sag(), ctx({ udfoerteLinjeIds: ["l1", "l2", "l3"] })), null);
eq("allerede udført linje afvises", delvisPatch(efter, ctx({ udfoerteLinjeIds: ["l1"] })), null);
eq("afsluttet sag afvises", delvisPatch(sag({ status: "afsluttet" }), ctx()), null);
eq("sag med 1 linje kan ikke meldes delvist", kanMeldesDelvist(sag({ varelinjer: [{ id: "l1" }] })), false);
eq("duplikerede id'er tæller én gang", delvisPatch(sag(), ctx({ udfoerteLinjeIds: ["l1", "l1"] })).varelinjer.filter((v) => v.udfoert).length, 1);

// bookingoversigten tæller ikke udførte linjer
const dagMedUdfoert = { ...efter, dato: "2026-10-20", bilId: "bil2" };
eq("udførte linjer indgår ikke i bookede varer", bookedeVarer([dagMedUdfoert], { fra: "2026-10-01", til: "2026-10-31" }).map((r) => r.linje.id), ["l2", "l3"]);

console.log(`${pass} bestået, ${fail} fejlet`);
if (fail > 0) process.exit(1);
