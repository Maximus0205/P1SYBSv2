// Regressionstest til billedkøen (src/lib/billedKoeCore.js).
// Kør med:  node tests/billedKoe.test.mjs
import { opretBilledKoe, erMidlertidigFejl, MAKS_AFVISNINGER } from "../src/lib/billedKoeCore.js";

let pass = 0, fail = 0;
const eq = (navn, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", navn, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

// Et lager i hukommelsen, der opfører sig som IndexedDB: gemmer kopier.
function lager({ putFejler = false } = {}) {
  const m = new Map();
  return {
    m,
    async put(p) { if (putFejler) throw new Error("QuotaExceededError"); m.set(p.id, { ...p }); },
    async delete(id) { m.delete(id); },
    async getAll() { return [...m.values()].map((p) => ({ ...p })); },
  };
}
const blob = (n) => ({ type: "image/jpeg", n });
let t = 1000;
const nu = () => ++t;
const OK = { ok: true, id: "v1" };

function opsaet(over = {}) {
  const s = over.store || lager();
  const kald = [];
  const svar = over.svar || (() => OK);
  const k = opretBilledKoe({
    store: s,
    upload: async (a) => { kald.push(a); return svar(a, kald.length); },
    erOnline: over.erOnline || (() => true),
    ejer: over.ejer || (async () => "u1"),
    nu,
    laas: over.laas,
  });
  return { s, kald, k };
}
const tag = (k, n = 1, ejerId = "u1") => k.laegIKoe({ orderId: "S1", blob: blob(n), navn: `b${n}.jpg`, ejerId });

// --- erMidlertidigFejl
eq("net: midlertidig", erMidlertidigFejl({ ok: false, netvaerk: true, fejl: "x" }), true);
eq("ikke logget ind: midlertidig", erMidlertidigFejl({ ok: false, fejl: "Ikke logget ind" }), true);
eq("serverfejl 503: midlertidig", erMidlertidigFejl({ ok: false, fejl: "Lageret svarede med status 503" }), true);
eq("rettighed: afvisning", erMidlertidigFejl({ ok: false, fejl: 'Mangler rettigheden "Feltarbejde"' }), false);
eq("ok er aldrig fejl", erMidlertidigFejl({ ok: true }), false);

// --- gemmes først, slettes først efter bekræftelse
{
  const { s, k, kald } = opsaet();
  const r = await tag(k);
  eq("lagt i kø: ok", r.ok, true);
  eq("lagt i kø: gemt lokalt før afsendelse", [s.m.size, kald.length], [1, 0]);
  eq("sendt: antal", await k.proev(), 1);
  eq("sendt: slettet lokalt efter bekræftelse", s.m.size, 0);
}

// --- ingen forbindelse: billedet bliver liggende
{
  const { s, k, kald } = opsaet({ erOnline: () => false });
  await tag(k);
  eq("offline: intet sendt", await k.proev(), 0);
  eq("offline: billedet ligger stadig, uberørt", [s.m.size, kald.length, [...s.m.values()][0].afvisninger], [1, 0, 0]);
}

// --- netværksfejl midt i: bliver liggende, tæller ikke, og alle efterfølgende afventer
{
  let net = true;
  const { s, k, kald } = opsaet({ svar: () => (net ? { ok: false, fejl: "Failed to fetch", netvaerk: true } : OK) });
  await tag(k, 1); await tag(k, 2);
  eq("netfejl: intet sendt", await k.proev(), 0);
  eq("netfejl: stopper efter første (sparer batteri)", kald.length, 1);
  eq("netfejl: begge ligger, ingen afvisninger", [...s.m.values()].map((p) => [p.tilstand, p.afvisninger]), [["venter", 0], ["venter", 0]]);
  for (let i = 0; i < 10; i++) await k.proev();            // mange runder uden net ændrer intet
  eq("netfejl: aldrig afvist uanset antal forsøg", [...s.m.values()].map((p) => p.tilstand), ["venter", "venter"]);
  net = false;
  eq("nettet tilbage: begge sendt", await k.proev(), 2);
  eq("nettet tilbage: kø tom", s.m.size, 0);
}

// --- rækkefølge: det først tagne billede sendes først
{
  const { k, kald } = opsaet();
  await tag(k, 1); await tag(k, 2); await tag(k, 3);
  await k.proev();
  eq("FIFO", kald.map((a) => a.blob.n), [1, 2, 3]);
}

// --- afvisning: efter MAKS bliver den 'afvist' men SLETTES ALDRIG; de andre går igennem
{
  const { s, k, kald } = opsaet({ svar: (a) => (a.blob.n === 1 ? { ok: false, fejl: 'Mangler rettigheden "Feltarbejde"' } : OK) });
  await tag(k, 1); await tag(k, 2);
  for (let i = 0; i < MAKS_AFVISNINGER + 3; i++) await k.proev();
  const rest = [...s.m.values()];
  eq("afvist: billedet findes stadig", rest.length, 1);
  eq("afvist: tilstand og tæller", [rest[0].tilstand, rest[0].afvisninger], ["afvist", MAKS_AFVISNINGER]);
  eq("afvist: besked gemt", rest[0].sidsteFejl, 'Mangler rettigheden "Feltarbejde"');
  eq("afvist: det andet billede blev sendt alligevel", kald.filter((a) => a.blob.n === 2).length, 1);
  eq("afvist: ikke prøvet automatisk efter afvisning", kald.filter((a) => a.blob.n === 1).length, MAKS_AFVISNINGER);
  eq("afvist: seneste afvisning kendt", k.sidsteAfvisning()?.besked, 'Mangler rettigheden "Feltarbejde"');
}

// --- "Prøv igen" nulstiller og sender
{
  let afvis = true;
  const { s, k } = opsaet({ svar: () => (afvis ? { ok: false, fejl: "Afvist af serveren" } : OK) });
  const { id } = await tag(k);
  for (let i = 0; i < MAKS_AFVISNINGER; i++) await k.proev();
  eq("prøv igen: afvist først", [...s.m.values()][0].tilstand, "afvist");
  afvis = false;
  eq("prøv igen: kendt id", await k.proevIgen(id), true);
  await k.proev();
  eq("prøv igen: sendt og væk", s.m.size, 0);
  eq("prøv igen: ukendt id", await k.proevIgen("findes-ikke"), false);
}

// --- to-trins: filen nåede frem, men bekræftelsen fejlede på nettet -> genoptag (ingen dublet)
{
  let runde = 0;
  const { s, k, kald } = opsaet({
    svar: (a) => {
      runde++;
      if (runde === 1) return { ok: false, fejl: "Filen blev sendt, men kunne ikke bekræftes", netvaerk: true, fase: "bekraeft", vedhaeftningId: "V9" };
      return OK;
    },
  });
  await tag(k);
  await k.proev();
  eq("genoptag: id gemt efter fejlet bekræftelse", [...s.m.values()][0].vedhaeftningId, "V9");
  await k.proev();
  eq("genoptag: andet forsøg bekræfter det samme id", kald[1].genoptag, "V9");
  eq("genoptag: første forsøg var et helt nyt", kald[0].genoptag, undefined);
  eq("genoptag: kø tom", s.m.size, 0);
}

// --- genoptag mislykkes (filen fandtes alligevel ikke): send forfra, uden at tælle som afvisning
{
  let runde = 0;
  const { s, k, kald } = opsaet({
    svar: () => {
      runde++;
      if (runde === 1) return { ok: false, fejl: "x", netvaerk: true, fase: "bekraeft", vedhaeftningId: "V9" };
      if (runde === 2) return { ok: false, fejl: "Filen blev ikke fundet på lageret", fase: "genoptag" };
      return OK;
    },
  });
  await tag(k);
  await k.proev();                      // fejl, id gemt
  await k.proev();                      // genoptag fejler -> id ryddes
  const p = [...s.m.values()][0];
  eq("genoptag fejlet: id ryddet, ingen afvisning", [p.vedhaeftningId, p.afvisninger, p.tilstand], [null, 0, "venter"]);
  await k.proev();                      // helt nyt forsøg
  eq("genoptag fejlet: nyt helt forsøg uden genoptag", kald[2].genoptag, undefined);
  eq("genoptag fejlet: sendt til sidst", s.m.size, 0);
}

// --- samtidighed: to kald på samme tid sender kun én gang
{
  let slip;
  const port = new Promise((r) => { slip = r; });
  const { k, kald } = opsaet({ svar: () => OK });
  const k2 = opretBilledKoe({
    store: lager(), erOnline: () => true, ejer: async () => "u1", nu,
    upload: async (a) => { kald.push(a); await port; return OK; },
  });
  await k2.laegIKoe({ orderId: "S1", blob: blob(1), ejerId: "u1" });
  const a = k2.proev(), b = k2.proev();
  slip();
  const [x, y] = await Promise.all([a, b]);
  eq("samtidighed: kun én afsendelse", [x + y, kald.length], [1, 1]);
  void k;
}

// --- laas: en anden fane sender allerede -> intet sendes her
{
  const { s, k, kald } = opsaet({ laas: async () => {} });
  await tag(k);
  eq("lås optaget: intet sendt, intet slettet", [await k.proev(), kald.length, s.m.size], [0, 0, 1]);
}

// --- bruger: ikke logget ind sender intet; en andres billede sendes ikke
{
  const a = opsaet({ ejer: async () => null });
  await tag(a.k);
  eq("ingen bruger: intet sendt", [await a.k.proev(), a.kald.length, a.s.m.size], [0, 0, 1]);
  const b = opsaet({ ejer: async () => "u2" });
  await tag(b.k, 1, "u1");
  eq("anden bruger: sendes ikke", [await b.k.proev(), b.kald.length, b.s.m.size], [0, 0, 1]);
}

// --- lageret afviser at gemme (fuldt): kalderen får besked, intet er halvt lagt i kø
{
  const s = lager({ putFejler: true });
  const { k } = opsaet({ store: s });
  const r = await tag(k);
  eq("lager fuldt: ok false med besked", [r.ok, typeof r.fejl], [false, "string"]);
  eq("lager fuldt: intet i køen", s.m.size, 0);
  eq("mangler data: afvises", (await k.laegIKoe({ orderId: "", blob: blob(1) })).ok, false);
}

// --- visning pr. sag og lyttere
{
  const { k } = opsaet({ erOnline: () => false });
  await k.laegIKoe({ orderId: "S1", blob: blob(1), ejerId: "u1" });
  await k.laegIKoe({ orderId: "S2", blob: blob(2), ejerId: "u1" });
  eq("pr. sag", (await k.hentForSag("S1")).map((p) => p.orderId), ["S1"]);
  let set = null;
  const stop = k.abonner((v) => { set = v.length; });
  await new Promise((r) => setTimeout(r, 0));
  eq("abonnent får tilstand", set, 2);
  stop();
}

// --- en lytter, der kaster, vælter ikke køen
{
  const { k, s } = opsaet();
  k.abonner(() => { throw new Error("fejl i lytter"); });
  await tag(k);
  eq("kastende lytter: stadig sendt", [await k.proev(), s.m.size], [1, 0]);
}

console.log(`billedKoe: ${pass} ok, ${fail} fejl`);
if (fail) process.exit(1);
