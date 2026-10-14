// Klient til Edge Function "kapacitet-tjek" (kapacitetsmotoren, oktober 2026).
// Funktionen henter punkt1-brutto-mål/vægt LIVE på serveren og returnerer kun en renset vurdering (beslutning, regelnavne,
// varenavne, tid/km) - aldrig mål eller vægt. Browseren gemmer og ser dem derfor aldrig.
import { supabase } from "./supabaseClient";

// Bygger det minimale, rensede request-body ud fra bookingens felter. Varelinjens skjulte punkt1Id er kun en reference.
export function byggTjekBody({ dato, bilId, sagId, adresse, koordinater, minutter, tidsrumId, varelinjer }) {
  return {
    dato, bilId, sagId: sagId || undefined,
    kandidat: {
      adresse: adresse || "", minutter: Number(minutter) || 0, tidsrumId: tidsrumId || "heldag",
      // Skjulte koordinater fra Adressevælgeren (kun til beregningen; vises aldrig) - så tjekket regner på de samme koordinater som Planlægning.
      ...(Number.isFinite(koordinater?.lat) && Number.isFinite(koordinater?.lon) ? { lat: koordinater.lat, lon: koordinater.lon } : {}),
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

// ---- Forslag til ny dato/bil (ombooking) ----
// Samme rensede kandidat som tjekket. fraDato er valgfri (serveren bruger i morgen); ekskluder = sagens nuværende tid, så den ikke foreslås igen.
export function byggForslagBody({ fraDato, sagId, adresse, koordinater, minutter, tidsrumId, varelinjer, nuvaerende }) {
  const { kandidat } = byggTjekBody({ dato: "2000-01-01", bilId: "x", adresse, koordinater, minutter, tidsrumId, varelinjer });
  return {
    handling: "forslag", sagId: sagId || undefined, fraDato: fraDato || undefined,
    ekskluder: nuvaerende?.dato && nuvaerende?.bilId ? { dato: nuvaerende.dato, bilId: nuvaerende.bilId } : undefined,
    kandidat,
  };
}

// { ok: true, forslag, noter } | { ok: false, fejl }. Kaster aldrig.
export async function hentOmbookingsForslag(body) {
  try {
    const { data, error } = await supabase.functions.invoke("kapacitet-tjek", { body });
    if (error) {
      const status = error.context?.status;
      return { ok: false, fejl: status === 429 ? "Der er søgt mange gange på kort tid. Vent et øjeblik, og prøv igen." : "Forslag er ikke tilgængelige lige nu." };
    }
    if (!data || !Array.isArray(data.forslag)) return { ok: false, fejl: "Forslagene gav et uventet svar." };
    return { ok: true, forslag: data.forslag, noter: Array.isArray(data.noter) ? data.noter : [], fra: data.fra, til: data.til };
  } catch {
    return { ok: false, fejl: "Forslag er ikke tilgængelige lige nu." };
  }
}
