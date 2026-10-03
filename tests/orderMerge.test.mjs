// Regressionstest til sammenfletning af samtidige rettelser (src/lib/orderMerge.js).
// Kør med:  node tests/orderMerge.test.mjs
// Ingen afhængigheder - ren Node. Afslutter med fejlkode, hvis noget fejler.
import { deepEqual, changedKeys, mergeOrder, applyMine } from "../src/lib/orderMerge.js";

let fail = 0, pass = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

const base = { id: "s1", nr: "26-1", dato: "2026-10-05", bilId: "b1", status: "planlagt", noter: [], varelinjer: [{ id: "v1", plukket: false }] };

// --- deepEqual
eq("ens objekter, andet nøgle-rækkefølge", deepEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }), true);
eq("forskellig array-længde", deepEqual([1], [1, 2]), false);
eq("null og udefineret er ens", deepEqual(null, undefined), true);
eq("0 er ikke tomt", deepEqual(0, null), false);
eq("tomt objekt vs tom liste", deepEqual({}, []), false);
eq("udefineret nøgle ignoreres", deepEqual({ a: 1, b: undefined }, { a: 1 }), true);

// --- changedKeys
eq("sagsnummer tæller ikke", changedKeys({ nr: "1", a: 1 }, { nr: "2", a: 1 }), []);
eq("ny nøgle opdages", changedKeys({ a: 1 }, { a: 1, b: 2 }), ["b"]);
eq("fjernet nøgle opdages", changedKeys({ a: 1, b: 2 }, { a: 1 }), ["b"]);

// --- Ingen konkurrence: vi ændrer, de har ikke rørt noget
let r = mergeOrder(base, { ...base, status: "igang" }, base);
eq("ingen konflikt, vores ændring med", [r.conflicts, r.merged.status], [[], "igang"]);

// --- Forskellige felter: sælger flytter dato, montør skriver note
const mine = { ...base, noter: [{ id: "n1", tekst: "Ring først" }] };
const theirs = { ...base, dato: "2026-10-06" };
r = mergeOrder(base, mine, theirs);
eq("forskellige felter flettes", r.conflicts, []);
eq("flettet: deres dato bevaret", r.merged.dato, "2026-10-06");
eq("flettet: vores note med", r.merged.noter.length, 1);

// --- Samme felt, forskellig værdi = ægte konflikt
r = mergeOrder(base, { ...base, dato: "2026-10-07" }, { ...base, dato: "2026-10-06" });
eq("samme felt forskellig værdi", r.conflicts, ["dato"]);

// --- Samme felt, samme værdi = ingen konflikt
r = mergeOrder(base, { ...base, dato: "2026-10-06" }, { ...base, dato: "2026-10-06" });
eq("samme ændring begge steder", r.conflicts, []);

// --- Begge tilføjer en note: ægte konflikt (intet gættes)
r = mergeOrder(base, { ...base, noter: [{ id: "a" }] }, { ...base, noter: [{ id: "b" }] });
eq("to forskellige noter = konflikt", r.conflicts, ["noter"]);

// --- Færdigmelding består af flere felter og gemmes samlet eller slet ikke
const fin = { ...base, status: "afsluttet", afsluttetTidspunkt: "t", logs: [{ id: "l" }] };
r = mergeOrder(base, fin, { ...base, logs: [{ id: "x" }] });
eq("konflikt på logs afviser hele færdigmeldingen", r.conflicts, ["logs"]);
eq("alle vores felter kendes til senere valg", r.mineKeys.sort(), ["afsluttetTidspunkt", "logs", "status"]);

// --- applyMine: kun vores felter lægges ovenpå den nyeste udgave
const latest = { ...base, dato: "2026-10-09", noter: [{ id: "x" }] };
const out = applyMine(fin, latest, ["status", "afsluttetTidspunkt", "logs"]);
eq("applyMine bevarer andres felter", [out.dato, out.noter.length], ["2026-10-09", 1]);
eq("applyMine lægger vores felter på", [out.status, out.logs.length], ["afsluttet", 1]);

// --- Robusthed
for (const junk of [[null, null, null], [undefined, {}, {}], [{}, null, {}], [{ a: 1 }, { a: 2 }, null]]) {
  try { mergeOrder(...junk); pass++; } catch (e) { fail++; console.log("THROW", JSON.stringify(junk), e.message); }
}
const input = Object.freeze({ ...base });
try { mergeOrder(base, input, base); pass++; } catch (e) { fail++; console.log("THROW (frosset input)", e.message); }

console.log(`\n${pass} bestået, ${fail} fejlet`);
process.exit(fail ? 1 : 0);
