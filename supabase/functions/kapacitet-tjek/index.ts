// Edge Function: kapacitet-tjek (oktober 2026). Digital disponent ved booking: kan denne bestilling lægges på bilen den dag?
//
// Henter produkternes BRUTTOMAAL og -vaegt LIVE fra punkt1 i samme kald som beregningen, bruger dem kun i hukommelsen og GEMMER DEM ALDRIG
// (ingen tabel, ingen cache, ingen logning af maal). Svaret til browseren indeholder aldrig maal eller vaegt (se renseSvar i tjek.js).
//
// Sikkerhed: kun indloggede brugere (verify_jwt). Al data laeses med BRUGERENS eget token, saa RLS gaelder; alle forespoergsler er desuden
// afgraenset til brugerens egen butik. Regler laeses fra butikken (samme for alle i butikken); retten til at overrule kommer fra
// rettigheden "overstyr_kapacitet" (eller systemadmin). Funktionen aendrer intet i databasen.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { validerForespoergsel, punkt1BruttoFraSvar, ordrerTilStop, punkt1Ider, bygPersoner, koerTjek } from "./tjek.js";

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

// DAWA (Danmarks Adressers Web API): aabent, uden noegle. struktur=mini giver x (laengdegrad) og y (breddegrad).
async function geokod(adresse: string) {
  if (!adresse) return null;
  try {
    const res = await fetch(`https://api.dataforsyningen.dk/adresser?q=${encodeURIComponent(adresse)}&per_side=1&struktur=mini`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const r = (await res.json())?.[0];
    return r && Number.isFinite(r.x) && Number.isFinite(r.y) ? { lat: r.y, lon: r.x } : null;
  } catch (_) { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return svar({ fejl: "Kun POST understoettes" }, 405);

  const klient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await klient.auth.getUser();
  if (!user) return svar({ fejl: "Ikke logget ind" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { return svar({ fejl: "Ugyldig forespoergsel" }, 400); }
  const f = validerForespoergsel(body);
  if (!f.ok) return svar({ fejl: f.fejl }, 400);

  const { data: profil } = await klient.from("profiles").select("id, store_id, is_system_admin").eq("id", user.id).maybeSingle();
  if (!profil) return svar({ fejl: "Profil ikke fundet" }, 403);
  const erAdmin = profil.is_system_admin === true;
  let butikId: string | null = profil.store_id ?? null;
  if (!butikId && erAdmin && typeof body.storeId === "string" && UUID.test(body.storeId)) butikId = body.storeId;
  if (!butikId) return svar({ fejl: "Ingen butik" }, 400);

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
  const [maalListe, koordListe] = await Promise.all([
    Promise.all(pIder.map(async (id) => [id, await hentBrutto(id)] as const)),
    Promise.all(adresser.map(async (a) => [a, await geokod(a)] as const)),
  ]);
  const maalById = new Map(maalListe.filter(([, m]) => m).map(([id, m]) => [id, m]));
  const koord = new Map(koordListe.filter(([, k]) => k).map(([a, k]) => [a, k]));

  try {
    const { svar: resultat } = koerTjek({
      dato: f.dato, butik: butikR.data, bil, personer: motorPersoner, ordrer, sagId: f.sagId, kandidat: f.kandidat,
      maalById, koord, erAdmin, kanOverrule: erAdmin || rettR.data === true,
    });
    return svar(resultat);
  } catch (e) {
    console.error("kapacitet-tjek fejlede:", e instanceof Error ? e.message : "ukendt fejl");
    return svar({ fejl: "Beregningen fejlede" }, 500);
  }
});
