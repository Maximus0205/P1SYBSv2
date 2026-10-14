import assert from "node:assert/strict";
import { maanedKort, maanedMedAar, maanedLang, paenAkse, noegletal, grafMax, soejleSti } from "../src/lib/dashboardHelpers.js";

let ok = 0; let fejl = 0;
const t = (navn, fn) => { try { fn(); ok++; } catch (e) { fejl++; console.error("FEJL:", navn, "\n ", e.message); } };

t("månedsnavne", () => { assert.equal(maanedKort("2026-09"), "sep."); assert.equal(maanedKort("2026-05"), "maj"); assert.equal(maanedMedAar("2026-01"), "jan. 2026"); assert.equal(maanedLang("2026-10"), "oktober 2026"); assert.equal(maanedKort("2026-13"), ""); assert.equal(maanedKort(null), ""); });
t("akse: tom graf får stadig en akse", () => { const a = paenAkse(0); assert.equal(a.max, 1000); assert.deepEqual(a.ticks, [0, 250, 500, 750, 1000]); });
t("akse: runde tal der dækker maks", () => {
  for (const m of [1, 37, 999, 1000, 1234, 8750, 12000, 56789, 250000, 1234567]) {
    const a = paenAkse(m);
    assert.ok(a.max >= m, `${m} dækkes ikke af ${a.max}`);
    assert.equal(a.ticks[0], 0);
    assert.ok(a.ticks.length >= 3 && a.ticks.length <= 8, `${m}: ${a.ticks.length} streger`);
    const trin = a.ticks[1] - a.ticks[0];
    a.ticks.forEach((v, i) => assert.ok(Math.abs(v - i * trin) < 1e-6, "ens afstand"));
  }
});
t("akse: eksempler", () => { assert.deepEqual(paenAkse(8750).ticks, [0, 2500, 5000, 7500, 10000]); assert.equal(paenAkse(12000).max, 15000); assert.equal(paenAkse(10000).max, 10000); });
t("akse: ugyldig input", () => { assert.equal(paenAkse(NaN).max, 1000); assert.equal(paenAkse(-5).max, 1000); });

const dash = { maaneder: [
  { maaned: "2026-08", indtaegt_ore: 100000, udgift_ore: 30000 },
  { maaned: "2026-09", indtaegt_ore: 120000, udgift_ore: 35000 },
  { maaned: "2026-10", indtaegt_ore: 0, udgift_ore: 40000 },
], forfaldne: [{ id: "x" }] };
t("nøgletal tæller kun afsluttede måneder", () => {
  const n = noegletal(dash, "2026-10");
  assert.equal(n.indtaegt, 220000); assert.equal(n.udgift, 65000); assert.equal(n.resultat, 155000); assert.equal(n.antal, 2); assert.equal(n.sidste.maaned, "2026-09"); assert.equal(n.forfaldne, 1);
});
t("nøgletal uden data", () => { const n = noegletal(null, "2026-10"); assert.equal(n.resultat, 0); assert.equal(n.sidste, null); assert.equal(n.forfaldne, 0); });
t("grafMax medregner forventet i igangværende måned", () => { assert.equal(grafMax(dash.maaneder, 500000, "2026-10"), 5000); assert.equal(grafMax(dash.maaneder, 0, "2026-10"), 1200); assert.equal(grafMax([], 0, "2026-10"), 0); });
t("søjlesti", () => {
  assert.equal(soejleSti(0, 10, 20, 10), ""); assert.equal(soejleSti(0, 20, 20, 10), ""); assert.equal(soejleSti(0, 0, 0, 10), "");
  const s = soejleSti(10, 50, 20, 100); assert.ok(s.startsWith("M10,100") && s.endsWith("Z"));
  assert.ok(!/NaN/.test(soejleSti(0, 99, 20, 100)), "lav søjle giver ikke NaN");
});

console.log(`${ok} bestået, ${fejl} fejlet`);
process.exit(fejl ? 1 : 0);
