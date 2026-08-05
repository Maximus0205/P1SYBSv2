// Supabase Edge Function. Deployes med:
//   supabase functions deploy ors-proxy
// og kræver en secret sat (ligger KUN på serveren, aldrig i frontend-koden):
//   supabase secrets set ORS_API_KEY=din-ors-noegle
//
// Frontend'en (src/lib/steder.js) kalder denne funktion via
// supabase.functions.invoke("ors-proxy", { body: { handling, ... } })
// i stedet for at ramme openrouteservice.org direkte med en nøgle i klienten.
//
// Kræver at kalderen er logget ind (Supabase sætter automatisk
// Authorization-headeren med brugerens session, når man bruger
// supabase.functions.invoke) - så uindloggede kan ikke bruge jeres kvote.

import { createClient } from "jsr:@supabase/supabase-js@2";

const ORS_BASE = "https://api.openrouteservice.org";
const ORS_KEY = Deno.env.get("ORS_API_KEY");

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ fejl: "Kun POST understøttes" }), { status: 405 });
  }
  if (!ORS_KEY) {
    return new Response(JSON.stringify({ fejl: "ORS_API_KEY er ikke sat op på serveren" }), { status: 500 });
  }

  // Bekræft at kaldet kommer fra en logget ind bruger (ikke en hemmelighed i
  // sig selv at kunne kalde funktionen, men forhindrer at uindloggede bruger
  // jeres gratis-kvote op).
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_ANON_KEY"),
    { global: { headers: { Authorization: req.headers.get("Authorization") } } }
  );
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ fejl: "Ikke logget ind" }), { status: 401 });
  }

  try {
    const { handling, tekst, kilde, destinationer } = await req.json();

    if (handling === "soeg" || handling === "autocomplete") {
      const endpoint = handling === "soeg" ? "search" : "autocomplete";
      const url = `${ORS_BASE}/geocode/${endpoint}?api_key=${encodeURIComponent(ORS_KEY)}&text=${encodeURIComponent(tekst || "")}&boundary.country=DK&size=${handling === "soeg" ? 1 : 5}`;
      const res = await fetch(url);
      const data = await res.json();
      return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" }, status: res.status });
    }

    if (handling === "matrix") {
      const locations = [[kilde.lon, kilde.lat], ...destinationer.map((d) => [d.lon, d.lat])];
      const res = await fetch(`${ORS_BASE}/v2/matrix/driving-car`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: ORS_KEY },
        body: JSON.stringify({
          locations,
          sources: [0],
          destinations: locations.map((_, i) => i).filter((i) => i !== 0),
          metrics: ["distance"],
        }),
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" }, status: res.status });
    }

    return new Response(JSON.stringify({ fejl: "Ukendt handling" }), { status: 400 });
  } catch (e) {
    return new Response(JSON.stringify({ fejl: String(e) }), { status: 500 });
  }
});
