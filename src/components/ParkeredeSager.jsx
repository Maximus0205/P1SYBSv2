import React from "react";
import { OrderDrafts } from "./OrderDrafts";
import { useKladder } from "../hooks/useKladder";
import { bedOmGenoptagelse, fjernKladde } from "../lib/orderDrafts";

// Parkerede (påbegyndte) sager i "Opret sag"-widgetten på Forsiden (oktober 2026).
//
// Listen hentes med useKladder, som kun giver DEN INDLOGGEDE brugers kladder i den aktuelle
// butik - en anden sælger ser aldrig dine, heller ikke på samme computer (se
// lib/orderDrafts.js: hentKladder). Vises intet, når der ingen er.
//
// "Fortsæt" husker, hvilken kladde der skal genoptages, og sender brugeren videre til
// bookingformularen (onGenoptag), som åbner den præcis, hvor man slap.
function ParkeredeSager({ storeId, onGenoptag }) {
  const { kladder } = useKladder(storeId);
  return (
    <OrderDrafts
      kompakt
      kladder={kladder}
      onResume={(k) => { bedOmGenoptagelse(k.id); onGenoptag(); }}
      onDiscard={(k) => fjernKladde(k.id)}
    />
  );
}

export { ParkeredeSager };
