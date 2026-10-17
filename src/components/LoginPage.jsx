import React, { useEffect, useState } from "react";
import { Lock, User, AlertCircle, Loader2, KeyRound, Fingerprint, Store, Mail } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { loginWithPin, loginWithBiometric } from "../lib/dataStore";
import { erBiometriTilgaengelig } from "../lib/webauthn";
import PUNKT1_LOGO_POSITIV from "../assets/punkt1_positiv.png";

const PIN_LAENGDE = 4;
const BUTIK_NOEGLE = "p1sybs_butiksnr"; // kun en bekvemmelighed: husker butiksnummeret på denne enhed

const laesButik = () => {
  try { return localStorage.getItem(BUTIK_NOEGLE) || ""; } catch { return ""; }
};
const gemButik = (v) => {
  try { localStorage.setItem(BUTIK_NOEGLE, v); } catch { /* privat tilstand el. lign. - ikke kritisk */ }
};
const kunCifre = (v) => v.replace(/\D/g, "").slice(0, PIN_LAENGDE);

// LOGIN = butiksnummer + brugernavn (initialer) + 4-cifret PIN.
//
// Brugernavn (initialer) er kun unikt INDEN FOR en butik, derfor er butiksnummeret
// med. PIN'en verificeres server-side (Edge Function login-with-pin) med
// begrænsning af forsøg - se den for sikkerhedsreglerne. Lykkes det, udsteder
// Supabase en rigtig session, og App.jsx opdaterer sig selv via
// onAuthStateChange - intet mere at gøre her.
//
// MIDLERTIDIG PIN: en admin sætter en midlertidig PIN ved oprettelse/nulstilling.
// Serveren svarer da "skalSkiftePin", og brugeren vælger sin egen PIN her,
// før der udstedes en session.
//
// SYSTEMADMINISTRATOR-LOGIN (e-mail + adgangskode) er en separat, bevidst
// tilbagetrukket indgang til kædens administratorer/udvikler. Almindelige
// butiksbrugere bruger den ikke.
function LoginPage() {
  const [mode, setMode] = useState("pin"); // 'pin' | 'nyPin' | 'admin'
  const [butik, setButik] = useState(laesButik);
  const [brugernavn, setBrugernavn] = useState("");
  const [pin, setPin] = useState("");
  const [nyPin, setNyPin] = useState("");
  const [nyPin2, setNyPin2] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  // Logoet er indlejret som en stor base64-data-URI i JS-bundlen og kan fejle
  // på nogle mobile browsere - falder da tilbage til et tekstbaseret ordmærke.
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => { erBiometriTilgaengelig().then(setBiometricAvailable); }, []);

  const harBrugerFelter = () => butik.trim() && brugernavn.trim();

  const logIndMedPin = async () => {
    setError("");
    if (!harBrugerFelter() || pin.length !== PIN_LAENGDE) { setError(`Udfyld butiksnummer, brugernavn og ${PIN_LAENGDE}-cifret PIN-kode.`); return; }
    setBusy(true);
    const result = await loginWithPin({ butik: butik.trim(), brugernavn: brugernavn.trim(), pin });
    setBusy(false);
    if (result.skalSkiftePin) { gemButik(butik.trim()); setMode("nyPin"); return; }
    if (!result.ok) { setError(result.fejl || "Forkert butik, bruger eller PIN-kode."); setPin(""); return; }
    gemButik(butik.trim());
  };

  const vaelgNyPin = async () => {
    setError("");
    if (nyPin.length !== PIN_LAENGDE) { setError(`Den nye PIN-kode skal være præcis ${PIN_LAENGDE} cifre.`); return; }
    if (nyPin !== nyPin2) { setError("De to koder er ikke ens."); setNyPin2(""); return; }
    setBusy(true);
    const result = await loginWithPin({ butik: butik.trim(), brugernavn: brugernavn.trim(), pin, nyPin });
    setBusy(false);
    if (!result.ok) { setError(result.fejl || "Kunne ikke gemme den nye PIN-kode."); return; }
  };

  const logIndMedBiometri = async () => {
    setError("");
    if (!harBrugerFelter()) { setError("Udfyld butiksnummer og brugernavn."); return; }
    setBusy(true);
    const result = await loginWithBiometric({ butik: butik.trim(), brugernavn: brugernavn.trim() });
    setBusy(false);
    if (!result.ok) { setError(result.fejl || "Face ID-login lykkedes ikke."); return; }
    gemButik(butik.trim());
  };

  const logIndAdmin = async () => {
    setError("");
    if (!email.trim() || !password) { setError("Udfyld begge felter."); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError("Forkert e-mail eller adgangskode.");
  };

  const submit = (e) => {
    e.preventDefault();
    if (busy) return;
    if (mode === "nyPin") return vaelgNyPin();
    if (mode === "admin") return logIndAdmin();
    return logIndMedPin();
  };

  const skiftTilbage = () => { setMode("pin"); setError(""); setPin(""); setNyPin(""); setNyPin2(""); };

  const felt = "w-full rounded-lg border border-line bg-paper pl-8 pr-3 py-2.5 text-sm text-ink focus:outline-none focus:border-brand";
  const ikon = "absolute left-2.5 top-1/2 -translate-y-1/2 text-muted";
  const pinFelt = `${felt} tracking-[0.3em]`;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-paper p-3">
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
          {mode === "nyPin" ? "Vælg din PIN" : mode === "admin" ? "Systemadministrator" : "Velkommen"}
        </h1>

        <form onSubmit={submit} className="grid gap-3" noValidate>
          {mode === "pin" && (
            <>
              <div>
                <label htmlFor="login-butik" className="text-xs text-muted">Butiksnummer</label>
                <div className="relative mt-1">
                  <Store size={14} className={ikon} aria-hidden="true" />
                  <input
                    id="login-butik" type="text" inputMode="numeric" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                    value={butik} onChange={(e) => setButik(e.target.value)} className={felt}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="login-brugernavn" className="text-xs text-muted">Brugernavn (initialer)</label>
                <div className="relative mt-1">
                  <User size={14} className={ikon} aria-hidden="true" />
                  <input
                    id="login-brugernavn" type="text" autoComplete="username" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                    value={brugernavn} onChange={(e) => setBrugernavn(e.target.value)} className={felt}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="login-pin" className="text-xs text-muted">PIN-kode</label>
                <div className="relative mt-1">
                  <KeyRound size={14} className={ikon} aria-hidden="true" />
                  <input
                    id="login-pin" type="password" inputMode="numeric" autoComplete="off"
                    value={pin} onChange={(e) => setPin(kunCifre(e.target.value))} className={pinFelt}
                  />
                </div>
              </div>
            </>
          )}

          {mode === "nyPin" && (
            <>
              <p className="text-xs text-muted">Du loggede ind med en midlertidig PIN. Vælg nu din egen {PIN_LAENGDE}-cifrede PIN-kode, som du bruger fremover.</p>
              <div>
                <label htmlFor="login-ny-pin" className="text-xs text-muted">Ny PIN-kode</label>
                <div className="relative mt-1">
                  <KeyRound size={14} className={ikon} aria-hidden="true" />
                  <input id="login-ny-pin" type="password" inputMode="numeric" autoComplete="new-password" autoFocus value={nyPin} onChange={(e) => setNyPin(kunCifre(e.target.value))} className={pinFelt} />
                </div>
              </div>
              <div>
                <label htmlFor="login-ny-pin2" className="text-xs text-muted">Gentag PIN-koden</label>
                <div className="relative mt-1">
                  <KeyRound size={14} className={ikon} aria-hidden="true" />
                  <input id="login-ny-pin2" type="password" inputMode="numeric" autoComplete="new-password" value={nyPin2} onChange={(e) => setNyPin2(kunCifre(e.target.value))} className={pinFelt} />
                </div>
              </div>
              <p className="text-[11px] text-muted">Undgå lette koder som 1234 eller 1111 - de afvises.</p>
            </>
          )}

          {mode === "admin" && (
            <>
              <div>
                <label htmlFor="login-email" className="text-xs text-muted">E-mail</label>
                <div className="relative mt-1">
                  <Mail size={14} className={ikon} aria-hidden="true" />
                  <input id="login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={felt} />
                </div>
              </div>
              <div>
                <label htmlFor="login-adgangskode" className="text-xs text-muted">Adgangskode</label>
                <div className="relative mt-1">
                  <Lock size={14} className={ikon} aria-hidden="true" />
                  <input id="login-adgangskode" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={felt} />
                </div>
              </div>
            </>
          )}

          {error && <p role="alert" className="text-sm text-danger flex items-start gap-1.5"><AlertCircle size={14} className="shrink-0 mt-0.5" aria-hidden="true" /> {error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full mt-2 px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-brand hover:bg-brand-dark transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            {mode === "nyPin" ? "Gem PIN og log ind" : "Log ind"}
          </button>
        </form>

        {mode === "pin" && biometricAvailable && (
          <button
            type="button" onClick={logIndMedBiometri} disabled={busy}
            className="w-full mt-3 px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-ink border border-line hover:border-brand hover:text-brand transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <Fingerprint size={14} aria-hidden="true" /> Log ind med Face ID
          </button>
        )}

        {mode === "pin" && <p className="text-[11px] text-muted mt-4">Glemt din PIN, eller er din bruger ny? Bed din butiks admin om en ny midlertidig PIN.</p>}

        {mode === "pin" ? (
          <button type="button" onClick={() => { setMode("admin"); setError(""); }} className="w-full mt-3 text-[11px] text-muted hover:text-brand underline">
            Systemadministrator-login
          </button>
        ) : (
          <button type="button" onClick={skiftTilbage} className="w-full mt-3 text-[11px] text-muted hover:text-brand underline">
            {mode === "nyPin" ? "Annuller" : "Tilbage til almindeligt login"}
          </button>
        )}
      </div>
    </div>
  );
}

export { LoginPage };
