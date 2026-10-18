// Ren logik for ruten (ingen React, kan testes med node). Afspejler webappens regler i src/data/domain.js og src/data/caseTypes.js.

export const STATUS_META = {
  planlagt: { label: "Planlagt", color: "#52697E" },
  igang: { label: "I gang", color: "#E2621B" },
  afsluttet: { label: "Afsluttet", color: "#3D7A5C" },
};
export const TOMGANG_COLOR = "#6B5B95";

export const erTomgang = (sag) => sag?.sagstype === "tomgang";

// Én varelinje som tekst: "Montering – Opvaskemaskine (+ Bortskaffelse af gammelt produkt)".
export function linjeTekst(v) {
  if (!v) return "";
  const kategori = v.varetypeId === "andet" ? (v.varetypeTekst || "Speciel opgave") : (v.varetypeNavn || "Ukendt vare");
  const ydelse = v.primaerYdelse?.navn;
  const tillaeg = (v.tillaeg || []).map((y) => y.navn).filter(Boolean);
  let tekst = ydelse ? `${ydelse} – ${kategori}` : kategori;
  if (tillaeg.length > 0) tekst += ` (+ ${tillaeg.join(", ")})`;
  return tekst;
}

// Samme titel som webappen: alle linjer samlet med " + ".
export function sagsTitel(varelinjer) {
  if (!Array.isArray(varelinjer) || varelinjer.length === 0) return "Ny opgave";
  const dele = varelinjer.map(linjeTekst).filter(Boolean);
  return dele.length > 0 ? dele.join(" + ") : "Ny opgave";
}

// Rækkefølgen bruges kun, når begge sager har fået en bevidst rækkefølge. Ellers afgør starttidspunktet.
export function sorterDagensSager(a, b) {
  const ar = typeof a.raekkefolge === "number" ? a.raekkefolge : null;
  const br = typeof b.raekkefolge === "number" ? b.raekkefolge : null;
  if (ar !== null && br !== null) return ar - br;
  return (a.start || "").localeCompare(b.start || "");
}

export const sagerForDag = (sager, bilId, dato) =>
  (sager || []).filter((s) => s && s.bilId === bilId && s.dato === dato).sort(sorterDagensSager);

export const antalFaerdige = (sager) => sager.filter((s) => s.status === "afsluttet").length;

// Nøgle/adgang som tekst: "Nøgleboks — Kode 1234".
export function noegleTekst(noegle) {
  if (!noegle || !noegle.kraeves) return "";
  const dele = [noegle.type || "Nøgle/adgang"];
  if (noegle.placering) dele.push(noegle.placering);
  return dele.join(" — ");
}

// Kun det telefonen skal vise på et kort.
export function kortFraSag(sag) {
  return {
    id: String(sag.id),
    nr: sag.nr ?? null,
    tid: sag.start && sag.slut ? `${sag.start}–${sag.slut}` : "",
    titel: sagsTitel(sag.varelinjer),
    kunde: sag.kunde?.navn || "",
    adresse: sag.kunde?.adresse || "",
    telefon: sag.kunde?.telefon || "",
    toMand: !!sag.toMand,
    tomgang: erTomgang(sag),
    status: STATUS_META[sag.status] ? sag.status : "planlagt",
    problem: !!sag.problem,
  };
}

// Telefonnummer til tel:-link: kun cifre og et evt. indledende plus.
export const telefonLink = (nr) => {
  const ren = String(nr || "").replace(/[^\d+]/g, "");
  return ren ? `tel:${ren}` : "";
};

// Link der åbner kortappen med vejvisning. Bruger koordinaterne fra adressevælgeren, hvis sagen har dem, ellers adressen.
export function navigationsUrl(sag, platform) {
  const k = sag?.kunde?.adresseKoordinater;
  const harKoord = k && Number.isFinite(Number(k.lat)) && Number.isFinite(Number(k.lon));
  const adresse = sag?.kunde?.adresse || "";
  if (!harKoord && !adresse.trim()) return "";
  const maal = harKoord ? `${Number(k.lat)},${Number(k.lon)}` : encodeURIComponent(adresse.trim());
  return platform === "ios"
    ? `https://maps.apple.com/?daddr=${maal}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${maal}`;
}
