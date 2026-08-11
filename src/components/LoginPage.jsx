import React, { useState } from "react";
import { Lock, User, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { isEmailFormat, identifierToEmail, isValidUsername, emailFromUsername } from "../lib/username";

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
    <div className="min-h-screen w-full flex items-center justify-center" style={{ background: "#F3EFE6" }}>
      <div className="w-full max-w-sm border border-[#D8D0BE] bg-white p-6">
        <p className="font-mono text-[11px] tracking-widest uppercase text-[#E2621B] mb-1">Dagens rute</p>
        <h1 className="font-['Barlow_Condensed'] text-3xl uppercase tracking-tight text-[#1C232E] mb-6">
          {signingUp ? "Opret bruger" : "Log ind"}
        </h1>

        {signingUp && (
          <div className="flex border border-[#D8D0BE] mb-3 text-xs font-semibold uppercase tracking-wide">
            <button onClick={() => setUseUsername(true)} className={`flex-1 py-2 transition-colors ${useUsername ? "bg-[#1C232E] text-white" : "text-[#52697E] hover:text-[#1C232E]"}`}>Brugernavn</button>
            <button onClick={() => setUseUsername(false)} className={`flex-1 py-2 transition-colors ${!useUsername ? "bg-[#1C232E] text-white" : "text-[#52697E] hover:text-[#1C232E]"}`}>E-mail</button>
          </div>
        )}

        <div className="grid gap-3">
          {signingUp && (
            <label className="text-xs text-[#52697E]">
              Navn
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full mt-1 border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]"
              />
            </label>
          )}
          <label className="text-xs text-[#52697E]">
            {signingUp ? (useUsername ? "Vælg et brugernavn" : "E-mail") : "E-mail eller brugernavn"}
            <div className="relative mt-1">
              <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#52697E]" />
              <input
                type={!signingUp || useUsername ? "text" : "email"}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="w-full border border-[#D8D0BE] bg-[#F3EFE6] pl-8 pr-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]"
              />
            </div>
          </label>
        </div>

        {error && <p className="text-sm text-[#B3261E] mt-3 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</p>}
        {message && <p className="text-sm text-[#3D7A5C] mt-3">{message}</p>}
        {!signingUp && <p className="text-[11px] text-[#52697E] mt-3">Glemt adgangskode? Kontakt din butiks admin eller systemadmin — de kan nulstille den for dig.</p>}

        <button
          onClick={submit}
          disabled={busy}
          className="w-full mt-5 px-4 py-2.5 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {signingUp ? "Opret bruger" : "Log ind"}
        </button>

        <button
          onClick={() => { setSigningUp(!signingUp); setError(""); setMessage(""); }}
          className="w-full mt-3 text-[11px] text-[#52697E] hover:text-[#E2621B] underline"
        >
          {signingUp ? "Har du allerede en bruger? Log ind i stedet" : "Ny i butikken? Opret en bruger"}
        </button>
      </div>
    </div>
  );
}

export { LoginPage };
