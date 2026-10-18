import assert from "node:assert/strict";
import { tilISO, fraISO, laegDage, ugensDage, langDato, overskriftDato, ugedagKort, dagITal } from "../src/lib/dato.js";

assert.equal(tilISO(new Date(2026, 9, 19, 23, 30)), "2026-10-19");
assert.equal(tilISO(fraISO("2026-10-19")), "2026-10-19");
assert.equal(laegDage("2026-10-31", 1), "2026-11-01");
assert.equal(laegDage("2026-03-01", -1), "2026-02-28");
// Sommertid: 25. oktober 2026 skifter til vintertid, datoen må ikke glide.
assert.equal(laegDage("2026-10-24", 1), "2026-10-25");
assert.equal(laegDage("2026-10-25", 1), "2026-10-26");
assert.deepEqual(ugensDage("2026-10-21"), ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
assert.deepEqual(ugensDage("2026-10-25")[0], "2026-10-19"); // søndag hører til ugen der slutter
assert.equal(langDato("2026-10-19"), "mandag 19. oktober");
assert.equal(ugedagKort("2026-10-19"), "Man");
assert.equal(dagITal("2026-10-05"), 5);
const nu = new Date(2026, 9, 18, 10, 0);
assert.equal(overskriftDato("2026-10-18", nu), "I dag");
assert.equal(overskriftDato("2026-10-19", nu), "I morgen");
assert.equal(overskriftDato("2026-10-17", nu), "I går");
assert.equal(overskriftDato("2026-10-21", nu), "onsdag 21. oktober");
console.log("dato: ok");
