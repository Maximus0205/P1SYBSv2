// Vedhæftninger: billeder, underskrifter og anden dokumentation på en sag
// (august 2026).
//
// HVORFOR EN NY FIL OG IKKE I dataStore.js: dataStore taler med
// DATABASEN. Dette modul taler med et FILLAGER gennem en Edge Function,
// har sit eget to-fase-flow og sin egen fejlhåndtering. Det er en
// selvstændig bekymring, og dataStore er stor nok i forvejen.
//
// BAGGRUND: billeder og underskrifter lå som base64 direkte i sagens
// jsonb-blob. Én sag med billeder fylder 2,5 MB, og appen henter ALLE
// butikkens sager med hele blobben ved hver indlæsning - også på
// montørernes mobiler. Filerne ligger nu i et fillager, og sagen gemmer
// kun en reference.
//
// HVOR FILEN LIGGER er butikkens valg: enten en bøtte, vi hoster, eller
// en de selv skaffer. Det er bevidst usynligt herfra - klienten kender
// kun vedhæftningens id og beder Edge Function'en om en URL. Skifter en
// butik lagerplads, ændres intet i frontenden.
//
// TO FASER VED UPLOAD:
//   1. start-upload    -> serveren opretter en "pending"-række og giver
//                         en signeret upload-URL
//   2. selve uploaden  -> browseren sender filen direkte til lageret
//   3. bekraeft-upload -> serveren tjekker at filen FAKTISK kom frem,
//                         læser dens rigtige størrelse og aktiverer den
//
// Mister mobilen dækning midt i trin 2 - hvilket sker, når montøren står
// i en kælder - efterlades kun en pending-række, som ryddes op
// automatisk. Sagen kommer ALDRIG til at pege på en fil, der ikke findes.

import { supabase } from "./supabaseClient";
import { logError } from "./errorLog";
import { reportSaveFailure } from "./saveStatus";

const FUNKTION = "sagsdokumentation";

// Edge Functions sender deres rigtige fejlbesked som { fejl: "..." } i
// svarets body. Uden dette viser supabase-js kun en generisk
// "non-2xx status code"-tekst. Samme mønster som readEdgeFunctionError i
// dataStore.js.
async function laesFejl(data, error, standardBesked) {
  if (data?.fejl) return data.fejl;
  if (error?.context && typeof error.context.clone === "function") {
    try {
      const body = await error.context.clone().json();
      if (body?.fejl) return body.fejl;
    } catch (_) {
      // Ikke JSON - brug standardbeskeden nedenfor.
    }
  }
  return error?.message || standardBesked;
}

async function kald(krop, standardBesked) {
  const { data, error } = await supabase.functions.invoke(FUNKTION, { body: krop });
  if (error || data?.fejl) {
    const fejl = await laesFejl(data, error, standardBesked);
    logError(`attachments:${krop.handling}`, fejl);
    return { ok: false, fejl };
  }
  return { ok: true, ...data };
}

// Henter en sags vedhæftninger. Kun 'active' - en afbrudt upload skal
// ikke vises som et billede, der ikke kan hentes.
export async function getAttachments(storeId, orderId) {
  if (!storeId || !orderId) return [];
  const { data, error } = await supabase
    .from("attachments")
    .select("id, kind, navn, mime_type, bytes, created_at, created_by")
    .eq("store_id", storeId)
    .eq("order_id", String(orderId))
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) {
    logError("attachments:getAttachments", error.message);
    return [];
  }
  return data || [];
}

// Signeret URL til at VISE en vedhæftning. Kortlivet med vilje - en URL
// der virker for evigt, er reelt en offentlig fil, og en sagsmappe
// indeholder billeder fra kundens hjem og deres underskrift.
//
// Derfor må den heller ikke gemmes i sagen eller caches langtidsholdbart:
// hent den, når billedet skal vises.
export async function getAttachmentUrl(attachmentId) {
  return kald({ handling: "hent-url", vedhaeftningId: attachmentId }, "Kunne ikke hente filen");
}

// Uploader én fil. Kører hele to-fase-flowet og melder selv fejl videre
// til brugeren (se lib/saveStatus.js) - en upload, der fejler i stilhed,
// er præcis den fejltype, montøren opdager for sent.
//
// onProgress kaldes med 'starter' | 'sender' | 'bekraefter', så
// kaldende UI kan vise hvad der sker. En upload over mobildata tager
// tid nok til, at en tavs knap føles som om appen er gået i stå.
export async function uploadAttachment({ orderId, file, kind, onProgress }) {
  if (!orderId || !file) return { ok: false, fejl: "Mangler sag eller fil" };

  onProgress?.("starter");
  const start = await kald({
    handling: "start-upload",
    sagId: String(orderId),
    filnavn: file.name,
    mimeType: file.type,
    kind: kind || "billede",
  }, "Kunne ikke starte uploaden");
  if (!start.ok) {
    reportSaveFailure(`Dokumentationen blev ikke gemt: ${start.fejl}`);
    return start;
  }

  onProgress?.("sender");
  const { error: uploadFejl } = await supabase.storage
    .from("sagsdokumentation")
    .uploadToSignedUrl(start.lagerNoegle, start.token, file, {
      contentType: file.type || "application/octet-stream",
    });
  if (uploadFejl) {
    // Den pending-række, serveren oprettede, bliver stående og ryddes op
    // automatisk. Vi forsøger IKKE at slette den her: fejlede uploaden på
    // grund af manglende netværk, vil et oprydningskald fejle af samme
    // grund, og så ville vi bare skjule den rigtige fejl bag en ny.
    logError("attachments:upload", uploadFejl.message);
    reportSaveFailure(`Dokumentationen blev ikke gemt: ${uploadFejl.message}`);
    return { ok: false, fejl: uploadFejl.message };
  }

  onProgress?.("bekraefter");
  const bekraeft = await kald({
    handling: "bekraeft-upload",
    vedhaeftningId: start.vedhaeftningId,
  }, "Filen blev sendt, men kunne ikke bekræftes");
  if (!bekraeft.ok) {
    reportSaveFailure(`Dokumentationen blev ikke gemt: ${bekraeft.fejl}`);
    return bekraeft;
  }

  return {
    ok: true,
    id: start.vedhaeftningId,
    bytes: bekraeft.bytes,
    // Sat når butikken nærmer sig sin kvote. Kun en ADVARSEL - uploaden
    // er allerede gennemført. En montør hos kunden må aldrig blokeres af
    // en kvote; det er en samtale mellem os og butikkens administrator,
    // ikke noget der skal stoppe en underskrift midt i en aflevering.
    pladsAdvarsel: start.pladsAdvarsel ?? null,
  };
}

// Markerer en vedhæftning til sletning. Fjerner IKKE rækken: selve filen
// skal væk fra lageret først, ellers står der en fil, ingen kan se, men
// som stadig fylder i butikkens forbrug. Oprydningsjobbet fjerner begge
// dele i den rigtige rækkefølge.
export async function markAttachmentForDeletion(attachmentId) {
  const { error } = await supabase
    .from("attachments").update({ status: "deleting" }).eq("id", attachmentId);
  if (error) {
    logError("attachments:markForDeletion", error.message);
    reportSaveFailure(`Kunne ikke fjerne dokumentationen: ${error.message}`);
    return { ok: false, fejl: error.message };
  }
  return { ok: true };
}

// Lagerforbrug pr. butik - til Admin/System. Kvoten er NULL, når butikken
// selv skaffer lagerplads: et fillager har ikke noget "ledig plads"-
// begreb, og disken bag det er butikkens eget anliggende. Så vises kun
// forbruget. Et opdigtet "tilgængeligt"-tal ville være værre end
// ingenting, og UI'et skal derfor tjekke for null frem for at regne med 0.
export async function getStorageUsage(storeId) {
  let query = supabase
    .from("store_storage_usage")
    .select("store_id, store_name, brugt_bytes, kvote_bytes, ledig_bytes, pct_brugt, antal_filer, antal_afbrudte");
  if (storeId) query = query.eq("store_id", storeId);
  const { data, error } = await query;
  if (error) {
    logError("attachments:getStorageUsage", error.message);
    return [];
  }
  return data || [];
}

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
