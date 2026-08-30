// Offline-kø for montører i marken (august 2026).
//
// PROBLEMET: en montør står i en kælder, i en elevator, i et
// betonbyggeri. Uden netværk kan sagen ikke lukkes, status ikke skiftes,
// noten ikke gemmes. Tilbagerulningen i useOrders gør fejlen SYNLIG
// (bedre end før, hvor den var tavs), men arbejdet er stadig tabt, og
// montøren skal huske at gøre det igen senere. I praksis betyder det, at
// folk falder tilbage på papir - og så er systemet ikke længere sandheden
// om, hvad der er sket.
//
// LØSNINGEN: skrivninger, der fejler på grund af manglende netværk,
// lægges i en kø og sendes automatisk, når forbindelsen er der igen.
//
// ---------------------------------------------------------------------
// VIGTIG AFGRÆNSNING - LÆS DENNE FØR DU UDVIDER MODULET
// ---------------------------------------------------------------------
// Denne kø er IKKE en lokal database, og browseren bliver IKKE kilden til
// sandhed. Køen indeholder kun MIDLERTIDIGE, endnu-ikke-sendte
// skrivninger, og den tømmes så snart de er kommet frem. Databasen er
// fortsat den eneste autoritative kilde. Det er en bevidst og vigtig
// forskel: bygger man videre på det her som et lokalt lager, får man to
// kilder til sandhed, der skal holdes i sync - og det er en helt anden
// og langt sværere opgave.
//
// KØEN GEMMER HELE ORDREN, ikke en beskrivelse af ændringen. Det følger
// den eksisterende arkitektur (saveOrder gemmer hele blobben), men det
// har en konsekvens, man SKAL kende:
//
//   Har montøren en sag i køen i to timer, og en sælger i mellemtiden
//   retter kundens adresse på samme sag, så OVERSKRIVER montørens
//   forsinkede skrivning sælgerens rettelse, når den endelig sendes.
//
// Det er samme "sidste skrivning vinder" som appen allerede har - men
// vinduet går fra sekunder til timer. Derfor:
//   * Køen accepterer KUN ændringer på en sag, montøren selv er tildelt
//     (se enqueueOrder-kaldet i useOrders). En sælgers redigering i
//     butikken køer ikke - der er brugeren alligevel online.
//   * Køen er FIFO og sender én ad gangen, så rækkefølgen af montørens
//     egne ændringer bevares.
//   * Ved samme sags-id erstattes den ventende post frem for at lægge en
//     ny i køen: det er den samme sag, og den nyeste udgave er den, der
//     skal frem. Det holder køen kort og undgår, at fem statusskift på
//     samme sag bliver fem rundture.
//
// Den rigtige langsigtede løsning er feltvise opdateringer i stedet for
// hele blobben. Det er en større ombygning af dataStore og ligger uden
// for dette modul.
//
// HVORFOR localStorage: køen SKAL overleve, at appen lukkes - en montør
// låser telefonen, kører videre, og browseren smider fanen væk. Uden
// persistens er køen værdiløs, for det er præcis i den situation,
// arbejdet ellers går tabt. Den er lille (kun ventende skrivninger),
// synkron og understøttet overalt. IndexedDB ville være mere korrekt,
// men er markant mere kode for en kø, der sjældent har mere end en
// håndfuld poster.

const NOEGLE = "p1sybs.offlinekoe.v1";
const MAKS_POSTER = 200;
const MAKS_FORSOEG = 5;

const listeners = new Set();

function notify(koe) {
  listeners.forEach((fn) => {
    try { fn(koe); } catch (_) { /* en lytter må aldrig vælte køen */ }
  });
}

function laes() {
  try {
    const raa = localStorage.getItem(NOEGLE);
    if (!raa) return [];
    const parsed = JSON.parse(raa);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    // Ødelagt eller utilgængelig (privat browsing kan afvise adgang).
    // En ubrugelig kø må ikke forhindre appen i at virke.
    return [];
  }
}

function skriv(koe) {
  try {
    localStorage.setItem(NOEGLE, JSON.stringify(koe));
  } catch (_) {
    // Fyldt op eller blokeret. Vi kan ikke gøre mere her - skrivningen
    // forsøges stadig online, og fejler den, ser brugeren det via
    // SaveErrorBanner. Bedre end at kaste og afbryde handlingen.
  }
  notify(koe);
}

export function getQueue() {
  return laes();
}

export function queueLength() {
  return laes().length;
}

export function subscribeQueue(fn) {
  listeners.add(fn);
  try { fn(laes()); } catch (_) { /* som i notify */ }
  return () => listeners.delete(fn);
}

// Er dette en fejl, det giver mening at KØE? Kun netværksfejl.
//
// Det er en vigtig skelnen: en afvist skrivning (manglende rettighed,
// RLS, ugyldige data) vil fejle igen og igen, uanset hvor mange gange vi
// prøver. At køe den ville betyde, at montøren tror, arbejdet er gemt,
// mens det i virkeligheden aldrig kommer frem - præcis den tavse fejl,
// vi rettede tidligere. Kun fejl, der skyldes forbindelsen, køes.
export function isNetworkError(error) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const besked = (error?.message || String(error || "")).toLowerCase();
  return (
    besked.includes("failed to fetch") ||
    besked.includes("networkerror") ||
    besked.includes("network request failed") ||
    besked.includes("load failed") ||
    besked.includes("timeout") ||
    besked.includes("aborted")
  );
}

// Lægger en sag i køen. Findes sagen allerede, ERSTATTES den ventende
// udgave - se noten om hele-ordren ovenfor.
export function enqueueOrder(storeId, order) {
  if (!storeId || !order?.id) return false;
  const koe = laes();
  const post = {
    id: String(order.id),
    storeId,
    order,
    lagtIKoe: new Date().toISOString(),
    forsoeg: 0,
  };
  const idx = koe.findIndex((p) => p.id === post.id && p.storeId === storeId);
  if (idx >= 0) {
    // Bevar det oprindelige tidspunkt, så brugeren kan se, hvor længe
    // sagen reelt har ventet - ikke hvornår den sidst blev rørt.
    post.lagtIKoe = koe[idx].lagtIKoe;
    koe[idx] = post;
  } else {
    if (koe.length >= MAKS_POSTER) return false; // værn mod at løbe løbsk
    koe.push(post);
  }
  skriv(koe);
  return true;
}

export function removeFromQueue(orderId, storeId) {
  const koe = laes().filter((p) => !(p.id === String(orderId) && p.storeId === storeId));
  skriv(koe);
}

export function clearQueue() {
  skriv([]);
}

// Sender køen. saveFn(storeId, order) -> Promise<boolean>, altså præcis
// signaturen på dataStore.saveOrder.
//
// FIFO og én ad gangen: rækkefølgen af montørens egne ændringer skal
// bevares, og en telefon på kanten af dækning klarer ikke tyve samtidige
// kald. Fejler en post på netværk, STOPPER vi resten - forbindelsen er
// åbenlyst væk igen, og der er ingen grund til at brænde de øvrige
// forsøg af.
//
// En post, der fejler af en ANDEN grund end netværk (fx sagen er slettet
// imens, eller rettigheden er trukket tilbage), tælles op og smides væk
// efter MAKS_FORSOEG. Ellers ville den blokere køen for evigt. onDropped
// kaldes med posten, så den kaldende kode kan fortælle brugeren, at
// netop den ændring ikke kunne gemmes.
export async function flushQueue(saveFn, { onDropped } = {}) {
  const koe = laes();
  if (koe.length === 0) return { sendt: 0, tilbage: 0, opgivet: 0 };

  let sendt = 0;
  let opgivet = 0;
  const tilbage = [];
  let stoppet = false;

  for (const post of koe) {
    if (stoppet) { tilbage.push(post); continue; }

    let ok = false;
    let fejl = null;
    try {
      ok = await saveFn(post.storeId, post.order);
    } catch (e) {
      fejl = e;
    }

    if (ok) { sendt++; continue; }

    if (fejl && isNetworkError(fejl)) {
      // Forbindelsen er væk igen - behold resten urørt til næste gang.
      tilbage.push(post);
      stoppet = true;
      continue;
    }

    const forsoeg = (post.forsoeg || 0) + 1;
    if (forsoeg >= MAKS_FORSOEG) {
      opgivet++;
      try { onDropped?.(post); } catch (_) { /* må ikke vælte tømningen */ }
    } else {
      tilbage.push({ ...post, forsoeg });
    }
  }

  skriv(tilbage);
  return { sendt, tilbage: tilbage.length, opgivet };
}
