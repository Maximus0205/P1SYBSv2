// Regressionstest til butikkens varedatabase (src/lib/butikVarer.js): normalisering, præcist match, "mente du"-forslag og CSV-import.
// Kør med:  node tests/butikVarer.test.mjs
import { normaliserModel, findButikVare, lignendeButikVarer, afstand, raekkerTilVarer, vareFejl } from "../src/lib/butikVarer.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

const varer = [
  { id: "1", brand: "Gram", model: "KS 3135-3" },
  { id: "2", brand: "Gram", model: "KF 6325-3" },
  { id: "3", brand: "Silverline", model: "ECO 600" },
  { id: "4", brand: "Silverline", model: "ECO 900" },
  { id: "5", brand: "Silverline", model: "VIRGO 90" },
];

// --- normalisering
eq("store bogstaver, kun A-Z og 0-9", normaliserModel("ks 3135-3"), "KS31353");
eq("æøå og tegn fjernes", normaliserModel("Æb/ø 12"), "B12");
eq("null og undefined giver tom streng", [normaliserModel(null), normaliserModel(undefined)], ["", ""]);

// --- præcist match
eq("præcist match uanset skrivemåde", findButikVare(varer, "ks3135 3")?.id, "1");
eq("små bogstaver og mellemrum", findButikVare(varer, "eco600")?.id, "3");
eq("intet match giver null", findButikVare(varer, "XYZ999"), null);
eq("for kort et søgeord giver null", findButikVare(varer, "EC"), null);
eq("tom liste og null-liste giver null", [findButikVare([], "ECO600"), findButikVare(null, "ECO600")], [null, null]);

// --- afstand
eq("ens tekst: 0", afstand("ECO600", "ECO600"), 0);
eq("én forkert tast: 1", afstand("ECO600", "ECO700"), 1);
eq("ombyttede nabotegn: 1", afstand("ECO600", "ECO060"), 1);
eq("tomme tekster", [afstand("", "ABC"), afstand("ABC", "")], [3, 3]);

// --- forslag ("mente du")
eq("tastefejl i modelnummeret giver forslag", lignendeButikVarer(varer, "ECO 700").map((v) => v.id), ["3", "4"]);
eq("ombyttede tegn giver forslag", lignendeButikVarer(varer, "ECO 060").map((v) => v.id).includes("3"), true);
eq("påbegyndt modelnummer giver forslag", lignendeButikVarer(varer, "ECO").map((v) => v.id), ["3", "4"]);
eq("præcist match er ikke et forslag", lignendeButikVarer(varer, "ECO600").map((v) => v.id).includes("3"), false);
eq("noget helt andet giver ingen forslag", lignendeButikVarer(varer, "ABCDEFG"), []);
eq("for kort et søgeord giver ingen forslag", lignendeButikVarer(varer, "EC"), []);
eq("højst 3 forslag som standard", lignendeButikVarer([...varer, { id: "6", brand: "Silverline", model: "ECO 800" }, { id: "7", brand: "Silverline", model: "ECO 500" }], "ECO 700").length, 3);
eq("korte modelnumre tåler kun én fejl", lignendeButikVarer([{ id: "9", brand: "Gram", model: "KS 3135-3" }], "KS 3153-9").length, 0);
eq("lange modelnumre tåler to fejl", lignendeButikVarer([{ id: "9", brand: "Gram", model: "KS 3135-30" }], "KS 3153-31").length, 1);

// --- CSV
eq("med overskrift", raekkerTilVarer([["Mærke", "Modelnummer"], ["Gram", "KS 3135-3"], ["Silverline", "ECO 600"]]).varer, [{ brand: "Gram", model: "KS 3135-3" }, { brand: "Silverline", model: "ECO 600" }]);
eq("overskrift i anden rækkefølge", raekkerTilVarer([["model", "brand"], ["ECO 600", "Silverline"]]).varer, [{ brand: "Silverline", model: "ECO 600" }]);
eq("uden overskrift: kolonne 1 er mærke, kolonne 2 model", raekkerTilVarer([["Gram", "KS 3135-3"]]).varer, [{ brand: "Gram", model: "KS 3135-3" }]);
eq("tomme rækker springes over", raekkerTilVarer([["Gram", "KS 3135-3"], ["", ""], []]).varer.length, 1);
eq("dubletter tælles og beholdes kun én gang", (({ varer: v, dubletter }) => [v.length, dubletter])(raekkerTilVarer([["Gram", "KS 3135-3"], ["Gram", "ks3135 3"]])), [1, 1]);
eq("mangler model afvises med linjenummer", raekkerTilVarer([["Mærke", "Model"], ["Gram", ""]]).afvist, [{ linje: 2, aarsag: "Mærke eller model mangler" }]);
eq("for kort model afvises", raekkerTilVarer([["Gram", "K1"]]).afvist.length, 1);
eq("for lang tekst afvises", raekkerTilVarer([["Gram", "X".repeat(81)]]).afvist.length, 1);
eq("overskrift med kun én kendt kolonne afvises", raekkerTilVarer([["Mærke", "Pris"], ["Gram", "100"]]).afvist.length, 1);
eq("tom fil giver intet", raekkerTilVarer([]), { varer: [], afvist: [], dubletter: 0 });

// --- validering af én vare
eq("gyldig vare", vareFejl({ brand: "Gram", model: "KS 3135-3" }), null);
eq("mangler mærke", vareFejl({ brand: " ", model: "KS 3135-3" }), "Skriv mærket");
eq("mangler model", vareFejl({ brand: "Gram", model: "" }), "Skriv modelnummeret");
eq("for kort model", vareFejl({ brand: "Gram", model: "K-1" }) !== null, true);

console.log(`\n${pass} bestået, ${fail} fejlet`);
process.exit(fail ? 1 : 0);
