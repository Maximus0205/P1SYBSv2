import React, { useEffect, useState } from "react";
import { AlertCircle, MapPin } from "lucide-react";
import { formatLongDate, todayISO, addDays } from "../data/domain";
import { geocodeAddress, geocodeAddresses, drivingDistances, hasOrsKey } from "../lib/geocoding";

const DISTANCE_LIMIT_KM = 5; // vis kun forslag inden for denne afstand
const DAYS_AHEAD = 21; // kig så mange dage frem i tiden efter kommende bookinger
const DEBOUNCE_MS = 600; // vent med at slå adressen op til brugeren er holdt op med at skrive

// Viser forslag til bookingdage/-tider ud fra REEL køreafstand (via
// openrouteservice) til allerede planlagte ordrer — i modsætning til
// AddressSuggestion (i SagFormFields.jsx), som kun tjekker om det er præcis
// samme opgang/ejendom. Denne fanger også "der er 3 ordrer 2 km herfra på
// tirsdag".
//
// Kræver en gratis ORS-nøgle (se src/lib/geocoding.js) — hvis den ikke er
// sat op endnu, vises komponenten slet ikke, så resten af formularen er
// uberørt.
function DistanceSuggestions({ address, date, orders, onUseDate }) {
  const [status, setStatus] = useState("tom"); // tom | soeger | fundet | ingenTraeffer | fejl
  const [suggestions, setSuggestions] = useState([]); // [{ dato, km, orders: [...] }]

  useEffect(() => {
    if (!hasOrsKey()) return;
    if (!address || address.trim().length < 5) { setStatus("tom"); setSuggestions([]); return; }

    let cancelled = false;
    setStatus("soeger");

    const timer = setTimeout(async () => {
      const source = await geocodeAddress(address);
      if (cancelled) return;
      if (!source) { setStatus("fejl"); return; }

      const today = todayISO();
      const lastDate = addDays(today, DAYS_AHEAD);
      const upcomingOrders = (orders || []).filter(
        (s) => s.kunde?.adresse && s.dato >= today && s.dato <= lastDate && s.dato !== date
      );
      if (upcomingOrders.length === 0) { setStatus("ingenTraeffer"); setSuggestions([]); return; }

      const coordMap = await geocodeAddresses(upcomingOrders.map((s) => s.kunde.adresse));
      if (cancelled) return;

      const withCoords = upcomingOrders
        .map((s) => ({ order: s, coord: coordMap.get(s.kunde.adresse.trim().toLowerCase()) }))
        .filter((x) => x.coord);
      if (withCoords.length === 0) { setStatus("ingenTraeffer"); setSuggestions([]); return; }

      const distances = await drivingDistances(source, withCoords.map((x) => x.coord));
      if (cancelled) return;

      const withinLimit = withCoords
        .map((x, i) => ({ ...x, km: distances[i] != null ? distances[i] / 1000 : null }))
        .filter((x) => x.km != null && x.km <= DISTANCE_LIMIT_KM);

      if (withinLimit.length === 0) { setStatus("ingenTraeffer"); setSuggestions([]); return; }

      const perDate = {};
      withinLimit.forEach((x) => {
        const d = x.order.dato;
        if (!perDate[d]) perDate[d] = { dato: d, km: x.km, orders: [] };
        perDate[d].orders.push(x.order);
        perDate[d].km = Math.min(perDate[d].km, x.km);
      });
      const list = Object.values(perDate).sort((a, b) => a.km - b.km || a.dato.localeCompare(b.dato));

      setStatus("fundet");
      setSuggestions(list);
    }, DEBOUNCE_MS);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [address, date, orders]);

  if (!hasOrsKey() || status === "tom") return null;

  return (
    <div className="mb-3 border border-[#3D7A5C] bg-[#3D7A5C10] p-3">
      <p className="text-sm font-semibold text-[#3D7A5C] flex items-center gap-1.5">
        <MapPin size={14} /> Køreafstand til andre bookinger
      </p>

      {status === "soeger" && <p className="text-xs text-[#52697E] mt-1">Tjekker afstand til kommende bookinger...</p>}

      {status === "fejl" && (
        <p className="text-xs text-[#B3261E] mt-1 flex items-center gap-1.5">
          <AlertCircle size={13} /> Kunne ikke slå adressen op lige nu — prøv igen om lidt.
        </p>
      )}

      {status === "ingenTraeffer" && (
        <p className="text-xs text-[#52697E] mt-1">
          Ingen andre bookinger inden for {DISTANCE_LIMIT_KM} km i de kommende {DAYS_AHEAD} dage.
        </p>
      )}

      {status === "fundet" && (
        <>
          <p className="text-xs text-[#52697E] mt-1">Der er allerede planlagte sager tæt på — overvej at samle kørslen:</p>
          <div className="mt-2 space-y-1">
            {suggestions.map((f) => (
              <div key={f.dato} className="bg-white border border-[#D8D0BE] px-2 py-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-[#1C232E]">
                    {formatLongDate(f.dato)}
                    <span className="text-[#3D7A5C] font-semibold"> · ca. {f.km.toFixed(1)} km</span>
                  </span>
                  <button
                    onClick={() => onUseDate(f.dato)}
                    className="text-[10px] font-semibold uppercase tracking-wide text-[#1C232E] border border-[#D8D0BE] hover:border-[#3D7A5C] hover:text-[#3D7A5C] px-2 py-1 shrink-0"
                  >
                    Brug denne dato
                  </button>
                </div>
                {f.orders.map((s) => (
                  <p key={s.id} className="text-[11px] text-[#52697E] flex items-center gap-1 mt-0.5"><MapPin size={10} className="shrink-0" /> {s.kunde.navn} — {s.kunde.adresse}</p>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export { DistanceSuggestions };
