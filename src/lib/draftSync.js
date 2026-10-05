// SYNKRONISERING AF KLADDER MELLEM ENHEDER (oktober 2026)
//
// Kladder (parkerede bookinger) følger sælgeren på tværs af enheder. Sandheden ligger i databasen
// (tabellen order_drafts, funktionerne save_order_draft/delete_order_draft - se
// supabase/migrations/20261005_order_drafts.sql); den lokale cache i lib/orderDrafts.js gør, at
// formularen gemmer øjeblikkeligt og virker uden forbindelse. Denne fil flytter ændringer begge veje:
//
//   1. sletninger, der endnu ikke er meldt til databasen
//   2. kladder med ændringer, databasen ikke har set
//   3. hent databasens kladder (også dem, der er oprettet på en anden enhed) og flet dem ind
//
// SAMTIDIGE RETTELSER: hver kladde har et versionsnummer. Har en anden enhed ændret den, siden denne
// sidst så den, gemmes den andens udgave som en KOPI ("kopi fra anden enhed"), og denne enheds udgave
// lægges ovenpå. Så går intet tabt, og ingen skal tage stilling midt i en booking.
//
// FORBINDELSE: en netværksfejl er ikke en afvisning. Kladden bliver stående som "ikke sendt" og
// forsøges igen, når appen får fokus, når enheden er online igen, og hvert minut. En AFVISNING fra
// databasen (fx manglende rettighed) forsøges først igen, når kladden ændres - ellers ville den blive
// ved at ramme samme afvisning.
//
// Alt kører efter hinanden (én kø), så en hentning aldrig kan løbe forbi en afsendelse. Ingen fejl her
// må vælte appen: i værste fald er kladden kun på denne enhed, indtil næste forsøg.

import { deepEqual } from "./orderMerge.js";
import {
  hentKladder, hentGravsten, fjernGravsten, kladdeErDirty, markerSendt, markerNaegtet, opretKopi, anvendRemote, saetSyncTrigger,
} from "./orderDrafts.js";

// PostgREST/Postgres-fejl har altid en kode; en fejl uden kode er forbindelsen, der røg.
const erNetvaerksfejl = (e) => !!e && !e.code;

// Sender ÉN kladde. Svarer "ok" | "netvaerk" | "naegtet" | "igen" (prøves igen næste gang).
async function skub(klient, storeId, userId, k) {
  const rev = k.rev ?? 0;
  const send = (forventet) => klient.rpc("save_order_draft", { p_store_id: storeId, p_id: k.id, p_state: k.state, p_step: k.step, p_expected_version: forventet });
  const afgoer = (svar) => {
    if (svar.error) {
      if (erNetvaerksfejl(svar.error)) return "netvaerk";
      markerNaegtet(k.id, svar.error.message);
      return "naegtet";
    }
    return null;
  };

  let svar = await send(k.version ?? null);
  let fejl = afgoer(svar);
  if (fejl) return fejl;
  let d = svar.data;

  if (d.status === "conflict") {
    // Samme indhold (fx et svar, der gik tabt) er ikke en rigtig konflikt og giver ingen kopi.
    if (!deepEqual(d.state, k.state)) opretKopi({ storeId, userId, state: d.state, step: d.step });
    svar = await send(d.version);
    fejl = afgoer(svar);
    if (fejl) return fejl;
    d = svar.data;
  } else if (d.status === "not_found") {
    // Væk i databasen (kasseret eller booket på en anden enhed), men her er der stadig noget tastet:
    // hellere en kladde for meget end tabt arbejde.
    svar = await send(null);
    fejl = afgoer(svar);
    if (fejl) return fejl;
    d = svar.data;
  }

  if (d.status === "ok") {
    markerSendt(k.id, { rev, version: d.version });
    return "ok";
  }
  return "igen";
}

// Én fuld runde: sletninger -> afsendelser -> hentning. Eksporteret, så den kan testes direkte.
export async function synkroniserNu(klient, storeId, userId) {
  try {
    for (const g of hentGravsten(userId)) {
      const r = await klient.rpc("delete_order_draft", { p_id: g.id });
      if (!r.error) fjernGravsten([g.id]);
      else if (erNetvaerksfejl(r.error)) return "netvaerk";
    }
    for (const k of hentKladder(storeId, userId)) {
      if (!kladdeErDirty(k) || k.naegtet) continue;
      if ((await skub(klient, storeId, userId, k)) === "netvaerk") return "netvaerk";
    }
    const { data, error } = await klient.from("order_drafts").select("id, step, state, version, updated_at").eq("store_id", storeId);
    if (error) return erNetvaerksfejl(error) ? "netvaerk" : "fejl";
    if (Array.isArray(data)) anvendRemote(storeId, userId, data);
    return "ok";
  } catch (_) {
    return "fejl";
  }
}

// Starter synkroniseringen, så længe nogen bruger kladderne (Forsiden, bookingsiden). Flere kaldere
// deler ÉN motor pr. bruger og butik. Returnerer en funktion, der slipper den igen.
const motorer = new Map();

export function startSync(klient, storeId, userId, { interval = 60000 } = {}) {
  const noegle = `${storeId}|${userId}`;
  const fundet = motorer.get(noegle);
  if (fundet) {
    fundet.antal += 1;
    return () => slip(noegle);
  }

  let kaede = Promise.resolve();
  let timer = null;
  const koer = () => { kaede = kaede.then(() => synkroniserNu(klient, storeId, userId)); return kaede; };
  const planlaeg = () => { clearTimeout(timer); timer = setTimeout(koer, 400); };
  const vedFokus = () => { if (typeof document === "undefined" || document.visibilityState !== "hidden") koer(); };
  const vedSkjul = () => { if (document.visibilityState === "hidden") koer(); };

  saetSyncTrigger(planlaeg);
  const iv = setInterval(koer, interval);
  if (typeof window !== "undefined") {
    window.addEventListener("online", koer);
    window.addEventListener("focus", vedFokus);
    window.addEventListener("pagehide", koer);
    document.addEventListener("visibilitychange", vedSkjul);
  }
  koer();

  motorer.set(noegle, {
    antal: 1,
    stop: () => {
      clearTimeout(timer);
      clearInterval(iv);
      saetSyncTrigger(null);
      if (typeof window !== "undefined") {
        window.removeEventListener("online", koer);
        window.removeEventListener("focus", vedFokus);
        window.removeEventListener("pagehide", koer);
        document.removeEventListener("visibilitychange", vedSkjul);
      }
    },
  });
  return () => slip(noegle);
}

function slip(noegle) {
  const m = motorer.get(noegle);
  if (!m) return;
  m.antal -= 1;
  if (m.antal <= 0) { m.stop(); motorer.delete(noegle); }
}
