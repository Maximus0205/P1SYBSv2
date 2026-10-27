// FIND EN SAG OG UDSKRIV PLUKKESEDDEL (oktober 2026): lageret skal kunne finde en bestemt sag - også en, der først skal leveres om flere uger - og udskrive en
// plukkeseddel/labels for KUN den sag, så varerne kan sættes til side og mærkes. Ren logik (tests/sagsplukseddel.test.mjs); visning ligger i components/.
import { linjeSkalPlukkes } from "./ydelser.js";
import { rmaLinjer } from "./rma.js";

const norm = (s) => String(s ?? "").toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa").normalize("NFKD").replace(/[̀-ͯ]/g, "");
const cifre = (s) => String(s ?? "").replace(/\D/g, "");

// Søger i sagsnummer (med eller uden #), kundenavn, adresse, telefon og varenavne. ALLE søgeord skal matche (fx "hansen vejle").
// Sorteringen: kommende sager først (nærmeste dato først), derefter sager uden dato, til sidst tidligere sager (seneste først).
// Afsluttede sager udelades, medmindre inklAfsluttede er sat. idag = "YYYY-MM-DD". varenavn(linje) -> tekst (lineItemLabel).
export function soegSager(orders, tekst, { idag, inklAfsluttede = false, max = 20, varenavn } = {}) {
  const ord = norm(tekst).replace(/#/g, " ").split(/\s+/).filter(Boolean);
  if (ord.length === 0) return [];
  const tilTal = (o) => (o.dato ? 0 : 1);
  const traef = (o) => {
    const tekstFelter = norm([o.nr, o.kunde?.navn, o.kunde?.adresse, o.sagstype, ...(o.varelinjer || []).map((l) => (varenavn ? varenavn(l) : ""))].join(" "));
    const tlf = cifre(o.kunde?.telefon);
    return ord.every((w) => tekstFelter.includes(w) || (cifre(w).length >= 3 && cifre(w) === w && tlf.includes(w)));
  };
  const fundet = (orders || []).filter((o) => o && (inklAfsluttede || o.status !== "afsluttet") && traef(o));
  const kommende = fundet.filter((o) => o.dato && (!idag || o.dato >= idag)).sort((a, b) => a.dato.localeCompare(b.dato));
  const udenDato = fundet.filter((o) => tilTal(o) === 1);
  const tidligere = fundet.filter((o) => o.dato && idag && o.dato < idag).sort((a, b) => b.dato.localeCompare(a.dato));
  return [...kommende, ...udenDato, ...tidligere].slice(0, max);
}

// Det, der står på en sags plukkeseddel: de varelinjer, der skal plukkes (samme ydelsesregel som Lager-siden - men uden krav om at sagen ligger i dag),
// og åbne RMA-varer, der skal hentes retur ved kunden.
export function plukseddelLinjer(order, primaryServices) {
  const linjer = (order?.varelinjer || []).filter((l) => l && !l.rma && linjeSkalPlukkes(l, primaryServices));
  const rma = rmaLinjer(order).filter((l) => l.rma.status !== "afsluttet");
  return { linjer, rma };
}

// Sagens "etiketter" til varerne: én label pr. vare (kopier = antal pr. vare, 1-4). Bruger label-formen fra RMA-labelen, så de samme formater og printere virker.
export function sagsLabels({ order, primaryServices, butik, varenavn, leveringTekst = "", kopier = 1 }) {
  const antal = Math.min(4, Math.max(1, Math.floor(Number(kopier) || 1)));
  const kort = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const { linjer } = plukseddelLinjer(order, primaryServices);
  const ud = [];
  for (const l of linjer) {
    const label = {
      nr: `SAG-${order.nr}`, kunde: kort(order.kunde?.navn, 40), sag: leveringTekst ? kort(leveringTekst, 30) : "", vare: kort(varenavn ? varenavn(l) : "", 70),
      serienr: "", aarsag: "", butik: kort(butik, 40), dato: "",
    };
    for (let i = 0; i < antal; i++) ud.push(label);
  }
  return ud;
}
