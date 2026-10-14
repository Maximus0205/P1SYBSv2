// Finder skjulte koordinater (Adressevælgeren/Datafordeleren) til en TEKSTADRESSE - til sager, der oprettes uden at man vælger et forslag i adressefeltet
// (CSV-import, import fra det gamle system). Samme sikre regel som kapacitet-tjek: er der ikke ét SIKKERT match på vej + husnummer (+ postnummer),
// gættes der ikke - så får sagen ingen koordinater og vises som "kan ikke beregnes" i planlægningen, til adressen er valgt i systemet.
// Ren logik: søgning og opslag sendes ind (se lib/geocodingAdressevaelger.js), så den kan testes i Node (tests/adresseOpslag.test.mjs).

const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, "");

// Søgesvaret har ikke altid postnr som eget felt - så står det i titlen.
export function postnrFra(f) {
  if (f?.postnr) return String(f.postnr);
  const m = String(f?.titel ?? "").match(/\b(\d{4})\b/);
  return m ? m[1] : "";
}

// Det husnummer-id, der SIKKERT er den tastede adresse - ellers null.
export function vaelgHusnummerId(fund, query) {
  if (!Array.isArray(fund) || !query?.vejnavn || !query.husnummer) return null;
  const traef = fund.filter((f) => f?.type === "husnummer" && f.id
    && norm(f.husnummer) === norm(query.husnummer)
    && (!query.postnummer || postnrFra(f) === query.postnummer));
  if (traef.length === 0) return null;
  if (!query.postnummer && new Set(traef.map(postnrFra)).size > 1) return null; // samme vej + nummer i flere byer
  return traef[0].id;
}

// -> { lat, lon, adresseId, type: "husnummer", tekst } eller null. tekst = adressen præcis som sagen har den.
export async function slaaKoordinaterOp(adresse, { soeg, opslag, parse }) {
  const tekst = String(adresse || "").trim();
  if (tekst.length < 5) return null;
  try {
    const query = parse(tekst);
    if (!query.vejnavn || !query.husnummer) return null;
    const r = await soeg(tekst);
    if (!r?.ok) return null;
    const id = vaelgHusnummerId(r.fund, query);
    if (!id) return null;
    const k = await opslag(id, "husnummer");
    if (!k || !Number.isFinite(k.lat) || !Number.isFinite(k.lon)) return null;
    return { lat: k.lat, lon: k.lon, adresseId: id, type: "husnummer", tekst };
  } catch {
    return null;
  }
}
