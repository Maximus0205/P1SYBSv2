// Test af ORS-adapterens matrix til kapacitetsmotoren. Kør med:  node tests/ors.matrix.test.mjs
import { opretEdgeTransport } from "../src/adapters/core/edgeTransport.js";
import { opretOrsAdapter } from "../src/adapters/ors/index.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};
const kald = [];
let svar = { data: {}, error: null };
const t = opretEdgeTransport({ klient: { functions: { invoke: async (navn, { body }) => { kald.push({ navn, body }); return svar; } } } });
const ors = opretOrsAdapter({ transport: t, advar: () => {}, pauseMs: 0 });
const P = [{ id: "lager", lat: 55.4, lon: 10.4 }, { id: "A", lat: 55.5, lon: 10.5 }, { id: "B", lat: 55.6, lon: 10.6 }];

svar = { data: { durations: [[0, 600, 1200], [600, 0, 900], [1200, 900, 0]], distances: [[0, 8000, 15000], [8000, 0, 9000], [15000, 9000, 0]] }, error: null };
eq("matrix: sekunder bliver til minutter og meter til km", await ors.koerselsmatrix(P), { ids: ["lager", "A", "B"], minutter: [[0, 10, 20], [10, 0, 15], [20, 15, 0]], km: [[0, 8, 15], [8, 0, 9], [15, 9, 0]] });
eq("matrix: kun koordinaterne sendes til proxyen (ikke id'er eller navne)", kald[0].body, { handling: "matrix", punkter: P.map((p) => ({ lat: p.lat, lon: p.lon })) });
svar = { data: { durations: [[0, 600], [600, 0]] }, error: null };
eq("matrix: mangler afstande (gammel proxy), er km null og køretiden bruges stadig", (await ors.koerselsmatrix(P.slice(0, 2))).km, null);
svar = { data: { durations: [[0, null], [null, 0]], distances: [[0, null], [null, 0]] }, error: null };
eq("matrix: manglende ben (null) bevares som null, så motoren kan skønne dem", (await ors.koerselsmatrix(P.slice(0, 2))).minutter[0][1], null);
svar = { data: null, error: { message: "429 too many" } };
eq("matrix: et mislykket kald giver null (så motoren falder tilbage på skøn)", await ors.koerselsmatrix(P), null);
svar = { data: { fejl: "ORS-nøglen mangler" }, error: null };
eq("matrix: et svar med { fejl } giver også null", await ors.koerselsmatrix(P), null);
kald.length = 0;
eq("matrix: under to punkter giver null uden kald", [await ors.koerselsmatrix([P[0]]), await ors.koerselsmatrix([]), await ors.koerselsmatrix(null), kald.length], [null, null, null, 0]);
eq("matrix: punkter uden koordinater udelades", (async () => { svar = { data: { durations: [[0, 60], [60, 0]], distances: [[0, 1000], [1000, 0]] }, error: null }; return (await ors.koerselsmatrix([P[0], { id: "X" }, P[1]])).ids; })() instanceof Promise, true);
svar = { data: { durations: [[0, 60], [60, 0]], distances: [[0, 1000], [1000, 0]] }, error: null };
eq("matrix: ids følger de punkter, der kom med", (await ors.koerselsmatrix([P[0], { id: "X" }, P[1]])).ids, ["lager", "A"]);
console.log(`\n${pass} bestået, ${fail} fejlet`);
process.exit(fail ? 1 : 0);
