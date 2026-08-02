import React, { useEffect, useState } from "react";
import { AlertCircle, MapPin } from "lucide-react";
import { formatDatoLang, todayISO, flytDato } from "../data/appData";
import { geokodAdresse, geokodAdresser, koereafstande, harOrsNoegle } from "../lib/steder";

const AFSTANDSGRAENSE_KM = 5; // vis kun forslag inden for denne afstand
const DAGE_FREM = 21; // kig så mange dage frem i tiden efter kommende bookinger
const DEBOUNCE_MS = 600; // vent med at slå adressen op til brugeren er holdt op med at skrive

// Viser forslag til bookingdage/-tider ud fra REEL køreafstand (via
// openrouteservice) til allerede planlagte sager — i modsætning til
// AdresseForslag ovenfor, som kun tjekker om det er præcis samme
// opgang/ejendom. Denne fanger også "der er 3 sager 2 km herfra på tirsdag".
//
// Kræver en gratis ORS-nøgle (se src/lib/steder.js) — hvis den ikke er sat
// op endnu, vises komponenten slet ikke, så resten af formularen er uberørt.
function AfstandsForslag({ adresse, dato, sager, onBrugDato }) {
  const [status, setStatus] = useState("tom"); // tom | soeger | fundet | ingenTraeffer | fejl
  const [forslag, setForslag] = useState([]); // [{ dato, km, sager: [...] }]

  useEffect(() => {
    if (!harOrsNoegle()) return;
    if (!adresse || adresse.trim().length < 5) { setStatus("tom"); setForslag([]); return; }

    let annulleret = false;
    setStatus("soeger");

    const timer = setTimeout(async () => {
      const kilde = await geokodAdresse(adresse);
      if (annulleret) return;
      if (!kilde) { setStatus("fejl"); return; }

      const idag = todayISO();
      const sidsteDato = flytDato(idag, DAGE_FREM);
      const kommendeSager = (sager || []).filter(
        (s) => s.kunde?.adresse && s.dato >= idag && s.dato <= sidsteDato && s.dato !== dato
      );
      if (kommendeSager.length === 0) { setStatus("ingenTraeffer"); setForslag([]); return; }

      const koordMap = await geokodAdresser(kommendeSager.map((s) => s.kunde.adresse));
      if (annulleret) return;

      const medKoord = kommendeSager
        .map((s) => ({ sag: s, koord: koordMap.get(s.kunde.adresse.trim().toLowerCase()) }))
        .filter((x) => x.koord);
      if (medKoord.length === 0) { setStatus("ingenTraeffer"); setForslag([]); return; }

      const afstande = await koereafstande(kilde, medKoord.map((x) => x.koord));
      if (annulleret) return;

      const indenforGraense = medKoord
        .map((x, i) => ({ ...x, km: afstande[i] != null ? afstande[i] / 1000 : null }))
        .filter((x) => x.km != null && x.km <= AFSTANDSGRAENSE_KM);

      if (indenforGraense.length === 0) { setStatus("ingenTraeffer"); setForslag([]); return; }

      const perDato = {};
      indenforGraense.forEach((x) => {
        const d = x.sag.dato;
        if (!perDato[d]) perDato[d] = { dato: d, km: x.km, sager: [] };
        perDato[d].sager.push(x.sag);
        perDato[d].km = Math.min(perDato[d].km, x.km);
      });
      const liste = Object.values(perDato).sort((a, b) => a.km - b.km || a.dato.localeCompare(b.dato));

      setStatus("fundet");
      setForslag(liste);
    }, DEBOUNCE_MS);

    return () => { annulleret = true; clearTimeout(timer); };
  }, [adresse, dato, sager]);

  if (!harOrsNoegle() || status === "tom") return null;

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
          Ingen andre bookinger inden for {AFSTANDSGRAENSE_KM} km i de kommende {DAGE_FREM} dage.
        </p>
      )}

      {status === "fundet" && (
        <>
          <p className="text-xs text-[#52697E] mt-1">Der er allerede planlagte sager tæt på — overvej at samle kørslen:</p>
          <div className="mt-2 space-y-1">
            {forslag.map((f) => (
              <div key={f.dato} className="flex items-center justify-between gap-2 bg-white border border-[#D8D0BE] px-2 py-1.5 flex-wrap">
                <span className="text-xs text-[#1C232E]">
                  {formatDatoLang(f.dato)} — {f.sager.map((s) => s.kunde.navn).join(", ")}
                  <span className="text-[#3D7A5C] font-semibold"> · ca. {f.km.toFixed(1)} km</span>
                </span>
                <button
                  onClick={() => onBrugDato(f.dato)}
                  className="text-[10px] font-semibold uppercase tracking-wide text-[#1C232E] border border-[#D8D0BE] hover:border-[#3D7A5C] hover:text-[#3D7A5C] px-2 py-1 shrink-0"
                >
                  Brug denne dato
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export { AfstandsForslag };
