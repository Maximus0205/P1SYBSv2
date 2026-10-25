import React, { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { subscribeQueue } from "../lib/offlineQueue";
import { billedKoe } from "../lib/billedKoe";

// Viser montøren, at ændringer venter på at blive sendt (august 2026).
//
// HVORFOR DET ER NØDVENDIGT: offline-køen gør, at arbejdet ikke går tabt
// uden dækning - men uden en synlig markering ser appen præcis ud, som
// om alt er gemt. Det er isoleret set bedre end at tabe arbejdet, men
// det er stadig en usandhed: sagen står ikke i databasen endnu, og
// kollegaen i butikken kan ikke se den. En montør, der kører hjem uden
// at vide, at fem ændringer stadig ligger på telefonen, har ikke fået
// den information, de skulle bruge.
//
// Formuleringen er derfor bevidst BEROLIGENDE, ikke alarmerende: der er
// ikke sket en fejl, og der er intet, montøren skal gøre. Beskeden er en
// oplysning ("det er noteret, det sendes når du har dækning"), ikke en
// advarsel. En rød fejlboks her ville få folk til at indtaste alting én
// gang til uden grund - præcis den adfærd, køen skal fjerne.
//
// Placeret ØVERST, i modsætning til SaveErrorBanner der ligger nederst:
// de to må ikke kunne dække for hinanden, og en rigtig fejl (nederst,
// inden for tommelfingerens rækkevidde) er vigtigere at kunne trykke på
// end denne, som ikke har nogen handling knyttet til sig.
function OfflineBanner() {
  const [antalAendringer, setAntal] = useState(0);
  const [antalBilleder, setAntalBilleder] = useState(0);
  const [offline, setOffline] = useState(typeof navigator !== "undefined" ? navigator.onLine === false : false);

  useEffect(() => subscribeQueue((k) => setAntal(k.length)), []);
  // Billeder, der venter på forbindelse (billedkøen). Afviste billeder tælles ikke med her: de har deres
  // egen markering ved billedet og en fejlbesked, fordi de ikke sendes af sig selv.
  useEffect(() => (billedKoe ? billedKoe.abonner((v) => setAntalBilleder(v.filter((p) => p.tilstand !== "afvist").length)) : undefined), []);

  useEffect(() => {
    const opdater = () => setOffline(navigator.onLine === false);
    window.addEventListener("online", opdater);
    window.addEventListener("offline", opdater);
    return () => {
      window.removeEventListener("online", opdater);
      window.removeEventListener("offline", opdater);
    };
  }, []);

  // Intet at fortælle: der er dækning, og der venter ingenting.
  const antal = antalAendringer + antalBilleder;
  if (antal === 0 && !offline) return null;

  const dele = [];
  if (antalAendringer > 0) dele.push(`${antalAendringer} ${antalAendringer === 1 ? "ændring" : "ændringer"}`);
  if (antalBilleder > 0) dele.push(`${antalBilleder} ${antalBilleder === 1 ? "billede" : "billeder"}`);
  const tekst = antal === 0
    ? "Ingen forbindelse. Det du laver bliver gemt og sendt automatisk, når du har dækning igen."
    : `${dele.join(" og ")} venter på at blive sendt. ${antal === 1 ? "Det sendes" : "De sendes"} automatisk, når du har dækning.`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-40 bg-panel border-b border-line px-3 py-2"
    >
      <p className="text-xs text-ink flex items-center gap-2 max-w-5xl mx-auto">
        {antal > 0 && !offline
          ? <RefreshCw size={14} className="shrink-0 text-muted animate-spin" aria-hidden="true" />
          : <CloudOff size={14} className="shrink-0 text-muted" aria-hidden="true" />}
        <span>{tekst}</span>
      </p>
    </div>
  );
}

export { OfflineBanner };
