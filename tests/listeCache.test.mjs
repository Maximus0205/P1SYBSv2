// Kør med:  node tests/listeCache.test.mjs
import { hentListeMedCache, listeNoegle } from "../src/lib/listeCacheCore.js";
import { opretLaeseCache } from "../src/lib/laeseCache.js";

let pass = 0, fail = 0;
const eq = (n, g, w) => { if (JSON.stringify(g) === JSON.stringify(w)) pass++; else { fail++; console.log("FAIL:", n, "\n  got: ", JSON.stringify(g), "\n  want:", JSON.stringify(w)); } };
const lager = () => { const m = new Map(); return { async put(p) { m.set(p.noegle, p); }, async get(k) { return m.get(k); }, async delete(k) { m.delete(k); }, async clear() { m.clear(); } }; };
const opsaet = (ejerId = "u1") => {
  const vis = []; const cache = opretLaeseCache({ store: lager() });
  return { vis, cache, args: (hent) => ({ noegle: listeNoegle("biler", "B1"), hentMedStatus: hent, cache, ejer: async () => ejerId, saetVis: (k, t) => vis.push([k, t]), kilde: "biler" }) };
};
const tick = () => new Promise((r) => setTimeout(r, 5));
const biler = [{ id: "v1", navn: "Bil 1" }];

{ const o = opsaet();
  const r = await hentListeMedCache(o.args(async () => ({ ok: true, vaerdi: biler })));
  await tick();
  eq("online: værdi og ingen cache-markering", [r.vaerdi, r.fraCache], [biler, null]);
  eq("online: markering ryddet", o.vis, [["biler", null]]);
  const n = await hentListeMedCache(o.args(async () => ({ ok: false, netvaerk: true })));
  eq("offline: viser det sidst hentede", [n.vaerdi, typeof n.fraCache], [biler, "number"]);
  eq("offline: markering sat", o.vis[1][0] === "biler" && typeof o.vis[1][1] === "number", true);
  const a = await hentListeMedCache(o.args(async () => ({ ok: false, netvaerk: false })));
  eq("afvist af serveren: aldrig cache", a, null);
  const o2 = opsaet("u2"); o2.cache = o.cache;
  const andens = await hentListeMedCache({ ...o2.args(async () => ({ ok: false, netvaerk: true })), cache: o.cache });
  eq("anden bruger ser ikke andens liste", andens, null);
}
{ const o = opsaet();
  eq("offline uden gemt kopi", await hentListeMedCache(o.args(async () => ({ ok: false, netvaerk: true }))), null);
  const tom = await hentListeMedCache(o.args(async () => ({ ok: true, vaerdi: [] })));
  await tick();
  const igen = await hentListeMedCache(o.args(async () => ({ ok: false, netvaerk: true })));
  eq("en tom liste er også en gyldig kopi", [tom.vaerdi, igen.vaerdi], [[], []]);
}
{ const o = opsaet(null);
  const r = await hentListeMedCache(o.args(async () => ({ ok: true, vaerdi: biler })));
  eq("ikke logget ind: vises, men gemmes ikke", [r.vaerdi, await o.cache.hent("liste:biler:null:B1")], [biler, null]);
  eq("ikke logget ind og offline: intet", await hentListeMedCache(o.args(async () => ({ ok: false, netvaerk: true }))), null);
}
{ const o = opsaet(); await hentListeMedCache(o.args(async () => ({ ok: true, vaerdi: biler }))); await tick(); await o.cache.ryd();
  eq("efter logud (ryd): intet", await hentListeMedCache(o.args(async () => ({ ok: false, netvaerk: true }))), null);
}
console.log(`listeCache: ${pass} ok, ${fail} fejl`); if (fail) process.exit(1);
