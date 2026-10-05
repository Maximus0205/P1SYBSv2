// Adresseopslag, afstande og køretid. Selve logikken ligger siden oktober 2026 i adapteren src/adapters/ors
// (uafhængig af appen og genbrugelig i andre projekter); den kalder Edge Functionen ors-proxy, så ORS-nøglen
// kun findes server-side. Denne fil er de gamle navne, så eksisterende kald virker uændret.
import { ors } from "../adapters";
import { udtagPostnummerHint } from "../adapters/ors";

export const extractPostalCodeHint = udtagPostnummerHint;
export const geocodeAddress = (adresse, fokus) => ors.geokod(adresse, fokus);
export const validateAddress = (adresse, fokus) => ors.valider(adresse, fokus);
export const searchAddressSuggestions = (delvisAdresse, fokus) => ors.adresseforslag(delvisAdresse, fokus);
export const geocodeAddresses = (adresser) => ors.geokodListe(adresser);
export const drivingDistances = (kilde, destinationer) => ors.koerselsafstande(kilde, destinationer);
export const routeDrivingTime = (punkterIRaekkefoelge) => ors.koerselstid(punkterIRaekkefoelge);
export const optimalVisitOrder = (punkter) => ors.bedsteRaekkefoelge(punkter);

// Gammelt navn: nu altid "true" for indloggede brugere, da nøglen ikke længere ligger i en lokal .env.
export const hasOrsKey = () => true;
