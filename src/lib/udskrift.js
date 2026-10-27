// ETIKETFORMATER OG SIDEOPDELING TIL UDSKRIFT (oktober 2026). Rene funktioner (tests/udskrift.test.mjs); selve udskriften ligger i components/Udskriv.jsx.
//
// Udskrift sker via browserens egen print-dialog, så enhver printer, der er installeret på computeren (A4-laser, Brother QL, Dymo, Zebra, DHL/GLS-pakkelabel),
// virker uden særlig opkobling. Siden bestemmer papirstørrelsen (@page): et A4-ark med et gitter af labels, eller en rulle, hvor hver label er sin egen side.
// Mål er i millimeter. Arkformaterne er de gængse A4-ark (Avery L7160/L7163/L7165 m.fl.); tjek altid med en prøveudskrift på almindeligt papir.

export const ETIKET_FORMATER = [
  { id: "ark-l7163", gruppe: "A4-ark med labels", navn: "14 pr. ark · 99,1 × 38,1 mm (fx Avery L7163)", type: "ark", b: 99.1, h: 38.1, kol: 2, raekker: 7, top: 15.1, venstre: 4.65, gapX: 2.5, gapY: 0 },
  { id: "ark-l7160", gruppe: "A4-ark med labels", navn: "21 pr. ark · 63,5 × 38,1 mm (fx Avery L7160)", type: "ark", b: 63.5, h: 38.1, kol: 3, raekker: 7, top: 15.1, venstre: 7.25, gapX: 2.5, gapY: 0 },
  { id: "ark-l7165", gruppe: "A4-ark med labels", navn: "8 pr. ark · 99,1 × 67,7 mm (fx Avery L7165)", type: "ark", b: 99.1, h: 67.7, kol: 2, raekker: 4, top: 13.1, venstre: 4.65, gapX: 2.5, gapY: 0 },
  { id: "ark-2x5", gruppe: "A4-ark med labels", navn: "10 pr. ark · 105 × 57 mm (2 × 5)", type: "ark", b: 105, h: 57, kol: 2, raekker: 5, top: 6, venstre: 0, gapX: 0, gapY: 0 },
  { id: "ark-2x2", gruppe: "A4-ark med labels", navn: "4 pr. ark · 105 × 148,5 mm (2 × 2)", type: "ark", b: 105, h: 148.5, kol: 2, raekker: 2, top: 0, venstre: 0, gapX: 0, gapY: 0 },
  { id: "ark-hel", gruppe: "A4-ark med labels", navn: "1 pr. ark · hel A4-side", type: "ark", b: 210, h: 297, kol: 1, raekker: 1, top: 0, venstre: 0, gapX: 0, gapY: 0 },
  { id: "rulle-100x150", gruppe: "Rulle / pakkelabel (én label pr. side)", navn: "100 × 150 mm (pakkelabel, fx Zebra, GLS, DHL)", type: "rulle", b: 100, h: 150 },
  { id: "rulle-102x152", gruppe: "Rulle / pakkelabel (én label pr. side)", navn: "102 × 152 mm (4 × 6 tommer)", type: "rulle", b: 102, h: 152 },
  { id: "rulle-62x100", gruppe: "Rulle / pakkelabel (én label pr. side)", navn: "62 × 100 mm (Brother DK-11202, stående)", type: "rulle", b: 62, h: 100 },
  { id: "rulle-62x29", gruppe: "Rulle / pakkelabel (én label pr. side)", navn: "62 × 29 mm (Brother DK-11209)", type: "rulle", b: 62, h: 29 },
  { id: "rulle-90x29", gruppe: "Rulle / pakkelabel (én label pr. side)", navn: "90 × 29 mm (Brother DK-11201)", type: "rulle", b: 90, h: 29 },
  { id: "rulle-101x54", gruppe: "Rulle / pakkelabel (én label pr. side)", navn: "101 × 54 mm (Dymo 99014)", type: "rulle", b: 101, h: 54 },
  { id: "rulle-89x36", gruppe: "Rulle / pakkelabel (én label pr. side)", navn: "89 × 36 mm (Dymo 99012)", type: "rulle", b: 89, h: 36 },
  { id: "rulle-57x32", gruppe: "Rulle / pakkelabel (én label pr. side)", navn: "57 × 32 mm (Dymo 11354)", type: "rulle", b: 57, h: 32 },
];
export const STANDARD_FORMAT_ID = "ark-l7163";
export const A4 = { b: 210, h: 297 };

// Egne mål (gemmes af skærmbilledet). Ugyldige eller urealistiske tal afvises (null), så siden aldrig får en umulig størrelse.
export function tilpasFormat(felter) {
  const n = (v) => Number(String(v).replace(",", "."));
  const b = n(felter?.b), h = n(felter?.h);
  if (!(b >= 15 && b <= 300 && h >= 10 && h <= 400)) return null;
  if (felter.type === "rulle") return { id: "tilpasset", gruppe: "Egne mål", navn: `Egne mål · ${b} × ${h} mm`, type: "rulle", b, h };
  const kol = Math.floor(n(felter.kol)), raekker = Math.floor(n(felter.raekker));
  const top = n(felter.top || 0), venstre = n(felter.venstre || 0), gapX = n(felter.gapX || 0), gapY = n(felter.gapY || 0);
  if (!(kol >= 1 && kol <= 8 && raekker >= 1 && raekker <= 20)) return null;
  if (![top, venstre, gapX, gapY].every((x) => Number.isFinite(x) && x >= 0 && x <= 100)) return null;
  if (venstre + kol * b + (kol - 1) * gapX > A4.b + 0.01 || top + raekker * h + (raekker - 1) * gapY > A4.h + 0.01) return null; // skal være på et A4-ark
  return { id: "tilpasset", gruppe: "Egne mål", navn: `Egne mål · ${kol * raekker} pr. ark · ${b} × ${h} mm`, type: "ark", b, h, kol, raekker, top, venstre, gapX, gapY };
}

export const findFormat = (id, egen) => (id === "tilpasset" ? egen || null : ETIKET_FORMATER.find((f) => f.id === id) || null);
export const labelsPrSide = (f) => (f.type === "ark" ? f.kol * f.raekker : 1);

// Sider med labels. `start` = hvilken plads på det FØRSTE ark, der er den første ledige (1 = øverst til venstre), så et delvist brugt ark kan bruges færdigt.
// Rulle: én label pr. side, start ignoreres. Returnerer [{ celler: [{ plads, label|null, x, y }] }] (x/y i mm fra sidens øverste venstre hjørne).
export function lavSider(format, labels, start = 1) {
  const pr = labelsPrSide(format);
  if (format.type === "rulle") return (labels || []).map((label) => ({ celler: [{ plads: 1, label, x: 0, y: 0 }] }));
  const forskydning = Math.min(Math.max(Math.floor(Number(start) || 1), 1), pr) - 1;
  const alle = [...Array(forskydning).fill(null), ...(labels || [])];
  const sider = [];
  for (let i = 0; i < alle.length; i += pr) {
    const celler = [];
    alle.slice(i, i + pr).forEach((label, k) => {
      const kol = k % format.kol, raekke = Math.floor(k / format.kol);
      celler.push({ plads: k + 1, label, x: format.venstre + kol * (format.b + format.gapX), y: format.top + raekke * (format.h + format.gapY) });
    });
    sider.push({ celler });
  }
  return sider;
}

// CSS til @page: arkformater og dokumenter på A4, rulle i labelens egen størrelse.
export function sideCss(format) {
  if (!format) return "@page { size: A4 portrait; margin: 10mm; }";
  if (format.type === "rulle") return `@page { size: ${format.b}mm ${format.h}mm; margin: 0; }`;
  return "@page { size: A4 portrait; margin: 0; }";
}

// Hvor meget plads er der på labelen? Styrer hvilke linjer og hvor store skrifter, der bruges.
export function labelNiveau(format) {
  const minste = Math.min(format.b, format.h);
  if (format.h < 32 || minste < 28) return "mini";
  if (format.h < 45) return "kompakt";
  if (format.b >= 95 && format.h >= 95) return "stor";
  return "normal";
}

// ---- Husk brugerens valg af label-format på denne enhed (hvert sted har sin egen printer). Ugyldigt eller ødelagt indhold giver standardværdierne.
const LAGER_NOEGLE = "p1sybs-label-indstillinger";
export const STANDARD_LABEL_INDSTILLINGER = { formatId: STANDARD_FORMAT_ID, egen: { type: "ark", b: "", h: "", kol: "", raekker: "", top: "0", venstre: "0", gapX: "0", gapY: "0" }, start: 1, kopier: 1, rammer: false };

export function laesLabelIndstillinger(lager) {
  try {
    const o = JSON.parse(lager.getItem(LAGER_NOEGLE) || "null");
    if (!o || typeof o !== "object") return STANDARD_LABEL_INDSTILLINGER;
    const egen = o.egen && typeof o.egen === "object" ? { ...STANDARD_LABEL_INDSTILLINGER.egen, ...o.egen } : STANDARD_LABEL_INDSTILLINGER.egen;
    const formatId = o.formatId === "tilpasset" || ETIKET_FORMATER.some((f) => f.id === o.formatId) ? o.formatId : STANDARD_FORMAT_ID;
    const heltal = (v, min, max, std) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : std; };
    return { formatId, egen, start: heltal(o.start, 1, 100, 1), kopier: heltal(o.kopier, 1, 4, 1), rammer: !!o.rammer };
  } catch (_) { return STANDARD_LABEL_INDSTILLINGER; }
}
export function gemLabelIndstillinger(lager, v) {
  try { lager.setItem(LAGER_NOEGLE, JSON.stringify(v)); return true; } catch (_) { return false; }
}
