import React, { useState } from "react";
import { Lock, User, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { erEmailFormat, identifikatorTilEmail, erGyldigtBrugernavn, emailFraBrugernavn } from "../lib/brugernavn";

// Login foregår via Supabase Auth. Brugeren kan taste ENTEN en rigtig
// e-mail ELLER et selvvalgt brugernavn i samme felt - se
// src/lib/brugernavn.js for hvordan det oversættes til det, Supabase Auth
// reelt kræver internt. App.jsx lytter selv på login-status
// (supabase.auth.onAuthStateChange) og henter profilen (butik, rolle).
function LoginSide() {
  const [visOpret, setVisOpret] = useState(false);
  const [opretMedBrugernavn, setOpretMedBrugernavn] = useState(true);
  const [identifikator, setIdentifikator] = useState(""); // e-mail ELLER brugernavn (login-fanen)
  const [navn, setNavn] = useState(""); // kun brugt ved opret-bruger
  const [adgangskode, setAdgangskode] = useState("");
  const [fejl, setFejl] = useState("");
  const [besked, setBesked] = useState("");
  const [travl, setTravl] = useState(false);

  const logInd = async () => {
    setFejl("");
    setBesked("");
    if (!identifikator.trim() || !adgangskode) { setFejl("Udfyld begge felter."); return; }
    setTravl(true);
    const { error } = await supabase.auth.signInWithPassword({ email: identifikatorTilEmail(identifikator), password: adgangskode });
    setTravl(false);
    if (error) setFejl("Forkert e-mail/brugernavn eller adgangskode.");
    // Ved succes opdaterer App.jsx sig selv via onAuthStateChange - intet mere at gøre her.
  };

  const opretBruger = async () => {
    setFejl("");
    setBesked("");
    if (!navn.trim()) { setFejl("Skriv dit navn."); return; }
    if (opretMedBrugernavn && !erGyldigtBrugernavn(identifikator)) {
      setFejl("Brugernavn skal være 2-40 tegn (bogstaver, tal, punktum eller bindestreg, ingen mellemrum eller æøå).");
      return;
    }
    if (!opretMedBrugernavn && !erEmailFormat(identifikator)) {
      setFejl("Skriv en gyldig e-mail, eller skift til brugernavn ovenfor.");
      return;
    }
    setTravl(true);
    const email = opretMedBrugernavn ? emailFraBrugernavn(identifikator) : identifikator.trim();
    const { error } = await supabase.auth.signUp({ email, password: adgangskode });
    if (error) { setTravl(false); setFejl(error.message.includes("already") ? "Den e-mail/det brugernavn er allerede i brug." : error.message); return; }

    // Selve login-oprettelsen lykkedes - sæt navn (og evt. brugernavn) på
    // profilen, som databasetriggeren allerede har oprettet tom.
    const { data: session } = await supabase.auth.getSession();
    if (session?.session?.user?.id) {
      await supabase.from("profiler").update({
        navn: navn.trim(),
        brugernavn: opretMedBrugernavn ? identifikator.trim().toLowerCase() : null,
      }).eq("id", session.session.user.id);
    }
    setTravl(false);
    setBesked("Bruger oprettet. En admin skal nu koble dig til jeres butik, før du kan logge ind og se noget.");
  };

  const submit = () => (visOpret ? opretBruger() : logInd());

  return (
    <div className="min-h-screen w-full flex items-center justify-center" style={{ background: "#F3EFE6" }}>
      <div className="w-full max-w-sm border border-[#D8D0BE] bg-white p-6">
        <p className="font-mono text-[11px] tracking-widest uppercase text-[#E2621B] mb-1">Dagens rute</p>
        <h1 className="font-['Barlow_Condensed'] text-3xl uppercase tracking-tight text-[#1C232E] mb-6">
          {visOpret ? "Opret bruger" : "Log ind"}
        </h1>

        {visOpret && (
          <div className="flex border border-[#D8D0BE] mb-3 text-xs font-semibold uppercase tracking-wide">
            <button onClick={() => setOpretMedBrugernavn(true)} className={`flex-1 py-2 transition-colors ${opretMedBrugernavn ? "bg-[#1C232E] text-white" : "text-[#52697E] hover:text-[#1C232E]"}`}>Brugernavn</button>
            <button onClick={() => setOpretMedBrugernavn(false)} className={`flex-1 py-2 transition-colors ${!opretMedBrugernavn ? "bg-[#1C232E] text-white" : "text-[#52697E] hover:text-[#1C232E]"}`}>E-mail</button>
          </div>
        )}

        <div className="grid gap-3">
          {visOpret && (
            <label className="text-xs text-[#52697E]">
              Navn
              <input
                value={navn}
                onChange={(e) => setNavn(e.target.value)}
                className="w-full mt-1 border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]"
              />
            </label>
          )}
          <label className="text-xs text-[#52697E]">
            {visOpret ? (opretMedBrugernavn ? "Vælg et brugernavn" : "E-mail") : "E-mail eller brugernavn"}
            <div className="relative mt-1">
              <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#52697E]" />
              <input
                type={!visOpret || opretMedBrugernavn ? "text" : "email"}
                value={identifikator}
                onChange={(e) => setIdentifikator(e.target.value)}
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
        {!visOpret && <p className="text-[11px] text-[#52697E] mt-3">Glemt adgangskode? Kontakt din butiks admin eller systemadmin — de kan nulstille den for dig.</p>}

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
