// Kør med:  node tests/rundvisning.test.mjs
import { GUIDES, guidesForBruger, laesSet, markerSet, skalStarteAutomatisk, naesteIndex, forrigeIndex, erSidsteTrin, placerKort, grupperGuides, guideForSide, tilbudForSide } from "../src/lib/rundvisningCore.js";

let pass = 0, fail = 0;
const eq = (n, g, w) => { if (JSON.stringify(g) === JSON.stringify(w)) pass++; else { fail++; console.log("FAIL:", n, "\n  got: ", JSON.stringify(g), "\n  want:", JSON.stringify(w)); } };
const lager = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

// --- guides pr. bruger
const saelger = { rolle: "saelger", tilladteSider: ["dashboard", "planlaegning", "lager", "arkiv"], kanOpretteSager: true };
eq("sælger: guides til de sider sælgeren har", guidesForBruger(saelger).map((g) => g.id), ["kom-i-gang", "forside", "opret-sag", "planlaegning", "lager"]);
eq("sælger får ikke montør-guiden", guidesForBruger(saelger).some((g) => g.id === "montor"), false);
const montoer = { rolle: "montor", tilladteSider: ["montor"], kanOpretteSager: false };
eq("montør: kun sin egen guide, og den starter af sig selv", guidesForBruger(montoer).map((g) => [g.id, g.automatisk]), [["montor", true]]);
eq("medhjælper: samme guide som montør", guidesForBruger({ ...montoer, rolle: "medhjaelper" }).map((g) => g.id), ["montor"]);
eq("montør ser ikke kom-i-gang, selv med flere sider", guidesForBruger({ ...montoer, tilladteSider: ["montor", "lager", "dashboard"] }).map((g) => g.id), ["forside", "lager", "montor"]);
eq("uden ret til at oprette: ingen opret-guide", guidesForBruger({ ...saelger, kanOpretteSager: false }).map((g) => g.id).includes("opret-sag"), false);
eq("uden adgang til en side: ingen guide for den", guidesForBruger({ ...saelger, tilladteSider: ["dashboard"] }).map((g) => g.id), ["kom-i-gang", "forside", "opret-sag"]);
eq("admin får Opsætning og Viden når de har adgang", guidesForBruger({ rolle: "admin", tilladteSider: ["dashboard", "admin", "adresser"], kanOpretteSager: true }).map((g) => g.id), ["kom-i-gang", "forside", "opret-sag", "viden", "admin"]);
eq("velkomsten er tilpasset rollen", ["admin", "saelger", "lager"].map((r) => guidesForBruger({ ...saelger, rolle: r })[0].trin[0].tekst.slice(0, 7)), ["Som adm", "Som sæl", "Som lag"]);
eq("ukendt rolle får standardteksten", guidesForBruger({ ...saelger, rolle: "andet" })[0].trin[0].tekst.slice(0, 7), "Her er ");
const lagerBruger = { rolle: "lager", tilladteSider: ["dashboard", "lager"], kanOpretteSager: false };
eq("lager: kun sider de har adgang til", guidesForBruger(lagerBruger)[0].trin.map((t) => t.id), ["velkommen", "menu", "forside", "lager", "klokke", "konto", "hjaelp"]);
eq("lager: guides", guidesForBruger(lagerBruger).map((g) => g.id), ["kom-i-gang", "forside", "lager"]);
eq("sælger: planlægning og arkiv med", guidesForBruger(saelger)[0].trin.map((t) => t.id).filter((x) => ["planlaegning", "arkiv", "lager"].includes(x)), ["planlaegning", "lager", "arkiv"]);
eq("systemadmin, selv med montørrolle, ser dem", guidesForBruger({ rolle: "montor", erSystemadmin: true, tilladteSider: ["dashboard"], kanOpretteSager: true }).map((g) => g.id), ["kom-i-gang", "forside", "opret-sag"]);
eq("systemadmin med montør-side: montør-guiden findes, men starter ikke af sig selv", guidesForBruger({ rolle: "admin", erSystemadmin: true, tilladteSider: ["montor"] }).filter((g) => g.id === "montor").map((g) => g.automatisk), [false]);
eq("alle trin har titel og tekst", GUIDES.every((g) => g.trin.every((t) => t.titel && t.tekst && t.id)), true);
eq("trin-id'er er unikke pr. guide", GUIDES.every((g) => new Set(g.trin.map((t) => t.id)).size === g.trin.length), true);
// Aftale mellem rundturene og skærmbillederne: hvert maal findes som data-rundvisning i koden (ellers peger rundturen i luften).
import { readFileSync } from "node:fs";
const kode = ["src/components/TopNav.jsx", "src/components/NewOrderForm.jsx", "src/pages/SalesPage.jsx", "src/components/Rundvisning.jsx", "src/pages/DashboardPage.jsx", "src/pages/PlanningPage.jsx", "src/pages/WarehousePage.jsx", "src/pages/AddressesPage.jsx", "src/pages/AdminPage.jsx", "src/pages/TechnicianPage.jsx"].map((f) => readFileSync(new URL("../" + f, import.meta.url), "utf8")).join("\n");
const manglerMaal = GUIDES.flatMap((g) => g.trin).flatMap((t) => [t.maal, t.fortsaetNaar]).filter(Boolean)
  .filter((m) => !(new RegExp(`rundvisning=\\{?[^\\n]*"${m}"`).test(kode) || (m.startsWith("fane-") && kode.includes("data-rundvisning={`fane-${"))));
eq("alle maal og fortsaetNaar findes i koden", manglerMaal, []);
eq("fane-maal svarer til rigtige sider", GUIDES.flatMap((g) => g.trin).filter((t) => t.maal?.startsWith("fane-")).every((t) => t.maal === `fane-${t.kraeverSide}`), true);

// --- set / ikke set
{ const l = lager();
  eq("intet set", laesSet(l, "u1"), {});
  eq("auto-start første gang", skalStarteAutomatisk(guidesForBruger(saelger), laesSet(l, "u1"))?.id, "kom-i-gang");
  eq("marker ok", markerSet(l, "u1", "kom-i-gang", 123), true);
  eq("set huskes pr. bruger", [laesSet(l, "u1"), laesSet(l, "u2")], [{ "kom-i-gang": 123 }, {}]);
  eq("ikke igen efter set", skalStarteAutomatisk(guidesForBruger(saelger), laesSet(l, "u1")), null);
  eq("opret-sag starter aldrig af sig selv", skalStarteAutomatisk(guidesForBruger(saelger), {}).id, "kom-i-gang");
  markerSet(l, "u1", "opret-sag", 5);
  eq("flere guides kan være set", Object.keys(laesSet(l, "u1")).sort(), ["kom-i-gang", "opret-sag"]);
}
{ const ødelagt = { getItem: () => "{ikke json", setItem: () => {} };
  eq("ødelagt lager giver tomt", laesSet(ødelagt, "u1"), {});
  const blokeret = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
  eq("blokeret lager vælter ikke", [laesSet(blokeret, "u1"), markerSet(blokeret, "u1", "a")], [{}, false]);
  eq("forkert form giver tomt", laesSet({ getItem: () => '{"set":5}' }, "u1"), {});
}

// --- Hjælp-menu og tilbud
{ const g = guidesForBruger({ rolle: "admin", tilladteSider: ["dashboard", "planlaegning", "lager", "adresser", "admin"], kanOpretteSager: true });
  eq("grupper i fast rækkefølge", grupperGuides(g).map((x) => [x.navn, x.guides.map((y) => y.id)]), [["Start her", ["kom-i-gang"]], ["Sider", ["forside", "planlaegning", "lager", "viden", "admin"]], ["Funktioner", ["opret-sag"]]]);
  eq("guide for den aktuelle side", [guideForSide(g, "planlaegning")?.id, guideForSide(g, "salg")?.id, guideForSide(g, "arkiv"), guideForSide(g, null)], ["planlaegning", "opret-sag", null, null]);
  eq("tilbud første gang på en side", tilbudForSide(g, {}, "lager")?.id, "lager");
  eq("intet tilbud, når guiden er set", tilbudForSide(g, { lager: 1 }, "lager"), null);
  eq("intet tilbud på sider uden tilbyd (salg)", tilbudForSide(g, {}, "salg"), null);
  eq("intet tilbud på sider uden guide", tilbudForSide(g, {}, "arkiv"), null);
  eq("alle områder har en gyldig gruppe", GUIDES.every((x) => ["Start her", "Sider", "Funktioner"].includes(x.omraade)), true);
}

// --- navigation
eq("næste/forrige begrænses", [naesteIndex(0, 3), naesteIndex(2, 3), forrigeIndex(0), forrigeIndex(2), erSidsteTrin(2, 3), erSidsteTrin(1, 3)], [1, 2, 0, 1, true, false]);

// --- placering
{ const v = { b: 1280, h: 800 };
  const under = placerKort({ rect: { top: 100, left: 600, width: 80, height: 40 }, vindue: v });
  eq("pc: under elementet, centreret", [under.type, under.top, under.left], ["under", 152, 470]);
  const over = placerKort({ rect: { top: 700, left: 600, width: 80, height: 40 }, vindue: v });
  eq("pc: over elementet, når der ikke er plads under", over.type, "over");
  eq("pc: holdes inde i vinduet (kant)", placerKort({ rect: { top: 100, left: 1240, width: 30, height: 30 }, vindue: v }).left, 1280 - 340 - 12);
  eq("pc: venstre kant", placerKort({ rect: { top: 100, left: 0, width: 30, height: 30 }, vindue: v }).left, 12);
  const midt = placerKort({ rect: null, vindue: v });
  eq("pc: uden element midt på skærmen", [midt.type, midt.left, midt.top], ["midt", 470, 300]);
}
{ const m = { b: 390, h: 800 };
  const bund = placerKort({ rect: { top: 100, left: 10, width: 80, height: 40 }, vindue: m });
  eq("mobil: kort nederst i fuld bredde", [bund.type, bund.left, bund.bredde, bund.skalRulles], ["bund", 12, 366, false]);
  eq("mobil: element bag kortet skal rulles", placerKort({ rect: { top: 650, left: 10, width: 80, height: 40 }, vindue: m }).skalRulles, true);
  eq("mobil: uden element", placerKort({ rect: null, vindue: m }).skalRulles, false);
  eq("meget smal skærm", placerKort({ rect: null, vindue: { b: 320, h: 560 } }).bredde, 296);
}
console.log(`rundvisning: ${pass} ok, ${fail} fejl`); if (fail) process.exit(1);
