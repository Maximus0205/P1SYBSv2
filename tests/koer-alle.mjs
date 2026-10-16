// Kører alle enhedstests (tests/*.test.mjs) hver for sig og samler resultatet. Brug: npm test
// En fejlet test stopper ikke de næste, og på GitHub vises hver fejl som en annotering med filnavn og de første linjer.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const mappe = dirname(fileURLToPath(import.meta.url));
const filer = readdirSync(mappe).filter((f) => f.endsWith(".test.mjs")).sort();
let fejlede = 0;

for (const fil of filer) {
  const r = spawnSync(process.execPath, ["--import", join(mappe, "_extensionslos.mjs"), join(mappe, fil)], { encoding: "utf8" });
  const ud = `${r.stdout || ""}${r.stderr || ""}`;
  if (r.status === 0) { console.log(`  ok    ${fil}  ${ud.trim().split("\n").pop().slice(0, 80)}`); continue; }
  fejlede++;
  console.log(`  FEJL  ${fil}\n${ud.trim().split("\n").slice(0, 12).map((l) => "        " + l).join("\n")}`);
  if (process.env.GITHUB_ACTIONS) {
    const besked = ud.trim().split("\n").slice(0, 6).join(" ").replace(/[\r%]/g, " ").slice(0, 500);
    console.log(`::error title=Enhedstest fejlede: ${fil}::${besked}`);
  }
}
console.log(`\n${filer.length - fejlede} af ${filer.length} testfiler bestod`);
process.exit(fejlede ? 1 : 0);
