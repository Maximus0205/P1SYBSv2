// Regressionstest til butikkens kladde-indstillinger i den lokale cache (src/lib/orderDrafts.js).
// Kør med:  node tests/kladdeIndstillinger.test.mjs
const lager = new Map();
globalThis.localStorage = { getItem: (k) => (lager.has(k) ? lager.get(k) : null), setItem: (k, v) => { lager.set(k, String(v)); }, removeItem: (k) => { lager.delete(k); } };
const D = await import("../src/lib/orderDrafts.js");

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};
const DAG = 24 * 60 * 60 * 1000;
const nulstil = () => lager.clear();
// en kladde med et bestemt alderstidspunkt skrives direkte i lageret
const skrivKladde = (id, storeId, userId, aldreDage) => {
  const liste = JSON.parse(lager.get("p1sybs.kladder.v1") || "[]");
  liste.push({ id, storeId, userId, savedAt: new Date(Date.now() - aldreDage * DAG).toISOString(), step: 1, state: { customerName: id }, rev: 1, syncedRev: 1, version: 1 });
  lager.set("p1sybs.kladder.v1", JSON.stringify(liste));
};
const ids = (storeId, userId) => D.hentKladder(storeId, userId).map((k) => k.id).sort();

// ---- rens og standard
eq("standard: til og 14 dage", [D.kladdeIndstillinger("s1"), D.kladderAktiveret("s1")], [{ aktiveret: true, dage: 14 }, true]);
eq("rens: gyldig værdi bevares", D.rensIndstillinger({ aktiveret: false, dage: 30 }), { aktiveret: false, dage: 30 });
eq("rens: dage under 1 og over 90 holdes inden for grænserne", [D.rensIndstillinger({ dage: 0 }).dage, D.rensIndstillinger({ dage: -5 }).dage, D.rensIndstillinger({ dage: 91 }).dage, D.rensIndstillinger({ dage: 5000 }).dage], [1, 1, 90, 90]);
eq("rens: dage afrundes", D.rensIndstillinger({ dage: 7.6 }).dage, 8);
eq("rens: ulæselige og uudfyldte dage giver 14, og tekst med tal accepteres", [D.rensIndstillinger({ dage: "abc" }).dage, D.rensIndstillinger({ dage: undefined }).dage, D.rensIndstillinger({ dage: null }).dage, D.rensIndstillinger({ dage: "" }).dage, D.rensIndstillinger({}).dage, D.rensIndstillinger("x").dage, D.rensIndstillinger({ dage: "21" }).dage], [14, 14, 14, 14, 14, 14, 21]);
eq("rens: en rigtig 0 er stadig 0 dage og holdes til minimum 1", D.rensIndstillinger({ dage: 0 }).dage, 1);
eq("rens: kun et udtrykkeligt false slår fra", [D.rensIndstillinger({}).aktiveret, D.rensIndstillinger(null).aktiveret, D.rensIndstillinger({ aktiveret: 0 }).aktiveret, D.rensIndstillinger({ aktiveret: false }).aktiveret], [true, true, true, false]);
eq("grænserne er 1 og 90", [D.MIN_DAGE, D.MAKS_DAGE], [1, 90]);

// ---- gem og husk pr. butik
nulstil();
D.saetKladdeIndstillinger("s1", { aktiveret: true, dage: 30 });
D.saetKladdeIndstillinger("s2", { aktiveret: false, dage: 7 });
eq("hver butik har sin egen indstilling", [D.kladdeIndstillinger("s1"), D.kladdeIndstillinger("s2"), D.kladdeIndstillinger("s3")], [{ aktiveret: true, dage: 30 }, { aktiveret: false, dage: 7 }, { aktiveret: true, dage: 14 }]);
eq("indstillingen huskes i browseren (overlever en ny indlæsning)", JSON.parse(lager.get("p1sybs.kladder.indstillinger.v1")).s1.dage, 30);
eq("uden butik gemmes intet", [D.saetKladdeIndstillinger("", { dage: 5 }), lager.get("p1sybs.kladder.indstillinger.v1") !== undefined], [{ aktiveret: true, dage: 14 }, true]);
lager.set("p1sybs.kladder.indstillinger.v1", "ikke json");
eq("ødelagt lager giver standarden i stedet for en fejl", D.kladdeIndstillinger("s1"), { aktiveret: true, dage: 14 });
lager.set("p1sybs.kladder.indstillinger.v1", "[1,2]");
eq("forkert form giver også standarden", D.kladdeIndstillinger("s1"), { aktiveret: true, dage: 14 });

// ---- lyttere får besked, når noget ændres - men ikke ved en uændret indstilling
nulstil();
let antal = 0;
const stop = D.subscribeKladder(() => { antal++; });
const start = antal;
D.saetKladdeIndstillinger("s1", { aktiveret: true, dage: 20 });
eq("ændring giver besked", antal - start, 1);
D.saetKladdeIndstillinger("s1", { aktiveret: true, dage: 20 });
eq("uændret indstilling giver ingen besked (ingen unødig gentegning)", antal - start, 1);
D.saetKladdeIndstillinger("s1", { aktiveret: false, dage: 20 });
eq("ny ændring giver besked", antal - start, 2);
stop();

// ---- slået fra
nulstil();
skrivKladde("k1", "s1", "u1", 1);
D.saetKladdeIndstillinger("s1", { aktiveret: false, dage: 14 });
eq("slået fra: ingen kladder vises", D.hentKladder("s1", "u1"), []);
const r = D.gemKladde({ id: "k2", storeId: "s1", userId: "u1", state: { customerName: "x" }, step: 0 });
eq("slået fra: der parkeres intet, og kalderen får at vide hvorfor", [r.ok, r.slaaetFra, JSON.parse(lager.get("p1sybs.kladder.v1")).map((k) => k.id)], [false, true, ["k1"]]);
D.fjernKladde("k1");
eq("slået fra: en eksisterende kladde kan stadig fjernes (oprydning)", JSON.parse(lager.get("p1sybs.kladder.v1")), []);
D.saetKladdeIndstillinger("s1", { aktiveret: true, dage: 14 });
eq("slået til igen: der kan parkeres igen", D.gemKladde({ id: "k3", storeId: "s1", userId: "u1", state: { customerName: "y" }, step: 0 }).ok, true);
eq("en anden butik er upåvirket af at s1 var slået fra", (D.saetKladdeIndstillinger("s1", { aktiveret: false }), D.gemKladde({ id: "k4", storeId: "s9", userId: "u1", state: { customerName: "z" }, step: 0 }).ok), true);

// ---- frist pr. butik
nulstil();
skrivKladde("gl10", "s1", "u1", 10);
skrivKladde("ny2", "s1", "u1", 2);
eq("standard 14 dage: en 10 dage gammel kladde vises", ids("s1", "u1"), ["gl10", "ny2"]);
D.saetKladdeIndstillinger("s1", { aktiveret: true, dage: 7 });
eq("frist 7 dage: den 10 dage gamle skjules, den 2 dage gamle vises", ids("s1", "u1"), ["ny2"]);
D.saetKladdeIndstillinger("s1", { aktiveret: true, dage: 1 });
eq("frist 1 dag: begge skjules", ids("s1", "u1"), []);
D.saetKladdeIndstillinger("s1", { aktiveret: true, dage: 90 });
eq("frist 90 dage: begge vises igen (kladderne blev aldrig fjernet fra lageret)", ids("s1", "u1"), ["gl10", "ny2"]);
skrivKladde("gl40", "s1", "u1", 40);
skrivKladde("gl100", "s1", "u1", 100);
eq("90 dage: 40 dage gammel vises, 100 dage gammel gør ikke", ids("s1", "u1"), ["gl10", "gl40", "ny2"]);
skrivKladde("andenButik", "s2", "u1", 10);
eq("fristen gælder pr. butik: s2 har stadig standarden på 14 dage", ids("s2", "u1"), ["andenButik"]);
D.saetKladdeIndstillinger("s2", { aktiveret: true, dage: 5 });
eq("s2 kan have en kortere frist uden at røre s1", [ids("s2", "u1"), ids("s1", "u1").length], [[], 3]);

// ---- at gemme rydder kun efter fristen, og rører ikke andre butikkers kladder
nulstil();
skrivKladde("udloebet", "s1", "u1", 20);
D.saetKladdeIndstillinger("s1", { aktiveret: true, dage: 14 });
skrivKladde("s2gammel", "s2", "u1", 20);
D.saetKladdeIndstillinger("s2", { aktiveret: true, dage: 30 });
D.gemKladde({ id: "frisk", storeId: "s1", userId: "u1", state: { customerName: "f" }, step: 0 });
eq("gem fjerner udløbne kladder efter hver butiks EGEN frist", JSON.parse(lager.get("p1sybs.kladder.v1")).map((k) => k.id).sort(), ["frisk", "s2gammel"]);

// ---- rydKladder
nulstil();
skrivKladde("a", "s1", "u1", 1); skrivKladde("b", "s1", "u2", 1); skrivKladde("c", "s2", "u1", 1);
D.rydKladder("s1", "u1");
eq("rydKladder fjerner kun denne brugers kladder i denne butik", JSON.parse(lager.get("p1sybs.kladder.v1")).map((k) => k.id).sort(), ["b", "c"]);
let beskeder = 0;
const stop2 = D.subscribeKladder(() => { beskeder++; });
const foer = beskeder;
D.rydKladder("s1", "u1");
eq("rydKladder uden noget at fjerne giver ingen besked", beskeder - foer, 0);
D.rydKladder("s1", "u2");
eq("rydKladder med noget at fjerne giver besked", beskeder - foer, 1);
stop2();

// ---- gravsten overlever en lang frist
nulstil();
D.saetKladdeIndstillinger("s1", { aktiveret: true, dage: 90 });
D.gemKladde({ id: "g1", storeId: "s1", userId: "u1", state: { customerName: "g" }, step: 0 });
D.fjernKladde("g1");
const g = JSON.parse(lager.get("p1sybs.kladder.slettet.v1"));
g[0].tid = new Date(Date.now() - 60 * DAG).toISOString();
lager.set("p1sybs.kladder.slettet.v1", JSON.stringify(g));
eq("en 60 dage gammel sletning er stadig husket (fristen kan være 90 dage)", D.hentGravsten("u1").map((x) => x.id), ["g1"]);
g[0].tid = new Date(Date.now() - 100 * DAG).toISOString();
lager.set("p1sybs.kladder.slettet.v1", JSON.stringify(g));
eq("en 100 dage gammel sletning glemmes", D.hentGravsten("u1"), []);

console.log(`\n${pass} bestået, ${fail} fejlet`);
process.exit(fail ? 1 : 0);
