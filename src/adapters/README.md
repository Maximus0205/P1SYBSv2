# Adaptere

Al kode, der taler med en ekstern tjeneste (API), ligger her som en **adapter** - ikke spredt rundt i appen.

## Hvorfor
Punkt1 har flere projekter på vej, der skal tale med de samme tjenester (POS, SMS, produktopslag, ...).
En adapter skrives én gang, er testet, og kan bruges uændret i det næste projekt.

## Reglerne
1. **Ingen afhængigheder til appen.** En adapter importerer hverken React, Supabase, `src/lib`, `src/data`
   eller noget andet fra projektet. Alt, den har brug for, **gives udefra** ved oprettelsen:
   `opret<Navn>Adapter({ transport, klient, log, kapabiliteter })`.
2. **Hemmeligheder i browseren: aldrig.** Kald til en tjeneste, der kræver en nøgle, går gennem en Edge Function
   (`core/edgeTransport.js`), hvor nøglen ligger som secret/Vault.
3. **Svaret er altid et objekt, og adapteren kaster aldrig:** `{ ok: true, ... }` eller `{ ok: false, fejl, netvaerk? }`.
   `netvaerk: true` betyder "forbindelsen røg - prøv igen senere", ikke "afvist".
4. **Kapabiliteter.** En funktion, der endnu ikke er en aktiv del af integrationen, slås fra med et flag og foretager
   så intet kald. Flagene står ét sted: `index.js`.
5. **Sprog:** dansk til alt, der vises til brugeren; funktionsnavne følger resten af projektet.
6. **Test:** hver adapter har en test uden netværk (`tests/adapters.test.mjs`), og testen kontrollerer også, at
   ingen adapter importerer noget fra appen.

## Opbygning
```
adapters/
  core/edgeTransport.js   fælles kald til Edge Functions + fejlhåndtering (ét sted, ikke kopieret)
  pos/                    POS (Flow Retail): opslag, synkronisering ved afslutning, opsætning
  sms/                    SMS (GatewayAPI): ankomst-SMS
  punkt1/                 produktopslag på punkt1.dk
  index.js                sammensætning til DENNE app (den eneste fil, der kender appen)
```

## Brug i appen
```js
import { pos, sms, punkt1 } from "../adapters";
const r = await sms.sendAnkomstSms({ telefon, minutter: 15, kundeNavn });
if (!r.ok) visFejl(r.fejl);
```

## Brug i et andet projekt
Kopiér mappen (uden `index.js`), og skriv en ny `index.js`, der giver adapterne projektets egen klient og log:
```js
const transport = opretEdgeTransport({ klient: minSupabase, log: minLog });
export const sms = opretSmsAdapter({ transport });
```

## Status
| Tjeneste | Adapter | Status |
|---|---|---|
| POS (Flow Retail) | `pos/` | færdig. `synkVedAfslutning` er slået fra |
| SMS (GatewayAPI) | `sms/` | færdig |
| Produktopslag (punkt1.dk) | `punkt1/` | færdig |
| Lager (NAS, S3) | - | mangler: `lib/attachments.js` + opsætningen i `lib/dataStore.js` |
| Ruter og afstande (OpenRouteService) | - | mangler: `lib/geocoding.js` |
| Adressevælger (Dataforsyningen) | - | mangler: `lib/geocodingAdressevaelger.js` |

Indtil de sidste er flyttet, ligger de gamle funktioner i `lib/dataStore.js` stadig; de er forældede, og nye kald skal bruge adapteren.
