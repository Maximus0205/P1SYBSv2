// Regressionstest til selvhelbredelsen i index.html (scriptet, der fjerner offline-skallen, hvis appen ikke kommer op).
// Kør med:  node tests/selvhelbredelse.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";

let pass = 0, fail = 0;
const eq = (n, g, w) => { if (JSON.stringify(g) === JSON.stringify(w)) pass++; else { fail++; console.log("FAIL:", n, "\n  got: ", JSON.stringify(g), "\n  want:", JSON.stringify(w)); } };

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const kilde = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
eq("scriptet findes", kilde.includes("__p1Helbred"), true);

function kor({ skal = true, online = true, gemt = null, nu = 1_000_000_000, cacheNavne = ["p1sybs-skal-abc", "anden-cache"], lagerFejler = false } = {}) {
  const log = { unregister: 0, slettet: [], reload: 0, timere: [] };
  const lager = new Map(gemt ? [["p1sybs-helbredt", JSON.stringify(gemt)]] : []);
  const win = {
    navigator: {
      onLine: online,
      serviceWorker: { controller: skal ? {} : null, getRegistration: async () => ({ unregister: async () => { log.unregister++; } }) },
    },
    localStorage: { getItem: (k) => (lagerFejler ? (() => { throw new Error("blokeret"); })() : lager.get(k) ?? null), setItem: (k, v) => { if (lagerFejler) throw new Error("blokeret"); lager.set(k, v); } },
    caches: { keys: async () => cacheNavne, delete: async (n) => { log.slettet.push(n); return true; } },
    location: { reload: () => { log.reload++; } },
    setTimeout: (fn, ms) => { log.timere.push([fn, ms]); },
    Date: { now: () => nu },
  };
  win.window = win;
  vm.runInNewContext(kilde, { ...win, Promise, Number, JSON, String });
  return { win, log, lager };
}
const vent = () => new Promise((r) => setTimeout(r, 5));

{ const { win, log, lager } = kor();
  eq("helbredelse sat i gang", win.__p1Helbred("test"), true);
  await vent();
  eq("skal fjernet, kun vores cache slettet, genindlæst", [log.unregister, log.slettet, log.reload], [1, ["p1sybs-skal-abc"], 1]);
  eq("tidspunkt og grund gemt", [JSON.parse(lager.get("p1sybs-helbredt")).grund], ["test"]);
}
{ const { win, log } = kor({ online: false });
  eq("offline: gør intet (den gemte kopi er det eneste, der kan åbne appen)", [win.__p1Helbred("x"), log.reload], [false, 0]);
}
{ const { win, log } = kor({ skal: false });
  eq("ingen skal styrer siden: gør intet", [win.__p1Helbred("x"), log.reload], [false, 0]);
}
{ const { win, log } = kor({ gemt: { tid: 1_000_000_000 - 60_000 }, nu: 1_000_000_000 });
  eq("højst hvert 10. minut: ingen løkke", [win.__p1Helbred("x"), log.reload], [false, 0]);
}
{ const { win, log } = kor({ gemt: { tid: 1_000_000_000 - 11 * 60_000 }, nu: 1_000_000_000 });
  eq("efter 10 minutter må den igen", win.__p1Helbred("x"), true); await vent(); eq("og genindlæser", log.reload, 1);
}
{ const { win, log } = kor({ lagerFejler: true });
  eq("blokeret localStorage vælter ikke", win.__p1Helbred("x"), true); await vent(); eq("genindlæser stadig", log.reload, 1);
}
{ const { win, log } = kor();
  const [fn, ms] = log.timere[0];
  eq("vagt: 20 sekunder", ms, 20000);
  fn(); await vent();
  eq("appen kom ikke op: helbredes", log.reload, 1);
  const b = kor(); b.win.__p1Startet = true; b.log.timere[0][0](); await vent();
  eq("appen kom op: vagten gør intet", b.log.reload, 0);
}
{ const { win, log } = kor({ cacheNavne: [] });
  win.__p1Helbred("x"); await vent(); eq("ingen caches: stadig genindlæst", log.reload, 1);
}
console.log(`selvhelbredelse: ${pass} ok, ${fail} fejl`); if (fail) process.exit(1);
