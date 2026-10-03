// Regressionstest til offline-køen (src/lib/offlineQueue.js).
// Kør med:  node tests/offlineQueue.test.mjs
// Ingen afhængigheder - ren Node (localStorage erstattes af en lille attrap).
const lager = new Map();
globalThis.localStorage = {
  getItem: (k) => (lager.has(k) ? lager.get(k) : null),
  setItem: (k, v) => { lager.set(k, String(v)); },
  removeItem: (k) => { lager.delete(k); },
};
const { enqueueOrder, getQueuedPost, getQueue, flushQueue, removeFromQueue, noteFailedAttempt, clearQueue } = await import("../src/lib/offlineQueue.js");

let fail = 0, pass = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

const S = "butik-1";
const base0 = { id: "a", status: "planlagt" };

// --- Oprindelig base bevares, når samme sag erstattes i køen
clearQueue();
enqueueOrder(S, { id: "a", status: "igang" }, { base: base0, baseVersion: 3 });
enqueueOrder(S, { id: "a", status: "afsluttet" }, { base: { id: "a", status: "igang" }, baseVersion: 4 });
let p = getQueuedPost("a", S);
eq("seneste udgave i køen", p.order.status, "afsluttet");
eq("oprindelig base bevaret", [p.base.status, p.baseVersion], ["planlagt", 3]);
eq("kun én post pr. sag", getQueue().length, 1);

// --- rebase erstatter basen (efter sammenfletning)
enqueueOrder(S, { id: "a", status: "afsluttet", dato: "x" }, { base: { id: "a", status: "afsluttet" }, baseVersion: 9, rebase: true });
p = getQueuedPost("a", S);
eq("rebase erstatter base", p.baseVersion, 9);

// --- KRITISK: netværksfejl må ALDRIG få en ændring til at blive opgivet
clearQueue();
enqueueOrder(S, { id: "b", status: "igang" }, { base: base0, baseVersion: 1 });
const dropped = [];
for (let i = 0; i < 20; i++) {
  await flushQueue(async () => "network", { onDropped: (x) => dropped.push(x) });
}
eq("20 mislykkede netværksforsøg: posten er der stadig", getQueue().length, 1);
eq("ingen opgivet ved netværksfejl", dropped.length, 0);
eq("forsøgstæller urørt ved netværksfejl", getQueuedPost("b", S).forsoeg, 0);

// --- En reel AFVISNING opgives først efter 5 forsøg, og brugeren får besked
clearQueue();
enqueueOrder(S, { id: "c" }, { base: base0, baseVersion: 1 });
const d2 = [];
for (let i = 0; i < 4; i++) await flushQueue(async () => "error", { onDropped: (x) => d2.push(x) });
eq("efter 4 afvisninger: stadig i køen", [getQueue().length, d2.length], [1, 0]);
await flushQueue(async () => "error", { onDropped: (x) => d2.push(x) });
eq("efter 5 afvisninger: opgivet og meldt", [getQueue().length, d2.length], [0, 1]);

// --- Netværksfejl midt i køen stopper resten, og intet går tabt
clearQueue();
enqueueOrder(S, { id: "d1" }, { baseVersion: 1 });
enqueueOrder(S, { id: "d2" }, { baseVersion: 1 });
enqueueOrder(S, { id: "d3" }, { baseVersion: 1 });
const set = [];
await flushQueue(async (post) => {
  set.push(post.id);
  if (post.id === "d1") { removeFromQueue(post.id, post.storeId); return "ok"; }
  return "network";
});
eq("stopper ved netværksfejl", set, ["d1", "d2"]);
eq("d2 og d3 bevaret", getQueue().map((x) => x.id), ["d2", "d3"]);

// --- Ændring lagt i køen MIDT i en afsendelse går ikke tabt
clearQueue();
enqueueOrder(S, { id: "e1" }, { baseVersion: 1 });
await flushQueue(async (post) => {
  enqueueOrder(S, { id: "e2" }, { baseVersion: 1 }); // sker mens vi sender e1
  removeFromQueue(post.id, post.storeId);
  return "ok";
});
eq("sen ændring bevaret", getQueue().map((x) => x.id), ["e2"]);

// --- Fuld kø afvises (kalderen skal fortælle brugeren det)
clearQueue();
let sidste = true;
for (let i = 0; i < 201; i++) sidste = enqueueOrder(S, { id: "x" + i }, { baseVersion: 1 });
eq("kø fuld giver false", sidste, false);

// --- Kan browseren ikke gemme, meldes det
clearQueue();
const orig = globalThis.localStorage.setItem;
globalThis.localStorage.setItem = () => { throw new Error("QuotaExceeded"); };
eq("kan ikke gemme giver false", enqueueOrder(S, { id: "y" }, { baseVersion: 1 }), false);
globalThis.localStorage.setItem = orig;

console.log(`\n${pass} bestået, ${fail} fejlet`);
process.exit(fail ? 1 : 0);
