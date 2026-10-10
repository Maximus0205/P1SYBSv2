// Supabase Edge Function: sms-automatik
//
// Sender de AUTOMATISKE kunde-SMS'er, som butikkens admin har slået til under Admin -> SMS:
//   * bekræftelse, når en sag er booket        * besked, når dato/tidsrum er ændret
//   * påmindelse aftenen før                   * påmindelse om morgenen på dagen
// Kaldes hvert 2. minut af pg_cron (via pg_net) - IKKE af brugere. verify_jwt er derfor slået fra, og kaldet
// godkendes i stedet med en hemmelighed i headeren x-cron-secret, som valideres af databasen (rpc sms_cron_ok,
// vault-hemmeligheden "sms_cron_secret"). Uden gyldig hemmelighed sker der intet.
//
// Hvem der skal have hvad, afgøres af ren logik (logik.js, testet i tests/sms-automatik.test.mjs). Her ligger kun I/O:
//   * en række i sms_automation_state oprettes FØR afsendelse (unik pr. sag/type/booking) - to samtidige kørsler
//     kan derfor aldrig sende det samme to gange
//   * udbyderen svarer med fejl -> status "fejl" (prøves igen op til 3 gange); timeout/netværk -> "usikker" og prøves ALDRIG
//     igen (beskeden kan være sendt; en dobbelt-SMS er værre end en manglende)
//   * samme grænser som manuel SMS: max 5 pr. modtager pr. døgn (sms_log tæller begge dele), kun danske numre, og
//     butikkens "SMS til kunder"-kontakt (store_sms_settings.enabled) skal være tændt
//   * kundens navn og nummer hentes fra sagen i databasen; teksten kommer fra butikkens skabelon med faste pladsholdere
//   * ingen mål, vægt eller andre interne data indgår i en SMS
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  planlaeg, skabelonFejl, STANDARD_TEKSTER, STANDARD_TIDER, SKABELON_AF_KIND, udfyld, fornavnFra, danskNummer, butikTekst,
  datoTekst, tidsrumTekst, kobenhavn, MAKS_FORSOEG,
} from "./logik.js";

const SLOT_STANDARD: Record<string, [string, string]> = { heldag: ["08:00", "16:00"], formiddag: ["08:00", "12:00"], eftermiddag: ["12:00", "16:00"] };
const MAKS_PR_MODTAGER_PR_DOEGN = 5;
const MAKS_SEND_PR_BUTIK_PR_KOERSEL = 40;
const MAKS_BUTIKKER = 50;
const MAKS_ORDRER_PR_BUTIK = 2000;
const TIDSFRIST_MS = 22_000;
const STATE_OPBEVARING_DAGE = 200;
const LOG_OPBEVARING_DAGE = 90;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function hmacHex(noegle: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(noegle), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function senderErGyldig(s: string | undefined | null): boolean {
  if (!s) return false;
  if (/^\d{1,15}$/.test(s)) return true;
  return /^[A-Za-z0-9 ]{1,11}$/.test(s) && /[A-Za-z]/.test(s);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, fejl: "Kun POST" }, 405);
  const URL_ = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const GW_TOKEN = Deno.env.get("GATEWAYAPI_TOKEN");
  const GW_SENDER = Deno.env.get("GATEWAYAPI_SENDER");
  const GW_HOST = Deno.env.get("GATEWAYAPI_HOST") || "messaging.gatewayapi.eu";
  if (!URL_ || !SERVICE_KEY) return json({ ok: false, fejl: "Mangler opsætning" }, 503);

  const admin = createClient(URL_, SERVICE_KEY);
  const hemmelighed = req.headers.get("x-cron-secret") ?? "";
  const { data: godkendt, error: authFejl } = await admin.rpc("sms_cron_ok", { p: hemmelighed });
  if (authFejl) { console.error("sms-automatik: sms_cron_ok:", authFejl.message); return json({ ok: false, fejl: "Opsætning" }, 503); }
  if (godkendt !== true) return json({ ok: false, fejl: "Ikke godkendt" }, 401);

  const start = Date.now();
  const resultat = { butikker: 0, sendt: 0, fejl: 0, sprunget: 0, afvist: 0 };
  try {
    const { data: indstillinger, error: iFejl } = await admin.from("store_sms_automation").select("*")
      .or("bekraeftelse_enabled.eq.true,aendring_enabled.eq.true,aften_enabled.eq.true,morgen_enabled.eq.true").limit(MAKS_BUTIKKER);
    if (iFejl) throw new Error("indstillinger: " + iFejl.message);
    if (!GW_TOKEN && (indstillinger?.length ?? 0) > 0) { console.error("sms-automatik: GATEWAYAPI_TOKEN mangler"); return json({ ok: false, fejl: "Mangler SMS-udbyder" }, 503); }

    for (const ind of indstillinger ?? []) {
      if (Date.now() - start > TIDSFRIST_MS) break;
      const storeId: string = ind.store_id;
      try {
        // Butikkens generelle SMS-kontakt (tændt/slukket, afsender) og navn
        const { data: sms } = await admin.from("store_sms_settings").select("enabled, sender").eq("store_id", storeId).maybeSingle();
        if (sms && sms.enabled === false) continue;
        const afsender = (typeof sms?.sender === "string" && sms.sender.trim()) || GW_SENDER;
        if (!senderErGyldig(afsender)) { console.error(`sms-automatik: ingen gyldig afsender for butik ${storeId}`); continue; }
        const { data: butik } = await admin.from("stores").select("name").eq("id", storeId).maybeSingle();
        const butikNavn = butikTekst(butik?.name);
        resultat.butikker++;

        const nu = Date.now();
        const iDag = kobenhavn(nu).dato;
        const { data: raa, error: oFejl } = await admin.from("orders").select("id, data, updated_at")
          .eq("store_id", storeId).is("deleted_at", null).gte("data->>dato", iDag).limit(MAKS_ORDRER_PR_BUTIK);
        if (oFejl) throw new Error("ordrer: " + oFejl.message);
        const ordrer = (raa ?? []).map((r: any) => ({
          id: String(r.id), dato: r.data?.dato, tidsrumId: r.data?.tidsrumId || "heldag", start: r.data?.start, slut: r.data?.slut,
          telefon: r.data?.kunde?.telefon, navn: r.data?.kunde?.navn, status: r.data?.status, opdateretMs: Date.parse(r.updated_at) || 0,
        }));
        if (ordrer.length === 0) continue;

        const tilstandRaa: any[] = [];
        for (let i = 0; i < ordrer.length; i += 200) {
          const { data: rk, error: sFejl } = await admin.from("sms_automation_state").select("*")
            .eq("store_id", storeId).in("order_id", ordrer.slice(i, i + 200).map((o) => o.id));
          if (sFejl) throw new Error("tilstand: " + sFejl.message);
          tilstandRaa.push(...(rk ?? []));
        }
        const tilstand = tilstandRaa.map((r) => ({
          ordreId: r.order_id, kind: r.kind, noegle: r.noegle, status: r.status, forsoeg: r.forsoeg,
          oprettetMs: Date.parse(r.created_at) || 0, opdateretMs: Date.parse(r.updated_at) || 0, id: r.id,
        }));

        const { send, registrer } = planlaeg({
          ordrer, tilstand, nu,
          indst: {
            bekraeftelse: !!ind.bekraeftelse_enabled, aendring: !!ind.aendring_enabled, aften: !!ind.aften_enabled, morgen: !!ind.morgen_enabled,
            aftenMin: Number.isInteger(ind.aften_min) ? ind.aften_min : STANDARD_TIDER.aftenMin,
            morgenMin: Number.isInteger(ind.morgen_min) ? ind.morgen_min : STANDARD_TIDER.morgenMin,
          },
        });

        if (registrer.length > 0) {
          const { error } = await admin.from("sms_automation_state").upsert(
            registrer.map((r) => ({ store_id: storeId, order_id: r.ordreId, kind: r.kind, noegle: r.noegle, status: "sprunget" })),
            { onConflict: "store_id,order_id,kind,noegle", ignoreDuplicates: true });
          if (error) console.error("sms-automatik: registrer:", error.message);
          else resultat.sprunget += registrer.length;
        }

        for (const a of send.slice(0, MAKS_SEND_PR_BUTIK_PR_KOERSEL)) {
          if (Date.now() - start > TIDSFRIST_MS) break;
          const o = ordrer.find((x) => x.id === a.ordreId);
          if (!o) continue;
          const nummer = danskNummer(o.telefon);
          if (!nummer) continue;

          // 1) Reservér rækken (unik) - kun den, der får rækken, må sende
          let stateId: string | null = null;
          if (a.genforsoeg) {
            const eksisterende = tilstand.find((t) => t.ordreId === a.ordreId && t.kind === a.kind && t.noegle === a.noegle);
            if (!eksisterende) continue;
            const { data: upd } = await admin.from("sms_automation_state")
              .update({ status: "afventer", forsoeg: eksisterende.forsoeg + 1, updated_at: new Date().toISOString() })
              .eq("id", eksisterende.id).eq("status", "fejl").select("id");
            stateId = upd && upd.length > 0 ? upd[0].id : null;
          } else {
            const { data: ny, error } = await admin.from("sms_automation_state")
              .insert({ store_id: storeId, order_id: a.ordreId, kind: a.kind, noegle: a.noegle, status: "afventer", forsoeg: 1 }).select("id");
            stateId = !error && ny && ny.length > 0 ? ny[0].id : null; // unik-konflikt = en anden kørsel var først
          }
          if (!stateId) continue;
          const sæt = (felter: Record<string, unknown>) => admin.from("sms_automation_state").update({ ...felter, updated_at: new Date().toISOString() }).eq("id", stateId!);

          // 2) Tekst
          const [stdStart, stdSlut] = SLOT_STANDARD[o.tidsrumId] ?? SLOT_STANDARD.heldag;
          const tidsrum = tidsrumTekst(o.start, o.slut) || tidsrumTekst(stdStart, stdSlut);
          const dato = datoTekst(o.dato);
          const skabNoegle = SKABELON_AF_KIND[a.kind as keyof typeof SKABELON_AF_KIND];
          const valgt = ind["tpl_" + skabNoegle];
          const skabelon = skabelonFejl(valgt) === null ? valgt : STANDARD_TEKSTER[skabNoegle as keyof typeof STANDARD_TEKSTER];
          if (!dato || !tidsrum) { await sæt({ status: "afvist", fejl: "dato/tidsrum mangler" }); resultat.afvist++; continue; }
          const tekst = udfyld(skabelon, { fornavn: fornavnFra(o.navn), dato, tidsrum, butik: butikNavn });

          // 3) Grænse pr. modtager pr. døgn (tæller også de manuelle SMS'er)
          const hmac = await hmacHex(SERVICE_KEY, `${storeId}:${nummer}`);
          const { count } = await admin.from("sms_log").select("id", { count: "exact", head: true })
            .eq("store_id", storeId).eq("recipient_hmac", hmac).in("status", ["afventer", "sendt"]).gte("created_at", new Date(nu - 86400_000).toISOString());
          if ((count ?? 0) >= MAKS_PR_MODTAGER_PR_DOEGN) { await sæt({ status: "afvist", fejl: "døgngrænse pr. modtager" }); resultat.afvist++; continue; }

          const { data: logRaekke, error: logFejl } = await admin.from("sms_log").insert({
            store_id: storeId, user_id: null, kind: a.kind, recipient_masked: `+45 ****${nummer.slice(-4)}`, recipient_hmac: hmac, status: "afventer",
          }).select("id").single();
          if (logFejl || !logRaekke) { await sæt({ status: "fejl", fejl: "log: " + (logFejl?.message ?? "ingen række") }); resultat.fejl++; continue; }
          const logId: string = logRaekke.id;

          // 4) Send
          try {
            const res = await fetch(`https://${GW_HOST}/mobile/single`, {
              method: "POST",
              headers: { Authorization: `Token ${GW_TOKEN}`, Accept: "application/json", "Content-Type": "application/json" },
              body: JSON.stringify({ sender: afsender, message: tekst, recipient: Number("45" + nummer), reference: logId, label: "auto-" + a.kind }),
              signal: AbortSignal.timeout(10_000),
            });
            if (res.ok) {
              const d = await res.json().catch(() => ({}));
              await admin.from("sms_log").update({ status: "sendt", provider_msg_id: d?.msg_id ?? null }).eq("id", logId);
              await sæt({ status: "sendt", fejl: null });
              resultat.sendt++;
            } else {
              const detalje = (await res.text().catch(() => "")).slice(0, 300);
              console.error(`sms-automatik: GatewayAPI ${res.status}: ${detalje}`);
              await admin.from("sms_log").update({ status: "fejl", fejl: `HTTP ${res.status}: ${detalje}`.slice(0, 400) }).eq("id", logId);
              await sæt({ status: "fejl", fejl: `HTTP ${res.status}`.slice(0, 100) });
              resultat.fejl++;
            }
          } catch (e) {
            // Timeout/netværk: beskeden KAN være sendt - aldrig automatisk nyt forsøg.
            console.error("sms-automatik: udbyderkald fejlede:", String(e));
            await admin.from("sms_log").update({ fejl: `usikker: ${String(e)}`.slice(0, 400) }).eq("id", logId);
            await sæt({ status: "usikker", fejl: String(e).slice(0, 100) });
            resultat.fejl++;
          }
        }
      } catch (e) {
        console.error(`sms-automatik: butik ${storeId}:`, String(e));
      }
    }

    if (Math.random() < 0.02) {
      await admin.from("sms_automation_state").delete().lt("created_at", new Date(Date.now() - STATE_OPBEVARING_DAGE * 86400_000).toISOString());
      await admin.from("sms_log").delete().lt("created_at", new Date(Date.now() - LOG_OPBEVARING_DAGE * 86400_000).toISOString());
    }
    return json({ ok: true, ...resultat, maksForsoeg: MAKS_FORSOEG });
  } catch (e) {
    console.error("sms-automatik: uventet fejl:", String(e));
    return json({ ok: false, fejl: "Uventet fejl" }, 500);
  }
});
