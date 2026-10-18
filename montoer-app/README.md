# P1SYBS Montør (native app)

Rigtig app til **montør og medhjælper** (lageret kommer senere) – bygget i Expo / React Native til både Android og iPhone/iPad. Det er ikke hjemmesiden pakket ind, men egne skærme: dagens rute, dagvælger, sagsdetaljer, ring/kør-knapper, "2 mand"-markering og login med Face ID / fingeraftryk.

## Version 1 – hvad den kan
- Login med butik, brugernavn og kode (samme som webappen). Skift af kode ved første login understøttes.
- Face ID / fingeraftryk: koden gemmes i telefonens sikre lager bag biometri. Appen låser efter 2 min i baggrunden.
- Starter direkte på dagens rute, blad frem/tilbage mellem dage, ugestrimmel med antal sager.
- Medhjælper ser den bil, vedkommende er sat på den dag.
- Sagsdetaljer: kunde, adresse, nøgleinfo, varelinjer, tydeligt "Kræver to mand".
- Ring til kunde og navigér (Apple Kort / Google Maps).
- Offline: seneste hentede uge vises, med banner.
- Tablet: delt visning (liste + detalje).
- **Kun læsning.** Statusskift, billeder osv. kommer senere via sikre, enkeltstående databasekald (webappen overskriver hele sagen, så det må ikke kopieres).

## Opsætning (kræver ingen terminal for Android)
1. Repoets Secrets skal have `VITE_SUPABASE_URL` og `VITE_SUPABASE_ANON_KEY` (de samme som webappen – offentlige værdier). Vælg bevidst hvilket Supabase-projekt (test eller live) de peger på.
2. GitHub → Actions → "Montør-app - byg Android (APK)" → Run workflow på branchen `feature/montoer-app-capacitor`. Slå "udgiv" til for et fast download-link.
3. Send linket til montøren; åbn på Android og tillad installation fra ukendt kilde.

## iPhone / iPad
Kræver Apple Developer-konto (99 USD/år). Så kan appen deles privat via TestFlight (eller Apple Business Manager) – ikke offentligt i App Store. Byg via EAS Build (`eas build -p ios`).

## Kør lokalt (udvikler)
```
cd montoer-app
cp .env.example .env   # udfyld EXPO_PUBLIC_SUPABASE_URL og EXPO_PUBLIC_SUPABASE_ANON_KEY
npm install && npx expo install --fix
npx expo start
npm test               # ruteregler og datoer
```

## Status
Koden er skrevet og enhedstestet (dato- og ruteregler), men **endnu ikke kørt på en rigtig telefon eller emulator**. Test på Android og iPhone før udrulning. Ikoner/splash er pladsholdere – læg rigtigt logo i `assets/`.
Capacitor-skallen i resten af branchen er afløst af denne app og er urørt.
