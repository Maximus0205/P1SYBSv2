// Kør med: node tests/udskrift.test.mjs
import { ETIKET_FORMATER, tilpasFormat, findFormat, labelsPrSide, lavSider, sideCss, labelNiveau, A4, laesLabelIndstillinger, gemLabelIndstillinger, STANDARD_LABEL_INDSTILLINGER } from "../src/lib/udskrift.js";
let pass = 0, fail = 0;
const eq = (n, g, w) => { if (JSON.stringify(g) === JSON.stringify(w)) pass++; else { fail++; console.log("FAIL:", n, "\n  got: ", JSON.stringify(g), "\n  want:", JSON.stringify(w)); } };

// Alle arkformater skal rent faktisk være på et A4-ark
for (const f of ETIKET_FORMATER.filter((x) => x.type === "ark")) {
  const brede = f.venstre + f.kol * f.b + (f.kol - 1) * f.gapX, hoejde = f.top + f.raekker * f.h + (f.raekker - 1) * f.gapY;
  eq(`${f.id} er inden for A4`, brede <= A4.b + 0.01 && hoejde <= A4.h + 0.01, true);
}
eq("unikke id'er", new Set(ETIKET_FORMATER.map((f) => f.id)).size, ETIKET_FORMATER.length);
eq("labels pr. side", [labelsPrSide(findFormat("ark-l7163")), labelsPrSide(findFormat("ark-l7160")), labelsPrSide(findFormat("ark-l7165")), labelsPrSide(findFormat("rulle-62x100"))], [14, 21, 8, 1]);

// sider
const f = findFormat("ark-2x5");
const lab = (n) => Array.from({ length: n }, (_, i) => ({ nr: `L${i + 1}` }));
let s = lavSider(f, lab(12));
eq("12 labels på 10 pr. ark = 2 sider", [s.length, s[0].celler.length, s[1].celler.length], [2, 10, 2]);
eq("placering: række 2, kolonne 2", [s[0].celler[3].x, s[0].celler[3].y], [105, 63]);
s = lavSider(f, lab(3), 4);
eq("start på plads 4: tre tomme pladser først", [s[0].celler.slice(0, 4).map((c) => c.label), s[0].celler[3].plads], [[null, null, null, { nr: "L1" }], 4]);
eq("start ud over arket begrænses", lavSider(f, lab(1), 99)[0].celler.filter((c) => c.label).map((c) => c.plads), [10]);
eq("start under 1 bliver 1", lavSider(f, lab(1), -5)[0].celler[0].label.nr, "L1");
eq("start flytter labels til næste ark, når arket er fuldt", lavSider(f, lab(2), 10).length, 2);
eq("ingen labels, ingen sider", lavSider(f, []), []);
const r = lavSider(findFormat("rulle-62x100"), lab(3), 5);
eq("rulle: én label pr. side, start ignoreres", [r.length, r[0].celler[0].label.nr, r[0].celler[0].x], [3, "L1", 0]);

// css
eq("css rulle", sideCss(findFormat("rulle-100x150")), "@page { size: 100mm 150mm; margin: 0; }");
eq("css ark", sideCss(findFormat("ark-l7163")), "@page { size: A4 portrait; margin: 0; }");
eq("css dokument", sideCss(null), "@page { size: A4 portrait; margin: 10mm; }");

// egne mål
eq("egne mål, ark", tilpasFormat({ type: "ark", b: "70", h: "36", kol: "3", raekker: "8", top: "9", venstre: "0", gapX: "0", gapY: "0" })?.navn, "Egne mål · 24 pr. ark · 70 × 36 mm");
eq("komma som decimal", tilpasFormat({ type: "rulle", b: "62,5", h: "100" })?.b, 62.5);
eq("for stort gitter afvises", tilpasFormat({ type: "ark", b: 100, h: 50, kol: 3, raekker: 2 }), null);
eq("urealistisk størrelse afvises", [tilpasFormat({ type: "rulle", b: 5, h: 100 }), tilpasFormat({ type: "rulle", b: "x", h: 100 }), tilpasFormat({ type: "ark", b: 50, h: 50, kol: 0, raekker: 2 })], [null, null, null]);
eq("negativ margen afvises", tilpasFormat({ type: "ark", b: 50, h: 50, kol: 2, raekker: 2, top: -3 }), null);
eq("findFormat tilpasset", [findFormat("tilpasset", { id: "tilpasset" }).id, findFormat("tilpasset", null), findFormat("findes-ikke")], ["tilpasset", null, null]);

// niveau
eq("label-niveau", [labelNiveau({ b: 62, h: 29 }), labelNiveau({ b: 99.1, h: 38.1 }), labelNiveau({ b: 62, h: 100 }), labelNiveau({ b: 100, h: 150 })], ["mini", "kompakt", "normal", "stor"]);
// indstillinger
{ const m = new Map(); const lager = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  eq("tom lager giver standard", laesLabelIndstillinger(lager), STANDARD_LABEL_INDSTILLINGER);
  eq("gem og læs", [gemLabelIndstillinger(lager, { ...STANDARD_LABEL_INDSTILLINGER, formatId: "rulle-62x100", start: 4, kopier: 2, rammer: true }), (({ formatId, start, kopier, rammer }) => ({ formatId, start, kopier, rammer }))(laesLabelIndstillinger(lager))], [true, { formatId: "rulle-62x100", start: 4, kopier: 2, rammer: true }]);
  m.set("p1sybs-label-indstillinger", JSON.stringify({ formatId: "findes-ikke", start: 999, kopier: 99 }));
  eq("ukendt format og urealistiske tal rettes", (({ formatId, start, kopier }) => ({ formatId, start, kopier }))(laesLabelIndstillinger(lager)), { formatId: "ark-l7163", start: 100, kopier: 4 });
  m.set("p1sybs-label-indstillinger", "{ikke json");
  eq("ødelagt indhold giver standard", laesLabelIndstillinger(lager), STANDARD_LABEL_INDSTILLINGER);
  eq("blokeret lager vælter ikke", [laesLabelIndstillinger({ getItem: () => { throw new Error("x"); } }), gemLabelIndstillinger({ setItem: () => { throw new Error("x"); } }, {})], [STANDARD_LABEL_INDSTILLINGER, false]);
}
console.log(`udskrift: ${pass} ok, ${fail} fejl`);
if (fail) process.exit(1);
