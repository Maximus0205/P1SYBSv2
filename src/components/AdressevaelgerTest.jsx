import React, { useState } from "react";
import { Search, MapPin, Loader2, ExternalLink, FlaskConical } from "lucide-react";
import { searchAdressevaelger, lookupAdressevaelgerCoordinates } from "../lib/geocodingAdressevaelger";

// ---------------------------------------------------------------------------
// FORSØG (september 2026): Klimadatastyrelsens Adressevælger - den
// officielle erstatning for DAWA (som lukker 1. oktober 2026).
//
// Denne komponent er BEVIDST ISOLERET: den er ikke koblet til nogen del af
// bookingflowet eller andre adressefelter i appen (se AddressInput.jsx,
// som stadig uændret bruger OpenRouteService via lib/geocoding.js). Formålet
// er udelukkende at kunne AFPRØVE og SAMMENLIGNE Adressevælgerens
// søgekvalitet - fx netop de tilfælde der var buggy i den nuværende løsning
// ("Fuglebakken 5750") - før nogen beslutning tages om at skifte selve
// appens adressefelter over.
function AdressevaelgerTest() {
  const [tekst, setTekst] = useState("");
  const [postnummer, setPostnummer] = useState("");
  const [loading, setLoading] = useState(false);
  const [fejl, setFejl] = useState("");
  const [fund, setFund] = useState([]);
  const [koordinater, setKoordinater] = useState({}); // id -> {lat, lon} | "henter" | "fejl"

  const soeg = async () => {
    if (!tekst.trim()) return;
    setLoading(true); setFejl(""); setFund([]); setKoordinater({});
    const result = await searchAdressevaelger(tekst.trim(), { postnummer: postnummer.trim() || undefined });
    setLoading(false);
    if (!result.ok) { setFejl(result.fejl); return; }
    setFund(result.fund);
  };

  const slaaKoordinaterOp = async (item) => {
    setKoordinater((prev) => ({ ...prev, [item.id]: "henter" }));
    const coords = await lookupAdressevaelgerCoordinates(item.id, item.type);
    setKoordinater((prev) => ({ ...prev, [item.id]: coords || "fejl" }));
  };

  return (
    <div className="rounded-xl border border-brand bg-brand/5 p-4 mt-6">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1 flex items-center gap-1.5">
        <FlaskConical size={15} className="text-brand" aria-hidden="true" /> Forsøg: Adressevælgeren (erstatning for DAWA)
      </h3>
      <p className="text-xs text-muted mb-3">
        Rent testværktøj - ikke koblet til bookingflowet eller noget andet adressefelt i appen. Bruges til at sammenligne søgekvaliteten med den nuværende løsning (OpenRouteService), inden en eventuel beslutning om at skifte.
      </p>

      <div className="flex gap-2 flex-wrap mb-3">
        <input
          value={tekst}
          onChange={(e) => setTekst(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") soeg(); }}
          placeholder="Fx 'Fuglebakken' eller 'Fuglsang'"
          aria-label="Søgetekst"
          className="flex-1 min-w-[160px] rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
        />
        <input
          value={postnummer}
          onChange={(e) => setPostnummer(e.target.value)}
          placeholder="Postnr. (valgfrit), fx 5750"
          aria-label="Postnummer"
          className="w-40 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
        />
        <button
          onClick={soeg}
          disabled={loading || !tekst.trim()}
          className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Search size={14} aria-hidden="true" />} Søg
        </button>
      </div>

      {fejl && <p className="text-xs text-danger mb-2">{fejl}</p>}

      {fund.length > 0 && (
        <div className="space-y-1.5">
          {fund.map((f) => {
            const k = koordinater[f.id];
            return (
              <div key={f.id} className="flex items-center justify-between gap-2 rounded-lg bg-white border border-line px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">{f.titel}</p>
                  <p className="text-[10px] text-muted uppercase tracking-wide">
                    {f.type}
                    {f.antalHusnumre != null && ` · ${f.antalHusnumre} husnumre`}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {k === "henter" && <Loader2 size={13} className="animate-spin text-muted" aria-hidden="true" />}
                  {k === "fejl" && <span className="text-[10px] text-danger">Ingen koordinater</span>}
                  {k && typeof k === "object" && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${k.lat},${k.lon}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-mono text-brand hover:underline flex items-center gap-1"
                    >
                      {k.lat.toFixed(5)}, {k.lon.toFixed(5)} <ExternalLink size={10} aria-hidden="true" />
                    </a>
                  )}
                  {!k && (f.type === "husnummer" || f.type === "adresse") && (
                    <button onClick={() => slaaKoordinaterOp(f)} className="text-[10px] font-semibold uppercase tracking-wide text-muted hover:text-brand flex items-center gap-1 px-1 py-1">
                      <MapPin size={11} aria-hidden="true" /> Koordinater
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!loading && !fejl && fund.length === 0 && tekst && (
        <p className="text-xs text-muted italic">Søg for at se resultater.</p>
      )}
    </div>
  );
}

export { AdressevaelgerTest };
