import { RotateCw, Trash2, Cable, Wifi, Wrench, Tag, ShoppingCart, Route, Truck, Package, Settings2 } from "lucide-react";

const uid = () => Math.random().toString(36).slice(2, 10);

const now = () =>
  new Date().toLocaleString("da-DK", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const flytDato = (iso, dage) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + dage);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const formatDatoLang = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long" });
const erIDag = (iso) => iso === todayISO();

const formatVarighed = (min) => {
  if (min < 1) return "< 1 min";
  if (min < 60) return `${min} min`;
  const t = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${t}t ${m}m` : `${t}t`;
};

const formatKlokken = (iso) => new Date(iso).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
const totalMinutter = (sag) => sag.logs.reduce((sum, l) => sum + l.minutter, 0);

const ydelseIkon = (navn) => {
  const n = (navn || "").toLowerCase();
  if (n.includes("dørvend")) return RotateCw;
  if (n.includes("bortskaf") || n.includes("gammel")) return Trash2;
  if (n.includes("kabel") || n.includes("slange") || n.includes("aftræk")) return Cable;
  if (n.includes("netværk") || n.includes("wifi") || n.includes("data") || n.includes("kanal")) return Wifi;
  if (n.includes("monter") || n.includes("indbyg") || n.includes("panel") || n.includes("ophæng") || n.includes("el")) return Wrench;
  return Tag;
};

const STANDARD_YDELSE_MINUTTER = 15;

const lavYdelse = (navn, minutter = STANDARD_YDELSE_MINUTTER) => ({ id: uid(), navn: navn.trim(), minutter: Number(minutter) || 0, udfoert: false });

const ANDET_VARETYPE_ID = "andet";
const ANDET_VARETYPE = "Andet (skriv selv)"; // Bruges kun som label i "Andet"-valget, ikke som id.

// ---------------- Varer & ydelser ----------------
// Struktur: Varekategori (fx "Hvidevare") → Varetype (fx "Køleskab") → hører
// til én kategori. En sag vælger for hver varelinje: varetype, mærke/model,
// én PRIMÆR ydelse (fx "Montering" - definerer grundtiden), og valgfrit en
// eller flere TILLÆGSYDELSER (fx "Dørvending").
//
// Hvilke tillægsydelser der er relevante styres ét sted: på selve
// tillægsydelsen (ikke spredt ud på hver varetype/primær ydelse - det gav et
// besværligt admin-workflow, hvor man skulle redigere flere steder for at
// ændre én sammenhæng). Hver tillægsydelse har:
//   - primaerYdelser: liste af primær-ydelse-id'er den gælder under (påkrævet -
//     fx "Udpakning" gælder kun ved Kantstenslevering/Levering med indbæring)
//   - varetyper: liste af varetype-id'er den er begrænset til (valgfri - tom
//     liste = gælder for alle varetyper, fx "Udpakning" er IKKE bundet til
//     bestemte varetyper, mens "Dørvending" kun er relevant for skabe med dør)
// Alt dette redigeres samlet ét sted: Admin → Varer & ydelser → Tillægsydelser.
//
// Tidsestimatet (minutter) på primær ydelse og tillægsydelser er kun et
// UDGANGSPUNKT hentet fra Admin - det kan altid rettes manuelt for den
// konkrete booking i sælgerens flow, da tidsforbruget varierer meget fra
// produkt til produkt (fx opvaskemaskine vs. fryser). På sigt, når der er
// indsamlet nok historik fra stemplede opgaver, er planen at lade systemet
// foreslå tiden automatisk ud fra tidligere sager med samme produkt/ydelser.

const DEFAULT_VAREKATEGORIER = [
  { id: "vk1", navn: "Hvidevare" },
  { id: "vk2", navn: "Brunvare" },
];

const DEFAULT_PRIMAERYDELSER = [
  { id: "p1", navn: "Kantstenslevering", minutter: 10 },
  { id: "p2", navn: "Levering med indbæring", minutter: 20 },
  { id: "p3", navn: "Montering", minutter: 40 },
];

const DEFAULT_VARETYPER = [
  { id: "vt1", navn: "Køleskab", kategoriId: "vk1" },
  { id: "vt2", navn: "Fryseskab", kategoriId: "vk1" },
  { id: "vt3", navn: "Kølefryseskab", kategoriId: "vk1" },
  { id: "vt4", navn: "Amerikanerskab", kategoriId: "vk1" },
  { id: "vt5", navn: "Vinkøleskab", kategoriId: "vk1" },
  { id: "vt6", navn: "Kummefryser", kategoriId: "vk1" },
  { id: "vt7", navn: "Vaskemaskine", kategoriId: "vk1" },
  { id: "vt8", navn: "Tørretumbler", kategoriId: "vk1" },
  { id: "vt9", navn: "Vaske-tørremaskine", kategoriId: "vk1" },
  { id: "vt10", navn: "Opvaskemaskine", kategoriId: "vk1" },
  { id: "vt11", navn: "Ovn", kategoriId: "vk1" },
  { id: "vt12", navn: "Kompakt ovn", kategoriId: "vk1" },
  { id: "vt13", navn: "Kogeplade", kategoriId: "vk1" },
  { id: "vt14", navn: "Komfur", kategoriId: "vk1" },
  { id: "vt15", navn: "Emhætte", kategoriId: "vk1" },
  { id: "vt16", navn: "TV", kategoriId: "vk2" },
  { id: "vt17", navn: "Lydanlæg", kategoriId: "vk2" },
];

const DOER_VARETYPE_IDS = ["vt1", "vt2", "vt3", "vt4", "vt5"]; // Køleskab, Fryseskab, Kølefryseskab, Amerikanerskab, Vinkøleskab

const DEFAULT_TILLAEGSYDELSER = [
  // Udpakning: gælder for alle varetyper (tom liste = universel), men kun ved
  // ren levering - ved montering er udpakning en del af selve arbejdet.
  { id: "t1", navn: "Udpakning", minutter: 10, primaerYdelser: ["p1", "p2"], varetyper: [] },
  // Dørvending: kun relevant for varer med en dør der kan vendes, og kun når der reelt monteres.
  { id: "t2", navn: "Dørvending", minutter: 20, primaerYdelser: ["p3"], varetyper: DOER_VARETYPE_IDS },
  // Bortskaffelse: gælder for alle varetyper, men kun når montøren alligevel er inde i hjemmet.
  { id: "t3", navn: "Bortskaffelse af gammelt produkt", minutter: 15, primaerYdelser: ["p2", "p3"], varetyper: [] },
];

// De tillægsydelser der reelt kan vælges for en given kombination af varetype
// + primær ydelse: den primære ydelse skal matche, og enten har tillægsydelsen
// ingen varetype-begrænsning (gælder alle) eller også skal varetypen stå på dens liste.
const tilgaengeligeTillaeg = (varetypeId, primaerYdelseId, tillaegsydelser) => {
  return tillaegsydelser.filter((t) => {
    if (!(t.primaerYdelser || []).includes(primaerYdelseId)) return false;
    if (!t.varetyper || t.varetyper.length === 0) return true; // universel
    return varetypeId !== ANDET_VARETYPE_ID && t.varetyper.includes(varetypeId);
  });
};

const lavVarelinje = (varetyper, primaerydelser, varetypeId, tekst = "") => {
  const foersteVaretype = varetyper[0];
  const vId = varetypeId || (foersteVaretype ? foersteVaretype.id : ANDET_VARETYPE_ID);
  const vt = varetyper.find((v) => v.id === vId);
  const py = primaerydelser[0];
  return {
    id: uid(),
    varetypeId: vId,
    varetypeNavn: vt ? vt.navn : ANDET_VARETYPE, // snapshot - upåvirket af senere omdøbning
    varetypeTekst: tekst,
    maerke: "",
    model: "",
    primaerYdelse: py ? { id: py.id, navn: py.navn, minutter: Number(py.minutter) || 0 } : null,
    tillaeg: [], // valgte tillægsydelser for netop denne booking - se tilgaengeligeTillaeg for hvad der kan vælges
  };
};

const varelinjeLabel = (v) => {
  const grund = v.varetypeId === ANDET_VARETYPE_ID ? (v.varetypeTekst || "Speciel opgave") : (v.varetypeNavn || "Ukendt vare");
  const detalje = [v.maerke, v.model].filter(Boolean).join(" ");
  return detalje ? `${grund} – ${detalje}` : grund;
};

// Forventet tidsforbrug: primær ydelses grundtid + tid pr. valgt tillægsydelse.
// (Minuttallene er snapshottet på selve varelinjen ved booking - og kan rettes
// manuelt pr. booking i sælgerens flow - så senere ændringer i Admin ikke
// ændrer tiden på allerede bookede sager.)
const linjeMinutter = (linje) => (Number(linje.primaerYdelse?.minutter) || 0) + (linje.tillaeg || []).reduce((sum, y) => sum + (Number(y.minutter) || 0), 0);
const sagForventetMinutter = (sag) => (sag.varelinjer || []).reduce((sum, l) => sum + linjeMinutter(l), 0);

// Adresse-match: normaliserer og udtrækker "gade + husnummer" så vi kan opdage at to
// ordrer ligger i samme opgang/ejendom, selvom etage/side/postnr. varierer i teksten.
const normaliserAdresse = (adr) => (adr || "").toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
const bygningsNoegle = (adr) => {
  const n = normaliserAdresse(adr);
  if (!n) return "";
  const match = n.match(/^([a-zæøå '-]+?\s\d+[a-z]?)\b/);
  return match ? match[1].trim() : n;
};

// Bredere "område"-nøgle end bygning (postnummer + by), til at opdage om flere biler kører i
// samme del af byen samme dag, eller om et område besøges spredt over flere forskellige dage.
const omraadeNoegle = (adr) => {
  const n = normaliserAdresse(adr);
  if (!n) return "";
  const match = n.match(/\b(\d{4})\s+([a-zæøå]+(?:\s[a-zæøå]+)?)\b/);
  return match ? `${match[1]} ${match[2]}`.trim() : "";
};

// Alle 7 datoer (mandag–søndag) i den uge en given dato ligger i.
const ugeDage = (iso) => {
  const d = new Date(iso + "T00:00:00");
  const dow = (d.getDay() + 6) % 7;
  const mandag = new Date(d);
  mandag.setDate(d.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(mandag);
    dd.setDate(mandag.getDate() + i);
    return `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}-${String(dd.getDate()).padStart(2, "0")}`;
  });
};

const dannTitel = (varelinjer) => {
  if (!varelinjer || varelinjer.length === 0) return "Ny opgave";
  const navne = varelinjer.map(varelinjeLabel).filter(Boolean);
  if (navne.length === 0) return "Ny opgave";
  return `Levering: ${navne.join(" + ")}`;
};

const noegleTekst = (n) => {
  if (!n || !n.kraeves) return "";
  const dele = [n.type || "Nøgle/adgang"];
  if (n.placering) dele.push(n.placering);
  return dele.join(" — ");
};

const TIDSRUM = [
  { id: "heldag", label: "Hel dag", start: "08:00", slut: "16:00" },
  { id: "formiddag", label: "Formiddag", start: "08:00", slut: "12:00" },
  { id: "eftermiddag", label: "Eftermiddag", start: "12:00", slut: "16:00" },
];
const tidsrumFraId = (id) => TIDSRUM.find((t) => t.id === id) || TIDSRUM[0];
const tidsrumTekst = (id) => {
  const t = tidsrumFraId(id);
  return `${t.label} (${t.start}–${t.slut})`;
};

const NOEGLE_TYPER = ["Nøgle udleveres af kunde", "Nøgleboks", "Kode/alarm", "Afhentes på kontoret", "Andet"];

const MONTOR_FARVER = ["#E2621B", "#3D7A5C", "#52697E", "#8B5E3C", "#6B5B95", "#1C7C8C"];
const montorFarve = (id, montorer) => {
  const idx = montorer.findIndex((m) => m.id === id);
  return idx >= 0 ? MONTOR_FARVER[idx % MONTOR_FARVER.length] : "#D8D0BE";
};

// ---------------- Seed-data ----------------

// Bilflåden — en fast liste over de køretøjer, der findes i virksomheden.
// En bil har et navn/tag I selv sætter (fx "Servicevogn 1"), som bruges til
// at kende bilen fra hinanden i det daglige, samt selve nummerpladen.
// Montører er ikke længere en selvstændig ting — det er logins med rolle
// "montor", der hver har en bilId (se profiler.bil_id / brugere i skyLager.js).
const DEFAULT_BILER = [
  { id: "b1", navn: "Bil 1", nummerplade: "AB 12 345", lukket: false, lukketAarsag: "" },
  { id: "b2", navn: "Bil 2", nummerplade: "CD 67 890", lukket: false, lukketAarsag: "" },
  { id: "b3", navn: "Bil 3", nummerplade: "EF 22 111", lukket: false, lukketAarsag: "" },
];

const bilLabel = (bil) => (bil ? `${bil.navn || "(uden navn)"} · ${bil.nummerplade || "ingen nummerplade"}` : "Ingen bil");

// En montør er en bruger med rolle "montor" — se brugere/profiler. Denne liste
// findes derfor ikke længere som seed-data; App.jsx udleder "montorer" direkte
// fra brugere-listen, så resten af appen (der forventer { id, navn, bil }) kan
// blive ved med at virke uændret.

const seedBrugere = [
  { id: "u1", navn: "Admin Andersen", brugernavn: "admin", adgangskode: "admin", rolle: "admin", bilId: null },
  { id: "u2", navn: "Sanne Sælger", brugernavn: "saelger", adgangskode: "saelger", rolle: "saelger", bilId: null },
  { id: "u3", navn: "Lars Pedersen", brugernavn: "lars", adgangskode: "lars", rolle: "montor", bilId: "b1" },
];

// Er en given bil blokeret for booking på en given dato, fordi den montør,
// der LIGE NU er tilknyttet bilen, holder ferie den dag? "montorer" her er
// den udledte liste { id, navn, bilId }, "ferier" er { montorId, startDato, slutDato }.
const bilBlokeretAfFerie = (bilId, dato, montorer, ferier) => {
  const montoerPaaBil = montorer.filter((m) => m.bilId === bilId);
  if (montoerPaaBil.length === 0) return null;
  const ferie = (ferier || []).find((f) => montoerPaaBil.some((m) => m.id === f.montorId) && dato >= f.startDato && dato <= f.slutDato);
  if (!ferie) return null;
  const montor = montoerPaaBil.find((m) => m.id === ferie.montorId);
  return { ferie, montor };
};

const tomKunde = () => ({ navn: "", telefon: "", email: "", adresse: "", leveringsnote: "" });
const tomNoegle = () => ({ kraeves: false, type: "", detaljer: "", placering: "" });

const seedSager = [
  {
    id: uid(), nr: "24-118",
    kunde: { navn: "Familien Holm", telefon: "20 30 40 50", email: "", adresse: "Skovvej 12, 8000 Aarhus C", leveringsnote: "" },
    koeber: null,
    noegle: { kraeves: true, type: "Nøgleboks", detaljer: "Kode 4471", placering: "Ved hoveddøren, bag lampen" },
    dato: todayISO(),
    tidsrumId: "formiddag", start: "08:00", slut: "12:00",
    montorId: "u3", status: "afsluttet",
    plukket: true,
    varelinjer: [
      {
        id: uid(), varetypeId: "vt3", varetypeNavn: "Kølefryseskab", varetypeTekst: "", maerke: "Bosch", model: "KGN39VLEB",
        primaerYdelse: { id: "p3", navn: "Montering", minutter: 40 },
        tillaeg: [
          { id: uid(), navn: "Dørvending", minutter: 20, udfoert: true },
          { id: uid(), navn: "Bortskaffelse af gammelt produkt", minutter: 15, udfoert: true },
        ],
      },
    ],
    noter: [{ id: uid(), tekst: "Gammelt køleskab stod i kælder, ekstra bæretur.", tid: "08:41" }],
    billeder: [],
    rapporter: [{ id: uid(), titel: "Afleveringsrapport", tekst: "Nyt køle-/fryseskab installeret og dørvendt. Gammelt apparat bortkørt.", tid: "09:02" }],
    stemplerInd: null,
    logs: [{ id: uid(), ind: "2024-07-14T08:03:00", ud: "2024-07-14T08:52:00", minutter: 49 }],
  },
  {
    id: uid(), nr: "24-119",
    kunde: { navn: "Lejemål – Havnegade 22, 2. th", telefon: "70 11 22 33", email: "", adresse: "Havnegade 22, 2. th, 8200 Aarhus N", leveringsnote: "Aflever hos lejer, ring ved ankomst." },
    koeber: { navn: "Nygaard Byg ApS", telefon: "70 11 22 00", email: "kontakt@nygaardbyg.dk", adresse: "Industriparken 4, 8200 Aarhus N" },
    noegle: tomNoegle(),
    dato: todayISO(),
    tidsrumId: "eftermiddag", start: "12:00", slut: "16:00",
    montorId: null, status: "igang",
    plukket: true,
    varelinjer: [
      {
        id: uid(), varetypeId: "vt7", varetypeNavn: "Vaskemaskine", varetypeTekst: "", maerke: "Electrolux", model: "EW6F428S",
        primaerYdelse: { id: "p3", navn: "Montering", minutter: 40 },
        tillaeg: [{ id: uid(), navn: "Bortskaffelse af gammelt produkt", minutter: 15, udfoert: false }],
      },
      {
        id: uid(), varetypeId: "vt8", varetypeNavn: "Tørretumbler", varetypeTekst: "", maerke: "Electrolux", model: "EW8H358S",
        primaerYdelse: { id: "p2", navn: "Levering med indbæring", minutter: 20 },
        tillaeg: [{ id: uid(), navn: "Udpakning", minutter: 10, udfoert: true }],
      },
    ],
    noter: [], billeder: [], rapporter: [],
    stemplerInd: null, logs: [],
  },
  {
    id: uid(), nr: "24-120",
    kunde: { navn: "Mette & Jonas Krogh", telefon: "30 40 50 60", email: "", adresse: "Rosenvænget 7, 8210 Aarhus V", leveringsnote: "" },
    koeber: null,
    noegle: tomNoegle(),
    dato: flytDato(todayISO(), 1),
    tidsrumId: "heldag", start: "08:00", slut: "16:00",
    montorId: null, status: "planlagt",
    plukket: false,
    varelinjer: [
      {
        id: uid(), varetypeId: "vt10", varetypeNavn: "Opvaskemaskine", varetypeTekst: "", maerke: "Miele", model: "G7100",
        primaerYdelse: { id: "p3", navn: "Montering", minutter: 40 },
        tillaeg: [{ id: uid(), navn: "Udpakning", minutter: 10, udfoert: false }],
      },
    ],
    noter: [], billeder: [], rapporter: [],
    stemplerInd: null, logs: [],
  },
  {
    id: uid(), nr: "24-121",
    kunde: { navn: "Lejemål – Havnegade 22, 4. tv", telefon: "70 11 22 33", email: "", adresse: "Havnegade 22, 4. tv, 8200 Aarhus N", leveringsnote: "Aflever hos lejer." },
    koeber: { navn: "Nygaard Byg ApS", telefon: "70 11 22 00", email: "kontakt@nygaardbyg.dk", adresse: "Industriparken 4, 8200 Aarhus N" },
    noegle: tomNoegle(),
    dato: flytDato(todayISO(), 3),
    tidsrumId: "heldag", start: "08:00", slut: "16:00",
    montorId: null, status: "planlagt",
    plukket: false,
    varelinjer: [
      {
        id: uid(), varetypeId: "vt16", varetypeNavn: "TV", varetypeTekst: "", maerke: "LG", model: "OLED55C3",
        primaerYdelse: { id: "p2", navn: "Levering med indbæring", minutter: 20 },
        tillaeg: [{ id: uid(), navn: "Udpakning", minutter: 10, udfoert: false }],
      },
    ],
    noter: [], billeder: [], rapporter: [],
    stemplerInd: null, logs: [],
  },
];

const statusMeta = {
  planlagt: { label: "Planlagt", color: "#52697E" },
  igang: { label: "I gang", color: "#E2621B" },
  afsluttet: { label: "Afsluttet", color: "#3D7A5C" },
};

// ---------------- Fælles små komponenter ----------------

const SIDER = [
  { key: "salg", label: "Salg", icon: ShoppingCart },
  { key: "planlaegning", label: "Planlægning", icon: Route },
  { key: "koersel", label: "Kørsel", icon: Route },
  { key: "montor", label: "Montør", icon: Truck },
  { key: "lager", label: "Lager", icon: Package },
  { key: "admin", label: "Admin", icon: Settings2 },
];
const SIDER_FOR_ROLLE = {
  admin: ["salg", "planlaegning", "koersel", "montor", "lager", "admin"],
  saelger: ["salg", "planlaegning", "koersel", "montor", "lager"],
  montor: ["montor"],
};

export {
  uid, now, todayISO, flytDato, formatDatoLang, erIDag, formatVarighed, formatKlokken, totalMinutter, ydelseIkon,
  STANDARD_YDELSE_MINUTTER, lavYdelse, ANDET_VARETYPE, ANDET_VARETYPE_ID,
  DEFAULT_VAREKATEGORIER, DEFAULT_VARETYPER, DEFAULT_PRIMAERYDELSER, DEFAULT_TILLAEGSYDELSER, tilgaengeligeTillaeg,
  lavVarelinje, varelinjeLabel, linjeMinutter, sagForventetMinutter, normaliserAdresse, bygningsNoegle, omraadeNoegle,
  ugeDage, dannTitel, noegleTekst, TIDSRUM, tidsrumFraId, tidsrumTekst, NOEGLE_TYPER, MONTOR_FARVER, montorFarve,
  DEFAULT_BILER, bilLabel, bilBlokeretAfFerie, seedBrugere, tomKunde, tomNoegle, seedSager, statusMeta, SIDER, SIDER_FOR_ROLLE,
};
