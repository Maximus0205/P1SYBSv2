import React, { useEffect, useState } from "react";
import { Sparkles, RefreshCw, X } from "lucide-react";
import { subscribeNewVersion } from "../lib/versionCheck";

// BESKED OM EN NY UDGIVELSE (september 2026) - se lib/versionCheck.js for
// baggrunden (GitHub Pages kan ikke sætte cache-headers, så browseren kan
// blive hængende i en gammel udgave af appen).
//
// Monteret ÉN gang i main.jsx, ligesom OfflineBanner og SaveErrorBanner -
// se noterne der for hvorfor (overlever navigation og en evt. render-crash
// i selve App).
//
// BEVIDST IKKE ET AUTOMATISK GENINDLÆS: en montør kan stå midt i en
// ufærdig rapport eller et åbent formularfelt, når en ny udgivelse
// dukker op. Et automatisk reload ville tabe det arbejde uden varsel -
// præcis den slags stille datatab, appen ellers går langt for at undgå.
// Beskeden bliver derfor stående, indtil brugeren selv trykker Genindlæs
// (når det passer dem), eller lukker den og fortsætter uden at opdatere
// nu - den dukker op igen ved næste periodiske tjek.
//
// PLACERING: øverst, som OfflineBanner - dette er en oplysning, ikke en
// fejl, og skal ikke kunne forveksles med eller dække for
// SaveErrorBanner (nederst), som er den vigtigste af de tre at kunne se
// og trykke på.
function UpdateAvailableBanner() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => subscribeNewVersion(setVisible), []);

  if (!visible || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-30 bg-ink text-white px-3 py-2"
    >
      <div className="flex items-center gap-2 max-w-5xl mx-auto">
        <Sparkles size={14} className="shrink-0" aria-hidden="true" />
        <p className="text-xs flex-1">Der er kommet en ny udgave af appen. Genindlæs for at få de seneste ændringer.</p>
        <button
          onClick={() => window.location.reload()}
          className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wide bg-white text-ink hover:bg-panel transition-colors flex items-center gap-1.5"
        >
          <RefreshCw size={12} aria-hidden="true" /> Genindlæs
        </button>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Luk besked om ny udgave"
          className="shrink-0 w-9 h-9 -my-1 flex items-center justify-center rounded-lg text-white/70 hover:text-white focus:outline-none focus:ring-2 focus:ring-white"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export { UpdateAvailableBanner };
