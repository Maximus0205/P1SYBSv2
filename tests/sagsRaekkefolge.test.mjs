import assert from "node:assert/strict";
import { dagOgStart, nyesteFoerst } from "../src/lib/sagsRaekkefolge.js";
const sager = [{ id: "uden", dato: null, start: null }, { id: "ny", dato: "2026-11-02", start: "09:00" }, { id: "gammel", dato: "2026-10-01", start: "08:00" }, { id: "undef" }, { id: "kunDato", dato: "2026-11-02", start: undefined }];
assert.equal(dagOgStart({ dato: null, start: null }), "");
assert.doesNotThrow(() => [...sager].sort(nyesteFoerst));
assert.deepEqual([...sager].sort(nyesteFoerst).map((s) => s.id).slice(0, 3), ["ny", "kunDato", "gammel"]);
console.log("sagsRaekkefolge: ok");
