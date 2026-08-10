import React, { useState } from "react";
import { Trash2, X, Plus, Pencil, UserPlus, PalmtreeIcon, CalendarOff, KeyRound } from "lucide-react";
import { vehicleLabel as bilLabel, technicianColor as montorFarve, todayISO } from "../data/domain";
import { suggestUsername as foreslaaBrugernavn, isValidUsername as erGyldigtBrugernavn } from "../lib/username";

// En "montør" er en bruger med rolle montor — man opretter dem ikke separat
// (det sker under fanen Brugere). Her kan man kun styre hvilken bil montøren
// kører i lige nu, og registrere ferieperioder for vedkommende.
function MontorRaekke({ m, biler, ferier, onUpdateBil, onTilfoejFerie, onSletFerie }) {
  const [visFerie, setVisFerie] = useState(false);
  const [ferieStart, setFerieStart] = useState(todayISO());
  const [ferieSlut, setFerieSlut] = useState(todayISO());
  const [ferieNote, setFerieNote] = useState("");
  const tilknyttetBil = biler.find((b) => b.id === m.bilId);
  const mineFerier = ferier.filter((f) => f.montorId === m.id).sort((a, b) => a.startDato.localeCompare(b.startDato));

  const opretFerie = () => {
    if (!ferieStart || !ferieSlut || ferieSlut < ferieStart) return;
    onTilfoejFerie({ montorId: m.id, startDato: ferieStart, slutDato: ferieSlut, note: ferieNote.trim() });
    setFerieNote("");
  };

  return (
    <div className="bg-white border border-[#D8D0BE]">
      <div className="p-3 flex items-center gap-3 flex-wrap">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: montorFarve(m.id, [m]) }} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-[#1C232E] truncate">{m.navn}</p>
          <p className="text-xs text-[#52697E] truncate">{tilknyttetBil ? bilLabel(tilknyttetBil) : "Ingen bil tilknyttet"}</p>
        </div>
        <select
          value={m.bilId || ""}
          onChange={(e) => onUpdateBil(m.id, e.target.value || null)}
          className="border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1.5 text-xs text-[#1C232E] focus:outline-none focus:border-[#E2621B]"
        >
          <option value="">Ingen bil</option>
          {biler.map((b) => (
            <option key={b.id} value={b.id} disabled={b.lukket && b.id !== m.bilId}>
              {bilLabel(b)}{b.lukket ? " (lukket)" : ""}
            </option>
          ))}
        </select>
        <button onClick={() => setVisFerie((v) => !v)} className="p-1.5 text-[#52697E] hover:text-[#E2621B] flex items-center gap-1 text-xs font-semibold uppercase tracking-wide" title="Ferie">
          <PalmtreeIcon size={15} /> Ferie{mineFerier.length > 0 ? ` (${mineFerier.length})` : ""}
        </button>
      </div>

      {visFerie && (
        <div className="border-t border-[#F0EBDD] p-3 bg-[#FCFAF4]">
          <div className="flex gap-2 flex-wrap items-end mb-3">
            <label className="text-[11px] text-[#52697E]">Fra
              <input type="date" value={ferieStart} onChange={(e) => setFerieStart(e.target.value)} className="block border border-[#D8D0BE] bg-white px-2 py-1 text-xs text-[#1C232E] mt-0.5" />
            </label>
            <label className="text-[11px] text-[#52697E]">Til
              <input type="date" value={ferieSlut} onChange={(e) => setFerieSlut(e.target.value)} className="block border border-[#D8D0BE] bg-white px-2 py-1 text-xs text-[#1C232E] mt-0.5" />
            </label>
            <input value={ferieNote} onChange={(e) => setFerieNote(e.target.value)} placeholder="Note (valgfri)" className="flex-1 min-w-[120px] border border-[#D8D0BE] bg-white px-2 py-1.5 text-xs text-[#1C232E]" />
            <button onClick={opretFerie} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors flex items-center gap-1"><Plus size={13} /> Tilføj</button>
          </div>
          {mineFerier.length === 0 ? (
            <p className="text-xs text-[#52697E] italic">Ingen ferieperioder registreret.</p>
          ) : (
            <div className="space-y-1.5">
              {mineFerier.map((f) => (
                <div key={f.id} className="flex items-center gap-2 text-xs bg-white border border-[#D8D0BE] px-2 py-1.5">
                  <CalendarOff size={12} className="text-[#E2621B] shrink-0" />
                  <span className="text-[#1C232E]">{f.startDato} – {f.slutDato}</span>
                  {f.note && <span className="text-[#52697E] truncate flex-1">{f.note}</span>}
                  <button onClick={() => onSletFerie(f.id)} className="ml-auto text-[#52697E] hover:text-[#B3261E]"><X size={13} /></button>
                </div>
              ))}
            </div>
          )}
          {tilknyttetBil && <p className="text-[10px] text-[#52697E] mt-2">Bilen ({bilLabel(tilknyttetBil)}) vises automatisk som blokeret i kørselsoverblikket i disse perioder — flytter montøren til en anden bil, følger blokeringen med.</p>}
        </div>
      )}
    </div>
  );
}

function BilRaekke({ b, brugtAf, onUpdate, onDelete, onToggleLukket }) {
  const [redigerer, setRedigerer] = useState(false);
  const [navn, setNavn] = useState(b.navn);
  const [nummerplade, setNummerplade] = useState(b.nummerplade);
  const [visLukAarsag, setVisLukAarsag] = useState(false);
  const [aarsag, setAarsag] = useState("Værksted");

  if (redigerer) {
    return (
      <div className="bg-white border border-[#D8D0BE] p-2.5 flex items-center gap-2 flex-wrap">
        <input autoFocus value={navn} onChange={(e) => setNavn(e.target.value)} placeholder="Navn/tag, fx 'Bil 1'" className="flex-1 min-w-[120px] border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        <input value={nummerplade} onChange={(e) => setNummerplade(e.target.value)} placeholder="Nummerplade" className="flex-1 min-w-[120px] border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        <button onClick={() => { onUpdate({ navn: navn.trim() || b.navn, nummerplade: nummerplade.trim() || b.nummerplade }); setRedigerer(false); }} className="text-xs text-[#3D7A5C] font-semibold uppercase">Gem</button>
        <button onClick={() => { setNavn(b.navn); setNummerplade(b.nummerplade); setRedigerer(false); }} className="text-xs text-[#52697E] font-semibold uppercase">Fortryd</button>
      </div>
    );
  }
  return (
    <div className={`bg-white border p-2.5 flex items-center gap-2 flex-wrap ${b.lukket ? "border-[#E2621B] opacity-70" : "border-[#D8D0BE]"}`}>
      <p className="text-sm text-[#1C232E] flex-1 truncate min-w-[80px]">{bilLabel(b)}</p>
      {b.lukket && <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 border border-[#E2621B] text-[#E2621B] shrink-0">Lukket{b.lukketAarsag ? ` · ${b.lukketAarsag}` : ""}</span>}
      {brugtAf && <span className="text-[10px] text-[#52697E] shrink-0">kører af {brugtAf}</span>}
      {visLukAarsag ? (
        <div className="flex items-center gap-1 shrink-0">
          <input autoFocus value={aarsag} onChange={(e) => setAarsag(e.target.value)} placeholder="Årsag (fx værksted)" className="w-32 border border-[#D8D0BE] bg-[#F3EFE6] px-1.5 py-1 text-[10px] text-[#1C232E]" />
          <button onClick={() => { onToggleLukket(b.id, aarsag.trim() || "Værksted"); setVisLukAarsag(false); }} className="text-[10px] font-semibold uppercase text-white bg-[#E2621B] px-2 py-1">Luk</button>
          <button onClick={() => setVisLukAarsag(false)} className="text-[10px] text-[#52697E]">Fortryd</button>
        </div>
      ) : (
        <button onClick={() => (b.lukket ? onToggleLukket(b.id) : setVisLukAarsag(true))} className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-1 border shrink-0 ${b.lukket ? "border-[#3D7A5C] text-[#3D7A5C] hover:bg-[#3D7A5C] hover:text-white" : "border-[#E2621B] text-[#E2621B] hover:bg-[#E2621B] hover:text-white"} transition-colors`}>
          {b.lukket ? "Åbn igen" : "Blokér (fx værksted)"}
        </button>
      )}
      <button onClick={() => setRedigerer(true)} className="p-1 text-[#52697E] hover:text-[#E2621B] shrink-0" title="Ret navn/nummerplade"><Pencil size={13} /></button>
      <button onClick={onDelete} className="p-1 text-[#52697E] hover:text-[#B3261E] shrink-0" title="Slet"><Trash2 size={13} /></button>
    </div>
  );
}

function BrugerRaekke({ b, tilknyttetBil, aktuelBrugerId, onUpdate, onDelete, onNulstilAdgangskode }) {
  const [redigerer, setRedigerer] = useState(false);
  const [navn, setNavn] = useState(b.navn);
  const [visNulstil, setVisNulstil] = useState(false);
  const [nyKode, setNyKode] = useState("");
  const [nulstilBesked, setNulstilBesked] = useState("");
  const [travl, setTravl] = useState(false);

  const nulstil = async () => {
    if (nyKode.length < 6) { setNulstilBesked("Mindst 6 tegn."); return; }
    setTravl(true);
    const resultat = await onNulstilAdgangskode(b.id, nyKode);
    setTravl(false);
    if (!resultat?.ok) { setNulstilBesked(resultat?.fejl || "Kunne ikke nulstille."); return; }
    setNulstilBesked("Adgangskode nulstillet.");
    setNyKode("");
    setTimeout(() => { setVisNulstil(false); setNulstilBesked(""); }, 1500);
  };

  return (
    <div className="bg-white border border-[#D8D0BE] p-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          {redigerer ? (
            <div className="flex items-center gap-1.5">
              <input autoFocus value={navn} onChange={(e) => setNavn(e.target.value)} className="border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
              <button onClick={() => { onUpdate(b.id, { navn: navn.trim() || b.navn }); setRedigerer(false); }} className="text-xs text-[#3D7A5C] font-semibold uppercase">Gem</button>
              <button onClick={() => { setNavn(b.navn); setRedigerer(false); }} className="text-xs text-[#52697E] font-semibold uppercase">Fortryd</button>
            </div>
          ) : (
            <p className="font-semibold text-sm text-[#1C232E] truncate">{b.navn}</p>
          )}
          <p className="text-xs text-[#52697E] truncate">
            {ROLLE_LABEL[b.rolle] || b.rolle}
            {b.brugernavn && <span> · logger ind som "{b.brugernavn}"</span>}
            {b.rolle === "montor" ? ` · ${tilknyttetBil ? bilLabel(tilknyttetBil) : "ingen bil endnu"}` : ""}
          </p>
        </div>
        <select value={b.rolle} onChange={(e) => onUpdate(b.id, { rolle: e.target.value })} className="border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1.5 text-xs text-[#1C232E]">
          {Object.entries(ROLLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {!redigerer && <button onClick={() => { setNavn(b.navn); setRedigerer(true); }} className="p-1.5 text-[#52697E] hover:text-[#E2621B]" title="Ret navn"><Pencil size={15} /></button>}
        {onNulstilAdgangskode && <button onClick={() => setVisNulstil((v) => !v)} className="p-1.5 text-[#52697E] hover:text-[#E2621B]" title="Nulstil adgangskode"><KeyRound size={15} /></button>}
        {b.id !== aktuelBrugerId && <button onClick={() => onDelete(b.id)} className="p-1.5 text-[#52697E] hover:text-[#B3261E]" title="Fjern adgang"><Trash2 size={15} /></button>}
      </div>
      {visNulstil && (
        <div className="mt-2.5 pt-2.5 border-t border-[#F0EBDD] flex items-center gap-2 flex-wrap">
          <input
            type="password"
            value={nyKode}
            onChange={(e) => setNyKode(e.target.value)}
            placeholder="Ny adgangskode (mindst 6 tegn)"
            className="flex-1 min-w-[160px] border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1.5 text-xs text-[#1C232E] focus:outline-none focus:border-[#E2621B]"
          />
          <button onClick={nulstil} disabled={travl} className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors disabled:opacity-60">
            {travl ? "..." : "Sæt ny adgangskode"}
          </button>
          {nulstilBesked && <span className={`text-[11px] ${nulstilBesked.includes("nulstillet") ? "text-[#3D7A5C]" : "text-[#B3261E]"}`}>{nulstilBesked}</span>}
        </div>
      )}
    </div>
  );
}

function NyBrugerForm({ onAdd }) {
  const [loginType, setLoginType] = useState("brugernavn");
  const [navn, setNavn] = useState("");
  const [brugernavn, setBrugernavn] = useState("");
  const [brugernavnRedigeret, setBrugernavnRedigeret] = useState(false);
  const [email, setEmail] = useState("");
  const [adgangskode, setAdgangskode] = useState("");
  const [rolle, setRolle] = useState("saelger");
  const [fejl, setFejl] = useState("");
  const [travl, setTravl] = useState(false);

  const skiftNavn = (val) => {
    setNavn(val);
    if (!brugernavnRedigeret) setBrugernavn(foreslaaBrugernavn(val));
  };

  const opret = async () => {
    setFejl("");
    if (!navn.trim() || !adgangskode.trim()) { setFejl("Udfyld navn og adgangskode."); return; }
    if (loginType === "brugernavn" && !erGyldigtBrugernavn(brugernavn)) { setFejl("Brugernavn skal være 2-40 tegn (a-z, tal, punktum eller bindestreg)."); return; }
    if (loginType === "email" && !email.trim()) { setFejl("Udfyld e-mail."); return; }
    setTravl(true);
    const resultat = await onAdd({ navn: navn.trim(), loginType, email: email.trim(), brugernavn: brugernavn.trim().toLowerCase(), adgangskode, rolle });
    setTravl(false);
    if (!resultat.ok) { setFejl(resultat.fejl || "Kunne ikke oprette brugeren."); return; }
    setNavn(""); setBrugernavn(""); setBrugernavnRedigeret(false); setEmail(""); setAdgangskode(""); setRolle("saelger");
  };

  return (
    <div className="border border-[#D8D0BE] bg-white p-5 mb-6">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Opret ny bruger</h3>
      <div className="flex border border-[#D8D0BE] mb-3 text-xs font-semibold uppercase tracking-wide w-fit">
        <button onClick={() => setLoginType("brugernavn")} className={`px-3 py-1.5 transition-colors ${loginType === "brugernavn" ? "bg-[#1C232E] text-white" : "text-[#52697E] hover:text-[#1C232E]"}`}>Brugernavn</button>
        <button onClick={() => setLoginType("email")} className={`px-3 py-1.5 transition-colors ${loginType === "email" ? "bg-[#1C232E] text-white" : "text-[#52697E] hover:text-[#1C232E]"}`}>E-mail</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input value={navn} onChange={(e) => skiftNavn(e.target.value)} placeholder="Navn" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        {loginType === "brugernavn" ? (
          <input value={brugernavn} onChange={(e) => { setBrugernavn(e.target.value); setBrugernavnRedigeret(true); }} placeholder="Brugernavn (foreslået, kan rettes)" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] font-mono focus:outline-none focus:border-[#E2621B]" />
        ) : (
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="E-mail" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        )}
        <input value={adgangskode} onChange={(e) => setAdgangskode(e.target.value)} type="password" placeholder="Adgangskode (mindst 6 tegn)" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        <select value={rolle} onChange={(e) => setRolle(e.target.value)} className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]">
          <option value="saelger">Sælger (Salg, Planlægning, Kørsel, Montør, Lager)</option>
          <option value="montor">Montør (kun sin egen rute)</option>
          <option value="admin">Administrator (alt, inkl. Opsætning)</option>
        </select>
      </div>
      {rolle === "montor" && <p className="text-[11px] text-[#52697E] mt-2">Bil tilknyttes bagefter under fanen "Montører".</p>}
      {fejl && <p className="text-xs text-[#B3261E] mt-2">{fejl}</p>}
      <button onClick={opret} disabled={travl} className="mt-3 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors flex items-center gap-1.5 disabled:opacity-60">
        <UserPlus size={15} /> {travl ? "Opretter..." : "Opret bruger"}
      </button>
    </div>
  );
}

const ROLLE_LABEL = { admin: "Administrator", saelger: "Sælger", montor: "Montør" };

// ---------- Varekategorier ----------

function VarekategoriAdmin({ varekategorier, onAdd, onUpdate, onDelete }) {
  const [nytNavn, setNytNavn] = useState("");
  return (
    <div>
      <div className="border border-[#D8D0BE] bg-white p-5 mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Opret ny varekategori</h3>
        <div className="flex gap-2">
          <input value={nytNavn} onChange={(e) => setNytNavn(e.target.value)} placeholder="Fx 'Hvidevare'" className="flex-1 border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <button onClick={() => { if (!nytNavn.trim()) return; onAdd(nytNavn.trim()); setNytNavn(""); }} className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors flex items-center gap-1.5"><Plus size={15} /> Opret</button>
        </div>
      </div>
      <div className="space-y-2">
        {varekategorier.map((k) => <RedigerbarNavnRaekke key={k.id} item={k} onUpdate={(navn) => onUpdate(k.id, navn)} onDelete={() => onDelete(k.id)} />)}
      </div>
    </div>
  );
}

function RedigerbarNavnRaekke({ item, onUpdate, onDelete, ekstra, ekstraIndhold }) {
  const [redigerer, setRedigerer] = useState(false);
  const [navn, setNavn] = useState(item.navn);
  return (
    <div className="bg-white border border-[#D8D0BE] p-3">
      <div className="flex items-center gap-2 flex-wrap">
        {redigerer ? (
          <>
            <input autoFocus value={navn} onChange={(e) => setNavn(e.target.value)} className="flex-1 min-w-[140px] border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
            <button onClick={() => { onUpdate(navn.trim() || item.navn); setRedigerer(false); }} className="text-xs text-[#3D7A5C] font-semibold uppercase">Gem</button>
            <button onClick={() => { setNavn(item.navn); setRedigerer(false); }} className="text-xs text-[#52697E] font-semibold uppercase">Fortryd</button>
          </>
        ) : (
          <>
            <p className="font-semibold text-sm text-[#1C232E] flex-1">{item.navn}</p>
            {ekstra}
            <button onClick={() => setRedigerer(true)} className="p-1.5 text-[#52697E] hover:text-[#E2621B]"><Pencil size={14} /></button>
            <button onClick={onDelete} className="p-1.5 text-[#52697E] hover:text-[#B3261E]"><Trash2 size={14} /></button>
          </>
        )}
      </div>
      {ekstraIndhold}
    </div>
  );
}

// ---------- Varetyper ----------

function VaretypeRaekke({ v, varekategorier, onUpdate, onDelete }) {
  const [redigererNavn, setRedigererNavn] = useState(false);
  const [navn, setNavn] = useState(v.navn);

  return (
    <div className="border border-[#D8D0BE] bg-white p-3 flex items-center gap-2 flex-wrap">
      {redigererNavn ? (
        <div className="flex items-center gap-2 flex-1 min-w-[160px]">
          <input autoFocus value={navn} onChange={(e) => setNavn(e.target.value)} className="flex-1 border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <button onClick={() => { onUpdate(v.id, { navn: navn.trim() || v.navn }); setRedigererNavn(false); }} className="text-xs text-[#3D7A5C] font-semibold uppercase">Gem</button>
          <button onClick={() => { setNavn(v.navn); setRedigererNavn(false); }} className="text-xs text-[#52697E] font-semibold uppercase">Fortryd</button>
        </div>
      ) : (
        <p className="font-semibold text-sm text-[#1C232E] flex-1">{v.navn}</p>
      )}
      <select value={v.kategoriId || ""} onChange={(e) => onUpdate(v.id, { kategoriId: e.target.value || null })} className="border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1.5 text-xs text-[#1C232E] shrink-0">
        <option value="">Ingen kategori</option>
        {varekategorier.map((k) => <option key={k.id} value={k.id}>{k.navn}</option>)}
      </select>
      {!redigererNavn && <button onClick={() => setRedigererNavn(true)} className="p-1.5 text-[#52697E] hover:text-[#E2621B] shrink-0"><Pencil size={14} /></button>}
      <button onClick={() => onDelete(v.id)} className="p-1.5 text-[#52697E] hover:text-[#B3261E] shrink-0"><Trash2 size={14} /></button>
    </div>
  );
}

function VaretypeAdmin({ varetyper, varekategorier, onAdd, onUpdate, onDelete }) {
  const [nytNavn, setNytNavn] = useState("");
  const [nyKategoriId, setNyKategoriId] = useState("");
  return (
    <div>
      <div className="border border-[#D8D0BE] bg-white p-5 mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Opret ny varetype</h3>
        <div className="flex gap-2 flex-wrap">
          <input value={nytNavn} onChange={(e) => setNytNavn(e.target.value)} placeholder="Fx 'Kaffemaskine'" className="flex-1 min-w-[160px] border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <select value={nyKategoriId} onChange={(e) => setNyKategoriId(e.target.value)} className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E]">
            <option value="">Ingen kategori</option>
            {varekategorier.map((k) => <option key={k.id} value={k.id}>{k.navn}</option>)}
          </select>
          <button onClick={() => { if (!nytNavn.trim()) return; onAdd(nytNavn.trim(), nyKategoriId || null); setNytNavn(""); setNyKategoriId(""); }} className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors flex items-center gap-1.5"><Plus size={15} /> Opret</button>
        </div>
      </div>
      <p className="text-[11px] text-[#52697E] mb-2">Hvilke tillægsydelser der er relevante for en varetype styres under fanen "Tillægsydelser" - vælg der hvilke varetyper hver tillægsydelse gælder for.</p>
      <div className="grid sm:grid-cols-2 gap-2">
        {varetyper.map((v) => (
          <VaretypeRaekke key={v.id} v={v} varekategorier={varekategorier} onUpdate={onUpdate} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

// ---------- Primære ydelser ----------
// Bevidst uden tidsestimat her - tidsforbrug tastes udelukkende manuelt for
// den enkelte booking i sælgerens flow (se SagFormFields.jsx), da det varierer
// for meget fra opgave til opgave til at et fast tal pr. ydelsestype giver
// mening. Det ændrer sig når der er nok historik til automatiske estimater.

function PrimaerydelseRaekke({ p, onUpdate, onDelete }) {
  const [redigererNavn, setRedigererNavn] = useState(false);
  const [navn, setNavn] = useState(p.navn);
  return (
    <div className="border border-[#D8D0BE] bg-white p-3 flex items-center gap-2 flex-wrap">
      {redigererNavn ? (
        <div className="flex items-center gap-2 flex-1 min-w-[160px]">
          <input autoFocus value={navn} onChange={(e) => setNavn(e.target.value)} className="flex-1 border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <button onClick={() => { onUpdate(p.id, { navn: navn.trim() || p.navn }); setRedigererNavn(false); }} className="text-xs text-[#3D7A5C] font-semibold uppercase">Gem</button>
          <button onClick={() => { setNavn(p.navn); setRedigererNavn(false); }} className="text-xs text-[#52697E] font-semibold uppercase">Fortryd</button>
        </div>
      ) : (
        <p className="font-semibold text-sm text-[#1C232E] flex-1">{p.navn}</p>
      )}
      {!redigererNavn && <button onClick={() => setRedigererNavn(true)} className="p-1.5 text-[#52697E] hover:text-[#E2621B] shrink-0"><Pencil size={14} /></button>}
      <button onClick={() => onDelete(p.id)} className="p-1.5 text-[#52697E] hover:text-[#B3261E] shrink-0"><Trash2 size={14} /></button>
    </div>
  );
}

function PrimaerydelseAdmin({ primaerydelser, onAdd, onUpdate, onDelete }) {
  const [nytNavn, setNytNavn] = useState("");
  return (
    <div>
      <div className="border border-[#D8D0BE] bg-white p-5 mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Opret ny primær ydelse</h3>
        <div className="flex gap-2 flex-wrap">
          <input value={nytNavn} onChange={(e) => setNytNavn(e.target.value)} placeholder="Fx 'Montering'" className="flex-1 min-w-[160px] border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <button onClick={() => { if (!nytNavn.trim()) return; onAdd(nytNavn.trim()); setNytNavn(""); }} className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors flex items-center gap-1.5"><Plus size={15} /> Opret</button>
        </div>
      </div>
      <p className="text-[11px] text-[#52697E] mb-2">Hvilke tillægsydelser der er tilgængelige under en given primær ydelse styres under fanen "Tillægsydelser". Tidsforbrug sættes ikke her — det tastes manuelt af sælgeren for hver enkelt booking.</p>
      <div className="space-y-2">
        {primaerydelser.map((p) => (
          <PrimaerydelseRaekke key={p.id} p={p} onUpdate={onUpdate} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

// ---------- Tillægsydelser ----------
// Her styres relationerne ét sted: hvilke primære ydelser en tillægsydelse
// gælder under (påkrævet), og valgfrit hvilke specifikke varetyper den er
// begrænset til (tomt = gælder for alle varetyper). Heller ikke her sættes
// et tidsestimat - det tastes manuelt pr. booking, se note ovenfor.

function TillaegsydelseRaekke({ t, varetyper, primaerydelser, onUpdate, onDelete }) {
  const togglePrimaer = (pId) => {
    const har = (t.primaerYdelser || []).includes(pId);
    onUpdate(t.id, { primaerYdelser: har ? t.primaerYdelser.filter((x) => x !== pId) : [...(t.primaerYdelser || []), pId] });
  };
  const toggleVaretype = (vId) => {
    const har = (t.varetyper || []).includes(vId);
    onUpdate(t.id, { varetyper: har ? t.varetyper.filter((x) => x !== vId) : [...(t.varetyper || []), vId] });
  };
  const erUniversel = !t.varetyper || t.varetyper.length === 0;

  return (
    <RedigerbarNavnRaekke
      item={t}
      onUpdate={(navn) => onUpdate(t.id, { navn })}
      onDelete={() => onDelete(t.id)}
      ekstraIndhold={
        <div className="mt-3 pt-3 border-t border-[#F0EBDD] space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#52697E] mb-1.5">Vises kun ved disse primære ydelser (påkrævet)</p>
            <div className="flex flex-wrap gap-1.5">
              {primaerydelser.length === 0 ? (
                <p className="text-xs text-[#52697E] italic">Opret først en primær ydelse.</p>
              ) : (
                primaerydelser.map((p) => {
                  const valgt = (t.primaerYdelser || []).includes(p.id);
                  return (
                    <button key={p.id} onClick={() => togglePrimaer(p.id)} className={`text-xs px-2 py-1 border transition-colors ${valgt ? "border-[#3D7A5C] bg-[#3D7A5C10] text-[#3D7A5C]" : "border-[#D8D0BE] text-[#52697E] hover:border-[#E2621B] hover:text-[#E2621B]"}`}>
                      {p.navn}
                    </button>
                  );
                })
              )}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#52697E] mb-1.5">
              Begræns til bestemte varetyper <span className="normal-case text-[#52697E]/70">({erUniversel ? "gælder lige nu for alle varetyper" : "kun de markerede"})</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {varetyper.map((v) => {
                const valgt = (t.varetyper || []).includes(v.id);
                return (
                  <button key={v.id} onClick={() => toggleVaretype(v.id)} className={`text-xs px-2 py-1 border transition-colors ${valgt ? "border-[#E2621B] bg-[#E2621B10] text-[#E2621B]" : "border-[#D8D0BE] text-[#52697E] hover:border-[#E2621B] hover:text-[#E2621B]"}`}>
                    {v.navn}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      }
    />
  );
}

function TillaegsydelseAdmin({ tillaegsydelser, varetyper, primaerydelser, onAdd, onUpdate, onDelete }) {
  const [nytNavn, setNytNavn] = useState("");
  return (
    <div>
      <div className="border border-[#D8D0BE] bg-white p-5 mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Opret ny tillægsydelse</h3>
        <div className="flex gap-2 flex-wrap">
          <input value={nytNavn} onChange={(e) => setNytNavn(e.target.value)} placeholder="Fx 'Dørvending'" className="flex-1 min-w-[160px] border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <button onClick={() => { if (!nytNavn.trim()) return; onAdd(nytNavn.trim()); setNytNavn(""); }} className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors flex items-center gap-1.5"><Plus size={15} /> Opret</button>
        </div>
        <p className="text-[11px] text-[#52697E] mt-2">Efter oprettelse skal du sætte hvilke primære ydelser den gælder under (nedenfor på hver række) — ellers vises den aldrig i booking-flowet.</p>
      </div>
      <div className="space-y-2">
        {tillaegsydelser.map((t) => (
          <TillaegsydelseRaekke key={t.id} t={t} varetyper={varetyper} primaerydelser={primaerydelser} onUpdate={onUpdate} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

export { MontorRaekke, BilRaekke, BrugerRaekke, NyBrugerForm, ROLLE_LABEL, VarekategoriAdmin, VaretypeAdmin, PrimaerydelseAdmin, TillaegsydelseAdmin };
