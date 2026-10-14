// FEATURE-FLAG for Punkt1 Platform (oktober 2026).
//
// Slået FRA som standard: fieldtest-builden skal opføre sig præcis som før
// platformen fandtes (se FIELDTEST-BESKYTTELSE i CLAUDE.md). Slås til ved
// build med VITE_PLATFORM_ENABLED=true.
//
// Et VITE_-flag ender i browser-koden og er dermed offentligt. Det er i
// orden her, fordi flaget kun styrer hvad der VISES - adgangen til data
// håndhæves stadig af RLS og rute-vagterne i App.jsx.
export const PLATFORM_ENABLED: boolean = import.meta.env.VITE_PLATFORM_ENABLED === "true";
