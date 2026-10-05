// SAMMENSÆTNINGEN af adaptere til DENNE app (oktober 2026).
//
// Dette er den ENESTE fil i src/adapters, der kender til appen: den giver adapterne den Supabase-klient og
// den fejl-log, appen bruger. Alt andet i mappen er uafhængigt af appen og kan løftes direkte ind i et andet
// projekt - dér laver man blot en tilsvarende, lille index.js. Se README.md.
import { supabase } from "../lib/supabaseClient";
import { logError } from "../lib/errorLog";
import { opretEdgeTransport } from "./core/edgeTransport";
import { opretPosAdapter } from "./pos";
import { opretSmsAdapter } from "./sms";
import { opretPunkt1Adapter } from "./punkt1";

const log = (kilde, besked) => logError(kilde, besked);
const transport = opretEdgeTransport({ klient: supabase, log });

// kapabiliteter.synkVedAfslutning er SLÅET FRA, til Flow Retails API er koblet på (se pos/index.js).
export const pos = opretPosAdapter({ transport, klient: supabase, log, kapabiliteter: { synkVedAfslutning: false } });
export const sms = opretSmsAdapter({ transport });
export const punkt1 = opretPunkt1Adapter({ transport });
