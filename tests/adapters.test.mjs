// Regressionstest til adaptere (src/adapters/*). Kør med:  node tests/adapters.test.mjs
// Ingen netværk: klienten er en attrap. Testen kontrollerer også adapterreglen i src/adapters/README.md:
// ingen adapter må importere noget fra appen.
import fs from "node:fs";
import path from "node:path";
import { opretEdgeTransport, erNetvaerksfejl, laesFejl } from "../src/adapters/core/edgeTransport.js";
import { opretPosAdapter } from "../src/adapters/pos/index.js";
import { opretSmsAdapter } from "../src/adapters/sms/index.js";
import { opretPunkt1Adapter } from "../src/adapters/punkt1/index.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

// ---------- adapterreglen: ingen afhængigheder til appen
const adapterFiler = [];
(function gaa(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) gaa(p);
    else if (e.name.endsWith(".js") && p !== path.join("src", "adapters", "index.js")) adapterFiler.push(p);
  }
})(path.join("src", "adapters"));
eq("der er adapterfiler at kontrollere", adapterFiler.length >= 4, true);
for (const f of adapterFiler) {
  const tekst = fs.readFileSync(f, "utf8");
  const importer = [...tekst.matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  const dynamiske = [...tekst.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
  const fra_appen = [...importer, ...dynamiske].filter((i) => !i.startsWith("./") || i.includes("/lib/") || i.includes("/data/"));
  eq(`${f}: importerer intet fra appen eller udefra`, fra_appen, []);
  eq(`${f}: ingen hemmeligheder i koden`, /(api[_-]?key|secret|token)\s*[:=]\s*["'][A-Za-z0-9]{12,}/i.test(tekst), false);
}

// ---------- attrap-klient
const kald = [];
let svar = { data: { ok: true }, error: null };
const klient = {
  functions: { invoke: async (navn, { body }) => { kald.push({ navn, body }); if (svar instanceof Error) throw svar; return typeof svar === "function" ? svar(navn, body) : svar; } },
  rpc: async (navn) => { kald.push({ rpc: navn }); return rpcSvar; },
  from: (tabel) => ({ select: () => { const q = { eq: () => q, maybeSingle: async () => fraSvar, then: (res) => res(fraSvar) }; return q; } }),
};
let rpcSvar = { data: true, error: null };
let fraSvar = { data: null, error: null };
const logget = [];
const log = (kilde, besked) => logget.push([kilde, besked]);
const nulstil = () => { kald.length = 0; logget.length = 0; svar = { data: { ok: true }, error: null }; rpcSvar = { data: true, error: null }; };

// ---------- kernen
eq("transport kræver en klient", (() => { try { opretEdgeTransport({}); return "ingen fejl"; } catch (e) { return "fejl"; } })(), "fejl");
const t = opretEdgeTransport({ klient, log });
nulstil();
svar = { data: { x: 1 }, error: null };
eq("ok-svar", await t.kald("f", { a: 1 }), { ok: true, data: { x: 1 } });
eq("funktionen og brødteksten sendes uændret", kald[0], { navn: "f", body: { a: 1 } });
svar = { data: { fejl: "Ugyldigt nummer" }, error: null };
const r1 = await t.kald("f", {}, { standardFejl: "std" });
eq("{ fejl } i brødteksten er en fejl", [r1.ok, r1.fejl], [false, "Ugyldigt nummer"]);
eq("og logges med funktionens navn", logget, [["f", "Ugyldigt nummer"]]);
nulstil();
const ctx = { clone() { return { json: async () => ({ fejl: "Den rigtige besked" }) }; }, json() {} };
svar = { data: null, error: { message: "Edge Function returned a non-2xx status code", context: ctx } };
eq("den RIGTIGE fejlbesked læses ud af error.context", (await t.kald("f", {})).fejl, "Den rigtige besked");
svar = { data: null, error: { message: "non-2xx", context: { clone() { return { json: async () => { throw new Error("ikke json"); } }; }, json() {} } } };
eq("ikke-JSON: brug fejlens egen besked", (await t.kald("f", {})).fejl, "non-2xx");
svar = { data: null, error: {} };
eq("helt tom fejl: standardbeskeden", (await t.kald("f", {}, { standardFejl: "Standard" })).fejl, "Standard");
svar = { data: null, error: { message: "TypeError: Failed to fetch" } };
eq("forbindelsesfejl markeres", (await t.kald("f", {})).netvaerk, true);
svar = { data: null, error: { message: "Du må ikke" } };
eq("afvisning er ikke en forbindelsesfejl", (await t.kald("f", {})).netvaerk, false);
nulstil(); svar = new Error("Failed to fetch");
const r2 = await t.kald("f", {});
eq("en kastet fejl bliver til { ok:false } - kaster aldrig", [r2.ok, r2.netvaerk, logget.length], [false, true, 1]);
eq("brugeren får den venlige standardbesked, loggen den rå", [r2.fejl, logget[0][1]], ["Kaldet fejlede", "Failed to fetch"]);
nulstil(); svar = { data: { fejl: "x" }, error: null };
await t.kald("f", {}, { logFejl: false });
eq("logFejl:false logger ikke", logget, []);
eq("dataFejlErFejl:false: { fejl } i brødteksten er ikke en afvisning", (await t.kald("f", {}, { dataFejlErFejl: false })).ok, true);
const tLogFejl = opretEdgeTransport({ klient, log: () => { throw new Error("log gik ned"); } });
svar = { data: { fejl: "x" }, error: null };
eq("en log, der går ned, vælter ikke kaldet", (await tLogFejl.kald("f", {})).ok, false);
eq("erNetvaerksfejl: offline", erNetvaerksfejl({ message: "x" }, { onLine: false }), true);
eq("erNetvaerksfejl: online og anden fejl", erNetvaerksfejl({ message: "Forbudt" }, { onLine: true }), false);
eq("erNetvaerksfejl: ingen miljø og ingen fejl", erNetvaerksfejl(undefined, null), false);
eq("laesFejl: data.fejl vinder", await laesFejl({ fejl: "A" }, { message: "B" }, "C"), "A");

// ---------- SMS
nulstil();
const sms = opretSmsAdapter({ transport: t });
eq("sms: én tid sendes uden minutterTil", (await sms.sendAnkomstSms({ telefon: "51234567", minutter: 15, kundeNavn: "Karen" }), kald[0]), { navn: "send-ankomst-sms", body: { telefon: "51234567", minutter: 15, kundeNavn: "Karen" } });
nulstil();
await sms.sendAnkomstSms({ telefon: "1", minutter: 15, minutterTil: 30, kundeNavn: "K" });
eq("sms: et interval sender minutterTil", kald[0].body.minutterTil, 30);
nulstil();
await sms.sendAnkomstSms({ telefon: "1", minutter: 15, minutterTil: null, kundeNavn: "K" });
eq("sms: null i minutterTil sendes ikke", "minutterTil" in kald[0].body, false);
nulstil(); svar = { data: { fejl: "SMS er slået fra for butikken" }, error: null };
eq("sms: afvisning giver { ok:false, fejl }", await sms.sendAnkomstSms({ telefon: "1", minutter: 5, kundeNavn: "K" }), { ok: false, fejl: "SMS er slået fra for butikken" });
eq("sms: afvisningen logges med adapterens kilde", logget[0][0], "sms:sendAnkomstSms");
nulstil();
eq("sms: ok", await sms.sendAnkomstSms({ telefon: "1", minutter: 5, kundeNavn: "K" }), { ok: true });

// ---------- punkt1
nulstil();
const p1 = opretPunkt1Adapter({ transport: t });
svar = { data: { matchCount: 2, brand: "Bosch", products: [{ title: "Bosch X" }] }, error: null };
eq("punkt1: svaret oversættes", await p1.produktopslag("WAN28"), { ok: true, matchCount: 2, brand: "Bosch", products: [{ title: "Bosch X" }] });
eq("punkt1: modellen sendes", kald[0], { navn: "punkt1-produktopslag", body: { model: "WAN28" } });
svar = { data: null, error: { message: "Failed to fetch" } };
eq("punkt1: fejl giver { ok:false, fejl }", (await p1.produktopslag("X")).ok, false);

// ---------- POS
nulstil();
const pos = opretPosAdapter({ transport: t, klient, log });
eq("pos: som udgangspunkt er opslag til og synkronisering ved afslutning FRA", pos.kapabiliteter, { opslag: true, synkVedAfslutning: false });
eq("pos: kapabiliteterne kan ikke ændres udefra", (() => { try { pos.kapabiliteter.synkVedAfslutning = true; } catch (_) { /* streng tilstand */ } return pos.kapabiliteter.synkVedAfslutning; })(), false);
const sprunget = await pos.synkVedAfslutning({ storeId: "s1", orderId: "o1" });
eq("pos: synkronisering ved afslutning er slået fra: intet kald, ingen status", [sprunget.ok, sprunget.sprunget, kald.length], [true, true, 0]);
eq("pos: og forklarer hvorfor", typeof sprunget.aarsag, "string");

const posTil = opretPosAdapter({ transport: t, klient, log, kapabiliteter: { synkVedAfslutning: true } });
svar = { data: { posStatus: { relevant: true, fejl: { trin: "faktura", besked: "x" } } }, error: null };
const s2 = await posTil.synkVedAfslutning({ storeId: "s1", orderId: "o1" });
eq("pos: slået til: kalder funktionen med finish-sync", kald[0], { navn: "pos-integration", body: { action: "finish-sync", storeId: "s1", orderId: "o1" } });
eq("pos: et svar med fejl i posStatus er ikke et mislykket kald (funktionen skriver selv statussen)", [s2.ok, s2.posStatus.relevant], [true, true]);
nulstil(); svar = { data: null, error: { message: "Failed to fetch" } };
eq("pos: forbindelsesfejl ved synkronisering melder ok:false", (await posTil.synkVedAfslutning({ storeId: "s", orderId: "o" })).ok, false);

nulstil(); svar = { data: { resultat: { navn: "Karen" } }, error: null };
eq("pos: opslag", await pos.opslag({ storeId: "s1", query: "51234567", queryType: "telefon" }), { ok: true, resultat: { navn: "Karen" } });
eq("pos: opslag sender action lookup", kald[0].body, { action: "lookup", storeId: "s1", query: "51234567", queryType: "telefon" });
nulstil(); svar = { data: { fejl: "afventer dokumentation fra Flow Retail" }, error: null };
eq("pos: opslag ærlig fejl", await pos.opslag({ storeId: "s", query: "1", queryType: "telefon" }), { ok: false, fejl: "afventer dokumentation fra Flow Retail" });
eq("pos: opslagsfejl logges ikke (vises direkte i panelet)", logget, []);
const posUdenOpslag = opretPosAdapter({ transport: t, klient, log, kapabiliteter: { opslag: false } });
nulstil();
eq("pos: opslag kan slås fra", [(await posUdenOpslag.opslag({ storeId: "s", query: "1", queryType: "telefon" })).sprunget, kald.length], [true, 0]);

nulstil();
eq("pos: erAktiv ja", await pos.erAktiv(), true);
rpcSvar = { data: false, error: null };
eq("pos: erAktiv nej", await pos.erAktiv(), false);
rpcSvar = { data: null, error: { message: "permission denied" } };
eq("pos: erAktiv ved fejl er nej (skjult knap, ikke en knap der altid fejler)", [await pos.erAktiv(), logget.length], [false, 1]);
rpcSvar = { data: "ja", error: null };
eq("pos: erAktiv accepterer kun præcis true", await pos.erAktiv(), false);
const posUdenRpc = opretPosAdapter({ transport: t, klient: {}, log });
eq("pos: uden klient med rpc er POS ikke aktiv", await posUdenRpc.erAktiv(), false);
const posRpcKaster = opretPosAdapter({ transport: t, klient: { rpc: async () => { throw new Error("nede"); } }, log });
eq("pos: en kastet fejl i erAktiv vælter ikke", await posRpcKaster.erAktiv(), false);

nulstil(); fraSvar = { data: null, error: null };
eq("pos: ingen opsætning gemt giver en tom, slået-fra opsætning", (await pos.hentOpsaetning("s1")).aktiveret, false);
fraSvar = { data: { enabled: true, tenant_id: "T1", base_url: "https://x", api_key_secret_id: "sec", last_test_ok: true, last_test_note: null }, error: null };
eq("pos: opsætning oversættes, og nøglen røbes aldrig - kun at den findes", await pos.hentOpsaetning("s1"), { aktiveret: true, tenantId: "T1", baseUrl: "https://x", harNoegle: true, sidstTestet: undefined, sidstTestetOk: true, sidstTestetNote: "" });
fraSvar = { data: null, error: { message: "rls" } };
eq("pos: læsefejl giver null og logges", [await pos.hentOpsaetning("s1"), logget.length], [null, 1]);
eq("pos: uden butik intet opslag", await pos.hentOpsaetning(""), null);
nulstil(); svar = { data: { ok: true }, error: null };
await pos.gemNoegle({ storeId: "s1", apiKey: "hemmelig", tenantId: "T", baseUrl: "u", enabled: true });
eq("pos: gem nøgle sender action set-key", kald[0].body, { action: "set-key", storeId: "s1", apiKey: "hemmelig", tenantId: "T", baseUrl: "u", enabled: true });
nulstil();
await pos.test("s1");
eq("pos: test sender action test", kald[0].body, { action: "test", storeId: "s1" });

console.log(`\n${pass} bestået, ${fail} fejlet`);
process.exit(fail ? 1 : 0);
