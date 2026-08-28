import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { getOwnProfile, getStore, getMyPermissions } from "../lib/dataStore";

// FASE 4 (sidste) af arkitektur-oprydningen (august 2026) - se
// hooks/useCatalog.js for den fulde begrundelse. Al state for SESSION,
// PROFIL og BUTIK er samlet her - den sidste og mest følsomme del af
// oprydningen, da den indeholder en kendt, skrøbelig fælde (se note
// nedenfor), og derfor bevidst er gemt til sidst, efter mønsteret var
// afprøvet på de mindre risikable dele (katalog, biler, fravær, brugere,
// ordrer) først.
//
// VIGTIGT om onAuthStateChange: denne callback må ikke selv "await"'e
// andre Supabase-kald (som fx reloadProfile -> supabase.from(...)).
// Supabase-auth-klienten holder en intern lås mens callbacken kører, så et
// synkront await her på et andet Supabase-kald fryser hele klienten (kendt
// supabase-js-fælde). setTimeout(..., 0) skubber arbejdet til næste "tick",
// uden for låsen, så login rent faktisk kan fuldføre.
//
// Bevidst IKKE flyttet hertil: hvilken SIDE der vises (page) og hvilken
// montør der er valgt (selectedTechnicianId) er navigations-UI-state, ikke
// session-data - App.jsx reagerer selv på ændringer i profile via sin egen
// useEffect, i stedet for at denne hook selv styrer navigation.
//
// RETTIGHEDER (august 2026): permissions er brugerens FAKTISKE, håndhævede
// rettigheder (rollens standard ∪ individuelle tilføjelser, minus
// individuelle fratagelser - se my_effective_permissions() i databasen).
// Hentes samme sted og på samme tidspunkt som resten af profilen, af
// samme grund som resten af denne hook er samlet ét sted.
export function useSession() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null); // { id, navn, rolle, bilId, butikId, erSystemadmin }
  const [store, setStore] = useState(null); // { id, navn, adresse, lat, lon }
  const [permissions, setPermissions] = useState([]); // string[] - se has_permission()/my_effective_permissions() i databasen

  const reloadProfile = useCallback(async (userId) => {
    const p = await getOwnProfile(userId);
    if (!p) { setProfile(null); setStore(null); setPermissions([]); return null; }
    const normalized = { id: p.id, navn: p.navn, rolle: p.rolle, bilId: p.bil_id, butikId: p.butik_id, erSystemadmin: !!p.er_systemadmin };
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
