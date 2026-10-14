import assert from "node:assert/strict";
import { maanedKort, maanedMedAar, maanedLang, paenAkse, noegletal, grafMax, soejleSti, logFelter, logVaerdi, logFeltNavn, LOG_TABELLER } from "../src/lib/dashboardHelpers.js";

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

t("log: værdier", () => {
  assert.equal(logVaerdi("maanedspris_ore", 123456), "1.234,56 kr."); assert.equal(logVaerdi("sms_paaslag_ore", 5), "0,05 kr.");
  assert.equal(logVaerdi("aktiv", true), "ja"); assert.equal(logVaerdi("aktiv", false), "nej"); assert.equal(logVaerdi("noter", null), "–"); assert.equal(logVaerdi("noter", ""), "–"); assert.equal(logVaerdi("status", "aktiv"), "aktiv");
  assert.equal(logVaerdi("pris_override_ore", "abc"), "abc", "ikke-tal i _ore-felt giver ikke NaN");
});
t("log: feltnavne", () => { assert.equal(logFeltNavn("status"), "Status"); assert.equal(logFeltNavn("ukendt_felt_ore"), "Ukendt felt"); assert.ok(LOG_TABELLER.billing_credit_notes); });
t("log: felter fra/til og oprettet", () => {
  const f = logFelter({ status: { fra: "udstedt", til: "betalt" }, total_ore: { til: 125000 } });
  assert.equal(f.length, 2);
  const status = f.find((x) => x.navn === "Status"); assert.equal(status.fra, "udstedt"); assert.equal(status.til, "betalt");
  const total = f.find((x) => x.navn === "I alt"); assert.equal(total.fra, null); assert.equal(total.til, "1.250,00 kr.");
  assert.deepEqual(logFelter(null), []);
});

console.log(`${ok} bestået, ${fejl} fejlet`);
process.exit(fejl ? 1 : 0);
