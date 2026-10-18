import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { ugensDage } from "./dato";

// Appen LÆSER kun sager i denne version. Der skrives ikke til sagerne herfra, så en montør aldrig kan overskrive kontorets rettelser.

export async function hentBiler(butikId) {
  const { data, error } = await supabase.from("vehicles").select("data").eq("store_id", butikId);
  if (error) throw error;
  return (data || []).map((r) => r.data).filter(Boolean);
}

// Medhjælpere har ingen fast bil: bilen er den, de er sat på den enkelte dag (Planlægning -> Dagens hold).
export async function hentHjaelperDage(personId, fra, til) {
  const { data, error } = await supabase.from("day_helpers").select("dato, vehicle_id").eq("person_id", personId).gte("dato", fra).lte("dato", til);
  if (error) throw error;
  const kort = {};
  (data || []).forEach((r) => { kort[r.dato] = r.vehicle_id; });
  return kort;
}

export async function hentSagerInterval(butikId, fra, til) {
  const { data, error } = await supabase
    .from("orders")
    .select("data")
    .eq("store_id", butikId)
    .gte("data->>dato", fra)
    .lte("data->>dato", til);
  if (error) throw error;
  return (data || []).map((r) => r.data).filter(Boolean);
}

const cacheNoegle = (butikId, brugerId, fra) => `p1sybs_montor_rute:${butikId}:${brugerId}:${fra}`;

// Hele ugen hentes i ét kald. Ved netværksfejl vises den sidst hentede uge (med tidspunkt), så ruten kan ses uden forbindelse.
export async function hentUge({ profil, dato }) {
  const dage = ugensDage(dato);
  const fra = dage[0];
  const til = dage[6];
  const noegle = cacheNoegle(profil.butikId, profil.id, fra);
  try {
    const [sager, biler, hjaelper] = await Promise.all([
      hentSagerInterval(profil.butikId, fra, til),
      hentBiler(profil.butikId),
      profil.rolle === "medhjaelper" || !profil.bilId ? hentHjaelperDage(profil.id, fra, til) : Promise.resolve({}),
    ]);
    const uge = { fra, til, sager, biler, hjaelper, hentet: new Date().toISOString(), fraCache: false };
    try { await AsyncStorage.setItem(noegle, JSON.stringify(uge)); } catch { /* cache er kun en bonus */ }
    return uge;
  } catch (e) {
    try {
      const gemt = JSON.parse((await AsyncStorage.getItem(noegle)) || "null");
      if (gemt) return { ...gemt, fraCache: true };
    } catch { /* ingen brugbar cache */ }
    throw e;
  }
}

// Hvilken bil kører brugeren på dagen? Montør: sin faste bil. Medhjælper (eller en uden fast bil): den bil de er sat på.
export function bilForDag(profil, uge, dato) {
  if (profil.rolle === "medhjaelper" || !profil.bilId) return uge?.hjaelper?.[dato] || null;
  return profil.bilId;
}
