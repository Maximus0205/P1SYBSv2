// BILLEDKØ - kernen (oktober 2026). Ingen DOM, IndexedDB eller Supabase her: lager, upload,
// netværksstatus og bruger gives udefra, så reglerne kan afprøves direkte med node
// (tests/billedKoe.test.mjs). Selve lageret (IndexedDB) ligger i billedKoeStore.js og
// sammensætningen til appen i billedKoe.js.
//
// PROBLEMET: et billede, der ikke kunne sendes (kælder, elevator, betonbyggeri), blev før
// kun meldt som en fejl - og billedet var væk. Billedet er dokumentation for udført arbejde.
//
// REGLERNE:
//   * Billedet gemmes lokalt FØR noget sendes, og slettes lokalt FØRST når serveren har
//     bekræftet det. Intet billede forsvinder af en netværksfejl, en lukket app eller et
//     nedbrud midt i en upload.
//   * Midlertidige fejl (ingen net, ikke logget ind lige nu, serverfejl 5xx) tæller ALDRIG
//     som forsøg - billedet bliver bare liggende og prøves igen.
//   * Kun en reel afvisning fra serveren tæller. Efter MAKS_AFVISNINGER stopper de
//     automatiske forsøg ('afvist'), men billedet SLETTES ALDRIG - brugeren kan prøve igen.
//   * Uploaden er i to trin (send fil, bekræft). Faldt nettet lige efter filen var sendt,
//     gemmes vedhæftningens id, og næste forsøg bekræfter blot - ellers ville billedet
//     komme to gange.
//   * Kun ÉN afsendelse kører ad gangen (også på tværs af faner via laas), og billeder
//     sendes i den rækkefølge, de blev taget.
//   * Et billede hører til den bruger, der tog det: en anden bruger på samme enhed sender
//     det ikke, og ingen bruger (ikke logget ind) sender intet.

export const MAKS_AFVISNINGER = 5;

// Er resultatet af en upload en fejl, der kan vente, frem for en afvisning?
export function erMidlertidigFejl(r) {
  if (!r || r.ok) return false;
  if (r.netvaerk) return true;
  const besked = String(r.fejl || "").toLowerCase();
  if (/ikke logget ind|jwt|token|unauthori[sz]ed|\b401\b/.test(besked)) return true;
  if (/status 5\d\d|\b5\d\d\b.*(server|gateway|unavailable)|timeout|timed out/.test(besked)) return true;
  return false;
}

export function opretBilledKoe({
  store,                         // { put(post), delete(id), getAll() } - alle async
  upload,                        // async ({ orderId, blob, navn, mimeType, kind, genoptag }) => { ok, fejl?, netvaerk?, fase?, vedhaeftningId? }
  erOnline = () => true,
  ejer = async () => null,       // async () => id på den indloggede bruger, eller null
  nu = () => Date.now(),
  laas = (fn) => fn(),           // (fn) => kør fn, hvis ingen anden fane sender lige nu
  nytId = () => `${nu()}-${Math.random().toString(36).slice(2, 10)}`,
  maksAfvisninger = MAKS_AFVISNINGER,
} = {}) {
  if (!store || typeof upload !== "function") throw new Error("opretBilledKoe: store og upload mangler");

  const lyttere = new Set();
  const sender = new Set();      // id'er på poster, der sendes lige nu (kun i hukommelsen)
  let cache = null;              // seneste kendte poster
  let koerer = false;
  let seneste = null;            // { besked, id } for seneste post, der blev afvist

  async function indlaes() {
    cache = (await store.getAll()).slice().sort((a, b) => a.oprettet - b.oprettet || String(a.id).localeCompare(String(b.id)));
    return cache;
  }
  function visning() {
    return (cache || []).map((p) => ({ ...p, sender: sender.has(p.id) }));
  }
  function giv() {
    const v = visning();
    lyttere.forEach((fn) => { try { fn(v); } catch (_) { /* en lytter må aldrig vælte køen */ } });
  }

  // Gemmer billedet lokalt. Svarer { ok:true, id } først når det ER gemt; { ok:false, fejl } hvis
  // lageret afviser (fuldt, blokeret) - så kan kalderen vælge at sende direkte i stedet.
  async function laegIKoe({ orderId, blob, navn, mimeType, kind = "billede", ejerId = null }) {
    if (!orderId || !blob) return { ok: false, fejl: "Mangler sag eller billede" };
    const post = {
      id: nytId(), orderId: String(orderId), kind, navn: navn || "Billede", mimeType: mimeType || blob.type || "image/jpeg",
      blob, ejer: ejerId, oprettet: nu(), afvisninger: 0, sidsteFejl: null, vedhaeftningId: null, tilstand: "venter",
    };
    try {
      await store.put(post);
    } catch (e) {
      return { ok: false, fejl: e?.message || "Billedet kunne ikke gemmes på enheden" };
    }
    await indlaes();
    giv();
    return { ok: true, id: post.id };
  }

  // Sender det, der kan sendes. Kaldes ved opstart, når nettet kommer tilbage, når appen får
  // fokus, med jævne mellemrum og lige efter et billede er lagt i køen. Svarer antal sendt.
  async function proev() {
    if (koerer) return 0;
    koerer = true;
    let sendt = 0;
    try {
      await laas(async () => {
        await indlaes();
        const meg = await ejer();
        if (!meg) { giv(); return; }               // ikke logget ind: intet at gøre endnu
        for (const p of cache.filter((x) => x.tilstand !== "afvist" && (!x.ejer || x.ejer === meg))) {
          if (!erOnline()) break;
          sender.add(p.id); giv();
          let r;
          try {
            r = await upload({ orderId: p.orderId, blob: p.blob, navn: p.navn, mimeType: p.mimeType, kind: p.kind, genoptag: p.vedhaeftningId || undefined });
          } catch (e) {
            r = { ok: false, fejl: e?.message || "Ukendt fejl", netvaerk: false };
          }
          sender.delete(p.id);

          if (r.ok) {
            await store.delete(p.id);               // FØRST nu, efter serverens bekræftelse
            sendt++;
          } else if (p.vedhaeftningId && r.fase === "genoptag" && !r.netvaerk) {
            // Bekræftelsen af den tidligere sendte fil kunne ikke gennemføres (filen findes ikke
            // alligevel): send hele billedet forfra næste gang. Tæller ikke som afvisning.
            await store.put({ ...p, vedhaeftningId: null, sidsteFejl: r.fejl || null });
          } else if (erMidlertidigFejl(r)) {
            await store.put({ ...p, vedhaeftningId: r.vedhaeftningId || p.vedhaeftningId || null, sidsteFejl: r.fejl || null });
            await indlaes(); giv();
            break;                                  // nettet/login er væk - prøv resten senere
          } else {
            const afvisninger = (p.afvisninger || 0) + 1;
            const afvist = afvisninger >= maksAfvisninger;
            await store.put({ ...p, afvisninger, sidsteFejl: r.fejl || "Afvist", tilstand: afvist ? "afvist" : "venter" });
            if (afvist) seneste = { id: p.id, besked: r.fejl || "Afvist" };
          }
          await indlaes(); giv();
        }
      });
    } finally {
      koerer = false;
    }
    return sendt;
  }

  // Brugeren trykker "Prøv igen" på et afvist billede: ny runde, tæller nulstilles.
  async function proevIgen(id) {
    await indlaes();
    const p = cache.find((x) => x.id === id);
    if (!p) return false;
    await store.put({ ...p, tilstand: "venter", afvisninger: 0, sidsteFejl: null, vedhaeftningId: null });
    await indlaes(); giv();
    await proev();
    return true;
  }

  async function hent() { await indlaes(); return visning(); }
  const hentForSag = async (orderId) => (await hent()).filter((p) => p.orderId === String(orderId));
  function abonner(fn) {
    lyttere.add(fn);
    if (cache) { try { fn(visning()); } catch (_) { /* som ovenfor */ } }
    else indlaes().then(() => { if (lyttere.has(fn)) { try { fn(visning()); } catch (_) { /* som ovenfor */ } } }).catch(() => {});
    return () => lyttere.delete(fn);
  }
  const sidsteAfvisning = () => seneste;

  return { laegIKoe, proev, proevIgen, hent, hentForSag, abonner, sidsteAfvisning };
}
