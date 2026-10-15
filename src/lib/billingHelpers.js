// Rene hjælpere til backoffice (fakturering/forbrug) - ingen netværk, så de kan testes i Node (tests/billing.test.mjs).
// Beløb er hele øre; enhedspriser må have decimaler (fx 35,5 øre pr. SMS).

export const METRICS = {
  sms: { navn: "SMS", enhed: "stk." },
  ors_matrix: { navn: "Ruteberegninger", enhed: "stk." },
  ors_soeg: { navn: "Adresseopslag (reserve)", enhed: "stk." },
  sager: { navn: "Oprettede sager", enhed: "stk." },
};
export const FORBRUG_METRICS = ["sms", "ors_matrix", "ors_soeg", "sager"];
export const PRIS_METRICS = ["sms", "ors_matrix", "ors_soeg"];
// Kun eksterne, betalte tjenester kan spærres automatisk. Sager spærres aldrig.
export const SPAERRE_METRICS = ["sms", "ors_matrix", "ors_soeg"];

export const KONTO_STATUS = { proeve: "Prøve", aktiv: "Aktiv", pause: "Pause", opsagt: "Opsagt" };
export const FAKTURA_STATUS = { kladde: "Kladde", udstedt: "Udstedt", betalt: "Betalt", annulleret: "Annulleret" };

// ---- Rene hjælpere -------------------------------------------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, "0");

// "2026-09" -> { fra: "2026-09-01", til: "2026-09-30" }
export function maanedPeriode(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ""));
  if (!m) return null;
  const aar = Number(m[1]); const md = Number(m[2]);
  if (md < 1 || md > 12) return null;
  const sidste = new Date(Date.UTC(aar, md, 0)).getUTCDate();
  return { fra: `${aar}-${pad(md)}-01`, til: `${aar}-${pad(md)}-${pad(sidste)}` };
}

export function indevaerendeMaaned(nu = new Date()) { return `${nu.getFullYear()}-${pad(nu.getMonth() + 1)}`; }

export function forrigeMaaned(nu = new Date()) {
  const d = new Date(nu.getFullYear(), nu.getMonth() - 1, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

// 12345 øre -> "123,45 kr."
export function kr(ore) {
  const n = Number(ore);
  return `${(Number.isFinite(n) ? n / 100 : 0).toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.`;
}
// Enhedspris i øre (må have decimaler) -> "0,355 kr."
export function krEnhed(ore) {
  const n = Number(ore);
  return `${(Number.isFinite(n) ? n / 100 : 0).toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} kr.`;
}

// Tekst fra et felt ("1.234,50" eller "1234.5") -> tal, eller null hvis tomt/ugyldigt. Aldrig negativt.
export function taalFraTekst(tekst) {
  const t = String(tekst ?? "").trim().replace(/\s/g, "");
  if (!t) return null;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^\d+(\.\d+)?$/.test(normal)) return null;
  const n = Number(normal);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
// kr (tekst) -> hele øre, eller null
export function oreFraKr(tekst) { const n = taalFraTekst(tekst); return n === null ? null : Math.round(n * 100); }
// kr pr. enhed (tekst) -> øre med op til 4 decimaler, eller null
export function enhedsOreFraKr(tekst) { const n = taalFraTekst(tekst); return n === null ? null : Math.round(n * 100 * 10000) / 10000; }
// øre -> tekst til et inputfelt ("1234,5")
export function krTilFelt(ore) { if (ore === null || ore === undefined || ore === "") return ""; return String(Number(ore) / 100).replace(".", ","); }

export function datoTekst(iso) {
  if (!iso) return "";
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("da-DK", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Hvor langt er butikken mod sine grænser? grænser: [{metric, advarsel_ved, spaerr_ved}]; forbrug: { metric: antal }
export function graenseStatus(graenser, forbrug) {
  const ud = {};
  for (const g of graenser || []) {
    const brugt = Number(forbrug?.[g.metric]) || 0;
    if (g.spaerr_ved !== null && g.spaerr_ved !== undefined && brugt >= Number(g.spaerr_ved)) ud[g.metric] = "spaerret";
    else if (g.advarsel_ved !== null && g.advarsel_ved !== undefined && brugt >= Number(g.advarsel_ved)) ud[g.metric] = "advarsel";
  }
  return ud;
}
