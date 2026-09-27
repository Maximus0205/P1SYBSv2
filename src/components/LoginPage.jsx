import React, { useEffect, useState } from "react";
import { Lock, User, AlertCircle, Loader2, KeyRound, Fingerprint } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { isEmailFormat, identifierToEmail, isValidUsername, emailFromUsername } from "../lib/username";
import { loginWithPin, loginWithBiometric } from "../lib/dataStore";
import { erBiometriTilgaengelig } from "../lib/webauthn";
import PUNKT1_LOGO_POSITIV from "../assets/punkt1_positiv.png";

const PIN_LAENGDE = 4;

// Login foregår via Supabase Auth. Brugeren kan taste ENTEN en rigtig
// e-mail ELLER et selvvalgt brugernavn i samme felt - se src/lib/username.js
// for hvordan det oversættes til det, Supabase Auth reelt kræver internt.
// App.jsx lytter selv på login-status (supabase.auth.onAuthStateChange) og
// henter profilen (butik, rolle).
//
// PIN-LOGIN og BIOMETRISK LOGIN (september 2026): to ægte, konto-bundne
// ALTERNATIVER til adgangskode - IKKE den udfasede "lås telefonen op"-
// genvej (se lib/deviceUnlock.js, historisk). Begge verificeres server-
// side (se lib/dataStore.js: loginWithPin/loginWithBiometric) mod EGNE
// tabeller - aldrig mod Supabase Auth's eget adgangskodefelt. PIN-koden er
// fast 4 cifre (se AccountSettingsModal.jsx) - ikke noget butikken sætter
// en minimumslængde for. Lykkes verificeringen, udstedes en RIGTIG
// Supabase-session bagved - samme sikre grundlag som et almindeligt login.
// Begge afvises server-side, hvis butikken har slået "simpelt login" fra
// (Admin -> Brugere) - fejlen vises da i stedet for "forkert kode".
function LoginPage() {
  const [signingUp, setSigningUp] = useState(false);
  const [loginMethod, setLoginMethod] = useState("adgangskode"); // 'adgangskode' | 'pin' | 'biometri' - kun relevant ved login, ikke ved opret bruger
  const [useUsername, setUseUsername] = useState(true);
  const [identifier, setIdentifier] = useState(""); // e-mail ELLER brugernavn (login-fanen)
  const [name, setName] = useState(""); // kun brugt ved opret-bruger
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  // Logoet er indlejret som en stor base64-data-URI direkte i JS-bundlen
  // (se src/assets/logo.js). Det er sårbart på nogle mobile browsere
  // (særligt iOS Safari under hukommelsespres eller med en indholds-
  // blokerings-udvidelse aktiv) - i stedet for at vise Safaris ødelagte
  // billede-ikon falder vi tilbage til et tekstbaseret ordmærke, så
  // login-siden aldrig ser "i stykker" ud. På sigt bør logo.js erstattes af
  // en rigtig statisk billedfil importeret via Vite, i stedet for en kæmpe
  // inline base64-streng i JS-bundlen.
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => { erBiometriTilgaengelig().then(setBiometricAvailable); }, []);

  const logIn = async () => {
    setError("");
    setMessage("");
    if (!identifier.trim() || !password) { setError("Udfyld begge felter."); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: identifierToEmail(identifier), password });
    setBusy(false);
    if (err) { setError("Forkert e-mail/brugernavn eller adgangskode."); return; }
    // Ved succes opdaterer App.jsx sig selv via onAuthStateChange - intet mere at gøre her.
  };

  const logInWithPin = async () => {
    setError("");
    setMessage("");
    if (!identifier.trim() || pin.length !== PIN_LAENGDE) { setError(`Udfyld bruger og ${PIN_LAENGDE}-cifret PIN-kode.`); return; }
    setBusy(true);
    const result = await loginWithPin(identifier.trim(), pin);
    setBusy(false);
    if (!result.ok) { setError(result.fejl || "Forkert bruger eller PIN-kode."); setPin(""); return; }
    // Ved succes opdaterer App.jsx sig selv via onAuthStateChange - intet mere at gøre her.
  };

  const logInWithBiometric = async () => {
    setError("");
    setMessage("");
    if (!identifier.trim()) { setError("Udfyld bruger."); return; }
    setBusy(true);
    const result = await loginWithBiometric(identifier.trim());
    setBusy(false);
    if (!result.ok) { setError(result.fejl || "Biometrisk login lykkedes ikke."); return; }
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

  const submit = () => {
    if (signingUp) return signUp();
    if (loginMethod === "pin") return logInWithPin();
    if (loginMethod === "biometri") return logInWithBiometric();
    return logIn();
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-paper">
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-6 shadow-sm">
        {logoFailed ? (
          <p className="font-display text-2xl uppercase tracking-tight text-ink mb-6">Punkt1</p>
        ) : (
          <img
            src={PUNKT1_LOGO_POSITIV}
            alt="Punkt1"
            className="h-9 w-auto mb-6"
            width={180}
            height={36}
            loading="eager"
            decoding="sync"
            onError={() => setLogoFailed(true)}
          />
        )}
        <h1 className="font-display text-3xl uppercase tracking-tight text-ink mb-6">
          {signingUp ? "Opret bruger" : "Velkommen"}
        </h1>

        {signingUp && (
          <div className="flex rounded-full border border-line mb-3 text-xs font-semibold uppercase tracking-wide overflow-hidden">
            <button onClick={() => setUseUsername(true)} className={`flex-1 py-2 transition-colors ${useUsername ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>Brugernavn</button>
            <button onClick={() => setUseUsername(false)} className={`flex-1 py-2 transition-colors ${!useUsername ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>E-mail</button>
          </div>
        )}

        {/* LOGIN-METODE (september 2026): kun relevant ved log ind, ikke
            ved opret bruger - en ny bruger sætter PIN/Face ID BAGEFTER,
            når de er logget ind (se AccountSettingsModal.jsx). Face ID-
            fanen vises kun, hvis DENNE telefon overhovedet har det. Findes
            der intet PIN/Face ID sat op for kontoen (eller butikken har
            slået det fra), fortæller edge-funktionen det tydeligt ved
            forsøg - ikke skjult her, da vi endnu ikke kender butikken. */}
        {!signingUp && (
          <div className="flex rounded-full border border-line mb-3 text-xs font-semibold uppercase tracking-wide overflow-hidden">
            <button onClick={() => { setLoginMethod("adgangskode"); setError(""); }} className={`flex-1 py-2 transition-colors ${loginMethod === "adgangskode" ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>Kode</button>
            <button onClick={() => { setLoginMethod("pin"); setError(""); }} className={`flex-1 py-2 transition-colors flex items-center justify-center gap-1 ${loginMethod === "pin" ? "bg-ink text-white" : "text-muted hover:text-ink"}`}><KeyRound size={12} aria-hidden="true" /> PIN</button>
            {biometricAvailable && (
              <button onClick={() => { setLoginMethod("biometri"); setError(""); }} className={`flex-1 py-2 transition-colors flex items-center justify-center gap-1 ${loginMethod === "biometri" ? "bg-ink text-white" : "text-muted hover:text-ink"}`}><Fingerprint size={12} aria-hidden="true" /> Face ID</button>
            )}
          </div>
        )}

        <div className="grid gap-3">
          {signingUp && (
            <label className="text-xs text-muted">
              Navn
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full mt-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
              />
            </label>
          )}
          <label className="text-xs text-muted">
            {signingUp ? (useUsername ? "Vælg et brugernavn" : "E-mail") : "E-mail eller brugernavn"}
            <div className="relative mt-1">
              <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type={!signingUp || useUsername ? "text" : "email"}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="w-full rounded-lg border border-line bg-paper pl-8 pr-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
              />
            </div>
          </label>

          {!signingUp && loginMethod === "pin" && (
            <label className="text-xs text-muted">
              PIN-kode
              <div className="relative mt-1">
                <KeyRound size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LAENGDE))}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  className="w-full rounded-lg border border-line bg-paper pl-8 pr-3 py-2 text-sm text-ink tracking-[0.3em] focus:outline-none focus:border-brand"
                />
              </div>
            </label>
          )}
          {(signingUp || loginMethod === "adgangskode") && (
            <label className="text-xs text-muted">
              Adgangskode
              <div className="relative mt-1">
                <Lock size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  className="w-full rounded-lg border border-line bg-paper pl-8 pr-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
                />
              </div>
            </label>
          )}
          {!signingUp && loginMethod === "biometri" && (
            <p className="text-xs text-muted flex items-center gap-1.5"><Fingerprint size={14} className="text-brand shrink-0" aria-hidden="true" /> Tryk "Log ind" for at bruge Face ID/fingeraftryk.</p>
          )}
        </div>

        {error && <p className="text-sm text-danger mt-3 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</p>}
        {message && <p className="text-sm text-success mt-3">{message}</p>}
        {!signingUp && loginMethod === "adgangskode" && <p className="text-[11px] text-muted mt-3">Glemt adgangskode? Kontakt din butiks admin eller systemadmin — de kan nulstille den for dig.</p>}
        {!signingUp && loginMethod === "pin" && <p className="text-[11px] text-muted mt-3">Ikke sat en PIN-kode op endnu? Log ind med kode, og sæt den op under din konto.</p>}
        {!signingUp && loginMethod === "biometri" && <p className="text-[11px] text-muted mt-3">Ikke slået til på denne enhed endnu? Log ind med kode/PIN, og slå det til under din konto.</p>}

        <button
          onClick={submit}
          disabled={busy}
          className="w-full mt-5 px-4 py-2.5 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-brand hover:bg-ink transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {signingUp ? "Opret bruger" : "Log ind"}
        </button>

        <button
          onClick={() => { setSigningUp(!signingUp); setError(""); setMessage(""); }}
          className="w-full mt-3 text-[11px] text-muted hover:text-brand underline"
        >
          {signingUp ? "Har du allerede en bruger? Log ind i stedet" : "Ny i butikken? Opret en bruger"}
        </button>
      </div>
    </div>
  );
}

export { LoginPage };
