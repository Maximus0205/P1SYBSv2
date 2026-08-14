import { RotateCw, Trash2, Cable, Wifi, Wrench, Tag, ShoppingCart, Route, Truck, Package, Settings2, Building2, Archive } from "lucide-react";

// Core domain helpers and default data for the app. Function/constant names
// are English (part of the codebase's English rename); the actual STRING
// VALUES shown in the UI (labels, statuses, product names) stay Danish,
// since the people using the app are Danish shop staff.

const uid = () => Math.random().toString(36).slice(2, 10);

const now = () =>
  new Date().toLocaleString("da-DK", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const addDays = (iso, days) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const formatLongDate = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long" });
const isToday = (iso) => iso === todayISO();

const formatDuration = (min) => {
  if (min < 1) return "< 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}t ${m}m` : `${h}t`;
};

const formatTime = (iso) => new Date(iso).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
const totalMinutes = (order) => order.logs.reduce((sum, l) => sum + l.minutter, 0);

const serviceIcon = (name) => {
  const n = (name || "").toLowerCase();
  if (n.includes("dørvend")) return RotateCw;
  if (n.includes("bortskaf") || n.includes("gammel")) return Trash2;
  if (n.includes("kabel") || n.includes("slange") || n.includes("aftræk")) return Cable;
  if (n.includes("netværk") || n.includes("wifi") || n.includes("data") || n.includes("kanal")) return Wifi;
  if (n.includes("monter") || n.includes("indbyg") || n.includes("panel") || n.includes("ophæng") || n.includes("el")) return Wrench;
  return Tag;
};

const DEFAULT_SERVICE_MINUTES = 15;
const createAddOn = (name, minutes = DEFAULT_SERVICE_MINUTES) => ({ id: uid(), navn: name.trim(), minutter: Number(minutes) || 0, udfoert: false });

const OTHER_PRODUCT_TYPE_ID = "andet";
const OTHER_PRODUCT_TYPE = "Andet (skriv selv)";

// ---------------- Products & services ----------------
// Structure: product category -> product type (belongs to one category) ->
// an order picks, for each line item: product type, brand/model, one
// PRIMARY service, and optionally ADD-ON services. The relationships (which
// add-ons apply to which primary services/product types) live entirely on
// the add-on itself (primaerYdelser: [id...], varetyper: [id...], empty
// list = applies to all product types). Deliberately NO time estimate is
// set on product types/primary services/add-ons in Admin - all time is
// entered manually per booking in the salesperson's flow (see
// SagFormFields.jsx), since it varies too much for a fixed number per type
// to make sense.

const DEFAULT_PRODUCT_CATEGORIES = [
  { id: "vk1", navn: "Hvidevare" },
  { id: "vk2", navn: "Brunvare" },
];

const DEFAULT_PRIMARY_SERVICES = [
  { id: "p1", navn: "Kantstenslevering" },
  { id: "p2", navn: "Levering med indbæring" },
  { id: "p3", navn: "Montering" },
];

const DOOR_ITEMS = ["Køleskab", "Fryseskab", "Kølefryseskab", "Amerikanerskab", "Vinkøleskab"];
const DEFAULT_PRODUCT_TYPES = [
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

const DOOR_ITEM_IDS = DEFAULT_PRODUCT_TYPES.filter((v) => DOOR_ITEMS.includes(v.navn)).map((v) => v.id);

const DEFAULT_ADD_ON_SERVICES = [
  { id: "t1", navn: "Udpakning", primaerYdelser: ["p2", "p3"], varetyper: [] },
  { id: "t2", navn: "Dørvending", primaerYdelser: ["p3"], varetyper: DOOR_ITEM_IDS },
  { id: "t3", navn: "Bortskaffelse af gammelt produkt", primaerYdelser: ["p2", "p3"], varetyper: [] },
];

// The add-ons actually selectable for a given product type + primary
// service: must apply to the chosen primary service, and either apply to
// all product types (empty varetyper list), to "Other", or specifically to
// this product type.
const availableAddOns = (productTypeId, primaryServiceId, addOnServices) => {
  return (addOnServices || []).filter((t) => {
    const appliesToPrimary = (t.primaerYdelser || []).includes(primaryServiceId);
    const noProductTypeRestriction = !t.varetyper || t.varetyper.length === 0;
    const appliesToProductType = productTypeId === OTHER_PRODUCT_TYPE_ID ? noProductTypeRestriction : (noProductTypeRestriction || t.varetyper.includes(productTypeId));
    return appliesToPrimary && appliesToProductType;
  });
};

// NB: "plukket" (afkrydset på lager) sidder HER, pr. varelinje - se
// WarehousePage.jsx, hvor 1 varelinje = 1 punkt på pluklisten. Det er
// bevidst forskelligt fra order.plukket (se App.jsx), som blot er et
// afledt "hele ordren er samlet"-flag, opdateret automatisk når alle
// varelinjer på ordren er plukket.
const createLineItem = (productTypes, primaryServices, productTypeId, text = "") => {
  const firstProductType = productTypes[0];
  const id = productTypeId || (firstProductType ? firstProductType.id : OTHER_PRODUCT_TYPE_ID);
  const productType = productTypes.find((v) => v.id === id);
  const primaryService = primaryServices[0];
  return {
    id: uid(),
    varetypeId: id,
    varetypeNavn: productType ? productType.navn : OTHER_PRODUCT_TYPE,
    varetypeTekst: text,
    maerke: "",
    model: "",
    primaerYdelse: primaryService ? { id: primaryService.id, navn: primaryService.navn, minutter: 0 } : null,
    tillaeg: [],
    plukket: false,
  };
};

const lineItemLabel = (v) => {
  const base = v.varetypeId === OTHER_PRODUCT_TYPE_ID ? (v.varetypeTekst || "Speciel opgave") : (v.varetypeNavn || "Ukendt vare");
  const detail = [v.maerke, v.model].filter(Boolean).join(" ");
  return detail ? `${base} – ${detail}` : base;
};

const lineItemMinutes = (line) => (Number(line.primaerYdelse?.minutter) || 0) + (line.tillaeg || []).reduce((sum, y) => sum + (Number(y.minutter) || 0), 0);
const orderExpectedMinutes = (order) => (order.varelinjer || []).reduce((sum, l) => sum + lineItemMinutes(l), 0);

const normalizeAddress = (addr) => (addr || "").toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
const buildingKey = (addr) => {
  const n = normalizeAddress(addr);
  if (!n) return "";
  const match = n.match(/^([a-zæøå '-]+?\s\d+[a-z]?)\b/);
  return match ? match[1].trim() : n;
};

const areaKey = (addr) => {
  const n = normalizeAddress(addr);
  if (!n) return "";
  const match = n.match(/\b(\d{4})\s+([a-zæøå]+(?:\s[a-zæøå]+)?)\b/);
  return match ? `${match[1]} ${match[2]}`.trim() : "";
};

const weekDays = (iso) => {
  const d = new Date(iso + "T00:00:00");
  const dow = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    return `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}-${String(dd.getDate()).padStart(2, "0")}`;
  });
};

const buildTitle = (lineItems) => {
  if (!lineItems || lineItems.length === 0) return "Ny opgave";
  const names = lineItems.map(lineItemLabel).filter(Boolean);
  if (names.length === 0) return "Ny opgave";
  return `Levering: ${names.join(" + ")}`;
};

const keyAccessText = (n) => {
  if (!n || !n.kraeves) return "";
  const parts = [n.type || "Nøgle/adgang"];
  if (n.placering) parts.push(n.placering);
  return parts.join(" — ");
};

const TIME_SLOTS = [
  { id: "heldag", label: "Hel dag", start: "08:00", slut: "16:00" },
  { id: "formiddag", label: "Formiddag", start: "08:00", slut: "12:00" },
  { id: "eftermiddag", label: "Eftermiddag", start: "12:00", slut: "16:00" },
];
const timeSlotById = (id) => TIME_SLOTS.find((t) => t.id === id) || TIME_SLOTS[0];
const timeSlotText = (id) => {
  const t = timeSlotById(id);
  return `${t.label} (${t.start}–${t.slut})`;
};

const KEY_ACCESS_TYPES = ["Nøgle udleveres af kunde", "Nøgleboks", "Kode/alarm", "Afhentes på kontoret", "Andet"];

const TECHNICIAN_COLORS = ["#E2621B", "#3D7A5C", "#52697E", "#8B5E3C", "#6B5B95", "#1C7C8C"];
const technicianColor = (id, technicians) => {
  const idx = technicians.findIndex((m) => m.id === id);
  return idx >= 0 ? TECHNICIAN_COLORS[idx % TECHNICIAN_COLORS.length] : "#D8D0BE";
};

const DEFAULT_VEHICLES = [
  { id: "b1", navn: "Bil 1", nummerplade: "AB 12 345", lukket: false, lukketAarsag: "" },
  { id: "b2", navn: "Bil 2", nummerplade: "CD 67 890", lukket: false, lukketAarsag: "" },
  { id: "b3", navn: "Bil 3", nummerplade: "EF 22 111", lukket: false, lukketAarsag: "" },
];

const vehicleLabel = (vehicle) => (vehicle ? `${vehicle.navn || "(uden navn)"} · ${vehicle.nummerplade || "ingen nummerplade"}` : "Ingen bil");

const vehicleBlockedByTimeOff = (vehicleId, date, technicians, timeOff) => {
  const onThisVehicle = technicians.filter((m) => m.bilId === vehicleId);
  if (onThisVehicle.length === 0) return null;
  const entry = (timeOff || []).find((f) => onThisVehicle.some((m) => m.id === f.montorId) && date >= f.startDato && date <= f.slutDato);
  if (!entry) return null;
  const technician = onThisVehicle.find((m) => m.id === entry.montorId);
  return { ferie: entry, montor: technician };
};

const emptyCustomer = () => ({ navn: "", telefon: "", email: "", adresse: "", leveringsnote: "" });
const emptyKeyAccess = () => ({ kraeves: false, type: "", detaljer: "", placering: "" });

const STATUS_META = {
  planlagt: { label: "Planlagt", color: "#52697E" },
  igang: { label: "I gang", color: "#E2621B" },
  afsluttet: { label: "Afsluttet", color: "#3D7A5C" },
};

const PAGES = [
  { key: "salg", label: "Salg", icon: ShoppingCart },
  { key: "planlaegning", label: "Planlægning", icon: Route },
  { key: "koersel", label: "Kørsel", icon: Route },
  { key: "montor", label: "Montør", icon: Truck },
  { key: "lager", label: "Lager", icon: Package },
  { key: "arkiv", label: "Arkiv", icon: Archive },
  { key: "admin", label: "Admin", icon: Settings2 },
  { key: "systemadmin", label: "System", icon: Building2 },
];
const PAGES_FOR_ROLE = {
  admin: ["salg", "planlaegning", "koersel", "montor", "lager", "arkiv", "admin"],
  saelger: ["salg", "planlaegning", "koersel", "montor", "lager", "arkiv"],
  montor: ["montor"],
};

export {
  uid, now, todayISO, addDays, formatLongDate, isToday, formatDuration, formatTime, totalMinutes, serviceIcon,
  DEFAULT_SERVICE_MINUTES, createAddOn, OTHER_PRODUCT_TYPE, OTHER_PRODUCT_TYPE_ID,
  DEFAULT_PRODUCT_CATEGORIES, DEFAULT_PRODUCT_TYPES, DEFAULT_PRIMARY_SERVICES, DEFAULT_ADD_ON_SERVICES, availableAddOns,
  createLineItem, lineItemLabel, lineItemMinutes, orderExpectedMinutes, normalizeAddress, buildingKey, areaKey,
  weekDays, buildTitle, keyAccessText, TIME_SLOTS, timeSlotById, timeSlotText, KEY_ACCESS_TYPES, TECHNICIAN_COLORS, technicianColor,
  DEFAULT_VEHICLES, vehicleLabel, vehicleBlockedByTimeOff, emptyCustomer, emptyKeyAccess, STATUS_META, PAGES, PAGES_FOR_ROLE,
};
