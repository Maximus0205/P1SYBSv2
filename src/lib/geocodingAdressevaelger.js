// Klimadatastyrelsens Adressevælger (adressevaelger.dk) - den officielle erstatning for DAWA's autocomplete
// (DAWA lukker 1. oktober 2026). Selve logikken ligger siden oktober 2026 i adapteren
// src/adapters/adressevaelger (uafhængig af appen og genbrugelig i andre projekter). Denne fil er de gamle navne,
// så eksisterende kald virker uændret.
import { adressevaelger } from "../adapters";

export { utm32ToWgs84 } from "../adapters/adressevaelger";
export const searchAdressevaelger = (raa, kommunekode, handling, standardPostnummer, maksimum) => adressevaelger.soeg(raa, kommunekode, handling, standardPostnummer, maksimum);
export const lookupAdressevaelgerCoordinates = (id, type) => adressevaelger.opslagKoordinater(id, type);
export const resolveStoreKommuneKode = (adresse) => adressevaelger.findKommunekode(adresse);
