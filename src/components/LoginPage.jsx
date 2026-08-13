import React, { useState } from "react";
import { Lock, User, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { isEmailFormat, identifierToEmail, isValidUsername, emailFromUsername } from "../lib/username";
import { PUNKT1_LOGO_POSITIV } from "../assets/logo";

// Login foregår via Supabase Auth. Brugeren kan taste ENTEN en rigtig
// e-mail ELLER et selvvalgt brugernavn i samme felt - se src/lib/username.js
// for hvordan det oversættes til det, Supabase Auth reelt kræver internt.
// App.jsx lytter selv på login-status (supabase.auth.onAuthStateChange) og
// henter profilen (butik, rolle).
function LoginPage() {
  const [signingUp, setSigningUp] = useState(false);
  const [useUsername, setUseUsername] = useState(true);
  const [identifier, setIdentifier] = useState(""); // e-mail ELLER brugernavn (login-fanen)
  const [name, setName] = useState(""); // kun brugt ved opret-bruger
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const logIn = async () => {
    setError("");
    setMessage("");
    if (!identifier.trim() || !password) { setError("Udfyld begge felter."); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: identifierToEmail(identifier), password });
    setBusy(false);
    if (err) setError("Forkert e-mail/brugernavn eller adgangskode.");
    // Ved succes opdaterer App.jsx sig selv via onAuthStateChange - intet mere at gøre her.
  };

  const signUp = async () => {
    setError("");
    setMessage("");
    if (!name.trim()) { setError("Skriv dit navn."); return; }
    if (useUsername && !isValidUsername(identifier)) {
      setError("Brugernavn skal være 2-40 tegn (bogstaver, tal, punktum eller bindestreg, ingen mellemrum eller æøå).");
      return;
    }
    if (!useUsername && !isEmailFormat(identifier)) {
      setError("Skriv en gyldig e-mail, eller skift til brugernavn ovenfor.");
      return;
    }
    setBusy(true);
    const email = useUsername ? emailFromUsername(identifier) : identifier.trim();
    const { error: err } = await supabase.auth.signUp({ email, password });
    if (err) { setBusy(false); setError(err.message.includes("already") ? "Den e-mail/det brugernavn er allerede i brug." : err.message); return; }

    // Selve login-oprettelsen lykkedes - sæt navn (og evt. brugernavn) på
    // profilen, som databasetriggeren allerede har oprettet tom. NB:
    // tabellen hedder "profiles" (engelsk) med kolonnerne "name"/"username"
    // efter omlægningen af databaseskemaet.
    const { data: session } = await supabase.auth.getSession();
    if (session?.session?.user?.id) {
      await supabase.from("profiles").update({
        name: name.trim(),
        username: useUsername ? identifier.trim().toLowerCase() : null,
      }).eq("id", session.session.user.id);
    }
    setBusy(false);
    setMessage("Bruger oprettet. En admin skal nu koble dig til jeres butik, før du kan logge ind og se noget.");
  };

  const submit = () => (signingUp ? signUp() : logIn());

  return (
    <div className="min-h-screen w-full flex items-center justify-center" style={{ background: "#F2F2F2" }}>
      <div className="w-full max-w-sm border border-[#DDDDDD] bg-white p-6">
        <img src={PUNKT1_LOGO_POSITIV} alt="Punkt1" className="h-9 w-auto mb-6" />
        <h1 className="font-['Barlow_Condensed'] text-3xl uppercase tracking-tight text-[#1A1A1A] mb-6">
          {signingUp ? "Opret bruger" : "Log ind"}
        </h1>

        {signingUp && (
          <div className="flex border border-[#DDDDDD] mb-3 text-xs font-semibold uppercase tracking-wide">
            <button onClick={() => setUseUsername(true)} className={`flex-1 py-2 transition-colors ${useUsername ? "bg-[#1A1A1A] text-white" : "text-[#5C5C5C] hover:text-[#1A1A1A]"}`}>Brugernavn</button>
            <button onClick={() => setUseUsername(false)} className={`flex-1 py-2 transition-colors ${!useUsername ? "bg-[#1A1A1A] text-white" : "text-[#5C5C5C] hover:text-[#1A1A1A]"}`}>E-mail</button>
          </div>
        )}

        <div className="grid gap-3">
          {signingUp && (
            <label className="text-xs text-[#5C5C5C]">
              Navn
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full mt-1 border border-[#DDDDDD] bg-[#F2F2F2] px-3 py-2 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#C8232E]"
              />
            </label>
          )}
          <label className="text-xs text-[#5C5C5C]">
            {signingUp ? (useUsername ? "Vælg et brugernavn" : "E-mail") : "E-mail eller brugernavn"}
            <div className="relative mt-1">
              <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5C5C5C]" />
              <input
                type={!signingUp || useUsername ? "text" : "email"}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="w-full border border-[#DDDDDD] bg-[#F2F2F2] pl-8 pr-3 py-2 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#C8232E]"
              />
            </div>
          </label>
          <label className="text-xs text-[#5C5C5C]">
            Adgangskode
            <div className="relative mt-1">
              <Lock size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5C5C5C]" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="w-full border border-[#DDDDDD] bg-[#F2F2F2] pl-8 pr-3 py-2 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#C8232E]"
              />
            </div>
          </label>
        </div>

        {error && <p className="text-sm text-[#B3261E] mt-3 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</p>}
        {message && <p className="text-sm text-[#3D7A5C] mt-3">{message}</p>}
        {!signingUp && <p className="text-[11px] text-[#5C5C5C] mt-3">Glemt adgangskode? Kontakt din butiks admin eller systemadmin — de kan nulstille den for dig.</p>}

        <button
          onClick={submit}
          disabled={busy}
          className="w-full mt-5 px-4 py-2.5 text-sm font-semibold uppercase tracking-wide text-white bg-[#1A1A1A] hover:bg-[#C8232E] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {signingUp ? "Opret bruger" : "Log ind"}
        </button>

        <button
          onClick={() => { setSigningUp(!signingUp); setError(""); setMessage(""); }}
          className="w-full mt-3 text-[11px] text-[#5C5C5C] hover:text-[#C8232E] underline"
        >
          {signingUp ? "Har du allerede en bruger? Log ind i stedet" : "Ny i butikken? Opret en bruger"}
        </button>
      </div>
    </div>
  );
}

export { LoginPage };
