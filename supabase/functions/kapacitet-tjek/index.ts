// Edge Function: kapacitet-tjek (oktober 2026). Digital disponent ved booking: kan denne bestilling lægges på bilen den dag?
//
// Henter produkternes BRUTTOMAAL og -vaegt LIVE fra punkt1 i samme kald som beregningen, bruger dem kun i hukommelsen og GEMMER DEM ALDRIG
// (ingen tabel, ingen cache, ingen logning af maal). Svaret til browseren indeholder aldrig maal eller vaegt (se renseSvar i tjek.js).
//
// Sikkerhed: kun indloggede brugere (verify_jwt). Al data laeses med BRUGERENS eget token, saa RLS gaelder; alle forespoergsler er desuden
// afgraenset til brugerens egen butik. Regler laeses fra butikken (samme for alle i butikken); retten til at overrule kommer fra
// rettigheden "overstyr_kapacitet" (eller systemadmin). Funktionen aendrer intet i databasen.

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  validerForespoergsel, validerForslag, punkt1BruttoFraSvar, ordrerTilStop, punkt1Ider, bygPersoner, koerTjek, matrixPunkter, ruteMatrixFraOrs,
  iDagKbh, startDato, kandidatDatoer, harHaardtBrud, forslagFraSvar, rangerForslag,
} from "./tjek.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const svar = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function hentBrutto(id: string) {
  try {
    const res = await fetch(`https://www.punkt1.dk/api/v2/products/comparisonProducts?ids=${id}`, {
      signal: AbortSignal.timeout(8000), headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; P1SYBS/1.0)" },
    });
    if (!res.ok) return null;
    return punkt1BruttoFraSvar(await res.json(), id);
  } catch (_) { return null; }
}

// ADRESSE -> KOORDINATER. Samme vej som resten af appen: ORS' adresseopslag gennem Edge Functionen ors-proxy (nøglen ligger kun dér),
// kaldt med BRUGERENS eget token. Kan ORS ikke svare, proever vi DAWA (aabent, uden noegle) som reserve. Adresser logges aldrig
// (persondata), kun status. Resultater huskes kun i hukommelsen i denne instans (kun vellykkede opslag) for at spare ORS' kvote.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const GEO_CACHE = new Map<string, { lat: number; lon: number }>();
const MATRIX_CACHE = new Map<string, unknown>();
type Punkt = { id: string; lat: number; lon: number };

async function orsKald(auth: string, body: Record<string, unknown>) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ors-proxy`, {
      method: "POST", signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json", Authorization: auth, apikey: ANON },
      body: JSON.stringify(body),
    });
    if (!res.ok) { console.error(`ors-proxy ${body.handling}: HTTP ${res.status}`); return null; }
    return await res.json();
  } catch (e) { console.error(`ors-proxy ${body.handling} fejlede:`, e instanceof Error ? e.name : "ukendt"); return null; }
}

// "Vej 5750" -> "Vej, 5750" (som appens egen adapter)
const medKomma = (a: string) => a.replace(/^(.*\S)\s+(\d{4})$/, "$1, $2");

async function geokod(adresse: string, auth: string, fokus: { lat: number; lon: number } | null) {
  const noegle = adresse.trim().toLowerCase();
  if (!noegle || noegle.length < 5) return null;
  const hit = GEO_CACHE.get(noegle);
  if (hit) return hit;
  const data = await orsKald(auth, { handling: "soeg", tekst: medKomma(adresse.trim()), fokus: fokus ?? undefined });
  const features = Array.isArray(data?.features) ? data.features : [];
  const f = features.find((x: { properties?: { housenumber?: string } }) => x?.properties?.housenumber) || features[0];
  const c = f?.geometry?.coordinates; // [lon, lat]
  if (Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
    const r = { lat: c[1], lon: c[0] };
    GEO_CACHE.set(noegle, r);
    return r;
  }
  // Reserve: DAWA. Proever foerst adresser (med etage/doer), derefter adgangsadresser (kun vej + husnr).
  for (const sti of ["adresser", "adgangsadresser"]) {
    try {
      const res = await fetch(`https://api.dataforsyningen.dk/${sti}?q=${encodeURIComponent(adresse)}&per_side=1&struktur=mini`, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) { console.error(`dawa ${sti}: HTTP ${res.status}`); continue; }
      const r = (await res.json())?.[0];
      if (r && Number.isFinite(r.x) && Number.isFinite(r.y)) { const k = { lat: r.y, lon: r.x }; GEO_CACHE.set(noegle, k); return k; }
    } catch (e) { console.error(`dawa ${sti} fejlede:`, e instanceof Error ? e.name : "ukendt"); }
  }
  return null;
}

// Rigtig koretid og kilometer mellem alle punkter (ORS-matrix). null = ORS kunne ikke svare; saa bruger motoren luftlinje.
async function hentMatrix(punkter: Punkt[], auth: string) {
  if (punkter.length < 2 || punkter.length > 40) return null;
  const noegle = JSON.stringify(punkter.map((p) => [p.id, p.lat, p.lon]));
  if (MATRIX_CACHE.has(noegle)) return ruteMatrixFraOrs(punkter, MATRIX_CACHE.get(noegle));
  const data = await orsKald(auth, { handling: "matrix", punkter: punkter.map((p) => ({ lat: p.lat, lon: p.lon })) });
  if (!data) return null;
  if (MATRIX_CACHE.size > 200) MATRIX_CACHE.clear();
  MATRIX_CACHE.set(noegle, data);
  return ruteMatrixFraOrs(punkter, data);
}

// Hvem er kalderen, og hvilken butik gælder det? Al data læses bagefter med kalderens eget token (RLS) og er afgrænset til butikken.
// deno-lint-ignore no-explicit-any
type Ctx = { klient: any; erAdmin: boolean; butikId: string; userId: string };
async function kontekst(req: Request): Promise<{ res: Response } | { ctx: Ctx; body: Record<string, unknown> }> {
  const klient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await klient.auth.getUser();
  if (!user) return { res: svar({ fejl: "Ikke logget ind" }, 401) };

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { return { res: svar({ fejl: "Ugyldig forespoergsel" }, 400) }; }

  const { data: profil } = await klient.from("profiles").select("id, store_id, is_system_admin").eq("id", user.id).maybeSingle();
  if (!profil) return { res: svar({ fejl: "Profil ikke fundet" }, 403) };
  const erAdmin = profil.is_system_admin === true;
  let butikId: string | null = profil.store_id ?? null;
  if (!butikId && erAdmin && typeof body.storeId === "string" && UUID.test(body.storeId)) butikId = body.storeId;
  if (!butikId) return { res: svar({ fejl: "Ingen butik" }, 400) };
  return { ctx: { klient, erAdmin, butikId, userId: user.id }, body };
}

// ---- FORSLAG TIL NY DATO/BIL (ombooking) ---------------------------------------------------------------------------------------
// Finder de nærmeste dage (fra og med fraDato), hvor sagen kan ligge på en bil - kortest ventetid for kunden først. Tre trin:
//  1) grovsigtning uden netværk: dage uden montør, to-mands-krav, kundens tidsrum osv. (kapacitetsmotoren uden mål og kørsel)
//  2) de dage, der består, tjekkes dag for dag med punkt1-mål (live, kun i hukommelsen) og luftlinje, til der er nok forslag
//  3) de bedste forslag finpudses med rigtig køretid (ORS-matrix)
// Der slås kun op, hvad der skal bruges (højst 60 produkter, 40 adresser, 5 ORS-matricer pr. søgning), og en søgning afbrydes efter ca. 25 s.
const FORSLAG_PR_MINUT = 6;
const FORSLAG_LOG = new Map<string, number[]>();
function forslagTilladt(userId: string) {
  const nu = Date.now();
  const liste = (FORSLAG_LOG.get(userId) ?? []).filter((t) => nu - t < 60_000);
  if (liste.length >= FORSLAG_PR_MINUT) { FORSLAG_LOG.set(userId, liste); return false; }
  liste.push(nu);
  FORSLAG_LOG.set(userId, liste);
  if (FORSLAG_LOG.size > 500) FORSLAG_LOG.clear();
  return true;
}

// deno-lint-ignore no-explicit-any
async function forslagHandler(f: any, ctx: Ctx, auth: string) {
  const { klient, butikId } = ctx;
  if (!forslagTilladt(ctx.userId)) return svar({ fejl: "Der er søgt efter mange forslag på kort tid. Vent et øjeblik, og prøv igen." }, 429);
  const frist = Date.now() + 25_000;
  const start = startDato(f.fraDato, iDagKbh());
  const datoer: string[] = kandidatDatoer(start, f.dage);
  if (datoer.length === 0) return svar({ forslag: [], noter: [], fra: start, til: start });
  const slut = datoer[datoer.length - 1];

  const [butikR, bilerR, personerR, ordrerR] = await Promise.all([
    klient.from("stores").select("id, lat, lon, capacity_settings").eq("id", butikId).maybeSingle(),
    klient.from("vehicles").select("id, data").eq("store_id", butikId),
    klient.from("profiles").select("id, name, vehicle_id").eq("store_id", butikId).not("vehicle_id", "is", null),
    klient.from("orders").select("id, data").eq("store_id", butikId).is("deleted_at", null).filter("data->>dato", "gte", start).filter("data->>dato", "lte", slut).limit(1000),
  ]);
  if (butikR.error || !butikR.data) return svar({ fejl: "Butikken kunne ikke hentes" }, 500);
  if (bilerR.error || personerR.error || ordrerR.error) return svar({ fejl: "Data kunne ikke hentes" }, 500);
  const butik = butikR.data;

  // deno-lint-ignore no-explicit-any
  const biler = (bilerR.data ?? []).map((v: any) => ({ ...(v.data as Record<string, unknown>), id: v.id })).filter((b: any) => b.lukket !== true).slice(0, 10);
  // deno-lint-ignore no-explicit-any
  const personer: any[] = personerR.data ?? [];
  const ider = personer.map((p) => p.id);
  const [arbR, uaR, fravR] = ider.length === 0 ? [{ data: [] }, { data: [] }, { data: [] }] : await Promise.all([
    klient.from("person_work_hours").select("person_id, weekday, arbejder, start_min, end_min, pause_min").eq("store_id", butikId).in("person_id", ider),
    klient.from("person_unavailability").select("person_id, dato, from_min, to_min").eq("store_id", butikId).gte("dato", start).lte("dato", slut).in("person_id", ider),
    klient.from("time_off").select("technician_id, start_date, end_date, type").eq("store_id", butikId).in("technician_id", ider).lte("start_date", slut),
  ]);
  // deno-lint-ignore no-explicit-any
  const alleOrdrer: any[] = (ordrerR.data ?? []).map((o: any) => ({ ...o.data, id: o.id }));

  // 1) grovsigtning
  // deno-lint-ignore no-explicit-any
  type Kombi = { dato: string; bil: any; personer: any[]; ordrer: any[] };
  const kombiner: Kombi[] = [];
  for (const dato of datoer) {
    for (const bil of biler) {
      if (f.ekskluder && f.ekskluder.dato === dato && f.ekskluder.bilId === bil.id) continue;
      const ps = bygPersoner({ dato, personer: personer.filter((p) => p.vehicle_id === bil.id), arbejdstider: arbR.data, uaendringer: uaR.data, fravaer: fravR.data, indstillinger: butik.capacity_settings });
      if (ps.length === 0) continue; // ingen montør på bilen den dag
      const os = alleOrdrer.filter((o) => o.dato === dato && o.bilId === bil.id);
      const grov = koerTjek({ dato, butik, bil, personer: ps, ordrer: os, sagId: f.sagId, kandidat: f.kandidat, maalById: new Map(), koord: new Map(), erAdmin: false, kanOverrule: false }).svar;
      if (!harHaardtBrud(grov)) kombiner.push({ dato, bil, personer: ps, ordrer: os });
    }
  }

  // 2) dag for dag med punkt1-mål og luftlinje
  const maalCache = new Map<string, ReturnType<typeof punkt1BruttoFraSvar>>();
  const koordCache = new Map<string, { lat: number; lon: number } | null>();
  let punkt1Kald = 0; let geoKald = 0;
  const hentMaalFor = async (ider2: string[]) => {
    const nye = ider2.filter((id) => !maalCache.has(id)).slice(0, Math.max(0, 60 - punkt1Kald));
    punkt1Kald += nye.length;
    for (let i = 0; i < nye.length; i += 8) await Promise.all(nye.slice(i, i + 8).map(async (id) => { maalCache.set(id, await hentBrutto(id)); }));
  };
  const geokodMange = async (adr: string[]) => {
    const nye = [...new Set(adr.filter((a) => a && !koordCache.has(a)))].slice(0, Math.max(0, 40 - geoKald));
    geoKald += nye.length;
    for (let i = 0; i < nye.length; i += 4) await Promise.all(nye.slice(i, i + 4).map(async (a) => { koordCache.set(a, await geokod(a, auth, fokus2)); }));
  };
  const fokus2 = Number.isFinite(butik.lat) && Number.isFinite(butik.lon) ? { lat: butik.lat as number, lon: butik.lon as number } : null;

  // deno-lint-ignore no-explicit-any
  const kontekster = new Map<string, { stop: any[]; koord: Map<string, { lat: number; lon: number }>; maalById: Map<string, any>; k: Kombi }>();
  // deno-lint-ignore no-explicit-any
  const vurderinger: any[] = [];
  let afbrudt = false;
  const evaluer = async (k: Kombi) => {
    const stop = ordrerTilStop(k.ordrer, f.sagId);
    await Promise.all([hentMaalFor(punkt1Ider(stop, f.kandidat)), geokodMange([f.kandidat.adresse, ...stop.map((s: { adresse: string }) => s.adresse)])]);
    const maalById = new Map([...maalCache].filter(([, m]) => m)) as Map<string, unknown>;
    const koord = new Map<string, { lat: number; lon: number }>();
    for (const a of [f.kandidat.adresse, ...stop.map((s: { adresse: string }) => s.adresse)]) { const c = koordCache.get(a); if (c) koord.set(a, c); }
    const { svar: s2 } = koerTjek({ dato: k.dato, butik, bil: k.bil, personer: k.personer, ordrer: k.ordrer, sagId: f.sagId, kandidat: f.kandidat, maalById, koord, erAdmin: false, kanOverrule: false });
    kontekster.set(`${k.dato}|${k.bil.id}`, { stop, koord, maalById, k });
    vurderinger.push(forslagFraSvar(s2, { dato: k.dato, bilId: k.bil.id, bilNavn: k.bil.navn, rute: "skoen" }));
  };
  for (const dato of datoer) {
    const gruppe = kombiner.filter((k) => k.dato === dato);
    if (gruppe.length === 0) continue;
    if (Date.now() > frist) { afbrudt = true; break; }
    await Promise.all(gruppe.map(evaluer));
    if (rangerForslag(vurderinger, 5, f.ekskluder).length >= 5) break;
  }

  // 3) finpudsning med rigtig køretid for de bedste forslag
  const bedste = rangerForslag(vurderinger, 5, f.ekskluder);
  const finpudset = await Promise.all(bedste.map(async (fs: { dato: string; bilId: string; bilNavn: string }) => {
    const c = kontekster.get(`${fs.dato}|${fs.bilId}`);
    if (!c || Date.now() > frist) return fs;
    const ruteMatrix = await hentMatrix(matrixPunkter({ butik, stop: c.stop, kandidat: f.kandidat, koord: c.koord }), auth);
    if (!ruteMatrix) return fs;
    const { svar: s3 } = koerTjek({ dato: c.k.dato, butik, bil: c.k.bil, personer: c.k.personer, ordrer: c.k.ordrer, sagId: f.sagId, kandidat: f.kandidat, maalById: c.maalById, koord: c.koord, erAdmin: false, kanOverrule: false, ruteMatrix });
    return forslagFraSvar(s3, { dato: fs.dato, bilId: fs.bilId, bilNavn: fs.bilNavn, rute: "ors" });
  }));
  const forslag = rangerForslag(finpudset, 5, f.ekskluder);

  const noter: string[] = [];
  if (!f.kandidat.adresse) noter.push("Sagen har ingen adresse, så kørsel er ikke medregnet i forslagene.");
  if (afbrudt) noter.push("Søgningen blev afbrudt for at spare tid. Der kan være flere muligheder senere.");
  if (punkt1Kald >= 60 || geoKald >= 40) noter.push("Der var mange sager i perioden, så nogle opslag blev sprunget over. Vurderingen kan være mindre præcis.");
  return svar({ forslag, noter, fra: start, til: slut });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return svar({ fejl: "Kun POST understoettes" }, 405);

  const k = await kontekst(req);
  if ("res" in k) return k.res;
  const { ctx, body } = k;
  const { klient, erAdmin, butikId } = ctx;
  const auth = req.headers.get("Authorization") ?? "";

  if (body.handling === "forslag") {
    const fs = validerForslag(body);
    if (!fs.ok) return svar({ fejl: fs.fejl }, 400);
    return await forslagHandler(fs, ctx, auth);
  }

  const f = validerForespoergsel(body);
  if (!f.ok) return svar({ fejl: f.fejl }, 400);

  const [butikR, bilR, personerR, ordrerR, rettR] = await Promise.all([
    klient.from("stores").select("id, lat, lon, capacity_settings").eq("id", butikId).maybeSingle(),
    klient.from("vehicles").select("id, data").eq("id", f.bilId).eq("store_id", butikId).maybeSingle(),
    klient.from("profiles").select("id, name").eq("store_id", butikId).eq("vehicle_id", f.bilId),
    klient.from("orders").select("id, data").eq("store_id", butikId).is("deleted_at", null).filter("data->>dato", "eq", f.dato).filter("data->>bilId", "eq", f.bilId).limit(80),
    klient.rpc("has_permission", { perm: "overstyr_kapacitet" }),
  ]);
  if (butikR.error || !butikR.data) return svar({ fejl: "Butikken kunne ikke hentes" }, 500);
  if (bilR.error || !bilR.data) return svar({ fejl: "Bilen findes ikke i din butik" }, 404);
  if (personerR.error || ordrerR.error) return svar({ fejl: "Data kunne ikke hentes" }, 500);

  const personer = personerR.data ?? [];
  const ider = personer.map((p: { id: string }) => p.id);
  const [arbR, uaR, fravR] = ider.length === 0 ? [{ data: [] }, { data: [] }, { data: [] }] : await Promise.all([
    klient.from("person_work_hours").select("person_id, weekday, arbejder, start_min, end_min, pause_min").eq("store_id", butikId).in("person_id", ider),
    klient.from("person_unavailability").select("person_id, dato, from_min, to_min").eq("store_id", butikId).eq("dato", f.dato).in("person_id", ider),
    klient.from("time_off").select("technician_id, start_date, end_date, type").eq("store_id", butikId).in("technician_id", ider).lte("start_date", f.dato),
  ]);

  const ordrer = (ordrerR.data ?? []).map((o: { id: string; data: Record<string, unknown> }) => ({ ...o.data, id: o.id }));
  const bil = { ...(bilR.data.data as Record<string, unknown>), id: bilR.data.id };
  const indstillinger = butikR.data.capacity_settings;

  // Personer og tilgaengelighed bygges i tjek.js (samme motor som resten). Vi bruger butikkens egne indstillinger til standardtider.
  const motorPersoner = bygPersoner({ dato: f.dato, personer, arbejdstider: arbR.data, uaendringer: uaR.data, fravaer: fravR.data, indstillinger });

  // Live opslag hos punkt1 + geokodning, parallelt. Resultaterne lever kun i dette kald.
  const stop = ordrerTilStop(ordrer, f.sagId);
  const pIder = punkt1Ider(stop, f.kandidat);
  const adresser = [...new Set([f.kandidat.adresse, ...stop.map((s) => s.adresse)].filter(Boolean))].slice(0, 25) as string[];
  const fokus = Number.isFinite(butikR.data.lat) && Number.isFinite(butikR.data.lon) ? { lat: butikR.data.lat as number, lon: butikR.data.lon as number } : null;
  const geokodAlle = async () => {
    const ud: (readonly [string, { lat: number; lon: number } | null])[] = [];
    for (let i = 0; i < adresser.length; i += 4) { // hoejst 4 ad gangen (ORS' hastighedsgraense)
      ud.push(...await Promise.all(adresser.slice(i, i + 4).map(async (a) => [a, await geokod(a, auth, fokus)] as const)));
    }
    return ud;
  };
  const [maalListe, koordListe] = await Promise.all([
    Promise.all(pIder.map(async (id) => [id, await hentBrutto(id)] as const)),
    geokodAlle(),
  ]);
  const maalById = new Map(maalListe.filter(([, m]) => m).map(([id, m]) => [id, m]));
  const koord = new Map(koordListe.filter(([, k]) => k).map(([a, k]) => [a, k]));
  const ruteMatrix = await hentMatrix(matrixPunkter({ butik: butikR.data, stop, kandidat: f.kandidat, koord }), auth);

  try {
    const { svar: resultat } = koerTjek({
      dato: f.dato, butik: butikR.data, bil, personer: motorPersoner, ordrer, sagId: f.sagId, kandidat: f.kandidat,
      maalById, koord, erAdmin, kanOverrule: erAdmin || rettR.data === true, ruteMatrix,
    });
    return svar(resultat);
  } catch (e) {
    console.error("kapacitet-tjek fejlede:", e instanceof Error ? e.message : "ukendt fejl");
    return svar({ fejl: "Beregningen fejlede" }, 500);
  }
});
