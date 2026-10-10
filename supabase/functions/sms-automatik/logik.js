// Ren logik til automatiske kunde-SMS'er (bekræftelse, ændring, påmindelser), oktober 2026.
// Ingen netværk, ingen database - kun regler, så de kan testes. Filen findes i to ens kopier:
//   src/lib/smsAutomationLogik.js  (admin-siden: validering + eksempel)
//   supabase/functions/sms-automatik/logik.js  (serveren: hvem skal have hvad, og hvornår)
// tests/sms-automatik.test.mjs sikrer, at de er identiske.

export const TILLADTE_PLADSHOLDERE = ["fornavn", "dato", "tidsrum", "butik"];
export const MAKS_SKABELON = 320;
export const MIN_SKABELON = 10;

export const STANDARD_TEKSTER = {
  bekraeftelse: "Hej {fornavn}, din levering er booket til {dato} i tidsrummet {tidsrum}. Vi kontakter dig, hvis noget ændrer sig. Mvh {butik}",
  aendring: "Hej {fornavn}, din levering er flyttet til {dato} i tidsrummet {tidsrum}. Mvh {butik}",
  aften: "Hej {fornavn}, en påmindelse om at du får din levering i morgen, {dato}, i tidsrummet {tidsrum}. Mvh {butik}",
  morgen: "Hej {fornavn}, i dag leverer vi hos dig i tidsrummet {tidsrum}. Mvh {butik}",
};
export const STANDARD_TIDER = { aftenMin: 18 * 60, morgenMin: 7 * 60 + 30 };

// Samme regler som databasens sms_auto_template_error. Returnerer en dansk fejltekst eller null.
export function skabelonFejl(t) {
  if (typeof t !== "string") return "Teksten mangler.";
  if (t.trim().length < MIN_SKABELON) return `Teksten skal være mindst ${MIN_SKABELON} tegn.`;
  if (t.length > MAKS_SKABELON) return `Teksten må højst være ${MAKS_SKABELON} tegn.`;
  if (/[\u0000-\u001f\u007f]/.test(t)) return "Teksten må ikke indeholde linjeskift eller styretegn.";
  const fundne = t.match(/\{[^{}]*\}/g) || [];
  for (const f of fundne) {
    if (!TILLADTE_PLADSHOLDERE.includes(f.slice(1, -1))) return `Ukendt pladsholder ${f}. Tilladt: ${TILLADTE_PLADSHOLDERE.map((p) => `{${p}}`).join(", ")}.`;
  }
  const uden = fundne.reduce((s, f) => s.split(f).join(""), t);
  if (/[{}]/.test(uden)) return "Teksten har en tuborg ({ eller }), der ikke hører til en pladsholder.";
  if (/(https?:|www\.|\.(dk|com|net|org|eu)\b)/i.test(t)) return "Links er ikke tilladt i en SMS.";
  return null;
}

export function danskNummer(raa) {
  let d = String(raa ?? "").replace(/\D/g, "");
  if (d.startsWith("0045")) d = d.slice(4);
  else if (d.length === 10 && d.startsWith("45")) d = d.slice(2);
  return /^[2-9]\d{7}$/.test(d) ? d : null;
}

export function fornavnFra(navn) {
  const foerste = String(navn ?? "").trim().split(/\s+/)[0] || "";
  return foerste.replace(/[^\p{L}\-]/gu, "").slice(0, 20);
}

// Butiksnavn til SMS: kun bogstaver, tal, mellemrum og få tegn (ingen links/tegn der gør SMS'en dyrere).
export function butikTekst(navn) {
  return String(navn ?? "").replace(/[^\p{L}\p{N} &.\-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 30);
}

const UGEDAGE = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
const MAANEDER = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

export const erIsoDato = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T12:00:00Z"));

// "2026-10-16" -> "fredag den 16. oktober"
export function datoTekst(iso) {
  if (!erIsoDato(iso)) return "";
  const d = new Date(iso + "T12:00:00Z");
  return `${UGEDAGE[d.getUTCDay()]} den ${d.getUTCDate()}. ${MAANEDER[d.getUTCMonth()]}`;
}

export function plusDage(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const erKl = (s) => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const klMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));

// "08:00-12:00" (almindelig bindestreg, så SMS'en holder sig i GSM-tegnsættet)
export function tidsrumTekst(start, slut) {
  if (!erKl(start) || !erKl(slut) || klMin(slut) <= klMin(start)) return "";
  return `${start}-${slut}`;
}

export function udfyld(skabelon, v) {
  return String(skabelon)
    .split("{fornavn}").join(v.fornavn || "")
    .split("{dato}").join(v.dato || "")
    .split("{tidsrum}").join(v.tidsrum || "")
    .split("{butik}").join(v.butik || "")
    .replace(/\s+([,.!?:;])/g, "$1")
    .replace(/ {2,}/g, " ")
    .trim();
}

// Dato og klokkeslæt i Danmark (Europe/Copenhagen) for et tidspunkt i ms.
export function kobenhavn(ms) {
  const dele = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms)).reduce((a, p) => { a[p.type] = p.value; return a; }, {});
  return { dato: `${dele.year}-${dele.month}-${dele.day}`, minutter: Number(dele.hour) * 60 + Number(dele.minute) };
}

export const KINDS = ["bekraeftelse", "aendring", "paamindelse_aften", "paamindelse_morgen"];
export const SKABELON_AF_KIND = { bekraeftelse: "bekraeftelse", aendring: "aendring", paamindelse_aften: "aften", paamindelse_morgen: "morgen" };

export const NY_SAG_RO_MS = 3 * 60_000;       // samle hurtige rettelser, før der sendes
export const PAAMINDELSE_EFTER_BESKED_MS = 3 * 3600_000; // ingen påmindelse lige efter en bekræftelse
export const AFTEN_SLUT_MIN = 22 * 60;        // aften-påmindelsen sendes ikke efter kl. 22
export const MAKS_FORSOEG = 3;
export const GENFORSOEG_EFTER_MS = 10 * 60_000;

export const bookingNoegle = (o) => `${o.dato}|${o.tidsrumId || "heldag"}`;

// Bestemmer, hvad der skal ske lige nu. Rent og deterministisk.
//   ordrer:   [{ id, dato, tidsrumId, start, slut, telefon, status, opdateretMs }]
//   tilstand: [{ ordreId, kind, noegle, status, forsoeg, oprettetMs, opdateretMs }]  (rækker fra sms_automation_state)
//   indst:    { bekraeftelse, aendring, aften, morgen, aftenMin, morgenMin }  (booleans + minutter efter midnat)
// Returnerer { send: [{ ordreId, kind, noegle, genforsoeg }], registrer: [{ ordreId, kind, noegle }] }
// registrer = noter "sprunget over", så samme vurdering ikke gentages (fx ændring, mens ændrings-SMS er slået fra).
export function planlaeg({ ordrer, tilstand, indst, nu }) {
  const { dato: iDag, minutter: nuMin } = kobenhavn(nu);
  const imorgen = plusDage(iDag, 1);
  const send = [];
  const registrer = [];
  const rkPrOrdre = new Map();
  for (const r of tilstand || []) {
    if (!rkPrOrdre.has(r.ordreId)) rkPrOrdre.set(r.ordreId, []);
    rkPrOrdre.get(r.ordreId).push(r);
  }

  for (const o of ordrer || []) {
    if (!o || !erIsoDato(o.dato) || o.dato < iDag) continue;
    if (o.status === "afsluttet") continue;
    if (!danskNummer(o.telefon)) continue;
    const noegle = bookingNoegle(o);
    const raekker = rkPrOrdre.get(o.id) || [];
    const bookingRaekker = raekker.filter((r) => r.kind === "bekraeftelse" || r.kind === "aendring")
      .sort((a, b) => a.oprettetMs - b.oprettetMs);
    const seneste = bookingRaekker[bookingRaekker.length - 1];

    // --- Bekræftelse / ændring: kun når sagen har ligget i ro et par minutter
    if (nu - (o.opdateretMs || 0) >= NY_SAG_RO_MS) {
      if (!seneste) {
        const kind = "bekraeftelse";
        if (indst.bekraeftelse) send.push({ ordreId: o.id, kind, noegle, genforsoeg: false });
        else registrer.push({ ordreId: o.id, kind, noegle });
      } else if (seneste.noegle !== noegle) {
        const kind = "aendring";
        if (indst.aendring) send.push({ ordreId: o.id, kind, noegle, genforsoeg: false });
        else registrer.push({ ordreId: o.id, kind, noegle });
      }
    }

    // --- Genforsøg af en afsendelse, der FEJLEDE sikkert (udbyderen svarede med en fejl). Aldrig ved usikkert udfald.
    for (const r of raekker) {
      if (r.status !== "fejl" || r.noegle !== noegle || r.forsoeg >= MAKS_FORSOEG) continue;
      if (nu - r.opdateretMs < GENFORSOEG_EFTER_MS) continue;
      if (r.kind === "bekraeftelse" && !indst.bekraeftelse) continue;
      if (r.kind === "aendring" && !indst.aendring) continue;
      if (r.kind === "paamindelse_aften" && !(indst.aften && o.dato === imorgen && nuMin < AFTEN_SLUT_MIN)) continue;
      if (r.kind === "paamindelse_morgen" && !(indst.morgen && o.dato === iDag)) continue;
      if (!send.some((s) => s.ordreId === o.id && s.kind === r.kind)) send.push({ ordreId: o.id, kind: r.kind, noegle, genforsoeg: true });
    }

    // --- Påmindelser
    const nyligBesked = raekker.some((r) => (r.kind === "bekraeftelse" || r.kind === "aendring")
      && (r.status === "sendt" || r.status === "afventer") && nu - r.oprettetMs < PAAMINDELSE_EFTER_BESKED_MS)
      || send.some((s) => s.ordreId === o.id && (s.kind === "bekraeftelse" || s.kind === "aendring"));
    const harRaekke = (kind) => raekker.some((r) => r.kind === kind && r.noegle === noegle);
    const paamind = (kind) => {
      if (harRaekke(kind)) return;
      if (nyligBesked) registrer.push({ ordreId: o.id, kind, noegle });
      else send.push({ ordreId: o.id, kind, noegle, genforsoeg: false });
    };
    if (indst.aften && o.dato === imorgen && nuMin >= indst.aftenMin && nuMin < AFTEN_SLUT_MIN) paamind("paamindelse_aften");
    if (indst.morgen && o.dato === iDag && nuMin >= indst.morgenMin) {
      const startMin = erKl(o.start) ? klMin(o.start) : 8 * 60;
      if (nuMin < startMin) paamind("paamindelse_morgen");
    }
  }
  return { send, registrer };
}
