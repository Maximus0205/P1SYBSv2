import { kr, krEnhed } from "./billingHelpers.js";

// Rene hjælpere til backoffice-dashboardet (ingen React/Supabase her, så de kan testes i Node).
// Beløb er hele øre, som i resten af faktureringen.

const MAANEDER = ["jan.", "feb.", "mar.", "apr.", "maj", "jun.", "jul.", "aug.", "sep.", "okt.", "nov.", "dec."];
const MAANEDER_LANG = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

// "2026-09" -> "sep."  /  "sep. 2026"  /  "september 2026"
export function maanedKort(ym) { const m = /^(\d{4})-(\d{2})$/.exec(String(ym || "")); return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? MAANEDER[Number(m[2]) - 1] : ""; }
export function maanedMedAar(ym) { const m = /^(\d{4})-(\d{2})$/.exec(String(ym || "")); return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${MAANEDER[Number(m[2]) - 1]} ${m[1]}` : ""; }
export function maanedLang(ym) { const m = /^(\d{4})-(\d{2})$/.exec(String(ym || "")); return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${MAANEDER_LANG[Number(m[2]) - 1]} ${m[1]}` : ""; }

// "Pæn" lodret akse: runde tal (1/2/2,5/5 x 10^n), der dækker maxKr. Returnerer { max, ticks } i hele kr. (altid mindst 0..1000, så en tom graf stadig har en akse).
export function paenAkse(maxKr, mål = 4) {
  const maks = Math.max(Number(maxKr) || 0, 0);
  if (maks <= 0) return { max: 1000, ticks: [0, 250, 500, 750, 1000] };
  const raaTrin = maks / mål;
  const eksp = Math.pow(10, Math.floor(Math.log10(raaTrin)));
  const trin = [1, 2, 2.5, 5, 10].map((f) => f * eksp).find((t) => t >= raaTrin) || 10 * eksp;
  const antal = Math.ceil(maks / trin - 1e-9);
  const ticks = [];
  for (let i = 0; i <= antal; i++) ticks.push(Math.round(i * trin * 100) / 100);
  return { max: ticks[ticks.length - 1], ticks };
}

// Nøgletal fra billing_dashboard. "Afsluttede" måneder = alle før den igangværende (hvis indtægten først kommer, når månedens faktura er udstedt, giver den igangværende måned et misvisende resultat).
export function noegletal(dash, nuMaaned) {
  const maaneder = (dash && dash.maaneder) || [];
  const afsluttede = maaneder.filter((m) => m.maaned < nuMaaned);
  const sum = (liste, felt) => liste.reduce((s, m) => s + (Number(m[felt]) || 0), 0);
  const indtaegt = sum(afsluttede, "indtaegt_ore");
  const udgift = sum(afsluttede, "udgift_ore");
  const sidste = afsluttede[afsluttede.length - 1] || null;
  return { indtaegt, udgift, resultat: indtaegt - udgift, antal: afsluttede.length, sidste, forfaldne: ((dash && dash.forfaldne) || []).length };
}

// Største søjle i grafen i hele kr. (den igangværende måneds forventede indtægt tæller med)
export function grafMax(maaneder, forventetOre, nuMaaned) {
  let max = 0;
  for (const m of maaneder || []) {
    const ind = m.maaned === nuMaaned ? Math.max(Number(m.indtaegt_ore) || 0, Number(forventetOre) || 0) : Number(m.indtaegt_ore) || 0;
    max = Math.max(max, ind, Number(m.udgift_ore) || 0);
  }
  return max / 100;
}

// Søjle med 4 px afrundet øvre ende og ret kant ved basislinjen (SVG-sti)
export function soejleSti(x, y, bredde, base, r = 4) {
  const h = base - y;
  if (!(h > 0) || !(bredde > 0)) return "";
  const rr = Math.min(r, h, bredde / 2);
  return `M${x},${base} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + bredde - rr},${y} Q${x + bredde},${y} ${x + bredde},${y + rr} L${x + bredde},${base} Z`;
}

// ---- Aktivitetslog: gør rå ændringer (felter med fra/til) læsbare på dansk ---------------------------------------------------------
export const LOG_TABELLER = {
  billing_accounts: "Abonnement", billing_plans: "Prisplan", billing_plan_prices: "Prislinje", billing_limits: "Loft",
  billing_settings: "Indstillinger", billing_costs: "Udgift", billing_invoices: "Faktura", billing_credit_notes: "Kreditnota", billing_organisations: "Organisation",
};
const FELT_NAVN = {
  status: "Status", navn: "Navn", beskrivelse: "Beskrivelse", aktiv: "Aktiv", maanedspris_ore: "Månedspris", pris_override_ore: "Aftalt månedspris", rabat_pct: "Rabat (%)",
  inkl_brugere: "Inkluderede brugere", inkl_biler: "Biler i pakken", ekstra_biler: "Ekstra biler", lager_pakker: "Lagerpakker", inkl_lager_gb: "Inkluderet lager (GB)", lager_pakke_gb: "GB pr. lagerpakke", pris_lager_pakke_ore: "Pris pr. lagerpakke", pris_ekstra_bil_ore: "Pris pr. ekstra bil", pris_ekstra_bruger_ore: "Pris pr. ekstra bruger",
  spaerret: "Betalte tjenester stoppet", spaerret_aarsag: "Besked ved stop", spaerr_ved: "Loft", advarsel_ved: "Advarsel ved", metric: "Tjeneste", inkluderet: "Inkluderet pr. md.", enhedspris_ore: "Pris pr. enhed",
  sms_indkoeb_ore: "SMS: indkøbspris", sms_paaslag_ore: "SMS: påslag", moms_pct: "Moms (%)", betalingsfrist_dage: "Betalingsfrist (dage)", faktura_prefix: "Fakturapræfiks",
  firma_navn: "Firmanavn", cvr: "CVR", adresse: "Adresse", postnr_by: "Postnr. og by", email: "E-mail", telefon: "Telefon", bank_reg: "Bank reg.nr.", bank_konto: "Bank kontonr.", iban: "IBAN",
  faktura_email: "Faktura-e-mail", ean: "EAN", att: "Att.", noter: "Noter", plan_id: "Prisplan (id)", organisation_id: "Organisation (id)", kaedepris: "Kædepris", store_id: "Butik (id)", start_dato: "Startdato",
  fakturanr: "Fakturanr.", kreditnr: "Kreditnota nr.", aarsag: "Årsag", udstedt_dato: "Udstedt", forfaldsdato: "Forfald", betalt_dato: "Betalt", periode_fra: "Periode fra", periode_til: "Periode til",
  netto_ore: "Beløb ekskl. moms", moms_ore: "Moms", total_ore: "I alt", beloeb_ore: "Beløb", dato: "Dato", tekst: "Tekst", kategori: "Kategori", gentag: "Gentages hver måned", slut_dato: "Stopper", invoice_id: "Faktura (id)",
  faktura_fodtekst: "Fodtekst",
};

export function logFeltNavn(felt) {
  if (FELT_NAVN[felt]) return FELT_NAVN[felt];
  const t = String(felt).replace(/_ore$/, "").replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}
export function logVaerdi(felt, v) {
  if (v === null || v === undefined || v === "") return "–";
  if (typeof v === "boolean") return v ? "ja" : "nej";
  if (String(felt).endsWith("_ore") && Number.isFinite(Number(v))) return /^(sms_|enhedspris)/.test(felt) ? krEnhed(v) : kr(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
// felter: { felt: { fra?, til? } } -> [{ navn, fra, til }] (alfabetisk efter visningsnavn; fra/til er null, hvis de ikke findes)
export function logFelter(felter) {
  const ud = [];
  for (const [felt, x] of Object.entries(felter || {})) {
    ud.push({ navn: logFeltNavn(felt), fra: x && "fra" in x ? logVaerdi(felt, x.fra) : null, til: x && "til" in x ? logVaerdi(felt, x.til) : null });
  }
  return ud.sort((a, b) => a.navn.localeCompare(b.navn, "da"));
}
