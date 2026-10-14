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
