// Test af platformens app-register (src/platform/appRegister.ts).
// Kør med:  node tests/platform.appRegister.test.mjs
// Node 22.18+ kører .ts direkte (type-stripping), så der er intet build-trin.
import { PLATFORM_APPS, harAdgang, synligeApps, valideRegister } from "../src/platform/appRegister.ts";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};
const ids = (apps) => apps.map((a) => a.id);

const saelger = { erSystemadmin: false, tilladteSider: ["dashboard", "salg"] };
const butiksAdmin = { erSystemadmin: false, tilladteSider: ["dashboard", "salg", "admin"] };
const systemadmin = { erSystemadmin: true, tilladteSider: [] };

// --- det rigtige register
eq("registret er gyldigt", valideRegister(PLATFORM_APPS), []);
eq("servicebooking er første flise", PLATFORM_APPS[0].id, "servicebooking");
eq("servicebooking peger på den eksisterende booking", PLATFORM_APPS[0].rute, "/dashboard");
eq("lagerstyring og leverandørportal er ikke i scope", ids(PLATFORM_APPS).filter((id) => ["lagerstyring", "leverandoerportal"].includes(id)), []);

// --- hvem ser hvad
eq("sælger: ingen admin-fliser", ids(synligeApps(PLATFORM_APPS, saelger)), ["servicebooking", "sbo", "rma"]);
eq("butiksadmin: butiksadministration, ikke system", ids(synligeApps(PLATFORM_APPS, butiksAdmin)), ["servicebooking", "sbo", "rma", "butiksadministration"]);
eq("systemadmin: alt", ids(synligeApps(PLATFORM_APPS, systemadmin)), ["servicebooking", "sbo", "rma", "butiksadministration", "systemadministration"]);
eq("rækkefølgen følger registret", ids(synligeApps([...PLATFORM_APPS].reverse(), systemadmin))[0], "systemadministration");

// --- harAdgang enkeltvis
const sideApp = { id: "x", navn: "X", beskrivelse: "", ikon: "butik", type: "intern", status: "aktiv", rute: "/x", adgang: { type: "side", side: "lager" } };
eq("side-adgang: med siden", harAdgang(sideApp, { erSystemadmin: false, tilladteSider: ["lager"] }), true);
eq("side-adgang: uden siden", harAdgang(sideApp, { erSystemadmin: false, tilladteSider: ["salg"] }), false);
eq("side-adgang: systemadmin ser alt", harAdgang(sideApp, systemadmin), true);
eq("ukendt adgangstype afvises", harAdgang({ ...sideApp, adgang: { type: "noget-nyt" } }, systemadmin), false);
eq("tom liste giver tom liste", synligeApps([], systemadmin), []);

// --- validering fanger fejl
const link = (url) => ({ id: "store", navn: "Store app", beskrivelse: "", ikon: "butik", type: "link", status: "aktiv", url, sso: "ingen", adgang: { type: "alle" } });
eq("dobbelt id", valideRegister([sideApp, sideApp]), ["Dobbelt id: x"]);
eq("rute uden /", valideRegister([{ ...sideApp, rute: "x" }]), ["x: rute skal starte med /"]);
eq("tomt navn", valideRegister([{ ...sideApp, navn: "  " }]), ["x: mangler navn"]);
eq("ekstern app over http afvises", valideRegister([link("http://eksempel.dk")]), ["store: ekstern app skal have en https-adresse"]);
eq("ekstern app over https er ok", valideRegister([link("https://eksempel.dk")]), []);
eq("javascript:-adresse afvises", valideRegister([link("javascript:alert(1)")]), ["store: ekstern app skal have en https-adresse"]);

console.log(`\n${pass} bestået, ${fail} fejlet`);
process.exit(fail ? 1 : 0);
