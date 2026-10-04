// Tid og tekst til ankomst-SMS'en (oktober 2026). Ren logik uden afhængigheder,
// så den kan testes i Node (tests/arrivalTime.test.mjs).
//
// SAMME REGLER SOM SERVEREN: sætningerne herunder skal være identiske med
// byggTekst/varighedTekst i supabase/functions/send-ankomst-sms/index.ts. Det er
// serveren, der bygger den SMS kunden får; her bruges de kun til at vise
// montøren, hvad kunden kommer til at få, før der trykkes. Testen tjekker begge
// de samme eksempler, så de ikke glider fra hinanden.

export const MAKS_MINUTTER = 240;

// Standard-hurtigknapper. En enkelt tid, eller et interval [fra, til]. Butikken kan
// selv ændre dem under Admin -> SMS (se lib/smsSettings.js); det her er det, en
// butik uden egne indstillinger får.
export const ENKELT_TIDER = [5, 10, 15, 30, 60];
export const INTERVALLER = [[15, 30], [30, 60], [60, 120]];
export const MAKS_ENKELTE = 8;
export const MAKS_INTERVALLER = 6;

// "45 minutter", "1 minut", "1 time", "2 timer", "1 time og 30 minutter".
export function varighedTekst(min) {
  if (min < 60) return `${min} ${min === 1 ? "minut" : "minutter"}`;
  const t = Math.floor(min / 60);
  const r = min % 60;
  const timer = `${t} ${t === 1 ? "time" : "timer"}`;
  return r === 0 ? timer : `${timer} og ${r} ${r === 1 ? "minut" : "minutter"}`;
}

// "om ca. 15 minutter"  /  "om mellem 30 og 60 minutter"  /  "om mellem 1 og 2 timer"
export function ankomstFrase(fra, til) {
  if (til === undefined || til === null) return `om ca. ${varighedTekst(fra)}`;
  const heleTimer = fra >= 60 && fra % 60 === 0 && til % 60 === 0;
  return heleTimer ? `om mellem ${fra / 60} og ${til / 60} timer` : `om mellem ${fra} og ${til} minutter`;
}

// Kort tekst til en knap: "30–60 min", "1–2 timer".
export function intervalKnapTekst(fra, til) {
  const heleTimer = fra >= 60 && fra % 60 === 0 && til % 60 === 0;
  return heleTimer ? `${fra / 60}–${til / 60} timer` : `${fra}–${til} min`;
}

// Tolker det, brugeren har skrevet i felterne "fra" og "til (valgfri)".
//   { ok: true, fra, til }   til = null, når feltet er tomt (en enkelt tid)
//   { ok: false, tom: true } intet skrevet endnu (ingen fejlbesked at vise)
//   { ok: false, fejl }      noget er forkert (besked på dansk)
export function tolkAnkomst(fraTekst, tilTekst) {
  const f = String(fraTekst ?? "").trim();
  const t = String(tilTekst ?? "").trim();
  if (f === "" && t === "") return { ok: false, tom: true };
  if (f === "") return { ok: false, fejl: "Skriv, hvor mange minutter der går mindst." };
  const helt = /^\d{1,3}$/;
  if (!helt.test(f)) return { ok: false, fejl: "Skriv antal minutter som et helt tal." };
  const fra = Number(f);
  if (fra < 1 || fra > MAKS_MINUTTER) return { ok: false, fejl: `Minutter skal være mellem 1 og ${MAKS_MINUTTER}.` };
  if (t === "") return { ok: true, fra, til: null };
  if (!helt.test(t)) return { ok: false, fejl: "Skriv antal minutter som et helt tal." };
  const til = Number(t);
  if (til > MAKS_MINUTTER) return { ok: false, fejl: `Minutter skal være mellem 1 og ${MAKS_MINUTTER}.` };
  if (til <= fra) return { ok: false, fejl: "“Til” skal være større end “fra”." };
  return { ok: true, fra, til };
}

// ---------------------------------------------------------------------------
// SKABELONER (oktober 2026). Teksten til kunden er en skabelon med to pladsholdere:
//   {fornavn}  kundens fornavn
//   {tid}      "15 minutter" / "1 time" - eller ved et interval "30 og 60 minutter"
// Det er SERVEREN, der udfylder skabelonen og sender SMS'en; her bruges de samme
// regler til at vise et eksempel og til at advare, før der gemmes. Databasen
// afviser en ugyldig tekst alligevel (sms_template_error), og testen sikrer, at
// klient og server giver samme sætninger.

export const STANDARD_SKABELON_ENKELT = "Hej {fornavn}, vi forventer at ankomme hos dig om ca. {tid}.";
export const STANDARD_SKABELON_INTERVAL = "Hej {fornavn}, vi forventer at ankomme hos dig om mellem {tid}.";
export const MAKS_SKABELON = 320;

// Første ord af navnet, kun bogstaver og bindestreg, max 20 tegn.
export function fornavnFra(navn) {
  const foerste = String(navn ?? "").trim().split(/\s+/)[0] || "";
  return foerste.replace(/[^\p{L}\-]/gu, "").slice(0, 20);
}

// "15 minutter" for én tid. Et interval skrives i minutter ("30 og 60 minutter"),
// undtagen når begge ender er hele timer ("1 og 2 timer").
export function tidDel(fra, til) {
  if (til === undefined || til === null) return varighedTekst(fra);
  const heleTimer = fra >= 60 && fra % 60 === 0 && til % 60 === 0;
  return heleTimer ? `${fra / 60} og ${til / 60} timer` : `${fra} og ${til} minutter`;
}

export function udfyldSkabelon(skabelon, fornavn, tid) {
  return skabelon.split("{fornavn}").join(fornavn).split("{tid}").join(tid)
    .replace(/\s+([,.!?:;])/g, "$1") // intet mellemrum foran tegnsætning, når fornavn mangler
    .replace(/ {2,}/g, " ")
    .trim();
}

// null = gyldig, ellers en besked på dansk. Samme regler som databasens
// sms_template_error (og samme tekster).
export function skabelonFejl(t) {
  if (typeof t !== "string" || t.trim().length < 10) return "Teksten skal være mindst 10 tegn.";
  if (t.length > MAKS_SKABELON) return `Teksten må højst være ${MAKS_SKABELON} tegn.`;
  if (/[\u0000-\u001f\u007f]/.test(t)) return "Teksten må ikke indeholde linjeskift eller andre specialtegn.";
  if (!t.includes("{tid}")) return "Teksten skal indeholde {tid}, så kunden får at vide, hvornår I kommer.";
  if (/[{}]/.test(t.split("{tid}").join("").split("{fornavn}").join(""))) return "Kun {fornavn} og {tid} kan bruges i tuborgparenteser.";
  if (/(https?:|www\.|\.(dk|com|net|org|eu)\b)/i.test(t)) return "Teksten må ikke indeholde links.";
  return null;
}

// Den besked kunden får. Er skabelonen ugyldig, bruges standardteksten - som
// serveren også gør.
export function byggBesked(skabelon, kundeNavn, fra, til) {
  const erInterval = til !== undefined && til !== null;
  const standard = erInterval ? STANDARD_SKABELON_INTERVAL : STANDARD_SKABELON_ENKELT;
  const brug = skabelonFejl(skabelon) === null ? skabelon : standard;
  return udfyldSkabelon(brug, fornavnFra(kundeNavn), tidDel(fra, til));
}

// null = gyldig. Samme regler som databasens sms_quick_error.
export function knapperFejl(enkelte, intervaller) {
  const e = Array.isArray(enkelte) ? enkelte : [];
  if (e.length > MAKS_ENKELTE) return `Højst ${MAKS_ENKELTE} hurtigknapper med én tid.`;
  if (e.some((x) => !Number.isInteger(x) || x < 1 || x > MAKS_MINUTTER)) return `Hurtigknapper med én tid skal være mellem 1 og ${MAKS_MINUTTER} minutter.`;
  if (new Set(e).size !== e.length) return "Den samme tid er valgt flere gange.";
  const i = Array.isArray(intervaller) ? intervaller : [];
  if (i.length > MAKS_INTERVALLER) return `Højst ${MAKS_INTERVALLER} hurtigknapper med et interval.`;
  const set = new Set();
  for (const p of i) {
    if (!Array.isArray(p) || p.length !== 2 || !Number.isInteger(p[0]) || !Number.isInteger(p[1])) return "Et interval skal være to hele tal.";
    if (p[0] < 1 || p[1] > MAKS_MINUTTER) return `Intervaller skal ligge mellem 1 og ${MAKS_MINUTTER} minutter.`;
    if (p[1] <= p[0]) return "I et interval skal slutningen være større end starten.";
    const n = `${p[0]}-${p[1]}`;
    if (set.has(n)) return "Det samme interval er valgt flere gange.";
    set.add(n);
  }
  return null;
}

// Afsender: et navn på højst 11 bogstaver/tal (mindst ét bogstav, kun A-Z, a-z, 0-9
// og mellemrum) eller et nummer på højst 15 cifre. Tomt = den fælles afsender.
// Samme regel som databasen (set_store_sms_sender).
export function afsenderFejl(v) {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  if (/^[0-9]{1,15}$/.test(s)) return null;
  if (/^[A-Za-z0-9 ]{1,11}$/.test(s) && /[A-Za-z]/.test(s)) return null;
  return "Afsenderen skal være et navn på højst 11 bogstaver/tal (mindst ét bogstav, ingen æ/ø/å eller tegn) eller et nummer på højst 15 cifre.";
}

// Hvor mange SMS'er en tekst fylder. Almindelige tegn (inkl. æ ø å) giver 160 tegn
// pr. SMS, 153 pr. del ved flere. Et enkelt tegn uden for den almindelige tegnsamling
// (fx en tankestreg eller emoji) gør hele beskeden til 70 tegn pr. SMS, 67 pr. del.
const GSM = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;
export function smsAntal(tekst) {
  const t = String(tekst ?? "");
  const gsm = GSM.test(t);
  const enkelt = gsm ? 160 : 70;
  const del = gsm ? 153 : 67;
  return { tegn: t.length, gsm, segmenter: t.length === 0 ? 0 : t.length <= enkelt ? 1 : Math.ceil(t.length / del) };
}
