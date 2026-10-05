import { sms } from "../adapters";

// Ankomst-SMS til kunden. Selve kaldet ligger siden oktober 2026 i adapteren src/adapters/sms (uafhængig af
// appen og genbrugelig i andre projekter) - denne fil er blot det gamle navn, så eksisterende kald virker uændret.
//   minutter     hvor lang tid der går - eller, med minutterTil, det MINDSTE
//   minutterTil  valgfri: sendes et interval "mellem <minutter> og <minutterTil>"
export const sendArrivalSms = (args) => sms.sendAnkomstSms(args);
