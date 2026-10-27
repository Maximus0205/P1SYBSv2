// REVISIONSSPOR FOR OVERSTYRET KAPACITETSTJEK (oktober 2026): når en bruger med retten "Overrule kapacitetsmotoren" booker trods en blokerende regel,
// gemmes { regler, tidspunkt, af } på sagen (kun regelnavne - aldrig mål eller vægt). Denne hjælper gør det til tekst, så det kan VISES på sagen.
import { REGLER } from "../engine/kapacitet/indstillinger.js";

export const regelTekst = (id) => REGLER[id] || String(id);

// rec = order.kapacitetOverrulet. Returnerer null, hvis sagen ikke er overstyret.
export function overrulningTekst(rec) {
  if (!rec || typeof rec !== "object") return null;
  const d = rec.tidspunkt ? new Date(rec.tidspunkt) : null;
  const gyldig = d && !Number.isNaN(d.getTime());
  const hvornaar = gyldig
    ? `${d.toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" })} kl. ${d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}`
    : "";
  const regler = (Array.isArray(rec.regler) ? rec.regler : []).map(regelTekst);
  return { af: rec.af?.navn || "", hvornaar, regler };
}
