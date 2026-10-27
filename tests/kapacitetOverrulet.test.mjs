import assert from "node:assert/strict";
import { overrulningTekst } from "../src/lib/kapacitetOverrulet.js";
assert.equal(overrulningTekst(null), null);
assert.equal(overrulningTekst(undefined), null);
const t = overrulningTekst({ regler: ["tidsrum", "arbejdstid", "ukendtregel"], tidspunkt: "2026-10-28T00:27:00+01:00", af: { id: "1", navn: "Magnus" } });
assert.equal(t.af, "Magnus");
assert.ok(t.hvornaar.includes("2026") && t.hvornaar.includes("kl."));
assert.deepEqual(t.regler.slice(0, 1), ["Kundens tidsrum (formiddag/eftermiddag)"]);
assert.equal(t.regler[2], "ukendtregel");
// gamle poster uden af/tidspunkt/regler må ikke crashe
assert.deepEqual(overrulningTekst({}), { af: "", hvornaar: "", regler: [] });
assert.deepEqual(overrulningTekst({ tidspunkt: "ugyldig", regler: "x" }), { af: "", hvornaar: "", regler: [] });
console.log("kapacitetOverrulet: ok");
