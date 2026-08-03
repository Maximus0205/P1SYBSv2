import React, { useState, useEffect } from "react";

import { storage } from "./lib/storage";
import {
  uid, todayISO,
  seedSager, seedMontorer, seedBrugere, DEFAULT_VARETYPER, DEFAULT_BILER,
  SIDER_FOR_ROLLE,
} from "./data/appData";

import { TopNav } from "./components/TopNav";
import { LoginSide } from "./components/LoginSide";
import { SagView } from "./components/SagView";

import { SalgSide } from "./pages/SalgSide";
import { KoerselSide } from "./pages/KoerselSide";
import { MontorVaelger, MontorRuteView } from "./pages/MontorSide";
import { LagerSide } from "./pages/LagerSide";
import { AdminSide } from "./pages/AdminSide";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sager, setSager] = useState([]);
  const [montorer, setMontorer] = useState([]);
  const [biler, setBiler] = useState([]);
  const [brugere, setBrugere] = useState([]);
  const [varetyper, setVaretyper] = useState([]);
  const [aktuelBruger, setAktuelBruger] = useState(null);
  const [side, setSide] = useState("salg");
  const [valgtDato, setValgtDato] = useState(todayISO());
  const [valgtMontorId, setValgtMontorId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const hent = async () => {
    let s = null, m = null, b = null, v = null, bl = null;
    try { const r = await storage.get("sager", true); if (r) s = JSON.parse(r.value); } catch (e) {}
    try { const r = await storage.get("montorer", true); if (r) m = JSON.parse(r.value); } catch (e) {}
    try { const r = await storage.get("brugere", true); if (r) b = JSON.parse(r.value); } catch (e) {}
    try { const r = await storage.get("varetyper", true); if (r) v = JSON.parse(r.value); } catch (e) {}
    try { const r = await storage.get("biler", true); if (r) bl = JSON.parse(r.value); } catch (e) {}
    if (!s) { s = seedSager; try { await storage.set("sager", JSON.stringify(s), true); } catch (e) {} }
    if (!m) { m = seedMontorer; try { await storage.set("montorer", JSON.stringify(m), true); } catch (e) {} }
    if (!b) { b = seedBrugere; try { await storage.set("brugere", JSON.stringify(b), true); } catch (e) {} }
    if (!v) { v = DEFAULT_VARETYPER; try { await storage.set("varetyper", JSON.stringify(v), true); } catch (e) {} }
    if (!bl) { bl = DEFAULT_BILER; try { await storage.set("biler", JSON.stringify(bl), true); } catch (e) {} }
    setSager(s); setMontorer(m); setBrugere(b); setVaretyper(v); setBiler(bl);
    return { s, m, b, v, bl };
  };

  useEffect(() => {
    (async () => {
      const { b } = await hent();
      try {
        const sess = await storage.get("session", false);
        if (sess) {
          const gemtId = JSON.parse(sess.value).brugerId;
          const match = (b || []).find((u) => u.id === gemtId);
          if (match) {
            setAktuelBruger(match);
            setSide((SIDER_FOR_ROLLE[match.rolle] || ["salg"])[0]);
            if (match.rolle === "montor") setValgtMontorId(match.montorId);
          }
        }
      } catch (e) {}
      setLoading(false);
    })();
  }, []);

  const opdater = async () => { setRefreshing(true); await hent(); setRefreshing(false); };

  const gemSager = async (next) => { setSager(next); try { await storage.set("sager", JSON.stringify(next), true); } catch (e) {} };
  const gemMontorer = async (next) => { setMontorer(next); try { await storage.set("montorer", JSON.stringify(next), true); } catch (e) {} };
  const gemBrugere = async (next) => { setBrugere(next); try { await storage.set("brugere", JSON.stringify(next), true); } catch (e) {} };
  const gemVaretyper = async (next) => { setVaretyper(next); try { await storage.set("varetyper", JSON.stringify(next), true); } catch (e) {} };
  const gemBiler = async (next) => { setBiler(next); try { await storage.set("biler", JSON.stringify(next), true); } catch (e) {} };

  const addBil = (navn) => gemBiler([...biler, { id: uid(), navn, lukket: false }]);
  const updateBil = (id, navn) => {
    const gammel = biler.find((b) => b.id === id);
    gemBiler(biler.map((b) => (b.id === id ? { ...b, navn } : b)));
    if (gammel && gammel.navn !== navn) gemMontorer(montorer.map((m) => (m.bil === gammel.navn ? { ...m, bil: navn } : m)));
  };
  const toggleBilLukket = (id) => gemBiler(biler.map((b) => (b.id === id ? { ...b, lukket: !b.lukket } : b)));
  const deleteBil = (id) => {
    const b = biler.find((x) => x.id === id);
    if (b && montorer.some((m) => m.bil === b.navn) && !window.confirm("Denne bil er tildelt en montÃ¸r. Slet alligevel?")) return;
    gemBiler(biler.filter((x) => x.id !== id));
  };

  const logInd = async (bruger) => {
    setAktuelBruger(bruger);
    setSide((SIDER_FOR_ROLLE[bruger.rolle] || ["salg"])[0]);
    if (bruger.rolle === "montor") setValgtMontorId(bruger.montorId);
    try { await storage.set("session", JSON.stringify({ brugerId: bruger.id }), false); } catch (e) {}
  };
  const logUd = async () => {
    setAktuelBruger(null);
    setSelectedId(null);
    try { await storage.set("session", JSON.stringify({}), false); } catch (e) {}
  };

  const selected = sager.find((s) => s.id === selectedId);

  const addSag = ({ kunde, koeber, noegle, dato, tidsrumId, start, slut, montorId, varelinjer }) => {
    gemSager([
      ...sager,
      { id: uid(), nr: `24-${120 + sager.length + 1}`, kunde, koeber: koeber || null, noegle: noegle || {}, dato: dato || todayISO(), tidsrumId, start, slut, montorId, status: "planlagt", plukket: false, varelinjer, noter: [], billeder: [], rapporter: [], stemplerInd: null, logs: [] },
    ]);
  };

  const importSager = (nySager) => gemSager([...sager, ...nySager]);

  const addMontor = ({ navn, bil }) => gemMontorer([...montorer, { id: uid(), navn, bil }]);
  const updateMontor = (id, felter) => gemMontorer(montorer.map((m) => (m.id === id ? { ...m, ...felter } : m)));
  const deleteMontor = (id, antalSager) => {
    if (antalSager > 0 && !window.confirm(`${antalSager} sag(er) er tildelt denne montÃ¸r. De bliver sat til "ikke tildelt". Slet alligevel?`)) return;
    gemMontorer(montorer.filter((m) => m.id !== id));
    gemSager(sager.map((s) => (s.montorId === id ? { ...s, montorId: null } : s)));
    if (valgtMontorId === id) setValgtMontorId(null);
  };

  const addBruger = (b) => gemBrugere([...brugere, { id: uid(), ...b }]);
  const deleteBruger = (id) => gemBrugere(brugere.filter((b) => b.id !== id));

  const addVaretype = (navn) => gemVaretyper([...varetyper, { id: uid(), navn, grundMinutter: 30, ydelser: [] }]);
  const updateVaretype = (ny) => gemVaretyper(varetyper.map((v) => (v.id === ny.id ? ny : v)));
  const deleteVaretype = (id) => {
    if (!window.confirm("Slet denne varetype? Allerede bookede sager beholder deres tjekliste uÃ¦ndret.")) return;
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
    return <div className="min-h-screen w-full flex items-center justify-center" style={{ background: "#F3EFE6" }}><p className="text-sm text-[#52697E]">IndlÃ¦ser...</p></div>;
  }

  if (!aktuelBruger) {
    return <LoginSide brugere={brugere} onLogin={logInd} />;
  }

  return (
    <div className="min-h-screen w-full" style={{ background: "#F3EFE6", fontFamily: "Inter, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        .font-mono { font-family: 'JetBrains Mono', monospace; }
      `}</style>

      <TopNav side={side} onSkift={(k) => { setSide(k); setSelectedId(null); }} bruger={aktuelBruger} onLogUd={logUd} />

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
        ) : side === "koersel" ? (
          <KoerselSide sager={sager} montorer={montorer} biler={biler} valgtDato={valgtDato} onSkiftDato={setValgtDato} onOpen={setSelectedId} onCycleStatus={cycleStatus} onAssign={assignMontor} onUpdateTidsrum={updateTidsrum} onUpdateMontor={updateMontor} onRefresh={opdater} refreshing={refreshing} />
        ) : side === "montor" ? (
          aktuelBruger.rolle === "montor" ? (
            montor ? <MontorRuteView sager={sager} montor={montor} valgtDato={valgtDato} onSkiftDato={setValgtDato} onOpen={setSelectedId} onCycleStatus={cycleStatus} onRefresh={opdater} refreshing={refreshing} /> : <p className="text-sm text-[#52697E]">Din bruger er ikke koblet til en montÃ¸r/bil-profil endnu â kontakt en administrator.</p>
          ) : montor ? (
            <MontorRuteView sager={sager} montor={montor} valgtDato={valgtDato} onSkiftDato={setValgtDato} onOpen={setSelectedId} onCycleStatus={cycleStatus} onSkift={() => setValgtMontorId(null)} onRefresh={opdater} refreshing={refreshing} />
          ) : (
            <MontorVaelger montorer={montorer} onVaelg={setValgtMontorId} />
          )
        ) : side === "lager" ? (
          <LagerSide sager={sager} montorer={montorer} valgtDato={valgtDato} onSkiftDato={setValgtDato} onTogglePluk={togglePluk} onOpen={setSelectedId} />
        ) : (
          <AdminSide montorer={montorer} biler={biler} sager={sager} brugere={brugere} varetyper={varetyper} aktuelBrugerId={aktuelBruger.id} onAddMontor={addMontor} onUpdateMontor={updateMontor} onDeleteMontor={deleteMontor} onAddBil={addBil} onUpdateBil={updateBil} onDeleteBil={deleteBil} onToggleBilLukket={toggleBilLukket} onAddBruger={addBruger} onDeleteBruger={deleteBruger} onAddVaretype={addVaretype} onUpdateVaretype={updateVaretype} onDeleteVaretype={deleteVaretype} />
        )}
      </div>
    </div>
  );
}
