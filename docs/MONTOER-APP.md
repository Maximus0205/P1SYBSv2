# Montør-app (iOS + Android) med Capacitor

Samme React-kodebase som webappen, pakket i en native skal. Web-udgaven på
GitHub Pages er uændret (`npm run build`).

## Opsætning (én gang)

Kræver Node 24. iOS kræver en Mac med Xcode.

```bash
npm install
npm run build:native     # bygger med relative stier og kører `cap sync`
npx cap add ios          # kun første gang, kræver Mac
npx cap add android      # kun første gang
npm run build:native     # igen, så de nye platforme får webkoden
```

Derefter:

```bash
npm run cap:ios          # åbner Xcode
npm run cap:android      # åbner Android Studio
```

Commit mapperne `ios/` og `android/` (de indeholder selv de rigtige
`.gitignore`-filer).

Ved hver kodeændring: `npm run build:native`, og kør/arkivér fra Xcode
eller Android Studio.

## Beslutninger der skal tages INDEN første udgivelse

- **Bundle ID / appId** står som `dk.p1sybs.montor` i `capacitor.config.json`.
  Det kan ikke ændres, når appen er oprettet i App Store Connect / Play Console.
- **Appnavn og ikon** (1024x1024 ikon + splash).
- **Supabase-URL og anon-key** læses fra `.env` ved bygning (samme
  `VITE_SUPABASE_*` som i GitHub Actions). Skal ligge lokalt på den maskine,
  der bygger appen.

## Udgivelse som "Unlisted" (kun for montørerne)

**iOS**
1. Apple Developer Program-konto.
2. Opret appen i App Store Connect, arkivér i Xcode og upload.
3. Anmod Apple om *Unlisted App Distribution* (formular hos Apple). Når den
   er godkendt, får appen et direkte link, men kan ikke findes ved søgning.
4. Alternativ for en virksomhed: *Custom App* via Apple Business Manager.
5. Under udvikling: TestFlight (builds udløber efter 90 dage).

**Android**
- Google Play Console -> *Privat app* via Managed Google Play, eller en
  lukket testspor med montørernes e-mails.

Apple kan afvise apps, der blot er en hjemmeside i en ramme (guideline 4.2).
De native funktioner (se nedenfor) er derfor en del af godkendelsen.

## Hvad der er lavet

- Capacitor 8 + `@capacitor/app` + `@capacitor/status-bar`.
- `vite build --mode native` -> relative stier (`base: "./"`).
- `src/lib/native.js`: statuslinje og Android-tilbageknap. No-op i browseren.
- Versionstjekket (`versionCheck.js`) slås fra i appen, da opdateringer
  kommer via butikkerne.

## Næste trin (ikke lavet endnu)

1. **Offline-kø på native lager.** `lib/offlineQueue.js` bruger `localStorage`.
   iOS kan rydde en webviews lager under pladsmangel, og køen er præcis det,
   der ikke må forsvinde. Flyt til `@capacitor/preferences` (eller SQLite
   ved fotos).
2. **Fotos**: native kamera (`@capacitor/camera`) + komprimering.
3. **Push-notifikationer** (`@capacitor/push-notifications`, kræver APNs-
   nøgle og Firebase).
4. **Skrifttyper**: `@import` fra Google Fonts i `App.jsx` virker ikke
   offline - skal bundles lokalt.
5. **Montør-only indgang** (kun `/montor` og `/sag/:id`), så appen ikke
   indeholder sælger- og admin-siderne.
6. **Sikker lagring af login** (Keychain/Keystore) og evt. biometri.
7. Sikkerhedsområder/notch: test på rigtig enhed og tilføj
   `viewport-fit=cover` + `env(safe-area-inset-*)`, hvis indholdet havner
   under statuslinjen.
