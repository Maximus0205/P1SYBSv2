import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { getOwnProfileMedStatus, getStore, getMyPermissions, getRoles } from "../lib/dataStore";
import { saetRoller } from "../data/roller";
import { butikKoordinat } from "../lib/butikKoordinat";
import { laeseCache, saetViserCache } from "../lib/laeseCache";
import { kontekstNoegle } from "../lib/sagsCache";
import { erForbindelsesFejl, laesGemtSession } from "../lib/offlineSession";

// Al state for SESSION, PROFIL og BUTIK er samlet her (fase 4 af
// arkitektur-oprydningen, august 2026) - den sidste og mest følsomme del,
// da den indeholder en kendt, skrøbelig fælde, se nedenfor.
//
// VIGTIGT om onAuthStateChange: denne callback må ikke selv "await"'e
// andre Supabase-kald (som fx reloadProfile -> supabase.from(...)).
// Supabase-auth-klienten holder en intern lås mens callbacken kører, så et
// synkront await her på et andet Supabase-kald fryser hele klienten (kendt
// supabase-js-fælde). setTimeout(..., 0) skubber arbejdet til næste "tick",
// uden for låsen, så login rent faktisk kan fuldføre.
//
// Bevidst IKKE flyttet hertil: hvilken SIDE der vises er navigations-UI-
// state, ikke session-data - App.jsx reagerer selv på ændringer i profile.
//
// RETTIGHEDER: permissions er brugerens FAKTISKE, håndhævede rettigheder
// (rollens standard ∪ individuelle tilføjelser, minus individuelle
// fratagelser - se my_effective_permissions() i databasen).
//
// kanKoere (september 2026) = profiles.can_drive: må denne person tildeles
// sager og en bil? Bevidst UAFHÆNGIG af rollen, så en sælger eller admin,
// der tager en montørrute en gang imellem, ikke skal have en ekstra
// brugerkonto. Hentes sammen med resten af profilen, fordi App.jsx skal
// bruge den til at afgøre, om Montør-fanen overhovedet vises.
//
// OFFLINE-OPSTART (oktober 2026): kan profilen ikke hentes, fordi der ingen forbindelse er, bruges den sidst
// hentede (profil, butik, rettigheder) fra lib/laeseCache.js, så en montør kan åbne appen i en kælder. Det er
// kun til VISNING: rettighederne håndhæves stadig af databasen, og ændringer ligger i offline-køen. Se også
// lib/offlineSession.js om den udløbne adgangstoken. En afvisning (fx ugyldig session) giver stadig login.
export function useSession() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null); // { id, navn, rolle, bilId, butikId, erSystemadmin, kanKoere, dashboardWidgets }
  const [store, setStore] = useState(null); // { id, navn, adresse, lat, lon }
  const [permissions, setPermissions] = useState([]); // string[]

  // Sat, når opstarten bruger den gemte session, fordi adgangstokenet er udløbet og ikke kan fornyes uden net.
  const offlineSessionRef = useRef(null);

  const reloadProfile = useCallback(async (userId) => {
    // Rollelisten hentes sammen med profilen, så rollenavne og adfærd er klar, før noget tegnes. Fejler hentningen
    // (fx uden net), anvendes de gemte roller nedenfor - roller er en del af de gemte data (lib/laeseCache.js).
    const [{ profile: p, netvaerk }, roller] = await Promise.all([getOwnProfileMedStatus(userId), getRoles()]);
    if (p) saetRoller(roller);
    if (!p) {
      if (netvaerk) {
        const gemt = await laeseCache.hent(kontekstNoegle(userId));
        const k = gemt?.vaerdi;
        if (k?.profile?.id === userId) {
          saetRoller(Array.isArray(k.roller) ? k.roller : []);
          setProfile(k.profile);
          setStore(k.store || null);
          setPermissions(Array.isArray(k.permissions) ? k.permissions : []);
          saetViserCache("profil", gemt.gemt);
          return k.profile;
        }
      }
      setProfile(null); setStore(null); setPermissions([]);
      return null;
    }
    const normalized = {
      id: p.id, navn: p.navn, rolle: p.rolle, bilId: p.bil_id, butikId: p.butik_id,
      erSystemadmin: !!p.er_systemadmin,
      kanKoere: !!p.kan_koere,
      dashboardWidgets: p.dashboard_widgets || null,
    };
    setProfile(normalized);
    saetViserCache("profil", null);
    if (normalized.butikId) {
      const [storeData, myPermissions] = await Promise.all([getStore(normalized.butikId), getMyPermissions()]);
      setStore(storeData);
      setPermissions(myPermissions);
      // Gem til næste gang, der ikke er net. Kun når butikken faktisk blev hentet (ellers ville en fejl
      // overskrive en god kopi med en halv).
      // Kun hvis rollerne også blev hentet: en tom liste (fejl) må ikke overskrive en god kopi.
      if (storeData && roller.length > 0) laeseCache.gem(kontekstNoegle(userId), { profile: normalized, store: storeData, permissions: myPermissions, roller });
      // Mangler butikken koordinater i databasen, kan køretiden og forslagene ikke beregnes. Adressen slås derfor op i baggrunden
      // og bruges i denne session (der skrives ikke til databasen).
      if (storeData?.adresse && (!Number.isFinite(storeData.lat) || !Number.isFinite(storeData.lon))) {
        butikKoordinat(storeData.adresse).then((k) => {
          if (k && Number.isFinite(k.lat) && Number.isFinite(k.lon)) {
            setStore((nu) => (nu && nu.id === storeData.id && !Number.isFinite(nu.lat) ? { ...nu, lat: k.lat, lon: k.lon } : nu));
          }
        }).catch(() => {});
      }
    } else {
      setStore(null);
      setPermissions([]);
      if (roller.length > 0) laeseCache.gem(kontekstNoegle(userId), { profile: normalized, store: null, permissions: [], roller });
    }
    return normalized;
  }, []);

  useEffect(() => {
    // Første indlæsning: tjek om der allerede er en session.
    supabase.auth.getSession().then(async ({ data, error }) => {
      let aktuel = data.session;
      // Udløbet adgangstoken + ingen forbindelse: getSession() svarer "ingen session", selv om den gemte session
      // er intakt. Findes der gemte data til samme bruger, bruges den gemte identitet til at VISE dem; fornyelsen
      // sker af sig selv, når nettet er tilbage (se lib/offlineSession.js).
      if (!aktuel && erForbindelsesFejl(error, typeof navigator === "undefined" ? true : navigator.onLine)) {
        const gemtSession = laesGemtSession(window.localStorage);
        if (gemtSession && (await laeseCache.hent(kontekstNoegle(gemtSession.user.id)))) {
          offlineSessionRef.current = gemtSession.user.id;
          aktuel = gemtSession.session;
        }
      }
      setSession(aktuel);
      if (aktuel) await reloadProfile(aktuel.user.id);
      setLoading(false);
    });

    // Lyt løbende på login/logout (fra denne eller andre faner) - se
    // VIGTIGT-noten ovenfor om hvorfor setTimeout(...,0) er nødvendig her.
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      // supabase-js melder INITIAL_SESSION uden session, mens den gemte session venter på forbindelse. Det er ikke
      // en logud - kun en eksplicit SIGNED_OUT er det.
      if (!newSession && offlineSessionRef.current && event !== "SIGNED_OUT") return;
      if (newSession) offlineSessionRef.current = null;
      setSession(newSession);
      if (!newSession && event === "SIGNED_OUT") {
        // Kundedata skal ikke ligge på enheden efter logud (og aldrig kunne ses af en anden bruger).
        offlineSessionRef.current = null;
        laeseCache.ryd();
        saetViserCache("profil", null);
        saetViserCache("sager", null);
      }
      if (newSession) {
        setTimeout(() => { reloadProfile(newSession.user.id); }, 0);
      } else {
        setProfile(null);
        setStore(null);
        setPermissions([]);
      }
    });

    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logOut = async () => {
    await supabase.auth.signOut();
    // signOut() kan fejle uden net, så ryd også her: kundedata skal væk fra enheden ved logud.
    offlineSessionRef.current = null;
    await laeseCache.ryd();
    saetViserCache("profil", null);
    saetViserCache("sager", null);
  };

  return { loading, session, profile, store, permissions, logOut, reloadPermissions: () => reloadProfile(session?.user?.id) };
}
