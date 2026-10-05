import { pos } from "../adapters";

// Er POS-integrationen slået til for brugerens egen butik? (aktiveret OG nøgle gemt). Kun ja/nej - aldrig nøgle
// eller adresse. Selve kaldet ligger siden oktober 2026 i adapteren src/adapters/pos; denne fil er det gamle navn,
// så eksisterende kald virker uændret.
export const erPosAktiv = () => pos.erAktiv();
