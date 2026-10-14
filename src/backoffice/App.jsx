import React, { useCallback, useEffect, useState } from "react";
import { Loader2, LogOut, AlertCircle, LayoutDashboard, Gauge, Building2, Tags, Receipt, Wallet, Settings, ArrowLeft, History } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { Dashboard } from "./Dashboard";
import { UdgifterSektion } from "./Udgifter";
import { AktivitetSektion } from "./Aktivitet";
import { ForbrugSektion, KunderSektion, PlanerSektion, FakturaerSektion, IndstillingerSektion } from "./BillingAdmin";

// BACKOFFICE: eget panel til at drive og sælge SaaS-løsninger - kunder, forbrug, prisplaner, fakturaer, udgifter og overblik.
// Adgang: login (samme Supabase-login som systemet) + skal være systemadministrator. Det er databasen, der afviser alle andre - ikke denne side.
const felt = "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink min-h-[44px] focus:outline-none focus:border-bo";
const knap = "min-h-[44px] px-5 rounded-lg text-sm font-semibold text-white bg-bo hover:bg-bo-dark focus:outline-none focus:ring-2 focus:ring-bo transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none";

const SEKTIONER = [
  { id: "dashboard", navn: "Overblik", Ikon: LayoutDashboard },
  { id: "forbrug", navn: "Forbrug", Ikon: Gauge },
  { id: "kunder", navn: "Kunder", Ikon: Building2 },
  { id: "planer", navn: "Prisplaner", Ikon: Tags },
  { id: "fakturaer", navn: "Fakturaer", Ikon: Receipt },
  { id: "udgifter", navn: "Udgifter", Ikon: Wallet },
  { id: "aktivitet", navn: "Aktivitet", Ikon: History },
  { id: "indstillinger", navn: "Indstillinger", Ikon: Settings },
];

function Login({ fejlFraAdgang }) {
  const [email, setEmail] = useState("");
  const [kode, setKode] = useState("");
  const [busy, setBusy] = useState(false);
  const [fejl, setFejl] = useState("");
  const log = async (e) => {
    e.preventDefault(); setBusy(true); setFejl("");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: kode });
      if (error) setFejl("Forkert e-mail eller adgangskode.");
    } catch { setFejl("Forbindelsen fejlede. Prøv igen."); }
    setBusy(false);
  };
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-paper">
      <form onSubmit={log} className="w-full max-w-sm rounded-xl border border-line bg-white p-6 shadow-sm space-y-4" aria-labelledby="login-h">
        <h1 id="login-h" className="text-lg font-semibold text-ink">Log ind på backoffice</h1>
        <div><label htmlFor="bo-mail" className="block text-xs font-semibold text-muted mb-1">E-mail</label><input id="bo-mail" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={felt} /></div>
        <div><label htmlFor="bo-kode" className="block text-xs font-semibold text-muted mb-1">Adgangskode</label><input id="bo-kode" type="password" autoComplete="current-password" required value={kode} onChange={(e) => setKode(e.target.value)} className={felt} /></div>
        {(fejl || fejlFraAdgang) && <p role="alert" className="text-xs text-danger flex items-start gap-1.5"><AlertCircle size={13} className="shrink-0 mt-0.5" aria-hidden="true" /> {fejl || fejlFraAdgang}</p>}
        <button type="submit" disabled={busy} className={knap + " w-full"}>{busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />} Log ind</button>
      </form>
    </main>
  );
}

export default function App() {
  const [status, setStatus] = useState("henter"); // henter | ude | inde
  const [stores, setStores] = useState([]);
  const [fejl, setFejl] = useState("");
  const [sektion, setSektion] = useState(() => { try { const h = window.location.hash.replace("#", ""); return SEKTIONER.some((s) => s.id === h) ? h : "dashboard"; } catch { return "dashboard"; } });

  const gaaTil = useCallback((id) => { setSektion(id); try { window.history.replaceState(null, "", `#${id}`); window.scrollTo({ top: 0 }); } catch { /* ingen historik tilgængelig */ } }, []);

  const tjek = useCallback(async (session) => {
    if (!session) { setStatus("ude"); return; }
    try {
      const { data: erAdmin, error } = await supabase.rpc("is_system_admin");
      if (error || erAdmin !== true) { await supabase.auth.signOut(); setFejl("Denne bruger har ikke adgang til backoffice."); setStatus("ude"); return; }
      const { data, error: e2 } = await supabase.from("stores").select("id, name, store_number").order("name");
      setFejl(e2 ? "Kunderne kunne ikke hentes." : "");
      setStores((data || []).map((s) => ({ id: s.id, navn: s.name, butiksnummer: s.store_number })));
      setStatus("inde");
    } catch { setFejl("Forbindelsen fejlede. Prøv at genindlæse siden."); setStatus("ude"); }
  }, []);

  useEffect(() => {
    let levende = true;
    supabase.auth.getSession().then(({ data }) => levende && tjek(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((hændelse, session) => {
      if (hændelse === "SIGNED_IN" || hændelse === "SIGNED_OUT") setTimeout(() => levende && tjek(session), 0);
    });
    return () => { levende = false; sub.subscription.unsubscribe(); };
  }, [tjek]);

  if (status === "henter") return <main className="min-h-screen flex items-center justify-center text-sm text-muted bg-paper"><Loader2 size={16} className="animate-spin mr-2" aria-hidden="true" /> Henter...</main>;
  if (status !== "inde") return <Login fejlFraAdgang={fejl} />;

  const aktuel = SEKTIONER.find((s) => s.id === sektion) || SEKTIONER[0];
  const klasseNav = (id) => `w-full text-left min-h-[44px] px-3 rounded-lg text-sm font-medium inline-flex items-center gap-2.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${sektion === id ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`;
  return (
    <div className="min-h-screen bg-paper lg:flex">
      <aside className="no-print bg-bo-nav text-white lg:w-60 lg:shrink-0 lg:min-h-screen lg:sticky lg:top-0 lg:self-start lg:h-screen lg:flex lg:flex-col">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between lg:block">
          <p className="text-lg font-semibold tracking-tight">Backoffice</p>
          <p className="hidden lg:block text-xs text-white/60 mt-0.5">Løsning: P1SYBSv2</p>
        </div>
        <nav aria-label="Backoffice" className="px-2 pb-2 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible lg:flex-1">
          {SEKTIONER.map(({ id, navn, Ikon }) => (
            <button key={id} onClick={() => gaaTil(id)} aria-current={sektion === id ? "page" : undefined} className={klasseNav(id) + " whitespace-nowrap lg:whitespace-normal w-auto lg:w-full"}><Ikon size={16} aria-hidden="true" /> {navn}</button>
          ))}
        </nav>
        <div className="hidden lg:block px-2 pb-4 space-y-1">
          <a href={import.meta.env.BASE_URL} className="w-full min-h-[44px] px-3 rounded-lg text-sm text-white/70 hover:bg-white/10 hover:text-white inline-flex items-center gap-2.5"><ArrowLeft size={16} aria-hidden="true" /> Til P1SYBSv2</a>
          <button onClick={() => supabase.auth.signOut()} className="w-full min-h-[44px] px-3 rounded-lg text-sm text-white/70 hover:bg-white/10 hover:text-white inline-flex items-center gap-2.5"><LogOut size={16} aria-hidden="true" /> Log ud</button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 py-6 max-w-6xl">
        <div className="flex items-center justify-between gap-3 mb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink no-print">{aktuel.navn}</h1>
          <button onClick={() => supabase.auth.signOut()} className="lg:hidden no-print min-h-[44px] px-3 rounded-lg text-xs font-semibold border border-line bg-white inline-flex items-center gap-1.5"><LogOut size={14} aria-hidden="true" /> Log ud</button>
        </div>
        {fejl && <p role="alert" className="text-xs text-danger mb-3">{fejl}</p>}
        {sektion === "dashboard" && <Dashboard naviger={gaaTil} />}
        {sektion === "forbrug" && <ForbrugSektion onVaelgButik={() => gaaTil("kunder")} />}
        {sektion === "kunder" && <KunderSektion stores={stores} />}
        {sektion === "planer" && <PlanerSektion />}
        {sektion === "fakturaer" && <FakturaerSektion stores={stores} />}
        {sektion === "udgifter" && <UdgifterSektion />}
        {sektion === "aktivitet" && <AktivitetSektion />}
        {sektion === "indstillinger" && <IndstillingerSektion />}
      </main>
    </div>
  );
}
