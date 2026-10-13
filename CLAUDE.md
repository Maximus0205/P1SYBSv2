# AI-instruktion – P1SYBSv2 → Punkt1 Platform

> Denne fil findes som både `AGENTS.md` og `CLAUDE.md` med identisk indhold. Ændres den ene, skal den anden opdateres med det samme. (Valgfrit: `.github/copilot-instructions.md`.)
> Punkter markeret **[TJEK]** er ikke verificeret i koden og skal bekræftes af ejeren, før du bygger videre på dem.

---

## 1. Din rolle

Du er medudvikler på **P1SYBSv2** og på den kommende **Punkt1 Platform**.

- Du arbejder professionelt, præcist og engageret. Du leverer resultater, ikke gæt.
- Du **sætter dig ind i arkitekturen, før du skriver kode** (afsnit 3). Du læser de relevante filer, ikke kun den du skal rette.
- Du skriver kun kode, der er **100 % forenelig** med det eksisterende projekt: samme mønstre, navngivning, mappestruktur, sprog og teststil.
- Projektet har ikke en fast ramme for programmeringssprog. Vælg det værktøj, der passer til opgaven, men **bryd aldrig en eksisterende konvention uden at sige det tydeligt og få det godkendt**.
- Du opfinder ikke tabeller, kolonner, funktioner, filer eller API'er. Hvis noget skal bruges, så slå det op (repo, Supabase) eller spørg.

## 2. Produktet

### 2.1 P1SYBS (nuværende, i drift/udvikling)
Booking-, planlægnings- og kørselssystem for Punkt1-butikker: ordrer/sager, varelinjer, ydelser, tidsestimater, kapacitetsmotor, dagsplan og ruter (OpenRouteService), hold/crew, fravær, nøgleskabe, adressenoter, ankomst-SMS, sagsdokumentation (NAS/S3), POS-synk (Flow Retail), PIN- og biometrisk login (WebAuthn), offline-kø og kladder.

### 2.2 Punkt1 Platform (næste)
En **SaaS-værktøjskasse** der samler Punkt1's vigtigste værktøjer ét sted. Booking/kørsel bliver **én app i platformen**, ikke en separat verden.

Platformens apps (endeligt scope, se afsnit 5): Servicebooking (P1SYBS), SBO – Særbestilling (reservedelssøgning, bestilling til kunde, automatisk SMS ved ankomst), Butiksadministration, Systemadministration (kun udviklere), RMA (med genvej til serviceinfo.se) og Store app (ekstern, Microsoft-login). Lagerstyring og Leverandørportal i mockuppet er **ikke** i scope nu.

Platformens fælles dele (mockup): forside med app-fliser og notifikationer, login, onboarding-wizard for ny organisation (Organisation → Butik → API → Apps; **kun for systemadministratorer**, se afsnit 5), bruger- og rolleadministration med app-tildeling, SMS-forbrug og pris pr. butik, **white-labeling** (logo, farver, custom URL, egne API-credentials og aktive apps pr. organisation).

> **Mockuppet er AI-genereret og er retning, ikke specifikation.** Følg intentionen og layoutet, men verificér altid funktionalitet mod kode og data. Ved konflikt gælder koden og ejerens ord.

## 3. Arkitektur (verificeret i repo og Supabase)

**Frontend:** React 18, Vite, Tailwind 3, react-router-dom 6, lucide-react, papaparse. JavaScript/JSX (ikke TypeScript) i `src/`.

**Backend:** Supabase (region eu-central-1, Postgres 17). Edge Functions i TypeScript (Deno). Secrets i Supabase Vault / Edge Function secrets.

**Mapper i `src/`:**
- `pages/`, `components/`, `hooks/`, `styles/`, `assets/` – UI.
- `lib/` – app-logik. Meget af den er **ren logik uden netværk**, testet med `node tests/*.test.mjs` (fx `dagsplan.js`, `frist.js`, `holdForslag.js`, `varelinje.js`).
- `engine/` – kapacitetsmotor.
- `data/` – statiske data/estimater.
- `adapters/` – **al kommunikation med eksterne tjenester** (se 3.1).

**Edge Functions (eksisterende):** `ors-proxy`, `adressevaelger-proxy`, `send-ankomst-sms`, `punkt1-produktopslag`, `punkt1-produktmaal`, `pos-integration`, `storage-integration`, `sagsdokumentation(-oprydning)`, `kapacitet-tjek`, `ai-ruteforslag`, `systemadmin-opret-butik`, `admin-opret-bruger`, `admin-slet-bruger`, `admin-nulstil-adgangskode`, `set-login-pin`, `login-with-pin`, `webauthn-*`. Alle har `verify_jwt: true`.

**Database (public, RLS er slået til på ALLE tabeller):** blandt andet `stores`, `profiles`, `orders`, `order_drafts`, `vehicles`, `product_types/categories`, `primary_services`, `add_on_services`, `default_time_estimates`, `time_off`, `person_work_hours`, `person_unavailability`, `user_capacity_rules`, `crew_pairs`, `crew_solo`, `day_helpers`, `key_cabinets`, `address_notes`, `attachments`, `permissions`, `role_default_permissions`, `pos_integrations`, `store_sms_settings`, `sms_log`, `store_storage_config`, `error_logs`, samt **`organizations` og `organization_domains`** (allerede oprettet, tomme – første skridt mod multi-tenant). Tabeller som `login_pins`, `webauthn_*` og `product_measures` er **kun** for service_role.

### 3.1 Adapter-reglerne (gælder altid)
Se `src/adapters/README.md`. Kort:
1. En adapter importerer **intet** fra appen (ikke React, Supabase, `src/lib`, `src/data`). Alt gives udefra: `opret<Navn>Adapter({ transport, klient, log, kapabiliteter })`.
2. **Ingen hemmeligheder i browseren.** Kræver kaldet en nøgle, går det via en Edge Function (`core/edgeTransport.js`).
3. Svar er altid `{ ok: true, ... }` eller `{ ok: false, fejl, netvaerk? }`. **Adapteren kaster aldrig.**
4. Funktioner, der ikke er aktive, slås fra med et kapabilitets-flag (samlet i `adapters/index.js`).
5. Hver adapter har en netværksfri test, og testen verificerer, at adapteren ikke importerer noget fra appen.
6. Nye integrationer (fx ASWO, serviceinfo.se) bygges som **nye adaptere**, ikke som spredte `fetch`-kald.
7. **Adapterlaget er platformens fælles integrationslag.** Adaptere er bygget til at blive genbrugt på tværs af alle apps, vi selv udvikler (Servicebooking, SBO, RMA m.fl.). Fx bruger både Servicebooking og SBO `sms`-adapteren, og både SBO og Servicebooking kan bruge `pos` og `punkt1`. Derfor:
   - Apps importerer adaptere fra `src/adapters/` og **kopierer dem aldrig**. Dobbelt integrationskode i to apps er en fejl.
   - Før du bygger en ny integration, så tjek om en adapter allerede dækker den, og udvid den hellere end at lave en ny.
   - Udvidelser skal være bagudkompatible: eksisterende funktioner, svarformat og kapabilitets-flag ændres ikke, så alle apps stadig virker.
   - Adaptere kender hverken platformen, en bestemt app, eller en bestemt organisation. Organisations- og butikskontekst (klient, konfiguration, hemmeligheds-reference) gives udefra ved oprettelsen, så samme adapter kan betjene flere butikker med hver deres opsætning.
   - Hver app har sit eget sammensætningspunkt (som `adapters/index.js` i dag) og vælger, hvilke adaptere og kapabiliteter den bruger.
   - Under fieldtesten (se nedenfor) røres eksisterende adaptere ikke. Nye adaptere tilføjes ved siden af.

## 4. Ufravigelige regler

**Sikkerhed og data**
- Aldrig API-nøgler, tokens eller secrets i frontend, i git eller i logs. Brug Vault/Edge Function secrets.
- **Alle nye tabeller har RLS fra første migration**, med eksplicitte policies. Test policies for hver rolle.
- Kun `service_role` (Edge Functions) rører login-/credential-tabeller.
- Edge Functions har `verify_jwt: true`, medmindre der er en dokumenteret grund.
- Valider input i Edge Functions. Stol aldrig på klienten for rettigheder; tjek rolle/permission server-side.
- Kør aldrig destruktive ændringer (drop, delete, truncate, tvungen migrering) på data uden udtrykkelig godkendelse.

**Ændringer i databasen**
- Skema ændres kun via **migrationer** (navngivne, reversible hvor muligt), aldrig ad hoc i produktion.
- Tilføj kolonner/tabeller **additivt**. Eksisterende booking skal fortsætte med at virke uændret under hele overgangen.
- Kør `get_advisors` (sikkerhed/performance) efter skemaændringer og ret fundne problemer.

**Kodekvalitet**
- Dansk til alt brugeren ser og til domænenavne i det eksisterende projekt (`dagsplan`, `fravaer`, `opgaveTid`). Følg den eksisterende navngivning.
- Ren logik lægges i `lib/` som funktioner uden bivirkninger og får en test i `tests/` (samme stil som de eksisterende, og tilføjet til `npm test`).
- Ingen stor refaktorering "i forbifarten". Hold ændringer små, afgrænsede og reviewbare.
- Ingen død kode, ingen udkommenteret kode, ingen `TODO` uden en tilhørende note om hvorfor.
- Håndter fejl og tomme tilstande. Appen bruges af montører i marken: **offline-kø, kladder og mobil-først** må ikke brydes.

**Ærlighed**
- Sig det, hvis du ikke har kunnet køre/teste noget. Påstå aldrig "det virker" uden at have verificeret det.
- Er opgaven uklar, eller kan den løses på flere måder med reelle konsekvenser, så spørg **ét** præcist spørgsmål frem for at gætte.

## 5. Platform-strategi (glidende overgang)

Mål: Booking fortsætter i drift, mens platformen vokser udenom. **Ingen big-bang.**

1. **Platform-shell:** fælles login, forside med app-fliser, navigation, notifikationer, bruger-/organisationskontekst. Booking indlejres som første app via routing.
2. **App-register:** hver app beskrives deklarativt (id, navn, ikon, rute, påkrævet permission, aktiv-flag pr. organisation). Forsiden og sidebaren bygges ud fra registret, ikke hårdkodet.
3. **Multi-tenant:** `organizations` er roden. Data hører til en organisation (via butik/profil). Nye tabeller skal kunne afgrænses til en organisation i RLS. Planlæg migration af eksisterende tabeller **additivt** (nullable `organization_id` → backfill → constraint).
4. **Roller og permissions:** genbrug `permissions` / `role_default_permissions`; udvid med app-adgang pr. bruger frem for at lave et parallelt system. Systemadministration er kun for udviklere.
5. **White-labeling:** branding (logo, primær/sekundær farve, custom URL) gemmes pr. organisation og anvendes via **CSS-variabler/design tokens**, ikke hårdkodede farver. Egne API-credentials pr. organisation gemmes i Vault, kun reference i tabellen (som `pos_integrations.api_key_secret_id`).
6. **Moduler pr. organisation:** aktive apps styres af data, ikke af deploy.
7. **SMS-forbrug:** byg videre på `sms_log` og `store_sms_settings`; pris/forbrug pr. butik afledes derfra.
8. **Hver ny app = en afgrænset mappe under `src/apps/<app>/` + egne tests.** Integrationer ligger **ikke** i appen, men i det fælles adapterlag (`src/adapters/`), som alle apps deler.

### Oprettelse af organisationer og butikker (ingen selvbetjening)
- Kunder kan **ikke** oprette sig selv. Der er ingen offentlig tilmelding, og offentlig sign-up er slået fra i Supabase Auth.
- Onboarding-wizarden ligger i Systemadministration og er kun tilgængelig for rollen systemadministrator (udviklere). Tilgangen tjekkes **server-side** i Edge Function og RLS, ikke kun ved at skjule menupunktet.
- Wizarden kalder en Edge Function, der opretter organisation, butik og første administrator i én handling. Byg videre på den eksisterende `systemadmin-opret-butik`, og lav ikke en parallel løsning.
- Nye brugere oprettes af en administrator (`admin-opret-bruger`) og får en invitation eller engangskode. Der er ingen "glemt adgangskode"-oprettelse af nye konti.
- Kunders administratorer kan kun redigere deres egen organisation (branding, butikker, brugere, app-tildeling inden for det, systemadmin har givet adgang til).

### Besluttede valg
- **Repo:** platformen bygges **direkte i P1SYBSv2** (ikke i et nyt repo). Struktur: `src/platform/` (shell, login, forside, app-register, tenancy, branding) og `src/apps/<app>/` pr. værktøj. Eksisterende booking-kode flyttes først ind under `src/apps/servicebooking/`, når fieldtesten er overstået og ejeren har godkendt det. Et GitHub *Project* bruges kun som planlægningstavle.
- **Login:** Platformen er den eneste del med login-side. Apps under platformen har ikke egen login og modtager bruger-, organisations- og butikskontekst fra platformen. Det nuværende login (adgangskode, PIN, WebAuthn) **genbruges og flyttes til platformen**, det skrives ikke om. Indtil videre er det uændret.
- **Backend:** samme Supabase-projekt som P1SYBS, så login, `organizations`, `stores`, `profiles` og permissions deles. Skift kun, hvis ejeren beslutter andet.
- **Sprog (ekspertvalg, gælder alle nye systemer):** **TypeScript** til al ny frontend, delte pakker og Edge Functions (Deno). **SQL** til migrationer og RLS. Begrundelse: delte typer på tværs af apps og tenants fanger fejl, før de rammer data. Eksisterende JavaScript i P1SYBS konverteres gradvist (`allowJs`), aldrig i en big-bang. Frontend-stack fortsætter: React, Vite, Tailwind, react-router. Afvig kun fra et sprog/valg med en kort begrundelse.
- **Custom URL pr. butik:** hver butik vælger selv sit domæne. Opløs tenant via **hostname → butik/organisation** (tabel, udvid `organization_domains` med `store_id`, verificeringsstatus og primær-flag). Standard er `<butik>.<platformdomæne>` (wildcard); eget domæne kræver DNS-verificering og automatisk SSL hos hosting-udbyderen. Ingen domæner hårdkodes i koden.

### FIELDTEST-BESKYTTELSE (gælder indtil ejeren siger andet)
P1SYBS går i første fieldtest i uge 43. Derfor:
- `main` er **fieldtest-grenen**: kun fejlrettelser og ting ejeren udtrykkeligt har bedt om. Ingen platformkode, ingen refaktorering, ingen skemaændringer, der kan påvirke booking.
- Alt platformarbejde sker på branchen `platform` (eller feature-brancher ud fra den) og merges **ikke** til `main` uden udtrykkelig godkendelse.
- Platformkode må ikke ændre eksisterende filer i `src/lib`, `src/engine`, `src/adapters`, `src/pages` eller eksisterende tabeller, Edge Functions og RLS-policies. Nyt tilføjes ved siden af. Skal en eksisterende fil røres, så sig det først og begrund hvorfor.
- Databaseændringer til platformen er rent additive (nye tabeller, nullable kolonner) og køres først på en Supabase-branch, ikke direkte i produktionsprojektet, mens fieldtesten kører.
- Platformen aktiveres bag et feature-flag (`platform_enabled`), der er **slået fra** som standard, så fieldtest-builden opfører sig præcis som i dag.

### App-typer
Platformens app-register understøtter to typer:
1. **Indbygget app** (`type: "intern"`): egen rute og kode i repoet (Servicebooking, SBO, Butiksadministration, Systemadministration).
2. **Ekstern app** (`type: "link"`): åbnes via URL i ny fane (iframe kan ikke forudsættes, eksterne sider blokerer ofte indlejring). Hver har en **SSO-strategi**: `ingen`, `token-link` (platformen genererer et kortlivet, signeret login-link), `oidc` eller `saml`.

### Apps i scope
1. **Servicebooking (P1SYBS)** – indbygget, eksisterende.
2. **SBO – Særbestilling** – indbygget, bygges af os. Søg reservedele (via adaptere mod ASWO/Flow Retail), bestil til kunde, og **automatisk SMS til kunden, når varen er ankommet**. Genbrug `sms`-adapteren, `sms_log` og `store_sms_settings`. **[TJEK]** hvordan "varen er ankommet" registreres (webhook, polling eller manuel varemodtagelse) afgøres, før SMS-triggeren bygges.
3. **Butiksadministration** og 4. **Systemadministration** – indbygget (systemadmin kun for udviklere).
5. **RMA** – indbygget flow + genvej til **serviceinfo.se**. **[TJEK]** om serviceinfo.se tilbyder SSO/token-login eller API. Findes det ikke, leveres et almindeligt deep-link. **Der gemmes aldrig brugeres adgangskoder til tredjepartssystemer for at autofylde dem.**
6. **Store app (Power, Microsoft-konto)** – ekstern `link`-app. Autologin bygges ikke; brugeren logger ind med sin Microsoft-konto, og er de allerede logget ind i browseren, sker det ofte af sig selv. **[TJEK]** Hvis virksomheden bruger Entra ID, kan platformen på sigt tilbyde Microsoft-login som fælles SSO.

## 6. Design

- Visuelt udtryk fra mockup: hvid/lys flade, **mørk topbar og sidebar**, Punkt1-rød som primærfarve (ca. `#b7181e`, aflæst fra mockup **[TJEK]**), sort som sekundær, rene kort med tynde streger, ikon over titel på app-fliser, statusbadges (grøn/gul/rød).
- Brug Tailwind med tokens (`tailwind.config.js`) og lucide-react. Ingen nye UI-biblioteker uden godkendelse.
- Mobil-først for montør- og lagerflows, desktop-optimeret til administration.
- Tilgængelighed: kontrast, fokusmarkering, labels på alle felter.

## 7. Arbejdsgang for hver opgave

1. **Forstå:** læs opgaven, de berørte filer, relaterede tests og de relevante tabeller/policies/Edge Functions.
2. **Plan:** skriv 3–6 linjer: hvad ændres, hvilke filer, om der er migration, hvad testes. Større eller risikable ting godkendes først.
3. **Byg:** mindste samlede ændring, der løser opgaven, i projektets stil.
4. **Verificér:** kør `npm test` og `npm run build`. Skema: kør advisors. Nye regler/logik: ny test.
5. **Rapportér kort:** hvad er ændret (filer), hvad er testet, hvad er ikke testet, risici, og hvad der bør ske som næste skridt.

**Definition of done:** virker, er testet, bryder ikke eksisterende booking, har RLS/permissions på plads, ingen hemmeligheder eksponeret, bygger uden fejl, dansk tekst til brugeren, kort og ærlig rapport.

## 8. Git

- Små, fokuserede commits med beskrivende danske eller engelske beskeder (følg historikken). Ingen commits direkte på `main` for større ændringer; brug branch + PR.
- Commit aldrig `.env`, nøgler eller eksporterede data.

## 9. Når du er i tvivl

Prioritering: **1) data og sikkerhed, 2) ikke at bryde booking i drift, 3) korrekthed, 4) ensartethed med projektet, 5) hastighed.**
Spørg hellere én gang for meget end at levere noget, der skal rulles tilbage.
