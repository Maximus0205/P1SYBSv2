// Regressionstest til bekræftelsesflowet ved sletning af en bruger (src/lib/sletBruger.js).
// Kør med:  node tests/sletBruger.test.mjs
import { bekraeftelsesTekst, sletBruger } from "../src/lib/sletBruger.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

// ---- teksten
eq("grundtekst", bekraeftelsesTekst({ navn: "Karen" }), "Slet Karen permanent?\n\nLoginet og profilen slettes og kan ikke gendannes.");
eq("uden navn", bekraeftelsesTekst({}).split("\n")[0], "Slet brugeren permanent?");
eq("ingen konsekvenser (ukendt) giver stadig en tekst", [bekraeftelsesTekst().split("\n")[0], bekraeftelsesTekst(null === undefined ? {} : undefined).length > 0], ["Slet brugeren permanent?", true]);
eq("ét fravær (ental)", bekraeftelsesTekst({ navn: "K", fravaersperioder: 1 }).includes("· 1 registreret fravær/sygemelding slettes med."), true);
eq("flere fravær (flertal)", bekraeftelsesTekst({ navn: "K", fravaersperioder: 3 }).includes("· 3 registrerede fravær/sygemeldinger slettes med."), true);
eq("én kommende sag (ental)", bekraeftelsesTekst({ navn: "K", kommendeSager: 1 }).includes("1 kommende sag er tildelt personen. Den slettes IKKE"), true);
eq("flere kommende sager (flertal)", bekraeftelsesTekst({ navn: "K", kommendeSager: 12 }).includes("12 kommende sager er tildelt personen. De slettes IKKE"), true);
eq("henviser til den omdøbte flise i Planlægning (ikke det gamle 'Montørproblem')", [bekraeftelsesTekst({ kommendeSager: 2 }).includes('"Sygemelding / feriefridag"'), bekraeftelsesTekst({ kommendeSager: 2 }).includes("Montørproblem")], [true, false]);
eq("0 fravær og 0 sager nævnes ikke", bekraeftelsesTekst({ navn: "K", fravaersperioder: 0, kommendeSager: 0 }).split("\n").length, 3);

// ---- flowet
const lav = (opts = {}) => {
  const kald = [], alerts = [], spoergsmaal = [];
  return {
    kald, alerts, spoergsmaal,
    valg: {
      slet: async (id, o) => { kald.push([id, o]); return o?.tjekKun ? (opts.tjek ?? { ok: true, konsekvenser: { navn: "Karen", fravaersperioder: 1, kommendeSager: 2 } }) : (opts.slet ?? { ok: true }); },
      bekraeft: (t) => { spoergsmaal.push(t); return opts.svar ?? true; },
      advar: (t) => { alerts.push(t); },
    },
  };
};
let m = lav();
eq("bekræftet: tjek først, derefter den rigtige sletning", [await sletBruger("u1", m.valg), m.kald], [{ ok: true }, [["u1", { tjekKun: true }], ["u1", undefined]]]);
eq("bekræftelsen viser konsekvenserne", [m.spoergsmaal.length, m.spoergsmaal[0].includes("Slet Karen permanent?"), m.spoergsmaal[0].includes("1 registreret"), m.spoergsmaal[0].includes("2 kommende sager")], [1, true, true, true]);
eq("ingen advarsel, når det går godt", m.alerts, []);

m = lav({ svar: false });
eq("annulleret: der slettes IKKE", [await sletBruger("u1", m.valg), m.kald.length, m.kald[0][1]], [{ ok: false, annulleret: true }, 1, { tjekKun: true }]);
eq("annulleret: ingen fejlbesked (det var et valg)", m.alerts, []);

m = lav({ tjek: { ok: false, fejl: "Det er butikkens eneste administrator. Gør en anden til administrator først." } });
eq("spærret af serveren (sidste admin): fejlen vises, intet spørges, intet slettes", [await sletBruger("u1", m.valg), m.alerts, m.spoergsmaal.length, m.kald.length], [{ ok: false, fejl: "Det er butikkens eneste administrator. Gør en anden til administrator først." }, ["Det er butikkens eneste administrator. Gør en anden til administrator først."], 0, 1]);
m = lav({ tjek: { ok: false, fejl: "Du kan ikke slette din egen bruger. Bed en anden administrator om at gøre det." } });
await sletBruger("u1", m.valg);
eq("spærret af serveren (sig selv): fejlen vises", m.alerts[0].includes("din egen bruger"), true);
m = lav({ tjek: { ok: false } });
eq("fejl uden tekst giver en standardbesked", [(await sletBruger("u1", m.valg), m.alerts[0])], ["Kunne ikke slette brugeren."]);

m = lav({ slet: { ok: false, fejl: "Brugeren findes ikke" } });
eq("selve sletningen fejler: fejlen vises, og resultatet er ikke ok", [await sletBruger("u1", m.valg), m.alerts], [{ ok: false, fejl: "Brugeren findes ikke" }, ["Brugeren findes ikke"]]);
m = lav({ slet: { ok: false } });
await sletBruger("u1", m.valg);
eq("selve sletningen fejler uden tekst: standardbesked", m.alerts, ["Kunne ikke slette brugeren."]);

m = lav({ tjek: { ok: true } });
eq("manglende konsekvenser (ældre server) giver stadig et gyldigt spørgsmål", [(await sletBruger("u1", m.valg)).ok, m.spoergsmaal[0].split("\n")[0]], [true, "Slet brugeren permanent?"]);
m = lav();
eq("id'et sendes uændret videre begge gange", (await sletBruger("bruger-42", m.valg), m.kald.map((k) => k[0])), ["bruger-42", "bruger-42"]);

console.log(`\n${pass} bestået, ${fail} fejlet`);
process.exit(fail ? 1 : 0);
