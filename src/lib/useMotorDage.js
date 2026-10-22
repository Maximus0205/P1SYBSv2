// Tidsbadget for hver bil og dag i en uge - beregnet af kapacitetsmotoren (via lib/motorStop.js beregnDagMotor), til booking-ugevisningerne
// (ugekapacitet og dato-vælger). Samme beregning som i Planlægning, så tallene aldrig er uenige.
import { useEffect, useState } from "react";
import { hentKapGrundlag, beregnDagMotor, dagSignatur, lagerKoordinatAsync } from "./motorStop";
import { badgeFraMotor } from "./dagsplan";

// dage: ["2026-11-09", ...]. Returnerer { badges: { "bilId|dato": badge }, loading }. badge = { minutter, overbelastet, fejl, titel } (se dagsplan.badgeFraMotor).
// Kun biler med sager den dag beregnes; en bil uden sager har ingen badge. Sager uden bil ("ikke tildelt") kan motoren ikke regne på.
export function useMotorDage({ orders, dage, vehicles, technicians, personnel, timeOff, crew, store }) {
  const [badges, setBadges] = useState({});
  const [loading, setLoading] = useState(false);

  const grupper = {};
  for (const t of technicians || []) {
    for (const d of dage) {
      const list = (orders || []).filter((o) => o.bilId === t.id && o.dato === d && o.status !== "afsluttet");
      if (list.length > 0) grupper[`${t.id}|${d}`] = list;
    }
  }
  const lager = store?.lat != null && store?.lon != null ? { lat: store.lat, lon: store.lon } : null;
  const signatur = Object.entries(grupper).map(([k, l]) => `${k}:${dagSignatur(l)}`).join(";")
    + `|lager:${lager ? `${lager.lat},${lager.lon}` : "-"}|store:${store?.id || ""}`
    + `|pers:${(personnel || []).map((p) => `${p.id}>${p.bilId}:${p.rolle || ""}`).join(",")}|fravaer:${(timeOff || []).map((f) => `${f.montorId}:${f.startDato}-${f.slutDato || ""}:${f.type || ""}`).join(",")}`
    + `|bil:${(vehicles || []).map((v) => `${v.id}:${v.tempo ?? ""}:${v.nyttelastKg ?? ""}`).join(",")}|hold:${(crew?.helpers || []).map((h) => `${h.dato}:${h.personId}>${h.vehicleId}`).join(",")}`;

  useEffect(() => {
    let cancelled = false;
    const keys = Object.keys(grupper);
    if (keys.length === 0) { setBadges({}); setLoading(false); return undefined; }
    (async () => {
      setLoading(true);
      const grundlag = await hentKapGrundlag(store?.id);
      const lagerPkt = await lagerKoordinatAsync(store, grundlag);
      const entries = await Promise.all(keys.map(async (key) => {
        if (grundlag.fejl) return [key, { minutter: null, overbelastet: false, fejl: grundlag.fejl, titel: grundlag.fejl }];
        try {
          const [bilId, dato] = key.split("|");
          return [key, badgeFraMotor(await beregnDagMotor({ bilId, dato, list: grupper[key], vehicles, technicians, personnel, timeOff, crew, grundlag, lager: lagerPkt }))];
        } catch (e) {
          const fejl = `Beregningen fejlede: ${e?.message || e}`;
          return [key, { minutter: null, overbelastet: false, fejl, titel: fejl }];
        }
      }));
      if (!cancelled) { setBadges(Object.fromEntries(entries)); setLoading(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatur]);

  return { badges, loading };
}
