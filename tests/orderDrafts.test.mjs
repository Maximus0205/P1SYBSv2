// Regressionstest til kladder (src/lib/orderDrafts.js).
// Kør med:  node tests/orderDrafts.test.mjs
// Ingen afhængigheder - ren Node (localStorage erstattes af en lille attrap).
const lager = new Map();
globalThis.localStorage = {
  getItem: (k) => (lager.has(k) ? lager.get(k) : null),
  setItem: (k, v) => { lager.set(k, String(v)); },
  removeItem: (k) => { lager.delete(k); },
};
const fane = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (fane.has(k) ? fane.get(k) : null),
  setItem: (k, v) => { fane.set(k, String(v)); },
  removeItem: (k) => { fane.delete(k); },
};
const D = await import("../src/lib/orderDrafts.js");

let fail = 0, pass = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

const blank = { lineItem: { id: "x1", varetypeId: "t1", primaerYdelse: { id: "y1", navn: "Opstilling", minutter: 30 }, tillaeg: [] }, keyAccess: { kraeves: false, tekst: "" } };
const tom = () => ({
  customerName: "", phone: "", email: "", externalReference: "", hasBuyer: false, buyerName: "", buyerPhone: "", buyerEmail: "", buyerAddress: "",
  address: "", deliveryNote: "", keyAccess: { kraeves: false, tekst: "" }, date: "2026-10-05", timeSlotId: "heldag", vehicleId: "",
  lineItems: [{ id: "ANDET-ID", varetypeId: "t1", primaerYdelse: { id: "y1", navn: "Opstilling", minutter: 30 }, tillaeg: [] }],
});

// --- harIndhold
eq("helt tom formular er ikke indhold", D.harIndhold(tom(), blank), false);
eq("kun mellemrum er ikke indhold", D.harIndhold({ ...tom(), customerName: "   " }, blank), false);
eq("navn er indhold", D.harIndhold({ ...tom(), customerName: "Karen" }, blank), true);
eq("telefon alene er indhold", D.harIndhold({ ...tom(), phone: "51234567" }, blank), true);
eq("adresse alene er indhold", D.harIndhold({ ...tom(), address: "Skovvej 1" }, blank), true);
eq("dato/tidsrum/bil alene er IKKE indhold", D.harIndhold({ ...tom(), date: "2026-12-24", timeSlotId: "formiddag", vehicleId: "b1" }, blank), false);
eq("køber-felter tæller kun hvis køber er slået til", D.harIndhold({ ...tom(), buyerName: "Firma" }, blank), false);
eq("køber-felter tæller når køber er slået til", D.harIndhold({ ...tom(), hasBuyer: true, buyerName: "Firma" }, blank), true);
eq("nøgle: kun 'kræves' slået til er ikke indhold (tomgang)", D.harIndhold({ ...tom(), keyAccess: { kraeves: true, tekst: "" } }, blank), false);
eq("nøgle: tekst skrevet er indhold", D.harIndhold({ ...tom(), keyAccess: { kraeves: true, tekst: "Boks 1234" } }, blank), true);
const s2 = tom(); s2.lineItems[0].model = "WW90";
eq("model skrevet på varelinje er indhold", D.harIndhold(s2, blank), true);
const s3 = tom(); s3.lineItems.push({ id: "n", varetypeId: "t1", tillaeg: [] });
eq("ekstra varelinje er indhold", D.harIndhold(s3, blank), true);
const s4 = tom(); s4.lineItems[0].varetypeId = "t2";
eq("skiftet varetype er indhold", D.harIndhold(s4, blank), true);
eq("null/udefineret er ikke indhold", [D.harIndhold(null, blank), D.harIndhold(undefined, blank)], [false, false]);
eq("uden blank-reference ignoreres nøgle/linjer, men tekst tæller", [D.harIndhold(tom()), D.harIndhold({ ...tom(), phone: "1" })], [false, true]);

// --- gem/hent
const U = "bruger-1", S = "butik-1";
D.gemKladde({ id: "a", storeId: S, userId: U, state: { ...tom(), customerName: "Anna" }, step: 1 });
D.gemKladde({ id: "b", storeId: S, userId: U, state: { ...tom(), customerName: "Bent" }, step: 2 });
eq("begge kladder hentes", D.hentKladder(S, U).map((k) => k.id).sort(), ["a", "b"]);
eq("en anden bruger ser ikke kladderne", D.hentKladder(S, "bruger-2"), []);
eq("en anden butik ser ikke kladderne", D.hentKladder("butik-2", U), []);
eq("trin gemmes", D.hentKladder(S, U).find((k) => k.id === "b").step, 2);

D.gemKladde({ id: "a", storeId: S, userId: U, state: { ...tom(), customerName: "Anna Ny" }, step: 3 });
eq("samme id opdaterer i stedet for at duplikere", [D.hentKladder(S, U).length, D.hentKladder(S, U).find((k) => k.id === "a").state.customerName], [2, "Anna Ny"]);

D.fjernKladde("a");
eq("fjern virker", D.hentKladder(S, U).map((k) => k.id), ["b"]);
D.fjernKladde("findes-ikke");
eq("fjern af ukendt er harmløst", D.hentKladder(S, U).length, 1);

// --- udløb efter 14 dage
const raa = JSON.parse(lager.get("p1sybs.kladder.v1"));
raa[0].savedAt = new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString();
lager.set("p1sybs.kladder.v1", JSON.stringify(raa));
eq("kladde ældre end 14 dage vises ikke", D.hentKladder(S, U), []);
raa[0].savedAt = new Date(Date.now() - 13 * 24 * 3600 * 1000).toISOString();
lager.set("p1sybs.kladder.v1", JSON.stringify(raa));
eq("kladde på 13 dage vises stadig", D.hentKladder(S, U).length, 1);
raa[0].savedAt = "ikke-en-dato";
lager.set("p1sybs.kladder.v1", JSON.stringify(raa));
eq("ulæselig tid kasseres", D.hentKladder(S, U), []);

// --- grænse på 20: de ældste vige
lager.clear();
for (let i = 0; i < 25; i++) D.gemKladde({ id: "k" + i, storeId: S, userId: U, state: { customerName: "n" + i }, step: 0 });
const alle = D.hentKladder(S, U);
eq("højst 20 kladder", alle.length, 20);
eq("den nyeste bevares, den ældste vigede", [alle.some((k) => k.id === "k24"), alle.some((k) => k.id === "k0")], [true, false]);

// --- robusthed
lager.set("p1sybs.kladder.v1", "{ikke json");
eq("ødelagt lager giver tom liste, ikke en fejl", D.hentKladder(S, U), []);
lager.set("p1sybs.kladder.v1", JSON.stringify([{ id: 5 }, null, { id: "x" }, { id: "y", state: {} }]));
eq("ugyldige poster filtreres fra", D.hentKladder(S, U).length, 0);
lager.clear();
const orig = globalThis.localStorage.setItem;
globalThis.localStorage.setItem = () => { throw new Error("QuotaExceeded"); };
eq("kan ikke gemme: ok=false så brugeren kan advares", D.gemKladde({ id: "z", storeId: S, userId: U, state: {}, step: 0 }).ok, false);
globalThis.localStorage.setItem = orig;

// --- abonnement
let kald = 0;
const af = D.subscribeKladder(() => { kald++; });
const efterAbon = kald;
D.gemKladde({ id: "s", storeId: S, userId: U, state: {}, step: 0 });
D.fjernKladde("s");
eq("lytter får besked ved gem og fjern", kald - efterAbon, 2);
af();
D.gemKladde({ id: "s2", storeId: S, userId: U, state: {}, step: 0 });
eq("afmeldt lytter får ikke besked", kald - efterAbon, 2);

// --- tekster
eq("etiket: navn + adresse", D.kladdeEtiket({ state: { customerName: " Karen ", address: "Skovvej 1", phone: "5" } }), { navn: "Karen", linje2: "Skovvej 1" });
eq("etiket: uden navn", D.kladdeEtiket({ state: { phone: "51234567" } }), { navn: "Uden navn", linje2: "51234567" });
const nu = Date.parse("2026-10-04T12:00:00Z");
eq("tid: lige nu", D.tidTekst("2026-10-04T11:59:40Z", nu), "lige nu");
eq("tid: minutter", D.tidTekst("2026-10-04T11:45:00Z", nu), "for 15 min. siden");
eq("tid: ulæselig", D.tidTekst("xx", nu), "");

// --- genoptag fra Forsiden (kortvarig besked til bookingsiden)
eq("intet bedt om: ingen genoptagelse", D.hentGenoptagelse(), null);
eq("bed om en kladde: ok", D.bedOmGenoptagelse("k-123"), true);
eq("bookingsiden får id'et", D.hentGenoptagelse(), "k-123");
eq("det læses kun ÉN gang (så en genindlæsning ikke genoptager igen)", D.hentGenoptagelse(), null);
D.bedOmGenoptagelse("a"); D.bedOmGenoptagelse("b");
eq("seneste ønske vinder", D.hentGenoptagelse(), "b");
eq("beskeden gemmes IKKE sammen med kladderne", [...lager.keys()].some((k) => k.includes("genoptag")), false);
const ægte = globalThis.sessionStorage;
globalThis.sessionStorage = { getItem() { throw new Error("blokeret"); }, setItem() { throw new Error("blokeret"); }, removeItem() { throw new Error("blokeret"); } };
eq("browser uden sessionStorage: ok=false, intet crash", D.bedOmGenoptagelse("x"), false);
eq("browser uden sessionStorage: ingen genoptagelse, intet crash", D.hentGenoptagelse(), null);
globalThis.sessionStorage = ægte;

console.log(`\n${pass} bestået, ${fail} fejlet`);
process.exit(fail ? 1 : 0);
