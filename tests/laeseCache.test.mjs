// Regressionstest til offline-læsecachen (laeseCache.js, offlineSession.js, sagsCache.js).
// Kør med:  node tests/laeseCache.test.mjs
import { opretLaeseCache, MAKS_ALDER_MS, saetViserCache, subscribeViserCache } from "../src/lib/laeseCache.js";
import { erForbindelsesFejl, laesGemtSession } from "../src/lib/offlineSession.js";
import { raekkerTilCache, visningFraCache, sagsNoegle, kontekstNoegle } from "../src/lib/sagsCache.js";

let pass = 0, fail = 0;
const eq = (navn, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", navn, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

function lager({ fejler = false } = {}) {
  const m = new Map();
  const tjek = () => { if (fejler) throw new Error("IndexedDB-fejl"); };
  return { m, async put(p) { tjek(); m.set(p.noegle, JSON.parse(JSON.stringify(p))); }, async get(k) { tjek(); return m.get(k); }, async delete(k) { tjek(); m.delete(k); }, async clear() { tjek(); m.clear(); } };
}

// --- cache: gem/hent, alder, ryd
{
  let t = 1_000_000; const s = lager(); const c = opretLaeseCache({ store: s, nu: () => t });
  eq("gem svarer true", await c.gem("a", { x: 1 }), true);
  eq("hent giver værdi og tidspunkt", await c.hent("a"), { vaerdi: { x: 1 }, gemt: 1_000_000 });
  eq("findes ikke: null", await c.hent("b"), null);
  t += MAKS_ALDER_MS;             eq("lige på grænsen: stadig gyldig", (await c.hent("a")) !== null, true);
  t += 1;                         eq("ældre end 14 dage: ignoreres", await c.hent("a"), null);
  eq("ældre end 14 dage: slettes", s.m.has("a"), false);
  await c.gem("b", 1); await c.gem("c", 2); await c.ryd();
  eq("ryd sletter alt (logud)", [s.m.size, await c.hent("b")], [0, null]);
  s.m.set("d", { noegle: "d", vaerdi: 1 });
  eq("ulæselig post (uden tidspunkt): null", await c.hent("d"), null);
}
// --- cache: et lager, der fejler, vælter aldrig appen
{
  const c = opretLaeseCache({ store: lager({ fejler: true }) });
  eq("lager fejler: gem false, hent null, ryd kaster ikke", [await c.gem("a", 1), await c.hent("a"), await c.ryd()], [false, null, undefined]);
}

// --- "viser gemte data": ældste tidspunkt vinder, tom når alle er friske
{
  const set = [];
  const stop = subscribeViserCache((v) => set.push(v));
  saetViserCache("sager", 500); saetViserCache("profil", 300); saetViserCache("sager", null); saetViserCache("profil", null);
  eq("viser-gemte-data: første tilstand, ældste, og tilbage til frisk", set, [null, 500, 300, 300, null]);
  stop();
}

// --- forbindelsesfejl eller afvisning?
eq("AuthRetryableFetchError: forbindelse", erForbindelsesFejl({ name: "AuthRetryableFetchError", message: "x" }), true);
eq("Failed to fetch: forbindelse", erForbindelsesFejl({ message: "TypeError: Failed to fetch" }), true);
eq("offline: altid forbindelse", erForbindelsesFejl({ message: "hvad som helst" }, false), true);
eq("ugyldig refresh-token: IKKE forbindelse (rigtig logud)", erForbindelsesFejl({ name: "AuthApiError", message: "Invalid Refresh Token: Refresh Token Not Found" }), false);
eq("ingen fejl: ikke forbindelse", erForbindelsesFejl(null), false);

// --- gemt session
const strg = (o) => ({ get length() { return Object.keys(o).length; }, key: (i) => Object.keys(o)[i], getItem: (k) => (k in o ? o[k] : null) });
eq("gemt session findes", laesGemtSession(strg({ andet: "x", "sb-abc-auth-token": JSON.stringify({ access_token: "t", user: { id: "u1" } }) }))?.user.id, "u1");
eq("gammelt format (currentSession)", laesGemtSession(strg({ "sb-abc-auth-token": JSON.stringify({ currentSession: { user: { id: "u2" } } }) }))?.user.id, "u2");
eq("uden bruger-id: ingen session", laesGemtSession(strg({ "sb-abc-auth-token": JSON.stringify({ access_token: "t", user: {} }) })), null);
eq("ødelagt JSON: ingen session", laesGemtSession(strg({ "sb-abc-auth-token": "{ikke json" })), null);
eq("andre nøgler ignoreres", laesGemtSession(strg({ "p1sybs.offlinekoe.v1": "[]" })), null);
eq("tomt lager", laesGemtSession(strg({})), null);

// --- sager til/fra cache
const v = new Map([["a", 3], ["b", 7], ["c", 1]]);
const b = new Map([["a", { id: "a", n: "A" }], ["b", { id: "b", n: "B" }]]);        // c mangler data
eq("rækker: kun sager med kendt data", raekkerTilCache(v, b), [{ id: "a", version: 3, data: { id: "a", n: "A" } }, { id: "b", version: 7, data: { id: "b", n: "B" } }]);
const rk = raekkerTilCache(v, b);
{
  const r = visningFraCache(rk, [], "s1");
  eq("fra cache: sager, versioner og grundlag", [r.orders.map((o) => o.id), [...r.versions], [...r.bases.keys()]], [["a", "b"], [["a", 3], ["b", 7]], ["a", "b"]]);
}
{
  const koe = [
    { id: "a", storeId: "s1", order: { id: "a", n: "A-RETTET-OFFLINE" }, baseVersion: 3 },
    { id: "z", storeId: "s1", order: { id: "z", n: "NY-OFFLINE" } },
    { id: "b", storeId: "ANDEN-BUTIK", order: { id: "b", n: "SKAL-IKKE-MED" } },
  ];
  const r = visningFraCache(rk, koe, "s1");
  eq("egne ventende ændringer vises (ikke serverens gamle udgave)", r.orders.find((o) => o.id === "a").n, "A-RETTET-OFFLINE");
  eq("grundlaget forbliver serverens udgave og version (til konflikttjek)", [r.bases.get("a").n, r.versions.get("a")], ["A", 3]);
  eq("sag oprettet uden net vises, men har ingen server-version", [r.orders.some((o) => o.id === "z"), r.versions.has("z")], [true, false]);
  eq("en anden butiks ventende ændring blandes ikke ind", r.orders.find((o) => o.id === "b").n, "B");
}
eq("ødelagt cache: ingen sager, ingen fejl", visningFraCache([{ id: 1 }, null, { id: "x", version: "ikke tal", data: {} }, "streng"], [], "s1").orders, []);
eq("cache er ikke en liste: ingen sager", visningFraCache({ rows: 1 }, [], "s1").orders, []);
eq("nøgler er pr. bruger og butik", [sagsNoegle("u1", "s1"), kontekstNoegle("u1")], ["sager:u1:s1", "kontekst:u1"]);

console.log(`laeseCache: ${pass} ok, ${fail} fejl`);
if (fail) process.exit(1);
