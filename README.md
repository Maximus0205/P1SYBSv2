# Kædeplan – lokalt planlægnings- og sagsstyringssystem

Dette er den strukturerede projekt-version af prototypen, delt op i mapper og filer
i stedet for én stor fil, så det er nemmere at arbejde videre med, versionere (git)
og senere lade en udvikler overtage.

## Sådan kører du det lokalt

Kræver [Node.js](https://nodejs.org) (version 18 eller nyere) installeret.

```bash
npm install
npm run dev
```

Åbn derefter det link terminalen viser (typisk `http://localhost:5173`).

## Mappestruktur

```
src/
  App.jsx              – selve app-skelettet: login, navigation, datahentning
  main.jsx             – opstartsfil (rører du normalt ikke)
  index.css            – Tailwind-opsætning
  lib/
    storage.js          – lagerlag (se vigtig note nedenfor)
  data/
    appData.js          – alle hjælpefunktioner, konstanter og eksempel-/seed-data
  components/
    common.jsx          – småkomponenter (status-badges, piller, datovælger)
    TopNav.jsx           – topmenu
    LoginSide.jsx        – login-skærm
    NyeSagForm.jsx       – "Opret sag"-formular
    SagFormFields.jsx    – delkomponenter til sagsformularen (varelinjer, nøgle, adresse)
    KvitteringUpload.jsx – upload/udtræk fra kvittering (PDF)
    CsvImport.jsx        – CSV-import af sager
    SagKortKompakt.jsx   – sagskort i kørselsoversigten
    SagView.jsx          – detaljevisning af én sag
    SagDele.jsx          – delkomponenter til sagsvisningen (noter, billeder, stempelur mv.)
    AdminParts.jsx       – delkomponenter til administrationssiden
  pages/
    SalgSide.jsx         – salgsoversigt
    KoerselSide.jsx      – kørselsplanlægning (drag-n-drop, områdeoverblik)
    MontorSide.jsx       – montørvisning
    LagerSide.jsx        – lager/pluk-oversigt
    AdminSide.jsx        – administration
```

## Vigtig note om datalagring

Prototypen har indtil nu gemt data via en funktion kaldet `window.storage`, som kun
findes i Claudes forhåndsvisningsmiljø. Det er nu pakket ind i `src/lib/storage.js`,
som:

- bruger `window.storage` når appen kører inde i Claude (til test/preview)
- falder automatisk tilbage til browserens `localStorage` når appen køres som nu, lokalt

**`localStorage` er kun gemt i den enkelte browser på den enkelte computer** — det er
fint til at teste arbejdsgange og layout, men det er IKKE en rigtig fælles database.
Hvis flere personer (sælger, montør, planlægger) skal se de samme sager på tværs af
enheder, skal `storage.js` udskiftes med kald til en rigtig backend/database. Fordi
alt data-adgang går igennem denne ene fil, er det det eneste sted der skal ændres —
resten af appen er uberørt af det.

## Afstandsbaserede bookingforslag (valgfrit)

I "Book ny sag" kan sælgeren nu få forslag til dage, hvor der allerede er
planlagte sager tæt på (målt i reel køreafstand, ikke bare samme
postnummer). Det kræver en gratis nøgle fra
[openrouteservice.org](https://openrouteservice.org/dev/#/signup):

1. Opret en gratis konto og lav en API-nøgle.
2. Kopiér `.env.example` til `.env` i projektets rod og indsæt nøglen:
   ```
   VITE_ORS_API_KEY=din-nøgle-her
   ```
3. Genstart `npm run dev`.

Uden nøglen fungerer resten af appen upåvirket — kun denne ene boks i
booking-formularen vises ikke. Se `src/lib/steder.js` for detaljer om
opsætningen, gratis-grænser (2.500 kald/dag) og hvordan geokodning caches i
browser-sessionen for at spare på kaldene.

## Kendte huller / ting der mangler at blive taget stilling til

- **Bil-administration**: der findes data og logik for biler (`biler`, `addBil`,
  `updateBil`, `deleteBil`) i `App.jsx`, men admin-siden viser endnu ikke en sektion
  til at oprette/redigere biler direkte — i dag skrives bilnavn frit ind på hver
  montør. Værd at tage stilling til om det skal bygges færdigt.
- **Login/adgangskoder** er et prototype-login (gemt i klartekst i data) — skal
  udskiftes med rigtig autentificering (fx jeres Microsoft 365/Entra ID-konti) inden
  drift.
- **SAP-integration** er slet ikke bygget endnu, som aftalt.

## Næste skridt

Kør `npm install && npm run dev` og test at alt stadig opfører sig som før. Sig til
hvis noget ser forkert ud, så retter vi det, inden vi bygger videre.
