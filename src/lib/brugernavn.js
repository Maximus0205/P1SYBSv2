// Delt logik for brugernavn-baseret login, brugt af LoginSide.jsx,
// AdminParts.jsx (NyBrugerForm) og SystemAdminSide.jsx.
//
// Supabase Auth kræver internt altid en e-mail-formateret identitet - ved
// brugernavn-login bruges derfor en syntetisk e-mail på formen
// "brugernavn@brugere.kaedeplan.local", som ikke skal kunne modtage post,
// den er kun en teknisk nøgle for Auth-systemet. Domænet SKAL matche det,
// der bruges i Edge Functions (admin-opret-bruger, systemadmin-opret-butik).
export const BRUGERNAVN_DOMAIN = "brugere.kaedeplan.local";

export const emailFraBrugernavn = (brugernavn) => `${(brugernavn || "").trim().toLowerCase()}@${BRUGERNAVN_DOMAIN}`;

export const erGyldigtBrugernavn = (brugernavn) => /^[a-z0-9.\-]{2,40}$/.test((brugernavn || "").trim().toLowerCase());

// Foreslår et brugernavn ud fra et fulde navn, fx "Jens Hansen" -> "jens.hansen".
// Fjerner danske specialtegn, så det altid er gyldigt til login-formatet.
export const foreslaaBrugernavn = (navn) => {
  return (navn || "")
    .trim()
    .toLowerCase()
    .replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa")
    .replace(/[^a-z0-9\s.\-]/g, "")
    .trim()
    .replace(/\s+/g, ".")
    .slice(0, 40);
};

// Bruges på login-siden: er det indtastede en e-mail (indeholder @, og er
// IKKE vores egen syntetiske brugernavn-e-mail), eller et brugernavn?
export const erEmailFormat = (tekst) => (tekst || "").includes("@") && !tekst.trim().toLowerCase().endsWith(`@${BRUGERNAVN_DOMAIN}`);

// Omsætter det, brugeren taster i login-feltet, til den e-mail Supabase
// Auth reelt skal bruge til at logge ind.
export const identifikatorTilEmail = (tekst) => (erEmailFormat(tekst) ? tekst.trim() : emailFraBrugernavn(tekst));
