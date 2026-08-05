import React, { useState } from "react";
import { Lock, Mail, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

// Login foregår nu via Supabase Auth i stedet for et klartekst-tjek mod en
// lokal brugerliste. App.jsx lytter selv på login-status
// (supabase.auth.onAuthStateChange) og henter profilen (butik, rolle) - se
// hentEgenProfil i src/lib/skyLager.js. Denne komponent skal derfor bare
// bede Supabase om at logge ind/oprette en bruger; den kender ikke noget
// til roller eller butikker selv.
function LoginSide() {
  const [visOpret, setVisOpret] = useState(false);
  const [email, setEmail] = useState("");
  const [adgangskode, setAdgangskode] = useState("");
  const [fejl, setFejl] = useState("");
  const [besked, setBesked] = useState("");
  const [travl, setTravl] = useState(false);

  const logInd = async () => {
    setFejl("");
    setBesked("");
    setTravl(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: adgangskode });
    setTravl(false);
    if (error) setFejl("Forkert e-mail eller adgangskode.");
    // Ved succes opdaterer App.jsx sig selv via onAuthStateChange - intet mere at gøre her.
  };

  const opretBruger = async () => {
    setFejl("");
    setBesked("");
    setTravl(true);
    const { error } = await supabase.auth.signUp({ email: email.trim(), password: adgangskode });
    setTravl(false);
    if (error) { setFejl(error.message); return; }
    setBesked("Bruger oprettet. En admin skal nu koble dig til jeres butik, før du kan logge ind og se noget (se README).");
  };

  const submit = () => (visOpret ? opretBruger() : logInd());

  return (
    <div className="min-h-screen w-full flex items-center justify-center" style={{ background: "#F3EFE6" }}>
      <div className="w-full max-w-sm border border-[#D8D0BE] bg-white p-6">
        <p className="font-mono text-[11px] tracking-widest uppercase text-[#E2621B] mb-1">Dagens rute</p>
        <h1 className="font-['Barlow_Condensed'] text-3xl uppercase tracking-tight text-[#1C232E] mb-6">
          {visOpret ? "Opret bruger" : "Log ind"}
        </h1>
        <div className="grid gap-3">
          <label className="text-xs text-[#52697E]">
            E-mail
            <div className="relative mt-1">
              <Mail size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#52697E]" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="w-full border border-[#D8D0BE] bg-[#F3EFE6] pl-8 pr-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]"
              />
            </div>
          </label>
          <label className="text-xs text-[#52697E]">
            Adgangskode
            <div className="relative mt-1">
              <Lock size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#52697E]" />
              <input
                type="password"
                value={adgangskode}
                onChange={(e) => setAdgangskode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="w-full border border-[#D8D0BE] bg-[#F3EFE6] pl-8 pr-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]"
              />
            </div>
          </label>
        </div>

        {fejl && <p className="text-sm text-[#B3261E] mt-3 flex items-center gap-1.5"><AlertCircle size={14} /> {fejl}</p>}
        {besked && <p className="text-sm text-[#3D7A5C] mt-3">{besked}</p>}

        <button
          onClick={submit}
          disabled={travl}
          className="w-full mt-5 px-4 py-2.5 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {travl && <Loader2 size={14} className="animate-spin" />}
          {visOpret ? "Opret bruger" : "Log ind"}
        </button>

        <button
          onClick={() => { setVisOpret(!visOpret); setFejl(""); setBesked(""); }}
          className="w-full mt-3 text-[11px] text-[#52697E] hover:text-[#E2621B] underline"
        >
          {visOpret ? "Har du allerede en bruger? Log ind i stedet" : "Ny i butikken? Opret en bruger"}
        </button>
      </div>
    </div>
  );
}

export { LoginSide };
