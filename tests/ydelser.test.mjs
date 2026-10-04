// Regressionstest til standardydelse og opgavebeskrivelse (src/lib/ydelser.js).
// Kør med:  node tests/ydelser.test.mjs
import { standardYdelse, kraeverBeskrivelse, skalPlukkes, linjeSkalPlukkes } from "../src/lib/ydelser.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

const p1 = { id: "p1", navn: "Kantstenslevering" }, p2 = { id: "p2", navn: "Levering med indbæring" }, p3 = { id: "p3", navn: "Montering" }, p4 = { id: "p4", navn: "Servicetur" };

// --- standardydelse
eq("uden valg: Montering, selvom den ikke står først", standardYdelse([p1, p2, p3, p4]).id, "p3");
eq("navnet matches uanset store/små bogstaver og mellemrum", standardYdelse([p1, { id: "x", navn: "  MONTERING " }]).id, "x");
eq("admins valg slår 'Montering'", standardYdelse([p1, { ...p2, standard: true }, p3]).id, "p2");
eq("findes Montering ikke, bruges den første", standardYdelse([p1, p2, p4]).id, "p1");
eq("flere markeret: den første markerede", standardYdelse([p1, { ...p2, standard: true }, { ...p4, standard: true }]).id, "p2");
eq("standard: false tæller ikke", standardYdelse([p1, { ...p2, standard: false }, p3]).id, "p3");
eq("tom liste", standardYdelse([]), undefined);
eq("ikke en liste", [standardYdelse(null), standardYdelse(undefined), standardYdelse("x")], [undefined, undefined, undefined]);
eq("tomme poster springes over", standardYdelse([null, undefined, p3]).id, "p3");
eq("det er den gamle opførsel, der er rettet: første på listen var Kantstenslevering", [p1, p2, p3][0].id, "p1");

// --- opgavebeskrivelse
eq("Servicetur kræver beskrivelse (navnet)", kraeverBeskrivelse(p4), true);
eq("Montering gør ikke", kraeverBeskrivelse(p3), false);
eq("'Serviceaftale' og 'SERVICE' rammes af navnet", [kraeverBeskrivelse({ navn: "Serviceaftale" }), kraeverBeskrivelse({ navn: "SERVICE" })], [true, true]);
eq("admins valg slår navnet: slået fra", kraeverBeskrivelse({ ...p4, kraeverBeskrivelse: false }), false);
eq("admins valg slår navnet: slået til", kraeverBeskrivelse({ ...p3, kraeverBeskrivelse: true }), true);
eq("ingen ydelse", [kraeverBeskrivelse(null), kraeverBeskrivelse(undefined), kraeverBeskrivelse({})], [false, false, false]);
eq("ikke-boolean værdi ignoreres, navnet bruges", kraeverBeskrivelse({ navn: "Servicetur", kraeverBeskrivelse: "ja" }), true);

// --- pluk på lager
eq("Servicetur plukkes ikke som udgangspunkt", skalPlukkes(p4), false);
eq("Montering og levering plukkes", [skalPlukkes(p1), skalPlukkes(p2), skalPlukkes(p3)], [true, true, true]);
eq("admins valg slår navnet: servicetur SKAL plukkes", skalPlukkes({ ...p4, plukkes: true }), true);
eq("admins valg slår navnet: montering plukkes ikke", skalPlukkes({ ...p3, plukkes: false }), false);
eq("ingen ydelse plukkes (som før)", [skalPlukkes(null), skalPlukkes(undefined), skalPlukkes({})], [true, true, true]);
eq("ikke-boolean ignoreres", skalPlukkes({ navn: "Servicetur", plukkes: "ja" }), false);
const liste = [p1, p3, { ...p4, id: "p4" }];
eq("linje med servicetur plukkes ikke", linjeSkalPlukkes({ primaerYdelse: { id: "p4", navn: "Servicetur" } }, liste), false);
eq("linje med montering plukkes", linjeSkalPlukkes({ primaerYdelse: { id: "p3", navn: "Montering" } }, liste), true);
eq("admins valg på ydelsen gælder også en allerede oprettet linje", linjeSkalPlukkes({ primaerYdelse: { id: "p4", navn: "Servicetur" } }, [{ ...p4, plukkes: true }]), true);
eq("slettet ydelse: linjens egen kopi afgør (servicetur)", linjeSkalPlukkes({ primaerYdelse: { id: "vaek", navn: "Servicetur" } }, liste), false);
eq("slettet ydelse: linjens egen kopi afgør (montering)", linjeSkalPlukkes({ primaerYdelse: { id: "vaek", navn: "Montering" } }, liste), true);
eq("linje uden ydelse plukkes", linjeSkalPlukkes({}, liste), true);
eq("ingen liste", [linjeSkalPlukkes({ primaerYdelse: { id: "x", navn: "Servicetur" } }, null), linjeSkalPlukkes({ primaerYdelse: { id: "x", navn: "Montering" } }, undefined)], [false, true]);
eq("tom linje og tom liste", linjeSkalPlukkes(null, []), true);

console.log(`\n${pass} bestået, ${fail} fejlet`);
process.exit(fail ? 1 : 0);
