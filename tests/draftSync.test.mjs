// Regressionstest til synkronisering af kladder mellem enheder (src/lib/draftSync.js + orderDrafts.js).
// Kør med:  node tests/draftSync.test.mjs
//
// To "enheder" (hver sit localStorage) og en attrap af databasen, der følger de samme regler som
// save_order_draft/delete_order_draft i databasen: ejerskab, butik, versioner, konflikt, kasseret,
// højst 20, og rettighed. Databasereglerne selv er testet mod den rigtige database.
const enheder = { A: new Map(), B: new Map() };
const paa = (navn) => {
  const m = enheder[navn];
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
};
paa("A");
const D = await import("../src/lib/orderDrafts.js");
const Sync = await import("../src/lib/draftSync.js");

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

// ---------- attrap af databasen
const raekker = new Map();
const server = { nede: false, kald: [], antalRpc: 0 };
const BUTIK = "s1";
const medlemmer = { u1: { butik: BUTIK, opret: true }, u2: { butik: BUTIK, opret: true }, ude: { butik: null, opret: true }, uden: { butik: BUTIK, opret: false } };
const klientFor = (uid) => ({
  rpc: async (navn, a) => {
    server.antalRpc++; server.kald.push(navn);
    if (server.nede) return { data: null, error: { message: "TypeError: Failed to fetch" } };
    const m = medlemmer[uid];
    if (navn === "delete_order_draft") {
      const r = raekker.get(a.p_id);
      if (r && r.user_id === uid) { raekker.delete(a.p_id); return { data: { status: "ok", deleted: 1 }, error: null }; }
      return { data: { status: "ok", deleted: 0 }, error: null };
    }
    if (!(m.butik === a.p_store_id && m.opret)) return { data: null, error: { code: "P0001", message: "Ingen adgang" } };
    const r = raekker.get(a.p_id);
    if (!r) {
      if (a.p_expected_version !== null) return { data: { status: "not_found" }, error: null };
      raekker.set(a.p_id, { id: a.p_id, store_id: a.p_store_id, user_id: uid, state: a.p_state, step: a.p_step, version: 1, updated_at: new Date().toISOString() });
      const mine = [...raekker.values()].filter((x) => x.user_id === uid && x.store_id === a.p_store_id).sort((x, y) => y.updated_at.localeCompare(x.updated_at) || x.id.localeCompare(y.id));
      mine.slice(20).forEach((x) => raekker.delete(x.id));
      return { data: { status: "ok", version: 1 }, error: null };
    }
    if (r.user_id !== uid || r.store_id !== a.p_store_id) return { data: { status: "not_found" }, error: null };
    if (a.p_expected_version === null || r.version !== a.p_expected_version) return { data: { status: "conflict", version: r.version, step: r.step, state: r.state }, error: null };
    r.state = a.p_state; r.step = a.p_step; r.version += 1; r.updated_at = new Date().toISOString();
    return { data: { status: "ok", version: r.version }, error: null };
  },
  from: () => ({ select: () => ({ eq: async (_k, v) => {
    if (server.nede) return { data: null, error: { message: "Failed to fetch" } };
    return { data: [...raekker.values()].filter((r) => r.user_id === uid && r.store_id === v).map((r) => ({ ...r })), error: null };
  } }) }),
});
const u1 = klientFor("u1"), u2 = klientFor("u2");
const sync = (k, uid, butik = BUTIK) => Sync.synkroniserNu(k, butik, uid);
const lokale = (uid, butik = BUTIK) => D.hentKladder(butik, uid);
const navne = (uid) => lokale(uid).map((k) => k.state.customerName).sort();
const gem = (id, navn, uid = "u1", step = 1) => D.gemKladde({ id, storeId: BUTIK, userId: uid, state: { customerName: navn }, step });

// ---------- 1. oprettet på enhed A, vises på enhed B
paa("A");
gem("k1", "Anna");
eq("1 ny kladde er ikke sendt endnu", D.kladdeErSynket(lokale("u1")[0]), false);
eq("1b sendes og hentes uden fejl", await sync(u1, "u1"), "ok");
eq("2 databasen har kladden", [raekker.size, raekker.get("k1").state.customerName, raekker.get("k1").user_id], [1, "Anna", "u1"]);
eq("2b enhed A regner den nu for sikkert gemt", D.kladdeErSynket(lokale("u1")[0]), true);
paa("B");
eq("3 enhed B har intet endnu", lokale("u1"), []);
await sync(u1, "u1");
eq("3b efter synkronisering ligger kladden på enhed B (trin gemt med)", [navne("u1"), lokale("u1")[0].step, D.kladdeErSynket(lokale("u1")[0])], [["Anna"], 1, true]);

// ---------- 2. rettelse på B kommer til A
gem("k1", "Anna Hansen", "u1", 2);
await sync(u1, "u1");
eq("4 databasen har B's rettelse som version 2", [raekker.get("k1").state.customerName, raekker.get("k1").version], ["Anna Hansen", 2]);
paa("A");
await sync(u1, "u1");
eq("5 enhed A får rettelsen og trinnet", [navne("u1"), lokale("u1")[0].step], [["Anna Hansen"], 2]);

// ---------- 3. samtidige rettelser: intet går tabt
paa("A"); gem("k1", "Fra A", "u1", 3);
paa("B"); gem("k1", "Fra B", "u1", 3);
paa("A"); await sync(u1, "u1");
eq("6 A sendte først og vandt pladsen", raekker.get("k1").state.customerName, "Fra A");
paa("B"); await sync(u1, "u1");
const efterB = navne("u1");
eq("7 B's udgave ligger ovenpå, og A's udgave er bevaret som kopi - intet tabt", [raekker.get("k1").state.customerName, efterB.includes("Fra A"), efterB.includes("Fra B")], ["Fra B", true, true]);
const kopi = lokale("u1").find((k) => k.state._kopi);
eq("7b kopien er markeret i listen", D.kladdeEtiket(kopi).navn.includes("kopi fra anden enhed"), true);
await sync(u1, "u1");
eq("7c kopien er også sendt til databasen", [...raekker.values()].some((r) => r.state._kopi && r.state.customerName === "Fra A"), true);
paa("A"); await sync(u1, "u1");
eq("8 A ender med de samme to kladder", navne("u1"), efterB);

// ---------- 4. SAMME indhold er ikke en konflikt (svar, der gik tabt)
paa("A");
gem("k2", "Doppel");
await sync(u1, "u1");
const v = raekker.get("k2").version;
// simulér: A sendte en rettelse, databasen modtog den, men svaret gik tabt
raekker.get("k2").state = { customerName: "Doppel 2" }; raekker.get("k2").version = v + 1;
gem("k2", "Doppel 2");
const foer = navne("u1").length;
await sync(u1, "u1");
eq("9 samme indhold giver ingen kopi", [navne("u1").length, [...raekker.values()].filter((r) => r.state._kopi).length], [foer, 1]);
eq("9b og kladden regnes som sendt", D.kladdeErSynket(lokale("u1").find((k) => k.id === "k2")), true);

// ---------- 5. kassér på A forsvinder fra B
paa("A"); D.fjernKladde("k1");
eq("10 kasseret lokalt med det samme", lokale("u1").some((k) => k.id === "k1"), false);
eq("10b en gravsten venter på at blive meldt", D.hentGravsten("u1").map((g) => g.id), ["k1"]);
await sync(u1, "u1");
eq("11 databasen har fået besked, og gravstenen er væk", [raekker.has("k1"), D.hentGravsten("u1").length], [false, 0]);
paa("B"); await sync(u1, "u1");
eq("12 kladden forsvinder også fra enhed B", lokale("u1").some((k) => k.id === "k1"), false);

// ---------- 6. en kladde, der er ændret på B efter kassering på A, genoplives ikke tavst, men heller ikke tabt
paa("A"); gem("k3", "Kasseres"); await sync(u1, "u1");
paa("B"); await sync(u1, "u1");
eq("13 k3 findes på begge", lokale("u1").some((k) => k.id === "k3"), true);
paa("A"); D.fjernKladde("k3"); await sync(u1, "u1");
paa("B"); gem("k3", "Kasseres - men rettet på B");
await sync(u1, "u1");
eq("14 en kladde med ikke-sendte rettelser tabes ikke, selv om den er kasseret andetsteds", [lokale("u1").some((k) => k.id === "k3"), raekker.has("k3")], [true, true]);

// ---------- 7. uden forbindelse
paa("A"); gem("k4", "Offline");
server.nede = true;
eq("15 uden forbindelse: synkronisering melder netværk", await sync(u1, "u1"), "netvaerk");
eq("15b kladden er stadig gemt lokalt og regnes ikke som sendt", [lokale("u1").some((k) => k.id === "k4"), D.kladdeErSynket(lokale("u1").find((k) => k.id === "k4")), raekker.has("k4")], [true, false, false]);
D.fjernKladde("k4");
eq("15c en sletning uden forbindelse venter", [D.hentGravsten("u1").map((g) => g.id), await sync(u1, "u1")], [["k4"], "netvaerk"]);
gem("k5", "Offline 2");
server.nede = false;
eq("16 forbindelsen er tilbage: alt sendes", [await sync(u1, "u1"), raekker.has("k5"), D.hentGravsten("u1").length], ["ok", true, 0]);
eq("16b den kasserede k4 blev aldrig oprettet i databasen", raekker.has("k4"), false);

// ---------- 8. afvisning fra databasen (ingen rettighed) prøves ikke i det uendelige
paa("A");
D.gemKladde({ id: "n1", storeId: BUTIK, userId: "uden", state: { customerName: "Ingen ret" }, step: 0 });
const klientUden = klientFor("uden");
server.antalRpc = 0;
await Sync.synkroniserNu(klientUden, BUTIK, "uden");
const efterFoerste = server.antalRpc;
await Sync.synkroniserNu(klientUden, BUTIK, "uden");
eq("17 en afvist kladde markeres, og prøves ikke igen, før den ændres", [!!lokale("uden")[0].naegtet, server.antalRpc - efterFoerste], [true, 0]);
D.gemKladde({ id: "n1", storeId: BUTIK, userId: "uden", state: { customerName: "Ingen ret 2" }, step: 0 });
eq("17b en ny ændring nulstiller afvisningen", lokale("uden")[0].naegtet, undefined);

// ---------- 9. andre brugere
paa("A");
gem("p1", "U1's", "u1");
await sync(u1, "u1");
D.gemKladde({ id: "p2", storeId: BUTIK, userId: "u2", state: { customerName: "U2's" }, step: 0 });
await sync(u2, "u2");
eq("18 hver bruger ser kun sine egne - lokalt", [navne("u2"), navne("u1").includes("U2's")], [["U2's"], false]);
paa("B");
await sync(u2, "u2");
eq("19 en anden bruger på en anden enhed får kun sine egne fra databasen", navne("u2"), ["U2's"]);
eq("19b og ingen af u1's kladder", lokale("u2").some((k) => k.id === "p1"), false);
// gravsten tilhører en bestemt bruger
paa("A");
D.fjernKladde("p1");
const rpcFoer = server.kald.filter((n) => n === "delete_order_draft").length;
await sync(u2, "u2");
eq("20 u2's synkronisering rører ikke u1's sletning", [server.kald.filter((n) => n === "delete_order_draft").length - rpcFoer, D.hentGravsten("u1").length], [0, 1]);
await sync(u1, "u1");
eq("20b u1's egen synkronisering melder den", [raekker.has("p1"), D.hentGravsten("u1").length], [false, 0]);

// ---------- 10. butikker holdes adskilt
D.gemKladde({ id: "b2k", storeId: "s2", userId: "u1", state: { customerName: "Anden butik" }, step: 0 });
eq("21 en anden butiks kladder blandes ikke ind", [lokale("u1", "s2").length, lokale("u1").some((k) => k.id === "b2k")], [1, false]);
const klientAndenButik = await Sync.synkroniserNu(u1, "s2", "u1");
eq("21b u1 har ikke adgang til s2: afvises, ikke sendt", [klientAndenButik, !!lokale("u1", "s2")[0].naegtet, raekker.has("b2k")], ["ok", true, false]);

// ---------- 11. gamle kladder (fra før synkroniseringen) sendes første gang
paa("A");
enheder.A.set("p1sybs.kladder.v1", JSON.stringify([{ id: "gammel", storeId: BUTIK, userId: "u1", savedAt: new Date().toISOString(), step: 2, state: { customerName: "Fra før" } }]));
eq("22 en gammel kladde uden synk-felter regnes som ikke sendt", D.kladdeErDirty(lokale("u1").find((k) => k.id === "gammel")), true);
await sync(u1, "u1");
eq("22b og sendes", [raekker.get("gammel")?.state.customerName, D.kladdeErSynket(lokale("u1").find((k) => k.id === "gammel"))], ["Fra før", true]);

// ---------- 12. ren fletning
const R = (id, version, navn) => ({ id, step: 1, state: { customerName: navn }, version, updated_at: "2026-10-05T10:00:00Z" });
const L = (o) => ({ storeId: "s", userId: "u", savedAt: "2026-10-05T09:00:00Z", step: 0, state: { customerName: "lokal" }, ...o });
const ctx = { storeId: "s", userId: "u", slettede: [] };
eq("23 kun i databasen: tilføjes, ren", D.fletRemote([], [R("a", 3, "R")], ctx).map((k) => [k.id, k.version, D.kladdeErDirty(k)]), [["a", 3, false]]);
eq("24 ren lokal + nyere i databasen: opdateres", D.fletRemote([L({ id: "a", version: 1, rev: 2, syncedRev: 2 })], [R("a", 2, "R")], ctx)[0].state.customerName, "R");
eq("25 ren lokal + samme version: uændret", D.fletRemote([L({ id: "a", version: 2, rev: 2, syncedRev: 2 })], [R("a", 2, "R")], ctx)[0].state.customerName, "lokal");
eq("26 lokal med ændringer røres ikke af databasen", D.fletRemote([L({ id: "a", version: 1, rev: 3, syncedRev: 2 })], [R("a", 5, "R")], ctx)[0].state.customerName, "lokal");
eq("27 sendt før, nu væk i databasen: fjernes", D.fletRemote([L({ id: "a", version: 1, rev: 2, syncedRev: 2 })], [], ctx), []);
eq("28 aldrig sendt og væk i databasen: bevares", D.fletRemote([L({ id: "a", rev: 1 })], [], ctx).length, 1);
eq("29 gravsten: genoplives ikke", D.fletRemote([], [R("a", 3, "R")], { ...ctx, slettede: ["a"] }), []);
eq("30 andre brugeres og butikkers lokale poster røres ikke", D.fletRemote([L({ id: "x", userId: "andre" }), L({ id: "y", storeId: "andre" })], [], ctx).map((k) => k.id), ["x", "y"]);

console.log(`\n${pass} bestået, ${fail} fejlet`);
process.exit(fail ? 1 : 0);
