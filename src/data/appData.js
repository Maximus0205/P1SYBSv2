import { RotateCw, Trash2, Cable, Wifi, Wrench, Tag, ShoppingCart, Route, Truck, Package, Settings2, Building2 } from "lucide-react";

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
const ANDET_VARETYPE = "Andet (skriv selv)";

// ---------------- Varer & ydelser ----------------
// Struktur: Varekategori -> Varetype (hører til én kategori) -> en sag
// vælger for hver varelinje: varetype, mærke/model, én PRIMÆR ydelse, og
// valgfrit TILLÆGSYDELSER. Relationerne (hvilke tillægsydelser der gælder
// for hvilke primære ydelser/varetyper) ligger udelukkende på selve
// tillægsydelsen (primaerYdelser: [id...], varetyper: [id...], tom liste =
// gælder alle varetyper). Der sættes bevidst INTET tidsestimat på
// varetyper/primære ydelser/tillægsydelser i Admin - al tid tastes manuelt
// pr. booking i sælgerens flow (se SagFormFields.jsx), da det varierer for
// meget til at et fast tal pr. type giver mening.

const DEFAULT_VAREKATEGORIER = [
  { id: "vk1", navn: "Hvidevare" },
  { id: "vk2", navn: "Brunvare" },
];

const DEFAULT_PRIMAERYDELSER = [
  { id: "p1", navn: "Kantstenslevering" },
  { id: "p2", navn: "Levering med indbæring" },
  { id: "p3", navn: "Montering" },
];

const DOER = ["Køleskab", "Fryseskab", "Kølefryseskab", "Amerikanerskab", "Vinkøleskab"];
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

const DOER_IDS = DEFAULT_VARETYPER.filter((v) => DOER.includes(v.navn)).map((v) => v.id);

const DEFAULT_TILLAEGSYDELSER = [
  { id: "t1", navn: "Udpakning", primaerYdelser: ["p2", "p3"], varetyper: [] },
  { id: "t2", navn: "Dørvending", primaerYdelser: ["p3"], varetyper: DOER_IDS },
  { id: "t3", navn: "Bortskaffelse af gammelt produkt", primaerYdelser: ["p2", "p3"], varetyper: [] },
];

// De tillægsydelser der reelt kan vælges for en given varetype + primær
// ydelse: skal gælde for den valgte primære ydelse, og enten gælde for alle
// varetyper (tom varetyper-liste), for "Andet", eller specifikt for netop
// denne varetype.
const tilgaengeligeTillaeg = (varetypeId, primaerYdelseId, tillaegsydelser) => {
  return (tillaegsydelser || []).filter((t) => {
    const gaelderPrimaer = (t.primaerYdelser || []).includes(primaerYdelseId);
    const ingenVaretypeBegraensning = !t.varetyper || t.varetyper.length === 0;
    const gaelderVaretype = varetypeId === ANDET_VARETYPE_ID ? ingenVaretypeBegraensning : (ingenVaretypeBegraensning || t.varetyper.includes(varetypeId));
    return gaelderPrimaer && gaelderVaretype;
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
    varetypeNavn: vt ? vt.navn : ANDET_VARETYPE,
    varetypeTekst: tekst,
    maerke: "",
    model: "",
    primaerYdelse: py ? { id: py.id, navn: py.navn, minutter: 0 } : null,
    tillaeg: [],
  };
};

const varelinjeLabel = (v) => {
  const grund = v.varetypeId === ANDET_VARETYPE_ID ? (v.varetypeTekst || "Speciel opgave") : (v.varetypeNavn || "Ukendt vare");
  const detalje = [v.maerke, v.model].filter(Boolean).join(" ");
  return detalje ? `${grund} – ${detalje}` : grund;
};

const linjeMinutter = (linje) => (Number(linje.primaerYdelse?.minutter) || 0) + (linje.tillaeg || []).reduce((sum, y) => sum + (Number(y.minutter) || 0), 0);
const sagForventetMinutter = (sag) => (sag.varelinjer || []).reduce((sum, l) => sum + linjeMinutter(l), 0);

const normaliserAdresse = (adr) => (adr || "").toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
const bygningsNoegle = (adr) => {
  const n = normaliserAdresse(adr);
  if (!n) return "";
  const match = n.match(/^([a-zæøå '-]+?\s\d+[a-z]?)\b/);
  return match ? match[1].trim() : n;
};

const omraadeNoegle = (adr) => {
  const n = normaliserAdresse(adr);
  if (!n) return "";
  const match = n.match(/\b(\d{4})\s+([a-zæøå]+(?:\s[a-zæøå]+)?)\b/);
  return match ? `${match[1]} ${match[2]}`.trim() : "";
};

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

const DEFAULT_BILER = [
  { id: "b1", navn: "Bil 1", nummerplade: "AB 12 345", lukket: false, lukketAarsag: "" },
  { id: "b2", navn: "Bil 2", nummerplade: "CD 67 890", lukket: false, lukketAarsag: "" },
  { id: "b3", navn: "Bil 3", nummerplade: "EF 22 111", lukket: false, lukketAarsag: "" },
];

const bilLabel = (bil) => (bil ? `${bil.navn || "(uden navn)"} · ${bil.nummerplade || "ingen nummerplade"}` : "Ingen bil");

const seedBrugere = [
  { id: "u1", navn: "Admin Andersen", brugernavn: "admin", adgangskode: "admin", rolle: "admin", bilId: null },
  { id: "u2", navn: "Sanne Sælger", brugernavn: "saelger", adgangskode: "saelger", rolle: "saelger", bilId: null },
  { id: "u3", navn: "Lars Pedersen", brugernavn: "lars", adgangskode: "lars", rolle: "montor", bilId: "b1" },
];

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

const seedSager = [];

const statusMeta = {
  planlagt: { label: "Planlagt", color: "#52697E" },
  igang: { label: "I gang", color: "#E2621B" },
  afsluttet: { label: "Afsluttet", color: "#3D7A5C" },
};

const SIDER = [
  { key: "salg", label: "Salg", icon: ShoppingCart },
  { key: "planlaegning", label: "Planlægning", icon: Route },
  { key: "koersel", label: "Kørsel", icon: Route },
  { key: "montor", label: "Montør", icon: Truck },
  { key: "lager", label: "Lager", icon: Package },
  { key: "admin", label: "Admin", icon: Settings2 },
  { key: "systemadmin", label: "System", icon: Building2 },
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
