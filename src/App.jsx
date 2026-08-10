import React, { useState, useEffect } from "react";

import { supabase } from "./lib/supabaseClient";
// Importerer fra det nye, engelsk-navngivne dataStore.js (erstatter det
// tidligere skyLager.js som en del af omlægningen til engelsk kodebase) -
// aliaset tilbage til de eksisterende danske navne her i App.jsx, så resten
// af filens body ikke skal omskrives i samme omgang.
import {
  getOrders as hentSager, saveOrder as gemSag, deleteOrder as sletSag, getFreshOrder as hentFriskSag,
  getVehicles as hentBiler, saveVehicle as gemBil, deleteVehicle as sletBil, seedDefaultVehicles as opsaetStandardBiler,
  getProductTypes as hentVaretyper, saveProductType as gemVaretype, deleteProductType as sletVaretype, seedDefaultProductTypes as opsaetStandardVaretyper,
  getProductCategories as hentVarekategorier, saveProductCategory as gemVarekategori, deleteProductCategory as sletVarekategori, seedDefaultProductCategories as opsaetStandardVarekategorier,
  getPrimaryServices as hentPrimaerydelser, savePrimaryService as gemPrimaerydelse, deletePrimaryService as sletPrimaerydelse, seedDefaultPrimaryServices as opsaetStandardPrimaerydelser,
  getAddOnServices as hentTillaegsydelser, saveAddOnService as gemTillaegsydelse, deleteAddOnService as sletTillaegsydelse, seedDefaultAddOnServices as opsaetStandardTillaegsydelser,
  getOwnProfile as hentEgenProfil, getStoreUsers as hentButiksBrugere, updateProfile as opdaterProfil,
  createUserAsAdmin as opretBrugerAdmin, resetPasswordAsAdmin as nulstilAdgangskodeAdmin,
  getTimeOff as hentFerier, addTimeOff as tilfoejFerieSky, deleteTimeOff as sletFerieSky,
  getStore as hentButik,
} from "./lib/dataStore";
import {
  uid, todayISO,
  DEFAULT_VARETYPER, DEFAULT_VAREKATEGORIER, DEFAULT_PRIMAERYDELSER, DEFAULT_TILLAEGSYDELSER, DEFAULT_BILER,
  SIDER_FOR_ROLLE,
} from "./data/appData";

import { TopNav } from "./components/TopNav";
import { LoginSide } from "./components/LoginSide";
import { SagView } from "./components/SagView";

import { SalgSide } from "./pages/SalgSide";
import { PlanlaegningSide } from "./pages/PlanlaegningSide";
import { KoerselSide } from "./pages/KoerselSide";
import { MontorVaelger, MontorRuteView } from "./pages/MontorSide";
import { LagerSide } from "./pages/LagerSide";
import { AdminSide } from "./pages/AdminSide";
import { SystemAdminSide } from "./pages/SystemAdminSide";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [session, setSession] = useState(null); // Supabase Auth-session (null = ikke logget ind)
  const [profil, setProfil] = useState(null); // { id, navn, rolle, bilId, butikId, erSystemadmin }
  const [butik, setButik] = useState(null); // { id, navn, adresse, lat, lon } - egen butiks koordinater
  const [sager, setSager] = useState([]);
  const [biler, setBiler] = useState([]);
  const [brugere, setBrugere] = useState([]);
  const [ferier, setFerier] = useState([]);
  const [varetyper, setVaretyper] = useState([]);
  const [varekategorier, setVarekategorier] = useState([]);
  const [primaerydelser, setPrimaerydelser] = useState([]);
  const [tillaegsydelser, setTillaegsydelser] = useState([]);
  const [side, setSide] = useState("salg");
  const [valgtDato, setValgtDato] = useState(todayISO());
  const [valgtMontorId, setValgtMontorId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  // "Montører" er ikke længere en selvstændig ting i databasen — det er
  // brugere/profiler med rolle "montor". Vi udleder listen her, i samme form
  // som resten af appen altid har forventet ({ id, navn, bil, bilId }), så
  // KoerselSide/MontorSide/SagFormFields osv. ikke skal ændres for det.
  const montorer = brugere
    .filter((b) => b.rolle === "montor")
    .map((b) => {
      const tilknyttetBil = biler.find((bil) => bil.id === b.bilId);
      return { id: b.id, navn: b.navn, bilId: b.bilId || null, bil: tilknyttetBil ? tilknyttetBil.nummerplade : "" };
    });

  // Henter alt for den butik den indloggede bruger hører til.
  const hent = async (butikId) => {
    if (!butikId) { setSager([]); setBiler([]); setVaretyper([]); setVarekategorier([]); setPrimaerydelser([]); setTillaegsydelser([]); setBrugere([]); setFerier([]); return; }
    const [s, bl, v, vk, py, ty, b, f] = await Promise.all([
      hentSager(butikId),
      hentBiler(butikId),
      hentVaretyper(butikId),
      hentVarekategorier(butikId),
      hentPrimaerydelser(butikId),
      hentTillaegsydelser(butikId),
      hentButiksBrugere(butikId),
      hentFerier(butikId),
    ]);
    // Første gang butikken bruges, er listerne tomme - sæt fornuftige standarder.
    const bilerEndelig = bl.length > 0 ? bl : DEFAULT_BILER;
    const kategorierEndelig = vk.length > 0 ? vk : DEFAULT_VAREKATEGORIER;
    const varetyperEndelig = v.length > 0 ? v : DEFAULT_VARETYPER;
    const primaerydelserEndelig = py.length > 0 ? py : DEFAULT_PRIMAERYDELSER;
    const tillaegsydelserEndelig = ty.length > 0 ? ty : DEFAULT_TILLAEGSYDELSER;
    if (bl.length === 0) opsaetStandardBiler(butikId, bilerEndelig);
    if (vk.length === 0) opsaetStandardVarekategorier(butikId, kategorierEndelig);
    if (v.length === 0) opsaetStandardVaretyper(butikId, varetyperEndelig);
    if (py.length === 0) opsaetStandardPrimaerydelser(butikId, primaerydelserEndelig);
    if (ty.length === 0) opsaetStandardTillaegsydelser(butikId, tillaegsydelserEndelig);
    setSager(s); setBiler(bilerEndelig); setVarekategorier(kategorierEndelig); setVaretyper(varetyperEndelig);
    setPrimaerydelser(primaerydelserEndelig); setTillaegsydelser(tillaegsydelserEndelig); setBrugere(b); setFerier(f);
  };

  const genindlaesProfil = async (userId) => {
    const p = await hentEgenProfil(userId);
    if (!p) { setProfil(null); return null; }
    const normaliseret = { id: p.id, navn: p.navn, rolle: p.rolle, bilId: p.bil_id, butikId: p.butik_id, erSystemadmin: !!p.er_systemadmin };
    setProfil(normaliseret);
    if (normaliseret.butikId) {
      setSide((SIDER_FOR_ROLLE[normaliseret.rolle] || ["salg"])[0]);
      if (normaliseret.rolle === "montor") setValgtMontorId(normaliseret.id);
      await hent(normaliseret.butikId);
      const butikData = await hentButik(normaliseret.butikId);
      setButik(butikData);
    } else if (normaliseret.erSystemadmin) {
      setSide("systemadmin");
    }
    return normaliseret;
  };

  const tilfoejFerie = async (felter) => { if (profil?.butikId) { await tilfoejFerieSky(profil.butikId, felter); await hent(profil.butikId); } };
  const sletFerie = async (id) => { if (profil?.butikId) { await sletFerieSky(id); await hent(profil.butikId); } };

  useEffect(() => {
    // Første indlæsning: tjek om der allerede er en session.
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await genindlaesProfil(data.session.user.id);
      setLoading(false);
    });

    // Lyt løbende på login/logout (fra denne eller andre faner).
    //
    // VIGTIGT: denne callback må ikke selv "await"'e andre Supabase-kald
    // (som fx genindlaesProfil -> supabase.from(...)). Supabase-auth-klienten
    // holder en intern lås mens callbacken kører, så et synkront await her
    // på et andet Supabase-kald fryser hele klienten (kendt supabase-js-
    // fælde). setTimeout(..., 0) skubber arbejdet til næste "tick", uden for
    // låsen, så login rent faktisk kan fuldføre.
    const { data: lytter } = supabase.auth.onAuthStateChange((_event, nySession) => {
      setSession(nySession);
      if (nySession) {
        setTimeout(() => { genindlaesProfil(nySession.user.id); }, 0);
      } else {
        setProfil(null);
        setButik(null);
        setSager([]); setBiler([]); setVaretyper([]); setVarekategorier([]); setPrimaerydelser([]); setTillaegsydelser([]); setBrugere([]); setFerier([]);
        setSelectedId(null);
      }
    });

    return () => lytter.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const opdater = async () => { setRefreshing(true); if (profil?.butikId) await hent(profil.butikId); setRefreshing(false); };

  // ---------- Generiske hjælpere: gem/slet ÉT element lokalt + i databasen ----------
  // (Hver liste har sin egen sky-funktion, men mønsteret er ens: opdatér
  // React-state for præcis dét element, og send KUN det element videre til
  // databasen - se den vigtige note øverst i dataStore.js om hvorfor.)
  const gemEtSager = (sag) => { setSager((prev) => (prev.some((s) => s.id === sag.id) ? prev.map((s) => (s.id === sag.id ? sag : s)) : [...prev, sag])); if (profil?.butikId) gemSag(profil.butikId, sag); };
  const fjernEtSager = (id) => { setSager((prev) => prev.filter((s) => s.id !== id)); if (profil?.butikId) sletSag(profil.butikId, id); };

  const gemEnBil = (bil) => { setBiler((prev) => (prev.some((b) => b.id === bil.id) ? prev.map((b) => (b.id === bil.id ? bil : b)) : [...prev, bil])); if (profil?.butikId) gemBil(profil.butikId, bil); };
  const fjernEnBil = (id) => { setBiler((prev) => prev.filter((b) => b.id !== id)); if (profil?.butikId) sletBil(profil.butikId, id); };

  const gemEnVarekategori = (k) => { setVarekategorier((prev) => (prev.some((x) => x.id === k.id) ? prev.map((x) => (x.id === k.id ? k : x)) : [...prev, k])); if (profil?.butikId) gemVarekategori(profil.butikId, k); };
  const fjernEnVarekategori = (id) => { setVarekategorier((prev) => prev.filter((x) => x.id !== id)); if (profil?.butikId) sletVarekategori(profil.butikId, id); };

  const gemEnVaretype = (v) => { setVaretyper((prev) => (prev.some((x) => x.id === v.id) ? prev.map((x) => (x.id === v.id ? v : x)) : [...prev, v])); if (profil?.butikId) gemVaretype(profil.butikId, v); };
  const fjernEnVaretype = (id) => { setVaretyper((prev) => prev.filter((x) => x.id !== id)); if (profil?.butikId) sletVaretype(profil.butikId, id); };

  const gemEnPrimaerydelse = (p) => { setPrimaerydelser((prev) => (prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p])); if (profil?.butikId) gemPrimaerydelse(profil.butikId, p); };
  const fjernEnPrimaerydelse = (id) => { setPrimaerydelser((prev) => prev.filter((x) => x.id !== id)); if (profil?.butikId) sletPrimaerydelse(profil.butikId, id); };

  const gemEnTillaegsydelse = (t) => { setTillaegsydelser((prev) => (prev.some((x) => x.id === t.id) ? prev.map((x) => (x.id === t.id ? t : x)) : [...prev, t])); if (profil?.butikId) gemTillaegsydelse(profil.butikId, t); };
  const fjernEnTillaegsydelse = (id) => { setTillaegsydelser((prev) => prev.filter((x) => x.id !== id)); if (profil?.butikId) sletTillaegsydelse(profil.butikId, id); };

  const addBil = (navn, nummerplade) => gemEnBil({ id: uid(), navn, nummerplade, lukket: false, lukketAarsag: "" });
  const updateBil = (id, felter) => { const b = biler.find((x) => x.id === id); if (b) gemEnBil({ ...b, ...felter }); };
  const toggleBilLukket = (id, aarsag) => {
    const b = biler.find((x) => x.id === id);
    if (b) gemEnBil({ ...b, lukket: !b.lukket, lukketAarsag: !b.lukket ? (aarsag || "Værksted") : "" });
  };
  const deleteBil = (id) => {
    if (montorer.some((m) => m.bilId === id) && !window.confirm("Denne bil er tildelt en montør. Slet alligevel?")) return;
    fjernEnBil(id);
  };

  // Skifter hvilken bil en montør (bruger med rolle "montor") er tilknyttet.
  // Ferier flytter automatisk med, fordi blokeringen beregnes ud fra denne
  // tilknytning i stedet for at blive gemt fast på selve bilen.
  const updateMontorBil = (montorId, bilId) => updateBruger(montorId, { bilId: bilId || null });

  const logUd = async () => { await supabase.auth.signOut(); };

  const selected = sager.find((s) => s.id === selectedId);

  // Opretter en ny sag med et midlertidigt sagsnummer (vises med det samme),
  // og henter den friske, database-tildelte version bagefter (se
  // assign_order_number-triggeren) - så det ENDELIGE, garanteret unikke
  // sagsnummer altid vises korrekt, uden gæt fra browseren.
  const addSag = async ({ kunde, koeber, noegle, dato, tidsrumId, start, slut, montorId, varelinjer, ordrenummer }) => {
    if (!profil?.butikId) return;
    const nySag = {
      id: uid(), nr: "...", ordrenummer: ordrenummer?.trim() || "",
      kunde, koeber: koeber || null, noegle: noegle || {}, dato: dato || todayISO(), tidsrumId, start, slut, montorId,
      status: "planlagt", plukket: false, varelinjer, noter: [], billeder: [], rapporter: [], stemplerInd: null, logs: [],
    };
    setSager((prev) => [...prev, nySag]);
    await gemSag(profil.butikId, nySag);
    const frisk = await hentFriskSag(profil.butikId, nySag.id);
    if (frisk) setSager((prev) => prev.map((s) => (s.id === frisk.id ? frisk : s)));
  };

  // Hurtig-redigering af en booket sag (dato/tidsrum/montør/adresse) - se
  // BookingRedigering i SagView.jsx.
  const updateBooking = (id, felter) => { const s = sager.find((x) => x.id === id); if (s) gemEtSager({ ...s, ...felter }); };

  const importSager = (nySager) => nySager.forEach((s) => gemEtSager(s));

  // Brugere oprettes rigtigt (Supabase Auth) via en edge function, som selv
  // tjekker at kalderen er admin (eller systemadmin, som skal angive
  // butikId eksplicit) - se admin-opret-bruger.
  const addBruger = async (felter) => {
    const resultat = await opretBrugerAdmin(felter);
    if (resultat.ok && profil?.butikId) await hent(profil.butikId);
    return resultat;
  };
  const updateBruger = async (id, felter) => {
    const dbFelter = {};
    if ("rolle" in felter) dbFelter.rolle = felter.rolle;
    if ("bilId" in felter) dbFelter.bil_id = felter.bilId;
    if ("navn" in felter) dbFelter.navn = felter.navn;
    const ok = await opdaterProfil(id, dbFelter);
    if (ok && profil?.butikId) await hent(profil.butikId);
  };
  const deleteBruger = async (id) => {
    if (!window.confirm("Fjern denne brugers adgang til butikken?")) return;
    await opdaterProfil(id, { butik_id: null, rolle: "saelger" });
    if (profil?.butikId) await hent(profil.butikId);
  };
  const nulstilAdgangskode = (brugerId, nyAdgangskode) => nulstilAdgangskodeAdmin(brugerId, nyAdgangskode);

  // ---------- Varer & ydelser ----------
  // Relationerne (hvilke tillægsydelser der gælder for hvilke varetyper/
  // primære ydelser) ligger udelukkende på tillaegsydelser selv (se
  // appData.js) - derfor rydder vi op i tillaegsydelser, når en varetype
  // eller primær ydelse slettes, så der ikke bliver hængende referencer til
  // noget der ikke findes mere. Der sættes IKKE noget tidsestimat her - det
  // tastes udelukkende manuelt for den enkelte booking i sælgerens flow.
  const addVarekategori = (navn) => gemEnVarekategori({ id: uid(), navn });
  const updateVarekategori = (id, navn) => { const k = varekategorier.find((x) => x.id === id); if (k) gemEnVarekategori({ ...k, navn }); };
  const deleteVarekategori = (id) => {
    const iBrug = varetyper.filter((v) => v.kategoriId === id).length;
    if (iBrug > 0 && !window.confirm(`${iBrug} varetype(r) hører til denne kategori. Slet alligevel? (Varetyperne beholdes, men mister kategori-tilknytningen.)`)) return;
    fjernEnVarekategori(id);
  };

  const addVaretype = (navn, kategoriId) => gemEnVaretype({ id: uid(), navn, kategoriId: kategoriId || null });
  const updateVaretype = (id, felter) => { const v = varetyper.find((x) => x.id === id); if (v) gemEnVaretype({ ...v, ...felter }); };
  const deleteVaretype = (id) => {
    if (!window.confirm("Slet denne varetype? Allerede bookede sager beholder deres oplysninger uændret.")) return;
    fjernEnVaretype(id);
    tillaegsydelser.filter((t) => (t.varetyper || []).includes(id)).forEach((t) => gemEnTillaegsydelse({ ...t, varetyper: t.varetyper.filter((vid) => vid !== id) }));
  };

  const addPrimaerydelse = (navn) => gemEnPrimaerydelse({ id: uid(), navn });
  const updatePrimaerydelse = (id, felter) => { const p = primaerydelser.find((x) => x.id === id); if (p) gemEnPrimaerydelse({ ...p, ...felter }); };
  const deletePrimaerydelse = (id) => {
    if (!window.confirm("Slet denne primære ydelse? Allerede bookede sager beholder deres oplysninger uændret.")) return;
    fjernEnPrimaerydelse(id);
    tillaegsydelser.filter((t) => (t.primaerYdelser || []).includes(id)).forEach((t) => gemEnTillaegsydelse({ ...t, primaerYdelser: t.primaerYdelser.filter((pid) => pid !== id) }));
  };

  const addTillaegsydelse = (navn) => gemEnTillaegsydelse({ id: uid(), navn, primaerYdelser: [], varetyper: [] });
  const updateTillaegsydelse = (id, felter) => { const t = tillaegsydelser.find((x) => x.id === id); if (t) gemEnTillaegsydelse({ ...t, ...felter }); };
  const deleteTillaegsydelse = (id) => {
    if (!window.confirm("Slet denne tillægsydelse? Allerede bookede sager beholder deres oplysninger uændret.")) return;
    fjernEnTillaegsydelse(id);
  };

  const assignMontor = (sagId, montorId) => { const s = sager.find((x) => x.id === sagId); if (s) gemEtSager({ ...s, montorId }); };
  const updateTidsrum = (sagId, tidsrumId) => { const s = sager.find((x) => x.id === sagId); if (s) gemEtSager({ ...s, tidsrumId }); };
  const togglePluk = (sagId) => { const s = sager.find((x) => x.id === sagId); if (s) gemEtSager({ ...s, plukket: !s.plukket }); };

  const cycleStatus = (id) => {
    const s = sager.find((x) => x.id === id);
    if (!s) return;
    const order = ["planlagt", "igang", "afsluttet"];
    gemEtSager({ ...s, status: order[(order.indexOf(s.status) + 1) % order.length] });
  };

  const addNote = (id, tekst) => { const s = sager.find((x) => x.id === id); if (s) gemEtSager({ ...s, noter: [...s.noter, { id: uid(), tekst, tid: new Date().toLocaleString("da-DK") }] }); };
  const addPhoto = (id, { src, navn }) => { const s = sager.find((x) => x.id === id); if (s) gemEtSager({ ...s, billeder: [...s.billeder, { id: uid(), src, navn }] }); };
  const addReport = (id, titel, tekst) => { const s = sager.find((x) => x.id === id); if (s) gemEtSager({ ...s, rapporter: [...s.rapporter, { id: uid(), titel, tekst, tid: new Date().toLocaleString("da-DK") }] }); };

  const stempleInd = (id) => { const s = sager.find((x) => x.id === id); if (s) gemEtSager({ ...s, stemplerInd: new Date().toISOString(), status: s.status === "planlagt" ? "igang" : s.status }); };
  const stempleUd = (id) => {
    const s = sager.find((x) => x.id === id);
    if (!s || !s.stemplerInd) return;
    const ind = s.stemplerInd, ud = new Date().toISOString();
    const minutter = Math.max(1, Math.round((new Date(ud) - new Date(ind)) / 60000));
    gemEtSager({ ...s, stemplerInd: null, logs: [...s.logs, { id: uid(), ind, ud, minutter }] });
  };

  const toggleYdelse = (sagId, linjeId, yId) => {
    const s = sager.find((x) => x.id === sagId);
    if (s) gemEtSager({ ...s, varelinjer: s.varelinjer.map((v) => (v.id === linjeId ? { ...v, tillaeg: v.tillaeg.map((y) => (y.id === yId ? { ...y, udfoert: !y.udfoert } : y)) } : v)) });
  };
  const addYdelse = (sagId, linjeId, navn) => {
    const s = sager.find((x) => x.id === sagId);
    if (s) gemEtSager({ ...s, varelinjer: s.varelinjer.map((v) => (v.id === linjeId ? { ...v, tillaeg: [...v.tillaeg, { id: uid(), navn: navn.trim(), minutter: 15, udfoert: false }] } : v)) });
  };
  const removeYdelse = (sagId, linjeId, yId) => {
    const s = sager.find((x) => x.id === sagId);
    if (s) gemEtSager({ ...s, varelinjer: s.varelinjer.map((v) => (v.id === linjeId ? { ...v, tillaeg: v.tillaeg.filter((y) => y.id !== yId) } : v)) });
  };

  const montor = montorer.find((m) => m.id === valgtMontorId);
  const smalSide = side === "montor" || !!selected;

  if (loading) {
    return <div className="min-h-screen w-full flex items-center justify-center" style={{ background: "#F3EFE6" }}><p className="text-sm text-[#52697E]">Indlæser...</p></div>;
  }

  if (!session) {
    return <LoginSide />;
  }

  if (!profil) {
    return <div className="min-h-screen w-full flex items-center justify-center" style={{ background: "#F3EFE6" }}><p className="text-sm text-[#52697E]">Indlæser profil...</p></div>;
  }

  if (!profil.butikId) {
    if (profil.erSystemadmin) {
      return (
        <div className="min-h-screen w-full" style={{ background: "#F3EFE6" }}>
          <div className="max-w-2xl mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-4">
              <p className="font-mono text-[11px] tracking-widest uppercase text-[#E2621B]">Systemadministration</p>
              <button onClick={logUd} className="text-xs text-[#52697E] hover:text-[#E2621B] underline">Log ud</button>
            </div>
            <SystemAdminSide />
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen w-full flex items-center justify-center px-4" style={{ background: "#F3EFE6" }}>
        <div className="max-w-sm border border-[#D8D0BE] bg-white p-6 text-center">
          <p className="text-sm text-[#1C232E]">
            Din bruger er oprettet, men er endnu ikke koblet til en butik. Bed en administrator om at give dig adgang.
          </p>
          <button onClick={logUd} className="mt-4 text-xs text-[#52697E] hover:text-[#E2621B] underline">Log ud</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full" style={{ background: "#F3EFE6", fontFamily: "Inter, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        .font-mono { font-family: 'JetBrains Mono', monospace; }
      `}</style>

      <TopNav side={side} onSkift={(k) => { setSide(k); setSelectedId(null); }} bruger={profil} onLogUd={logUd} />

      <div className={`${smalSide ? "max-w-2xl" : "max-w-6xl"} mx-auto px-4 pb-10`}>
        {selected ? (
          <SagView
            sag={selected}
            montorer={montorer}
            onBack={() => setSelectedId(null)}
            addNote={(t) => addNote(selected.id, t)}
            addPhoto={(p) => addPhoto(selected.id, p)}
            addReport={(t, x) => addReport(selected.id, t, x)}
            onCycleStatus={cycleStatus}
            onStempleInd={() => stempleInd(selected.id)}
            onStempleUd={() => stempleUd(selected.id)}
            onToggleYdelse={(linjeId, yId) => toggleYdelse(selected.id, linjeId, yId)}
            onAddYdelse={(linjeId, navn) => addYdelse(selected.id, linjeId, navn)}
            onRemoveYdelse={(linjeId, yId) => removeYdelse(selected.id, linjeId, yId)}
            onUpdateBooking={(felter) => updateBooking(selected.id, felter)}
          />
        ) : side === "salg" ? (
          <SalgSide sager={sager} montorer={montorer} varetyper={varetyper} varekategorier={varekategorier} primaerydelser={primaerydelser} tillaegsydelser={tillaegsydelser} valgtDato={valgtDato} onSkiftDato={setValgtDato} onOpen={setSelectedId} onAdd={addSag} onImport={importSager} butikFokus={butik?.lat && butik?.lon ? { lat: butik.lat, lon: butik.lon } : null} />
        ) : side === "planlaegning" ? (
          <PlanlaegningSide sager={sager} montorer={montorer} onOpen={setSelectedId} onCycleStatus={cycleStatus} />
        ) : side === "koersel" ? (
          <KoerselSide sager={sager} montorer={montorer} biler={biler} ferier={ferier} valgtDato={valgtDato} onSkiftDato={setValgtDato} onOpen={setSelectedId} onCycleStatus={cycleStatus} onAssign={assignMontor} onUpdateTidsrum={updateTidsrum} onUpdateMontor={(montorId, felter) => updateMontorBil(montorId, felter.bilId)} onRefresh={opdater} refreshing={refreshing} />
        ) : side === "montor" ? (
          profil.rolle === "montor" ? (
            montor ? <MontorRuteView sager={sager} montor={montor} valgtDato={valgtDato} onSkiftDato={setValgtDato} onOpen={setSelectedId} onCycleStatus={cycleStatus} onRefresh={opdater} refreshing={refreshing} /> : <p className="text-sm text-[#52697E]">Din bruger er ikke koblet til en montør/bil-profil endnu — kontakt en administrator.</p>
          ) : montor ? (
            <MontorRuteView sager={sager} montor={montor} valgtDato={valgtDato} onSkiftDato={setValgtDato} onOpen={setSelectedId} onCycleStatus={cycleStatus} onSkift={() => setValgtMontorId(null)} onRefresh={opdater} refreshing={refreshing} />
          ) : (
            <MontorVaelger montorer={montorer} onVaelg={setValgtMontorId} />
          )
        ) : side === "lager" ? (
          <LagerSide sager={sager} montorer={montorer} valgtDato={valgtDato} onSkiftDato={setValgtDato} onTogglePluk={togglePluk} onOpen={setSelectedId} />
        ) : side === "systemadmin" ? (
          <SystemAdminSide />
        ) : (
          <AdminSide
            montorer={montorer} biler={biler} sager={sager} brugere={brugere} ferier={ferier} aktuelBrugerId={profil.id}
            varetyper={varetyper} varekategorier={varekategorier} primaerydelser={primaerydelser} tillaegsydelser={tillaegsydelser}
            onUpdateMontorBil={updateMontorBil} onAddBil={addBil} onUpdateBil={updateBil} onDeleteBil={deleteBil} onToggleBilLukket={toggleBilLukket}
            onAddBruger={addBruger} onUpdateBruger={updateBruger} onDeleteBruger={deleteBruger} onNulstilAdgangskode={nulstilAdgangskode}
            onAddVarekategori={addVarekategori} onUpdateVarekategori={updateVarekategori} onDeleteVarekategori={deleteVarekategori}
            onAddVaretype={addVaretype} onUpdateVaretype={updateVaretype} onDeleteVaretype={deleteVaretype}
            onAddPrimaerydelse={addPrimaerydelse} onUpdatePrimaerydelse={updatePrimaerydelse} onDeletePrimaerydelse={deletePrimaerydelse}
            onAddTillaegsydelse={addTillaegsydelse} onUpdateTillaegsydelse={updateTillaegsydelse} onDeleteTillaegsydelse={deleteTillaegsydelse}
            onTilfoejFerie={tilfoejFerie} onSletFerie={sletFerie}
          />
        )}
      </div>
    </div>
  );
}
