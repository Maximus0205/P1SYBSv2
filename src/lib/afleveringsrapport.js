// AFLEVERINGSRAPPORT (oktober 2026): en PDF/udskrift til kunden, samlet af sagens dokumentation. Ren logik (tests/afleveringsrapport.test.mjs); visning ligger i components/Afleveringsrapport.jsx.
// Rapporten skrives i fanen Rapporter (order.afleveringsrapport = {udfoert, noter}). Sagens INTERNE noter (order.noter) kommer aldrig med.
export const MAX_RAPPORT_TEKST = 4000;

// Rapporten kan først laves, når sagen er afsluttet.
export const kanLaveRapport = (order) => order?.status === "afsluttet";

const rens = (s) => String(s ?? "").replace(/\r\n/g, "\n").trim().slice(0, MAX_RAPPORT_TEKST);

// Det, der gemmes på sagen. Returnerer null, hvis begge felter er tomme (så en tom rapport ikke fylder).
export function lavRapportFelt({ udfoert, noter }, af, nu = new Date().toISOString()) {
  const u = rens(udfoert);
  const n = rens(noter);
  if (!u && !n) return null;
  return { udfoert: u, noter: n, opdateret: nu, af: af?.navn ? { id: af.id ?? null, navn: String(af.navn).slice(0, 80) } : null };
}

// Alt, der står i rapporten. varenavn(linje) -> tekst (lineItemLabel); ydelseTekst(linje) -> "Ydelse · tillæg".
export function rapportData(order, { varenavn = (l) => l?.navn || "", ydelseTekst = () => "" } = {}) {
  const r = order?.afleveringsrapport || {};
  const varer = (order?.varelinjer || []).filter((l) => l && !l.rma).map((l) => ({ id: l.id, navn: varenavn(l), ydelser: ydelseTekst(l), udfoert: !!l.udfoert }));
  return {
    nr: order?.nr,
    kunde: order?.kunde?.navn || "",
    adresse: order?.kunde?.adresse || "",
    telefon: order?.kunde?.telefon || "",
    dato: order?.dato || "",
    afsluttet: order?.afsluttetTidspunkt || "",
    udfoert: r.udfoert || "",
    noter: r.noter || "",
    // Rapporter skrevet før den nye rapportfane vises som de er, så intet går tabt.
    tidligere: (order?.rapporter || []).filter((x) => x && x.tekst).map((x) => ({ titel: x.titel || "Rapport", tekst: x.tekst, tid: x.tid || "" })),
    varer,
    materialer: (order?.materialer || []).filter((m) => m && m.navn).map((m) => ({ navn: m.navn, antal: m.antal > 1 ? m.antal : 1 })),
    underskrift: order?.underskrift?.data ? { navn: order.underskrift.navn || "", tid: order.underskrift.tid || "", data: order.underskrift.data } : null,
  };
}

// Mangler der noget, før rapporten giver mening? Bruges som venlig påmindelse - blokerer ikke.
export function rapportMangler(order) {
  const r = order?.afleveringsrapport;
  return !r || !String(r.udfoert || "").trim();
}
