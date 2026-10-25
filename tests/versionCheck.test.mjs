// Regressionstest til reglen for "ny udgave" (src/lib/versionCheckCore.js).
// Kør med:  node tests/versionCheck.test.mjs
import { erNyUdgave } from "../src/lib/versionCheckCore.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  if (got === want) pass++; else { fail++; console.log("FAIL:", name, "got:", got, "want:", want); }
};

eq("samme udgave: ingen besked", erNyUdgave("abc", "abc"), false);
eq("ny udgave på serveren: besked", erNyUdgave("abc", "def"), true);
// Det oprindelige hul: den kørende kode kender sin egen udgave, selv om
// index.html er gammel - så SKAL en nyere version.json give besked.
eq("gammel cachet side, ny version.json: besked", erNyUdgave("gammel-sha", "ny-sha"), true);
eq("lokal udvikling (ingen indbygget id): ingen besked", erNyUdgave("", "def"), false);
eq("ingen indbygget id (null): ingen besked", erNyUdgave(null, "def"), false);
eq("version.json ikke hentet: ingen besked", erNyUdgave("abc", null), false);
eq("version.json tom: ingen besked", erNyUdgave("abc", ""), false);
eq("ikke-tekst: ingen besked", erNyUdgave(123, 456), false);

console.log(`versionCheck: ${pass} ok, ${fail} fejl`);
if (fail) process.exit(1);
