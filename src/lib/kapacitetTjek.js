// Klient til Edge Function "kapacitet-tjek" (kapacitetsmotoren, oktober 2026).
// Funktionen henter punkt1-brutto-mål/vægt LIVE på serveren og returnerer kun en renset vurdering (beslutning, regelnavne,
// varenavne, tid/km) - aldrig mål eller vægt. Browseren gemmer og ser dem derfor aldrig.
import { supabase } from "./supabaseClient";

// Bygger det minimale, rensede request-body ud fra bookingens felter. Varelinjens skjulte punkt1Id er kun en reference.
export function byggTjekBody({ dato, bilId, sagId, adresse, minutter, tidsrumId, varelinjer }) {
  return {
    dato, bilId, sagId: sagId || undefined,
    kandidat: {
      adresse: adresse || "", minutter: Number(minutter) || 0, tidsrumId: tidsrumId || "heldag",
      varer: (varelinjer || []).map((l) => ({
        id: l.id,
        navn: [l.maerke, l.model].filter(Boolean).join(" ") || l.varetypeTekst || l.varetypeNavn || "Vare",
        type: l.varetypeNavn || "",
        antal: 1,
        punkt1Id: l.punkt1Id || null,
      })),
    },
  };
}

// Returnerer { ok: true, svar } eller { ok: false, fejl }. Kaster aldrig - en utilgængelig tjeneste må ikke stoppe en booking.
export async function koerKapacitetTjek(body) {
  try {
    const { data, error } = await supabase.functions.invoke("kapacitet-tjek", { body });
    if (error) return { ok: false, fejl: "Kapacitetstjekket er ikke tilgængeligt lige nu." };
    if (!data || typeof data.beslutning !== "string") return { ok: false, fejl: "Kapacitetstjekket gav et uventet svar." };
    return { ok: true, svar: data };
  } catch {
    return { ok: false, fejl: "Kapacitetstjekket er ikke tilgængeligt lige nu." };
  }
}
