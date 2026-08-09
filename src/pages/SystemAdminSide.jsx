import React, { useEffect, useState } from "react";
import { Building2, Loader2, AlertCircle, Check, Pencil, Users, Search } from "lucide-react";
import { hentAlleButikker, opretButikSystemadmin, opdaterButikSystemadmin, hentAlleBrugereSystemadmin, opdaterProfil } from "../lib/skyLager";
import { geokodAdresse } from "../lib/steder";
import { AdresseInput } from "../components/AdresseInput";

const ROLLE_LABEL = { admin: "Administrator", saelger: "Sælger", montor: "Montør" };

// Kun synlig for brugere med profiler.er_systemadmin = true. Bruges til at
// oprette/redigere butikker og koble brugere til dem, når systemet
// udbredes til flere i kæden - hver butik får sin egen adresse/koordinater,
// som resten af butikkens system (adresseforslag) tager udgangspunkt i.
function SystemAdminSide() {
  const [butikker, setButikker] = useState([]);
  const [indlaeser, setIndlaeser] = useState(true);
  const [redigererId, setRedigererId] = useState(null);

  const [butiksNavn, setButiksNavn] = useState("");
  const [butiksnummer, setButiksnummer] = useState("");
  const [adresse, setAdresse] = useState("");
  const [adresseStatus, setAdresseStatus] = useState("tom");
  const [adminNavn, setAdminNavn] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminAdgangskode, setAdminAdgangskode] = useState("");
  const [travl, setTravl] = useState(false);
  const [fejl, setFejl] = useState("");
  const [besked, setBesked] = useState("");

  const genindlaes = () => { setIndlaeser(true); hentAlleButikker().then((b) => { setButikker(b); setIndlaeser(false); }); };
  useEffect(() => { genindlaes(); }, []);

  const opret = async () => {
    setFejl(""); setBesked("");
    if (!butiksNavn.trim() || !adresse.trim() || !adminEmail.trim() || adminAdgangskode.length < 6) {
      setFejl("Udfyld butiksnavn, adresse, admin-e-mail og en adgangskode på mindst 6 tegn.");
      return;
    }
    if (butiksnummer.trim() && !/^\d{4}$/.test(butiksnummer.trim())) {
      setFejl("Butiksnummer skal være præcis 4 cifre.");
      return;
    }
    setTravl(true);
    const resultat = await opretButikSystemadmin({ butiksNavn: butiksNavn.trim(), adresse: adresse.trim(), butiksnummer: butiksnummer.trim() || null, adminNavn: adminNavn.trim(), adminEmail: adminEmail.trim(), adminAdgangskode });
    setTravl(false);
    if (!resultat.ok) { setFejl(resultat.fejl); return; }
    setBesked(`Butikken "${butiksNavn}" er oprettet, med ${adminEmail} som admin.`);
    setButiksNavn(""); setButiksnummer(""); setAdresse(""); setAdminNavn(""); setAdminEmail(""); setAdminAdgangskode("");
    genindlaes();
  };

  return (
    <div>
      <div className="border border-[#D8D0BE] bg-white p-5 mb-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-1 flex items-center gap-2"><Building2 size={16} /> Opret ny butik</h3>
        <p className="text-xs text-[#52697E] mb-3">Butikkens adresse geokodes automatisk - resten af butikkens system (adresseforslag ved booking) tager udgangspunkt i den, så en butik på Fyn ikke primært får forslag fra København.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={butiksNavn} onChange={(e) => setButiksNavn(e.target.value)} placeholder="Butiksnavn" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <input value={butiksnummer} onChange={(e) => setButiksnummer(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Butiksnummer (4 cifre, valgfrit)" inputMode="numeric" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] font-mono focus:outline-none focus:border-[#E2621B]" />
          <div className="sm:col-span-2">
            <AdresseInput value={adresse} onChange={setAdresse} placeholder="Butikkens adresse" onValideringChange={setAdresseStatus} />
          </div>
          <input value={adminNavn} onChange={(e) => setAdminNavn(e.target.value)} placeholder="Navn på butikkens første admin" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="Admin e-mail" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <input value={adminAdgangskode} onChange={(e) => setAdminAdgangskode(e.target.value)} placeholder="Admin adgangskode (mindst 6 tegn)" className="sm:col-span-2 border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        </div>
        {fejl && <p className="text-xs text-[#B3261E] mt-2 flex items-center gap-1.5"><AlertCircle size={13} /> {fejl}</p>}
        {besked && <p className="text-xs text-[#3D7A5C] mt-2 flex items-center gap-1.5"><Check size={13} /> {besked}</p>}
        <button onClick={opret} disabled={travl} className="mt-3 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors flex items-center gap-1.5 disabled:opacity-60">
          {travl && <Loader2 size={14} className="animate-spin" />} {travl ? "Opretter..." : "Opret butik"}
        </button>
      </div>

      <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Alle butikker ({butikker.length})</h3>
      {indlaeser ? (
        <p className="text-sm text-[#52697E]">Indlæser...</p>
      ) : (
        <div className="space-y-2 mb-8">
          {butikker.map((b) =>
            redigererId === b.id ? (
              <ButikRedigering key={b.id} butik={b} onFaerdig={() => { setRedigererId(null); genindlaes(); }} onAnnuller={() => setRedigererId(null)} />
            ) : (
              <div key={b.id} className="bg-white border border-[#D8D0BE] p-3 flex items-center gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-[#1C232E]">
                    {b.navn}
                    {b.butiksnummer && <span className="ml-2 font-mono text-xs text-[#52697E]">#{b.butiksnummer}</span>}
                  </p>
                  <p className="text-xs text-[#52697E] truncate">{b.adresse}</p>
                </div>
                <button onClick={() => setRedigererId(b.id)} className="p-1.5 text-[#52697E] hover:text-[#E2621B] shrink-0" title="Redigér"><Pencil size={15} /></button>
              </div>
            )
          )}
        </div>
      )}

      <BrugerKobling butikker={butikker} />
    </div>
  );
}

// Redigering af én eksisterende butik: navn, butiksnummer og adresse
// (geokoder på ny, hvis adressen ændres, så adresse-fokuspunktet forbliver
// korrekt).
function ButikRedigering({ butik, onFaerdig, onAnnuller }) {
  const [navn, setNavn] = useState(butik.navn);
  const [butiksnummer, setButiksnummer] = useState(butik.butiksnummer || "");
  const [adresse, setAdresse] = useState(butik.adresse || "");
  const [travl, setTravl] = useState(false);
  const [fejl, setFejl] = useState("");

  const gem = async () => {
    setFejl("");
    if (!navn.trim() || !adresse.trim()) { setFejl("Navn og adresse er påkrævet."); return; }
    if (butiksnummer.trim() && !/^\d{4}$/.test(butiksnummer.trim())) { setFejl("Butiksnummer skal være præcis 4 cifre."); return; }
    setTravl(true);

    const felter = { navn: navn.trim(), butiksnummer: butiksnummer.trim() || null, adresse: adresse.trim() };
    if (adresse.trim() !== butik.adresse) {
      const koord = await geokodAdresse(adresse.trim());
      if (koord) { felter.lat = koord.lat; felter.lon = koord.lon; }
    }

    const resultat = await opdaterButikSystemadmin(butik.id, felter);
    setTravl(false);
    if (!resultat.ok) {
      setFejl(resultat.fejl?.includes("butikker_butiksnummer_key") ? "Butiksnummeret er allerede i brug af en anden butik." : resultat.fejl);
      return;
    }
    onFaerdig();
  };

  return (
    <div className="bg-white border border-[#E2621B] p-3">
      <div className="grid gap-2 sm:grid-cols-2 mb-2">
        <input autoFocus value={navn} onChange={(e) => setNavn(e.target.value)} placeholder="Butiksnavn" className="border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1.5 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        <input value={butiksnummer} onChange={(e) => setButiksnummer(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Butiksnummer (4 cifre)" inputMode="numeric" className="border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1.5 text-sm text-[#1C232E] font-mono focus:outline-none focus:border-[#E2621B]" />
        <div className="sm:col-span-2">
          <AdresseInput value={adresse} onChange={setAdresse} placeholder="Adresse" />
        </div>
      </div>
      {fejl && <p className="text-xs text-[#B3261E] mb-2 flex items-center gap-1.5"><AlertCircle size={12} /> {fejl}</p>}
      <div className="flex gap-2">
        <button onClick={gem} disabled={travl} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors disabled:opacity-60 flex items-center gap-1.5">
          {travl && <Loader2 size={12} className="animate-spin" />} Gem
        </button>
        <button onClick={onAnnuller} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#52697E] border border-[#D8D0BE]">Fortryd</button>
      </div>
    </div>
  );
}

// Kobler eksisterende brugere til en butik (+ sætter rolle). Uden søgning
// vises kun brugere der endnu ikke hører til nogen butik - de mest
// relevante at handle på. Søgning finder på tværs af hele kæden.
function BrugerKobling({ butikker }) {
  const [soegning, setSoegning] = useState("");
  const [brugere, setBrugere] = useState([]);
  const [indlaeser, setIndlaeser] = useState(true);
  const [gemmerId, setGemmerId] = useState(null);

  const genindlaes = (tekst) => {
    setIndlaeser(true);
    hentAlleBrugereSystemadmin(tekst).then((b) => { setBrugere(b); setIndlaeser(false); });
  };
  useEffect(() => { genindlaes(""); }, []);

  const opdater = async (brugerId, felter) => {
    setGemmerId(brugerId);
    await opdaterProfil(brugerId, { rolle: felter.rolle, butik_id: felter.butikId });
    setGemmerId(null);
    genindlaes(soegning);
  };

  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-1 flex items-center gap-2"><Users size={16} /> Kobl brugere til butik</h3>
      <p className="text-xs text-[#52697E] mb-3">Uden søgning vises kun brugere, der endnu ikke er koblet til nogen butik. Søg for at finde og flytte en bruger fra en anden butik.</p>

      <div className="relative mb-3">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#52697E]" />
        <input
          value={soegning}
          onChange={(e) => setSoegning(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && genindlaes(soegning)}
          placeholder="Søg på e-mail/navn, eller lad stå tomt for ukoblede brugere"
          className="w-full border border-[#D8D0BE] bg-[#F3EFE6] pl-8 pr-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]"
        />
      </div>

      {indlaeser ? (
        <p className="text-sm text-[#52697E]">Indlæser...</p>
      ) : brugere.length === 0 ? (
        <p className="text-sm text-[#52697E] italic">{soegning ? "Ingen brugere matcher søgningen." : "Ingen ukoblede brugere lige nu."}</p>
      ) : (
        <div className="space-y-2">
          {brugere.map((b) => (
            <div key={b.id} className="bg-white border border-[#D8D0BE] p-3 flex items-center gap-2 flex-wrap">
              <p className="text-sm text-[#1C232E] flex-1 min-w-[160px] truncate">{b.navn}</p>
              <select
                value={b.rolle}
                onChange={(e) => opdater(b.id, { rolle: e.target.value, butikId: b.butikId })}
                className="border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1.5 text-xs text-[#1C232E]"
              >
                {Object.entries(ROLLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select
                value={b.butikId || ""}
                onChange={(e) => opdater(b.id, { rolle: b.rolle, butikId: e.target.value || null })}
                disabled={gemmerId === b.id}
                className="border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1.5 text-xs text-[#1C232E] min-w-[160px]"
              >
                <option value="">Ingen butik</option>
                {butikker.map((bu) => <option key={bu.id} value={bu.id}>{bu.navn}{bu.butiksnummer ? ` #${bu.butiksnummer}` : ""}</option>)}
              </select>
              {gemmerId === b.id && <Loader2 size={14} className="animate-spin text-[#52697E]" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { SystemAdminSide };
