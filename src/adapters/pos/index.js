// POS-ADAPTER (Flow Retail) - oktober 2026.
//
// Alt, appen ved om POS-systemet, går gennem denne adapter: opslag af en kunde/ordre, synkronisering ved
// færdigmelding og opsætningen af forbindelsen (som kun Edge Functionen pos-integration kan tale med, fordi
// API-nøglen ligger i Supabase Vault og aldrig i en tabel, klienten kan læse).
//
// UAFHÆNGIG AF APPEN: ingen imports. Den får en transport (core/edgeTransport.js), en klient med rpc/from
// (supabase-js) og en log-funktion udefra. Se README.md for kontrakten.
//
// KAPABILITETER: hver funktion kan slås til/fra, hvor den bruges. synkVedAfslutning er SLÅET FRA som
// udgangspunkt: Flow Retails API er endnu ikke koblet på (se de "IKKE IMPLEMENTERET"-steder i Edge
// Functionen), og en synkronisering, der kun kan fejle, må ikke køre ved hver færdigmelding. Slået fra
// foretager adapteren intet netværkskald og skriver ingen status. Slås til ved at give
// kapabiliteter: { synkVedAfslutning: true } i src/adapters/index.js.
export function opretPosAdapter({ transport, klient, log, kapabiliteter } = {}) {
  if (!transport || typeof transport.kald !== "function") throw new Error("opretPosAdapter: transport mangler");
  const logger = typeof log === "function" ? log : () => {};
  const kap = Object.freeze({ opslag: true, synkVedAfslutning: false, ...(kapabiliteter || {}) });
  const FUNKTION = "pos-integration";

  return {
    kapabiliteter: kap,

    // Er POS slået til for brugerens egen butik (aktiveret OG nøgle gemt)? Kun ja/nej - aldrig nøgle eller
    // adresse. Kan svaret ikke hentes, regnes POS for IKKE slået til: hellere en skjult knap end en, der
    // giver en fejl hver gang.
    async erAktiv() {
      if (!klient || typeof klient.rpc !== "function") return false;
      try {
        const { data, error } = await klient.rpc("pos_enabled_for_my_store");
        if (error) { logger("pos:erAktiv", error.message); return false; }
        return data === true;
      } catch (e) {
        logger("pos:erAktiv", e?.message || "ukendt fejl");
        return false;
      }
    },

    // Opslag til udfyldning af en ny sag - på telefonnummer eller ordre-/fakturanummer.
    async opslag({ storeId, query, queryType }) {
      if (!kap.opslag) return { ok: false, sprunget: true, fejl: "POS-opslag er ikke slået til" };
      const r = await transport.kald(FUNKTION, { action: "lookup", storeId, query, queryType }, { standardFejl: "POS-opslaget fejlede", logFejl: false });
      return r.ok ? { ok: true, resultat: r.data?.resultat } : { ok: false, fejl: r.fejl };
    },

    // Fakturering og lagerudlevering, når en sag færdigmeldes. Funktionen skriver SELV posStatus på sagen;
    // adapteren returnerer blot samme resultat. Slået fra (se oven for): intet kald, svaret er { sprunget: true }.
    async synkVedAfslutning({ storeId, orderId }) {
      if (!kap.synkVedAfslutning) {
        return { ok: true, sprunget: true, aarsag: "POS-synkronisering ved færdigmelding er ikke slået til" };
      }
      // Et svar med { fejl } i brødteksten er IKKE en fejl her: funktionen lægger selv fejlen i posStatus.
      const r = await transport.kald(FUNKTION, { action: "finish-sync", storeId, orderId }, {
        standardFejl: "POS-synkroniseringen ved færdigmelding fejlede", logFejl: false, dataFejlErFejl: false,
      });
      return r.ok ? { ok: true, posStatus: r.data?.posStatus || null } : { ok: false, fejl: r.fejl };
    },

    // ---- Opsætning (admin) ----

    // Læser opsætningen DIREKTE fra tabellen (kun ikke-hemmelige felter; rækkesikkerheden afgør, hvem der må se den).
    async hentOpsaetning(storeId) {
      if (!storeId || !klient?.from) return null;
      const { data, error } = await klient
        .from("pos_integrations")
        .select("enabled, tenant_id, base_url, api_key_secret_id, last_test_at, last_test_ok, last_test_note")
        .eq("store_id", storeId)
        .maybeSingle();
      if (error) { logger("pos:hentOpsaetning", error.message); return null; }
      if (!data) return { aktiveret: false, tenantId: "", baseUrl: "", harNoegle: false, sidstTestet: null, sidstTestetOk: null, sidstTestetNote: "" };
      return {
        aktiveret: data.enabled, tenantId: data.tenant_id || "", baseUrl: data.base_url || "", harNoegle: !!data.api_key_secret_id,
        sidstTestet: data.last_test_at, sidstTestetOk: data.last_test_ok, sidstTestetNote: data.last_test_note || "",
      };
    },

    // Systemadmin-overblik på tværs af alle butikker.
    async hentAlleOpsaetninger() {
      if (!klient?.from) return [];
      const { data, error } = await klient
        .from("pos_integrations")
        .select("store_id, enabled, tenant_id, api_key_secret_id, last_test_at, last_test_ok, last_test_note");
      if (error) { logger("pos:hentAlleOpsaetninger", error.message); return []; }
      return (data || []).map((r) => ({
        butikId: r.store_id, aktiveret: r.enabled, tenantId: r.tenant_id || "", harNoegle: !!r.api_key_secret_id,
        sidstTestet: r.last_test_at, sidstTestetOk: r.last_test_ok, sidstTestetNote: r.last_test_note || "",
      }));
    },

    // Gemmer/erstatter API-nøglen (og evt. de øvrige felter). Nøglen er valgfri, så tenantId/baseUrl/aktiveret
    // kan ændres uden at indtaste den igen.
    async gemNoegle({ storeId, apiKey, tenantId, baseUrl, enabled }) {
      const r = await transport.kald(FUNKTION, { action: "set-key", storeId, apiKey, tenantId, baseUrl, enabled }, { standardFejl: "Kunne ikke gemme POS-forbindelsen", kilde: "pos:gemNoegle" });
      return r.ok ? { ok: true } : { ok: false, fejl: r.fejl };
    },

    // Forbindelsestest. Resultatet (også en fejl) bliver stående på rækken i databasen.
    async test(storeId) {
      const r = await transport.kald(FUNKTION, { action: "test", storeId }, { standardFejl: "Forbindelsestesten fejlede", logFejl: false });
      return r.ok ? { ok: true } : { ok: false, fejl: r.fejl };
    },
  };
}
