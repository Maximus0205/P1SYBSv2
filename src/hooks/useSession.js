import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { getOwnProfile, getStore, getMyPermissions } from "../lib/dataStore";

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
export function useSession() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null); // { id, navn, rolle, bilId, butikId, erSystemadmin, kanKoere, dashboardWidgets }
  const [store, setStore] = useState(null); // { id, navn, adresse, lat, lon }
  const [permissions, setPermissions] = useState([]); // string[]

  const reloadProfile = useCallback(async (userId) => {
    const p = await getOwnProfile(userId);
    if (!p) { setProfile(null); setStore(null); setPermissions([]); return null; }
    const normalized = {
      id: p.id, navn: p.navn, rolle: p.rolle, bilId: p.bil_id, butikId: p.butik_id,
      erSystemadmin: !!p.er_systemadmin,
      kanKoere: !!p.kan_koere,
      dashboardWidgets: p.dashboard_widgets || null,
    };
    setProfile(normalized);
    if (normalized.butikId) {
      const [storeData, myPermissions] = await Promise.all([getStore(normalized.butikId), getMyPermissions()]);
      setStore(storeData);
      setPermissions(myPermissions);
    } else {
      setStore(null);
      setPermissions([]);
    }
    return normalized;
  }, []);

  useEffect(() => {
    // Første indlæsning: tjek om der allerede er en session.
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await reloadProfile(data.session.user.id);
      setLoading(false);
    });

    // Lyt løbende på login/logout (fra denne eller andre faner) - se
    // VIGTIGT-noten ovenfor om hvorfor setTimeout(...,0) er nødvendig her.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
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

  const logOut = async () => { await supabase.auth.signOut(); };

  return { loading, session, profile, store, permissions, logOut, reloadPermissions: () => reloadProfile(session?.user?.id) };
}
