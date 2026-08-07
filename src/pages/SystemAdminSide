import React, { useEffect, useState } from "react";
import { Building2, Loader2, AlertCircle, Check } from "lucide-react";
import { hentAlleButikker, opretButikSystemadmin } from "../lib/skyLager";
import { AdresseInput } from "../components/AdresseInput";

// Kun synlig for brugere med profiler.er_systemadmin = true (se
// migration_2_systemadmin.sql). Bruges til at oprette nye butikker, når
// systemet skal udbredes til flere i kæden - hver butik får sin egen
// adresse/koordinater, som resten af butikkens system (adresseforslag)
// tager udgangspunkt i.
function SystemAdminSide() {
  const [butikker, setButikker] = useState([]);
  const [indlaeser, setIndlaeser] = useState(true);

  const [butiksNavn, setButiksNavn] = useState("");
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
    setTravl(true);
    const resultat = await opretButikSystemadmin({ butiksNavn: butiksNavn.trim(), adresse: adresse.trim(), adminNavn: adminNavn.trim(), adminEmail: adminEmail.trim(), adminAdgangskode });
    setTravl(false);
    if (!resultat.ok) { setFejl(resultat.fejl); return; }
    setBesked(`Butikken "${butiksNavn}" er oprettet, med ${adminEmail} som admin.`);
    setButiksNavn(""); setAdresse(""); setAdminNavn(""); setAdminEmail(""); setAdminAdgangskode("");
    genindlaes();
  };

  return (
    <div>
      <div className="border border-[#D8D0BE] bg-white p-5 mb-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-1 flex items-center gap-2"><Building2 size={16} /> Opret ny butik</h3>
        <p className="text-xs text-[#52697E] mb-3">Butikkens adresse geokodes automatisk - resten af butikkens system (adresseforslag ved booking) tager udgangspunkt i den, så en butik på Fyn ikke primært får forslag fra København.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={butiksNavn} onChange={(e) => setButiksNavn(e.target.value)} placeholder="Butiksnavn" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
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
        <div className="space-y-2">
          {butikker.map((b) => (
            <div key={b.id} className="bg-white border border-[#D8D0BE] p-3">
              <p className="font-semibold text-sm text-[#1C232E]">{b.navn}</p>
              <p className="text-xs text-[#52697E]">{b.adresse}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { SystemAdminSide };
