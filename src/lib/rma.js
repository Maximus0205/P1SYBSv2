// RMA-VARER PÅ EN SAG (oktober 2026). En RMA-vare er en vare, der skal hentes retur hos kunden og følges videre (til butikken, leverandøren,
// kreditering). Den markeres på VARELINJEN med feltet `rma` - ingen ny tabel, så den følger sagen og kan ses af alle, der ser sagen:
//   linje.rma = { nr, aarsag, serienr, note, status, oprettet, historik: [{ status, tid, af }] }
// RMA-nummeret er sagsnummeret + et løbenummer ("RMA-26-223-1"), så det er unikt pr. butik uden et fælles tæller-felt og kan læses af en stregkodescanner.
// En RMA-linje er varen, der HENTES - den skal ikke plukkes på lageret (se lib/ydelser.js: linjeSkalPlukkes). Rene funktioner (tests/rma.test.mjs).

export const RMA_STATUSSER = [
  { id: "oprettet", label: "Markeret", hjaelp: "Varen skal hentes retur" },
  { id: "afhentet", label: "Afhentet hos kunden", hjaelp: "Montøren har varen med" },
  { id: "paa_lager", label: "På lager i butikken", hjaelp: "Varen er afleveret i butikken" },
  { id: "sendt", label: "Sendt til leverandør", hjaelp: "På vej til leverandør eller reparatør" },
  { id: "afsluttet", label: "Afsluttet", hjaelp: "Krediteret, repareret eller udskiftet" },
];
export const rmaStatusLabel = (id) => RMA_STATUSSER.find((s) => s.id === id)?.label || id || "";

export const rmaLinjer = (order) => (order?.varelinjer || []).filter((l) => l && l.rma);

// Næste ledige RMA-nummer på sagen: løbenummeret tælles op fra det højeste, der findes, så et nummer aldrig genbruges, selv om en linje er fjernet.
export function naesteRmaNr(order) {
  const base = `RMA-${order?.nr || String(order?.id || "").replace(/[^A-Za-z0-9]/g, "").slice(-6).toUpperCase() || "X"}`;
  const hoejeste = rmaLinjer(order).reduce((m, l) => {
    const t = String(l.rma.nr || "");
    const n = t.startsWith(base + "-") ? Number(t.slice(base.length + 1)) : 0;
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${base}-${hoejeste + 1}`;
}

const rens = (s, max) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function lavRma(order, { aarsag = "", serienr = "", note = "" } = {}, nu = new Date().toISOString(), af = null) {
  return {
    nr: naesteRmaNr(order), aarsag: rens(aarsag, 120), serienr: rens(serienr, 40), note: rens(note, 300),
    status: "oprettet", oprettet: nu, historik: [{ status: "oprettet", tid: nu, af: af || null }],
  };
}

export function rettRma(rma, felter) {
  return { ...rma, aarsag: rens(felter.aarsag ?? rma.aarsag, 120), serienr: rens(felter.serienr ?? rma.serienr, 40), note: rens(felter.note ?? rma.note, 300) };
}

// Skifter status og noterer hvornår og af hvem. Samme status igen ændrer intet; ukendt status afvises (null).
export function skiftRmaStatus(rma, status, nu = new Date().toISOString(), af = null) {
  if (!RMA_STATUSSER.some((s) => s.id === status)) return null;
  if (rma.status === status) return rma;
  return { ...rma, status, historik: [...(rma.historik || []), { status, tid: nu, af: af || null }] };
}

// Det en label viser. varenavn(linje) sendes ind (lineItemLabel i domain.js), så modulet kan afprøves uden React.
export function rmaLabel({ order, linje, butik, varenavn }) {
  return {
    nr: linje.rma.nr,
    kunde: rens(order?.kunde?.navn, 40),
    sag: order?.nr ? `#${order.nr}` : "",
    vare: rens(varenavn ? varenavn(linje) : "", 70),
    serienr: linje.rma.serienr || "",
    aarsag: linje.rma.aarsag || "",
    butik: rens(butik, 40),
    dato: String(linje.rma.oprettet || "").slice(0, 10),
  };
}

// Alle labels til en liste sager (fx en bils tur): kopier = hvor mange labels pr. RMA-vare (1-4).
export function rmaLabelsTilSager({ orders, butik, varenavn, kopier = 1 }) {
  const antal = Math.min(4, Math.max(1, Math.floor(Number(kopier) || 1)));
  const ud = [];
  for (const order of orders || []) {
    for (const linje of rmaLinjer(order)) {
      if (linje.rma.status === "afsluttet") continue;
      const l = rmaLabel({ order, linje, butik, varenavn });
      for (let i = 0; i < antal; i++) ud.push(l);
    }
  }
  return ud;
}
