import React, { useEffect, useState } from "react";
import { Building2, Loader2, AlertCircle, Check, Pencil, Users, Search, KeyRound, Trash2, UserPlus } from "lucide-react";
import { hentAlleButikker, opretButikSystemadmin, opdaterButikSystemadmin, sletButikSystemadmin, hentAlleBrugereSystemadmin, opdaterProfil, nulstilAdgangskodeAdmin, opretBrugerAdmin } from "../lib/skyLager";
import { geokodAdresse } from "../lib/steder";
import { foreslaaBrugernavn, erGyldigtBrugernavn } from "../lib/brugernavn";
import { AdresseInput } from "../components/AdresseInput";

const ROLLE_LABEL = { admin: "Administrator", saelger: "Sælger", montor: "Montør" };

// Kun synlig for brugere med profiler.er_systemadmin = true. Bruges til at
// oprette/redigere/slette butikker, oprette brugere direkte til en
// vilkårlig butik, og koble eksisterende brugere til butikker.
function SystemAdminSide() {
  const [butikker, setButikker] = useState([]);
  const [indlaeser, setIndlaeser] = useState(true);
  const [redigererId, setRedigererId] = useState(null);
  const [sletterId, setSletterId] = useState(null);
  const [sletBekraeft, setSletBekraeft] = useState("");
  const [sletFejl, setSletFejl] = useState("");
  const [sletTravl, setSletTravl] = useState(false);

  const [butiksNavn, setButiksNavn] = useState("");
  const [butiksnummer, setButiksnummer] = useState("");
  const [adresse, setAdresse] = useState("");
  const [adresseStatus, setAdresseStatus] = useState("tom");
  const [adminLoginType, setAdminLoginType] = useState("brugernavn");
  const [adminNavn, setAdminNavn] = useState("");
  const [adminBrugernavn, setAdminBrugernavn] = useState("");
  const [adminBrugernavnRedigeret, setAdminBrugernavnRedigeret] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminAdgangskode, setAdminAdgangskode] = useState("");
  const [travl, setTravl] = useState(false);
  const [fejl, setFejl] = useState("");
  const [besked, setBesked] = useState("");

  const genindlaes = () => { setIndlaeser(true); hentAlleButikker().then((b) => { setButikker(b); setIndlaeser(false); }); };
  useEffect(() => { genindlaes(); }, []);

  const skiftAdminNavn = (val) => {
    setAdminNavn(val);
    if (!adminBrugernavnRedigeret) setAdminBrugernavn(foreslaaBrugernavn(val));
  };

  const opret = async () => {
    setFejl(""); setBesked("");
    if (!butiksNavn.trim() || !adresse.trim() || adminAdgangskode.length < 6) {
      setFejl("Udfyld butiksnavn, adresse og en adgangskode på mindst 6 tegn.");
      return;
    }
    if (butiksnummer.trim() && !/^\d{4}$/.test(butiksnummer.trim())) {
      setFejl("Butiksnummer skal være præcis 4 cifre.");
      return;
    }
    if (adminLoginType === "brugernavn" && !erGyldigtBrugernavn(adminBrugernavn)) {
      setFejl("Brugernavn skal være 2-40 tegn (a-z, tal, punktum eller bindestreg).");
      return;
    }
    if (adminLoginType === "email" && !adminEmail.trim()) {
      setFejl("Udfyld admin e-mail.");
      return;
    }
    setTravl(true);
    const resultat = await opretButikSystemadmin({
      butiksNavn: butiksNavn.trim(), adresse: adresse.trim(), butiksnummer: butiksnummer.trim() || null,
      adminNavn: adminNavn.trim(), adminLoginType, adminEmail: adminEmail.trim(), adminBrugernavn: adminBrugernavn.trim().toLowerCase(), adminAdgangskode,
    });
    setTravl(false);
    if (!resultat.ok) { setFejl(resultat.fejl); return; }
    setBesked(`Butikken "${butiksNavn}" er oprettet, med ${adminLoginType === "brugernavn" ? `brugernavnet "${adminBrugernavn}"` : adminEmail} som admin.`);
    setButiksNavn(""); setButiksnummer(""); setAdresse(""); setAdminNavn(""); setAdminBrugernavn(""); setAdminBrugernavnRedigeret(false); setAdminEmail(""); setAdminAdgangskode("");
    genindlaes();
  };

  const startSlet = (id) => { setSletterId(id); setSletBekraeft(""); setSletFejl(""); };
  const bekraeftSlet = async (butik) => {
    if (sletBekraeft.trim() !== butik.navn) { setSletFejl(`Skriv butikkens navn ("${butik.navn}") for at bekræfte.`); return; }
    setSletTravl(true);
    const resultat = await sletButikSystemadmin(butik.id);
    setSletTravl(false);
    if (!resultat.ok) { setSletFejl(resultat.fejl || "Kunne ikke slette butikken."); return; }
    setSletterId(null);
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
        </div>

        <p className="text-xs font-semibold uppercase tracking-wide text-[#52697E] mt-4 mb-2">Butikkens første admin</p>
        <div className="flex border border-[#D8D0BE] mb-3 text-xs font-semibold uppercase tracking-wide w-fit">
          <button onClick={() => setAdminLoginType("brugernavn")} className={`px-3 py-1.5 transition-colors ${adminLoginType === "brugernavn" ? "bg-[#1C232E] text-white" : "text-[#52697E] hover:text-[#1C232E]"}`}>Brugernavn</button>
          <button onClick={() => setAdminLoginType("email")} className={`px-3 py-1.5 transition-colors ${adminLoginType === "email" ? "bg-[#1C232E] text-white" : "text-[#52697E] hover:text-[#1C232E]"}`}>E-mail</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={adminNavn} onChange={(e) => skiftAdminNavn(e.target.value)} placeholder="Navn på butikkens første admin" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          {adminLoginType === "brugernavn" ? (
            <input value={adminBrugernavn} onChange={(e) => { setAdminBrugernavn(e.target.value); setAdminBrugernavnRedigeret(true); }} placeholder="Brugernavn (foreslået, kan rettes)" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] font-mono focus:outline-none focus:border-[#E2621B]" />
          ) : (
            <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="Admin e-mail" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          )}
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
            ) : sletterId === b.id ? (
              <div key={b.id} className="bg-white border border-[#B3261E] p-3">
                <p className="text-sm text-[#B3261E] font-semibold flex items-center gap-1.5 mb-1"><AlertCircle size={14} /> Slet "{b.navn}" permanent?</p>
                <p className="text-xs text-[#52697E] mb-2">Alle butikkens sager, biler, varetyper m.m. slettes for altid. Brugernes login bevares, de mister blot adgangen til denne butik. Skriv butikkens navn for at bekræfte.</p>
                <div className="flex gap-2 flex-wrap items-center">
                  <input autoFocus value={sletBekraeft} onChange={(e) => setSletBekraeft(e.target.value)} placeholder={b.navn} className="flex-1 min-w-[160px] border border-[#B3261E] bg-[#F3EFE6] px-2 py-1.5 text-sm text-[#1C232E]" />
                  <button onClick={() => bekraeftSlet(b)} disabled={sletTravl} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white bg-[#B3261E] hover:bg-[#1C232E] transition-colors disabled:opacity-60 flex items-center gap-1.5">
                    {sletTravl && <Loader2 size={12} className="animate-spin" />} Slet permanent
                  </button>
                  <button onClick={() => setSletterId(null)} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#52697E] border border-[#D8D0BE]">Fortryd</button>
                </div>
                {sletFejl && <p className="text-xs text-[#B3261E] mt-2">{sletFejl}</p>}
              </div>
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
                <button onClick={() => startSlet(b.id)} className="p-1.5 text-[#52697E] hover:text-[#B3261E] shrink-0" title="Slet butik"><Trash2 size={15} /></button>
              </div>
            )
          )}
        </div>
      )}

      <OpretBrugerDirekte butikker={butikker} />
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

// Systemadmin opretter en bruger direkte til en VALGFRI butik, uden om
// "opret ny butik"-flowet - fx til en butik der allerede findes.
function OpretBrugerDirekte({ butikker }) {
  const [butikId, setButikId] = useState("");
  const [loginType, setLoginType] = useState("brugernavn");
  const [navn, setNavn] = useState("");
  const [brugernavn, setBrugernavn] = useState("");
  const [brugernavnRedigeret, setBrugernavnRedigeret] = useState(false);
  const [email, setEmail] = useState("");
  const [rolle, setRolle] = useState("saelger");
  const [adgangskode, setAdgangskode] = useState("");
  const [travl, setTravl] = useState(false);
  const [fejl, setFejl] = useState("");
  const [besked, setBesked] = useState("");

  const skiftNavn = (val) => {
    setNavn(val);
    if (!brugernavnRedigeret) setBrugernavn(foreslaaBrugernavn(val));
  };

  const opret = async () => {
    setFejl(""); setBesked("");
    if (!butikId) { setFejl("Vælg hvilken butik brugeren skal høre til."); return; }
    if (!navn.trim() || !adgangskode.trim()) { setFejl("Udfyld navn og adgangskode."); return; }
    if (loginType === "brugernavn" && !erGyldigtBrugernavn(brugernavn)) { setFejl("Brugernavn skal være 2-40 tegn (a-z, tal, punktum eller bindestreg)."); return; }
    if (loginType === "email" && !email.trim()) { setFejl("Udfyld e-mail."); return; }
    setTravl(true);
    const resultat = await opretBrugerAdmin({ navn: navn.trim(), loginType, email: email.trim(), brugernavn: brugernavn.trim().toLowerCase(), adgangskode, rolle, butikId });
    setTravl(false);
    if (!resultat.ok) { setFejl(resultat.fejl || "Kunne ikke oprette brugeren."); return; }
    setBesked(`Bruger oprettet i valgt butik.`);
    setNavn(""); setBrugernavn(""); setBrugernavnRedigeret(false); setEmail(""); setAdgangskode(""); setRolle("saelger");
  };

  return (
    <div className="border border-[#D8D0BE] bg-white p-5 mb-8">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-1 flex items-center gap-2"><UserPlus size={16} /> Opret bruger direkte til en butik</h3>
      <p className="text-xs text-[#52697E] mb-3">Til at oprette en ekstra bruger i en butik, der allerede findes — uden at skulle oprette en ny butik.</p>
      <div className="flex border border-[#D8D0BE] mb-3 text-xs font-semibold uppercase tracking-wide w-fit">
        <button onClick={() => setLoginType("brugernavn")} className={`px-3 py-1.5 transition-colors ${loginType === "brugernavn" ? "bg-[#1C232E] text-white" : "text-[#52697E] hover:text-[#1C232E]"}`}>Brugernavn</button>
        <button onClick={() => setLoginType("email")} className={`px-3 py-1.5 transition-colors ${loginType === "email" ? "bg-[#1C232E] text-white" : "text-[#52697E] hover:text-[#1C232E]"}`}>E-mail</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <select value={butikId} onChange={(e) => setButikId(e.target.value)} className="sm:col-span-2 border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]">
          <option value="">Vælg butik...</option>
          {butikker.map((b) => <option key={b.id} value={b.id}>{b.navn}{b.butiksnummer ? ` #${b.butiksnummer}` : ""}</option>)}
        </select>
        <input value={navn} onChange={(e) => skiftNavn(e.target.value)} placeholder="Navn" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        {loginType === "brugernavn" ? (
          <input value={brugernavn} onChange={(e) => { setBrugernavn(e.target.value); setBrugernavnRedigeret(true); }} placeholder="Brugernavn (foreslået, kan rettes)" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] font-mono focus:outline-none focus:border-[#E2621B]" />
        ) : (
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        )}
        <select value={rolle} onChange={(e) => setRolle(e.target.value)} className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E]">
          <option value="saelger">Sælger</option>
          <option value="montor">Montør</option>
          <option value="admin">Administrator</option>
        </select>
        <input value={adgangskode} onChange={(e) => setAdgangskode(e.target.value)} placeholder="Adgangskode (mindst 6 tegn)" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
      </div>
      {fejl && <p className="text-xs text-[#B3261E] mt-2 flex items-center gap-1.5"><AlertCircle size={13} /> {fejl}</p>}
      {besked && <p className="text-xs text-[#3D7A5C] mt-2 flex items-center gap-1.5"><Check size={13} /> {besked}</p>}
      <button onClick={opret} disabled={travl} className="mt-3 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors flex items-center gap-1.5 disabled:opacity-60">
        {travl && <Loader2 size={14} className="animate-spin" />} {travl ? "Opretter..." : "Opret bruger"}
      </button>
    </div>
  );
}

// Kobler eksisterende brugere til en butik (+ sætter rolle, + kan nulstille
// adgangskode). Uden søgning vises kun brugere der endnu ikke hører til
// nogen butik - de mest relevante at handle på. Søgning finder på tværs af
// hele kæden, i navn eller brugernavn.
function BrugerKobling({ butikker }) {
  const [soegning, setSoegning] = useState("");
  const [brugere, setBrugere] = useState([]);
  const [indlaeser, setIndlaeser] = useState(true);
  const [gemmerId, setGemmerId] = useState(null);
  const [nulstilId, setNulstilId] = useState(null);
  const [nyKode, setNyKode] = useState("");
  const [nulstilBesked, setNulstilBesked] = useState("");

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

  const nulstil = async (brugerId) => {
    if (nyKode.length < 6) { setNulstilBesked("Mindst 6 tegn."); return; }
    setGemmerId(brugerId);
    const resultat = await nulstilAdgangskodeAdmin(brugerId, nyKode);
    setGemmerId(null);
    if (!resultat.ok) { setNulstilBesked(resultat.fejl || "Kunne ikke nulstille."); return; }
    setNulstilBesked("Nulstillet.");
    setNyKode("");
    setTimeout(() => { setNulstilId(null); setNulstilBesked(""); }, 1200);
  };

  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-1 flex items-center gap-2"><Users size={16} /> Kobl brugere til butik</h3>
      <p className="text-xs text-[#52697E] mb-3">Uden søgning vises kun brugere, der endnu ikke er koblet til nogen butik. Søg for at finde og flytte en bruger fra en anden butik, eller nulstille en adgangskode.</p>

      <div className="relative mb-3">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#52697E]" />
        <input
          value={soegning}
          onChange={(e) => setSoegning(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && genindlaes(soegning)}
          placeholder="Søg på navn eller brugernavn, eller lad stå tomt for ukoblede brugere"
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
            <div key={b.id} className="bg-white border border-[#D8D0BE] p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex-1 min-w-[160px]">
                  <p className="text-sm text-[#1C232E] truncate">{b.navn}</p>
                  {b.brugernavn && <p className="text-[11px] text-[#52697E]">brugernavn: {b.brugernavn}</p>}
                </div>
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
                <button onClick={() => { setNulstilId(nulstilId === b.id ? null : b.id); setNulstilBesked(""); setNyKode(""); }} className="p-1.5 text-[#52697E] hover:text-[#E2621B]" title="Nulstil adgangskode"><KeyRound size={15} /></button>
                {gemmerId === b.id && <Loader2 size={14} className="animate-spin text-[#52697E]" />}
              </div>
              {nulstilId === b.id && (
                <div className="mt-2.5 pt-2.5 border-t border-[#F0EBDD] flex items-center gap-2 flex-wrap">
                  <input
                    type="password"
                    value={nyKode}
                    onChange={(e) => setNyKode(e.target.value)}
                    placeholder="Ny adgangskode (mindst 6 tegn)"
                    className="flex-1 min-w-[160px] border border-[#D8D0BE] bg-[#F3EFE6] px-2 py-1.5 text-xs text-[#1C232E] focus:outline-none focus:border-[#E2621B]"
                  />
                  <button onClick={() => nulstil(b.id)} disabled={gemmerId === b.id} className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors disabled:opacity-60">
                    Sæt ny adgangskode
                  </button>
                  {nulstilBesked && <span className={`text-[11px] ${nulstilBesked === "Nulstillet." ? "text-[#3D7A5C]" : "text-[#B3261E]"}`}>{nulstilBesked}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { SystemAdminSide };
