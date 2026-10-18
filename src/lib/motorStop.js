// Fælles omsætning fra app-data til kapacitetsmotorens input - brugt af Planlægning (badget) og forslagene (booking, "Kræver handling"),
// så begge regner på præcis de samme stop (se lib/dagsplan.js og lib/forslagMotor.js). Hører til app-laget (importerer domænedata og ORS-adapteren).
import { orderExpectedMinutes, buildTitle, timeSlotById, todayISO } from "../data/domain";
import { tilMin } from "../engine/kapacitet";
import { ors } from "../adapters";
import { hentKapacitetsIndstillinger, hentArbejdstider, hentUaendringer } from "./kapacitetStore";
import { koordinaterForKunde } from "./adresseKoordinater";
import { bilTilMotor, personerTilMotor, beregnBilDag } from "./dagsplan";

// En sag som motor-stop. Koordinaterne er de gemte fra Adressevælgeren (skjult på sagen) - mangler de, får stoppet ingen lat/lon, og motoren melder
// "kan ikke beregnes" i stedet for at regne 0 min kørsel.
export function ordreTilStop(o) {
  const k = koordinaterForKunde(o.kunde);
  const slot = timeSlotById(o.tidsrumId || "heldag");
  const fra = tilMin(o.start || slot.start); const til = tilMin(o.slut || slot.slut);
  const heldag = (o.tidsrumId || "heldag") === "heldag";
  return {
    id: String(o.id), navn: o.kunde?.navn || buildTitle(o.varelinjer) || "Sag", adresse: o.kunde?.adresse || "", lat: k?.lat ?? null, lon: k?.lon ?? null,
    kraever2Mand: !!o.toMand,
    minutter: orderExpectedMinutes(o), tidsrum: !heldag && fra !== null && til !== null ? { fra, til } : null,
    // Sagerne har endnu hverken vægt eller mål pr. vare: motoren regner derfor kun TID her (ikke last/plads) og siger det i sine advarsler.
    varer: (o.varelinjer || []).map((l) => ({ id: String(l.id), navn: l.varetypeNavn || "Vare", type: l.varetypeNavn || "", antal: 1, vaegtKg: null, maal: null })),
  };
}

// Butikkens kapacitetsindstillinger + arbejdstider + "ikke tilgængelig"-tidsrum. { indstillinger, arbejdstider, uaendringer } eller { fejl }.
// Gemmes kort (30 sek.) pr. butik, så flere forslag/ugevisninger lige efter hinanden ikke henter det samme igen og igen.
const grundlagCache = new Map();
export async function hentKapGrundlag(storeId) {
  if (!storeId) return { fejl: "Butikken er ikke indlæst." };
  const hit = grundlagCache.get(storeId);
  if (hit && Date.now() - hit.t < 30000) return hit.v;
  try {
    const [indstillinger, arbejdstider, uaendringer] = await Promise.all([hentKapacitetsIndstillinger(storeId), hentArbejdstider(storeId), hentUaendringer(storeId, todayISO())]);
    const v = indstillinger ? { indstillinger, arbejdstider, uaendringer } : { fejl: "Butikkens kapacitetsindstillinger kunne ikke hentes." };
    if (!v.fejl) grundlagCache.set(storeId, { t: Date.now(), v });
    return v;
  } catch (e) {
    return { fejl: `Kapacitetsindstillinger kunne ikke hentes: ${e?.message || e}` };
  }
}

// Rigtig køretidsmatrix (ORS). null hvis den ikke kan hentes - motoren skønner så og melder det.
export async function hentMotorMatrix(punkter) {
  try { return await ors.koerselsmatrix(punkter); } catch { return null; }
}

// Én bils dag gennem kapacitetsmotoren med dagens rigtige personer og en rigtig køretidsmatrix (ORS). Den ENESTE vej til en bils dagstid i appen:
// Planlægning (badge, "foreslå rækkefølge") og booking-ugevisningerne bruger den, så de aldrig kan være uenige. Returnerer { res } eller { fejl }.
export async function beregnDagMotor({ bilId, dato, list, vehicles, technicians, personnel, timeOff, crew, grundlag, lager }) {
  const stop = list.map(ordreTilStop);
  const vRow = (vehicles || []).find((v) => v.id === bilId);
  const tRow = (technicians || []).find((t) => t.id === bilId);
  const bil = bilTilMotor(vRow, tRow);
  const hjaelperIds = (crew?.helpers || []).filter((h) => h.dato === dato && h.vehicleId === bilId).map((h) => h.personId);
  const bortePersonIds = (crew?.helpers || []).filter((h) => h.dato === dato && h.vehicleId !== bilId).map((h) => h.personId);
  const { personer, pauseMin } = personerTilMotor({ dato, bilId, personnel, timeOff, arbejdstider: grundlag.arbejdstider, uaendringer: grundlag.uaendringer, indstillinger: grundlag.indstillinger, hjaelperIds, bortePersonIds });
  const lagerPunkt = lager ? { id: "lager", lat: lager.lat, lon: lager.lon } : undefined;
  const punkter = [...(lagerPunkt ? [lagerPunkt] : []), ...stop.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon)).map((s) => ({ id: s.id, lat: s.lat, lon: s.lon }))];
  const matrix = punkter.length >= 2 ? await hentMotorMatrix(punkter) : null;
  return beregnBilDag({ dato, bil, personer, pauseMin, stop, matrix: matrix || undefined, lager: lagerPunkt, indstillinger: grundlag.indstillinger });
}

// Alt ved en dags sager, der kan ændre motorens resultat - til at afgøre, om en beregning skal køres igen.
export function dagSignatur(list) {
  return list.map((o) => { const c = koordinaterForKunde(o.kunde); return `${o.id}|${o.kunde?.adresse || ""}|${c ? `${c.lat},${c.lon}` : "-"}|${o.tidsrumId || ""}|${o.start || ""}|${o.slut || ""}|${orderExpectedMinutes(o)}|${o.toMand ? 1 : 0}`; }).join(",");
}
