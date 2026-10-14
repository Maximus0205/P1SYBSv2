// ---------------------------------------------------------------------------
// APP-REGISTER (Punkt1 Platform, oktober 2026)
//
// Hver app i platformen beskrives HER, deklarativt. Forsiden og sidebaren
// bygges ud fra listen - ingen app er hårdkodet i selve skallen.
//
// Filen er bevidst ren logik uden React, Supabase eller andre imports, så
// den kan testes direkte med node (se tests/platform.appRegister.test.mjs).
// Ikonet angives derfor som et navn; PlatformShell.tsx slår selve
// lucide-ikonet op.
//
// ADGANG ER IKKE SIKKERHED: at en flise er skjult, beskytter ingenting.
// Den reelle grænse er de eksisterende rute-vagter (Gate i App.jsx) og RLS
// i databasen. Registret afgør kun, hvad det giver mening at VISE.
//
// "Aktiv pr. organisation" (afsnit 5 i CLAUDE.md) styres senere af data.
// Indtil den tabel findes, er status her en egenskab ved selve appen.
// ---------------------------------------------------------------------------

export type AppIkon = "servicebooking" | "sbo" | "rma" | "butik" | "system";

export type AppAdgang =
  | { type: "alle" }
  // Samme side-nøgler som allowedPages i App.jsx, som er afledt af
  // brugerens håndhævede rettigheder (my_effective_permissions()).
  | { type: "side"; side: string }
  | { type: "systemadmin" };

type FaellesFelter = {
  id: string;
  navn: string;
  beskrivelse: string;
  ikon: AppIkon;
  adgang: AppAdgang;
};

export type PlatformApp =
  | (FaellesFelter & { type: "intern"; status: "aktiv"; rute: string })
  | (FaellesFelter & { type: "intern"; status: "planlagt" })
  | (FaellesFelter & {
      type: "link";
      status: "aktiv";
      url: string;
      sso: "ingen" | "token-link" | "oidc" | "saml";
    });

export type AdgangsKontekst = {
  erSystemadmin: boolean;
  tilladteSider: readonly string[];
};

export const PLATFORM_APPS: readonly PlatformApp[] = [
  {
    id: "servicebooking",
    navn: "Servicebooking",
    beskrivelse: "Book opgaver og se montørruter",
    ikon: "servicebooking",
    type: "intern",
    status: "aktiv",
    rute: "/dashboard",
    adgang: { type: "alle" },
  },
  {
    id: "sbo",
    navn: "SBO – Særbestilling",
    beskrivelse: "Bestil reservedele til kunden",
    ikon: "sbo",
    type: "intern",
    status: "planlagt",
    adgang: { type: "alle" },
  },
  {
    id: "rma",
    navn: "RMA",
    beskrivelse: "Håndter returvarer",
    ikon: "rma",
    type: "intern",
    status: "planlagt",
    adgang: { type: "alle" },
  },
  {
    id: "butiksadministration",
    navn: "Butiksadministration",
    beskrivelse: "Brugere, biler og indstillinger",
    ikon: "butik",
    type: "intern",
    status: "aktiv",
    rute: "/admin",
    adgang: { type: "side", side: "admin" },
  },
  {
    id: "systemadministration",
    navn: "Systemadministration",
    beskrivelse: "Kun for udviklere",
    ikon: "system",
    type: "intern",
    status: "aktiv",
    rute: "/systemadmin",
    adgang: { type: "systemadmin" },
  },
];

export function harAdgang(app: PlatformApp, kontekst: AdgangsKontekst): boolean {
  switch (app.adgang.type) {
    case "alle":
      return true;
    case "systemadmin":
      return kontekst.erSystemadmin;
    case "side":
      return kontekst.erSystemadmin || kontekst.tilladteSider.includes(app.adgang.side);
    default:
      return false;
  }
}

// De apps, brugeren skal se, i registrets rækkefølge. Planlagte apps tages
// med (forsiden viser dem som "Kommer snart"), men kun hvis brugeren også
// ville have adgang, når de bliver aktive.
export function synligeApps(apps: readonly PlatformApp[], kontekst: AdgangsKontekst): PlatformApp[] {
  return apps.filter((app) => harAdgang(app, kontekst));
}

// Fanger fejl i registret, før de når brugeren. Returnerer en liste med
// fejlbeskrivelser; tom liste = registret er gyldigt.
export function valideRegister(apps: readonly PlatformApp[]): string[] {
  const fejl: string[] = [];
  const set = new Set<string>();
  for (const app of apps) {
    if (!app.id) fejl.push("En app mangler id");
    if (set.has(app.id)) fejl.push(`Dobbelt id: ${app.id}`);
    set.add(app.id);
    if (!app.navn.trim()) fejl.push(`${app.id}: mangler navn`);
    if (app.type === "intern" && app.status === "aktiv" && !app.rute.startsWith("/")) {
      fejl.push(`${app.id}: rute skal starte med /`);
    }
    if (app.type === "link" && !/^https:\/\//.test(app.url)) {
      fejl.push(`${app.id}: ekstern app skal have en https-adresse`);
    }
  }
  return fejl;
}
