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
const STANDARD_GRUNDMINUTTER = 30;

const lavYdelse = (navn, minutter = STANDARD_YDELSE_MINUTTER) => ({ id: uid(), navn: navn.trim(), minutter: Number(minutter) || 0, udfoert: false });

const ANDET_VARETYPE = "Andet (skriv selv)";

// Standard-opsætning af varetyper og deres tilhørende ydelser — kan redigeres under Admin.
// grundMinutter = forventet tid til selve grundopgaven (fx montering/levering af varen),
// hver ydelse kan lægge ekstra tid oveni. Bruges til at beregne forventet tidsforbrug pr. sag.
// "Nøgler" indgår IKKE her, da nøgleinfo nu er et separat felt på selve ordren.
const DEFAULT_VARETYPER = [
  { id: "v1", navn: "Køleskab", grundMinutter: 30, ydelser: [{ navn: "Dørvending", minutter: 20 }, { navn: "Bortskaffelse af gammelt apparat", minutter: 15 }, { navn: "Vandtilslutning", minutter: 15 }] },
  { id: "v2", navn: "Fryser", grundMinutter: 25, ydelser: [{ navn: "Dørvending", minutter: 20 }, { navn: "Bortskaffelse af gammelt apparat", minutter: 15 }] },
  { id: "v3", navn: "Køle-/fryseskab", grundMinutter: 35, ydelser: [{ navn: "Dørvending", minutter: 20 }, { navn: "Bortskaffelse af gammelt apparat", minutter: 15 }, { navn: "Vandtilslutning", minutter: 15 }] },
  { id: "v4", navn: "Vaskemaskine", grundMinutter: 30, ydelser: [{ navn: "Afløbsslange", minutter: 10 }, { navn: "Vandtilslutning", minutter: 15 }, { navn: "Bortskaffelse af gammel maskine", minutter: 15 }] },
  { id: "v5", navn: "Tørretumbler", grundMinutter: 25, ydelser: [{ navn: "Aftræk/kondensbakke", minutter: 15 }, { navn: "Stabling på vaskemaskine", minutter: 10 }] },
  { id: "v6", navn: "Opvaskemaskine", grundMinutter: 30, ydelser: [{ navn: "Indbygning/panel", minutter: 25 }, { navn: "Vandtilslutning", minutter: 15 }, { navn: "Bortskaffelse af gammel maskine", minutter: 15 }] },
  { id: "v7", navn: "Komfur/ovn", grundMinutter: 30, ydelser: [{ navn: "Elinstallation", minutter: 25 }, { navn: "Indbygning", minutter: 20 }] },
  { id: "v8", navn: "Emhætte", grundMinutter: 25, ydelser: [{ navn: "Aftræk/kanal", minutter: 30 }, { navn: "Indbygning", minutter: 20 }] },
  { id: "v9", navn: "Mikroovn", grundMinutter: 20, ydelser: [{ navn: "Indbygning", minutter: 20 }] },
  { id: "v10", navn: "TV", grundMinutter: 20, ydelser: [{ navn: "Ophæng på væg", minutter: 30 }, { navn: "Kanalsøgning", minutter: 10 }] },
  { id: "v11", navn: "Netværk/data", grundMinutter: 20, ydelser: [{ navn: "Netværksopsætning", minutter: 20 }, { navn: "Wi-Fi test", minutter: 10 }] },
];

const varetypeNavne = (varetyper) => [...varetyper.map((v) => v.navn), ANDET_VARETYPE];

const lavVarelinje = (varetyper, navn, tekst = "") => {
  const valgtNavn = navn || (varetyper[0] ? varetyper[0].navn : ANDET_VARETYPE);
  const def = varetyper.find((v) => v.navn === valgtNavn);
  return {
    id: uid(),
    varetype: valgtNavn,
    varetypeTekst: tekst,
    grundMinutter: def ? (Number(def.grundMinutter) || 0) : STANDARD_GRUNDMINUTTER,
    ydelser: (def ? def.ydelser : []).map((y) => lavYdelse(y.navn, y.minutter)),
  };
};

const varelinjeLabel = (v) => (v.varetype === ANDET_VARETYPE ? (v.varetypeTekst || "Speciel opgave") : v.varetype);

// Forventet tidsforbrug: grundtid for varelinjen + tid pr. valgt/tilføjet ydelse.
const linjeMinutter = (linje) => (Number(linje.grundMinutter) || 0) + (linje.ydelser || []).reduce((sum, y) => sum + (Number(y.minutter) || STANDARD_YDELSE_MINUTTER), 0);
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
// En bil har kun to rigtige felter: id og nummerplade. Montører er ikke
// længere en selvstændig ting — det er logins med rolle "montor", der hver
// har en bilId (se profiler.bil_id / brugere i skyLager.js).
const DEFAULT_BILER = [
  { id: "b1", nummerplade: "AB 12 345", lukket: false, lukketAarsag: "" },
  { id: "b2", nummerplade: "CD 67 890", lukket: false, lukketAarsag: "" },
  { id: "b3", nummerplade: "EF 22 111", lukket: false, lukketAarsag: "" },
];

const bilLabel = (bil) => (bil ? bil.nummerplade || "(ingen nummerplade)" : "Ingen bil");

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
        id: uid(), varetype: "Køle-/fryseskab", varetypeTekst: "", grundMinutter: 35,
        ydelser: [
          { id: uid(), navn: "Dørvending", minutter: 20, udfoert: true },
          { id: uid(), navn: "Bortskaffelse af gammelt apparat", minutter: 15, udfoert: true },
          { id: uid(), navn: "Vandtilslutning", minutter: 15, udfoert: false },
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
        id: uid(), varetype: "Vaskemaskine", varetypeTekst: "", grundMinutter: 30,
        ydelser: [
          { id: uid(), navn: "Afløbsslange", minutter: 10, udfoert: false },
          { id: uid(), navn: "Vandtilslutning", minutter: 15, udfoert: false },
          { id: uid(), navn: "Bortskaffelse af gammel maskine", minutter: 15, udfoert: false },
        ],
      },
      {
        id: uid(), varetype: "Tørretumbler", varetypeTekst: "", grundMinutter: 25,
        ydelser: [
          { id: uid(), navn: "Aftræk/kondensbakke", minutter: 15, udfoert: false },
          { id: uid(), navn: "Stabling på vaskemaskine", minutter: 10, udfoert: true },
        ],
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
        id: uid(), varetype: "Opvaskemaskine", varetypeTekst: "", grundMinutter: 30,
        ydelser: [
          { id: uid(), navn: "Indbygning/panel", minutter: 25, udfoert: false },
          { id: uid(), navn: "Vandtilslutning", minutter: 15, udfoert: false },
        ],
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
        id: uid(), varetype: "TV", varetypeTekst: "", grundMinutter: 20,
        ydelser: [
          { id: uid(), navn: "Ophæng på væg", minutter: 30, udfoert: false },
          { id: uid(), navn: "Kanalsøgning", minutter: 10, udfoert: false },
        ],
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
  STANDARD_YDELSE_MINUTTER, STANDARD_GRUNDMINUTTER, lavYdelse, ANDET_VARETYPE, DEFAULT_VARETYPER, varetypeNavne,
  lavVarelinje, varelinjeLabel, linjeMinutter, sagForventetMinutter, normaliserAdresse, bygningsNoegle, omraadeNoegle,
  ugeDage, dannTitel, noegleTekst, TIDSRUM, tidsrumFraId, tidsrumTekst, NOEGLE_TYPER, MONTOR_FARVER, montorFarve,
  DEFAULT_BILER, bilLabel, bilBlokeretAfFerie, seedBrugere, tomKunde, tomNoegle, seedSager, statusMeta, SIDER, SIDER_FOR_ROLLE,
};
