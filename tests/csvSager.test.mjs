// Regressionstest til CSV-skabelonen og -importens hjælpere (src/lib/csvSager.js).
// Kør med:  node tests/csvSager.test.mjs
import { ALIAS, SKABELON_KOLONNER, TIDSRUM_VAERDIER, EKSEMPEL_KUNDE, norm, pick, matchBil, erEksempelraekke, danskDato, naesteHverdag, csvCelle, skabelonCsv } from "../src/lib/csvSager.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

// Lille RFC4180-læser med semikolon, kun til at læse skabelonen tilbage.
function laes(tekst) {
  const t = tekst.replace(/^\uFEFF/, "");
  const raekker = []; let r = [], c = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === ";") { r.push(c); c = ""; }
    else if (ch === "\r") { /* ignorer */ }
    else if (ch === "\n") { r.push(c); raekker.push(r); r = []; c = ""; }
    else c += ch;
  }
  if (c !== "" || r.length) { r.push(c); raekker.push(r); }
  return raekker;
}

// --- skabelonen
const nu = new Date(2026, 9, 2); // fredag 2. oktober 2026
const tekst = skabelonCsv({ varetyper: ["Vaskemaskine", "Tørretumbler"], biler: ["Bil 1"], nu });
const [hoved, ex, ...rest] = laes(tekst);
eq("starter med BOM (så Excel læser æ/ø/å rigtigt)", tekst.charCodeAt(0), 0xFEFF);
eq("semikolon som skilletegn", tekst.split("\r\n")[0].includes(";") && !tekst.split("\r\n")[0].includes(","), true);
eq("overskrifter", hoved, ["Sagsnr", "Kunde", "Telefon", "Email", "Adresse", "Leveringsnote", "Køber", "Nøgle", "Nøgletype", "Nøgleplacering", "Dato", "Tidsrum", "Montør", "Varetype", "Ydelser"]);
eq("én eksempelrække og intet mere", [rest.length, ex.length], [0, hoved.length]);
const post = Object.fromEntries(hoved.map((h, i) => [h, ex[i]]));
eq("eksempelrækken er markeret til sletning", post.Kunde, EKSEMPEL_KUNDE);
eq("eksemplets dato er næste hverdag efter fredag = mandag 5.10.2026", post.Dato, "5.10.2026");
eq("eksemplets tidsrum er et gyldigt tidsrum", TIDSRUM_VAERDIER.includes(post.Tidsrum), true);
eq("eksemplet bruger butikkens første varetype og bil", [post.Varetype, post["Montør"]], ["Vaskemaskine", "Bil 1"]);
eq("eksemplets nøgle er 'Nej' (importen læser Ja/true/1 som ja)", /ja|true|1/i.test(post["Nøgle"]), false);
eq("filen ender med linjeskift", tekst.endsWith("\r\n"), true);
const tom = laes(skabelonCsv({ nu }))[1];
eq("uden varetyper og biler står cellerne tomme (ingen 'undefined')", [tom[12], tom[13]], ["", ""]);
eq("ingen 'undefined' eller 'null' i filen", /undefined|null/.test(skabelonCsv({ nu })), false);

// --- hver kolonne i skabelonen genkendes af importen
for (const [navn, nøgle] of SKABELON_KOLONNER) {
  eq(`skabelonens kolonne "${navn}" genkendes af importen (${nøgle})`, ALIAS[nøgle]?.includes(norm(navn)), true);
}
eq("ingen to kolonner i skabelonen peger på samme felt", new Set(SKABELON_KOLONNER.map((k) => k[1])).size, SKABELON_KOLONNER.length);
// pick læser skabelonens række præcis som importen vil
eq("pick finder kunde/dato/montør i den indlæste skabelon", [pick(post, ALIAS.kunde), pick(post, ALIAS.dato), pick(post, ALIAS.bil)], [EKSEMPEL_KUNDE, "5.10.2026", "Bil 1"]);
eq("pick er ligeglad med store/små bogstaver og ae/oe", [pick({ KUNDE: "A" }, ALIAS.kunde), pick({ Noegle: "Ja" }, ALIAS.noegle), pick({ "E-MAIL": "x" }, ALIAS.email)], ["A", "Ja", "x"]);

// --- eksempelrækken springes over
eq("eksempelrækken genkendes", erEksempelraekke(EKSEMPEL_KUNDE), true);
eq("også med små bogstaver og mellemrum", erEksempelraekke("  eksempel (slet rækken)  "), true);
eq("en rigtig kunde, der hedder noget med 'eksempel', rammes ikke", [erEksempelraekke("Eksempelvej Aps"), erEksempelraekke("Eksempel Hansen"), erEksempelraekke(""), erEksempelraekke(null)], [false, false, false, false]);

// --- biler
const biler = [{ navn: "Bil 1", bil: "AB 12 345" }, { navn: "Bil 2", bil: "CD 67 890" }];
eq("match på navn", matchBil(biler, "bil 2")?.navn, "Bil 2");
eq("match på nummerplade", matchBil(biler, "cd 67")?.navn, "Bil 2");
eq("TOM celle giver ingen bil (før gav den første bil til alle)", [matchBil(biler, ""), matchBil(biler, "   "), matchBil(biler, null)], [null, null, null]);
eq("ukendt bil giver ingen", matchBil(biler, "Bil 9"), null);

// --- celler og datoer
eq("celle uden specialtegn står som den er", csvCelle("Bil 1"), "Bil 1");
eq("semikolon sættes i citationstegn", csvCelle("a;b"), '"a;b"');
eq("citationstegn fordobles", csvCelle('Han sagde "hej"'), '"Han sagde ""hej"""');
eq("linjeskift sættes i citationstegn", csvCelle("a\nb"), '"a\nb"');
eq("mellemrum i enderne bevares", csvCelle(" a "), '" a "');
eq("tal og tom værdi", [csvCelle(5), csvCelle(null), csvCelle(undefined)], ["5", "", ""]);
eq("dansk dato", danskDato(new Date(2026, 0, 5)), "5.1.2026");
eq("næste hverdag fra torsdag er fredag", danskDato(naesteHverdag(new Date(2026, 9, 1))), "2.10.2026");
eq("næste hverdag fra fredag er mandag", danskDato(naesteHverdag(new Date(2026, 9, 2))), "5.10.2026");
eq("næste hverdag fra lørdag er mandag", danskDato(naesteHverdag(new Date(2026, 9, 3))), "5.10.2026");
eq("næste hverdag fra søndag er mandag", danskDato(naesteHverdag(new Date(2026, 9, 4))), "5.10.2026");
eq("næste hverdag over årsskifte", danskDato(naesteHverdag(new Date(2026, 11, 31))), "1.1.2027");
eq("importen læser skabelonens datoformat (d.m.åååå)", /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/.test(post.Dato), true);

console.log(`\n${pass} bestået, ${fail} fejlet`);
process.exit(fail ? 1 : 0);
