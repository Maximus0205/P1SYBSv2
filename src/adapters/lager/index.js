// LAGER-ADAPTER (filer og dokumentation på en sag; eget S3-kompatibelt NAS) - oktober 2026.
//
// Billeder, underskrifter og anden dokumentation ligger i et fillager, ikke i sagens jsonb (en sag med billeder
// fyldte 2,5 MB, og appen henter alle sager ved hver indlæsning). Sagen gemmer kun en reference. Hvor filen
// ligger, er butikkens valg: en bøtte, vi hoster, eller et eget NAS (S3-kompatibelt). Det er bevidst usynligt
// herfra: klienten kender kun vedhæftningens id og beder Edge Functionen sagsdokumentation om en URL. Skifter en
// butik lagerplads, ændres intet andet. Opsætningen af NAS-forbindelsen går gennem Edge Functionen
// storage-integration (nøglerne ligger i Supabase Vault).
//
// UAFHÆNGIG AF APPEN: ingen imports. Transport, klient (supabase-js: from/storage), log og fetch gives udefra.
// Adapteren melder IKKE selv fejl til brugeren (det er appens sag); den svarer { ok:false, fejl }. Se README.md.

// Til visning: 5242880 -> "5,0 MB". Dansk decimalkomma.
export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const enheder = ["KB", "MB", "GB", "TB"];
  let vaerdi = bytes / 1024;
  let i = 0;
  while (vaerdi >= 1024 && i < enheder.length - 1) { vaerdi /= 1024; i++; }
  return `${vaerdi.toFixed(1).replace(".", ",")} ${enheder[i]}`;
}

export function opretLagerAdapter({ transport, klient, log, hent } = {}) {
  if (!transport || typeof transport.kald !== "function") throw new Error("opretLagerAdapter: transport mangler");
  const logger = typeof log === "function" ? log : () => {};
  const FUNKTION = "sagsdokumentation";
  const SETUP = "storage-integration";
  const BUCKET = "sagsdokumentation";
  const fetchFn = hent || (typeof fetch !== "undefined" ? fetch : undefined);

  const log_ = (kilde, besked) => { try { logger(kilde, besked); } catch (_) { /* logning må aldrig vælte kaldet */ } };

  // Kald til sagsdokumentation. Svarer { ok:true, ...data } eller { ok:false, fejl }.
  async function kald(krop, standardFejl) {
    const r = await transport.kald(FUNKTION, krop, { standardFejl, kilde: `attachments:${krop.handling}` });
    return r.ok ? { ok: true, ...r.data } : { ok: false, fejl: r.fejl };
  }

  return {
    // En sags vedhæftninger. Kun 'active': en afbrudt upload skal ikke vises som et billede, der ikke kan
    // hentes. storeId er valgfri (rækkesikkerheden afgrænser allerede til den indloggedes butik).
    async hentVedhaeftninger(orderId, storeId) {
      if (!orderId || !klient?.from) return [];
      let q = klient
        .from("attachments")
        .select("id, kind, navn, mime_type, bytes, created_at, created_by")
        .eq("order_id", String(orderId))
        .eq("status", "active")
        .order("created_at", { ascending: true });
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) { log_("attachments:getAttachments", error.message); return []; }
      return data || [];
    },

    // Signeret URL til at VISE én vedhæftning. Kortlivet med vilje, og må ikke gemmes: en URL, der virker for
    // evigt, er reelt en offentlig fil (billeder fra kundens hjem og deres underskrift).
    hentUrl(vedhaeftningId) {
      return kald({ handling: "hent-url", vedhaeftningId }, "Kunne ikke hente filen");
    },

    // For flere ad gangen: en sag med otte billeder skal ikke koste otte rundture over mobildata i en kælder.
    // Svar: { ok, urls: { <id>: { url, navn, mimeType } } }.
    async hentUrls(vedhaeftningIder) {
      if (!vedhaeftningIder || vedhaeftningIder.length === 0) return { ok: true, urls: {} };
      return kald({ handling: "hent-urls", vedhaeftningIder }, "Kunne ikke hente filerne");
    },

    // Uploader én fil i tre faser:
    //   1. start-upload    serveren opretter en "pending"-række og giver en signeret upload-URL
    //   2. selve uploaden  browseren sender filen direkte til lageret
    //   3. bekraeft-upload serveren tjekker, at filen FAKTISK kom frem, læser dens størrelse og aktiverer den
    // Mister mobilen dækning midt i fase 2, efterlades kun en pending-række, som ryddes op automatisk. Sagen
    // peger ALDRIG på en fil, der ikke findes. onProgress: 'starter' | 'sender' | 'bekraefter'.
    //
    // EGET LAGER: start-upload svarer egetLager:true, hvis butikken har sit eget S3-kompatible lager. Så er
    // uploadUrl en allerede FÆRDIGSIGNERET PUT-URL (AWS Signature V4), brugt med en almindelig fetch() - IKKE
    // Supabase Storage's uploadToSignedUrl, som kun forstår Supabases eget token-skema.
    async upload({ orderId, file, kind, onProgress }) {
      if (!orderId || !file) return { ok: false, fejl: "Mangler sag eller fil" };

      onProgress?.("starter");
      const start = await kald({
        handling: "start-upload", sagId: String(orderId), filnavn: file.name, mimeType: file.type, kind: kind || "billede",
      }, "Kunne ikke starte uploaden");
      if (!start.ok) return start;

      onProgress?.("sender");
      if (start.egetLager) {
        try {
          const res = await fetchFn(start.uploadUrl, {
            method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" },
          });
          if (!res.ok) {
            const fejl = `Lageret svarede med status ${res.status}`;
            log_("attachments:upload", fejl);
            return { ok: false, fejl };
          }
        } catch (e) {
          // Pending-rækken bliver stående og ryddes op automatisk: en fejl her skyldes typisk netværk/CORS, og et
          // oprydningskald ville fejle af samme grund.
          const fejl = e?.message || "Ukendt netværksfejl";
          log_("attachments:upload", fejl);
          return { ok: false, fejl };
        }
      } else {
        const { error } = await klient.storage.from(BUCKET).uploadToSignedUrl(start.lagerNoegle, start.token, file, {
          contentType: file.type || "application/octet-stream",
        });
        if (error) { log_("attachments:upload", error.message); return { ok: false, fejl: error.message }; }
      }

      onProgress?.("bekraefter");
      const bekraeft = await kald({ handling: "bekraeft-upload", vedhaeftningId: start.vedhaeftningId }, "Filen blev sendt, men kunne ikke bekræftes");
      if (!bekraeft.ok) return bekraeft;

      return {
        ok: true,
        id: start.vedhaeftningId,
        bytes: bekraeft.bytes,
        // Sat, når butikken nærmer sig sin kvote. Kun en ADVARSEL: en montør hos kunden må aldrig blokeres af en
        // kvote midt i en aflevering. Findes ikke ved eget lager (ingen kvote, vi kender).
        pladsAdvarsel: start.pladsAdvarsel ?? null,
      };
    },

    // Markerer en vedhæftning til sletning. Fjerner IKKE rækken: filen skal væk fra lageret først, ellers står der
    // en fil, ingen kan se, men som stadig fylder. Oprydningsjobbet fjerner begge dele i den rigtige rækkefølge.
    async markerTilSletning(vedhaeftningId) {
      if (!klient?.from) return { ok: false, fejl: "Ingen forbindelse til databasen" };
      const { error } = await klient.from("attachments").update({ status: "deleting" }).eq("id", vedhaeftningId);
      if (error) { log_("attachments:markForDeletion", error.message); return { ok: false, fejl: error.message }; }
      return { ok: true };
    },

    // Lagerforbrug pr. butik. Kvoten er NULL, når butikken selv skaffer lagerplads: et fillager har ikke "ledig
    // plads", og et opdigtet tal ville være værre end ingenting - kalderen skal derfor tjekke for null.
    async hentForbrug(storeId) {
      if (!klient?.from) return [];
      let q = klient
        .from("store_storage_usage")
        .select("store_id, store_name, brugt_bytes, kvote_bytes, ledig_bytes, pct_brugt, antal_filer, antal_afbrudte");
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) { log_("attachments:getStorageUsage", error.message); return []; }
      return data || [];
    },

    // ---- Opsætning af butikkens eget lager (admin) ----

    // Læses DIREKTE fra tabellen (kun ikke-hemmelige felter; rækkesikkerheden afgør, hvem der må se den).
    async hentOpsaetning(storeId) {
      if (!storeId || !klient?.from) return null;
      const { data, error } = await klient
        .from("store_storage_config")
        .select("provider, endpoint_url, bucket, region, path_style, access_key_id, secret_access_key_secret_id, last_test_at, last_test_ok, last_test_note")
        .eq("store_id", storeId)
        .maybeSingle();
      if (error) { log_("lager:hentOpsaetning", error.message); return null; }
      if (!data) {
        return {
          aktiveret: false, endpointUrl: "", bucket: "", region: "us-east-1", pathStyle: true,
          accessKeyId: "", harHemmeligNoegle: false, sidstTestet: null, sidstTestetOk: null, sidstTestetNote: "",
        };
      }
      return {
        aktiveret: data.provider === "s3_compatible",
        endpointUrl: data.endpoint_url || "",
        bucket: data.bucket || "",
        region: data.region || "us-east-1",
        pathStyle: data.path_style !== false,
        accessKeyId: data.access_key_id || "",
        harHemmeligNoegle: !!data.secret_access_key_secret_id,
        sidstTestet: data.last_test_at,
        sidstTestetOk: data.last_test_ok,
        sidstTestetNote: data.last_test_note || "",
      };
    },

    // Systemadmin-overblik på tværs af alle butikker.
    async hentAlleOpsaetninger() {
      if (!klient?.from) return [];
      const { data, error } = await klient
        .from("store_storage_config")
        .select("store_id, provider, bucket, secret_access_key_secret_id, last_test_at, last_test_ok, last_test_note");
      if (error) { log_("lager:hentAlleOpsaetninger", error.message); return []; }
      return (data || []).map((r) => ({
        butikId: r.store_id, aktiveret: r.provider === "s3_compatible", bucket: r.bucket || "", harHemmeligNoegle: !!r.secret_access_key_secret_id,
        sidstTestet: r.last_test_at, sidstTestetOk: r.last_test_ok, sidstTestetNote: r.last_test_note || "",
      }));
    },

    // Gemmer/erstatter forbindelsen. secretAccessKey er valgfri, så de øvrige felter kan ændres uden at indtaste
    // den hemmelige nøgle igen.
    async gemNoegle({ storeId, provider, endpointUrl, bucket, region, pathStyle, accessKeyId, secretAccessKey }) {
      const r = await transport.kald(SETUP, { action: "set-key", storeId, provider, endpointUrl, bucket, region, pathStyle, accessKeyId, secretAccessKey }, {
        standardFejl: "Kunne ikke gemme lager-forbindelsen", kilde: "lager:gemNoegle",
      });
      return r.ok ? { ok: true } : { ok: false, fejl: r.fejl };
    },

    // En RIGTIG forbindelsestest (signeret 'list bucket'-kald mod NAS'et). Resultatet gemmes altid.
    async test(storeId) {
      const r = await transport.kald(SETUP, { action: "test", storeId }, { standardFejl: "Forbindelsestesten fejlede", logFejl: false });
      return r.ok ? { ok: true } : { ok: false, fejl: r.fejl };
    },
  };
}
