import React, { useState } from "react";
import { Lock, User, AlertCircle } from "lucide-react";

function LoginSide({ brugere, onLogin }) {
  const [brugernavn, setBrugernavn] = useState("");
  const [adgangskode, setAdgangskode] = useState("");
  const [fejl, setFejl] = useState("");

  const login = () => {
    const match = brugere.find((b) => b.brugernavn.toLowerCase() === brugernavn.trim().toLowerCase() && b.adgangskode === adgangskode);
    if (!match) { setFejl("Forkert brugernavn eller adgangskode."); return; }
    setFejl("");
    onLogin(match);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center" style={{ background: "#F3EFE6" }}>
      <div className="w-full max-w-sm border border-[#D8D0BE] bg-white p-6">
        <p className="font-mono text-[11px] tracking-widest uppercase text-[#E2621B] mb-1">Dagens rute</p>
        <h1 className="font-['Barlow_Condensed'] text-3xl uppercase tracking-tight text-[#1C232E] mb-6">Log ind</h1>
        <div className="grid gap-3">
          <label className="text-xs text-[#52697E]">
            Brugernavn
            <div className="relative mt-1">
              <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#52697E]" />
              <input value={brugernavn} onChange={(e) => setBrugernavn(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} className="w-full border border-[#D8D0BE] bg-[#F3EFE6] pl-8 pr-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
            </div>
          </label>
          <label className="text-xs text-[#52697E]">
            Adgangskode
            <div className="relative mt-1">
              <Lock size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#52697E]" />
              <input type="password" value={adgangskode} onChange={(e) => setAdgangskode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} className="w-full border border-[#D8D0BE] bg-[#F3EFE6] pl-8 pr-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
            </div>
          </label>
        </div>
        {fejl && <p className="text-sm text-[#B3261E] mt-3 flex items-center gap-1.5"><AlertCircle size={14} /> {fejl}</p>}
        <button onClick={login} className="w-full mt-5 px-4 py-2.5 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors">
          Log ind
        </button>
        <p className="text-[11px] text-[#52697E] mt-4">Demo-adgange: admin/admin · saelger/saelger · lars/lars</p>
      </div>
    </div>
  );
}

// ---------------- PDF-udlæsning (best effort) ----------------

let pdfjsIndlæst = null;


export { LoginSide };
