import React, { useState, useEffect } from "react";

import { supabase } from "./lib/supabaseClient";
import {
  hentSager, gemSager as gemSagerSky,
  hentBiler, gemBiler as gemBilerSky,
  hentVaretyper, gemVaretyper as gemVaretyperSky,
  hentEgenProfil, hentButiksBrugere, opdaterProfil, opretBrugerAdmin,
  hentFerier, tilfoejFerie as tilfoejFerieSky, sletFerie as sletFerieSky,
} from "./lib/skyLager";
import {
  uid, todayISO,
  DEFAULT_VARETYPER, DEFAULT_BILER,
  SIDER_FOR_ROLLE,
} from "./data/appData";
//commit test igen
import { TopNav } from "./components/TopNav";
import { LoginSide } from "./components/LoginSide";
import { SagView } from "./components/SagView";

import { SalgSide } from "./pages/SalgSide";
import { PlanlaegningSide } from "./pages/PlanlaegningSide";
import { KoerselSide } from "./pages/KoerselSide";
import { MontorVaelger, MontorRuteView } from "./pages/MontorSide";
import { LagerSide } from "./pages/LagerSide";
import { AdminSide } from "./pages/AdminSide";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [session, setSession] = useState(null); // Supabase Auth-session (null = ikke logget ind)
  const [profil, setProfil] = useState(null); // { id, navn, rolle, bilId, butikId }
  const [sager, setSager] = useState([]);
  const [biler, setBiler] = useState([]);
  const [brugere, setBrugere] = useState([]);
  const [ferier, setFerier] = useState([]);
  const [varetyper, setVaretyper] = useState([]);
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
    if (!butikId) { setSager([]); setBiler([]); setVaretyper([]); setBrugere([]); setFerier([]); return; }
    const [s, bl, v, b, f] = await Promise.all([
      hentSager(butikId),
      hentBiler(butikId),
      hentVaretyper(butikId),
      hentButiksBrugere(butikId),
      hentFerier(butikId),
    ]);
    // Første gang butikken bruges, er biler/varetyper tomme - sæt fornuftige standarder.
    const bilerEndelig = bl.length > 0 ? bl : DEFAULT_BILER;
    const varetyperEndelig = v.length > 0 ? v : DEFAULT_VARETYPER;
    if (bl.length === 0) gemBilerSky(butikId, bilerEndelig);
    if (v.length === 0) gemVaretyperSky(butikId, varetyperEndelig);
    setSager(s); setBiler(bilerEndelig); setVaretyper(varetyperEndelig); setBrugere(b); setFerier(f);
  };

  const genindlaesProfil = async (userId) => {
    const p = await hentEgenProfil(userId);
    if (!p) { setProfil(null); return null; }
    const normaliseret = { id: p.id, navn: p.navn, rolle: p.rolle, bilId: p.bil_id, butikId: p.butik_id };
    setProfil(normaliseret);
    if (normaliseret.butikId) {
      setSide((SIDER_FOR_ROLLE[normaliseret.rolle] || ["salg"])[0]);
      if (normaliseret.rolle === "montor") setValgtMontorId(normaliseret.id);
      await hent(normaliseret.butikId);
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
        setSager([]); setBiler([]); setVaretyper([]); setBrugere([]); setFerier([]);
        setSelectedId(null);
      }
    });

    return () => lytter.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const opdater = async () => { setRefreshing(true); if (profil?.butikId) await hent(profil.butikId); setRefreshing(false); };

  const gemSager = (next) => { setSager(next); if (profil?.butikId) gemSagerSky(profil.butikId, next); };
  const gemVaretyper = (next) => { setVaretyper(next); if (profil?.butikId) gemVaretyperSky(profil.butikId, next); };
  const gemBiler = (next) => { setBiler(next); if (profil?.butikId) gemBilerSky(profil.butikId, next); };

  const addBil = (navn, nummerplade) => gemBiler([...biler, { id: uid(), navn, nummerplade, lukket: false, lukketAarsag: "" }]);
  const updateBil = (id, felter) => gemBiler(biler.map((b) => (b.id === id ? { ...b, ...felter } : b)));
  const toggleBilLukket = (id, aarsag) => gemBiler(biler.map((b) => (b.id === id ? { ...b, lukket: !b.lukket, lukketAarsag: !b.lukket ? (aarsag || "Værksted") : "" } : b)));
  const deleteBil = (id) => {
    if (montorer.some((m) => m.bilId === id) && !window.confirm("Denne bil er tildelt en montør. Slet alligevel?")) return;
    gemBiler(biler.filter((x) => x.id !== id));
  };

  // Skifter hvilken bil en montør (bruger med rolle "montor") er tilknyttet.
  // Ferier flytter automatisk med, fordi blokeringen beregnes ud fra denne
  // tilknytning i stedet for at blive gemt fast på selve bilen.
  const updateMontorBil = (montorId, bilId) => updateBruger(montorId, { bilId: bilId || null });

  const logUd = async () => { await supabase.auth.signOut(); };

  const selected = sager.find((s) => s.id === selectedId);

  const addSag = ({ kunde, koeber, noegle, dato, tidsrumId, start, slut, montorId, varelinjer }) => {
    gemSager([
      ...sager,
      { id: uid(), nr: `24-${120 + sager.length + 1}`, kunde, koeber: koeber || null, noegle: noegle || {}, dato: dato || todayISO(), tidsrumId, start, slut, montorId, status: "planlagt", plukket: false, varelinjer, noter: [], billeder: [], rapporter: [], stemplerInd: null, logs: [] },
    ]);
  };

  const importSager = (nySager) => gemSager([...sager, ...nySager]);

  // Brugere oprettes rigtigt (Supabase Auth) via en edge function, som selv
  // tjekker at kalderen er admin - se supabase/functions/admin-opret-bruger.
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

  const addVaretype = (navn) => gemVaretyper([...varetyper, { id: uid(), navn, grundMinutter: 30, ydelser: [] }]);
  const updateVaretype = (ny) => gemVaretyper(varetyper.map((v) => (v.id === ny.id ? ny : v)));
  const deleteVaretype = (id) => {
    if (!window.confirm("Slet denne varetype? Allerede bookede sager beholder deres tjekliste uændret.")) return;
    gemVaretyper(varetyper.filter((v) => v.id !== id));
  };

  const assignMontor = (sagId, montorId) => gemSager(sager.map((s) => (s.id === sagId ? { ...s, montorId } : s)));
  const updateTidsrum = (sagId, tidsrumId) => {
    gemSager(sager.map((s) => (s.id === sagId ? { ...s, tidsrumId } : s)));
  };
  const togglePluk = (sagId) => gemSager(sager.map((s) => (s.id === sagId ? { ...s, plukket: !s.plukket } : s)));

  const cycleStatus = (id) => {
    const order = ["planlagt", "igang", "afsluttet"];
    gemSager(sager.map((s) => (s.id === id ? { ...s, status: order[(order.indexOf(s.status) + 1) % order.length] } : s)));
  };

  const addNote = (id, tekst) => gemSager(sager.map((s) => (s.id === id ? { ...s, noter: [...s.noter, { id: uid(), tekst, tid: new Date().toLocaleString("da-DK") }] } : s)));
  const addPhoto = (id, { src, navn }) => gemSager(sager.map((s) => (s.id === id ? { ...s, billeder: [...s.billeder, { id: uid(), src, navn }] } : s)));
  const addReport = (id, titel, tekst) => gemSager(sager.map((s) => (s.id === id ? { ...s, rapporter: [...s.rapporter, { id: uid(), titel, tekst, tid: new Date().toLocaleString("da-DK") }] } : s)));

  const stempleInd = (id) => gemSager(sager.map((s) => (s.id === id ? { ...s, stemplerInd: new Date().toISOString(), status: s.status === "planlagt" ? "igang" : s.status } : s)));
  const stempleUd = (id) => gemSager(sager.map((s) => {
    if (s.id !== id || !s.stemplerInd) return s;
    const ind = s.stemplerInd, ud = new Date().toISOString();
    const minutter = Math.max(1, Math.round((new Date(ud) - new Date(ind)) / 60000));
    return { ...s, stemplerInd: null, logs: [...s.logs, { id: uid(), ind, ud, minutter }] };
  }));

  const toggleYdelse = (sagId, linjeId, yId) => gemSager(sager.map((s) => (s.id === sagId ? { ...s, varelinjer: s.varelinjer.map((v) => (v.id === linjeId ? { ...v, ydelser: v.ydelser.map((y) => (y.id === yId ? { ...y, udfoert: !y.udfoert } : y)) } : v)) } : s)));
  const addYdelse = (sagId, linjeId, navn) => gemSager(sager.map((s) => (s.id === sagId ? { ...s, varelinjer: s.varelinjer.map((v) => (v.id === linjeId ? { ...v, ydelser: [...v.ydelser, { id: uid(), navn: navn.trim(), minutter: 15, udfoert: false }] } : v)) } : s)));
  const removeYdelse = (sagId, linjeId, yId) => gemSager(sager.map((s) => (s.id === sagId ? { ...s, varelinjer: s.varelinjer.map((v) => (v.id === linjeId ? { ...v, ydelser: v.ydelser.filter((y) => y.id !== yId) } : v)) } : s)));

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
          />
        ) : side === "salg" ? (
          <SalgSide sager={sager} montorer={montorer} varetyper={varetyper} valgtDato={valgtDato} onSkiftDato={setValgtDato} onOpen={setSelectedId} onAdd={addSag} onImport={importSager} />
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
        ) : (
          <AdminSide montorer={montorer} biler={biler} sager={sager} brugere={brugere} varetyper={varetyper} ferier={ferier} aktuelBrugerId={profil.id} onUpdateMontorBil={updateMontorBil} onAddBil={addBil} onUpdateBil={updateBil} onDeleteBil={deleteBil} onToggleBilLukket={toggleBilLukket} onAddBruger={addBruger} onUpdateBruger={updateBruger} onDeleteBruger={deleteBruger} onAddVaretype={addVaretype} onUpdateVaretype={updateVaretype} onDeleteVaretype={deleteVaretype} onTilfoejFerie={tilfoejFerie} onSletFerie={sletFerie} />
        )}
      </div>
    </div>
  );
}
